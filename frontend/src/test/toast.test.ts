import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { get } from 'svelte/store'
import { toasts, addToast, removeToast, type ToastType } from '../stores/toast'

beforeEach(() => {
  toasts.set([])
  vi.useFakeTimers()
})

afterEach(() => {
  vi.clearAllTimers()
  vi.useRealTimers()
})

// ── addToast ──────────────────────────────────────────────────────────────────

describe('addToast — basic', () => {
  it('appends one toast to the store', () => {
    addToast('Hello')
    expect(get(toasts)).toHaveLength(1)
  })

  it('stores the correct message', () => {
    addToast('Device connected')
    expect(get(toasts)[0].message).toBe('Device connected')
  })

  it('defaults type to "info"', () => {
    addToast('Info')
    expect(get(toasts)[0].type).toBe('info')
  })

  it('defaults duration to 4000', () => {
    addToast('Info')
    expect(get(toasts)[0].duration).toBe(4000)
  })

  it('stores the provided type', () => {
    const types: ToastType[] = ['info', 'success', 'warning', 'error']
    for (const type of types) {
      toasts.set([])
      addToast('msg', type)
      expect(get(toasts)[0].type).toBe(type)
    }
  })

  it('stores the provided duration', () => {
    addToast('msg', 'error', 2000)
    expect(get(toasts)[0].duration).toBe(2000)
  })

  it('assigns a numeric id', () => {
    addToast('msg')
    expect(typeof get(toasts)[0].id).toBe('number')
  })
})

describe('addToast — multiple toasts', () => {
  it('appends multiple toasts in order', () => {
    addToast('A')
    addToast('B')
    addToast('C')
    const messages = get(toasts).map(t => t.message)
    expect(messages).toEqual(['A', 'B', 'C'])
  })

  it('assigns unique ids to each toast', () => {
    addToast('A')
    addToast('B')
    addToast('C')
    const ids = get(toasts).map(t => t.id)
    expect(new Set(ids).size).toBe(3)
  })

  it('stores correct types for mixed toasts', () => {
    addToast('info msg',    'info')
    addToast('success msg', 'success')
    addToast('warning msg', 'warning')
    addToast('error msg',   'error')
    const types = get(toasts).map(t => t.type)
    expect(types).toEqual(['info', 'success', 'warning', 'error'])
  })
})

// ── auto-dismiss ──────────────────────────────────────────────────────────────

describe('addToast — auto-dismiss', () => {
  it('removes the toast after the duration elapses', () => {
    addToast('Temporary', 'info', 1000)
    expect(get(toasts)).toHaveLength(1)
    vi.advanceTimersByTime(1000)
    expect(get(toasts)).toHaveLength(0)
  })

  it('does NOT remove the toast before the duration', () => {
    addToast('Temporary', 'info', 1000)
    vi.advanceTimersByTime(999)
    expect(get(toasts)).toHaveLength(1)
  })

  it('only removes the timed-out toast when multiple coexist', () => {
    addToast('Short', 'info',    500)
    addToast('Long',  'success', 2000)
    vi.advanceTimersByTime(500)
    const remaining = get(toasts)
    expect(remaining).toHaveLength(1)
    expect(remaining[0].message).toBe('Long')
  })

  it('removes each toast independently after its own duration', () => {
    addToast('First',  'info',    500)
    addToast('Second', 'warning', 1000)
    addToast('Third',  'error',   1500)
    vi.advanceTimersByTime(500)
    expect(get(toasts)).toHaveLength(2)
    vi.advanceTimersByTime(500)
    expect(get(toasts)).toHaveLength(1)
    vi.advanceTimersByTime(500)
    expect(get(toasts)).toHaveLength(0)
  })

  it('auto-dismisses with default 4000ms duration', () => {
    addToast('Default duration')
    vi.advanceTimersByTime(3999)
    expect(get(toasts)).toHaveLength(1)
    vi.advanceTimersByTime(1)
    expect(get(toasts)).toHaveLength(0)
  })
})

// ── removeToast ───────────────────────────────────────────────────────────────

describe('removeToast', () => {
  it('removes a toast by its id', () => {
    addToast('To remove')
    const id = get(toasts)[0].id
    removeToast(id)
    expect(get(toasts)).toHaveLength(0)
  })

  it('is a no-op when the id does not exist', () => {
    addToast('Keep me')
    removeToast(99999)
    expect(get(toasts)).toHaveLength(1)
  })

  it('removes only the matching toast when multiple exist', () => {
    addToast('A')
    addToast('B')
    addToast('C')
    const idB = get(toasts)[1].id
    removeToast(idB)
    const remaining = get(toasts).map(t => t.message)
    expect(remaining).toEqual(['A', 'C'])
  })

  it('can remove toasts added in different order', () => {
    addToast('First')
    addToast('Second')
    const idFirst = get(toasts)[0].id
    removeToast(idFirst)
    expect(get(toasts)[0].message).toBe('Second')
  })

  it('leaves the store empty after removing the last toast', () => {
    addToast('Only one')
    const id = get(toasts)[0].id
    removeToast(id)
    expect(get(toasts)).toHaveLength(0)
  })
})
