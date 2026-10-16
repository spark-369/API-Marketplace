import { describe, it, expect } from 'vitest'
import { screen } from '@testing-library/react'
import Layout from '../../src/components/Layout'
import { renderWithProviders, makeTestStore } from '../utils/renderWithProviders'

/**
 * Tests for the application shell's role-adaptive navigation.
 *
 * The sidebar is how a user discovers what they can do, so whose links appear matters: a provider must
 * not be offered a route the guard would refuse, and an anonymous visitor must not see authenticated
 * destinations at all. This is the frontend half of the authorization presentation story.
 */

function renderLayout(role, isAuthenticated = true) {
  const store = makeTestStore({
    auth: {
      token: isAuthenticated ? 'jwt' : null,
      isAuthenticated,
      user: role
        ? { id: 'u1', email: 'a@b.com', firstName: 'Test', lastName: 'User', role }
        : null,
      status: 'idle',
      error: null,
      fieldErrors: null,
    },
    ui: { toasts: [], modal: null, sidebarOpen: true },
  })

  return renderWithProviders(<Layout />, { route: '/', store })
}

describe('Layout navigation', () => {
  it('always offers the public browse destinations', () => {
    renderLayout(null, false)

    expect(screen.getByRole('link', { name: /api catalog/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /categories/i })).toBeInTheDocument()
  })

  it('shows sign-in and registration to an anonymous visitor', () => {
    renderLayout(null, false)

    expect(screen.getByRole('link', { name: /sign in/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /create account/i })).toBeInTheDocument()
  })

  it('does not offer consume-only links to an anonymous visitor', () => {
    renderLayout(null, false)

    expect(screen.queryByRole('link', { name: /my subscriptions/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /my api keys/i })).not.toBeInTheDocument()
  })

  it('offers the consume group to a developer', () => {
    renderLayout('DEVELOPER')

    expect(screen.getByRole('link', { name: /my subscriptions/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /my api keys/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /api console/i })).toBeInTheDocument()
  })

  it('withholds the consume group from a provider, matching the route guard', () => {
    // Providers publish rather than consume, so presenting these links would offer a dead end.
    renderLayout('PROVIDER')

    expect(screen.queryByRole('link', { name: /my subscriptions/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /api console/i })).not.toBeInTheDocument()
  })

  it('offers the publish group to a provider', () => {
    renderLayout('PROVIDER')

    expect(screen.getByRole('link', { name: /my apis/i })).toBeInTheDocument()
  })

  it('offers administration links to an admin', () => {
    renderLayout('ADMIN')

    expect(screen.getByRole('link', { name: /^users$/i })).toBeInTheDocument()
  })

  it('does not offer administration links to a developer', () => {
    renderLayout('DEVELOPER')

    expect(screen.queryByRole('link', { name: /^users$/i })).not.toBeInTheDocument()
  })

  it('shows the account identity and a sign-out control once authenticated', () => {
    renderLayout('DEVELOPER')

    expect(screen.getByRole('button', { name: /sign out/i })).toBeInTheDocument()
    expect(screen.getByText('DEVELOPER')).toBeInTheDocument()
  })
})
