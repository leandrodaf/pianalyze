/**
 * Mini timeline canvas — compressed view of the entire recording.
 * Two horizontal tracks: right hand (top) and left hand (bottom).
 * A time ruler at the bottom shows adaptive time markers.
 *
 * The visible-window highlight mirrors the waterfall's visible range:
 *   [positionMs - PAST_MS,  positionMs + LEAD_MS]
 * where LEAD_MS and PAST_MS are derived from the waterfall's constants so the
 * two views are always in sync.
 */
import type { NoteInterval, Section } from './recording-types'
import { DEFAULT_LEAD_TIME_SEC, LINE_X_RATIO } from './waterfall-layout'
import { FINGER_COLORS } from './finger-colors'
import { noteColor } from './note-colors'

const RIGHT_MIN  = 60   // C4
const RIGHT_MAX  = 108  // C8
const LEFT_MIN   = 21   // A0
const LEFT_MAX   = 59   // B3
const TRACK_GAP  = 3
const RULER_H    = 14   // px reserved for the time ruler at the bottom

// Window that mirrors waterfall visibility:
//   future = leadTimeSec s (right-edge → golden bar)
//   past   = LINE_X_RATIO / (1 - LINE_X_RATIO) × leadTimeSec s (bar → left edge of note area)
const LEAD_MS = DEFAULT_LEAD_TIME_SEC * 1000
const PAST_MS = (LINE_X_RATIO / (1 - LINE_X_RATIO)) * LEAD_MS  // ≈ 706 ms

export interface TimelineCanvas {
  setIntervals(intervals: NoteInterval[]): void
  setPosition(ms: number): void
  setDuration(ms: number): void
  setLoop(start: number, end: number): void
  clearLoop(): void
  setLoopEnabled(enabled: boolean): void
  setSections(sections: Section[]): void
  resize(w: number, h: number): void
  destroy(): void
  xToMs(x: number): number
  loopStartMs(): number | null
  loopEndMs(): number | null
}

