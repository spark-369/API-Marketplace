import { describe, it, expect, vi } from 'vitest'
import { renderHook, screen } from '@testing-library/react'
import { Provider } from 'react-redux'
import { renderWithProviders, makeTestStore } from '../utils/renderWithProviders'
import { useAppDispatch, useAppSelector } from '../../src/hooks'

/**
 * Tests for the Redux accessor hooks.
 *
 * These wrappers are trivial, so the value of testing them is contract rather than logic: if someone
 * swaps them for a different store or drops the selector pass-through, every component in the
 * application breaks at once. Pinning the behaviour here localises that failure.
 */

function wrapperFor(store) {
  return function Wrapper({ children }) {
    return <Provider store={store}>{children}</Provider>
  }
}

describe('useAppDispatch', () => {
  it('returns the store dispatch function', () => {
    const store = makeTestStore()

    const { result } = renderHook(() => useAppDispatch(), { wrapper: wrapperFor(store) })

    expect(result.current).toBe(store.dispatch)
  })
})

describe('useAppSelector', () => {
  it('reads state through the supplied selector', () => {
    const store = makeTestStore({
      ui: { toasts: [], modal: 'open-thing', sidebarOpen: true },
    })

    const { result } = renderHook(() => useAppSelector((state) => state.ui.modal), {
      wrapper: wrapperFor(store),
    })

    expect(result.current).toBe('open-thing')
  })

  it('reflects changes dispatched after render', async () => {
    const store = makeTestStore()
    const { result } = renderHook(() => useAppSelector((state) => state.ui.sidebarOpen), {
      wrapper: wrapperFor(store),
    })

    expect(result.current).toBe(false)

    store.dispatch({ type: 'ui/toggleSidebar' })

    // React re-runs the selector as the store notifies subscribers.
    await vi.waitFor(() => expect(result.current).toBe(true))
  })
})

describe('provider wiring', () => {
  it('works through the shared test harness, matching how pages consume it', () => {
    function Probe() {
      const open = useAppSelector((state) => state.ui.sidebarOpen)
      return <p>{open ? 'open' : 'closed'}</p>
    }

    renderWithProviders(<Probe />, {
      preloadedState: { ui: { toasts: [], modal: null, sidebarOpen: true } },
    })

    expect(screen.getByText('open')).toBeInTheDocument()
  })
})
