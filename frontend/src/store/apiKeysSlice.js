import { createAsyncThunk, createSlice } from '@reduxjs/toolkit'
import { apiKeyApi } from '../api/client'

/**
 * API key state.
 *
 * `newlyCreatedKey` is deliberately kept in memory only: the plaintext secret is returned by the
 * backend exactly once, so the UI must present it immediately and must never persist it. It is
 * cleared as soon as the user dismisses the reveal dialog.
 */

const initialState = {
  mine: [],
  byApi: {},
  all: [],
  usage: {},
  // Per-key load state for the usage modal, keyed the same way as `usage`. Kept separate from the
  // slice-level `status`, which tracks the key list itself: opening one key's usage must not make the
  // whole page look like it is loading.
  usageStatus: {},
  usageError: {},
  status: 'idle',
  error: null,
  newlyCreatedKey: null,
}

export const fetchMyKeys = createAsyncThunk(
  'apiKeys/fetchMine',
  async (_, { rejectWithValue }) => {
    try {
      return await apiKeyApi.mine()
    } catch (error) {
      return rejectWithValue({ message: error.message, status: error.status })
    }
  },
)

export const fetchKeysForApi = createAsyncThunk(
  'apiKeys/fetchForApi',
  async ({ apiId, params = {} }, { rejectWithValue }) => {
    try {
      const page = await apiKeyApi.forApi(apiId, params)
      return { apiId, page }
    } catch (error) {
      return rejectWithValue({ message: error.message, status: error.status })
    }
  },
)

export const fetchAllKeys = createAsyncThunk(
  'apiKeys/fetchAll',
  async (params = {}, { rejectWithValue }) => {
    try {
      return await apiKeyApi.all(params)
    } catch (error) {
      return rejectWithValue({ message: error.message, status: error.status })
    }
  },
)

export const fetchKeyUsage = createAsyncThunk(
  'apiKeys/fetchUsage',
  async ({ apiId, keyId, params = {} }, { rejectWithValue }) => {
    try {
      const page = await apiKeyApi.usage(apiId, keyId, params)
      return { keyId, page }
    } catch (error) {
      return rejectWithValue({ message: error.message, status: error.status })
    }
  },
)

export const createKey = createAsyncThunk(
  'apiKeys/create',
  async ({ apiId, payload }, { rejectWithValue }) => {
    try {
      return { apiId, created: await apiKeyApi.create(apiId, payload) }
    } catch (error) {
      return rejectWithValue({ message: error.message, status: error.status })
    }
  },
)

export const rotateKey = createAsyncThunk(
  'apiKeys/rotate',
  async ({ apiId, keyId, payload }, { rejectWithValue }) => {
    try {
      return { apiId, created: await apiKeyApi.rotate(apiId, keyId, payload) }
    } catch (error) {
      return rejectWithValue({ message: error.message, status: error.status })
    }
  },
)

export const revokeKey = createAsyncThunk(
  'apiKeys/revoke',
  async ({ apiId, keyId }, { rejectWithValue }) => {
    try {
      const key = await apiKeyApi.revoke(apiId, keyId)
      return { apiId, key }
    } catch (error) {
      return rejectWithValue({ message: error.message, status: error.status })
    }
  },
)

export const deleteKey = createAsyncThunk(
  'apiKeys/delete',
  async ({ apiId, keyId }, { rejectWithValue }) => {
    try {
      await apiKeyApi.remove(apiId, keyId)
      return { apiId, keyId }
    } catch (error) {
      return rejectWithValue({ message: error.message, status: error.status })
    }
  },
)

