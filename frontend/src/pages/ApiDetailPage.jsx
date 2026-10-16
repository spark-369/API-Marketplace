import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAppDispatch, useAppSelector } from '../hooks'
import { fetchApiById } from '../store/apisSlice'
import { selectCanConsume } from '../store/authSlice'
import { fetchPlansForApi, selectPlansByApi } from '../store/plansSlice'
import { selectMySubscriptionForApi, subscribeToApi } from '../store/subscriptionsSlice'
import { fetchReviewsForApi, createReview, selectReviewsByApi } from '../store/reviewsSlice'
import { Alert, Badge, EmptyState, FieldErrors, Modal, Skeleton } from '../components/ui'
import { formatDate, formatPrice } from '../utils/format'

/**
 * API detail page.
 *
 * Assembles four domains — the API, its plans, the caller's subscription and its reviews — and gates
 * the subscribe action on two independent conditions: being able to consume at all (providers cannot)
 * and not already being subscribed.
 */
function ApiDetailPage() {
  const { id } = useParams()
  const dispatch = useAppDispatch()
  const navigate = useNavigate()

  const api = useAppSelector((state) => state.apis.current)
  const status = useAppSelector((state) => state.apis.currentStatus)
  const error = useAppSelector((state) => state.apis.error)

  const plans = useAppSelector(selectPlansByApi(id))
  const reviews = useAppSelector(selectReviewsByApi(id))
  const reviewsStatus = useAppSelector((state) => state.reviews.status)
  const reviewsError = useAppSelector((state) => state.reviews.error)

  const isAuthenticated = useAppSelector((state) => state.auth.isAuthenticated)
  const canConsume = useAppSelector(selectCanConsume)
  const mySubscription = useAppSelector(selectMySubscriptionForApi(id))

  const [selectedPlanId, setSelectedPlanId] = useState('')
  const [subscribing, setSubscribing] = useState(false)
  const [subscribeError, setSubscribeError] = useState(null)

  // Review composer state.
  const [reviewOpen, setReviewOpen] = useState(false)
  const [reviewBusy, setReviewBusy] = useState(false)
  const [reviewError, setReviewError] = useState(null)
  const [reviewFieldErrors, setReviewFieldErrors] = useState(null)

  const user = useAppSelector((state) => state.auth.user)

  // Mirrors the backend rule on POST /apis/{apiId}/reviews: hasAnyRole('DEVELOPER', 'ADMIN').
  // Providers are deliberately excluded so a publisher cannot inflate its own rating, and an
  // anonymous visitor is excluded because the endpoint requires authentication.
  const canReview = isAuthenticated && (user?.role === 'DEVELOPER' || user?.role === 'ADMIN')

  // One review per account per API (DB unique constraint + service check), so a caller who has
  // already reviewed must not be offered the form again.
  const myReview = reviews.find((review) => review.userId === user?.id)
  const showReviewForm = canReview && !myReview

  useEffect(() => {
    dispatch(fetchApiById(id))
    dispatch(fetchPlansForApi(id))
    dispatch(fetchReviewsForApi({ apiId: id, params: { size: 10 } }))
  }, [dispatch, id])

  // Default to the first plan once plans arrive, so subscribe is usable without an extra click.
  useEffect(() => {
    if (plans.length > 0 && selectedPlanId === '') {
      setSelectedPlanId(plans[0].id)
    }
  }, [plans, selectedPlanId])

  async function handleSubscribe() {
    setSubscribing(true)
    setSubscribeError(null)
    const result = await dispatch(subscribeToApi({ apiId: id, planId: selectedPlanId || undefined }))
    setSubscribing(false)
    if (subscribeToApi.rejected.match(result)) {
      setSubscribeError(result.payload?.message ?? 'Unable to subscribe')
    }
  }

  /**
   * Submits the review composer.
   *
   * On success the list is re-fetched rather than appending locally: the API's `averageRating` and
   * `reviewCount` are recomputed server-side, so the header stats stay correct too.
   */
  async function handleReviewSubmit(event) {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)
    const payload = {
      rating: Number(formData.get('rating')),
      title: formData.get('title') || null,
      comment: formData.get('comment') || null,
    }

    setReviewBusy(true)
    setReviewError(null)
    setReviewFieldErrors(null)

    const result = await dispatch(createReview({ apiId: id, payload }))
    setReviewBusy(false)

    if (createReview.rejected.match(result)) {
      setReviewError(result.payload?.message ?? 'Unable to submit your review')
      setReviewFieldErrors(result.payload?.fieldErrors ?? null)
      return
    }

    setReviewOpen(false)
    dispatch(fetchReviewsForApi({ apiId: id, params: { size: 10 } }))
    dispatch(fetchApiById(id))
  }

  if (status === 'loading') {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    )
  }

  if (status === 'failed' || !api) {
    return (
      <div className="space-y-4">
        <Alert type="error" title="API unavailable">
          {error ?? 'This API could not be found.'}
        </Alert>
        <button type="button" className="btn btn-secondary" onClick={() => navigate('/apis')}>
          Back to catalog
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      <header className="card">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">{api.name}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Badge tone={api.status === 'PUBLISHED' ? 'success' : 'neutral'}>{api.status}</Badge>
              <Badge tone={api.visibility === 'PUBLIC' ? 'info' : 'warning'}>{api.visibility}</Badge>
              <Badge tone="neutral">v{api.version}</Badge>
              {api.categoryName && <Badge tone="neutral">{api.categoryName}</Badge>}
            </div>
          </div>

          <div className="text-right text-sm">
            <p className="font-medium text-slate-700">{api.ownerName}</p>
            <p className="text-slate-400">{api.ownerEmail}</p>
            <p className="mt-2 text-slate-500">
              {api.reviewCount > 0
                ? `★ ${Number(api.averageRating).toFixed(2)} · ${api.reviewCount} reviews`
                : 'Not yet rated'}
            </p>
          </div>
        </div>

        <p className="mt-4 text-sm text-slate-600">{api.description || 'No description provided.'}</p>

        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs uppercase tracking-wide text-slate-400">Upstream</dt>
            <dd className="break-words font-mono text-xs text-slate-700">{api.baseUrl}</dd>
          </div>
          {api.documentationUrl && (
            <div>
              <dt className="text-xs uppercase tracking-wide text-slate-400">Documentation</dt>
              <dd className="break-words font-mono text-xs text-slate-700">{api.documentationUrl}</dd>
            </div>
          )}
        </dl>
      </header>

      <section>
        <h2 className="mb-3 text-lg font-semibold text-slate-900">Plans</h2>

        {plans.length === 0 ? (
          <EmptyState
            title="No plans published yet"
            description="This provider has not defined any pricing tiers for this API."
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {plans.map((plan) => (
              <button
                key={plan.id}
                type="button"
                onClick={() => canConsume && setSelectedPlanId(plan.id)}
                disabled={!canConsume}
                aria-pressed={selectedPlanId === plan.id}
                className={`card text-left transition ${
                  selectedPlanId === plan.id && canConsume
                    ? 'ring-2 ring-brand-500'
                    : 'hover:shadow-raised'
                } ${canConsume ? 'cursor-pointer' : 'cursor-default'}`}
              >
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-slate-900">{plan.name}</h3>
                  <span className="text-sm font-medium text-brand-700">
                    {formatPrice(plan.price)}
                  </span>
                </div>
                <p className="mt-2 text-sm text-slate-500">{plan.description}</p>
                <p className="mt-3 text-xs text-slate-400">
                  {plan.rateLimit.toLocaleString()} requests / {plan.ratePeriod.toLowerCase()} ·{' '}
                  {plan.supportLevel} support
                </p>
              </button>
            ))}
          </div>
        )}
      </section>

      <section className="card">
        <h2 className="text-lg font-semibold text-slate-900">Access</h2>

        {!isAuthenticated && (
          <p className="mt-2 text-sm text-slate-600">
            <button
              type="button"
              className="font-medium text-brand-700 hover:underline"
              onClick={() => navigate('/login', { state: { from: `/apis/${id}` } })}
            >
              Sign in
            </button>{' '}
            to subscribe and receive an API key.
          </p>
        )}

        {isAuthenticated && !canConsume && (
          <p className="mt-2 text-sm text-slate-600">
            Provider accounts publish APIs and do not consume them. Sign in with a developer account to
            subscribe.
          </p>
        )}

        {canConsume && mySubscription && (
          <div className="mt-2 space-y-3 text-sm">
            <Alert type="success" title="You are subscribed">
              Status: {mySubscription.status}
              {mySubscription.apiKeyPrefix && (
                <>
                  {' · '}Key <span className="font-mono">{mySubscription.apiKeyPrefix}…</span>
                </>
              )}
            </Alert>
            <div className="flex gap-2">
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => navigate('/me/api-keys')}
              >
                View my keys
              </button>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => navigate('/gateway')}
              >
                Open API console
              </button>
            </div>
          </div>
        )}

        {canConsume && !mySubscription && (
          <div className="mt-3 space-y-3">
            {subscribeError && <Alert type="error">{subscribeError}</Alert>}
            <div className="flex flex-wrap items-end gap-3">
              <div className="min-w-56">
                <label htmlFor="subscribe-plan" className="mb-1 block text-sm font-medium text-slate-700">
                  Plan
                </label>
                <select
                  id="subscribe-plan"
                  className="input"
                  value={selectedPlanId}
                  onChange={(event) => setSelectedPlanId(event.target.value)}
                >
                  <option value="">No plan (provider default quota)</option>
                  {plans.map((plan) => (
                    <option key={plan.id} value={plan.id}>
                      {plan.name}
                    </option>
                  ))}
                </select>
              </div>

              <button
                type="button"
                className="btn btn-primary"
                onClick={handleSubscribe}
                disabled={subscribing}
              >
                {subscribing ? 'Subscribing…' : 'Subscribe and get a key'}
              </button>
            </div>
            <p className="text-xs text-slate-500">
              Subscribing draws a key from the provider's pool. If none is available the request is
              rejected with a conflict.
            </p>
          </div>
        )}
      </section>

      <section>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-slate-900">Reviews</h2>

          {showReviewForm && (
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => {
                setReviewError(null)
                setReviewFieldErrors(null)
                setReviewOpen(true)
              }}
            >
              Write a review
            </button>
          )}

          {canReview && myReview && (
            <span className="text-xs text-slate-400">
              You have already reviewed this API.
            </span>
          )}
        </div>

        {reviewsStatus === 'failed' && (
          <Alert type="error" className="mb-4">
            {reviewsError ?? 'Unable to load reviews for this API.'}
          </Alert>
        )}

        {reviews.length === 0 ? (
          <EmptyState
            title="No reviews yet"
            description="Be the first to share your experience with this API."
          />
        ) : (
          <ul className="space-y-3">
            {reviews.map((review) => (
              <li key={review.id} className="card">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium text-slate-800">
                      {review.title || 'Untitled review'}
                    </p>
                    <p className="text-xs text-slate-400">
                      {review.authorName} · {formatDate(review.createdAt, { withTime: false })}
                    </p>
                  </div>
                  <span
                    className="text-sm text-amber-500"
                    aria-label={`${review.rating} out of 5 stars`}
                  >
                    {'★'.repeat(review.rating)}
                    <span className="text-slate-300">{'★'.repeat(5 - review.rating)}</span>
                  </span>
                </div>
                {review.comment && <p className="mt-2 text-sm text-slate-600">{review.comment}</p>}
              </li>
            ))}
          </ul>
        )}
      </section>

      <Modal
        open={reviewOpen}
        title={`Review ${api.name}`}
        onClose={() => setReviewOpen(false)}
        footer={
          <>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setReviewOpen(false)}
              disabled={reviewBusy}
            >
              Cancel
            </button>
            <button type="submit" form="review-form" className="btn btn-primary" disabled={reviewBusy}>
              {reviewBusy ? 'Submitting…' : 'Submit review'}
            </button>
          </>
        }
      >
        <form id="review-form" onSubmit={handleReviewSubmit} className="space-y-4">
          {reviewError && <Alert type="error">{reviewError}</Alert>}
          <FieldErrors errors={reviewFieldErrors} />

          <div>
            <label htmlFor="review-rating" className="mb-1 block text-sm font-medium text-slate-700">
              Rating
            </label>
            <select id="review-rating" name="rating" className="input" defaultValue="5" required>
              <option value="5">★★★★★ — Excellent</option>
              <option value="4">★★★★☆ — Good</option>
              <option value="3">★★★☆☆ — Average</option>
              <option value="2">★★☆☆☆ — Poor</option>
              <option value="1">★☆☆☆☆ — Terrible</option>
            </select>
          </div>

          <div>
            <label htmlFor="review-title" className="mb-1 block text-sm font-medium text-slate-700">
              Title
            </label>
            <input
              id="review-title"
              name="title"
              className="input"
              maxLength={200}
              placeholder="Summarise your experience"
            />
          </div>

          <div>
            <label htmlFor="review-comment" className="mb-1 block text-sm font-medium text-slate-700">
              Comment
            </label>
            <textarea
              id="review-comment"
              name="comment"
              className="input min-h-24"
              maxLength={4000}
              placeholder="What worked well, and what could be better?"
            />
          </div>

          <p className="text-xs text-slate-500">
            One review per account per API. Your rating feeds the API's public average.
          </p>
        </form>
      </Modal>
    </div>
  )
}

export default ApiDetailPage
