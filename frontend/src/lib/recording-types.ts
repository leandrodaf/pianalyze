/** Finger number: 1 = thumb … 5 = pinky (same convention for both hands). */
export type Finger = 1 | 2 | 3 | 4 | 5

/** Which hand plays the note. */
export type Hand = 'left' | 'right'

export type Dynamic = 'pp' | 'p' | 'mp' | 'mf' | 'f' | 'ff'
export type Articulation = 'legato' | 'staccato' | 'tenuto' | 'accent'

/** Voice within the staff (1 = melody, 2 = accompaniment, etc.). */
export type Voice = 1 | 2 | 3 | 4

/** Beat unit for metronome BPM interpretation. Default: 'quarter'. */
export type BeatUnit = 'quarter' | 'half' | 'eighth' | 'dotted-quarter'

// ── Structure ─────────────────────────────────────────────────────────────────

/** Named section marker within a recording (e.g. "Subida", "Descida"). */
export interface Section {
  /** Display name shown in the UI. */
  name: string
  /** Start time in milliseconds from the recording start. */
  startMs: number
  /** Optional structural role of this section (F3). */
  type?: 'intro' | 'verse' | 'chorus' | 'bridge' | 'coda' | 'rehearsal' | 'free'
}

// ── Metadata (M1, M2, M3) ─────────────────────────────────────────────────────

/** Provenance of an imported recording. */
export interface RecordingSource {
  format: 'musicxml' | 'mscz' | 'midi' | 'manual'
  filename?: string
  /** ISO 8601 timestamp of when the file was imported. */
  importedAt?: string
}

/** Title, composer, and copyright metadata for the recording (M1, M2). */
export interface RecordingMeta {
  title?: string
  composer?: string
  copyright?: string
  source?: RecordingSource
}

// ── Timing (T1, T2, T3, T4, T5) ──────────────────────────────────────────────

/**
 * A point on the tempo map (T1, T2, T4).
 * If toMs + toBpm are both present, the tempo ramps linearly from bpm → toBpm
 * over the range atMs → toMs (rit. / accel.). Otherwise it is a step change.
 */
export interface TempoEvent {
  /** Recording position where this tempo takes effect (ms). */
  atMs: number
  /** Tempo in beats per minute at atMs. */
  bpm: number
  /** Which note value equals one beat. Defaults to 'quarter'. */
  beatUnit?: BeatUnit
  /** End of linear ramp (ms). Required together with toBpm for gradual changes. */
  toMs?: number
  /** Tempo at the end of the ramp (bpm). */
  toBpm?: number
  /** Human-readable label, e.g. "Allegro", "rit.", "a tempo". */
  label?: string
}

/** Time-signature change at a specific recording position (T3). */
export interface TimeSigEvent {
  /** Recording position where the new time signature takes effect (ms). */
  atMs: number
  /** Time signature string, e.g. "4/4", "3/4", "6/8", "5/4". */
  value: string
}

/** Measure (bar) start position for navigation and metronome alignment (F2). */
export interface MeasureEntry {
  /** Measure number (1-indexed). Anacrusis = 0. */
  measure: number
  /** Start of this measure in ms. */
  atMs: number
}

// ── Expression (E3, E5) ───────────────────────────────────────────────────────

/** Dynamic hairpin — crescendo or decrescendo — over a time range (E3). */
export interface Hairpin {
  startMs: number
  endMs: number
  from: Dynamic
  to: Dynamic
}

// ── Grading (G1, G2) ──────────────────────────────────────────────────────────

/** Per-exercise grading tolerances (G1, G2). All fields optional; absent = use defaults. */
export interface GradingProfile {
  /** Max ms a student may press early. Default: 500. */
  earlyToleranceMs?: number
  /** Max ms a student may press late. Default: 300. */
  lateToleranceMs?: number
  /** Delta below which the result is "perfect". Default: 90. */
  perfectMs?: number
  /** Delta below which the result is "good". Default: 200. */
  goodMs?: number
  /** If true, penalise dynamic (velocity) mismatches. Default: false. */
  checkVelocity?: boolean
  /** Acceptable MIDI velocity difference when checkVelocity is true. Default: 30. */
  velocityTolerance?: number
  /** If true, penalise articulation mismatches. Default: false. */
  checkArticulation?: boolean
}

// ── Events ────────────────────────────────────────────────────────────────────

export interface RecordedEvent {
  /**
   * Milliseconds from the start of the recording.
   * Integer recommended; float accepted (V4).
   */
  t: number
  /**
   * Raw MIDI command byte (V2):
   *   0x90 (144) = NoteOn
   *   0x80 (128) = NoteOff
   *   0xB0 (176) = Control Change — sustain (#64), sostenuto (#66), una corda (#67)
   */
  cmd: number
  /**
   * MIDI note number 0–127 for NoteOn/NoteOff.
   * Controller number for CC events (64 = sustain, 66 = sostenuto, 67 = una corda).
   */
  note: number
  /** Velocity 0–127. 0 always means off regardless of cmd. CC value for CC events. */
  vel: number

  // ── Pedagogical fields — NoteOn events only ──────────────────────────────
  /** Which finger should press this note (optional). */
  finger?: Finger
  /** Which hand plays this note (optional). */
  hand?: Hand
  /**
   * Prescribed dynamic from the score — what the score says (pedagogy).
   * Separate from vel which is the playback velocity (E2).
   */
  dynamic?: Dynamic
  /** Articulation marking (staccato, legato, etc.). */
  articulation?: Articulation
  /** True for grace notes (acciaccatura / appoggiatura) — E4. */
  grace?: boolean
  /** Pedagogical tip, e.g. "cruzar polegar aqui" — G5. */
  tip?: string
  /** Voice within the staff (1 = melody, 2 = accompaniment) — E7. */
  voice?: Voice
}

