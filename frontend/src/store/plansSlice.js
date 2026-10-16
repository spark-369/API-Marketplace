import { createAsyncThunk, createSlice } from '@reduxjs/toolkit'
import { planApi } from '../api/client'

/**
 * Plan state.
 *
 * `byApi` is keyed by API id so plans for several APIs can be resident at once — the detail page and
 * the provider's management view frequently show different APIs in one session.
 */

const initialState = {
  byApi: {},
  all: [],
  status: 'idle',
  error: null,
}

export const fetchPlansForApi = createAsyncThunk(
  'plans/fetchForApi',
  async (apiId, { rejectWithValue }) => {
    try {
      const plans = await planApi.listForApi(apiId)
      return { apiId, plans }
    } catch (error) {
      return rejectWithValue({ message: error.message, status: error.status })
    }
  },
)

export const fetchAllPlans = createAsyncThunk(
  'plans/fetchAll',
  async (params = {}, { rejectWithValue }) => {
    try {
      return await planApi.listAll(params)
    } catch (error) {
      return rejectWithValue({ message: error.message, status: error.status })
    }
  },
)

export const createPlan = createAsyncThunk(
  'plans/create',
  async ({ apiId, payload }, { rejectWithValue }) => {
    try {
      const plan = await planApi.create(apiId, payload)
      return { apiId, plan }
    } catch (error) {
      return rejectWithValue({
        message: error.message,
        status: error.status,
        fieldErrors: error.fieldErrors,
      })
    }
  },
)

export const updatePlan = createAsyncThunk(
  'plans/update',
  async ({ apiId, planId, payload }, { rejectWithValue }) => {
    try {
      const plan = await planApi.update(apiId, planId, payload)
      return { apiId, plan }
    } catch (error) {
      return rejectWithValue({
        message: error.message,
        status: error.status,
        fieldErrors: error.fieldErrors,
      })
    }
  },
)

export const deletePlan = createAsyncThunk(
  'plans/delete',
  async ({ apiId, planId }, { rejectWithValue }) => {
    try {
      await planApi.remove(apiId, planId)
      return { apiId, planId }
    } catch (error) {
      return rejectWithValue({ message: error.message, status: error.status })
    }
  },
)

const plansSlice = createSlice({
  name: 'plans',
  initialState,
  reducers: {
    clearPlanError(state) {
      state.error = null
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchPlansForApi.pending, (state) => {
        state.status = 'loading'
        state.error = null
      })
      .addCase(fetchPlansForApi.fulfilled, (state, action) => {
        state.status = 'succeeded'
        state.byApi[action.payload.apiId] = action.payload.plans
      })
      .addCase(fetchPlansForApi.rejected, (state, action) => {
        state.status = 'failed'
        state.error = action.payload?.message ?? 'Unable to load plans'
      })

      .addCase(fetchAllPlans.pending, (state) => {
        state.status = 'loading'
        state.error = null
      })
      .addCase(fetchAllPlans.fulfilled, (state, action) => {
        state.status = 'succeeded'
        state.all = action.payload.content ?? []
      })
      .addCase(fetchAllPlans.rejected, (state, action) => {
        // Without this the admin overview would render an empty list on failure — indistinguishable
        // from "no plans exist", and it silently swallowed the 403 a non-admin receives from
        // GET /plans/all.
        state.status = 'failed'
        state.error = action.payload?.message ?? 'Unable to load plans'
      })

      .addCase(createPlan.fulfilled, (state, action) => {
        const { apiId, plan } = action.payload
        state.byApi[apiId] = [...(state.byApi[apiId] ?? []), plan]
      })
      .addCase(updatePlan.fulfilled, (state, action) => {
        const { apiId, plan } = action.payload
        const existing = state.byApi[apiId] ?? []
        state.byApi[apiId] = existing.map((item) => (item.id === plan.id ? plan : item))
      })
      .addCase(deletePlan.fulfilled, (state, action) => {
        const { apiId, planId } = action.payload
        state.byApi[apiId] = (state.byApi[apiId] ?? []).filter((item) => item.id !== planId)
      })
  },
})

export const { clearPlanError } = plansSlice.actions

export const selectPlansByApi = (apiId) => (state) => state.plans.byApi[apiId] ?? []
export const selectAllPlans = (state) => state.plans.all
export const selectPlansStatus = (state) => state.plans.status
export const selectPlansError = (state) => state.plans.error

export default plansSlice.reducer
