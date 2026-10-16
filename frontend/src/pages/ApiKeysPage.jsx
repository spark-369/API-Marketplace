import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useAppDispatch, useAppSelector } from '../hooks'
import {
  createKey,
  deleteKey,
  dismissNewKey,
  fetchKeysForApi,
  fetchKeyUsage,
  revokeKey,
  rotateKey,
  selectKeyUsage,
  selectKeyUsageError,
  selectKeyUsageStatus,
  selectKeysByApi,
  selectNewlyCreatedKey,
} from '../store/apiKeysSlice'
import { fetchPlansForApi, selectPlansByApi } from '../store/plansSlice'
import ManageApiShell from '../components/ManageApiShell'
import { Alert, Badge, ConfirmModal, EmptyState, Modal, Skeleton } from '../components/ui'
import { formatDate } from '../utils/format'

/**
 * Provider key-pool management for one API.
 *
 * The table deliberately shows pooled and assigned keys together: a provider needs to see at a glance
 * how much spare capacity they have, and an unassigned key is precisely what makes a new subscription
 * succeed rather than fail with a conflict.
 */
function ApiKeysPage() {
  const { apiId } = useParams()
  const dispatch = useAppDispatch()

  const keys = useAppSelector(selectKeysByApi(apiId))
  const plans = useAppSelector(selectPlansByApi(apiId))
  const newlyCreated = useAppSelector(selectNewlyCreatedKey)
  const error = useAppSelector((state) => state.apiKeys.error)

  const [creating, setCreating] = useState(false)
  const [revoking, setRevoking] = useState(null)
  const [rotating, setRotating] = useState(null)
  const [deleting, setDeleting] = useState(null)
  const [inspecting, setInspecting] = useState(null)
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!apiId) return
    setLoading(true)
    dispatch(fetchKeysForApi({ apiId, params: { size: 50 } })).finally(() => setLoading(false))
    dispatch(fetchPlansForApi(apiId))
  }, [dispatch, apiId])

  const pooledCount = keys.filter((key) => key.pooled).length
  const activeCount = keys.filter((key) => key.status === 'ACTIVE').length

  // Resolving the usage rows here (rather than inside the modal) keeps hook calls at the top level
  // of the component, where React's rules of hooks require them.
  const inspectedUsage = useAppSelector(selectKeyUsage(inspecting?.id))
  const inspectedUsageStatus = useAppSelector(selectKeyUsageStatus(inspecting?.id))
  const inspectedUsageError = useAppSelector(selectKeyUsageError(inspecting?.id))

  async function handleCreate(event) {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)
    const planId = formData.get('planId')
    const expiresAt = formData.get('expiresAt')

    setBusy(true)
    await dispatch(
      createKey({
        apiId,
        payload: {
          name: formData.get('name') || null,
          planId: planId || null,
          expiresAt: expiresAt ? `${expiresAt}T23:59:59` : null,
        },
      }),
    )
    setBusy(false)
    setCreating(false)
  }

  async function handleRotate() {
    setBusy(true)
    await dispatch(rotateKey({ apiId, keyId: rotating.id, payload: {} }))
    setBusy(false)
    setRotating(null)
  }

  async function handleRevoke() {
    setBusy(true)
    await dispatch(revokeKey({ apiId, keyId: revoking.id }))
    setBusy(false)
    setRevoking(null)
  }

  async function handleDelete() {
    setBusy(true)
    await dispatch(deleteKey({ apiId, keyId: deleting.id }))
    setBusy(false)
    setDeleting(null)
  }

  return (
    <ManageApiShell title="API keys" description="Credential pool and assignments">
      <KeyToolbar
        pooledCount={pooledCount}
        activeCount={activeCount}
        total={keys.length}
        onCreate={() => setCreating(true)}
      />

      {error && (
        <Alert type="error" className="mb-4">
          {error}
        </Alert>
      )}

      {pooledCount === 0 && !loading && keys.length > 0 && (
        <Alert type="warning" className="mb-4" title="Pool is empty">
          New subscriptions to this API will be rejected with a conflict until you provision more keys.
        </Alert>
      )}

      {loading && (
        <div className="space-y-3">
          {[0, 1, 2].map((index) => (
            <Skeleton key={index} className="h-16 w-full" />
          ))}
        </div>
      )}

      {!loading && keys.length === 0 && (
        <EmptyState
          title="No keys provisioned"
          description="Create a key pool so developers can subscribe and receive credentials."
          action={
            <button type="button" className="btn btn-primary" onClick={() => setCreating(true)}>
              Provision your first key
            </button>
          }
        />
      )}

      {keys.length > 0 && (
        <KeyTable
          keys={keys}
          onUsage={(key) => {
            setInspecting(key)
            dispatch(fetchKeyUsage({ apiId, keyId: key.id }))
          }}
          onRotate={setRotating}
          onRevoke={setRevoking}
          onDelete={setDeleting}
        />
      )}

      <NewKeyReveal created={newlyCreated} onDismiss={() => dispatch(dismissNewKey())} />

      <CreateKeyModal
        open={creating}
        plans={plans}
        busy={busy}
        onClose={() => setCreating(false)}
        onSubmit={handleCreate}
      />

      <UsageModal
        apiKey={inspecting}
        usage={inspectedUsage}
        status={inspectedUsageStatus}
        error={inspectedUsageError}
        onClose={() => setInspecting(null)}
      />

      <ConfirmModal
        open={Boolean(rotating)}
        title="Rotate this key?"
        message="A new secret is issued immediately and the previous value stops working. Any client still using the old key will start failing."
        confirmLabel="Rotate key"
        destructive={false}
        onConfirm={handleRotate}
        onCancel={() => setRotating(null)}
        busy={busy}
      />

      <ConfirmModal
        open={Boolean(revoking)}
        title="Revoke this key?"
        message="Revocation is permanent. A revoked key cannot be reactivated — issue a new one instead."
        confirmLabel="Revoke key"
        onConfirm={handleRevoke}
        onCancel={() => setRevoking(null)}
        busy={busy}
      />

      <ConfirmModal
        open={Boolean(deleting)}
        title="Delete this key record?"
        message="Deleting removes the key and its usage history. Revoking is usually the better choice because it preserves the audit trail."
        confirmLabel="Delete permanently"
        onConfirm={handleDelete}
        onCancel={() => setDeleting(null)}
        busy={busy}
      />
    </ManageApiShell>
  )
}

