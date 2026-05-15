/**
 * Staff-based note waterfall — Synthesia style.
 *
 * Orchestration only: state, RAF loop, public API.
 * Pure layout math lives in waterfall-layout.ts.
 * Drawing helpers are stateless functions that accept layout + data.
 */

import { noteColor } from './note-colors'
import type { NoteInterval, Hairpin, Dynamic } from './recording-types'
import { GRADE_TOLERANCE_MS } from './recording-types'
import { FINGER_COLORS, fingerColor } from './finger-colors'
import {
  BLACK_PC, NOTE_NAMES, HAND_SPLIT,
  TREBLE_LINES, BASS_LINES,
  TREBLE_BOT_IDX, TREBLE_TOP_IDX, BASS_BOT_IDX, BASS_TOP_IDX,
  LEFT_MARGIN, LIVE_SCROLL_PX_PER_SEC,
  DEFAULT_LEAD_TIME_SEC,
  type WaterfallLayout,
  computeLayout, pitchY, idxY, barH, ledgerSlots,
} from './waterfall-layout'

// Re-export constants that external modules already depend on
export { DEFAULT_LEAD_TIME_SEC, LINE_X_RATIO } from './waterfall-layout'

// ── Live-mode bar ─────────────────────────────────────────────────────────────

interface Bar {
  note: number
  pressScrolled: number
  releaseScrolled: number  // -1 while active
  color: string
  name: string
}

// ── Practice-mode types ───────────────────────────────────────────────────────

type PracticeGrade = 'perfect' | 'good' | 'ok' | 'miss' | 'wrong'

interface PracticeBar {
  iv: NoteInterval
  grade?: PracticeGrade
  graded: boolean
  holding: boolean       // student is currently holding this note
  holdFraction?: number  // 0–1, set on release; < 1 means released early
}

interface GradeBadge {
  text: string
  color: string
  y: number
  startT: number
}

interface ChordBadge {
  hit: number
  total: number
  x: number
  y: number
  startT: number
}

const GRADE_FADE_MS  = 1300
const CHORD_FADE_MS  = 1800
const MISS_WINDOW_MS = 600  // how late before we mark a note as missed
const TIP_WINDOW_MS  = 2000 // show tip this many ms before the note

let gradeText: Record<PracticeGrade, string> = {
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
  noteOn(note: number, velocity: number): void
  noteOff(note: number): void
  enablePractice(intervals: NoteInterval[], grading?: boolean): void
  disablePractice(): void
  setPracticeTime(ms: number): void
  showGrade(note: number, grade: PracticeGrade): void
  showChordResult(hit: number, total: number, note: number): void
  noteHeld(note: number): void
  noteReleased(note: number, holdFraction: number): void
  setGradeLabels(labels: Partial<Record<PracticeGrade, string>>): void
  setHairpins(hairpins: Hairpin[]): void
  setLeadTime(seconds: number): void
  getLeadTime(): number
  setSpeed(multiplier: number): void
  setBpm(bpm: number | null): void
  setHandLabels(right: string, left: string): void
  resize(w: number, h: number): void
  destroy(): void
}

// ── Factory ───────────────────────────────────────────────────────────────────

