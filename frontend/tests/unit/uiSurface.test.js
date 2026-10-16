import { describe, it, expect } from 'vitest'
import * as ui from '../../src/components/ui'

/**
 * Guard for the UI component module's export surface.
 *
 * `src/components/ui.jsx` must export components only: mixing in plain functions breaks React Fast
 * Refresh, which the ESLint `react-refresh/only-export-components` rule enforces at lint time. This
 * test pins the runtime half of that contract — every export is a component function, and the
 * formatting helpers live in `src/utils/format.js` where they belong.
 */

describe('ui module surface', () => {
  it('exports the primitives pages depend on', () => {
    const required = [
      'Alert',
      'Badge',
      'ConfirmModal',
      'EmptyState',
      'FieldErrors',
      'Modal',
      'PageHeader',
      'Skeleton',
      'Spinner',
    ]

    for (const name of required) {
      expect(ui[name], `${name} must be exported from components/ui`).toBeDefined()
      expect(typeof ui[name]).toBe('function')
    }
  })

  it('does not re-export the formatting helpers', () => {
    // These belong in utils/format so this module stays component-only for Fast Refresh.
    expect(ui.formatDate).toBeUndefined()
    expect(ui.formatPrice).toBeUndefined()
  })

  it('exports only functions, never plain constants', () => {
    for (const [name, value] of Object.entries(ui)) {
      expect(typeof value, `${name} should be a component function`).toBe('function')
    }
  })
})
