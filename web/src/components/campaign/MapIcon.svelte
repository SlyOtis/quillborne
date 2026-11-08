<script lang="ts">
  import type { MapMarkerKind } from '$lib/api/types'

  const {
    kind,
    size = 18
  }: {
    /** Picks the glyph drawn for this marker. */
    kind: MapMarkerKind
    /** Edge length in pixels. */
    size?: number
  } = $props()

  const PATHS: Record<MapMarkerKind, string> = {
    region: 'M3 18l5-12 5 5 3-4 5 11z',
    city: 'M3 21V9l5-3 5 3v3h8v9zM7 12h2v3H7zm9 3h2v3h-2z',
    town: 'M4 21v-8l6-4 6 4v8zm5-5h2v5H9z',
    keep: 'M4 21V7h3V4h3v3h4V4h3v3h3v14h-6v-6h-4v6z',
    dungeon: 'M12 2l9 6v12H3V8zm0 6a4 4 0 00-4 4v8h8v-8a4 4 0 00-4-4z',
    inn: 'M6 3v7a6 6 0 0012 0V3h-2v6a4 4 0 01-8 0V3zM5 19h14v2H5z',
    temple: 'M12 2l8 5H4zM5 9h14v10h-4v-6h-6v6H5z',
    npc: 'M12 12a4 4 0 100-8 4 4 0 000 8zm-8 9a8 8 0 0116 0z',
    quest: 'M12 2l3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1z',
    danger: 'M12 2l10 19H2zm-1 7v6h2V9zm0 8v2h2v-2z',
    treasure: 'M3 8h18v12H3zm0-4h18v3H3zm8 6h2v5h-2z',
    note: 'M5 3h11l3 3v15H5zm3 5h8v2H8zm0 4h8v2H8zm0 4h5v2H8z',
    village: 'M2 21v-6l4-3 4 3v6zm10 0v-9l5-4 5 4v9zM5 17h2v4H5zm10-2h2v6h-2z',
    ruin: 'M3 21V9l3-2v5h3V6l3-2v8h3V8l3-2v15zM6 15h2v6H6zm7 0h2v6h-2z',
    cave: 'M2 21V13a10 10 0 0120 0v8h-6v-5a4 4 0 00-8 0v5z',
    tower: 'M8 21V8l-2-2V3h3v2h2V3h2v2h2V3h3v3l-2 2v13zm3-9h2v4h-2z',
    shrine: 'M11 2h2v3h3v2h-3v4h4v10h-4v-6h-2v6H7V11h4V7H8V5h3z',
    camp: 'M12 3l9 18H3zm0 5l-4 9h8z',
    harbour: 'M11 3h2v4h3v2h-3v8a5 5 0 005-5h2a7 7 0 01-14 0h2a5 5 0 005 5V9H8V7h3zM10 20h4v2h-4z',
    bridge: 'M2 12h20v2h-3v6h-2v-6H7v6H5v-6H2zm4-4a6 6 0 0112 0h-2a4 4 0 00-8 0z',
    forest: 'M7 2l4 7H8l3 5H4l3-5H4zm9 3l4 7h-3l3 5h-8l3-5h-3zM6 19h12v2H6z',
    mountain: 'M2 20L9 6l4 7 2-3 7 10zm7-9l-3 6h6z',
    swamp: 'M3 16c2-2 4-2 6 0s4 2 6 0 4-2 6 0v3c-2-2-4-2-6 0s-4 2-6 0-4-2-6 0zm6-13v9H7V3zm6 2v7h-2V5z',
    lake: 'M12 4c5 0 9 3 9 7s-4 7-9 7-9-3-9-7 4-7 9-7zm0 3c-3 0-6 2-6 4s3 4 6 4 6-2 6-4-3-4-6-4z',
    road: 'M9 2h2l-1 5h4l-1 5h3l-2 5h3l-3 5H8l3-5H8l2-5H7l2-5H6z',
    portal: 'M12 2a7 9 0 017 9v10h-4V11a3 5 0 00-6 0v10H5V11a7 9 0 017-9z',
    battle: 'M3 3l7 7-2 2-7-7zm18 0l-7 7 2 2 7-7zM2 20l6-6 2 2-6 6zm20 0l-6-6-2 2 6 6z',
    grave: 'M8 21V9a4 4 0 018 0v12zm3-11v2H9v2h2v4h2v-4h2v-2h-2v-2zM5 21h14v2H5z',
    market: 'M3 8l2-5h14l2 5zm1 2h16v11H4zm3 3v5h4v-5z',
    forge: 'M4 20v-3h16v3zm2-5l2-6h2l1 3h5l2 3zM9 3h2v5H9z'
  }
</script>

<svg
  class="dnd-map-icon"
  width={size}
  height={size}
  viewBox="0 0 24 24"
  fill="currentColor"
  aria-hidden="true"
>
  <path d={PATHS[kind]} />
</svg>

<style>
  .dnd-map-icon {
    display: block;
    flex: none;
  }
</style>
