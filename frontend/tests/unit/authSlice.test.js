import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createClientMock } from '../utils/clientMock'

/**
 * Tests for the session slice.
 *
 * The api client is mocked with an explicit factory so the storage helpers return concrete values:
 * `authSlice` calls them at module load and assigns the results into its initial state.
 */

vi.mock('../../src/api/client', () => createClientMock())

import authReducer, {
  logout,
  clearAuthError,
  loginUser,
  registerUser,
  refreshProfile,
  updateProfile,
  selectCanConsume,
  selectCanPublish,
  selectIsAdmin,
  selectIsProvider,
  selectIsDeveloper,
} from '../../src/store/authSlice'
import { authApi, clearSession, setStoredUser, setToken, ApiError } from '../../src/api/client'

const AUTH_PAYLOAD = {
  accessToken: 'jwt-abc',
  tokenType: 'Bearer',
  id: 'user-1',
  email: 'dev@example.com',
  firstName: 'Dev',
  lastName: 'Eloper',
  role: 'DEVELOPER',
  createdAt: '2026-01-01T00:00:00',
}

describe('authSlice', () => {
  let initialState

  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    // `authSlice` reads storage at module load, so the exported initial state is captured once.
    initialState = authReducer(undefined, { type: '@@INIT' })
  })

  describe('initial state', () => {
    it('starts unauthenticated with no stored session', () => {
      expect(initialState.isAuthenticated).toBe(false)
      expect(initialState.user).toBeNull()
      expect(initialState.token).toBeNull()
      expect(initialState.error).toBeNull()
    })
  })

  describe('logout', () => {
    it('clears the session and removes stored credentials', () => {
      const authenticated = {
        ...initialState,
        token: 'jwt',
        user: { id: '1' },
        isAuthenticated: true,
      }

      const next = authReducer(authenticated, logout())

      expect(next.isAuthenticated).toBe(false)
      expect(next.token).toBeNull()
      expect(next.user).toBeNull()
      expect(clearSession).toHaveBeenCalled()
    })

    it('resets a previous error so the login page starts clean', () => {
      const failed = { ...initialState, status: 'failed', error: 'Bad credentials' }

      const next = authReducer(failed, logout())

      expect(next.error).toBeNull()
      expect(next.status).toBe('idle')
    })
  })

  describe('clearAuthError', () => {
    it('clears the error without touching the session', () => {
      const failed = { ...initialState, error: 'nope', fieldErrors: { email: 'bad' } }

      const next = authReducer(failed, clearAuthError())

      expect(next.error).toBeNull()
      expect(next.fieldErrors).toBeNull()
    })
  })

  describe('loginUser', () => {
    it('marks the slice loading while the request is in flight', () => {
      const next = authReducer(initialState, loginUser.pending('req-1'))

      expect(next.status).toBe('loading')
      expect(next.error).toBeNull()
    })

    it('stores the session and persists it on success', () => {
      const next = authReducer(initialState, loginUser.fulfilled(AUTH_PAYLOAD, 'req-1'))

      expect(next.isAuthenticated).toBe(true)
      expect(next.token).toBe('jwt-abc')
      expect(next.user.email).toBe('dev@example.com')
      expect(next.status).toBe('succeeded')
      expect(setToken).toHaveBeenCalledWith('jwt-abc')
      expect(setStoredUser).toHaveBeenCalled()
    })

    it('records the failure message and any field errors', () => {
      const next = authReducer(
        initialState,
        loginUser.rejected(null, 'req-1', {}, {
          message: 'Invalid email or password',
          fieldErrors: { password: 'is required' },
        }),
      )

      expect(next.status).toBe('failed')
      expect(next.error).toBe('Invalid email or password')
      expect(next.fieldErrors).toEqual({ password: 'is required' })
      expect(next.isAuthenticated).toBe(false)
    })

    it('falls back to a generic message when the rejection carries none', () => {
      const next = authReducer(initialState, loginUser.rejected(null, 'req-1', {}, null))

      expect(next.error).toBe('Something went wrong')
    })
  })

  describe('registerUser', () => {
    it('authenticates immediately, so no second call is needed', () => {
      const next = authReducer(initialState, registerUser.fulfilled(AUTH_PAYLOAD, 'req-1'))

      expect(next.isAuthenticated).toBe(true)
      expect(next.token).toBe('jwt-abc')
    })

    it('reports a duplicate-email conflict as an error, not a crash', () => {
      const next = authReducer(
        initialState,
        registerUser.rejected(null, 'req-1', {}, {
          message: 'Email already registered',
          status: 409,
        }),
      )

      expect(next.status).toBe('failed')
      expect(next.error).toBe('Email already registered')
    })
  })

  describe('refreshProfile', () => {
    it('replaces the cached user and re-persists it', () => {
      const authenticated = { ...initialState, isAuthenticated: true, token: 'jwt' }
      const updated = { ...AUTH_PAYLOAD, role: 'ADMIN' }

      const next = authReducer(authenticated, refreshProfile.fulfilled(updated, 'req-1'))

      expect(next.user.role).toBe('ADMIN')
      expect(setStoredUser).toHaveBeenCalledWith(updated)
    })

    it('logs out when the refresh is rejected with 401', () => {
      const authenticated = { ...initialState, isAuthenticated: true, token: 'jwt' }

      const next = authReducer(
        authenticated,
        refreshProfile.rejected(null, 'req-1', {}, { status: 401, message: 'expired' }),
      )

      expect(next.isAuthenticated).toBe(false)
      expect(next.token).toBeNull()
      expect(clearSession).toHaveBeenCalled()
    })

    it('keeps the session on a non-401 refresh failure', () => {
      const authenticated = { ...initialState, isAuthenticated: true, token: 'jwt' }

      const next = authReducer(
        authenticated,
        refreshProfile.rejected(null, 'req-1', {}, { status: 500, message: 'boom' }),
      )

      // A server hiccup must not sign the user out.
      expect(next.isAuthenticated).toBe(true)
      expect(next.token).toBe('jwt')
    })
  })

  describe('updateProfile', () => {
    it('updates the cached user on success', () => {
      const authenticated = { ...initialState, isAuthenticated: true, user: { id: 'user-1' } }
      const updated = { ...AUTH_PAYLOAD, bio: 'Hello' }

      const next = authReducer(authenticated, updateProfile.fulfilled(updated, 'req-1'))

      expect(next.user.bio).toBe('Hello')
      expect(next.status).toBe('succeeded')
    })
  })

  describe('role selectors', () => {
    const withRole = (role) => ({
      auth: {
        token: 'jwt',
        isAuthenticated: true,
        user: { id: '1', role },
        status: 'idle',
        error: null,
      },
    })

    it('identifies an admin', () => {
      expect(selectIsAdmin(withRole('ADMIN'))).toBe(true)
      expect(selectIsProvider(withRole('ADMIN'))).toBe(false)
    })

    it('identifies a provider', () => {
      expect(selectIsProvider(withRole('PROVIDER'))).toBe(true)
      expect(selectIsDeveloper(withRole('PROVIDER'))).toBe(false)
    })

    it('identifies a developer', () => {
      expect(selectIsDeveloper(withRole('DEVELOPER'))).toBe(true)
    })

    it('never lets a provider consume, which is the rule the UI gates on', () => {
      expect(selectCanConsume(withRole('PROVIDER'))).toBe(false)
      expect(selectCanConsume(withRole('DEVELOPER'))).toBe(true)
      expect(selectCanConsume(withRole('ADMIN'))).toBe(true)
    })

    it('refuses consumption for an anonymous visitor', () => {
      expect(selectCanConsume({ auth: { isAuthenticated: false, user: null } })).toBe(false)
    })

    it('allows publishing for providers and admins only', () => {
      expect(selectCanPublish(withRole('PROVIDER'))).toBe(true)
      expect(selectCanPublish(withRole('ADMIN'))).toBe(true)
      expect(selectCanPublish(withRole('DEVELOPER'))).toBe(false)
    })

    it('handles a missing user without throwing', () => {
      expect(selectIsAdmin({ auth: { user: null } })).toBe(false)
      expect(selectCanPublish({ auth: { user: null } })).toBe(false)
    })
  })

  describe('thunk integration', () => {
    it('rejects with a normalised payload rather than an exception', async () => {
      authApi.login.mockRejectedValue(new ApiError('Invalid email or password', 401, null))

      const result = await loginUser({ email: 'a@b.com', password: 'wrong' })(
        vi.fn(),
        () => initialState,
        undefined,
      )

      expect(loginUser.rejected.match(result)).toBe(true)
      expect(result.payload).toMatchObject({ status: 401, message: 'Invalid email or password' })
    })

    it('resolves with the payload on success', async () => {
      authApi.login.mockResolvedValue(AUTH_PAYLOAD)

      const result = await loginUser({ email: 'a@b.com', password: 'ok' })(
        vi.fn(),
        () => initialState,
        undefined,
      )

      expect(loginUser.fulfilled.match(result)).toBe(true)
      expect(result.payload.accessToken).toBe('jwt-abc')
    })

    it('surfaces validation field errors from the api client unchanged', async () => {
      authApi.register.mockRejectedValue(
        new ApiError('Validation failed', 400, { errors: { email: 'is invalid' } }),
      )

      const result = await registerUser({})(vi.fn(), () => initialState, undefined)

      expect(result.payload.fieldErrors).toEqual({ email: 'is invalid' })
    })
  })
})
