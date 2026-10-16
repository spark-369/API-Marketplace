import { useEffect } from 'react'
import { useAppDispatch, useAppSelector } from '../hooks'
import { dismissToast } from '../store/uiSlice'

/**
 * Renders the toast queue from `uiSlice`.
 *
 * Each toast schedules its own dismissal. The timer is owned by the toast component rather than the
 * reducer because Redux reducers must stay pure — scheduling side effects there would break replay and
 * devtools time travel.
 */
function ToastHost() {
  const toasts = useAppSelector((state) => state.ui.toasts)

  if (toasts.length === 0) return null

  return (
    <div
      aria-live="polite"
      aria-atomic="false"
      className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-full max-w-sm flex-col gap-2"
    >
      {toasts.map((toast) => (
        <Toast key={toast.id} toast={toast} />
      ))}
    </div>
  )
}

function Toast({ toast }) {
  const dispatch = useAppDispatch()

  useEffect(() => {
    if (!toast.timeout) return undefined
    const timer = setTimeout(() => dispatch(dismissToast(toast.id)), toast.timeout)
    return () => clearTimeout(timer)
  }, [toast.id, toast.timeout, dispatch])

  const styles = {
    info: 'border-brand-200 bg-white text-slate-800',
    success: 'border-emerald-200 bg-white text-emerald-900',
    warning: 'border-amber-200 bg-white text-amber-900',
    error: 'border-red-200 bg-white text-red-900',
  }

  return (
    <div
      role={toast.type === 'error' ? 'alert' : 'status'}
      className={`pointer-events-auto flex items-start justify-between gap-3 rounded-lg border px-4 py-3 shadow-card ${styles[toast.type] ?? styles.info}`}
    >
      <p className="text-sm">{toast.message}</p>
      <button
        type="button"
        onClick={() => dispatch(dismissToast(toast.id))}
        aria-label="Dismiss notification"
        className="shrink-0 rounded px-1 text-lg leading-none opacity-50 hover:opacity-100"
      >
        ×
      </button>
    </div>
  )
}

export default ToastHost
