import { createAsyncThunk, createSlice } from '@reduxjs/toolkit'
import { userApi } from '../api/client'

/**
 * Administrative user directory.
 *
 * Distinct from `authSlice`, which owns the *current* session. This slice is the admin's view of
 * other accounts.
 */

const initialState = {
  items: [],
  developers: [],
  current: null,
  status: 'idle',
  error: null,
}

export const fetchUsers = createAsyncThunk(
  'users/fetchAll',
  async (params = {}, { rejectWithValue }) => {
    try {
      return await userApi.list(params)
    } catch (error) {
      return rejectWithValue({ message: error.message, status: error.status })
    }
  },
)

export const fetchDevelopers = createAsyncThunk(
  'users/fetchDevelopers',
  async (params = {}, { rejectWithValue }) => {
    try {
      return await userApi.developers(params)
    } catch (error) {
      return rejectWithValue({ message: error.message, status: error.status })
    }
  },
)

export const fetchUserById = createAsyncThunk(
  'users/fetchById',
  async (id, { rejectWithValue }) => {
    try {
      return await userApi.get(id)
    } catch (error) {
      return rejectWithValue({ message: error.message, status: error.status })
    }
  },
)

export const updateUserAsAdmin = createAsyncThunk(
  'users/updateAsAdmin',
  async ({ id, payload }, { rejectWithValue }) => {
    try {
      return await userApi.update(id, payload)
    } catch (error) {
      return rejectWithValue({
        message: error.message,
        status: error.status,
        fieldErrors: error.fieldErrors,
      })
    }
  },
)

export const deleteUserAsAdmin = createAsyncThunk(
  'users/deleteAsAdmin',
  async (id, { rejectWithValue }) => {
    try {
      await userApi.remove(id)
      return id
    } catch (error) {
      return rejectWithValue({ message: error.message, status: error.status })
    }
  },
)

const usersSlice = createSlice({
  name: 'users',
  initialState,
  reducers: {
    clearUserError(state) {
      state.error = null
    },
    clearCurrentUserRecord(state) {
      state.current = null
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchUsers.pending, (state) => {
        state.status = 'loading'
        state.error = null
      })
      .addCase(fetchUsers.fulfilled, (state, action) => {
        state.status = 'succeeded'
        state.items = action.payload.content ?? []
      })
      .addCase(fetchUsers.rejected, (state, action) => {
        state.status = 'failed'
        state.error = action.payload?.message ?? 'Unable to load users'
      })

      .addCase(fetchDevelopers.fulfilled, (state, action) => {
        state.developers = action.payload.content ?? []
      })

      .addCase(fetchUserById.fulfilled, (state, action) => {
        state.current = action.payload
      })

      .addCase(updateUserAsAdmin.fulfilled, (state, action) => {
        const updated = action.payload
        state.current = updated
        const index = state.items.findIndex((item) => item.id === updated.id)
        if (index >= 0) {
          state.items[index] = updated
        }
      })

      .addCase(deleteUserAsAdmin.fulfilled, (state, action) => {
        state.items = state.items.filter((item) => item.id !== action.payload)
        if (state.current?.id === action.payload) {
          state.current = null
        }
      })
  },
})

export const { clearUserError, clearCurrentUserRecord } = usersSlice.actions

export const selectUsers = (state) => state.users.items
export const selectDevelopers = (state) => state.users.developers
export const selectCurrentUserRecord = (state) => state.users.current
export const selectUsersStatus = (state) => state.users.status
export const selectUsersError = (state) => state.users.error

export default usersSlice.reducer
