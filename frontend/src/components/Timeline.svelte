<script lang="ts">
  import { onMount } from 'svelte'
  import { createTimelineCanvas } from '../lib/timeline-canvas'
  import { DEFAULT_LEAD_TIME_SEC } from '../lib/waterfall-canvas'
  import { playbackStore, noteIntervals, seekTo, setLoop, clearLoop } from '../stores/playback'

  // The waterfall offsets practiceMs by –leadTimeSec:
  //   practiceMs = positionMs − LEAD_MS
  // So everything in the mini timeline must work in "music time" (= practiceMs),
  // converting back to positionMs when writing to the store.
  const LEAD_MS = DEFAULT_LEAD_TIME_SEC * 1000

  let container: HTMLDivElement
  let canvasEl: HTMLCanvasElement
  let timeline: ReturnType<typeof createTimelineCanvas> | null = null

  // Plain drag = select loop range (auto-enables loop), click = seek, dbl-click = clear loop
  const DRAG_THRESHOLD_PX = 5
  let mouseDownX = -1
  let loopAnchor = -1   // in music time (ms)
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
      // Convert positionMs → music time so needle aligns with the golden bar
      timeline.setPosition(Math.max(0, state.positionMs - LEAD_MS))
      timeline.setDuration(state.durationMs)
      // Convert loop store values (positionMs) back to music time for display
      if (state.loopStart != null && state.loopEnd != null) {
        timeline.setLoop(state.loopStart - LEAD_MS, state.loopEnd - LEAD_MS)
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

  /** Returns the music time (ms) under the cursor — matches what the golden bar shows. */
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
        // Store needs positionMs values → add LEAD_MS offset
        setLoop(lo + LEAD_MS, hi + LEAD_MS)
        // Seek so golden bar sits at lo — user sees what will be played there
        seekTo(lo + LEAD_MS)
      }
    }
  }

  function handleMouseUp(e: MouseEvent) {
    if (!isDragging) {
      // Click: seek so the golden bar lands on the clicked music time
      seekTo(getMs(e) + LEAD_MS)
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
