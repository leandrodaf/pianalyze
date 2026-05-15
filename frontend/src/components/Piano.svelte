<script lang="ts">
  import { onMount } from 'svelte'
  import { midiStore } from '../stores/midi'
  import { playbackStore, noteIntervals } from '../stores/playback'
  import { createPianoCanvas, type PianoCanvas } from '../lib/piano-canvas'
  import { DEFAULT_LEAD_TIME_SEC } from '../lib/waterfall-layout'
  import type { Finger } from '../lib/recording-types'

  // Hints shown this many ms before the note is due at the golden line
  const HINT_WINDOW_MS = 1500

  let container: HTMLDivElement
  let canvasEl: HTMLCanvasElement
  let piano: PianoCanvas | null = null

  onMount(() => {
    piano = createPianoCanvas(canvasEl)

    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      piano!.resize(Math.floor(width), Math.floor(height))
    })
    ro.observe(container)

    const unsubMidi = midiStore.subscribe(state => {
      piano?.updateKeys(state.pressedNotes, state.velocity)
    })

    const unsubPlayback = playbackStore.subscribe(state => {
      if (!piano) return
      const hints = new Map<number, Finger>()
      if (state.practice && state.status === 'playing') {
        const practiceMs = state.positionMs - DEFAULT_LEAD_TIME_SEC * 1000
        const ivs = $noteIntervals
        for (const iv of ivs) {
          if (iv.finger == null) continue
          // Show hint for notes about to arrive at the golden line
          if (iv.startMs >= practiceMs && iv.startMs <= practiceMs + HINT_WINDOW_MS) {
            // Closest upcoming note per pitch wins
            if (!hints.has(iv.note)) hints.set(iv.note, iv.finger)
          }
        }
      }
      piano.setFingerMap(hints)
    })

    return () => {
      ro.disconnect()
      unsubMidi()
      unsubPlayback()
    }
  })
</script>

<div class="piano-wrapper" bind:this={container}>
  <canvas bind:this={canvasEl}></canvas>
</div>

<style>
  .piano-wrapper {
    width: 100%;
    height: 100%;
    overflow: hidden;
    background: #000;
  }

  canvas {
    display: block;
    width: 100%;
    height: 100%;
  }
</style>
