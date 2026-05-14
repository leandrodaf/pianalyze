<script lang="ts">
  import { onMount } from 'svelte'
  import { connectMidiStore, midiStore } from './stores/midi'
  import DeviceSelector from './components/DeviceSelector.svelte'
  import Piano from './components/Piano.svelte'
  import NoteWaterfall from './components/NoteWaterfall.svelte'
  import RecordControls from './components/RecordControls.svelte'
  import ImportControls from './components/ImportControls.svelte'

  let capturing = false

  $: chord     = $midiStore.chord
  $: inversion = $midiStore.inversion
  $: triad     = $midiStore.triad
  $: dynamic   = $midiStore.dynamic
  $: velocity  = $midiStore.velocity
  $: hasChord  = chord && chord !== 'Unknown Chord'
  $: isTriad   = triad && triad !== 'Not a Triad'
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
      default:   return '#2a3040'
    }
  }

  onMount(() => connectMidiStore())

  function onStarted() { capturing = true }
</script>

<main>
  {#if !capturing}
    <DeviceSelector {onStarted} />
  {:else}
    <div class="layout">

      <!-- Scrolling staff + notes -->
      <div class="waterfall-area">
        <NoteWaterfall />
      </div>

      <!-- Thin controls bar: REC | Import/playback | chord + dynamic -->
      <div class="controls-bar">
        <RecordControls />

        <div class="sep"></div>

        <ImportControls />

        <!-- Push chord + dynamic to the right -->
        <div class="spacer"></div>

        <div class="chord-mini">
          {#if hasChord}
            <span class="cn">{chord}</span>
            <span class="ci">{inversion}</span>
            {#if isTriad}<span class="tb">triad</span>{/if}
          {:else}
            <span class="ce">—</span>
          {/if}
        </div>

        <div class="meter">
          <div class="bar-track">
            <div class="bar-fill" style="height:{fillRatio*100}%;background:{barColor}"></div>
          </div>
          <span class="dyn">{dynamic || '—'}</span>
        </div>
      </div>

      <!-- Piano keyboard -->
      <div class="piano-area">
        <Piano />
      </div>

    </div>
  {/if}
</main>

<style>
  :global(*) { box-sizing: border-box; }
  :global(body) {
    margin: 0; padding: 0;
    background: #0d1a28;
    font-family: system-ui, -apple-system, sans-serif;
    overflow: hidden;
    -webkit-font-smoothing: antialiased;
  }

  main { width: 100vw; height: 100vh; display: flex; flex-direction: column; }

  .layout {
    display: flex;
    flex-direction: column;
    width: 100%;
    height: 100%;
  }

  .waterfall-area {
    flex: 1;
    min-height: 0;
  }

  /* ── Controls bar ─────────────────────────────────────────────── */
  .controls-bar {
    flex-shrink: 0;
    height: 40px;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0 0.75rem;
    background: #0c1520;
    border-top: 1px solid #1a2535;
    border-bottom: 1px solid #1a2535;
  }

  .sep {
    width: 1px; height: 20px;
    background: #1e2d42;
    flex-shrink: 0;
  }

  .spacer { flex: 1; }

  /* Chord mini-display */
  .chord-mini {
    display: flex;
    align-items: baseline;
    gap: 0.35rem;
  }
  .cn { font-size: 0.95rem; font-weight: 700; color: #d0d8e8; }
  .ci { font-size: 0.65rem; color: #5a6a80; }
  .ce { font-size: 0.85rem; color: #2a3a50; font-weight: 300; }
  .tb {
    padding: 0.05rem 0.35rem;
    background: rgba(79, 156, 245, 0.15);
    border: 1px solid #2a4a7a;
    border-radius: 8px;
    font-size: 0.58rem; color: #4f9cf5;
    font-weight: 600; letter-spacing: 0.07em;
    text-transform: uppercase;
  }

  /* Velocity bar */
  .meter {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    margin-left: 0.5rem;
  }
  .bar-track {
    width: 14px; height: 24px;
    background: #121e2e;
    border: 1px solid #1e2d42;
    border-radius: 2px;
    display: flex; flex-direction: column; justify-content: flex-end;
    overflow: hidden;
  }
  .bar-fill {
    width: 100%; border-radius: 1px;
    transition: height 0.1s ease-out, background 0.1s ease-out;
    min-height: 2px;
  }
  .dyn { font-size: 0.68rem; font-weight: 700; color: #6a7a90; letter-spacing: 0.05em; }

  /* ── Piano strip ──────────────────────────────────────────────── */
  .piano-area {
    height: 160px;
    flex-shrink: 0;
    background: #0a0e14;
  }
</style>
