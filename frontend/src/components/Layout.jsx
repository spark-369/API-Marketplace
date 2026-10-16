import { useMemo } from 'react'
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAppDispatch, useAppSelector } from '../hooks'
import { logout } from '../store/authSlice'
import { selectIsAdmin, selectIsProvider } from '../store/authSlice'

/**
 * Application shell: header, role-adaptive sidebar and the routed content area.
 *
 * Navigation is derived from the caller's role rather than rendered-then-hidden, so a user never sees
 * links to pages the route guard would refuse.
 */
function Layout() {
  const dispatch = useAppDispatch()
  const navigate = useNavigate()

  const user = useAppSelector((state) => state.auth.user)
  const isAuthenticated = useAppSelector((state) => state.auth.isAuthenticated)
  const isAdmin = useAppSelector(selectIsAdmin)
  const isProvider = useAppSelector(selectIsProvider)
  const sidebarOpen = useAppSelector((state) => state.ui.sidebarOpen)

  const navigation = useMemo(() => buildNavigation({ isAuthenticated, isAdmin, isProvider }), [
    isAuthenticated,
    isAdmin,
    isProvider,
  ])

  function handleLogout() {
    dispatch(logout())
    navigate('/login', { replace: true })
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-content items-center justify-between gap-4 px-4 py-3">
          <Link to="/" className="flex items-center gap-2 text-lg font-semibold text-brand-700">
            <span aria-hidden="true" className="text-xl">
              ◈
            </span>
            API Marketplace
          </Link>

          <nav aria-label="Account" className="flex items-center gap-3 text-sm">
            {isAuthenticated ? (
              <>
                <Link to="/profile" className="text-slate-600 hover:text-brand-700">
                  {user?.firstName ? `${user.firstName} ${user.lastName}` : 'Profile'}
                </Link>
                <span className="badge bg-brand-100 text-brand-800">{user?.role}</span>
                <button type="button" className="btn btn-secondary btn-sm" onClick={handleLogout}>
                  Sign out
                </button>
              </>
            ) : (
              <>
                <Link to="/login" className="btn btn-secondary btn-sm">
                  Sign in
                </Link>
                <Link to="/register" className="btn btn-primary btn-sm">
                  Create account
                </Link>
              </>
            )}
          </nav>
        </div>
      </header>

      <div className="mx-auto flex max-w-content gap-6 px-4 py-6">
        <aside
          className={`w-56 shrink-0 ${sidebarOpen ? 'block' : 'hidden'} md:block`}
          aria-label="Main navigation"
        >
          <nav className="space-y-6">
            {navigation.map((group) => (
              <div key={group.label}>
                <p className="mb-2 px-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
                  {group.label}
                </p>
                <ul className="space-y-0.5">
                  {group.links.map((link) => (
                    <li key={link.to}>
                      <NavLink
                        to={link.to}
                        end={link.end}
                        className={({ isActive }) =>
                          `block rounded-md px-3 py-2 text-sm ${
                            isActive
                              ? 'bg-brand-50 font-medium text-brand-700'
                              : 'text-slate-600 hover:bg-slate-100'
                          }`
                        }
                      >
                        {link.label}
                      </NavLink>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
        </aside>

        <main className="min-w-0 flex-1">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

/**
 * Builds the sidebar structure for the current role.
 */
function buildNavigation({ isAuthenticated, isAdmin, isProvider }) {
  const browse = {
    label: 'Browse',
    links: [
      { to: '/', label: 'Home', end: true },
      { to: '/apis', label: 'API catalog' },
      { to: '/categories', label: 'Categories' },
    ],
  }

  const groups = [browse]

  if (isAuthenticated) {
    const consume = []

    // Providers publish rather than consume, so these links are absent for them.
    if (!isProvider) {
      consume.push(
        { to: '/me/subscriptions', label: 'My subscriptions' },
        { to: '/me/api-keys', label: 'My API keys' },
        { to: '/gateway', label: 'API console' },
      )
    }

    if (consume.length > 0) {
      groups.push({ label: 'Consume', links: consume })
    }
  }

  if (isProvider || isAdmin) {
    groups.push({
      label: 'Publish',
      links: [
        // Plans, Subscribers, API keys and Reviews are all scoped to a specific API, so they cannot
        // be linked directly from the sidebar — there is no apiId to put in the path. They are
        // reached from a card on My APIs, which is therefore the only destination that makes sense
        // here. Pointing at the legacy `/manage/*` paths would be a dead end: those routes exist only
        // to redirect back to /my-apis, so every click would appear to do nothing.
        { to: '/my-apis', label: 'My APIs', end: true },
      ],
    })
  }

  if (isAdmin) {
    groups.push({
      label: 'Administration',
      links: [
        { to: '/admin/users', label: 'Users' },
        { to: '/all/plans', label: 'All plans' },
        { to: '/all/reviews', label: 'All reviews' },
      ],
    })
  }

  return groups
}

export default Layout
