# @benjypng/logseq-request Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish `@benjypng/logseq-request`, a zero-dependency npm package giving Logseq plugins a wretch-like builder over Logseq's CORS-free `exper_request` proxy, then migrate logseq-nodebuddy-plugin to consume it.

**Architecture:** A low-level `proxyRequestRaw()` in `core.ts` owns the IPC call and normalizes the three response shapes Logseq builds return (DB wrapper / bare body / null). A chainable `proxy()` builder in `builder.ts` is thin sugar over it. Typed errors (`HttpError`, `ProxyUnavailableError`) replace ad-hoc `Object.assign` errors. The package defines its own minimal types for the `logseq` global — no runtime or peer dependencies.

**Tech Stack:** Bun, TypeScript (strict), tsup (ESM+CJS+d.ts), vitest, Biome, semantic-release via GitHub Actions.

**Repos:**
- Package: `/Users/ben/Documents/Code_Projects/logseq-request` (git already initialized; spec committed)
- Consumer migration: `/Users/ben/Documents/Code_Projects/logseq-nodebuddy-plugin`

**Spec:** `docs/superpowers/specs/2026-06-11-logseq-request-design.md`

---

### Task 1: Scaffold the package

**Files:**
- Create: `package.json`, `tsconfig.json`, `biome.json`, `.gitignore`, `LICENSE.md`, `README.md` (stub)

All paths in Tasks 1–8 are relative to `/Users/ben/Documents/Code_Projects/logseq-request`. Run all commands from that directory.

- [ ] **Step 1: Write `package.json`**

```json
{
  "name": "@benjypng/logseq-request",
  "version": "0.0.0-development",
  "description": "CORS-free HTTP requests for Logseq plugins, via Logseq's exper_request proxy",
  "author": "benjypng",
  "license": "MIT",
  "repository": {
    "type": "git",
    "url": "git+https://github.com/benjypng/logseq-request.git"
  },
  "keywords": ["logseq", "logseq-plugin", "cors", "http", "request", "fetch"],
  "type": "module",
  "main": "./dist/index.cjs",
  "module": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js",
      "require": "./dist/index.cjs"
    }
  },
  "files": ["dist"],
  "publishConfig": {
    "access": "public"
  },
  "scripts": {
    "build": "tsup src/index.ts --format esm,cjs --dts --clean",
    "test": "vitest run",
    "typecheck": "tsc --noEmit",
    "lint": "biome check --write ."
  },
  "release": {
    "branches": ["main"]
  },
  "devDependencies": {
    "@biomejs/biome": "^2.3.11",
    "tsup": "^8.5.0",
    "typescript": "^5.5.4",
    "vitest": "^3.2.4"
  }
}
```

Notes for the engineer:
- `version` is a placeholder; semantic-release computes the real version on publish.
- The `release.branches` config is the only semantic-release setting needed: `@semantic-release/commit-analyzer`, `release-notes-generator`, `npm`, and `github` are its default plugins.
- No `dependencies` and no `peerDependencies` — this is by design (spec: zero-dep).

- [ ] **Step 2: Write `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2020", "DOM"],
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "skipLibCheck": true,
    "noEmit": true,
    "isolatedModules": true
  },
  "include": ["src", "tests"]
}
```