export function createWaterfallCanvas(canvas: HTMLCanvasElement): WaterfallCanvas {
  const ctx = canvas.getContext('2d')!
  let W = canvas.width
  let H = canvas.height
  let rafId = 0
  let lastT = performance.now()
  let totalScrolled = 0
  let speedMultiplier = 1
  let leadTimeSec = DEFAULT_LEAD_TIME_SEC
  let layout: WaterfallLayout = computeLayout(W, H, leadTimeSec)

  const bars: Bar[] = []
  const activeNotes = new Map<number, Bar>()

  let practiceActive = false
  let gradingEnabled = false
  let practiceBars: PracticeBar[] = []
  let practiceMs = 0
  let gradeBadges: GradeBadge[] = []
  let chordBadges: ChordBadge[] = []
  let hairpins: Hairpin[] = []
  let handLabelRight = 'RIGHT HAND'
  let handLabelLeft  = 'LEFT HAND'

  function refreshLayout() {
    layout = computeLayout(W, H, leadTimeSec)
  }

  // ── Live-mode helpers ─────────────────────────────────────────────────────

  function barScreenX(bar: Bar): { left: number; right: number } {
    const left  = layout.nowX - (totalScrolled - bar.pressScrolled)
    const right = bar.releaseScrolled < 0
      ? layout.nowX
      : layout.nowX - (totalScrolled - bar.releaseScrolled)
    return { left, right }
  }

  // ── Practice-mode helpers ─────────────────────────────────────────────────

  function msToX(ms: number): number {
    return layout.judgeX + (ms - practiceMs) * (layout.practiceScrollPxPerSec / 1000)
  }

  function checkMissedNotes() {
    if (!gradingEnabled) return
    for (const pb of practiceBars) {
      if (!pb.graded && pb.iv.startMs + MISS_WINDOW_MS < practiceMs) {
        pb.graded = true
        pb.grade = 'miss'
        gradeBadges.push({
          text:   gradeText.miss,
          color:  GRADE_COLOR.miss,
          y:      pitchY(pb.iv.note, layout),
          startT: performance.now(),
        })
      }
    }
  }

  // ── Draw helpers ──────────────────────────────────────────────────────────

  function drawLedgerLines(midi: number, barX: number, bw: number) {
    const slots = ledgerSlots(midi)
    if (slots.length === 0) return
    const lw = Math.min(bw + 8, layout.wKeyH * 2.2)
    const lx = barX + (bw - lw) / 2
    ctx.strokeStyle = 'rgba(255,255,255,0.22)'
    ctx.lineWidth = 1
    for (const slot of slots) {
      const y = Math.round(idxY(slot, layout)) + 0.5
      ctx.beginPath(); ctx.moveTo(lx, y); ctx.lineTo(lx + lw, y); ctx.stroke()
    }
  }

  function drawBackground() {
    ctx.fillStyle = '#0f1014'
    ctx.fillRect(0, 0, W, H)

    const trebleTop = idxY(TREBLE_TOP_IDX, layout) - layout.wKeyH
    const trebleBot = idxY(TREBLE_BOT_IDX, layout) + layout.wKeyH
    ctx.fillStyle = 'rgba(123,95,240,0.07)'
    ctx.fillRect(LEFT_MARGIN, trebleTop, W - LEFT_MARGIN, trebleBot - trebleTop)

    const bassTop = idxY(BASS_TOP_IDX, layout) - layout.wKeyH
    const bassBot = idxY(BASS_BOT_IDX, layout) + layout.wKeyH
    ctx.fillStyle = 'rgba(240,138,91,0.07)'
    ctx.fillRect(LEFT_MARGIN, bassTop, W - LEFT_MARGIN, bassBot - bassTop)
  }

  function drawHandSeparator() {
    const c4y = Math.round(pitchY(60, layout)) + 0.5
    const bandTop = idxY(TREBLE_BOT_IDX, layout) - layout.wKeyH * 0.4
    const bandBot = idxY(BASS_TOP_IDX,   layout) + layout.wKeyH * 0.4
    const grad = ctx.createLinearGradient(0, bandBot, 0, bandTop)
    grad.addColorStop(0, 'rgba(240,138,91,0.10)')
    grad.addColorStop(1, 'rgba(123,95,240,0.10)')
    ctx.fillStyle = grad
    ctx.fillRect(LEFT_MARGIN, bandTop, W - LEFT_MARGIN, bandBot - bandTop)

    ctx.save()
    ctx.strokeStyle = 'rgba(255,255,255,0.18)'
    ctx.lineWidth = 1
    ctx.setLineDash([6, 5])
    ctx.beginPath()
    ctx.moveTo(LEFT_MARGIN, c4y); ctx.lineTo(W, c4y)
    ctx.stroke()
    ctx.setLineDash([])
    ctx.restore()

    const fs = Math.max(Math.round(layout.wKeyH * 0.75), 7)
    ctx.fillStyle = 'rgba(255,255,255,0.22)'
    ctx.font = `bold ${fs}px sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('C4', LEFT_MARGIN / 2, c4y)
    ctx.textBaseline = 'alphabetic'

    // Hand zone labels in the gap
    const gapCenterY = (idxY(TREBLE_BOT_IDX, layout) + idxY(BASS_TOP_IDX, layout)) / 2
    const labelFs = Math.max(Math.round(layout.wKeyH * 0.85), 7)
    ctx.font = `bold ${labelFs}px sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = 'rgba(185,154,244,0.45)'
    ctx.fillText('MD', LEFT_MARGIN / 2, gapCenterY - layout.handGapPx * 0.25)
    ctx.fillStyle = 'rgba(240,138,91,0.45)'
    ctx.fillText('ME', LEFT_MARGIN / 2, gapCenterY + layout.handGapPx * 0.25)
  }

  function drawStaves() {
    ctx.strokeStyle = 'rgba(255,255,255,0.07)'
    ctx.lineWidth = 1
    for (const n of TREBLE_LINES) {
      const y = Math.round(pitchY(n, layout)) + 0.5
      ctx.beginPath(); ctx.moveTo(LEFT_MARGIN, y); ctx.lineTo(W, y); ctx.stroke()
    }
    for (const n of BASS_LINES) {
      const y = Math.round(pitchY(n, layout)) + 0.5
      ctx.beginPath(); ctx.moveTo(LEFT_MARGIN, y); ctx.lineTo(W, y); ctx.stroke()
    }
    const fs = Math.max(Math.round(layout.wKeyH * 0.9), 8)
    ctx.textAlign = 'left'
    ctx.textBaseline = 'bottom'
    ctx.font = `bold ${fs}px sans-serif`
    ctx.fillStyle = 'rgba(185,154,244,0.45)'
    ctx.fillText(handLabelRight, LEFT_MARGIN, idxY(TREBLE_TOP_IDX, layout) - layout.wKeyH - 2)
    ctx.fillStyle = 'rgba(240,138,91,0.45)'
    ctx.fillText(handLabelLeft,  LEFT_MARGIN, idxY(BASS_TOP_IDX, layout)   - layout.wKeyH - 2)
    ctx.textBaseline = 'alphabetic'
  }

  function drawClefs() {
    ctx.save()
    // Clip to the margin strip so clef glyphs never bleed into the note area
    ctx.beginPath()
    ctx.rect(0, 0, LEFT_MARGIN - 2, H)
    ctx.clip()

    ctx.fillStyle = 'rgba(255,255,255,0.28)'
    ctx.textAlign = 'center'
    const cx = LEFT_MARGIN * 0.46   // slightly left of center to add breathing room

    const g4y = pitchY(67, layout)
    ctx.font = `${Math.round(layout.wKeyH * 7)}px serif`
    ctx.textBaseline = 'bottom'
    ctx.fillText('𝄞', cx, g4y + layout.wKeyH * 3.5)

    const f3y = pitchY(53, layout)
    ctx.font = `${Math.round(layout.wKeyH * 4)}px serif`
    ctx.textBaseline = 'middle'
    ctx.fillText('𝄢', cx, f3y - layout.wKeyH * 0.3)

    ctx.restore()
    ctx.textBaseline = 'alphabetic'
  }

  function drawGoldenLine() {
    const x = layout.nowX
    const r = Math.max(layout.wKeyH * 0.6, 3.5)

    // Golden line
    ctx.save()
    ctx.strokeStyle = 'rgba(255, 210, 50, 0.9)'
    ctx.lineWidth = 2
    ctx.shadowColor = '#FFD700'
    ctx.shadowBlur = 16
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke()
    ctx.restore()

    if (!practiceActive || practiceBars.length === 0) {
      for (const midi of [71, 50]) {
        const by = pitchY(midi, layout)
        ctx.save()
        ctx.fillStyle = 'rgba(255, 230, 80, 0.95)'
        ctx.shadowColor = '#FFD700'
        ctx.shadowBlur = 8
        ctx.beginPath(); ctx.arc(x, by, r, 0, Math.PI * 2); ctx.fill()
        ctx.restore()
      }
      return
    }

    const leadMs = DEFAULT_LEAD_TIME_SEC * 1000

    for (const hand of ['right', 'left'] as const) {
      const notes = practiceBars
        .filter(pb => pb.iv.hand
          ? pb.iv.hand === hand
          : hand === 'right' ? pb.iv.note >= HAND_SPLIT : pb.iv.note < HAND_SPLIT)
        .sort((a, b) => a.iv.startMs - b.iv.startMs)
      if (notes.length === 0) continue

      let prevIdx = -1
      let nextIdx = -1
      for (let i = 0; i < notes.length; i++) {
        if (notes[i].iv.startMs <= practiceMs) prevIdx = i
        else if (nextIdx === -1) nextIdx = i
      }

      let baseY: number
      let lift = 0
      let arcH: number

      if (prevIdx === -1) {
        // ── Initial fall from top to first note ──────────────────────────────
        // practiceMs starts at -leadMs; first note is at notes[0].iv.startMs
        const firstNoteMs = notes[0].iv.startMs
        const fallDuration = firstNoteMs + leadMs          // total fall window
        const elapsed     = practiceMs + leadMs            // how much has elapsed
        const fallPhase   = fallDuration > 0
          ? Math.max(0, Math.min(1, elapsed / fallDuration))
          : 1
        const eased = fallPhase * fallPhase                // gravity: slow→fast

        baseY = pitchY(notes[0].iv.note, layout)
        arcH  = Math.max(0, baseY - r * 2)                // full fall height
        lift  = 1 - eased                                  // 1=top, 0=landed
      } else if (nextIdx >= 0) {
        // ── Parabolic bounce between consecutive notes ────────────────────────
        const prev = notes[prevIdx]
        const next = notes[nextIdx]
        const span = next.iv.startMs - prev.iv.startMs
        const phase = span > 0
          ? Math.max(0, Math.min(1, (practiceMs - prev.iv.startMs) / span))
          : 0
        baseY = pitchY(prev.iv.note, layout) +
                (pitchY(next.iv.note, layout) - pitchY(prev.iv.note, layout)) * phase
        arcH  = layout.wKeyH * 3.0
        lift  = 4 * phase * (1 - phase)
      } else {
        // ── After last note ───────────────────────────────────────────────────
        baseY = pitchY(notes[prevIdx].iv.note, layout)
        arcH  = 0
        lift  = 0
      }

      const ballY = baseY - lift * arcH

      // Shadow under ball on the golden line — grows as ball rises
      if (lift > 0.04) {
        const shadowW = r * (1 + lift * 0.9)
        ctx.save()
        ctx.fillStyle = `rgba(0,0,0,${lift * 0.35})`
        ctx.beginPath()
        ctx.ellipse(x, baseY, shadowW, r * 0.28, 0, 0, Math.PI * 2)
        ctx.fill()
        ctx.restore()
      }

      // Ball: squished at impact (lift≈0), round at apex (lift≈1)
      const rx = r * (1 + (1 - lift) * 0.30)
      const ry = r * (1 - (1 - lift) * 0.22)
      ctx.save()
      ctx.fillStyle = 'rgba(255, 230, 80, 0.95)'
      ctx.shadowColor = '#FFD700'
      ctx.shadowBlur = 8 + lift * 8
      ctx.beginPath()
      ctx.ellipse(x, ballY, rx, ry, 0, 0, Math.PI * 2)
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

      drawLedgerLines(bar.note, cx, cw)

      const bh = barH(bar.note, layout)
      const cy = pitchY(bar.note, layout) - bh / 2
      ctx.globalAlpha = bar.releaseScrolled < 0 ? 0.90 : 0.72
      ctx.fillStyle = bar.color
      ctx.beginPath()
      ctx.roundRect(cx, cy, cw, bh, Math.min(bh / 2, 6))
      ctx.fill()
      ctx.globalAlpha = 1

      if (cw > 14 && bh > 7) {
        const fs = Math.max(Math.min(Math.round(bh * 0.88), 20), 10)
        ctx.font = `bold ${fs}px sans-serif`
        ctx.fillStyle = '#ffffff'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        const mx = cx + Math.min(cw / 2, layout.nowX - cx - 4)
        if (mx > cx + 2) ctx.fillText(bar.name, mx, cy + bh / 2)
      }
    }
    ctx.globalAlpha = 1
    ctx.textBaseline = 'alphabetic'
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

      const bh = (pb.iv.grace ? 0.62 : 1) * barH(pb.iv.note, layout)
      const cy = pitchY(pb.iv.note, layout) - bh / 2

      // Priority: grade color > finger color > note color
      let color = fingerColor(pb.iv.finger) ?? noteColor(pb.iv.note)
      let alpha = 0.85
      if (pb.graded && pb.grade) {
        color = GRADE_COLOR[pb.grade]
        alpha = left < layout.judgeX ? 0.45 : 0.85
      } else if (right < layout.judgeX) {
        alpha = 0.30
      }

      ctx.globalAlpha = alpha
      ctx.fillStyle = color
      ctx.beginPath()
      ctx.roundRect(cx, cy, cw, bh, Math.min(bh / 2, 6))
      ctx.fill()
      if (pb.iv.grace) {
        ctx.save()
        ctx.globalAlpha = alpha * 0.6
        ctx.strokeStyle = 'rgba(255,255,255,0.55)'
        ctx.lineWidth = 1
        ctx.setLineDash([3, 3])
        ctx.beginPath()
        ctx.roundRect(cx, cy, cw, bh, Math.min(bh / 2, 6))
        ctx.stroke()
        ctx.setLineDash([])
        ctx.restore()
      }
      ctx.globalAlpha = 1

      if (cw > 14 && bh > 7) {
        const noteName = NOTE_NAMES[pb.iv.note % 12]
        const noteFs = Math.max(Math.min(Math.round(bh * 0.88), 20), 10)
        ctx.font = `bold ${noteFs}px sans-serif`
        ctx.fillStyle = '#ffffff'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText(noteName, cx + cw / 2, cy + bh / 2)
      }

      // Prescribed dynamic label
      const dyn = pb.iv.dynamic
      if (dyn && cw > 16 && bh > 6) {
        const dynFs = Math.max(Math.min(Math.round(bh * 0.55), 9), 6)
        ctx.font = `italic bold ${dynFs}px serif`
        ctx.fillStyle = 'rgba(255,255,255,0.55)'
        ctx.textAlign = 'right'
        ctx.textBaseline = 'top'
        const dynX = Math.min(cx + cw - 3, W - 2)
        ctx.fillText(dyn, dynX, cy + 1)
      }

      // ── Hold feedback ─────────────────────────────────────────────────────
      const barLeft  = Math.max(left, LEFT_MARGIN)
      const barRight = Math.min(right, W)
      const barW     = barRight - barLeft

      if (pb.holding && barW > 0) {
        // Bright progress fill: from bar start up to current practiceMs
        const fillRight = Math.min(msToX(practiceMs), barRight)
        const fillW = fillRight - barLeft
        if (fillW > 0) {
          ctx.globalAlpha = 0.55
          ctx.fillStyle = 'rgba(255,255,255,0.85)'
          ctx.fillRect(barLeft, cy, fillW, bh)
          ctx.globalAlpha = 1
        }
      } else if (!pb.holding && pb.holdFraction != null && pb.holdFraction < 0.50) {
        // Grey remainder: student released early
        const releaseMs = pb.iv.startMs + (pb.iv.endMs - pb.iv.startMs) * pb.holdFraction
        const greyLeft  = Math.max(msToX(releaseMs), barLeft)
        const greyRight = barRight
        if (greyRight > greyLeft) {
          ctx.globalAlpha = 0.60
          ctx.fillStyle = 'rgba(90,90,90,0.80)'
          ctx.fillRect(greyLeft, cy, greyRight - greyLeft, bh)
          ctx.globalAlpha = 1
        }
      }

      // Articulation indicator
      const art = pb.iv.articulation
      if (art && bh > 6) {
        const dotR = Math.max(Math.min(bh * 0.22, 4), 2)
        const artX = cx + Math.min(cw / 2, 12)
        const artY = cy - dotR - 2
        ctx.textBaseline = 'middle'
        if (art === 'staccato') {
          ctx.beginPath()
          ctx.arc(artX, artY, dotR, 0, Math.PI * 2)
          ctx.fillStyle = 'rgba(255,255,255,0.65)'
          ctx.fill()
        } else if (art === 'accent') {
          const afs = Math.max(Math.round(bh * 0.7), 7)
          ctx.font = `bold ${afs}px sans-serif`
          ctx.fillStyle = 'rgba(255,255,255,0.65)'
          ctx.textAlign = 'left'
          ctx.fillText('>', cx + 1, cy + bh / 2)
        } else if (art === 'tenuto') {
          ctx.strokeStyle = 'rgba(255,255,255,0.55)'
          ctx.lineWidth = 1.5
          const tw = Math.min(cw * 0.5, 10)
          ctx.beginPath()
          ctx.moveTo(artX - tw / 2, artY)
          ctx.lineTo(artX + tw / 2, artY)
          ctx.stroke()
        }
      }

      // Fermata symbol — 𝄐 drawn above the bar (T5)
      if (pb.iv.fermata) {
        const ferX = cx + Math.min(cw / 2, 20)
        const ferFs = Math.max(Math.round(bh * 2.2), 12)
        ctx.save()
        ctx.globalAlpha = 0.80
        ctx.fillStyle = 'rgba(255,255,200,0.90)'
        ctx.font = `${ferFs}px serif`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'bottom'
        ctx.fillText('\uD834\uDD10', ferX, cy - 1) // 𝄐 U+1D110
        ctx.restore()
        ctx.textBaseline = 'alphabetic'
      }

      ctx.globalAlpha = 1
    }
    ctx.globalAlpha = 1
    ctx.textBaseline = 'alphabetic'
  }

  function dynOrder(d: Dynamic): number {
    const O: Dynamic[] = ['pp', 'p', 'mp', 'mf', 'f', 'ff']
    return O.indexOf(d)
  }

  function drawHairpins() {
    if (hairpins.length === 0) return
    const y = idxY(BASS_BOT_IDX, layout) + layout.wKeyH * 2.2
    const hH = layout.wKeyH * 1.0

    ctx.save()
    ctx.lineCap = 'round'
    ctx.lineWidth = 1.5

    for (const h of hairpins) {
      const x1 = msToX(h.startMs)
      const x2 = msToX(h.endMs)
      if (x2 < LEFT_MARGIN || x1 > W) continue

      const cx1 = Math.max(x1, LEFT_MARGIN)
      const cx2 = Math.min(x2, W)
      if (cx2 <= cx1) continue

      const isCrescendo = dynOrder(h.from) < dynOrder(h.to)
      // Clamp open-end spread proportionally if start/end are clipped
      const totalSpan = x2 - x1
      const spreadFrac = totalSpan > 0 ? (cx2 - cx1) / totalSpan : 0
      const spread = (hH / 2) * (isCrescendo ? spreadFrac : 1)
      const baseSpread = (hH / 2) * (isCrescendo ? 0 : spreadFrac)

      ctx.strokeStyle = 'rgba(255,255,255,0.40)'

      if (isCrescendo) {
        // < closed on left, open on right
        ctx.beginPath()
        ctx.moveTo(cx1, y)
        ctx.lineTo(cx2, y - spread)
        ctx.stroke()
        ctx.beginPath()
        ctx.moveTo(cx1, y)
        ctx.lineTo(cx2, y + spread)
        ctx.stroke()
      } else {
        // > open on left, closed on right
        ctx.beginPath()
        ctx.moveTo(cx1, y - baseSpread)
        ctx.lineTo(cx2, y)
        ctx.stroke()
        ctx.beginPath()
        ctx.moveTo(cx1, y + baseSpread)
        ctx.lineTo(cx2, y)
        ctx.stroke()
      }
    }
    ctx.restore()
  }

  /**
   * Draw slur arcs above bars that have slur:'start'…'end' spans (E4).
   * Pairs each slur-start bar with the nearest subsequent slur-end bar (same hand if possible)
   * and draws a quadratic Bézier arc.
   */
  function drawSlurs() {
    if (practiceBars.length === 0) return

    ctx.save()
    ctx.strokeStyle = 'rgba(180,220,255,0.55)'
    ctx.lineWidth = 1.5
    ctx.lineCap = 'round'
    ctx.setLineDash([])

    // Collect start bars
    const starts: { idx: number; x: number; y: number }[] = []
    for (let i = 0; i < practiceBars.length; i++) {
      const pb = practiceBars[i]
      if (pb.iv.slur !== 'start') continue
      const x = msToX(pb.iv.startMs)
      const bh = barH(pb.iv.note, layout)
      const y = pitchY(pb.iv.note, layout) - bh / 2 - 4
      starts.push({ idx: i, x, y })
    }

    for (const s of starts) {
      // Find the nearest 'end' (or 'continue' at buffer end) after this start
      let endX = -1
      let endY = -1
      for (let j = s.idx + 1; j < practiceBars.length; j++) {
        const pb = practiceBars[j]
        if (pb.iv.slur === 'end' || pb.iv.slur === 'continue') {
          endX = msToX(pb.iv.startMs)
          const bh2 = barH(pb.iv.note, layout)
          endY = pitchY(pb.iv.note, layout) - bh2 / 2 - 4
          if (pb.iv.slur === 'end') break
        }
      }
      if (endX < 0 || endX <= s.x) continue
      if (endX < LEFT_MARGIN || s.x > W) continue

      const midX = (s.x + endX) / 2
      const midY = Math.min(s.y, endY) - Math.max(16, (endX - s.x) * 0.10)

      ctx.beginPath()
      ctx.moveTo(s.x, s.y)
      ctx.quadraticCurveTo(midX, midY, endX, endY)
      ctx.stroke()
    }
    ctx.restore()
  }

  function drawTips() {
    for (const pb of practiceBars) {
      const tip = pb.iv.tip ?? pb.iv.handPosition
      if (!tip || pb.graded) continue
      const timeToNote = pb.iv.startMs - practiceMs
      if (timeToNote <= 0 || timeToNote > TIP_WINDOW_MS) continue

      const x = msToX(pb.iv.startMs)
      if (x < LEFT_MARGIN || x > W) continue

      const bh = barH(pb.iv.note, layout)
      const cy = pitchY(pb.iv.note, layout) - bh / 2
      const fs = Math.max(Math.round(layout.wKeyH * 0.85), 9)
      ctx.font = `${fs}px sans-serif`
      const tw = ctx.measureText(tip).width
      const pad = 5
      const rx = Math.min(x + 4, W - tw - pad * 2 - 4)
      const ry = cy - fs - 8
      const alpha = Math.min(1, (TIP_WINDOW_MS - timeToNote) / (TIP_WINDOW_MS * 0.3) * 0.9)
      ctx.save()
      ctx.globalAlpha = alpha
      ctx.fillStyle = 'rgba(20,20,30,0.82)'
      ctx.beginPath()
      ctx.roundRect(rx - pad, ry - pad, tw + pad * 2, fs + pad * 2, 5)
      ctx.fill()
      ctx.fillStyle = 'rgba(255,230,120,0.95)'
      ctx.textAlign = 'left'
      ctx.textBaseline = 'top'
      ctx.fillText(tip, rx, ry)
      ctx.restore()
    }
    ctx.textBaseline = 'alphabetic'
  }

  function drawChordBadges() {
    const now = performance.now()
    ctx.textAlign = 'left'
    ctx.textBaseline = 'middle'
    for (let i = chordBadges.length - 1; i >= 0; i--) {
      const b = chordBadges[i]
      const elapsed = now - b.startT
      if (elapsed > CHORD_FADE_MS) { chordBadges.splice(i, 1); continue }
      const alpha = Math.max(0, 1 - elapsed / CHORD_FADE_MS)
      const rise  = (elapsed / CHORD_FADE_MS) * 28
      const pct = b.total > 0 ? b.hit / b.total : 0
      const color = pct === 1 ? '#ffd700' : pct >= 0.75 ? '#4ec080' : '#f0a830'
      const text = `♫ ${b.hit}/${b.total}`
      ctx.globalAlpha = alpha
      ctx.font = `bold ${Math.max(Math.round(layout.wKeyH * 1.0), 10)}px sans-serif`
      ctx.fillStyle = color
      ctx.fillText(text, b.x, b.y - rise)
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
      ctx.font = `bold ${Math.max(Math.round(layout.wKeyH * 1.2), 12)}px sans-serif`
      ctx.fillStyle = b.color
      ctx.fillText(b.text, layout.judgeX + 10, b.y - rise)
    }
    ctx.globalAlpha = 1
    ctx.textBaseline = 'alphabetic'
  }

  // ── Main loop ─────────────────────────────────────────────────────────────

  function draw() {
    drawBackground()
    drawHandSeparator()
    drawStaves()
    drawClefs()
    if (practiceActive) {
      drawPracticeBars()
      drawHairpins()
      drawSlurs()
      drawTips()
      drawGoldenLine()
      drawGradeBadges()
      drawChordBadges()
    } else {
      drawBars()
      drawGoldenLine()
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

  rafId = requestAnimationFrame(loop)

  // ── Public API ────────────────────────────────────────────────────────────

  return {
    noteOn(note: number, _velocity: number) {
      if (activeNotes.has(note)) return
      const bar: Bar = {
        note,
        pressScrolled:   totalScrolled,
        releaseScrolled: -1,
        color: noteColor(note),
        name:  NOTE_NAMES[note % 12],
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

    enablePractice(intervals: NoteInterval[], grading = false) {
      practiceBars = intervals.map(iv => ({ iv, graded: false, holding: false }))
      gradeBadges = []
      chordBadges = []
      practiceMs = 0
      practiceActive = true
      gradingEnabled = grading
    },

    disablePractice() {
      practiceActive = false
      practiceBars = []
      gradeBadges = []
      chordBadges = []
    },

    setPracticeTime(ms: number) {
      // Seeking backward — reset all grades so colors refresh
      if (ms < practiceMs - 500) {
        for (const pb of practiceBars) {
          pb.graded = false
          pb.grade = undefined
          pb.holding = false
          pb.holdFraction = undefined
        }
        gradeBadges = []
        chordBadges = []
      }
      practiceMs = ms
    },

    noteHeld(note: number) {
      // Find the soonest ungraded bar for this note near practiceMs and mark as held
      let closest: PracticeBar | null = null
      let bestDelta = Infinity
      for (const pb of practiceBars) {
        if (pb.iv.note !== note || pb.graded) continue
        const d = Math.abs(pb.iv.startMs - practiceMs)
        if (d < bestDelta) { bestDelta = d; closest = pb }
      }
      if (closest) closest.holding = true
    },

    noteReleased(note: number, holdFraction: number) {
      // Primary: bar was properly tracked via noteHeld
      for (const pb of practiceBars) {
        if (pb.iv.note === note && pb.holding) {
          pb.holding = false
          pb.holdFraction = holdFraction
          return
        }
      }
      // Fallback: note was pressed outside grading tolerance so noteHeld was
      // never called, but the Go side still computed a holdFraction.
      // Apply it to the closest bar so early-release grey still renders.
      let closest: PracticeBar | null = null
      let bestDelta = Infinity
      for (const pb of practiceBars) {
        if (pb.iv.note !== note) continue
        const d = Math.abs(pb.iv.startMs - practiceMs)
        if (d < bestDelta) { bestDelta = d; closest = pb }
      }
      if (closest) closest.holdFraction = holdFraction
    },

    showGrade(note: number, grade: PracticeGrade) {
      let closest: PracticeBar | null = null
      let bestDelta = Infinity
      for (const pb of practiceBars) {
        if (pb.graded || pb.iv.note !== note) continue
        const d = Math.abs(pb.iv.startMs - practiceMs)
        if (d < bestDelta) { bestDelta = d; closest = pb }
      }
      if (closest) { closest.graded = true; closest.grade = grade }
      gradeBadges.push({
        text:   gradeText[grade],
        color:  GRADE_COLOR[grade],
        y:      pitchY(note, layout),
        startT: performance.now(),
      })
    },

    showChordResult(hit: number, total: number, note: number) {
      if (total <= 1) return
      chordBadges.push({
        hit,
        total,
        x: layout.judgeX + 10,
        y: pitchY(note, layout) - layout.wKeyH * 2.5,
        startT: performance.now(),
      })
    },

    setHairpins(h: Hairpin[]) {
      hairpins = h
    },

    setGradeLabels(labels: Partial<Record<PracticeGrade, string>>) {
      gradeText = { ...gradeText, ...labels }
    },

    setLeadTime(seconds: number) {
      leadTimeSec = Math.max(1, Math.min(seconds, 10))
      refreshLayout()
    },

    getLeadTime() {
      return leadTimeSec
    },

    setSpeed(multiplier: number) {
      speedMultiplier = Number.isFinite(multiplier) && multiplier > 0 ? multiplier : 1
    },

    setBpm(_bpm: number | null) {
      // reserved for future use
    },

    setHandLabels(right: string, left: string) {
      handLabelRight = right || 'RIGHT HAND'
      handLabelLeft  = left  || 'LEFT HAND'
    },

    resize(w: number, h: number) {
      W = w; H = h
      canvas.width = w; canvas.height = h
      refreshLayout()
    },

    destroy() {
      cancelAnimationFrame(rafId)
    },
  }
}
