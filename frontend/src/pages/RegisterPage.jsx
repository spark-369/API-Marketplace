import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAppDispatch, useAppSelector } from '../hooks'
import { clearAuthError, registerUser } from '../store/authSlice'
import { Alert, FieldErrors } from '../components/ui'

/**
 * Registration form.
 *
 * Offers the two self-service roles. ADMIN is deliberately absent — it cannot be self-granted, which
 * is why the backend also rejects it on this endpoint.
 */
function RegisterPage() {
  const dispatch = useAppDispatch()
  const navigate = useNavigate()

  const { status, error, fieldErrors, isAuthenticated } = useAppSelector((state) => state.auth)

  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    role: 'DEVELOPER',
  })

  const busy = status === 'loading'

  useEffect(() => {
    dispatch(clearAuthError())
  }, [dispatch])

  useEffect(() => {
    if (isAuthenticated) {
      navigate('/', { replace: true })
    }
  }, [isAuthenticated, navigate])

  function handleSubmit(event) {
    event.preventDefault()
    dispatch(registerUser(form))
  }

  return (
    <div className="mx-auto max-w-lg">
      <div className="card">
        <h1 className="text-2xl font-semibold text-slate-900">Create your account</h1>
        <p className="mt-1 text-sm text-slate-500">
          Subscribe to APIs as a developer, or publish your own as a provider.
        </p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          {error && <Alert type="error">{error}</Alert>}

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="register-first" className="mb-1 block text-sm font-medium text-slate-700">
                First name
              </label>
              <input
                id="register-first"
                className="input"
                value={form.firstName}
                onChange={(event) => setForm({ ...form, firstName: event.target.value })}
                required
                maxLength={80}
              />
              <FieldErrors errors={fieldErrors?.firstName ? { firstName: fieldErrors.firstName } : null} />
            </div>

            <div>
              <label htmlFor="register-last" className="mb-1 block text-sm font-medium text-slate-700">
                Last name
              </label>
              <input
                id="register-last"
                className="input"
                value={form.lastName}
                onChange={(event) => setForm({ ...form, lastName: event.target.value })}
                required
                maxLength={80}
              />
            </div>
          </div>

          <div>
            <label htmlFor="register-email" className="mb-1 block text-sm font-medium text-slate-700">
              Email
            </label>
            <input
              id="register-email"
              className="input"
              type="email"
              autoComplete="email"
              value={form.email}
              onChange={(event) => setForm({ ...form, email: event.target.value })}
              required
            />
            <FieldErrors errors={fieldErrors?.email ? { email: fieldErrors.email } : null} />
          </div>

          <div>
            <label htmlFor="register-password" className="mb-1 block text-sm font-medium text-slate-700">
              Password
            </label>
            <input
              id="register-password"
              className="input"
              type="password"
              autoComplete="new-password"
              value={form.password}
              onChange={(event) => setForm({ ...form, password: event.target.value })}
              required
              minLength={8}
            />
            <p className="mt-1 text-xs text-slate-500">
              At least 8 characters, including a letter and a digit.
            </p>
            <FieldErrors errors={fieldErrors?.password ? { password: fieldErrors.password } : null} />
          </div>

          <fieldset>
            <legend className="mb-2 block text-sm font-medium text-slate-700">Account type</legend>
            <div className="grid gap-3 sm:grid-cols-2">
              <RoleOption
                value="DEVELOPER"
                selected={form.role}
                onSelect={(role) => setForm({ ...form, role })}
                title="Developer"
                description="Discover, subscribe to and consume APIs."
              />
              <RoleOption
                value="PROVIDER"
                selected={form.role}
                onSelect={(role) => setForm({ ...form, role })}
                title="Provider"
                description="Publish APIs and manage plans and keys."
              />
            </div>
          </fieldset>

          <button type="submit" className="btn btn-primary w-full" disabled={busy}>
            {busy ? 'Creating account…' : 'Create account'}
          </button>
        </form>

        <p className="mt-4 text-center text-sm text-slate-500">
          Already registered?{' '}
          <Link to="/login" className="font-medium text-brand-700 hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  )
}

function RoleOption({ value, selected, onSelect, title, description }) {
  const isActive = selected === value

  return (
    <label
      className={`cursor-pointer rounded-lg border p-3 text-sm ${
        isActive ? 'border-brand-500 bg-brand-50' : 'border-slate-200 hover:border-slate-300'
      }`}
    >
      <input
        type="radio"
        name="role"
        value={value}
        checked={isActive}
        onChange={() => onSelect(value)}
        className="sr-only"
      />
      <span className="block font-medium text-slate-800">{title}</span>
      <span className="mt-1 block text-xs text-slate-500">{description}</span>
    </label>
  )
}

export default RegisterPage
