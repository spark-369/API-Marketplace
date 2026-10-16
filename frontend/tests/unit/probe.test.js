import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen } from '@testing-library/react'
import { createClientMock } from '../utils/clientMock'

vi.mock('../../src/api/client', () => createClientMock())

import App from '../../src/App'
import { renderWithProviders, makeTestStore } from '../utils/renderWithProviders'

/**
 * Route-table contract tests.
 *
 * Every page is exercised in its own test file, but nothing else verifies that the paths in the route
 * table actually resolve. A typo in a `path` would leave a page unreachable while its own tests still
 * pass, so each documented path is asserted here to render something other than the 404 view.
 *
 * Assertions check for the presence or absence of the not-found heading rather than page content,
 * because content differs per page and per role.
 */

const mock = createClientMock()
void mock

function renderAt(route, role = 'ADMIN') {
  const store = makeTestStore({
    auth: {
      token: 'jwt',
      isAuthenticated: true,
      user: role ? { id: 'u1', email: 'a@b.com', firstName: 'Test', lastName: 'User', role } : null,
      status: 'idle',
      error: null,
      fieldErrors: null,
    },
    ui: { toasts: [], modal: null, sidebarOpen: false },
  })

  return renderWithProviders(<App />, { route, store })
}

/** The 404 view is identifiable by its distinctive heading. */
function isNotFound() {
  return screen.queryByRole('heading', { name: /page not found/i }) !== null
}

describe('route table', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
  })

  describe('public paths', () => {
    for (const route of ['/', '/login', '/register', '/apis', '/categories']) {
      it(`resolves ${route}`, () => {
        renderAt(route, null)

        expect(isNotFound()).toBe(false)
      })
    }
  })

  describe('authenticated paths', () => {
    for (const route of ['/profile', '/my-apis', '/admin/users', '/all/plans', '/all/reviews']) {
      it(`resolves ${route}`, () => {
        renderAt(route, 'ADMIN')

        expect(isNotFound()).toBe(false)
      })
    }
  })

  describe('developer-only consume paths', () => {
    for (const route of ['/me/subscriptions', '/me/api-keys', '/gateway']) {
      it(`resolves ${route} for a developer`, () => {
        renderAt(route, 'DEVELOPER')

        expect(isNotFound()).toBe(false)
      })
    }
  })

  describe('an unknown path', () => {
    it('renders the not-found view', () => {
      renderAt('/this/route/does/not/exist', null)

      expect(isNotFound()).toBe(true)
    })
  })

  describe('legacy management paths', () => {
    for (const route of ['/manage/plans', '/manage/subscriptions', '/manage/keys', '/manage/reviews']) {
      it(`redirects ${route} to the API picker rather than 404ing`, () => {
        renderAt(route, 'PROVIDER')

        // These are redirects, so the URL changes rather than rendering a missing page.
        expect(isNotFound()).toBe(false)
      })
    }
  })
})





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













