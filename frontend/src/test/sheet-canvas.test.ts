/**
 * Smoke tests for issue #17's Sheet Music view additions: repeat barlines,
 * volta brackets, hairpins, pickup/measure numbers, and tuplet brackets.
 * These render real VexFlow SVG in jsdom — the goal is to catch runtime
 * exceptions in the new code paths, not to assert exact pixel geometry.
 */

import { describe, it, expect } from 'vitest'
import { SheetCanvas } from '../lib/sheet-canvas'
import type { Recording, NoteInterval } from '../lib/recording-types'

function ni(note: number, startMs: number, endMs: number, opts?: Partial<NoteInterval>): NoteInterval {
  return { note, startMs, endMs, ...opts }
}

function makeContainer(): HTMLDivElement {
  const div = document.createElement('div')
  document.body.appendChild(div)
  return div
}

describe('SheetCanvas — issue #17 rendering additions', () => {
  it('renders repeat barlines, volta brackets, hairpins, pickup, and tuplets without throwing', () => {
    const recording: Recording = {
      version: 2,
      tempoMap: [{ atMs: 0, bpm: 120 }],
      timeSignatureMap: [{ atMs: 0, value: '4/4' }],
      keySignature: 'C',
      pickup: true,
      measureMap: [
        { measure: 0, atMs: 0 },
        { measure: 1, atMs: 500 },
        { measure: 2, atMs: 2500 },
        { measure: 3, atMs: 4500 },
      ],
      repeats: [
        { type: 'repeat-open', atMs: 500 },
        { type: 'repeat-close', atMs: 2500, times: 2 },
      ],
      endings: [
        { number: '1', startMs: 2500, endMs: 4500 },
      ],
      hairpins: [
        { startMs: 0, endMs: 2000, from: 'p', to: 'f' },
      ],
      events: [],
    }

    const intervals: NoteInterval[] = [
      // Pickup measure note
      ni(60, 0, 500, { hand: 'right' }),
      // Measure 1: a run of 3 triplet eighths (fills one beat = 500ms at 120bpm)
      ni(62, 500, 500 + 500 / 3, { hand: 'right', tuplet: { actualNotes: 3, normalNotes: 2 } }),
      ni(64, 500 + 500 / 3, 500 + 1000 / 3, { hand: 'right', tuplet: { actualNotes: 3, normalNotes: 2 } }),
      ni(65, 500 + 1000 / 3, 1500, { hand: 'right', tuplet: { actualNotes: 3, normalNotes: 2 } }),
      // Measure 2 (repeat-close / volta start)
      ni(67, 2500, 3000, { hand: 'right' }),
      // Measure 3 (volta end)
      ni(69, 4500, 5000, { hand: 'right' }),
    ]

    const container = makeContainer()
    const sheet = new SheetCanvas(container)

    expect(() => {
      sheet.setData(intervals, recording)
      sheet.resize(1200, 300)
      sheet.setHairpins(recording.hairpins ?? [])
      sheet.setPosition(600)
    }).not.toThrow()

    expect(container.querySelector('svg')).toBeTruthy()

    sheet.destroy()
  })

  it('renders an empty state without a recording', () => {
    const container = makeContainer()
    const sheet = new SheetCanvas(container)
    expect(() => sheet.clearData()).not.toThrow()
    sheet.destroy()
  })
})
