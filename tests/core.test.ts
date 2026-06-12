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
