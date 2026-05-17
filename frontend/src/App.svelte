<script lang="ts">
  import { onMount } from 'svelte'
  import { Environment, EventsOn, EventsOff } from '../wailsjs/runtime/runtime'
  import { connectMidiStore, midiStore } from './stores/midi'
  import { loadRecording, setPractice, play, stop, clearLoop, playbackStore, noteIntervals, setDifficultyPreset } from './stores/playback'
  import { bpmAt, timeSigAt, measureAt, DIFFICULTY_PRESETS } from './lib/recording-types'
  import { get } from 'svelte/store'
  import type { DifficultyPreset } from './lib/recording-types'
  import HomeScreen from './components/HomeScreen.svelte'
  import PrepBanner from './components/PrepBanner.svelte'
  import Piano from './components/Piano.svelte'
  import NoteWaterfall from './components/NoteWaterfall.svelte'
  import Timeline from './components/Timeline.svelte'
  import ControlsBar from './components/ControlsBar.svelte'
  import RecordControls from './components/RecordControls.svelte'
  import type { Exercise } from './lib/exercise-types'
  import { t } from './lib/i18n'
  import { locale } from './lib/i18n'
  import type { Locale } from './lib/i18n'
  import Toast from './components/Toast.svelte'
  import { addToast } from './stores/toast'
  import { prepStore } from './stores/prep'
  import { FINGER_COLORS } from './lib/finger-colors'
  import { noteColor } from './lib/note-colors'

  import { translateChord, translateInversion, translateRootNote, chordShorthand } from './lib/chord-i18n'
  import { settingsStore } from './stores/settings'
  import { SyncMenuState } from '../wailsjs/go/main/App'
  import { KEY_OPTIONS } from './lib/key-utils'

  const KEY_DISPLAY: Record<string, string> = {
    'C': 'Dó M', 'G': 'Sol M', 'D': 'Ré M', 'A': 'Lá M',
    'E': 'Mi M', 'B': 'Si M', 'F': 'Fá M', 'F#': 'F# M',
    'Bb': 'Sib M', 'Eb': 'Mib M',
    'Am': 'Lá m', 'Em': 'Mi m', 'Dm': 'Ré m', 'Gm': 'Sol m',
    'Cm': 'Dó m', 'Bm': 'Si m', 'Fm': 'Fá m',
  }
  function fmtKey(k: string): string { return KEY_DISPLAY[k] ?? k }

  type Page = 'home' | 'playing'

  let page: Page = 'home'
  let prepActive = false   // shows prep banner instead of top-bar; both use same playing layout
  let deviceReady = false
  // Lifted device state — survives page transitions so HomeScreen can restore on remount.
  let connectedDeviceId: number | null = $settingsStore.lastDeviceId
  let activeExercise: Exercise | null = null
  let isRecordingMode = false
  let isLiveRecording = false
  /** Musical key selected for freeplay / recording (e.g. "Am", "G"). */
  let freeplayKey: string = ''

  $: chord     = $midiStore.chord
  $: inversion = $midiStore.inversion
  $: triad     = $midiStore.triad
  $: dynamic   = $midiStore.dynamic
  $: velocity  = $midiStore.velocity
  $: hasChord  = chord && chord !== 'Unknown Chord'
  $: isTriad   = triad && triad !== 'Not a Triad'
  $: fillRatio = velocity / 127
  $: barColor  = dynamicColor(dynamic)
  $: chordLabel     = hasChord ? translateChord(chord, $t) : ''
  $: inversionLabel = inversion ? translateInversion(inversion, $t) : ''
  $: rootNote       = hasChord ? translateRootNote($midiStore.chordRoot, $t) : ''
  $: isShortMode    = $settingsStore.chordDisplayMode === 'short'
  $: chordDisplay   = !hasChord ? '' :
      isShortMode
        ? (chordShorthand(chord, $midiStore.chordRoot) || (rootNote ? `${rootNote} ${chordLabel}` : chordLabel))
        : (rootNote ? `${rootNote} ${chordLabel}` : chordLabel)

  // Chord progression trail — tracks last 4 distinct displayed chords locally.
  let chordHistory: string[] = []
  let _lastChordDisplay = ''
  $: {
    if (chordDisplay && chordDisplay !== _lastChordDisplay) {
      if (_lastChordDisplay) {
        chordHistory = [...chordHistory, _lastChordDisplay].slice(-4)
      }
      _lastChordDisplay = chordDisplay
    } else if (!chordDisplay) {
      _lastChordDisplay = ''
    }
  }
  $: prevChords = chordHistory.slice(-3)

  $: pos = $playbackStore.positionMs
  $: rec = $playbackStore.recording
  $: activePreset = $playbackStore.difficultyPreset
  $: recBpm = rec ? Math.round(bpmAt(rec, pos)) : null

  const PRESETS = Object.entries(DIFFICULTY_PRESETS) as [DifficultyPreset, typeof DIFFICULTY_PRESETS[DifficultyPreset]][]

  function applyPreset(key: string) {
    setDifficultyPreset(key as DifficultyPreset)
  }
  $: recTimeSig = rec ? timeSigAt(rec, pos) : null
  $: recKey = rec?.keySignature
  $: recMeasure = rec?.measureMap?.length ? measureAt(rec, pos) : null
  $: recTitle = rec?.meta?.title ?? null
  $: recComposer = rec?.meta?.composer ?? null

  function dynamicColor(d: string): string {
    switch (d) {
      case 'ppp': return '#b8a0f8'
      case 'pp':  return '#9d7ff0'
      case 'p':   return '#8b6ef0'
      case 'mp':  return '#7b5ff0'
      case 'mf':  return '#f08a5b'
      case 'f':   return '#e07040'
      case 'ff':  return '#d06030'
      case 'fff': return '#b84020'
      default:    return 'rgba(255,255,255,0.08)'
    }
  }

  onMount(() => {
    const unsubMidi = connectMidiStore()
    Environment().then(env => {
      document.body.dataset.platform = env.platform
    }).catch(() => {})

    // Sync native menu with current settings on startup.
    SyncMenuState({
      language: $locale,
      chordMode: $settingsStore.chordDisplayMode,
      skillLevel: $settingsStore.skillLevel ?? '',
    }).catch(() => {})

    // Handle menu-driven settings changes from the native OS menu.
    EventsOn('menu:set-language', (code: string) => {
      locale.set(code as Locale)
    })
    EventsOn('menu:set-chord-mode', (mode: string) => {
      settingsStore.patch({ chordDisplayMode: mode as 'full' | 'short' })
    })
    EventsOn('menu:set-skill-level', (level: string) => {
      settingsStore.setSkillLevel((level || null) as DifficultyPreset | null)
    })

    return () => {
      unsubMidi()
      EventsOff('menu:set-language')
      EventsOff('menu:set-chord-mode')
      EventsOff('menu:set-skill-level')
    }
  })

  // Keep the native menu in sync whenever settings or locale changes.
  $: if (typeof SyncMenuState === 'function') {
    SyncMenuState({
      language: $locale,
      chordMode: $settingsStore.chordDisplayMode,
      skillLevel: $settingsStore.skillLevel ?? '',
    }).catch(() => {})
  }

  // Auto-apply skill level preset only when a NEW recording is loaded, not on
  // every store update (which would override manual speed changes).
  let _lastAutoRec: unknown = null
  $: if ($settingsStore.skillLevel && $playbackStore.recording && $playbackStore.recording !== _lastAutoRec) {
    _lastAutoRec = $playbackStore.recording
    setDifficultyPreset($settingsStore.skillLevel)
  }

  // Also re-apply when the user explicitly changes their skill level in Settings
  // while a recording is already loaded (manual speed changes are cleared intentionally here).
  let _lastSkillLevel = $settingsStore.skillLevel
  $: if ($settingsStore.skillLevel !== _lastSkillLevel && $settingsStore.skillLevel && $playbackStore.recording) {
    _lastSkillLevel = $settingsStore.skillLevel
    setDifficultyPreset($settingsStore.skillLevel)
  }

  function handleDeviceReady(deviceId: number) {
    deviceReady = true
    connectedDeviceId = deviceId
    settingsStore.patch({ lastDeviceId: deviceId })
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
    if (!deviceReady) {
      addToast($t('toast.no.device'), 'warning')
    }
    activeExercise = exercise
    if (exercise?.data) {
      loadRecording(exercise.data)
      setPractice(true)
      const ivs = get(noteIntervals)
      const hasFingers = ivs.some(iv => iv.finger != null)
      if (hasFingers) {
        const keys = new Map<number, string>()
        for (const iv of ivs) {
          if (!keys.has(iv.note)) {
            keys.set(iv.note, iv.finger != null ? FINGER_COLORS[iv.finger] : noteColor(iv.note))
          }
        }
        prepStore.activate(keys)
        prepActive = true
      } else {
        prepActive = false
      }
    } else {
      clearLoadedRecording()
      prepActive = false
    }
    page = 'playing'
  }

  function handlePrepComplete() {
    prepActive = false
    prepStore.deactivate()
    play()
  }

  function handlePrepSkip() {
    prepActive = false
    prepStore.deactivate()
  }

  function handleImportRecording(recording: unknown) {
    if (!deviceReady) {
      addToast($t('toast.no.device'), 'warning')
    }
    loadRecording(recording)
    setPractice(false)
    activeExercise = null
    page = 'playing'
  }

  async function handleStartRecording() {
    if (!deviceReady) {
      addToast($t('toast.no.device'), 'warning')
    }
    activeExercise = null
    clearLoadedRecording()
    isRecordingMode = true
    isLiveRecording = false
    page = 'playing'
  }

  function goHome() {
    stop()
    clearLoop()
    prepActive = false
    prepStore.deactivate()
    activeExercise = null
    isRecordingMode = false
    isLiveRecording = false
    page = 'home'
  }
