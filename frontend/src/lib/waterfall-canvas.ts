/**
 * Staff-based note waterfall — Synthesia style.
 *
 * Y-axis mirrors the piano keyboard: the 52 white keys are spaced equally,
 * and black keys sit at the midpoint between their two white neighbors.
 * This matches how every major piano-roll app (including Synthesia) renders notes.
 *
 * Treble and bass staff lines are drawn at the correct Y positions derived from
 * the same piano-key axis, so note bars always land on the right line/space.
 */

import { noteColor } from './note-colors'

// ── Piano key geometry ──────────────────────────────────────────────────────

const MIDI_MIN = 21   // A0
const MIDI_MAX = 108  // C8
const BLACK_PC = new Set([1, 3, 6, 8, 10])
const HAND_SPLIT = 60  // C4: >= treble / right hand, < bass / left hand

const NOTE_NAMES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B']

// Pre-compute white-key sequential index (0 = A0, …, 51 = C8) for each MIDI note.
// Black keys get -1; use their lower white neighbor (midi−1) for notation purposes.
const WHITE_IDX = new Int16Array(128).fill(-1)
const WHITE_MIDI: number[] = []   // inverse: slot index → MIDI note
;(() => {
  let w = 0
  for (let n = MIDI_MIN; n <= MIDI_MAX; n++) {
    if (!BLACK_PC.has(n % 12)) { WHITE_IDX[n] = w; WHITE_MIDI[w] = n; w++ }
  }
})()
const TOTAL_WHITE = WHITE_MIDI.length  // 52

// Staff line MIDI notes (bottom → top for each clef)
const TREBLE_LINES = [64, 67, 71, 74, 77]  // E4, G4, B4, D5, F5
const BASS_LINES   = [43, 47, 50, 53, 57]  // G2, B2, D3, F3, A3

// White-key slot indices for staff boundaries
const TREBLE_BOT_IDX = WHITE_IDX[64]  // 25
const TREBLE_TOP_IDX = WHITE_IDX[77]  // 33
const BASS_BOT_IDX   = WHITE_IDX[43]  // 13
const BASS_TOP_IDX   = WHITE_IDX[57]  // 21

const SCROLL_PX_PER_SEC = 120
const NOW_X_RATIO = 0.82
const LEFT_MARGIN = 54

// ── Types ────────────────────────────────────────────────────────────────────

interface Bar {
  note: number
  pressScrolled: number
  releaseScrolled: number   // -1 while active
  color: string
  name: string
}

export interface WaterfallCanvas {
  noteOn(note: number, velocity: number): void
  noteOff(note: number): void
  resize(w: number, h: number): void
  destroy(): void
}

// ── Factory ──────────────────────────────────────────────────────────────────

