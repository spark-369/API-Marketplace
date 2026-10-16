import { useEffect, useState } from 'react'
import { useAppDispatch, useAppSelector } from '../hooks'
import {
  clearUserError,
  deleteUserAsAdmin,
  fetchUsers,
  updateUserAsAdmin,
} from '../store/usersSlice'
import { Alert, Badge, ConfirmModal, EmptyState, Modal, PageHeader, Skeleton } from '../components/ui'
import { formatDate } from '../utils/format'

/**
 * Administrative user directory.
 *
 * Deletion is blocked server-side while the account still owns APIs, keys, subscriptions or reviews;
 * that conflict is surfaced here rather than hidden, so the admin understands they must reassign
 * those records first.
 */
function UsersPage() {
  const dispatch = useAppDispatch()

  const users = useAppSelector((state) => state.users.items)
  const status = useAppSelector((state) => state.users.status)
  const error = useAppSelector((state) => state.users.error)

  const [editing, setEditing] = useState(null)
  const [deleting, setDeleting] = useState(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    dispatch(fetchUsers({ size: 50 }))
  }, [dispatch])

  async function handleSubmit(event) {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)
    const payload = {
      firstName: formData.get('firstName'),
      lastName: formData.get('lastName'),
      role: formData.get('role'),
      // An empty string would fail validation, so blank means "leave the credential alone".
      password: formData.get('password') || null,
    }

    setBusy(true)
    const result = await dispatch(updateUserAsAdmin({ id: editing.id, payload }))
    setBusy(false)

    if (!updateUserAsAdmin.rejected.match(result)) {
      setEditing(null)
    }
  }

  async function handleDelete() {
    setBusy(true)
    await dispatch(deleteUserAsAdmin(deleting.id))
    setBusy(false)
    setDeleting(null)
  }

  return (
    <div>
      <PageHeader title="Users" description="Manage marketplace accounts and roles" />

      {error && (
        <Alert type="error" className="mb-4" onDismiss={() => dispatch(clearUserError())}>
          {error}
        </Alert>
      )}

      {status === 'loading' && (
        <div className="space-y-3">
          {[0, 1, 2].map((index) => (
            <Skeleton key={index} className="h-16 w-full" />
          ))}
        </div>
      )}

      {status === 'succeeded' && users.length === 0 && (
        <EmptyState title="No users" description="No accounts have been created yet." />
      )}

      {users.length > 0 && (
        <div className="card overflow-x-auto p-0">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-400">
              <tr>
                <th scope="col" className="px-4 py-3">Name</th>
                <th scope="col" className="px-4 py-3">Email</th>
                <th scope="col" className="px-4 py-3">Role</th>
                <th scope="col" className="px-4 py-3">Joined</th>
                <th scope="col" className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id} className="border-b border-slate-100 last:border-0">
                  <td className="px-4 py-3 font-medium text-slate-800">{user.fullName}</td>
                  <td className="px-4 py-3 text-slate-600">{user.email}</td>
                  <td className="px-4 py-3">
                    <Badge
                      tone={
                        user.role === 'ADMIN'
                          ? 'danger'
                          : user.role === 'PROVIDER'
                            ? 'info'
                            : 'neutral'
                      }
                    >
                      {user.role}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-slate-500">
                    {formatDate(user.createdAt, { withTime: false })}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => {
                          dispatch(clearUserError())
                          setEditing(user)
                        }}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="btn btn-danger btn-sm"
                        onClick={() => {
                          dispatch(clearUserError())
                          setDeleting(user)
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        open={Boolean(editing)}
        title={`Edit ${editing?.fullName ?? 'user'}`}
        onClose={() => setEditing(null)}
        size="md"
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
            <button type="submit" form="user-form" className="btn btn-primary" disabled={busy}>
              {busy ? 'Saving…' : 'Save'}
            </button>
          </>
        }
      >
        <form id="user-form" onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="user-first" className="mb-1 block text-sm font-medium text-slate-700">
                First name
              </label>
              <input
                id="user-first"
                name="firstName"
                className="input"
                defaultValue={editing?.firstName ?? ''}
                maxLength={80}
              />
            </div>
            <div>
              <label htmlFor="user-last" className="mb-1 block text-sm font-medium text-slate-700">
                Last name
              </label>
              <input
                id="user-last"
                name="lastName"
                className="input"
                defaultValue={editing?.lastName ?? ''}
                maxLength={80}
              />
            </div>
          </div>

          <div>
            <label htmlFor="user-role" className="mb-1 block text-sm font-medium text-slate-700">
              Role
            </label>
            <select id="user-role" name="role" className="input" defaultValue={editing?.role}>
              <option value="DEVELOPER">Developer</option>
              <option value="PROVIDER">Provider</option>
              <option value="ADMIN">Administrator</option>
            </select>
          </div>

          <div>
            <label htmlFor="user-password" className="mb-1 block text-sm font-medium text-slate-700">
              Reset password
            </label>
            <input
              id="user-password"
              name="password"
              className="input"
              type="password"
              autoComplete="new-password"
              placeholder="Leave blank to keep the current password"
              minLength={8}
            />
          </div>
        </form>
      </Modal>

      <ConfirmModal
        open={Boolean(deleting)}
        title="Delete this account?"
        message={`"${deleting?.fullName}" can only be deleted once they no longer own any APIs, keys, subscriptions or reviews.`}
        confirmLabel="Delete account"
        onConfirm={handleDelete}
        onCancel={() => setDeleting(null)}
        busy={busy}
      />
    </div>
  )
}

export default UsersPage
