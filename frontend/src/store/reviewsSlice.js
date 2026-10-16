import { createAsyncThunk, createSlice } from '@reduxjs/toolkit'
import { reviewApi } from '../api/client'

/**
 * Review state, keyed by API id.
 *
 * Rating aggregates live on the API record itself, not here, so this slice only ever holds review
 * bodies. After any mutation the caller re-fetches the API to pick up the recomputed average.
 */

const initialState = {
  byApi: {},
  all: [],
  status: 'idle',
  error: null,
}

export const fetchReviewsForApi = createAsyncThunk(
  'reviews/fetchForApi',
  async ({ apiId, params = {} }, { rejectWithValue }) => {
    try {
      const page = await reviewApi.listForApi(apiId, params)
      return { apiId, page }
    } catch (error) {
      return rejectWithValue({ message: error.message, status: error.status })
    }
  },
)

export const fetchAllReviews = createAsyncThunk(
  'reviews/fetchAll',
  async (params = {}, { rejectWithValue }) => {
    try {
      return await reviewApi.listAll(params)
    } catch (error) {
      return rejectWithValue({ message: error.message, status: error.status })
    }
  },
)

export const createReview = createAsyncThunk(
  'reviews/create',
  async ({ apiId, payload }, { rejectWithValue }) => {
    try {
      const review = await reviewApi.create(apiId, payload)
      return { apiId, review }
    } catch (error) {
      return rejectWithValue({
        message: error.message,
        status: error.status,
        fieldErrors: error.fieldErrors,
      })
    }
  },
)

export const updateReview = createAsyncThunk(
  'reviews/update',
  async ({ apiId, reviewId, payload }, { rejectWithValue }) => {
    try {
      const review = await reviewApi.update(apiId, reviewId, payload)
      return { apiId, review }
    } catch (error) {
      return rejectWithValue({
        message: error.message,
        status: error.status,
        fieldErrors: error.fieldErrors,
      })
    }
  },
)

export const deleteReview = createAsyncThunk(
  'reviews/delete',
  async ({ apiId, reviewId }, { rejectWithValue }) => {
    try {
      await reviewApi.remove(apiId, reviewId)
      return { apiId, reviewId }
    } catch (error) {
      return rejectWithValue({ message: error.message, status: error.status })
    }
  },
)

const reviewsSlice = createSlice({
  name: 'reviews',
  initialState,
  reducers: {
    clearReviewError(state) {
      state.error = null
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchReviewsForApi.pending, (state) => {
        state.status = 'loading'
        state.error = null
      })
      .addCase(fetchReviewsForApi.fulfilled, (state, action) => {
        state.status = 'succeeded'
        state.byApi[action.payload.apiId] = action.payload.page.content ?? []
      })
      .addCase(fetchReviewsForApi.rejected, (state, action) => {
        state.status = 'failed'
        state.error = action.payload?.message ?? 'Unable to load reviews'
      })

      .addCase(fetchAllReviews.pending, (state) => {
        state.status = 'loading'
        state.error = null
      })
      .addCase(fetchAllReviews.fulfilled, (state, action) => {
        state.status = 'succeeded'
        state.all = action.payload.content ?? []
      })
      .addCase(fetchAllReviews.rejected, (state, action) => {
        // As with fetchAllPlans: a failure must surface, otherwise the admin view is an empty list
        // that is indistinguishable from "no reviews exist", and a 403 from
        // GET /reviews/all would vanish.
        state.status = 'failed'
        state.error = action.payload?.message ?? 'Unable to load reviews'
      })

      .addCase(createReview.fulfilled, (state, action) => {
        const { apiId, review } = action.payload
        state.byApi[apiId] = [review, ...(state.byApi[apiId] ?? [])]
      })
      .addCase(updateReview.fulfilled, (state, action) => {
        const { apiId, review } = action.payload
        const existing = state.byApi[apiId] ?? []
        state.byApi[apiId] = existing.map((item) => (item.id === review.id ? review : item))
      })
      .addCase(deleteReview.fulfilled, (state, action) => {
        const { apiId, reviewId } = action.payload
        state.byApi[apiId] = (state.byApi[apiId] ?? []).filter((item) => item.id !== reviewId)
      })
  },
})

export const { clearReviewError } = reviewsSlice.actions

export const selectReviewsByApi = (apiId) => (state) => state.reviews.byApi[apiId] ?? []
export const selectAllReviews = (state) => state.reviews.all
export const selectReviewsStatus = (state) => state.reviews.status
export const selectReviewsError = (state) => state.reviews.error

export default reviewsSlice.reducer
