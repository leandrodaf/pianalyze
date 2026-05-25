<script lang="ts">
  import { fly, fade } from 'svelte/transition'
  import { flip } from 'svelte/animate'
  import { toasts, removeToast, type Toast } from '../stores/toast'
  import Icon from './Icon.svelte'

  type IconName = 'music-note' | 'check' | 'alert-triangle' | 'x'

  const ICON_MAP: Record<Toast['type'], IconName> = {
    info:    'music-note',
    success: 'check',
    warning: 'alert-triangle',
    error:   'x',
  }

  const COLORS: Record<Toast['type'], string> = {
    info:    'rgba(123,95,240,0.9)',
    success: 'rgba(34,197,94,0.9)',
    warning: 'rgba(234,179,8,0.9)',
    error:   'rgba(239,68,68,0.9)',
  }
</script>

<div class="toast-container" aria-live="polite" aria-atomic="false">
  {#each $toasts as toast (toast.id)}
    <div
      class="toast"
      style="--accent:{COLORS[toast.type]}"
      animate:flip={{ duration: 200 }}
      in:fly={{ y: -20, duration: 250 }}
      out:fade={{ duration: 200 }}
      role="status"
    >
      <span class="toast-icon"><Icon name={ICON_MAP[toast.type]} size={15}/></span>
      <span class="toast-msg">{toast.message}</span>
      <button class="toast-close" on:click={() => removeToast(toast.id)} aria-label="Dismiss">
        <Icon name="x" size={12} strokeWidth={2.5}/>
      </button>
    </div>
  {/each}
</div>

<style>
  .toast-container {
    position: fixed;
    top: 16px;
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    z-index: 9999;
    pointer-events: none;
  }

  .toast {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 16px;
    border-radius: 10px;
    background: rgba(20, 22, 30, 0.92);
    border: 1px solid var(--accent);
    box-shadow: 0 4px 24px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.04);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    pointer-events: all;
    max-width: 420px;
    min-width: 220px;
  }

  .toast-icon {
    display: flex;
    align-items: center;
    color: var(--accent);
    flex-shrink: 0;
  }

  .toast-msg {
    font-size: 0.82rem;
    font-weight: 600;
    color: rgba(255,255,255,0.9);
    line-height: 1.35;
    flex: 1;
  }

  .toast-close {
    display: flex;
    align-items: center;
    background: none;
    border: none;
    color: rgba(255,255,255,0.3);
    cursor: pointer;
    padding: 2px 4px;
    border-radius: 4px;
    flex-shrink: 0;
    transition: color 0.15s;
  }

  .toast-close:hover { color: rgba(255,255,255,0.7); }
</style>
