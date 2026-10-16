import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAppDispatch, useAppSelector } from '../hooks'
import { dismissNewKey, fetchMyKeys } from '../store/apiKeysSlice'
import { Alert, Badge, EmptyState, Modal, PageHeader, Skeleton } from '../components/ui'
import { formatDate } from '../utils/format'

/**
 * Developer view of every API key assigned to them.
 *
 * Keys are displayed as a truncated prefix because the platform never stores or re-serves the
 * plaintext. The one exception is a freshly created key, which the backend returns once — that reveal
 * is handled by a modal that the user must dismiss explicitly.
 */
function MyApiKeysPage() {
  const dispatch = useAppDispatch()

  const keys = useAppSelector((state) => state.apiKeys.mine)
  const status = useAppSelector((state) => state.apiKeys.status)
  const error = useAppSelector((state) => state.apiKeys.error)
  const newlyCreated = useAppSelector((state) => state.apiKeys.newlyCreatedKey)

  useEffect(() => {
    dispatch(fetchMyKeys())
  }, [dispatch])

  return (
    <div>
      <PageHeader
        title="My API keys"
        description="Credentials assigned to you for the APIs you subscribe to"
      />

      <Alert type="info" className="mb-4">
        Keys are shown in truncated form. The full value is displayed once at creation — store it
        securely, because it cannot be retrieved again.
      </Alert>

      {status === 'loading' && (
        <div className="space-y-3">
          {[0, 1].map((index) => (
            <Skeleton key={index} className="h-20 w-full" />
          ))}
        </div>
      )}

      {status === 'failed' && <div className="card text-sm text-red-600">{error}</div>}

      {status === 'succeeded' && keys.length === 0 && (
        <EmptyState
          title="You do not have any API keys yet"
          description="Subscribe to an API to receive a key from its provider's pool."
          action={
            <Link to="/apis" className="btn btn-primary">
              Browse APIs
            </Link>
          }
        />
      )}

      <ul className="space-y-3">
        {keys.map((key) => (
          <li key={key.id} className="card">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-semibold text-slate-900">{key.apiName}</h2>
                  <Badge tone={key.status === 'ACTIVE' ? 'success' : 'danger'}>{key.status}</Badge>
                  {key.planName && <Badge tone="info">{key.planName}</Badge>}
                </div>

                <p className="mt-2 font-mono text-sm text-slate-700">{key.keyPrefix}••••••••</p>

                <dl className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-xs text-slate-500">
                  <div className="flex gap-1">
                    <dt>Expires:</dt>
                    <dd>{key.expiresAt ? formatDate(key.expiresAt, { withTime: false }) : 'Never'}</dd>
                  </div>
                  <div className="flex gap-1">
                    <dt>Last used:</dt>
                    <dd>{key.lastUsedAt ? formatDate(key.lastUsedAt) : 'Never'}</dd>
                  </div>
                </dl>
              </div>

              <div className="flex flex-wrap gap-2">
                <Link to={`/apis/${key.apiId}`} className="btn btn-secondary btn-sm">
                  View API
                </Link>
                <Link to="/gateway" className="btn btn-primary btn-sm">
                  Try it
                </Link>
              </div>
            </div>
          </li>
        ))}
      </ul>

      <NewKeyReveal
        created={newlyCreated}
        onDismiss={() => dispatch(dismissNewKey())}
      />
    </div>
  )
}

/**
 * One-time reveal of a newly minted plaintext key.
 *
 * The value lives only in Redux memory; it is never written to localStorage, so dismissing the dialog
 * is genuinely the last chance to copy it.
 */
function NewKeyReveal({ created, onDismiss }) {
  if (!created) return null

  return (
    <Modal
      open
      title="Your new API key"
      onClose={onDismiss}
      size="md"
      footer={
        <button type="button" className="btn btn-primary" onClick={onDismiss}>
          I have stored it
        </button>
      }
    >
      <Alert type="warning" title="Copy this now">
        {created.warning}
      </Alert>

      <div className="mt-4">
        <p className="mb-1 text-sm font-medium text-slate-700">Key</p>
        <code className="block break-all rounded bg-slate-100 px-3 py-2 font-mono text-sm text-slate-800">
          {created.plaintextKey}
        </code>
      </div>

      <button
        type="button"
        className="btn btn-secondary mt-3"
        onClick={() => navigator.clipboard?.writeText(created.plaintextKey)}
      >
        Copy to clipboard
      </button>
    </Modal>
  )
}

export default MyApiKeysPage
