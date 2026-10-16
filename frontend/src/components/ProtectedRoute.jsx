import { Navigate, useLocation } from 'react-router-dom'
import { useAppSelector } from '../hooks'

/**
 * Route guard enforcing authentication and role membership.
 *
 * Two independent constraints:
 * - `roles`     — the caller's role must be in this list (allow-list).
 * - `denyRoles` — the caller's role must NOT be in this list (deny-list).
 *
 * `denyRoles` exists because the provider role is defined by exclusion: providers can do everything a
 * developer can *except* consume APIs. Expressing that as an allow-list would mean enumerating every
 * consuming role, which silently breaks when a new role is added.
 *
 * Unauthenticated visitors are redirected to `/login` with the attempted location preserved, so they
 * land where they intended after signing in.
 */
function ProtectedRoute({ children, roles, denyRoles }) {
  const location = useLocation()
  const isAuthenticated = useAppSelector((state) => state.auth.isAuthenticated)
  const user = useAppSelector((state) => state.auth.user)

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location.pathname }} replace />
  }

  const role = user?.role

  if (denyRoles?.includes(role)) {
    return <ForbiddenNotice />
  }

  if (roles && !roles.includes(role)) {
    return <ForbiddenNotice />
  }

  return children
}

/**
 * Rendered in place of the protected view when the caller's role does not permit it.
 *
 * Shown rather than redirecting so the URL stays meaningful and the user understands why the page
 * they navigated to is unavailable.
 */
function ForbiddenNotice() {
  return (
    <div className="card mx-auto max-w-lg text-center">
      <h1 className="text-xl font-semibold text-slate-900">Not available for your account</h1>
      <p className="mt-2 text-sm text-slate-600">
        Your role does not include access to this page. If you believe this is a mistake, contact an
        administrator.
      </p>
    </div>
  )
}

export default ProtectedRoute
