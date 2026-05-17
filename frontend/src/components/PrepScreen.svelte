<script lang="ts">
  import { onMount } from 'svelte'
  import { get } from 'svelte/store'
  import { midiStore } from '../stores/midi'
  import { noteIntervals } from '../stores/playback'
  import { createPianoCanvas } from '../lib/piano-canvas'
  import { FINGER_COLORS } from '../lib/finger-colors'
  import { noteColor } from '../lib/note-colors'
  import { t } from '../lib/i18n'

  export let onComplete: () => void
  export let onSkip:    () => void

  let container: HTMLDivElement
  let canvasEl:  HTMLCanvasElement
  let piano: ReturnType<typeof createPianoCanvas> | null = null

  // note → CSS color (from finger or note palette)
  let requiredKeys = new Map<number, string>()
  let confirmed    = new Set<number>()
  let done         = false

  $: total = requiredKeys.size
  $: count = confirmed.size
  $: pct   = total > 0 ? (count / total) * 100 : 0

  // Auto-proceed when all keys confirmed; `done` guards against re-entry.
  $: if (!done && count >= total && total > 0) {
    done = true
    setTimeout(onComplete, 750)
  }

  onMount(() => {
    piano = createPianoCanvas(canvasEl)

    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      piano!.resize(Math.floor(width), Math.floor(height))
    })
    ro.observe(container)

    // Collect all unique notes from the recording with their finger colors
    for (const iv of get(noteIntervals)) {
      if (!requiredKeys.has(iv.note)) {
        requiredKeys.set(
          iv.note,
          iv.finger != null ? FINGER_COLORS[iv.finger] : noteColor(iv.note),
        )
      }
    }
    requiredKeys = requiredKeys

    // If nothing to prepare (no recording / no notes), skip immediately
    if (requiredKeys.size === 0) { onSkip(); return }

    piano.setGuideNotes(new Map(requiredKeys))

    const unsubMidi = midiStore.subscribe(state => {
      if (!piano || done) return

      piano.updateKeys(state.pressedNotes, state.velocity)

      let changed = false
      for (const n of state.pressedNotes) {
        if (requiredKeys.has(n) && !confirmed.has(n)) {
          confirmed.add(n)
          changed = true
        }
      }

      if (changed) {
        confirmed = confirmed // trigger reactivity

        // Remove confirmed keys from the guide so the student sees progress
        const remaining = new Map<number, string>()
        for (const [n, c] of requiredKeys) {
          if (!confirmed.has(n)) remaining.set(n, c)
        }
        piano.setGuideNotes(remaining)
      }
    })

    return () => { unsubMidi(); ro.disconnect() }
  })
</script>

<div class="prep-screen">
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
  </div>

  <div class="prep-bar-wrap">
    <div class="prep-bar-fill" style="width:{pct}%"></div>
  </div>

  <div class="prep-legend">
    {#each [...requiredKeys].filter(([n]) => !confirmed.has(n)) as [, color]}
      <span class="prep-dot" style="background:{color}"></span>
    {/each}
  </div>

  <div class="prep-piano" bind:this={container}>
    <canvas bind:this={canvasEl}></canvas>
  </div>
</div>

<style>
  .prep-screen {
    display: flex;
    flex-direction: column;
    width: 100vw;
    height: 100vh;
    background: #0f1014;
    overflow: hidden;
  }

  /* ── Top bar ─────────────────────────────────────────────────────────── */
  .prep-top {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    gap: 1.5rem;
    padding: 1.2rem 1.5rem;
    background: rgba(0,0,0,0.35);
    border-bottom: 1px solid rgba(255,255,255,0.07);
  }

  .prep-titles {
    display: flex;
    align-items: center;
    gap: 0.9rem;
    flex: 1;
  }

  .prep-icon { font-size: 1.8rem; }

  .prep-title {
    font-size: 1.15rem;
    font-weight: 700;
    color: #fff;
    letter-spacing: -0.01em;
  }

  .prep-sub {
    font-size: 0.75rem;
    color: rgba(255,255,255,0.4);
    margin-top: 2px;
  }

  .prep-counter {
    display: flex;
    align-items: baseline;
    gap: 0.25rem;
    flex-shrink: 0;
  }

  .prep-num {
    font-size: 2.2rem;
    font-weight: 800;
    color: #ffd700;
    line-height: 1;
    font-variant-numeric: tabular-nums;
  }

  .prep-sep {
    font-size: 1.4rem;
    color: rgba(255,255,255,0.25);
    font-weight: 300;
  }

  .prep-total {
    font-size: 1.4rem;
    color: rgba(255,255,255,0.5);
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }

  .prep-label {
    font-size: 0.75rem;
    color: rgba(255,255,255,0.3);
    font-weight: 500;
    margin-left: 4px;
    align-self: center;
  }

  .prep-ready {
    font-size: 1.1rem;
    font-weight: 700;
    color: #4ec080;
    letter-spacing: 0.02em;
  }

  .prep-skip-btn {
    flex-shrink: 0;
    padding: 0.35rem 0.9rem;
    background: rgba(255,255,255,0.06);
    border: 1px solid rgba(255,255,255,0.1);
    border-radius: 6px;
    color: rgba(255,255,255,0.45);
    font-size: 0.78rem;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.15s, color 0.15s;
  }

  .prep-skip-btn:hover {
    background: rgba(255,255,255,0.12);
    color: rgba(255,255,255,0.8);
  }

  /* ── Progress bar ────────────────────────────────────────────────────── */
  .prep-bar-wrap {
    flex-shrink: 0;
    height: 4px;
    background: rgba(255,255,255,0.06);
  }

  .prep-bar-fill {
    height: 100%;
    background: linear-gradient(90deg, #7b5ff0, #ffd700);
    transition: width 0.25s ease-out;
  }

  /* ── Remaining dots ──────────────────────────────────────────────────── */
  .prep-legend {
    flex-shrink: 0;
    display: flex;
    flex-wrap: wrap;
    gap: 5px;
    padding: 0.6rem 1.5rem 0.4rem;
    min-height: 28px;
  }

  .prep-dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    opacity: 0.75;
    transition: opacity 0.2s;
  }

  /* ── Piano ───────────────────────────────────────────────────────────── */
  .prep-piano {
    flex: 1;
    min-height: 0;
    background: #000;
    border-top: 1px solid rgba(255,255,255,0.05);
  }

  canvas {
    display: block;
    width: 100%;
    height: 100%;
  }
</style>
