import { describe, it, expect } from 'vitest'
import {
  computeLayout,
  pitchY,
  idxY,
  barH,
  ledgerSlots,
  WHITE_IDX,
  WHITE_MIDI,
  TOTAL_WHITE,
  BLACK_PC,
  MIDI_MIN,
  MIDI_MAX,
  TREBLE_LINES,
  BASS_LINES,
  TREBLE_BOT_IDX,
  TREBLE_TOP_IDX,
  BASS_BOT_IDX,
  BASS_TOP_IDX,
} from '../lib/waterfall-layout'

// Reference layout used across most tests
const L = computeLayout(1280, 720, 4)

describe('constants', () => {
  it('MIDI_MIN is A0 (21)', () => expect(MIDI_MIN).toBe(21))
  it('MIDI_MAX is C8 (108)', () => expect(MIDI_MAX).toBe(108))
  it('TOTAL_WHITE is 52', () => expect(TOTAL_WHITE).toBe(52))

  it('BLACK_PC contains exactly 5 entries', () => {
    expect(BLACK_PC.size).toBe(5)
  })

  it('BLACK_PC contains 1, 3, 6, 8, 10', () => {
    expect([...BLACK_PC].sort((a, b) => a - b)).toEqual([1, 3, 6, 8, 10])
  })

  it('TREBLE_LINES has 5 notes', () => expect(TREBLE_LINES).toHaveLength(5))
  it('BASS_LINES has 5 notes', () => expect(BASS_LINES).toHaveLength(5))
})

describe('WHITE_IDX and WHITE_MIDI', () => {
  it('A0 (21) is white key slot 0', () => expect(WHITE_IDX[21]).toBe(0))
  it('C8 (108) is white key slot 51', () => expect(WHITE_IDX[108]).toBe(51))

  it('black keys have WHITE_IDX = -1', () => {
    // C#4 = 61, D#4 = 63, F#4 = 66, G#4 = 68, Bb4 = 70
    for (const midi of [61, 63, 66, 68, 70]) {
      expect(WHITE_IDX[midi]).toBe(-1)
    }
  })

  it('WHITE_MIDI is the inverse of WHITE_IDX', () => {
    for (let i = 0; i < TOTAL_WHITE; i++) {
      const midi = WHITE_MIDI[i]
      expect(WHITE_IDX[midi]).toBe(i)
    }
  })

  it('WHITE_MIDI entries are all white keys (not in BLACK_PC)', () => {
    for (const midi of WHITE_MIDI) {
      expect(BLACK_PC.has(midi % 12)).toBe(false)
    }
  })
})

describe('computeLayout', () => {
  it('returns an object with all expected fields', () => {
    expect(L).toMatchObject({
      W: expect.any(Number),
      H: expect.any(Number),
      bottomPad: expect.any(Number),
      wKeyH: expect.any(Number),
      barHwhite: expect.any(Number),
      barHblack: expect.any(Number),
      nowX: expect.any(Number),
      judgeX: expect.any(Number),
      practiceScrollPxPerSec: expect.any(Number),
    })
  })

  it('nowX equals judgeX', () => {
    expect(L.nowX).toBe(L.judgeX)
  })

  it('barHblack < barHwhite', () => {
    expect(L.barHblack).toBeLessThan(L.barHwhite)
  })

  it('practiceScrollPxPerSec = (W - judgeX) / leadTimeSec', () => {
    const expected = (L.W - L.judgeX) / 4
    expect(L.practiceScrollPxPerSec).toBeCloseTo(expected)
  })

  it('wKeyH > 0', () => expect(L.wKeyH).toBeGreaterThan(0))
  it('bottomPad > 0', () => expect(L.bottomPad).toBeGreaterThan(0))

  it('different lead times produce different scroll speeds', () => {
    const fast = computeLayout(1280, 720, 2)
    const slow = computeLayout(1280, 720, 8)
    expect(fast.practiceScrollPxPerSec).toBeGreaterThan(slow.practiceScrollPxPerSec)
  })
})

