# @benjypng/logseq-request — Design

**Date:** 2026-06-11
**Status:** Approved

## Problem

Logseq plugins run at the `lsp://logseq.com` origin. Since the Electron update
that ships a stricter CORS policy, direct `fetch` (and any fetch-based library
such as wretch) to external APIs — api.anthropic.com,
generativelanguage.googleapis.com, localhost Ollama, etc. — is blocked at the
preflight stage: no `Access-Control-Allow-Origin` header is returned. Logseq's
experimental request API (`exper_request`) proxies the call through the main
process, which is not subject to CORS.

logseq-nodebuddy-plugin contains a working `proxyRequest` implementation
(`src/api/api.ts`) that handles the undocumented IPC mechanics and the
differing response shapes across Logseq builds. This package extracts that
logic into a reusable, published npm library so future plugins do not
re-implement it.

## Goals

- A small, zero-dependency npm package: `@benjypng/logseq-request`.
- Wretch-like chainable builder API over Logseq's `exper_request` proxy.
- Full HTTP method set: GET, POST, PUT, PATCH, DELETE.
- Typed error classes instead of ad-hoc `Object.assign` errors.
- Published to npm via semantic-release from a standalone GitHub repo.
- logseq-nodebuddy-plugin migrates to consume it after publishing.

## Non-goals

- Streaming responses (`exper_request` does not support them).
- Abort signals / request cancellation (the IPC offers no cancel mechanism;
  the opt-in timeout covers the hang case).
- Wrapping any other Logseq API surface.

## Public API

```ts
import { proxy, proxyRequest, HttpError, ProxyUnavailableError } from '@benjypng/logseq-request'

// Builder
const data = await proxy('https://api.anthropic.com/v1/messages')
  .headers({ 'x-api-key': key, 'content-type': 'application/json' })
  .post({ model, messages })
  .json<ChatResponse>()

// All methods
proxy(url).get().json<T>()
proxy(url).headers(h).post(body).json<T>()
proxy(url).headers(h).put(body).text()
proxy(url).headers(h).patch(body).json<T>()
proxy(url).headers(h).delete().json<T>()

// Optional timeout (default: none — LLM calls can run for minutes).
// Guards against a dead IPC where the callback never fires.
proxy(url).timeout(30_000).post(body).json<T>()

// Escape hatch: the low-level function
const raw = await proxyRequest({ url, method: 'POST', headers, body })
```

### Builder semantics

- `proxy(url)` returns a builder. `.headers()` merges across multiple calls
  (later wins), like wretch. `.timeout(ms)` is opt-in; default is no timeout.
- `.get()` / `.delete()` send no body; `.post()` / `.put()` / `.patch()` take
  an optional `body: object`. When there is no body, the `data` field is
  omitted from the proxy options.
- A method call returns a lazy response handle — nothing is sent until
  `.json<T>()` or `.text()` is called. This preserves the
  `api().post(body).json<T>()` call-site shape used by nodebuddy.
- `.json<T>()` parses the response, handling both Logseq response shapes.
- `.text()` returns the raw body string. In the rare markdown-build case where
  Logseq has already parsed the body into an object, `.text()` returns
  `JSON.stringify` of it.

### Response-shape normalization (carried over verbatim in spirit)

`exper_request` returns different shapes across Logseq builds:

1. **DB builds (2.x):** honour `includeResponse: true` →
   `{ status, statusText, ok, body }`. `ok: false` → throw `HttpError`.
2. **Markdown builds (0.10.x):** ignore `includeResponse` → the bare body
   (a text string, or an already-parsed object/array).
3. **Unreachable endpoint / dead IPC:** the callback resolves `null` or
   `undefined` → throw `ProxyUnavailableError`.

### Errors

- **`HttpError`** — thrown when the DB-build wrapper reports `ok: false`.
  Properties: `status: number`, `statusText?: string`, `body: string`.
  Method: `json<T>(): T | undefined` — lazily parses `body`, returning
  `undefined` if unparseable.
- **`ProxyUnavailableError`** — thrown when the proxy resolves
  `null`/`undefined`, or when the opt-in timeout fires. Its message keeps the
  `Failed to fetch` prefix so nodebuddy's existing connection-error handling
  (`handle-openai-compatible.ts`) keeps working unchanged after migration.

**Documented limitation:** markdown builds ignore `includeResponse`, so HTTP
error statuses cannot be detected there; the body comes back bare. This
matches the behaviour of the original nodebuddy implementation.

## Internals

```
logseq-request/
├── src/
│   ├── index.ts      # exports: proxy, proxyRequest, HttpError, ProxyUnavailableError, types
│   ├── core.ts       # proxyRequest(): IPC call + response-shape normalization
│   ├── builder.ts    # proxy() chainable builder (thin sugar over core)
│   ├── errors.ts     # HttpError, ProxyUnavailableError
│   └── types.ts      # ProxyRequestHost, ProxyResponse, public option types
└── tests/            # vitest, fake `logseq` global simulating both build shapes
```

- `core.ts` carries over the proven IPC logic from nodebuddy: call
  `host._execCallableAPIAsync('exper_request', host.baseInfo.id, options)`,
  await `host.Request.once('task_callback_<reqID>', resolve)`, then normalize
  the three response shapes. Functional changes only: `method` is a parameter,
  `data` is omitted for body-less requests, typed errors replace ad-hoc ones,
  and an optional timeout races the callback promise.
- The package defines its own minimal types for the `logseq` global
  (`ProxyRequestHost`); it does **not** depend on `@logseq/libs` at runtime or
  as a peer. `_execCallableAPIAsync` and `exper_request` are undocumented
  internals, so the official types add nothing, and zero peer deps avoids
  version-clash friction for consumers.

## Tooling & publishing

- **Stack:** Bun, TypeScript, Biome, husky — mirroring nodebuddy.
- **Build:** tsup → ESM + CJS + `.d.ts`.
- **Tests:** vitest with a fake `logseq` global covering: DB wrapper shape
  (ok and error), bare string body, pre-parsed body, null response, timeout,
  header merging, body-less methods.
- **Repo:** standalone at `~/Documents/Code_Projects/logseq-request`,
  published to GitHub (`benjypng/logseq-request`), MIT licence.
- **Release:** GitHub Actions + semantic-release publishing
  `@benjypng/logseq-request` to npm with `--access public`.
  Manual prerequisite: an `NPM_TOKEN` secret on the GitHub repo.

## Migration (logseq-nodebuddy-plugin)

After the package is published:

1. `bun add @benjypng/logseq-request`.
2. `src/api/api.ts` drops `proxyRequest` and its interfaces; keeps
   `resolveTarget()`; `api()` becomes a thin delegate:
   `proxy(url).headers(headers).post(body).json<T>()`.
3. Verify with `tsc --noEmit` and `bun run build`; manual smoke test in
   Logseq (user-side).

## Testing strategy

Unit tests run against a fake `logseq` global — no Logseq required:

- DB shape, success → parsed JSON returned.
- DB shape, `ok: false` → `HttpError` with status/statusText/body.
- Bare string body → parsed JSON returned; `.text()` returns the string.
- Pre-parsed object body → returned as-is; `.text()` stringifies.
- `null` response → `ProxyUnavailableError` with `Failed to fetch` prefix.
- Timeout elapsed with no callback → `ProxyUnavailableError`.
- Header merge order; `data` omitted for GET/DELETE.

Final verification is a real-world smoke test via the nodebuddy migration.
