import { describe, it, expect } from 'vitest'
import { createClientMock } from '../utils/clientMock'

/**
 * Tests for the shared client mock factory.
 *
 * The mock underpins every other slice test, so a defect in it produces confusing failures elsewhere.
 * Two properties are load-bearing and pinned here: storage helpers must return concrete values
 * (authSlice assigns them into its initial state at module load), and ApiError must be a real class
 * carrying a status, because reducers branch on it.
 */

describe('client mock factory', () => {
  it('provides storage helpers that return concrete values', () => {
    const mock = createClientMock()

    // Returning undefined would make authSlice's initial user/token undefined rather than null.
    expect(mock.getToken()).toBeNull()
    expect(mock.getStoredUser()).toBeNull()
  })

  it('provides every API group the slices import', () => {
    const mock = createClientMock()

    for (const group of [
      'authApi',
      'userApi',
      'categoryApi',
      'apiApi',
      'planApi',
      'reviewApi',
      'subscriptionApi',
      'apiKeyApi',
      'gatewayApi',
    ]) {
      expect(mock[group], `${group} must exist on the mock`).toBeDefined()
    }
  })

  it('exposes ApiError as a class that carries status and field errors', () => {
    const { ApiError } = createClientMock()
    const error = new ApiError('nope', 409, { errors: { name: 'taken' } })

    expect(error).toBeInstanceOf(Error)
    expect(error.status).toBe(409)
    expect(error.fieldErrors).toEqual({ name: 'taken' })
    expect(error.isConflict).toBe(true)
  })

  it('gives each test its own stub instances', () => {
    const first = createClientMock()
    const second = createClientMock()

    // Shared stubs would let one test's call count leak into another.
    expect(first.authApi.login).not.toBe(second.authApi.login)
  })
})