/** A note-on → note-off pair extracted from a Recording. */
export interface NoteInterval {
  note: number
  startMs: number
  endMs: number
  finger?: Finger
  hand?: Hand
  dynamic?: Dynamic
  articulation?: Articulation
  grace?: boolean
  voice?: Voice
  /** Pedagogical tip shown as the note approaches the judge line (G5). */
  tip?: string
}

// ── Recording (root) ─────────────────────────────────────────────────────────

export interface Recording {
  /** Schema version. 1 = legacy; 2 = current. */
  version: number
  /**
   * ISO 8601 UTC timestamp of when the performance was recorded.
   * Optional for manually-composed exercises (M3).
   */
  recordedAt?: string

  // ── Metadata ──────────────────────────────────────────────────────────────
  meta?: RecordingMeta

  // ── Timing ────────────────────────────────────────────────────────────────
  /** Full tempo map (T1, T2, T4). Replaces the single bpm field. */
  tempoMap?: TempoEvent[]
  /** @deprecated v1 compat — use tempoMap instead. */
  bpm?: number
  /** Full time-signature map (T3). Replaces the single timeSignature field. */
  timeSignatureMap?: TimeSigEvent[]
  /** @deprecated v1 compat — use timeSignatureMap instead. */
  timeSignature?: string
  /** Initial key signature, e.g. "C", "G", "Dm", "Am". */
  keySignature?: string
  /** True if the first measure is an anacrusis / pickup (T5). */
  pickup?: boolean

  // ── Structure ─────────────────────────────────────────────────────────────
  /** Named section markers for loop / navigation. Sorted by startMs ascending. */
  sections?: Section[]
  /** Measure start positions for metronome alignment and navigation (F2). */
  measureMap?: MeasureEntry[]
  /** Dynamic hairpins (crescendo / decrescendo) — E3. */
  hairpins?: Hairpin[]

  // ── Pedagogy ──────────────────────────────────────────────────────────────
  /** Per-exercise grading tolerances. Absent = defaults. */
  gradingProfile?: GradingProfile

  // ── Events ────────────────────────────────────────────────────────────────
  /** MIDI events: NoteOn (0x90), NoteOff (0x80), Control Change (0xB0). */
  events: RecordedEvent[]
}

// ── Migration (V1) ────────────────────────────────────────────────────────────

/**
 * Migrate a v1 Recording to v2 in-place.
 * Safe to call on v2 recordings (no-op).
 */
export function migrateRecording(raw: unknown): Recording {
  const r = raw as Recording
  if ((r.version ?? 1) >= 2) return r
  const migrated: Recording = { ...r, version: 2 }
  // Promote scalar bpm → tempoMap
  if (r.bpm != null && !migrated.tempoMap) {
    migrated.tempoMap = [{ atMs: 0, bpm: r.bpm }]
  }
  // Promote scalar timeSignature → timeSignatureMap
  if (r.timeSignature != null && !migrated.timeSignatureMap) {
    migrated.timeSignatureMap = [{ atMs: 0, value: r.timeSignature }]
  }
  return migrated
}

// ── Temporal utilities ────────────────────────────────────────────────────────

/**
 * Return the BPM at a given playback position.
 * Handles step changes and linear ramps (rit. / accel.).
 * Falls back to bpm field (v1 compat) or 120 when no tempo info is available.
 */
export function bpmAt(recording: Recording, posMs: number): number {
  const map = recording.tempoMap
  if (!map || map.length === 0) return recording.bpm ?? 120

  let active = map[0]
  for (const ev of map) {
    if (ev.atMs <= posMs) active = ev
    else break
  }

  // Linear ramp (rit. / accel.)
  if (active.toMs != null && active.toBpm != null && posMs < active.toMs && active.toMs > active.atMs) {
    const frac = (posMs - active.atMs) / (active.toMs - active.atMs)
    return active.bpm + frac * (active.toBpm - active.bpm)
  }
  return active.bpm
}

/**
 * Return the time signature string at a given playback position.
 * Falls back to timeSignature field (v1 compat) or "4/4".
 */
export function timeSigAt(recording: Recording, posMs: number): string {
  const map = recording.timeSignatureMap
  if (!map || map.length === 0) return recording.timeSignature ?? '4/4'

  let active = map[0]
  for (const ev of map) {
    if (ev.atMs <= posMs) active = ev
    else break
  }
  return active.value
}

/**
 * Return the measure number at a given playback position.
 * Returns 1 when no measureMap is available.
 */
export function measureAt(recording: Recording, posMs: number): number {
  const map = recording.measureMap
  if (!map || map.length === 0) return 1

  let active = map[0]
  for (const entry of map) {
    if (entry.atMs <= posMs) active = entry
    else break
  }
  return active.measure
}

// ── Dynamic utilities (E2) ────────────────────────────────────────────────────

/** Convert a dynamic marking to an approximate MIDI velocity (E2 reference table). */
export function dynamicToVelocity(d: Dynamic): number {
  const table: Record<Dynamic, number> = { pp: 20, p: 40, mp: 55, mf: 72, f: 90, ff: 110 }
  return table[d]
}

// ── Backward-compat export (deprecated) ──────────────────────────────────────

/**
 * @deprecated Grading tolerances are now configured per-exercise via GradingProfile.
 * This constant is kept for legacy call sites only.
 */
export const GRADE_TOLERANCE_MS = 300
