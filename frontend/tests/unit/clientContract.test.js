import { describe, it, expect } from 'vitest'
import * as client from '../../src/api/client'

/**
 * Contract test for the HTTP boundary module.
 *
 * Every slice imports named groups from `src/api/client`. If one is renamed or removed, the failure
 * would otherwise surface at runtime as "x is not a function" deep inside a component. This test
 * asserts the module's public surface explicitly, so a rename fails here instead.
 */

describe('api client module surface', () => {
  it('exports the API groups the slices depend on', () => {
    const requiredGroups = [
      'authApi',
      'userApi',
      'categoryApi',
      'apiApi',
      'planApi',
      'reviewApi',
      'subscriptionApi',
      'apiKeyApi',
      'gatewayApi',
    ]

    for (const group of requiredGroups) {
      expect(client[group], `${group} must be exported`).toBeDefined()
      expect(typeof client[group]).toBe('object')
    }
  })

  it('exports the session helpers used by authSlice and the router', () => {
    expect(typeof client.getToken).toBe('function')
    expect(typeof client.setToken).toBe('function')
    expect(typeof client.getStoredUser).toBe('function')
    expect(typeof client.setStoredUser).toBe('function')
    expect(typeof client.clearSession).toBe('function')
  })

  it('exports request and ApiError for direct use', () => {
    expect(typeof client.request).toBe('function')
    expect(typeof client.ApiError).toBe('function')
  })

  it('exposes each API group as callable functions', () => {
    expect(typeof client.authApi.login).toBe('function')
    expect(typeof client.authApi.register).toBe('function')
    expect(typeof client.gatewayApi.forward).toBe('function')
    expect(typeof client.apiApi.listPublished).toBe('function')
    expect(typeof client.subscriptionApi.create).toBe('function')
    expect(typeof client.apiKeyApi.rotate).toBe('function')
  })
})
