<script lang="ts">
  import { midiStore } from '../stores/midi'

  $: velocity = $midiStore.velocity
  $: dynamic = $midiStore.dynamic

  // Normalised fill height 0–1
  $: fillRatio = velocity / 127

  // Pick a colour based on dynamic level
  $: barColor = dynamicColor(dynamic)

  function dynamicColor(d: string): string {
    switch (d) {
      case 'ppp': return '#8dcffa'
      case 'pp':  return '#6ab7f5'
      case 'p':   return '#5aa8f0'
      case 'mp':  return '#4f9cf5'
      case 'mf':  return '#3a88e0'
      case 'f':   return '#f59e42'
      case 'ff':  return '#f56542'
      case 'fff': return '#e03010'
      default:    return '#333'
    }
  }
</script>

<div class="dynamic-meter">
  <div class="bar-track">
    <div
      class="bar-fill"
      style="height: {fillRatio * 100}%; background: {barColor};"
    ></div>
  </div>
  <div class="label">{dynamic || '—'}</div>
</div>

<style>
  .dynamic-meter {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
    padding: 0.75rem 0.5rem;
    height: 100%;
  }

  .bar-track {
    flex: 1;
    width: 28px;
    background: #222;
    border-radius: 4px;
    border: 1px solid #333;
    display: flex;
    flex-direction: column;
    justify-content: flex-end;
    overflow: hidden;
  }

  .bar-fill {
    width: 100%;
    border-radius: 3px;
    transition: height 0.12s ease-out, background 0.12s ease-out;
    min-height: 2px;
  }

  .label {
    font-size: 0.9rem;
    font-weight: 700;
    color: #e0e0e0;
    min-width: 2.2rem;
    text-align: center;
    letter-spacing: 0.05em;
  }
</style>
