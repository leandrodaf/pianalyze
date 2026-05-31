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

const STAVE_H  = 80    // height of one staff
const GAP_TB   = 20    // gap between treble bottom and bass top
const GAP_ROW  = 54    // gap between bass bottom and next treble top
const MARGIN_L = 14
const MARGIN_R = 12
const MARGIN_T = 42
const CLEF_W      = 95    // space consumed by clef + key sig + time sig (first measure per row)
const LEAD_MS     = DEFAULT_LEAD_TIME_SEC * 1000
// Render at logical (smaller) width then scale up so note heads are legible
const SHEET_SCALE = 1.6
// Blank stave zone before measure 1 that the cursor sweeps during the lead-in
const LEADIN_W    = 260

// Default rendering color — white-ish on dark background
const LINE_COLOR   = 'rgba(200,200,200,0.78)'
// Fallback highlight when finger is unknown
const HIGHLIGHT_DEFAULT = '#ffd700'
// Playback cursor color
const CURSOR_COLOR = 'rgba(255,200,0,0.92)'

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
  children: SVGElement[]   // cached for O(1) recolor
}

// ── SheetCanvas ───────────────────────────────────────────────────────────────

export class SheetCanvas {
  private wrap:       HTMLElement
  private layouts:    MeasureLayout[]  = []
  private measures:   QuantizedMeasure[] = []
  private _notes:     TrackedNote[]    = []
  private _highlighted: TrackedNote[] = []
  private _lastTargetMs: number | null = null
  private _cursorLine: SVGLineElement | null = null
  private vfKey = 'C'
  private _w = 0
  private _h = 0

