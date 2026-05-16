/**
 * Maps Go-backend English chord/inversion names to i18n keys.
 * The Go backend always emits canonical English names; translation happens here in the frontend.
 * Falls back to the raw English name if no key is found (safe for future chord additions).
 */

export const CHORD_I18N_KEYS: Record<string, string> = {
  // ── Intervals (2 notes) ───────────────────────────────────────────────────
  'Minor 2nd':   'chord.minor-2nd',
  'Major 2nd':   'chord.major-2nd',
  'Minor 3rd':   'chord.minor-3rd',
  'Major 3rd':   'chord.major-3rd',
  'Perfect 4th': 'chord.perfect-4th',
  'Tritone':     'chord.tritone',

  // ── Triads ────────────────────────────────────────────────────────────────
  'Major':           'chord.major',
  'Minor':           'chord.minor',
  'Augmented':       'chord.augmented',
  'Diminished':      'chord.diminished',
  'Suspended 2nd':   'chord.sus2',
  'Suspended 4th':   'chord.sus4',
  'Power Chord':     'chord.power',

  // ── 6th / 7th ─────────────────────────────────────────────────────────────
  'Major 6th':           'chord.major-6th',
  'Minor 6th':           'chord.minor-6th',
  'Major 7th':           'chord.major-7th',
  'Minor 7th':           'chord.minor-7th',
  'Dominant 7th':        'chord.dominant-7th',
  'Augmented 7th':       'chord.augmented-7th',
  'Augmented Major 7th': 'chord.augmented-major-7th',
  'Diminished 7th':      'chord.diminished-7th',
  'Half-diminished':     'chord.half-diminished',
  'Minor Major 7th':     'chord.minor-major-7th',

  // ── Shell voicings (no 5th) ───────────────────────────────────────────────
  'Major 7th no 5th':    'chord.major-7th-no5',
  'Dominant 7th no 5th': 'chord.dominant-7th-no5',
  'Minor 7th no 5th':    'chord.minor-7th-no5',

  // ── 9th ───────────────────────────────────────────────────────────────────
  'Major 9th':              'chord.major-9th',
  'Minor 9th':              'chord.minor-9th',
  'Dominant 9th':           'chord.dominant-9th',
  'Dominant 7th flat 9':    'chord.dominant-7th-b9',
  'Dominant 7th sharp 9':   'chord.dominant-7th-s9',
  'Dominant 9th flat 5':    'chord.dominant-9th-b5',
  'Dominant 9th sharp 5':   'chord.dominant-9th-s5',
  'Minor Major 9th':        'chord.minor-major-9th',

  // ── 11th ──────────────────────────────────────────────────────────────────
  'Major 11th':              'chord.major-11th',
  'Minor 11th':              'chord.minor-11th',
  'Dominant 11th':           'chord.dominant-11th',
  'Dominant 7th sharp 11':   'chord.dominant-7th-s11',
  'Minor 11th flat 5':       'chord.minor-11th-b5',
  'Minor 11th sharp 5':      'chord.minor-11th-s5',

  // ── 13th ──────────────────────────────────────────────────────────────────
  'Major 13th':              'chord.major-13th',
  'Minor 13th':              'chord.minor-13th',
  'Dominant 13th':           'chord.dominant-13th',
  'Dominant 13th flat 9':    'chord.dominant-13th-b9',
  'Dominant 13th sharp 9':   'chord.dominant-13th-s9',

  // ── Extended / altered ────────────────────────────────────────────────────
  'Minor 6/9':                         'chord.minor-6-9',
  '6/9':                               'chord.6-9',
  'Minor 7th flat 5':                  'chord.minor-7th-b5',
  'Major 7th sharp 5':                 'chord.major-7th-s5',
  'Dominant 7th flat 9 flat 5':        'chord.dom7-b9-b5',
  'Dominant 7th sharp 9 sharp 5':      'chord.dom7-s9-s5',
  'Suspended 4th add 9':               'chord.sus4-add9',
  'Minor 9th flat 13':                 'chord.minor-9th-b13',
  'Dominant 7th flat 13':              'chord.dom7-b13',
  'Add 9':                             'chord.add9',
  'Minor Add 9':                       'chord.minor-add9',
  'Dominant 9th flat 13':              'chord.dom9-b13',
  'Major 9th add 13':                  'chord.major-9th-add13',
  'Minor 9th flat 11':                 'chord.minor-9th-b11',
  'Minor 13th sharp 11':               'chord.minor-13th-s11',
  'Dominant 9th add sharp 11':         'chord.dom9-add-s11',
  'Dominant 11th sharp 9':             'chord.dom11-s9',
  'Suspended 4th add 13':              'chord.sus4-add13',
  'Minor 9th add 13':                  'chord.minor-9th-add13',
  'Add 9 sharp 11':                    'chord.add9-s11',
  'Minor Add 9 sharp 11':              'chord.minor-add9-s11',
  'Dominant 7th flat 9 sharp 11':      'chord.dom7-b9-s11',
  'Dominant 7th sharp 9 sharp 11':     'chord.dom7-s9-s11',
  'Dominant 13th sharp 9 flat 11':     'chord.dom13-s9-b11',
  'Minor 13th add flat 9':             'chord.minor-13th-add-b9',
  'Minor 13th sharp 9':                'chord.minor-13th-s9',
  'Major 9th sharp 13':                'chord.major-9th-s13',
  'Major 13th sharp 11':               'chord.major-13th-s11',
  'Dominant 7th flat 9 sharp 13':      'chord.dom7-b9-s13',
}

