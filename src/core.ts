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
export const proxyRequest = async <T>(input: ProxyRequestInput): Promise<T> => {
  const body = await proxyRequestRaw(input)
  if (typeof body === 'string') return JSON.parse(body) as T
  return body as T
}
