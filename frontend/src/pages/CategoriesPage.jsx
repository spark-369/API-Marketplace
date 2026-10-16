import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAppDispatch, useAppSelector } from '../hooks'
import {
  clearCategoryError,
  createCategory,
  deleteCategory,
  fetchCategories,
  updateCategory,
} from '../store/categoriesSlice'
import { selectIsAdmin } from '../store/authSlice'
import { Alert, ConfirmModal, EmptyState, Modal, PageHeader, Skeleton } from '../components/ui'

/**
 * Category management. Browsing is public; the create/edit/delete controls appear only for admins,
 * mirroring the backend's `hasRole('ADMIN')` on those routes.
 */
function CategoriesPage() {
  const dispatch = useAppDispatch()

  const categories = useAppSelector((state) => state.categories.items)
  const status = useAppSelector((state) => state.categories.status)
  const error = useAppSelector((state) => state.categories.error)
  const isAdmin = useAppSelector(selectIsAdmin)

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [deleting, setDeleting] = useState(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    dispatch(fetchCategories())
  }, [dispatch])

  async function handleSubmit(event) {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)
    const payload = {
      name: formData.get('name'),
      description: formData.get('description') || null,
    }

    setBusy(true)
    const result = editing
      ? await dispatch(updateCategory({ id: editing.id, payload }))
      : await dispatch(createCategory(payload))
    setBusy(false)

    if (!updateCategory.rejected.match(result) && !createCategory.rejected.match(result)) {
      setFormOpen(false)
      setEditing(null)
    }
  }

  async function handleDelete() {
    setBusy(true)
    await dispatch(deleteCategory(deleting.id))
    setBusy(false)
    setDeleting(null)
  }

  return (
    <div>
      <PageHeader
        title="Categories"
        description="Classifications used to organise the API catalog"
        actions={
          isAdmin && (
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                setEditing(null)
                dispatch(clearCategoryError())
                setFormOpen(true)
              }}
            >
              New category
            </button>
          )
        }
      />

      {error && (
        <Alert type="error" className="mb-4" onDismiss={() => dispatch(clearCategoryError())}>
          {error}
        </Alert>
      )}

      {status === 'loading' && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((index) => (
            <Skeleton key={index} className="h-28 w-full" />
          ))}
        </div>
      )}

      {status === 'succeeded' && categories.length === 0 && (
        <EmptyState
          title="No categories defined"
          description={
            isAdmin
              ? 'Create a category to start organising the catalog.'
              : 'An administrator has not created any categories yet.'
          }
        />
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {categories.map((category) => (
          <div key={category.id} className="card flex flex-col">
            <h2 className="font-semibold text-slate-900">{category.name}</h2>
            <p className="mt-1 flex-1 text-sm text-slate-500">
              {category.description || 'No description provided.'}
            </p>

            <div className="mt-4 flex items-center justify-between">
              <span className="text-xs text-slate-400">
                {category.apiCount} {category.apiCount === 1 ? 'API' : 'APIs'}
              </span>

              <div className="flex gap-2">
                <Link to={`/apis?categoryId=${category.id}`} className="btn btn-secondary btn-sm">
                  View
                </Link>
                {isAdmin && (
                  <>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => {
                        setEditing(category)
                        dispatch(clearCategoryError())
                        setFormOpen(true)
                      }}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="btn btn-danger btn-sm"
                      onClick={() => setDeleting(category)}
                    >
                      Delete
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      <Modal
        open={formOpen}
        title={editing ? 'Edit category' : 'New category'}
        onClose={() => {
          setFormOpen(false)
          setEditing(null)
        }}
        size="sm"
        footer={
          <>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => {
                setFormOpen(false)
                setEditing(null)
              }}
              disabled={busy}
            >
              Cancel
            </button>
            <button type="submit" form="category-form" className="btn btn-primary" disabled={busy}>
              {busy ? 'Saving…' : 'Save'}
            </button>
          </>
        }
      >
        <form id="category-form" onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="category-name" className="mb-1 block text-sm font-medium text-slate-700">
              Name
            </label>
            <input
              id="category-name"
              name="name"
              className="input"
              defaultValue={editing?.name ?? ''}
              required
              maxLength={120}
            />
          </div>

          <div>
            <label
              htmlFor="category-description"
              className="mb-1 block text-sm font-medium text-slate-700"
            >
              Description
            </label>
            <textarea
              id="category-description"
              name="description"
              className="input min-h-20"
              defaultValue={editing?.description ?? ''}
              maxLength={1000}
            />
          </div>
        </form>
      </Modal>

      <ConfirmModal
        open={Boolean(deleting)}
        title="Delete this category?"
        message={`"${deleting?.name}" can only be deleted while no APIs are assigned to it.`}
        confirmLabel="Delete category"
        onConfirm={handleDelete}
        onCancel={() => setDeleting(null)}
        busy={busy}
      />
    </div>
  )
}

export default CategoriesPage
