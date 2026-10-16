import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createClientMock } from '../utils/clientMock'

vi.mock('../../src/api/client', () => createClientMock())

import { planApi } from '../../src/api/client'

import plansReducer, {
  fetchPlansForApi,
  createPlan,
  updatePlan,
  deletePlan,
  clearPlanError,
  selectPlansByApi,
  selectAllPlans,
} from '../../src/store/plansSlice'

/**
 * Tests for the plans slice.
 *
 * Plans are keyed by API id because the detail page and the provider's management view frequently hold
 * plans for different APIs at once. That per-API keying is the behaviour most worth pinning: a mistake
 * there shows one API's pricing on another API's page.
 */

const initial = plansReducer(undefined, { type: '@@INIT' })

const aPlan = (overrides = {}) => ({
  id: 'plan-1',
  apiId: 'api-1',
  apiName: 'Weather',
  name: 'Free',
  price: 0,
  rateLimit: 60,
  ratePeriod: 'MINUTE',
  supportLevel: 'COMMUNITY',
  ...overrides,
})

describe('plansSlice', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('fetchPlansForApi', () => {
    it('stores plans under the owning API id', () => {
      const next = plansReducer(
        initial,
        fetchPlansForApi.fulfilled({ apiId: 'api-1', plans: [aPlan()] }, 'req-1'),
      )

      expect(selectPlansByApi('api-1')({ plans: next })).toHaveLength(1)
    })

    it('keeps plans for different APIs separate', () => {
      let state = plansReducer(
        initial,
        fetchPlansForApi.fulfilled({ apiId: 'api-1', plans: [aPlan()] }, 'req-1'),
      )
      state = plansReducer(
        state,
        fetchPlansForApi.fulfilled({ apiId: 'api-2', plans: [aPlan({ id: 'plan-2' })] }, 'req-2'),
      )

      expect(selectPlansByApi('api-1')({ plans: state })[0].id).toBe('plan-1')
      expect(selectPlansByApi('api-2')({ plans: state })[0].id).toBe('plan-2')
    })

    it('reports a failed fetch', () => {
      const next = plansReducer(
        initial,
        fetchPlansForApi.rejected(null, 'req-1', 'api-1', { message: 'Not found' }),
      )

      expect(next.status).toBe('failed')
      expect(next.error).toBe('Not found')
    })
  })

  describe('createPlan', () => {
    it('appends to the owning API list', () => {
      const state = { ...initial, byApi: { 'api-1': [aPlan()] } }

      const next = plansReducer(
        state,
        createPlan.fulfilled({ apiId: 'api-1', plan: aPlan({ id: 'plan-new' }) }, 'req-1'),
      )

      expect(next.byApi['api-1']).toHaveLength(2)
    })

    it('creates the list when the API had no plans yet', () => {
      const next = plansReducer(
        initial,
        createPlan.fulfilled({ apiId: 'api-9', plan: aPlan({ apiId: 'api-9' }) }, 'req-1'),
      )

      expect(next.byApi['api-9']).toHaveLength(1)
    })
  })

  describe('updatePlan', () => {
    it('replaces the matching plan in place', () => {
      const state = { ...initial, byApi: { 'api-1': [aPlan()] } }

      const next = plansReducer(
        state,
        updatePlan.fulfilled({ apiId: 'api-1', plan: aPlan({ name: 'Pro' }) }, 'req-1'),
      )

      expect(next.byApi['api-1']).toHaveLength(1)
      expect(next.byApi['api-1'][0].name).toBe('Pro')
    })
  })

  describe('deletePlan', () => {
    it('removes the plan from its API list', () => {
      const state = { ...initial, byApi: { 'api-1': [aPlan()] } }

      const next = plansReducer(
        state,
        deletePlan.fulfilled({ apiId: 'api-1', planId: 'plan-1' }, 'req-1'),
      )

      expect(next.byApi['api-1']).toEqual([])
    })

    it('is a no-op for a plan belonging to another API', () => {
      const state = { ...initial, byApi: { 'api-1': [aPlan()] } }

      const next = plansReducer(
        state,
        deletePlan.fulfilled({ apiId: 'api-2', planId: 'plan-1' }, 'req-1'),
      )

      expect(next.byApi['api-1']).toHaveLength(1)
    })
  })

  describe('selectors and reducers', () => {
    it('returns an empty array for an API with no plans', () => {
      expect(selectPlansByApi('never-seen')({ plans: initial })).toEqual([])
    })

    it('exposes the admin-wide list', () => {
      expect(selectAllPlans({ plans: { ...initial, all: [aPlan()] } })).toHaveLength(1)
    })

    it('clears only the error', () => {
      const next = plansReducer({ ...initial, error: 'boom' }, clearPlanError())

      expect(next.error).toBeNull()
    })
  })

  describe('thunk integration', () => {
    it('requests plans for the given API', async () => {
      planApi.listForApi.mockResolvedValue([])

      await fetchPlansForApi('api-1')(vi.fn(), () => initial, undefined)

      expect(planApi.listForApi).toHaveBeenCalledWith('api-1')
    })
  })
})
