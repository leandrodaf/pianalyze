import { describe, it, expect, beforeEach } from 'vitest'
import type { NoteInterval } from '../lib/recording-types'
import {
  STEP_CHORD_WINDOW_MS,
  STEP_GATE_MS,
  buildStepGroups,
  initStepState,
  shouldGatePause,
  registerNoteOn,
  type StepState,
} from '../lib/step-mode'

// Convenience builder — only startMs and note are needed for step logic
function iv(note: number, startMs: number): NoteInterval {
  return { note, startMs, endMs: startMs + 500 }
}

const LEAD_MS = 4000 // same as DEFAULT_LEAD_TIME_SEC * 1000

// ── buildStepGroups ───────────────────────────────────────────────────────────

describe('buildStepGroups', () => {
  it('returns empty array for empty input', () => {
    expect(buildStepGroups([])).toEqual([])
  })

  it('wraps a single note in a single group', () => {
    const groups = buildStepGroups([iv(60, 0)])
    expect(groups).toHaveLength(1)
    expect(groups[0]).toHaveLength(1)
    expect(groups[0][0].note).toBe(60)
  })

  it('puts two notes far apart into separate groups', () => {
    const groups = buildStepGroups([iv(60, 0), iv(64, 1000)])
    expect(groups).toHaveLength(2)
  })

  it('merges notes within STEP_CHORD_WINDOW_MS into one group', () => {
    // 20 ms apart — well within the 50 ms window
    const groups = buildStepGroups([iv(60, 0), iv(64, 20), iv(67, 35)])
    expect(groups).toHaveLength(1)
    expect(groups[0]).toHaveLength(3)
  })

  it('splits notes exactly at the chord window boundary', () => {
    // STEP_CHORD_WINDOW_MS = 50; a gap of exactly 51 ms creates a new group
    const groups = buildStepGroups([iv(60, 0), iv(64, STEP_CHORD_WINDOW_MS + 1)])
    expect(groups).toHaveLength(2)
  })

  it('does NOT split notes at a gap equal to the chord window', () => {
    // gap === STEP_CHORD_WINDOW_MS means NOT strictly greater → same group
    const groups = buildStepGroups([iv(60, 0), iv(64, STEP_CHORD_WINDOW_MS)])
    expect(groups).toHaveLength(1)
  })

  it('sorts unsorted input before grouping', () => {
    const groups = buildStepGroups([iv(64, 1000), iv(60, 0), iv(67, 1020)])
    // note 60 at t=0 is its own group; notes 64+67 at t=1000/1020 are one group
    expect(groups).toHaveLength(2)
    expect(groups[0][0].note).toBe(60)
    expect(groups[1].map(n => n.note).sort()).toEqual([64, 67])
  })

  it('handles a long melody correctly', () => {
    const notes = Array.from({ length: 8 }, (_, i) => iv(60 + i, i * 500))
    const groups = buildStepGroups(notes)
    expect(groups).toHaveLength(8)
  })
})

// ── initStepState ─────────────────────────────────────────────────────────────

describe('initStepState', () => {
  const ivs = [iv(60, 0), iv(64, 1000), iv(67, 2000)]

  it('sets waitIdx to 0 when positionMs is 0 (before playback)', () => {
    const state = initStepState(ivs, 0, LEAD_MS)
    expect(state.waitIdx).toBe(0)
  })

  it('sets waitIdx past notes already at or before the golden line', () => {
    // positionMs = 1000 + LEAD_MS means musical time is 1000.
    // Groups at t=0 (past) and t=1000 (exactly now).
    // findIndex(g => g[0].startMs >= musicalNow=1000) → index 1 (t=1000)
    const state = initStepState(ivs, 1000 + LEAD_MS, LEAD_MS)
    expect(state.waitIdx).toBe(1)
  })

  it('sets waitIdx to groups.length when past all notes', () => {
    const state = initStepState(ivs, 99999, LEAD_MS)
    expect(state.waitIdx).toBe(3)
  })

  it('initialises hit as an empty set', () => {
    const state = initStepState(ivs, 0, LEAD_MS)
    expect(state.hit.size).toBe(0)
  })

  it('returns correct number of groups', () => {
    const state = initStepState(ivs, 0, LEAD_MS)
    expect(state.groups).toHaveLength(3)
  })
})

