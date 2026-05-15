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
import type { NoteInterval } from './recording-types'
import { GRADE_TOLERANCE_MS } from './recording-types'

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

const LIVE_SCROLL_PX_PER_SEC        = 120   // live mode bar scroll speed
export const LINE_X_RATIO           = 0.15  // golden line position — always left, both modes
const LEFT_MARGIN                   = 54
export const DEFAULT_LEAD_TIME_SEC  = 4     // seconds for notes to travel right-edge → golden line

// ── Types ────────────────────────────────────────────────────────────────────

// ── Live-mode bar ────────────────────────────────────────────────────────────

interface Bar {
  note: number
  pressScrolled: number
  releaseScrolled: number   // -1 while active
  color: string
  name: string
}

// ── Practice-mode types ───────────────────────────────────────────────────────

type PracticeGrade = 'perfect' | 'good' | 'ok' | 'miss' | 'wrong'

interface PracticeBar {
  iv: NoteInterval
  grade?: PracticeGrade
  graded: boolean
}

interface GradeBadge {
  text: string
  color: string
  y: number
  startT: number  // performance.now() when created
}

const GRADE_FADE_MS = 1300

const GRADE_TEXT: Record<PracticeGrade, string> = {
  perfect: 'Perfect!',
  good:    'Good',
  ok:      'OK',
  miss:    'Miss',
  wrong:   'Wrong',
}
const GRADE_COLOR: Record<PracticeGrade, string> = {
  perfect: '#ffd700',
  good:    '#4ec080',
  ok:      '#f0a830',
  miss:    '#e04040',
  wrong:   '#e04040',
}

// ── Public interface ──────────────────────────────────────────────────────────

export interface WaterfallCanvas {
  /** Live mode: note pressed. */
  noteOn(note: number, velocity: number): void
  /** Live mode: note released. */
  noteOff(note: number): void

  /** Switch to practice mode with the given recording intervals. */
  enablePractice(intervals: NoteInterval[]): void
  /** Return to live mode. */
  disablePractice(): void
  /** Update the current playback position (practice mode). */
  setPracticeTime(ms: number): void
  /** Record a grade for a student note press and show a badge. */
  showGrade(note: number, grade: PracticeGrade): void

  /** Set how many seconds ahead notes appear before reaching the golden line (default 4). */
  setLeadTime(seconds: number): void
  /** Returns the current lead time in seconds. */
  getLeadTime(): number
  /** Sets the live-mode scroll speed multiplier. */
  setSpeed(multiplier: number): void

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
  let speedMultiplier = 1

  const bars: Bar[] = []
  const activeNotes = new Map<number, Bar>()

  // Layout — recomputed on resize
  let wKeyH = 0      // pixels per white-key slot
  let barHwhite = 0  // bar height for natural notes
  let barHblack = 0  // bar height for accidentals (thinner)
  let bottomPad = 0
  let nowX = 0
  let leadTimeSec = DEFAULT_LEAD_TIME_SEC
  let practiceScrollPxPerSec = 0   // computed: (W - nowX) / leadTimeSec

  function computeLayout() {
    bottomPad = H * 0.02
    wKeyH = (H - bottomPad * 2) / (TOTAL_WHITE - 1)
    barHwhite = Math.max(wKeyH * 0.82, 4)
    barHblack = Math.max(wKeyH * 0.55, 3)
    nowX   = LEFT_MARGIN + (W - LEFT_MARGIN) * LINE_X_RATIO
    judgeX = nowX   // same line, always
    practiceScrollPxPerSec = (W - judgeX) / leadTimeSec
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
    // Live mode: bars grow LEFTWARD — right edge anchored at nowX, left trails left over time
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

    ctx.strokeStyle = 'rgba(255,255,255,0.22)'
    ctx.lineWidth = 1
    for (const idx of slots) {
      const y = Math.round(idxY(idx)) + 0.5
      ctx.beginPath(); ctx.moveTo(lx, y); ctx.lineTo(lx + lw, y); ctx.stroke()
    }
  }

  // ── Practice mode state ───────────────────────────────────────────────────────

  let practiceActive = false
  let practiceBars: PracticeBar[] = []
  let practiceMs = 0
  let gradeBadges: GradeBadge[] = []
  let judgeX = 0  // recomputed in computeLayout

  function msToX(ms: number): number {
    return judgeX + (ms - practiceMs) * (practiceScrollPxPerSec / 1000)
  }

