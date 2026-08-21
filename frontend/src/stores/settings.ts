import { writable } from 'svelte/store'
import type { DifficultyPreset } from '../lib/recording-types'

export type ChordDisplayMode = 'full' | 'short'

export type DisplayMode = 'waterfall' | 'sheet'

export interface Settings {
  chordDisplayMode: ChordDisplayMode
  /** Preferred skill level; null = no preference (no auto-preset applied). */
  skillLevel: DifficultyPreset | null
  /** Auto-activate step mode when starting a practice exercise. */
  stepMode: boolean
  /** Directory where recordings are auto-saved. Empty = use OS default. */
  savePath: string
  /** ID of the last successfully connected MIDI device (for auto-reconnect). */
  lastDeviceId: number | null
  /** Visual display mode for playback: piano-roll waterfall or sheet music. */
  displayMode: DisplayMode
}

const STORAGE_KEY = 'pianalyze.settings'

function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return { ...defaults, ...JSON.parse(raw) }
  } catch { /* ignore */ }
  return { ...defaults }
}

const defaults: Settings = {
  chordDisplayMode: 'full',
  skillLevel: null,
  stepMode: false,
  savePath: '',
  lastDeviceId: null,
  displayMode: 'waterfall',
}

function createSettingsStore() {
  const { subscribe, update, set } = writable<Settings>(loadSettings())

  function persist(s: Settings) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)) } catch { /* ignore */ }
    return s
  }

  return {
    subscribe,
    toggleChordDisplayMode() {
      update(s => persist({
        ...s,
        chordDisplayMode: s.chordDisplayMode === 'full' ? 'short' : 'full'
      }))
    },
    setSkillLevel(level: DifficultyPreset | null) {
      update(s => persist({ ...s, skillLevel: level }))
    },
    toggleStepMode() {
      update(s => persist({ ...s, stepMode: !s.stepMode }))
    },
    patch(partial: Partial<Settings>) {
      update(s => persist({ ...s, ...partial }))
    },
    setDisplayMode(mode: DisplayMode) {
      update(s => persist({ ...s, displayMode: mode }))
    },
  }
}

export const settingsStore = createSettingsStore()
