import { useEffect } from 'react'
import { useAppDispatch, useAppSelector } from '../hooks'
import { refreshProfile, selectUser, updateProfile } from '../store/authSlice'
import { Alert, Badge, FieldErrors, PageHeader } from '../components/ui'
import { formatDate } from '../utils/format'

/**
 * Self-service profile page.
 *
 * Email and role are shown read-only: changing either is an administrative action with security
 * implications, so the inputs are disabled and the backend rejects them on this endpoint.
 */
function ProfilePage() {
  const dispatch = useAppDispatch()

  const user = useAppSelector(selectUser)
  const status = useAppSelector((state) => state.auth.status)
  const error = useAppSelector((state) => state.auth.error)
  const fieldErrors = useAppSelector((state) => state.auth.fieldErrors)
  const success = status === 'succeeded'

  useEffect(() => {
    dispatch(refreshProfile())
  }, [dispatch])

  function handleSubmit(event) {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)
    dispatch(
      updateProfile({
        firstName: formData.get('firstName'),
        lastName: formData.get('lastName'),
        bio: formData.get('bio') || null,
        avatarUrl: formData.get('avatarUrl') || null,
      }),
    )
  }

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Profile" description="Your account details" />

      <div className="card">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <p className="font-medium text-slate-800">{user?.email}</p>
            <p className="text-xs text-slate-400">
              Member since {formatDate(user?.createdAt, { withTime: false })}
            </p>
          </div>
          <Badge tone="info">{user?.role}</Badge>
        </div>

        {error && <Alert type="error" className="mb-4">{error}</Alert>}
        {success && !error && (
          <Alert type="success" className="mb-4">
            Your profile has been updated.
          </Alert>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="profile-first" className="mb-1 block text-sm font-medium text-slate-700">
                First name
              </label>
              <input
                id="profile-first"
                name="firstName"
                className="input"
                defaultValue={user?.firstName ?? ''}
                maxLength={80}
              />
              <FieldErrors errors={fieldErrors?.firstName ? { firstName: fieldErrors.firstName } : null} />
            </div>

            <div>
              <label htmlFor="profile-last" className="mb-1 block text-sm font-medium text-slate-700">
                Last name
              </label>
              <input
                id="profile-last"
                name="lastName"
                className="input"
                defaultValue={user?.lastName ?? ''}
                maxLength={80}
              />
            </div>
          </div>

          <div>
            <label htmlFor="profile-email" className="mb-1 block text-sm font-medium text-slate-700">
              Email
            </label>
            <input
              id="profile-email"
              className="input bg-slate-50"
              value={user?.email ?? ''}
              disabled
              readOnly
            />
            <p className="mt-1 text-xs text-slate-500">
              Only an administrator can change the address on your account.
            </p>
          </div>

          <div>
            <label htmlFor="profile-avatar" className="mb-1 block text-sm font-medium text-slate-700">
              Avatar URL
            </label>
            <input
              id="profile-avatar"
              name="avatarUrl"
              className="input"
              type="url"
              defaultValue={user?.avatarUrl ?? ''}
              maxLength={500}
            />
          </div>

          <div>
            <label htmlFor="profile-bio" className="mb-1 block text-sm font-medium text-slate-700">
              Bio
            </label>
            <textarea
              id="profile-bio"
              name="bio"
              className="input min-h-28"
              defaultValue={user?.bio ?? ''}
              maxLength={1000}
            />
          </div>

          <button type="submit" className="btn btn-primary" disabled={status === 'loading'}>
            {status === 'loading' ? 'Saving…' : 'Save changes'}
          </button>
        </form>
      </div>
    </div>
  )
}

export default ProfilePage
