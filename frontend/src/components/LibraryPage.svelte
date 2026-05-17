<script lang="ts">
  import { onMount } from 'svelte'
  import { t } from '../lib/i18n'
  import { addToast } from '../stores/toast'
  import { ListBuiltinLibrary, LoadBuiltinPiece } from '../../wailsjs/go/main/App'
  import type { main } from '../../wailsjs/go/models'
  import type { Recording } from '../lib/recording-types'

  export let onPlay: ((recording: Recording) => void) | undefined = undefined

  type Summary = main.RecordingSummary

  let items: Summary[] = []
  let loading = true
  let loadError = ''
  let search = ''
  let diffFilter = 0 // 0 = all, 1–5 = exact

  onMount(async () => {
    try {
      items = await ListBuiltinLibrary()
    } catch (e: unknown) {
      loadError = e instanceof Error ? e.message : String(e)
    } finally {
      loading = false
    }
  })

  async function handlePlay(item: Summary) {
    if (!onPlay) return
    try {
      const json = await LoadBuiltinPiece(item.filename)
      const recording = JSON.parse(json) as Recording
      onPlay(recording)
    } catch (e: unknown) {
      addToast(e instanceof Error ? e.message : String(e), 'error')
    }
  }

  function fmtDuration(ms: number): string {
    if (!ms) return '0:00'
    const s = Math.floor(ms / 1000)
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
  }

  function diffLabel(d: number): string {
    if (d <= 1) return $t('builtin.filter.beginner')
    if (d <= 2) return $t('builtin.filter.beginner') + '+'
    if (d <= 3) return $t('builtin.filter.intermediate')
    if (d <= 4) return $t('builtin.filter.advanced')
    return $t('builtin.filter.advanced') + '+'
  }

  // ── Derived ────────────────────────────────────────────────────────────────
  $: filtered = items.filter(item => {
    const q = search.trim().toLowerCase()
    if (q && !item.title.toLowerCase().includes(q) && !item.composer.toLowerCase().includes(q)) return false
    if (diffFilter > 0 && item.difficulty !== diffFilter) return false
    return true
  })

  // Group by composer (maintain first-seen order)
  $: grouped = (() => {
    const map = new Map<string, Summary[]>()
    for (const item of filtered) {
      const c = item.composer || 'Unknown'
      if (!map.has(c)) map.set(c, [])
      map.get(c)!.push(item)
    }
    // Sort composers alphabetically
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  })()
</script>

