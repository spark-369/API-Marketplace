import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAppDispatch, useAppSelector } from '../hooks'
import { fetchApis } from '../store/apisSlice'
import { fetchCategories } from '../store/categoriesSlice'
import { Badge, EmptyState, PageHeader, Skeleton } from '../components/ui'

/**
 * Public API catalog with category filtering and free-text search.
 *
 * Search is debounced because each keystroke would otherwise issue a request; the debounce is the one
 * place in the app where a timer is used deliberately.
 */
function ApiListPage() {
  const dispatch = useAppDispatch()

  const apis = useAppSelector((state) => state.apis.items)
  const status = useAppSelector((state) => state.apis.status)
  const error = useAppSelector((state) => state.apis.error)
  const pagination = useAppSelector((state) => ({
    page: state.apis.page,
    totalPages: state.apis.totalPages,
    totalElements: state.apis.totalElements,
  }))
  const categories = useAppSelector((state) => state.categories.items)

  const [categoryId, setCategoryId] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)

  useEffect(() => {
    dispatch(fetchCategories())
  }, [dispatch])

  // Debounce the search term so typing does not fire a request per character.
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput)
      setPage(0)
    }, 300)
    return () => clearTimeout(timer)
  }, [searchInput])

  useEffect(() => {
    dispatch(fetchApis({ categoryId: categoryId || undefined, search: search || undefined, page, size: 12 }))
  }, [dispatch, categoryId, search, page])

  return (
    <div>
      <PageHeader
        title="API catalog"
        description="Discover published APIs available for subscription"
      />

      <div className="card mb-6 grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="catalog-search" className="mb-1 block text-sm font-medium text-slate-700">
            Search
          </label>
          <input
            id="catalog-search"
            className="input"
            type="search"
            placeholder="Search by name or description"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
          />
        </div>

        <div>
          <label htmlFor="catalog-category" className="mb-1 block text-sm font-medium text-slate-700">
            Category
          </label>
          <select
            id="catalog-category"
            className="input"
            value={categoryId}
            onChange={(event) => {
              setCategoryId(event.target.value)
              setPage(0)
            }}
          >
            <option value="">All categories</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {status === 'loading' && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2, 3, 4, 5].map((index) => (
            <div key={index} className="card space-y-3">
              <Skeleton className="h-5 w-3/4" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-1/2" />
            </div>
          ))}
        </div>
      )}

      {status === 'failed' && (
        <div className="card text-sm text-red-600">{error}</div>
      )}

      {status === 'succeeded' && apis.length === 0 && (
        <EmptyState
          title="No APIs matched your filters"
          description="Try a different search term or category."
        />
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {status === 'succeeded' &&
          apis.map((api) => (
            <Link key={api.id} to={`/apis/${api.id}`} className="card transition hover:shadow-raised">
              <div className="flex items-start justify-between gap-3">
                <h3 className="font-semibold text-slate-900">{api.name}</h3>
                <Badge tone="neutral">v{api.version}</Badge>
              </div>

              <p className="mt-2 line-clamp-3 text-sm text-slate-500">
                {api.description || 'No description provided.'}
              </p>

              <div className="mt-4 flex items-center justify-between text-xs text-slate-400">
                <span>{api.categoryName ?? 'Uncategorised'}</span>
                <span>{api.ownerName}</span>
              </div>
            </Link>
          ))}
      </div>

      {pagination.totalPages > 1 && (
        <nav aria-label="Pagination" className="mt-6 flex items-center justify-between text-sm">
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => setPage((current) => Math.max(0, current - 1))}
            disabled={pagination.page === 0}
          >
            Previous
          </button>
          <span className="text-slate-500">
            Page {pagination.page + 1} of {pagination.totalPages} · {pagination.totalElements} APIs
          </span>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => setPage((current) => current + 1)}
            disabled={pagination.page + 1 >= pagination.totalPages}
          >
            Next
          </button>
        </nav>
      )}
    </div>
  )
}

export default ApiListPage