</script>

<Toast />

{#if page === 'home'}
  <HomeScreen
    onPlay={handlePlay}
    onDeviceReady={handleDeviceReady}
    onImportRecording={handleImportRecording}
    onStartRecording={handleStartRecording}
    initialDeviceId={connectedDeviceId}
    initialConnected={deviceReady}
  />

{:else}
  <!-- Single playing layout — never unmounts on prep↔playing transition -->
  <div class="layout">

    <!-- macOS: transparent drag handle that clears the inset traffic-light area -->
    <div class="layout-drag" aria-hidden="true" style="--wails-draggable:drag"></div>

    <!-- Swap only the top bar between prep banner and normal top bar -->
    {#if prepActive}
      <PrepBanner onComplete={handlePrepComplete} onSkip={handlePrepSkip} onBack={goHome} />
    {:else}
      <div class="top-bar">
        <button class="home-btn" on:click={goHome} title={$t('nav.home')}>
          {$t('app.back')}
        </button>
        {#if activeExercise}
          <div class="exercise-tag">
            {#if activeExercise.style.icon}<span class="exercise-icon">{activeExercise.style.icon}</span>{/if}
            <span class="exercise-name">{activeExercise.title}</span>
            <span class="exercise-diff">{activeExercise.subtitle ?? ''}</span>
          </div>
        {:else if isRecordingMode}
          {#if isLiveRecording}
            <div class="rec-live-tag">
              <span class="rec-live-dot"></span>
              {$t('rec.live')}
            </div>
          {:else}
            <div class="rec-ready-tag">
              🔴 {$t('rec.ready')}
            </div>
          {/if}
        {:else if recTitle}
          <div class="rec-title-tag">
            <span class="rec-title">{recTitle}</span>
            {#if recComposer}<span class="rec-composer">{recComposer}</span>{/if}
          </div>
        {:else}
          <span class="freeplay-tag">🎧 {$t('app.freeplay')}</span>
        {/if}
        <!-- Right side: record controls OR key picker + meta chips + presets -->
        <div class="top-bar-right">
          {#if isRecordingMode}
            <!-- Key picker before recording controls -->
            {#if !isLiveRecording}
              <select
                class="key-picker"
                bind:value={freeplayKey}
                title={$t('key.picker.label')}
              >
                <option value="">{$t('key.picker.none')}</option>
                {#each KEY_OPTIONS as opt}
                  <option value={opt.value}>{opt.label}</option>
                {/each}
              </select>
            {/if}
            <RecordControls
              savePath={$settingsStore.savePath}
              keySignature={freeplayKey}
              onSaved={(p) => { /* recording saved, stay on page */ }}
              onDone={() => { isRecordingMode = false; isLiveRecording = false; goHome() }}
              onRecordingStateChange={(active) => { isLiveRecording = active }}
            />
          {:else}
            <!-- Key picker for freeplay / review modes (no active exercise) -->
            {#if !activeExercise}
              <select
                class="key-picker"
                bind:value={freeplayKey}
                title={$t('key.picker.label')}
              >
                <option value="">{$t('key.picker.none')}</option>
                {#each KEY_OPTIONS as opt}
                  <option value={opt.value}>{opt.label}</option>
                {/each}
              </select>
            {/if}
            {#if recBpm || recTimeSig || recKey || recMeasure}
              <div class="meta-chips">
                {#if recMeasure != null}<span class="meta-chip">M{recMeasure}</span>{/if}
                {#if recTimeSig}<span class="meta-chip">{recTimeSig}</span>{/if}
                {#if recBpm}<span class="meta-chip">{recBpm} BPM</span>{/if}
                {#if recKey}<span class="meta-chip">{fmtKey(recKey)}</span>{/if}
              </div>
            {/if}
            <!-- Difficulty presets — top-right corner -->
            {#if rec}
              <div class="preset-group">
                {#each PRESETS as [key, cfg]}
                  <button
                    class="preset-pill"
                    class:active={activePreset === key}
                    on:click={() => applyPreset(key)}
                    title="{cfg.label} — {cfg.speed * 100 | 0}% velocidade"
                  >
                    <span class="preset-icon">{cfg.icon}</span>
                    <span class="preset-name">{cfg.label}</span>
                  </button>
                {/each}
              </div>
            {/if}
          {/if}
        </div>
      </div>
    {/if}

    <!-- Waterfall, timeline, controls and piano stay mounted permanently -->
    <div class="waterfall-area">
      <NoteWaterfall scaleKey={freeplayKey} />

      <!-- Analysis HUD -->
      <div class="hud" class:hud-active={hasChord}>
        <!-- Mode toggle: full name ↔ chord symbol -->
        <button
          class="hud-mode-toggle"
          class:hud-mode-short={isShortMode}
          on:click={() => settingsStore.toggleChordDisplayMode()}
          title={isShortMode ? 'Mostrar nome completo' : 'Mostrar cifra'}
          aria-label="toggle chord display mode"
        >{isShortMode ? 'ABC' : '♪'}</button>

        {#if prevChords.length > 0 && hasChord}
          <div class="hud-history">
            {#each prevChords as ch, i}
              <span class="hud-hist-item" style="opacity:{0.25 + i * 0.2}">{ch}</span>
            {/each}
            <span class="hud-hist-arrow">▶</span>
          </div>
        {/if}
        <div class="hud-chord">
          {#if hasChord}
            <span class="hud-name" class:hud-name-short={isShortMode}>{chordDisplay}</span>
            {#if isTriad}<span class="hud-badge">{$t('music.triad')}</span>{/if}
          {:else}
            <span class="hud-empty">—</span>
          {/if}
        </div>
        {#if hasChord}
          <span class="hud-inv">{inversionLabel}</span>
        {/if}
        <div class="hud-dyn" class:hud-dyn-active={!!dynamic}>
          <div class="hud-bar-track">
            <div class="hud-bar-fill" style="height:{fillRatio*100}%;background:{barColor}"></div>
          </div>
          <span class="hud-dyn-label" style={dynamic ? `color:${barColor}` : ''}>{dynamic || '—'}</span>
        </div>
      </div>
    </div>

    <div class="timeline-area"><Timeline /></div>

    <div class="controls-bar"><ControlsBar /></div>

    <div class="piano-area"><Piano /></div>

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

  .rec-live-tag {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    font-size: 0.78rem;
    font-weight: 700;
    color: #ff6060;
    letter-spacing: 0.06em;
  }

  .rec-ready-tag {
    font-size: 0.78rem;
    font-weight: 600;
    color: rgba(255,255,255,0.45);
    letter-spacing: 0.04em;
  }

  .rec-live-dot {
    width: 8px; height: 8px;
    border-radius: 50%;
    background: #cc3030;
    animation: pulse 0.9s ease-in-out infinite;
  }

  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50%       { opacity: 0.3; }
  }

  .rec-title-tag {
    display: flex;
    align-items: center;
    gap: 0.4rem;
  }

  .rec-title {
    font-size: 0.82rem;
    font-weight: 700;
    color: rgba(255,255,255,0.85);
  }

  .rec-composer {
    font-size: 0.68rem;
    color: rgba(255,255,255,0.35);
  }

  .meta-chips {
    display: flex;
    align-items: center;
    gap: 0.3rem;
  }

  /* ── Right-side wrapper (meta chips + presets) ──────────────────────────── */
  .top-bar-right {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-left: auto;
  }

  /* ── Difficulty presets (top-bar right corner) ──────────────────────────── */
  .preset-group {
    display: flex;
    align-items: center;
    gap: 3px;
  }

  .preset-pill {
    display: flex;
    align-items: center;
    gap: 4px;
    height: 24px;
    padding: 0 0.55rem;
    background: rgba(255,255,255,0.05);
    border: 1px solid rgba(255,255,255,0.10);
    border-radius: 6px;
    color: rgba(255,255,255,0.45);
    font-size: 0.68rem;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.12s, color 0.12s, border-color 0.12s;
    white-space: nowrap;
  }

  .preset-pill:hover {
    background: rgba(255,255,255,0.10);
    color: rgba(255,255,255,0.82);
    border-color: rgba(255,255,255,0.20);
  }

  .preset-pill.active {
    background: rgba(80,200,120,0.20);
    border-color: rgba(80,200,120,0.52);
    color: #8eeab2;
    font-weight: 800;
  }

  .preset-icon { font-size: 0.78rem; line-height: 1; }
  .preset-name { font-size: 0.66rem; }
  .meta-chip {
    font-size: 0.68rem;
    font-weight: 600;
    color: rgba(255,255,255,0.45);
    background: rgba(255,255,255,0.06);
    border: 1px solid rgba(255,255,255,0.1);
    border-radius: 10px;
    padding: 0.1rem 0.5rem;
    letter-spacing: 0.02em;
    white-space: nowrap;
  }

  /* ── Key picker dropdown ─────────────────────────────────────────────────── */
  .key-picker {
    height: 24px;
    padding: 0 0.45rem;
    background: rgba(255,255,255,0.06);
    border: 1px solid rgba(255,255,255,0.12);
    border-radius: 6px;
    color: rgba(255,255,255,0.65);
    font-size: 0.70rem;
    font-weight: 600;
    cursor: pointer;
    appearance: none;
    -webkit-appearance: none;
    min-width: 5.5rem;
    letter-spacing: 0.02em;
    transition: background 0.12s, border-color 0.12s;
  }
  .key-picker:hover, .key-picker:focus {
    background: rgba(255,255,255,0.10);
    border-color: rgba(255,255,255,0.22);
    outline: none;
    color: rgba(255,255,255,0.88);
  }
  .key-picker option {
    background: #1a1b20;
    color: rgba(255,255,255,0.85);
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
  .hud.hud-active { opacity: 1; pointer-events: auto; }

  .hud-mode-toggle {
    position: absolute;
    top: 6px;
    right: 8px;
    background: rgba(255,255,255,0.08);
    border: 1px solid rgba(255,255,255,0.15);
    border-radius: 6px;
    color: rgba(255,255,255,0.55);
    font-size: 0.65rem;
    font-weight: 700;
    padding: 2px 6px;
    cursor: pointer;
    line-height: 1.4;
    transition: background 0.15s, color 0.15s;
  }
  .hud-mode-toggle:hover { background: rgba(255,255,255,0.15); color: #fff; }
  .hud-mode-toggle.hud-mode-short { background: rgba(255,215,0,0.15); border-color: rgba(255,215,0,0.35); color: #ffd700; }
  .hud-name-short { font-size: 1.7rem; letter-spacing: 0.01em; }

  .hud-history {
    display: flex;
    align-items: center;
    gap: 4px;
    margin-bottom: 4px;
    overflow: hidden;
  }
  .hud-hist-item {
    font-size: 0.65rem;
    font-weight: 600;
    color: #fff;
    white-space: nowrap;
    letter-spacing: -0.01em;
  }
  .hud-hist-arrow {
    font-size: 0.5rem;
    color: rgba(255,255,255,0.3);
    flex-shrink: 0;
  }

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

  /* ── macOS: transparent drag handle / traffic-light spacer ──────────────── */
  .layout-drag {
    display: none;
    height: 0;
    flex-shrink: 0;
  }
  :global([data-platform="darwin"]) .layout-drag {
    display: block;
    height: 44px;
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
