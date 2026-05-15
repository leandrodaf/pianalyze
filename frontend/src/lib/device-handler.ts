/**
 * Pure logic for handling MIDI device hot-plug events.
 *
 * Extracted from HomeScreen.svelte so it can be unit-tested without mounting
 * a Svelte component (Svelte 4 onMount is async and unreliable in jsdom).
 */
import type { main } from '../../wailsjs/go/models'
import type { ToastType } from '../stores/toast'

/** Subset of component state that the handler reads and may reset. */
export interface DeviceState {
  selectedId: number | null
  connected: boolean
  showDeviceList: boolean
  deviceError: string
}

/** Side-effect injections, allowing the handler to be tested in isolation. */
export interface DeviceHandlerDeps {
  stopCapture: () => Promise<void>
  addToast: (message: string, type: ToastType) => void
  msgDisconnected: string
  msgConnected: string
}

/**
 * Processes a 'devices:changed' hot-plug event and returns the next device
 * state. Side effects (StopCapture, toast) are invoked via `deps`.
 *
 * @param updated  - The new list of devices from the event payload.
 * @param prev     - The previous list of devices before the event.
 * @param state    - Current component state snapshot.
 * @param deps     - Injected side-effect callbacks and translated strings.
 * @returns The next device state to apply to the component.
 */
export function handleDevicesChanged(
  updated: main.DeviceInfo[],
  prev: main.DeviceInfo[],
  state: Readonly<DeviceState>,
  deps: DeviceHandlerDeps,
): DeviceState {
  if (state.selectedId !== null && !updated.find(d => d.id === state.selectedId)) {
    // The currently-selected device was removed — reset and notify.
    deps.stopCapture().catch(() => {})
    deps.addToast(deps.msgDisconnected, 'warning')
    return { selectedId: null, connected: false, showDeviceList: true, deviceError: '' }
  }

  const added = updated.filter(d => !prev.find(p => p.id === d.id))
  if (added.length > 0) {
    deps.addToast(deps.msgConnected, 'success')
  }

  return { ...state }
}
