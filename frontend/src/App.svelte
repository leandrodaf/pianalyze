<script lang="ts">
  import { onMount } from 'svelte'
  import { connectMidiStore, midiStore } from './stores/midi'
  import DeviceSelector from './components/DeviceSelector.svelte'
  import Piano from './components/Piano.svelte'
  import NoteWaterfall from './components/NoteWaterfall.svelte'

  let capturing = false

  $: chord    = $midiStore.chord
  $: inversion = $midiStore.inversion
  $: triad    = $midiStore.triad
  $: dynamic  = $midiStore.dynamic
  $: velocity = $midiStore.velocity
  $: hasChord = chord && chord !== 'Unknown Chord'
  $: isTriad  = triad && triad !== 'Not a Triad'
  $: fillRatio = velocity / 127
  $: barColor  = dynamicColor(dynamic)

  function dynamicColor(d: string): string {
    switch (d) {
      case 'pp': return '#6ab7f5'
      case 'p':  return '#5aa8f0'
      case 'mp': return '#4f9cf5'
      case 'mf': return '#3a88e0'
      case 'f':  return '#f59e42'
      case 'ff': return '#f56542'
      default:   return '#333'
    }
  }

  onMount(() => {
    connectMidiStore()
  })

  function onStarted() {
    capturing = true
  }
</script>

<main>
  {#if !capturing}
    <DeviceSelector {onStarted} />
  {:else}
    <div class="layout">
      <div class="waterfall-area">
        <NoteWaterfall />

        <div class="overlay">
          <div class="chord-block">
            {#if hasChord}
              <span class="chord-name">{chord}</span>
              <span class="chord-inv">{inversion}</span>
              {#if isTriad}
                <span class="triad-badge">triad</span>
              {/if}
            {:else}
              <span class="chord-empty">—</span>
            {/if}
          </div>

          <div class="meter-block">
            <div class="bar-track">
              <div
                class="bar-fill"
                style="height: {fillRatio * 100}%; background: {barColor};"
              ></div>
            </div>
            <span class="dynamic-label">{dynamic || '—'}</span>
          </div>
        </div>
      </div>

      <div class="piano-area">
        <Piano />
      </div>
    </div>
  {/if}
</main>

<style>
  :global(*) { box-sizing: border-box; }
  :global(body) {
    margin: 0;
    padding: 0;
    background: #0d1a28;
    font-family: system-ui, -apple-system, sans-serif;
    overflow: hidden;
    -webkit-font-smoothing: antialiased;
  }

  main {
    width: 100vw;
    height: 100vh;
    display: flex;
    flex-direction: column;
  }

  .layout {
    display: flex;
    flex-direction: column;
    width: 100%;
    height: 100%;
  }

  /* Waterfall occupies all remaining height */
  .waterfall-area {
    flex: 1;
    min-height: 0;
    position: relative;
  }

  /* Info overlay — bottom-left corner of the waterfall */
  .overlay {
    position: absolute;
    bottom: 0.75rem;
    left: 0.75rem;
    display: flex;
    align-items: flex-end;
    gap: 1rem;
    pointer-events: none;
  }

  .chord-block {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
  }

  .chord-name {
    font-size: 1.5rem;
    font-weight: 700;
    color: #e0e0e0;
    line-height: 1.1;
    text-shadow: 0 1px 4px rgba(0,0,0,0.8);
  }

  .chord-inv {
    font-size: 0.75rem;
    color: #888;
    text-shadow: 0 1px 4px rgba(0,0,0,0.8);
  }

  .chord-empty {
    font-size: 1.5rem;
    font-weight: 300;
    color: #333;
  }

  .triad-badge {
    padding: 0.1rem 0.45rem;
    background: rgba(79, 156, 245, 0.2);
    border: 1px solid #4f9cf5;
    border-radius: 10px;
    font-size: 0.65rem;
    color: #4f9cf5;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    align-self: flex-start;
  }

  .meter-block {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.25rem;
    height: 64px;
  }

  .bar-track {
    flex: 1;
    width: 20px;
    background: #1c1c22;
    border-radius: 3px;
    border: 1px solid #2a2a32;
    display: flex;
    flex-direction: column;
    justify-content: flex-end;
    overflow: hidden;
  }

  .bar-fill {
    width: 100%;
    border-radius: 2px;
    transition: height 0.1s ease-out, background 0.1s ease-out;
    min-height: 2px;
  }

  .dynamic-label {
    font-size: 0.75rem;
    font-weight: 700;
    color: #bbb;
    letter-spacing: 0.05em;
    text-shadow: 0 1px 4px rgba(0,0,0,0.8);
  }

  /* Piano strip at the bottom */
  .piano-area {
    height: 160px;
    flex-shrink: 0;
    border-top: 1px solid #1a2535;
    background: #0a0e14;
  }
</style>
