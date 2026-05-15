/**
 * Piano canvas rendering library.
 *
 * Draws all 88 keys of a standard piano (MIDI notes 21–108).
 * Supports dirty-key diffing: only keys whose state changed are repainted.
 *
 * fingerMap: when set, keys in the map are colored by finger (pressed = vivid,
 * unpressed = soft hint glow + finger number label).
 */

import { noteColor } from './note-colors'
import { FINGER_COLORS } from './finger-colors'
import type { Finger } from './recording-types'

const MIDI_MIN = 21
const MIDI_MAX = 108
const BLACK_PC = new Set([1, 3, 6, 8, 10])

function isBlack(note: number): boolean {
  return BLACK_PC.has(note % 12)
}

function whitesBefore(note: number): number {
  let count = 0
  for (let n = MIDI_MIN; n < note; n++) {
    if (!isBlack(n)) count++
  }
  return count
}

const whiteIndex: Int16Array = new Int16Array(128).fill(-1)
for (let n = MIDI_MIN; n <= MIDI_MAX; n++) {
  if (!isBlack(n)) whiteIndex[n] = whitesBefore(n)
}

const TOTAL_WHITE   = 52
const WHITE_KEY_COLOR = 'rgb(255,253,240)'
const KEY_BORDER      = 'rgba(0,0,0,0.35)'
const LABEL_COLOR     = 'rgba(0,0,0,0.38)'
const LABEL_FONT      = '10px sans-serif'

interface KeyState {
  pressed: boolean
  velocity: number
}

export interface PianoCanvas {
  updateKeys(pressed: number[], velocity: number): void
  /** Replace the finger hint map. Pass an empty map to clear all hints. */
  setFingerMap(map: Map<number, Finger>): void
  redraw(): void
  resize(width: number, height: number): void
}

function brighten(hex: string, intensity: number): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  const mix = (c: number) => Math.round(c + (255 - c) * intensity * 0.4)
  return `rgb(${mix(r)},${mix(g)},${mix(b)})`
}

/** Blends a finger color with the white key base to produce a soft hint tint. */
function hintTint(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  const w = (c: number, white: number) => Math.round(c * 0.28 + white * 0.72)
  return `rgb(${w(r, 255)},${w(g, 253)},${w(b, 240)})`
}

function velocityIntensity(v: number): number {
  return v / 127
}

