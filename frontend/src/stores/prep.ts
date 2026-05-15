import { writable } from 'svelte/store'

interface PrepState {
  active: boolean
  requiredKeys: Map<number, string>
  confirmedKeys: Set<number>
}

function createPrepStore() {
  const { subscribe, set, update } = writable<PrepState>({
    active: false,
    requiredKeys: new Map(),
    confirmedKeys: new Set(),
  })

  return {
    subscribe,
    activate(keys: Map<number, string>) {
      set({ active: true, requiredKeys: keys, confirmedKeys: new Set() })
    },
    confirm(note: number) {
      update(s => {
        if (!s.active || !s.requiredKeys.has(note) || s.confirmedKeys.has(note)) return s
        const confirmed = new Set(s.confirmedKeys)
        confirmed.add(note)
        return { ...s, confirmedKeys: confirmed }
      })
    },
    deactivate() {
      set({ active: false, requiredKeys: new Map(), confirmedKeys: new Set() })
    },
  }
}

export const prepStore = createPrepStore()
