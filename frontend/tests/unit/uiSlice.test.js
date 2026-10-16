import { describe, it, expect } from 'vitest'
import uiReducer, {
  showToast,
  dismissToast,
  clearToasts,
  openModal,
  closeModal,
  toggleSidebar,
  setSidebar,
  selectToasts,
  selectModal,
  selectSidebarOpen,
} from '../../src/store/uiSlice'

/**
 * Tests for the ephemeral UI slice.
 *
 * The toast cap is the interesting behaviour: without it, a burst of failures (say, a polling request
 * failing repeatedly) would stack notifications until the viewport is unusable.
 */

const initial = uiReducer(undefined, { type: '@@INIT' })

describe('uiSlice', () => {
  describe('toasts', () => {
    it('starts empty', () => {
      expect(initial.toasts).toEqual([])
    })

    it('adds a toast with a generated id and default type', () => {
      const next = uiReducer(initial, showToast({ message: 'Saved' }))

      expect(next.toasts).toHaveLength(1)
      expect(next.toasts[0]).toMatchObject({ message: 'Saved', type: 'info' })
      expect(next.toasts[0].id).toBeTruthy()
    })

    it('honours an explicit type and timeout', () => {
      const next = uiReducer(
        initial,
        showToast({ message: 'Failed', type: 'error', timeout: 0 }),
      )

      expect(next.toasts[0].type).toBe('error')
      expect(next.toasts[0].timeout).toBe(0)
    })

    it('assigns distinct ids to successive toasts', () => {
      let state = uiReducer(initial, showToast({ message: 'one' }))
      state = uiReducer(state, showToast({ message: 'two' }))

      expect(state.toasts[0].id).not.toBe(state.toasts[1].id)
    })

    it('caps the queue, discarding the oldest entries', () => {
      let state = initial
      for (let i = 1; i <= 6; i += 1) {
        state = uiReducer(state, showToast({ message: `toast-${i}` }))
      }

      expect(state.toasts).toHaveLength(4)
      expect(state.toasts.map((toast) => toast.message)).toEqual([
        'toast-3',
        'toast-4',
        'toast-5',
        'toast-6',
      ])
    })

    it('dismisses a single toast by id', () => {
      let state = uiReducer(initial, showToast({ message: 'keep' }))
      state = uiReducer(state, showToast({ message: 'drop' }))
      const target = state.toasts[1].id

      state = uiReducer(state, dismissToast(target))

      expect(state.toasts).toHaveLength(1)
      expect(state.toasts[0].message).toBe('keep')
    })

    it('ignores a dismissal for an unknown id', () => {
      const state = uiReducer(initial, showToast({ message: 'keep' }))

      const next = uiReducer(state, dismissToast('does-not-exist'))

      expect(next.toasts).toHaveLength(1)
    })

    it('clears every toast', () => {
      let state = uiReducer(initial, showToast({ message: 'a' }))
      state = uiReducer(state, showToast({ message: 'b' }))

      state = uiReducer(state, clearToasts())

      expect(state.toasts).toEqual([])
    })
  })

  describe('modal registry', () => {
    it('starts closed', () => {
      expect(initial.modal).toBeNull()
    })

    it('opens with a name', () => {
      expect(uiReducer(initial, openModal('api-form')).modal).toBe('api-form')
    })

    it('defaults the name when none is given', () => {
      expect(uiReducer(initial, openModal()).modal).toBe('default')
    })

    it('closes', () => {
      const open = uiReducer(initial, openModal('x'))

      expect(uiReducer(open, closeModal()).modal).toBeNull()
    })
  })

  describe('sidebar', () => {
    it('starts closed', () => {
      expect(initial.sidebarOpen).toBe(false)
    })

    it('toggles', () => {
      expect(uiReducer(initial, toggleSidebar()).sidebarOpen).toBe(true)
      expect(uiReducer(uiReducer(initial, toggleSidebar()), toggleSidebar()).sidebarOpen).toBe(false)
    })

    it('sets an explicit value, coercing truthiness', () => {
      expect(uiReducer(initial, setSidebar(1)).sidebarOpen).toBe(true)
      expect(uiReducer(initial, setSidebar(0)).sidebarOpen).toBe(false)
    })
  })

  describe('selectors', () => {
    it('read the expected slices', () => {
      expect(selectSidebarOpen({ ui: { sidebarOpen: true } })).toBe(true)
      expect(selectModal({ ui: { modal: 'x' } })).toBe('x')
      expect(selectToasts({ ui: { toasts: [] } })).toEqual([])
    })
  })
})
