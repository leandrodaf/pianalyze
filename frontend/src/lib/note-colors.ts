// Hand-split color scheme (mirrors sightread).
// Right hand (MIDI >= 60, C4 and above): purple family.
// Left hand  (MIDI  < 60)              : orange family.
// Lighter shade for white keys, darker for black keys.

const BLACK_PC = new Set([1, 3, 6, 8, 10])

export const HAND_COLORS = {
  right: { white: '#7b5ff0', black: '#5b3ad6' },
  left:  { white: '#f08a5b', black: '#d1642e' },
} as const

// Kept for backwards-compat / optional use.
export const PITCH_COLORS: readonly string[] = [
  '#ef4444','#f97316','#f59e0b','#eab308','#84cc16','#22c55e',
  '#10b981','#06b6d4','#3b82f6','#8b5cf6','#a855f7','#ec4899',
]

export function noteColor(midiNote: number): string {
  const isBlack = BLACK_PC.has(midiNote % 12)
  const hand    = midiNote >= 60 ? HAND_COLORS.right : HAND_COLORS.left
  return isBlack ? hand.black : hand.white
}
