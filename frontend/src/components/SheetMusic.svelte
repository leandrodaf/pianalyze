<script lang="ts">
  import { onMount } from 'svelte'
  import { playbackStore, noteIntervals } from '../stores/playback'
  import type { Recording } from '../lib/recording-types'
  import { SheetCanvas } from '../lib/sheet-canvas'
  import { DEFAULT_LEAD_TIME_SEC } from '../lib/waterfall-layout'
  import { get } from 'svelte/store'

  // positionMs leads the recording by LEAD_MS (notes are scheduled LEAD_MS ahead).
  // The musical recording position is positionMs − LEAD_MS — same formula the
  // waterfall uses in setPracticeTime(positionMs − getLeadTime() * 1000).
  const LEAD_MS = DEFAULT_LEAD_TIME_SEC * 1000

  let container: HTMLDivElement
  let sheet: SheetCanvas | null = null
  // Tracks which Recording object was last rendered so we don't re-render on
  // every store tick and also so we catch a new recording even when noteIntervals
  // fires before playbackStore updates (they always change together in loadRecording).
  let lastRenderedRecording: Recording | null = null

  function musicMs(positionMs: number): number {
    return positionMs - LEAD_MS
  }

  onMount(() => {
    sheet = new SheetCanvas(container)

    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      sheet?.resize(Math.floor(width), Math.floor(height))
    })
    ro.observe(container)

    // noteIntervals and playbackStore.recording always change together inside
    // loadRecording(), but noteIntervals.set() fires *before* playbackStore.update().
    // So when the noteIntervals subscriber runs, recording is still null and we
    // must not call setData yet — just mark that the rendered state is stale so the
    // playbackStore subscriber (which fires next) calls setData with both values ready.
    const unsubIntervals = noteIntervals.subscribe(ivs => {
      const state = get(playbackStore)
      if (!sheet) return
      if (ivs.length === 0 || !state.recording) {
        sheet.clearData()
        lastRenderedRecording = null
        return
      }
      // Both stores are already in sync (e.g. noteIntervals was updated independently).
      sheet.setData(ivs, state.recording)
      lastRenderedRecording = state.recording
    })

    // Clear score when recording is unloaded; render when recording is (re)loaded;
    // update cursor on every tick.
    const unsubPlayback = playbackStore.subscribe(state => {
      if (!sheet) return

      if (!state.recording) {
        sheet.clearData()
        lastRenderedRecording = null
        return
      }

      // Render (or re-render) whenever the recording object changes.
      // This handles the common load path where noteIntervals fired first but
      // couldn't render because recording was still null at that point.
      if (state.recording !== lastRenderedRecording) {
        const ivs = get(noteIntervals)
        if (ivs.length > 0) {
          sheet.setData(ivs, state.recording)
        }
        lastRenderedRecording = state.recording
      }

      // Cursor update — playback.ts's own rAF loop drives a playbackStore update
      // on every frame while playing, so no separate rAF loop is needed here.
      sheet.setPosition(musicMs(state.positionMs))
    })

    return () => {
      ro.disconnect()
      unsubIntervals()
      unsubPlayback()
      sheet?.destroy()
      sheet = null
    }
  })
</script>

<div class="sheet-wrapper" bind:this={container}></div>

<style>
  .sheet-wrapper {
    width: 100%;
    height: 100%;
    overflow: hidden;
  }
</style>
