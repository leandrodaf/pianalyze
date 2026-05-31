import {
  Renderer,
  Stave,
  StaveNote,
  Voice,
  Formatter,
  Beam,
  Accidental,
  StaveConnector,
} from 'vexflow'
import type { NoteInterval, Recording, Finger } from './recording-types'
import { keySigAt } from './recording-types'
import { FINGER_COLORS } from './finger-colors'
import { DEFAULT_LEAD_TIME_SEC } from './waterfall-layout'
import {
  quantizeRecording,
  toVexFlowKey,
  parseTimeSig,
  type QuantizedMeasure,
  type QuantizedNote,
} from './rhythm-quantizer'

// ── Layout constants ──────────────────────────────────────────────────────────

const STAVE_H   = 80    // height of one staff
const GAP_TB    = 20    // gap between treble bottom and bass top
const MARGIN_L  = 14
const MARGIN_T  = 42
const CLEF_W    = 95    // space consumed by clef + key sig + time sig (first measure)
const MEASURE_W = 220   // logical width per measure on the tape
const LEAD_MS   = DEFAULT_LEAD_TIME_SEC * 1000
// Render at logical (smaller) width then CSS-scale up so note heads are legible
const SHEET_SCALE = 1.6
// Blank stave zone before measure 1 that the cursor sweeps during the lead-in
const LEADIN_W  = 260

// Default rendering color — white-ish on dark background
const LINE_COLOR        = 'rgba(200,200,200,0.78)'
// Fallback highlight when finger is unknown
const HIGHLIGHT_DEFAULT = '#ffd700'
// Playback cursor color
const CURSOR_COLOR      = 'rgba(255,200,0,0.92)'

// Duration codes VexFlow can auto-beam
const BEAMABLE = new Set(['8', '8d', '16', '16d', '32'])

// ── Internal types ────────────────────────────────────────────────────────────

interface MeasureLayout {
  measure:  number
  startMs:  number
  endMs:    number
  noteX:    number   // x after clef/symbols (cursor starts here)
  noteW:    number   // usable note width
  trebleY:  number
  bassY:    number
}

/** A rendered note whose SVG children we can recolor for practice highlighting. */
interface TrackedNote {
  startMs:  number
  endMs:    number
  finger?:  Finger
  isRest:   boolean
  children: SVGElement[]
}

// ── SheetCanvas ───────────────────────────────────────────────────────────────

export class SheetCanvas {
  private wrap:       HTMLElement
  private layouts:    MeasureLayout[]    = []
  private measures:   QuantizedMeasure[] = []
  private _recording: Recording | null  = null
  private _notes:     TrackedNote[]      = []
  private _highlighted: TrackedNote[]   = []
  private _lastTargetMs: number | null  = null
  private _svgOutDiv: HTMLDivElement | null = null
  private _cursorX     = 0
  private _lastMusicMs = -LEAD_MS
  private vfKey = 'C'
  private _w = 0

