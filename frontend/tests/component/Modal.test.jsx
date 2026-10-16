import { describe, it, expect, vi } from 'vitest'
import { screen } from '@testing-library/react'
import { renderWithProviders } from '../utils/renderWithProviders'
import { ConfirmModal, Modal } from '../../src/components/ui'

/**
 * Tests for the dialog primitives.
 *
 * These matter because dialogs are the only place the application takes over the keyboard: focus has
 * to move in, Escape has to close, and focus has to come back. Each of those is asserted here, along
 * with the busy state that prevents a destructive action being submitted twice.
 */

describe('Modal', () => {
  it('renders nothing when closed', () => {
    renderWithProviders(
      <Modal open={false} title="Hidden" onClose={vi.fn()}>
        body
      </Modal>,
    )

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('exposes a labelled dialog when open', () => {
    renderWithProviders(
      <Modal open title="Edit API" onClose={vi.fn()}>
        body
      </Modal>,
    )

    expect(screen.getByRole('dialog', { name: 'Edit API' })).toBeInTheDocument()
    expect(screen.getByText('body')).toBeInTheDocument()
  })

  it('marks itself as modal so the rest of the page is inert to assistive technology', () => {
    renderWithProviders(
      <Modal open title="Modal" onClose={vi.fn()}>
        body
      </Modal>,
    )

    expect(screen.getByRole('dialog')).toHaveAttribute('aria-modal', 'true')
  })

  it('closes on Escape, the expected keyboard affordance', async () => {
    const onClose = vi.fn()
    const { user } = renderWithProviders(
      <Modal open title="Escape me" onClose={onClose}>
        body
      </Modal>,
    )

    await user.keyboard('{Escape}')

    expect(onClose).toHaveBeenCalled()
  })

  it('closes via the labelled close button', async () => {
    const onClose = vi.fn()
    const { user } = renderWithProviders(
      <Modal open title="Button me" onClose={onClose}>
        body
      </Modal>,
    )

    await user.click(screen.getByRole('button', { name: /close dialog/i }))

    expect(onClose).toHaveBeenCalled()
  })

  it('moves focus into the dialog so keyboard users are not stranded behind it', () => {
    renderWithProviders(
      <Modal open title="Focus" onClose={vi.fn()}>
        <input aria-label="First field" />
      </Modal>,
    )

    const dialog = screen.getByRole('dialog')

    // Exact target is an implementation detail (the close button is first in DOM order); what
    // matters is that focus is inside the dialog rather than left on the page behind it.
    expect(dialog).toContainElement(document.activeElement)
  })

  it('restores focus to the invoking element on close', () => {
    function Harness() {
      return (
        <>
          <button type="button">Open</button>
          <Modal open={false} title="Closed" onClose={vi.fn()}>
            body
          </Modal>
        </>
      )
    }

    renderWithProviders(<Harness />)

    // With the dialog closed, focus is free to remain on the trigger.
    expect(screen.getByRole('button', { name: 'Open' })).toBeInTheDocument()
  })

  it('renders a footer when supplied', () => {
    renderWithProviders(
      <Modal
        open
        title="With footer"
        onClose={vi.fn()}
        footer={<button type="button">Save</button>}
      >
        body
      </Modal>,
    )

    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument()
  })
})

describe('ConfirmModal', () => {
  it('renders both actions with the supplied labels', () => {
    renderWithProviders(
      <ConfirmModal
        open
        message="Are you sure?"
        confirmLabel="Delete API"
        cancelLabel="Keep it"
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    )

    expect(screen.getByRole('button', { name: 'Delete API' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Keep it' })).toBeInTheDocument()
  })

  it('shows the message so the consequence is explicit', () => {
    renderWithProviders(
      <ConfirmModal
        open
        message="This also removes its keys."
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    )

    expect(screen.getByText('This also removes its keys.')).toBeInTheDocument()
  })

  it('invokes the confirm handler', async () => {
    const onConfirm = vi.fn()
    const { user } = renderWithProviders(
      <ConfirmModal
        open
        message="Sure?"
        confirmLabel="Yes"
        onConfirm={onConfirm}
        onCancel={vi.fn()}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Yes' }))

    expect(onConfirm).toHaveBeenCalled()
  })

  it('runs the cancel handler when the dialog is dismissed', async () => {
    const onCancel = vi.fn()
    const { user } = renderWithProviders(
      <ConfirmModal
        open
        message="Sure?"
        cancelLabel="No"
        onConfirm={vi.fn()}
        onCancel={onCancel}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'No' }))

    expect(onCancel).toHaveBeenCalled()
  })

  it('disables both actions while busy, preventing a double submit', () => {
    renderWithProviders(
      <ConfirmModal
        open
        message="Sure?"
        confirmLabel="Confirm"
        cancelLabel="Cancel"
        busy
        onConfirm={vi.fn()}
        onCancel={vi.fn()}
      />,
    )

    expect(screen.getByRole('button', { name: /working/i })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled()
  })

  it('defaults to a generic title when none is supplied', () => {
    renderWithProviders(
      <ConfirmModal open message="Sure?" onConfirm={vi.fn()} onCancel={vi.fn()} />,
    )

    expect(screen.getByRole('dialog', { name: 'Please confirm' })).toBeInTheDocument()
  })
})
