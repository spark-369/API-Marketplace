import { describe, it, expect } from 'vitest'
import { rootReducer } from '../../src/store'

/**
 * Guard for the root reducer's slice wiring.
 *
 * A slice missing from `rootReducer` produces the worst possible failure mode: selectors read
 * `undefined`, components render empty, and no error is thrown. Asserting the key set here turns that
 * into an immediate, obvious test failure.
 */

describe('root reducer wiring', () => {
  const EXPECTED_SLICES = [
    'auth',
    'apis',
    'categories',
    'plans',
    'reviews',
    'subscriptions',
    'apiKeys',
    'users',
    'ui',
  ]

  it('registers every domain slice', () => {
    for (const slice of EXPECTED_SLICES) {
      expect(rootReducer[slice], `${slice} is missing from rootReducer`).toBeDefined()
      expect(typeof rootReducer[slice]).toBe('function')
    }
  })

  it('registers nothing unexpected', () => {
    expect(Object.keys(rootReducer).sort()).toEqual([...EXPECTED_SLICES].sort())
  })
})
