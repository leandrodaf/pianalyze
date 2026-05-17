import { writable, derived } from 'svelte/store'
import type {
  Exercise,
  LibraryManifest,
  ManifestExerciseEntry,
  BundledManifest,
  BundledExerciseEntry,
} from '../lib/exercise-types'
import builtinManifest from '../data/builtin-manifest.json'
import type { Recording } from '../lib/recording-types'

// All files under src/data/exercises/**/ are bundled at build time by Vite.
// The keys are paths relative to this file, e.g. "../data/exercises/scales/c-major-scale.json"
const exerciseFiles = import.meta.glob('../data/exercises/**/*.json', { eager: true })

interface ExerciseStore {
  exercises: Exercise[]
  loading: boolean
  error: string | null
}

function resolveBuiltinData(dataUrl?: string): Recording | undefined {
  if (!dataUrl) return undefined
  const key = `../data/${dataUrl}`
  const mod = exerciseFiles[key]
  return mod ? (mod as { default?: Recording }).default ?? (mod as Recording) : undefined
}

function bundledEntryToExercise(entry: BundledExerciseEntry): Exercise {
  return {
    id:          entry.id,
    title:       entry.title,
    subtitle:    entry.subtitle ?? '',
    description: entry.description ?? '',
    author:      entry.author,
    category:    entry.category,
    difficulty:  entry.difficulty,
    tags:        entry.tags ?? [],
    style:       entry.style,
    stats:       entry.stats,
    comingSoon:  entry.comingSoon,
    i18n:        entry.i18n,
    data:        resolveBuiltinData(entry.dataUrl),
  }
}

const BUILTIN_EXERCISES: Exercise[] = (builtinManifest as unknown as BundledManifest)
  .exercises
  .map(bundledEntryToExercise)

export const exerciseStore = writable<ExerciseStore>({
  exercises: BUILTIN_EXERCISES,
  loading: false,
  error: null,
})

export const exercisesByCategory = derived(exerciseStore, $s => ({
  scales: $s.exercises.filter(e => e.category === 'scales'),
  chords: $s.exercises.filter(e => e.category === 'chords'),
  triads: $s.exercises.filter(e => e.category === 'triads'),
  pieces: $s.exercises.filter(e => e.category === 'pieces'),
}))

function manifestEntryToExercise(
  entry: ManifestExerciseEntry,
  data?: Recording,
): Exercise {
  return {
    id:          entry.id,
    title:       entry.title,
    subtitle:    entry.subtitle,
    description: entry.description ?? '',
    author:      entry.author,
    category:    entry.category,
    difficulty:  entry.difficulty,
    tags:        entry.tags ?? [],
    style:       entry.style,
    stats:       entry.stats,
    i18n:        entry.i18n,
    data,
  }
}

export async function loadFromUrl(url: string): Promise<void> {
  exerciseStore.update(s => ({ ...s, loading: true, error: null }))
  try {
    const res = await fetch(url)
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`)
    const manifest: LibraryManifest = await res.json()

    const resolved: Exercise[] = await Promise.all(
      manifest.exercises.map(async (entry): Promise<Exercise> => {
        const dataUrl = new URL(entry.dataUrl, url).toString()
        try {
          const dr = await fetch(dataUrl)
          if (!dr.ok) throw new Error()
          const data: Recording = await dr.json()
          return manifestEntryToExercise(entry, data)
        } catch {
          return manifestEntryToExercise(entry)
        }
      })
    )

    exerciseStore.update(s => ({
      ...s,
      loading: false,
      exercises: [
        ...s.exercises.filter(e => !resolved.find(r => r.id === e.id)),
        ...resolved,
      ],
    }))
  } catch (e) {
    exerciseStore.update(s => ({ ...s, loading: false, error: String(e) }))
  }
}

export function clearError(): void {
  exerciseStore.update(s => ({ ...s, error: null }))
}
