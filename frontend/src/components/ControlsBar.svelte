<script lang="ts">
  import { playbackStore, play, pause, stop, rewind, setSpeed, toggleLoop, seekTo, setLoop } from '../stores/playback'
  import { DEFAULT_LEAD_TIME_SEC } from '../lib/waterfall-layout'

  const LEAD_MS = DEFAULT_LEAD_TIME_SEC * 1000
  const SPEEDS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2] as const
  const BPM_STEP = 4
  const BPM_MIN  = 20
  const BPM_MAX  = 300

  $: s = $playbackStore
  $: isPlaying   = s.status === 'playing'
  $: hasRec      = !!s.recording
  $: speed       = s.speedMultiplier
  $: loopEnabled = s.loopEnabled
  $: hasLoop     = s.loopStart != null && s.loopEnd != null && s.loopEnd > s.loopStart
  $: sections    = s.recording?.sections ?? []

  $: originalBpm = s.recording?.bpm ?? null
  $: currentBpm  = originalBpm ? Math.max(BPM_MIN, Math.round(originalBpm * speed)) : null
  $: bpmPct      = originalBpm && currentBpm ? Math.round((currentBpm / originalBpm) * 100) : 100

  function decreaseBpm() {
    if (!originalBpm || currentBpm == null) return
    setSpeed(Math.max(BPM_MIN, currentBpm - BPM_STEP) / originalBpm)
  }

  function increaseBpm() {
    if (!originalBpm || currentBpm == null) return
    setSpeed(Math.min(BPM_MAX, currentBpm + BPM_STEP) / originalBpm)
  }

  function resetBpm() {
    if (!originalBpm) return
    setSpeed(1)
  }

  function goToSection(idx: number) {
    const sec = sections[idx]
    if (!sec) return
    const next = sections[idx + 1]
    const endMs = next ? next.startMs : Math.max(0, s.durationMs - LEAD_MS)
    setLoop(sec.startMs + LEAD_MS, endMs + LEAD_MS)
    seekTo(sec.startMs + LEAD_MS)
  }
</script>

