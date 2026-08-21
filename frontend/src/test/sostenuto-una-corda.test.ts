/**
 * Regression tests for issue #17 — sostenuto (CC 66) and una corda (CC 67)
 * pedal fidelity, which were previously silent no-ops on playback.
 *
 * Sostenuto must sustain only the notes already sounding at the moment the
 * pedal is pressed — notes struck afterward release normally on key-up.
 * Una corda scales down the playback velocity while held.
 */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { get } from 'svelte/store'

vi.mock('../lib/waterfall-canvas', () => ({
  DEFAULT_LEAD_TIME_SEC: 0,
}))

const { playNote, stopNote, stopAllNotes } = vi.hoisted(() => ({
  playNote: vi.fn(),
  stopNote: vi.fn(),
  stopAllNotes: vi.fn(),
}))

vi.mock('../stores/audio', () => ({
  initAudio: vi.fn().mockResolvedValue(undefined),
  playNote,
  stopNote,
  stopAllNotes,
  audioStore: {
    subscribe: (cb: (v: unknown) => void) => {
      cb({ handVolumes: { left: 100, right: 100 }, muted: false, volume: 80 })
      return () => {}
    },
  },
}))

vi.mock('../stores/midi', () => ({
  midiStore: {
    update: vi.fn(),
    subscribe: (cb: (v: unknown) => void) => {
      cb({ pressedNotes: [], velocity: 0 })
      return () => {}
    },
  },
}))

import { loadRecording, noteIntervals, play, stop } from '../stores/playback'
import type { RecordedEvent } from '../lib/recording-types'

function ev(t: number, cmd: number, note: number, vel: number): RecordedEvent {
  return { t, cmd, note, vel }
}

describe('sostenuto pedal (CC 66) — grading/visual intervals', () => {
  afterEach(() => { stop() })

  it('extends only notes sounding at press time, not notes struck afterward', () => {
    const events: RecordedEvent[] = [
      ev(0, 0x90, 60, 100),      // C4 on
      ev(100, 0xB0, 66, 127),    // sostenuto down — freezes {60}
      ev(150, 0x90, 62, 100),    // D4 on (struck AFTER sostenuto — not frozen)
      ev(200, 0x80, 60, 0),      // C4 key-up — deferred by sostenuto
      ev(250, 0x80, 62, 0),      // D4 key-up — releases normally (not frozen)
      ev(400, 0xB0, 66, 0),      // sostenuto up — C4 finally released
    ]
    loadRecording({ version: 2, events })

    const ivs = get(noteIntervals)
    const c4 = ivs.find(iv => iv.note === 60)
    const d4 = ivs.find(iv => iv.note === 62)

    expect(c4).toBeDefined()
    expect(d4).toBeDefined()
    // C4 sustained by sostenuto until pedal release (400ms), not key-up (200ms)
    expect(c4!.endMs).toBe(400)
    // D4 was struck after the pedal, so it releases at its own key-up
    expect(d4!.endMs).toBe(250)
  })
})

describe('sostenuto pedal (CC 66) — audio scheduler', () => {
  afterEach(() => {
    stop()
    vi.useRealTimers()
    playNote.mockClear()
    stopNote.mockClear()
  })

  it('defers stopNote for a frozen note until pedal release', async () => {
    vi.useFakeTimers()
    const events: RecordedEvent[] = [
      ev(0, 0x90, 60, 100),
      ev(10, 0xB0, 66, 127),
      ev(20, 0x80, 60, 0),
      ev(30, 0xB0, 66, 0),
    ]
    loadRecording({ version: 2, events })
    await play()

    vi.advanceTimersByTime(20)
    expect(stopNote).not.toHaveBeenCalledWith(60)

    vi.advanceTimersByTime(15)
    expect(stopNote).toHaveBeenCalledWith(60)
  })
})

describe('una corda pedal (CC 67) — audio scheduler', () => {
  afterEach(() => {
    stop()
    vi.useRealTimers()
    playNote.mockClear()
    stopNote.mockClear()
  })

  it('scales down velocity for notes struck while held', async () => {
    vi.useFakeTimers()
    const events: RecordedEvent[] = [
      ev(0, 0xB0, 67, 127),
      ev(10, 0x90, 60, 100),
    ]
    loadRecording({ version: 2, events })
    await play()

    vi.advanceTimersByTime(10)
    expect(playNote).toHaveBeenCalledWith(60, 75) // 100 * 1.00 (hvol) * 0.75 (una corda)
  })

  it('does not scale velocity when una corda is not held', async () => {
    vi.useFakeTimers()
    const events: RecordedEvent[] = [
      ev(0, 0x90, 60, 100),
    ]
    loadRecording({ version: 2, events })
    await play()

    vi.advanceTimersByTime(0)
    expect(playNote).toHaveBeenCalledWith(60, 100)
  })
})
