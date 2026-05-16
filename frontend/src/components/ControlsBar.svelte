<script lang="ts">
  import { playbackStore, play, pause, stop, rewind, setSpeed, toggleLoop, seekTo, setLoop } from '../stores/playback'
  import { audioStore, setVolume, toggleMute } from '../stores/audio'
  import { bpmAt } from '../lib/recording-types'
  import { DEFAULT_LEAD_TIME_SEC } from '../lib/waterfall-layout'
  import { DIFFICULTY_COLOR } from '../lib/exercise-types'

  const LEAD_MS = DEFAULT_LEAD_TIME_SEC * 1000
  const SPEEDS = [0.25, 0.5, 0.75, 1, 1.5, 2] as const

  $: s = $playbackStore
  $: isPlaying   = s.status === 'playing'
  $: hasRec      = !!s.recording
  $: speed       = s.speedMultiplier
  $: loopEnabled = s.loopEnabled
  $: hasLoop     = s.loopStart != null && s.loopEnd != null && s.loopEnd > s.loopStart
  $: sections    = s.recording?.sections ?? []

  $: liveBpm    = s.recording ? bpmAt(s.recording, s.positionMs) : null
  $: currentBpm = liveBpm ? Math.round(liveBpm * speed) : null

  $: audio  = $audioStore
  $: isMuted = audio.muted || audio.volume === 0
  $: isLoading = audio.status === 'loading'

  function onVolumeInput(e: Event) {
    setVolume(+(e.currentTarget as HTMLInputElement).value)
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

  <div class="speed-group">
    <span class="speed-label">velocidade</span>
    {#each SPEEDS as x}
      <button
        class="speed-pill"
        class:active={Math.abs(speed - x) < 0.01}
        on:click={() => setSpeed(x)}
        title="{x}× {liveBpm ? `(${Math.round(liveBpm * x)} BPM)` : ''}"
      >
        {x === 1 ? '1×' : x < 1 ? `${x * 100 | 0}%` : `${x}×`}
      </button>
    {/each}
    {#if currentBpm != null && (Math.abs(speed - 1) > 0.01 || (s.recording?.tempoMap?.length ?? 0) > 1)}
      <span class="bpm-badge">{currentBpm} BPM</span>
    {/if}
  </div>

  <div class="sep"></div>

  <button
    class="btn loop-btn"
    class:active={loopEnabled}
    disabled={!hasLoop}
    on:click={toggleLoop}
    title={loopEnabled ? 'Desativar loop' : 'Ativar loop (arraste na timeline para definir região)'}
  >
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
      <polyline points="17 1 21 5 17 9"/>
      <path d="M3 11V9a4 4 0 0 1 4-4h14"/>
      <polyline points="7 23 3 19 7 15"/>
      <path d="M21 13v2a4 4 0 0 1-4 4H3"/>
    </svg>
  </button>
  <div class="sep"></div>

  <div class="volume-group">
    <button
      class="btn mute-btn"
      class:muted={isMuted}
      on:click={toggleMute}
      title={isMuted ? 'Reativar som' : 'Silenciar'}
      disabled={isLoading}
    >
      {#if isMuted}
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
          <line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/>
        </svg>
      {:else if audio.volume < 40}
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
          <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
        </svg>
      {:else}
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
          <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
          <path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>
          <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
        </svg>
      {/if}
    </button>
    <input
      type="range"
      class="volume-slider"
      min="0"
      max="100"
      step="1"
      value={audio.muted ? 0 : audio.volume}
      on:input={onVolumeInput}
      title="Volume: {audio.muted ? 0 : audio.volume}%"
    />
  </div>

  {#if sections.length > 0}
    <div class="sep"></div>
    <div class="group sections-group">
      {#each sections as sec, i}
        <button class="section-pill" on:click={() => goToSection(i)} title="Ir para {sec.name}">
          {#if sec.rehearsalMark}
            <span class="rehearsal-mark">[{sec.rehearsalMark}]</span>
          {/if}
          {sec.name}
          {#if sec.difficulty}
            <span class="diff-dot" style="background:{DIFFICULTY_COLOR[sec.difficulty]}"></span>
          {/if}
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

  /* ── Speed control ───────────────────────────────────────────────────────── */
  .speed-group {
    display: flex;
    align-items: center;
    gap: 3px;
  }

  .speed-label {
    font-size: 0.60rem;
    font-weight: 600;
    color: rgba(255,255,255,0.25);
    letter-spacing: 0.06em;
    text-transform: uppercase;
    margin-right: 2px;
    white-space: nowrap;
  }

  .speed-pill {
    height: 26px;
    min-width: 36px;
    padding: 0 0.5rem;
    background: rgba(255,255,255,0.05);
    border: 1px solid rgba(255,255,255,0.10);
    border-radius: 6px;
    color: rgba(255,255,255,0.45);
    font-size: 0.72rem;
    font-weight: 700;
    cursor: pointer;
    transition: background 0.12s, color 0.12s, border-color 0.12s;
    white-space: nowrap;
  }

  .speed-pill:hover {
    background: rgba(255,255,255,0.11);
    color: rgba(255,255,255,0.85);
  }

  .speed-pill.active {
    background: rgba(123,95,240,0.28);
    border-color: rgba(123,95,240,0.65);
    color: #d4bfff;
    font-weight: 800;
  }

  .bpm-badge {
    font-size: 0.62rem;
    font-weight: 600;
    color: rgba(255,210,50,0.55);
    font-variant-numeric: tabular-nums;
    margin-left: 2px;
    white-space: nowrap;
  }

  .loop-btn {
    padding: 0 0.45rem;
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

  .rehearsal-mark {
    font-size: 0.60rem;
    font-weight: 800;
    color: rgba(255,255,255,0.55);
    letter-spacing: 0.02em;
    margin-right: 3px;
  }

  .diff-dot {
    display: inline-block;
    width: 6px;
    height: 6px;
    border-radius: 50%;
    margin-left: 4px;
    vertical-align: middle;
    flex-shrink: 0;
  }

  /* ── Volume control ─────────────────────────────────────────────────────── */
  .volume-group {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .mute-btn {
    padding: 0 0.4rem;
    flex-shrink: 0;
  }

  .mute-btn.muted {
    color: rgba(255,255,255,0.3);
  }

  .volume-slider {
    -webkit-appearance: none;
    appearance: none;
    width: 72px;
    height: 3px;
    border-radius: 2px;
    background: rgba(255,255,255,0.15);
    outline: none;
    cursor: pointer;
    transition: background 0.12s;
  }

  .volume-slider:hover {
    background: rgba(255,255,255,0.25);
  }

  .volume-slider::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: rgba(255,255,255,0.75);
    cursor: pointer;
    transition: background 0.12s, transform 0.1s;
  }

  .volume-slider:hover::-webkit-slider-thumb {
    background: #fff;
    transform: scale(1.15);
  }

  /* ── Difficulty presets — moved to App.svelte top-bar ───────────────────── */

  .sep {
    width: 1px;
    height: 20px;
    background: rgba(255,255,255,0.08);
    flex-shrink: 0;
    margin: 0 0.1rem;
  }
</style>
