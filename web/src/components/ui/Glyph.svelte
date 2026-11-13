<script lang="ts">
  const {
    name,
    size = 'md'
  }: {
    /** Picks which mark is drawn. */
    name: GlyphName
    /** Scales the mark against the type scale. */
    size?: 'sm' | 'md' | 'lg'
  } = $props()
</script>

<script lang="ts" module>
  export type GlyphName =
    | 'menu'
    | 'chat'
    | 'bell'
    | 'send'
    | 'export'
    | 'levelup'
    | 'sources'
    | 'theme'
    | 'reveal'
    | 'conceal'
    | 'sound'
    | 'search'
    | 'close'
    | 'character'
    | 'campaign'
    | 'gear'
    | 'fold'
    | 'unfold'
    | 'add'
    | 'minus'
    | 'edit'
    | 'copy'
    | 'remove'
    | 'back'
    | 'forward'
    | 'revert'
    | 'save'
    | 'picture'
    | 'key'
    | 'more'
    | 'grip'
    | 'zoomin'
    | 'zoomout'
    | 'group'
    | 'blocks'
    | 'music'
    | 'play'
    | 'pause'
    | 'record'
    | 'stop'
    | 'next'
    | 'prev'
    | 'shuffle'
    | 'repeat'
    | 'repeatone'
    | 'upload'
    | 'scroll'
    | 'weapon'
    | 'armor'
    | 'ammunition'
    | 'tool'
    | 'potion'
    | 'gem'
    | 'chest'
    | 'pointer'
    | 'lines'
    | 'rectangle'
    | 'ellipse'
    | 'door'
    | 'window'
    | 'bend'
    | 'floorplan'
    | 'wall'
    | 'furniture'
    | 'fit'
    | 'pane'
    | 'split'
    | 'cube'

  export function getMimeGlyph(mimeType: string): GlyphName {
    if (mimeType.startsWith('image/')) return 'picture'
    if (mimeType.startsWith('video/')) return 'play'
    if (mimeType.startsWith('audio/')) return 'sound'
    if (mimeType === 'application/pdf') return 'scroll'
    return 'sources'
  }
</script>

<svg
  class="dnd-glyph dnd-glyph-{size}"
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width="1.6"
  stroke-linecap="round"
  stroke-linejoin="round"
  aria-hidden="true"
  focusable="false"
