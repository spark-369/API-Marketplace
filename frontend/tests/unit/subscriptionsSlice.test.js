import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createClientMock } from '../utils/clientMock'

vi.mock('../../src/api/client', () => createClientMock())

import { subscriptionApi } from '../../src/api/client'

import subscriptionsReducer, {
  fetchMySubscriptions,
  fetchSubscriptionsForApi,
  subscribeToApi,
  cancelSubscription,
  clearSubscriptionError,
  selectMySubscriptions,
  selectSubscriptionsByApi,
  selectMySubscriptionForApi,
} from '../../src/store/subscriptionsSlice'

/**
 * Tests for the subscription slice.
 *
 * Subscriptions join an entitlement to a credential, so the behaviours that matter are: a
 * cancellation must reflect as CANCELLED wherever the row is displayed, and a failed subscribe (an
 * exhausted key pool returns 409) must surface as an error rather than a silent no-op.
 */

const initial = subscriptionsReducer(undefined, { type: '@@INIT' })

const aSubscription = (overrides = {}) => ({
  id: 'sub-1',
  apiId: 'api-1',
  apiName: 'Weather',
  userId: 'user-1',
  userEmail: 'dev@example.com',
  status: 'ACTIVE',
  apiKeyPrefix: 'am_abcd1234',
  startedAt: '2026-01-01T00:00:00',
  expiresAt: null,
  ...overrides,
})

describe('subscriptionsSlice', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('fetchMySubscriptions', () => {
    it('stores the caller-owned list', () => {
      const next = subscriptionsReducer(
        initial,
        fetchMySubscriptions.fulfilled([aSubscription()], 'req-1'),
      )

      expect(selectMySubscriptions({ subscriptions: next })).toHaveLength(1)
      expect(next.status).toBe('succeeded')
    })

    it('tolerates a null payload rather than crashing the page', () => {
      const next = subscriptionsReducer(initial, fetchMySubscriptions.fulfilled(null, 'req-1'))

      expect(next.mine).toEqual([])
    })

    it('records a failure message', () => {
      const next = subscriptionsReducer(
        initial,
        fetchMySubscriptions.rejected(null, 'req-1', undefined, { message: 'Unauthorised' }),
      )

      expect(next.status).toBe('failed')
      expect(next.error).toBe('Unauthorised')
    })
  })

  describe('fetchSubscriptionsForApi', () => {
    it('keys the provider view by API id', () => {
      const page = { content: [aSubscription()], totalElements: 1 }

      const next = subscriptionsReducer(
        initial,
        fetchSubscriptionsForApi.fulfilled({ apiId: 'api-1', page }, 'req-1'),
      )

      expect(selectSubscriptionsByApi('api-1')({ subscriptions: next })).toHaveLength(1)
    })
  })

  describe('subscribeToApi', () => {
    it('appends the new subscription to the caller list', () => {
      const next = subscriptionsReducer(
        initial,
        subscribeToApi.fulfilled(aSubscription({ id: 'sub-2' }), 'req-1'),
      )

      expect(next.mine).toHaveLength(1)
      expect(next.mine[0].id).toBe('sub-2')
    })

    it('does not add anything when the key pool is exhausted (409)', () => {
      const next = subscriptionsReducer(
        initial,
        subscribeToApi.rejected(null, 'req-1', {}, {
          message: 'No API keys are currently available for this API.',
          status: 409,
        }),
      )

      expect(next.mine).toEqual([])
    })
  })

  describe('cancelSubscription', () => {
    it('marks the row CANCELLED in the caller list', () => {
      const state = { ...initial, mine: [aSubscription()] }

      const next = subscriptionsReducer(
        state,
        cancelSubscription.fulfilled({ apiId: 'api-1', subscriptionId: 'sub-1' }, 'req-1'),
      )

      expect(next.mine[0].status).toBe('CANCELLED')
    })

    it('marks the row CANCELLED in the provider view as well', () => {
      const state = { ...initial, byApi: { 'api-1': [aSubscription()] } }

      const next = subscriptionsReducer(
        state,
        cancelSubscription.fulfilled({ apiId: 'api-1', subscriptionId: 'sub-1' }, 'req-1'),
      )

      expect(next.byApi['api-1'][0].status).toBe('CANCELLED')
    })

    it('leaves other rows untouched', () => {
      const state = { ...initial, mine: [aSubscription({ id: 'sub-other', status: 'ACTIVE' })] }

      const next = subscriptionsReducer(
        state,
        cancelSubscription.fulfilled({ apiId: 'api-1', subscriptionId: 'sub-1' }, 'req-1'),
      )

      expect(next.mine[0].status).toBe('ACTIVE')
    })
  })

  describe('clearSubscriptionError', () => {
    it('clears only the error', () => {
      const next = subscriptionsReducer(
        { ...initial, error: 'boom', mine: [aSubscription()] },
        clearSubscriptionError(),
      )

      expect(next.error).toBeNull()
      expect(next.mine).toHaveLength(1)
    })
  })

  describe('selectors', () => {
    it('finds the caller subscription for a specific API', () => {
      const state = { subscriptions: { ...initial, mine: [aSubscription()] } }

      expect(selectMySubscriptionForApi('api-1')(state)?.id).toBe('sub-1')
      expect(selectMySubscriptionForApi('api-unknown')(state)).toBeUndefined()
    })

    it('returns an empty array for an API with no subscribers', () => {
      // Components map over this directly, so undefined would crash the render.
      expect(selectSubscriptionsByApi('never-seen')({ subscriptions: initial })).toEqual([])
    })
  })

  describe('thunk integration', () => {
    it('passes the plan through when subscribing', async () => {
      subscriptionApi.create.mockResolvedValue(aSubscription())

      await subscribeToApi({ apiId: 'api-1', planId: 'plan-9' })(vi.fn(), () => initial, undefined)

      expect(subscriptionApi.create).toHaveBeenCalledWith('api-1', 'plan-9')
    })

    it('normalises a client failure into a rejection payload', async () => {
      subscriptionApi.create.mockRejectedValue(
        Object.assign(new Error('No keys available'), { status: 409 }),
      )

      const result = await subscribeToApi({ apiId: 'api-1' })(vi.fn(), () => initial, undefined)

      expect(subscribeToApi.rejected.match(result)).toBe(true)
      expect(result.payload).toMatchObject({ message: 'No keys available', status: 409 })
    })
  })
})
