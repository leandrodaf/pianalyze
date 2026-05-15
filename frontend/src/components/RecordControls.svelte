<script lang="ts">
  import { onDestroy } from 'svelte'
  import { StartRecording, StopRecording, SaveRecording, AutoSaveRecording, PauseRecording, ResumeRecording } from '../../wailsjs/go/main/App'
  import { t } from '../lib/i18n'
  import type { Recording } from '../lib/recording-types'

  /** Directory to auto-save recordings. Empty = use OS default from store. */
  export let savePath: string = ''
  /** Called when a recording is successfully auto-saved, passing the file path. */
  export let onSaved: ((path: string) => void) | undefined = undefined
  /** Called when recording is fully done (user dismissed / saved). */
  export let onDone: (() => void) | undefined = undefined
  /** Called whenever recording starts (true) or stops/finishes (false). */
  export let onRecordingStateChange: ((active: boolean) => void) | undefined = undefined

  let isRecording = false
  let isPaused = false
  let elapsed = 0
  let tickId = 0
  let startedAt = 0
  let pausedAt = 0
  let pausedTotal = 0
  let jsonData = ''
  let savedPath = ''
  let saving = false
  let saveError = ''

  async function start() {
    jsonData = ''; savedPath = ''; saveError = ''
    await StartRecording()
    isRecording = true; isPaused = false
    startedAt = Date.now(); pausedTotal = 0
    onRecordingStateChange?.(true)
    tickId = window.setInterval(() => {
      if (!isPaused) elapsed = Date.now() - startedAt - pausedTotal
    }, 200)
  }

  async function togglePause() {
    if (!isPaused) {
      await PauseRecording()
      isPaused = true
      pausedAt = Date.now()
    } else {
      await ResumeRecording()
      isPaused = false
      pausedTotal += Date.now() - pausedAt
    }
  }

  async function stop() {
    clearInterval(tickId)
    isRecording = false; isPaused = false
    onRecordingStateChange?.(false)
    elapsed = Date.now() - startedAt - pausedTotal
    jsonData = await StopRecording()
    await autoSave()
  }

  async function autoSave() {
    if (!jsonData) return
    saving = true; saveError = ''
    try {
      const rec: Recording = JSON.parse(jsonData)
      const iso = rec.recordedAt.slice(0, 19).replace(/[:T]/g, '-')
      const filename = `pianalyze-${iso}.pia`
      const dir = savePath || ''
      if (dir) {
        const p = await AutoSaveRecording(jsonData, dir, filename)
        savedPath = p
        onSaved?.(p)
      }
      // if no dir configured, fall back to dialog
      else {
        await SaveRecording(jsonData)
        savedPath = filename
        onSaved?.(filename)
      }
    } catch (e: unknown) {
      saveError = e instanceof Error ? e.message : String(e)
    } finally {
      saving = false
    }
  }

  async function saveAs() {
    if (!jsonData) return
    saving = true; saveError = ''
    try {
      await SaveRecording(jsonData)
    } catch (e: unknown) {
      saveError = e instanceof Error ? e.message : String(e)
    } finally {
      saving = false
    }
  }

  function fmt(ms: number): string {
    const s = Math.floor(ms / 1000)
    return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
  }

  onDestroy(() => clearInterval(tickId))
</script>