const apiKeysSlice = createSlice({
  name: 'apiKeys',
  initialState,
  reducers: {
    clearKeyError(state) {
      state.error = null
    },

    /**
     * Discards the one-time plaintext secret. Called when the reveal dialog closes.
     */
    dismissNewKey(state) {
      state.newlyCreatedKey = null
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchMyKeys.pending, (state) => {
        state.status = 'loading'
        state.error = null
      })
      .addCase(fetchMyKeys.fulfilled, (state, action) => {
        state.status = 'succeeded'
        state.mine = action.payload ?? []
      })
      .addCase(fetchMyKeys.rejected, (state, action) => {
        state.status = 'failed'
        state.error = action.payload?.message ?? 'Unable to load your API keys'
      })

      .addCase(fetchKeysForApi.fulfilled, (state, action) => {
        state.byApi[action.payload.apiId] = action.payload.page.content ?? []
      })

      .addCase(fetchAllKeys.fulfilled, (state, action) => {
        state.all = action.payload.content ?? []
      })

      .addCase(fetchKeyUsage.pending, (state, action) => {
        // Tracked per key so opening one key's usage does not blank out another's cached rows, and
        // so the modal can show a spinner rather than claiming there is no telemetry.
        const { keyId } = action.meta.arg
        state.usageStatus[keyId] = 'loading'
        state.usageError[keyId] = null
      })
      .addCase(fetchKeyUsage.fulfilled, (state, action) => {
        state.usage[action.payload.keyId] = action.payload.page.content ?? []
        state.usageStatus[action.payload.keyId] = 'succeeded'
        state.usageError[action.payload.keyId] = null
      })
      .addCase(fetchKeyUsage.rejected, (state, action) => {
        // Without this the modal rendered "no requests recorded" for a failed request, which reads as
        // "this key has never been used" — indistinguishable from a 403 on an API the caller does not
        // own. The failure has to be visible.
        const { keyId } = action.meta.arg
        state.usageStatus[keyId] = 'failed'
        state.usageError[keyId] = action.payload?.message ?? 'Unable to load usage for this key'
      })

      .addCase(createKey.fulfilled, (state, action) => {
        const { apiId, created } = action.payload
        state.newlyCreatedKey = created
        state.byApi[apiId] = [created.key, ...(state.byApi[apiId] ?? [])]
      })
      .addCase(createKey.rejected, (state, action) => {
        state.error = action.payload?.message ?? 'Unable to provision a key'
      })

      .addCase(rotateKey.fulfilled, (state, action) => {
        const { apiId, created } = action.payload
        state.newlyCreatedKey = created
        const existing = state.byApi[apiId] ?? []
        state.byApi[apiId] = existing.map((item) => (item.id === created.key.id ? created.key : item))
      })

      .addCase(revokeKey.fulfilled, (state, action) => {
        const { apiId, key } = action.payload
        const existing = state.byApi[apiId] ?? []
        state.byApi[apiId] = existing.map((item) => (item.id === key.id ? key : item))
        state.mine = state.mine.map((item) => (item.id === key.id ? key : item))
      })

      .addCase(deleteKey.fulfilled, (state, action) => {
        const { apiId, keyId } = action.payload
        state.byApi[apiId] = (state.byApi[apiId] ?? []).filter((item) => item.id !== keyId)
        state.mine = state.mine.filter((item) => item.id !== keyId)
      })
  },
})

export const { clearKeyError, dismissNewKey } = apiKeysSlice.actions

export const selectMyKeys = (state) => state.apiKeys.mine
export const selectKeysByApi = (apiId) => (state) => state.apiKeys.byApi[apiId] ?? []
export const selectAllKeys = (state) => state.apiKeys.all
export const selectKeyUsage = (keyId) => (state) => state.apiKeys.usage[keyId] ?? []

/**
 * Load state for one key's usage rows.
 *
 * <p>Returns {@code 'idle'} when the key has never been inspected, so the modal can distinguish
 * "not requested yet" from "requested and genuinely empty".</p>
 */
export const selectKeyUsageStatus = (keyId) => (state) =>
  keyId ? (state.apiKeys.usageStatus[keyId] ?? 'idle') : 'idle'

export const selectKeyUsageError = (keyId) => (state) =>
  keyId ? (state.apiKeys.usageError[keyId] ?? null) : null
export const selectApiKeysStatus = (state) => state.apiKeys.status
export const selectApiKeysError = (state) => state.apiKeys.error
export const selectNewlyCreatedKey = (state) => state.apiKeys.newlyCreatedKey

export default apiKeysSlice.reducer
