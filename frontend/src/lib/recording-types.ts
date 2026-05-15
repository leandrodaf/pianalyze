/** Finger number: 1 = thumb … 5 = pinky (same convention for both hands). */
export type Finger = 1 | 2 | 3 | 4 | 5

/** A note-on → note-off pair extracted from a Recording. */
export interface NoteInterval {
  note: number
  startMs: number
  endMs: number
  /** Which finger should press this note (optional — absent = not specified). */
  finger?: Finger
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
}

export interface Recording {
  version: number
  recordedAt: string  // RFC3339 UTC
  events: RecordedEvent[]
}
