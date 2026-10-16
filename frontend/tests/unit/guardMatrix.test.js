import { describe, it, expect } from 'vitest'
import { screen } from '@testing-library/react'
import { Route, Routes } from 'react-router-dom'
import ProtectedRoute from '../../src/components/ProtectedRoute'
import { renderWithProviders, makeTestStore } from '../utils/renderWithProviders'

/**
 * Unit-level coverage for the route guard's role combinations.
 *
 * The component test file exercises the same guard through realistic routes; this file enumerates the
 * combinations directly so a change to the allow/deny logic fails in one obvious place.
 */

function renderGuard({ role, isAuthenticated = true, roles, denyRoles }) {
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
      <Route
        path="/protected"
        element={
          <ProtectedRoute roles={roles} denyRoles={denyRoles}>
            <p>Protected content</p>
          </ProtectedRoute>
        }
      />
    </Routes>,
    { route: '/protected', store },
  )
}

describe('ProtectedRoute role combinations', () => {
  it('redirects an anonymous visitor to login', () => {
    renderGuard({ isAuthenticated: false, role: null })

    expect(screen.getByText('Login page')).toBeInTheDocument()
    expect(screen.queryByText('Protected content')).not.toBeInTheDocument()
  })

  it('permits a role present in the allow-list', () => {
    renderGuard({ role: 'ADMIN', roles: ['PROVIDER', 'ADMIN'] })

    expect(screen.getByText('Protected content')).toBeInTheDocument()
  })

  it('refuses an allow-listed role that is also denied', () => {
    renderGuard({ role: 'PROVIDER', roles: ['PROVIDER', 'ADMIN'], denyRoles: ['PROVIDER'] })

    expect(screen.queryByText('Protected content')).not.toBeInTheDocument()
  })

  it('permits a role that is neither allow-listed nor denied when only denyRoles is set', () => {
    renderGuard({ role: 'DEVELOPER', denyRoles: ['PROVIDER'] })

    expect(screen.getByText('Protected content')).toBeInTheDocument()
  })

  it('renders children when no constraint is given', () => {
    renderGuard({ role: 'DEVELOPER' })

    expect(screen.getByText('Protected content')).toBeInTheDocument()
  })
})
