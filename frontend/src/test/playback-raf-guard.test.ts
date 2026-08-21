/**
 * Regression test for the "dangling RAF" bug in playback.ts.
 *
 * Root cause:
 *   tick() calls playbackStore.update({ positionMs }), which fires subscribers
 *   synchronously (Svelte writable). If a subscriber calls pause() — as the
 *   step-mode gate does — cancelAll() sets rafId = 0. But without the guard,
 *   tick() still executes `rafId = requestAnimationFrame(tick)` after returning
 *   from the update, registering a new RAF whose ID was never passed to
 *   cancelAnimationFrame. This "dangling RAF" keeps advancing positionMs while
 *   the transport is paused, causing wrong resume positions and incorrect "miss"
 *   grades (checkMissedNotes fires when practiceMs advances past startMs + 600ms).
 *
 * Fix (playback.ts, inside tick()):
 *   After `playbackStore.update({ positionMs })`, add:
 *     if (rafId === 0) return   // cancelAll() was called during the update
 *   This prevents a new RAF from being registered when cancelAll() has already
 *   cleared rafId.
 */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { get } from 'svelte/store'

// ── Mocks — must be declared before playback import ───────────────────────────

vi.mock('../lib/waterfall-canvas', () => ({
  // Zero lead time simplifies the math: positionMs ≈ elapsed ms from play()
  DEFAULT_LEAD_TIME_SEC: 0,
}))

vi.mock('../stores/audio', () => ({
  initAudio:    vi.fn().mockResolvedValue(undefined),
  playNote:     vi.fn(),
  stopNote:     vi.fn(),
  stopAllNotes: vi.fn(),
  audioStore: {
    subscribe: (cb: (v: unknown) => void) => {
      cb({ handVolumes: { left: 100, right: 100 }, muted: false, volume: 80 })
      return () => {}
    },
  },
}))

vi.mock('../stores/midi', () => ({
  midiStore: {
    update:    vi.fn(),
    subscribe: (cb: (v: unknown) => void) => {
      cb({ pressedNotes: [], velocity: 0 })
      return () => {}
    },
  },
}))

// ── Import under test (after mocks) ──────────────────────────────────────────

import { loadRecording, pause, play, playbackStore, stop } from '../stores/playback'

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Minimal v1 recording: one note at t=1000 ms.
 * With DEFAULT_LEAD_TIME_SEC=0, durationMs = 1000 + 500 = 1500 ms.
 */
const RECORDING_1NOTE = {
  version: 1,
  recordedAt: '2024-01-01T00:00:00Z',
  events: [
    { cmd: 0x90, note: 60, vel: 80, t: 1000 },
    { cmd: 0x80, note: 60, vel: 0,  t: 1400 },
  ],
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('tick() RAF guard — no dangling loop after pause()', () => {
  afterEach(() => {
    stop()
    vi.useRealTimers()
  })

  it('positionMs stays frozen when a subscriber calls pause() during a tick', async () => {
    vi.useFakeTimers({
      toFake: [
        'setTimeout', 'clearTimeout',
        'setInterval', 'clearInterval',
        'requestAnimationFrame', 'cancelAnimationFrame',
        'performance',
      ],
    })

    loadRecording(RECORDING_1NOTE)

    // Subscriber simulates the step-mode gate: pauses once when positionMs ≥ 200 ms.
    // This is exactly what NoteWaterfall's shouldGatePause check does inside the
    // playbackStore subscriber — it calls pause() synchronously during the update
    // that tick() just triggered.
    const GATE_MS = 200
    let gateFired = false
    const unsub = playbackStore.subscribe(state => {
      if (state.status === 'playing' && state.positionMs >= GATE_MS && !gateFired) {
        gateFired = true
        pause()
      }
    })

    // Start playback (initAudio resolves as a microtask, then scheduleFrom runs)
    await play()

    // Advance 300 ms — enough for RAF ticks to push positionMs past the 200 ms gate
    vi.advanceTimersByTime(300)

    expect(gateFired).toBe(true)
    expect(get(playbackStore).status).toBe('paused')

    const frozenPos = get(playbackStore).positionMs
    expect(frozenPos).toBeGreaterThanOrEqual(GATE_MS)

    // Without the `if (rafId === 0) return` guard a dangling RAF would keep
    // firing, eventually advancing positionMs to durationMs (1500 ms) and
    // flipping status back to 'idle'. With the guard, nothing changes.
    vi.advanceTimersByTime(5000)

    expect(get(playbackStore).status).toBe('paused')
    expect(get(playbackStore).positionMs).toBe(frozenPos)

    unsub()
  })

  it('normal pause() (not triggered by a subscriber) also freezes positionMs', async () => {
    vi.useFakeTimers({
      toFake: [
        'setTimeout', 'clearTimeout',
        'setInterval', 'clearInterval',
        'requestAnimationFrame', 'cancelAnimationFrame',
        'performance',
      ],
    })

    loadRecording(RECORDING_1NOTE)
    await play()

    // Let a few frames pass so positionMs is non-zero
    vi.advanceTimersByTime(100)
    expect(get(playbackStore).status).toBe('playing')
    expect(get(playbackStore).positionMs).toBeGreaterThan(0)

    pause()

    const frozenPos = get(playbackStore).positionMs
    expect(get(playbackStore).status).toBe('paused')

    vi.advanceTimersByTime(5000)

    expect(get(playbackStore).status).toBe('paused')
    expect(get(playbackStore).positionMs).toBe(frozenPos)
  })
})