  constructor(container: HTMLElement) {
    this.wrap = container
    Object.assign(this.wrap.style, {
      overflowY:  'hidden',
      overflowX:  'hidden',
      position:   'relative',
      width:      '100%',
      height:     '100%',
      background: '#0f1014',
    })
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  setData(intervals: NoteInterval[], recording: Recording): void {
    this.vfKey      = toVexFlowKey(recording.keySignature)
    this._recording = recording
    this.measures   = quantizeRecording(intervals, recording)
    this._render()
  }

  clearData(): void {
    this.measures   = []
    this._recording = null
    this._renderEmpty()
  }

  /**
   * musicMs is the MUSICAL position in the recording (positionMs − LEAD_MS).
   * Negative values (before first note) are handled gracefully.
   */
  setPosition(musicMs: number): void {
    this._lastMusicMs = musicMs
    this._moveCursor(musicMs)
    this._updateHighlight(musicMs)
  }

  resize(w: number, h: number): void {
    this._w = w; void h
    if (this.measures.length > 0) this._render()
    else this._renderEmpty()
  }

  destroy(): void {
    this.wrap.innerHTML = ''
    this._svgOutDiv    = null
    this._notes        = []
    this._highlighted  = []
    this.layouts       = []
    this._recording    = null
  }

  // ── Cursor ──────────────────────────────────────────────────────────────────

  private _moveCursor(musicMs: number): void {
    if (!this._svgOutDiv || this.layouts.length === 0) return

    const first = this.layouts[0]
    const last  = this.layouts[this.layouts.length - 1]
    let cx: number

    let layout: MeasureLayout | null = null
    for (const l of this.layouts) {
      if (musicMs >= l.startMs && musicMs < l.endMs) { layout = l; break }
    }

    if (layout) {
      const frac = Math.max(0, Math.min(1,
        (musicMs - layout.startMs) / (layout.endMs - layout.startMs)
      ))
      cx = layout.noteX + frac * layout.noteW
    } else if (musicMs < first.startMs) {
      // Lead-in: cursor sweeps from left edge of lead-in zone to first note
      const msUntilFirst = first.startMs - musicMs
      const frac = Math.max(0, 1 - msUntilFirst / LEAD_MS)
      cx = MARGIN_L + frac * (first.noteX - MARGIN_L)
    } else {
      // Past the end — park at end of last measure
      cx = last.noteX + last.noteW
    }

    const tx = this._cursorX - cx * SHEET_SCALE
    this._svgOutDiv.style.transform = `translateX(${Math.round(tx)}px)`
  }

  // ── Highlight ────────────────────────────────────────────────────────────────

  private _updateHighlight(musicMs: number): void {
    const targetMs = this._findTargetMs(musicMs)
    if (targetMs === this._lastTargetMs) return
    this._lastTargetMs = targetMs

    for (const n of this._highlighted) {
      this._recolor(n.children, LINE_COLOR)
    }
    this._highlighted = []

    if (targetMs === null) return

    for (const n of this._notes) {
      if (n.isRest || n.children.length === 0) continue
      if (Math.abs(n.startMs - targetMs) <= 30) {
        const color = n.finger != null ? FINGER_COLORS[n.finger] : HIGHLIGHT_DEFAULT
        this._recolor(n.children, color)
        this._highlighted.push(n)
      }
    }
  }

  /** Currently-playing note, or next note within a short preview window.
   *  The preview window prevents the first note from being highlighted during
   *  the 4-second lead-in (audio still ~4 s away).
   */
  private _findTargetMs(musicMs: number): number | null {
    let current: number | null = null
    for (const n of this._notes) {
      if (!n.isRest && n.startMs <= musicMs && n.endMs > musicMs) {
        if (current === null || n.startMs > current) current = n.startMs
      }
    }
    if (current !== null) return current

    const PREVIEW_MS = 400
    let next: number | null = null
    for (const n of this._notes) {
      if (!n.isRest && n.startMs > musicMs && n.startMs - musicMs <= PREVIEW_MS) {
        if (next === null || n.startMs < next) next = n.startMs
      }
    }
    return next
  }

  private _recolor(els: SVGElement[], color: string): void {
    for (const el of els) {
      el.style.fill   = color
      el.style.stroke = color
    }
  }

  // ── Rendering ───────────────────────────────────────────────────────────────

  private _renderEmpty(): void {
    this.wrap.innerHTML = `
      <div style="
        display:flex;align-items:center;justify-content:center;
        height:180px;color:rgba(255,255,255,0.18);
        font-size:0.88rem;font-family:system-ui,sans-serif;
        letter-spacing:0.04em;">
        Carregue uma gravação para visualizar a partitura
      </div>`
    this._svgOutDiv    = null
    this._notes        = []
    this._highlighted  = []
    this._lastTargetMs = null
    this.layouts       = []
  }

  private _render(): void {
    this.wrap.innerHTML = ''
    this._svgOutDiv    = null
    this._notes        = []
    this._highlighted  = []
    this._lastTargetMs = null
    this.layouts       = []

    const measures = this.measures
    if (measures.length === 0 || this._w <= 0) { this._renderEmpty(); return }

    const trebleY  = MARGIN_T
    const bassY    = trebleY + STAVE_H + GAP_TB
    const svgH     = MARGIN_T + STAVE_H * 2 + GAP_TB + 30

    // Compute lead-in pixel width to match the first measure's px/ms rate so
    // the cursor sweeps at constant apparent speed from lead-in into the piece.
    const firstM   = measures[0]
    const { beats: fBeats, beatValue: fBeatValue } = parseTimeSig(firstM.timeSig)
    const firstMeasureDurationMs = fBeats * (60000 / firstM.bpm) * (4 / fBeatValue)
    const pxPerMs  = MEASURE_W / firstMeasureDurationMs
    const leadinW  = Math.max(LEADIN_W, Math.round(LEAD_MS * pxPerMs))

    const logicalW = MARGIN_L + leadinW + measures.length * MEASURE_W + 20

    // Scrolling container — translateX drives the tape movement
    const outDiv = document.createElement('div')
    outDiv.style.cssText = 'position:absolute;top:0;left:0;will-change:transform;'
    this.wrap.appendChild(outDiv)
    this._svgOutDiv = outDiv as HTMLDivElement

    const renderer = new Renderer(outDiv, Renderer.Backends.SVG)
    renderer.resize(logicalW, svgH)
    const ctx = renderer.getContext()

    ;(ctx as any).setFillStyle(LINE_COLOR)
    ;(ctx as any).setStrokeStyle(LINE_COLOR)
    ;(ctx as any).setFont('Arial', 10, '')

    const svgEl = outDiv.querySelector('svg') as SVGSVGElement
    svgEl.style.background      = '#0f1014'
    svgEl.style.transform       = `scale(${SHEET_SCALE})`
    svgEl.style.transformOrigin = 'top left'

    // Lead-in blank staves — the cursor sweeps across these during the lead-in prep
    const liT = new Stave(MARGIN_L, trebleY, leadinW)
    const liB = new Stave(MARGIN_L, bassY,   leadinW)
    liT.setContext(ctx).draw()
    liB.setContext(ctx).draw()
    try {
      new StaveConnector(liT, liB).setType('singleLeft').setContext(ctx).draw()
    } catch { /* skip */ }

    let xCursor = MARGIN_L + leadinW

    const recording = this._recording
    // Track the active VexFlow key so we can emit mid-piece key changes.
    let prevVfKey = this.vfKey

    for (let mi = 0; mi < measures.length; mi++) {
      const qm      = measures[mi]
      const isFirst = mi === 0
      const x       = xCursor
      const noteX   = x + (isFirst ? CLEF_W : 0)
      const noteW   = Math.max(MEASURE_W - (isFirst ? CLEF_W : 0) - 8, 40)

      // Resolve the active key signature for this measure.
      const measureVfKey = recording
        ? toVexFlowKey(keySigAt(recording, qm.startMs))
        : prevVfKey

      const ts = new Stave(x, trebleY, MEASURE_W)
      const bs = new Stave(x, bassY,   MEASURE_W)

      if (isFirst) {
        ts.addClef('treble').addKeySignature(measureVfKey).addTimeSignature(qm.timeSig)
        bs.addClef('bass').addKeySignature(measureVfKey).addTimeSignature(qm.timeSig)
      } else {
        // Emit a key-change marker when the key signature changes mid-piece.
        if (measureVfKey !== prevVfKey) {
          try {
            ts.addKeySignature(measureVfKey, prevVfKey)
            bs.addKeySignature(measureVfKey, prevVfKey)
          } catch { /* skip if VexFlow rejects the combination */ }
        }
        const prev = measures[mi - 1]
        if (prev.timeSig !== qm.timeSig) {
          ts.addTimeSignature(qm.timeSig)
          bs.addTimeSignature(qm.timeSig)
        }
      }

      prevVfKey = measureVfKey

      ts.setContext(ctx).draw()
      bs.setContext(ctx).draw()

      if (isFirst) {
        try {
          new StaveConnector(ts, bs).setType('singleLeft').setContext(ctx).draw()
        } catch { /* skip */ }
      }

      const { beats, beatValue } = parseTimeSig(qm.timeSig)
      const tn = qm.treble.map(qn => buildNote(qn, 'treble'))
      const bn = qm.bass.map(qn   => buildNote(qn, 'bass'))

      const tv = new Voice({ numBeats: beats, beatValue })
      const bv = new Voice({ numBeats: beats, beatValue })
      tv.setMode(2); bv.setMode(2)
      tv.addTickables(tn)
      bv.addTickables(bn)

      try { Accidental.applyAccidentals([tv, bv], measureVfKey) } catch { /* skip */ }

      try {
        new Formatter()
          .joinVoices([tv]).joinVoices([bv])
          .format([tv, bv], noteW)
      } catch {
        try { new Formatter().joinVoices([tv]).format([tv], noteW) } catch { /* skip */ }
        try { new Formatter().joinVoices([bv]).format([bv], noteW) } catch { /* skip */ }
      }

      tv.draw(ctx, ts)
      bv.draw(ctx, bs)

      this._collectNoteEls(tn, qm.treble)
      this._collectNoteEls(bn, qm.bass)

      const beamT = tn.filter(n => !n.isRest() && BEAMABLE.has(safeGetDur(n)))
      const beamB = bn.filter(n => !n.isRest() && BEAMABLE.has(safeGetDur(n)))
      try { Beam.generateBeams(beamT).forEach(b => b.setContext(ctx).draw()) } catch { /* skip */ }
      try { Beam.generateBeams(beamB).forEach(b => b.setContext(ctx).draw()) } catch { /* skip */ }

      this.layouts.push({
        measure: qm.measure, startMs: qm.startMs, endMs: qm.endMs,
        // Use measure-start x and full MEASURE_W so the cursor advances at
        // a constant px/ms rate across every measure (including the first,
        // which otherwise loses noteW to the clef/key-sig area).
        noteX: x, noteW: MEASURE_W,
        trebleY, bassY,
      })

      xCursor += MEASURE_W
    }

    // Fixed cursor bar — stays at cursorX while the tape slides behind it
    this._cursorX = Math.floor(this._w * 0.30)
    const cursorTop    = (trebleY - 8) * SHEET_SCALE
    const cursorHeight = (bassY + STAVE_H + 16 - trebleY) * SHEET_SCALE
    const cursorDiv    = document.createElement('div')
    cursorDiv.style.cssText = [
      `position:absolute`,
      `left:${this._cursorX}px`,
      `top:${Math.round(cursorTop)}px`,
      `height:${Math.round(cursorHeight)}px`,
      `width:3px`,
      `background:${CURSOR_COLOR}`,
      `pointer-events:none`,
      `z-index:10`,
      `border-radius:2px`,
    ].join(';')
    this.wrap.appendChild(cursorDiv)

    // Restore current playback position — prevents a jump on window resize.
    this._moveCursor(this._lastMusicMs)
  }

  private _collectNoteEls(vfNotes: StaveNote[], qNotes: QuantizedNote[]): void {
    for (let i = 0; i < vfNotes.length; i++) {
      const vfNote = vfNotes[i]
      const qn     = qNotes[i]
      if (!qn) continue

      // VexFlow 5 uses getSVGElement() (set after draw()); earlier builds used attrs.el
      const el = (
        (vfNote as any).getSVGElement?.() ??
        (vfNote as any).attrs?.el
      ) as SVGElement | undefined
      const children = el
        ? Array.from(el.querySelectorAll('path,rect,ellipse,line,circle,use,text')) as SVGElement[]
        : []

      this._notes.push({
        startMs:  qn.startMs,
        endMs:    qn.endMs,
        finger:   qn.finger as Finger | undefined,
        isRest:   qn.isRest,
        children,
      })
    }
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildNote(qn: QuantizedNote, clef: 'treble' | 'bass'): StaveNote {
  return new StaveNote({
    keys:     qn.keys,
    duration: qn.duration,
    type:     qn.isRest ? 'r' : undefined,
    clef,
  })
}

function safeGetDur(n: StaveNote): string {
  try { return n.getDuration() } catch { return '' }
}