(`DOM` is needed for `setTimeout`/`queueMicrotask` types; the package runs inside Logseq's renderer. tsup handles emit, so `noEmit` here.)

- [ ] **Step 3: Write `biome.json`**

```json
{
  "$schema": "https://biomejs.dev/schemas/2.3.11/schema.json",
  "formatter": {
    "enabled": true,
    "indentStyle": "space",
    "indentWidth": 2
  },
  "javascript": {
    "formatter": {
      "quoteStyle": "single",
      "semicolons": "asNeeded"
    }
  },
  "linter": {
    "enabled": true,
    "rules": {
      "recommended": true
    }
  },
  "files": {
    "includes": ["src/**", "tests/**", "*.json"]
  }
}
```

- [ ] **Step 4: Write `.gitignore`**

```
node_modules/
dist/
*.tsbuildinfo
```

- [ ] **Step 5: Write `LICENSE.md`**

```
MIT License

Copyright (c) 2026 benjypng

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

- [ ] **Step 6: Write a stub `README.md`** (full README comes in Task 6)

```markdown
# @benjypng/logseq-request

CORS-free HTTP requests for Logseq plugins, via Logseq's `exper_request` proxy.

Work in progress — full docs coming with the first release.
```

- [ ] **Step 7: Install and verify**

Run: `bun install`
Expected: lockfile created, 4 dev dependencies installed, no errors.

Run: `bunx tsc --noEmit`
Expected: exits 0 (no source files yet is fine; tsc succeeds on an empty include).

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "chore: scaffold package (tsconfig, biome, tsup, vitest)"
```

---

### Task 2: Types and error classes

**Files:**
- Create: `src/types.ts`
- Create: `src/errors.ts`
- Test: `tests/errors.test.ts`

- [ ] **Step 1: Write `src/types.ts`** (types only — no test file for this)

```ts
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

/** Input to the low-level proxyRequest / proxyRequestRaw functions. */
export interface ProxyRequestInput {
  url: string
  method: HttpMethod
  headers?: Record<string, string>
  /** JSON-serialisable request body. Omitted from the wire when undefined. */
  body?: object
  /**
   * Milliseconds to wait for the proxy callback before throwing
   * ProxyUnavailableError. Default: no timeout (LLM calls can run minutes).
   */
  timeoutMs?: number
}

/** Options forwarded to Logseq's exper_request. */
export interface ExperRequestOptions {
  url: string
  method: HttpMethod
  headers: Record<string, string>
  // Logseq's IRequestOptions types this as `Object | ArrayBuffer`; the proxy
  // serialises it to the request body. We always send a JSON object.
  data?: object
  returnType: 'text'
  // Undocumented on older builds; honoured by DB (2.x) to wrap the response
  // with status/ok so we can surface HTTP errors. Harmless when ignored.
  includeResponse: true
}

/** Wrapper shape returned by DB (2.x) builds. */
export interface ProxyResponse {
  status: number
  statusText?: string
  ok: boolean
  body: string
}

/**
 * The undocumented internals of the `logseq` global that the proxy relies on.
 * Defined here (rather than via @logseq/libs) so the package has zero deps.
 */
export interface ProxyRequestHost {
  Request: {
    once: (event: string, cb: (res: unknown) => void) => void
  }
  baseInfo: { id: string }
  _execCallableAPIAsync: (
    method: string,
    ...args: unknown[]
  ) => Promise<string | number>
}
```

- [ ] **Step 2: Write the failing tests for errors**

`tests/errors.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { HttpError, ProxyUnavailableError } from '../src/errors'

describe('HttpError', () => {
  it('exposes status, statusText and body', () => {
    const err = new HttpError(401, 'Unauthorized', '{"error":"bad key"}')
    expect(err).toBeInstanceOf(Error)
    expect(err.name).toBe('HttpError')
    expect(err.message).toBe('Unauthorized')
    expect(err.status).toBe(401)
    expect(err.statusText).toBe('Unauthorized')
    expect(err.body).toBe('{"error":"bad key"}')
  })

  it('falls back to HTTP <status> when statusText is missing', () => {
    const err = new HttpError(500, undefined, 'oops')
    expect(err.message).toBe('HTTP 500')
  })

  it('json() parses the body lazily', () => {
    const err = new HttpError(429, 'Too Many Requests', '{"retry":true}')
    expect(err.json<{ retry: boolean }>()).toEqual({ retry: true })
  })

  it('json() returns undefined for a non-JSON body', () => {
    const err = new HttpError(502, 'Bad Gateway', '<html>nope</html>')
    expect(err.json()).toBeUndefined()
  })
})

describe('ProxyUnavailableError', () => {
  it('keeps the "Failed to fetch" message prefix', () => {
    const err = new ProxyUnavailableError('no response from the request proxy')
    expect(err).toBeInstanceOf(Error)
    expect(err.name).toBe('ProxyUnavailableError')
    expect(err.message).toBe(
      'Failed to fetch: no response from the request proxy',
    )
  })
})
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `bunx vitest run tests/errors.test.ts`
Expected: FAIL — cannot resolve `../src/errors`.

- [ ] **Step 4: Write `src/errors.ts`**

```ts
/** Thrown when a DB-build response wrapper reports ok: false. */
export class HttpError extends Error {
  readonly status: number
  readonly statusText?: string
  readonly body: string

  constructor(status: number, statusText: string | undefined, body: string) {
    super(statusText || `HTTP ${status}`)
    this.name = 'HttpError'
    this.status = status
    this.statusText = statusText
    this.body = body
  }

  /** Parse the error body as JSON; undefined if it isn't valid JSON. */
  json<T = unknown>(): T | undefined {
    try {
      return JSON.parse(this.body) as T
    } catch {
      return undefined
    }
  }
}

/**
 * Thrown when the proxy yields no response: unreachable endpoint, dead IPC,
 * or the opt-in timeout elapsing. The "Failed to fetch" prefix is part of the
 * contract — consumers pattern-match it for connection-error guidance.
 */
export class ProxyUnavailableError extends Error {
  constructor(detail: string) {
    super(`Failed to fetch: ${detail}`)
    this.name = 'ProxyUnavailableError'
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `bunx vitest run tests/errors.test.ts`
Expected: PASS — 5 tests.

- [ ] **Step 6: Typecheck and commit**

Run: `bunx tsc --noEmit`
Expected: exits 0.

```bash
git add src/types.ts src/errors.ts tests/errors.test.ts
git commit -m "feat: add types and typed error classes"
```

---

### Task 3: Core — `proxyRequestRaw` and `proxyRequest`

**Files:**
- Create: `tests/fake-logseq.ts`
- Create: `src/core.ts`
- Test: `tests/core.test.ts`

- [ ] **Step 1: Write the fake `logseq` test helper**

`tests/fake-logseq.ts`:

```ts
export interface FakeCall {
  method: string
  pluginId: string
  options: Record<string, unknown>
}

export interface FakeLogseqOptions {
  /** Value delivered to the task callback. Ignored when respond is false. */
  response?: unknown
  /** When false, the callback never fires (simulates a dead IPC). */
  respond?: boolean
}

/**
 * Installs a fake `logseq` global mimicking the exper_request IPC:
 * `_execCallableAPIAsync` records the call and returns a request id;
 * `Request.once('task_callback_<id>', cb)` fires cb(response) on the
 * microtask queue, like the real async IPC. Returns the recorded calls.
 */
export const installFakeLogseq = (
  opts: FakeLogseqOptions = {},
): { calls: FakeCall[] } => {
  const { response, respond = true } = opts
  const calls: FakeCall[] = []

  const fake = {
    baseInfo: { id: 'test-plugin' },
    Request: {
      once: (_event: string, cb: (res: unknown) => void) => {
        if (respond) queueMicrotask(() => cb(response))
      },
    },
    _execCallableAPIAsync: async (
      method: string,
      pluginId: string,
      options: Record<string, unknown>,
    ) => {
      calls.push({ method, pluginId, options })
      return 42
    },
  }

  ;(globalThis as Record<string, unknown>).logseq = fake
  return { calls }
}

export const uninstallFakeLogseq = () => {
  delete (globalThis as Record<string, unknown>).logseq
}
```

- [ ] **Step 2: Write the failing core tests**

`tests/core.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from 'vitest'
import { proxyRequest, proxyRequestRaw } from '../src/core'
import { HttpError, ProxyUnavailableError } from '../src/errors'
import { installFakeLogseq, uninstallFakeLogseq } from './fake-logseq'

afterEach(() => {
  uninstallFakeLogseq()
  vi.useRealTimers()
})

describe('proxyRequestRaw', () => {
  it('dispatches exper_request with the expected options', async () => {
    const { calls } = installFakeLogseq({ response: '{"a":1}' })
    await proxyRequestRaw({
      url: 'https://api.test/v1',
      method: 'POST',
      headers: { 'x-api-key': 'k' },
      body: { q: 1 },
    })
    expect(calls).toHaveLength(1)
    expect(calls[0].method).toBe('exper_request')
    expect(calls[0].pluginId).toBe('test-plugin')
    expect(calls[0].options).toEqual({
      url: 'https://api.test/v1',
      method: 'POST',
      headers: { 'x-api-key': 'k' },
      data: { q: 1 },
      returnType: 'text',
      includeResponse: true,
    })
  })

  it('omits data when there is no body', async () => {
    const { calls } = installFakeLogseq({ response: '{}' })
    await proxyRequestRaw({ url: 'https://api.test', method: 'GET' })
    expect(calls[0].options).not.toHaveProperty('data')
    expect(calls[0].options.method).toBe('GET')
  })

  it('defaults headers to an empty object', async () => {
    const { calls } = installFakeLogseq({ response: '{}' })
    await proxyRequestRaw({ url: 'https://api.test', method: 'GET' })
    expect(calls[0].options.headers).toEqual({})
  })

  it('unwraps the DB wrapper shape to the raw body string', async () => {
    installFakeLogseq({
      response: { status: 200, ok: true, body: '{"answer":42}' },
    })
    const res = await proxyRequestRaw({ url: 'u', method: 'GET' })
    expect(res).toBe('{"answer":42}')
  })

  it('returns a bare string body as-is (markdown builds)', async () => {
    installFakeLogseq({ response: '{"answer":42}' })
    const res = await proxyRequestRaw({ url: 'u', method: 'GET' })
    expect(res).toBe('{"answer":42}')
  })

  it('returns a pre-parsed body as-is (markdown builds)', async () => {
    installFakeLogseq({ response: { answer: 42 } })
    const res = await proxyRequestRaw({ url: 'u', method: 'GET' })
    expect(res).toEqual({ answer: 42 })
  })

  it('throws HttpError when the wrapper reports ok: false', async () => {
    installFakeLogseq({
      response: {
        status: 401,
        statusText: 'Unauthorized',
        ok: false,
        body: '{"error":"bad key"}',
      },
    })
    const err = await proxyRequestRaw({ url: 'u', method: 'POST' }).catch(
      (e: unknown) => e,
    )
    expect(err).toBeInstanceOf(HttpError)
    expect((err as HttpError).status).toBe(401)
    expect((err as HttpError).body).toBe('{"error":"bad key"}')
  })

  it('throws ProxyUnavailableError on a null response', async () => {
    installFakeLogseq({ response: null })
    const err = await proxyRequestRaw({ url: 'u', method: 'GET' }).catch(
      (e: unknown) => e,
    )
    expect(err).toBeInstanceOf(ProxyUnavailableError)
    expect((err as Error).message).toMatch(/^Failed to fetch:/)
  })

  it('throws ProxyUnavailableError when the timeout elapses', async () => {
    vi.useFakeTimers()
    installFakeLogseq({ respond: false })
    const pending = proxyRequestRaw({
      url: 'u',
      method: 'GET',
      timeoutMs: 1000,
    })
    const assertion = expect(pending).rejects.toBeInstanceOf(
      ProxyUnavailableError,
    )
    await vi.advanceTimersByTimeAsync(1000)
    await assertion
  })

  it('clears the timeout when the response arrives in time', async () => {
    vi.useFakeTimers()
    installFakeLogseq({ response: '{"ok":true}' })
    const res = await proxyRequestRaw({
      url: 'u',
      method: 'GET',
      timeoutMs: 1000,
    })
    expect(res).toBe('{"ok":true}')
    expect(vi.getTimerCount()).toBe(0)
  })
})

describe('proxyRequest', () => {
  it('parses string bodies as JSON', async () => {
    installFakeLogseq({
      response: { status: 200, ok: true, body: '{"answer":42}' },
    })
    const res = await proxyRequest<{ answer: number }>({
      url: 'u',
      method: 'POST',
      body: {},
    })
    expect(res).toEqual({ answer: 42 })
  })

  it('returns pre-parsed bodies as-is', async () => {
    installFakeLogseq({ response: { answer: 42 } })
    const res = await proxyRequest<{ answer: number }>({
      url: 'u',
      method: 'GET',
    })
    expect(res).toEqual({ answer: 42 })
  })
})
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `bunx vitest run tests/core.test.ts`
Expected: FAIL — cannot resolve `../src/core`.

- [ ] **Step 4: Write `src/core.ts`**

This carries over the proven IPC + normalization logic from nodebuddy's `src/api/api.ts`, with three functional changes: `method` is a parameter, `data` is omitted for body-less requests, and typed errors plus an opt-in timeout.

```ts
import { HttpError, ProxyUnavailableError } from './errors'
import type {
  ExperRequestOptions,
  ProxyRequestHost,
  ProxyRequestInput,
  ProxyResponse,
} from './types'

declare const logseq: unknown

/**
 * Send a request through Logseq's CORS-free `exper_request` proxy and return
 * the response body, normalized across Logseq builds:
 *  - DB (2.x): honours includeResponse -> { status, ok, body, ... }; we
 *    unwrap to the body string, throwing HttpError when ok is false.
 *  - markdown (0.10.x): ignores includeResponse -> the bare body (a string,
 *    or an object/array the host already parsed). Note: HTTP errors cannot
 *    be detected on these builds — there is no status to inspect.
 *  - unreachable endpoint / dead IPC: null/undefined -> ProxyUnavailableError.
 *
 * Returns a string in the typical case; an object/array when an older build
 * pre-parsed the body.
 */
export const proxyRequestRaw = async (
  input: ProxyRequestInput,
): Promise<unknown> => {
  const options: ExperRequestOptions = {
    url: input.url,
    method: input.method,
    headers: input.headers ?? {},
    returnType: 'text',
    includeResponse: true,
  }
  if (input.body !== undefined) options.data = input.body

  const host = logseq as ProxyRequestHost
  const reqID = await host._execCallableAPIAsync(
    'exper_request',
    host.baseInfo.id,
    options,
  )

  const callback = new Promise<unknown>((resolve) => {
    host.Request.once(`task_callback_${reqID}`, resolve)
  })

  let res: unknown
  if (input.timeoutMs === undefined) {
    res = await callback
  } else {
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      res = await Promise.race([
        callback,
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () =>
              reject(
                new ProxyUnavailableError(
                  `no response from the request proxy within ${input.timeoutMs}ms`,
                ),
              ),
            input.timeoutMs,
          )
        }),
      ])
    } finally {
      clearTimeout(timer)
    }
  }

  if (res == null) {
    throw new ProxyUnavailableError(
      'no response from the request proxy. Is the endpoint reachable (local model running / network up)?',
    )
  }

  // Wrapper shape (DB builds)
  if (
    typeof res === 'object' &&
    typeof (res as ProxyResponse).status === 'number'
  ) {
    const wrapped = res as ProxyResponse
    if (!wrapped.ok) {
      throw new HttpError(wrapped.status, wrapped.statusText, wrapped.body)
    }
    return wrapped.body
  }

  // Bare body shape (markdown builds): string, or already-parsed object/array
  return res
}

