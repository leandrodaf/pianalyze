<script lang="ts">
  import { midiStore } from '../stores/midi'

  $: intervalUs = $midiStore.interval
  $: intervalMs = intervalUs > 0 ? (intervalUs / 1000).toFixed(1) : null

  // Rough BPM estimate: assumes interval is the time between consecutive quarter notes.
  $: bpm = intervalUs > 0
    ? Math.round(60_000_000 / intervalUs)
    : null
</script>

<div class="interval-display">
  <div class="value">
    {#if intervalMs !== null}
      {intervalMs} <span class="unit">ms</span>
    {:else}
      <span class="empty">—</span>
    {/if}
  </div>
  {#if bpm !== null && bpm > 20 && bpm < 400}
    <div class="bpm">~{bpm} bpm</div>
  {/if}
  <div class="caption">interval</div>
</div>

<style>
  .interval-display {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 0.75rem 0.5rem;
    height: 100%;
    gap: 0.2rem;
    min-width: 90px;
  }

  .value {
    font-size: 1.1rem;
    font-weight: 700;
    color: #e0e0e0;
    white-space: nowrap;
  }

  .unit {
    font-size: 0.7rem;
    color: #888;
    font-weight: 400;
  }

  .empty {
    color: #444;
    font-weight: 300;
  }

  .bpm {
    font-size: 0.75rem;
    color: #4f9cf5;
  }

  .caption {
    font-size: 0.65rem;
    color: #555;
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }
</style>
