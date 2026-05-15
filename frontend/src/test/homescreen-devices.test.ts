/**
 * Tests for the MIDI device hot-plug handling introduced in feat/midi-watch-devices.
 *
 * Strategy: test the pure `handleDevicesChanged` helper extracted from
 * HomeScreen.svelte directly, avoiding any Svelte component mounting
 * (Svelte 4 onMount is async/microtask-based and unreliable in jsdom).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { get } from 'svelte/store'
import { toasts } from '../stores/toast'
import { addToast } from '../stores/toast'
import { handleDevicesChanged, type DeviceState, type DeviceHandlerDeps } from '../lib/device-handler'

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeDevice(id: number, name = `Device ${id}`) {
  return { id, name, manufacturer: 'Test' } as any
}

function makeState(overrides: Partial<DeviceState> = {}): DeviceState {
  return {
    selectedId: null,
    connected: false,
    showDeviceList: true,
    deviceError: '',
    ...overrides,
  }
}

function makeDeps(overrides: Partial<DeviceHandlerDeps> = {}): DeviceHandlerDeps {
  return {
    stopCapture: vi.fn().mockResolvedValue(undefined),
    addToast: vi.fn(),
    msgDisconnected: 'Device disconnected',
    msgConnected: 'Device connected',
    ...overrides,
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('handleDevicesChanged — disconnect', () => {
  it('resets state when the selected device is removed', () => {
    const state = makeState({ selectedId: 1, connected: true, showDeviceList: false })
    const deps = makeDeps()

    const next = handleDevicesChanged([/* empty */], [makeDevice(1)], state, deps)

    expect(next.selectedId).toBeNull()
    expect(next.connected).toBe(false)
    expect(next.showDeviceList).toBe(true)
    expect(next.deviceError).toBe('')
  })

  it('calls stopCapture when the selected device disconnects', () => {
    const deps = makeDeps()
    handleDevicesChanged([], [makeDevice(1)], makeState({ selectedId: 1 }), deps)
    expect(deps.stopCapture).toHaveBeenCalledOnce()
  })

  it('calls addToast with "warning" when the selected device disconnects', () => {
    const deps = makeDeps()
    handleDevicesChanged([], [makeDevice(1)], makeState({ selectedId: 1 }), deps)
    expect(deps.addToast).toHaveBeenCalledWith('Device disconnected', 'warning')
  })

  it('does NOT call stopCapture when a different (non-selected) device disconnects', () => {
    const deps = makeDeps()
    // selectedId=1, but device 2 is removed
    handleDevicesChanged([makeDevice(1)], [makeDevice(1), makeDevice(2)], makeState({ selectedId: 1 }), deps)
    expect(deps.stopCapture).not.toHaveBeenCalled()
  })

  it('does NOT call stopCapture when no device is selected (selectedId=null)', () => {
    const deps = makeDeps()
    handleDevicesChanged([], [makeDevice(1)], makeState({ selectedId: null }), deps)
    expect(deps.stopCapture).not.toHaveBeenCalled()
  })
})

describe('handleDevicesChanged — connect', () => {
  it('calls addToast with "success" when a new device appears', () => {
    const deps = makeDeps()
    handleDevicesChanged([makeDevice(2)], [], makeState(), deps)
    expect(deps.addToast).toHaveBeenCalledWith('Device connected', 'success')
  })

  it('does NOT call addToast when the device list is unchanged', () => {
    const deps = makeDeps()
    const devices = [makeDevice(1)]
    handleDevicesChanged(devices, devices, makeState({ selectedId: 1 }), deps)
    expect(deps.addToast).not.toHaveBeenCalled()
  })

  it('does NOT call addToast when a device is only removed (no new additions)', () => {
    const deps = makeDeps()
    // Going from 2 devices to 1 — no new device added
    handleDevicesChanged([makeDevice(1)], [makeDevice(1), makeDevice(2)], makeState(), deps)
    expect(deps.addToast).not.toHaveBeenCalled()
  })

  it('preserves existing state when only a non-selected device disconnects', () => {
    const state = makeState({ selectedId: 1, connected: true, showDeviceList: false, deviceError: '' })
    const deps = makeDeps()
    const next = handleDevicesChanged([makeDevice(1)], [makeDevice(1), makeDevice(2)], state, deps)

    expect(next.selectedId).toBe(1)
    expect(next.connected).toBe(true)
    expect(next.showDeviceList).toBe(false)
  })
})

describe('handleDevicesChanged — real addToast integration', () => {
  beforeEach(() => { toasts.set([]) })

  it('pushes a warning toast to the toasts store on disconnect', () => {
    const state = makeState({ selectedId: 1 })
    const deps = makeDeps({ addToast })

    handleDevicesChanged([], [makeDevice(1)], state, deps)

    const ts = get(toasts)
    expect(ts).toHaveLength(1)
    expect(ts[0].type).toBe('warning')
    expect(ts[0].message).toBe('Device disconnected')
  })

  it('pushes a success toast to the toasts store on connect', () => {
    const deps = makeDeps({ addToast })

    handleDevicesChanged([makeDevice(1)], [], makeState(), deps)

    const ts = get(toasts)
    expect(ts).toHaveLength(1)
    expect(ts[0].type).toBe('success')
    expect(ts[0].message).toBe('Device connected')
  })
})
