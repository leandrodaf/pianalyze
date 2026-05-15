<script lang="ts">
  import { onMount } from 'svelte'
  import { get } from 'svelte/store'
  import { createTimelineCanvas } from '../lib/timeline-canvas'
  import { playbackStore, noteIntervals, seekTo, setLoop, clearLoop } from '../stores/playback'

  let container: HTMLDivElement
  let canvasEl: HTMLCanvasElement
  let timeline: ReturnType<typeof createTimelineCanvas> | null = null

  type DragMode = 'seek' | 'loop' | null
  let dragMode: DragMode = null
  let loopAnchor = -1

  onMount(() => {
    timeline = createTimelineCanvas(canvasEl)

    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      timeline!.resize(Math.floor(width), Math.floor(height))
    })
    ro.observe(container)

    const unsubPlayback = playbackStore.subscribe(state => {
      if (!timeline) return
      timeline.setPosition(state.positionMs)
      timeline.setDuration(state.durationMs)
      if (state.loopStart != null && state.loopEnd != null) {
        timeline.setLoop(state.loopStart, state.loopEnd)
      } else {
        timeline.clearLoop()
      }
      timeline.setLoopEnabled(state.loopEnabled)
    })

    const unsubIntervals = noteIntervals.subscribe(ivs => {
      timeline?.setIntervals(ivs)
    })

    return () => {
      ro.disconnect()
      unsubPlayback()
      unsubIntervals()
      timeline?.destroy()
    }
  })

  function getMs(e: MouseEvent): number {
    if (!timeline || !canvasEl) return 0
    const rect = canvasEl.getBoundingClientRect()
    const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width))
    return timeline.xToMs(x * (canvasEl.width / rect.width))
  }

  function handleMouseDown(e: MouseEvent) {
    if (!timeline) return
    const ms = getMs(e)

    if (e.shiftKey) {
      dragMode = 'loop'
      loopAnchor = ms
      setLoop(ms, ms)
    } else {
      dragMode = 'seek'
      seekTo(ms)
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp, { once: true })
  }

  function handleMouseMove(e: MouseEvent) {
    if (!timeline || !dragMode) return
    const ms = getMs(e)

    if (dragMode === 'seek') {
      seekTo(ms)
    } else if (dragMode === 'loop') {
      const lo = Math.min(loopAnchor, ms)
      const hi = Math.max(loopAnchor, ms)
      if (hi - lo > 100) setLoop(lo, hi)
    }
  }

  function handleMouseUp() {
    dragMode = null
    window.removeEventListener('mousemove', handleMouseMove)
  }

  function handleDblClick(e: MouseEvent) {
    if (!timeline) return
    const ms = getMs(e)
    const s = get(playbackStore)
    if (s.loopStart == null || s.loopEnd == null) return
    if (ms < s.loopStart || ms > s.loopEnd) clearLoop()
  }
</script>

<div class="timeline-wrapper" bind:this={container}>
  <canvas
    bind:this={canvasEl}
    on:mousedown={handleMouseDown}
    on:dblclick={handleDblClick}
  ></canvas>
</div>

<style>
  .timeline-wrapper {
    width: 100%;
    height: 100%;
    overflow: hidden;
    cursor: crosshair;
    background: #13141a;
    border-top: 1px solid rgba(255,255,255,0.05);
    border-bottom: 1px solid rgba(255,255,255,0.05);
  }

  canvas {
    display: block;
    width: 100%;
    height: 100%;
  }
</style>
