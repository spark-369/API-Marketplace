import { useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { useAppDispatch, useAppSelector } from '../hooks'
import {
  fetchAllReviews,
  fetchReviewsForApi,
  selectAllReviews,
  selectReviewsByApi,
} from '../store/reviewsSlice'
import ManageApiShell from '../components/ManageApiShell'
import { Badge, EmptyState, Skeleton } from '../components/ui'
import { formatDate } from '../utils/format'

/**
 * Reviews for a single API, or an admin-wide view when no `apiId` is in the route.
 *
 * Providers can read reviews of their APIs but cannot create them, so this view is read-only by
 * design — there is no "write a review" affordance here.
 */
function ReviewsPage() {
  const { apiId } = useParams()
  const dispatch = useAppDispatch()

  const isAdminOverview = !apiId
  const allReviews = useAppSelector(selectAllReviews)
  const apiReviews = useAppSelector(selectReviewsByApi(apiId))
  const status = useAppSelector((state) => state.reviews.status)
  const error = useAppSelector((state) => state.reviews.error)

  const reviews = isAdminOverview ? allReviews : apiReviews

  useEffect(() => {
    if (apiId) {
      dispatch(fetchReviewsForApi({ apiId, params: { size: 50 } }))
    } else {
      dispatch(fetchAllReviews({ size: 50 }))
    }
  }, [dispatch, apiId])

  const list = (
    <>
      {status === 'loading' && (
        <div className="space-y-3">
          {[0, 1, 2].map((index) => (
            <Skeleton key={index} className="h-24 w-full" />
          ))}
        </div>
      )}

      {status === 'failed' && <div className="card text-sm text-red-600">{error}</div>}

      {status === 'succeeded' && reviews.length === 0 && (
        <EmptyState
          title="No reviews yet"
          description="Developers who subscribe to this API can leave feedback once they have used it."
        />
      )}

      <ul className="space-y-3">
        {reviews.map((review) => (
          <li key={review.id} className="card">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-medium text-slate-800">{review.title || 'Untitled review'}</p>
                <p className="text-xs text-slate-400">
                  {review.authorName}
                  {isAdminOverview && review.apiName ? ` · ${review.apiName}` : ''} ·{' '}
                  {formatDate(review.createdAt, { withTime: false })}
                </p>
              </div>

              <span className="text-sm text-amber-500" aria-label={`${review.rating} out of 5 stars`}>
                {'★'.repeat(review.rating)}
                <span className="text-slate-300">{'★'.repeat(5 - review.rating)}</span>
              </span>
            </div>

            {review.comment && <p className="mt-2 text-sm text-slate-600">{review.comment}</p>}
          </li>
        ))}
      </ul>
    </>
  )

  if (isAdminOverview) {
    return (
      <div>
        <h1 className="mb-2 text-2xl font-semibold text-slate-900">All reviews</h1>
        <Badge tone="neutral" className="mb-6">
          {reviews.length} shown
        </Badge>
        {list}
      </div>
    )
  }

  return (
    <ManageApiShell title="Reviews" description="Feedback left by developers using this API">
      {list}
    </ManageApiShell>
  )
}

export default ReviewsPage
