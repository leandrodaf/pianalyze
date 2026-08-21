import { describe, it, expect } from 'vitest'
import type { NoteInterval, Recording } from '../lib/recording-types'
import {
  midiToVfKey,
  parseTimeSig,
  toVexFlowKey,
  quantizeRecording,
  type QuantizedMeasure,
} from '../lib/rhythm-quantizer'

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeRecording(
  bpm: number,
  ts: string,
  measureMap?: Recording['measureMap'],
): Recording {
  return {
    version: 2,
    tempoMap: [{ atMs: 0, bpm }],
    timeSignatureMap: [{ atMs: 0, value: ts }],
    events: [],
    measureMap,
  }
}

function ni(
  note: number,
  startMs: number,
  endMs: number,
  opts?: Partial<NoteInterval>,
): NoteInterval {
  return { note, startMs, endMs, ...opts }
}

/** Collect all non-rest keys from every voice in every measure. */
function allNoteKeys(measures: QuantizedMeasure[]): string[] {
  const keys: string[] = []
  for (const m of measures) {
    for (const n of [...m.treble, ...m.bass]) {
      if (!n.isRest) keys.push(...n.keys)
    }
  }
  return keys
}

/** Count all non-rest notes (notes, not keys — chord = 1 note). */
function noteCount(measures: QuantizedMeasure[]): number {
  let c = 0
  for (const m of measures) {
    for (const n of [...m.treble, ...m.bass]) {
      if (!n.isRest) c++
    }
  }
  return c
}

// ── midiToVfKey ───────────────────────────────────────────────────────────────

describe('midiToVfKey', () => {
  describe('all 12 pitch classes in octave 4 (MIDI 60–71)', () => {
    const expected: [number, string][] = [
      [60, 'c/4'],
      [61, 'db/4'],
      [62, 'd/4'],
      [63, 'eb/4'],
      [64, 'e/4'],
      [65, 'f/4'],
      [66, 'gb/4'],
      [67, 'g/4'],
      [68, 'ab/4'],
      [69, 'a/4'],
      [70, 'bb/4'],
      [71, 'b/4'],
    ]
    for (const [midi, key] of expected) {
      it(`MIDI ${midi} → '${key}'`, () => {
        expect(midiToVfKey(midi)).toBe(key)
      })
    }
  })

  describe('various octaves', () => {
    it('A0 (MIDI 21) → a/0', () => expect(midiToVfKey(21)).toBe('a/0'))
    it('C1 (MIDI 24) → c/1', () => expect(midiToVfKey(24)).toBe('c/1'))
    it('C3 (MIDI 48) → c/3', () => expect(midiToVfKey(48)).toBe('c/3'))
    it('C5 (MIDI 72) → c/5', () => expect(midiToVfKey(72)).toBe('c/5'))
    it('C7 (MIDI 96) → c/7', () => expect(midiToVfKey(96)).toBe('c/7'))
    it('C8 (MIDI 108) → c/8', () => expect(midiToVfKey(108)).toBe('c/8'))
    it('G9 (MIDI 127) → g/9', () => expect(midiToVfKey(127)).toBe('g/9'))
  })

  describe('black keys always use flat names', () => {
    it('C#4 uses db/4, not cs/4', () => {
      expect(midiToVfKey(61)).toBe('db/4')
      expect(midiToVfKey(61)).not.toContain('cs')
    })
    it('D#4 uses eb/4', () => expect(midiToVfKey(63)).toBe('eb/4'))
    it('F#4 uses gb/4', () => expect(midiToVfKey(66)).toBe('gb/4'))
    it('G#4 uses ab/4', () => expect(midiToVfKey(68)).toBe('ab/4'))
    it('A#4 uses bb/4', () => expect(midiToVfKey(70)).toBe('bb/4'))
  })

  it('MIDI 0 does not return a negative octave (clamps to 0)', () => {
    const key = midiToVfKey(0)
    const octave = parseInt(key.split('/')[1], 10)
    expect(octave).toBeGreaterThanOrEqual(0)
  })

  it('format is always <note>/<octave>', () => {
    for (const midi of [21, 48, 60, 61, 69, 108, 127]) {
      expect(midiToVfKey(midi)).toMatch(/^[a-z]+\/\d+$/)
    }
  })

  it('produces distinct keys for adjacent semitones', () => {
    const keys = Array.from({ length: 12 }, (_, i) => midiToVfKey(60 + i))
    const unique = new Set(keys)
    expect(unique.size).toBe(12)
  })
})

// ── parseTimeSig ──────────────────────────────────────────────────────────────

