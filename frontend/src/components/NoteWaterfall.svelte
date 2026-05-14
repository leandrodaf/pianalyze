<script lang="ts">
  import { onMount } from 'svelte'
  import { midiStore } from '../stores/midi'
  import { createWaterfallCanvas, type WaterfallCanvas } from '../lib/waterfall-canvas'

  let container: HTMLDivElement
  let canvasEl: HTMLCanvasElement
  let waterfall: WaterfallCanvas | null = null
  let prevPressed = new Set<number>()

  onMount(() => {
    waterfall = createWaterfallCanvas(canvasEl)

    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      waterfall!.resize(Math.floor(width), Math.floor(height))
    })
    ro.observe(container)

    const unsub = midiStore.subscribe(state => {
      if (!waterfall) return
      const next = new Set(state.pressedNotes)

      for (const n of prevPressed) {
        if (!next.has(n)) waterfall.noteOff(n)
      }
      for (const n of next) {
        if (!prevPressed.has(n)) waterfall.noteOn(n, state.velocity)
      }

      prevPressed = next
    })

    return () => {
      ro.disconnect()
      unsub()
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
