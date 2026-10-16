import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen } from '@testing-library/react'
import { Route, Routes } from 'react-router-dom'
import { createClientMock } from '../utils/clientMock'

vi.mock('../../src/api/client', () => createClientMock())

import { apiApi } from '../../src/api/client'
import ManageApiShell from '../../src/components/ManageApiShell'
import { renderWithProviders, makeTestStore } from '../utils/renderWithProviders'

/**
 * Tests for the shared provider-management shell.
 *
 * The shell resolves the API from the route rather than from component state, which is what lets a
 * management page survive a refresh. Two consequences are worth pinning: an in-flight load shows a
 * skeleton rather than an empty page, and a failed load explains itself instead of rendering the child
 * view against missing data.
 */

function renderShell({ route = '/apis/api-1/plans', current = null, currentStatus = 'succeeded' }) {
  const store = makeTestStore({
    auth: {
      token: 'jwt',
      isAuthenticated: true,
      user: { id: 'u1', role: 'PROVIDER' },
      status: 'idle',
      error: null,
      fieldErrors: null,
    },
    apis: {
      items: [],
      mine: [],
      current,
      status: 'idle',
      mineStatus: 'idle',
      currentStatus,
      error: currentStatus === 'failed' ? 'API not found' : null,
      lastSaved: null,
    },
  })

  return {
    ...renderWithProviders(
      <Routes>
        <Route
          path="/apis/:apiId/plans"
          element={
            <ManageApiShell title="Plans" description="Pricing tiers">
              <p>Managed content</p>
            </ManageApiShell>
          }
        />
        <Route
          path="/manage/plans"
          element={
            <ManageApiShell title="Plans" description="Pricing tiers">
              <p>Managed content</p>
            </ManageApiShell>
          }
        />
      </Routes>,
      { route, store },
    ),
    store,
  }
}

const anApi = { id: 'api-1', name: 'Weather', slug: 'weather' }

describe('ManageApiShell', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('loads the API named in the route', () => {
    apiApi.get.mockResolvedValue(anApi)

    renderShell({ route: '/apis/api-1/plans' })

    expect(apiApi.get).toHaveBeenCalledWith('api-1')
  })

  it('renders the titled header and the child content once loaded', () => {
    apiApi.get.mockResolvedValue(anApi)

    renderShell({ route: '/apis/api-1/plans', current: anApi })

    expect(screen.getByRole('heading', { level: 1, name: /plans/i })).toBeInTheDocument()
    expect(screen.getByText('Managed content')).toBeInTheDocument()
  })

  it('names the API in the description so the user knows the context', () => {
    apiApi.get.mockResolvedValue(anApi)

    renderShell({ route: '/apis/api-1/plans', current: anApi })

    expect(screen.getByText(/Weather/)).toBeInTheDocument()
  })

  it('does not render the child content while the API is still loading', () => {
    apiApi.get.mockReturnValue(new Promise(() => {}))

    renderShell({ route: '/apis/api-1/plans', currentStatus: 'loading' })

    // A management view rendered before its API resolves would show an empty, misleading table.
    expect(screen.queryByText('Managed content')).not.toBeInTheDocument()
  })

  it('explains a failed load rather than rendering the child against no data', () => {
    apiApi.get.mockRejectedValue(new Error('API not found'))

    renderShell({ route: '/apis/api-1/plans', currentStatus: 'failed' })

    expect(screen.getByRole('alert')).toHaveTextContent(/unable to load this api/i)
    expect(screen.queryByText('Managed content')).not.toBeInTheDocument()
  })

  it('prompts the user to pick an API when the route carries no id', () => {
    renderShell({ route: '/manage/plans' })

    expect(screen.getByText(/no api selected/i)).toBeInTheDocument()
    expect(apiApi.get).not.toHaveBeenCalled()
  })
})
