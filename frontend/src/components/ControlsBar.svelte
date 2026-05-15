<script lang="ts">
  import { playbackStore, play, pause, stop, rewind, setSpeed, toggleLoop } from '../stores/playback'

  const SPEEDS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2] as const

  $: s = $playbackStore
  $: isPlaying = s.status === 'playing'
  $: hasRec = !!s.recording
  $: speed = s.speedMultiplier
  $: loopEnabled = s.loopEnabled
  $: hasLoop = s.loopStart != null && s.loopEnd != null && s.loopEnd > s.loopStart
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

  .sep {
    width: 1px;
    height: 20px;
    background: rgba(255,255,255,0.08);
    flex-shrink: 0;
    margin: 0 0.1rem;
  }
</style>
