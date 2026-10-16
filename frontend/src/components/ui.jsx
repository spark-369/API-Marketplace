import { useEffect, useRef } from 'react'

/**
 * Shared UI primitives.
 *
 * Kept in one module so the visual language (spacing, radius, colour) stays consistent without a
 * component library dependency. Each primitive takes className overrides rather than variant
 * explosion, matching the Tailwind utility-first approach used everywhere else.
 *
 * Date and price formatting live in `src/utils/format.js` rather than here, so this module exports
 * only components and therefore remains hot-swappable under React Fast Refresh.
 */

/**
 * Contextual message banner. Role is set from `type` so screen readers announce it.
 */
export function Alert({ type = 'info', title, children, onDismiss, className = '' }) {
  const styles = {
    info: 'bg-brand-50 text-brand-900 border-brand-200',
    success: 'bg-emerald-50 text-emerald-900 border-emerald-200',
    warning: 'bg-amber-50 text-amber-900 border-amber-200',
    error: 'bg-red-50 text-red-900 border-red-200',
  }

  return (
    <div
      role={type === 'error' ? 'alert' : 'status'}
      className={`flex items-start gap-3 rounded-lg border px-4 py-3 text-sm ${styles[type]} ${className}`}
    >
      <div className="flex-1">
        {title && <p className="font-semibold">{title}</p>}
        <div>{children}</div>
      </div>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss message"
          className="shrink-0 rounded px-1 text-lg leading-none opacity-60 hover:opacity-100"
        >
          ×
        </button>
      )}
    </div>
  )
}

/**
 * Inline loading spinner. `label` is exposed to assistive technology.
 */
export function Spinner({ size = 'md', label = 'Loading', className = '' }) {
  const sizes = { sm: 'h-4 w-4', md: 'h-6 w-6', lg: 'h-10 w-10' }

  return (
    <span role="status" className={`inline-flex items-center gap-2 ${className}`}>
      <span
        className={`${sizes[size]} animate-spin rounded-full border-2 border-slate-300 border-t-brand-600`}
        aria-hidden="true"
      />
      <span className="sr-only">{label}</span>
    </span>
  )
}

/**
 * Placeholder block shown while content loads.
 */
export function Skeleton({ className = 'h-4 w-full' }) {
  return <div className={`animate-pulse rounded bg-slate-200 ${className}`} aria-hidden="true" />
}

/**
 * Empty-state block with an optional call to action.
 */
export function EmptyState({ title, description, action, className = '' }) {
  return (
    <div className={`card flex flex-col items-center gap-3 py-12 text-center ${className}`}>
      <h3 className="text-lg font-semibold text-slate-800">{title}</h3>
      {description && <p className="max-w-md text-sm text-slate-500">{description}</p>}
      {action}
    </div>
  )
}

/**
 * Page title block with optional description and right-aligned actions.
 */
export function PageHeader({ title, description, actions, className = '' }) {
  return (
    <div className={`mb-6 flex flex-wrap items-start justify-between gap-4 ${className}`}>
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">{title}</h1>
        {description && <p className="mt-1 text-sm text-slate-500">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

/**
 * Status pill. Maps domain statuses onto a stable colour scheme.
 */
export function Badge({ children, tone = 'neutral', className = '' }) {
  const tones = {
    neutral: 'bg-slate-100 text-slate-700',
    success: 'bg-emerald-100 text-emerald-800',
    warning: 'bg-amber-100 text-amber-800',
    danger: 'bg-red-100 text-red-800',
    info: 'bg-brand-100 text-brand-800',
  }

  return (
    <span className={`badge ${tones[tone]} ${className}`}>
      {children}
    </span>
  )
}

/**
 * Accessible modal dialog.
 *
 * Implements the three behaviours that make a dialog usable rather than merely visible: focus moves
 * into the dialog on open, Escape closes it, and focus returns to the invoking element on close.
 * Body scroll is locked while open so the page behind cannot move.
 */
export function Modal({ open, title, onClose, children, footer, size = 'md' }) {
  const dialogRef = useRef(null)
  const previouslyFocused = useRef(null)

  useEffect(() => {
    if (!open) return undefined

    previouslyFocused.current = document.activeElement

    // Move focus to the first focusable element, falling back to the dialog itself.
    const focusable = dialogRef.current?.querySelector(
      'input, select, textarea, button, [href], [tabindex]:not([tabindex="-1"])',
    )
    focusable?.focus()

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        event.stopPropagation()
        onClose?.()
      }
    }
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = previousOverflow
      previouslyFocused.current?.focus?.()
    }
  }, [open, onClose])

  if (!open) return null

  const sizes = {
    sm: 'max-w-md',
    md: 'max-w-xl',
    lg: 'max-w-3xl',
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/50 p-4 sm:p-8">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`card w-full ${sizes[size]} my-8 shadow-raised`}
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
          <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="rounded px-2 text-xl leading-none text-slate-400 hover:text-slate-700"
          >
            ×
          </button>
        </div>

        <div className="px-5 py-4">{children}</div>

        {footer && (
          <div className="flex flex-wrap justify-end gap-2 border-t border-slate-200 px-5 py-4">
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * Confirmation dialog for destructive actions.
 *
 * A dedicated primitive so that destructive operations consistently require an explicit, labelled
 * confirmation rather than a bare `window.confirm`.
 */
export function ConfirmModal({
  open,
  title = 'Please confirm',
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  onConfirm,
  onCancel,
  busy = false,
  destructive = true,
}) {
  return (
    <Modal
      open={open}
      title={title}
      onClose={onCancel}
      size="sm"
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={busy}>
            {cancelLabel}
          </button>
          <button
            type="button"
            className={destructive ? 'btn btn-danger' : 'btn btn-primary'}
            onClick={onConfirm}
            disabled={busy}
          >
            {busy ? 'Working…' : confirmLabel}
          </button>
        </>
      }
    >
      <p className="text-sm text-slate-600">{message}</p>
    </Modal>
  )
}

/**
 * Renders a `field -> message` map produced by Bean Validation failures.
 */
export function FieldErrors({ errors }) {
  if (!errors || Object.keys(errors).length === 0) return null

  return (
    <ul className="mt-1 space-y-0.5 text-xs text-red-600">
      {Object.entries(errors).map(([field, message]) => (
        <li key={field}>
          <span className="font-medium">{field}</span>: {message}
        </li>
      ))}
    </ul>
  )
}
