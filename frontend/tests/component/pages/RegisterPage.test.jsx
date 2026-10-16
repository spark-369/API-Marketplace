import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import { createClientMock } from '../../utils/clientMock'

vi.mock('../../../src/api/client', () => createClientMock())

import { authApi, ApiError } from '../../../src/api/client'
import RegisterPage from '../../../src/pages/RegisterPage'
import { renderWithProviders, makeTestStore } from '../../utils/renderWithProviders'

/**
 * Tests for the registration page.
 *
 * The role selector is the interesting part: registration offers DEVELOPER and PROVIDER but never
 * ADMIN, and that must hold in the UI as well as on the server. The remaining cases cover the
 * validation feedback a new user actually sees.
 */

function renderRegister() {
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

  return { ...renderWithProviders(<RegisterPage />, { route: '/register', store }), store }
}

describe('RegisterPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
  })

  it('renders the form with labelled fields', () => {
    renderRegister()

    expect(screen.getByRole('heading', { name: /create your account/i })).toBeInTheDocument()
    expect(screen.getByLabelText(/first name/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/last name/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument()
  })

  it('offers developer and provider but never admin', () => {
    renderRegister()

    expect(screen.getByRole('radio', { name: /developer/i })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /provider/i })).toBeInTheDocument()
    // ADMIN is not self-grantable; the backend rejects it on this endpoint too.
    expect(screen.queryByRole('radio', { name: /admin/i })).not.toBeInTheDocument()
  })

  it('defaults to the developer role', () => {
    renderRegister()

    expect(screen.getByRole('radio', { name: /developer/i })).toBeChecked()
  })

  it('documents the password requirements rather than failing opaquely', () => {
    renderRegister()

    expect(screen.getByText(/at least 8 characters/i)).toBeInTheDocument()
  })

  it('submits the selected role along with the credentials', async () => {
    authApi.register.mockResolvedValue({
      accessToken: 'jwt',
      id: 'u1',
      email: 'p@example.com',
      firstName: 'Pro',
      lastName: 'Vider',
      role: 'PROVIDER',
    })
    const { user } = renderRegister()

    await user.type(screen.getByLabelText(/first name/i), 'Pro')
    await user.type(screen.getByLabelText(/last name/i), 'Vider')
    await user.type(screen.getByLabelText(/email/i), 'p@example.com')
    await user.type(screen.getByLabelText(/password/i), 'secret123')
    await user.click(screen.getByRole('radio', { name: /provider/i }))
    await user.click(screen.getByRole('button', { name: /create account/i }))

    await waitFor(() => {
      expect(authApi.register).toHaveBeenCalledWith({
        firstName: 'Pro',
        lastName: 'Vider',
        email: 'p@example.com',
        password: 'secret123',
        role: 'PROVIDER',
      })
    })
  })

  it('shows the conflict message when the email is already registered', async () => {
    authApi.register.mockRejectedValue(
      new ApiError('An account with that email already exists', 409, null),
    )
    const { user } = renderRegister()

    await user.type(screen.getByLabelText(/first name/i), 'Test')
    await user.type(screen.getByLabelText(/last name/i), 'User')
    await user.type(screen.getByLabelText(/email/i), 'taken@example.com')
    await user.type(screen.getByLabelText(/password/i), 'secret123')
    await user.click(screen.getByRole('button', { name: /create account/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/already exists/i)
  })

  it('renders field-level validation errors from the server', async () => {
    authApi.register.mockRejectedValue(
      new ApiError('Validation failed', 400, { errors: { email: 'must be a valid address' } }),
    )
    const { user } = renderRegister()

    await user.type(screen.getByLabelText(/first name/i), 'Test')
    await user.type(screen.getByLabelText(/last name/i), 'User')
    await user.type(screen.getByLabelText(/email/i), 'bad@example.com')
    await user.type(screen.getByLabelText(/password/i), 'secret123')
    await user.click(screen.getByRole('button', { name: /create account/i }))

    expect(await screen.findByText(/must be a valid address/)).toBeInTheDocument()
  })

  it('links to sign-in for visitors who already have an account', () => {
    renderRegister()

    expect(screen.getByRole('link', { name: /sign in/i })).toHaveAttribute('href', '/login')
  })

  it('disables submission while the request is in flight', async () => {
    let resolveRegister
    authApi.register.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveRegister = resolve
        }),
    )
    const { user } = renderRegister()

    await user.type(screen.getByLabelText(/first name/i), 'Test')
    await user.type(screen.getByLabelText(/last name/i), 'User')
    await user.type(screen.getByLabelText(/email/i), 'new@example.com')
    await user.type(screen.getByLabelText(/password/i), 'secret123')
    await user.click(screen.getByRole('button', { name: /create account/i }))

    expect(screen.getByRole('button', { name: /creating account/i })).toBeDisabled()

    resolveRegister({
      accessToken: 'jwt',
      id: 'u1',
      email: 'new@example.com',
      firstName: 'T',
      lastName: 'U',
      role: 'DEVELOPER',
    })

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: /creating account/i })).not.toBeInTheDocument()
    })
  })
})
