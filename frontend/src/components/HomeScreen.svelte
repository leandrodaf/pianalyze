<script lang="ts">
  import { onMount, onDestroy } from 'svelte'
  import { EventsOn } from '../../wailsjs/runtime/runtime'
  import { ListDevices, SelectDevice, StartCapture, StopCapture, ImportAnyFile } from '../../wailsjs/go/main/App'
  import type { main } from '../../wailsjs/go/models'
  import { exerciseStore, exercisesByCategory } from '../stores/exercises'
  import { LOCALE_NAMES, locale, t, type Locale } from '../lib/i18n'
  import {
    type Category,
    type Exercise,
    DIFFICULTY_COLOR,
  } from '../lib/exercise-types'
  import type { Recording } from '../lib/recording-types'

  import { addToast } from '../stores/toast'
  import logoIcon from '../assets/logo_icon.png'
  import { handleDevicesChanged } from '../lib/device-handler'
  import { settingsStore } from '../stores/settings'
  import SettingsModal from './SettingsModal.svelte'
  import RecordingsPage from './RecordingsPage.svelte'

  export let onPlay: (exercise: Exercise | null) => void
  export let onDeviceReady: (deviceId: number) => void
  export let onImportRecording: ((recording: Recording) => void) | undefined = undefined
  export let onStartRecording: (() => void) | undefined = undefined
  /** Device ID that was already connected before navigating away (from App.svelte state). */
  export let initialDeviceId: number | null = null
  /** Whether the device was already connected before navigating away. */
  export let initialConnected = false

  type NavView = 'home' | 'recordings'
  let activeView: NavView = 'home'
  let recordingsVersion = 0 // increment to force RecordingsPage re-mount

  // ── Device ────────────────────────────────────────────────────────────────────
  let devices: main.DeviceInfo[] = []
  let selectedId: number | null = initialDeviceId
  let connected      = false   // set to true after successful connect or on remount
  let connecting     = false
  let deviceError    = ''
  let showDeviceList = !initialConnected  // if already connected, don't show the list

  let unsubDevices: (() => void) | null = null

  onMount(async () => {
    try {
      devices = await ListDevices()

      if (initialConnected && initialDeviceId !== null) {
        // Back from playing screen — restore UI state; capture is still running on Go side.
        const stillAvailable = devices.some(d => d.id === initialDeviceId)
        if (stillAvailable) {
          selectedId = initialDeviceId
          connected = true
          showDeviceList = false
        } else {
          // Device was disconnected while away
          connected = false
          showDeviceList = true
          selectedId = null
        }
      } else {
        // First mount — auto-select: last known device if in list, else sole device
        const lastId = $settingsStore.lastDeviceId
        if (lastId !== null && devices.some(d => d.id === lastId)) {
          selectedId = lastId
        } else if (devices.length === 1) {
          selectedId = devices[0].id
        }
      }
    } catch (e) { deviceError = String(e) }

    unsubDevices = EventsOn('devices:changed', (updated: main.DeviceInfo[]) => {
      const prev = devices
      const next = handleDevicesChanged(updated, prev,
        { selectedId, connected, showDeviceList, deviceError },
        { stopCapture: StopCapture, addToast, msgDisconnected: $t('toast.device.disconnected'), msgConnected: $t('toast.device.connected') },
      )
      devices = updated
      selectedId = next.selectedId
      connected = next.connected
      showDeviceList = next.showDeviceList
      deviceError = next.deviceError
    })
  })

  onDestroy(() => { unsubDevices?.() })

  async function connectDevice() {
    if (selectedId === null) return
    connecting = true; deviceError = ''
    try {
      await SelectDevice(selectedId)
      await StartCapture()
      connected = true; showDeviceList = false
      onDeviceReady(selectedId)
    } catch (e) { deviceError = String(e) }
    finally    { connecting = false }
  }

  function changeDevice() { connected = false; showDeviceList = true }

  // ── Lang picker ───────────────────────────────────────────────────────────────
  let langOpen = false
  $: currentFlag = LOCALE_OPTIONS.find(o => o.code === $locale)?.flag ?? '🌐'

  // ── Settings modal ────────────────────────────────────────────────────────────
  let settingsOpen = false

  // ── Detail modal ──────────────────────────────────────────────────────────────
  let detail: Exercise | null = null

  function openDetail(ex: Exercise) { detail = ex }
  function closeDetail() { detail = null }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') { if (settingsOpen) settingsOpen = false; else closeDetail() }
  }

  let lastExercise: Exercise | null = null

  function startExercise(ex: Exercise | null) {
    if (ex !== null) lastExercise = ex
    detail = null
    onPlay(ex)
  }

  function handleContinue() {
    if (lastExercise) startExercise(lastExercise)  // atalho direto, sem abrir modal
    else startExercise(null)
  }

  function handleRandom() {
    const available = $exerciseStore.exercises.filter(e => !e.comingSoon)
    if (!available.length) return
    openDetail(available[Math.floor(Math.random() * available.length)])
  }

  function getDailyChallenge(exercises: Exercise[]): Exercise | null {
    const available = exercises.filter(e => !e.comingSoon)
    if (!available.length) return null
    const day = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 1).getTime()) / 86400000)
    return available[day % available.length]
  }

  // ── Tools ──────────────────────────────────────────────────────────────────────
  let toolsError = ''

  async function openImportAny() {
    toolsError = ''
    try {
      const result = await ImportAnyFile()
      if (!result) return // user cancelled
      if (result.kind === 'score') {
        recordingsVersion++
        activeView = 'recordings'
        addToast($t('toast.import.score.success'), 'success')
      } else {
        // .pia / .json — load into playback
        if (!onImportRecording) return
        let rec: Recording
        try {
          rec = JSON.parse(result.data) as Recording
        } catch {
          toolsError = $t('error.import.invalid')
          return
        }
        if (!rec.events || rec.events.length === 0) {
          toolsError = $t('error.import.empty')
          return
        }
        onImportRecording(rec)
      }
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error)
      toolsError = msg || $t('error.import.invalid')
    }
  }

  function handleStartRecording() {
    onStartRecording?.()
  }

  // ── Helpers ────────────────────────────────────────────────────────────────────
  function fmtDuration(sec: number): string {
    const m = Math.floor(sec / 60)
    const s = sec % 60
    return m > 0 ? `${m}min${s > 0 ? ` ${s}s` : ''}` : `${s}s`
  }

  function coverStyle(gradient: readonly [string, string], coverImage?: string): string {
    if (coverImage) {
      return `background: linear-gradient(135deg,${gradient[0]}cc,${gradient[1]}cc), url('${coverImage}') center/cover no-repeat`
    }
    return `background: linear-gradient(135deg,${gradient[0]},${gradient[1]})`
  }

  $: connectedDevice  = devices.find(d => d.id === selectedId)
  $: scales           = $exercisesByCategory.scales
  $: chords           = $exercisesByCategory.chords
  $: pieces           = $exercisesByCategory.pieces
  $: dailyChallengeEx = getDailyChallenge($exerciseStore.exercises)

  const currentHour = new Date().getHours()
  const LOCALE_OPTIONS: { code: Locale; flag: string; short: string }[] = [
    { code: 'pt-BR', flag: '🇧🇷', short: 'PT' },
    { code: 'en',    flag: '🇺🇸', short: 'EN' },
    { code: 'es',    flag: '🇪🇸', short: 'ES' },
    { code: 'zh-CN', flag: '🇨🇳', short: 'ZH' },
  ]
  const SECTIONS: Array<{ key: Category }> = [
    { key: 'scales' },
    { key: 'chords' },
    { key: 'pieces' },
  ]
