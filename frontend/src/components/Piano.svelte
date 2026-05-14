<script lang="ts">
  import { onMount } from 'svelte'
  import { midiStore } from '../stores/midi'
  import { createPianoCanvas, type PianoCanvas } from '../lib/piano-canvas'

  let container: HTMLDivElement
  let canvasEl: HTMLCanvasElement
  let piano: PianoCanvas | null = null

  onMount(() => {
    piano = createPianoCanvas(canvasEl)
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      piano!.resize(Math.floor(width), Math.floor(height))
    })
    ro.observe(container)

    const unsub = midiStore.subscribe(state => {
      piano?.updateKeys(state.pressedNotes, state.velocity)
    })

    return () => {
      ro.disconnect()
      unsub()
    }
  })
</script>

<div class="piano-wrapper" bind:this={container}>
  <canvas bind:this={canvasEl}></canvas>
</div>

<style>
  .piano-wrapper {
    width: 100%;
    height: 100%;
    overflow: hidden;
    background: #111;
    border-radius: 4px;
  }

  canvas {
    display: block;
    width: 100%;
    height: 100%;
  }
</style>
