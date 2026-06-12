# @benjypng/logseq-request

CORS-free HTTP requests for Logseq plugins.

Since the Electron update that ships a stricter CORS policy, direct `fetch`
(and fetch-based libraries like wretch or axios) from a plugin's
`lsp://logseq.com` origin to external APIs is blocked at the preflight stage.
Logseq's experimental request API (`exper_request`) proxies the call through
the main process, which is not subject to CORS. This package wraps that proxy
in a small, typed, wretch-like API.

## Install

```bash
npm install @benjypng/logseq-request
# or
bun add @benjypng/logseq-request
```

Zero dependencies. Requires running inside a Logseq plugin (it uses the
`logseq` global that `@logseq/libs` sets up in your plugin's entry), so it
works anywhere after `logseq.ready()` with no extra setup.

## Quick start

```ts
import { proxy } from '@benjypng/logseq-request'

const data = await proxy('https://api.anthropic.com/v1/messages')
  .headers({
    'x-api-key': apiKey,
    'anthropic-version': '2023-06-01',
    'content-type': 'application/json',
  })
  .post({ model, max_tokens: 1024, messages })
  .json<ChatResponse>()
```

## Full plugin example

```ts
// main.ts — your plugin entry
import '@logseq/libs'
import {
  HttpError,
  proxy,
  ProxyUnavailableError,
} from '@benjypng/logseq-request'

const main = async () => {
  logseq.Editor.registerSlashCommand('Ask Claude', async () => {
    try {
      const data = await proxy('https://api.anthropic.com/v1/messages')
        .headers({
          'x-api-key': logseq.settings?.apiKey as string,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        })
        .post({
          model: 'claude-sonnet-4-6',
          max_tokens: 1024,
          messages: [{ role: 'user', content: 'Hello' }],
        })
        .json<{ content: { text: string }[] }>()

      await logseq.Editor.insertAtEditingCursor(data.content[0].text)
    } catch (e) {
      if (e instanceof HttpError) {
        // Real HTTP failure (4xx/5xx) — status and body available on DB builds
        logseq.UI.showMsg(`API error ${e.status}: ${e.body}`, 'error')
      } else if (e instanceof ProxyUnavailableError) {
        // Endpoint unreachable / IPC dead — message starts "Failed to fetch:"
        logseq.UI.showMsg('Could not reach the API. Network up?', 'error')
      }
    }
  })
}

logseq.ready(main).catch(console.error)
```

## API

All methods:

```ts
proxy(url).get().json<T>()
proxy(url).headers(h).post(body).json<T>()
proxy(url).headers(h).put(body).text()
proxy(url).headers(h).patch(body).json<T>()
proxy(url).headers(h).delete().json<T>()
```

- `.headers()` merges across calls (later wins). Builders are immutable —
  each call returns a new one, so you can branch safely:

  ```ts
  const api = proxy('https://api.example.com/v1').headers(authHeaders)
  await api.get().json<Status>() // base unchanged
  await api.headers({ 'x-extra': '1' }).post(body).json<Result>()
  ```

- Nothing is sent until you call `.json<T>()` or `.text()` — a method call
  returns a lazy response handle.
- `.json<T>()` parses the response body as JSON; `.text()` returns the raw
  body string.
- `.timeout(ms)` (opt-in, no default) fails the request if the proxy never
  responds — useful against dead IPC. LLM calls can run for minutes, so no
  timeout is applied unless you ask for one.

### Error handling

```ts
import { HttpError, ProxyUnavailableError } from '@benjypng/logseq-request'

try {
  await proxy(url).post(body).json()
} catch (e) {
  if (e instanceof HttpError) {
    // HTTP-level failure (DB builds only — see Limitations)
    console.error(e.status, e.statusText, e.body, e.json())
  } else if (e instanceof ProxyUnavailableError) {
    // Unreachable endpoint, dead IPC, or timeout.
    // e.message always starts with "Failed to fetch:".
  }
}
```

- **`HttpError`** — thrown when the response reports `ok: false`. Carries
  `status: number`, `statusText?: string`, `body: string`, and a lazy
  `json<T>()` that returns `undefined` if the body isn't valid JSON.
- **`ProxyUnavailableError`** — thrown when the proxy yields no response
  (unreachable endpoint, dead IPC) or the opt-in timeout elapses. Its message
  always starts with `Failed to fetch:` so existing connection-error handling
  that pattern-matches on that prefix keeps working.

### Low-level escape hatch

```ts
import { proxyRequest } from '@benjypng/logseq-request'

const data = await proxyRequest<MyResponse>({
  url,
  method: 'POST',
  headers,
  body,
  timeoutMs: 30_000,
})
```

`proxyRequestRaw()` goes one level lower still: it returns the normalized
response body without JSON parsing (a string in the typical case).

## Limitations

- **No streaming.** `exper_request` buffers the full response; SSE/streaming
  APIs are not supported. Request non-streaming variants from providers.
- **HTTP errors are invisible on markdown builds (0.10.x).** Those builds
  ignore `includeResponse` and return the bare body, so there is no status
  code to inspect; `HttpError` is only thrown on DB builds (2.x). Error
  bodies on markdown builds surface as JSON parse results instead.
- **No abort/cancellation.** The underlying IPC offers none; `.timeout(ms)`
  abandons the wait but cannot cancel the in-flight request.

## How it works

`exper_request` is invoked via Logseq's internal
`_execCallableAPIAsync('exper_request', pluginId, options)`, which returns a
request id; the response arrives on a `task_callback_<id>` event. Responses
are normalized across Logseq builds: DB (2.x) honours `includeResponse` and
returns `{ status, ok, body }`; markdown (0.10.x) returns the bare body;
`null`/`undefined` (unreachable endpoint) becomes `ProxyUnavailableError`.

The package deliberately has no dependency on `@logseq/libs`: there is no
instance to import from it (the `logseq` global is created as a side effect
of the consumer's own import), and the IPC members used here are
undocumented internals that its public types don't cover. Minimal types for
exactly the members used are defined in-package instead.

## Local development

To consume the package from another project before it's published:

```bash
# in this repo
bun install && bun run build

# in your plugin
bun add file:../logseq-request
# or: `bun link` here, then `bun link @benjypng/logseq-request` in the plugin
```

Scripts: `bun run test` (vitest), `bun run typecheck`, `bun run build`
(tsdown → ESM + CJS + d.ts), `bun run lint` (Biome).

## License

MIT
