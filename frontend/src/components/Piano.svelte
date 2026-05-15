<script lang="ts">
  import { onMount } from 'svelte'
  import { get } from 'svelte/store'
  import { midiStore } from '../stores/midi'
  import { playbackStore, noteIntervals } from '../stores/playback'
  import { prepStore } from '../stores/prep'
  import { createPianoCanvas, type PianoCanvas } from '../lib/piano-canvas'
  import { DEFAULT_LEAD_TIME_SEC } from '../lib/waterfall-layout'
  import { FINGER_COLORS } from '../lib/finger-colors'
  import { noteColor } from '../lib/note-colors'

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

    // Mirrors prep guide state into piano keys and handles confirmation.
    // Piano owns this so there's no async reactive chain.
    const unsubPrep = prepStore.subscribe(prep => {
      if (!piano) return
      if (!prep.active) {
        // Clear prep guides when prep ends; playback subscription takes over
        piano.setGuideNotes(new Map())
        return
      }
      const guide = new Map<number, string>()
      for (const [n, c] of prep.requiredKeys) {
        if (!prep.confirmedKeys.has(n)) guide.set(n, c)
      }
      piano.setGuideNotes(guide)
      piano.setFingerMap(new Map())
    })

    const unsubMidi = midiStore.subscribe(state => {
      if (!piano) return
      // Show all pressed keys regardless of mode
      piano.updateKeys(state.pressedNotes, state.velocity)

      // In prep mode, confirm required keys that are now pressed
      const prep = get(prepStore)
      if (prep.active) {
        for (const n of state.pressedNotes) {
          prepStore.confirm(n)
        }
      }
    })

    const unsubPlayback = playbackStore.subscribe(state => {
      if (!piano) return
      if (get(prepStore).active) return  // prep owns guide notes

      const guide = new Map<number, string>()
      if (state.recording) {
        const practiceMs = state.positionMs - DEFAULT_LEAD_TIME_SEC * 1000
        for (const iv of $noteIntervals) {
          if (iv.startMs <= practiceMs && practiceMs < iv.endMs) {
            if (!guide.has(iv.note)) {
              guide.set(iv.note, iv.finger != null ? FINGER_COLORS[iv.finger] : noteColor(iv.note))
            }
          }
        }
      }
      piano.setGuideNotes(guide)
      piano.setFingerMap(new Map())
    })

    return () => {
      ro.disconnect()
      unsubPrep()
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
