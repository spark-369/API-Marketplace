import { useEffect, useState } from 'react'
import { Alert, FieldErrors, Modal } from './ui'

/**
 * Create/edit form for an API.
 *
 * A single state object keeps partial updates trivial and lets the submit handler send exactly what
 * the backend expects. Defaults are DRAFT + PRIVATE on create, matching the server's own defaults —
 * publishing is always an explicit act.
 */

const EMPTY_FORM = {
  name: '',
  slug: '',
  description: '',
  baseUrl: '',
  documentationUrl: '',
  status: 'DRAFT',
  visibility: 'PRIVATE',
  version: '1.0.0',
  categoryId: '',
}

function ApiFormModal({ open, api, categories = [], onClose, onSubmit, busy, error, fieldErrors }) {
  const [form, setForm] = useState(EMPTY_FORM)

  // Re-seed whenever the target API changes, so opening the edit dialog twice does not carry over
  // the previous record's values.
  useEffect(() => {
    if (!open) return
    if (api) {
      setForm({
        name: api.name ?? '',
        slug: api.slug ?? '',
        description: api.description ?? '',
        baseUrl: api.baseUrl ?? '',
        documentationUrl: api.documentationUrl ?? '',
        status: api.status ?? 'DRAFT',
        visibility: api.visibility ?? 'PRIVATE',
        version: api.version ?? '1.0.0',
        categoryId: api.categoryId ?? '',
      })
    } else {
      setForm(EMPTY_FORM)
    }
  }, [open, api])

  function update(field, value) {
    setForm((previous) => ({ ...previous, [field]: value }))
  }

  function handleSubmit(event) {
    event.preventDefault()
    // An empty categoryId means "no category" and must not be sent as an empty string.
    onSubmit({
      ...form,
      categoryId: form.categoryId === '' ? null : form.categoryId,
      documentationUrl: form.documentationUrl === '' ? null : form.documentationUrl,
    })
  }

  const isEdit = Boolean(api)

  return (
    <Modal
      open={open}
      title={isEdit ? 'Edit API' : 'Publish a new API'}
      onClose={onClose}
      size="lg"
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="submit" form="api-form" className="btn btn-primary" disabled={busy}>
            {busy ? 'Saving…' : isEdit ? 'Save changes' : 'Create API'}
          </button>
        </>
      }
    >
      <form id="api-form" onSubmit={handleSubmit} className="space-y-4">
        {error && <Alert type="error">{error}</Alert>}

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="api-name" className="mb-1 block text-sm font-medium text-slate-700">
              Name
            </label>
            <input
              id="api-name"
              className="input"
              value={form.name}
              onChange={(event) => update('name', event.target.value)}
              required
              maxLength={180}
            />
            <FieldErrors errors={fieldErrors} />
          </div>

          <div>
            <label htmlFor="api-slug" className="mb-1 block text-sm font-medium text-slate-700">
              Slug <span className="font-normal text-slate-400">(optional)</span>
            </label>
            <input
              id="api-slug"
              className="input"
              value={form.slug}
              onChange={(event) => update('slug', event.target.value)}
              placeholder="derived from the name when left blank"
              maxLength={200}
            />
          </div>
        </div>

        <div>
          <label htmlFor="api-description" className="mb-1 block text-sm font-medium text-slate-700">
            Description
          </label>
          <textarea
            id="api-description"
            className="input min-h-24"
            value={form.description}
            onChange={(event) => update('description', event.target.value)}
            maxLength={4000}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="api-base-url" className="mb-1 block text-sm font-medium text-slate-700">
              Upstream base URL
            </label>
            <input
              id="api-base-url"
              className="input"
              type="url"
              value={form.baseUrl}
              onChange={(event) => update('baseUrl', event.target.value)}
              placeholder="https://api.example.com"
              required
            />
            <p className="mt-1 text-xs text-slate-500">
              Must be a public http(s) endpoint. Internal and private addresses are rejected.
            </p>
          </div>

          <div>
            <label htmlFor="api-docs-url" className="mb-1 block text-sm font-medium text-slate-700">
              Documentation URL
            </label>
            <input
              id="api-docs-url"
              className="input"
              type="url"
              value={form.documentationUrl}
              onChange={(event) => update('documentationUrl', event.target.value)}
            />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label htmlFor="api-category" className="mb-1 block text-sm font-medium text-slate-700">
              Category
            </label>
            <select
              id="api-category"
              className="input"
              value={form.categoryId}
              onChange={(event) => update('categoryId', event.target.value)}
            >
              <option value="">No category</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="api-status" className="mb-1 block text-sm font-medium text-slate-700">
              Status
            </label>
            <select
              id="api-status"
              className="input"
              value={form.status}
              onChange={(event) => update('status', event.target.value)}
            >
              <option value="DRAFT">Draft</option>
              <option value="PUBLISHED">Published</option>
              <option value="ARCHIVED">Archived</option>
            </select>
          </div>

          <div>
            <label htmlFor="api-visibility" className="mb-1 block text-sm font-medium text-slate-700">
              Visibility
            </label>
            <select
              id="api-visibility"
              className="input"
              value={form.visibility}
              onChange={(event) => update('visibility', event.target.value)}
            >
              <option value="PRIVATE">Private</option>
              <option value="PUBLIC">Public</option>
            </select>
          </div>
        </div>

        <div className="sm:w-1/3">
          <label htmlFor="api-version" className="mb-1 block text-sm font-medium text-slate-700">
            Version
          </label>
          <input
            id="api-version"
            className="input"
            value={form.version}
            onChange={(event) => update('version', event.target.value)}
            maxLength={40}
          />
        </div>
      </form>
    </Modal>
  )
}

export default ApiFormModal
