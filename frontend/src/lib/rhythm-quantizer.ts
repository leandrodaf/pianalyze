import type { NoteInterval, Recording, TupletInfo } from './recording-types'
import { bpmAt, timeSigAt } from './recording-types'

// ── Types ─────────────────────────────────────────────────────────────────────

export type VfDuration = 'w' | 'hd' | 'h' | 'qd' | 'q' | '8d' | '8' | '16d' | '16' | '32'

export interface QuantizedNote {
  keys: string[]       // VexFlow pitch strings, e.g. ['c/4', 'e/4', 'g/4']
  duration: VfDuration
  dots: number         // 0 or 1
  startMs: number
  endMs: number
  isRest: boolean
  articulation?: string
  dynamic?: string
  finger?: number
  hand?: 'left' | 'right'
  /** Tuplet ratio (e.g. triplet = {actualNotes:3, normalNotes:2}) for notation grouping. */
  tuplet?: TupletInfo
}

export interface QuantizedMeasure {
  measure: number
  startMs: number
  endMs: number
  timeSig: string   // e.g. '4/4'
  bpm: number
  /** Primary (first) musical voice in each clef — kept for callers that don't care about polyphony. */
  treble: QuantizedNote[]
  bass: QuantizedNote[]
  /**
   * All independent musical voices (MusicXML <voice> numbers) present in each
   * clef, sorted by voice number ascending. Length 1 in the common
   * monophonic-per-staff case, in which case treble === trebleVoices[0].
   * Notes with no voice number (e.g. live recordings) are all grouped as voice 1.
   */
  trebleVoices: QuantizedNote[][]
  bassVoices: QuantizedNote[][]
}

// ── MIDI → VexFlow pitch ──────────────────────────────────────────────────────

// Use flat names for all black keys (VexFlow handles them correctly)
const NOTE_NAMES = ['c', 'db', 'd', 'eb', 'e', 'f', 'gb', 'g', 'ab', 'a', 'bb', 'b']

export function midiToVfKey(midi: number): string {
  const octave = Math.floor(midi / 12) - 1
  return `${NOTE_NAMES[midi % 12]}/${Math.max(0, octave)}`
}

// ── Duration quantization ─────────────────────────────────────────────────────

interface DurInfo { code: VfDuration; dots: number; beats: number }

const DURATIONS: DurInfo[] = [
  { code: 'w',   dots: 0, beats: 4     },
  { code: 'hd',  dots: 1, beats: 3     },
  { code: 'h',   dots: 0, beats: 2     },
  { code: 'qd',  dots: 1, beats: 1.5   },
  { code: 'q',   dots: 0, beats: 1     },
  { code: '8d',  dots: 1, beats: 0.75  },
  { code: '8',   dots: 0, beats: 0.5   },
  { code: '16d', dots: 1, beats: 0.375 },
  { code: '16',  dots: 0, beats: 0.25  },
  { code: '32',  dots: 0, beats: 0.125 },
]

function nearestDuration(beats: number): DurInfo {
  let best = DURATIONS[DURATIONS.length - 1]
  let minDiff = Infinity
  for (const d of DURATIONS) {
    const diff = Math.abs(d.beats - beats)
    if (diff < minDiff) { minDiff = diff; best = d }
  }
  return best
}

// ── Time signature helpers ────────────────────────────────────────────────────

/**
 * Parse a time-signature string into total beats + beat value for measure-
 * duration math. Handles the two additive/compound forms the MusicXML
 * importer can emit (#17):
 *   - Shared denominator: "3+2/8"   (numerators joined by "+", one "/den")
 *   - Mixed denominators:  "3/8+2/4" (full "n/d" fragments joined by "+")
 * A plain "4/4" round-trips exactly as before.
 */