/** Low-level escape hatch: proxy a request and parse the response as JSON. */
export const proxyRequest = async <T>(
  input: ProxyRequestInput,
): Promise<T> => {
  const body = await proxyRequestRaw(input)
  if (typeof body === 'string') return JSON.parse(body) as T
  return body as T
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `bunx vitest run tests/core.test.ts`
Expected: PASS — 12 tests.

- [ ] **Step 6: Typecheck and commit**

Run: `bunx tsc --noEmit`
Expected: exits 0.

```bash
git add src/core.ts tests/fake-logseq.ts tests/core.test.ts
git commit -m "feat: add core proxyRequest over Logseq exper_request"
```

---

### Task 4: Builder — `proxy()`

**Files:**
- Create: `src/builder.ts`
- Test: `tests/builder.test.ts`

- [ ] **Step 1: Write the failing builder tests**

`tests/builder.test.ts`:

```ts
import { afterEach, describe, expect, it } from 'vitest'
import { proxy } from '../src/builder'
import { installFakeLogseq, uninstallFakeLogseq } from './fake-logseq'

afterEach(() => {
  uninstallFakeLogseq()
})

const wrap = (body: string) => ({ status: 200, ok: true, body })

describe('proxy builder', () => {
  it('sends POST with headers and body, parsing json', async () => {
    const { calls } = installFakeLogseq({ response: wrap('{"id":"m1"}') })
    const res = await proxy('https://api.test/v1/messages')
      .headers({ 'x-api-key': 'k', 'content-type': 'application/json' })
      .post({ model: 'claude', messages: [] })
      .json<{ id: string }>()
    expect(res).toEqual({ id: 'm1' })
    expect(calls[0].options).toMatchObject({
      url: 'https://api.test/v1/messages',
      method: 'POST',
      headers: { 'x-api-key': 'k', 'content-type': 'application/json' },
      data: { model: 'claude', messages: [] },
    })
  })

  it('merges headers across calls, later wins', async () => {
    const { calls } = installFakeLogseq({ response: wrap('{}') })
    await proxy('u')
      .headers({ a: '1', b: '1' })
      .headers({ b: '2', c: '3' })
      .get()
      .json()
    expect(calls[0].options.headers).toEqual({ a: '1', b: '2', c: '3' })
  })

  it('is immutable: branching builders do not share state', async () => {
    const { calls } = installFakeLogseq({ response: wrap('{}') })
    const base = proxy('u').headers({ a: '1' })
    base.headers({ b: '2' })
    await base.get().json()
    expect(calls[0].options.headers).toEqual({ a: '1' })
  })

  it.each([
    ['get', 'GET'],
    ['delete', 'DELETE'],
  ] as const)('%s() sends no body', async (fn, method) => {
    const { calls } = installFakeLogseq({ response: wrap('{}') })
    await proxy('u')[fn]().json()
    expect(calls[0].options.method).toBe(method)
    expect(calls[0].options).not.toHaveProperty('data')
  })

  it.each([
    ['put', 'PUT'],
    ['patch', 'PATCH'],
  ] as const)('%s() sends the body', async (fn, method) => {
    const { calls } = installFakeLogseq({ response: wrap('{}') })
    await proxy('u')[fn]({ x: 1 }).json()
    expect(calls[0].options.method).toBe(method)
    expect(calls[0].options.data).toEqual({ x: 1 })
  })

  it('is lazy: nothing is sent until json() or text() is called', async () => {
    const { calls } = installFakeLogseq({ response: wrap('{}') })
    const handle = proxy('u').post({ x: 1 })
    expect(calls).toHaveLength(0)
    await handle.json()
    expect(calls).toHaveLength(1)
  })

  it('text() returns the raw body string', async () => {
    installFakeLogseq({ response: wrap('plain text body') })
    const res = await proxy('u').get().text()
    expect(res).toBe('plain text body')
  })

  it('text() stringifies a pre-parsed body (markdown builds)', async () => {
    installFakeLogseq({ response: { answer: 42 } })
    const res = await proxy('u').get().text()
    expect(res).toBe('{"answer":42}')
  })

  it('passes timeout through to the core', async () => {
    installFakeLogseq({ response: wrap('{}') })
    // No assertion on timing here (core tests cover it) — just that the
    // chain accepts and forwards the option without breaking.
    const res = await proxy('u').timeout(5000).get().json()
    expect(res).toEqual({})
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bunx vitest run tests/builder.test.ts`
Expected: FAIL — cannot resolve `../src/builder`.

- [ ] **Step 3: Write `src/builder.ts`**

```ts
import { proxyRequestRaw } from './core'
import type { HttpMethod, ProxyRequestInput } from './types'

export interface ResponseHandle {
  /** Send the request and parse the response body as JSON. */
  json: <T = unknown>() => Promise<T>
  /** Send the request and return the raw body text. */
  text: () => Promise<string>
}

export interface ProxyBuilder {
  /** Merge headers into the request; later calls win on conflicts. */
  headers: (headers: Record<string, string>) => ProxyBuilder
  /** Fail with ProxyUnavailableError if no response arrives within ms. */
  timeout: (ms: number) => ProxyBuilder
  get: () => ResponseHandle
  post: (body?: object) => ResponseHandle
  put: (body?: object) => ResponseHandle
  patch: (body?: object) => ResponseHandle
  delete: () => ResponseHandle
}

/**
 * Wretch-like builder over Logseq's CORS-free request proxy. Each call
 * returns a new immutable builder; nothing is sent until `.json()` or
 * `.text()` is called on the response handle.
 */
export const proxy = (url: string): ProxyBuilder => {
  const make = (
    headers: Record<string, string>,
    timeoutMs: number | undefined,
  ): ProxyBuilder => {
    const dispatch = (method: HttpMethod, body?: object): ResponseHandle => {
      const input: ProxyRequestInput = { url, method, headers }
      if (body !== undefined) input.body = body
      if (timeoutMs !== undefined) input.timeoutMs = timeoutMs
      return {
        json: async <T = unknown>() => {
          const res = await proxyRequestRaw(input)
          if (typeof res === 'string') return JSON.parse(res) as T
          return res as T
        },
        text: async () => {
          const res = await proxyRequestRaw(input)
          if (typeof res === 'string') return res
          return JSON.stringify(res)
        },
      }
    }

    return {
      headers: (h) => make({ ...headers, ...h }, timeoutMs),
      timeout: (ms) => make(headers, ms),
      get: () => dispatch('GET'),
      post: (body) => dispatch('POST', body),
      put: (body) => dispatch('PUT', body),
      patch: (body) => dispatch('PATCH', body),
      delete: () => dispatch('DELETE'),
    }
  }
  return make({}, undefined)
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bunx vitest run tests/builder.test.ts`
Expected: PASS — 11 tests.

- [ ] **Step 5: Run the full suite, typecheck, commit**

Run: `bunx vitest run && bunx tsc --noEmit`
Expected: all tests pass (errors + core + builder), tsc exits 0.

```bash
git add src/builder.ts tests/builder.test.ts
git commit -m "feat: add wretch-like proxy() builder"
```

---

### Task 5: Public entry point and build

**Files:**
- Create: `src/index.ts`
- Test: `tests/index.test.ts`

- [ ] **Step 1: Write the failing export-surface test**

`tests/index.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  HttpError,
  proxy,
  proxyRequest,
  proxyRequestRaw,
  ProxyUnavailableError,
} from '../src/index'

describe('public exports', () => {
  it('exposes the documented API surface', () => {
    expect(typeof proxy).toBe('function')
    expect(typeof proxyRequest).toBe('function')
    expect(typeof proxyRequestRaw).toBe('function')
    expect(typeof HttpError).toBe('function')
    expect(typeof ProxyUnavailableError).toBe('function')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bunx vitest run tests/index.test.ts`
Expected: FAIL — cannot resolve `../src/index`.

- [ ] **Step 3: Write `src/index.ts`**

```ts
export { proxy } from './builder'
export type { ProxyBuilder, ResponseHandle } from './builder'
export { proxyRequest, proxyRequestRaw } from './core'
export { HttpError, ProxyUnavailableError } from './errors'
export type {
  HttpMethod,
  ProxyRequestInput,
  ProxyResponse,
} from './types'
```

- [ ] **Step 4: Run full suite and build**

Run: `bunx vitest run && bunx tsc --noEmit`
Expected: all tests pass, tsc exits 0.

Run: `bun run build`
Expected: tsup emits `dist/index.js`, `dist/index.cjs`, `dist/index.d.ts` (and `.d.cts`) without errors.

- [ ] **Step 5: Commit**

```bash
git add src/index.ts tests/index.test.ts
git commit -m "feat: add public entry point"
```

---

### Task 6: README and lint pass

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Write the full `README.md`**

````markdown
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
`logseq` global).