</script>

<svelte:window on:keydown={handleKeydown} />

<div class="home">

  <!-- ═══════════════ SIDEBAR ═══════════════════════════════════ -->
  <aside class="sidebar">

    <div class="logo-area">
      <img class="logo-icon" src={logoIcon} alt="Pianalyze" />
      <div class="logo-text">
        <span class="logo-brand">PIANALYZE</span>
        <span class="logo-sub">{$t('brand.subtitle')}</span>
      </div>
      <div class="lang-btn-wrap">
        <button class="lang-btn" on:click={() => langOpen = !langOpen} title={LOCALE_NAMES[$locale]}>
          {currentFlag}
        </button>
        {#if langOpen}
          <div class="lang-dropdown">
            {#each LOCALE_OPTIONS as opt}
              <button
                class="lang-option"
                class:active={$locale === opt.code}
                on:click={() => { locale.set(opt.code); langOpen = false }}
              >
                <span class="lo-flag">{opt.flag}</span>
                <span class="lo-name">{LOCALE_NAMES[opt.code]}</span>
              </button>
            {/each}
          </div>
        {/if}
      </div>
    </div>
    {#if langOpen}
      <div class="lang-backdrop" on:click={() => langOpen = false} role="presentation"></div>
    {/if}

    <nav class="nav">
      <button class="nav-item" class:active={activeView === 'home'} on:click={() => activeView = 'home'}>
        <span class="nav-ic">⊞</span> {$t('nav.home')}
      </button>
      <button class="nav-item" disabled><span class="nav-ic">◫</span> {$t('nav.library')}</button>
      <button class="nav-item" class:active={activeView === 'recordings'} on:click={() => activeView = 'recordings'}>
        <span class="nav-ic">◉</span> {$t('nav.recordings')}
      </button>
      <button class="nav-item nav-settings" on:click={() => settingsOpen = true}>
        <span class="nav-ic">⚙</span> {$t('settings.title')}
      </button>
    </nav>

    <div class="hr"></div>

    <!-- Device section -->
    <div class="sb-section">
      <span class="sb-label">{$t('device.label')}</span>

      {#if connected && connectedDevice}
        <div class="device-connected">
          <div class="device-pill">
            <span class="device-dot"></span>
            <span class="device-name-text">{connectedDevice.name}</span>
          </div>
          <button class="link-btn" on:click={changeDevice}>{$t('device.change')}</button>
        </div>

      {:else if devices.length === 0}
        <p class="hint-text">{$t('device.none')}</p>

      {:else}
        <ul class="device-list" role="listbox">
          {#each devices as dev}
            <li
              class="device-item"
              class:selected={selectedId === dev.id}
              on:click={() => selectedId = dev.id}
              on:keydown={e => e.key === 'Enter' && (selectedId = dev.id)}
              role="option"
              aria-selected={selectedId === dev.id}
              tabindex="0"
            >
              <span class="device-ic">🎹</span>
              <div class="device-info">
                <span class="device-item-name">{dev.name}</span>
                {#if dev.manufacturer}<span class="device-mfr">{dev.manufacturer}</span>{/if}
              </div>
            </li>
          {/each}
        </ul>

        {#if deviceError}<p class="error-text">{deviceError}</p>{/if}

        <button class="connect-btn" on:click={connectDevice}
          disabled={connecting || selectedId === null}>
          {connecting ? $t('device.connecting') : $t('device.connect')}
        </button>
      {/if}
    </div>

    <div class="hr"></div>

    <div class="sb-section">
      <span class="sb-label">{$t('tools.label')}</span>
      <div class="tools-actions">
        <button class="tool-btn" on:click={openImportAny}>
          <span class="tool-icon">📥</span>
          <span>{$t('tools.import')}</span>
        </button>
      </div>
      {#if toolsError}<p class="error-text">{toolsError}</p>{/if}
    </div>

  </aside>

  <!-- ═══════════════ MAIN CONTENT ═══════════════════════════════ -->
  <main class="content">

    {#if activeView === 'recordings'}
      {#key recordingsVersion}
        <RecordingsPage onLoad={onImportRecording} />
      {/key}
    {:else}

    <header class="content-header">
      <h1 class="greeting">{currentHour < 12 ? $t('greeting.morning') : currentHour < 18 ? $t('greeting.afternoon') : $t('greeting.evening')}</h1>
      <p class="greeting-sub">{$t('greeting.sub')}</p>
    </header>

    <!-- Quick actions -->
    <section class="quick-section">
      <div class="quick-pills">

        <button class="quick-pill continue-pill" on:click={handleContinue}>
          <span class="pill-icon">▶</span>
          <div class="pill-text">
            <span class="pill-label">{$t('quick.continue')}</span>
            <span class="pill-sub">{lastExercise ? lastExercise.title : $t('quick.freeplay')}</span>
          </div>
        </button>

        <button class="quick-pill random-pill" on:click={handleRandom}>
          <span class="pill-icon">🎲</span>
          <div class="pill-text">
            <span class="pill-label">{$t('quick.random')}</span>
            <span class="pill-sub">{$t('quick.randomSub')}</span>
          </div>
        </button>

        <button class="quick-pill challenge-pill"
          on:click={() => dailyChallengeEx && openDetail(dailyChallengeEx)}
          disabled={!dailyChallengeEx}>
          <span class="pill-icon">⭐</span>
          <div class="pill-text">
            <span class="pill-label">{$t('quick.challenge')}</span>
            <span class="pill-sub">{dailyChallengeEx ? dailyChallengeEx.title : $t('quick.comingSoon')}</span>
          </div>
        </button>

        <button class="quick-pill rec-pill" on:click={handleStartRecording} disabled={!onStartRecording}>
          <span class="pill-icon">🔴</span>
          <div class="pill-text">
            <span class="pill-label">{$t('quick.record')}</span>
            <span class="pill-sub">{$t('quick.recordSub')}</span>
          </div>
        </button>

      </div>
    </section>

    <!-- Exercise sections -->
    {#each SECTIONS as { key }}
      {@const list = key === 'scales' ? scales : key === 'chords' ? chords : pieces}
      <section class="ex-section">
        <div class="section-hdr">
          <h2 class="section-title">{$t('category.' + key)}</h2>
          <span class="section-count">{list.length} {list.length !== 1 ? $t('exercise.plural') : $t('exercise.singular')}</span>
        </div>
        <div class="card-grid">
          {#each list as ex (ex.id)}
            <button
              class="ex-card"
              class:coming-soon={ex.comingSoon}
              on:click={() => openDetail(ex)}
              title={ex.title}
            >
              <div class="card-cover"
                style={coverStyle(ex.style.gradient, ex.style.coverImage)}>
                <span class="card-icon">{ex.style.icon}</span>
                {#if !ex.comingSoon}
                  <div class="card-play">▶</div>
                {:else}
                  <div class="card-soon">{$t('exercise.comingSoon')}</div>
                {/if}
              </div>
              <div class="card-info">
                <span class="card-title">{ex.title}</span>
                <div class="card-meta">
                  <span class="card-by">{$t('common.by')} {ex.author.name}</span>
                </div>
                <div class="card-footer">
                  <span class="diff-dots">
                    {#each [1,2,3,4,5] as n}
                      <span class="dot" class:filled={n <= ex.difficulty}
                        style={n <= ex.difficulty ? `background:${DIFFICULTY_COLOR[ex.difficulty]}` : ''}
                      ></span>
                    {/each}
                  </span>
                  <span class="card-dur">{fmtDuration(ex.stats.durationSec)}</span>
                </div>
              </div>
            </button>
          {/each}
        </div>
      </section>
    {/each}

    <div style="height:3rem"></div>
    {/if}
  </main>
</div>

<!-- ═══════════════ DETAIL MODAL ════════════════════════════════════ -->
{#if detail}
  <!-- svelte-ignore a11y-click-events-have-key-events -->
  <!-- svelte-ignore a11y-no-static-element-interactions -->
  <div class="modal-backdrop" on:click|self={closeDetail}>
    <div class="modal" role="dialog" aria-modal="true">

      <!-- Cover header -->
      <div class="modal-header"
        style={coverStyle(detail.style.gradient, detail.style.coverImage)}>
        <button class="modal-close" on:click={closeDetail} title={$t('modal.close')}>✕</button>
        <div class="modal-hero">
          <div class="modal-icon">{detail.style.icon}</div>
          <div class="modal-title-block">
            <span class="modal-category">{$t('category.' + detail.category)}</span>
            <h2 class="modal-title">{detail.title}</h2>
            <p class="modal-subtitle">{detail.subtitle}</p>
          </div>
        </div>
      </div>

      <!-- Body -->
      <div class="modal-body">

        <!-- Description -->
        <p class="modal-desc">{detail.description}</p>

        <!-- Contributor card -->
        <div class="contributor-card">
          <div class="contributor-top">
            <div class="contributor-avatar">{detail.author.name.charAt(0).toUpperCase()}</div>
            <div class="contributor-info">
              {#if detail.author.url}
                <a class="contributor-name" href={detail.author.url} target="_blank" rel="noopener">
                  {detail.author.name}
                </a>
              {:else}
                <span class="contributor-name plain">{detail.author.name}</span>
              {/if}
              {#if detail.author.bio}
                <p class="contributor-bio">{detail.author.bio}</p>
              {/if}
            </div>
          </div>

          {#if detail.author.contact || (detail.author.links && detail.author.links.length > 0)}
            <div class="contributor-links">
              {#if detail.author.contact}
                <span class="contributor-contact">✉ {detail.author.contact}</span>
              {/if}
              {#each detail.author.links ?? [] as link}
                <a class="contributor-link-chip" href={link.url} target="_blank" rel="noopener">
                  {link.label}
                </a>
              {/each}
            </div>
          {/if}
        </div>

        <!-- Stats grid -->
        <div class="stats-grid">
          <div class="stat-box">
            <span class="stat-label">{$t('difficulty.label')}</span>
            <span class="diff-dots large">
              {#each [1,2,3,4,5] as n}
                <span class="dot" class:filled={n <= detail.difficulty}
                  style={n <= detail.difficulty ? `background:${DIFFICULTY_COLOR[detail.difficulty]}` : ''}
                ></span>
              {/each}
            </span>
            <span class="stat-value" style="color:{DIFFICULTY_COLOR[detail.difficulty]}">
              {$t('difficulty.' + detail.difficulty)}
            </span>
          </div>

          <div class="stat-box">
            <span class="stat-label">{$t('stats.duration')}</span>
            <span class="stat-big">~{fmtDuration(detail.stats.durationSec)}</span>
            {#if detail.stats.bpm}
              <span class="stat-value">{detail.stats.bpm} {$t('stats.bpm')}</span>
            {:else}
              <span class="stat-value">—</span>
            {/if}
          </div>

          <div class="stat-box">
            <span class="stat-label">{$t('stats.hands')}</span>
            <span class="stat-big">
              {detail.stats.hands === 'both' ? '🤲' :
               detail.stats.hands === 'right' ? '🤚' : '🫲'}
            </span>
            <span class="stat-value">
              {detail.stats.hands ? $t('hands.' + detail.stats.hands) : '—'}
            </span>
          </div>

          {#if detail.stats.timeSignature}
            <div class="stat-box">
              <span class="stat-label">{$t('stats.timeSignature')}</span>
              <span class="stat-big time-sig">{detail.stats.timeSignature}</span>
              <span class="stat-value">—</span>
            </div>
          {/if}
        </div>

        <!-- Tags -->
        {#if detail.tags.length > 0}
          <div class="tags-row">
            {#each detail.tags as tag}
              <span class="tag">{tag}</span>
            {/each}
          </div>
        {/if}

        <!-- Actions -->
        <div class="modal-actions">
          {#if !detail.comingSoon}
            <button class="btn-primary" on:click={() => startExercise(detail)}>
              ▶ {$t('modal.practice')}
            </button>
          {:else}
            <button class="btn-disabled" disabled>{$t('modal.comingSoon')}</button>
          {/if}
          <button class="btn-secondary" on:click={closeDetail}>{$t('modal.close')}</button>
        </div>

      </div>
    </div>
  </div>
{/if}

<!-- ═══════════════ SETTINGS MODAL ══════════════════════════════════ -->
{#if settingsOpen}
  <SettingsModal
    onClose={() => settingsOpen = false}
    onImportRecording={onImportRecording}
  />
{/if}

<style>
/* ── Root ──────────────────────────────────────────────────────────────────── */
.home {
  display: flex;
  width: 100vw;
  height: 100vh;
  background: #0f1014;
  color: #fff;
  overflow: hidden;
}

/* ── Sidebar ───────────────────────────────────────────────────────────────── */
.sidebar {
  width: clamp(210px, 20%, 300px);
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  background: rgba(0,0,0,0.5);
  border-right: 1px solid rgba(255,255,255,0.05);
  overflow-y: scroll;
  padding-bottom: 2rem;
  scrollbar-width: thin;
  scrollbar-color: rgba(255,255,255,.08) transparent;
  -webkit-overflow-scrolling: touch;
}
.sidebar::-webkit-scrollbar { width: 4px; }
.sidebar::-webkit-scrollbar-track { background: transparent; }
.sidebar::-webkit-scrollbar-thumb { background: rgba(255,255,255,.08); border-radius: 2px; }

.logo-area {
  display: flex;
  align-items: center;
  gap: .65rem;
  padding: 1.4rem 1.2rem 1rem;
  position: relative;
}
.logo-icon {
  width: 2.4rem;
  height: 2.4rem;
  object-fit: contain;
  filter: drop-shadow(0 0 10px rgba(123,95,240,.8));
  flex-shrink: 0;
}
.logo-text { display: flex; flex-direction: column; gap: 1px; }
.logo-brand {
  font-size: .93rem;
  font-weight: 900;
  letter-spacing: .1em;
  background: linear-gradient(90deg,#b89af4,#7b5ff0);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}
.logo-sub {
  font-size: .58rem;
  color: rgba(255,255,255,.25);
  letter-spacing: .07em;
  text-transform: uppercase;
}

.nav { display: flex; flex-direction: column; gap: 2px; padding: 0 .75rem .5rem; }
.nav-item {
  display: flex;
  align-items: center;
  gap: .65rem;
  padding: .55rem .75rem;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: rgba(255,255,255,.4);
  font-size: .82rem;
  font-weight: 600;
  cursor: pointer;
  text-align: left;
  width: 100%;
  transition: background .15s, color .15s;
}
.nav-item:hover:not(:disabled) { background: rgba(255,255,255,.06); color: rgba(255,255,255,.75); }
.nav-item.active { color: #fff; background: rgba(123,95,240,.18); }
.nav-item:disabled { opacity: .3; cursor: not-allowed; }
.nav-ic { font-size: .95rem; width: 18px; text-align: center; }
.nav-settings { margin-top: auto; color: rgba(255,255,255,.45); }
.nav-settings:hover { color: rgba(255,255,255,.8) !important; }

.hr { height: 1px; background: rgba(255,255,255,.07); margin: .5rem 1.2rem; flex-shrink: 0; }

.sb-section {
  padding: .75rem 1.2rem;
  display: flex;
  flex-direction: column;
  gap: .6rem;
  transition: background .2s;
}
.sb-label {
  font-size: .6rem;
  font-weight: 800;
  letter-spacing: .12em;
  text-transform: uppercase;
  color: rgba(255,255,255,.28);
}
.hint-text { font-size: .72rem; color: rgba(255,255,255,.28); line-height: 1.5; margin: 0; }
.error-text { font-size: .7rem; color: #f08a5b; margin: 0; word-break: break-all; }

.device-connected { display: flex; flex-direction: column; gap: .4rem; }
.device-pill {
  display: flex;
  align-items: center;
  gap: .5rem;
  background: rgba(123,95,240,.15);
  border: 1px solid rgba(123,95,240,.35);
  border-radius: 20px;
  padding: .35rem .75rem;
  width: fit-content;
  max-width: 100%;
}
.device-dot {
  width: 7px; height: 7px;
  border-radius: 50%;
  background: #7b5ff0;
  box-shadow: 0 0 6px #7b5ff0;
  flex-shrink: 0;
  animation: blink 2s ease-in-out infinite;
}
@keyframes blink { 0%,100% { opacity: 1 } 50% { opacity: .4 } }
.device-name-text {
  font-size: .77rem;
  font-weight: 600;
  color: #d0c0ff;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 155px;
}
.link-btn {
  background: none; border: none;
  color: rgba(255,255,255,.3); font-size: .7rem;
  cursor: pointer; padding: 0; text-decoration: underline;
  text-decoration-color: rgba(255,255,255,.12);
  width: fit-content; transition: color .15s;
}
.link-btn:hover { color: rgba(255,255,255,.65); }

.device-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }
.device-item {
  display: flex; align-items: center; gap: .5rem;
  padding: .5rem .6rem;
  border: 1px solid rgba(255,255,255,.07);
  border-radius: 7px;
  cursor: pointer;
  background: rgba(255,255,255,.03);
  outline: none;
  transition: background .15s, border-color .15s;
}
.device-item:hover,.device-item:focus { background: rgba(123,95,240,.1); border-color: rgba(123,95,240,.3); }
.device-item.selected { background: rgba(123,95,240,.18); border-color: rgba(123,95,240,.55); }
.device-ic { font-size: .9rem; }
.device-info { display: flex; flex-direction: column; gap: 1px; overflow: hidden; }
.device-item-name { font-size: .76rem; font-weight: 600; color: rgba(255,255,255,.85); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.device-mfr { font-size: .6rem; color: rgba(255,255,255,.28); }

.connect-btn {
  padding: .55rem; border: none; border-radius: 8px;
  background: linear-gradient(135deg,#7b5ff0,#5b3ad6);
  color: #fff; font-size: .82rem; font-weight: 700;
  cursor: pointer; letter-spacing: .04em;
  transition: opacity .15s, transform .1s;
}
.connect-btn:hover:not(:disabled) { opacity: .9; transform: translateY(-1px); }
.connect-btn:disabled { opacity: .35; cursor: not-allowed; }

.tools-actions {
  display: flex;
  flex-direction: column;
  gap: .5rem;
}
.tool-btn {
  display: flex;
  align-items: center;
  gap: .55rem;
  width: 100%;
  padding: .55rem .7rem;
  border: 1px solid rgba(255,255,255,.1);
  border-radius: 8px;
  background: rgba(255,255,255,.05);
  color: rgba(255,255,255,.78);
  font-size: .76rem;
  font-weight: 700;
  cursor: pointer;
  transition: background .15s, border-color .15s, color .15s;
}
.tool-btn:hover:not(:disabled) {
  background: rgba(255,255,255,.1);
  border-color: rgba(255,255,255,.16);
  color: #fff;
}
.tool-btn:disabled {
  opacity: .35;
  cursor: not-allowed;
}
.tool-icon {
  width: 1rem;
  text-align: center;
  flex-shrink: 0;
}
 
/* ── Main content ──────────────────────────────────────────────────────────── */
.content {
  flex: 1; overflow-y: scroll; position: relative;
  scrollbar-width: thin;
  scrollbar-color: rgba(255,255,255,.12) transparent;
  -webkit-overflow-scrolling: touch;
}
.content::-webkit-scrollbar { width: 6px; }
.content::-webkit-scrollbar-track { background: transparent; }
.content::-webkit-scrollbar-thumb {
  background: rgba(255,255,255,.12);
  border-radius: 3px;
}
.content::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,.22); }

.content-header { position: relative; padding: clamp(1.5rem,3vw,3rem) clamp(1.2rem,3vw,2.5rem) 1.5rem; }
.greeting { font-size: clamp(1.6rem,2.8vw,3.2rem); font-weight: 900; letter-spacing: -.02em; margin: 0 0 .3rem; }
.greeting-sub { font-size: clamp(.82rem,1.1vw,1.05rem); color: rgba(255,255,255,.35); margin: 0; }

/* Quick actions */
.quick-section { padding: 0 clamp(1.2rem,3vw,2.5rem) 2rem; }
.quick-pills { display: flex; gap: clamp(6px,1vw,10px); flex-wrap: wrap; }

.quick-pill {
  display: flex; align-items: center; gap: .65rem;
  padding: .6rem 1.1rem .6rem .85rem;
  background: rgba(255,255,255,.06);
  border: 1px solid rgba(255,255,255,.1);
  border-radius: 30px;
  cursor: pointer; color: #fff; text-align: left;
  transition: background .15s, border-color .15s, transform .12s;
  outline: none;
}
.quick-pill:hover { background: rgba(255,255,255,.11); border-color: rgba(255,255,255,.2); transform: translateY(-1px); }
.quick-pill:focus-visible { outline: 2px solid rgba(123,95,240,.7); outline-offset: 2px; }
.quick-pill:disabled { opacity: .3; cursor: not-allowed; transform: none; }

.continue-pill  { background: rgba(123,95,240,.16); border-color: rgba(123,95,240,.38); }
.continue-pill:hover  { background: rgba(123,95,240,.26); border-color: rgba(123,95,240,.55); }

.random-pill { background: rgba(16,185,129,.1); border-color: rgba(16,185,129,.25); }
.random-pill:hover { background: rgba(16,185,129,.18); border-color: rgba(16,185,129,.4); }

.challenge-pill { background: rgba(251,191,36,.08); border-color: rgba(251,191,36,.22); }
.challenge-pill:hover { background: rgba(251,191,36,.16); border-color: rgba(251,191,36,.42); }

.pill-icon { font-size: 1rem; line-height: 1; flex-shrink: 0; }
.pill-text { display: flex; flex-direction: column; gap: 1px; }
.pill-label { font-size: .82rem; font-weight: 700; color: rgba(255,255,255,.9); line-height: 1.2; }
.pill-sub { font-size: .65rem; color: rgba(255,255,255,.35); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 150px; }

/* Sections */
.ex-section { padding: 0 clamp(1.2rem,3vw,2.5rem) 2.5rem; }
.section-hdr { display: flex; align-items: baseline; gap: .75rem; margin-bottom: 1rem; }
.section-title { font-size: clamp(1.05rem,1.6vw,1.5rem); font-weight: 800; letter-spacing: -.01em; margin: 0; }
.section-count { font-size: .7rem; color: rgba(255,255,255,.25); font-weight: 500; }

/* Card grid */
.card-grid {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: clamp(10px,1.2vw,14px);
}

.ex-card {
  background: none; border: none; padding: 0;
  cursor: pointer; border-radius: 10px; overflow: hidden; text-align: left;
  transition: transform .2s cubic-bezier(.34,1.56,.64,1), box-shadow .2s;
  outline: none;
}
.ex-card:hover { transform: translateY(-5px) scale(1.02); box-shadow: 0 16px 48px rgba(0,0,0,.55); }
.ex-card:focus-visible { outline: 2px solid rgba(123,95,240,.7); outline-offset: 2px; }
.ex-card.coming-soon { opacity: .55; }
.ex-card.coming-soon:hover { transform: none; box-shadow: none; }

.card-cover {
  aspect-ratio: 1 / 1; position: relative;
  display: flex; align-items: center; justify-content: center; overflow: hidden;
}
.card-icon {
  font-size: 2.7rem; line-height: 1; position: relative; z-index: 1;
  filter: drop-shadow(0 2px 8px rgba(0,0,0,.4));
  transition: transform .2s;
}
.ex-card:hover .card-icon { transform: scale(1.1); }
.card-play {
  position: absolute; bottom: 10px; right: 10px;
  width: 42px; height: 42px;
  background: #7b5ff0; border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  font-size: .95rem; color: #fff;
  opacity: 0; transform: translateY(6px);
  transition: opacity .2s, transform .2s;
  box-shadow: 0 4px 16px rgba(0,0,0,.5); z-index: 2;
}
.ex-card:hover .card-play { opacity: 1; transform: translateY(0); }
.card-soon {
  position: absolute; bottom: 8px; left: 8px;
  padding: 3px 8px; background: rgba(0,0,0,.55);
  border-radius: 12px; font-size: .58rem; font-weight: 700;
  color: rgba(255,255,255,.45); letter-spacing: .06em; text-transform: uppercase;
  z-index: 2;
}
.card-info { padding: 10px 12px 11px; background: rgba(255,255,255,.04); }
.card-title { display: block; font-size: .8rem; font-weight: 700; color: rgba(255,255,255,.9); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-bottom: 2px; }
.card-meta { margin-bottom: 5px; }
.card-by { font-size: .63rem; color: rgba(255,255,255,.28); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; display: block; }
.card-footer { display: flex; align-items: center; justify-content: space-between; }
.card-dur { font-size: .62rem; color: rgba(255,255,255,.25); }

/* Difficulty dots */
.diff-dots { display: flex; align-items: center; gap: 3px; }
.diff-dots.large .dot { width: 9px; height: 9px; }
.dot {
  width: 6px; height: 6px;
  border-radius: 50%;
  background: rgba(255,255,255,.15);
  transition: background .15s;
}
.dot.filled { background: transparent; }

.lang-btn-wrap { margin-left: auto; position: relative; flex-shrink: 0; }
.lang-btn {
  background: none; border: none;
  font-size: 1.15rem; line-height: 1;
  cursor: pointer; padding: .25rem .3rem;
  border-radius: 6px;
  opacity: .55;
  transition: opacity .15s, background .15s;
}
.lang-btn:hover { opacity: 1; background: rgba(255,255,255,.07); }
.lang-dropdown {
  position: absolute; top: calc(100% + 6px); right: 0;
  background: #1e1830;
  border: 1px solid rgba(255,255,255,.1);
  border-radius: 10px;
  padding: .3rem;
  display: flex; flex-direction: column; gap: 2px;
  z-index: 200;
  min-width: 140px;
  box-shadow: 0 8px 32px rgba(0,0,0,.65);
  animation: fade-in .12s ease;
}
.lang-option {
  display: flex; align-items: center; gap: .55rem;
  padding: .42rem .65rem;
  border: none; border-radius: 7px;
  background: transparent;
  color: rgba(255,255,255,.45);
  font-size: .78rem; font-weight: 600;
  cursor: pointer;
  transition: background .12s, color .12s;
  text-align: left; width: 100%;
}
.lang-option:hover { background: rgba(255,255,255,.07); color: rgba(255,255,255,.9); }
.lang-option.active { background: rgba(123,95,240,.2); color: #c4b5fd; }
.lo-flag { font-size: 1rem; line-height: 1; }
.lo-name { font-size: .75rem; }
.lang-backdrop { position: fixed; inset: 0; z-index: 199; }

/* ── Detail Modal ──────────────────────────────────────────────────────────── */
.modal-backdrop {
  position: fixed; inset: 0;
  background: rgba(0,0,0,.78);
  display: flex; align-items: center; justify-content: center;
  z-index: 100;
  backdrop-filter: blur(6px);
  animation: fade-in .18s ease;
}
@keyframes fade-in { from { opacity: 0 } to { opacity: 1 } }

.modal {
  width: min(560px, 94vw);
  max-height: 88vh;
  border-radius: 14px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  background: #18181f;
  border: 1px solid rgba(255,255,255,.08);
  box-shadow: 0 32px 80px rgba(0,0,0,.7);
  animation: pop-in .2s cubic-bezier(.34,1.56,.64,1);
}
@keyframes pop-in {
  from { opacity: 0; transform: scale(.93) translateY(12px) }
  to   { opacity: 1; transform: scale(1)  translateY(0) }
}

.modal-header {
  position: relative;
  padding: 2.2rem 1.8rem 1.8rem;
  flex-shrink: 0;
}
.modal-close {
  position: absolute; top: 14px; right: 14px;
  background: rgba(0,0,0,.3); border: none; border-radius: 50%;
  width: 30px; height: 30px;
  color: rgba(255,255,255,.85); font-size: .8rem;
  cursor: pointer; display: flex; align-items: center; justify-content: center;
  transition: background .15s;
  backdrop-filter: blur(4px);
}
.modal-close:hover { background: rgba(0,0,0,.55); }

.modal-hero { display: flex; align-items: flex-end; gap: 1.2rem; }
.modal-icon {
  font-size: 4.5rem; line-height: 1;
  filter: drop-shadow(0 4px 16px rgba(0,0,0,.5));
  flex-shrink: 0;
}
.modal-title-block { display: flex; flex-direction: column; gap: 3px; }
.modal-category {
  font-size: .65rem; font-weight: 800; letter-spacing: .12em; text-transform: uppercase;
  color: rgba(255,255,255,.55);
}
.modal-title { font-size: 1.65rem; font-weight: 900; margin: 0; letter-spacing: -.02em; color: #fff; }
.modal-subtitle { font-size: .85rem; color: rgba(255,255,255,.55); margin: 0; }

.modal-body { padding: 1.6rem 1.8rem; overflow-y: auto; display: flex; flex-direction: column; gap: 1.2rem; }

.modal-desc { font-size: .88rem; color: rgba(255,255,255,.65); line-height: 1.6; margin: 0; }

.contributor-card {
  background: rgba(255,255,255,.04);
  border: 1px solid rgba(255,255,255,.07);
  border-radius: 10px;
  padding: .9rem 1rem;
  display: flex;
  flex-direction: column;
  gap: .65rem;
}
.contributor-top { display: flex; align-items: flex-start; gap: .75rem; }
.contributor-avatar {
  width: 2.4rem; height: 2.4rem; border-radius: 50%;
  background: linear-gradient(135deg,#7c3aed,#2563eb);
  display: flex; align-items: center; justify-content: center;
  font-size: .95rem; font-weight: 700; color: #fff;
  flex-shrink: 0;
}
.contributor-info { display: flex; flex-direction: column; gap: .2rem; min-width: 0; }
.contributor-name {
  font-size: .82rem; font-weight: 600; color: rgba(255,255,255,.75);
  text-decoration: none; transition: color .15s;
}
a.contributor-name:hover { color: #fff; }
.contributor-name.plain { color: rgba(255,255,255,.55); }
.contributor-bio { font-size: .74rem; color: rgba(255,255,255,.38); margin: 0; line-height: 1.45; }
.contributor-links { display: flex; flex-wrap: wrap; align-items: center; gap: .4rem; }
.contributor-contact {
  font-size: .7rem; color: rgba(255,255,255,.3);
  background: rgba(255,255,255,.06); border-radius: 4px;
  padding: .15rem .45rem;
}
.contributor-link-chip {
  font-size: .7rem; color: rgba(255,255,255,.5);
  background: rgba(255,255,255,.07);
  border: 1px solid rgba(255,255,255,.1);
  border-radius: 4px; padding: .15rem .5rem;
  text-decoration: none; transition: background .15s, color .15s;
}
.contributor-link-chip:hover { background: rgba(255,255,255,.14); color: #fff; }

/* Stats grid */
.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(100px, 1fr));
  gap: 10px;
}
.stat-box {
  background: rgba(255,255,255,.04);
  border: 1px solid rgba(255,255,255,.07);
  border-radius: 10px;
  padding: .9rem 1rem;
  display: flex; flex-direction: column; gap: 4px;
}
.stat-label { font-size: .6rem; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; color: rgba(255,255,255,.3); }
.stat-big { font-size: 1.5rem; line-height: 1; font-weight: 800; color: rgba(255,255,255,.85); }
.stat-value { font-size: .72rem; color: rgba(255,255,255,.4); font-weight: 500; }
.time-sig { font-size: 1.3rem; font-family: serif; }

/* Tags */
.tags-row { display: flex; flex-wrap: wrap; gap: 6px; }
.tag {
  padding: .25rem .65rem;
  background: rgba(255,255,255,.06);
  border: 1px solid rgba(255,255,255,.1);
  border-radius: 20px;
  font-size: .68rem;
  color: rgba(255,255,255,.45);
  font-weight: 500;
}

/* Modal actions */
.modal-actions { display: flex; gap: .75rem; }
.btn-primary {
  flex: 1; padding: .8rem 1.5rem;
  background: linear-gradient(135deg,#7b5ff0,#5b3ad6);
  border: none; border-radius: 10px;
  color: #fff; font-size: .9rem; font-weight: 700;
  cursor: pointer; letter-spacing: .03em;
  transition: opacity .15s, transform .1s;
  box-shadow: 0 4px 20px rgba(91,58,214,.4);
}
.btn-primary:hover { opacity: .9; transform: translateY(-1px); }
.btn-secondary {
  padding: .8rem 1.4rem;
  background: rgba(255,255,255,.06);
  border: 1px solid rgba(255,255,255,.12);
  border-radius: 10px;
  color: rgba(255,255,255,.55); font-size: .88rem; font-weight: 600;
  cursor: pointer; transition: background .15s, color .15s;
}
.btn-secondary:hover { background: rgba(255,255,255,.1); color: rgba(255,255,255,.8); }
.btn-disabled {
  flex: 1; padding: .8rem; border: 1px solid rgba(255,255,255,.1);
  background: rgba(255,255,255,.04); border-radius: 10px;
  color: rgba(255,255,255,.25); font-size: .88rem; font-weight: 600;
  cursor: not-allowed;
}

/* ── Responsive breakpoints ──────────────────────────────────────────────────
   Desktop-first: Wails window can range from ~600px to 3840px+.
   Structural changes at 800px (narrow window) and 1800px / 2400px (wide).
   ─────────────────────────────────────────────────────────────────────────── */

/* ── Card grid: explicit column counts (Spotify-style) ─────────────────────── */
@media (max-width: 640px)  { .card-grid { grid-template-columns: repeat(2, 1fr); } }
@media (max-width: 900px) and (min-width: 641px)  { .card-grid { grid-template-columns: repeat(3, 1fr); } }
@media (max-width: 1100px) and (min-width: 901px) { .card-grid { grid-template-columns: repeat(4, 1fr); } }
/* default: 5 cols (901px–1600px range, set in base rule) */
@media (min-width: 1600px) { .card-grid { grid-template-columns: repeat(6, 1fr); } }
@media (min-width: 2000px) { .card-grid { grid-template-columns: repeat(7, 1fr); } }
@media (min-width: 2500px) { .card-grid { grid-template-columns: repeat(9, 1fr); } }

/* ── Quick pills: wrap naturally, nothing needed ─────────────────────────────── */

/* ── Wide window ────────────────────────────────────────────────────────────── */
@media (min-width: 1600px) {
  .sidebar { width: clamp(280px, 18%, 340px); }
  .logo-brand { font-size: 1.05rem; }
  .nav-item { font-size: .9rem; padding: .65rem .85rem; }
  .modal { width: min(640px, 94vw); }
  .modal-title { font-size: 1.9rem; }
  .modal-icon { font-size: 5rem; }
}
@media (min-width: 2200px) {
  .sidebar { width: clamp(320px, 15%, 400px); }
  .logo-icon { width: 2.8rem; height: 2.8rem; }
  .logo-brand { font-size: 1.2rem; }
  .nav-item { font-size: 1rem; padding: .75rem 1rem; }
  .sb-label { font-size: .68rem; }
  .card-info { padding: 13px 14px 14px; }
  .card-title { font-size: .9rem; }
  .card-by { font-size: .7rem; }
  .dot { width: 7px; height: 7px; }
}

/* Modal: low-height window (e.g. landscape on small monitor) */
@media (max-height: 680px) {
  .modal { max-height: 96vh; }
  .modal-header { padding: 1.3rem 1.5rem 1.1rem; }
  .modal-icon { font-size: 3rem; }
  .modal-title { font-size: 1.3rem; }
  .modal-body { padding: 1.1rem 1.5rem; gap: .9rem; }
  .stats-grid { grid-template-columns: repeat(4, 1fr); }
}
</style>