// ── shouldGatePause ───────────────────────────────────────────────────────────

describe('shouldGatePause', () => {
  let state: StepState

  beforeEach(() => {
    // First group: C4 (60) at t=0
    state = initStepState([iv(60, 0), iv(64, 1000)], 0, LEAD_MS)
  })

  it('returns false before the deadline', () => {
    // Deadline = 0 + LEAD_MS + STEP_GATE_MS = 4100
    expect(shouldGatePause(state, LEAD_MS - 1, LEAD_MS)).toBe(false)
  })

  it('returns false at exactly the golden-line crossing (before grace window)', () => {
    // positionMs = 0 + LEAD_MS = 4000 — note just hit the golden line
    expect(shouldGatePause(state, LEAD_MS, LEAD_MS)).toBe(false)
  })

  it('returns false one ms before the deadline', () => {
    expect(shouldGatePause(state, LEAD_MS + STEP_GATE_MS - 1, LEAD_MS)).toBe(false)
  })

  it('returns true at exactly the deadline', () => {
    // positionMs = 0 + LEAD_MS + STEP_GATE_MS = 4100
    expect(shouldGatePause(state, LEAD_MS + STEP_GATE_MS, LEAD_MS)).toBe(true)
  })

  it('returns true well past the deadline', () => {
    expect(shouldGatePause(state, LEAD_MS + 5000, LEAD_MS)).toBe(true)
  })

  it('returns false when there are no more groups (all played)', () => {
    state.waitIdx = state.groups.length
    expect(shouldGatePause(state, 999999, LEAD_MS)).toBe(false)
  })

  it('returns false when the current group is already fully hit', () => {
    // Mark note 60 as hit
    state.hit.add(60)
    expect(shouldGatePause(state, LEAD_MS + STEP_GATE_MS, LEAD_MS)).toBe(false)
  })

  it('advances correctly to second group after first is completed', () => {
    // Advance past first group manually
    state.waitIdx = 1
    // Second group at t=1000; deadline = 1000 + 4000 + 100 = 5100
    expect(shouldGatePause(state, 5099, LEAD_MS)).toBe(false)
    expect(shouldGatePause(state, 5100, LEAD_MS)).toBe(true)
  })

  it('does not gate at t=0 position (very start of piece)', () => {
    expect(shouldGatePause(state, 0, LEAD_MS)).toBe(false)
  })
})

// ── registerNoteOn ────────────────────────────────────────────────────────────

describe('registerNoteOn', () => {
  let state: StepState

  beforeEach(() => {
    state = initStepState([iv(60, 0), iv(64, 1000), iv(67, 2000)], 0, LEAD_MS)
  })

  it('ignores a note not in the current group', () => {
    expect(registerNoteOn(state, 99)).toBe('ignored')
    expect(state.hit.size).toBe(0)
    expect(state.waitIdx).toBe(0)
  })

  it('accepts the correct note for a single-note group', () => {
    expect(registerNoteOn(state, 60)).toBe('group_complete')
  })

  it('advances waitIdx when a single-note group is completed', () => {
    registerNoteOn(state, 60)
    expect(state.waitIdx).toBe(1)
  })

  it('clears hit set after group completes', () => {
    registerNoteOn(state, 60)
    expect(state.hit.size).toBe(0)
  })

  it('ignores duplicate note in same group', () => {
    registerNoteOn(state, 60) // completes group, advances waitIdx to 1
    // Now waitIdx=1, group is iv(64,1000). Playing 60 again → ignored
    expect(registerNoteOn(state, 60)).toBe('ignored')
  })

  it('handles multi-note chord: partial then complete', () => {
    // Build state with a chord group: notes 60+64 at same time
    const chord = [iv(60, 0), iv(64, 10)] // within STEP_CHORD_WINDOW_MS
    state = initStepState(chord, 0, LEAD_MS)
    expect(state.groups).toHaveLength(1)

    expect(registerNoteOn(state, 60)).toBe('hit_partial')
    expect(state.hit.size).toBe(1)
    expect(state.waitIdx).toBe(0)

    expect(registerNoteOn(state, 64)).toBe('group_complete')
    expect(state.waitIdx).toBe(1)
    expect(state.hit.size).toBe(0)
  })

  it('allows playing chord notes in any order', () => {
    const chord = [iv(60, 0), iv(64, 0), iv(67, 0)]
    state = initStepState(chord, 0, LEAD_MS)

    registerNoteOn(state, 67) // top note first
    registerNoteOn(state, 60) // bottom note second
    expect(state.hit.size).toBe(2)
    expect(registerNoteOn(state, 64)).toBe('group_complete')
  })

  it('returns ignored after all groups are done', () => {
    registerNoteOn(state, 60)  // group 0 done
    registerNoteOn(state, 64)  // group 1 done
    registerNoteOn(state, 67)  // group 2 done
    expect(state.waitIdx).toBe(3)
    expect(registerNoteOn(state, 60)).toBe('ignored')
  })
})

