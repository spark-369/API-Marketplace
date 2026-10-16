import { configureStore } from '@reduxjs/toolkit'
import authReducer from './authSlice'
import apisReducer from './apisSlice'
import categoriesReducer from './categoriesSlice'
import plansReducer from './plansSlice'
import reviewsReducer from './reviewsSlice'
import subscriptionsReducer from './subscriptionsSlice'
import apiKeysReducer from './apiKeysSlice'
import usersReducer from './usersSlice'
import uiReducer from './uiSlice'

/**
 * Root reducer map.
 *
 * Exported separately from the store so tests can build an isolated store with `preloadedState`
 * against exactly the same shape the application uses.
 */
export const rootReducer = {
  auth: authReducer,
  apis: apisReducer,
  categories: categoriesReducer,
  plans: plansReducer,
  reviews: reviewsReducer,
  subscriptions: subscriptionsReducer,
  apiKeys: apiKeysReducer,
  users: usersReducer,
  ui: uiReducer,
}

export const store = configureStore({
  reducer: rootReducer,
  // redux-thunk is included by default; serialisability checks stay on so accidental
  // non-serialisable values in state surface during development rather than in production.
  devTools: import.meta.env.MODE !== 'production',
})

export default store
