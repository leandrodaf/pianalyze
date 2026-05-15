import { describe, it, expect } from 'vitest'
import {
  noteColor,
  HAND_COLORS,
  PITCH_COLORS,
} from '../lib/note-colors'

describe('noteColor', () => {
  describe('right hand (midi >= 60)', () => {
    it('returns right white color for C4 (60) — white key', () => {
      expect(noteColor(60)).toBe(HAND_COLORS.right.white)
    })

    it('returns right black color for C#4 (61) — black key', () => {
      expect(noteColor(61)).toBe(HAND_COLORS.right.black)
    })

    it('returns right white color for A4 (69)', () => {
      expect(noteColor(69)).toBe(HAND_COLORS.right.white)
    })

    it('returns right black color for Bb4 (70) — pitch class 10', () => {
      expect(noteColor(70)).toBe(HAND_COLORS.right.black)
    })

    it('returns right white color for C8 (108) — highest standard note', () => {
      expect(noteColor(108)).toBe(HAND_COLORS.right.white)
    })
  })

  describe('left hand (midi < 60)', () => {
    it('returns left white color for C3 (48) — white key', () => {
      expect(noteColor(48)).toBe(HAND_COLORS.left.white)
    })

    it('returns left black color for C#3 (49) — black key', () => {
      expect(noteColor(49)).toBe(HAND_COLORS.left.black)
    })

    it('returns left white color for A0 (21) — lowest standard note', () => {
      expect(noteColor(21)).toBe(HAND_COLORS.left.white)
    })

    it('returns left black color for Eb2 (39) — pitch class 3', () => {
      expect(noteColor(39)).toBe(HAND_COLORS.left.black)
    })

    it('returns left white color for B3 (59) — last left-hand note', () => {
      expect(noteColor(59)).toBe(HAND_COLORS.left.white)
    })
  })

  describe('black key pitch classes', () => {
    // Black keys: pitch class 1, 3, 6, 8, 10 (C#, D#, F#, G#, Bb)
    const blackPCs = [1, 3, 6, 8, 10]
    const whitePCs = [0, 2, 4, 5, 7, 9, 11]

    it.each(blackPCs)('pitch class %i is detected as black key', (pc) => {
      const midi = 60 + pc
      expect(noteColor(midi)).toBe(HAND_COLORS.right.black)
    })

    it.each(whitePCs)('pitch class %i is detected as white key', (pc) => {
      const midi = 60 + pc
      expect(noteColor(midi)).toBe(HAND_COLORS.right.white)
    })
  })
})

describe('HAND_COLORS', () => {
  it('right hand colors are defined', () => {
    expect(HAND_COLORS.right.white).toBeDefined()
    expect(HAND_COLORS.right.black).toBeDefined()
  })

  it('left hand colors are defined', () => {
    expect(HAND_COLORS.left.white).toBeDefined()
    expect(HAND_COLORS.left.black).toBeDefined()
  })

  it('right and left colors are distinct', () => {
    expect(HAND_COLORS.right.white).not.toBe(HAND_COLORS.left.white)
    expect(HAND_COLORS.right.black).not.toBe(HAND_COLORS.left.black)
  })
})

describe('PITCH_COLORS', () => {
  it('has exactly 12 entries (one per pitch class)', () => {
    expect(PITCH_COLORS).toHaveLength(12)
  })

  it('all entries are valid hex color strings', () => {
    for (const color of PITCH_COLORS) {
      expect(color).toMatch(/^#[0-9a-f]{6}$/i)
    }
  })
})