<div class="controls-bar">
  <div class="group">
    <button class="btn" on:click={rewind} disabled={!hasRec} title="Rewind">⏮</button>
    <button
      class="btn"
      on:click={() => isPlaying ? pause() : play()}
      disabled={!hasRec}
      title={isPlaying ? 'Pause' : 'Play'}
    >
      {isPlaying ? '⏸' : '▶'}
    </button>
    <button class="btn" on:click={stop} disabled={!hasRec} title="Stop">⏹</button>
  </div>

  <div class="sep"></div>

  {#if originalBpm && currentBpm != null}
    <div class="bpm-control">
      <button
        class="bpm-step"
        on:click={decreaseBpm}
        disabled={currentBpm <= BPM_MIN}
        title="Diminuir tempo"
      >−</button>
      <button class="bpm-display" on:click={resetBpm} title="Restaurar BPM original">
        <span class="bpm-value">{currentBpm}</span>
        <span class="bpm-unit">BPM</span>
        {#if bpmPct !== 100}
          <span class="bpm-pct">{bpmPct}%</span>
        {/if}
      </button>
      <button
        class="bpm-step"
        on:click={increaseBpm}
        disabled={currentBpm >= BPM_MAX}
        title="Aumentar tempo"
      >+</button>
    </div>
  {:else}
    <div class="group">
      {#each SPEEDS as x}
        <button
          class="speed-pill"
          class:active={speed === x}
          on:click={() => setSpeed(x)}
          title={`${x}x speed`}
        >
          {x}x
        </button>
      {/each}
    </div>
  {/if}

  <div class="sep"></div>

  <button
    class="btn loop-btn"
    class:active={loopEnabled}
    disabled={!hasLoop}
    on:click={toggleLoop}
    title={loopEnabled ? 'Disable loop' : 'Enable loop (Shift+drag on timeline to set region)'}
  >
    🔁
  </button>
  {#if sections.length > 0}
    <div class="sep"></div>
    <div class="group sections-group">
      {#each sections as sec, i}
        <button class="section-pill" on:click={() => goToSection(i)} title="Ir para {sec.name}">
          {sec.name}
        </button>
      {/each}
    </div>
  {/if}
</div>

<style>
  .controls-bar {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    height: 100%;
    padding: 0 0.75rem;
  }

  .group {
    display: flex;
    align-items: center;
    gap: 0.25rem;
  }

  .btn {
    display: flex;
    align-items: center;
    justify-content: center;
    min-width: 28px;
    height: 26px;
    padding: 0 0.4rem;
    background: rgba(255,255,255,0.06);
    border: 1px solid rgba(255,255,255,0.1);
    border-radius: 5px;
    color: rgba(255,255,255,0.65);
    font-size: 0.8rem;
    cursor: pointer;
    transition: background 0.12s, color 0.12s;
    line-height: 1;
  }

  .btn:hover:not(:disabled) {
    background: rgba(255,255,255,0.12);
    color: #fff;
  }

  .btn:disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }

  .btn.active {
    background: rgba(123,95,240,0.22);
    border-color: rgba(123,95,240,0.5);
    color: #c4aef8;
  }

  .speed-pill {
    height: 22px;
    padding: 0 0.45rem;
    background: rgba(255,255,255,0.04);
    border: 1px solid rgba(255,255,255,0.08);
    border-radius: 11px;
    color: rgba(255,255,255,0.4);
    font-size: 0.7rem;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.12s, color 0.12s, border-color 0.12s;
    white-space: nowrap;
  }

  .speed-pill:hover {
    background: rgba(255,255,255,0.08);
    color: rgba(255,255,255,0.75);
  }

  .speed-pill.active {
    background: rgba(123,95,240,0.22);
    border-color: rgba(123,95,240,0.55);
    color: #c4aef8;
    font-weight: 700;
  }

  .loop-btn {
    font-size: 0.9rem;
  }

  /* ── BPM control ─────────────────────────────────────────────────────────── */
  .bpm-control {
    display: flex;
    align-items: center;
    gap: 0;
    background: rgba(255,255,255,0.04);
    border: 1px solid rgba(255,255,255,0.1);
    border-radius: 8px;
    overflow: hidden;
  }

  .bpm-step {
    width: 22px;
    height: 26px;
    background: transparent;
    border: none;
    color: rgba(255,255,255,0.5);
    font-size: 1rem;
    font-weight: 700;
    cursor: pointer;
    transition: background 0.1s, color 0.1s;
    line-height: 1;
    flex-shrink: 0;
  }
  .bpm-step:hover:not(:disabled) {
    background: rgba(255,255,255,0.1);
    color: #fff;
  }
  .bpm-step:disabled {
    opacity: 0.25;
    cursor: not-allowed;
  }

  .bpm-display {
    display: flex;
    align-items: baseline;
    gap: 3px;
    padding: 0 0.3rem;
    height: 26px;
    background: transparent;
    border: none;
    border-left: 1px solid rgba(255,255,255,0.08);
    border-right: 1px solid rgba(255,255,255,0.08);
    cursor: pointer;
    transition: background 0.1s;
    min-width: 64px;
    justify-content: center;
  }
  .bpm-display:hover {
    background: rgba(255,255,255,0.06);
  }

  .bpm-value {
    font-size: 0.9rem;
    font-weight: 700;
    color: rgba(255,255,255,0.88);
    letter-spacing: -0.02em;
    font-variant-numeric: tabular-nums;
  }
  .bpm-unit {
    font-size: 0.6rem;
    font-weight: 600;
    color: rgba(255,255,255,0.35);
    letter-spacing: 0.05em;
    align-self: center;
  }
  .bpm-pct {
    font-size: 0.6rem;
    font-weight: 600;
    color: rgba(255,210,50,0.6);
    letter-spacing: 0.02em;
    align-self: center;
  }

  .sections-group {
    flex-wrap: nowrap;
    overflow: hidden;
    max-width: 240px;
  }
  .section-pill {
    height: 22px;
    padding: 0 0.5rem;
    background: rgba(255,210,50,0.08);
    border: 1px solid rgba(255,210,50,0.2);
    border-radius: 11px;
    color: rgba(255,210,50,0.7);
    font-size: 0.68rem;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.12s, color 0.12s, border-color 0.12s;
    white-space: nowrap;
  }
  .section-pill:hover {
    background: rgba(255,210,50,0.16);
    border-color: rgba(255,210,50,0.45);
    color: rgba(255,210,50,1);
  }

  .sep {
    width: 1px;
    height: 20px;
    background: rgba(255,255,255,0.08);
    flex-shrink: 0;
    margin: 0 0.1rem;
  }
</style>
