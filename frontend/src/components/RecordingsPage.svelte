<script lang="ts">
  import { onMount } from 'svelte'
  import { t } from '../lib/i18n'
  import Icon from './Icon.svelte'
  import { settingsStore } from '../stores/settings'
  import { addToast } from '../stores/toast'
  import {
    ListRecordings,
    UpdateRecordingMeta,
    DeleteRecording,
    OpenRecordingFolder,
    GetDefaultSavePath,
    ReadRecordingByPath,
    PickSaveDirectory,
  } from '../../wailsjs/go/main/App'
  import type { main } from '../../wailsjs/go/models'
  import type { Recording } from '../lib/recording-types'

  export let onLoad: ((recording: Recording) => void) | undefined = undefined

  type Summary = main.RecordingSummary

  let items: Summary[] = []
  let loading = false   // don't auto-load until folder is confirmed
  let loadError = ''
  let picking = false

  // per-card edit state
  let editingPath = ''
  let editTitle = ''
  let editComposer = ''
  let editCopyright = ''
  let saving = false

  // delete confirm
  let confirmDelete: Summary | null = null

  // Show setup screen when no folder is configured yet.
  $: needsSetup = $settingsStore.savePath === ''

  onMount(() => {
    if (!needsSetup) refresh()
  })

  async function useDefaultFolder() {
    picking = true
    try {
      const dir = await GetDefaultSavePath()
      settingsStore.patch({ savePath: dir })
      await refresh()
    } catch (e: unknown) {
      loadError = e instanceof Error ? e.message : String(e)
    } finally {
      picking = false
    }
  }

  async function chooseFolder() {
    picking = true
    try {
      const dir = await PickSaveDirectory($t('settings.savepath.dialog'))
      if (!dir) return // user cancelled
      settingsStore.patch({ savePath: dir })
      await refresh()
    } catch (e: unknown) {
      loadError = e instanceof Error ? e.message : String(e)
    } finally {
      picking = false
    }
  }

  async function refresh() {
    loading = true; loadError = ''
    try {
      const dir = $settingsStore.savePath || await GetDefaultSavePath()
      items = await ListRecordings(dir)
    } catch (e: unknown) {
      loadError = e instanceof Error ? e.message : String(e)
    } finally {
      loading = false
    }
  }

  function startEdit(item: Summary) {
    editingPath = item.path
    editTitle = item.title
    editComposer = item.composer
    editCopyright = item.copyright
  }

  function cancelEdit() {
    editingPath = ''
  }

  async function saveEdit(item: Summary) {
    saving = true
    try {
      await UpdateRecordingMeta(item.path, editTitle, editComposer, editCopyright)
      // reflect locally without a full refresh
      items = items.map(i =>
        i.path === item.path
          ? { ...i, title: editTitle, composer: editComposer, copyright: editCopyright }
          : i
      )
      editingPath = ''
    } catch (e: unknown) {
      addToast(e instanceof Error ? e.message : String(e), 'error')
    } finally {
      saving = false
    }
  }

  async function handleDelete(item: Summary) {
    confirmDelete = null
    try {
      await DeleteRecording(item.path)
      items = items.filter(i => i.path !== item.path)
    } catch (e: unknown) {
      addToast(e instanceof Error ? e.message : String(e), 'error')
    }
  }

  async function handleOpenFolder(item: Summary) {
    try {
      await OpenRecordingFolder(item.path)
    } catch { /* best-effort */ }
  }

  async function handleLoad(item: Summary) {
    if (!onLoad) return
    try {
      const json = await ReadRecordingByPath(item.path)
      const recording = JSON.parse(json) as Recording
      onLoad(recording)
    } catch (e: unknown) {
      addToast(e instanceof Error ? e.message : String(e), 'error')
    }
  }

  function fmtDate(iso: string): string {
    if (!iso) return '—'
    try {
      return new Date(iso).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' })
    } catch { return iso }
  }

  function fmtDuration(ms: number): string {
    if (!ms) return '0:00'
    const s = Math.floor(ms / 1000)
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
  }

  function fmtSize(b: number): string {
    if (b < 1024) return `${b} B`
    if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`
    return `${(b / (1024 * 1024)).toFixed(1)} MB`
  }
</script>

<div class="lib-page">
  <div class="lib-header">
    <h2 class="lib-title">{$t('library.title')}</h2>
    <button class="refresh-btn" on:click={refresh} title="Refresh" disabled={loading}>↻</button>
  </div>

  {#if needsSetup}
    <!-- ── First-run: ask user where to store recordings ── -->
    <div class="setup-card">
      <div class="setup-icon"><Icon name="folder" size={40}/></div>
      <h3 class="setup-title">{$t('library.setup.title')}</h3>
      <p class="setup-desc">{$t('library.setup.desc')}</p>
      <div class="setup-actions">
        <button class="btn-setup-primary" on:click={chooseFolder} disabled={picking}>
          {picking ? '⟳' : $t('library.setup.choose')}
        </button>
        <button class="btn-setup-secondary" on:click={useDefaultFolder} disabled={picking}>
          {$t('library.setup.default')}
        </button>
      </div>
      {#if loadError}<p class="lib-error">{loadError}</p>{/if}
    </div>

  {:else if loading}
    <div class="lib-loading">⟳</div>

  {:else if loadError}
    <p class="lib-error">{loadError}</p>

  {:else if items.length === 0}
    <div class="lib-empty">
      <span class="empty-icon"><Icon name="music-note" size={40}/></span>
      <p class="empty-msg">{$t('library.empty')}</p>
      <p class="empty-hint">{$t('library.empty.hint')}</p>
    </div>

  {:else}
    <div class="rec-list">
      {#each items as item (item.path)}
        <div class="rec-card" class:editing={editingPath === item.path}>

          {#if editingPath === item.path}
            <!-- ── Edit mode ── -->
            <div class="edit-form">
              <label class="edit-field">
                <span>{$t('library.field.title')}</span>
                <input bind:value={editTitle} placeholder={item.filename} />
              </label>
              <label class="edit-field">
                <span>{$t('library.field.composer')}</span>
                <input bind:value={editComposer} />
              </label>
              <label class="edit-field">
                <span>{$t('library.field.copyright')}</span>
                <input bind:value={editCopyright} />
              </label>
              <div class="edit-actions">
                <button class="btn-save" on:click={() => saveEdit(item)} disabled={saving}>
                  {saving ? '⟳' : $t('library.save')}
                </button>
                <button class="btn-cancel" on:click={cancelEdit}>{$t('library.cancel')}</button>
              </div>
            </div>

          {:else if confirmDelete?.path === item.path}
            <!-- ── Delete confirm ── -->
            <div class="confirm-row">
              <span class="confirm-msg"><Icon name="trash" size={14}/> {$t('library.delete.confirm')}</span>
              <button class="btn-del-confirm" on:click={() => handleDelete(item)}>✓</button>
              <button class="btn-cancel" on:click={() => confirmDelete = null}>{$t('library.cancel')}</button>
            </div>

          {:else}
            <!-- ── Normal view ── -->
            <div class="card-main">
              {#if item.coverUrl}
                <img class="card-cover" src={item.coverUrl} alt={item.title} loading="lazy" />
              {:else}
                <div class="card-cover card-cover-placeholder"><Icon name="music-note" size={22}/></div>
              {/if}
              <div class="card-left">
                <span class="card-title">{item.title || item.filename}</span>
                {#if item.composer}
                  <span class="card-composer">{item.composer}</span>
                {/if}
                <div class="card-meta">
                  {#if item.difficulty}
                    <span class="card-difficulty" title="Dificuldade {item.difficulty}/5">
                      {#each {length: 5} as _, i}
                        <span class:dot-filled={i < item.difficulty}>●</span>
                      {/each}
                    </span>
                    <span class="meta-sep">·</span>
                  {/if}
                  <span>{fmtDuration(item.durationMs)}</span>
                  <span class="meta-sep">·</span>
                  <span>{item.eventCount} {$t('library.events')}</span>
                  {#if item.tags?.length}
                    <span class="meta-sep">·</span>
                    {#each item.tags.slice(0,3) as tag}
                      <span class="tag-pill">{tag}</span>
                    {/each}
                  {/if}
                </div>
              </div>
              <div class="card-actions">
                {#if onLoad}
                  <button class="act-btn act-load" on:click={() => handleLoad(item)} title={$t('library.play')}><Icon name="play" size={14}/></button>
                {/if}
                <button class="act-btn act-edit" on:click={() => startEdit(item)} title={$t('library.edit')}><Icon name="edit" size={14}/></button>
                <button class="act-btn act-folder" on:click={() => handleOpenFolder(item)} title={$t('library.open.folder')}><Icon name="folder-open" size={14}/></button>
                <button class="act-btn act-del" on:click={() => confirmDelete = item} title={$t('library.delete')}><Icon name="trash" size={14}/></button>
              </div>
            </div>
          {/if}

        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .lib-page {
    padding: 1.5rem 1.75rem;
    height: 100%;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .lib-header {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .lib-title {
    font-size: 1.25rem;
    font-weight: 700;
    color: #fff;
    margin: 0;
  }

  .refresh-btn {
    background: rgba(255,255,255,0.06);
    border: 1px solid rgba(255,255,255,0.1);
    border-radius: 6px;
    color: rgba(255,255,255,0.5);
    font-size: 1rem;
    width: 2rem; height: 2rem;
    cursor: pointer;
    display: flex; align-items: center; justify-content: center;
    transition: color 0.15s;
  }
  .refresh-btn:hover:not(:disabled) { color: #fff; }

  .lib-loading {
    text-align: center;
    font-size: 1.5rem;
    color: rgba(255,255,255,0.3);
    animation: spin 0.8s linear infinite;
    display: inline-block;
    margin: 2rem auto;
  }
  @keyframes spin { to { transform: rotate(360deg); } }

  .lib-error { color: #f87171; font-size: 0.85rem; }

  /* ── First-run setup card ── */
  .setup-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.75rem;
    margin: 2.5rem auto;
    max-width: 340px;
    text-align: center;
    background: rgba(255,255,255,0.04);
    border: 1px solid rgba(255,255,255,0.08);
    border-radius: 14px;
    padding: 2rem 1.5rem;
  }
  .setup-icon { color: rgba(255,255,255,0.3); }
  .setup-title {
    margin: 0;
    font-size: 1rem;
    font-weight: 600;
    color: rgba(255,255,255,0.9);
  }
  .setup-desc {
    margin: 0;
    font-size: 0.82rem;
    color: rgba(255,255,255,0.45);
    line-height: 1.5;
  }
  .setup-actions {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    width: 100%;
    margin-top: 0.25rem;
  }
  .btn-setup-primary {
    background: #6366f1;
    color: #fff;
    border: none;
    border-radius: 8px;
    padding: 0.6rem 1rem;
    font-size: 0.88rem;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.15s;
  }
  .btn-setup-primary:hover:not(:disabled) { background: #4f46e5; }
  .btn-setup-primary:disabled { opacity: 0.5; cursor: default; }
  .btn-setup-secondary {
    background: rgba(255,255,255,0.06);
    color: rgba(255,255,255,0.6);
    border: 1px solid rgba(255,255,255,0.1);
    border-radius: 8px;
    padding: 0.55rem 1rem;
    font-size: 0.82rem;
    cursor: pointer;
    transition: color 0.15s;
  }
  .btn-setup-secondary:hover:not(:disabled) { color: #fff; }
  .btn-setup-secondary:disabled { opacity: 0.5; cursor: default; }

  .lib-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
    margin: 3rem auto;
    text-align: center;
  }
  .empty-icon { color: rgba(255,255,255,0.3); }
  .empty-msg { color: rgba(255,255,255,0.7); font-size: 1rem; margin: 0; }
  .empty-hint { color: rgba(255,255,255,0.35); font-size: 0.82rem; margin: 0; }

  .rec-list {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
  }

  .rec-card {
    background: rgba(255,255,255,0.04);
    border: 1px solid rgba(255,255,255,0.08);
    border-radius: 10px;
    padding: 0.85rem 1rem;
    transition: border-color 0.15s;
  }
  .rec-card:hover { border-color: rgba(123,95,240,0.3); }
  .rec-card.editing { border-color: rgba(123,95,240,0.5); background: rgba(123,95,240,0.06); }

  .card-main {
    display: flex;
    align-items: center;
    gap: 0.85rem;
  }

  .card-cover {
    width: 3rem;
    height: 3rem;
    border-radius: 6px;
    object-fit: cover;
    flex-shrink: 0;
    background: rgba(255,255,255,0.06);
    border: 1px solid rgba(255,255,255,0.08);
  }
  .card-cover-placeholder {
    display: flex;
    align-items: center;
    justify-content: center;
    color: rgba(255,255,255,0.25);
  }

  .card-left {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
  }

  .card-title {
    font-size: 0.9rem;
    font-weight: 600;
    color: #fff;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .card-composer {
    font-size: 0.78rem;
    color: rgba(255,255,255,0.5);
  }

  .card-meta {
    display: flex;
    align-items: center;
    gap: 0.3rem;
    flex-wrap: wrap;
    font-size: 0.72rem;
    color: rgba(255,255,255,0.35);
    margin-top: 0.15rem;
  }
  .meta-sep { opacity: 0.4; }

  .card-difficulty {
    display: flex;
    gap: 1px;
    font-size: 0.6rem;
    letter-spacing: -1px;
  }
  .card-difficulty span { color: rgba(255,255,255,0.15); }
  .card-difficulty span.dot-filled { color: #7b5ff0; }

  .tag-pill {
    background: rgba(123,95,240,0.15);
    border: 1px solid rgba(123,95,240,0.25);
    border-radius: 3px;
    padding: 0 0.35rem;
    font-size: 0.66rem;
    color: rgba(180,160,255,0.8);
    line-height: 1.5;
  }

  .card-actions {
    display: flex;
    gap: 0.3rem;
    flex-shrink: 0;
  }

  .act-btn {
    background: rgba(255,255,255,0.05);
    border: 1px solid rgba(255,255,255,0.09);
    border-radius: 6px;
    color: rgba(255,255,255,0.55);
    font-size: 0.8rem;
    width: 2rem; height: 2rem;
    cursor: pointer;
    display: flex; align-items: center; justify-content: center;
    transition: background 0.15s, color 0.15s;
  }
  .act-btn:hover { background: rgba(255,255,255,0.1); color: #fff; }
  .act-load { color: #7b5ff0; border-color: rgba(123,95,240,0.3); }
  .act-load:hover { background: rgba(123,95,240,0.2); }
  .act-del:hover { background: rgba(220,40,40,0.2); color: #f87171; border-color: rgba(220,40,40,0.3); }

  /* Edit form */
  .edit-form {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .edit-field {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
  }
  .edit-field span {
    font-size: 0.7rem;
    color: rgba(255,255,255,0.4);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .edit-field input {
    background: rgba(255,255,255,0.07);
    border: 1px solid rgba(255,255,255,0.12);
    border-radius: 6px;
    color: #fff;
    font-size: 0.85rem;
    padding: 0.4rem 0.6rem;
    outline: none;
    transition: border-color 0.15s;
  }
  .edit-field input:focus { border-color: rgba(123,95,240,0.6); }

  .edit-actions {
    display: flex;
    gap: 0.5rem;
    margin-top: 0.25rem;
  }

  .btn-save {
    background: rgba(123,95,240,0.3);
    border: 1px solid rgba(123,95,240,0.5);
    border-radius: 7px;
    color: #fff;
    font-size: 0.8rem;
    font-weight: 600;
    padding: 0.35rem 0.9rem;
    cursor: pointer;
    transition: background 0.15s;
  }
  .btn-save:hover:not(:disabled) { background: rgba(123,95,240,0.5); }
  .btn-save:disabled { opacity: 0.4; cursor: default; }

  .btn-cancel {
    background: rgba(255,255,255,0.05);
    border: 1px solid rgba(255,255,255,0.1);
    border-radius: 7px;
    color: rgba(255,255,255,0.55);
    font-size: 0.8rem;
    padding: 0.35rem 0.9rem;
    cursor: pointer;
    transition: background 0.15s;
  }
  .btn-cancel:hover { background: rgba(255,255,255,0.1); }

  /* Delete confirm */
  .confirm-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-wrap: wrap;
  }
  .confirm-msg { font-size: 0.82rem; color: #f87171; flex: 1; }
  .btn-del-confirm {
    background: rgba(220,40,40,0.25);
    border: 1px solid rgba(220,40,40,0.4);
    border-radius: 6px;
    color: #f87171;
    font-size: 0.8rem;
    padding: 0.3rem 0.7rem;
    cursor: pointer;
    transition: background 0.15s;
  }
  .btn-del-confirm:hover { background: rgba(220,40,40,0.4); }
</style>
