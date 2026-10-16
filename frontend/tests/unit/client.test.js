import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import {
  request,
  toQuery,
  ApiError,
  getToken,
  setToken,
  setStoredUser,
  getStoredUser,
  clearSession,
  gatewayApi,
  authApi,
  subscriptionApi,
} from '../../src/api/client'

/**
 * Tests for the HTTP boundary.
 *
 * These are the highest-value unit tests in the suite: every feature depends on this module getting
 * header attachment, error normalisation and the 204 rule right.
 */

/** Builds a minimal Response-like object for the fetch stub. */
function jsonResponse(body, { status = 200, contentType = 'application/json' } = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name) => (name === 'content-type' ? contentType : null) },
    json: async () => body,
    text: async () => JSON.stringify(body),
  }
}

describe('api/client', () => {
  beforeEach(() => {
    localStorage.clear()
    global.fetch = vi.fn()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('toQuery', () => {
    it('returns an empty string when there are no usable params', () => {
      expect(toQuery({})).toBe('')
    })

    it('drops null, undefined and empty values', () => {
      // This is what lets callers pass optional filters straight through.
      expect(toQuery({ a: null, b: undefined, c: '', d: 'kept' })).toBe('?d=kept')
    })

    it('encodes values', () => {
      expect(toQuery({ search: 'weather api' })).toBe('?search=weather+api')
    })
  })

  describe('session storage', () => {
    it('round-trips a token', () => {
      setToken('abc123')
      expect(getToken()).toBe('abc123')
    })

    it('removes the token when set to null', () => {
      setToken('abc123')
      setToken(null)
      expect(getToken()).toBeNull()
    })

    it('round-trips a stored user', () => {
      setStoredUser({ id: '1', email: 'a@b.com', role: 'DEVELOPER' })
      expect(getStoredUser()).toEqual({ id: '1', email: 'a@b.com', role: 'DEVELOPER' })
    })

    it('survives malformed JSON in storage', () => {
      localStorage.setItem('am_user', 'not-json')
      // The app must degrade to anonymous rather than throw during bootstrap.
      expect(getStoredUser()).toBeNull()
    })

    it('clearSession removes both entries', () => {
      setToken('abc')
      setStoredUser({ id: '1' })

      clearSession()

      expect(getToken()).toBeNull()
      expect(getStoredUser()).toBeNull()
    })
  })

  describe('request', () => {
    it('attaches the bearer token when one is stored', async () => {
      setToken('jwt-token')
      fetch.mockResolvedValue(jsonResponse({ ok: true }))

      await request('/users/me')

      const [, options] = fetch.mock.calls[0]
      expect(options.headers.Authorization).toBe('Bearer jwt-token')
    })

    it('omits the bearer token when auth is disabled', async () => {
      setToken('jwt-token')
      fetch.mockResolvedValue(jsonResponse({ ok: true }))

      await request('/gateway/forward/x', { auth: false })

      const [, options] = fetch.mock.calls[0]
      expect(options.headers.Authorization).toBeUndefined()
    })

    it('attaches the X-API-Key header when supplied', async () => {
      fetch.mockResolvedValue(jsonResponse({}))

      await request('/gateway/forward/x', { apiKey: 'am_secret', auth: false })

      const [, options] = fetch.mock.calls[0]
      expect(options.headers['X-API-Key']).toBe('am_secret')
    })

    it('serialises a JSON body and sets Content-Type', async () => {
      fetch.mockResolvedValue(jsonResponse({}, { status: 201 }))

      await request('/apis', { method: 'POST', body: { name: 'Weather' } })

      const [, options] = fetch.mock.calls[0]
      expect(options.method).toBe('POST')
      expect(options.body).toBe('{"name":"Weather"}')
      expect(options.headers['Content-Type']).toBe('application/json')
    })

    it('sends no body for GET requests', async () => {
      fetch.mockResolvedValue(jsonResponse({}))

      await request('/apis')

      expect(fetch.mock.calls[0][1].body).toBeUndefined()
    })

    it('returns null for a 204 response', async () => {
      fetch.mockResolvedValue({ ok: true, status: 204, headers: { get: () => null } })

      await expect(request('/apis/1', { method: 'DELETE' })).resolves.toBeNull()
    })

    it('parses and returns a JSON body on success', async () => {
      fetch.mockResolvedValue(jsonResponse({ id: '1', name: 'Weather' }))

      await expect(request('/apis/1')).resolves.toEqual({ id: '1', name: 'Weather' })
    })

    it('throws an ApiError carrying the status and body on failure', async () => {
      fetch.mockResolvedValue(jsonResponse({ message: 'API not found' }, { status: 404 }))

      await expect(request('/apis/missing')).rejects.toMatchObject({
        name: 'ApiError',
        status: 404,
        message: 'API not found',
      })
    })

    it('falls back to a sensible message when the server sends none', async () => {
      fetch.mockResolvedValue(jsonResponse({}, { status: 403 }))

      await expect(request('/admin')).rejects.toThrow('You do not have permission to do that.')
    })

    it('exposes validation errors from a 400 body', async () => {
      fetch.mockResolvedValue(
        jsonResponse(
          { message: 'Validation failed', errors: { email: 'is required' } },
          { status: 400 },
        ),
      )

      await expect(request('/auth/register', { method: 'POST', body: {} })).rejects.toMatchObject({
        status: 400,
        fieldErrors: { email: 'is required' },
      })
    })

    it('tolerates a non-JSON error body', async () => {
      fetch.mockResolvedValue({
        ok: false,
        status: 502,
        headers: { get: () => 'text/html' },
        text: async () => 'Bad Gateway',
      })

      await expect(request('/apis')).rejects.toMatchObject({ status: 502 })
    })

    it('wraps a transport failure as a status-0 ApiError', async () => {
      fetch.mockRejectedValue(new TypeError('Failed to fetch'))

      await expect(request('/apis')).rejects.toMatchObject({ name: 'ApiError', status: 0 })
    })

    it('propagates an abort rather than masking it as a transport error', async () => {
      const abortError = new Error('aborted')
      abortError.name = 'AbortError'
      fetch.mockRejectedValue(abortError)

      await expect(request('/apis')).rejects.toThrow('aborted')
    })
  })

  describe('ApiError helpers', () => {
    it('classifies statuses', () => {
      expect(new ApiError('x', 401).isUnauthorized).toBe(true)
      expect(new ApiError('x', 403).isForbidden).toBe(true)
      expect(new ApiError('x', 404).isNotFound).toBe(true)
      expect(new ApiError('x', 409).isConflict).toBe(true)
      expect(new ApiError('x', 429).isRateLimited).toBe(true)
    })

    it('returns null field errors when the body carries none', () => {
      expect(new ApiError('x', 400, null).fieldErrors).toBeNull()
    })
  })

  describe('API group path construction', () => {
    it('builds the login path', async () => {
      fetch.mockResolvedValue(jsonResponse({ accessToken: 't' }))

      await authApi.login({ email: 'a@b.com', password: 'x' })

      expect(fetch.mock.calls[0][0]).toBe('/api/auth/login')
    })

    it('appends the plan as a query parameter when subscribing', async () => {
      fetch.mockResolvedValue(jsonResponse({}))

      await subscriptionApi.create('api-1', 'plan-9')

      expect(fetch.mock.calls[0][0]).toBe('/api/apis/api-1/subscriptions?planId=plan-9')
    })

    it('omits the plan query parameter when none is given', async () => {
      fetch.mockResolvedValue(jsonResponse({}))

      await subscriptionApi.create('api-1', undefined)

      expect(fetch.mock.calls[0][0]).toBe('/api/apis/api-1/subscriptions')
    })

    it('builds a gateway path with a sub-path', async () => {
      fetch.mockResolvedValue(jsonResponse({}))

      await gatewayApi.forward('api-1', 'v1/weather', { apiKey: 'am_k', method: 'GET' })

      expect(fetch.mock.calls[0][0]).toBe('/api/gateway/forward/api-1/v1/weather')
    })

    it('normalises a leading slash on the gateway sub-path', async () => {
      fetch.mockResolvedValue(jsonResponse({}))

      await gatewayApi.forward('api-1', '/v1/weather', { apiKey: 'am_k' })

      expect(fetch.mock.calls[0][0]).toBe('/api/gateway/forward/api-1/v1/weather')
    })

    it('targets the gateway base path when no sub-path is given', async () => {
      fetch.mockResolvedValue(jsonResponse({}))

      await gatewayApi.forward('api-1', '', { apiKey: 'am_k' })

      expect(fetch.mock.calls[0][0]).toBe('/api/gateway/forward/api-1')
    })
  })
})
