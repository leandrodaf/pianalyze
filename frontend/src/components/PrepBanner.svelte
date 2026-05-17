<script lang="ts">
  import { onDestroy } from 'svelte'
  import { prepStore } from '../stores/prep'
  import { t } from '../lib/i18n'

  export let onComplete: () => void
  export let onSkip:    () => void
  export let onBack:    () => void

  let done = false
  let timer: ReturnType<typeof setTimeout> | null = null

  $: total = $prepStore.requiredKeys.size
  $: count = $prepStore.confirmedKeys.size
  $: pct   = total > 0 ? (count / total) * 100 : 0

  // Piano.svelte handles confirmation; we just watch for completion
  $: if (!done && count >= total && total > 0) {
    done = true
    timer = setTimeout(onComplete, 750)
  }

  onDestroy(() => {
    if (timer !== null) clearTimeout(timer)
  })
</script>

<div class="prep-banner">
  <div class="prep-top">
    <div class="prep-titles">
      <span class="prep-icon">🎹</span>
      <div>
        <div class="prep-title">{$t('prep.title')}</div>
        <div class="prep-sub">{$t('prep.sub')}</div>
      </div>
    </div>

    <div class="prep-counter">
      {#if done}
        <span class="prep-ready">{$t('prep.starting')}</span>
      {:else}
        <span class="prep-num">{count}</span>
        <span class="prep-sep">/</span>
        <span class="prep-total">{total}</span>
        <span class="prep-label">{$t('prep.keys')}</span>
      {/if}
    </div>

    <button class="prep-skip-btn" on:click={onSkip}>{$t('prep.skip')}</button>
    <button class="prep-back-btn" on:click={onBack}>{$t('app.back')}</button>
  </div>

  <div class="prep-bar-wrap">
    <div class="prep-bar-fill" style="width:{pct}%"></div>
  </div>
</div>

<style>
  .prep-banner {
    flex-shrink: 0;
    background: rgba(0,0,0,0.55);
    border-bottom: 1px solid rgba(255,255,255,0.10);
  }

  .prep-top {
    display: flex;
    align-items: center;
    gap: 1.5rem;
    padding: 0.7rem 1rem;
  }

  .prep-titles {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    flex: 1;
  }

  .prep-icon { font-size: 1.5rem; }

  .prep-title {
    font-size: 0.95rem;
    font-weight: 700;
    color: #fff;
    letter-spacing: -0.01em;
  }

  .prep-sub {
    font-size: 0.70rem;
    color: rgba(255,255,255,0.38);
    margin-top: 1px;
  }

  .prep-counter {
    display: flex;
    align-items: baseline;
    gap: 0.2rem;
    flex-shrink: 0;
  }

  .prep-num {
    font-size: 1.9rem;
    font-weight: 800;
    color: #ffd700;
    line-height: 1;
    font-variant-numeric: tabular-nums;
  }

  .prep-sep {
    font-size: 1.2rem;
    color: rgba(255,255,255,0.25);
    font-weight: 300;
  }

  .prep-total {
    font-size: 1.2rem;
    color: rgba(255,255,255,0.5);
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }

  .prep-label {
    font-size: 0.70rem;
    color: rgba(255,255,255,0.3);
    font-weight: 500;
    margin-left: 3px;
    align-self: center;
  }

  .prep-ready {
    font-size: 1rem;
    font-weight: 700;
    color: #4ec080;
    letter-spacing: 0.02em;
  }

  .prep-skip-btn {
    flex-shrink: 0;
    padding: 0.30rem 0.80rem;
    background: rgba(255,255,255,0.06);
    border: 1px solid rgba(255,255,255,0.10);
    border-radius: 6px;
    color: rgba(255,255,255,0.45);
    font-size: 0.75rem;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.15s, color 0.15s;
  }

  .prep-skip-btn:hover {
    background: rgba(255,255,255,0.12);
    color: rgba(255,255,255,0.8);
  }

  .prep-back-btn {
    flex-shrink: 0;
    padding: 0.30rem 0.65rem;
    background: transparent;
    border: none;
    color: rgba(255,255,255,0.28);
    font-size: 0.70rem;
    font-weight: 600;
    cursor: pointer;
    transition: color 0.15s;
  }

  .prep-back-btn:hover {
    color: rgba(255,255,255,0.65);
  }

  .prep-bar-wrap {
    height: 3px;
    background: rgba(255,255,255,0.06);
  }

  .prep-bar-fill {
    height: 100%;
    background: linear-gradient(90deg, #7b5ff0, #ffd700);
    transition: width 0.25s ease-out;
  }
</style>
