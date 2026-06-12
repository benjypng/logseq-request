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
