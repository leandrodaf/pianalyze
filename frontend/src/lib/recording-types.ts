/** Finger number: 1 = thumb … 5 = pinky (same convention for both hands). */
export type Finger = 1 | 2 | 3 | 4 | 5

/** Which hand plays the note. */
export type Hand = 'left' | 'right'

export type Dynamic = 'pp' | 'p' | 'mp' | 'mf' | 'f' | 'ff'
export type Articulation = 'legato' | 'staccato' | 'tenuto' | 'accent'

/** Named section marker within a recording (e.g. "Subida", "Descida"). */
export interface Section {
  /** Display name shown in the UI (e.g. loop region selector). */
  name: string
  /** Start time of this section in milliseconds from the recording start. */
  startMs: number
}

/** A note-on → note-off pair extracted from a Recording. */
export interface NoteInterval {
  note: number
  startMs: number
  endMs: number
  /** Which finger should press this note (optional — absent = not specified). */
  finger?: Finger
  /** Which hand plays this note (optional — absent = not specified). */
  hand?: Hand
  dynamic?: Dynamic
  articulation?: Articulation
}

/** Maximum ms offset between student input and expected note to count as correct. */
export const GRADE_TOLERANCE_MS = 300

export interface RecordedEvent {
  /** Milliseconds from the start of the recording. */
  t: number
  /** Raw MIDI command byte (e.g. 0x90 = NoteOn, 0x80 = NoteOff). */
  cmd: number
  /** MIDI note number 0–127. */
  note: number
  /** Velocity 0–127. 0 always means note-off regardless of cmd. */
  vel: number
  /** Which finger should press this note (only on note-on events, optional). */
  finger?: Finger
  /** Which hand plays this note (only on note-on events, optional). */
  hand?: Hand
  /** Prescribed dynamic marking (how loud to play — optional, only on note-on). */
  dynamic?: Dynamic
  /** Articulation marking (how to play the note — optional, only on note-on). */
  articulation?: Articulation
}

export interface Recording {
  version: number
  recordedAt: string  // RFC3339 UTC
  /** Target tempo in beats per minute. */
  bpm?: number
  /** Time signature, e.g. "4/4", "3/4", "6/8". */
  timeSignature?: string
  /** Key signature, e.g. "C", "G", "Dm", "Am". */
  keySignature?: string
  /** Named section markers for loop/navigation. Sorted by startMs ascending. */
  sections?: Section[]
  events: RecordedEvent[]
}
