import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import { createClientMock } from '../../utils/clientMock'

vi.mock('../../../src/api/client', () => createClientMock())

import { apiKeyApi, gatewayApi, ApiError } from '../../../src/api/client'
import GatewayPage from '../../../src/pages/GatewayPage'
import { renderWithProviders, makeTestStore } from '../../utils/renderWithProviders'

/**
 * Tests for the API console.
 *
 * This page is the only interactive consumer of the gateway, so it exercises three things the rest of
 * the UI cannot: requiring a pasted secret (the platform never re-serves one), surfacing a 429 with its
 * distinct wording, and rendering the upstream response the gateway measured.
 */

const AN_ACTIVE_KEY = {
  id: 'key-1',
  apiId: 'api-1',
  apiName: 'Weather',
  keyPrefix: 'am_abcd1234',
  status: 'ACTIVE',
  pooled: false,
}

const A_SUCCESS = {
  status: 200,
  statusText: 'OK',
  contentType: 'application/json',
  body: '{"temp":18}',
  latencyMs: 142,
  truncated: false,
}

function renderConsole(keys = [AN_ACTIVE_KEY]) {
  apiKeyApi.mine.mockResolvedValue(keys)

  const store = makeTestStore({
    auth: {
      token: 'jwt',
      user: { id: 'u1', role: 'DEVELOPER' },
      isAuthenticated: true,
      status: 'succeeded',
      error: null,
      fieldErrors: null,
    },
    apiKeys: {
      mine: keys,
      byApi: {},
      all: [],
      usage: {},
      status: 'succeeded',
      error: null,
      newlyCreatedKey: null,
    },
  })

  return { ...renderWithProviders(<GatewayPage />, { route: '/gateway', store }), store }
}

/** Fills in a valid request: selects the key and pastes its secret. */
async function prepareRequest(user) {
  await screen.findByRole('option', { name: /Weather/ })
  await user.selectOptions(screen.getByLabelText(/api key/i), 'key-1')
  await user.type(screen.getByLabelText(/key value/i), 'am_realsecret')
}

describe('GatewayPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
  })

  it('shows an empty state when the caller has no active keys', async () => {
    renderConsole([])

    expect(await screen.findByRole('heading', { name: /no active api keys/i })).toBeInTheDocument()
  })

  it('offers the active key in the selector', async () => {
    renderConsole()

    expect(await screen.findByRole('option', { name: /Weather/ })).toBeInTheDocument()
  })

  it('requires a key to be chosen before sending', async () => {
    const { user } = renderConsole()
    await screen.findByRole('option', { name: /Weather/ })

    await user.click(screen.getByRole('button', { name: /send request/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/choose an api key/i)
    expect(gatewayApi.forward).not.toHaveBeenCalled()
  })

  it('requires the pasted secret, because the platform never re-displays it', async () => {
    const { user } = renderConsole()
    await screen.findByRole('option', { name: /Weather/ })

    await user.selectOptions(screen.getByLabelText(/api key/i), 'key-1')
    await user.click(screen.getByRole('button', { name: /send request/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/paste the key value/i)
    expect(gatewayApi.forward).not.toHaveBeenCalled()
  })

  it('sends the request through the gateway with the pasted secret', async () => {
    gatewayApi.forward.mockResolvedValue(A_SUCCESS)
    const { user } = renderConsole()
    await prepareRequest(user)

    await user.type(screen.getByLabelText(/path/i), 'v1/weather')
    await user.click(screen.getByRole('button', { name: /send request/i }))

    await waitFor(() => {
      expect(gatewayApi.forward).toHaveBeenCalledWith('api-1', 'v1/weather', {
        method: 'GET',
        body: undefined,
        apiKey: 'am_realsecret',
      })
    })
  })

  it('renders the status and latency the gateway measured', async () => {
    gatewayApi.forward.mockResolvedValue(A_SUCCESS)
    const { user } = renderConsole()
    await prepareRequest(user)

    await user.click(screen.getByRole('button', { name: /send request/i }))

    expect(await screen.findByText(/200 OK/)).toBeInTheDocument()
    expect(screen.getByText(/142 ms/)).toBeInTheDocument()
  })

  it('pretty-prints a JSON response body', async () => {
    gatewayApi.forward.mockResolvedValue(A_SUCCESS)
    const { user } = renderConsole()
    await prepareRequest(user)

    await user.click(screen.getByRole('button', { name: /send request/i }))

    expect(await screen.findByText(/"temp": 18/)).toBeInTheDocument()
  })

  it('warns when the gateway truncated an oversized response', async () => {
    gatewayApi.forward.mockResolvedValue({ ...A_SUCCESS, body: 'partial', truncated: true })
    const { user } = renderConsole()
    await prepareRequest(user)

    await user.click(screen.getByRole('button', { name: /send request/i }))

    expect(await screen.findByText(/was truncated/i)).toBeInTheDocument()
  })

  it('explains a rate-limit rejection in terms of the plan quota', async () => {
    const { user } = renderConsole()
    await prepareRequest(user)

    // Set the rejection after render so the mount-time fetch is unaffected.
    gatewayApi.forward.mockRejectedValueOnce(new ApiError('Too many requests', 429, null))

    await user.click(screen.getByRole('button', { name: /send request/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/rate limit exceeded for this plan/i)
  })

  it('shows the upstream error for a non-rate-limit failure', async () => {
    const { user } = renderConsole()
    await prepareRequest(user)

    gatewayApi.forward.mockRejectedValueOnce(
      new ApiError('The upstream API could not be reached', 400, null),
    )

    await user.click(screen.getByRole('button', { name: /send request/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/could not be reached/i)
  })

  it('offers a request body field only for methods that carry one', async () => {
    const { user } = renderConsole()
    await screen.findByRole('option', { name: /Weather/ })

    expect(screen.queryByLabelText(/request body/i)).not.toBeInTheDocument()

    await user.selectOptions(screen.getByLabelText(/method/i), 'POST')

    expect(screen.getByLabelText(/request body/i)).toBeInTheDocument()
  })

  it('does not send a body for a DELETE request', async () => {
    gatewayApi.forward.mockResolvedValue(A_SUCCESS)
    const { user } = renderConsole()
    await prepareRequest(user)

    await user.selectOptions(screen.getByLabelText(/method/i), 'DELETE')
    await user.click(screen.getByRole('button', { name: /send request/i }))

    await waitFor(() => {
      expect(gatewayApi.forward).toHaveBeenCalledWith(
        'api-1',
        '',
        expect.objectContaining({ method: 'DELETE', body: undefined }),
      )
    })
  })

  it('never renders the secret back into the DOM after submission', async () => {
    gatewayApi.forward.mockResolvedValue(A_SUCCESS)
    const { user, container } = renderConsole()
    await prepareRequest(user)

    await user.click(screen.getByRole('button', { name: /send request/i }))
    await screen.findByText(/200 OK/)

    // The response view echoes the upstream body, never the credential that produced it.
    expect(container.textContent).not.toContain('am_realsecret')
  })
})