## Usage

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

All methods:

```ts
proxy(url).get().json<T>()
proxy(url).headers(h).post(body).json<T>()
proxy(url).headers(h).put(body).text()
proxy(url).headers(h).patch(body).json<T>()
proxy(url).headers(h).delete().json<T>()
```

- `.headers()` merges across calls (later wins). Builders are immutable —
  each call returns a new one, so you can branch safely.
- Nothing is sent until you call `.json<T>()` or `.text()`.
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

## License

MIT
````

- [ ] **Step 2: Set up husky pre-commit (mirroring nodebuddy)**

Run: `bun add -d husky && bunx husky init`

Then add the `prepare` script (husky init usually adds it; verify `package.json` scripts contain `"prepare": "husky"`), and replace the generated `.husky/pre-commit` with:

```
echo "Running biome" && bunx @biomejs/biome check --write . && echo "Running tsc" && bunx tsc --noEmit && echo "Running tests" && bunx vitest run
```

- [ ] **Step 3: Lint and typecheck everything**

Run: `bun run lint && bunx tsc --noEmit && bunx vitest run`
Expected: Biome applies/passes formatting, tsc exits 0, all tests pass. If Biome rewrites files, review the diff — formatting-only changes are fine.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "docs: write README; chore: add husky pre-commit"
```

(The pre-commit hook itself will run here — it doubles as verification.)

---

### Task 7: CI and release pipeline

**Files:**
- Create: `.github/workflows/release.yml`

- [ ] **Step 1: Write `.github/workflows/release.yml`**

```yaml
name: Release

