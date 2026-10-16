import { render } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Provider } from 'react-redux'
import { MemoryRouter } from 'react-router-dom'
import { configureStore } from '@reduxjs/toolkit'
import { rootReducer } from '../../src/store'

/**
 * Test harness helpers.
 *
 * The store is built from the application's own `rootReducer`, so tests exercise the real reducer
 * graph rather than a stub. `MemoryRouter` replaces the browser history, which lets tests assert on
 * navigation without touching `window.location`.
 */

/**
 * Creates an isolated store.
 *
 * @param {object} [preloadedState] partial state, shallow-merged per slice
 */
export function makeTestStore(preloadedState) {
  return configureStore({
    reducer: rootReducer,
    preloadedState,
  })
}

/**
 * Renders a component with the store and router providers it expects.
 *
 * @param {React.ReactNode} ui
 * @param {object} [options]
 * @param {string} [options.route]         initial URL
 * @param {object} [options.preloadedState] state to seed the store with
 * @param {object} [options.store]         an existing store, when a test needs to inspect dispatches
 * @returns the render result plus the store and a `userEvent` instance
 */
export function renderWithProviders(
  ui,
  { route = '/', preloadedState, store = makeTestStore(preloadedState) } = {},
) {
  const user = userEvent.setup()

  const utils = render(
    <Provider store={store}>
      <MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>
    </Provider>,
  )

  return { ...utils, store, user }
}

/**
 * Convenience factory for a populated auth slice.
 */
export function authenticatedState(role = 'DEVELOPER', overrides = {}) {
  return {
    auth: {
      token: 'test-token',
      user: {
        id: 'user-1',
        email: 'test@example.com',
        firstName: 'Test',
        lastName: 'User',
        role,
      },
      isAuthenticated: true,
      status: 'idle',
      error: null,
      fieldErrors: null,
      ...overrides,
    },
  }
}

/**
 * Merges a partial slice state onto the authenticated baseline.
 */
export function stateWithAuth(role, sliceOverrides = {}) {
  const base = authenticatedState(role)
  return {
    ...base,
    ...sliceOverrides,
    auth: { ...base.auth, ...(sliceOverrides.auth ?? {}) },
  }
}