  constructor(container: HTMLElement) {
    this.wrap = container
    Object.assign(this.wrap.style, {
      overflowY:  'auto',
      overflowX:  'hidden',
      position:   'relative',
      width:      '100%',
      height:     '100%',
      background: '#0f1014',
    })
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  setData(intervals: NoteInterval[], recording: Recording): void {
    this.vfKey    = toVexFlowKey(recording.keySignature)
    this.measures = quantizeRecording(intervals, recording)
    this._render()
  }

  clearData(): void {
    this.measures = []
    this._renderEmpty()
  }

  /**
   * musicMs is the MUSICAL position in the recording (positionMs − LEAD_MS).
   * Negative values (before first note) are handled gracefully.
   */
  setPosition(musicMs: number): void {
    this._moveCursor(musicMs)
    this._updateHighlight(musicMs)
  }

  resize(w: number, h: number): void {
    this._w = w; this._h = h
    if (this.measures.length > 0) this._render()
    else this._renderEmpty()
  }

  destroy(): void {
    this.wrap.innerHTML = ''
    this._cursorLine  = null
    this._notes       = []
    this._highlighted = []
    this.layouts      = []
  }

  // ── Cursor ──────────────────────────────────────────────────────────────────

  private _moveCursor(musicMs: number): void {
    if (!this._cursorLine || this.layouts.length === 0) return

    let layout: MeasureLayout | null = null
    for (const l of this.layouts) {
      if (musicMs >= l.startMs && musicMs < l.endMs) { layout = l; break }
    }

    if (!layout) {
      // Lead-in: cursor is always visible before the first note, sweeping left→right.
      // frac=0 while still far away, then ramps to 1 exactly when the first note plays.
      const first = this.layouts[0]
      if (musicMs < first.startMs) {
        const msUntilFirst = first.startMs - musicMs
        const frac = Math.max(0, 1 - msUntilFirst / LEAD_MS)
        const cx   = MARGIN_L + frac * (first.noteX - MARGIN_L)
        this._cursorLine.style.display = ''
        this._cursorLine.setAttribute('x1', `${cx}`)
        this._cursorLine.setAttribute('x2', `${cx}`)
        this._cursorLine.setAttribute('y1', `${first.trebleY - 8}`)
        this._cursorLine.setAttribute('y2', `${first.bassY + STAVE_H + 8}`)
        const top       = first.trebleY * SHEET_SCALE - 8
        const clientH   = this.wrap.clientHeight
        const scrollTop = this.wrap.scrollTop
        if (top < scrollTop + 40 || top > scrollTop + clientH - 150) {
          this.wrap.scrollTop = Math.max(0, top - clientH * 0.3)
        }
      } else {
        this._cursorLine.style.display = 'none'
      }
      return
    }

    const frac = Math.max(0, Math.min(1,
      (musicMs - layout.startMs) / (layout.endMs - layout.startMs)
    ))
    const cx = layout.noteX + frac * layout.noteW

    this._cursorLine.style.display = ''
    this._cursorLine.setAttribute('x1', `${cx}`)
    this._cursorLine.setAttribute('x2', `${cx}`)
    this._cursorLine.setAttribute('y1', `${layout.trebleY - 8}`)
    this._cursorLine.setAttribute('y2', `${layout.bassY + STAVE_H + 8}`)

    // Scroll to keep cursor row in view (DOM coords = SVG coords * SHEET_SCALE)
    const top       = layout.trebleY * SHEET_SCALE - 8
    const scrollTop = this.wrap.scrollTop
    const clientH   = this.wrap.clientHeight
    if (top < scrollTop + 40 || top > scrollTop + clientH - 150) {
      this.wrap.scrollTop = Math.max(0, top - clientH * 0.3)
    }
  }

  // ── Highlight ────────────────────────────────────────────────────────────────

  private _updateHighlight(musicMs: number): void {
    const targetMs = this._findTargetMs(musicMs)
    if (targetMs === this._lastTargetMs) return
    this._lastTargetMs = targetMs

    // Reset previously highlighted notes to default color
    for (const n of this._highlighted) {
      this._recolor(n.children, LINE_COLOR)
    }
    this._highlighted = []

    if (targetMs === null) return

    // Highlight all notes (non-rest) in the target group
    for (const n of this._notes) {
      if (n.isRest || n.children.length === 0) continue
      if (Math.abs(n.startMs - targetMs) <= 30) {
        const color = n.finger != null ? FINGER_COLORS[n.finger] : HIGHLIGHT_DEFAULT
        this._recolor(n.children, color)
        this._highlighted.push(n)
      }
    }
  }

  /** Find the musical ms to highlight: currently playing note, or next upcoming note.
   *  "Next upcoming" is limited to a short lookahead so the first note is NOT
   *  highlighted during the 4-second lead-in (it would appear ready to play
   *  when audio is still 4 seconds away).
   */
  private _findTargetMs(musicMs: number): number | null {
    // Currently playing
    let current: number | null = null
    for (const n of this._notes) {
      if (!n.isRest && n.startMs <= musicMs && n.endMs > musicMs) {
        if (current === null || n.startMs > current) current = n.startMs
      }
    }
    if (current !== null) return current

    // Next upcoming — only within a short preview window so we don't
    // pre-highlight notes that are many seconds away (i.e. during lead-in).
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
    this._cursorLine  = null
    this._notes       = []
    this._highlighted = []
    this._lastTargetMs = null
    this.layouts      = []
  }

  private _render(): void {
    this.wrap.innerHTML = ''
    this._cursorLine  = null
    this._notes       = []
    this._highlighted = []
    this._lastTargetMs = null
    this.layouts      = []

    const measures = this.measures
    if (measures.length === 0 || this._w <= 0) { this._renderEmpty(); return }

    // Render at a smaller logical width, then scale up so note heads are legible
    const logicalW  = Math.floor(this._w / SHEET_SCALE)
    const avail     = logicalW - MARGIN_L - MARGIN_R
    // Row 0 has a lead-in zone (LEADIN_W) so it fits fewer measures
    const perRow0   = Math.max(1, Math.floor((avail - LEADIN_W) / 220))
    const perRow    = Math.max(1, Math.floor(avail / 220))
    const measureW  = Math.floor(avail / perRow)
    const rowH      = STAVE_H * 2 + GAP_TB + GAP_ROW
    // Compute row count and start-index per row
    const rowStarts: number[] = [0]
    for (let i = perRow0; i < measures.length; i += perRow) rowStarts.push(i)
    const numRows   = rowStarts.length
    const svgH      = MARGIN_T + numRows * rowH + 30

    const outDiv = document.createElement('div')
    outDiv.style.cssText = `width:100%;flex-shrink:0;height:${svgH * SHEET_SCALE}px;`
    this.wrap.appendChild(outDiv)

    const renderer = new Renderer(outDiv, Renderer.Backends.SVG)
    renderer.resize(logicalW, svgH)
    const ctx = renderer.getContext()

    ;(ctx as any).setFillStyle(LINE_COLOR)
    ;(ctx as any).setStrokeStyle(LINE_COLOR)
    ;(ctx as any).setFont('Arial', 10, '')

    const svgEl = outDiv.querySelector('svg') as SVGSVGElement
    svgEl.style.background = '#0f1014'
    svgEl.style.transform       = `scale(${SHEET_SCALE})`
    svgEl.style.transformOrigin = 'top left'

    for (let rowIdx = 0; rowIdx < numRows; rowIdx++) {
      const rowStart     = rowStarts[rowIdx]
      const rowLen       = rowIdx === 0 ? perRow0 : perRow
      const rowSlice     = measures.slice(rowStart, Math.min(rowStart + rowLen, measures.length))
      const trebleY      = MARGIN_T + rowIdx * rowH
      const bassY        = trebleY + STAVE_H + GAP_TB

      // Row 0: draw blank lead-in staves so the cursor has a visible runway
      let xCursor = MARGIN_L
      if (rowIdx === 0) {
        const liT = new Stave(MARGIN_L, trebleY, LEADIN_W)
        const liB = new Stave(MARGIN_L, bassY,   LEADIN_W)
        liT.setContext(ctx).draw()
        liB.setContext(ctx).draw()
        try {
          new StaveConnector(liT, liB).setType('singleLeft').setContext(ctx).draw()
        } catch { /* skip */ }
        xCursor = MARGIN_L + LEADIN_W
      }

      for (let mi = 0; mi < rowSlice.length; mi++) {
        const qm      = rowSlice[mi]
        const isFirst = mi === 0
        const w       = measureW
        const x       = xCursor
        const noteX   = x + (isFirst ? CLEF_W : 0)
        const noteW   = Math.max(w - (isFirst ? CLEF_W : 0) - 8, 40)

        // ── Staves ───────────────────────────────────────────────────────────
        const ts = new Stave(x, trebleY, w)
        const bs = new Stave(x, bassY, w)

        if (isFirst) {
          ts.addClef('treble').addKeySignature(this.vfKey).addTimeSignature(qm.timeSig)
          bs.addClef('bass').addKeySignature(this.vfKey).addTimeSignature(qm.timeSig)
        } else {
          const prev = rowSlice[mi - 1]
          if (prev.timeSig !== qm.timeSig) {
            ts.addTimeSignature(qm.timeSig)
            bs.addTimeSignature(qm.timeSig)
          }
        }

        ts.setContext(ctx).draw()
        bs.setContext(ctx).draw()

        if (isFirst) {
          try {
            new StaveConnector(ts, bs).setType('singleLeft').setContext(ctx).draw()
          } catch { /* skip */ }
        }

        // ── Voices ───────────────────────────────────────────────────────────
        const { beats, beatValue } = parseTimeSig(qm.timeSig)

        const tn = qm.treble.map(qn => buildNote(qn, 'treble'))
        const bn = qm.bass.map(qn   => buildNote(qn, 'bass'))

        const tv = new Voice({ numBeats: beats, beatValue })
        const bv = new Voice({ numBeats: beats, beatValue })
        tv.setMode(2); bv.setMode(2)   // SOFT: tolerate quantization rounding
        tv.addTickables(tn)
        bv.addTickables(bn)

        try { Accidental.applyAccidentals([tv, bv], this.vfKey) } catch { /* skip */ }

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

        // ── Collect rendered note elements for highlighting ────────────────
        this._collectNoteEls(tn, qm.treble)
        this._collectNoteEls(bn, qm.bass)

        // ── Beams ─────────────────────────────────────────────────────────
        const beamT = tn.filter(n => !n.isRest() && BEAMABLE.has(safeGetDur(n)))
        const beamB = bn.filter(n => !n.isRest() && BEAMABLE.has(safeGetDur(n)))
        try { Beam.generateBeams(beamT).forEach(b => b.setContext(ctx).draw()) } catch { /* skip */ }
        try { Beam.generateBeams(beamB).forEach(b => b.setContext(ctx).draw()) } catch { /* skip */ }

        this.layouts.push({
          measure: qm.measure, startMs: qm.startMs, endMs: qm.endMs,
          noteX, noteW, trebleY, bassY,
        })

        xCursor += w
      }
    }

    // ── Cursor line (added last so it renders on top) ─────────────────────────
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line')
    line.setAttribute('x1', '0'); line.setAttribute('x2', '0')
    line.setAttribute('y1', '0'); line.setAttribute('y2', '0')
    line.setAttribute('stroke', CURSOR_COLOR)
    line.setAttribute('stroke-width', '3')
    line.setAttribute('stroke-linecap', 'round')
    line.style.display       = 'none'
    line.style.pointerEvents = 'none'
    svgEl.appendChild(line)
    this._cursorLine = line
  }

  /** After voice.draw(), capture the SVG children of each StaveNote for recoloring. */
  private _collectNoteEls(vfNotes: StaveNote[], qNotes: QuantizedNote[]): void {
    for (let i = 0; i < vfNotes.length; i++) {
      const vfNote = vfNotes[i]
      const qn     = qNotes[i]
      if (!qn) continue

      // VexFlow 4 stores the rendered SVG group in attrs.el after draw()
      const el       = (vfNote as any).attrs?.el as SVGElement | undefined
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
