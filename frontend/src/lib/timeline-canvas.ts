/**
 * Mini timeline canvas — compressed view of the entire recording.
 * Two horizontal tracks: right hand (top) and left hand (bottom).
 */
import type { NoteInterval } from './recording-types'

const RIGHT_MIN = 60  // C4
const RIGHT_MAX = 108 // C8
const LEFT_MIN  = 21  // A0
const LEFT_MAX  = 59  // B3
const WINDOW_SEC = 30
const TRACK_GAP  = 4

export interface TimelineCanvas {
  setIntervals(intervals: NoteInterval[]): void
  setPosition(ms: number): void
  setDuration(ms: number): void
  setLoop(start: number, end: number): void
  clearLoop(): void
  setLoopEnabled(enabled: boolean): void
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
    const trackH = (H - TRACK_GAP) / 2
    return {
      rTop: 0,
      rBot: trackH,
      lTop: trackH + TRACK_GAP,
      lBot: H,
    }
  }

  function drawTrack(
    midiMin: number,
    midiMax: number,
    top: number,
    bot: number,
    color: string,
  ) {
    const h = bot - top
    ctx.fillStyle = 'rgba(255,255,255,0.04)'
    ctx.fillRect(0, top, W, h)

    const range = midiMax - midiMin
    ctx.fillStyle = color
    for (const iv of intervals) {
      if (iv.note < midiMin || iv.note > midiMax) continue
      const x1 = msToX(iv.startMs)
      const x2 = msToX(iv.endMs)
      const bw = Math.max(x2 - x1, 1)
      const t = (midiMax - iv.note) / range
      const cy = top + t * h
      const bh = Math.max(h / (range + 1), 1)
      ctx.fillRect(x1, cy - bh / 2, bw, bh)
    }
  }

  function draw() {
    ctx.clearRect(0, 0, W, H)
    const { rTop, rBot, lTop, lBot } = getTrackBounds()

    drawTrack(RIGHT_MIN, RIGHT_MAX, rTop, rBot, 'rgba(123,95,240,0.75)')
    drawTrack(LEFT_MIN, LEFT_MAX, lTop, lBot, 'rgba(240,138,91,0.75)')

    if (durationMs <= 0) return

    if (loopStart != null && loopEnd != null) {
      const lx1 = msToX(loopStart)
      const lx2 = msToX(loopEnd)
      ctx.fillStyle = loopEnabled ? 'rgba(123,95,240,0.20)' : 'rgba(123,95,240,0.10)'
      ctx.fillRect(lx1, 0, lx2 - lx1, H)

      ctx.strokeStyle = '#7b5ff0'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(lx1, 0)
      ctx.lineTo(lx1, H)
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(lx2, 0)
      ctx.lineTo(lx2, H)
      ctx.stroke()

      ctx.font = 'bold 8px sans-serif'
      ctx.fillStyle = '#a78bfa'
      ctx.textAlign = 'left'
      ctx.textBaseline = 'top'
      ctx.fillText('A', lx1 + 2, 1)
      ctx.textAlign = 'right'
      ctx.fillText('B', lx2 - 2, 1)
    }

    const wx2 = msToX(Math.min(positionMs + WINDOW_SEC * 1000, durationMs))
    const wx1 = msToX(positionMs)
    ctx.fillStyle = 'rgba(255,255,255,0.07)'
    ctx.fillRect(wx1, 0, wx2 - wx1, H)

    const nx = msToX(positionMs)
    ctx.strokeStyle = 'rgba(255,210,50,0.9)'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(nx, 0)
    ctx.lineTo(nx, H)
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
