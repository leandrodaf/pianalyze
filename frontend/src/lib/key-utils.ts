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
const KEY_OPTION_DEFS: { value: string; pc: number; minor: boolean }[] = [
  { value: 'C',   pc: 0,  minor: false },
  { value: 'G',   pc: 7,  minor: false },
  { value: 'D',   pc: 2,  minor: false },
  { value: 'A',   pc: 9,  minor: false },
  { value: 'E',   pc: 4,  minor: false },
  { value: 'B',   pc: 11, minor: false },
  { value: 'F#',  pc: 6,  minor: false },
  { value: 'F',   pc: 5,  minor: false },
  { value: 'Bb',  pc: 10, minor: false },
  { value: 'Eb',  pc: 3,  minor: false },
  { value: 'Ab',  pc: 8,  minor: false },
  { value: 'Db',  pc: 1,  minor: false },
  { value: 'Am',  pc: 9,  minor: true  },
  { value: 'Em',  pc: 4,  minor: true  },
  { value: 'Bm',  pc: 11, minor: true  },
  { value: 'Dm',  pc: 2,  minor: true  },
  { value: 'Gm',  pc: 7,  minor: true  },
  { value: 'Cm',  pc: 0,  minor: true  },
  { value: 'Fm',  pc: 5,  minor: true  },
  { value: 'F#m', pc: 6,  minor: true  },
]

/** Returns localized key picker options using i18n note names and major/minor abbreviations. */
export function getKeyOptions(t: (key: string) => string): { value: string; label: string }[] {
  return KEY_OPTION_DEFS.map(({ value, pc, minor }) => ({
    value,
    label: `${t(`note.${pc}`)} ${t(minor ? 'key.minor.abbr' : 'key.major.abbr')}`,
  }))
}

/** @deprecated Use getKeyOptions(t) for localized labels. */
export const KEY_OPTIONS: { value: string; label: string }[] = KEY_OPTION_DEFS.map(({ value, pc, minor }) => ({
  value,
  label: value,
}))
