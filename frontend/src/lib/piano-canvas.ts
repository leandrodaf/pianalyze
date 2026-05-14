/**
 * Piano canvas rendering library.
 *
 * Draws all 88 keys of a standard piano (MIDI notes 21–108) on a Canvas element.
 * Supports dirty-key diffing: only keys whose pressed state changed are repainted,
 * keeping each update well under the 8 ms target.
 *
 * MIDI note 21 = A0 (leftmost key), MIDI note 108 = C8 (rightmost key).
 *
 * White keys: 52 total.  Black keys: 36 total.
 * Standard proportions: white key width ≈ height / 4.7.
 */

const MIDI_MIN = 21   // A0
const MIDI_MAX = 108  // C8

// Pitch classes (0=C … 11=B) that are black keys.
const BLACK_PC = new Set([1, 3, 6, 8, 10])

/** Returns true when the given MIDI note is a black key. */
function isBlack(note: number): boolean {
  return BLACK_PC.has(note % 12)
}

/** Counts white keys from MIDI_MIN up to (not including) `note`. */
function whitesBefore(note: number): number {
  let count = 0
  for (let n = MIDI_MIN; n < note; n++) {
    if (!isBlack(n)) count++
  }
  return count
}

// Pre-compute white-key index for every MIDI note (fast lookup at render time).
const whiteIndex: Int16Array = new Int16Array(128).fill(-1)
for (let n = MIDI_MIN; n <= MIDI_MAX; n++) {
  if (!isBlack(n)) whiteIndex[n] = whitesBefore(n)
}

const TOTAL_WHITE = 52

// Colours
const WHITE_KEY_COLOR    = '#f5f5f0'
const WHITE_PRESSED_BASE = '#4f9cf5'   // base blue for pressed white keys
const BLACK_KEY_COLOR    = '#1a1a1a'
const BLACK_PRESSED_BASE = '#1e6fd6'   // base blue for pressed black keys
const KEY_BORDER         = '#888888'
const LABEL_COLOR        = '#555555'
const LABEL_FONT         = '10px sans-serif'

/** State maintained by the PianoCanvas instance. */
interface KeyState {
  pressed: boolean
  velocity: number   // 0–127
}

export interface PianoCanvas {
  /** Repaint keys whose pressed set changed. */
  updateKeys(pressed: number[], velocity: number): void
  /** Full redraw — call on mount and resize. */
  redraw(): void
  /** Update the canvas size and redraw. */
  resize(width: number, height: number): void
}

/** Mixes a base colour with white based on intensity (0–1). */
function brighten(hex: string, intensity: number): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  const mix = (c: number) => Math.round(c + (255 - c) * intensity * 0.4)
  return `rgb(${mix(r)},${mix(g)},${mix(b)})`
}

function velocityIntensity(v: number): number {
  return v / 127
}

/**
 * Creates a PianoCanvas bound to the given HTMLCanvasElement.
 * Call `redraw()` once immediately after creation to paint the initial state.
 */
