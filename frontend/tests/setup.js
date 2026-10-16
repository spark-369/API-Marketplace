import '@testing-library/jest-dom/vitest'
import { afterEach, beforeEach, vi } from 'vitest'
import { cleanup } from '@testing-library/react'

/**
 * Global test setup.
 *
 * Two things happen here: DOM matchers are registered, and every test starts from a clean slate.
 * Clearing localStorage in particular matters because `authSlice` reads it at module initialisation —
 * a leaked token from one test would silently authenticate the next one.
 */

// jsdom does not implement matchMedia, which the responsive sidebar depends on.
if (!window.matchMedia) {
  window.matchMedia = (query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })
}

// jsdom does not implement ResizeObserver either.
if (!window.ResizeObserver) {
  window.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
}

beforeEach(() => {
  localStorage.clear()
})

afterEach(() => {
  cleanup()
  localStorage.clear()
  vi.clearAllMocks()
  vi.restoreAllMocks()
  vi.useRealTimers()
})
