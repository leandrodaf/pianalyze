<script lang="ts">
  import { onDestroy } from 'svelte'
  import {
    playbackStore,
    loadRecording,
    play, pause, stop, setPractice,
    formatMs,
  } from '../stores/playback'
  let fileInput: HTMLInputElement

  $: s          = $playbackStore
  $: hasRec     = !!s.recording
  $: isPlaying  = s.status === 'playing'
  $: isDone     = s.status === 'idle' && s.positionMs > 0 && s.positionMs >= s.durationMs
  $: progress   = s.durationMs > 0 ? (s.positionMs / s.durationMs) * 100 : 0
  $: isPractice = s.practice

  function togglePractice() {
    setPractice(!isPractice)
  }

  function openFile() { fileInput.click() }

  async function readPiaFile(file: File): Promise<unknown> {
    const buf = await file.arrayBuffer()
    const bytes = new Uint8Array(buf)
    // Detect gzip magic bytes (V3)
    if (bytes[0] === 0x1f && bytes[1] === 0x8b) {
      const ds = new DecompressionStream('gzip')
      const writer = ds.writable.getWriter()
      const reader = ds.readable.getReader()
      void writer.write(bytes).then(() => writer.close())
      const chunks: Uint8Array[] = []
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        chunks.push(value)
      }
      const total = chunks.reduce((n, c) => n + c.length, 0)
      const combined = new Uint8Array(total)
      let offset = 0
      for (const c of chunks) { combined.set(c, offset); offset += c.length }
      return JSON.parse(new TextDecoder().decode(combined))
    }
    return JSON.parse(new TextDecoder().decode(bytes))
  }

  async function onFile(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0]
    if (!file) return
    try {
      const raw = await readPiaFile(file)
      loadRecording(raw)
    } catch {
      // silently ignore malformed files for now
    }
    (e.target as HTMLInputElement).value = ''
  }

  function handlePlayPause() {
    if (isPlaying) pause()
    else play()
  }

  onDestroy(stop)
</script>

<div class="import-controls">
  <!-- Hidden file picker -->
  <input
    bind:this={fileInput}
    type="file"
    accept=".pia,.json"
    class="hidden"
    on:change={onFile}
  />

  <button class="icon-btn" on:click={openFile} title="Load .pia file">
    📂
  </button>

  {#if hasRec}
    <div class="sep"></div>

    <button
      class="icon-btn"
      on:click={handlePlayPause}
      disabled={isDone}
      title={isPlaying ? 'Pause' : 'Play'}
    >
      {isPlaying ? '⏸' : '▶'}
    </button>

    <button class="icon-btn" on:click={stop} title="Stop">⏹</button>

    <button
      class="icon-btn practice-btn"
      class:active={isPractice}
      on:click={togglePractice}
      title={isPractice ? 'Exit practice mode' : 'Practice mode'}
    >
      🎯
    </button>

    <!-- Progress bar -->
    <div class="progress-wrap">
      <div class="progress-fill" style="width: {progress}%"></div>
    </div>

    <span class="time">
      {formatMs(s.positionMs)}<span class="dur"> / {formatMs(s.durationMs)}</span>
    </span>
  {/if}
</div>

<style>
  .import-controls {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .hidden { display: none; }

  .icon-btn {
    padding: 0.3rem 0.55rem;
    background: rgba(255,255,255,0.06);
    border: 1px solid rgba(255,255,255,0.12);
    border-radius: 4px;
    color: rgba(255,255,255,0.6);
    font-size: 0.85rem;
    cursor: pointer;
    transition: background 0.15s;
    line-height: 1;
  }

  .icon-btn:hover:not(:disabled) { background: rgba(255,255,255,0.1); color: rgba(255,255,255,0.9); }
  .icon-btn:disabled { opacity: 0.3; cursor: not-allowed; }

  .sep {
    width: 1px; height: 18px;
    background: rgba(255,255,255,0.1);
  }

  .progress-wrap {
    width: 120px; height: 4px;
    background: rgba(255,255,255,0.08);
    border-radius: 2px;
    overflow: hidden;
    flex-shrink: 0;
  }

  .progress-fill {
    height: 100%;
    background: #7b5ff0;
    border-radius: 2px;
    transition: width 0.1s linear;
  }

  .time {
    font-size: 0.72rem;
    font-variant-numeric: tabular-nums;
    color: rgba(255,255,255,0.35);
    white-space: nowrap;
  }

  .dur { color: rgba(255,255,255,0.2); }

  .practice-btn { font-size: 0.9rem; }
  .practice-btn.active {
    background: rgba(255, 215, 0, 0.12);
    border-color: rgba(255, 215, 0, 0.5);
    color: #ffd700;
  }
</style>
