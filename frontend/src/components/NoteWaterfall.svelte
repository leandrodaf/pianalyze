<script lang="ts">
  import { onMount } from 'svelte'
  import { midiStore } from '../stores/midi'
  import { playbackStore, noteIntervals, gradeInput } from '../stores/playback'
  import { createWaterfallCanvas, type WaterfallCanvas } from '../lib/waterfall-canvas'
  import { get } from 'svelte/store'

  let container: HTMLDivElement
  let canvasEl: HTMLCanvasElement
  let waterfall: WaterfallCanvas | null = null
  let prevPressed = new Set<number>()
  let prevPractice = false

  onMount(() => {
    waterfall = createWaterfallCanvas(canvasEl)

    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      waterfall!.resize(Math.floor(width), Math.floor(height))
    })
    ro.observe(container)

    // Keep waterfall in sync with playback position and practice mode
    const unsubPlayback = playbackStore.subscribe(state => {
      if (!waterfall) return

      if (state.practice !== prevPractice) {
        prevPractice = state.practice
        if (state.practice) {
          waterfall.enablePractice(get(noteIntervals))
        } else {
          waterfall.disablePractice()
        }
      }

      waterfall.setSpeed(state.speedMultiplier)

      if (state.practice) {
        // Offset by lead time so positionMs=0 shows the first notes at the right edge,
        // not already on the golden line.
        waterfall.setPracticeTime(state.positionMs - waterfall.getLeadTime() * 1000)
      }
    })

    const unsubMidi = midiStore.subscribe(state => {
      if (!waterfall) return
      const next = new Set(state.pressedNotes)
      const isPractice = get(playbackStore).practice

      for (const n of prevPressed) {
        if (!next.has(n)) {
          if (!isPractice) waterfall.noteOff(n)
        }
      }
      for (const n of next) {
        if (!prevPressed.has(n)) {
          if (isPractice) {
            // Subtract lead time: positionMs is playback time, but grading compares against music time
            const grade = gradeInput(n, get(playbackStore).positionMs - waterfall.getLeadTime() * 1000)
            waterfall.showGrade(n, grade)
          } else {
            waterfall.noteOn(n, state.velocity)
          }
        }
      }

      prevPressed = next
    })

    return () => {
      ro.disconnect()
      unsubPlayback()
      unsubMidi()
      waterfall?.destroy()
    }
  })
</script>

<div class="waterfall-wrapper" bind:this={container}>
  <canvas bind:this={canvasEl}></canvas>
</div>

<style>
  .waterfall-wrapper {
    width: 100%;
    height: 100%;
    overflow: hidden;
  }

  canvas {
    display: block;
    width: 100%;
    height: 100%;
  }
</style>
