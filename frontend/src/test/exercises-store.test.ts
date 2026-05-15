import { describe, it, expect, vi, beforeEach } from 'vitest'
import { get } from 'svelte/store'
import type { BundledExerciseEntry, ManifestExerciseEntry } from '../lib/exercise-types'
import type { Recording } from '../lib/recording-types'

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeEntry(overrides: Partial<BundledExerciseEntry> = {}): BundledExerciseEntry {
  return {
    id: 'test-scale',
    title: 'Test Scale',
    subtitle: 'C Major',
    description: 'A test exercise',
    author: { name: 'Test Author' },
    category: 'scales',
    difficulty: 1,
    tags: ['test'],
    style: { gradient: ['#000', '#fff'], icon: '🎹' },
    stats: { durationSec: 30 },
    ...overrides,
  }
}

const fakeRecording: Recording = {
  version: 1,
  recordedAt: '2024-01-01T00:00:00Z',
  events: [],
}

// ── Mock import.meta.glob and the JSON manifest ───────────────────────────────

vi.mock('../data/builtin-manifest.json', () => ({
  default: {
    version: '1',
    name: 'Test Manifest',
    exercises: [
      makeEntry({ id: 'with-data',    dataUrl: 'exercises/scales/test.json' }),
      makeEntry({ id: 'without-data' }),
      makeEntry({ id: 'scales-ex',    category: 'scales' }),
      makeEntry({ id: 'chords-ex',    category: 'chords' }),
      makeEntry({ id: 'pieces-ex',    category: 'pieces' }),
      makeEntry({ id: 'coming-soon',  comingSoon: true }),
    ],
  },
}))

vi.mock('../lib/recording-types', () => ({}))

// import.meta.glob is replaced with a static map
vi.stubGlobal('import', {
  meta: {
    glob: () => ({
      '../data/exercises/scales/test.json': { default: fakeRecording },
    }),
  },
})

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('exercises store — initial state', () => {
  it('is not loading on startup', async () => {
    const { exerciseStore } = await import('../stores/exercises')
    expect(get(exerciseStore).loading).toBe(false)
  })

  it('has no error on startup', async () => {
    const { exerciseStore } = await import('../stores/exercises')
    expect(get(exerciseStore).error).toBeNull()
  })

  it('loads exercises from the builtin manifest', async () => {
    const { exerciseStore } = await import('../stores/exercises')
    expect(get(exerciseStore).exercises.length).toBeGreaterThan(0)
  })
})

describe('exercisesByCategory derived store', () => {
  it('separates exercises by category', async () => {
    const { exercisesByCategory } = await import('../stores/exercises')
    const cats = get(exercisesByCategory)
    const scaleIds = cats.scales.map(e => e.id)
    const chordIds = cats.chords.map(e => e.id)
    const pieceIds = cats.pieces.map(e => e.id)
    expect(scaleIds).toContain('scales-ex')
    expect(chordIds).toContain('chords-ex')
    expect(pieceIds).toContain('pieces-ex')
  })

  it('each exercise is in exactly one category', async () => {
    const { exercisesByCategory } = await import('../stores/exercises')
    const { scales, chords, pieces } = get(exercisesByCategory)
    const allIds = [...scales, ...chords, ...pieces].map(e => e.id)
    expect(new Set(allIds).size).toBe(allIds.length)
  })
})

describe('clearError', () => {
  it('clears the error field', async () => {
    const { exerciseStore, clearError } = await import('../stores/exercises')
    exerciseStore.update(s => ({ ...s, error: 'Something went wrong' }))
    expect(get(exerciseStore).error).toBe('Something went wrong')
    clearError()
    expect(get(exerciseStore).error).toBeNull()
  })
})

describe('loadFromUrl', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  const remoteEntry: ManifestExerciseEntry = {
    id: 'remote-scale',
    title: 'Remote Scale',
    subtitle: 'G Major',
    description: 'A remote exercise',
    author: { name: 'Remote Author' },
    category: 'scales',
    difficulty: 2,
    tags: [],
    style: { gradient: ['#111', '#222'], icon: '🎵' },
    stats: { durationSec: 60 },
    dataUrl: 'recording.json',
  }

  it('sets loading=true while fetching', async () => {
    const { exerciseStore, loadFromUrl } = await import('../stores/exercises')

    let capturedLoading = false
    const unsub = exerciseStore.subscribe(s => {
      if (s.loading) capturedLoading = true
    })

    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ version: '1', name: 'Remote', exercises: [] }),
      })
    )

    await loadFromUrl('https://example.com/manifest.json')
    unsub()
    expect(capturedLoading).toBe(true)
  })

  it('merges remote exercises into the store', async () => {
    const { exerciseStore, loadFromUrl } = await import('../stores/exercises')
    const initialCount = get(exerciseStore).exercises.length

    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ version: '1', name: 'Remote', exercises: [remoteEntry] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => fakeRecording,
      })
    )

    await loadFromUrl('https://example.com/manifest.json')

    const state = get(exerciseStore)
    expect(state.loading).toBe(false)
    expect(state.exercises.length).toBeGreaterThan(initialCount)
    expect(state.exercises.find(e => e.id === 'remote-scale')).toBeDefined()
  })

  it('deduplicates: remote entry replaces existing entry with same id', async () => {
    const { exerciseStore, loadFromUrl } = await import('../stores/exercises')

    const duplicate: ManifestExerciseEntry = {
      ...remoteEntry,
      id: 'scales-ex',
      title: 'Updated Scale',
    }

    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ version: '1', name: 'Remote', exercises: [duplicate] }),
      })
      .mockResolvedValueOnce({ ok: false })
    )

    await loadFromUrl('https://example.com/manifest.json')

    const exercises = get(exerciseStore).exercises
    const matches = exercises.filter(e => e.id === 'scales-ex')
    expect(matches).toHaveLength(1)
    expect(matches[0].title).toBe('Updated Scale')
  })

  it('sets error on HTTP failure', async () => {
    const { exerciseStore, loadFromUrl, clearError } = await import('../stores/exercises')
    clearError()

    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 404,
      statusText: 'Not Found',
    }))

    await loadFromUrl('https://example.com/missing.json')

    const state = get(exerciseStore)
    expect(state.loading).toBe(false)
    expect(state.error).toContain('404')
  })

  it('sets error on network failure', async () => {
    const { exerciseStore, loadFromUrl, clearError } = await import('../stores/exercises')
    clearError()

    vi.stubGlobal('fetch', vi.fn().mockRejectedValueOnce(new Error('Network error')))

    await loadFromUrl('https://example.com/manifest.json')

    const state = get(exerciseStore)
    expect(state.loading).toBe(false)
    expect(state.error).toBeTruthy()
  })
})