export function createTimelineCanvas(canvas: HTMLCanvasElement): TimelineCanvas {
  const ctx = canvas.getContext('2d')!
  let W = canvas.width
  let H = canvas.height
  let intervals: NoteInterval[] = []
  let sections: Section[] = []
  let positionMs = 0
  let durationMs = 0
  let loopStart: number | null = null
  let loopEnd: number | null = null
  let loopEnabled = false
  let rafId = 0

  function msToX(ms: number): number {
    return durationMs > 0 ? (ms / durationMs) * W : 0
  }

  function getTrackBounds() {
    const available = H - RULER_H - TRACK_GAP
    const trackH = available / 2
    return {
      rTop: 0,
      rBot: trackH,
      lTop: trackH + TRACK_GAP,
      lBot: trackH + TRACK_GAP + trackH,
      rulerTop: H - RULER_H,
    }
  }

  /** Adaptive tick interval based on total duration. */
  function calcTickInterval(durMs: number): { major: number; minor: number } {
    const s = durMs / 1000
    if (s <= 30)    return { major: 5_000,   minor: 1_000 }
    if (s <= 120)   return { major: 10_000,  minor: 5_000 }
    if (s <= 300)   return { major: 30_000,  minor: 10_000 }
    if (s <= 900)   return { major: 60_000,  minor: 15_000 }
    if (s <= 3_600) return { major: 120_000, minor: 30_000 }
    return               { major: 300_000,  minor: 60_000 }
  }

  function fmtMs(ms: number): string {
    const s = Math.floor(ms / 1000)
    const m = Math.floor(s / 60)
    return `${m}:${String(s % 60).padStart(2, '0')}`
  }

  function drawRuler(rulerTop: number) {
    if (durationMs <= 0) {
      ctx.fillStyle = 'rgba(0,0,0,0.25)'
      ctx.fillRect(0, rulerTop, W, RULER_H)
      return
    }

    ctx.fillStyle = 'rgba(0,0,0,0.30)'
    ctx.fillRect(0, rulerTop, W, RULER_H)

    const { major, minor } = calcTickInterval(durationMs)
    ctx.strokeStyle = 'rgba(255,255,255,0.20)'
    ctx.lineWidth = 1
    ctx.fillStyle = 'rgba(255,255,255,0.45)'
    ctx.font = '8px sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'

    for (let t = 0; t <= durationMs; t += minor) {
      const x = msToX(t)
      const isMajor = t % major === 0
      const tickH = isMajor ? RULER_H * 0.7 : RULER_H * 0.35
      ctx.beginPath()
      ctx.moveTo(x, rulerTop)
      ctx.lineTo(x, rulerTop + tickH)
      ctx.stroke()

      if (isMajor) {
        const label = fmtMs(t)
        const lx = Math.min(Math.max(x, 10), W - 10)
        ctx.fillText(label, lx, rulerTop + RULER_H * 0.55)
      }
    }

    // Section markers (offset by LEAD_MS to match playback position)
    for (const sec of sections) {
      const sx = msToX(sec.startMs + LEAD_MS)
      if (sx < 2 || sx > W - 2) continue
      ctx.save()
      ctx.strokeStyle = 'rgba(255,210,80,0.55)'
      ctx.lineWidth   = 1
      ctx.setLineDash([3, 3])
      ctx.beginPath(); ctx.moveTo(sx, rulerTop); ctx.lineTo(sx, rulerTop + RULER_H); ctx.stroke()
      ctx.setLineDash([])
      ctx.restore()
      ctx.font        = 'bold 7px sans-serif'
      ctx.fillStyle   = 'rgba(255,210,80,0.85)'
      ctx.textAlign   = 'left'
      ctx.textBaseline = 'top'
      ctx.fillText(sec.name, sx + 2, rulerTop + 1)
    }
  }

  function drawTrack(
    midiMin: number,
    midiMax: number,
    top: number,
    bot: number,
    handFilter: 'left' | 'right',
  ) {
    const h = bot - top
    ctx.fillStyle = 'rgba(255,255,255,0.04)'
    ctx.fillRect(0, top, W, h)

    const range = midiMax - midiMin
    for (const iv of intervals) {
      const inTrack = iv.hand
        ? iv.hand === handFilter
        : (handFilter === 'right' ? iv.note >= RIGHT_MIN && iv.note <= RIGHT_MAX
                                   : iv.note >= LEFT_MIN  && iv.note <= LEFT_MAX)
      if (!inTrack) continue
      // Offset by LEAD_MS so bars align with when they'll actually be played
      const x1 = msToX(iv.startMs + LEAD_MS)
      const x2 = msToX(iv.endMs   + LEAD_MS)
      const bw = Math.max(x2 - x1, 1)
      const t  = (midiMax - iv.note) / range
      const cy = top + t * h
      const bh = Math.max(h / (range + 1), 1)
      // Per-note color: finger color if set, else note color
      ctx.fillStyle = iv.finger != null
        ? FINGER_COLORS[iv.finger] + 'cc'
        : noteColor(iv.note) + 'cc'
      ctx.fillRect(x1, cy - bh / 2, bw, bh)
    }
  }

  function draw() {
    ctx.clearRect(0, 0, W, H)
    const { rTop, rBot, lTop, lBot, rulerTop } = getTrackBounds()

    drawTrack(RIGHT_MIN, RIGHT_MAX, rTop, rBot, 'right')
    drawTrack(LEFT_MIN,  LEFT_MAX,  lTop, lBot, 'left')
    drawRuler(rulerTop)

    if (durationMs <= 0) return

    if (loopStart != null && loopEnd != null) {
      const lx1 = msToX(loopStart)
      const lx2 = msToX(loopEnd)
      ctx.fillStyle = loopEnabled ? 'rgba(123,95,240,0.20)' : 'rgba(123,95,240,0.10)'
      ctx.fillRect(lx1, 0, lx2 - lx1, rulerTop)

      ctx.strokeStyle = '#7b5ff0'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(lx1, 0)
      ctx.lineTo(lx1, rulerTop)
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(lx2, 0)
      ctx.lineTo(lx2, rulerTop)
      ctx.stroke()

      ctx.font = 'bold 8px sans-serif'
      ctx.fillStyle = '#a78bfa'
      ctx.textAlign = 'left'
      ctx.textBaseline = 'top'
      ctx.fillText('A', lx1 + 2, 1)
      ctx.textAlign = 'right'
      ctx.fillText('B', lx2 - 2, 1)
    }

    const wx1 = msToX(Math.max(0, positionMs - PAST_MS))
    const wx2 = msToX(Math.min(positionMs + LEAD_MS, durationMs))
    ctx.fillStyle = 'rgba(255,255,255,0.07)'
    ctx.fillRect(wx1, 0, wx2 - wx1, rulerTop)

    const nx = msToX(positionMs)
    ctx.strokeStyle = 'rgba(255,210,50,0.9)'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(nx, 0)
    ctx.lineTo(nx, rulerTop)
    ctx.stroke()

    ctx.textBaseline = 'alphabetic'
  }

  function loop() {
    draw()
    rafId = requestAnimationFrame(loop)
  }
  rafId = requestAnimationFrame(loop)

  return {
    setIntervals(ivs) {
      intervals = ivs
    },
    setSections(s) {
      sections = s
    },
    setPosition(ms) {
      positionMs = ms
    },
    setDuration(ms) {
      durationMs = ms
    },
    setLoop(start, end) {
      loopStart = start
      loopEnd = end
    },
    clearLoop() {
      loopStart = null
      loopEnd = null
      loopEnabled = false
    },
    setLoopEnabled(enabled) {
      loopEnabled = enabled
    },
    resize(w, h) {
      W = w
      H = h
      canvas.width = w
      canvas.height = h
    },
    destroy() {
      cancelAnimationFrame(rafId)
    },
    xToMs(x) {
      return durationMs > 0 ? (x / W) * durationMs : 0
    },
    loopStartMs() {
      return loopStart
    },
    loopEndMs() {
      return loopEnd
    },
  }
}
