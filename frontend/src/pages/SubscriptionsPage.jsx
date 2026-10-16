import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAppDispatch, useAppSelector } from '../hooks'
import { cancelSubscription, fetchMySubscriptions } from '../store/subscriptionsSlice'
import { Badge, ConfirmModal, EmptyState, PageHeader, Skeleton } from '../components/ui'
import { formatDate } from '../utils/format'

/**
 * Developer view of every subscription they hold.
 *
 * Cancelling is confirmed first because it also returns the delegated key to the provider's pool —
 * an easy action to trigger accidentally and awkward to reverse.
 */
function SubscriptionsPage() {
  const dispatch = useAppDispatch()

  const subscriptions = useAppSelector((state) => state.subscriptions.mine)
  const status = useAppSelector((state) => state.subscriptions.status)
  const error = useAppSelector((state) => state.subscriptions.error)

  const [cancelling, setCancelling] = useState(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    dispatch(fetchMySubscriptions())
  }, [dispatch])

  async function handleCancel() {
    setBusy(true)
    await dispatch(cancelSubscription({ apiId: cancelling.apiId, subscriptionId: cancelling.id }))
    setBusy(false)
    setCancelling(null)
  }

  return (
    <div>
      <PageHeader
        title="My subscriptions"
        description="APIs you have subscribed to and the keys assigned to you"
      />

      {status === 'loading' && (
        <div className="space-y-3">
          {[0, 1].map((index) => (
            <Skeleton key={index} className="h-24 w-full" />
          ))}
        </div>
      )}

      {status === 'failed' && <div className="card text-sm text-red-600">{error}</div>}

      {status === 'succeeded' && subscriptions.length === 0 && (
        <EmptyState
          title="No active subscriptions"
          description="Browse the catalog to find an API and subscribe."
          action={
            <Link to="/apis" className="btn btn-primary">
              Browse APIs
            </Link>
          }
        />
      )}

      <ul className="space-y-3">
        {subscriptions.map((subscription) => (
          <li key={subscription.id} className="card">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-semibold text-slate-900">{subscription.apiName}</h2>
                  <Badge tone={subscription.status === 'ACTIVE' ? 'success' : 'neutral'}>
                    {subscription.status}
                  </Badge>
                  {subscription.planName && <Badge tone="info">{subscription.planName}</Badge>}
                </div>

                <dl className="mt-2 grid gap-x-6 gap-y-1 text-xs text-slate-500 sm:grid-cols-2">
                  <div className="flex gap-1">
                    <dt>Started:</dt>
                    <dd>{formatDate(subscription.startedAt, { withTime: false })}</dd>
                  </div>
                  <div className="flex gap-1">
                    <dt>Expires:</dt>
                    <dd>{subscription.expiresAt
                      ? formatDate(subscription.expiresAt, { withTime: false })
                      : 'No expiry'}</dd>
                  </div>
                  <div className="flex gap-1">
                    <dt>Key:</dt>
                    <dd className="font-mono">
                      {subscription.apiKeyPrefix ? `${subscription.apiKeyPrefix}…` : 'Not assigned'}
                    </dd>
                  </div>
                </dl>
              </div>

              <div className="flex flex-wrap gap-2">
                <Link to={`/apis/${subscription.apiId}`} className="btn btn-secondary btn-sm">
                  View API
                </Link>
                <Link to="/me/api-keys" className="btn btn-secondary btn-sm">
                  My keys
                </Link>
                {subscription.status === 'ACTIVE' && (
                  <button
                    type="button"
                    className="btn btn-danger btn-sm"
                    onClick={() => setCancelling(subscription)}
                  >
                    Cancel
                  </button>
                )}
              </div>
            </div>
          </li>
        ))}
      </ul>

      <ConfirmModal
        open={Boolean(cancelling)}
        title="Cancel this subscription?"
        message="Your API key will be returned to the provider's pool and will stop working immediately."
        confirmLabel="Cancel subscription"
        cancelLabel="Keep it"
        onConfirm={handleCancel}
        onCancel={() => setCancelling(null)}
        busy={busy}
      />
    </div>
  )
}

export default SubscriptionsPage