describe('pitchY', () => {
  it('A0 (21) is at the bottom (highest Y value)', () => {
    const yA0 = pitchY(21, L)
    const yC8 = pitchY(108, L)
    expect(yA0).toBeGreaterThan(yC8)
  })

  it('white keys return exact slot Y', () => {
    const midi = 60 // C4
    const expected = idxY(WHITE_IDX[60], L)
    expect(pitchY(midi, L)).toBeCloseTo(expected)
  })

  it('black key Y is between its lower and upper white neighbors', () => {
    const midi = 61 // C#4 — between C4 (60) and D4 (62)
    const yLo = pitchY(60, L)
    const yHi = pitchY(62, L)
    const yBlack = pitchY(midi, L)
    const mid = (yLo + yHi) / 2
    expect(yBlack).toBeCloseTo(mid)
  })

  it('C4 (60) is higher on screen than B3 (59)', () => {
    // Higher pitch → lower Y value
    expect(pitchY(60, L)).toBeLessThan(pitchY(59, L))
  })
})

describe('idxY', () => {
  it('slot 0 (A0) is near the bottom', () => {
    expect(idxY(0, L)).toBeCloseTo(L.H - L.bottomPad)
  })

  it('higher slot index → lower Y (higher on screen)', () => {
    expect(idxY(10, L)).toBeGreaterThan(idxY(20, L))
  })
})

describe('barH', () => {
  it('white key returns barHwhite', () => {
    expect(barH(60, L)).toBe(L.barHwhite) // C4
  })

  it('black key returns barHblack', () => {
    expect(barH(61, L)).toBe(L.barHblack) // C#4
  })

  it('barHblack < barHwhite', () => {
    expect(barH(61, L)).toBeLessThan(barH(60, L))
  })
})

describe('ledgerSlots', () => {
  it('returns empty array for notes within treble staff (right hand, E4–F5)', () => {
    // E4=64, G4=67, B4=71, D5=74, F5=77 — on staff lines, no ledger needed
    for (const midi of [64, 67, 71, 74, 77]) {
      expect(ledgerSlots(midi)).toHaveLength(0)
    }
  })

  it('returns empty array for notes within bass staff (left hand, G2–A3)', () => {
    for (const midi of [43, 47, 50, 53, 57]) {
      expect(ledgerSlots(midi)).toHaveLength(0)
    }
  })

  it('A0 (21) needs ledger lines below bass staff', () => {
    const slots = ledgerSlots(21)
    expect(slots.length).toBeGreaterThan(0)
    // all slots must be below the bass bottom boundary
    for (const s of slots) {
      expect(s).toBeLessThan(BASS_BOT_IDX)
    }
  })

  it('C8 (108) needs ledger lines above treble staff', () => {
    const slots = ledgerSlots(108)
    expect(slots.length).toBeGreaterThan(0)
    for (const s of slots) {
      expect(s).toBeGreaterThan(TREBLE_TOP_IDX)
    }
  })

  it('ledger slots are spaced 2 apart (every other line)', () => {
    const slots = ledgerSlots(21)
    for (let i = 1; i < slots.length; i++) {
      expect(Math.abs(slots[i] - slots[i - 1])).toBe(2)
    }
  })

  it('C4 (middle C, right hand) generates ledger lines below treble', () => {
    // C4 = 60, treble bottom is E4 = 64 → C4 is below staff
    const slots = ledgerSlots(60)
    expect(slots.length).toBeGreaterThan(0)
    for (const s of slots) {
      expect(s).toBeLessThan(TREBLE_BOT_IDX)
    }
  })

  it('black key uses lower white neighbor index for ledger calculation', () => {
    // C#4 (61) should behave the same as C4 (60) for ledger purposes
    const slotsBlack = ledgerSlots(61)
    const slotsWhite = ledgerSlots(60)
    expect(slotsBlack).toEqual(slotsWhite)
  })
})

describe('staff boundary indices', () => {
  it('TREBLE_BOT_IDX is WHITE_IDX of E4 (64)', () => {
    expect(TREBLE_BOT_IDX).toBe(WHITE_IDX[64])
  })
  it('TREBLE_TOP_IDX is WHITE_IDX of F5 (77)', () => {
    expect(TREBLE_TOP_IDX).toBe(WHITE_IDX[77])
  })
  it('BASS_BOT_IDX is WHITE_IDX of G2 (43)', () => {
    expect(BASS_BOT_IDX).toBe(WHITE_IDX[43])
  })
  it('BASS_TOP_IDX is WHITE_IDX of A3 (57)', () => {
    expect(BASS_TOP_IDX).toBe(WHITE_IDX[57])
  })
})