>
  {#if name === 'weapon'}
    <path d="M19 4 9.5 13.5M19 4h-3.5M19 4v3.5" />
    <path d="M7 12l5 5M5.5 15.5l3 3M4 20l3-3" />

  {:else if name === 'armor'}
    <path d="M12 3.5 19 6v5.5c0 4.2-3 7.3-7 9-4-1.7-7-4.8-7-9V6Z" />
    <path d="M12 7v10M8.5 10.5h7" opacity="0.7" />

  {:else if name === 'ammunition'}
    <path d="M5 19 18 6" />
    <path d="M18 6h-4M18 6v4" />
    <path d="M5 19l1-3.5M5 19l3.5-1M7.5 16.5l1-3.5M7.5 16.5l3.5-1" opacity="0.75" />

  {:else if name === 'tool'}
    <path d="M13.5 6.5 17.5 10.5 20 8l-4-4Z" />
    <path d="M15.5 8.5 5 19" />

  {:else if name === 'potion'}
    <path d="M10 3.5h4M10.5 3.5v5L6 17a3 3 0 0 0 2.7 4h6.6A3 3 0 0 0 18 17l-4.5-8.5v-5" />
    <path d="M7.8 14h8.4" opacity="0.7" />

  {:else if name === 'gem'}
    <path d="M7 4h10l4 5-9 11L3 9Z" />
    <path d="M3 9h18M9.5 4 8 9l4 11 4-11-1.5-5" opacity="0.7" />

  {:else if name === 'chest'}
    <path d="M4 10h16v9H4ZM4 10c0-3 2-5 4-5h8c2 0 4 2 4 5" />
    <path d="M10.5 12h3v3h-3Z" fill="currentColor" stroke="none" />

  {:else if name === 'menu'}
    <path d="M4 7h16M4 12h16M4 17h16" />
    <path d="M12 3.5 13.4 5 12 6.5 10.6 5 12 3.5Z" fill="currentColor" stroke="none" />

  {:else if name === 'bell'}
    <path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15Z" />
    <path d="M10 20a2 2 0 0 0 4 0" opacity="0.75" />

  {:else if name === 'chat'}
    <path d="M4 9c0-2.2 1.8-4 4-4h8c2.2 0 4 1.8 4 4v4c0 2.2-1.8 4-4 4h-4l-4 3v-3c-2.2 0-4-1.8-4-4Z" />
    <path d="M9 11h6" opacity="0.7" />

  {:else if name === 'send'}
    <path d="M4 12 20 6l-4 6 4 6Z" />
    <path d="M4 12h9" opacity="0.75" />

  {:else if name === 'export'}
    <path d="M12 4v10" />
    <path d="M8.5 10.5 12 14l3.5-3.5" />
    <path d="M5 16v2c0 1.1.9 2 2 2h10c1.1 0 2-.9 2-2v-2" />

  {:else if name === 'levelup'}
    <path d="M12 3.5 15 8h-2.2v5h-1.6V8H9L12 3.5Z" fill="currentColor" stroke="none" />
    <path d="M6 16h12M7.5 19.5h9" />

  {:else if name === 'sources'}
    <path d="M6 4h8l4 4v12H6Z" />
    <path d="M14 4v4h4" opacity="0.8" />
    <path d="M9 13h6M9 16.5h4" opacity="0.7" />

  {:else if name === 'theme'}
    <circle cx="12" cy="12" r="8" />
    <path d="M12 4a8 8 0 0 1 0 16Z" fill="currentColor" stroke="none" opacity="0.85" />

  {:else if name === 'reveal'}
    <path d="M2.5 12S6 6.5 12 6.5 21.5 12 21.5 12 18 17.5 12 17.5 2.5 12 2.5 12Z" />
    <circle cx="12" cy="12" r="2.6" fill="currentColor" stroke="none" />

  {:else if name === 'conceal'}
    <path d="M2.5 12S6 6.5 12 6.5c1.6 0 3 .4 4.2 1" />
    <path d="M21.5 12s-2 3.2-5.6 4.6" opacity="0.8" />
    <path d="M4 4l16 16" />

  {:else if name === 'sound'}
    <path d="M5 10v4h3l4 3V7l-4 3Z" fill="currentColor" stroke="none" />
    <path d="M15.5 9.5a3.5 3.5 0 0 1 0 5" />
    <path d="M18 7a7 7 0 0 1 0 10" opacity="0.7" />

  {:else if name === 'search'}
    <circle cx="10.5" cy="10.5" r="6" />
    <path d="M15 15l5 5" />

  {:else if name === 'close'}
    <path d="M7 7l10 10M17 7 7 17" />

  {:else if name === 'character'}
    <path d="M12 3 14.4 8.2 20 9l-4 4 .9 5.6L12 16l-4.9 2.6L8 13 4 9l5.6-.8L12 3Z" />
    <path d="M12 7.5 13 10l2.6.4-1.9 1.8.5 2.6-2.2-1.2-2.2 1.2.5-2.6L8.4 10.4 11 10l1-2.5Z" fill="currentColor" stroke="none" opacity="0.8" />

  {:else if name === 'campaign'}
    <path d="M4 20V9l4-3 4 3 4-3 4 3v11Z" />
    <path d="M8 20v-5h3v5M13 20v-5h3v5" opacity="0.75" />
    <path d="M12 3v3" />

  {:else if name === 'picture'}
    <rect x="4" y="5" width="16" height="14" rx="2" />
    <path d="M4 16l5-5 4 4 3-3 4 4" opacity="0.8" />
    <circle cx="15.5" cy="9.5" r="1.5" opacity="0.7" />

  {:else if name === 'key'}
    <circle cx="8" cy="12" r="3.5" />
    <path d="M11.5 12h8.5M17 12v3M20 12v2.5" />

  {:else if name === 'more'}
    <circle cx="6" cy="12" r="1.4" fill="currentColor" stroke="none" />
    <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" />
    <circle cx="18" cy="12" r="1.4" fill="currentColor" stroke="none" />

  {:else if name === 'grip'}
    <circle cx="9" cy="6" r="1.3" fill="currentColor" stroke="none" />
    <circle cx="15" cy="6" r="1.3" fill="currentColor" stroke="none" />
    <circle cx="9" cy="12" r="1.3" fill="currentColor" stroke="none" />
    <circle cx="15" cy="12" r="1.3" fill="currentColor" stroke="none" />
    <circle cx="9" cy="18" r="1.3" fill="currentColor" stroke="none" />
    <circle cx="15" cy="18" r="1.3" fill="currentColor" stroke="none" />

  {:else if name === 'zoomin'}
    <circle cx="11" cy="11" r="6.5" />
    <path d="M16 16l4.5 4.5M8.5 11h5M11 8.5v5" />

  {:else if name === 'zoomout'}
    <circle cx="11" cy="11" r="6.5" />
    <path d="M16 16l4.5 4.5M8.5 11h5" />

  {:else if name === 'group'}
    <path d="M4 7h6l2 2h8v10H4Z" />
    <path d="M4 11h16" opacity="0.6" />

  {:else if name === 'blocks'}
    <rect x="4" y="4" width="7" height="7" rx="1.5" />
    <rect x="13" y="4" width="7" height="7" rx="1.5" />
    <rect x="4" y="13" width="7" height="7" rx="1.5" />
    <rect x="13" y="13" width="7" height="7" rx="1.5" opacity="0.6" />

  {:else if name === 'music'}
    <path d="M9 18V6l10-2v12" />
    <circle cx="6.5" cy="18" r="2.5" fill="currentColor" stroke="none" />
    <circle cx="16.5" cy="16" r="2.5" fill="currentColor" stroke="none" />

  {:else if name === 'play'}
    <path d="M7 5v14l11-7Z" fill="currentColor" stroke="none" />

  {:else if name === 'record'}
    <rect x="9" y="3" width="6" height="11" rx="3" />
    <path d="M6 11a6 6 0 0 0 12 0M12 17v4M9 21h6" />

  {:else if name === 'stop'}
    <path d="M6 6h12v12H6Z" fill="currentColor" stroke="none" />

  {:else if name === 'pause'}
    <path d="M7 5h3.5v14H7ZM13.5 5H17v14h-3.5Z" fill="currentColor" stroke="none" />

  {:else if name === 'next'}
    <path d="M5 5v14l9-7Z" fill="currentColor" stroke="none" />
    <path d="M17 5v14" />

  {:else if name === 'prev'}
    <path d="M19 5v14l-9-7Z" fill="currentColor" stroke="none" />
    <path d="M7 5v14" />

  {:else if name === 'shuffle'}
    <path d="M4 7h3.5c1.4 0 2.6.7 3.4 1.8l2.2 3.4c.8 1.1 2 1.8 3.4 1.8H20" />
    <path d="M4 17h3.5c1.4 0 2.6-.7 3.4-1.8l2.2-3.4c.8-1.1 2-1.8 3.4-1.8H20" opacity="0.7" />
    <path d="M17.5 4.5 20 7l-2.5 2.5M17.5 14.5 20 17l-2.5 2.5" />

  {:else if name === 'repeat'}
    <path d="M6 9.5V9a3 3 0 0 1 3-3h10" />
    <path d="M16.5 3.5 19 6l-2.5 2.5" />
    <path d="M18 14.5v.5a3 3 0 0 1-3 3H5" />
    <path d="M7.5 20.5 5 18l2.5-2.5" />

  {:else if name === 'repeatone'}
    <path d="M6 9.5V9a3 3 0 0 1 3-3h10" />
    <path d="M16.5 3.5 19 6l-2.5 2.5" />
    <path d="M18 14.5v.5a3 3 0 0 1-3 3H5" />
    <path d="M7.5 20.5 5 18l2.5-2.5" />
    <path d="M10.8 10.4 12.2 9.4v5.2" />

  {:else if name === 'upload'}
    <path d="M12 15V5" />
    <path d="M8.5 8.5 12 5l3.5 3.5" />
    <path d="M5 16v2c0 1.1.9 2 2 2h10c1.1 0 2-.9 2-2v-2" />

  {:else if name === 'scroll'}
    <path d="M7 4h11v13a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3v-1h11" />
    <path d="M18 4a2 2 0 0 1 2 2v2h-2" opacity="0.7" />
    <path d="M9.5 8.5h5M9.5 12h5" opacity="0.7" />

  {:else if name === 'fold'}
    <path d="M6 9l6 6 6-6" />
    <path d="M5 5h14" opacity="0.7" />

  {:else if name === 'unfold'}
    <path d="M6 15l6-6 6 6" />
    <path d="M5 19h14" opacity="0.7" />

  {:else if name === 'add'}
    <path d="M12 5v14M5 12h14" />

  {:else if name === 'minus'}
    <path d="M5 12h14" />

  {:else if name === 'copy'}
    <path d="M9 9h10v10H9Z" />
    <path d="M15 9V5H5v10h4" opacity="0.7" />

  {:else if name === 'edit'}
    <path d="M4 20h4l10-10-4-4L4 16z" />
    <path d="M14 6l4 4" opacity="0.7" />

  {:else if name === 'remove'}
    <path d="M5 7h14" />
    <path d="M9 7V5h6v2" />
    <path d="M7 7l1 13h8l1-13" />

  {:else if name === 'back'}
    <path d="M9 8 5 12l4 4" />
    <path d="M5 12h9a5 5 0 0 1 0 10h-2" />

  {:else if name === 'forward'}
    <path d="M15 8l4 4-4 4" />
    <path d="M19 12h-9a5 5 0 0 0 0 10h2" />

  {:else if name === 'revert'}
    <path d="M4 5v5h5" />
    <path d="M4.5 10a8 8 0 1 1 1 6.5" />

  {:else if name === 'save'}
    <path d="M5 5h11l3 3v11H5Z" />
    <path d="M9 5v5h6V5" opacity="0.8" />
    <path d="M8 19v-5h8v5" opacity="0.7" />

  {:else if name === 'gear'}
    <path d="M12 4.2 13.6 6h2.3l.6 2.2 2 1.2-.8 2.1.8 2.1-2 1.2-.6 2.2h-2.3L12 19.8 10.4 18H8.1l-.6-2.2-2-1.2.8-2.1-.8-2.1 2-1.2.6-2.2h2.3L12 4.2Z" />
    <circle cx="12" cy="12" r="2.6" />

  {:else if name === 'pointer'}
    <path d="M4.037 4.688a.495.495 0 0 1 .651-.651l16 6.5a.5.5 0 0 1-.063.947l-6.124 1.58a2 2 0 0 0-1.438 1.435l-1.579 6.126a.5.5 0 0 1-.947.063z" />

  {:else if name === 'lines'}
    <path d="m10.586 5.414-5.172 5.172M18.586 13.414l-5.172 5.172M6 12h12" />
    <circle cx="12" cy="20" r="2" />
    <circle cx="12" cy="4" r="2" />
    <circle cx="20" cy="12" r="2" />
    <circle cx="4" cy="12" r="2" />

  {:else if name === 'rectangle'}
    <rect width="18" height="18" x="3" y="3" rx="2" />

  {:else if name === 'ellipse'}
    <circle cx="12" cy="12" r="9" />

  {:else if name === 'door'}
    <path d="M10 21H2M10 3H7a2 2 0 0 0-2 2v16M14 12h.01M22 21h-3" />
    <path d="M19 21V5a2 2 0 0 0-1.675-1.974l-6.163-1.013A1 1 0 0 0 10 3v18a1 1 0 0 0 1.124.992z" />

  {:else if name === 'window'}
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <path d="M12 3v18M3 12h18" />

  {:else if name === 'bend'}
    <circle cx="19" cy="5" r="2" />
    <circle cx="5" cy="19" r="2" />
    <path d="M5 17A12 12 0 0 1 17 5" />

  {:else if name === 'floorplan'}
    <path d="M14.106 5.553a2 2 0 0 0 1.788 0l3.659-1.83A1 1 0 0 1 21 4.619v12.764a1 1 0 0 1-.553.894l-4.553 2.277a2 2 0 0 1-1.788 0l-4.212-2.106a2 2 0 0 0-1.788 0l-3.659 1.83A1 1 0 0 1 3 19.381V6.618a1 1 0 0 1 .553-.894l4.553-2.277a2 2 0 0 1 1.788 0z" />
    <path d="M15 5.764v15M9 3.236v15" opacity="0.7" />

  {:else if name === 'wall'}
    <rect width="18" height="18" x="3" y="3" rx="2" />
    <path d="M12 9v6M16 15v6M16 3v6M3 15h18M3 9h18M8 15v6M8 3v6" opacity="0.7" />

  {:else if name === 'furniture'}
    <path d="M19 9V6a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2v3M5 18v2M19 18v2" />
    <path d="M3 16a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5a2 2 0 0 0-4 0v1.5a.5.5 0 0 1-.5.5h-9a.5.5 0 0 1-.5-.5V11a2 2 0 0 0-4 0z" />

  {:else if name === 'fit'}
    <path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2" />

  {:else if name === 'pane'}
    <rect width="18" height="18" x="3" y="3" rx="2" />

  {:else if name === 'split'}
    <rect width="18" height="18" x="3" y="3" rx="2" />
    <path d="M12 3v18" />

  {:else if name === 'cube'}
    <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
    <path d="m3.3 7 8.7 5 8.7-5M12 22V12" opacity="0.7" />
  {/if}
</svg>

<style>
  .dnd-glyph {
    display: block;
    width: var(--glyph-d);
    height: var(--glyph-d);
    --glyph-d: 20px;
  }

  .dnd-glyph-sm {
    --glyph-d: 15px;
  }

  .dnd-glyph-md {
    --glyph-d: 20px;
  }

  .dnd-glyph-lg {
    --glyph-d: 26px;
  }
</style>
