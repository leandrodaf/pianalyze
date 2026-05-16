/**
 * Playback engine + practice mode for .pia recordings.
 *
 * REVIEW mode  — injects recording events into midiStore so the waterfall
 *                replays exactly what was recorded.
 * PRACTICE mode — does NOT inject events; the waterfall renders recording
 *                 notes independently. The student's MIDI keyboard is used
 *                 and graded against the recording.
 */

import { writable, get } from 'svelte/store'
import { midiStore } from './midi'
import type {
  Recording, RecordedEvent, NoteInterval, Hand, Dynamic, Articulation,
  GradingProfile, DifficultyPreset,
} from '../lib/recording-types'
import { migrateRecording, dynamicToVelocity, DIFFICULTY_PRESETS } from '../lib/recording-types'
import { DEFAULT_LEAD_TIME_SEC } from '../lib/waterfall-canvas'

export type GradeResult = 'perfect' | 'good' | 'ok' | 'miss' | 'wrong'

export interface PlaybackState {
  status: 'idle' | 'playing' | 'paused'
  positionMs: number
  durationMs: number
  recording: Recording | null
  practice: boolean
  speedMultiplier: number
  loopEnabled: boolean
  loopStart: number | null
  loopEnd: number | null
  /** Active difficulty preset, or null when speed was set manually. */
  difficultyPreset: DifficultyPreset | null
  /**
   * Grading profile override applied by a difficulty preset.
   * Supersedes the exercise's own gradingProfile when non-null.
   */
  gradingProfileOverride: GradingProfile | null
}

export const playbackStore = writable<PlaybackState>({
  status: 'idle',
  positionMs: 0,
  durationMs: 0,
  recording: null,
  practice: false,
  speedMultiplier: 1,
  loopEnabled: false,
  loopStart: null,
  loopEnd: null,
  difficultyPreset: null,
  gradingProfileOverride: null,
})

// Pre-processed note intervals (noteOn→noteOff pairs) for practice grading.
export const noteIntervals = writable<NoteInterval[]>([])

// ── Internal ─────────────────────────────────────────────────────────────────

let pending: ReturnType<typeof setTimeout>[] = []
let rafId = 0
let wallStart = 0
let segmentOffset = 0
let liveNotes = new Set<number>()

function cancelAll() {
  for (const t of pending) clearTimeout(t)
  pending = []
  cancelAnimationFrame(rafId)
  rafId = 0
}

function releaseAll() {
  liveNotes.clear()
  midiStore.update(s => ({ ...s, pressedNotes: [] }))
}

function clampPosition(ms: number, durationMs: number): number {
  return Math.max(0, Math.min(ms, durationMs))
}

function currentPositionMs(): number {
  const state = get(playbackStore)
  if (state.status !== 'playing') return state.positionMs
  const elapsed = performance.now() - wallStart
  return clampPosition(segmentOffset + elapsed * state.speedMultiplier, state.durationMs)
}

function restartPlaybackAt(ms: number): void {
  const state = get(playbackStore)
  if (!state.recording) return
  const target = clampPosition(ms, state.durationMs)
  cancelAll(); releaseAll()
  playbackStore.update(s => ({ ...s, status: 'playing', positionMs: target }))
  scheduleFrom(state.recording.events, target)
}

/** Convert a flat event list into note-on/off pairs, preserving all pedagogical fields. */
function buildIntervals(events: RecordedEvent[]): NoteInterval[] {
  const CMD_NOTE_ON  = 0x90
  const CMD_NOTE_OFF = 0x80

  type Active = {
    startMs: number
    finger?: NoteInterval['finger']
    hand?: Hand
    dynamic?: Dynamic
    articulation?: Articulation
    grace?: boolean
    voice?: NoteInterval['voice']
    tip?: string
    handPosition?: string
    fermata?: boolean
    slur?: NoteInterval['slur']
  }

  const active = new Map<number, Active>()
  const out: NoteInterval[] = []

  for (const ev of events) {
    // Skip CC events (pedals) — they don't contribute to note intervals
    if (ev.cmd === 0xB0) continue

    const isNoteOn = (ev.cmd === CMD_NOTE_ON || ev.cmd === CMD_NOTE_OFF) && ev.vel > 0
    const isNoteOff = ev.vel === 0 || ev.cmd === CMD_NOTE_OFF

    if (isNoteOn) {
      active.set(ev.note, {
        startMs: ev.t,
        finger: ev.finger,
        hand: ev.hand,
        dynamic: ev.dynamic,
        articulation: ev.articulation,
        grace: ev.grace,
        voice: ev.voice,
        tip: ev.tip,
        handPosition: ev.handPosition,
        fermata: ev.fermata,
        slur: ev.slur,
      })
    } else if (isNoteOff) {
      const entry = active.get(ev.note)
      if (entry !== undefined) {
        out.push({
          note: ev.note,
          startMs: entry.startMs,
          endMs: ev.t,
          finger: entry.finger,
          hand: entry.hand,
          dynamic: entry.dynamic,
          articulation: entry.articulation,
          grace: entry.grace,
          voice: entry.voice,
          tip: entry.tip,
          handPosition: entry.handPosition,
          fermata: entry.fermata,
          slur: entry.slur,
        })
        active.delete(ev.note)
      }
    }
  }

  // Close any notes still held at end of recording
  for (const [note, entry] of active) {
    out.push({
      note,
      startMs: entry.startMs,
      endMs: entry.startMs + 500,
      finger: entry.finger,
      hand: entry.hand,
      dynamic: entry.dynamic,
      articulation: entry.articulation,
      grace: entry.grace,
      voice: entry.voice,
      tip: entry.tip,
      handPosition: entry.handPosition,
      fermata: entry.fermata,
      slur: entry.slur,
    })
  }
  return out
}

