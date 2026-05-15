/**
 * Staff-based note waterfall — Synthesia style.
 *
 * Orchestration only: state, RAF loop, public API.
 * Pure layout math lives in waterfall-layout.ts.
 * Drawing helpers are stateless functions that accept layout + data.
 */

import { noteColor } from './note-colors'
import type { NoteInterval } from './recording-types'
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
}

interface GradeBadge {
  text: string
  color: string
  y: number
  startT: number
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
  noteOn(note: number, velocity: number): void
  noteOff(note: number): void
  enablePractice(intervals: NoteInterval[]): void
  disablePractice(): void
  setPracticeTime(ms: number): void
  showGrade(note: number, grade: PracticeGrade): void
  setLeadTime(seconds: number): void
  getLeadTime(): number
  setSpeed(multiplier: number): void
  setBpm(bpm: number | null): void
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
  let practiceBars: PracticeBar[] = []
  let practiceMs = 0
  let gradeBadges: GradeBadge[] = []
  let currentBpm: number | null = null

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
    for (const pb of practiceBars) {
      if (!pb.graded && pb.iv.startMs + GRADE_TOLERANCE_MS < practiceMs) {
        pb.graded = true
        pb.grade = 'miss'
        gradeBadges.push({
          text:   GRADE_TEXT.miss,
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
    ctx.fillText('RIGHT HAND', LEFT_MARGIN, idxY(TREBLE_TOP_IDX, layout) - layout.wKeyH - 2)
    ctx.fillStyle = 'rgba(240,138,91,0.45)'
    ctx.fillText('LEFT HAND',  LEFT_MARGIN, idxY(BASS_TOP_IDX, layout)   - layout.wKeyH - 2)
    ctx.textBaseline = 'alphabetic'
  }

  function drawClefs() {
    ctx.fillStyle = 'rgba(255,255,255,0.28)'
    ctx.textAlign = 'center'
    const g4y = pitchY(67, layout)
    ctx.font = `${Math.round(layout.wKeyH * 9)}px serif`
    ctx.textBaseline = 'bottom'
    ctx.fillText('𝄞', LEFT_MARGIN / 2, g4y + layout.wKeyH * 4.2)
    const f3y = pitchY(53, layout)
    ctx.font = `${Math.round(layout.wKeyH * 4.5)}px serif`
    ctx.textBaseline = 'middle'
    ctx.fillText('𝄢', LEFT_MARGIN / 2, f3y - layout.wKeyH * 0.5)
    ctx.textBaseline = 'alphabetic'
  }

  // Returns 0 (bottom/press) → 1 (top/apex) → 0 (bottom/press) per beat.
  function beatLift(): number {
    if (!practiceActive || !currentBpm || currentBpm <= 0) return 0
    const beatMs  = 60000 / currentBpm
    const phase   = (((practiceMs % beatMs) + beatMs) % beatMs) / beatMs  // 0–1
    const t       = phase * 2 - 1   // -1 → 1
    return 1 - t * t                 // parabola: 0 at edges, 1 at apex
  }

  function drawGoldenLine() {
    const x    = layout.nowX
    const lift = beatLift()
    const maxH = layout.wKeyH * 2.8

    // Golden line
    ctx.save()
    ctx.strokeStyle = 'rgba(255, 210, 50, 0.9)'
    ctx.lineWidth = 2
    ctx.shadowColor = '#FFD700'
    ctx.shadowBlur = 16
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke()
    ctx.restore()

    for (const midi of [71, 50]) {
      const baseY  = pitchY(midi, layout)
      const ballY  = baseY - lift * maxH
      const r      = Math.max(layout.wKeyH * 0.6, 3.5)

      // Shadow on the golden line — grows as ball rises
      if (lift > 0.04) {
        const shadowA = lift * 0.35
        const shadowW = r * (1 + lift * 0.9)
        ctx.save()
        ctx.fillStyle = `rgba(0,0,0,${shadowA})`
        ctx.beginPath()
        ctx.ellipse(x, baseY, shadowW, r * 0.28, 0, 0, Math.PI * 2)
        ctx.fill()
        ctx.restore()
      }

      // Ball: squished at bottom (wider+shorter), round at apex
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

      if (cw > 20 && bh > 7) {
        const fs = Math.max(Math.min(Math.round(bh * 0.70), 12), 9)
        ctx.font = `bold ${fs}px sans-serif`
        ctx.fillStyle = '#ffffff'
        ctx.textAlign = 'right'
        ctx.textBaseline = 'middle'
        const rx = Math.min(cx + cw - 4, layout.nowX - 3)
        if (rx > cx + 6) ctx.fillText(bar.name, rx, cy + bh / 2)
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

      const bh = barH(pb.iv.note, layout)
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
      ctx.globalAlpha = 1

      if (cw > 10 && bh > 7) {
        const finger = pb.iv.finger
        if (finger) {
          // Finger number in a small circle
          const r = Math.max(Math.min(bh * 0.44, 10), 5)
          const fx = Math.min(cx + cw / 2, layout.judgeX - r - 2)
          const fy = cy + bh / 2
          if (fx - r > cx) {
            ctx.beginPath()
            ctx.arc(fx, fy, r, 0, Math.PI * 2)
            ctx.fillStyle = 'rgba(0,0,0,0.45)'
            ctx.fill()
            const fs = Math.max(Math.round(r * 1.3), 7)
            ctx.font = `bold ${fs}px sans-serif`
            ctx.fillStyle = '#ffffff'
            ctx.textAlign = 'center'
            ctx.textBaseline = 'middle'
            ctx.fillText(String(finger), fx, fy)
          }
        } else if (cw > 18) {
          const fs = Math.max(Math.min(Math.round(bh * 0.70), 12), 9)
          ctx.font = `bold ${fs}px sans-serif`
          ctx.fillStyle = '#ffffff'
          ctx.textAlign = 'center'
          ctx.textBaseline = 'middle'
          ctx.fillText(NOTE_NAMES[pb.iv.note % 12], cx + Math.min(cw / 2, 18), cy + bh / 2)
        }
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

      ctx.globalAlpha = 1
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
      drawGoldenLine()
      drawGradeBadges()
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
      let closest: PracticeBar | null = null
      let bestDelta = Infinity
      for (const pb of practiceBars) {
        if (pb.graded || pb.iv.note !== note) continue
        const d = Math.abs(pb.iv.startMs - practiceMs)
        if (d < bestDelta) { bestDelta = d; closest = pb }
      }
      if (closest) { closest.graded = true; closest.grade = grade }
      gradeBadges.push({
        text:   GRADE_TEXT[grade],
        color:  GRADE_COLOR[grade],
        y:      pitchY(note, layout),
        startT: performance.now(),
      })
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

    setBpm(bpm: number | null) {
      currentBpm = bpm && bpm > 0 ? bpm : null
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
