/**
 * Maps Go-backend English chord/inversion names to i18n keys.
 * The Go backend always emits canonical English names; translation happens here in the frontend.
 * Falls back to the raw English name if no key is found (safe for future chord additions).
 */

export const CHORD_I18N_KEYS: Record<string, string> = {
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
