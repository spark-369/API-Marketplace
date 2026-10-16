/**
 * Display formatters.
 *
 * Kept separate from the component module because mixing non-component exports with components breaks
 * React Fast Refresh (the plugin cannot tell a module with mixed exports is safe to hot-swap).
 */

/**
 * Formats an ISO timestamp for display, returning an em dash for empty or unparseable values.
 *
 * Tables and cards call this unconditionally, so a null must not render "Invalid Date".
 */
export function formatDate(value, { withTime = true } = {}) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}),
  })
}

/**
 * Formats a price, labelling zero (and anything non-numeric) as "Free".
 */
export function formatPrice(value) {
  const numeric = Number(value ?? 0)
  if (!Number.isFinite(numeric) || numeric === 0) return 'Free'
  return numeric.toLocaleString(undefined, { style: 'currency', currency: 'USD' })
}
