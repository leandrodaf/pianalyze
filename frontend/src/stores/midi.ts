import { writable } from 'svelte/store'
import { EventsOn } from '../../wailsjs/runtime/runtime'
import type { MIDIState } from '../lib/midi-types'

const initial: MIDIState = {
  pressedNotes: [],
  currentKey: '',
  chord: '',
  inversion: '',
  triad: '',
  velocity: 0,
  dynamic: '',
  interval: 0
}

export const midiStore = writable<MIDIState>(initial)

/** Wire the store to the Go backend "midi:state" event. Call once at app startup. */
export function connectMidiStore(): void {
  EventsOn('midi:state', (state: MIDIState) => {
    midiStore.set(state)
  })
}
