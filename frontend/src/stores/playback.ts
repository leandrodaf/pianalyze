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
import { initAudio, playNote, stopNote, stopAllNotes, audioStore } from './audio'
import type {
  Recording, RecordedEvent, NoteInterval, Hand, Dynamic, Articulation,
  GradingProfile, DifficultyPreset, TupletInfo,
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
  /** Step mode: playback frozen; student advances note-by-note. */
  stepMode: boolean
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
  stepMode: false,
})

// Pre-processed note intervals (noteOn→noteOff pairs) for practice grading.
export const noteIntervals = writable<NoteInterval[]>([])

// ── Internal ─────────────────────────────────────────────────────────────────

let pending: ReturnType<typeof setTimeout>[] = []
let rafId = 0
let wallStart = 0
let segmentOffset = 0
let liveNotes = new Set<number>()

// Audio sustain pedal state — reset on cancelAll() and seekTo()
let audioPedalHeld = false
const audioPedalSustained = new Set<number>()

// Notes currently sounding in the audio scheduler (all modes) — used to snapshot
// "notes already sounding" when the sostenuto pedal is pressed.
const audioActiveNotes = new Set<number>()

// Audio sostenuto pedal state (CC 66): only notes sounding at press time are
// sustained through a key release — new notes struck afterward behave normally.
let audioSostenutoHeld = false
let audioSostenutoFrozen = new Set<number>()
const audioSostenutoSustained = new Set<number>()

// Audio una corda pedal state (CC 67): volume reduction while held.
let audioUnaCordaHeld = false
const UNA_CORDA_FACTOR = 0.75

function cancelAll() {
  for (const t of pending) clearTimeout(t)
  pending = []
  cancelAnimationFrame(rafId)
  rafId = 0
  audioPedalHeld = false
  audioPedalSustained.clear()
  audioActiveNotes.clear()
  audioSostenutoHeld = false
  audioSostenutoFrozen = new Set()
  audioSostenutoSustained.clear()
  audioUnaCordaHeld = false
  stopAllNotes()
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
  const CMD_NOTE_ON = 0x90
  const CMD_NOTE_OFF = 0x80
  const CMD_CC = 0xB0
  const CC_SUSTAIN = 64
  const CC_SOSTENUTO = 66

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
    tuplet?: TupletInfo
  }

  function pushInterval(note: number, entry: Active, endMs: number) {
    out.push({
      note,
      startMs: entry.startMs,
      endMs,
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
      tuplet: entry.tuplet,
    })
  }

  const active = new Map<number, Active>()
  const out: NoteInterval[] = []

  // Sustain pedal state (CC 64)
  let sustainHeld = false
  // Notes with key released while pedal held — note → key-release time
  const pedalSustained = new Map<number, number>()

  // Sostenuto pedal state (CC 66) — only notes already sounding at press time
  // are sustained through a key release; notes struck afterward release normally.
  let sostenutoHeld = false
  let sostenutoFrozen = new Set<number>()
  const sostenutoSustained = new Map<number, number>()

  for (const ev of events) {
    if (ev.cmd === CMD_CC) {
      if (ev.note === CC_SUSTAIN) {
        if (ev.vel >= 64) {
          sustainHeld = true
        } else {
          // Pedal release — end all pedal-sustained notes at the pedal release time
          sustainHeld = false
          for (const [note] of pedalSustained) {
            const entry = active.get(note)
            if (entry) { pushInterval(note, entry, ev.t); active.delete(note) }
          }
          pedalSustained.clear()
        }
      } else if (ev.note === CC_SOSTENUTO) {
        if (ev.vel >= 64) {
          sostenutoHeld = true
          sostenutoFrozen = new Set(active.keys())
        } else {
          sostenutoHeld = false
          for (const [note] of sostenutoSustained) {
            const entry = active.get(note)
            if (entry) { pushInterval(note, entry, ev.t); active.delete(note) }
          }
          sostenutoSustained.clear()
          sostenutoFrozen = new Set()
        }
      }
      continue
    }

    // 0x90 vel>0 = NoteOn;  0x90 vel=0 or 0x80 any vel = NoteOff
    const isNoteOn = ev.cmd === CMD_NOTE_ON && ev.vel > 0
    const isNoteOff = ev.cmd === CMD_NOTE_OFF || (ev.cmd === CMD_NOTE_ON && ev.vel === 0)

    if (isNoteOn) {
      // Re-striking a note that is already active (trill, or pedal-held re-press)
      if (active.has(ev.note)) {
        const prev = active.get(ev.note)!
        pushInterval(ev.note, prev, pedalSustained.get(ev.note) ?? sostenutoSustained.get(ev.note) ?? ev.t)
        pedalSustained.delete(ev.note)
        sostenutoSustained.delete(ev.note)
        active.delete(ev.note)
      }
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
        tuplet: ev.tuplet,
      })
    } else if (isNoteOff) {
      const entry = active.get(ev.note)
      if (entry !== undefined) {
        if (sustainHeld) {
          // Defer release — sustain pedal extends the note
          pedalSustained.set(ev.note, ev.t)
        } else if (sostenutoHeld && sostenutoFrozen.has(ev.note)) {
          // Defer release — sostenuto only extends notes already sounding at press time
          sostenutoSustained.set(ev.note, ev.t)
        } else {
          pushInterval(ev.note, entry, ev.t)
          active.delete(ev.note)
        }
      }
    }
  }

  // Close any notes still active at end of recording
  for (const [note, entry] of active) {
    const endMs = pedalSustained.has(note)
      ? pedalSustained.get(note)! + 500
      : sostenutoSustained.has(note)
        ? sostenutoSustained.get(note)! + 500
        : entry.startMs + 500
    pushInterval(note, entry, endMs)
  }
  return out
}