on:
  push:
    branches: [main]

permissions:
  contents: write
  issues: write
  pull-requests: write

jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: oven-sh/setup-bun@v2
      - uses: actions/setup-node@v4
        with:
          node-version: 22
      - run: bun install --frozen-lockfile
      - run: bunx tsc --noEmit
      - run: bunx vitest run
      - run: bun run build
      - run: npx semantic-release
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          NPM_TOKEN: ${{ secrets.NPM_TOKEN }}
```

(semantic-release's default plugin set — commit-analyzer, release-notes-generator, npm, github — is exactly what we need; `release.branches` in package.json is the only config. Node is needed alongside Bun because semantic-release runs `npm publish`.)

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/release.yml
git commit -m "ci: add semantic-release workflow"
```

- [ ] **Step 3: Create the GitHub repo and push**

Run:

```bash
gh repo create benjypng/logseq-request --public \
  --description "CORS-free HTTP requests for Logseq plugins" \
  --source /Users/ben/Documents/Code_Projects/logseq-request \
  --push
```

Expected: repo created at github.com/benjypng/logseq-request, main branch pushed.

- [ ] **Step 4: STOP — user action required (NPM_TOKEN)**

The first workflow run will fail at `npx semantic-release` until the `NPM_TOKEN` secret exists. Ask the user to:

