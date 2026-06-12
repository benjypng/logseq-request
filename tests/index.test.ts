import { describe, expect, it } from 'vitest'
import {
  HttpError,
  ProxyUnavailableError,
  proxy,
  proxyRequest,
  proxyRequestRaw,
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