describe('parseTimeSig', () => {
  it('4/4 → beats=4, beatValue=4', () => {
    expect(parseTimeSig('4/4')).toEqual({ beats: 4, beatValue: 4 })
  })
  it('3/4 → beats=3, beatValue=4', () => {
    expect(parseTimeSig('3/4')).toEqual({ beats: 3, beatValue: 4 })
  })
  it('6/8 → beats=6, beatValue=8', () => {
    expect(parseTimeSig('6/8')).toEqual({ beats: 6, beatValue: 8 })
  })
  it('2/2 → beats=2, beatValue=2', () => {
    expect(parseTimeSig('2/2')).toEqual({ beats: 2, beatValue: 2 })
  })
  it('5/4 → beats=5, beatValue=4', () => {
    expect(parseTimeSig('5/4')).toEqual({ beats: 5, beatValue: 4 })
  })
  it('12/8 → beats=12, beatValue=8', () => {
    expect(parseTimeSig('12/8')).toEqual({ beats: 12, beatValue: 8 })
  })
  it('returns positive integers for both parts', () => {
    const { beats, beatValue } = parseTimeSig('7/8')
    expect(beats).toBeGreaterThan(0)
    expect(beatValue).toBeGreaterThan(0)
  })
})

// ── toVexFlowKey ──────────────────────────────────────────────────────────────

describe('toVexFlowKey', () => {
  it('undefined → C', () => expect(toVexFlowKey(undefined)).toBe('C'))
  it('empty string → C', () => expect(toVexFlowKey('')).toBe('C'))

  describe('major keys pass through unchanged', () => {
    for (const k of ['C', 'G', 'D', 'A', 'E', 'B', 'F#', 'F', 'Bb', 'Eb', 'Ab', 'Db', 'Gb']) {
      it(k, () => expect(toVexFlowKey(k)).toBe(k))
    }
  })

  describe('minor keys map to their relative major', () => {
    const cases: [string, string][] = [
      ['Am', 'C'],
      ['Em', 'G'],
      ['Bm', 'D'],
      ['F#m', 'A'],
      ['C#m', 'E'],
      ['G#m', 'B'],
      ['D#m', 'F#'],
      ['A#m', 'C#'],
      ['Dm', 'F'],
      ['Gm', 'Bb'],
      ['Cm', 'Eb'],
      ['Fm', 'Ab'],
      ['Bbm', 'Db'],
      ['Ebm', 'Gb'],
      ['Abm', 'Cb'],
    ]
    for (const [minor, major] of cases) {
      it(`${minor} → ${major}`, () => expect(toVexFlowKey(minor)).toBe(major))
    }
  })

  it('all 15 minor keys are covered', () => {
    const minors = ['Am', 'Em', 'Bm', 'F#m', 'C#m', 'G#m', 'D#m', 'A#m',
      'Dm', 'Gm', 'Cm', 'Fm', 'Bbm', 'Ebm', 'Abm']
    for (const m of minors) {
      expect(toVexFlowKey(m)).not.toBe(m) // must be resolved to major equivalent
    }
  })
})

// ── quantizeRecording — helpers ───────────────────────────────────────────────

// At 120 BPM, 4/4:  1 beat = 500 ms  |  1 measure = 2000 ms
const REC_120_44 = makeRecording(120, '4/4', [
  { measure: 1, atMs: 0 },
  { measure: 2, atMs: 2000 },
  { measure: 3, atMs: 4000 },
])

// At 60 BPM, 4/4:   1 beat = 1000 ms  |  1 measure = 4000 ms
const REC_60_44 = makeRecording(60, '4/4', [
  { measure: 1, atMs: 0 },
  { measure: 2, atMs: 4000 },
])

// At 120 BPM, 3/4:  1 beat = 500 ms  |  1 measure = 1500 ms
const REC_120_34 = makeRecording(120, '3/4', [
  { measure: 1, atMs: 0 },
  { measure: 2, atMs: 1500 },
])

// ── quantizeRecording ─────────────────────────────────────────────────────────

