import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useAppDispatch, useAppSelector } from '../hooks'
import {
  cancelSubscription,
  fetchSubscriptionsForApi,
  selectSubscriptionsByApi,
  updateSubscription,
} from '../store/subscriptionsSlice'
import ManageApiShell from '../components/ManageApiShell'
import { Badge, ConfirmModal, EmptyState, Modal, Skeleton } from '../components/ui'
import { formatDate } from '../utils/format'

/**
 * Provider view of who subscribes to one of their APIs, with the ability to extend expiry or revoke
 * access.
 *
 * Cancelling from here also returns the subscriber's key to the pool, which is why it is confirmed
 * explicitly.
 */
function ApiSubscriptionsPage() {
  const { apiId } = useParams()
  const dispatch = useAppDispatch()

  const subscriptions = useAppSelector(selectSubscriptionsByApi(apiId))
  const error = useAppSelector((state) => state.subscriptions.error)

  const [editing, setEditing] = useState(null)
  const [cancelling, setCancelling] = useState(null)
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!apiId) return
    setLoading(true)
    dispatch(fetchSubscriptionsForApi({ apiId, params: { size: 50 } })).finally(() =>
      setLoading(false),
    )
  }, [dispatch, apiId])

  async function handleSubmit(event) {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)
    const expiresAt = formData.get('expiresAt')

    setBusy(true)
    await dispatch(
      updateSubscription({
        apiId,
        subscriptionId: editing.id,
        payload: {
          expiresAt: expiresAt ? `${expiresAt}T23:59:59` : null,
        },
      }),
    )
    setBusy(false)
    setEditing(null)
    dispatch(fetchSubscriptionsForApi({ apiId, params: { size: 50 } }))
  }

  async function handleCancel() {
    setBusy(true)
    await dispatch(cancelSubscription({ apiId, subscriptionId: cancelling.id }))
    setBusy(false)
    setCancelling(null)
  }

  return (
    <ManageApiShell title="Subscribers" description="Accounts entitled to use this API">
      {error && <div className="card mb-4 text-sm text-red-600">{error}</div>}

      {loading && (
        <div className="space-y-3">
          {[0, 1].map((index) => (
            <Skeleton key={index} className="h-20 w-full" />
          ))}
        </div>
      )}

      {!loading && subscriptions.length === 0 && (
        <EmptyState
          title="No subscribers yet"
          description="Once developers subscribe, they will appear here with their assigned key and plan."
        />
      )}

      <ul className="space-y-3">
        {subscriptions.map((subscription) => (
          <li key={subscription.id} className="card">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-semibold text-slate-900">{subscription.userEmail}</h2>
                  <Badge tone={subscription.status === 'ACTIVE' ? 'success' : 'neutral'}>
                    {subscription.status}
                  </Badge>
                  {subscription.planName && <Badge tone="info">{subscription.planName}</Badge>}
                </div>

                <dl className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-xs text-slate-500">
                  <div className="flex gap-1">
                    <dt>Started:</dt>
                    <dd>{formatDate(subscription.startedAt, { withTime: false })}</dd>
                  </div>
                  <div className="flex gap-1">
                    <dt>Expires:</dt>
                    <dd>
                      {subscription.expiresAt
                        ? formatDate(subscription.expiresAt, { withTime: false })
                        : 'No expiry'}
                    </dd>
                  </div>
                  <div className="flex gap-1">
                    <dt>Key:</dt>
                    <dd className="font-mono">
                      {subscription.apiKeyPrefix ? `${subscription.apiKeyPrefix}…` : 'Unassigned'}
                    </dd>
                  </div>
                </dl>
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => setEditing(subscription)}
                >
                  Adjust
                </button>
                {subscription.status === 'ACTIVE' && (
                  <button
                    type="button"
                    className="btn btn-danger btn-sm"
                    onClick={() => setCancelling(subscription)}
                  >
                    Revoke
                  </button>
                )}
              </div>
            </div>
          </li>
        ))}
      </ul>

      <Modal
        open={Boolean(editing)}
        title="Adjust subscription"
        onClose={() => setEditing(null)}
        size="sm"
        footer={
          <>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setEditing(null)}
              disabled={busy}
            >
              Cancel
            </button>
            <button
              type="submit"
              form="subscription-form"
              className="btn btn-primary"
              disabled={busy}
            >
              {busy ? 'Saving…' : 'Save'}
            </button>
          </>
        }
      >
        <form id="subscription-form" onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              htmlFor="subscription-expiry"
              className="mb-1 block text-sm font-medium text-slate-700"
            >
              Expiry date
            </label>
            <input
              id="subscription-expiry"
              name="expiresAt"
              className="input"
              type="date"
              defaultValue={editing?.expiresAt ? editing.expiresAt.slice(0, 10) : ''}
            />
            <p className="mt-1 text-xs text-slate-500">
              Clearing this leaves the subscription without an expiry.
            </p>
          </div>
        </form>
      </Modal>

      <ConfirmModal
        open={Boolean(cancelling)}
        title="Revoke this subscription?"
        message="The subscriber's API key returns to your pool and stops working immediately."
        confirmLabel="Revoke access"
        onConfirm={handleCancel}
        onCancel={() => setCancelling(null)}
        busy={busy}
      />
    </ManageApiShell>
  )
}

export default ApiSubscriptionsPage