export function createPianoCanvas(canvas: HTMLCanvasElement): PianoCanvas {
  const ctx = canvas.getContext('2d')!
  const state: KeyState[] = Array.from({ length: 128 }, () => ({ pressed: false, velocity: 0 }))
  let prevPressed = new Set<number>()

  let wW = 0  // white key width
  let wH = 0  // white key height
  let bW = 0  // black key width
  let bH = 0  // black key height

  function computeDimensions() {
    const W = canvas.width
    const H = canvas.height
    wW = W / TOTAL_WHITE
    wH = H
    bW = wW * 0.6
    bH = wH * 0.62
  }

  function xForWhite(idx: number): number {
    return idx * wW
  }

  /** Returns the left-edge x for a black key above the white key at `leftWhiteIdx`. */
  function xForBlack(note: number): number {
    // A black key sits between two white keys. Its centre aligns with the right edge
    // of the white key to its left.
    const pc = note % 12
    // offsets relative to the preceding white key's left edge (in units of wW)
    const offsets: Record<number, number> = {
      1: 0.67,   // C# — sits 2/3 of the way across C
      3: 0.67,   // D#
      6: 0.67,   // F#
      8: 0.67,   // G#
      10: 0.67,  // A#
    }
    const leftWhiteNote = note - 1  // the white key immediately to the left
    const leftIdx = whiteIndex[leftWhiteNote]
    return leftIdx * wW + wW * offsets[pc] - bW / 2
  }

  function drawWhiteKey(note: number) {
    const idx = whiteIndex[note]
    const x = xForWhite(idx)
    const pressed = state[note].pressed
    const color = pressed
      ? brighten(WHITE_PRESSED_BASE, velocityIntensity(state[note].velocity))
      : WHITE_KEY_COLOR

    ctx.fillStyle = color
    ctx.fillRect(x, 0, wW - 1, wH - 1)
    ctx.strokeStyle = KEY_BORDER
    ctx.lineWidth = 0.5
    ctx.strokeRect(x, 0, wW - 1, wH - 1)

    // Note label on the lowest C of each octave
    if (note % 12 === 0) {
      const octave = Math.floor(note / 12) - 1
      ctx.fillStyle = LABEL_COLOR
      ctx.font = LABEL_FONT
      ctx.textAlign = 'center'
      ctx.fillText(`C${octave}`, x + wW / 2, wH - 6)
    }
  }

  function drawBlackKey(note: number) {
    const x = xForBlack(note)
    const pressed = state[note].pressed
    const color = pressed
      ? brighten(BLACK_PRESSED_BASE, velocityIntensity(state[note].velocity))
      : BLACK_KEY_COLOR

    ctx.fillStyle = color
    ctx.fillRect(x, 0, bW, bH)
  }

  function drawAll() {
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    // White keys first, then black keys on top.
    for (let n = MIDI_MIN; n <= MIDI_MAX; n++) {
      if (!isBlack(n)) drawWhiteKey(n)
    }
    for (let n = MIDI_MIN; n <= MIDI_MAX; n++) {
      if (isBlack(n)) drawBlackKey(n)
    }
  }

  function repaintKey(note: number) {
    if (isBlack(note)) {
      // Repaint the two neighbouring white keys underneath first to avoid artefacts.
      if (note - 1 >= MIDI_MIN) drawWhiteKey(note - 1)
      if (note + 1 <= MIDI_MAX && !isBlack(note + 1)) drawWhiteKey(note + 1)
      drawBlackKey(note)
    } else {
      drawWhiteKey(note)
      // Redraw overlapping black keys to keep them on top.
      if (note - 1 >= MIDI_MIN && isBlack(note - 1)) drawBlackKey(note - 1)
      if (note + 1 <= MIDI_MAX && isBlack(note + 1)) drawBlackKey(note + 1)
    }
  }

  return {
    resize(width: number, height: number) {
      canvas.width = width
      canvas.height = height
      computeDimensions()
      drawAll()
    },

    redraw() {
      computeDimensions()
      drawAll()
    },

    updateKeys(pressed: number[], velocity: number) {
      const next = new Set(pressed)

      // Keys that changed state.
      const dirty = new Set<number>()
      for (const n of next) {
        if (!prevPressed.has(n)) dirty.add(n)
      }
      for (const n of prevPressed) {
        if (!next.has(n)) dirty.add(n)
      }

      // Update state.
      for (const n of dirty) {
        const isNowPressed = next.has(n)
        state[n].pressed = isNowPressed
        state[n].velocity = isNowPressed ? velocity : 0
      }

      // Repaint only dirty keys.
      for (const n of dirty) {
        if (n >= MIDI_MIN && n <= MIDI_MAX) repaintKey(n)
      }

      prevPressed = next
    }
  }
}
