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
import type { Recording, RecordedEvent, NoteInterval } from '../lib/recording-types'
import { GRADE_TOLERANCE_MS } from '../lib/recording-types'
import { DEFAULT_LEAD_TIME_SEC } from '../lib/waterfall-canvas'

export type GradeResult = 'perfect' | 'good' | 'ok' | 'miss' | 'wrong'

export interface PlaybackState {
  status: 'idle' | 'playing' | 'paused'
  positionMs: number
  durationMs: number
  recording: Recording | null
  practice: boolean
}

export const playbackStore = writable<PlaybackState>({
  status: 'idle',
  positionMs: 0,
  durationMs: 0,
  recording: null,
  practice: false,
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
}

function releaseAll() {
  liveNotes.clear()
  midiStore.update(s => ({ ...s, pressedNotes: [] }))
}

/** Convert a flat event list into note-on/off pairs. */
function buildIntervals(events: RecordedEvent[]): NoteInterval[] {
  const active = new Map<number, number>()  // note → startMs
  const out: NoteInterval[] = []
  for (const ev of events) {
    if (ev.vel > 0) {
      active.set(ev.note, ev.t)
    } else {
      const startMs = active.get(ev.note)
      if (startMs !== undefined) {
        out.push({ note: ev.note, startMs, endMs: ev.t })
        active.delete(ev.note)
      }
    }
  }
  // Close any notes still held at end of recording
  for (const [note, startMs] of active) {
    out.push({ note, startMs, endMs: startMs + 500 })
  }
  return out
}

function scheduleFrom(events: RecordedEvent[], fromMs: number) {
  wallStart = performance.now()
  segmentOffset = fromMs

  const durationMs = get(playbackStore).durationMs

  for (const ev of events) {
    const delay = ev.t - fromMs
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
    }, delay)
    pending.push(tid)
  }

  function tick() {
    const elapsed = performance.now() - wallStart
    const pos = Math.min(segmentOffset + elapsed, durationMs)
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
  playbackStore.update(s => ({ ...s, status: 'idle', positionMs: 0, durationMs, recording }))
}

export function setPractice(on: boolean): void {
  cancelAll(); releaseAll()
  playbackStore.update(s => ({ ...s, practice: on, status: 'idle', positionMs: 0 }))
}

export function play(): void {
  const state = get(playbackStore)
  if (!state.recording || state.status === 'playing') return
  const fromMs = state.status === 'paused' ? state.positionMs : 0
  playbackStore.update(s => ({ ...s, status: 'playing', positionMs: fromMs }))
  scheduleFrom(state.recording.events, fromMs)
}

export function pause(): void {
  if (get(playbackStore).status !== 'playing') return
  const elapsed = performance.now() - wallStart
  const posMs = Math.min(segmentOffset + elapsed, get(playbackStore).durationMs)
  cancelAll(); releaseAll()
  playbackStore.update(s => ({ ...s, status: 'paused', positionMs: posMs }))
}

export function stop(): void {
  cancelAll(); releaseAll()
  playbackStore.update(s => ({ ...s, status: 'idle', positionMs: 0 }))
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
