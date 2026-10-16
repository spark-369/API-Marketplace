import { describe, it, expect } from 'vitest'
import { formatDate, formatPrice } from '../../src/utils/format'

/**
 * Tests for the display formatters.
 *
 * Both are called unconditionally from tables and cards, so the interesting cases are the degenerate
 * inputs — null, undefined and unparseable strings — where a naive implementation renders "Invalid
 * Date" or "NaN" into the UI.
 */

describe('formatDate', () => {
  it('renders an em dash for missing values', () => {
    expect(formatDate(null)).toBe('—')
    expect(formatDate(undefined)).toBe('—')
    expect(formatDate('')).toBe('—')
    expect(formatDate(0)).toBe('—')
  })

  it('renders an em dash for an unparseable value', () => {
    expect(formatDate('not-a-date')).toBe('—')
  })

  it('formats a valid ISO timestamp', () => {
    const formatted = formatDate('2026-03-15T10:30:00')

    expect(formatted).toContain('2026')
    expect(formatted).toContain('Mar')
    expect(formatted).toContain('15')
  })

  it('includes the time by default and omits it when asked', () => {
    expect(formatDate('2026-03-15T10:30:00')).toMatch(/:/)
    expect(formatDate('2026-03-15T10:30:00', { withTime: false })).not.toMatch(/:/)
  })
})

describe('formatPrice', () => {
  it('labels zero as Free', () => {
    expect(formatPrice(0)).toBe('Free')
    expect(formatPrice('0')).toBe('Free')
    expect(formatPrice(null)).toBe('Free')
    expect(formatPrice(undefined)).toBe('Free')
  })

  it('formats a positive amount as currency', () => {
    expect(formatPrice(49.99)).toContain('49.99')
  })

  it('treats a non-numeric value as free rather than rendering NaN', () => {
    expect(formatPrice('garbage')).toBe('Free')
  })
})
