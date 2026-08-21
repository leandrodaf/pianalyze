<script module lang="ts">
  export type IconName =
    | 'waterfall-view'
    | 'sheet-view'
    | 'music-note'
    | 'search'
    | 'download'
    | 'shuffle'
    | 'record'
    | 'folder'
    | 'folder-open'
    | 'trash'
    | 'edit'
    | 'alert-triangle'
    | 'headphones'
    | 'settings'
    | 'mail'
    | 'check'
    | 'x'
    | 'globe'
    | 'target'
    | 'play'
    | 'pause'
    | 'stop'
    | 'skip-back'
    | 'spinner'
    | 'midi'
    | 'hand-right'
    | 'hand-left'
    | 'hands-both'
    | 'sprout'
    | 'trophy'
</script>

<script lang="ts">
  export let name: IconName
  export let size: number = 16
  export let strokeWidth: number = 2
</script>

<svg
  width={size}
  height={size}
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width={strokeWidth}
  stroke-linecap="round"
  stroke-linejoin="round"
  aria-hidden="true"
  data-icon={name}
>
  {#if name === 'music-note'}
    <path d="M9 18V5l12-2v13"/>
    <circle cx="6" cy="18" r="3"/>
    <circle cx="18" cy="16" r="3"/>

  {:else if name === 'search'}
    <circle cx="11" cy="11" r="8"/>
    <line x1="21" y1="21" x2="16.65" y2="16.65"/>

  {:else if name === 'download'}
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
    <polyline points="7 10 12 15 17 10"/>
    <line x1="12" y1="15" x2="12" y2="3"/>

  {:else if name === 'shuffle'}
    <polyline points="16 3 21 3 21 8"/>
    <line x1="4" y1="20" x2="21" y2="3"/>
    <polyline points="21 16 21 21 16 21"/>
    <line x1="15" y1="15" x2="21" y2="21"/>
    <line x1="4" y1="4" x2="9" y2="9"/>

  {:else if name === 'record'}
    <circle cx="12" cy="12" r="9" fill="currentColor" stroke="none"/>

  {:else if name === 'folder'}
    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>

  {:else if name === 'folder-open'}
    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
    <polyline points="9 13 12 16 15 13"/>
    <line x1="12" y1="16" x2="12" y2="9"/>

  {:else if name === 'trash'}
    <polyline points="3 6 5 6 21 6"/>
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
    <line x1="10" y1="11" x2="10" y2="17"/>
    <line x1="14" y1="11" x2="14" y2="17"/>

  {:else if name === 'edit'}
    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>

  {:else if name === 'alert-triangle'}
    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
    <line x1="12" y1="9" x2="12" y2="13"/>
    <line x1="12" y1="17" x2="12.01" y2="17"/>

  {:else if name === 'headphones'}
    <path d="M3 18v-6a9 9 0 0 1 18 0v6"/>
    <path d="M3 18a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3v5z"/>
    <path d="M21 18a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3v5z"/>

  {:else if name === 'settings'}
    <circle cx="12" cy="12" r="3"/>
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06-.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>

  {:else if name === 'mail'}
    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
    <polyline points="22,6 12,13 2,6"/>

  {:else if name === 'check'}
    <polyline points="20 6 9 17 4 12"/>

  {:else if name === 'x'}
    <line x1="18" y1="6" x2="6" y2="18"/>
    <line x1="6" y1="6" x2="18" y2="18"/>

  {:else if name === 'globe'}
    <circle cx="12" cy="12" r="10"/>
    <line x1="2" y1="12" x2="22" y2="12"/>
    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>

  {:else if name === 'target'}
    <circle cx="12" cy="12" r="10"/>
    <circle cx="12" cy="12" r="6"/>
    <circle cx="12" cy="12" r="2"/>

  {:else if name === 'play'}
    <polygon points="5 3 19 12 5 21 5 3"/>

  {:else if name === 'pause'}
    <rect x="6" y="4" width="4" height="16"/>
    <rect x="14" y="4" width="4" height="16"/>

  {:else if name === 'stop'}
    <rect x="5" y="5" width="14" height="14" rx="1"/>

  {:else if name === 'skip-back'}
    <polygon points="19 20 9 12 19 4 19 20"/>
    <line x1="5" y1="4" x2="5" y2="20"/>

  {:else if name === 'spinner'}
    <circle cx="12" cy="12" r="9" class="arc"/>

  {:else if name === 'midi'}
    <rect x="2" y="7" width="20" height="10" rx="2"/>
    <line x1="7" y1="7" x2="7" y2="17"/>
    <line x1="12" y1="7" x2="12" y2="17"/>
    <line x1="17" y1="7" x2="17" y2="17"/>

  {:else if name === 'hand-right'}
    <path d="M18 8h1a4 4 0 0 1 0 8h-1"/>
    <path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"/>
    <line x1="6" y1="1" x2="6" y2="4"/>
    <line x1="10" y1="1" x2="10" y2="4"/>
    <line x1="14" y1="1" x2="14" y2="4"/>

  {:else if name === 'hand-left'}
    <path d="M6 8H5a4 4 0 0 0 0 8h1"/>
    <path d="M22 8H6v9a4 4 0 0 0 4 4h8a4 4 0 0 0 4-4V8z"/>
    <line x1="10" y1="1" x2="10" y2="4"/>
    <line x1="14" y1="1" x2="14" y2="4"/>
    <line x1="18" y1="1" x2="18" y2="4"/>

  {:else if name === 'hands-both'}
    <path d="M6 8H5a4 4 0 0 0 0 8h1M18 8h1a4 4 0 0 1 0 8h-1"/>
    <path d="M6 8h12v9a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V8z"/>

  {:else if name === 'sprout'}
    <path d="M7 20h10"/>
    <path d="M10 20c5.5-2.5.8-6.4 3-10"/>
    <path d="M9.5 9.4c1.1.8 1.8 2 2 3.3"/>
    <path d="M14.5 9.4c-1.1.8-1.8 2-2 3.3"/>
    <path d="M11 20c-5.5-2.5-.8-6.4-3-10"/>
    <path d="M14 4c0 2-1 3.5-2 4.5"/>

  {:else if name === 'waterfall-view'}
    <!-- Vertical piano-roll bars -->
    <rect x="3"  y="8"  width="4" height="13" rx="1"/>
    <rect x="10" y="4"  width="4" height="17" rx="1"/>
    <rect x="17" y="11" width="4" height="10" rx="1"/>

  {:else if name === 'sheet-view'}
    <!-- Staff lines with a note head -->
    <line x1="3" y1="7"  x2="21" y2="7"/>
    <line x1="3" y1="11" x2="21" y2="11"/>
    <line x1="3" y1="15" x2="21" y2="15"/>
    <line x1="3" y1="19" x2="21" y2="19"/>
    <ellipse cx="9" cy="15" rx="3" ry="2" fill="currentColor" stroke="none"/>
    <line x1="12" y1="15" x2="12" y2="5" stroke-width="1.8"/>

  {:else if name === 'trophy'}
    <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/>
    <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/>
    <path d="M4 22h16"/>
    <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/>
    <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/>
    <path d="M18 2H6v7a6 6 0 0 0 12 0V2z"/>
  {/if}
</svg>

<style>
  .arc {
    stroke-dasharray: 42 14;
    transform-origin: 12px 12px;
    animation: icon-spin 0.75s linear infinite;
  }
  @keyframes icon-spin {
    to { transform: rotate(360deg); }
  }
</style>
