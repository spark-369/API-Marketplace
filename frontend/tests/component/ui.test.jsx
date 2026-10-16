import { describe, it, expect, vi } from 'vitest'
import { screen } from '@testing-library/react'
import { renderWithProviders } from '../utils/renderWithProviders'
import {
  Alert,
  Badge,
  EmptyState,
  FieldErrors,
  PageHeader,
  Skeleton,
  Spinner,
} from '../../src/components/ui'
import { formatDate, formatPrice } from '../../src/utils/format'

/**
 * Tests for the shared UI primitives.
 *
 * Assertions target accessible semantics rather than class names — a restyle should not break these
 * tests, but removing a label or a role should.
 */

describe('ui primitives', () => {
  describe('formatDate', () => {
    it('renders an em dash for missing values', () => {
      // Tables call this unconditionally; a null must not produce "Invalid Date".
      expect(formatDate(null)).toBe('—')
      expect(formatDate(undefined)).toBe('—')
      expect(formatDate('')).toBe('—')
    })

    it('renders an em dash for an unparseable value', () => {
      expect(formatDate('not-a-date')).toBe('—')
    })

    it('formats a valid timestamp', () => {
      const formatted = formatDate('2026-03-15T10:30:00')

      expect(formatted).toContain('2026')
      expect(formatted).toContain('Mar')
    })

    it('omits the time when asked', () => {
      expect(formatDate('2026-03-15T10:30:00', { withTime: false })).not.toContain(':')
    })
  })

  describe('formatPrice', () => {
    it('labels zero as Free', () => {
      expect(formatPrice(0)).toBe('Free')
      expect(formatPrice('0')).toBe('Free')
      expect(formatPrice(null)).toBe('Free')
    })

    it('formats a positive amount as currency', () => {
      expect(formatPrice(49.99)).toContain('49.99')
    })

    it('treats a non-numeric value as free rather than rendering NaN', () => {
      expect(formatPrice('garbage')).toBe('Free')
    })
  })

  describe('Alert', () => {
    it('exposes an error as an assertive alert', () => {
      renderWithProviders(<Alert type="error">Something broke</Alert>)

      expect(screen.getByRole('alert')).toHaveTextContent('Something broke')
    })

    it('exposes informational messages as a status', () => {
      renderWithProviders(<Alert type="info">Heads up</Alert>)

      expect(screen.getByRole('status')).toHaveTextContent('Heads up')
    })

    it('renders the title alongside the body', () => {
      renderWithProviders(
        <Alert type="warning" title="Pool empty">
          Provision more keys
        </Alert>,
      )

      expect(screen.getByText('Pool empty')).toBeInTheDocument()
      expect(screen.getByText('Provision more keys')).toBeInTheDocument()
    })

    it('offers a dismiss control when a handler is given', async () => {
      const onDismiss = vi.fn()
      const { user } = renderWithProviders(
        <Alert type="info" onDismiss={onDismiss}>
          Dismissable
        </Alert>,
      )

      await user.click(screen.getByRole('button', { name: /dismiss/i }))

      expect(onDismiss).toHaveBeenCalled()
    })

    it('omits the dismiss control when no handler is given', () => {
      renderWithProviders(<Alert type="info">No handler</Alert>)

      expect(screen.queryByRole('button')).not.toBeInTheDocument()
    })
  })

  describe('Spinner', () => {
    it('announces a loading state to assistive technology', () => {
      renderWithProviders(<Spinner label="Loading APIs" />)

      expect(screen.getByRole('status')).toHaveTextContent('Loading APIs')
    })
  })

  describe('Skeleton', () => {
    it('is hidden from assistive technology', () => {
      const { container } = renderWithProviders(<Skeleton />)

      expect(container.querySelector('[aria-hidden="true"]')).toBeInTheDocument()
    })
  })

  describe('EmptyState', () => {
    it('renders the title, description and action', () => {
      renderWithProviders(
        <EmptyState
          title="Nothing here"
          description="Try another filter"
          action={<button type="button">Browse</button>}
        />,
      )

      expect(screen.getByRole('heading', { name: 'Nothing here' })).toBeInTheDocument()
      expect(screen.getByText('Try another filter')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Browse' })).toBeInTheDocument()
    })

    it('works without a description or action', () => {
      renderWithProviders(<EmptyState title="Bare" />)

      expect(screen.getByRole('heading', { name: 'Bare' })).toBeInTheDocument()
    })
  })

  describe('PageHeader', () => {
    it('renders the heading as a level-one heading', () => {
      renderWithProviders(<PageHeader title="API catalog" />)

      expect(screen.getByRole('heading', { level: 1, name: 'API catalog' })).toBeInTheDocument()
    })

    it('renders actions when supplied', () => {
      renderWithProviders(<PageHeader title="Mine" actions={<button type="button">New</button>} />)

      expect(screen.getByRole('button', { name: 'New' })).toBeInTheDocument()
    })
  })

  describe('Badge', () => {
    it('renders its content', () => {
      renderWithProviders(<Badge tone="success">ACTIVE</Badge>)

      expect(screen.getByText('ACTIVE')).toBeInTheDocument()
    })
  })

  describe('FieldErrors', () => {
    it('renders nothing when there are no errors', () => {
      const { container } = renderWithProviders(<FieldErrors errors={null} />)

      expect(container).toBeEmptyDOMElement()
    })

    it('renders nothing for an empty map', () => {
      const { container } = renderWithProviders(<FieldErrors errors={{}} />)

      expect(container).toBeEmptyDOMElement()
    })

    it('lists each field with its message', () => {
      renderWithProviders(<FieldErrors errors={{ email: 'is required', password: 'too short' }} />)

      expect(screen.getByText(/is required/)).toBeInTheDocument()
      expect(screen.getByText(/too short/)).toBeInTheDocument()
    })
  })
})