export function parseTimeSig(ts: string): { beats: number; beatValue: number } {
  if (ts.includes('+')) {
    const slashCount = (ts.match(/\//g) ?? []).length
    if (slashCount === 1) {
      const [numsPart, dPart] = ts.split('/')
      const d = Number(dPart) || 4
      const total = numsPart.split('+').reduce((sum, s) => sum + (Number(s) || 0), 0)
      return { beats: total || 4, beatValue: d }
    }
    // Mixed denominators — normalize every fragment to quarter-note beats.
    const totalQuarters = ts.split('+').reduce((sum, frag) => {
      const [n, d] = frag.split('/').map(Number)
      return n && d ? sum + n * (4 / d) : sum
    }, 0)
    return { beats: totalQuarters || 4, beatValue: 4 }
  }
  const [n, d] = ts.split('/').map(Number)
  return { beats: n || 4, beatValue: d || 4 }
}

function measureDurationMs(bpm: number, ts: string): number {
  const { beats, beatValue } = parseTimeSig(ts)
  return beats * (60000 / bpm) * (4 / beatValue)
}

// ── Key signature conversion ──────────────────────────────────────────────────

const MINOR_TO_MAJOR: Record<string, string> = {
  Am: 'C', Em: 'G', Bm: 'D', 'F#m': 'A', 'C#m': 'E', 'G#m': 'B', 'D#m': 'F#', 'A#m': 'C#',
  Dm: 'F', Gm: 'Bb', Cm: 'Eb', Fm: 'Ab', Bbm: 'Db', Ebm: 'Gb', Abm: 'Cb',
}

export function toVexFlowKey(ks: string | undefined): string {
  if (!ks) return 'C'
  return MINOR_TO_MAJOR[ks] ?? ks
}

// ── Main quantizer ────────────────────────────────────────────────────────────

// Notes within this window (ms) are treated as simultaneous (chord)
const CHORD_CLUSTER_MS = 30

export function quantizeRecording(
  intervals: NoteInterval[],
  recording: Recording,
): QuantizedMeasure[] {
  if (intervals.length === 0) return []

  // Use last onset + buffer so synthetic map covers the final measure even when
  // the recording ends shortly after the last key-press (staccato last note).
  const lastOnsetMs = Math.max(...intervals.map(iv => iv.startMs))
  const totalMs     = Math.max(...intervals.map(iv => iv.endMs), lastOnsetMs) + 2000
  const rawMap = recording.measureMap?.length
    ? recording.measureMap
    : buildSyntheticMap(recording, totalMs)

  const result: QuantizedMeasure[] = []

  for (let i = 0; i < rawMap.length; i++) {
    const entry = rawMap[i]
    const next  = rawMap[i + 1]
    const startMs = entry.atMs
    const endMs   = next ? next.atMs : totalMs

    if (endMs <= 0 || startMs >= totalMs) continue

    const bpm = bpmAt(recording, startMs)
    const ts  = timeSigAt(recording, startMs)
    const { beats: tsBeats, beatValue } = parseTimeSig(ts)
    // msPerBeat must be ms per quarter note so nearestDuration() maps correctly
    // to absolute VexFlow codes ('q', 'h', '8', …) regardless of time signature.
    const msPerBeat = 60000 / bpm
    // Convert measure beats to quarter-note units for rest-duration calculation.
    const quarterBeatsInMeasure = tsBeats * (4 / beatValue)

    const mNotes = intervals.filter(iv => iv.startMs >= startMs && iv.startMs < endMs)

    const trebleVoices = buildClefVoices(mNotes, 'treble', startMs, endMs, msPerBeat, quarterBeatsInMeasure)
    const bassVoices   = buildClefVoices(mNotes, 'bass',   startMs, endMs, msPerBeat, quarterBeatsInMeasure)

    result.push({
      measure: entry.measure,
      startMs,
      endMs,
      timeSig: ts,
      bpm,
      treble: trebleVoices[0],
      bass:   bassVoices[0],
      trebleVoices,
      bassVoices,
    })
  }

  return result
}

function buildSyntheticMap(
  recording: Recording,
  totalMs: number,
): Array<{ measure: number; atMs: number }> {
  const out: Array<{ measure: number; atMs: number }> = []
  let cur = 0, num = 1
  while (cur < totalMs && num <= 300) {
    out.push({ measure: num, atMs: cur })
    cur += measureDurationMs(bpmAt(recording, cur), timeSigAt(recording, cur))
    num++
  }
  return out
}

/**
 * Split a clef's notes into independent musical voices (MusicXML <voice>
 * numbers) and quantize each one separately. Notes with no voice number
 * (e.g. live recordings without MusicXML provenance) are all treated as a
 * single voice 1, which reproduces the previous single-stream behaviour.
 */
function buildClefVoices(
  notes: NoteInterval[],
  clef: 'treble' | 'bass',
  startMs: number,
  endMs: number,
  msPerBeat: number,
  totalBeats: number,
): QuantizedNote[][] {
  const voiced = notes.filter(iv =>
    clef === 'treble'
      ? (iv.hand === 'right' || (!iv.hand && iv.note >= 60))
      : (iv.hand === 'left'  || (!iv.hand && iv.note <  60))
  )

  if (voiced.length === 0) {
    return [[makeRest(startMs, endMs, Math.max(totalBeats, 0.125))]]
  }

  const byVoice = new Map<number, NoteInterval[]>()
  for (const iv of voiced) {
    const vn = iv.voice ?? 1
    const group = byVoice.get(vn)
    if (group) group.push(iv)
    else byVoice.set(vn, [iv])
  }

  return [...byVoice.keys()]
    .sort((a, b) => a - b)
    .map(vn => buildVoiceNotes(byVoice.get(vn)!, startMs, endMs, msPerBeat, totalBeats))
}

function buildVoiceNotes(
  voiced: NoteInterval[],
  startMs: number,
  endMs: number,
  msPerBeat: number,
  totalBeats: number,
): QuantizedNote[] {
  const groups = clusterChords(voiced)
  const result: QuantizedNote[] = []
  let cursor = startMs

  for (let gi = 0; gi < groups.length; gi++) {
    const group      = groups[gi]
    const gStart     = group[0].startMs
    const groupEndMs = Math.max(...group.map(iv => iv.endMs))

    // Score duration: use the actual note-group duration, capped at the next
    // note's onset and the measure boundary. This correctly maps key-press
    // durations to VexFlow codes regardless of time signature, while still
    // preventing overlap with the next note.
    const nextStart = gi + 1 < groups.length ? groups[gi + 1][0].startMs : endMs
    const slotEnd   = Math.min(groupEndMs, nextStart, endMs)

    // Gap before this chord → fill with a rest
    const gapBeats = (gStart - cursor) / msPerBeat
    if (gapBeats >= 0.1) {
      const d = nearestDuration(gapBeats)
      result.push(makeRest(cursor, cursor + d.beats * msPerBeat, d.beats))
      cursor += d.beats * msPerBeat
    }

    const onsetBeats = Math.max((slotEnd - gStart) / msPerBeat, 0.125)
    // A tupleted note's onset is already compressed by the tuplet ratio (a
    // triplet eighth sounds for 1/3 of a beat instead of 1/2) — recover the
    // notated ("normal") duration before matching against the fixed-value
    // DURATIONS table, otherwise it misquantizes to the nearest regular value.
    const tuplet = group[0].tuplet
    const nominalBeats = tuplet
      ? onsetBeats * (tuplet.actualNotes / tuplet.normalNotes)
      : onsetBeats
    const durInfo = nearestDuration(nominalBeats)

    result.push({
      keys:         group.sort((a, b) => a.note - b.note).map(iv => midiToVfKey(iv.note)),
      duration:     durInfo.code,
      dots:         durInfo.dots,
      startMs:      gStart,
      endMs:        groupEndMs,
      isRest:       false,
      articulation: group[0].articulation,
      dynamic:      group[0].dynamic,
      finger:       group[0].finger,
      hand:         group[0].hand,
      tuplet,
    })

    cursor = gStart + durInfo.beats * msPerBeat
  }

  // Fill remaining tail of measure with a rest
  const remainBeats = (endMs - cursor) / msPerBeat
  if (remainBeats >= 0.1) {
    result.push(makeRest(cursor, endMs, remainBeats))
  }

  return result
}

function clusterChords(notes: NoteInterval[]): NoteInterval[][] {
  const sorted = [...notes].sort((a, b) => a.startMs - b.startMs)
  const groups: NoteInterval[][] = []
  for (const note of sorted) {
    const last = groups[groups.length - 1]
    if (last && Math.abs(note.startMs - last[0].startMs) <= CHORD_CLUSTER_MS) {
      last.push(note)
    } else {
      groups.push([note])
    }
  }
  return groups
}

function makeRest(startMs: number, endMs: number, beats: number): QuantizedNote {
  const d = nearestDuration(Math.max(beats, 0.125))
  return {
    keys: ['b/4'], duration: d.code, dots: d.dots,
    startMs, endMs, isRest: true,
  }
}
