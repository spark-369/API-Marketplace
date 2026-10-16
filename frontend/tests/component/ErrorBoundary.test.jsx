import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ErrorBoundary from '../../src/components/ErrorBoundary'

/**
 * Tests for the top-level error boundary.
 *
 * React unmounts the whole tree when a render throws, which for an SPA means a blank white page with
 * the error visible only in the console. The boundary exists to turn that into a recoverable screen,
 * so the behaviours asserted here are: a usable UI is shown, the detail is captured for logging, and
 * the user can get back to a working state.
 */

/** Controls whether the probe child throws. */
let shouldThrow = true

function SometimesThrows() {
  if (shouldThrow) {
    throw new Error('Simulated render failure')
  }
  return <p>Recovered content</p>
}

describe('ErrorBoundary', () => {
  beforeEach(() => {
    shouldThrow = true
    // React logs the caught error; silence it so the test output stays readable.
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('renders its children when nothing throws', () => {
    shouldThrow = false

    render(
      <ErrorBoundary>
        <SometimesThrows />
      </ErrorBoundary>,
    )

    expect(screen.getByText('Recovered content')).toBeInTheDocument()
  })

  it('shows a recovery screen instead of a blank page when a child throws', () => {
    render(
      <ErrorBoundary>
        <SometimesThrows />
      </ErrorBoundary>,
    )

    expect(screen.getByRole('heading', { name: /something went wrong/i })).toBeInTheDocument()
  })

  it('surfaces the error message so the failure is diagnosable', () => {
    render(
      <ErrorBoundary>
        <SometimesThrows />
      </ErrorBoundary>,
    )

    expect(screen.getByText('Simulated render failure')).toBeInTheDocument()
  })

  it('reports the error to the onError hook for external logging', () => {
    const onError = vi.fn()

    render(
      <ErrorBoundary onError={onError}>
        <SometimesThrows />
      </ErrorBoundary>,
    )

    expect(onError).toHaveBeenCalled()
    expect(onError.mock.calls[0][0].message).toBe('Simulated render failure')
  })

  it('recovers to working content when the user retries after the fault clears', async () => {
    const user = userEvent.setup()

    render(
      <ErrorBoundary>
        <SometimesThrows />
      </ErrorBoundary>,
    )

    expect(screen.getByRole('heading', { name: /something went wrong/i })).toBeInTheDocument()

    // Clear the fault, then use the in-app retry rather than a full page reload.
    shouldThrow = false
    await user.click(screen.getByRole('button', { name: /try again/i }))

    expect(screen.getByText('Recovered content')).toBeInTheDocument()
  })

  it('offers a reload affordance as a fallback', () => {
    render(
      <ErrorBoundary>
        <SometimesThrows />
      </ErrorBoundary>,
    )

    expect(screen.getByRole('button', { name: /reload/i })).toBeInTheDocument()
  })
})
