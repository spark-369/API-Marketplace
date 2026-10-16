import { createAsyncThunk, createSlice } from '@reduxjs/toolkit'
import { categoryApi } from '../api/client'

/**
 * Category state. Categories are global reference data, so they are cached in the store and shared
 * by the catalog filters and the admin screens.
 */

const initialState = {
  items: [],
  status: 'idle',
  error: null,
}

export const fetchCategories = createAsyncThunk(
  'categories/fetchAll',
  async (_, { rejectWithValue }) => {
    try {
      return await categoryApi.list()
    } catch (error) {
      return rejectWithValue({ message: error.message, status: error.status })
    }
  },
)

export const createCategory = createAsyncThunk(
  'categories/create',
  async (payload, { rejectWithValue }) => {
    try {
      return await categoryApi.create(payload)
    } catch (error) {
      return rejectWithValue({
        message: error.message,
        status: error.status,
        fieldErrors: error.fieldErrors,
      })
    }
  },
)

export const updateCategory = createAsyncThunk(
  'categories/update',
  async ({ id, payload }, { rejectWithValue }) => {
    try {
      return await categoryApi.update(id, payload)
    } catch (error) {
      return rejectWithValue({
        message: error.message,
        status: error.status,
        fieldErrors: error.fieldErrors,
      })
    }
  },
)

export const deleteCategory = createAsyncThunk(
  'categories/delete',
  async (id, { rejectWithValue }) => {
    try {
      await categoryApi.remove(id)
      return id
    } catch (error) {
      return rejectWithValue({ message: error.message, status: error.status })
    }
  },
)

const categoriesSlice = createSlice({
  name: 'categories',
  initialState,
  reducers: {
    clearCategoryError(state) {
      state.error = null
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchCategories.pending, (state) => {
        state.status = 'loading'
        state.error = null
      })
      .addCase(fetchCategories.fulfilled, (state, action) => {
        state.status = 'succeeded'
        state.items = action.payload ?? []
      })
      .addCase(fetchCategories.rejected, (state, action) => {
        state.status = 'failed'
        state.error = action.payload?.message ?? 'Unable to load categories'
      })

      .addCase(createCategory.fulfilled, (state, action) => {
        state.items.push(action.payload)
      })
      .addCase(updateCategory.fulfilled, (state, action) => {
        const index = state.items.findIndex((item) => item.id === action.payload.id)
        if (index >= 0) {
          state.items[index] = action.payload
        }
      })
      .addCase(deleteCategory.fulfilled, (state, action) => {
        state.items = state.items.filter((item) => item.id !== action.payload)
      })
  },
})

export const { clearCategoryError } = categoriesSlice.actions

export const selectCategories = (state) => state.categories.items
export const selectCategoriesStatus = (state) => state.categories.status
export const selectCategoriesError = (state) => state.categories.error

export default categoriesSlice.reducer
