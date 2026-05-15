<script lang="ts">
  import { onDestroy } from 'svelte'
  import { StartRecording, StopRecording, SaveRecording } from '../../wailsjs/go/main/App'
  import type { Recording } from '../lib/recording-types'

  let isRecording = false
  let elapsed = 0
  let tickId = 0
  let startedAt = 0
  let jsonData = ''
  let fileName = ''

  async function toggleRecord() {
    if (!isRecording) {
      jsonData = ''
      fileName = ''
      await StartRecording()
      isRecording = true
      startedAt = Date.now()
      tickId = window.setInterval(() => { elapsed = Date.now() - startedAt }, 200)
    } else {
      clearInterval(tickId)
      isRecording = false
      elapsed = Date.now() - startedAt
      jsonData = await StopRecording()
      const rec: Recording = JSON.parse(jsonData)
      const iso = rec.recordedAt.slice(0, 19).replace(/[:T]/g, '-')
      fileName = `pianalyze-${iso}.pia`
    }
  }

  async function download() {
    await SaveRecording(jsonData)
  }

  function fmt(ms: number): string {
    const s = Math.floor(ms / 1000)
    return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
  }

  onDestroy(() => clearInterval(tickId))
</script>

<div class="rec-controls">
  <button
    class="rec-btn"
    class:recording={isRecording}
    on:click={toggleRecord}
    title={isRecording ? 'Stop recording' : 'Start recording'}
  >
    <span class="dot"></span>
    {isRecording ? 'STOP' : 'REC'}
  </button>

  {#if isRecording}
    <span class="timer">{fmt(elapsed)}</span>
  {/if}

  {#if jsonData && !isRecording}
    <button class="save-btn" on:click={download} title="Save recording">
      ⬇ Save
    </button>
  {/if}
</div>

<style>
  .rec-controls {
    display: flex;
    align-items: center;
    gap: 0.6rem;
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
    background: rgba(220, 40, 40, 0.18);
    border-color: #cc3030;
    color: #ff6060;
  }

  .dot {
    width: 8px; height: 8px;
    border-radius: 50%;
    background: #cc3030;
    flex-shrink: 0;
  }

  .recording .dot {
    animation: pulse 0.9s ease-in-out infinite;
  }

  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50%       { opacity: 0.3; }
  }

  .timer {
    font-size: 0.78rem;
    font-variant-numeric: tabular-nums;
    color: #ff7070;
    font-weight: 600;
    letter-spacing: 0.04em;
    min-width: 2.8rem;
  }

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
</style>
