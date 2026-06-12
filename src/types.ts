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
