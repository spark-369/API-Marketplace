/**
 * Single HTTP boundary for the SPA.
 *
 * Every network call in the application goes through `request()`. Centralising it here means token
 * attachment, error normalisation and the `204 -> null` rule are implemented once rather than
 * re-derived in each slice.
 */

const BASE_URL = '/api'

const TOKEN_KEY = 'am_access_token'
const USER_KEY = 'am_user'

// ---------------------------------------------------------------------------
// Token and session storage
// ---------------------------------------------------------------------------

export function getToken() {
  try {
    return localStorage.getItem(TOKEN_KEY)
  } catch {
    // Storage can be unavailable (private mode, disabled cookies). Treat as anonymous.
    return null
  }
}

export function setToken(token) {
  try {
    if (token) {
      localStorage.setItem(TOKEN_KEY, token)
    } else {
      localStorage.removeItem(TOKEN_KEY)
    }
  } catch {
    // Non-fatal: in-memory Redux state still carries the session for this tab.
  }
}

export function getStoredUser() {
  try {
    const raw = localStorage.getItem(USER_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function setStoredUser(user) {
  try {
    if (user) {
      localStorage.setItem(USER_KEY, JSON.stringify(user))
    } else {
      localStorage.removeItem(USER_KEY)
    }
  } catch {
    // Non-fatal, as above.
  }
}

export function clearSession() {
  setToken(null)
  setStoredUser(null)
}

// ---------------------------------------------------------------------------
// Error type
// ---------------------------------------------------------------------------

/**
 * Normalised API failure.
 *
 * Carries the HTTP status and parsed body so callers can branch on `status` (401 to log out, 409 to
 * show a conflict, 429 to surface Retry-After) without re-parsing anything.
 */
export class ApiError extends Error {
  constructor(message, status, data) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.data = data
  }

  /** Field-level validation errors, when the server supplied them. */
  get fieldErrors() {
    return this.data?.errors ?? null
  }

  get isUnauthorized() {
    return this.status === 401
  }

  get isForbidden() {
    return this.status === 403
  }

  get isNotFound() {
    return this.status === 404
  }

  get isConflict() {
    return this.status === 409
  }

  get isRateLimited() {
    return this.status === 429
  }
}

// ---------------------------------------------------------------------------
// Core request
// ---------------------------------------------------------------------------

/**
 * Performs a JSON request against the backend.
 *
 * @param {string} path   path beginning with `/`, e.g. `/auth/login`
 * @param {object} [options]
 * @param {string} [options.method]  HTTP method, defaults to GET
 * @param {object} [options.body]    JSON-serialisable request body
 * @param {object} [options.headers] extra headers
 * @param {string} [options.apiKey]  sent as X-API-Key for gateway calls
 * @param {boolean} [options.auth]   attach the bearer token, defaults to true
 * @param {AbortSignal} [options.signal]
 * @returns {Promise<any>} parsed body, or null for 204 responses
 * @throws {ApiError} on any non-2xx response or transport failure
 */
export async function request(path, options = {}) {
  const {
    method = 'GET',
    body,
    headers = {},
    apiKey,
    auth = true,
    signal,
  } = options

  const finalHeaders = { Accept: 'application/json', ...headers }

  if (body !== undefined && body !== null) {
    finalHeaders['Content-Type'] = 'application/json'
  }

  if (auth) {
    const token = getToken()
    if (token) {
      finalHeaders.Authorization = `Bearer ${token}`
    }
  }

  if (apiKey) {
    finalHeaders['X-API-Key'] = apiKey
  }

  let response
  try {
    response = await fetch(`${BASE_URL}${path}`, {
      method,
      headers: finalHeaders,
      body: body === undefined || body === null ? undefined : JSON.stringify(body),
      signal,
    })
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw error
    }
    throw new ApiError('Unable to reach the server. Check your connection.', 0, null)
  }

  return handleResponse(response)
}

/**
 * Decodes a fetch Response into either a parsed body or an ApiError.
 */
async function handleResponse(response) {
  if (response.status === 204) {
    return null
  }

  const contentType = response.headers.get('content-type') ?? ''
  const isJson = contentType.includes('application/json')

  let payload = null
  if (isJson) {
    try {
      payload = await response.json()
    } catch {
      payload = null
    }
  } else {
    // Non-JSON bodies (proxy HTML error pages, empty 502s) are still surfaced as text.
    const text = await response.text().catch(() => '')
    payload = text ? { message: text } : null
  }

  if (response.ok) {
    return payload
  }

  throw new ApiError(defaultMessageFor(response.status, payload), response.status, payload)
}

/**
 * Maps a status code to a user-facing sentence, preferring the server's own message.
 */
function defaultMessageFor(status, payload) {
  if (payload?.message) {
    return payload.message
  }
  switch (status) {
    case 400:
      return 'The request was rejected as invalid.'
    case 401:
      return 'Your session has expired. Please sign in again.'
    case 403:
      return 'You do not have permission to do that.'
    case 404:
      return 'The requested resource was not found.'
    case 409:
      return 'That action conflicts with the current state.'
    case 429:
      return 'Too many requests. Please slow down and try again shortly.'
    default:
      return `Request failed with status ${status}`
  }
}

/**
 * Builds a query string, dropping null/undefined/empty values so callers can pass optional filters
 * directly without conditional string assembly.
 */
export function toQuery(params = {}) {
  const search = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return
    search.append(key, value)
  })
  const query = search.toString()
  return query ? `?${query}` : ''
}