// ── Full gate scenario (integration of the three functions) ───────────────────

describe('step mode gate scenario', () => {
  it('music-plays-then-pause-on-miss workflow', () => {
    // Piece: single note C4 at t=500ms
    const state = initStepState([iv(60, 500)], 0, LEAD_MS)

    // Before deadline: gate should not fire
    // Deadline = 500 + 4000 + 100 = 4600
    for (const pos of [0, 1000, 4000, 4599]) {
      expect(shouldGatePause(state, pos, LEAD_MS)).toBe(false)
    }

    // At deadline: gate fires → caller should pause()
    expect(shouldGatePause(state, 4600, LEAD_MS)).toBe(true)

    // Student plays the note while paused → group_complete → caller should play()
    expect(registerNoteOn(state, 60)).toBe('group_complete')

    // After advancing, no more groups → gate never fires again
    expect(shouldGatePause(state, 99999, LEAD_MS)).toBe(false)
  })

  it('note played before deadline — gate never fires', () => {
    const state = initStepState([iv(60, 500)], 0, LEAD_MS)

    // Student plays at positionMs=4000 (right at the golden line, 100ms before gate)
    expect(registerNoteOn(state, 60)).toBe('group_complete')

    // Gate should never fire now (waitIdx has advanced past all groups)
    expect(shouldGatePause(state, 99999, LEAD_MS)).toBe(false)
  })

  it('chord: gate waits until ALL notes are played', () => {
    // C major chord at t=0: notes 60, 64, 67
    const state = initStepState([iv(60, 0), iv(64, 10), iv(67, 20)], 0, LEAD_MS)
    expect(state.groups).toHaveLength(1)

    // Student plays two of three notes
    registerNoteOn(state, 60)
    registerNoteOn(state, 64)

    // Gate fires because 67 is still missing
    expect(shouldGatePause(state, LEAD_MS + STEP_GATE_MS, LEAD_MS)).toBe(true)

    // Student plays the missing note
    expect(registerNoteOn(state, 67)).toBe('group_complete')

    // Gate no longer fires
    expect(shouldGatePause(state, 99999, LEAD_MS)).toBe(false)
  })

  it('wrong note is ignored; gate still fires if deadline passes', () => {
    const state = initStepState([iv(60, 0)], 0, LEAD_MS)

    // Student plays a wrong note
    expect(registerNoteOn(state, 99)).toBe('ignored')

    // Gate still fires because group is not complete
    expect(shouldGatePause(state, LEAD_MS + STEP_GATE_MS, LEAD_MS)).toBe(true)
  })

  it('multi-group sequence: each group gates independently', () => {
    const state = initStepState([iv(60, 0), iv(64, 1000), iv(67, 2000)], 0, LEAD_MS)

    // Miss group 0 → pause
    expect(shouldGatePause(state, 4100, LEAD_MS)).toBe(true)
    // Play it → resume
    registerNoteOn(state, 60)

    // Miss group 1 → pause
    expect(shouldGatePause(state, 5100, LEAD_MS)).toBe(true)
    // Play it → resume
    registerNoteOn(state, 64)

    // Miss group 2 → pause
    expect(shouldGatePause(state, 6100, LEAD_MS)).toBe(true)
    // Play it → done
    expect(registerNoteOn(state, 67)).toBe('group_complete')
    expect(shouldGatePause(state, 99999, LEAD_MS)).toBe(false)
  })
})