export function createWaterfallCanvas(canvas: HTMLCanvasElement): WaterfallCanvas {
  const ctx = canvas.getContext('2d')!
  let W = canvas.width
  let H = canvas.height
  let rafId = 0
  let lastT = performance.now()
  let totalScrolled = 0

  const bars: Bar[] = []
  const activeNotes = new Map<number, Bar>()

  // Layout — recomputed on resize
  let wKeyH = 0      // pixels per white-key slot
  let barHwhite = 0  // bar height for natural notes
  let barHblack = 0  // bar height for accidentals (thinner)
  let bottomPad = 0
  let nowX = 0

  function computeLayout() {
    bottomPad = H * 0.02
    // Distribute 52 white-key slots over the available height
    wKeyH = (H - bottomPad * 2) / (TOTAL_WHITE - 1)
    barHwhite = Math.max(wKeyH * 0.82, 4)
    barHblack = Math.max(wKeyH * 0.55, 3)
    nowX = LEFT_MARGIN + (W - LEFT_MARGIN) * NOW_X_RATIO
  }

  /** Y coordinate of a MIDI note's centre on the piano-key axis. */
  function pitchY(midi: number): number {
    if (!BLACK_PC.has(midi % 12)) {
      return H - bottomPad - WHITE_IDX[midi] * wKeyH
    }
    // Black key: midpoint between its two white neighbours
    const yLo = H - bottomPad - WHITE_IDX[midi - 1] * wKeyH
    const yHi = H - bottomPad - WHITE_IDX[midi + 1] * wKeyH
    return (yLo + yHi) / 2
  }

  function idxY(whiteIdx: number): number {
    return H - bottomPad - whiteIdx * wKeyH
  }

  function barH(midi: number): number {
    return BLACK_PC.has(midi % 12) ? barHblack : barHwhite
  }

  function barScreenX(bar: Bar): { left: number; right: number } {
    const left  = nowX - (totalScrolled - bar.pressScrolled)
    const right = bar.releaseScrolled < 0
      ? nowX
      : nowX - (totalScrolled - bar.releaseScrolled)
    return { left, right }
  }

  // ── Ledger lines ────────────────────────────────────────────────────────────

  /**
   * Returns the white-key slot indices where ledger lines must be drawn for
   * a given MIDI note. Uses the lower white-neighbour index for black keys
   * (matching standard notation: C# is written on the C line with a sharp).
   *
   * Rule: draw all ledger-line positions (every 2 white-key slots from the
   * nearest staff boundary) that sit between the staff edge and the note,
   * inclusive of the note's own line position.
   */
  function ledgerSlots(midi: number): number[] {
    const isRight  = midi >= HAND_SPLIT
    const botIdx   = isRight ? TREBLE_BOT_IDX : BASS_BOT_IDX
    const topIdx   = isRight ? TREBLE_TOP_IDX : BASS_TOP_IDX
    // Notation position of the note (black keys share the lower white key)
    const effIdx   = BLACK_PC.has(midi % 12) ? WHITE_IDX[midi - 1] : WHITE_IDX[midi]

    const slots: number[] = []

    if (effIdx < botIdx) {
      // Below staff: draw from (botIdx−2) downward as long as slot ≥ effIdx
      for (let p = botIdx - 2; p >= effIdx; p -= 2) slots.push(p)
    } else if (effIdx > topIdx) {
      // Above staff: draw from (topIdx+2) upward as long as slot ≤ effIdx
      for (let p = topIdx + 2; p <= effIdx; p += 2) slots.push(p)
    }

    return slots
  }

  function drawLedgerLines(midi: number, barX: number, bw: number) {
    const slots = ledgerSlots(midi)
    if (slots.length === 0) return

    const lw = Math.min(bw + 8, wKeyH * 2.2)
    const lx = barX + (bw - lw) / 2

    ctx.strokeStyle = '#505068'
    ctx.lineWidth = 1
    for (const idx of slots) {
      const y = Math.round(idxY(idx)) + 0.5
      ctx.beginPath(); ctx.moveTo(lx, y); ctx.lineTo(lx + lw, y); ctx.stroke()
    }
  }

  // ── Main drawing ─────────────────────────────────────────────────────────────

  function drawBackground() {
    ctx.fillStyle = '#0d1a28'
    ctx.fillRect(0, 0, W, H)

    // Faint highlight bands over each staff zone
    ctx.fillStyle = 'rgba(255,255,255,0.016)'
    const trebleTop = idxY(TREBLE_TOP_IDX) - wKeyH
    const trebleBot = idxY(TREBLE_BOT_IDX) + wKeyH
    const bassTop   = idxY(BASS_TOP_IDX)   - wKeyH
    const bassBot   = idxY(BASS_BOT_IDX)   + wKeyH
    ctx.fillRect(LEFT_MARGIN, trebleTop, W - LEFT_MARGIN, trebleBot - trebleTop)
    ctx.fillRect(LEFT_MARGIN, bassTop,   W - LEFT_MARGIN, bassBot   - bassTop)
  }

  function drawStaves() {
    ctx.strokeStyle = '#3a4060'
    ctx.lineWidth = 1

    for (const n of TREBLE_LINES) {
      const y = Math.round(pitchY(n)) + 0.5
      ctx.beginPath(); ctx.moveTo(LEFT_MARGIN, y); ctx.lineTo(W, y); ctx.stroke()
    }
    for (const n of BASS_LINES) {
      const y = Math.round(pitchY(n)) + 0.5
      ctx.beginPath(); ctx.moveTo(LEFT_MARGIN, y); ctx.lineTo(W, y); ctx.stroke()
    }

    // Hand labels
    const fs = Math.max(Math.round(wKeyH * 0.9), 8)
    ctx.fillStyle = '#3d4a6a'
    ctx.font = `${fs}px sans-serif`
    ctx.textAlign = 'left'
    ctx.textBaseline = 'bottom'
    ctx.fillText('RIGHT HAND', LEFT_MARGIN, idxY(TREBLE_TOP_IDX) - wKeyH - 2)
    ctx.fillText('LEFT HAND',  LEFT_MARGIN, idxY(BASS_TOP_IDX)   - wKeyH - 2)
    ctx.textBaseline = 'alphabetic'
  }

  function drawClefs() {
    ctx.fillStyle = '#5060a0'
    ctx.textAlign = 'center'

    // Treble (𝄞): curl wraps around G4 (second line from bottom)
    const g4y = pitchY(67)
    ctx.font = `${Math.round(wKeyH * 9)}px serif`
    ctx.textBaseline = 'bottom'
    ctx.fillText('𝄞', LEFT_MARGIN / 2, g4y + wKeyH * 4.2)

    // Bass (𝄢): centred on F3 line
    const f3y = pitchY(53)
    ctx.font = `${Math.round(wKeyH * 4.5)}px serif`
    ctx.textBaseline = 'middle'
    ctx.fillText('𝄢', LEFT_MARGIN / 2, f3y - wKeyH * 0.5)

    ctx.textBaseline = 'alphabetic'
  }

  function drawNowLine() {
    ctx.strokeStyle = 'rgba(80,220,100,0.5)'
    ctx.lineWidth = 2
    ctx.beginPath(); ctx.moveTo(nowX, 0); ctx.lineTo(nowX, H); ctx.stroke()

    // White circles on the middle line of each staff (B4=71 and D3=50)
    for (const midi of [71, 50]) {
      ctx.fillStyle = 'rgba(255,255,255,0.85)'
      ctx.beginPath()
      ctx.arc(nowX, pitchY(midi), Math.max(wKeyH * 0.55, 3), 0, Math.PI * 2)
      ctx.fill()
    }
  }

  function drawBars() {
    for (const bar of bars) {
      const { left, right } = barScreenX(bar)
      if (right < LEFT_MARGIN || left > W) continue

      const cx = Math.max(left, LEFT_MARGIN)
      const cw = Math.min(right, W) - cx
      if (cw <= 0) continue

      // Ledger lines sit behind the bar
      drawLedgerLines(bar.note, cx, cw)

      const bh = barH(bar.note)
      const cy = pitchY(bar.note) - bh / 2

      ctx.globalAlpha = bar.releaseScrolled < 0 ? 0.90 : 0.72
      ctx.fillStyle = bar.color
      ctx.beginPath()
      ctx.roundRect(cx, cy, cw, bh, Math.min(bh / 2, 6))
      ctx.fill()
      ctx.globalAlpha = 1

      // Note name label (right-aligned, inside visible bar)
      if (cw > 20 && bh > 7) {
        const fs = Math.max(Math.min(Math.round(bh * 0.70), 12), 9)
        ctx.font = `bold ${fs}px sans-serif`
        ctx.fillStyle = '#ffffff'
        ctx.textAlign = 'right'
        ctx.textBaseline = 'middle'
        const rx = Math.min(cx + cw - 4, nowX - 3)
        if (rx > cx + 6) ctx.fillText(bar.name, rx, cy + bh / 2)
      }
    }
    ctx.globalAlpha = 1
    ctx.textBaseline = 'alphabetic'
  }

  function draw() {
    drawBackground()
    drawStaves()
    drawClefs()
    drawBars()
    drawNowLine()
  }

  function loop() {
    const now = performance.now()
    const dt = Math.min((now - lastT) / 1000, 0.1)
    lastT = now
    totalScrolled += SCROLL_PX_PER_SEC * dt

    for (let i = bars.length - 1; i >= 0; i--) {
      if (barScreenX(bars[i]).right < LEFT_MARGIN) bars.splice(i, 1)
    }

    draw()
    rafId = requestAnimationFrame(loop)
  }

  computeLayout()
  rafId = requestAnimationFrame(loop)

  return {
    noteOn(note: number, _velocity: number) {
      if (activeNotes.has(note)) return
      const bar: Bar = {
        note,
        pressScrolled: totalScrolled,
        releaseScrolled: -1,
        color: noteColor(note),
        name: NOTE_NAMES[note % 12],
      }
      bars.push(bar)
      activeNotes.set(note, bar)
    },

    noteOff(note: number) {
      const bar = activeNotes.get(note)
      if (!bar) return
      bar.releaseScrolled = totalScrolled
      activeNotes.delete(note)
    },

    resize(w: number, h: number) {
      W = w; H = h
      canvas.width = w; canvas.height = h
      computeLayout()
    },

    destroy() {
      cancelAnimationFrame(rafId)
    },
  }
}
