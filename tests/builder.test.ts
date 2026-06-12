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