function scheduleFrom(events: RecordedEvent[], fromMs: number) {
  wallStart = performance.now()
  segmentOffset = fromMs

  const initialState = get(playbackStore)
  const durationMs = initialState.durationMs
  const speed = initialState.speedMultiplier
  // In review mode the waterfall renders bars with LEAD_MS preview, so MIDI events
  // must be delayed by the same amount so the keyboard fires exactly when the bar
  // reaches the golden line.
  const reviewOffset = initialState.practice ? 0 : DEFAULT_LEAD_TIME_SEC * 1000

  for (const ev of events) {
    const delay = ev.t - fromMs + reviewOffset
    if (delay < 0) continue

    const tid = setTimeout(() => {
      // In practice mode we do NOT feed recording notes into the MIDI store —
      // the student's keyboard is the only input there.
      if (get(playbackStore).practice) return

      // CC events (pedals) are not injected into midiStore for visual display.
      if (ev.cmd === 0xB0) return

      const on = ev.vel > 0
      if (on) liveNotes.add(ev.note)
      else    liveNotes.delete(ev.note)

      midiStore.update(s => ({
        ...s,
        pressedNotes: Array.from(liveNotes),
        velocity: on ? ev.vel : 0,
      }))
    }, delay / speed)
    pending.push(tid)
  }

  function tick() {
    const elapsed = performance.now() - wallStart
    const state = get(playbackStore)
    const pos = clampPosition(segmentOffset + elapsed * state.speedMultiplier, state.durationMs)

    if (state.loopEnabled && state.loopEnd != null && pos >= state.loopEnd && state.recording) {
      const loopTarget = clampPosition(state.loopStart ?? 0, state.durationMs)
      cancelAll(); releaseAll()
      playbackStore.update(s => ({ ...s, status: 'playing', positionMs: loopTarget }))
      scheduleFrom(state.recording.events, loopTarget)
      return
    }

    playbackStore.update(s => ({ ...s, positionMs: pos }))

    if (pos < durationMs) {
      rafId = requestAnimationFrame(tick)
    } else {
      releaseAll()
      playbackStore.update(s => ({ ...s, status: 'idle', positionMs: durationMs }))
    }
  }
  rafId = requestAnimationFrame(tick)
}

// ── Public API ────────────────────────────────────────────────────────────────

export function loadRecording(raw: unknown): void {
  // Migrate v1 → v2 transparently (V1)
  const recording = migrateRecording(raw)
  cancelAll(); releaseAll()

  // Only note events contribute to duration; CC/pedal events are ignored.
  const noteEvents = recording.events.filter(e => e.cmd !== 0xB0)
  const last = noteEvents[noteEvents.length - 1]
  const intervals = buildIntervals(recording.events)
  noteIntervals.set(intervals)

  // Extend duration so the last notes have time to travel from the right edge to the golden line
  const durationMs = last ? last.t + DEFAULT_LEAD_TIME_SEC * 1000 + 500 : 0
  playbackStore.update(s => ({
    ...s,
    status: 'idle',
    positionMs: 0,
    durationMs,
    recording,
    loopEnabled: false,
    loopStart: null,
    loopEnd: null,
  }))
}

export function setPractice(on: boolean): void {
  cancelAll(); releaseAll()
  playbackStore.update(s => ({ ...s, practice: on, status: 'idle', positionMs: 0 }))
}

export function play(): void {
  const state = get(playbackStore)
  if (!state.recording || state.status === 'playing') return

  let fromMs = state.positionMs
  if (state.status === 'idle' && fromMs >= state.durationMs) {
    fromMs = state.loopEnabled && state.loopStart != null ? state.loopStart : 0
  }

  playbackStore.update(s => ({ ...s, status: 'playing', positionMs: fromMs }))
  scheduleFrom(state.recording.events, fromMs)
}

