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
  let prevHasRecording = false
  let prevPractice = false

  onMount(() => {
    waterfall = createWaterfallCanvas(canvasEl)

    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      waterfall!.resize(Math.floor(width), Math.floor(height))
    })
    ro.observe(container)

    // Keep waterfall in sync with playback position.
    // Both practice mode (graded) and review mode (non-graded) use practice rendering
    // so that notes always approach from the right. In review mode, MIDI events are
    // delayed by LEAD_MS in the playback engine so they fire exactly when the bar hits
    // the golden line.
    const unsubPlayback = playbackStore.subscribe(state => {
      if (!waterfall) return

      const hasRecording = !!state.recording
      if (hasRecording !== prevHasRecording || state.practice !== prevPractice) {
        prevHasRecording = hasRecording
        prevPractice = state.practice
        if (hasRecording) {
          waterfall.enablePractice(get(noteIntervals), state.practice)
        } else {
          waterfall.disablePractice()
        }
      }

      waterfall.setSpeed(state.speedMultiplier)
      waterfall.setBpm(state.recording?.bpm ?? null)

      if (hasRecording) {
        waterfall.setPracticeTime(state.positionMs - waterfall.getLeadTime() * 1000)
      }
    })

    const unsubMidi = midiStore.subscribe(state => {
      if (!waterfall) return
      const next = new Set(state.pressedNotes)
      const pb = get(playbackStore)
      const isPractice = pb.practice
      const hasRecording = !!pb.recording

      for (const n of prevPressed) {
        if (!next.has(n)) {
          // Live freeplay only — practice/review bars are managed by the waterfall itself
          if (!hasRecording) waterfall.noteOff(n)
        }
      }
      for (const n of next) {
        if (!prevPressed.has(n)) {
          if (isPractice) {
            const grade = gradeInput(n, pb.positionMs - waterfall.getLeadTime() * 1000)
            waterfall.showGrade(n, grade)
          } else if (!hasRecording) {
            // Freeplay: show live bar
            waterfall.noteOn(n, state.velocity)
          }
          // Review mode: bars already rendered via practice rendering; keyboard is lit by Piano.svelte
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
