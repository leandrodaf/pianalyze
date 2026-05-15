import { writable } from 'svelte/store'

export type ChordDisplayMode = 'full' | 'short'

interface Settings {
  chordDisplayMode: ChordDisplayMode
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
  chordDisplayMode: 'full'
}

function createSettingsStore() {
  const { subscribe, update } = writable<Settings>(loadSettings())

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
    }
  }
}

export const settingsStore = createSettingsStore()
