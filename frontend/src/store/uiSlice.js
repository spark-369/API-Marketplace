import { createSlice, nanoid } from '@reduxjs/toolkit'

/**
 * Ephemeral client-only UI state: toasts, the modal registry, and the sidebar.
 *
 * Nothing here is server-derived, which is why it lives apart from the domain slices: clearing or
 * reshaping it can never lose persisted data.
 */

const initialState = {
  toasts: [],
  modal: null,
  sidebarOpen: false,
}

const TOAST_LIMIT = 4

const uiSlice = createSlice({
  name: 'ui',
  initialState,
  reducers: {
    /**
     * Raises a toast. Type is one of success | error | info | warning.
     */
    showToast: {
      reducer(state, action) {
        state.toasts.push(action.payload)
        // Keep the newest few only, so a burst of failures cannot bury the UI.
        if (state.toasts.length > TOAST_LIMIT) {
          state.toasts = state.toasts.slice(-TOAST_LIMIT)
        }
      },
      prepare({ message, type = 'info', timeout = 5000 }) {
        return { payload: { id: nanoid(), message, type, timeout } }
      },
    },

    dismissToast(state, action) {
      state.toasts = state.toasts.filter((toast) => toast.id !== action.payload)
    },

    clearToasts(state) {
      state.toasts = []
    },

    openModal(state, action) {
      state.modal = action.payload ?? 'default'
    },

    closeModal(state) {
      state.modal = null
    },

    toggleSidebar(state) {
      state.sidebarOpen = !state.sidebarOpen
    },

    setSidebar(state, action) {
      state.sidebarOpen = Boolean(action.payload)
    },
  },
})

export const {
  showToast,
  dismissToast,
  clearToasts,
  openModal,
  closeModal,
  toggleSidebar,
  setSidebar,
} = uiSlice.actions

export const selectToasts = (state) => state.ui.toasts
export const selectModal = (state) => state.ui.modal
export const selectSidebarOpen = (state) => state.ui.sidebarOpen

export default uiSlice.reducer
