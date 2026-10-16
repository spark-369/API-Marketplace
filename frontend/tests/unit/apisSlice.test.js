import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createClientMock } from '../utils/clientMock'

vi.mock('../../src/api/client', () => createClientMock())

import { apiApi } from '../../src/api/client'

import apisReducer, {
  fetchApis,
  fetchMyApis,
  fetchApiById,
  createApi,
  updateApi,
  deleteApi,
  clearCurrentApi,
  clearApiError,
  selectApis,
  selectMyApis,
  selectCurrentApi,
  selectApisPagination,
} from '../../src/store/apisSlice'

/**
 * Tests for the API catalog slice.
 *
 * Two behaviours carry real risk and are pinned here: the paginated response must be unwrapped
 * correctly (a mistake surfaces as an empty catalog rather than an error), and a 404 on a detail fetch
 * must produce a failed status so the page can render "not found" instead of a blank form.
 */

const initial = apisReducer(undefined, { type: '@@INIT' })

const pageOf = (content) => ({
  content,
  page: 0,
  size: 20,
  totalElements: content.length,
  totalPages: 1,
  first: true,
  last: true,
  empty: content.length === 0,
})

const anApi = (overrides = {}) => ({
  id: 'api-1',
  name: 'Weather',
  slug: 'weather',
  status: 'PUBLISHED',
  visibility: 'PUBLIC',
  ...overrides,
})

