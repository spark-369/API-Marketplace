import { Routes, Route, Navigate } from 'react-router-dom'

import Layout from './components/Layout'
import ProtectedRoute from './components/ProtectedRoute'
import ToastHost from './components/ToastHost'

import HomePage from './pages/HomePage'
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import ApiListPage from './pages/ApiListPage'
import ApiDetailPage from './pages/ApiDetailPage'
import CategoriesPage from './pages/CategoriesPage'
import MyApisPage from './pages/MyApisPage'
import SubscriptionsPage from './pages/SubscriptionsPage'
import MyApiKeysPage from './pages/MyApiKeysPage'
import GatewayPage from './pages/GatewayPage'
import PlansPage from './pages/PlansPage'
import ReviewsPage from './pages/ReviewsPage'
import UsersPage from './pages/UsersPage'
import ProfilePage from './pages/ProfilePage'
import ApiKeysPage from './pages/ApiKeysPage'
import ApiSubscriptionsPage from './pages/ApiSubscriptionsPage'
import NotFoundPage from './pages/NotFoundPage'

/**
 * Route table.
 *
 * Guards are declared at the route level rather than inside each page so the access rules for the
 * whole application are readable in one place. Two conventions are worth noting:
 *
 * - `denyRoles` encodes the "providers cannot consume" rule, which cannot be expressed as an
 *   allow-list without enumerating every consuming role.
 * - The legacy `/manage/*` paths redirect to `/my-apis`, because managing plans or keys for
 *   "whichever API" only makes sense in the context of a specific API.
 */
function App() {
  return (
    <>
      <Routes>
        <Route element={<Layout />}>
          {/* ---- Public ---------------------------------------------------- */}
          <Route path="/" element={<HomePage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/apis" element={<ApiListPage />} />
          <Route path="/apis/:id" element={<ApiDetailPage />} />
          <Route path="/categories" element={<CategoriesPage />} />

          {/* ---- Authenticated (any role) ---------------------------------- */}
          <Route
            path="/profile"
            element={
              <ProtectedRoute>
                <ProfilePage />
              </ProtectedRoute>
            }
          />

          {/* ---- Consume (providers excluded) ------------------------------ */}
          <Route
            path="/me/subscriptions"
            element={
              <ProtectedRoute denyRoles={['PROVIDER']}>
                <SubscriptionsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/me/api-keys"
            element={
              <ProtectedRoute denyRoles={['PROVIDER']}>
                <MyApiKeysPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/gateway"
            element={
              <ProtectedRoute denyRoles={['PROVIDER']}>
                <GatewayPage />
              </ProtectedRoute>
            }
          />

          {/* ---- Publish (provider + admin) -------------------------------- */}
          <Route
            path="/my-apis"
            element={
              <ProtectedRoute roles={['PROVIDER', 'ADMIN']}>
                <MyApisPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/apis/:apiId/plans"
            element={
              <ProtectedRoute roles={['PROVIDER', 'ADMIN']}>
                <PlansPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/apis/:apiId/keys"
            element={
              <ProtectedRoute roles={['PROVIDER', 'ADMIN']}>
                <ApiKeysPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/apis/:apiId/subscriptions"
            element={
              <ProtectedRoute roles={['PROVIDER', 'ADMIN']}>
                <ApiSubscriptionsPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/apis/:apiId/reviews"
            element={
              <ProtectedRoute>
                <ReviewsPage />
              </ProtectedRoute>
            }
          />

          {/* Legacy management entry points. */}
          <Route path="/manage/plans" element={<Navigate to="/my-apis" replace />} />
          <Route path="/manage/subscriptions" element={<Navigate to="/my-apis" replace />} />
          <Route path="/manage/keys" element={<Navigate to="/my-apis" replace />} />
          <Route path="/manage/reviews" element={<Navigate to="/my-apis" replace />} />

          {/* ---- Administration -------------------------------------------- */}
          <Route
            path="/admin/users"
            element={
              <ProtectedRoute roles={['ADMIN']}>
                <UsersPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/all/plans"
            element={
              <ProtectedRoute roles={['ADMIN']}>
                <PlansPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/all/reviews"
            element={
              <ProtectedRoute roles={['ADMIN']}>
                <ReviewsPage />
              </ProtectedRoute>
            }
          />

          {/* ---- Fallback -------------------------------------------------- */}
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>

      <ToastHost />
    </>
  )
}

export default App