1. Create an npm **automation** (granular: read+write packages) access token at https://www.npmjs.com/settings/benjypng/tokens — it must be allowed to publish new packages in the `@benjypng` scope.
2. Provide it so it can be set, or set it themselves with:
   `gh secret set NPM_TOKEN --repo benjypng/logseq-request`

Do not proceed to Step 5 until the secret is in place.

- [ ] **Step 5: Trigger the release and verify**

The push from Step 3 likely already ran (and failed at the publish step if the secret was missing). Re-run it:

```bash
gh run rerun --repo benjypng/logseq-request --failed $(gh run list --repo benjypng/logseq-request --limit 1 --json databaseId --jq '.[0].databaseId')
```

Or, if no run exists, push an empty commit: `git commit --allow-empty -m "chore: trigger release" && git push`.

Then watch: `gh run watch --repo benjypng/logseq-request $(gh run list --repo benjypng/logseq-request --limit 1 --json databaseId --jq '.[0].databaseId')`

Expected: workflow green; semantic-release publishes **v1.0.0** (the `feat:` commits trigger a minor→1.0.0 initial release) and creates a GitHub release.

Verify on npm: `npm view @benjypng/logseq-request version`
Expected: `1.0.0`

---

### Task 8: Migrate logseq-nodebuddy-plugin