export const INVERSION_I18N_KEYS: Record<string, string> = {
  'Root position':   'inversion.root',
  '1st inversion':   'inversion.1st',
  '2nd inversion':   'inversion.2nd',
  '3rd inversion':   'inversion.3rd',
  'Unknown inversion': 'inversion.unknown',
}

/** Returns the translated chord name; falls back to the raw English name when no key exists. */
export function translateChord(name: string, t: (key: string) => string): string {
  const key = CHORD_I18N_KEYS[name]
  if (!key) return name
  const translated = t(key)
  return translated === key ? name : translated
}

/** Returns the translated inversion label; falls back to the raw English label. */
export function translateInversion(name: string, t: (key: string) => string): string {
  const key = INVERSION_I18N_KEYS[name]
  if (!key) return name
  const translated = t(key)
  return translated === key ? name : translated
}

/**
 * Returns the localized note name for a pitch class (0=C … 11=B).
 * Returns empty string for out-of-range values (e.g. -1 = no chord).
 */
export function translateRootNote(pitchClass: number, t: (key: string) => string): string {
  if (pitchClass < 0 || pitchClass > 11) return ''
  const key = `note.${pitchClass}`
  const translated = t(key)
  return translated === key ? '' : translated
}

// ── Chord shorthand (cifra) ───────────────────────────────────────────────────

/**
 * International standard note names used in chord symbols (e.g. "Am7", "Cmaj7").
 * These are always in English regardless of UI locale — chord symbols are universal.
 */
export const NOTE_SHORTHAND = [
  'C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'
]

/**
 * Maps every chord/interval name (as returned by the Go backend) to its
 * standard chord symbol suffix. For major triads the suffix is '' (just the root note).
 */
