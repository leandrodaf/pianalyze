<script lang="ts">
  import { onMount } from 'svelte'
  import { midiStore } from '../stores/midi'
  import { playbackStore, noteIntervals, buildGradingIntervals } from '../stores/playback'
  import { createWaterfallCanvas, type WaterfallCanvas } from '../lib/waterfall-canvas'
  import { bpmAt } from '../lib/recording-types'
  import { get } from 'svelte/store'
  import { EventsOn } from '../../wailsjs/runtime/runtime'
  import {
    LoadPracticeIntervals,
    LoadGradingProfile,
    StartPractice,
    PausePractice,
    StopPractice,
  } from '../../wailsjs/go/main/App'
  import { t } from '../lib/i18n'

  let container: HTMLDivElement
  let canvasEl: HTMLCanvasElement
  let waterfall: WaterfallCanvas | null = null
  let prevPressed = new Set<number>()

  $: if (waterfall && $t) {
    waterfall.setGradeLabels({
      perfect: $t('grade.perfect'),
      good:    $t('grade.good'),
      ok:      $t('grade.ok'),
      miss:    $t('grade.miss'),
      wrong:   $t('grade.wrong'),
    })
  }
  let prevHasRecording = false
  let prevPractice = false
  let prevStatus = ''
  let prevSpeed = 1

  onMount(() => {
    waterfall = createWaterfallCanvas(canvasEl)

    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      waterfall!.resize(Math.floor(width), Math.floor(height))
    })
    ro.observe(container)

    // Go → frontend: grade result from backend grading engine
    EventsOn('grade:result', (res: {
      note: number; grade: string; deltaMs: number
      chordDone?: boolean; chordFrac?: number; chordHit?: number; chordTotal?: number
    }) => {
      if (!waterfall) return
      // noteHeld MUST come before showGrade — showGrade marks bar as graded,
      // which would prevent noteHeld from finding it.
      waterfall.noteHeld(res.note)
      waterfall.showGrade(res.note, res.grade as any)
      if (res.chordDone && res.chordHit != null && res.chordTotal != null) {
        waterfall.showChordResult(res.chordHit, res.chordTotal, res.note)
      }
    })

    // Go → frontend: hold fraction when student releases a note
    EventsOn('grade:hold', (res: { note: number; holdFraction: number }) => {
      waterfall?.noteReleased(res.note, res.holdFraction)
    })

    const unsubPlayback = playbackStore.subscribe(state => {
      if (!waterfall) return

      const hasRecording = !!state.recording

      // Enable/disable practice rendering
      if (hasRecording !== prevHasRecording || state.practice !== prevPractice) {
        prevHasRecording = hasRecording
        prevPractice = state.practice
        if (hasRecording) {
          const ivs = get(noteIntervals)
          waterfall.enablePractice(ivs, state.practice)
          if (state.practice) {
            const gradingIvs = buildGradingIntervals(ivs)
            // Load intervals into Go grading engine (with full pedagogical fields)
            LoadPracticeIntervals(gradingIvs).catch(() => {/* ignore if not connected */})
            // Load per-exercise grading profile if present (G1, G2)
            const profile = state.recording?.gradingProfile ?? null
            LoadGradingProfile(profile).catch(() => {})
          }
        } else {
          waterfall.disablePractice()
          StopPractice().catch(() => {})
        }
      }

      waterfall.setSpeed(state.speedMultiplier)
      waterfall.setBpm(state.recording ? bpmAt(state.recording, state.positionMs) : null)
      waterfall.setHairpins(state.recording?.hairpins ?? [])

      if (hasRecording) {
        waterfall.setPracticeTime(state.positionMs - waterfall.getLeadTime() * 1000)
      }

      // Sync grading engine with playback transitions
      if (state.practice && hasRecording) {
        const speedChanged = Math.abs(state.speedMultiplier - prevSpeed) > 0.001
        if (state.status === 'playing' && (prevStatus !== 'playing' || speedChanged)) {
          StartPractice(state.positionMs, state.speedMultiplier).catch(() => {})
        } else if (state.status !== 'playing' && prevStatus === 'playing') {
          PausePractice(state.positionMs).catch(() => {})
        }
      }
      prevStatus = state.status
      prevSpeed = state.speedMultiplier
    })

    const unsubMidi = midiStore.subscribe(state => {
      if (!waterfall) return
      const next = new Set(state.pressedNotes)
      const pb = get(playbackStore)
      const hasRecording = !!pb.recording

      for (const n of prevPressed) {
        if (!next.has(n) && !hasRecording) {
          waterfall.noteOff(n)
        }
      }
      for (const n of next) {
        if (!prevPressed.has(n)) {
          if (!hasRecording) {
            // Freeplay: show live bar
            waterfall.noteOn(n, state.velocity)
          }
          // Practice/review: grading handled by Go backend via grade:result event
        }
      }

      prevPressed = next
    })

    return () => {
      ro.disconnect()
      unsubPlayback()
      unsubMidi()
      waterfall?.destroy()
      StopPractice().catch(() => {})
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