function scheduleFrom(events: RecordedEvent[], fromMs: number) {
  wallStart = performance.now()
  segmentOffset = fromMs

  const initialState = get(playbackStore)
  const durationMs = initialState.durationMs
  const speed = initialState.speedMultiplier
  // The waterfall always shows bars with a lead-time preview (notes scroll from the
  // right edge to the golden line). Audio and visual injection must fire exactly when
  // the bar hits the golden line, which is always DEFAULT_LEAD_TIME_SEC after the bar
  // appears on screen — regardless of review vs practice mode.
  const leadOffset = DEFAULT_LEAD_TIME_SEC * 1000

  for (const ev of events) {
    const delay = ev.t - fromMs + leadOffset
    if (delay < 0) continue

    const tid = setTimeout(() => {
      // Pedal CCs: tracked for audio; never injected into visual store.
      if (ev.cmd === 0xB0) {
        if (ev.note === 64) {
          // Sustain
          if (ev.vel >= 64) {
            audioPedalHeld = true
          } else {
            audioPedalHeld = false
            for (const note of audioPedalSustained) stopNote(note)
            audioPedalSustained.clear()
          }
        } else if (ev.note === 66) {
          // Sostenuto — only notes already sounding at press time are sustained.
          if (ev.vel >= 64) {
            audioSostenutoHeld = true
            audioSostenutoFrozen = new Set(audioActiveNotes)
          } else {
            audioSostenutoHeld = false
            for (const note of audioSostenutoSustained) stopNote(note)
            audioSostenutoSustained.clear()
            audioSostenutoFrozen = new Set()
          }
        } else if (ev.note === 67) {
          // Una corda — volume/timbre reduction while held.
          audioUnaCordaHeld = ev.vel >= 64
        }
        return
      }

      // 0x90 vel>0 = NoteOn; 0x90 vel=0 or 0x80 any vel = NoteOff
      const on = ev.cmd === 0x90 && ev.vel > 0
      const isPractice = get(playbackStore).practice

      // Audio: plays in both review and practice modes.
      if (on) {
        // Scale velocity by per-hand volume (read at fire-time so slider changes apply immediately)
        // and by una corda when held.
        const hand = ev.hand ?? (ev.note >= 60 ? 'right' : 'left')
        const hvol = get(audioStore).handVolumes[hand]
        const unaCordaScale = audioUnaCordaHeld ? UNA_CORDA_FACTOR : 1
        if (hvol > 0) playNote(ev.note, Math.round(ev.vel * hvol / 100 * unaCordaScale))
        audioActiveNotes.add(ev.note)
        audioPedalSustained.delete(ev.note)     // re-strike clears pending release
        audioSostenutoSustained.delete(ev.note)
      } else {
        audioActiveNotes.delete(ev.note)
        if (audioPedalHeld) {
          audioPedalSustained.add(ev.note)      // defer release until sustain pedal lifts
        } else if (audioSostenutoHeld && audioSostenutoFrozen.has(ev.note)) {
          audioSostenutoSustained.add(ev.note)  // defer release until sostenuto lifts
        } else {
          stopNote(ev.note)
        }
      }

      // Visual MIDI injection: review mode only.
      if (!isPractice) {
        if (on) liveNotes.add(ev.note)
        else    liveNotes.delete(ev.note)

        midiStore.update(s => ({
          ...s,
          pressedNotes: Array.from(liveNotes),
          velocity: on ? ev.vel : 0,
        }))
      }
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

    // cancelAll() sets rafId = 0. If a subscriber called cancelAll() (e.g. the step-mode
    // gate called pause()) during the update above, we must NOT register a new RAF —
    // doing so would create a dangling loop that keeps advancing positionMs while paused,
    // causing wrong pause positions and incorrect "miss" grades.
    if (rafId === 0) return

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

export async function play(): Promise<void> {
  const state = get(playbackStore)
  if (!state.recording || state.status === 'playing') return

  // Must be called from a user gesture — initializes Web Audio on first play.
  await initAudio()

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

export function setStepMode(on: boolean): void {
  playbackStore.update(s => ({ ...s, stepMode: on }))
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
