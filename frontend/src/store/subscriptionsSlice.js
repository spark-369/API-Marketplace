import { createAsyncThunk, createSlice } from '@reduxjs/toolkit'
import { subscriptionApi } from '../api/client'

/**
 * Subscription state.
 *
 * `mine` holds the caller's own entitlements; `byApi` holds the provider's view of who subscribes to
 * a given API. The two are separate because they carry different permissions and are fetched from
 * different endpoints.
 */

const initialState = {
  mine: [],
  byApi: {},
  all: [],
  status: 'idle',
  error: null,
}

export const fetchMySubscriptions = createAsyncThunk(
  'subscriptions/fetchMine',
  async (_, { rejectWithValue }) => {
    try {
      return await subscriptionApi.mine()
    } catch (error) {
      return rejectWithValue({ message: error.message, status: error.status })
    }
  },
)

export const fetchSubscriptionsForApi = createAsyncThunk(
  'subscriptions/fetchForApi',
  async ({ apiId, params = {} }, { rejectWithValue }) => {
    try {
      const page = await subscriptionApi.forApi(apiId, params)
      return { apiId, page }
    } catch (error) {
      return rejectWithValue({ message: error.message, status: error.status })
    }
  },
)

export const fetchAllSubscriptions = createAsyncThunk(
  'subscriptions/fetchAll',
  async (params = {}, { rejectWithValue }) => {
    try {
      return await subscriptionApi.all(params)
    } catch (error) {
      return rejectWithValue({ message: error.message, status: error.status })
    }
  },
)

export const subscribeToApi = createAsyncThunk(
  'subscriptions/subscribe',
  async ({ apiId, planId }, { rejectWithValue }) => {
    try {
      return await subscriptionApi.create(apiId, planId)
    } catch (error) {
      return rejectWithValue({ message: error.message, status: error.status })
    }
  },
)

export const cancelSubscription = createAsyncThunk(
  'subscriptions/cancel',
  async ({ apiId, subscriptionId }, { rejectWithValue }) => {
    try {
      await subscriptionApi.cancel(apiId, subscriptionId)
      return { apiId, subscriptionId }
    } catch (error) {
      return rejectWithValue({ message: error.message, status: error.status })
    }
  },
)

export const updateSubscription = createAsyncThunk(
  'subscriptions/update',
  async ({ apiId, subscriptionId, payload }, { rejectWithValue }) => {
    try {
      return await subscriptionApi.update(apiId, subscriptionId, payload)
    } catch (error) {
      return rejectWithValue({ message: error.message, status: error.status })
    }
  },
)

const subscriptionsSlice = createSlice({
  name: 'subscriptions',
  initialState,
  reducers: {
    clearSubscriptionError(state) {
      state.error = null
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchMySubscriptions.pending, (state) => {
        state.status = 'loading'
        state.error = null
      })
      .addCase(fetchMySubscriptions.fulfilled, (state, action) => {
        state.status = 'succeeded'
        state.mine = action.payload ?? []
      })
      .addCase(fetchMySubscriptions.rejected, (state, action) => {
        state.status = 'failed'
        state.error = action.payload?.message ?? 'Unable to load your subscriptions'
      })

      .addCase(fetchSubscriptionsForApi.fulfilled, (state, action) => {
        state.byApi[action.payload.apiId] = action.payload.page.content ?? []
      })

      .addCase(fetchAllSubscriptions.fulfilled, (state, action) => {
        state.all = action.payload.content ?? []
      })

      .addCase(subscribeToApi.fulfilled, (state, action) => {
        state.mine = [...state.mine, action.payload]
      })

      .addCase(cancelSubscription.fulfilled, (state, action) => {
        const { apiId, subscriptionId } = action.payload
        state.mine = state.mine.map((item) =>
          item.id === subscriptionId ? { ...item, status: 'CANCELLED' } : item)
        state.byApi[apiId] = (state.byApi[apiId] ?? []).map((item) =>
          item.id === subscriptionId ? { ...item, status: 'CANCELLED' } : item)
      })

      .addCase(updateSubscription.fulfilled, (state, action) => {
        const updated = action.payload
        state.mine = state.mine.map((item) => (item.id === updated.id ? updated : item))
        const existing = state.byApi[updated.apiId] ?? []
        state.byApi[updated.apiId] = existing.map((item) => (item.id === updated.id ? updated : item))
      })
  },
})

export const { clearSubscriptionError } = subscriptionsSlice.actions

export const selectMySubscriptions = (state) => state.subscriptions.mine
export const selectSubscriptionsByApi = (apiId) => (state) => state.subscriptions.byApi[apiId] ?? []
export const selectAllSubscriptions = (state) => state.subscriptions.all
export const selectSubscriptionsStatus = (state) => state.subscriptions.status
export const selectSubscriptionsError = (state) => state.subscriptions.error

/**
 * Finds the caller's subscription to a specific API, or undefined when they are not subscribed.
 */
export const selectMySubscriptionForApi = (apiId) => (state) =>
  state.subscriptions.mine.find((item) => item.apiId === apiId)

export default subscriptionsSlice.reducer
