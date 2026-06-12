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