// ---------------------------------------------------------------------------
// API groups
// ---------------------------------------------------------------------------

export const authApi = {
  register: (payload) => request('/auth/register', { method: 'POST', body: payload, auth: false }),
  login: (payload) => request('/auth/login', { method: 'POST', body: payload, auth: false }),
}

export const userApi = {
  me: () => request('/users/me'),
  updateMe: (payload) => request('/users/me', { method: 'PUT', body: payload }),
  list: (params) => request(`/users${toQuery(params)}`),
  developers: (params) => request(`/users/developers${toQuery(params)}`),
  get: (id) => request(`/users/${id}`),
  update: (id, payload) => request(`/users/${id}`, { method: 'PUT', body: payload }),
  remove: (id) => request(`/users/${id}`, { method: 'DELETE' }),
}

export const categoryApi = {
  list: () => request('/categories'),
  get: (id) => request(`/categories/${id}`),
  create: (payload) => request('/categories', { method: 'POST', body: payload }),
  update: (id, payload) => request(`/categories/${id}`, { method: 'PUT', body: payload }),
  remove: (id) => request(`/categories/${id}`, { method: 'DELETE' }),
}

export const apiApi = {
  listPublished: (params) => request(`/apis${toQuery(params)}`),
  listAll: (params) => request(`/apis/all${toQuery(params)}`),
  listMine: (params) => request(`/apis/my${toQuery(params)}`),
  get: (id) => request(`/apis/${id}`),
  getBySlug: (slug) => request(`/apis/slug/${slug}`),
  create: (payload) => request('/apis', { method: 'POST', body: payload }),
  update: (id, payload) => request(`/apis/${id}`, { method: 'PUT', body: payload }),
  remove: (id) => request(`/apis/${id}`, { method: 'DELETE' }),
}

export const planApi = {
  listForApi: (apiId) => request(`/apis/${apiId}/plans`),
  get: (apiId, planId) => request(`/apis/${apiId}/plans/${planId}`),
  listAll: (params) => request(`/plans/all${toQuery(params)}`),
  create: (apiId, payload) => request(`/apis/${apiId}/plans`, { method: 'POST', body: payload }),
  update: (apiId, planId, payload) =>
    request(`/apis/${apiId}/plans/${planId}`, { method: 'PUT', body: payload }),
  remove: (apiId, planId) => request(`/apis/${apiId}/plans/${planId}`, { method: 'DELETE' }),
}

