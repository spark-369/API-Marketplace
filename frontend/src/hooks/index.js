import { useDispatch, useSelector } from 'react-redux'

/**
 * Typed-by-convention accessors.
 *
 * The project is JavaScript rather than TypeScript, so these wrappers cannot add compile-time
 * checking; their value is consistency (one import site to change if middleware is added later) and
 * preventing accidental use of the raw `react-redux` hooks with a different store.
 */
export const useAppDispatch = () => useDispatch()

export const useAppSelector = useSelector
