import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAppDispatch, useAppSelector } from '../hooks'
import { clearApiError, createApi, deleteApi, fetchMyApis, updateApi } from '../store/apisSlice'
import { fetchCategories } from '../store/categoriesSlice'
import ApiFormModal from '../components/ApiFormModal'
import ApiViewModal from '../components/ApiViewModal'
import { Alert, Badge, ConfirmModal, EmptyState, PageHeader, Skeleton } from '../components/ui'

/**
 * Provider workspace: the APIs this account owns, plus create/edit/delete and links into the
 * per-API management pages.
 */
function MyApisPage() {
  const dispatch = useAppDispatch()

  const apis = useAppSelector((state) => state.apis.mine)
  const status = useAppSelector((state) => state.apis.mineStatus)
  const error = useAppSelector((state) => state.apis.error)
  const categories = useAppSelector((state) => state.categories.items)

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [viewing, setViewing] = useState(null)
  const [deleting, setDeleting] = useState(null)
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState(null)

  useEffect(() => {
    dispatch(fetchMyApis())
    dispatch(fetchCategories())
  }, [dispatch])

  function openCreate() {
    setEditing(null)
    dispatch(clearApiError())
    setActionError(null)
    setFormOpen(true)
  }

  function openEdit(api) {
    setEditing(api)
    dispatch(clearApiError())
    setActionError(null)
    setFormOpen(true)
  }

  async function handleSubmit(payload) {
    setBusy(true)
    setActionError(null)

    const result = editing
      ? await dispatch(updateApi({ id: editing.id, payload }))
      : await dispatch(createApi(payload))

    setBusy(false)

    const failed = updateApi.rejected.match(result) || createApi.rejected.match(result)
    if (failed) {
      setActionError(result.payload?.message ?? 'Unable to save this API')
      return
    }
    setFormOpen(false)
    setEditing(null)
    dispatch(fetchMyApis())
  }

  async function handleDelete() {
    setBusy(true)
    await dispatch(deleteApi(deleting.id))
    setBusy(false)
    setDeleting(null)
  }

  return (
    <div>
      <PageHeader
        title="My APIs"
        description="Publish and maintain the APIs you own"
        actions={
          <button type="button" className="btn btn-primary" onClick={openCreate}>
            Publish new API
          </button>
        }
      />

      {actionError && (
        <Alert type="error" className="mb-4" onDismiss={() => setActionError(null)}>
          {actionError}
        </Alert>
      )}

      {status === 'loading' && (
        <div className="space-y-3">
          {[0, 1, 2].map((index) => (
            <Skeleton key={index} className="h-20 w-full" />
          ))}
        </div>
      )}

      {status === 'failed' && <div className="card text-sm text-red-600">{error}</div>}

      {status === 'succeeded' && apis.length === 0 && (
        <EmptyState
          title="You have not published any APIs yet"
          description="Create your first API to define plans, provision keys and start receiving traffic."
          action={
            <button type="button" className="btn btn-primary" onClick={openCreate}>
              Publish your first API
            </button>
          }
        />
      )}

      <ul className="space-y-3">
        {apis.map((api) => (
          <li key={api.id} className="card">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-semibold text-slate-900">{api.name}</h2>
                  <Badge tone={api.status === 'PUBLISHED' ? 'success' : 'neutral'}>{api.status}</Badge>
                  <Badge tone={api.visibility === 'PUBLIC' ? 'info' : 'warning'}>
                    {api.visibility}
                  </Badge>
                </div>
                <p className="mt-1 line-clamp-2 text-sm text-slate-500">
                  {api.description || 'No description provided.'}
                </p>
                <p className="mt-2 font-mono text-xs text-slate-400">{api.slug}</p>
              </div>

              <div className="flex flex-wrap gap-2">
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => setViewing(api)}>
                  View
                </button>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => openEdit(api)}>
                  Edit
                </button>
                <Link to={`/apis/${api.id}/plans`} className="btn btn-secondary btn-sm">
                  Plans
                </Link>
                <Link to={`/apis/${api.id}/keys`} className="btn btn-secondary btn-sm">
                  Keys
                </Link>
                <Link to={`/apis/${api.id}/subscriptions`} className="btn btn-secondary btn-sm">
                  Subscribers
                </Link>
                <button
                  type="button"
                  className="btn btn-danger btn-sm"
                  onClick={() => setDeleting(api)}
                >
                  Delete
                </button>
              </div>
            </div>
          </li>
        ))}
      </ul>

      <ApiFormModal
        open={formOpen}
        api={editing}
        categories={categories}
        onClose={() => {
          setFormOpen(false)
          setEditing(null)
        }}
        onSubmit={handleSubmit}
        busy={busy}
        error={actionError}
      />

      <ApiViewModal open={Boolean(viewing)} api={viewing} onClose={() => setViewing(null)} />

      <ConfirmModal
        open={Boolean(deleting)}
        title="Delete this API?"
        message={`Deleting "${deleting?.name}" also removes its plans, API keys, subscriptions and reviews. This cannot be undone.`}
        confirmLabel="Delete API"
        onConfirm={handleDelete}
        onCancel={() => setDeleting(null)}
        busy={busy}
      />
    </div>
  )
}

export default MyApisPage
