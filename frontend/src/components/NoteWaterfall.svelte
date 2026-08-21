<script lang="ts">
  import { onMount } from 'svelte'
  import { midiStore } from '../stores/midi'
  import { playbackStore, noteIntervals, buildGradingIntervals, pause, play } from '../stores/playback'
  import { createWaterfallCanvas, type WaterfallCanvas } from '../lib/waterfall-canvas'
  import { HAND_SPLIT, MIDI_MIN, MIDI_MAX, DEFAULT_LEAD_TIME_SEC } from '../lib/waterfall-layout'
  import { bpmAt } from '../lib/recording-types'
  import type { NoteInterval } from '../lib/recording-types'
  import { playNote } from '../stores/audio'
  import { keyToPitchClasses } from '../lib/key-utils'
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
  import {
    initStepState,
    shouldGatePause,
    registerNoteOn,
    type StepState,
  } from '../lib/step-mode'

  /** Currently selected musical key (e.g. "C", "Am", "F#"). Empty = none. */
  export let scaleKey: string = ''

  const LEAD_MS = DEFAULT_LEAD_TIME_SEC * 1000

  let container: HTMLDivElement
  let canvasEl: HTMLCanvasElement
  let waterfall: WaterfallCanvas | null = null
  let prevPressed = new Set<number>()

  // ── Step mode ──────────────────────────────────────────────────────────────
  let stepState: StepState = { groups: [], waitIdx: 0, hit: new Set() }

  function onStepNoteOn(note: number, vel: number) {
    const result = registerNoteOn(stepState, note)
    if (result === 'ignored') return

    playNote(note, vel || 80)
    waterfall!.noteHeld(note)
    waterfall!.showGrade(note, 'perfect')

    if (result === 'group_complete' && get(playbackStore).status === 'paused') {
      play()
    }
  }

  $: if (waterfall && $t) {
    waterfall.setGradeLabels({
      perfect: $t('grade.perfect'),
      good:    $t('grade.good'),
      ok:      $t('grade.ok'),
      miss:    $t('grade.miss'),
      wrong:   $t('grade.wrong'),
    })
    waterfall.setHandLabels($t('waterfall.hand.right'), $t('waterfall.hand.left'))
  }

  // Propagate scale key changes to the canvas
  $: if (waterfall) {
    waterfall.setScaleKey(scaleKey ? keyToPitchClasses(scaleKey) : null)
  }

  let prevHasRecording = false
  let prevPractice = false
  let prevStatus = ''
  let prevSpeed = 1
  let prevProfileOverride: unknown = undefined
  let prevStepMode = false

  onMount(() => {
    waterfall = createWaterfallCanvas(canvasEl)

    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      waterfall!.resize(Math.floor(width), Math.floor(height))
    })
    ro.observe(container)

    // Go → frontend: grade result from backend grading engine
    const offGradeResult = EventsOn('grade:result', (res: {
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
    const offGradeHold = EventsOn('grade:hold', (res: { note: number; holdFraction: number }) => {
      waterfall?.noteReleased(res.note, res.holdFraction)
    })

    const unsubPlayback = playbackStore.subscribe(state => {
      if (!waterfall) return

      const hasRecording = !!state.recording

      // Effective profile: preset override takes precedence over exercise profile.
      const effectiveProfile = state.gradingProfileOverride ?? state.recording?.gradingProfile ?? null

      // Enable/disable practice rendering
      if (hasRecording !== prevHasRecording || state.practice !== prevPractice) {
        prevHasRecording = hasRecording
        prevPractice = state.practice
        if (hasRecording) {
          const ivs = get(noteIntervals)
          const hasLeft  = ivs.some(iv => iv.hand === 'left'  || (!iv.hand && iv.note < HAND_SPLIT))
          const hasRight = ivs.some(iv => iv.hand === 'right' || (!iv.hand && iv.note >= HAND_SPLIT))
          waterfall.setActiveHands(hasLeft && hasRight ? 'both' : hasLeft ? 'left' : 'right')
          const notes = ivs.map(iv => iv.note)
          waterfall.setNoteRange(
            notes.length ? Math.min(...notes) : MIDI_MIN,
            notes.length ? Math.max(...notes) : MIDI_MAX,
          )
          waterfall.enablePractice(ivs, state.practice)
          if (state.practice) {
            const gradingIvs = buildGradingIntervals(ivs)
            // Load intervals into Go grading engine (with full pedagogical fields)
            LoadPracticeIntervals(gradingIvs).catch(() => {/* ignore if not connected */})
            // Load effective grading profile (preset override or exercise profile)
            if (effectiveProfile !== null) {
              LoadGradingProfile(effectiveProfile as Parameters<typeof LoadGradingProfile>[0]).catch(() => {})
            }
            prevProfileOverride = state.gradingProfileOverride
          }
        } else {
          waterfall.setActiveHands('both')
          waterfall.setNoteRange(MIDI_MIN, MIDI_MAX)
          waterfall.disablePractice()
          StopPractice().catch(() => {})
        }
      }

      // Hot-reload grading profile when preset changes mid-session (practice mode only)
      if (state.practice && hasRecording && state.gradingProfileOverride !== prevProfileOverride) {
        prevProfileOverride = state.gradingProfileOverride
        if (effectiveProfile !== null) {
          LoadGradingProfile(effectiveProfile as Parameters<typeof LoadGradingProfile>[0]).catch(() => {})
        }
      }

      waterfall.setSpeed(state.speedMultiplier)
      waterfall.setBpm(state.recording ? bpmAt(state.recording, state.positionMs) : null)
      waterfall.setHairpins(state.recording?.hairpins ?? [])

      if (hasRecording) {
        waterfall.setPracticeTime(state.positionMs - waterfall.getLeadTime() * 1000)
      }

      // Step mode: initialise when the flag turns on; tear down when it turns off.
      if (state.stepMode !== prevStepMode) {
        prevStepMode = state.stepMode
        if (state.stepMode && state.practice && hasRecording) {
          stepState = initStepState(get(noteIntervals), state.positionMs, LEAD_MS)
        } else if (!state.stepMode) {
          stepState = { groups: [], waitIdx: 0, hit: new Set() }
        }
      }

      // Step gate: while playing in step mode, check if the student has missed a
      // note group deadline. positionMs = musical_time + LEAD_MS, so the golden-line
      // deadline for a group is group[0].startMs + LEAD_MS. We give STEP_GATE_MS of
      // grace before pausing, so the student has a small window to play on time.
      if (state.stepMode && state.practice && hasRecording && state.status === 'playing') {
        if (shouldGatePause(stepState, state.positionMs, LEAD_MS)) {
          pause()
        }
      }

      // Sync grading engine with playback transitions (skip in step mode — time-based grading not used)
      if (state.practice && hasRecording && !state.stepMode) {
        const speedChanged = Math.abs(state.speedMultiplier - prevSpeed) > 0.001
        if (state.status === 'playing' && (prevStatus !== 'playing' || speedChanged)) {
          StartPractice(Math.round(state.positionMs), state.speedMultiplier).catch(err => console.error('StartPractice failed', err))
        } else if (state.status !== 'playing' && prevStatus === 'playing') {
          PausePractice(Math.round(state.positionMs)).catch(err => console.error('PausePractice failed', err))
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
        if (!next.has(n)) {
          if (!hasRecording) {
            waterfall.noteOff(n)
          } else if (pb.stepMode && pb.practice) {
            // Step mode: Go grader is disabled, so noteReleased is never fired via
            // grade:hold — clear the holding flag manually on key-up.
            waterfall.noteReleased(n, 1.0)
          }
        }
      }
      for (const n of next) {
        if (!prevPressed.has(n)) {
          if (pb.stepMode && pb.practice && hasRecording) {
            // Step mode: match note against expected group, frontend-only
            onStepNoteOn(n, state.velocity)
          } else if (!hasRecording) {
            // Freeplay: show live bar
            waterfall.noteOn(n, state.velocity)
          }
          // Normal practice/review: grading handled by Go backend via grade:result event
        }
      }

      prevPressed = next
    })

    return () => {
      ro.disconnect()
      offGradeResult()
      offGradeHold()
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