describe('apisSlice', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('fetchApis', () => {
    it('unwraps the page envelope into items and pagination metadata', () => {
      const next = apisReducer(initial, fetchApis.fulfilled(pageOf([anApi()]), 'req-1'))

      expect(next.items).toHaveLength(1)
      expect(next.totalElements).toBe(1)
      expect(next.totalPages).toBe(1)
      expect(next.status).toBe('succeeded')
    })

    it('tolerates a payload with no content field', () => {
      // Guards against a malformed response blanking the catalog silently.
      const next = apisReducer(initial, fetchApis.fulfilled({}, 'req-1'))

      expect(next.items).toEqual([])
      expect(next.status).toBe('succeeded')
    })

    it('marks the slice loading and clears the previous error', () => {
      const errored = { ...initial, error: 'old' }

      const next = apisReducer(errored, fetchApis.pending('req-1'))

      expect(next.status).toBe('loading')
      expect(next.error).toBeNull()
    })

    it('records the failure message', () => {
      const next = apisReducer(
        initial,
        fetchApis.rejected(null, 'req-1', {}, { message: 'Server unavailable' }),
      )

      expect(next.status).toBe('failed')
      expect(next.error).toBe('Server unavailable')
    })

    it('falls back to a generic failure message', () => {
      const next = apisReducer(initial, fetchApis.rejected(null, 'req-1', {}, null))

      expect(next.error).toBe('Unable to load APIs')
    })
  })

  describe('fetchMyApis', () => {
    it('populates the provider-owned list separately from the catalog', () => {
      const next = apisReducer(initial, fetchMyApis.fulfilled(pageOf([anApi()]), 'req-1'))

      expect(next.mine).toHaveLength(1)
      expect(next.items).toEqual([])
      expect(next.mineStatus).toBe('succeeded')
    })
  })

  describe('fetchApiById', () => {
    it('stores the detail record', () => {
      const next = apisReducer(initial, fetchApiById.fulfilled(anApi(), 'req-1'))

      expect(next.current.name).toBe('Weather')
      expect(next.currentStatus).toBe('succeeded')
    })

    it('clears any previous record when a new fetch starts', () => {
      const withCurrent = { ...initial, current: anApi({ id: 'old' }) }

      const next = apisReducer(withCurrent, fetchApiById.pending('req-1'))

      expect(next.current).toBeNull()
      expect(next.currentStatus).toBe('loading')
    })

    it('reports a not-found as a failed status so the page can branch on it', () => {
      const next = apisReducer(
        initial,
        fetchApiById.rejected(null, 'req-1', 'api-x', { message: 'API not found', status: 404 }),
      )

      expect(next.currentStatus).toBe('failed')
      expect(next.error).toBe('API not found')
    })
  })

  describe('createApi', () => {
    it('prepends the new API to the provider list', () => {
      const withMine = { ...initial, mine: [anApi({ id: 'existing' })] }

      const next = apisReducer(withMine, createApi.fulfilled(anApi({ id: 'new' }), 'req-1'))

      expect(next.mine[0].id).toBe('new')
      expect(next.lastSaved.id).toBe('new')
    })
  })

  describe('updateApi', () => {
    it('replaces the record in both the owned and public lists', () => {
      const state = {
        ...initial,
        mine: [anApi({ name: 'Old' })],
        items: [anApi({ name: 'Old' })],
      }

      const next = apisReducer(state, updateApi.fulfilled(anApi({ name: 'New' }), 'req-1'))

      expect(next.mine[0].name).toBe('New')
      expect(next.items[0].name).toBe('New')
      expect(next.current.name).toBe('New')
    })

    it('leaves unrelated entries untouched', () => {
      const state = { ...initial, mine: [anApi({ id: 'other', name: 'Other' })] }

      const next = apisReducer(state, updateApi.fulfilled(anApi({ id: 'api-1' }), 'req-1'))

      expect(next.mine[0].name).toBe('Other')
    })
  })

  describe('deleteApi', () => {
    it('removes the API from every list holding it', () => {
      const state = {
        ...initial,
        mine: [anApi()],
        items: [anApi()],
        current: anApi(),
      }

      const next = apisReducer(state, deleteApi.fulfilled('api-1', 'req-1'))

      expect(next.mine).toEqual([])
      expect(next.items).toEqual([])
      expect(next.current).toBeNull()
    })
  })

  describe('reducers', () => {
    it('clearCurrentApi resets the detail view', () => {
      const state = { ...initial, current: anApi(), currentStatus: 'succeeded' }

      const next = apisReducer(state, clearCurrentApi())

      expect(next.current).toBeNull()
      expect(next.currentStatus).toBe('idle')
    })

    it('clearApiError removes the error only', () => {
      const next = apisReducer({ ...initial, error: 'boom', items: [anApi()] }, clearApiError())

      expect(next.error).toBeNull()
      expect(next.items).toHaveLength(1)
    })
  })

  describe('selectors', () => {
    it('expose the catalog, owned list and pagination', () => {
      const state = {
        apis: {
          ...initial,
          items: [anApi()],
          mine: [],
          page: 2,
          size: 10,
          totalElements: 42,
          totalPages: 5,
        },
      }

      expect(selectApis(state)).toHaveLength(1)
      expect(selectMyApis(state)).toEqual([])
      expect(selectCurrentApi(state)).toBeNull()
      expect(selectApisPagination(state)).toEqual({
        page: 2,
        size: 10,
        totalElements: 42,
        totalPages: 5,
      })
    })
  })

  describe('thunk integration', () => {
    it('passes filters through to the client', async () => {
      apiApi.listPublished.mockResolvedValue(pageOf([]))

      await fetchApis({ categoryId: 'c1', search: 'weather', page: 1 })(
        vi.fn(),
        () => initial,
        undefined,
      )

      expect(apiApi.listPublished).toHaveBeenCalledWith({
        categoryId: 'c1',
        search: 'weather',
        page: 1,
      })
    })

    it('normalises a client error into a rejection payload', async () => {
      const error = new Error('Network down')
      error.status = 0
      apiApi.listPublished.mockRejectedValue(error)

      const result = await fetchApis({})(vi.fn(), () => initial, undefined)

      expect(fetchApis.rejected.match(result)).toBe(true)
      expect(result.payload.message).toBe('Network down')
    })
  })
})
