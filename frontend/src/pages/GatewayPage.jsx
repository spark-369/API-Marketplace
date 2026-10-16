import { useEffect, useState } from 'react'
import { gatewayApi } from '../api/client'
import { useAppDispatch, useAppSelector } from '../hooks'
import { fetchMyKeys } from '../store/apiKeysSlice'
import { Alert, Badge, EmptyState, PageHeader, Skeleton } from '../components/ui'

/**
 * Interactive API console.
 *
 * Lets a developer exercise the gateway directly: choose an API they subscribe to, paste the assigned
 * key, set a path and method, and inspect the upstream response. This is the fastest way to verify a
 * subscription end to end without writing client code.
 *
 * The latency and status shown come from the gateway's own measurement, not the browser, so they
 * reflect the upstream round-trip the platform observed.
 */
function GatewayPage() {
  const dispatch = useAppDispatch()

  const keys = useAppSelector((state) => state.apiKeys.mine)
  const keysStatus = useAppSelector((state) => state.apiKeys.status)

  const [selectedKeyId, setSelectedKeyId] = useState('')
  const [apiKeyValue, setApiKeyValue] = useState('')
  const [path, setPath] = useState('')
  const [method, setMethod] = useState('GET')
  const [body, setBody] = useState('')

  const [sending, setSending] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    dispatch(fetchMyKeys())
  }, [dispatch])

  const activeKeys = keys.filter((key) => key.status === 'ACTIVE')
  const selectedKey = activeKeys.find((key) => key.id === selectedKeyId) ?? null

  async function handleSend(event) {
    event.preventDefault()
    setError(null)
    setResult(null)

    if (!selectedKey) {
      setError('Choose an API key first.')
      return
    }
    if (!apiKeyValue.trim()) {
      setError('Paste the key value. The platform never stores or re-displays it.')
      return
    }

    setSending(true)
    try {
      const response = await gatewayApi.forward(selectedKey.apiId, path, {
        method,
        body: method === 'GET' || method === 'DELETE' ? undefined : body || undefined,
        apiKey: apiKeyValue.trim(),
      })
      setResult(response)
    } catch (requestError) {
      setError(
        requestError.isRateLimited
          ? 'Rate limit exceeded for this plan. Wait before retrying.'
          : requestError.message,
      )
    } finally {
      setSending(false)
    }
  }

  return (
    <div>
      <PageHeader
        title="API console"
        description="Send a request through the gateway and inspect the upstream response"
      />

      {keysStatus === 'loading' && <Skeleton className="h-40 w-full" />}

      {keysStatus === 'succeeded' && activeKeys.length === 0 && (
        <EmptyState
          title="No active API keys"
          description="Subscribe to an API to receive a key, then return here to send requests."
        />
      )}

      {activeKeys.length > 0 && (
        <div className="grid gap-6 lg:grid-cols-2">
          <GatewayForm
            activeKeys={activeKeys}
            selectedKeyId={selectedKeyId}
            setSelectedKeyId={setSelectedKeyId}
            apiKeyValue={apiKeyValue}
            setApiKeyValue={setApiKeyValue}
            path={path}
            setPath={setPath}
            method={method}
            setMethod={setMethod}
            body={body}
            setBody={setBody}
            error={error}
            sending={sending}
            onSubmit={handleSend}
          />
          <GatewayResult result={result} sending={sending} />
        </div>
      )}
    </div>
  )
}

/**
 * The request-building form.
 *
 * Split out from the page so the page component stays readable and the form's many controlled inputs
 * are grouped with their own concerns.
 */
