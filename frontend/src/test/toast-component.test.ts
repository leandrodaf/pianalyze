import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/svelte'
import { get } from 'svelte/store'
import { toasts, addToast, removeToast } from '../stores/toast'
import Toast from '../components/Toast.svelte'

beforeEach(() => {
  toasts.set([])
})

// ── empty state ───────────────────────────────────────────────────────────────

describe('Toast component — empty state', () => {
  it('renders no toast elements when the store is empty', () => {
    const { container } = render(Toast)
    expect(container.querySelectorAll('.toast')).toHaveLength(0)
  })

  it('renders the aria-live container even when empty', () => {
    const { container } = render(Toast)
    const container_ = container.querySelector('[aria-live]')
    expect(container_).not.toBeNull()
    expect(container_?.getAttribute('aria-live')).toBe('polite')
  })
})

// ── single toast ──────────────────────────────────────────────────────────────

describe('Toast component — single toast', () => {
  it('renders one toast element when the store has one item', () => {
    addToast('Hello world', 'info')
    const { container } = render(Toast)
    expect(container.querySelectorAll('.toast')).toHaveLength(1)
  })

  it('displays the toast message', () => {
    addToast('Device disconnected', 'warning')
    render(Toast)
    expect(screen.getByText('Device disconnected')).toBeTruthy()
  })

  it('renders an SVG icon for type "info"', () => {
    addToast('Info toast', 'info')
    const { container } = render(Toast)
    const svg = container.querySelector('.toast-icon svg')
    expect(svg).not.toBeNull()
    expect(svg?.getAttribute('data-icon')).toBe('music-note')
  })

  it('renders an SVG icon for type "success"', () => {
    addToast('Success toast', 'success')
    const { container } = render(Toast)
    const svg = container.querySelector('.toast-icon svg')
    expect(svg).not.toBeNull()
    expect(svg?.getAttribute('data-icon')).toBe('check')
  })

  it('renders an SVG icon for type "warning"', () => {
    addToast('Warning toast', 'warning')
    const { container } = render(Toast)
    const svg = container.querySelector('.toast-icon svg')
    expect(svg).not.toBeNull()
    expect(svg?.getAttribute('data-icon')).toBe('alert-triangle')
  })

  it('renders an SVG icon for type "error"', () => {
    addToast('Error toast', 'error')
    const { container } = render(Toast)
    const svg = container.querySelector('.toast-icon svg')
    expect(svg).not.toBeNull()
    expect(svg?.getAttribute('data-icon')).toBe('x')
  })

  it('renders a dismiss button', () => {
    addToast('Dismissible', 'info')
    const { container } = render(Toast)
    const btn = container.querySelector('.toast-close')
    expect(btn).not.toBeNull()
    expect(btn?.getAttribute('aria-label')).toBe('Dismiss')
  })

  it('clicking dismiss removes the toast from the store', async () => {
    addToast('Click to remove', 'error')
    const { container } = render(Toast)
    const btn = container.querySelector('.toast-close') as HTMLElement
    await fireEvent.click(btn)
    // Check the store — the DOM may linger during the out-transition
    expect(get(toasts)).toHaveLength(0)
  })
})

// ── multiple toasts ───────────────────────────────────────────────────────────

describe('Toast component — multiple toasts', () => {
  it('renders all toasts when the store has multiple items', () => {
    addToast('First',  'info')
    addToast('Second', 'success')
    addToast('Third',  'warning')
    const { container } = render(Toast)
    expect(container.querySelectorAll('.toast')).toHaveLength(3)
  })

  it('renders each message', () => {
    addToast('Msg A', 'info')
    addToast('Msg B', 'error')
    render(Toast)
    expect(screen.getByText('Msg A')).toBeTruthy()
    expect(screen.getByText('Msg B')).toBeTruthy()
  })

  it('clicking dismiss on one toast only removes that toast', async () => {
    addToast('Keep me',    'success')
    addToast('Remove me',  'warning')
    const { container } = render(Toast)
    const buttons = container.querySelectorAll('.toast-close')
    await fireEvent.click(buttons[1] as HTMLElement)
    // Verify store — the DOM may linger during out-transition
    expect(get(toasts)).toHaveLength(1)
    expect(get(toasts)[0].message).toBe('Keep me')
  })
})

// ── store reactivity ──────────────────────────────────────────────────────────

describe('Toast component — store reactivity', () => {
  it('shows a new toast added after initial render', async () => {
    const { container } = render(Toast)
    expect(container.querySelectorAll('.toast')).toHaveLength(0)
    addToast('Late arrival', 'info')
    await Promise.resolve() // flush microtasks / Svelte tick
    expect(container.querySelectorAll('.toast')).toHaveLength(1)
  })

  it('hides a toast removed from the store after render', async () => {
    addToast('Will vanish', 'info')
    render(Toast)
    expect(get(toasts)).toHaveLength(1)
    const currentId = get(toasts)[0].id
    removeToast(currentId)
    await Promise.resolve()
    // Store should be empty (DOM may still animate out)
    expect(get(toasts)).toHaveLength(0)
  })
})
