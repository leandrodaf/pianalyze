<script lang="ts">
  import { t, locale, LOCALE_NAMES, type Locale } from '../lib/i18n'
  import { settingsStore } from '../stores/settings'
  import { DIFFICULTY_PRESETS, type DifficultyPreset } from '../lib/recording-types'
  import { loadFromUrl } from '../stores/exercises'
  import { exerciseStore } from '../stores/exercises'
  import { PickSaveDirectory } from '../../wailsjs/go/main/App'
  import type { Recording } from '../lib/recording-types'

  export let onClose: () => void
  export let onImportRecording: ((r: Recording) => void) | undefined = undefined

  // ── Presets ────────────────────────────────────────────────────────────────
  const PRESETS = Object.entries(DIFFICULTY_PRESETS) as [DifficultyPreset, typeof DIFFICULTY_PRESETS[DifficultyPreset]][]

  // ── Import by URL ──────────────────────────────────────────────────────────
  let importTab: 'recording' | 'exercises' = 'recording'
  let importUrl = ''
  let importLoading = false
  let importError = ''
  let importSuccess = false

  async function handleImportUrl() {
    const url = importUrl.trim()
    if (!url) return
    importLoading = true; importError = ''; importSuccess = false

    try {
      if (importTab === 'recording') {
        const res = await fetch(url)
        if (!res.ok) throw new Error('fetch')
        let data: unknown
        try { data = await res.json() } catch { throw new Error('parse') }
        if (typeof data !== 'object' || data === null) throw new Error('parse')
        onImportRecording?.(data as Recording)
        importUrl = ''
        importSuccess = true
        setTimeout(() => { importSuccess = false }, 2500)
      } else {
        await loadFromUrl(url)
        const err = $exerciseStore.error
        if (err) { importError = err } else { importUrl = ''; importSuccess = true; setTimeout(() => { importSuccess = false }, 2500) }
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      importError = $t(msg === 'fetch' ? 'settings.import.error.fetch' : 'settings.import.error.parse')
    } finally {
      importLoading = false
    }
  }

  // ── Locale options ─────────────────────────────────────────────────────────
  const LOCALE_OPTIONS: { code: Locale; flag: string }[] = [
    { code: 'pt-BR', flag: '🇧🇷' },
    { code: 'en',    flag: '🇺🇸' },
    { code: 'es',    flag: '🇪🇸' },
    { code: 'zh-CN', flag: '🇨🇳' },
  ]

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') onClose()
  }

  // ── Save path ──────────────────────────────────────────────────────────────
  let pathLoading = false
  let pathError = ''
  let localSavePath = ''

  // Keep localSavePath in sync with store; blocked while a dialog is open
  // to avoid the reactive overwriting a value mid-async operation.
  $: if (!pathLoading) localSavePath = $settingsStore.savePath

  function commitPath() {
    settingsStore.patch({ savePath: localSavePath.trim() })
  }

  async function handlePickDirectory() {
    pathLoading = true
    pathError = ''
    try {
      const dir = await PickSaveDirectory($t('settings.savepath.dialog'))
      if (dir) {
        localSavePath = dir
        settingsStore.patch({ savePath: dir })
      }
    } catch (e: unknown) {
      pathError = e instanceof Error ? e.message : String(e)
    } finally {
      pathLoading = false
    }
  }

  // Reset clears any custom path ('' = use OS default). Synchronous so the
  // reactive $: statement cannot overwrite localSavePath mid-operation.
  function handleResetPath() {
    localSavePath = ''
    settingsStore.patch({ savePath: '' })
    pathError = ''
  }
</script>

<svelte:window on:keydown={handleKeydown} />

<!-- svelte-ignore a11y-click-events-have-key-events -->
<div class="backdrop" on:click={onClose} role="presentation"></div>