export function createPianoCanvas(canvas: HTMLCanvasElement): PianoCanvas {
  const ctx = canvas.getContext('2d')!
  const state: KeyState[] = Array.from({ length: 128 }, () => ({ pressed: false, velocity: 0 }))
  let prevPressed  = new Set<number>()
  let fingerMap    = new Map<number, Finger>()
  let prevFingerKeys = new Set<number>()

  let wW = 0
  let wH = 0
  let bW = 0
  let bH = 0

  function computeDimensions() {
    wW = canvas.width / TOTAL_WHITE
    wH = canvas.height
    bW = wW * 0.6
    bH = wH * 0.62
  }

  function xForWhite(idx: number): number { return idx * wW }

  function xForBlack(note: number): number {
    const offsets: Record<number, number> = { 1: 0.67, 3: 0.67, 6: 0.67, 8: 0.67, 10: 0.67 }
    const pc = note % 12
    const leftIdx = whiteIndex[note - 1]
    return leftIdx * wW + wW * offsets[pc] - bW / 2
  }

  function drawWhiteKey(note: number) {
    const idx     = whiteIndex[note]
    const x       = xForWhite(idx)
    const kw      = wW - 1
    const kh      = wH - 1
    const pressed = state[note].pressed
    const radius  = Math.max(kw * 0.18, 2)
    const finger  = fingerMap.get(note)

    ctx.beginPath()
    ctx.moveTo(x, 0)
    ctx.lineTo(x + kw, 0)
    ctx.lineTo(x + kw, kh - radius)
    ctx.quadraticCurveTo(x + kw, kh, x + kw - radius, kh)
    ctx.lineTo(x + radius, kh)
    ctx.quadraticCurveTo(x, kh, x, kh - radius)
    ctx.closePath()

    let color: string
    if (pressed && finger) {
      color = brighten(FINGER_COLORS[finger], velocityIntensity(state[note].velocity))
    } else if (pressed) {
      color = brighten(noteColor(note), velocityIntensity(state[note].velocity))
    } else if (finger) {
      color = hintTint(FINGER_COLORS[finger])
    } else {
      color = WHITE_KEY_COLOR
    }

    ctx.fillStyle = color
    ctx.fill()
    ctx.strokeStyle = KEY_BORDER
    ctx.lineWidth = 0.5
    ctx.stroke()

    // Octave label on each C
    if (note % 12 === 0) {
      const octave = Math.floor(note / 12) - 1
      ctx.fillStyle = LABEL_COLOR
      ctx.font = LABEL_FONT
      ctx.textAlign = 'center'
      ctx.fillText(`C${octave}`, x + wW / 2, wH - 6)
    }

    // Finger number indicator near the bottom of the key
    if (finger) {
      const r  = Math.max(Math.min(wW * 0.28, 10), 5)
      const fx = x + wW / 2
      const fy = wH - r - (note % 12 === 0 ? 18 : 10)
      ctx.beginPath()
      ctx.arc(fx, fy, r, 0, Math.PI * 2)
      ctx.fillStyle = FINGER_COLORS[finger]
      ctx.fill()
      ctx.font = `bold ${Math.max(Math.round(r * 1.2), 7)}px sans-serif`
      ctx.fillStyle = '#fff'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(String(finger), fx, fy)
      ctx.textBaseline = 'alphabetic'
    }
  }

  function drawBlackKey(note: number) {
    const x       = xForBlack(note)
    const pressed = state[note].pressed
    const finger  = fingerMap.get(note)

    if (pressed && finger) {
      ctx.fillStyle = brighten(FINGER_COLORS[finger], velocityIntensity(state[note].velocity))
      ctx.fillRect(x, 0, bW, bH)
    } else if (pressed) {
      ctx.fillStyle = brighten(noteColor(note), velocityIntensity(state[note].velocity))
      ctx.fillRect(x, 0, bW, bH)
    } else if (finger) {
      // Hint: colored glow on black key
      ctx.fillStyle = FINGER_COLORS[finger] + '55'  // ~33% opacity
      ctx.fillRect(x, 0, bW, bH)
      // Dark body on top to keep 3-D depth, with colored accent
      const grad = ctx.createLinearGradient(x, 0, x + bW, 0)
      grad.addColorStop(0,   '#1c1c1c')
      grad.addColorStop(0.5, '#111111')
      grad.addColorStop(1,   '#1a1a1a')
      ctx.fillStyle = grad
      ctx.fillRect(x, 0, bW, bH * 0.55)
    } else {
      const grad = ctx.createLinearGradient(x, 0, x + bW, 0)
      grad.addColorStop(0,   '#1c1c1c')
      grad.addColorStop(0.3, '#0d0d0d')
      grad.addColorStop(1,   '#111111')
      ctx.fillStyle = grad
      ctx.fillRect(x, 0, bW, bH)
      ctx.fillStyle = 'rgba(255,255,255,0.06)'
      ctx.fillRect(x + 1, 0, bW - 2, Math.max(bH * 0.12, 3))
    }

    // Finger number on black key
    if (finger) {
      const r  = Math.max(Math.min(bW * 0.36, 9), 4)
      const fx = x + bW / 2
      const fy = bH - r - 4
      ctx.beginPath()
      ctx.arc(fx, fy, r, 0, Math.PI * 2)
      ctx.fillStyle = FINGER_COLORS[finger]
      ctx.fill()
      ctx.font = `bold ${Math.max(Math.round(r * 1.2), 6)}px sans-serif`
      ctx.fillStyle = '#fff'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(String(finger), fx, fy)
      ctx.textBaseline = 'alphabetic'
    }
  }

  function drawAll() {
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    for (let n = MIDI_MIN; n <= MIDI_MAX; n++) {
      if (!isBlack(n)) drawWhiteKey(n)
    }
    for (let n = MIDI_MIN; n <= MIDI_MAX; n++) {
      if (isBlack(n)) drawBlackKey(n)
    }
  }

  function repaintKey(note: number) {
    if (isBlack(note)) {
      if (note - 1 >= MIDI_MIN) drawWhiteKey(note - 1)
      if (note + 1 <= MIDI_MAX && !isBlack(note + 1)) drawWhiteKey(note + 1)
      drawBlackKey(note)
    } else {
      drawWhiteKey(note)
      if (note - 1 >= MIDI_MIN && isBlack(note - 1)) drawBlackKey(note - 1)
      if (note + 1 <= MIDI_MAX && isBlack(note + 1)) drawBlackKey(note + 1)
    }
  }

  return {
    resize(width, height) {
      canvas.width  = width
      canvas.height = height
      computeDimensions()
      drawAll()
    },

    redraw() {
      computeDimensions()
      drawAll()
    },

    updateKeys(pressed, velocity) {
      const next = new Set(pressed)
      const dirty = new Set<number>()
      for (const n of next)         if (!prevPressed.has(n)) dirty.add(n)
      for (const n of prevPressed)  if (!next.has(n))        dirty.add(n)

      for (const n of dirty) {
        const on = next.has(n)
        state[n].pressed  = on
        state[n].velocity = on ? velocity : 0
      }
      for (const n of dirty) {
        if (n >= MIDI_MIN && n <= MIDI_MAX) repaintKey(n)
      }
      prevPressed = next
    },

    setFingerMap(map) {
      // Collect all keys that changed hint status
      const dirty = new Set<number>()
      for (const n of map.keys())         if (!fingerMap.has(n) || fingerMap.get(n) !== map.get(n)) dirty.add(n)
      for (const n of prevFingerKeys)     if (!map.has(n)) dirty.add(n)

      fingerMap = map
      prevFingerKeys = new Set(map.keys())

      for (const n of dirty) {
        if (n >= MIDI_MIN && n <= MIDI_MAX) repaintKey(n)
      }
    },
  }
}
