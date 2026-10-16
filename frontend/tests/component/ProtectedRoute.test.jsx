import { describe, it, expect } from 'vitest'
import { screen } from '@testing-library/react'
import { Route, Routes } from 'react-router-dom'
import ProtectedRoute from '../../src/components/ProtectedRoute'
import { renderWithProviders, makeTestStore } from '../utils/renderWithProviders'

/**
 * Tests for the route guard.
 *
 * This is the frontend half of the authorization story, so the cases are enumerated by role rather
 * than sampled. Note that the guard is a usability measure only — the backend enforces the same rules
 * independently, which is why a 403 is still possible from the API.
 */

function renderGuard({ role, isAuthenticated = true, roles, denyRoles, route = '/protected' }) {
  const store = makeTestStore({
    auth: {
      token: isAuthenticated ? 'jwt' : null,
      isAuthenticated,
      user: role ? { id: 'u1', email: 'a@b.com', role } : null,
      status: 'idle',
      error: null,
      fieldErrors: null,
    },
  })

  return renderWithProviders(
    <Routes>
      <Route path="/login" element={<p>Login page</p>} />
      <Route path="/" element={<p>Home page</p>} />
      <Route
        path="/protected"
        element={
          <ProtectedRoute roles={roles} denyRoles={denyRoles}>
            <p>Protected content</p>
          </ProtectedRoute>
        }
      />
    </Routes>,
    { route, store },
  )
}

describe('ProtectedRoute', () => {
  describe('authentication', () => {
    it('renders the content for an authenticated user', () => {
      renderGuard({ role: 'DEVELOPER' })

      expect(screen.getByText('Protected content')).toBeInTheDocument()
    })

    it('redirects an anonymous visitor to the login page', () => {
      renderGuard({ isAuthenticated: false })

      expect(screen.getByText('Login page')).toBeInTheDocument()
      expect(screen.queryByText('Protected content')).not.toBeInTheDocument()
    })

    it('does not render the protected content while redirecting', () => {
      renderGuard({ isAuthenticated: false, role: null })

      expect(screen.queryByText('Protected content')).not.toBeInTheDocument()
    })
  })

  describe('allow-list (roles)', () => {
    it('permits a role present in the list', () => {
      renderGuard({ role: 'ADMIN', roles: ['PROVIDER', 'ADMIN'] })

      expect(screen.getByText('Protected content')).toBeInTheDocument()
    })

    it('refuses a role absent from the list', () => {
      renderGuard({ role: 'DEVELOPER', roles: ['PROVIDER', 'ADMIN'] })

      expect(screen.queryByText('Protected content')).not.toBeInTheDocument()
      expect(screen.getByRole('heading', { name: /not available for your account/i })).toBeInTheDocument()
    })

    it('keeps the URL rather than redirecting, so the reason is visible', () => {
      renderGuard({ role: 'DEVELOPER', roles: ['ADMIN'] })

      // A redirect would silently move the user; refusing in place explains the situation.
      expect(screen.getByRole('heading', { name: /not available/i })).toBeInTheDocument()
    })
  })

  describe('deny-list (denyRoles)', () => {
    it('refuses an explicitly denied role', () => {
      renderGuard({ role: 'PROVIDER', denyRoles: ['PROVIDER'] })

      expect(screen.queryByText('Protected content')).not.toBeInTheDocument()
      expect(screen.getByRole('heading', { name: /not available/i })).toBeInTheDocument()
    })

    it('permits any role not on the deny-list', () => {
      renderGuard({ role: 'DEVELOPER', denyRoles: ['PROVIDER'] })

      expect(screen.getByText('Protected content')).toBeInTheDocument()
    })

    it('permits an admin even when a deny-list is present', () => {
      renderGuard({ role: 'ADMIN', denyRoles: ['PROVIDER'] })

      expect(screen.getByText('Protected content')).toBeInTheDocument()
    })
  })

  describe('combined constraints', () => {
    it('requires both the allow-list and the deny-list to pass', () => {
      renderGuard({ role: 'PROVIDER', roles: ['PROVIDER', 'ADMIN'], denyRoles: ['PROVIDER'] })

      // Allow-listed but explicitly denied: denial wins.
      expect(screen.queryByText('Protected content')).not.toBeInTheDocument()
    })
  })

  describe('defaults', () => {
    it('renders children when neither constraint is given', () => {
      renderGuard({ role: 'DEVELOPER' })

      expect(screen.getByText('Protected content')).toBeInTheDocument()
    })
  })
})
