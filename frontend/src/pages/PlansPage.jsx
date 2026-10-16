import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAppDispatch, useAppSelector } from '../hooks'
import {
  createPlan,
  deletePlan,
  fetchAllPlans,
  fetchPlansForApi,
  selectPlansByApi,
  updatePlan,
} from '../store/plansSlice'
import { selectIsAdmin } from '../store/authSlice'
import ManageApiShell from '../components/ManageApiShell'
import { Alert, ConfirmModal, EmptyState, Modal, Skeleton } from '../components/ui'
import { formatPrice } from '../utils/format'

/**
 * Plan management for a single API.
 *
 * Reachable two ways: as an admin overview (`/all/plans`) and as a provider's per-API view
 * (`/apis/:apiId/plans`). The presence of `apiId` in the route selects between them, so the same
 * component serves both without duplicating the form.
 */
function PlansPage() {
  const { apiId } = useParams()
  const dispatch = useAppDispatch()

  const isAdminOverview = !apiId
  const allPlans = useAppSelector((state) => state.plans.all)
  const apiPlans = useAppSelector(selectPlansByApi(apiId))
  const error = useAppSelector((state) => state.plans.error)
  const status = useAppSelector((state) => state.plans.status)
  const isAdmin = useAppSelector(selectIsAdmin)

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [deleting, setDeleting] = useState(null)
  const [busy, setBusy] = useState(false)

  const plans = isAdminOverview ? allPlans : apiPlans

  useEffect(() => {
    if (apiId) {
      dispatch(fetchPlansForApi(apiId))
    } else {
      // Admin overview at /all/plans: there is no API in the route, so fetch every plan instead.
      // Without this branch the page renders its heading over an empty list, because nothing populates
      // `state.plans.all`.
      dispatch(fetchAllPlans({ size: 50 }))
    }
  }, [dispatch, apiId])

  async function handleSubmit(event) {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)
    const payload = {
      name: formData.get('name'),
      description: formData.get('description') || null,
      price: Number(formData.get('price') || 0),
      rateLimit: Number(formData.get('rateLimit') || 60),
      ratePeriod: formData.get('ratePeriod'),
      supportLevel: formData.get('supportLevel') || 'COMMUNITY',
    }

    setBusy(true)
    const result = editing
      ? await dispatch(updatePlan({ apiId: editing.apiId, planId: editing.id, payload }))
      : await dispatch(createPlan({ apiId, payload }))
    setBusy(false)

    if (!updatePlan.rejected.match(result) && !createPlan.rejected.match(result)) {
      setFormOpen(false)
      setEditing(null)
    }
  }

  async function handleDelete() {
    setBusy(true)
    await dispatch(deletePlan({ apiId: deleting.apiId, planId: deleting.id }))
    setBusy(false)
    setDeleting(null)
    if (apiId) {
      dispatch(fetchPlansForApi(apiId))
    }
  }

  return (
    <>
      {isAdminOverview ? (
        <div>
          <h1 className="mb-6 text-2xl font-semibold text-slate-900">All plans</h1>
          <PlanList
            plans={plans}
            status={status}
            error={error}
            onEdit={(plan) => {
              setEditing(plan)
              setFormOpen(true)
            }}
            onDelete={setDeleting}
          />
          {isAdmin && (
            <p className="mt-4 text-xs text-slate-400">
              As an administrator you can edit any plan. Providers manage their own via{' '}
              <Link to="/my-apis" className="underline">
                My APIs
              </Link>
              .
            </p>
          )}
        </div>
      ) : (
        <ManageApiShell title="Plans" description="Pricing tiers and gateway quotas">
          <button
            type="button"
            className="btn btn-primary mb-4"
            onClick={() => {
              setEditing(null)
              setFormOpen(true)
            }}
          >
            New plan
          </button>
          <PlanList
            plans={plans}
            status={status}
            error={error}
            onEdit={(plan) => {
              setEditing(plan)
              setFormOpen(true)
            }}
            onDelete={setDeleting}
          />
        </ManageApiShell>
      )}

      <PlanFormModal
        open={formOpen}
        plan={editing}
        busy={busy}
        error={error}
        onClose={() => {
          setFormOpen(false)
          setEditing(null)
        }}
        onSubmit={handleSubmit}
      />

      <ConfirmModal
        open={Boolean(deleting)}
        title="Delete this plan?"
        message="A plan can only be deleted while no API keys or subscriptions reference it."
        confirmLabel="Delete plan"
        onConfirm={handleDelete}
        onCancel={() => setDeleting(null)}
        busy={busy}
      />
    </>
  )
}

