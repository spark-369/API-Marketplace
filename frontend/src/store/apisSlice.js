import { createAsyncThunk, createSlice } from '@reduxjs/toolkit'
import { apiApi } from '../api/client'

/**
 * API catalog state.
 *
 * Holds both the public catalog (`items`) and the provider's own APIs (`mine`), because the two come
 * from different endpoints under different visibility rules and are rendered on different pages.
 * `current` is the API being viewed in detail.
 */

const initialState = {
  items: [],
  mine: [],
  current: null,
  page: 0,
  size: 20,
  totalElements: 0,
  totalPages: 0,
  status: 'idle',
  mineStatus: 'idle',
  currentStatus: 'idle',
  error: null,
  // Set after a successful create/update so the UI can navigate to the new resource.
  lastSaved: null,
}

export const fetchApis = createAsyncThunk(
  'apis/fetchCatalog',
  async (params = {}, { rejectWithValue }) => {
    try {
      return await apiApi.listPublished(params)
    } catch (error) {
      return rejectWithValue({ message: error.message, status: error.status })
    }
  },
)

export const fetchMyApis = createAsyncThunk(
  'apis/fetchMine',
  async (params = {}, { rejectWithValue }) => {
    try {
      return await apiApi.listMine(params)
    } catch (error) {
      return rejectWithValue({ message: error.message, status: error.status })
    }
  },
)

export const fetchApiById = createAsyncThunk(
  'apis/fetchById',
  async (id, { rejectWithValue }) => {
    try {
      return await apiApi.get(id)
    } catch (error) {
      return rejectWithValue({ message: error.message, status: error.status })
    }
  },
)

export const createApi = createAsyncThunk(
  'apis/create',
  async (payload, { rejectWithValue }) => {
    try {
      return await apiApi.create(payload)
    } catch (error) {
      return rejectWithValue({
        message: error.message,
        status: error.status,
        fieldErrors: error.fieldErrors,
      })
    }
  },
)

export const updateApi = createAsyncThunk(
  'apis/update',
  async ({ id, payload }, { rejectWithValue }) => {
    try {
      return await apiApi.update(id, payload)
    } catch (error) {
      return rejectWithValue({
        message: error.message,
        status: error.status,
        fieldErrors: error.fieldErrors,
      })
    }
  },
)

export const deleteApi = createAsyncThunk(
  'apis/delete',
  async (id, { rejectWithValue }) => {
    try {
      await apiApi.remove(id)
      return id
    } catch (error) {
      return rejectWithValue({ message: error.message, status: error.status })
    }
  },
)

const apisSlice = createSlice({
  name: 'apis',
  initialState,
  reducers: {
    clearCurrentApi(state) {
      state.current = null
      state.currentStatus = 'idle'
    },
    clearApiError(state) {
      state.error = null
    },
    clearLastSaved(state) {
      state.lastSaved = null
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchApis.pending, (state) => {
        state.status = 'loading'
        state.error = null
      })
      .addCase(fetchApis.fulfilled, (state, action) => {
        state.status = 'succeeded'
        state.items = action.payload.content ?? []
        state.page = action.payload.page ?? 0
        state.size = action.payload.size ?? 20
        state.totalElements = action.payload.totalElements ?? 0
        state.totalPages = action.payload.totalPages ?? 0
      })
      .addCase(fetchApis.rejected, (state, action) => {
        state.status = 'failed'
        state.error = action.payload?.message ?? 'Unable to load APIs'
      })

      .addCase(fetchMyApis.pending, (state) => {
        state.mineStatus = 'loading'
        state.error = null
      })
      .addCase(fetchMyApis.fulfilled, (state, action) => {
        state.mineStatus = 'succeeded'
        state.mine = action.payload.content ?? []
      })
      .addCase(fetchMyApis.rejected, (state, action) => {
        state.mineStatus = 'failed'
        state.error = action.payload?.message ?? 'Unable to load your APIs'
      })

      .addCase(fetchApiById.pending, (state) => {
        state.currentStatus = 'loading'
        state.current = null
        state.error = null
      })
      .addCase(fetchApiById.fulfilled, (state, action) => {
        state.currentStatus = 'succeeded'
        state.current = action.payload
      })
      .addCase(fetchApiById.rejected, (state, action) => {
        state.currentStatus = 'failed'
        state.error = action.payload?.message ?? 'Unable to load this API'
      })

      .addCase(createApi.fulfilled, (state, action) => {
        state.lastSaved = action.payload
        state.mine.unshift(action.payload)
      })
      .addCase(updateApi.fulfilled, (state, action) => {
        state.lastSaved = action.payload
        state.current = action.payload
        const index = state.mine.findIndex((api) => api.id === action.payload.id)
        if (index >= 0) {
          state.mine[index] = action.payload
        }
        const publicIndex = state.items.findIndex((api) => api.id === action.payload.id)
        if (publicIndex >= 0) {
          state.items[publicIndex] = action.payload
        }
      })
      .addCase(deleteApi.fulfilled, (state, action) => {
        state.mine = state.mine.filter((api) => api.id !== action.payload)
        state.items = state.items.filter((api) => api.id !== action.payload)
        if (state.current?.id === action.payload) {
          state.current = null
        }
      })
  },
})

export const { clearCurrentApi, clearApiError, clearLastSaved } = apisSlice.actions

// ---- Selectors -------------------------------------------------------------

export const selectApis = (state) => state.apis.items
export const selectMyApis = (state) => state.apis.mine
export const selectCurrentApi = (state) => state.apis.current
export const selectApisStatus = (state) => state.apis.status
export const selectMyApisStatus = (state) => state.apis.mineStatus
export const selectCurrentApiStatus = (state) => state.apis.currentStatus
export const selectApisError = (state) => state.apis.error
export const selectApisPagination = (state) => ({
  page: state.apis.page,
  size: state.apis.size,
  totalElements: state.apis.totalElements,
  totalPages: state.apis.totalPages,
})

export default apisSlice.reducer