<div class="lib-page">

  <!-- ── Header ─────────────────────────────────────────────────────────────── -->
  <header class="lib-header">
    <div class="lib-header-text">
      <h1 class="lib-title">{$t('builtin.title')}</h1>
      <p class="lib-sub">{$t('builtin.subtitle')}</p>
    </div>
    <div class="lib-count">
      <span class="count-num">{items.length}</span>
      <span class="count-label">{items.length === 1 ? $t('builtin.piece') : $t('builtin.pieces')}</span>
    </div>
  </header>

  <!-- ── Filters ─────────────────────────────────────────────────────────────── -->
  <div class="filters">
    <div class="search-wrap">
      <span class="search-icon">🔍</span>
      <input
        class="search-input"
        type="search"
        placeholder={$t('builtin.search')}
        bind:value={search}
      />
    </div>
    <div class="diff-chips">
      {#each [0,1,2,3,4,5] as d}
        <button
          class="diff-chip"
          class:active={diffFilter === d}
          on:click={() => diffFilter = d}
        >
          {#if d === 0}
            {$t('builtin.filter.all')}
          {:else}
            {#each {length: 5} as _, i}
              <span class="chip-dot" class:filled={i < d}></span>
            {/each}
          {/if}
        </button>
      {/each}
    </div>
  </div>

  <!-- ── Content ────────────────────────────────────────────────────────────── -->
  {#if loading}
    <div class="state-center">
      <div class="spinner"></div>
      <p class="state-msg">{$t('builtin.loading')}</p>
    </div>

  {:else if loadError}
    <div class="state-center">
      <span class="state-icon">⚠</span>
      <p class="state-msg error">{loadError}</p>
    </div>

  {:else if filtered.length === 0}
    <div class="state-center">
      <span class="state-icon">🎵</span>
      <p class="state-msg">{$t('builtin.noResults')}</p>
    </div>

  {:else}
    <div class="composers">
      {#each grouped as [composer, pieces]}
        <section class="composer-section">
          <div class="composer-hdr">
            <span class="composer-name">{composer}</span>
            <span class="composer-count">{pieces.length} {pieces.length === 1 ? $t('builtin.piece') : $t('builtin.pieces')}</span>
          </div>
          <div class="pieces-grid">
            {#each pieces as item (item.filename)}
              <button class="piece-card" on:click={() => handlePlay(item)} disabled={!onPlay}>
                <div class="piece-cover">
                  {#if item.coverUrl}
                    <img src={item.coverUrl} alt={item.title} loading="lazy" />
                  {:else}
                    <span class="cover-placeholder">🎼</span>
                  {/if}
                  <div class="play-overlay">
                    <span class="play-icon">▶</span>
                  </div>
                </div>
                <div class="piece-info">
                  <span class="piece-title">{item.title}</span>
                  <div class="piece-meta">
                    {#if item.difficulty}
                      <span class="diff-dots" title={diffLabel(item.difficulty)}>
                        {#each {length: 5} as _, i}
                          <span class="d-dot" class:d-filled={i < item.difficulty}></span>
                        {/each}
                      </span>
                    {/if}
                    <span class="dur">{fmtDuration(item.durationMs)}</span>
                  </div>
                  {#if item.tags?.length}
                    <div class="tags">
                      {#each item.tags.slice(0, 3) as tag}
                        <span class="tag">{tag}</span>
                      {/each}
                    </div>
                  {/if}
                </div>
              </button>
            {/each}
          </div>
        </section>
      {/each}
    </div>
  {/if}

</div>

<style>
  .lib-page {
    height: 100%;
    overflow-y: auto;
    padding: 1.75rem 2rem 3rem;
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }

  /* ── Header ── */
  .lib-header {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 1rem;
  }
  .lib-title {
    margin: 0;
    font-size: 1.5rem;
    font-weight: 700;
    color: #fff;
    letter-spacing: -0.02em;
  }
  .lib-sub {
    margin: 0.25rem 0 0;
    font-size: 0.82rem;
    color: rgba(255,255,255,0.4);
  }
  .lib-count {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    flex-shrink: 0;
  }
  .count-num {
    font-size: 1.6rem;
    font-weight: 700;
    color: #7b5ff0;
    line-height: 1;
  }
  .count-label {
    font-size: 0.7rem;
    color: rgba(255,255,255,0.3);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  /* ── Filters ── */
  .filters {
    display: flex;
    gap: 0.75rem;
    align-items: center;
    flex-wrap: wrap;
  }
  .search-wrap {
    position: relative;
    flex: 1;
    min-width: 180px;
  }
  .search-icon {
    position: absolute;
    left: 0.6rem;
    top: 50%;
    transform: translateY(-50%);
    font-size: 0.8rem;
    pointer-events: none;
  }
  .search-input {
    width: 100%;
    background: rgba(255,255,255,0.05);
    border: 1px solid rgba(255,255,255,0.1);
    border-radius: 8px;
    color: #fff;
    font-size: 0.83rem;
    padding: 0.45rem 0.75rem 0.45rem 2rem;
    outline: none;
    transition: border-color 0.15s;
    box-sizing: border-box;
  }
  .search-input::placeholder { color: rgba(255,255,255,0.25); }
  .search-input:focus { border-color: rgba(123,95,240,0.5); }

  .diff-chips {
    display: flex;
    gap: 0.35rem;
  }
  .diff-chip {
    background: rgba(255,255,255,0.05);
    border: 1px solid rgba(255,255,255,0.1);
    border-radius: 6px;
    color: rgba(255,255,255,0.5);
    font-size: 0.75rem;
    padding: 0.35rem 0.6rem;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 2px;
    transition: background 0.15s, border-color 0.15s, color 0.15s;
  }
  .diff-chip:hover { background: rgba(255,255,255,0.1); color: #fff; }
  .diff-chip.active {
    background: rgba(123,95,240,0.2);
    border-color: rgba(123,95,240,0.5);
    color: #c4b5fd;
  }
  .chip-dot {
    width: 6px; height: 6px;
    border-radius: 50%;
    background: rgba(255,255,255,0.2);
    display: inline-block;
  }
  .chip-dot.filled { background: #7b5ff0; }

  /* ── States ── */
  .state-center {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.75rem;
    padding: 3rem;
  }
  .spinner {
    width: 2rem; height: 2rem;
    border: 2px solid rgba(255,255,255,0.1);
    border-top-color: #7b5ff0;
    border-radius: 50%;
    animation: spin 0.7s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }
  .state-icon { font-size: 2.5rem; }
  .state-msg {
    margin: 0;
    font-size: 0.88rem;
    color: rgba(255,255,255,0.4);
    text-align: center;
  }
  .state-msg.error { color: #f87171; }

  /* ── Composer sections ── */
  .composers {
    display: flex;
    flex-direction: column;
    gap: 2.5rem;
  }
  .composer-section { display: flex; flex-direction: column; gap: 1rem; }
  .composer-hdr {
    display: flex;
    align-items: baseline;
    gap: 0.75rem;
    padding-bottom: 0.5rem;
    border-bottom: 1px solid rgba(255,255,255,0.07);
  }
  .composer-name {
    font-size: 1rem;
    font-weight: 700;
    color: rgba(255,255,255,0.9);
    letter-spacing: -0.01em;
  }
  .composer-count {
    font-size: 0.72rem;
    color: rgba(255,255,255,0.3);
  }

  /* ── Piece cards grid ── */
  .pieces-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
    gap: 0.85rem;
  }

  .piece-card {
    background: rgba(255,255,255,0.03);
    border: 1px solid rgba(255,255,255,0.07);
    border-radius: 12px;
    padding: 0;
    cursor: pointer;
    text-align: left;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    transition: border-color 0.2s, transform 0.15s, background 0.2s;
  }
  .piece-card:hover:not(:disabled) {
    border-color: rgba(123,95,240,0.4);
    background: rgba(123,95,240,0.06);
    transform: translateY(-2px);
  }
  .piece-card:disabled { opacity: 0.5; cursor: default; }

  /* Cover image */
  .piece-cover {
    width: 100%;
    aspect-ratio: 1;
    position: relative;
    overflow: hidden;
    background: rgba(255,255,255,0.05);
    border-bottom: 1px solid rgba(255,255,255,0.06);
  }
  .piece-cover img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }
  .cover-placeholder {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 2.5rem;
    color: rgba(255,255,255,0.12);
  }
  .play-overlay {
    position: absolute;
    inset: 0;
    background: rgba(0,0,0,0.45);
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0;
    transition: opacity 0.2s;
  }
  .piece-card:hover:not(:disabled) .play-overlay { opacity: 1; }
  .play-icon {
    width: 2.5rem; height: 2.5rem;
    background: #7b5ff0;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 0.9rem;
    color: #fff;
    padding-left: 3px; /* optical centering of ▶ */
  }

  /* Info block */
  .piece-info {
    padding: 0.65rem 0.75rem 0.75rem;
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
    flex: 1;
  }
  .piece-title {
    font-size: 0.8rem;
    font-weight: 600;
    color: rgba(255,255,255,0.9);
    line-height: 1.3;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
  .piece-meta {
    display: flex;
    align-items: center;
    gap: 0.4rem;
  }
  .diff-dots {
    display: flex;
    gap: 2px;
    align-items: center;
  }
  .d-dot {
    width: 5px; height: 5px;
    border-radius: 50%;
    background: rgba(255,255,255,0.15);
    flex-shrink: 0;
  }
  .d-dot.d-filled { background: #7b5ff0; }
  .dur {
    font-size: 0.7rem;
    color: rgba(255,255,255,0.3);
  }
  .tags {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem;
    margin-top: 0.1rem;
  }
  .tag {
    background: rgba(123,95,240,0.12);
    border: 1px solid rgba(123,95,240,0.2);
    border-radius: 3px;
    padding: 0 0.3rem;
    font-size: 0.62rem;
    color: rgba(180,160,255,0.75);
    line-height: 1.6;
  }
</style>
