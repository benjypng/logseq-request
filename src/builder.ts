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
