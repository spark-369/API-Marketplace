import { Link } from 'react-router-dom'
import { useAppSelector } from '../hooks'

/**
 * 404 view.
 *
 * Kept as a real page rather than a redirect: a mistyped or stale URL should say so, not silently
 * deposit the visitor somewhere else.
 */
function NotFoundPage() {
  const isAuthenticated = useAppSelector((state) => state.auth.isAuthenticated)

  return (
    <div className="card mx-auto max-w-lg text-center">
      <p className="text-4xl font-semibold text-brand-600">404</p>
      <h1 className="mt-3 text-xl font-semibold text-slate-900">Page not found</h1>
      <p className="mt-2 text-sm text-slate-600">
        The page you were looking for does not exist, or you may not have access to it.
      </p>

      <div className="mt-6 flex justify-center gap-2">
        <Link to="/" className="btn btn-primary">
          Go home
        </Link>
        <Link to="/apis" className="btn btn-secondary">
          Browse APIs
        </Link>
        {!isAuthenticated && (
          <Link to="/login" className="btn btn-secondary">
            Sign in
          </Link>
        )}
      </div>
    </div>
  )
}

export default NotFoundPage
