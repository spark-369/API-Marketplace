import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createClientMock } from '../utils/clientMock'

vi.mock('../../src/api/client', () => createClientMock())

import { reviewApi } from '../../src/api/client'

import reviewsReducer, {
  fetchReviewsForApi,
  createReview,
  updateReview,
  deleteReview,
  clearReviewError,
  selectReviewsByApi,
  selectAllReviews,
} from '../../src/store/reviewsSlice'

/**
 * Tests for the reviews slice.
 *
 * Rating aggregates live on the API record rather than here, so this slice only ever holds review
 * bodies. The one-review-per-user rule is enforced by the backend; what matters client-side is that a
 * duplicate attempt (a 409) surfaces as an error and does not optimistically insert a second row.
 */

const initial = reviewsReducer(undefined, { type: '@@INIT' })

const aReview = (overrides = {}) => ({
  id: 'rev-1',
  apiId: 'api-1',
  apiName: 'Weather',
  userId: 'user-1',
  authorName: 'Test User',
  rating: 5,
  title: 'Excellent',
  comment: 'Works well',
  ...overrides,
})

describe('reviewsSlice', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('fetchReviewsForApi', () => {
    it('stores reviews under the owning API id', () => {
      const page = { content: [aReview()], totalElements: 1 }

      const next = reviewsReducer(
        initial,
        fetchReviewsForApi.fulfilled({ apiId: 'api-1', page }, 'req-1'),
      )

      expect(selectReviewsByApi('api-1')({ reviews: next })).toHaveLength(1)
    })

    it('keeps reviews for different APIs separate', () => {
      let state = reviewsReducer(
        initial,
        fetchReviewsForApi.fulfilled({ apiId: 'api-1', page: { content: [aReview()] } }, 'req-1'),
      )
      state = reviewsReducer(
        state,
        fetchReviewsForApi.fulfilled(
          { apiId: 'api-2', page: { content: [aReview({ id: 'rev-2' })] } },
          'req-2',
        ),
      )

      expect(selectReviewsByApi('api-1')({ reviews: state })).toHaveLength(1)
      expect(selectReviewsByApi('api-2')({ reviews: state })[0].id).toBe('rev-2')
    })

    it('reports a failed fetch', () => {
      const next = reviewsReducer(
        initial,
        fetchReviewsForApi.rejected(null, 'req-1', {}, { message: 'API not found' }),
      )

      expect(next.status).toBe('failed')
      expect(next.error).toBe('API not found')
    })
  })

  describe('createReview', () => {
    it('prepends the new review so it appears first', () => {
      const state = { ...initial, byApi: { 'api-1': [aReview({ id: 'rev-old' })] } }

      const next = reviewsReducer(
        state,
        createReview.fulfilled({ apiId: 'api-1', review: aReview({ id: 'rev-new' }) }, 'req-1'),
      )

      expect(next.byApi['api-1'][0].id).toBe('rev-new')
      expect(next.byApi['api-1']).toHaveLength(2)
    })

    it('does not insert a row when the user has already reviewed (409)', () => {
      const state = { ...initial, byApi: { 'api-1': [aReview()] } }

      const next = reviewsReducer(
        state,
        createReview.rejected(null, 'req-1', {}, {
          message: 'You have already reviewed this API',
          status: 409,
        }),
      )

      // No optimistic insert on failure.
      expect(next.byApi['api-1']).toHaveLength(1)
    })
  })

  describe('updateReview', () => {
    it('replaces the review in place without reordering', () => {
      const state = { ...initial, byApi: { 'api-1': [aReview(), aReview({ id: 'rev-2' })] } }

      const next = reviewsReducer(
        state,
        updateReview.fulfilled(
          { apiId: 'api-1', review: aReview({ rating: 3, title: 'Revised' }) },
          'req-1',
        ),
      )

      expect(next.byApi['api-1']).toHaveLength(2)
      expect(next.byApi['api-1'][0].title).toBe('Revised')
      expect(next.byApi['api-1'][0].rating).toBe(3)
    })
  })

  describe('deleteReview', () => {
    it('removes the review from its API list', () => {
      const state = { ...initial, byApi: { 'api-1': [aReview()] } }

      const next = reviewsReducer(
        state,
        deleteReview.fulfilled({ apiId: 'api-1', reviewId: 'rev-1' }, 'req-1'),
      )

      expect(next.byApi['api-1']).toEqual([])
    })
  })

  describe('selectors and reducers', () => {
    it('returns an empty array for an API with no reviews', () => {
      // Components map over this directly, so undefined would crash the render.
      expect(selectReviewsByApi('never-seen')({ reviews: initial })).toEqual([])
    })

    it('exposes the admin-wide list', () => {
      expect(selectAllReviews({ reviews: { ...initial, all: [aReview()] } })).toHaveLength(1)
    })

    it('clears only the error', () => {
      const next = reviewsReducer({ ...initial, error: 'boom' }, clearReviewError())

      expect(next.error).toBeNull()
    })
  })

  describe('thunk integration', () => {
    it('requests reviews for the given API', async () => {
      reviewApi.listForApi.mockResolvedValue({ content: [] })

      await fetchReviewsForApi({ apiId: 'api-1' })(vi.fn(), () => initial, undefined)

      expect(reviewApi.listForApi).toHaveBeenCalledWith('api-1', {})
    })

    it('normalises a client failure into a rejection payload', async () => {
      reviewApi.create.mockRejectedValue(
        Object.assign(new Error('You have already reviewed this API'), { status: 409 }),
      )

      const result = await createReview({ apiId: 'api-1', payload: { rating: 5 } })(
        vi.fn(),
        () => initial,
        undefined,
      )

      expect(createReview.rejected.match(result)).toBe(true)
      expect(result.payload.status).toBe(409)
    })
  })
})