export const reviewApi = {
  listForApi: (apiId, params) => request(`/apis/${apiId}/reviews${toQuery(params)}`),
  listAll: (params) => request(`/reviews/all${toQuery(params)}`),
  create: (apiId, payload) => request(`/apis/${apiId}/reviews`, { method: 'POST', body: payload }),
  update: (apiId, reviewId, payload) =>
    request(`/apis/${apiId}/reviews/${reviewId}`, { method: 'PUT', body: payload }),
  remove: (apiId, reviewId) => request(`/apis/${apiId}/reviews/${reviewId}`, { method: 'DELETE' }),
}

export const subscriptionApi = {
  mine: () => request('/me/subscriptions'),
  myForApi: (apiId) => request(`/apis/${apiId}/subscriptions/my`),
  forApi: (apiId, params) => request(`/apis/${apiId}/subscriptions${toQuery(params)}`),
  all: (params) => request(`/subscriptions${toQuery(params)}`),
  create: (apiId, planId) =>
    request(`/apis/${apiId}/subscriptions${toQuery({ planId })}`, { method: 'POST' }),
  update: (apiId, subscriptionId, payload) =>
    request(`/apis/${apiId}/subscriptions/${subscriptionId}`, { method: 'PUT', body: payload }),
  updateAsAdmin: (subscriptionId, payload) =>
    request(`/subscriptions/${subscriptionId}`, { method: 'PUT', body: payload }),
  cancel: (apiId, subscriptionId) =>
    request(`/apis/${apiId}/subscriptions/${subscriptionId}`, { method: 'DELETE' }),
}

export const apiKeyApi = {
  forApi: (apiId, params) => request(`/apis/${apiId}/keys${toQuery(params)}`),
  myForApi: (apiId) => request(`/apis/${apiId}/keys/my`),
  mine: () => request('/keys/my'),
  all: (params) => request(`/keys/all${toQuery(params)}`),
  get: (apiId, keyId) => request(`/apis/${apiId}/keys/${keyId}`),
  create: (apiId, payload) => request(`/apis/${apiId}/keys`, { method: 'POST', body: payload }),
  update: (apiId, keyId, payload) =>
    request(`/apis/${apiId}/keys/${keyId}`, { method: 'PUT', body: payload }),
  rotate: (apiId, keyId, payload) =>
    request(`/apis/${apiId}/keys/${keyId}/rotate`, { method: 'POST', body: payload ?? {} }),
  revoke: (apiId, keyId) => request(`/apis/${apiId}/keys/${keyId}/revoke`, { method: 'POST' }),
  remove: (apiId, keyId) => request(`/apis/${apiId}/keys/${keyId}`, { method: 'DELETE' }),
  usage: (apiId, keyId, params) => request(`/apis/${apiId}/keys/${keyId}/usage${toQuery(params)}`),
}

export const gatewayApi = {
  /**
   * Sends a request through the platform gateway to an upstream API.
   *
   * @param {string} apiId   target API id
   * @param {string} path    sub-path appended to the upstream base URL
   * @param {object} options method, body, apiKey, signal
   */
  forward: (apiId, path = '', { method = 'GET', body, apiKey, signal } = {}) => {
    const suffix = path ? `/${String(path).replace(/^\/+/, '')}` : ''
    return request(`/gateway/forward/${apiId}${suffix}`, {
      method,
      body,
      apiKey,
      signal,
      // Gateway authentication is the API key alone; a JWT adds nothing on this path.
      auth: false,
    })
  },
}

export default {
  request,
  authApi,
  userApi,
  categoryApi,
  apiApi,
  planApi,
  reviewApi,
  subscriptionApi,
  apiKeyApi,
  gatewayApi,
  getToken,
  setToken,
  getStoredUser,
  setStoredUser,
  clearSession,
  ApiError,
}
