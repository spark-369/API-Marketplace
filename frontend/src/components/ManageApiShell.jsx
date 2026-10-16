import { useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { useAppDispatch } from '../hooks'
import { clearCurrentApi, fetchApiById } from '../store/apisSlice'
import { useAppSelector } from '../hooks'
import { Alert, PageHeader, Skeleton } from './ui'

/**
 * Shell shared by the provider's per-API management pages.
 *
 * The `/manage/*` routes operate on "whichever API you are working on", which has to come from the URL
 * rather than component state — otherwise a refresh loses the context. This shell resolves `:apiId`
 * from the route, loads the API, and renders the supplied management view inside a consistent header.
 */
function ManageApiShell({ title, description, children }) {
  const { apiId } = useParams()
  const dispatch = useAppDispatch()

  const api = useAppSelector((state) => state.apis.current)
  const status = useAppSelector((state) => state.apis.currentStatus)
  const error = useAppSelector((state) => state.apis.error)

  useEffect(() => {
    if (apiId) {
      dispatch(fetchApiById(apiId))
    }
    return () => {
      // Release the detail record so navigating between managed APIs cannot show stale data.
      dispatch(clearCurrentApi())
    }
  }, [apiId, dispatch])

  if (!apiId) {
    return (
      <Alert type="warning" title="No API selected">
        Choose an API from <span className="font-medium">My APIs</span> to manage its resources.
      </Alert>
    )
  }

  if (status === 'loading') {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-full max-w-md" />
        <Skeleton className="h-40 w-full" />
      </div>
    )
  }

  if (status === 'failed') {
    return (
      <Alert type="error" title="Unable to load this API">
        {error}
      </Alert>
    )
  }

  return (
    <div>
      <PageHeader
        title={title}
        description={api ? `${description} · ${api.name}` : description}
      />
      {children}
    </div>
  )
}

export default ManageApiShell
