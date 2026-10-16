import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createClientMock } from '../utils/clientMock'

vi.mock('../../src/api/client', () => createClientMock())

import { apiKeyApi } from '../../src/api/client'

import apiKeysReducer, {
  createKey,
  rotateKey,
  revokeKey,
  deleteKey,
  fetchKeysForApi,
  fetchMyKeys,
  dismissNewKey,
  clearKeyError,
  selectKeysByApi,
  selectMyKeys,
  selectNewlyCreatedKey,
  selectKeyUsage,
} from '../../src/store/apiKeysSlice'

/**
 * Tests for the API-key slice.
 *
 * The plaintext-secret lifecycle is the security-relevant behaviour here: it appears exactly once
 * after create or rotate, and dismissing the reveal must clear it from state so it cannot be read back
 * out of the store.
 */

const initial = apiKeysReducer(undefined, { type: '@@INIT' })

const aKey = (overrides = {}) => ({
  id: 'key-1',
  keyPrefix: 'am_abcd1234',
  status: 'ACTIVE',
  pooled: true,
  apiId: 'api-1',
  ...overrides,
})

const createdPayload = (plaintext = 'am_fullsecret') => ({
  key: aKey(),
  plaintextKey: plaintext,
  warning: 'Store this key securely.',
})

describe('apiKeysSlice', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('createKey', () => {
    it('surfaces the plaintext secret exactly once', () => {
      const next = apiKeysReducer(
        initial,
        createKey.fulfilled({ apiId: 'api-1', created: createdPayload() }, 'req-1'),
      )

      expect(next.newlyCreatedKey.plaintextKey).toBe('am_fullsecret')
    })

    it('adds the key metadata to the per-API list', () => {
      const next = apiKeysReducer(
        initial,
        createKey.fulfilled({ apiId: 'api-1', created: createdPayload() }, 'req-1'),
      )

      expect(next.byApi['api-1']).toHaveLength(1)
      expect(next.byApi['api-1'][0].keyPrefix).toBe('am_abcd1234')
    })

    it('records the failure message when the pool operation is rejected', () => {
      const next = apiKeysReducer(
        initial,
        createKey.rejected(null, 'req-1', {}, { message: 'Not permitted' }),
      )

      expect(next.error).toBe('Not permitted')
      expect(next.newlyCreatedKey).toBeNull()
    })
  })

  describe('dismissNewKey', () => {
    it('clears the plaintext secret from state', () => {
      const withSecret = apiKeysReducer(
        initial,
        createKey.fulfilled({ apiId: 'api-1', created: createdPayload() }, 'req-1'),
      )

      const next = apiKeysReducer(withSecret, dismissNewKey())

      expect(next.newlyCreatedKey).toBeNull()
    })
  })

  describe('rotateKey', () => {
    it('reveals the replacement secret', () => {
      const next = apiKeysReducer(
        initial,
        rotateKey.fulfilled({ apiId: 'api-1', created: createdPayload('am_replacement') }, 'req-1'),
      )

      expect(next.newlyCreatedKey.plaintextKey).toBe('am_replacement')
    })

    it('updates the existing row in place rather than duplicating it', () => {
      const state = { ...initial, byApi: { 'api-1': [aKey()] } }

      const next = apiKeysReducer(
        state,
        rotateKey.fulfilled({ apiId: 'api-1', created: createdPayload() }, 'req-1'),
      )

      expect(next.byApi['api-1']).toHaveLength(1)
      expect(next.byApi['api-1'][0].id).toBe('key-1')
    })
  })

  describe('revokeKey', () => {
    it('reflects the new status in both the provider and owner views', () => {
      const state = { ...initial, byApi: { 'api-1': [aKey()] }, mine: [aKey()] }

      const next = apiKeysReducer(
        state,
        revokeKey.fulfilled({ apiId: 'api-1', key: aKey({ status: 'REVOKED' }) }, 'req-1'),
      )

      expect(next.byApi['api-1'][0].status).toBe('REVOKED')
      expect(next.mine[0].status).toBe('REVOKED')
    })
  })

  describe('deleteKey', () => {
    it('removes the row from both lists', () => {
      const state = { ...initial, byApi: { 'api-1': [aKey()] }, mine: [aKey()] }

      const next = apiKeysReducer(
        state,
        deleteKey.fulfilled({ apiId: 'api-1', keyId: 'key-1' }, 'req-1'),
      )

      expect(next.byApi['api-1']).toEqual([])
      expect(next.mine).toEqual([])
    })
  })

  describe('fetches', () => {
    it('stores keys per API under the API id', () => {
      const page = { content: [aKey()], totalElements: 1 }

      const next = apiKeysReducer(
        initial,
        fetchKeysForApi.fulfilled({ apiId: 'api-1', page }, 'req-1'),
      )

      expect(selectKeysByApi('api-1')({ apiKeys: next })).toHaveLength(1)
    })

    it('stores the caller-owned keys separately', () => {
      const next = apiKeysReducer(initial, fetchMyKeys.fulfilled([aKey()], 'req-1'))

      expect(selectMyKeys({ apiKeys: next })).toHaveLength(1)
    })

    it('reports a failed owner-key fetch', () => {
      const next = apiKeysReducer(
        initial,
        fetchMyKeys.rejected(null, 'req-1', undefined, { message: 'Unauthorised' }),
      )

      expect(next.status).toBe('failed')
      expect(next.error).toBe('Unauthorised')
    })
  })

  describe('clearKeyError', () => {
    it('clears only the error', () => {
      const next = apiKeysReducer({ ...initial, error: 'boom', mine: [aKey()] }, clearKeyError())

      expect(next.error).toBeNull()
      expect(next.mine).toHaveLength(1)
    })
  })

  describe('selectors', () => {
    it('return empty arrays for unknown ids rather than undefined', () => {
      const state = { apiKeys: initial }

      // Components map over these directly, so an undefined would crash the render.
      expect(selectKeysByApi('never-seen')(state)).toEqual([])
      expect(selectKeyUsage('never-seen')(state)).toEqual([])
      expect(selectNewlyCreatedKey(state)).toBeNull()
    })
  })

  describe('thunk integration', () => {
    it('sends the plan binding when provisioning', async () => {
      apiKeyApi.create.mockResolvedValue(createdPayload())

      await createKey({ apiId: 'api-1', payload: { planId: 'plan-9' } })(
        vi.fn(),
        () => initial,
        undefined,
      )

      expect(apiKeyApi.create).toHaveBeenCalledWith('api-1', { planId: 'plan-9' })
    })

    it('propagates a client failure as a rejection payload', async () => {
      apiKeyApi.create.mockRejectedValue(new Error('Pool exhausted'))

      const result = await createKey({ apiId: 'api-1', payload: {} })(
        vi.fn(),
        () => initial,
        undefined,
      )

      expect(createKey.rejected.match(result)).toBe(true)
      expect(result.payload.message).toBe('Pool exhausted')
    })
  })
})
