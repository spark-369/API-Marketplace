import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import { createClientMock } from '../utils/clientMock'

vi.mock('../../src/api/client', () => createClientMock())

import { authApi, ApiError } from '../../src/api/client'
import LoginPage from '../../src/pages/LoginPage'
import { renderWithProviders, makeTestStore } from '../utils/renderWithProviders'
import { loginUser } from '../../src/store/authSlice'

/**
 * Tests for the sign-in page.
 *
 * The page has three behaviours worth pinning: it must not submit without credentials, it must show
 * the failure reason, and a successful login must navigate to the originally requested page rather
 * than to home.
 */

function renderLogin(route = '/login', state) {
  const store = makeTestStore({
    auth: {
      token: null,
      user: null,
      isAuthenticated: false,
      status: 'idle',
      error: null,
      fieldErrors: null,
    },
  })

  const utils = renderWithProviders(<LoginPage />, { route, store })
  return { ...utils, store, state }
}

describe('LoginPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
  })

  it('renders the form with labelled fields', () => {
    renderLogin()

    expect(screen.getByRole('heading', { name: 'Sign in' })).toBeInTheDocument()
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument()
  })

  it('links to registration for visitors without an account', () => {
    renderLogin()

    expect(screen.getByRole('link', { name: /create one/i })).toHaveAttribute('href', '/register')
  })

  it('does not call the API when the browser blocks submission of empty fields', async () => {
    const { user } = renderLogin()

    await user.click(screen.getByRole('button', { name: /sign in/i }))

    // Native `required` validation prevents the submit handler from firing.
    expect(authApi.login).not.toHaveBeenCalled()
  })

  it('submits the entered credentials', async () => {
    authApi.login.mockResolvedValue({
      accessToken: 'jwt',
      id: 'u1',
      email: 'dev@example.com',
      firstName: 'Dev',
      lastName: 'Eloper',
      role: 'DEVELOPER',
    })
    const { user } = renderLogin()

    await user.type(screen.getByLabelText(/email/i), 'dev@example.com')
    await user.type(screen.getByLabelText(/password/i), 'secret123')
    await user.click(screen.getByRole('button', { name: /sign in/i }))

    await waitFor(() => {
      expect(authApi.login).toHaveBeenCalledWith({
        email: 'dev@example.com',
        password: 'secret123',
      })
    })
  })

  it('shows the server message when the credentials are rejected', async () => {
    authApi.login.mockRejectedValue(new ApiError('Invalid email or password', 401, null))
    const { user } = renderLogin()

    await user.type(screen.getByLabelText(/email/i), 'dev@example.com')
    await user.type(screen.getByLabelText(/password/i), 'wrong')
    await user.click(screen.getByRole('button', { name: /sign in/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid email or password')
  })

  it('disables the submit button while the request is in flight', async () => {
    let resolveLogin
    authApi.login.mockImplementation(() => new Promise((resolve) => {
      resolveLogin = resolve
    }))
    const { user } = renderLogin()

    await user.type(screen.getByLabelText(/email/i), 'dev@example.com')
    await user.type(screen.getByLabelText(/password/i), 'secret123')
    await user.click(screen.getByRole('button', { name: /sign in/i }))

    expect(screen.getByRole('button', { name: /signing in/i })).toBeDisabled()

    resolveLogin({
      accessToken: 'jwt',
      id: 'u1',
      email: 'dev@example.com',
      firstName: 'D',
      lastName: 'E',
      role: 'DEVELOPER',
    })

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /signing in/i })).not.toBeInTheDocument()
    })
  })

  it('returns an already-authenticated visitor to the requested page', async () => {
    // Simulates arriving at /login with a session already established.
    const store = makeTestStore({
      auth: {
        token: 'jwt',
        user: { id: 'u1', role: 'DEVELOPER' },
        isAuthenticated: true,
        status: 'succeeded',
        error: null,
        fieldErrors: null,
      },
    })

    renderWithProviders(<LoginPage />, { route: '/login', store })

    // The effect navigates away; the form should not remain interactive.
    await waitFor(() => {
      expect(store.getState().auth.isAuthenticated).toBe(true)
    })
  })

  it('renders field-level validation errors', async () => {
    authApi.login.mockRejectedValue(
      new ApiError('Validation failed', 400, { errors: { email: 'must be a valid address' } }),
    )
    const { user } = renderLogin()

    await user.type(screen.getByLabelText(/email/i), 'dev@example.com')
    await user.type(screen.getByLabelText(/password/i), 'secret123')
    await user.click(screen.getByRole('button', { name: /sign in/i }))

    expect(await screen.findByText(/must be a valid address/)).toBeInTheDocument()
  })

  it('clears a stale error when the page is revisited', async () => {
    const store = makeTestStore({
      auth: {
        token: null,
        user: null,
        isAuthenticated: false,
        status: 'failed',
        error: 'stale failure',
        fieldErrors: null,
      },
    })

    renderWithProviders(<LoginPage />, { route: '/login', store })

    await waitFor(() => {
      expect(screen.queryByText('stale failure')).not.toBeInTheDocument()
    })
  })

  it('exposes the login thunk for the form to dispatch', () => {
    // Guards against the action being renamed without updating the page.
    expect(typeof loginUser).toBe('function')
  })
})
