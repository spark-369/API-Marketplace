import { Badge, Modal } from './ui'
import { formatDate } from '../utils/format'

/**
 * Read-only detail view for an API.
 *
 * Uses a description list so the label/value pairing is conveyed to assistive technology rather than
 * relying on visual layout alone.
 */
function ApiViewModal({ open, api, onClose }) {
  if (!api) return null

  return (
    <Modal open={open} title={api.name} onClose={onClose} size="lg">
      <div className="space-y-5">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={api.status === 'PUBLISHED' ? 'success' : 'neutral'}>{api.status}</Badge>
          <Badge tone={api.visibility === 'PUBLIC' ? 'info' : 'warning'}>{api.visibility}</Badge>
          <Badge tone="neutral">v{api.version}</Badge>
        </div>

        <p className="text-sm text-slate-600">{api.description || 'No description provided.'}</p>

        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <Detail label="Owner" value={api.ownerName} />
          <Detail label="Owner email" value={api.ownerEmail} />
          <Detail label="Category" value={api.categoryName ?? 'Uncategorised'} />
          <Detail label="Slug" value={api.slug} />
          <Detail label="Base URL" value={api.baseUrl} mono />
          <Detail label="Documentation" value={api.documentationUrl ?? '—'} mono />
          <Detail
            label="Rating"
            value={api.reviewCount > 0
              ? `${Number(api.averageRating).toFixed(2)} from ${api.reviewCount} reviews`
              : 'Not yet rated'}
          />
          <Detail label="Created" value={formatDate(api.createdAt)} />
          <Detail label="Last updated" value={formatDate(api.updatedAt)} />
        </dl>
      </div>
    </Modal>
  )
}

function Detail({ label, value, mono = false }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className={`mt-0.5 break-words text-slate-700 ${mono ? 'font-mono text-xs' : ''}`}>
        {value ?? '—'}
      </dd>
    </div>
  )
}

export default ApiViewModal
