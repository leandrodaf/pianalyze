<script lang="ts">
  import { midiStore } from '../stores/midi'

  $: chord = $midiStore.chord
  $: inversion = $midiStore.inversion
  $: triad = $midiStore.triad
  $: isTriad = triad && triad !== 'Not a Triad'
  $: hasChord = chord && chord !== 'Unknown Chord'
</script>

<div class="chord-panel">
  <div class="chord-name">
    {#if hasChord}
      {chord}
    {:else}
      <span class="empty">—</span>
    {/if}
  </div>

  {#if hasChord}
    <div class="inversion">{inversion}</div>
    {#if isTriad}
      <div class="triad-badge">triad</div>
    {/if}
  {/if}
</div>

<style>
  .chord-panel {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 1rem;
    height: 100%;
    gap: 0.4rem;
    min-width: 160px;
  }

  .chord-name {
    font-size: 1.6rem;
    font-weight: 700;
    color: #e0e0e0;
    text-align: center;
    line-height: 1.2;
  }

  .empty {
    color: #444;
    font-weight: 300;
  }

  .inversion {
    font-size: 0.8rem;
    color: #888;
    text-align: center;
  }

  .triad-badge {
    padding: 0.15rem 0.55rem;
    background: rgba(79, 156, 245, 0.2);
    border: 1px solid #4f9cf5;
    border-radius: 12px;
    font-size: 0.7rem;
    color: #4f9cf5;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }
</style>
