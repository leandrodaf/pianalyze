/**
 * Music-theory helpers for key signatures and scale pitch-class sets.
 * Used by the waterfall to draw scale guide bands.
 */

export const MAJOR_INTERVALS = [0, 2, 4, 5, 7, 9, 11] as const
export const MINOR_INTERVALS = [0, 2, 3, 5, 7, 8, 10] as const

/** Map from note name → pitch class (0 = C … 11 = B). */
const ROOT_PC: Record<string, number> = {
  'C': 0, 'C#': 1, 'Db': 1, 'D': 2, 'D#': 3, 'Eb': 3, 'E': 4, 'F': 5,
  'F#': 6, 'Gb': 6, 'G': 7, 'G#': 8, 'Ab': 8, 'A': 9, 'A#': 10, 'Bb': 10, 'B': 11,
}

/**
 * Convert a key signature string (e.g. "G", "Am", "F#", "Bb") to the set of
 * pitch classes (0–11) that belong to that scale.
 * Returns null for unknown / empty strings.
 */
export function keyToPitchClasses(key: string): Set<number> | null {
  if (!key) return null
  const isMinor = key.length > 1 && key.endsWith('m')
  const rootName = isMinor ? key.slice(0, -1) : key
  const root = ROOT_PC[rootName]
  if (root == null) return null
  const ivls: readonly number[] = isMinor ? MINOR_INTERVALS : MAJOR_INTERVALS
  return new Set(ivls.map(i => (root + i) % 12))
}

/** All key options shown in the picker — ordered by the circle of fifths. */
export const KEY_OPTIONS: { value: string; label: string }[] = [
  { value: 'C',  label: 'Dó M' },
  { value: 'G',  label: 'Sol M' },
  { value: 'D',  label: 'Ré M' },
  { value: 'A',  label: 'Lá M' },
  { value: 'E',  label: 'Mi M' },
  { value: 'B',  label: 'Si M' },
  { value: 'F#', label: 'F# M' },
  { value: 'F',  label: 'Fá M' },
  { value: 'Bb', label: 'Sib M' },
  { value: 'Eb', label: 'Mib M' },
  { value: 'Ab', label: 'Láb M' },
  { value: 'Db', label: 'Réb M' },
  { value: 'Am', label: 'Lá m' },
  { value: 'Em', label: 'Mi m' },
  { value: 'Bm', label: 'Si m' },
  { value: 'Dm', label: 'Ré m' },
  { value: 'Gm', label: 'Sol m' },
  { value: 'Cm', label: 'Dó m' },
  { value: 'Fm', label: 'Fá m' },
  { value: 'F#m',label: 'F#m' },
]
