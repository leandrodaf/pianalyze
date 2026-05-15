<script lang="ts">
  import { onMount } from 'svelte'
  import { createTimelineCanvas } from '../lib/timeline-canvas'
  import { playbackStore, noteIntervals, seekTo, setLoop, clearLoop } from '../stores/playback'

  let container: HTMLDivElement
  let canvasEl: HTMLCanvasElement
  let timeline: ReturnType<typeof createTimelineCanvas> | null = null

  // Plain drag = select loop range (auto-enables loop), click = seek, dbl-click = clear loop
  const DRAG_THRESHOLD_PX = 5
  let mouseDownX = -1
  let loopAnchor = -1
  let isDragging = false

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
    mouseDownX = e.clientX
    loopAnchor = getMs(e)
    isDragging = false

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp, { once: true })
  }

  function handleMouseMove(e: MouseEvent) {
    if (!timeline) return

    if (!isDragging && Math.abs(e.clientX - mouseDownX) > DRAG_THRESHOLD_PX) {
      isDragging = true
    }

    if (isDragging) {
      const ms = getMs(e)
      const lo = Math.min(loopAnchor, ms)
      const hi = Math.max(loopAnchor, ms)
      if (hi - lo > 50) {
        setLoop(lo, hi)
        seekTo(lo)  // preview notes from start of selection in real time
      }
    }
  }

  function handleMouseUp(e: MouseEvent) {
    if (!isDragging) {
      seekTo(getMs(e))
    }
    isDragging = false
    mouseDownX = -1
    window.removeEventListener('mousemove', handleMouseMove)
  }

  function handleDblClick(_e: MouseEvent) {
    if (!timeline) return
    clearLoop()
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
