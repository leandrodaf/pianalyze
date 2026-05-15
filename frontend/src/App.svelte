<script lang="ts">
  import { onMount } from 'svelte'
  import { connectMidiStore, midiStore } from './stores/midi'
  import { loadRecording, setPractice, play, stop, clearLoop, playbackStore, noteIntervals } from './stores/playback'
  import HomeScreen from './components/HomeScreen.svelte'
  import Piano from './components/Piano.svelte'
  import NoteWaterfall from './components/NoteWaterfall.svelte'
  import Timeline from './components/Timeline.svelte'
  import ControlsBar from './components/ControlsBar.svelte'
  import type { Exercise } from './lib/exercise-types'
  import type { Recording } from './lib/recording-types'
  import { t } from './lib/i18n'

  type Page = 'home' | 'playing'

  let page: Page = 'home'
  let deviceReady = false
  let activeExercise: Exercise | null = null

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
      case 'pp': return '#9d7ff0'
      case 'p':  return '#8b6ef0'
      case 'mp': return '#7b5ff0'
      case 'mf': return '#f08a5b'
      case 'f':  return '#e07040'
      case 'ff': return '#d06030'
      default:   return 'rgba(255,255,255,0.08)'
    }
  }

  onMount(() => connectMidiStore())

  function handleDeviceReady() {
    deviceReady = true
  }

  function clearLoadedRecording() {
    stop()
    noteIntervals.set([])
    playbackStore.update(s => ({
      ...s,
      status: 'idle',
      positionMs: 0,
      durationMs: 0,
      recording: null,
      practice: false,
      loopEnabled: false,
      loopStart: null,
      loopEnd: null,
    }))
  }

  function handlePlay(exercise: Exercise | null) {
    activeExercise = exercise
    page = 'playing'
    if (exercise?.data) {
      loadRecording(exercise.data)
      setPractice(true)
    } else {
      clearLoadedRecording()
    }
  }

  function handleImportRecording(recording: Recording) {
    loadRecording(recording)
    setPractice(false)
    activeExercise = null
    page = 'playing'
  }

  function handleStartRecording() {
    activeExercise = null
    clearLoadedRecording()
    page = 'playing'
  }

  function goHome() {
    stop()
    clearLoop()
    activeExercise = null
    page = 'home'
  }
</script>

