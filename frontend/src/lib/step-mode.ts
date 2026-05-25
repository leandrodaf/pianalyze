/**
 * Step-mode gate logic — pure functions with no side-effects.
 *
 * The waterfall plays music normally. When a note group's golden-line
 * deadline passes and the student hasn't played it, the caller should
 * call pause(). When the student plays the correct note(s) while paused,
 * the caller should call play() to resume.
 *
 * positionMs convention (same as playback store):
 *   positionMs = musical_time + LEAD_MS
 * A note with musical timestamp T reaches the golden line when
 *   positionMs = T + LEAD_MS
 * Therefore the gate deadline for a group is:
 *   group[0].startMs + LEAD_MS + STEP_GATE_MS
 */

import type { NoteInterval } from './recording-types'

/** Notes within this window are grouped as a chord. */
export const STEP_CHORD_WINDOW_MS = 50

/**
 * Grace window after the golden-line crossing before we gate.
 * Gives the student a small margin to play on time.
 */
export const STEP_GATE_MS = 100

export interface StepState {
  /** All note groups for the piece, sorted by startMs. */
  groups: NoteInterval[][]
  /** Index of the group we are currently waiting for the student to play. */
  waitIdx: number
  /** Notes already confirmed in the current wait group. */
  hit: Set<number>
}

/**
 * Group a flat list of note intervals into chords.
 * Notes whose startMs values are within STEP_CHORD_WINDOW_MS of the
 * current group's start are merged into the same group.
 */
export function buildStepGroups(ivs: NoteInterval[]): NoteInterval[][] {
  const sorted = [...ivs].sort((a, b) => a.startMs - b.startMs)
  const groups: NoteInterval[][] = []
  let current: NoteInterval[] = []
  let groupStart = -Infinity

  for (const iv of sorted) {
    if (iv.startMs - groupStart > STEP_CHORD_WINDOW_MS) {
      if (current.length > 0) groups.push(current)
      current = [iv]
      groupStart = iv.startMs
    } else {
      current.push(iv)
    }
  }
  if (current.length > 0) groups.push(current)
  return groups
}

/**
 * Build initial StepState from a flat interval list and the current
 * playback position. The waitIdx is set to the first group whose
 * musical timestamp is >= the current musical time (positionMs - leadMs),
 * so activating step mode mid-piece doesn't immediately gate on past notes.
 */
export function initStepState(
  ivs: NoteInterval[],
  positionMs: number,
  leadMs: number,
): StepState {
  const groups = buildStepGroups(ivs)
  const musicalNow = positionMs - leadMs
  let waitIdx = groups.findIndex(g => g[0].startMs >= musicalNow)
  if (waitIdx < 0) waitIdx = groups.length
  return { groups, waitIdx, hit: new Set() }
}

/**
 * Check whether the gate should fire (i.e., the student has missed the
 * deadline for the current wait group).
 *
 * Returns true when ALL of the following hold:
 *  1. There is a group still waiting to be played.
 *  2. The group has not been fully hit yet.
 *  3. positionMs has passed the group's golden-line deadline + STEP_GATE_MS.
 */
export function shouldGatePause(
  state: StepState,
  positionMs: number,
  leadMs: number,
): boolean {
  if (state.waitIdx >= state.groups.length) return false

  const group = state.groups[state.waitIdx]
  const groupNotes = new Set(group.map(iv => iv.note))
  const allPlayed = [...groupNotes].every(n => state.hit.has(n))

  if (allPlayed) return false

  return positionMs >= group[0].startMs + leadMs + STEP_GATE_MS
}

export type NoteOnResult =
  | 'ignored'          // note not in current group, or already hit
  | 'hit_partial'      // note accepted; group not yet complete
  | 'group_complete'   // last note of group played; advance to next group

/**
 * Register a note played by the student.
 * Mutates state.hit and state.waitIdx in place.
 *
 * @returns
 *  - 'ignored'        if the note is not part of the current wait group
 *  - 'hit_partial'    if the note is accepted but the group is not yet complete
 *  - 'group_complete' if this note completes the group (caller should resume if paused)
 */
export function registerNoteOn(state: StepState, note: number): NoteOnResult {
  if (state.waitIdx >= state.groups.length) return 'ignored'

  const group = state.groups[state.waitIdx]
  const groupNotes = new Set(group.map(iv => iv.note))

  if (!groupNotes.has(note) || state.hit.has(note)) return 'ignored'

  state.hit.add(note)

  if (state.hit.size >= groupNotes.size) {
    state.waitIdx++
    state.hit = new Set()
    return 'group_complete'
  }

  return 'hit_partial'
}