function GatewayForm({
  activeKeys,
  selectedKeyId,
  setSelectedKeyId,
  apiKeyValue,
  setApiKeyValue,
  path,
  setPath,
  method,
  setMethod,
  body,
  setBody,
  error,
  sending,
  onSubmit,
}) {
  const bodyAllowed = method !== 'GET' && method !== 'DELETE'

  return (
    <form onSubmit={onSubmit} className="card space-y-4">
      <div>
        <label htmlFor="gw-key" className="mb-1 block text-sm font-medium text-slate-700">
          API key
        </label>
        <select
          id="gw-key"
          className="input"
          value={selectedKeyId}
          onChange={(event) => setSelectedKeyId(event.target.value)}
        >
          <option value="">Select a key…</option>
          {activeKeys.map((key) => (
            <option key={key.id} value={key.id}>
              {key.apiName} · {key.keyPrefix}…
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="gw-secret" className="mb-1 block text-sm font-medium text-slate-700">
          Key value
        </label>
        <input
          id="gw-secret"
          className="input font-mono text-sm"
          type="password"
          value={apiKeyValue}
          onChange={(event) => setApiKeyValue(event.target.value)}
          placeholder="am_…"
          autoComplete="off"
        />
        <p className="mt-1 text-xs text-slate-500">
          Paste the secret you stored when the key was issued; it is never displayed again.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-[8rem_1fr]">
        <div>
          <label htmlFor="gw-method" className="mb-1 block text-sm font-medium text-slate-700">
            Method
          </label>
          <select
            id="gw-method"
            className="input"
            value={method}
            onChange={(event) => setMethod(event.target.value)}
          >
            <option value="GET">GET</option>
            <option value="POST">POST</option>
            <option value="PUT">PUT</option>
            <option value="PATCH">PATCH</option>
            <option value="DELETE">DELETE</option>
          </select>
        </div>

        <div>
          <label htmlFor="gw-path" className="mb-1 block text-sm font-medium text-slate-700">
            Path
          </label>
          <input
            id="gw-path"
            className="input font-mono text-sm"
            value={path}
            onChange={(event) => setPath(event.target.value)}
            placeholder="v1/weather?city=London"
          />
          <p className="mt-1 text-xs text-slate-500">
            Appended to the API's base URL. Leave blank to call the base URL itself.
          </p>
        </div>
      </div>

      {bodyAllowed && (
        <div>
          <label htmlFor="gw-body" className="mb-1 block text-sm font-medium text-slate-700">
            Request body (JSON)
          </label>
          <textarea
            id="gw-body"
            className="input min-h-28 font-mono text-sm"
            value={body}
            onChange={(event) => setBody(event.target.value)}
            placeholder='{"city":"London"}'
          />
        </div>
      )}

      {error && <Alert type="error">{error}</Alert>}

      <button type="submit" className="btn btn-primary w-full" disabled={sending}>
        {sending ? 'Sending…' : 'Send request'}
      </button>
    </form>
  )
}

/**
 * Renders the gateway's response, including the status and latency it reported.
 */
function GatewayResult({ result, sending }) {
  if (sending) {
    return <Skeleton className="h-56 w-full" />
  }

  if (!result) {
    return (
      <div className="card text-sm text-slate-500">
        The upstream response will appear here, including the status the gateway observed and the
        latency it measured.
      </div>
    )
  }

  const tone = result.status < 300 ? 'success' : result.status < 500 ? 'warning' : 'danger'

  return (
    <div className="card">
      <div className="flex flex-wrap items-center gap-3">
        <Badge tone={tone}>
          {result.status} {result.statusText}
        </Badge>
        <span className="text-sm text-slate-500">{result.latencyMs} ms</span>
        {result.contentType && (
          <span className="truncate font-mono text-xs text-slate-400">{result.contentType}</span>
        )}
      </div>

      {result.truncated && (
        <Alert type="warning" className="mt-3">
          The response exceeded the gateway's size limit and was truncated.
        </Alert>
      )}

      <div className="mt-4">
        <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-400">
          Response body
        </p>
        <pre className="max-h-96 overflow-auto rounded bg-slate-900 p-3 font-mono text-xs text-slate-100">
          {formatBody(result.body)}
        </pre>
      </div>
    </div>
  )
}

/**
 * Pretty-prints a JSON body, falling back to the raw text when it is not JSON.
 */
function formatBody(body) {
  if (!body) return '(empty response)'
  try {
    return JSON.stringify(JSON.parse(body), null, 2)
  } catch {
    return body
  }
}

export default GatewayPage