**Files (all in `/Users/ben/Documents/Code_Projects/logseq-nodebuddy-plugin`):**
- Modify: `src/api/api.ts`
- Modify: `package.json` (via `bun add`)

Consumers of `api()` (`handle-claude.ts`, `handle-gemini.ts`, `handle-openai-compatible.ts`) keep their `api().post(body).json<T>()` call sites unchanged. Error compatibility is preserved: `HttpError` carries the same `status`/`body` properties the old `Object.assign` error had, and `ProxyUnavailableError` keeps the `Failed to fetch` message prefix that `handle-openai-compatible.ts` pattern-matches.

- [ ] **Step 1: Create a branch and install the package**

```bash
cd /Users/ben/Documents/Code_Projects/logseq-nodebuddy-plugin
git checkout -b feat/use-logseq-request
bun add @benjypng/logseq-request
```

Expected: `@benjypng/logseq-request@^1.0.0` in dependencies.

- [ ] **Step 2: Rewrite `src/api/api.ts`**

Replace the entire file with:

```ts
import { proxy } from '@benjypng/logseq-request'

import { getModelNameFromSettings } from '../utils'
import {
  getAnthropicApiKeyFromSettings,
  getDeepseekApiKeyFromSettings,
  getGeminiApiKeyFromSettings,
  getGeminiUrl,
  getLocalEndpointFromSettings,
  isAnthropicOAuthToken,
} from '.'

interface RequestTarget {
  url: string
  headers: Record<string, string>
}

const resolveTarget = (): RequestTarget => {
  const model = getModelNameFromSettings()

  if (model.startsWith('gemma')) {
    return {
      url: getLocalEndpointFromSettings(),
      headers: {
        'Content-Type': 'application/json',
      },
    }
  } else if (model.startsWith('qwen')) {
    return {
      url: getLocalEndpointFromSettings(),
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer local',
      },
    }
  } else if (model.startsWith('deepseek')) {
    return {
      url: 'https://api.deepseek.com/chat/completions',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${getDeepseekApiKeyFromSettings()}`,
      },
    }
  } else if (model.startsWith('claude')) {
    const token = getAnthropicApiKeyFromSettings()
    const headers: Record<string, string> = isAnthropicOAuthToken(token)
      ? {
          Authorization: `Bearer ${token}`,
          'anthropic-beta': 'oauth-2025-04-20',
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        }
      : {
          'x-api-key': token,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
          'anthropic-dangerously-allow-browser': 'true',
        }
    return { url: 'https://api.anthropic.com/v1/messages', headers }
  } else {
    return {
      url: getGeminiUrl(),
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': getGeminiApiKeyFromSettings(),
      },
    }
  }
}

