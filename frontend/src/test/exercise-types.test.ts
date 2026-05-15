import { describe, it, expect } from 'vitest'
import {
  DIFFICULTY_LABEL,
  DIFFICULTY_COLOR,
  CATEGORY_LABEL,
  HANDS_LABEL,
  type DifficultyLevel,
  type Category,
} from '../lib/exercise-types'

describe('DIFFICULTY_LABEL', () => {
  const levels: DifficultyLevel[] = [1, 2, 3, 4, 5]

  it('has an entry for all 5 difficulty levels', () => {
    expect(Object.keys(DIFFICULTY_LABEL)).toHaveLength(5)
  })

  it.each(levels)('level %i has a non-empty label', (level) => {
    expect(DIFFICULTY_LABEL[level]).toBeTruthy()
    expect(typeof DIFFICULTY_LABEL[level]).toBe('string')
  })

  it('labels are unique', () => {
    const values = Object.values(DIFFICULTY_LABEL)
    expect(new Set(values).size).toBe(values.length)
  })
})

describe('DIFFICULTY_COLOR', () => {
  const levels: DifficultyLevel[] = [1, 2, 3, 4, 5]

  it('has an entry for all 5 difficulty levels', () => {
    expect(Object.keys(DIFFICULTY_COLOR)).toHaveLength(5)
  })

  it.each(levels)('level %i has a valid hex color', (level) => {
    expect(DIFFICULTY_COLOR[level]).toMatch(/^#[0-9a-f]{6}$/i)
  })

  it('colors are unique per level', () => {
    const values = Object.values(DIFFICULTY_COLOR)
    expect(new Set(values).size).toBe(values.length)
  })
})

describe('CATEGORY_LABEL', () => {
  const categories: Category[] = ['scales', 'chords', 'pieces']

  it('has entries for all 3 categories', () => {
    expect(Object.keys(CATEGORY_LABEL)).toHaveLength(3)
  })

  it.each(categories)('category "%s" has a non-empty label', (cat) => {
    expect(CATEGORY_LABEL[cat]).toBeTruthy()
    expect(typeof CATEGORY_LABEL[cat]).toBe('string')
  })
})

describe('HANDS_LABEL', () => {
  const hands = ['left', 'right', 'both']

  it('has entries for left, right and both', () => {
    for (const hand of hands) {
      expect(HANDS_LABEL[hand]).toBeTruthy()
    }
  })

  it.each(hands)('hand "%s" label is a non-empty string', (hand) => {
    expect(typeof HANDS_LABEL[hand]).toBe('string')
    expect(HANDS_LABEL[hand].length).toBeGreaterThan(0)
  })

  it('all hand labels are distinct', () => {
    const values = hands.map(h => HANDS_LABEL[h])
    expect(new Set(values).size).toBe(values.length)
  })
})