export function pause(): void {
  if (get(playbackStore).status !== 'playing') return
  const elapsed = performance.now() - wallStart
  const speed = get(playbackStore).speedMultiplier
  const posMs = Math.min(segmentOffset + elapsed * speed, get(playbackStore).durationMs)
  cancelAll(); releaseAll()
  playbackStore.update(s => ({ ...s, status: 'paused', positionMs: posMs }))
}

export function stop(): void {
  cancelAll(); releaseAll()
  playbackStore.update(s => ({ ...s, status: 'idle', positionMs: 0 }))
}

export function setSpeed(x: number): void {
  const nextSpeed = Number.isFinite(x) && x > 0 ? x : 1
  const state = get(playbackStore)

  if (state.status === 'playing' && state.recording) {
    const pos = currentPositionMs()
    cancelAll(); releaseAll()
    playbackStore.update(s => ({ ...s, speedMultiplier: nextSpeed, positionMs: pos, difficultyPreset: null }))
    scheduleFrom(state.recording.events, pos)
    return
  }

  playbackStore.update(s => ({ ...s, speedMultiplier: nextSpeed, difficultyPreset: null }))
}

/**
 * Apply a named difficulty preset: sets speedMultiplier + gradingProfileOverride
 * atomically. Also re-loads the grading profile on the Go side when in practice mode.
 */
export function setDifficultyPreset(preset: DifficultyPreset): void {
  const cfg = DIFFICULTY_PRESETS[preset]
  const nextSpeed = cfg.speed
  const state = get(playbackStore)

  const storeUpdate = (s: PlaybackState): PlaybackState => ({
    ...s,
    speedMultiplier: nextSpeed,
    difficultyPreset: preset,
    gradingProfileOverride: cfg.profile,
  })

  if (state.status === 'playing' && state.recording) {
    const pos = currentPositionMs()
    cancelAll(); releaseAll()
    playbackStore.update(s => ({ ...storeUpdate(s), positionMs: pos }))
    scheduleFrom(state.recording.events, pos)
  } else {
    playbackStore.update(storeUpdate)
  }

  // Live-update grading profile when in practice mode (can't import Wails here,
  // so NoteWaterfall watches gradingProfileOverride and calls LoadGradingProfile)
}

export function seekTo(ms: number): void {
  const state = get(playbackStore)
  const target = clampPosition(ms, state.durationMs)

  if (state.status === 'playing' && state.recording) {
    restartPlaybackAt(target)
    return
  }

  playbackStore.update(s => ({ ...s, positionMs: target }))
}

export function rewind(): void {
  const state = get(playbackStore)
  const target = clampPosition(
    state.loopEnabled && state.loopStart != null ? state.loopStart : 0,
    state.durationMs,
  )

  if (state.status === 'playing' && state.recording) {
    restartPlaybackAt(target)
    return
  }

  playbackStore.update(s => ({ ...s, positionMs: target }))
}

export function setLoop(start: number, end: number): void {
  const durationMs = get(playbackStore).durationMs
  const loopStart = clampPosition(Math.min(start, end), durationMs)
  const loopEnd = clampPosition(Math.max(start, end), durationMs)
  playbackStore.update(s => ({
    ...s,
    loopStart,
    loopEnd,
    loopEnabled: loopEnd > loopStart,
  }))
}

export function clearLoop(): void {
  playbackStore.update(s => ({
    ...s,
    loopStart: null,
    loopEnd: null,
    loopEnabled: false,
  }))
}

export function toggleLoop(): void {
  const state = get(playbackStore)
  if (state.loopStart == null || state.loopEnd == null || state.loopEnd <= state.loopStart) return
  playbackStore.update(s => ({ ...s, loopEnabled: !s.loopEnabled }))
}

export function formatMs(ms: number): string {
  const s = Math.floor(ms / 1000)
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

/**
 * Build the grading interval payload for the Go grading engine.
 * Includes dynamic → expectedVel conversion (E2) and all pedagogical fields.
 */
export function buildGradingIntervals(intervals: NoteInterval[]): Array<{
  note: number
  startMs: number
  endMs: number
  dynamic?: string
  hand?: string
  articulation?: string
  expectedVel?: number
}> {
  return intervals.map(iv => ({
    note: iv.note,
    startMs: iv.startMs,
    endMs: iv.endMs,
    dynamic: iv.dynamic,
    hand: iv.hand,
    articulation: iv.articulation,
    // Convert dynamic marking to expected velocity for the Go grader (E2)
    expectedVel: iv.dynamic ? dynamicToVelocity(iv.dynamic) : undefined,
  }))
}