/**
 * Preserves the `api().post(body).json<T>()` call sites used by the provider
 * handlers, dispatching through @benjypng/logseq-request (Logseq's CORS-free
 * request proxy) instead of `fetch`.
 */
export const api = () => {
  const { url, headers } = resolveTarget()
  return {
    post: (body: object) => ({
      json: <T>() => proxy(url).headers(headers).post(body).json<T>(),
    }),
  }
}
```

(The `proxyRequest` function, its three interfaces, and the long CORS comment block all move to the package; `resolveTarget` and `api()` stay.)

- [ ] **Step 3: Verify**

Run: `bunx tsc --noEmit`
Expected: exits 0.

Run: `bun run build`
Expected: vite build succeeds.

Run: `grep -rn "proxyRequest\|ProxyRequestOptions\|ProxyRequestHost" src/`
Expected: no matches (all proxy internals now live in the package).

- [ ] **Step 4: Commit**

```bash
git add package.json bun.lock src/api/api.ts
git commit -m "refactor: replace inline proxyRequest with @benjypng/logseq-request"
```

- [ ] **Step 5: STOP — user action required (smoke test)**

Ask the user to load the dev build in Logseq and send one message through each provider they use (at minimum: one cloud provider and one local model) to confirm requests still flow through the proxy. Only after that passes, merge:

```bash
git checkout main && git merge feat/use-logseq-request && git push
```

(nodebuddy releases via semantic-release on main; the `refactor:` type produces a patch release.)
