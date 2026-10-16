import { describe, it, expect } from 'vitest'
import { toQuery } from '../../src/api/client'

/**
 * Tests for the query-string builder.
 *
 * `toQuery` decides which optional filters reach the server. A regression here is silent: the request
 * still succeeds, it just returns the wrong (unfiltered) data, so the behaviour is pinned explicitly.
 *
 * This duplicated a case in `client.test.js`; it lives here so the helper's contract is covered even
 * if that larger file is reorganised.
 */

describe('toQuery', () => {
  it('returns an empty string for an empty parameter set', () => {
    expect(toQuery({})).toBe('')
    expect(toQuery()).toBe('')
  })

  it('omits null, undefined and empty-string values', () => {
    expect(toQuery({ a: null, b: undefined, c: '', keep: 'yes' })).toBe('?keep=yes')
  })

  it('preserves falsy values that are meaningful', () => {
    // `0` and `false` are legitimate filter values and must not be dropped.
    expect(toQuery({ page: 0, active: false })).toBe('?page=0&active=false')
  })

  it('encodes reserved characters', () => {
    expect(toQuery({ search: 'weather api' })).toBe('?search=weather+api')
  })

  it('joins multiple parameters', () => {
    expect(toQuery({ page: 1, size: 20 })).toBe('?page=1&size=20')
  })
})