<div class="modal" role="dialog" aria-modal="true" aria-label={$t('settings.title')}>

  <div class="modal-header">
    <span class="modal-title">⚙ {$t('settings.title')}</span>
    <button class="close-btn" on:click={onClose} aria-label={$t('settings.close')}>✕</button>
  </div>

  <div class="modal-body">

    <!-- ── Perfil do aluno ─────────────────────────────────────────────── -->
    <section class="settings-section">
      <div class="section-label">{$t('settings.profile')}</div>
      <p class="section-hint">{$t('settings.profile.hint')}</p>
      <div class="preset-cards">
        {#each PRESETS as [key, cfg]}
          <button
            class="preset-card"
            class:active={$settingsStore.skillLevel === key}
            on:click={() => settingsStore.setSkillLevel($settingsStore.skillLevel === key ? null : key)}
          >
            <span class="pc-icon">{cfg.icon}</span>
            <span class="pc-label">{$t(cfg.label)}</span>
            <span class="pc-speed">{cfg.speed * 100 | 0}%</span>
          </button>
        {/each}
      </div>
    </section>

    <div class="divider"></div>

    <!-- ── Exibição ────────────────────────────────────────────────────── -->
    <section class="settings-section">
      <div class="section-label">{$t('settings.display')}</div>
      <div class="row-setting">
        <span class="row-label">{$t('settings.chord.mode')}</span>
        <button
          class="toggle-pill"
          class:toggle-active={$settingsStore.chordDisplayMode === 'short'}
          on:click={() => settingsStore.toggleChordDisplayMode()}
        >
          <span class="tp-opt" class:selected={$settingsStore.chordDisplayMode === 'full'}>{$t('settings.chord.full')}</span>
          <span class="tp-sep">|</span>
          <span class="tp-opt" class:selected={$settingsStore.chordDisplayMode === 'short'}>{$t('settings.chord.short')}</span>
        </button>
      </div>
    </section>

    <div class="divider"></div>

    <!-- ── Idioma ──────────────────────────────────────────────────────── -->
    <section class="settings-section">
      <div class="section-label">{$t('settings.lang')}</div>
      <div class="lang-grid">
        {#each LOCALE_OPTIONS as opt}
          <button
            class="lang-card"
            class:active={$locale === opt.code}
            on:click={() => locale.set(opt.code)}
          >
            <span class="lc-flag">{opt.flag}</span>
            <span class="lc-name">{LOCALE_NAMES[opt.code]}</span>
          </button>
        {/each}
      </div>
    </section>

    <div class="divider"></div>

    <!-- ── Importar por link ───────────────────────────────────────────── -->
    <section class="settings-section">
      <div class="section-label">{$t('settings.import.title')}</div>

      <div class="import-tabs">
        <button
          class="import-tab"
          class:active={importTab === 'recording'}
          on:click={() => { importTab = 'recording'; importError = '' }}
        >{$t('settings.import.tab.recording')}</button>
        <button
          class="import-tab"
          class:active={importTab === 'exercises'}
          on:click={() => { importTab = 'exercises'; importError = '' }}
        >{$t('settings.import.tab.exercises')}</button>
      </div>

      <p class="section-hint">
        {importTab === 'recording' ? $t('settings.import.recording.hint') : $t('settings.import.exercises.hint')}
      </p>

      <div class="import-row">
        <input
          class="url-input"
          type="url"
          placeholder="https://…"
          bind:value={importUrl}
          on:keydown={e => e.key === 'Enter' && handleImportUrl()}
          disabled={importLoading || (importTab === 'recording' && !onImportRecording)}
        />
        <button
          class="load-btn"
          on:click={handleImportUrl}
          disabled={importLoading || !importUrl.trim() || (importTab === 'recording' && !onImportRecording)}
        >
          {#if importLoading}
            <span class="spin">⟳</span> {$t('settings.import.loading')}
          {:else}
            {$t('settings.import.load')}
          {/if}
        </button>
      </div>
      {#if importError}<p class="error-text">{importError}</p>{/if}
      {#if importSuccess}<p class="success-text">✓</p>{/if}
    </section>

    <div class="divider"></div>

    <!-- ── Pasta de gravações ──────────────────────────────────────────── -->
    <section class="settings-section">
      <div class="section-label">{$t('settings.savepath')}</div>
      <p class="section-hint">{$t('settings.savepath.hint')}</p>
      <div class="import-row">
        <input
          class="url-input"
          type="text"
          placeholder={$t('settings.savepath.default')}
          bind:value={localSavePath}
          on:blur={commitPath}
          on:keydown={e => e.key === 'Enter' && commitPath()}
          disabled={pathLoading}
        />
        <button
          class="load-btn"
          on:click={handlePickDirectory}
          disabled={pathLoading}
          title={$t('settings.savepath.change')}
        >
          {#if pathLoading}<span class="spin">⟳</span>{:else}📂{/if}
        </button>
        {#if localSavePath}
          <button
            class="load-btn load-btn-reset"
            on:click={handleResetPath}
            title={$t('settings.savepath.reset')}
          >↩</button>
        {/if}
      </div>
      {#if pathError}<p class="error-text">{pathError}</p>{/if}
    </section>

  </div>
</div>

<style>
  .backdrop {
    position: fixed; inset: 0;
    background: rgba(0,0,0,0.55);
    backdrop-filter: blur(3px);
    z-index: 200;
  }

  .modal {
    position: fixed;
    top: 50%; left: 50%;
    transform: translate(-50%, -50%);
    width: min(480px, calc(100vw - 2rem));
    max-height: calc(100vh - 4rem);
    overflow-y: auto;
    background: #13131f;
    border: 1px solid rgba(255,255,255,0.1);
    border-radius: 18px;
    z-index: 201;
    display: flex;
    flex-direction: column;
    box-shadow: 0 24px 80px rgba(0,0,0,0.6);
  }

  .modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 20px 24px 16px;
    border-bottom: 1px solid rgba(255,255,255,0.07);
    position: sticky; top: 0;
    background: #13131f;
    border-radius: 18px 18px 0 0;
    z-index: 1;
  }
  .modal-title {
    font-size: 1rem;
    font-weight: 700;
    color: #fff;
    letter-spacing: 0.02em;
  }
  .close-btn {
    background: none; border: none;
    color: rgba(255,255,255,0.4);
    font-size: 1rem; cursor: pointer;
    padding: 4px 8px; border-radius: 6px;
    transition: color 0.15s, background 0.15s;
  }
  .close-btn:hover { color: #fff; background: rgba(255,255,255,0.08); }

  .modal-body { padding: 20px 24px 28px; display: flex; flex-direction: column; gap: 0; }

  .settings-section { display: flex; flex-direction: column; gap: 10px; }
  .section-label {
    font-size: 0.65rem;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: rgba(255,255,255,0.4);
  }
  .section-hint {
    font-size: 0.75rem;
    color: rgba(255,255,255,0.35);
    margin: 0;
    line-height: 1.4;
  }

  .divider { height: 1px; background: rgba(255,255,255,0.07); margin: 18px 0; }

  /* Preset cards */
  .preset-cards { display: flex; gap: 8px; }
  .preset-card {
    flex: 1;
    display: flex; flex-direction: column; align-items: center; gap: 4px;
    padding: 12px 8px;
    background: rgba(255,255,255,0.04);
    border: 1px solid rgba(255,255,255,0.09);
    border-radius: 12px;
    cursor: pointer;
    transition: background 0.15s, border-color 0.15s;
    color: #fff;
  }
  .preset-card:hover { background: rgba(255,255,255,0.08); }
  .preset-card.active {
    background: rgba(99,102,241,0.22);
    border-color: rgba(99,102,241,0.65);
  }
  .pc-icon { font-size: 1.5rem; }
  .pc-label { font-size: 0.75rem; font-weight: 600; color: #fff; }
  .pc-speed { font-size: 0.65rem; color: rgba(255,255,255,0.4); }

  /* Chord mode toggle */
  .row-setting { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
  .row-label { font-size: 0.82rem; color: rgba(255,255,255,0.7); }
  .toggle-pill {
    display: flex; align-items: center; gap: 6px;
    background: rgba(255,255,255,0.06);
    border: 1px solid rgba(255,255,255,0.12);
    border-radius: 20px;
    padding: 5px 12px;
    cursor: pointer;
    transition: background 0.15s;
  }
  .toggle-pill:hover { background: rgba(255,255,255,0.1); }
  .toggle-pill.toggle-active { border-color: rgba(255,215,0,0.4); background: rgba(255,215,0,0.08); }
  .tp-opt { font-size: 0.72rem; color: rgba(255,255,255,0.35); transition: color 0.15s; }
  .tp-opt.selected { color: #fff; font-weight: 700; }
  .tp-sep { color: rgba(255,255,255,0.2); font-size: 0.7rem; }

  /* Language grid */
  .lang-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; }
  .lang-card {
    display: flex; align-items: center; gap: 10px;
    padding: 10px 14px;
    background: rgba(255,255,255,0.04);
    border: 1px solid rgba(255,255,255,0.09);
    border-radius: 10px;
    cursor: pointer;
    transition: background 0.15s, border-color 0.15s;
    color: #fff;
  }
  .lang-card:hover { background: rgba(255,255,255,0.08); }
  .lang-card.active {
    background: rgba(99,102,241,0.2);
    border-color: rgba(99,102,241,0.6);
  }
  .lc-flag { font-size: 1.2rem; }
  .lc-name { font-size: 0.78rem; font-weight: 500; }

  /* Import */
  .import-tabs { display: flex; gap: 4px; }
  .import-tab {
    flex: 1;
    padding: 6px 10px;
    background: rgba(255,255,255,0.04);
    border: 1px solid rgba(255,255,255,0.09);
    border-radius: 8px;
    color: rgba(255,255,255,0.45);
    font-size: 0.75rem; font-weight: 600;
    cursor: pointer;
    transition: background 0.15s, color 0.15s, border-color 0.15s;
  }
  .import-tab:hover { background: rgba(255,255,255,0.08); color: #fff; }
  .import-tab.active { background: rgba(99,102,241,0.2); border-color: rgba(99,102,241,0.55); color: #fff; }

  .import-row { display: flex; gap: 8px; }
  .url-input {
    flex: 1;
    background: rgba(255,255,255,0.06);
    border: 1px solid rgba(255,255,255,0.12);
    border-radius: 8px;
    padding: 8px 12px;
    color: #fff;
    font-size: 0.78rem;
    outline: none;
    min-width: 0;
  }
  .url-input:focus { border-color: rgba(99,102,241,0.6); }
  .url-input::placeholder { color: rgba(255,255,255,0.25); }
  .url-input:disabled { opacity: 0.4; }

  .load-btn {
    background: rgba(99,102,241,0.25);
    border: 1px solid rgba(99,102,241,0.45);
    border-radius: 8px;
    color: #fff;
    font-size: 0.78rem; font-weight: 600;
    padding: 8px 16px;
    cursor: pointer;
    white-space: nowrap;
    transition: background 0.15s;
  }
  .load-btn:hover:not(:disabled) { background: rgba(99,102,241,0.4); }
  .load-btn:disabled { opacity: 0.4; cursor: default; }

  .load-btn-reset {
    background: rgba(255,255,255,0.05);
    border-color: rgba(255,255,255,0.12);
    color: rgba(255,255,255,0.5);
  }
  .load-btn-reset:hover:not(:disabled) { background: rgba(255,255,255,0.1) !important; }

  .error-text { font-size: 0.72rem; color: #f87171; margin: 4px 0 0; }
  .success-text { font-size: 0.85rem; color: #4ade80; margin: 4px 0 0; }

  .spin { display: inline-block; animation: spin 0.8s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }
</style>
