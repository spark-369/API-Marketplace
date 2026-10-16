import { createAsyncThunk, createSlice } from '@reduxjs/toolkit'
import {
  authApi,
  clearSession,
  getStoredUser,
  getToken,
  setStoredUser,
  setToken,
  userApi,
} from '../api/client'

/**
 * Session state: the JWT, the current account and the derived role flags the UI gates on.
 *
 * The token and user are mirrored into `localStorage` on every successful authentication so a page
 * reload restores the session without a round-trip. On any 401 the slice clears both, which is the
 * single place logout happens.
 */

const storedUser = getStoredUser()
const storedToken = getToken()

const initialState = {
  token: storedToken,
  user: storedUser,
  // Treat a stored token as authenticated so the first paint is not a redirect to /login.
  isAuthenticated: Boolean(storedToken),
  status: 'idle',
  error: null,
  // Populated when a call fails validation, so forms can render field-level problems.
  fieldErrors: null,
}

export const registerUser = createAsyncThunk(
  'auth/register',
  async (payload, { rejectWithValue }) => {
    try {
      return await authApi.register(payload)
    } catch (error) {
      return rejectWithValue({
        message: error.message,
        status: error.status,
        fieldErrors: error.fieldErrors,
      })
    }
  },
)

export const loginUser = createAsyncThunk(
  'auth/login',
  async (payload, { rejectWithValue }) => {
    try {
      return await authApi.login(payload)
    } catch (error) {
      return rejectWithValue({
        message: error.message,
        status: error.status,
        fieldErrors: error.fieldErrors,
      })
    }
  },
)

/**
 * Re-fetches the current account, used to pick up role changes made by an admin mid-session.
 */
export const refreshProfile = createAsyncThunk(
  'auth/refreshProfile',
  async (_, { rejectWithValue }) => {
    try {
      return await userApi.me()
    } catch (error) {
      return rejectWithValue({ message: error.message, status: error.status })
    }
  },
)

export const updateProfile = createAsyncThunk(
  'auth/updateProfile',
  async (payload, { rejectWithValue }) => {
    try {
      return await userApi.updateMe(payload)
    } catch (error) {
      return rejectWithValue({
        message: error.message,
        status: error.status,
        fieldErrors: error.fieldErrors,
      })
    }
  },
)

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    /**
     * Clears the session everywhere: Redux state, localStorage, and the token the api client reads.
     */
    logout(state) {
      state.token = null
      state.user = null
      state.isAuthenticated = false
      state.status = 'idle'
      state.error = null
      state.fieldErrors = null
      clearSession()
    },

    /** Clears a stale error banner without touching the session. */
    clearAuthError(state) {
      state.error = null
      state.fieldErrors = null
    },
  },
  extraReducers: (builder) => {
    builder
      // ---- register -------------------------------------------------------
      .addCase(registerUser.pending, (state) => {
        state.status = 'loading'
        state.error = null
        state.fieldErrors = null
      })
      .addCase(registerUser.fulfilled, (state, action) => {
        applySession(state, action.payload)
      })
      .addCase(registerUser.rejected, (state, action) => {
        applyFailure(state, action.payload)
      })

      // ---- login ----------------------------------------------------------
      .addCase(loginUser.pending, (state) => {
        state.status = 'loading'
        state.error = null
        state.fieldErrors = null
      })
      .addCase(loginUser.fulfilled, (state, action) => {
        applySession(state, action.payload)
      })
      .addCase(loginUser.rejected, (state, action) => {
        applyFailure(state, action.payload)
      })

      // ---- profile --------------------------------------------------------
      .addCase(refreshProfile.fulfilled, (state, action) => {
        state.user = action.payload
        setStoredUser(action.payload)
      })
      .addCase(refreshProfile.rejected, (state, action) => {
        // A failed refresh usually means the token is no longer accepted.
        if (action.payload?.status === 401) {
          state.token = null
          state.user = null
          state.isAuthenticated = false
          clearSession()
        }
      })
      .addCase(updateProfile.pending, (state) => {
        state.status = 'loading'
        state.error = null
      })
      .addCase(updateProfile.fulfilled, (state, action) => {
        state.user = action.payload
        state.status = 'succeeded'
        setStoredUser(action.payload)
      })
      .addCase(updateProfile.rejected, (state, action) => {
        applyFailure(state, action.payload)
      })
  },
})

/**
 * Action creators.
 *
 * Exported so components can dispatch them directly; every other slice in this store follows the
 * same `export const { ... } = <name>Slice.actions` convention.
 */
export const { logout, clearAuthError } = authSlice.actions

/**
 * Persists a successful authentication into both Redux and localStorage.
 */
function applySession(state, payload) {
  state.status = 'succeeded'
  state.error = null
  state.fieldErrors = null
  state.token = payload.accessToken
  state.user = {
    id: payload.id,
    email: payload.email,
    firstName: payload.firstName,
    lastName: payload.lastName,
    role: payload.role,
    createdAt: payload.createdAt,
  }
  state.isAuthenticated = true

  setToken(payload.accessToken)
  setStoredUser(state.user)
}

function applyFailure(state, payload) {
  state.status = 'failed'
  state.error = payload?.message ?? 'Something went wrong'
  state.fieldErrors = payload?.fieldErrors ?? null
}

// ---- Selectors -------------------------------------------------------------

export const selectAuth = (state) => state.auth
export const selectUser = (state) => state.auth.user
export const selectIsAuthenticated = (state) => state.auth.isAuthenticated
export const selectAuthStatus = (state) => state.auth.status
export const selectAuthError = (state) => state.auth.error
export const selectAuthFieldErrors = (state) => state.auth.fieldErrors

export const selectRole = (state) => state.auth.user?.role ?? null
export const selectIsAdmin = (state) => state.auth.user?.role === 'ADMIN'
export const selectIsProvider = (state) => state.auth.user?.role === 'PROVIDER'
export const selectIsDeveloper = (state) => state.auth.user?.role === 'DEVELOPER'

/**
 * Providers publish APIs but never consume them, so they must not see subscribe or gateway
 * affordances. This selector is the single source of that rule.
 */
export const selectCanConsume = (state) =>
  state.auth.isAuthenticated && state.auth.user?.role !== 'PROVIDER'

export const selectCanPublish = (state) =>
  state.auth.user?.role === 'PROVIDER' || state.auth.user?.role === 'ADMIN'

export default authSlice.reducer
