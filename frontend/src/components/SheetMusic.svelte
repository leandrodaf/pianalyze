<script lang="ts">
  import { onMount } from 'svelte'
  import { playbackStore, noteIntervals } from '../stores/playback'
  import { SheetCanvas } from '../lib/sheet-canvas'
  import { DEFAULT_LEAD_TIME_SEC } from '../lib/waterfall-layout'
  import { get } from 'svelte/store'

  // positionMs leads the recording by LEAD_MS (notes are scheduled LEAD_MS ahead).
  // The musical recording position is positionMs − LEAD_MS — same formula the
  // waterfall uses in setPracticeTime(positionMs − getLeadTime() * 1000).
  const LEAD_MS = DEFAULT_LEAD_TIME_SEC * 1000

  let container: HTMLDivElement
  let sheet: SheetCanvas | null = null
  let rafId = 0

  function musicMs(positionMs: number): number {
    return positionMs - LEAD_MS
  }

  function tick() {
    const state = get(playbackStore)
    sheet?.setPosition(musicMs(state.positionMs))
    if (state.status === 'playing') {
      rafId = requestAnimationFrame(tick)
    }
  }

  function stopRaf() {
    if (rafId) { cancelAnimationFrame(rafId); rafId = 0 }
  }

  onMount(() => {
    sheet = new SheetCanvas(container)

    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      sheet?.resize(Math.floor(width), Math.floor(height))
    })
    ro.observe(container)

    // Rebuild the score whenever intervals are (re)loaded
    const unsubIntervals = noteIntervals.subscribe(ivs => {
      const state = get(playbackStore)
      if (!sheet) return
      if (ivs.length === 0 || !state.recording) {
        sheet.clearData()
        return
      }
      sheet.setData(ivs, state.recording)
    })

    // Clear score when recording is unloaded; update cursor on every tick
    const unsubPlayback = playbackStore.subscribe(state => {
      if (!sheet) return

      if (!state.recording) {
        sheet.clearData()
        stopRaf()
        return
      }

      // Cursor update
      sheet.setPosition(musicMs(state.positionMs))

      // Drive rAF loop while playing for smooth cursor animation
      stopRaf()
      if (state.status === 'playing') {
        rafId = requestAnimationFrame(tick)
      }
    })

    return () => {
      stopRaf()
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
