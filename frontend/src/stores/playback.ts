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
import type { Recording, RecordedEvent, NoteInterval, Hand, Dynamic, Articulation } from '../lib/recording-types'
import { GRADE_TOLERANCE_MS } from '../lib/recording-types'
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

/** Convert a flat event list into note-on/off pairs. */
function buildIntervals(events: RecordedEvent[]): NoteInterval[] {
  const active = new Map<number, { startMs: number; finger?: NoteInterval['finger']; hand?: Hand; dynamic?: Dynamic; articulation?: Articulation }>()
  const out: NoteInterval[] = []
  for (const ev of events) {
    if (ev.vel > 0) {
      active.set(ev.note, { startMs: ev.t, finger: ev.finger, hand: ev.hand, dynamic: ev.dynamic, articulation: ev.articulation })
    } else {
      const entry = active.get(ev.note)
      if (entry !== undefined) {
        out.push({ note: ev.note, startMs: entry.startMs, endMs: ev.t, finger: entry.finger, hand: entry.hand, dynamic: entry.dynamic, articulation: entry.articulation })
        active.delete(ev.note)
      }
    }
  }
  // Close any notes still held at end of recording
  for (const [note, entry] of active) {
    out.push({ note, startMs: entry.startMs, endMs: entry.startMs + 500, finger: entry.finger, hand: entry.hand, dynamic: entry.dynamic, articulation: entry.articulation })
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

export function loadRecording(recording: Recording): void {
  cancelAll(); releaseAll()
  const intervals = buildIntervals(recording.events)
  noteIntervals.set(intervals)
  const last = recording.events[recording.events.length - 1]
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
    playbackStore.update(s => ({ ...s, speedMultiplier: nextSpeed, positionMs: pos }))
    scheduleFrom(state.recording.events, pos)
    return
  }

  playbackStore.update(s => ({ ...s, speedMultiplier: nextSpeed }))
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

/**
 * Grade a note pressed by the student during practice.
 * Returns the grade (and the matched interval's Y-anchor in ms for badge placement),
 * or null if there was no expected note nearby.
 */
export function gradeInput(note: number, currentMs: number): GradeResult {
  const intervals = get(noteIntervals)
  let best: { delta: number; interval: NoteInterval } | null = null

  for (const iv of intervals) {
    if (iv.note !== note) continue
    const delta = Math.abs(iv.startMs - currentMs)
    if (delta <= GRADE_TOLERANCE_MS) {
      if (!best || delta < best.delta) best = { delta, interval: iv }
    }
  }

  if (!best) return 'wrong'
  const d = best.delta
  if (d < 70)  return 'perfect'
  if (d < 150) return 'good'
  return 'ok'
}

export function formatMs(ms: number): string {
  const s = Math.floor(ms / 1000)
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}