describe('quantizeRecording', () => {

  // ── empty input ─────────────────────────────────────────────────────────────

  describe('empty input', () => {
    it('returns [] for empty intervals', () => {
      expect(quantizeRecording([], REC_120_44)).toEqual([])
    })
  })

  // ── basic structure ──────────────────────────────────────────────────────────

  describe('basic structure', () => {
    it('returns the correct number of measures', () => {
      const intervals = [ni(60, 0, 400)]
      const measures = quantizeRecording(intervals, REC_120_44)
      expect(measures.length).toBeGreaterThanOrEqual(1)
    })

    it('each measure has treble and bass arrays', () => {
      const intervals = [ni(60, 0, 400)]
      const measures = quantizeRecording(intervals, REC_120_44)
      for (const m of measures) {
        expect(Array.isArray(m.treble)).toBe(true)
        expect(Array.isArray(m.bass)).toBe(true)
      }
    })

    it('propagates measure number, bpm, timeSig, startMs, endMs', () => {
      const intervals = [ni(60, 0, 400)]
      const measures = quantizeRecording(intervals, REC_120_44)
      const m1 = measures.find(m => m.measure === 1)!
      expect(m1).toBeDefined()
      expect(m1.bpm).toBe(120)
      expect(m1.timeSig).toBe('4/4')
      expect(m1.startMs).toBe(0)
      expect(m1.endMs).toBe(2000)
    })

    it('second measure starts at 2000 ms (4/4 at 120 BPM)', () => {
      const intervals = [ni(60, 0, 400), ni(60, 2000, 2400)]
      const measures = quantizeRecording(intervals, REC_120_44)
      const m2 = measures.find(m => m.measure === 2)
      expect(m2?.startMs).toBe(2000)
    })
  })

  // ── voice assignment ─────────────────────────────────────────────────────────

  describe('voice assignment (treble / bass split)', () => {
    it('note >= 60 goes to treble', () => {
      const measures = quantizeRecording([ni(60, 0, 400)], REC_120_44)
      const m1 = measures[0]
      const trebleKeys = m1.treble.filter(n => !n.isRest).flatMap(n => n.keys)
      expect(trebleKeys).toContain('c/4')
    })

    it('note >= 60 does NOT go to bass (bass is all rests)', () => {
      const measures = quantizeRecording([ni(60, 0, 400)], REC_120_44)
      const bassNonRest = measures[0].bass.filter(n => !n.isRest)
      expect(bassNonRest).toHaveLength(0)
    })

    it('note < 60 goes to bass', () => {
      const measures = quantizeRecording([ni(48, 0, 400)], REC_120_44)
      const bassKeys = measures[0].bass.filter(n => !n.isRest).flatMap(n => n.keys)
      expect(bassKeys).toContain('c/3')
    })

    it('note < 60 does NOT go to treble', () => {
      const measures = quantizeRecording([ni(48, 0, 400)], REC_120_44)
      const trebleNonRest = measures[0].treble.filter(n => !n.isRest)
      expect(trebleNonRest).toHaveLength(0)
    })

    it('hand=right forces note to treble even if MIDI < 60', () => {
      const measures = quantizeRecording(
        [ni(48, 0, 400, { hand: 'right' })],
        REC_120_44,
      )
      const trebleKeys = measures[0].treble.filter(n => !n.isRest).flatMap(n => n.keys)
      expect(trebleKeys).toContain('c/3')
      const bassNonRest = measures[0].bass.filter(n => !n.isRest)
      expect(bassNonRest).toHaveLength(0)
    })

    it('hand=left forces note to bass even if MIDI >= 60', () => {
      const measures = quantizeRecording(
        [ni(72, 0, 400, { hand: 'left' })],
        REC_120_44,
      )
      const bassKeys = measures[0].bass.filter(n => !n.isRest).flatMap(n => n.keys)
      expect(bassKeys).toContain('c/5')
      const trebleNonRest = measures[0].treble.filter(n => !n.isRest)
      expect(trebleNonRest).toHaveLength(0)
    })
  })

  // ── chord clustering ─────────────────────────────────────────────────────────

  describe('chord clustering (CHORD_CLUSTER_MS = 30)', () => {
    it('notes exactly 0 ms apart are grouped as a chord', () => {
      const intervals = [ni(60, 0, 400), ni(64, 0, 400), ni(67, 0, 400)]
      const measures = quantizeRecording(intervals, REC_120_44)
      const chords = measures[0].treble.filter(n => !n.isRest)
      expect(chords).toHaveLength(1)
      expect(chords[0].keys).toHaveLength(3)
    })

    it('notes 30 ms apart are still grouped as a chord', () => {
      const intervals = [ni(60, 0, 400), ni(64, 30, 430)]
      const measures = quantizeRecording(intervals, REC_120_44)
      const chords = measures[0].treble.filter(n => !n.isRest)
      expect(chords).toHaveLength(1)
      expect(chords[0].keys).toHaveLength(2)
    })

    it('notes 31 ms apart are treated as separate notes', () => {
      const intervals = [ni(60, 0, 400), ni(64, 31, 431)]
      const measures = quantizeRecording(intervals, REC_120_44)
      const notes = measures[0].treble.filter(n => !n.isRest)
      expect(notes).toHaveLength(2)
    })

    it('chord keys are sorted ascending by MIDI pitch', () => {
      // Notes given in descending order
      const intervals = [ni(67, 0, 400), ni(60, 0, 400), ni(64, 0, 400)]
      const measures = quantizeRecording(intervals, REC_120_44)
      const chord = measures[0].treble.find(n => !n.isRest)!
      expect(chord.keys).toEqual(['c/4', 'e/4', 'g/4'])
    })

    it('ALL notes of a chord appear in the keys array (no loss)', () => {
      const intervals = [ni(60, 0, 400), ni(63, 5, 405), ni(67, 10, 410), ni(70, 15, 415)]
      const measures = quantizeRecording(intervals, REC_120_44)
      const chord = measures[0].treble.find(n => !n.isRest)!
      expect(chord.keys).toContain('c/4')
      expect(chord.keys).toContain('eb/4')
      expect(chord.keys).toContain('g/4')
      expect(chord.keys).toContain('bb/4')
      expect(chord.keys).toHaveLength(4)
    })
  })

  // ── rest filling ─────────────────────────────────────────────────────────────

  describe('rest filling', () => {
    it('full-measure rest when no notes in voice', () => {
      // Only a treble note → bass should have exactly one rest covering the whole measure
      const measures = quantizeRecording([ni(60, 0, 400)], REC_120_44)
      const bassRests = measures[0].bass.filter(n => n.isRest)
      expect(bassRests).toHaveLength(1)
    })

    it('rest is marked isRest=true', () => {
      const measures = quantizeRecording([ni(60, 0, 400)], REC_120_44)
      const bassNote = measures[0].bass[0]
      expect(bassNote.isRest).toBe(true)
    })

    it('rest key is b/4 (VexFlow convention)', () => {
      const measures = quantizeRecording([ni(60, 0, 400)], REC_120_44)
      expect(measures[0].bass[0].keys).toEqual(['b/4'])
    })

    it('gap before first note produces a rest', () => {
      // Note starts at 500ms (1 beat gap at 120 BPM 4/4)
      const intervals = [ni(60, 500, 900)]
      const measures = quantizeRecording(intervals, REC_120_44)
      const trebleNotes = measures[0].treble
      // First entry should be a rest (gap before note)
      expect(trebleNotes[0].isRest).toBe(true)
    })

    it('gap between two notes produces a rest between them', () => {
      // Note 1: 0–400ms, Note 2: 1000–1400ms — gap of 600ms (> 1 beat)
      const intervals = [ni(60, 0, 400), ni(64, 1000, 1400)]
      const measures = quantizeRecording(intervals, REC_120_44)
      const treble = measures[0].treble
      // Pattern: note, rest, note, [possible tail rest]
      const noteIndices = treble.map((n, i) => ({ isRest: n.isRest, i })).filter(x => !x.isRest)
      expect(noteIndices.length).toBe(2)
      // There must be a rest somewhere between them
      const restBetween = treble.slice(noteIndices[0].i + 1, noteIndices[1].i).some(n => n.isRest)
      expect(restBetween).toBe(true)
    })

    it('tail of measure is filled with a rest when note ends before measure end', () => {
      // Note: 0–400ms, measure ends at 2000ms → 1600ms remaining
      const intervals = [ni(60, 0, 400)]
      const measures = quantizeRecording(intervals, REC_120_44)
      const treble = measures[0].treble
      const last = treble[treble.length - 1]
      expect(last.isRest).toBe(true)
    })
  })

  // ── no data loss ─────────────────────────────────────────────────────────────

  describe('no data loss', () => {
    it('single treble note: its key appears in output', () => {
      const measures = quantizeRecording([ni(69, 0, 400)], REC_120_44)
      expect(allNoteKeys(measures)).toContain('a/4')
    })

    it('single bass note: its key appears in output', () => {
      const measures = quantizeRecording([ni(45, 0, 400)], REC_120_44)
      expect(allNoteKeys(measures)).toContain('a/2')
    })

    it('every note in a multi-note sequence appears exactly once', () => {
      const intervals = [
        ni(60, 0, 400),
        ni(62, 500, 900),
        ni(64, 1000, 1400),
        ni(65, 1500, 1900),
      ]
      const measures = quantizeRecording(intervals, REC_120_44)
      const keys = allNoteKeys(measures)
      expect(keys).toContain('c/4')
      expect(keys).toContain('d/4')
      expect(keys).toContain('e/4')
      expect(keys).toContain('f/4')
      expect(keys).toHaveLength(4)
    })

    it('notes spanning two measures are all preserved', () => {
      const intervals = [
        ni(60, 0, 400),   // measure 1
        ni(64, 2000, 2400), // measure 2
      ]
      const measures = quantizeRecording(intervals, REC_120_44)
      const keys = allNoteKeys(measures)
      expect(keys).toContain('c/4')
      expect(keys).toContain('e/4')
    })

    it('treble and bass notes simultaneously: both preserved', () => {
      const intervals = [
        ni(60, 0, 400),  // treble C4
        ni(48, 0, 400),  // bass C3
      ]
      const measures = quantizeRecording(intervals, REC_120_44)
      const keys = allNoteKeys(measures)
      expect(keys).toContain('c/4')
      expect(keys).toContain('c/3')
    })

    it('no note is duplicated in single-voice sequence', () => {
      const intervals = [
        ni(60, 0, 400),
        ni(62, 500, 900),
        ni(64, 1000, 1400),
      ]
      const measures = quantizeRecording(intervals, REC_120_44)
      expect(noteCount(measures)).toBe(3)
    })

    it('large chord: all 7 notes preserved', () => {
      const midiNotes = [60, 62, 64, 65, 67, 69, 71]
      const intervals = midiNotes.map(n => ni(n, 0, 400))
      const measures = quantizeRecording(intervals, REC_120_44)
      const keys = allNoteKeys(measures)
      for (const midi of midiNotes) {
        expect(keys).toContain(midiToVfKey(midi))
      }
      expect(keys).toHaveLength(midiNotes.length)
    })

    it('repeated same pitch at different times: both appear', () => {
      const intervals = [ni(60, 0, 400), ni(60, 1000, 1400)]
      const measures = quantizeRecording(intervals, REC_120_44)
      // Two separate c/4 entries
      expect(allNoteKeys(measures).filter(k => k === 'c/4')).toHaveLength(2)
    })

    it('all 12 chromatic pitches in octave 4 survive round-trip', () => {
      // Place each note 100ms apart so they are separate events
      const intervals = Array.from({ length: 12 }, (_, i) =>
        ni(60 + i, i * 100, i * 100 + 80),
      )
      const rec = makeRecording(120, '4/4', [
        { measure: 1, atMs: 0 },
        { measure: 2, atMs: 2000 },
      ])
      const measures = quantizeRecording(intervals, rec)
      const keys = allNoteKeys(measures)
      for (let i = 0; i < 12; i++) {
        expect(keys).toContain(midiToVfKey(60 + i))
      }
    })

    it('notes across multiple octaves are all preserved', () => {
      // A0 (21), C3 (48), C4 (60), C5 (72), C8 (108) - placed in first measure
      const intervals = [
        ni(21, 0, 80),
        ni(48, 100, 180),
        ni(60, 200, 280),
        ni(72, 300, 380),
        ni(108, 400, 480),
      ]
      const rec = makeRecording(120, '4/4', [
        { measure: 1, atMs: 0 },
        { measure: 2, atMs: 2000 },
      ])
      const measures = quantizeRecording(intervals, rec)
      const keys = allNoteKeys(measures)
      expect(keys).toContain('a/0')
      expect(keys).toContain('c/3')
      expect(keys).toContain('c/4')
      expect(keys).toContain('c/5')
      expect(keys).toContain('c/8')
    })
  })

  // ── metadata preservation ────────────────────────────────────────────────────

  describe('metadata preservation', () => {
    it('dynamic is preserved from first note in group', () => {
      const intervals = [ni(60, 0, 400, { dynamic: 'ff' })]
      const measures = quantizeRecording(intervals, REC_120_44)
      const note = measures[0].treble.find(n => !n.isRest)!
      expect(note.dynamic).toBe('ff')
    })

    it('articulation is preserved from first note in group', () => {
      const intervals = [ni(60, 0, 400, { articulation: 'staccato' })]
      const measures = quantizeRecording(intervals, REC_120_44)
      const note = measures[0].treble.find(n => !n.isRest)!
      expect(note.articulation).toBe('staccato')
    })

    it('finger is preserved from first note in group', () => {
      const intervals = [ni(60, 0, 400, { finger: 3 })]
      const measures = quantizeRecording(intervals, REC_120_44)
      const note = measures[0].treble.find(n => !n.isRest)!
      expect(note.finger).toBe(3)
    })

    it('hand is preserved from first note in group', () => {
      const intervals = [ni(60, 0, 400, { hand: 'right' })]
      const measures = quantizeRecording(intervals, REC_120_44)
      const note = measures[0].treble.find(n => !n.isRest)!
      expect(note.hand).toBe('right')
    })

    it('startMs on output note reflects the group start', () => {
      const intervals = [ni(60, 500, 900)]
      const measures = quantizeRecording(intervals, REC_120_44)
      const note = measures[0].treble.find(n => !n.isRest)!
      expect(note.startMs).toBe(500)
    })

    it('endMs on output note reflects the group end', () => {
      const intervals = [ni(60, 500, 900)]
      const measures = quantizeRecording(intervals, REC_120_44)
      const note = measures[0].treble.find(n => !n.isRest)!
      expect(note.endMs).toBe(900)
    })

    it('endMs of chord is the max endMs of all notes in the group', () => {
      const intervals = [
        ni(60, 0, 400),
        ni(64, 10, 600), // ends later
        ni(67, 20, 350),
      ]
      const measures = quantizeRecording(intervals, REC_120_44)
      const chord = measures[0].treble.find(n => !n.isRest)!
      expect(chord.endMs).toBe(600)
    })
  })

  // ── duration quantization ────────────────────────────────────────────────────

  describe('duration quantization (120 BPM 4/4, msPerBeat=500)', () => {
    const durationCases: [string, number, number, string][] = [
      ['whole note (4 beats)',         0, 2000, 'w'],
      ['dotted-half note (3 beats)',   0, 1500, 'hd'],
      ['half note (2 beats)',          0, 1000, 'h'],
      ['dotted-quarter (1.5 beats)',   0, 750,  'qd'],
      ['quarter note (1 beat)',        0, 500,  'q'],
      ['dotted-eighth (0.75 beats)',   0, 375,  '8d'],
      ['eighth note (0.5 beats)',      0, 250,  '8'],
      ['dotted-sixteenth (0.375)',     0, 187,  '16d'],
      ['sixteenth note (0.25 beats)',  0, 125,  '16'],
      ['thirty-second (0.125 beats)', 0, 62,   '32'],
    ]

    for (const [label, start, end, expectedDur] of durationCases) {
      it(`${label} → duration '${expectedDur}'`, () => {
        const rec = makeRecording(120, '4/4', [
          { measure: 1, atMs: 0 },
          { measure: 2, atMs: 4000 }, // wide measure so note fits
        ])
        const intervals = [ni(60, start, end)]
        const measures = quantizeRecording(intervals, rec)
        const note = measures[0].treble.find(n => !n.isRest)!
        expect(note.duration).toBe(expectedDur)
      })
    }

    it('dots field matches dotted durations', () => {
      const rec = makeRecording(120, '4/4', [
        { measure: 1, atMs: 0 },
        { measure: 2, atMs: 4000 },
      ])
      const dotted = [750, 1500, 375, 187] // qd, hd, 8d, 16d
      const notDotted = [500, 1000, 2000, 250, 125, 62] // q, h, w, 8, 16, 32

      for (const endMs of dotted) {
        const m = quantizeRecording([ni(60, 0, endMs)], rec)
        const note = m[0].treble.find(n => !n.isRest)!
        expect(note.dots).toBe(1)
      }
      for (const endMs of notDotted) {
        const m = quantizeRecording([ni(60, 0, endMs)], rec)
        const note = m[0].treble.find(n => !n.isRest)!
        expect(note.dots).toBe(0)
      }
    })
  })

  // ── measure map ──────────────────────────────────────────────────────────────

  describe('measure map', () => {
    it('uses explicit measureMap when provided', () => {
      const intervals = [ni(60, 0, 400), ni(64, 2000, 2400)]
      const measures = quantizeRecording(intervals, REC_120_44)
      expect(measures.map(m => m.measure)).toContain(1)
      expect(measures.map(m => m.measure)).toContain(2)
    })

    it('builds synthetic measure map when none provided', () => {
      const rec: Recording = {
        version: 2,
        tempoMap: [{ atMs: 0, bpm: 120 }],
        timeSignatureMap: [{ atMs: 0, value: '4/4' }],
        events: [],
        // No measureMap
      }
      const intervals = [ni(60, 0, 400), ni(64, 2000, 2400)]
      const measures = quantizeRecording(intervals, rec)
      expect(measures.length).toBeGreaterThanOrEqual(1)
      // First measure always starts at 0
      expect(measures[0].startMs).toBe(0)
    })

    it('synthetic map measure numbers start at 1', () => {
      const rec: Recording = {
        version: 2,
        tempoMap: [{ atMs: 0, bpm: 120 }],
        timeSignatureMap: [{ atMs: 0, value: '4/4' }],
        events: [],
      }
      const intervals = [ni(60, 0, 400)]
      const measures = quantizeRecording(intervals, rec)
      expect(measures[0].measure).toBe(1)
    })

    it('3/4 at 120 BPM produces 1500 ms measures synthetically', () => {
      const rec: Recording = {
        version: 2,
        tempoMap: [{ atMs: 0, bpm: 120 }],
        timeSignatureMap: [{ atMs: 0, value: '3/4' }],
        events: [],
      }
      // Note that ends at 1600ms forces at least 2 measures
      const intervals = [ni(60, 0, 400), ni(64, 1600, 1900)]
      const measures = quantizeRecording(intervals, rec)
      expect(measures.length).toBeGreaterThanOrEqual(2)
      // Second measure should start at 1500 ms
      const m2 = measures.find(m => m.startMs === 1500)
      expect(m2).toBeDefined()
    })

    it('timeSig from recording propagated to each measure', () => {
      const intervals = [ni(60, 0, 400)]
      const measures = quantizeRecording(intervals, REC_120_34)
      expect(measures[0].timeSig).toBe('3/4')
    })

    it('bpm from recording propagated to each measure', () => {
      const intervals = [ni(60, 0, 400)]
      const measures = quantizeRecording(intervals, REC_60_44)
      expect(measures[0].bpm).toBe(60)
    })
  })

  // ── treble + bass together ───────────────────────────────────────────────────

  describe('simultaneous treble and bass (full grand staff)', () => {
    it('C major chord spanning both hands: all notes preserved', () => {
      // Right hand: E4 (64), G4 (67), C5 (72)
      // Left hand: C3 (48), G3 (55), E3 (52)
      const intervals = [
        ni(64, 0, 400, { hand: 'right' }),
        ni(67, 0, 400, { hand: 'right' }),
        ni(72, 0, 400, { hand: 'right' }),
        ni(48, 0, 400, { hand: 'left' }),
        ni(55, 0, 400, { hand: 'left' }),
        ni(52, 0, 400, { hand: 'left' }),
      ]
      const measures = quantizeRecording(intervals, REC_120_44)
      const allKeys = allNoteKeys(measures)
      expect(allKeys).toContain('e/4')
      expect(allKeys).toContain('g/4')
      expect(allKeys).toContain('c/5')
      expect(allKeys).toContain('c/3')
      expect(allKeys).toContain('g/3')
      expect(allKeys).toContain('e/3')
      expect(allKeys).toHaveLength(6)
    })

    it('treble and bass voices are independent per measure', () => {
      const intervals = [
        ni(60, 0, 400),  // treble
        ni(48, 0, 400),  // bass
      ]
      const measures = quantizeRecording(intervals, REC_120_44)
      const trebleNotes = measures[0].treble.filter(n => !n.isRest)
      const bassNotes   = measures[0].bass.filter(n => !n.isRest)
      expect(trebleNotes).toHaveLength(1)
      expect(bassNotes).toHaveLength(1)
    })
  })

  // ── pitch accuracy ───────────────────────────────────────────────────────────

  describe('pitch accuracy (MIDI → VexFlow key round-trip)', () => {
    it('E♭4 (MIDI 63) stored as eb/4 in output', () => {
      const measures = quantizeRecording([ni(63, 0, 400)], REC_120_44)
      expect(allNoteKeys(measures)).toContain('eb/4')
    })

    it('G♭4 (MIDI 66) stored as gb/4 in output', () => {
      const measures = quantizeRecording([ni(66, 0, 400)], REC_120_44)
      expect(allNoteKeys(measures)).toContain('gb/4')
    })

    it('A♭4 (MIDI 68) stored as ab/4 in output', () => {
      const measures = quantizeRecording([ni(68, 0, 400)], REC_120_44)
      expect(allNoteKeys(measures)).toContain('ab/4')
    })

    it('B♭4 (MIDI 70) stored as bb/4 in output', () => {
      const measures = quantizeRecording([ni(70, 0, 400)], REC_120_44)
      expect(allNoteKeys(measures)).toContain('bb/4')
    })

    it('A0 (lowest piano key, MIDI 21) is preserved as a/0', () => {
      const intervals = [ni(21, 0, 400, { hand: 'left' })]
      const measures = quantizeRecording(intervals, REC_120_44)
      expect(allNoteKeys(measures)).toContain('a/0')
    })

    it('C8 (highest standard piano key, MIDI 108) is preserved as c/8', () => {
      const intervals = [ni(108, 0, 400, { hand: 'right' })]
      const measures = quantizeRecording(intervals, REC_120_44)
      expect(allNoteKeys(measures)).toContain('c/8')
    })
  })

  // ── 6/8 time signature (compound meter) ─────────────────────────────────────

  describe('6/8 time signature — correct absolute VexFlow codes', () => {
    // 6/8 at 120 BPM (quarter = 120): 1 quarter = 500ms, 1 eighth = 250ms.
    // Measure = 6 eighths = 1500ms = 3 quarter-note beats.
    // VexFlow codes must use absolute values: eighth=>'8', quarter=>'q', etc.
    // Bug (fixed): msPerBeat was 250ms (per eighth), causing eighth→'q', quarter→'h'.
    const REC_68 = makeRecording(120, '6/8', [
      { measure: 1, atMs: 0 },
      { measure: 2, atMs: 1500 },
    ])

    it('eighth note (250ms) → "8", not "q"', () => {
      const m = quantizeRecording([ni(60, 0, 250)], REC_68)
      const note = m[0].treble.find(n => !n.isRest)!
      expect(note.duration).toBe('8')
    })

    it('quarter note (500ms) → "q", not "h"', () => {
      const m = quantizeRecording([ni(60, 0, 500)], REC_68)
      const note = m[0].treble.find(n => !n.isRest)!
      expect(note.duration).toBe('q')
    })

    it('dotted quarter (750ms) → "qd", not "hd"', () => {
      const m = quantizeRecording([ni(60, 0, 750)], REC_68)
      const note = m[0].treble.find(n => !n.isRest)!
      expect(note.duration).toBe('qd')
    })

    it('half note (1000ms) → "h", not "w"', () => {
      const m = quantizeRecording([ni(60, 0, 1000)], REC_68)
      const note = m[0].treble.find(n => !n.isRest)!
      expect(note.duration).toBe('h')
    })

    it('full-measure rest is dotted-half ("hd") = 3 quarter beats', () => {
      // 6/8 measure = 6 eighths = 3 quarter-note beats → nearestDuration(3) = 'hd'
      // Bug (fixed): was using tsBeats=6 raw → nearestDuration(6) → 'w' (wrong).
      const m = quantizeRecording([ni(60, 0, 250)], REC_68)
      const bassRest = m[0].bass[0]
      expect(bassRest.isRest).toBe(true)
      expect(bassRest.duration).toBe('hd')
    })

    it('note in 6/8 does not lose pitch', () => {
      const m = quantizeRecording([ni(64, 0, 250)], REC_68)
      expect(allNoteKeys(m)).toContain('e/4')
    })
  })

  // ── 2/2 time signature (cut time) ───────────────────────────────────────────

  describe('2/2 time signature — correct absolute VexFlow codes', () => {
    // 2/2 at 120 BPM (quarter = 120): 1 quarter = 500ms, 1 half = 1000ms.
    // Measure = 2 halves = 2000ms = 4 quarter-note beats.
    // Bug (fixed): msPerBeat was 1000ms (per half note), causing quarter→'8', half→'q'.
    const REC_22 = makeRecording(120, '2/2', [
      { measure: 1, atMs: 0 },
      { measure: 2, atMs: 2000 },
    ])

    it('quarter note (500ms) → "q", not "8"', () => {
      const m = quantizeRecording([ni(60, 0, 500)], REC_22)
      const note = m[0].treble.find(n => !n.isRest)!
      expect(note.duration).toBe('q')
    })

    it('half note (1000ms) → "h", not "q"', () => {
      const m = quantizeRecording([ni(60, 0, 1000)], REC_22)
      const note = m[0].treble.find(n => !n.isRest)!
      expect(note.duration).toBe('h')
    })

    it('whole note (2000ms) → "w", not "h"', () => {
      const m = quantizeRecording([ni(60, 0, 2000)], REC_22)
      const note = m[0].treble.find(n => !n.isRest)!
      expect(note.duration).toBe('w')
    })

    it('full-measure rest is whole ("w") = 4 quarter beats', () => {
      const m = quantizeRecording([ni(60, 0, 500)], REC_22)
      const bassRest = m[0].bass[0]
      expect(bassRest.isRest).toBe(true)
      expect(bassRest.duration).toBe('w')
    })
  })

  // ── v1 recording compat ──────────────────────────────────────────────────────

  describe('v1 Recording compatibility', () => {
    it('falls back to bpm field when tempoMap is absent', () => {
      const rec: Recording = {
        version: 1,
        bpm: 90,
        timeSignature: '4/4',
        events: [],
        measureMap: [{ measure: 1, atMs: 0 }, { measure: 2, atMs: 2667 }],
      }
      const intervals = [ni(60, 0, 400)]
      const measures = quantizeRecording(intervals, rec)
      expect(measures[0].bpm).toBe(90)
    })

    it('falls back to timeSignature field when timeSignatureMap is absent', () => {
      const rec: Recording = {
        version: 1,
        bpm: 120,
        timeSignature: '3/4',
        events: [],
        measureMap: [{ measure: 1, atMs: 0 }, { measure: 2, atMs: 1500 }],
      }
      const intervals = [ni(60, 0, 400)]
      const measures = quantizeRecording(intervals, rec)
      expect(measures[0].timeSig).toBe('3/4')
    })
  })

  // ── polyphonic voices within one clef ────────────────────────────────────────

  describe('independent MusicXML voices within a clef', () => {
    it('single-voice content collapses to one entry in trebleVoices/bassVoices (backward compat)', () => {
      const intervals = [ni(72, 0, 400, { hand: 'right' }), ni(48, 0, 1900, { hand: 'left' })]
      const measures = quantizeRecording(intervals, REC_120_44)
      const m1 = measures.find(m => m.measure === 1)!
      expect(m1.trebleVoices.length).toBe(1)
      expect(m1.bassVoices.length).toBe(1)
      expect(m1.treble).toBe(m1.trebleVoices[0])
      expect(m1.bass).toBe(m1.bassVoices[0])
    })

    it('splits two independent voices in the same clef into separate streams', () => {
      // Voice 1: two quarter notes (melody). Voice 2: one half note (sustained).
      const intervals = [
        ni(72, 0, 500, { hand: 'right', voice: 1 }),
        ni(74, 500, 1000, { hand: 'right', voice: 1 }),
        ni(60, 0, 1000, { hand: 'right', voice: 2 }),
      ]
      const measures = quantizeRecording(intervals, REC_120_44)
      const m1 = measures.find(m => m.measure === 1)!
      expect(m1.trebleVoices.length).toBe(2)

      const v1Notes = m1.trebleVoices[0].filter(n => !n.isRest)
      const v2Notes = m1.trebleVoices[1].filter(n => !n.isRest)
      expect(v1Notes.length).toBe(2)
      expect(v2Notes.length).toBe(1)
      // Voice 2's half note must not be merged/clustered with voice 1's onsets.
      expect(v2Notes[0].duration).toBe('h')
    })

    it('groups voice-less notes as voice 1, matching pre-voice-split behaviour', () => {
      const intervals = [ni(72, 0, 500, { hand: 'right' }), ni(74, 500, 1000, { hand: 'right' })]
      const measures = quantizeRecording(intervals, REC_120_44)
      const m1 = measures.find(m => m.measure === 1)!
      expect(m1.trebleVoices.length).toBe(1)
      expect(m1.trebleVoices[0].filter(n => !n.isRest).length).toBe(2)
    })
  })
})