/**
 * Renders a grid of plans with edit/delete controls.
 */
function PlanList({ plans, status, error, onEdit, onDelete }) {
  return (
    <>
      {error && (
        <Alert type="error" className="mb-4">
          {error}
        </Alert>
      )}

      {status === 'loading' && (
        <div className="space-y-3">
          {[0, 1].map((index) => (
            <Skeleton key={index} className="h-24 w-full" />
          ))}
        </div>
      )}

      {plans.length === 0 && status !== 'loading' && (
        <EmptyState
          title="No plans defined"
          description="Plans define the quota the gateway enforces. Create one to let subscribers choose a tier."
        />
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {plans.map((plan) => (
          <div key={plan.id} className="card flex flex-col">
            <div className="flex items-start justify-between gap-2">
              <h2 className="font-semibold text-slate-900">{plan.name}</h2>
              <span className="text-sm font-medium text-brand-700">{formatPrice(plan.price)}</span>
            </div>

            <p className="mt-1 flex-1 text-sm text-slate-500">
              {plan.description || 'No description provided.'}
            </p>

            <p className="mt-3 text-xs text-slate-400">
              {plan.rateLimit.toLocaleString()} / {plan.ratePeriod.toLowerCase()} · {plan.supportLevel}
            </p>

            {plan.apiName && <p className="mt-1 text-xs text-slate-400">API: {plan.apiName}</p>}

            <div className="mt-4 flex justify-end gap-2">
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => onEdit(plan)}>
                Edit
              </button>
              <button type="button" className="btn btn-danger btn-sm" onClick={() => onDelete(plan)}>
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>
    </>
  )
}

/**
 * Create/edit form for a plan, including the quota fields the gateway enforces.
 */
function PlanFormModal({ open, plan, busy, error, onClose, onSubmit }) {
  return (
    <Modal
      open={open}
      title={plan ? 'Edit plan' : 'New plan'}
      onClose={onClose}
      size="md"
      footer={
        <>
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="submit" form="plan-form" className="btn btn-primary" disabled={busy}>
            {busy ? 'Saving…' : 'Save plan'}
          </button>
        </>
      }
    >
      <form id="plan-form" onSubmit={onSubmit} className="space-y-4">
        {error && <Alert type="error">{error}</Alert>}

        <div>
          <label htmlFor="plan-name" className="mb-1 block text-sm font-medium text-slate-700">
            Name
          </label>
          <input
            id="plan-name"
            name="name"
            className="input"
            defaultValue={plan?.name ?? ''}
            required
            maxLength={120}
          />
        </div>

        <div>
          <label htmlFor="plan-description" className="mb-1 block text-sm font-medium text-slate-700">
            Description
          </label>
          <textarea
            id="plan-description"
            name="description"
            className="input min-h-20"
            defaultValue={plan?.description ?? ''}
            maxLength={1000}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="plan-price" className="mb-1 block text-sm font-medium text-slate-700">
              Price (USD)
            </label>
            <input
              id="plan-price"
              name="price"
              className="input"
              type="number"
              min="0"
              step="0.01"
              defaultValue={plan?.price ?? 0}
            />
          </div>

          <div>
            <label htmlFor="plan-support" className="mb-1 block text-sm font-medium text-slate-700">
              Support level
            </label>
            <select
              id="plan-support"
              name="supportLevel"
              className="input"
              defaultValue={plan?.supportLevel ?? 'COMMUNITY'}
            >
              <option value="COMMUNITY">Community</option>
              <option value="STANDARD">Standard</option>
              <option value="PREMIUM">Premium</option>
              <option value="ENTERPRISE">Enterprise</option>
            </select>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="plan-limit" className="mb-1 block text-sm font-medium text-slate-700">
              Rate limit
            </label>
            <input
              id="plan-limit"
              name="rateLimit"
              className="input"
              type="number"
              min="1"
              defaultValue={plan?.rateLimit ?? 60}
              required
            />
          </div>

          <div>
            <label htmlFor="plan-period" className="mb-1 block text-sm font-medium text-slate-700">
              Per
            </label>
            <select
              id="plan-period"
              name="ratePeriod"
              className="input"
              defaultValue={plan?.ratePeriod ?? 'MINUTE'}
            >
              <option value="SECOND">Second</option>
              <option value="MINUTE">Minute</option>
              <option value="HOUR">Hour</option>
              <option value="DAY">Day</option>
              <option value="MONTH">Month</option>
            </select>
          </div>
        </div>
      </form>
    </Modal>
  )
}

export default PlansPage
