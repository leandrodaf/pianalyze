import { writable } from 'svelte/store'
import { EventsOn } from '../../wailsjs/runtime/runtime'
import type { MIDIState } from '../lib/midi-types'

const initial: MIDIState = {
  pressedNotes: [],
  currentKey: '',
  chord: '',
  inversion: '',
  triad: '',
  chordRoot: -1,
  velocity: 0,
  dynamic: '',
  interval: 0
}

export const midiStore = writable<MIDIState>(initial)

/** Wire the store to the Go backend "midi:state" event. Returns the unsubscribe
 *  function — pass it to onDestroy or return it from onMount for automatic cleanup. */
export function connectMidiStore(): () => void {
  return EventsOn('midi:state', (state: MIDIState) => {
    if (state == null) return
    midiStore.set(state)
  })
}