export const CHORD_SHORTHAND: Record<string, string> = {
  // ── Intervals (2 notes) ───────────────────────────────────────────────────
  'Minor 2nd':   'm2',
  'Major 2nd':   'M2',
  'Minor 3rd':   'm3',
  'Major 3rd':   'M3',
  'Perfect 4th': 'P4',
  'Tritone':     'TT',
  'Power Chord': '5',
  'Minor 6th':   'm6',  // also used for 4-note chord (same symbol)
  'Major 6th':   '6',   // also used for 4-note chord (same symbol)
  'Minor 7th':   'm7',  // also used for 4-note chord (same symbol)
  'Major 7th':   'maj7',// also used for 4-note chord (same symbol)

  // ── Triads ────────────────────────────────────────────────────────────────
  'Major':         '',        // "C" = C Major
  'Minor':         'm',       // "Am"
  'Augmented':     'aug',     // "Caug"
  'Diminished':    'dim',     // "Bdim"
  'Suspended 2nd': 'sus2',
  'Suspended 4th': 'sus4',

  // ── 7th chords ────────────────────────────────────────────────────────────
  'Dominant 7th':        '7',       // "G7"
  'Augmented 7th':       'aug7',
  'Augmented Major 7th': 'augMaj7',
  'Diminished 7th':      'dim7',
  'Half-diminished':     'ø7',
  'Minor Major 7th':     'mMaj7',

  // ── Shell voicings ────────────────────────────────────────────────────────
  'Major 7th no 5th':    'maj7',
  'Dominant 7th no 5th': '7',
  'Minor 7th no 5th':    'm7',

  // ── 9th ──────────────────────────────────────────────────────────────────
  'Major 9th':            'maj9',
  'Minor 9th':            'm9',
  'Dominant 9th':         '9',
  'Dominant 7th flat 9':  '7b9',
  'Dominant 7th sharp 9': '7#9',
  'Dominant 9th flat 5':  '9b5',
  'Dominant 9th sharp 5': '9#5',
  'Minor Major 9th':      'mMaj9',

  // ── 11th ─────────────────────────────────────────────────────────────────
  'Major 11th':            'maj11',
  'Minor 11th':            'm11',
  'Dominant 11th':         '11',
  'Dominant 7th sharp 11': '7#11',
  'Minor 11th flat 5':     'm11b5',
  'Minor 11th sharp 5':    'm11#5',

  // ── 13th ─────────────────────────────────────────────────────────────────
  'Major 13th':            'maj13',
  'Minor 13th':            'm13',
  'Dominant 13th':         '13',
  'Dominant 13th flat 9':  '13b9',
  'Dominant 13th sharp 9': '13#9',

  // ── Extended / altered ────────────────────────────────────────────────────
  'Minor 6/9':                         'm6/9',
  '6/9':                               '6/9',
  'Minor 7th flat 5':                  'm7b5',
  'Major 7th sharp 5':                 'maj7#5',
  'Dominant 7th flat 9 flat 5':        '7b9b5',
  'Dominant 7th sharp 9 sharp 5':      '7#9#5',
  'Suspended 4th add 9':               'sus4add9',
  'Minor 9th flat 13':                 'm9b13',
  'Dominant 7th flat 13':              '7b13',
  'Add 9':                             'add9',
  'Minor Add 9':                       'madd9',
  'Dominant 9th flat 13':              '9b13',
  'Major 9th add 13':                  'maj9add13',
  'Minor 9th flat 11':                 'm9b11',
  'Minor 13th sharp 11':               'm13#11',
  'Dominant 9th add sharp 11':         '9add#11',
  'Dominant 11th sharp 9':             '11#9',
  'Suspended 4th add 13':              'sus4add13',
  'Minor 9th add 13':                  'm9add13',
  'Add 9 sharp 11':                    'add9#11',
  'Minor Add 9 sharp 11':              'madd9#11',
  'Dominant 7th flat 9 sharp 11':      '7b9#11',
  'Dominant 7th sharp 9 sharp 11':     '7#9#11',
  'Dominant 13th sharp 9 flat 11':     '13#9b11',
  'Minor 13th add flat 9':             'm13addb9',
  'Minor 13th sharp 9':                'm13#9',
  'Major 9th sharp 13':                'maj9#13',
  'Major 13th sharp 11':               'maj13#11',
  'Dominant 7th flat 9 sharp 13':      '7b9#13',
}

/**
 * Returns the international chord symbol for a chord/interval.
 * Always uses English note names (e.g. "Am7", "Cmaj7", "GP4").
 * Returns empty string when the chord is unrecognized or pitchClass is invalid.
 */
export function chordShorthand(chordName: string, pitchClass: number): string {
  if (pitchClass < 0 || pitchClass > 11) return ''
  const symbol = CHORD_SHORTHAND[chordName]
  if (symbol === undefined) return ''
  return NOTE_SHORTHAND[pitchClass] + symbol
}