/**
 * Provisions a key into the pool.
 *
 * Binding a plan is optional but matters for quota: a key bound to a plan enforces that plan's limit,
 * while an unbound key falls back to the platform default.
 */
function CreateKeyModal({ open, plans, busy, onClose, onSubmit }) {
  return (
    <Modal
      open={open}
      title="Provision a new key"
      onClose={onClose}
      size="md"
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="submit" form="key-form" className="btn btn-primary" disabled={busy}>
            {busy ? 'Provisioning…' : 'Provision key'}
          </button>
        </>
      }
    >
      <form id="key-form" onSubmit={onSubmit} className="space-y-4">
        <div>
          <label htmlFor="key-name" className="mb-1 block text-sm font-medium text-slate-700">
            Label <span className="font-normal text-slate-400">(optional)</span>
          </label>
          <input
            id="key-name"
            name="name"
            className="input"
            placeholder="e.g. prod-ingest"
            maxLength={120}
          />
        </div>

        <div>
          <label htmlFor="key-plan" className="mb-1 block text-sm font-medium text-slate-700">
            Bind to plan
          </label>
          <select id="key-plan" name="planId" className="input" defaultValue="">
            <option value="">No plan (platform default quota)</option>
            {plans.map((plan) => (
              <option key={plan.id} value={plan.id}>
                {plan.name} — {plan.rateLimit.toLocaleString()} / {plan.ratePeriod.toLowerCase()}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-slate-500">
            Subscriptions preferring this plan will draw from this key's allocation first.
          </p>
        </div>

        <div>
          <label htmlFor="key-expiry" className="mb-1 block text-sm font-medium text-slate-700">
            Expires on <span className="font-normal text-slate-400">(optional)</span>
          </label>
          <input id="key-expiry" name="expiresAt" className="input" type="date" />
          <p className="mt-1 text-xs text-slate-500">Leave blank for a key that never expires.</p>
        </div>
      </form>
    </Modal>
  )
}

/**
 * One-time reveal of a newly minted plaintext key.
 *
 * The value exists only in Redux memory and is never written to localStorage, so dismissing this
 * dialog genuinely is the last opportunity to copy it.
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

/**
 * Recent gateway telemetry for one key.
 *
 * <p>Three states are rendered distinctly: loading, failed, and genuinely empty. Collapsing the first
 * two into "no requests have been recorded" would misreport a 403 on an API the caller does not own as
 * "this key has never been used".</p>
 */
function UsageModal({ apiKey, usage, status, error, onClose }) {
  if (!apiKey) return null

  return (
    <Modal open title={`Usage — ${apiKey.keyPrefix}…`} onClose={onClose} size="lg">
      {status === 'loading' || status === 'idle' ? (
        <div className="space-y-2">
          {[0, 1, 2].map((index) => (
            <Skeleton key={index} className="h-6 w-full" />
          ))}
        </div>
      ) : status === 'failed' ? (
        <Alert type="error" title="Unable to load usage">
          {error ?? 'The request for this key usage did not succeed.'}
        </Alert>
      ) : usage.length === 0 ? (
        <p className="text-sm text-slate-500">
          No requests have been recorded against this key yet.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-400">
              <tr>
                <th scope="col" className="px-3 py-2">Time</th>
                <th scope="col" className="px-3 py-2">Method</th>
                <th scope="col" className="px-3 py-2">Endpoint</th>
                <th scope="col" className="px-3 py-2">Status</th>
                <th scope="col" className="px-3 py-2 text-right">Latency</th>
              </tr>
            </thead>
            <tbody>
              {usage.map((entry) => (
                <tr key={entry.id} className="border-b border-slate-100 last:border-0">
                  <td className="px-3 py-2 text-slate-500">{formatDate(entry.createdAt)}</td>
                  <td className="px-3 py-2 font-mono text-xs text-slate-700">{entry.method}</td>
                  <td className="max-w-xs truncate px-3 py-2 font-mono text-xs text-slate-600">
                    {entry.endpoint}
                  </td>
                  <td className="px-3 py-2">
                    <Badge
                      tone={
                        entry.statusCode < 300
                          ? 'success'
                          : entry.statusCode < 500
                            ? 'warning'
                            : 'danger'
                      }
                    >
                      {entry.statusCode}
                    </Badge>
                  </td>
                  <td className="px-3 py-2 text-right text-slate-500">{entry.latencyMs} ms</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  )
}

export default ApiKeysPage
function KeyToolbar({ pooledCount, activeCount, total, onCreate }) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-wrap gap-2 text-xs">
        <Badge tone="info">{pooledCount} available in pool</Badge>
        <Badge tone="success">{activeCount} active</Badge>
        <Badge tone="neutral">{total} total</Badge>
      </div>
      <button type="button" className="btn btn-primary" onClick={onCreate}>
        Provision key
      </button>
    </div>
  )
}

/**
 * The key inventory table.
 *
 * Prefixes rather than full secrets are shown because the platform only ever stores a hash; the
 * plaintext is revealed once, at creation.
 */
function KeyTable({ keys, onUsage, onRotate, onRevoke, onDelete }) {
  return (
    <div className="card overflow-x-auto p-0">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-400">
          <tr>
            <th scope="col" className="px-4 py-3">Prefix</th>
            <th scope="col" className="px-4 py-3">Label</th>
            <th scope="col" className="px-4 py-3">Status</th>
            <th scope="col" className="px-4 py-3">Binding</th>
            <th scope="col" className="px-4 py-3">Expires</th>
            <th scope="col" className="px-4 py-3 text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {keys.map((key) => (
            <tr key={key.id} className="border-b border-slate-100 last:border-0">
              <td className="px-4 py-3 font-mono text-xs text-slate-700">{key.keyPrefix}••••</td>
              <td className="px-4 py-3 text-slate-600">{key.name || '—'}</td>
              <td className="px-4 py-3">
                <Badge
                  tone={
                    key.status === 'ACTIVE'
                      ? 'success'
                      : key.status === 'REVOKED'
                        ? 'danger'
                        : 'neutral'
                  }
                >
                  {key.status}
                </Badge>
              </td>
              <td className="px-4 py-3 text-slate-600">
                {key.pooled ? (
                  <span className="text-slate-400">Available in pool</span>
                ) : (
                  <span>
                    {key.userEmail}
                    {key.planName ? ` · ${key.planName}` : ''}
                  </span>
                )}
              </td>
              <td className="px-4 py-3 text-slate-500">
                {key.expiresAt ? formatDate(key.expiresAt, { withTime: false }) : 'Never'}
              </td>
              <td className="px-4 py-3">
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => onUsage(key)}
                  >
                    Usage
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => onRotate(key)}
                  >
                    Rotate
                  </button>
                  {key.status === 'ACTIVE' && (
                    <button
                      type="button"
                      className="btn btn-danger btn-sm"
                      onClick={() => onRevoke(key)}
                    >
                      Revoke
                    </button>
                  )}
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => onDelete(key)}
                  >
                    Delete
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
