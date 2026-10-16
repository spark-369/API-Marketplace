import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAppDispatch, useAppSelector } from '../hooks'
import { fetchApis } from '../store/apisSlice'
import { fetchCategories } from '../store/categoriesSlice'
import { Badge, PageHeader, Skeleton } from '../components/ui'

/**
 * Landing page: value proposition for anonymous visitors plus the most recent published APIs for
 * returning ones.
 */
function HomePage() {
  const dispatch = useAppDispatch()
  const apis = useAppSelector((state) => state.apis.items)
  const status = useAppSelector((state) => state.apis.status)
  const isAuthenticated = useAppSelector((state) => state.auth.isAuthenticated)

  useEffect(() => {
    dispatch(fetchApis({ size: 6 }))
    dispatch(fetchCategories())
  }, [dispatch])

  return (
    <div className="space-y-10">
      <section className="card bg-gradient-to-br from-brand-600 to-brand-800 text-white">
        <div className="max-w-2xl">
          <h1 className="text-3xl font-semibold sm:text-4xl">
            Publish, discover and consume APIs
          </h1>
          <p className="mt-3 text-brand-100">
            A single marketplace for provider-published APIs, with subscription entitlements, managed
            API keys and metered gateway traffic.
          </p>

          <div className="mt-6 flex flex-wrap gap-3">
            <Link to="/apis" className="btn btn-secondary">
              Browse the catalog
            </Link>
            {!isAuthenticated && (
              <Link
                to="/register"
                className="btn border border-white/40 bg-white/10 text-white hover:bg-white/20"
              >
                Create an account
              </Link>
            )}
          </div>
        </div>
      </section>

      <section>
        <PageHeader
          title="Recently published"
          description="The latest APIs available in the marketplace"
          actions={<Link to="/apis" className="btn btn-secondary btn-sm">View all</Link>}
        />

        {status === 'loading' && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2].map((index) => (
              <div key={index} className="card space-y-3">
                <Skeleton className="h-5 w-3/4" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-1/2" />
              </div>
            ))}
          </div>
        )}

        {status === 'succeeded' && apis.length === 0 && (
          <p className="card text-sm text-slate-500">
            No APIs have been published yet. Check back soon.
          </p>
        )}

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {apis.map((api) => (
            <Link key={api.id} to={`/apis/${api.id}`} className="card transition hover:shadow-raised">
              <div className="flex items-start justify-between gap-3">
                <h3 className="font-semibold text-slate-900">{api.name}</h3>
                <Badge tone="neutral">v{api.version}</Badge>
              </div>
              <p className="mt-2 line-clamp-3 text-sm text-slate-500">
                {api.description || 'No description provided.'}
              </p>
              <div className="mt-4 flex items-center justify-between text-xs text-slate-400">
                <span>{api.categoryName ?? 'Uncategorised'}</span>
                <span>
                  {api.reviewCount > 0
                    ? `★ ${Number(api.averageRating).toFixed(1)} (${api.reviewCount})`
                    : 'No reviews yet'}
                </span>
              </div>
            </Link>
          ))}
        </div>
      </section>
    </div>
  )
}

export default HomePage
