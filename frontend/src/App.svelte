<script lang="ts">
  import { onMount } from 'svelte'
  import { connectMidiStore } from './stores/midi'
  import DeviceSelector from './components/DeviceSelector.svelte'
  import Piano from './components/Piano.svelte'
  import ChordPanel from './components/ChordPanel.svelte'
  import DynamicMeter from './components/DynamicMeter.svelte'
  import IntervalDisplay from './components/IntervalDisplay.svelte'

  let capturing = false

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
      <div class="piano-area">
        <Piano />
      </div>
      <div class="info-bar">
        <ChordPanel />
        <div class="divider"></div>
        <DynamicMeter />
        <div class="divider"></div>
        <IntervalDisplay />
      </div>
    </div>
  {/if}
</main>

<style>
  :global(*) {
    box-sizing: border-box;
  }

  :global(body) {
    margin: 0;
    padding: 0;
    background: #121212;
    font-family: system-ui, -apple-system, sans-serif;
    overflow: hidden;
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

  .piano-area {
    flex: 1;
    min-height: 0;
    padding: 1rem;
  }

  .info-bar {
    height: 140px;
    display: flex;
    flex-direction: row;
    align-items: stretch;
    border-top: 1px solid #222;
    background: #161616;
    padding: 0 1rem;
    gap: 0;
  }

  .divider {
    width: 1px;
    background: #222;
    margin: 0.5rem 0;
    align-self: stretch;
  }
</style>