{#if page === 'home'}
  <HomeScreen
    onPlay={handlePlay}
    onDeviceReady={handleDeviceReady}
    onImportRecording={handleImportRecording}
    onStartRecording={handleStartRecording}
  />

{:else}
  <div class="layout">

    <!-- Top bar -->
    <div class="top-bar">
      <button class="home-btn" on:click={goHome} title={$t('nav.home')}>
        {$t('app.back')}
      </button>
      {#if activeExercise}
        <div class="exercise-tag">
          <span class="exercise-icon">{activeExercise.style.icon}</span>
          <span class="exercise-name">{activeExercise.title}</span>
          <span class="exercise-diff">{activeExercise.subtitle}</span>
        </div>
      {:else}
        <span class="freeplay-tag">🎧 {$t('app.freeplay')}</span>
      {/if}
    </div>

    <!-- Scrolling staff + notes -->
    <div class="waterfall-area">
      <NoteWaterfall />

      <!-- Analysis HUD -->
      <div class="hud" class:hud-active={hasChord}>
        <div class="hud-chord">
          {#if hasChord}
            <span class="hud-name">{chord}</span>
            {#if isTriad}<span class="hud-badge">{$t('music.triad')}</span>{/if}
          {:else}
            <span class="hud-empty">—</span>
          {/if}
        </div>
        {#if hasChord}
          <span class="hud-inv">{inversion}</span>
        {/if}
        <div class="hud-dyn" class:hud-dyn-active={!!dynamic}>
          <div class="hud-bar-track">
            <div class="hud-bar-fill" style="height:{fillRatio*100}%;background:{barColor}"></div>
          </div>
          <span class="hud-dyn-label" style={dynamic ? `color:${barColor}` : ''}>{dynamic || '—'}</span>
        </div>
      </div>
    </div>

    <div class="timeline-area">
      <Timeline />
    </div>

    <!-- Controls bar -->
    <div class="controls-bar">
      <ControlsBar />
    </div>

    <!-- Piano keyboard -->
    <div class="piano-area">
      <Piano />
    </div>

  </div>
{/if}

<style>
  :global(*) { box-sizing: border-box; }
  :global(body) {
    margin: 0; padding: 0;
    background: #0f1014;
    font-family: system-ui, -apple-system, sans-serif;
    overflow: hidden;
    -webkit-font-smoothing: antialiased;
  }

  .layout {
    display: flex;
    flex-direction: column;
    width: 100vw;
    height: 100vh;
  }

  /* ── Top bar ─────────────────────────────────────────────────────────────── */
  .top-bar {
    flex-shrink: 0;
    height: 38px;
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0 0.75rem;
    background: rgba(0,0,0,0.45);
    border-bottom: 1px solid rgba(255,255,255,0.06);
  }

  .home-btn {
    background: rgba(255,255,255,0.06);
    border: 1px solid rgba(255,255,255,0.1);
    border-radius: 6px;
    color: rgba(255,255,255,0.6);
    font-size: 0.75rem;
    font-weight: 600;
    padding: 0.25rem 0.65rem;
    cursor: pointer;
    transition: background 0.15s, color 0.15s;
    letter-spacing: 0.02em;
  }

  .home-btn:hover {
    background: rgba(255,255,255,0.1);
    color: #fff;
  }

  .exercise-tag {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .exercise-icon { font-size: 1rem; }

  .exercise-name {
    font-size: 0.82rem;
    font-weight: 700;
    color: rgba(255,255,255,0.85);
  }

  .exercise-diff {
    font-size: 0.68rem;
    color: rgba(255,255,255,0.28);
  }

  .freeplay-tag {
    font-size: 0.82rem;
    color: rgba(255,255,255,0.45);
    font-weight: 500;
  }

  /* ── Waterfall ───────────────────────────────────────────────────────────── */
  .waterfall-area {
    flex: 1;
    min-height: 0;
    position: relative;
  }

  /* ── Analysis HUD ────────────────────────────────────────────────────────── */
  .hud {
    position: absolute;
    bottom: 14px;
    left: 14px;
    display: flex;
    flex-direction: column;
    gap: 4px;
    background: rgba(10,10,16,0.72);
    border: 1px solid rgba(255,255,255,0.08);
    border-radius: 12px;
    padding: 10px 14px;
    min-width: 120px;
    pointer-events: none;
    opacity: 0.35;
    transition: opacity 0.25s ease;
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
  }
  .hud.hud-active { opacity: 1; }

  .hud-chord {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .hud-name {
    font-size: 1.4rem;
    font-weight: 800;
    color: #fff;
    letter-spacing: -0.02em;
    line-height: 1;
  }
  .hud-empty {
    font-size: 1.1rem;
    color: rgba(255,255,255,0.15);
    font-weight: 300;
  }
  .hud-badge {
    padding: 2px 7px;
    background: rgba(123,95,240,0.22);
    border: 1px solid rgba(123,95,240,0.45);
    border-radius: 8px;
    font-size: 0.55rem;
    color: #c4aef8;
    font-weight: 700;
    letter-spacing: 0.07em;
    text-transform: uppercase;
    align-self: flex-start;
    margin-top: 2px;
  }
  .hud-inv {
    font-size: 0.7rem;
    color: rgba(255,255,255,0.38);
    font-weight: 500;
    letter-spacing: 0.01em;
  }
  .hud-dyn {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-top: 2px;
  }
  .hud-bar-track {
    width: 10px; height: 28px;
    background: rgba(255,255,255,0.06);
    border: 1px solid rgba(255,255,255,0.1);
    border-radius: 3px;
    display: flex; flex-direction: column; justify-content: flex-end;
    overflow: hidden;
    flex-shrink: 0;
  }
  .hud-bar-fill {
    width: 100%;
    transition: height 0.1s ease-out, background 0.1s ease-out;
    min-height: 2px;
  }
  .hud-dyn-label {
    font-size: 0.85rem;
    font-weight: 800;
    color: rgba(255,255,255,0.2);
    letter-spacing: 0.06em;
    transition: color 0.1s ease-out;
  }

  /* ── Controls bar ─────────────────────────────────────────────────────────── */
  .timeline-area {
    height: 60px;
    flex-shrink: 0;
  }

  .controls-bar {
    flex-shrink: 0;
    height: 44px;
    background: #1b1d25;
    border-top: 1px solid rgba(255,255,255,0.07);
    border-bottom: 1px solid rgba(255,255,255,0.04);
  }

  /* ── Piano strip ──────────────────────────────────────────────────────────── */
  .piano-area {
    height: clamp(120px, 14vh, 200px);
    flex-shrink: 0;
    background: #000;
    border-top: 1px solid rgba(255,255,255,0.05);
  }

  /* ── Responsive ────────────────────────────────────────────────────────────── */

  /* Large screens: taller piano, bigger controls */
  @media (min-width: 1600px) {
    .top-bar { height: 42px; padding: 0 1.2rem; }
    .timeline-area { height: 68px; }
    .controls-bar { height: 48px; }
    .exercise-name { font-size: .9rem; }
    .hud { bottom: 18px; left: 18px; padding: 12px 18px; }
    .hud-name { font-size: 1.7rem; }
  }

  @media (min-width: 2200px) {
    .top-bar { height: 48px; }
    .timeline-area { height: 76px; }
    .controls-bar { height: 54px; }
    .exercise-name { font-size: 1rem; }
    .hud-name { font-size: 2rem; }
  }

  /* Narrow window */
  @media (max-width: 700px) {
    .exercise-diff { display: none; }
    .hud { padding: 8px 10px; min-width: 90px; }
    .hud-name { font-size: 1.1rem; }
  }
</style>
