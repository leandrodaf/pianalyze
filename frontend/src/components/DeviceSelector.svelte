<script lang="ts">
  import { onMount } from 'svelte'
  import { ListDevices, SelectDevice, StartCapture } from '../../wailsjs/go/main/App'
  import type { main } from '../../wailsjs/go/models'

  export let onStarted: () => void

  let devices: main.DeviceInfo[] = []
  let selectedId: number | null = null
  let loading = false
  let error = ''

  onMount(async () => {
    try {
      devices = await ListDevices()
      if (devices.length > 0) selectedId = devices[0].id
    } catch (e) {
      error = String(e)
    }
  })

  async function start() {
    if (selectedId === null) return
    loading = true
    error = ''
    try {
      await SelectDevice(selectedId)
      await StartCapture()
      onStarted()
    } catch (e) {
      error = String(e)
    } finally {
      loading = false
    }
  }
</script>

<div class="device-selector">
  <h1>Pianalyze</h1>
  <p class="subtitle">Select your MIDI device to begin</p>

  {#if error}
    <p class="error">{error}</p>
  {/if}

  {#if devices.length === 0}
    <p class="hint">No MIDI devices found. Connect a device and restart.</p>
  {:else}
    <ul class="device-list">
      {#each devices as device}
        <li
          class="device-item"
          class:selected={selectedId === device.id}
          on:click={() => selectedId = device.id}
          on:keydown={e => e.key === 'Enter' && (selectedId = device.id)}
          role="option"
          aria-selected={selectedId === device.id}
          tabindex="0"
        >
          <span class="device-name">{device.name}</span>
          <span class="device-mfr">{device.manufacturer}</span>
        </li>
      {/each}
    </ul>

    <button
      class="start-btn"
      on:click={start}
      disabled={loading || selectedId === null}
    >
      {loading ? 'Connecting…' : 'Start'}
    </button>
  {/if}
</div>

<style>
  .device-selector {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    gap: 1rem;
    color: #e0e0e0;
  }

  h1 {
    font-size: 2.5rem;
    font-weight: 700;
    letter-spacing: 0.05em;
    color: #4f9cf5;
    margin: 0;
  }

  .subtitle {
    color: #888;
    margin: 0;
  }

  .error {
    color: #f56565;
    font-size: 0.875rem;
  }

  .hint {
    color: #666;
    font-size: 0.875rem;
  }

  .device-list {
    list-style: none;
    padding: 0;
    margin: 0;
    width: 400px;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .device-item {
    padding: 0.75rem 1rem;
    border: 1px solid #333;
    border-radius: 6px;
    cursor: pointer;
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
    transition: border-color 0.15s, background 0.15s;
    outline: none;
  }

  .device-item:hover,
  .device-item:focus {
    border-color: #4f9cf5;
    background: rgba(79, 156, 245, 0.08);
  }

  .device-item.selected {
    border-color: #4f9cf5;
    background: rgba(79, 156, 245, 0.15);
  }

  .device-name {
    font-weight: 600;
    font-size: 0.95rem;
  }

  .device-mfr {
    font-size: 0.78rem;
    color: #888;
  }

  .start-btn {
    margin-top: 0.5rem;
    padding: 0.65rem 2.5rem;
    background: #4f9cf5;
    color: #fff;
    border: none;
    border-radius: 6px;
    font-size: 1rem;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.15s;
  }

  .start-btn:hover:not(:disabled) {
    background: #3a88e0;
  }

  .start-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
</style>