  function drawJudgmentLine() {
    ctx.save()
    ctx.strokeStyle = 'rgba(255, 210, 50, 0.9)'
    ctx.lineWidth = 2
    ctx.shadowColor = '#FFD700'
    ctx.shadowBlur = 16
    ctx.beginPath()
    ctx.moveTo(judgeX, 0)
    ctx.lineTo(judgeX, H)
    ctx.stroke()
    ctx.restore()

    for (const midi of [71, 50]) {
      ctx.save()
      ctx.fillStyle = 'rgba(255, 230, 80, 0.95)'
      ctx.shadowColor = '#FFD700'
      ctx.shadowBlur = 10
      ctx.beginPath()
      ctx.arc(judgeX, pitchY(midi), Math.max(wKeyH * 0.6, 3.5), 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()
    }
  }

  function drawPracticeBars() {
    for (const pb of practiceBars) {
      const left  = msToX(pb.iv.startMs)
      const right = msToX(pb.iv.endMs)
      if (right < LEFT_MARGIN || left > W) continue

      const cx = Math.max(left, LEFT_MARGIN)
      const cw = Math.min(right, W) - cx
      if (cw <= 0) continue

      drawLedgerLines(pb.iv.note, cx, cw)

      const bh = barH(pb.iv.note)
      const cy = pitchY(pb.iv.note) - bh / 2

      // Color: graded notes use grade color; upcoming = note color; past = dim
      let color = noteColor(pb.iv.note)
      let alpha = 0.85
      if (pb.graded && pb.grade) {
        color = GRADE_COLOR[pb.grade]
        alpha = left < judgeX ? 0.45 : 0.85
      } else if (right < judgeX) {
        alpha = 0.30  // missed / not yet graded past bar
      }

      ctx.globalAlpha = alpha
      ctx.fillStyle = color
      ctx.beginPath()
      ctx.roundRect(cx, cy, cw, bh, Math.min(bh / 2, 6))
      ctx.fill()
      ctx.globalAlpha = 1

      if (cw > 18 && bh > 7) {
        const fs = Math.max(Math.min(Math.round(bh * 0.70), 12), 9)
        ctx.font = `bold ${fs}px sans-serif`
        ctx.fillStyle = '#ffffff'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(NOTE_NAMES[pb.iv.note % 12], cx + Math.min(cw / 2, 18), cy + bh / 2)
      }
    }
    ctx.globalAlpha = 1
    ctx.textBaseline = 'alphabetic'
  }

  function drawGradeBadges() {
    const now = performance.now()
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'

    for (let i = gradeBadges.length - 1; i >= 0; i--) {
      const b = gradeBadges[i]
      const elapsed = now - b.startT
      if (elapsed > GRADE_FADE_MS) { gradeBadges.splice(i, 1); continue }

      const alpha = Math.max(0, 1 - elapsed / GRADE_FADE_MS)
      const rise  = (elapsed / GRADE_FADE_MS) * 35

      ctx.globalAlpha = alpha
      ctx.font = `bold ${Math.max(Math.round(wKeyH * 1.2), 12)}px sans-serif`
      ctx.fillStyle = b.color
      ctx.fillText(b.text, judgeX + 10, b.y - rise)
    }
    ctx.globalAlpha = 1
    ctx.textBaseline = 'alphabetic'
  }

  function checkMissedNotes() {
    for (const pb of practiceBars) {
      if (!pb.graded && pb.iv.startMs + GRADE_TOLERANCE_MS < practiceMs) {
        pb.graded = true
        pb.grade = 'miss'
        gradeBadges.push({
          text: GRADE_TEXT.miss,
          color: GRADE_COLOR.miss,
          y: pitchY(pb.iv.note),
          startT: performance.now(),
        })
      }
    }
  }

  // ── Main drawing ─────────────────────────────────────────────────────────────

  function drawBackground() {
    ctx.fillStyle = '#0f1014'
    ctx.fillRect(0, 0, W, H)

    // Treble staff zone — subtle purple tint (right hand)
    const trebleTop = idxY(TREBLE_TOP_IDX) - wKeyH
    const trebleBot = idxY(TREBLE_BOT_IDX) + wKeyH
    ctx.fillStyle = 'rgba(123,95,240,0.07)'
    ctx.fillRect(LEFT_MARGIN, trebleTop, W - LEFT_MARGIN, trebleBot - trebleTop)

    // Bass staff zone — subtle orange tint (left hand)
    const bassTop = idxY(BASS_TOP_IDX) - wKeyH
    const bassBot = idxY(BASS_BOT_IDX) + wKeyH
    ctx.fillStyle = 'rgba(240,138,91,0.07)'
    ctx.fillRect(LEFT_MARGIN, bassTop, W - LEFT_MARGIN, bassBot - bassTop)
  }

  function drawHandSeparator() {
    const c4y = Math.round(pitchY(60)) + 0.5

    // Gradient band filling the gap between the two staves
    const bandTop = idxY(TREBLE_BOT_IDX) - wKeyH * 0.4
    const bandBot = idxY(BASS_TOP_IDX)   + wKeyH * 0.4
    const grad = ctx.createLinearGradient(0, bandBot, 0, bandTop)
    grad.addColorStop(0, 'rgba(240,138,91,0.10)')
    grad.addColorStop(1, 'rgba(123,95,240,0.10)')
    ctx.fillStyle = grad
    ctx.fillRect(LEFT_MARGIN, bandTop, W - LEFT_MARGIN, bandBot - bandTop)

    // Dashed middle-C line
    ctx.save()
    ctx.strokeStyle = 'rgba(255,255,255,0.18)'
    ctx.lineWidth = 1
    ctx.setLineDash([6, 5])
    ctx.beginPath()
    ctx.moveTo(LEFT_MARGIN, c4y)
    ctx.lineTo(W, c4y)
    ctx.stroke()
    ctx.setLineDash([])
    ctx.restore()

    // "C4" label on the left margin
    const fs = Math.max(Math.round(wKeyH * 0.75), 7)
    ctx.fillStyle = 'rgba(255,255,255,0.22)'
    ctx.font = `bold ${fs}px sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('C4', LEFT_MARGIN / 2, c4y)
    ctx.textBaseline = 'alphabetic'
  }

  function drawStaves() {
    ctx.strokeStyle = 'rgba(255,255,255,0.07)'
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
    ctx.textAlign = 'left'
    ctx.textBaseline = 'bottom'
    ctx.font = `bold ${fs}px sans-serif`
    ctx.fillStyle = 'rgba(185,154,244,0.45)'
    ctx.fillText('RIGHT HAND', LEFT_MARGIN, idxY(TREBLE_TOP_IDX) - wKeyH - 2)
    ctx.fillStyle = 'rgba(240,138,91,0.45)'
    ctx.fillText('LEFT HAND',  LEFT_MARGIN, idxY(BASS_TOP_IDX)   - wKeyH - 2)
    ctx.textBaseline = 'alphabetic'
  }

  function drawClefs() {
    ctx.fillStyle = 'rgba(255,255,255,0.28)'
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
    ctx.save()
    ctx.strokeStyle = 'rgba(255, 210, 50, 0.85)'
    ctx.lineWidth = 2
    ctx.shadowColor = '#FFD700'
    ctx.shadowBlur = 16
    ctx.beginPath(); ctx.moveTo(nowX, 0); ctx.lineTo(nowX, H); ctx.stroke()
    ctx.restore()

    // Glowing circles on the middle line of each staff (B4=71 and D3=50)
    for (const midi of [71, 50]) {
      ctx.save()
      ctx.fillStyle = 'rgba(255, 230, 80, 0.95)'
      ctx.shadowColor = '#FFD700'
      ctx.shadowBlur = 10
      ctx.beginPath()
      ctx.arc(nowX, pitchY(midi), Math.max(wKeyH * 0.6, 3.5), 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()
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

      // Note name label (right-aligned, just inside the right edge of the bar)
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
    drawHandSeparator()
    drawStaves()
    drawClefs()
    if (practiceActive) {
      drawPracticeBars()
      drawJudgmentLine()
      drawGradeBadges()
    } else {
      drawBars()
      drawNowLine()
    }
  }

  function loop() {
    const now = performance.now()
    const dt = Math.min((now - lastT) / 1000, 0.1)
    lastT = now

    if (!practiceActive) {
      totalScrolled += LIVE_SCROLL_PX_PER_SEC * speedMultiplier * dt
      for (let i = bars.length - 1; i >= 0; i--) {
        if (barScreenX(bars[i]).right < LEFT_MARGIN) bars.splice(i, 1)
      }
    } else {
      checkMissedNotes()
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

    enablePractice(intervals: NoteInterval[]) {
      practiceBars = intervals.map(iv => ({ iv, graded: false }))
      gradeBadges = []
      practiceMs = 0
      practiceActive = true
    },

    disablePractice() {
      practiceActive = false
      practiceBars = []
      gradeBadges = []
    },

    setPracticeTime(ms: number) {
      practiceMs = ms
    },

    showGrade(note: number, grade: PracticeGrade) {
      // Mark the closest ungraded bar for this note
      let closest: PracticeBar | null = null
      let bestDelta = Infinity
      for (const pb of practiceBars) {
        if (pb.graded || pb.iv.note !== note) continue
        const d = Math.abs(pb.iv.startMs - practiceMs)
        if (d < bestDelta) { bestDelta = d; closest = pb }
      }
      if (closest) {
        closest.graded = true
        closest.grade = grade
      }
      gradeBadges.push({
        text:   GRADE_TEXT[grade],
        color:  GRADE_COLOR[grade],
        y:      pitchY(note),
        startT: performance.now(),
      })
    },

    setLeadTime(seconds: number) {
      leadTimeSec = Math.max(1, Math.min(seconds, 10))
      computeLayout()
    },

    getLeadTime() {
      return leadTimeSec
    },

    setSpeed(multiplier: number) {
      speedMultiplier = Number.isFinite(multiplier) && multiplier > 0 ? multiplier : 1
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