<div class="rec-controls">
  {#if !isRecording && !jsonData}
    <!-- Not yet started — show start button -->
    <button class="rec-btn" on:click={start} title={$t('rec.start')}>
      <span class="dot"></span>
      {$t('rec.start')}
    </button>

  {:else if isRecording}
    <!-- Recording in progress -->
    <button
      class="rec-btn recording"
      on:click={stop}
      title={$t('rec.stop')}
    >
      <span class="dot" class:paused={isPaused}></span>
      {$t('rec.stop')}
    </button>

    <button
      class="pause-btn"
      class:paused={isPaused}
      on:click={togglePause}
      title={isPaused ? $t('rec.resume') : $t('rec.pause')}
    >
      {isPaused ? '▶' : '⏸'}
    </button>

    <span class="timer" class:timer-paused={isPaused}>{fmt(elapsed)}</span>

  {:else}
    <!-- Saved state -->
    {#if saving}
      <span class="save-status spin">⟳</span>
    {:else if saveError}
      <span class="save-status error">✕ {saveError}</span>
      <button class="save-btn" on:click={saveAs}>{$t('rec.save.as')}</button>
    {:else if savedPath}
      <span class="save-status ok">✓ {$t('rec.auto.saved')}</span>
      <button class="save-btn" on:click={saveAs}>{$t('rec.save.as')}</button>
    {/if}

    {#if onDone}
      <button class="done-btn" on:click={onDone}>{$t('rec.done')}</button>
    {/if}
  {/if}
</div>

<style>
  .rec-controls {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .rec-btn {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    padding: 0.3rem 0.75rem;
    background: rgba(255,255,255,0.06);
    border: 1px solid rgba(255,255,255,0.12);
    border-radius: 4px;
    color: rgba(255,255,255,0.75);
    font-size: 0.75rem;
    font-weight: 700;
    letter-spacing: 0.06em;
    cursor: pointer;
    transition: background 0.15s, border-color 0.15s;
  }

  .rec-btn:hover { background: rgba(255,255,255,0.1); border-color: rgba(255,255,255,0.2); }

  .rec-btn.recording {
    background: rgba(220,40,40,0.18);
    border-color: #cc3030;
    color: #ff6060;
  }

  .dot {
    width: 8px; height: 8px;
    border-radius: 50%;
    background: #cc3030;
    flex-shrink: 0;
    animation: pulse 0.9s ease-in-out infinite;
  }

  .dot.paused { animation: none; opacity: 0.5; }

  .rec-btn:not(.recording) .dot { animation: none; }

  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50%       { opacity: 0.3; }
  }

  .pause-btn {
    padding: 0.25rem 0.5rem;
    background: rgba(255,255,255,0.06);
    border: 1px solid rgba(255,255,255,0.12);
    border-radius: 4px;
    color: rgba(255,255,255,0.7);
    font-size: 0.8rem;
    cursor: pointer;
    transition: background 0.15s;
  }

  .pause-btn:hover { background: rgba(255,255,255,0.12); }
  .pause-btn.paused { color: #f0c040; border-color: rgba(240,192,64,0.4); }

  .timer {
    font-size: 0.78rem;
    font-variant-numeric: tabular-nums;
    color: #ff7070;
    font-weight: 600;
    letter-spacing: 0.04em;
    min-width: 2.8rem;
  }

  .timer.timer-paused { color: #f0c040; }

  .save-status {
    font-size: 0.75rem;
    color: rgba(255,255,255,0.5);
  }

  .save-status.ok   { color: #70c07a; }
  .save-status.error { color: #ff7070; }

  .spin { display: inline-block; animation: spin 1s linear infinite; }

  @keyframes spin { to { transform: rotate(360deg); } }

  .save-btn {
    padding: 0.3rem 0.65rem;
    background: rgba(123,95,240,0.15);
    border: 1px solid rgba(123,95,240,0.35);
    border-radius: 4px;
    color: #b89af4;
    font-size: 0.75rem;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.15s;
  }

  .save-btn:hover { background: rgba(123,95,240,0.25); }

  .done-btn {
    padding: 0.3rem 0.65rem;
    background: rgba(255,255,255,0.05);
    border: 1px solid rgba(255,255,255,0.1);
    border-radius: 4px;
    color: rgba(255,255,255,0.5);
    font-size: 0.75rem;
    cursor: pointer;
    transition: background 0.15s;
  }

  .done-btn:hover { background: rgba(255,255,255,0.1); }
</style>
