import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAppDispatch, useAppSelector } from '../hooks'
import { clearAuthError, loginUser } from '../store/authSlice'
import { Alert, FieldErrors } from '../components/ui'

/**
 * Sign-in form.
 *
 * On success the user is sent to the page they originally tried to reach (supplied by
 * `ProtectedRoute` via location state) rather than to a generic landing page.
 */
function LoginPage() {
  const dispatch = useAppDispatch()
  const navigate = useNavigate()
  const location = useLocation()

  const { status, error, fieldErrors, isAuthenticated } = useAppSelector((state) => state.auth)

  const [form, setForm] = useState({ email: '', password: '' })

  const redirectTo = location.state?.from ?? '/'
  const busy = status === 'loading'

  // Clear a previous attempt's error when the user arrives back on this page.
  useEffect(() => {
    dispatch(clearAuthError())
  }, [dispatch])

  // Navigate from an effect rather than during render so the router finishes its work first.
  useEffect(() => {
    if (isAuthenticated) {
      navigate(redirectTo, { replace: true })
    }
  }, [isAuthenticated, navigate, redirectTo])

  function handleSubmit(event) {
    event.preventDefault()
    dispatch(loginUser(form))
  }

  return (
    <div className="mx-auto max-w-md">
      <div className="card">
        <h1 className="text-2xl font-semibold text-slate-900">Sign in</h1>
        <p className="mt-1 text-sm text-slate-500">Access your subscriptions and API keys.</p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          {error && <Alert type="error">{error}</Alert>}

          <div>
            <label htmlFor="login-email" className="mb-1 block text-sm font-medium text-slate-700">
              Email
            </label>
            <input
              id="login-email"
              className="input"
              type="email"
              autoComplete="email"
              value={form.email}
              onChange={(event) => setForm({ ...form, email: event.target.value })}
              required
            />
            <FieldErrors errors={fieldErrors} />
          </div>

          <div>
            <label htmlFor="login-password" className="mb-1 block text-sm font-medium text-slate-700">
              Password
            </label>
            <input
              id="login-password"
              className="input"
              type="password"
              autoComplete="current-password"
              value={form.password}
              onChange={(event) => setForm({ ...form, password: event.target.value })}
              required
            />
          </div>

          <button type="submit" className="btn btn-primary w-full" disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <p className="mt-4 text-center text-sm text-slate-500">
          Need an account?{' '}
          <Link to="/register" className="font-medium text-brand-700 hover:underline">
            Create one
          </Link>
        </p>
      </div>
    </div>
  )
}

export default LoginPage
