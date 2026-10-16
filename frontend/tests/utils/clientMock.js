import { vi } from 'vitest'

/**
 * Shared mock factory for `src/api/client`.
 *
 * Vitest's `vi.mock` is hoisted above imports, and a manual `tests/__mocks__/client.js` is only used
 * when the mock path resolves there. Passing this factory explicitly is unambiguous: every stub is
 * defined here, so no test depends on Vitest's auto-mock heuristics.
 *
 * Two details matter for correctness:
 *
 * 1. `getToken` / `getStoredUser` must return concrete values. `authSlice` calls them at module load
 *    and assigns the results into its initial state, so an auto-mocked `undefined` would make
 *    `initialState.user` undefined rather than null.
 * 2. `ApiError` is a real class, not a stub, because reducers branch on `error.status` to decide
 *    whether to clear the session.
 */
export function createClientMock() {
  class ApiError extends Error {
    constructor(message, status, data) {
      super(message)
      this.name = 'ApiError'
      this.status = status
      this.data = data
    }

    get fieldErrors() {
      return this.data?.errors ?? null
    }

    get isUnauthorized() {
      return this.status === 401
    }

    get isConflict() {
      return this.status === 409
    }

    get isRateLimited() {
      return this.status === 429
    }
  }

  return {
    ApiError,
    request: vi.fn(),
    getToken: vi.fn(() => null),
    setToken: vi.fn(),
    getStoredUser: vi.fn(() => null),
    setStoredUser: vi.fn(),
    clearSession: vi.fn(),
    authApi: { register: vi.fn(), login: vi.fn() },
    userApi: {
      me: vi.fn(),
      updateMe: vi.fn(),
      list: vi.fn(),
      developers: vi.fn(),
      get: vi.fn(),
      update: vi.fn(),
      remove: vi.fn(),
    },
    categoryApi: {
      list: vi.fn(),
      get: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      remove: vi.fn(),
    },
    apiApi: {
      listPublished: vi.fn(),
      listAll: vi.fn(),
      listMine: vi.fn(),
      get: vi.fn(),
      getBySlug: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      remove: vi.fn(),
    },
    planApi: {
      listForApi: vi.fn(),
      get: vi.fn(),
      listAll: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      remove: vi.fn(),
    },
    reviewApi: {
      listForApi: vi.fn(),
      listAll: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      remove: vi.fn(),
    },
    subscriptionApi: {
      mine: vi.fn(),
      myForApi: vi.fn(),
      forApi: vi.fn(),
      all: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateAsAdmin: vi.fn(),
      cancel: vi.fn(),
    },
    apiKeyApi: {
      forApi: vi.fn(),
      myForApi: vi.fn(),
      mine: vi.fn(),
      all: vi.fn(),
      get: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      rotate: vi.fn(),
      revoke: vi.fn(),
      remove: vi.fn(),
      usage: vi.fn(),
    },
    gatewayApi: { forward: vi.fn() },
  }
}
