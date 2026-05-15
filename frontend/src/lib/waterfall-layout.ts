/**
 * Pure layout math for the waterfall canvas.
 * No side effects, no canvas references — fully unit-testable.
 */

export const MIDI_MIN  = 21   // A0
export const MIDI_MAX  = 108  // C8
export const BLACK_PC  = new Set([1, 3, 6, 8, 10])
export const HAND_SPLIT = 60  // C4: >= treble / right hand, < bass / left hand
export const NOTE_NAMES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B']

// Pre-compute white-key sequential index (0 = A0, …, 51 = C8) for each MIDI note.
// Black keys get -1; use their lower white neighbor (midi−1) for notation purposes.
export const WHITE_IDX  = new Int16Array(128).fill(-1)
export const WHITE_MIDI: number[] = []  // inverse: slot index → MIDI note
;(() => {
  let w = 0
  for (let n = MIDI_MIN; n <= MIDI_MAX; n++) {
    if (!BLACK_PC.has(n % 12)) { WHITE_IDX[n] = w; WHITE_MIDI[w] = n; w++ }
  }
})()
export const TOTAL_WHITE = WHITE_MIDI.length  // 52

// White-key index of C4 — used as the gap threshold between hands
export const C4_WHITE_IDX = WHITE_IDX[HAND_SPLIT]  // 23

// Staff line MIDI notes (bottom → top for each clef)
export const TREBLE_LINES = [64, 67, 71, 74, 77]  // E4, G4, B4, D5, F5
export const BASS_LINES   = [43, 47, 50, 53, 57]  // G2, B2, D3, F3, A3

// White-key slot indices for staff boundaries
export const TREBLE_BOT_IDX = WHITE_IDX[64]  // 25
export const TREBLE_TOP_IDX = WHITE_IDX[77]  // 33
export const BASS_BOT_IDX   = WHITE_IDX[43]  // 13
export const BASS_TOP_IDX   = WHITE_IDX[57]  // 21

export const LEFT_MARGIN            = 54
export const LINE_X_RATIO           = 0.15   // golden line — always left, both modes
export const LIVE_SCROLL_PX_PER_SEC = 120    // live mode bar scroll speed
export const DEFAULT_LEAD_TIME_SEC  = 4      // seconds for notes to travel right-edge → golden line

// Extra white-key heights of visual separation inserted between the two hand zones.
// Increase this value to push the staves further apart.
const HAND_GAP_EXTRA_SLOTS = 7

export interface WaterfallLayout {
  W: number
  H: number
  bottomPad: number
  wKeyH: number       // pixels per white-key slot
  barHwhite: number   // bar height for natural notes
  barHblack: number   // bar height for accidentals
  handGapPx: number   // pixels of extra separation between bass and treble zones
  nowX: number        // golden line X — same as judgeX
  judgeX: number      // judgment line X — same as nowX
  practiceScrollPxPerSec: number  // (W - judgeX) / leadTimeSec
}

export function computeLayout(W: number, H: number, leadTimeSec: number): WaterfallLayout {
  const bottomPad = H * 0.02
  // Shrink wKeyH to fit the extra gap without clipping the top/bottom keys
  const wKeyH     = (H - bottomPad * 2) / (TOTAL_WHITE - 1 + HAND_GAP_EXTRA_SLOTS)
  const handGapPx = wKeyH * HAND_GAP_EXTRA_SLOTS
  const barHwhite = Math.max(wKeyH * 0.82, 4)
  const barHblack = Math.max(wKeyH * 0.55, 3)
  const nowX      = LEFT_MARGIN + (W - LEFT_MARGIN) * LINE_X_RATIO
  const judgeX    = nowX
  const practiceScrollPxPerSec = (W - judgeX) / leadTimeSec
  return { W, H, bottomPad, wKeyH, barHwhite, barHblack, handGapPx, nowX, judgeX, practiceScrollPxPerSec }
}

/**
 * Y coordinate of a MIDI note's centre on the piano-key axis.
 * Notes at or above HAND_SPLIT (C4) are shifted upward by handGapPx to
 * create visual separation between the two hand zones.
 */
export function pitchY(midi: number, layout: WaterfallLayout): number {
  const { H, bottomPad, wKeyH, handGapPx } = layout
  const gap = midi >= HAND_SPLIT ? handGapPx : 0

  if (!BLACK_PC.has(midi % 12)) {
    return H - bottomPad - WHITE_IDX[midi] * wKeyH - gap
  }
  const yLo = H - bottomPad - WHITE_IDX[midi - 1] * wKeyH - gap
  const yHi = H - bottomPad - WHITE_IDX[midi + 1] * wKeyH - gap
  return (yLo + yHi) / 2
}

/**
 * Y coordinate of a white-key slot index.
 * Indices at or above C4_WHITE_IDX receive the treble-zone gap offset.
 */
export function idxY(whiteIdx: number, layout: WaterfallLayout): number {
  const gap = whiteIdx >= C4_WHITE_IDX ? layout.handGapPx : 0
  return layout.H - layout.bottomPad - whiteIdx * layout.wKeyH - gap
}

/** Bar height for a MIDI note (thinner for accidentals). */
export function barH(midi: number, layout: WaterfallLayout): number {
  return BLACK_PC.has(midi % 12) ? layout.barHblack : layout.barHwhite
}

/**
 * White-key slot indices where ledger lines must be drawn for a given MIDI note.
 * Uses the lower white-neighbour index for black keys (matching standard notation).
 */
export function ledgerSlots(midi: number): number[] {
  const isRight = midi >= HAND_SPLIT
  const botIdx  = isRight ? TREBLE_BOT_IDX : BASS_BOT_IDX
  const topIdx  = isRight ? TREBLE_TOP_IDX : BASS_TOP_IDX
  const effIdx  = BLACK_PC.has(midi % 12) ? WHITE_IDX[midi - 1] : WHITE_IDX[midi]
  const slots: number[] = []
  if (effIdx < botIdx) {
    for (let p = botIdx - 2; p >= effIdx; p -= 2) slots.push(p)
  } else if (effIdx > topIdx) {
    for (let p = topIdx + 2; p <= effIdx; p += 2) slots.push(p)
  }
  return slots
}
