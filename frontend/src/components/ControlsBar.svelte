<script lang="ts">
  import { playbackStore, noteIntervals, play, pause, stop, rewind, setSpeed, toggleLoop, seekTo, setLoop, setStepMode } from '../stores/playback'
  import Icon from './Icon.svelte'

  /** When true (prep screen active), transport controls are disabled. */
  export let locked = false
  import { audioStore, setVolume, toggleMute, setHandVolume } from '../stores/audio'
  import { HAND_SPLIT } from '../lib/waterfall-layout'
  import { bpmAt } from '../lib/recording-types'
  import { DEFAULT_LEAD_TIME_SEC } from '../lib/waterfall-layout'
  import { DIFFICULTY_COLOR } from '../lib/exercise-types'
  import { t } from '../lib/i18n'

  const LEAD_MS = DEFAULT_LEAD_TIME_SEC * 1000
  const SPEEDS = [0.25, 0.5, 0.75, 1, 1.5, 2] as const

  $: s = $playbackStore
  $: isPlaying   = s.status === 'playing'
  $: hasRec      = !!s.recording
  $: isPractice  = s.practice
  $: stepMode    = s.stepMode
  $: speed       = s.speedMultiplier
  $: loopEnabled = s.loopEnabled
  $: hasLoop     = s.loopStart != null && s.loopEnd != null && s.loopEnd > s.loopStart
  $: sections    = s.recording?.sections ?? []

  $: liveBpm    = s.recording ? bpmAt(s.recording, s.positionMs) : null
  $: currentBpm = liveBpm ? Math.round(liveBpm * speed) : null

  $: audio  = $audioStore
  $: isMuted = audio.muted || audio.volume === 0
  $: isLoading = audio.status === 'loading'
  $: handVolumes = audio.handVolumes

  $: ivs = $noteIntervals
  $: hasBothHands = hasRec &&
    ivs.some(iv => iv.hand === 'right' || (!iv.hand && iv.note >= HAND_SPLIT)) &&
    ivs.some(iv => iv.hand === 'left'  || (!iv.hand && iv.note <  HAND_SPLIT))

  function onVolumeInput(e: Event) {
    setVolume(+(e.currentTarget as HTMLInputElement).value)
  }

  function onRightHandInput(e: Event) {
    setHandVolume('right', +(e.currentTarget as HTMLInputElement).value)
  }

  function onLeftHandInput(e: Event) {
    setHandVolume('left', +(e.currentTarget as HTMLInputElement).value)
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
    <button class="btn" on:click={rewind} disabled={!hasRec || locked} title="Rewind"><Icon name="skip-back" size={14}/></button>
    <button
      class="btn"
      on:click={() => isPlaying ? pause() : play()}
      disabled={!hasRec || locked}
      title={isPlaying ? 'Pause' : 'Play'}
    >
      {#if isPlaying}<Icon name="pause" size={14}/>{:else}<Icon name="play" size={14}/>{/if}
    </button>
    <button class="btn" on:click={stop} disabled={!hasRec || locked} title="Stop"><Icon name="stop" size={14}/></button>
  </div>

  <div class="sep"></div>

  <div class="speed-group">
    <span class="speed-label">{$t('controls.speed')}</span>
    {#each SPEEDS as x}
      <button
        class="speed-pill"
        class:active={Math.abs(speed - x) < 0.01}
        disabled={stepMode || locked}
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
    title={loopEnabled ? $t('controls.loop.disable') : $t('controls.loop.enable')}
  >
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
      <polyline points="17 1 21 5 17 9"/>
      <path d="M3 11V9a4 4 0 0 1 4-4h14"/>
      <polyline points="7 23 3 19 7 15"/>
      <path d="M21 13v2a4 4 0 0 1-4 4H3"/>
    </svg>
  </button>

  {#if isPractice}
    <button
      class="btn step-btn"
      class:active={stepMode}
      disabled={!hasRec || locked}
      on:click={() => setStepMode(!stepMode)}
      title={stepMode ? $t('controls.step.disable') : $t('controls.step.enable')}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
        <line x1="5" y1="12" x2="19" y2="12"/>
        <polyline points="14 7 19 12 14 17"/>
        <line x1="5" y1="5" x2="5" y2="19"/>
      </svg>
    </button>
  {/if}

  <div class="sep"></div>

  {#if hasBothHands}
    <div class="sep"></div>
    <div class="hand-balance-group">
      <div class="hand-row">
        <span class="hand-tag right" class:dim={handVolumes.right === 0}>{$t('waterfall.hand.right.abbr')}</span>
        <input
          type="range" class="hand-slider" min="0" max="100" step="1"
          value={handVolumes.right}
          on:input={onRightHandInput}
          title="{$t('waterfall.hand.right')}: {handVolumes.right}%"
        />
      </div>
      <div class="hand-row">
        <span class="hand-tag left" class:dim={handVolumes.left === 0}>{$t('waterfall.hand.left.abbr')}</span>
        <input
          type="range" class="hand-slider" min="0" max="100" step="1"
          value={handVolumes.left}
          on:input={onLeftHandInput}
          title="{$t('waterfall.hand.left')}: {handVolumes.left}%"
        />
      </div>
    </div>
  {/if}

  <div class="volume-group">
    <button
      class="btn mute-btn"
      class:muted={isMuted}
      on:click={toggleMute}
      title={isMuted ? $t('controls.unmute') : $t('controls.mute')}
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
        <button class="section-pill" on:click={() => goToSection(i)} title="{$t('controls.goto')} {sec.name}">
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

  /* ── Hand balance ───────────────────────────────────────────────────────── */
  .hand-balance-group {
    display: flex;
    flex-direction: column;
    gap: 3px;
    justify-content: center;
  }

  .hand-row {
    display: flex;
    align-items: center;
    gap: 5px;
  }

  .hand-tag {
    font-size: 0.58rem;
    font-weight: 700;
    letter-spacing: 0.04em;
    width: 18px;
    text-align: right;
    transition: color 0.15s;
    flex-shrink: 0;
  }

  .hand-tag.right { color: rgba(185,154,244,0.75); }
  .hand-tag.left  { color: rgba(240,138,91,0.75);  }
  .hand-tag.dim   { color: rgba(255,255,255,0.20); }

  .hand-slider {
    -webkit-appearance: none;
    appearance: none;
    width: 64px;
    height: 3px;
    border-radius: 2px;
    background: rgba(255,255,255,0.13);
    outline: none;
    cursor: pointer;
    transition: background 0.12s;
  }

  .hand-slider:hover {
    background: rgba(255,255,255,0.22);
  }

  .hand-slider::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: rgba(255,255,255,0.70);
    cursor: pointer;
    transition: background 0.12s, transform 0.1s;
  }

  .hand-slider:hover::-webkit-slider-thumb {
    background: #fff;
    transform: scale(1.2);
  }
</style>
