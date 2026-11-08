<script lang="ts">
  import { untrack } from 'svelte'
  import type { CampaignMap, MapMarker } from '$lib/firestore.types'
  import MapIcon from './MapIcon.svelte'
  import Card from '$components/ui/Card.svelte'
  import StoredImage from '$components/ui/StoredImage.svelte'
  import { getFileUrl } from '$lib/storage.service'
  import Glyph from '$components/ui/Glyph.svelte'

  const {
    map,
    canEdit = false,
    placing = null,
    onPlace,
    onSelect,
    onDescend,
    lookup,
    onOpen
  }: {
    /** The map being drawn, with its layers and markers. */
    map: CampaignMap
    /** Turns clicking into placing and shows markers the players cannot see. */
    canEdit?: boolean
    /** The marker kind the next click places, or null to pan only. */
    placing?: MapMarker['kind'] | null
    /** Receives the relative coordinates of a placing click. */
    onPlace?: (x: number, y: number) => void
    /** Receives a marker the viewer clicked. */
    onSelect?: (marker: MapMarker) => void
    /** Receives a linked marker the viewer zoomed past, to open the map it stands for. */
    onDescend?: (marker: MapMarker) => void
    /** Answers what a pin stands for, drawn in the card that opens on hover. */
    lookup?: (marker: MapMarker) => { name: string; note: string; body: string; image?: string; href?: string } | null
    /** Receives a marker whose card was followed to the record it stands for. */
    onOpen?: (marker: MapMarker) => void
  } = $props()

  let hovered = $state<string | null>(null)
  let sheet = $state<HTMLCanvasElement>()
  let inked = $state(0)

  let zoom = $state(untrack(() => map.min_zoom))
  let drawn = $state(untrack(() => map.id))
  let vw = $state(0)
  let vh = $state(0)
  let panX = $state(0)
  let panY = $state(0)
  let dragging = $state(false)
  let moved = $state(false)
  let viewport = $state<HTMLDivElement>()

  let lastX = 0
  let lastY = 0
  let held = false

  const lit = $derived(
    [...map.layers]
      .filter((entry) => zoom >= entry.min_zoom && zoom <= entry.max_zoom)
      .sort((a, b) => a.min_zoom - b.min_zoom)
  )

  const whole = $derived(lit.filter((entry) => entry.width === undefined))
  const areas = $derived(lit.filter((entry) => entry.width !== undefined))

  const layer = $derived(whole[whole.length - 1] ?? null)
  const image = $derived(layer?.image_url ?? map.image_url)

  const sheets = new Map<string, HTMLImageElement>()

  async function fetchSheet(address: string) {
    if (!address || sheets.has(address)) return
    const url = await getFileUrl(address).catch(() => '')
    if (!url) return
    const picture = new Image()
    picture.src = url
    await picture.decode().catch(() => undefined)
    sheets.set(address, picture)
    inked += 1
  }

  function paint() {
    const ground = sheet?.getContext('2d')
    if (!sheet || !ground || vw === 0 || vh === 0) return

    const grain = window.devicePixelRatio || 1
    sheet.width = Math.round(vw * grain)
    sheet.height = Math.round(vh * grain)

    ground.setTransform(grain, 0, 0, grain, 0, 0)
    ground.clearRect(0, 0, vw, vh)
    ground.imageSmoothingEnabled = true
    ground.imageSmoothingQuality = 'high'

    ground.translate(vw / 2 + panX, vh / 2 + panY)
    ground.scale(zoom, zoom)
    ground.translate(-vw / 2, -vh / 2)

    const base = sheets.get(image)
    if (base?.naturalWidth) {
      const fit = Math.min(vw / base.naturalWidth, vh / base.naturalHeight)
      const width = base.naturalWidth * fit
      const height = base.naturalHeight * fit
      ground.drawImage(base, (vw - width) / 2, (vh - height) / 2, width, height)
    }

    for (const area of areas) {
      const over = sheets.get(area.image_url)
      if (!over?.naturalWidth) continue
      ground.drawImage(
        over,
        (area.x ?? 0) * vw,
        (area.y ?? 0) * vh,
        (area.width ?? 1) * vw,
        (area.height ?? 1) * vh
      )
    }
  }

  const markers = $derived(
    map.markers.filter(
      (marker) =>
        (canEdit || marker.is_visible) && zoom >= marker.min_zoom && zoom <= marker.max_zoom
    )
  )

  const shown = $derived(markers.find((marker) => marker.id === hovered) ?? null)

  function screen(marker: MapMarker) {
    return {
      x: vw / 2 + (marker.x * vw - vw / 2) * zoom + panX,
      y: vh / 2 + (marker.y * vh - vh / 2) * zoom + panY
    }
  }

  const gate = $derived(
    map.markers.find(
      (marker) =>
        marker.link_map_id && (canEdit || marker.is_visible) && zoom > marker.max_zoom
    ) ?? null
  )

  $effect(() => {
    if (map.id !== drawn) {
      drawn = map.id
      zoom = map.min_zoom
      panX = 0
      panY = 0
      return
    }
    if (gate) onDescend?.(gate)
  })

  function hold(value: number): number {
    return Math.min(Math.max(value, 0), 1)
  }

  const frame = $derived({
    left: vw ? hold(0.5 - (vw / 2 + panX) / (zoom * vw)) : 0,
    right: vw ? hold(0.5 + (vw / 2 - panX) / (zoom * vw)) : 1,
    top: vh ? hold(0.5 - (vh / 2 + panY) / (zoom * vh)) : 0,
    bottom: vh ? hold(0.5 + (vh / 2 - panY) / (zoom * vh)) : 1
  })

  const centre = $derived({ x: (frame.left + frame.right) / 2, y: (frame.top + frame.bottom) / 2 })

  const windowInset = $derived(
    `${frame.top * 100}% ${(1 - frame.right) * 100}% ${(1 - frame.bottom) * 100}% ${frame.left * 100}%`
  )

  const zoomKey = navigator.userAgent.includes('Mac') ? 'Cmd' : 'Ctrl'

  $effect(() => {
    void fetchSheet(image)
    for (const area of areas) void fetchSheet(area.image_url)
  })

  $effect(() => {
    void inked
    void image
    void areas
    void zoom
    void panX
    void panY
    void vw
    void vh
    paint()
  })

  function clampZoom(value: number): number {
    return Math.min(Math.max(value, map.min_zoom), map.max_zoom)
  }

  function onWheel(event: WheelEvent) {
    if (!event.ctrlKey && !event.metaKey) return
    event.preventDefault()
    const box = viewport?.getBoundingClientRect()
    if (!box) return

    const next = clampZoom(zoom * (event.deltaY < 0 ? 1.15 : 1 / 1.15))
    const ratio = next / zoom

    const pointerX = event.clientX - box.left - box.width / 2
    const pointerY = event.clientY - box.top - box.height / 2

    panX = pointerX - (pointerX - panX) * ratio
    panY = pointerY - (pointerY - panY) * ratio
    zoom = next
  }

  function onPointerDown(event: PointerEvent) {
    dragging = true
    moved = false
    held = false
    lastX = event.clientX
    lastY = event.clientY
  }

  function onPointerMove(event: PointerEvent) {
    if (!dragging) return
    const dx = event.clientX - lastX
    const dy = event.clientY - lastY

    if (Math.abs(dx) + Math.abs(dy) > 3) {
      moved = true
      if (!held) {
        ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
        held = true
      }
    }

    panX += dx
    panY += dy
    lastX = event.clientX
    lastY = event.clientY
  }

  function onPointerUp(event: PointerEvent) {
    dragging = false
    if (!held) return
    ;(event.currentTarget as HTMLElement).releasePointerCapture(event.pointerId)
    held = false
  }

  function onClick(event: MouseEvent) {
    if (moved || !onPlace) return

    const box = viewport?.getBoundingClientRect()
    if (!box || !vw || !vh) return

    const sx = event.clientX - box.left
    const sy = event.clientY - box.top
    onPlace(
      ((sx - panX - vw / 2) / zoom + vw / 2) / vw,
      ((sy - panY - vh / 2) / zoom + vh / 2) / vh
    )
  }

  function reset() {
    zoom = map.min_zoom
    panX = 0
    panY = 0
  }

  function step(factor: number) {
    zoom = clampZoom(zoom * factor)
  }
</script>

<div class="dnd-map">
  <div
    class="dnd-map-viewport"
    class:dnd-map-placing={canEdit && Boolean(placing)}
    bind:this={viewport}
    bind:clientWidth={vw}
    bind:clientHeight={vh}
    role="group"
    aria-label="{map.title} map, zoom {zoom.toFixed(1)} times. Hold {zoomKey} and scroll to zoom."
    onwheel={onWheel}
    onpointerdown={onPointerDown}
    onpointermove={onPointerMove}
    onpointerup={onPointerUp}
    onpointercancel={onPointerUp}
  >
    <canvas class="dnd-map-sheet" bind:this={sheet} aria-label={layer?.title ?? map.title}></canvas>

    {#each markers as marker (marker.id)}
      <button
        type="button"
        class="dnd-map-pin dnd-map-pin-{marker.kind}"
        class:dnd-map-pin-hidden={!marker.is_visible}
        style="left: {screen(marker).x}px; top: {screen(marker).y}px"
        onclick={(event) => { event.stopPropagation(); onSelect?.(marker) }}
        onpointerenter={() => (hovered = marker.id)}
        onpointerleave={() => (hovered = hovered === marker.id ? null : hovered)}
        onfocus={() => (hovered = marker.id)}
        onblur={() => (hovered = hovered === marker.id ? null : hovered)}
      >
        <span class="dnd-map-drop">
          <span class="dnd-map-drop-face"><MapIcon kind={marker.kind} size={15} /></span>
        </span>
      </button>
    {/each}

    {#if shown}
      {@const card = lookup?.(shown) ?? null}
      <div
        class="dnd-map-card"
        role="tooltip"
        style:left="{screen(shown).x}px"
        style:top="{screen(shown).y}px"
        onpointerenter={() => (hovered = shown.id)}
        onpointerleave={() => (hovered = null)}
      >
        <Card
          title={card?.name ?? shown.title}
          sub={card?.body || shown.description}
          badge={card?.note}
          image={card?.image}
          onclick={() => (card?.href ? onOpen?.(shown) : onSelect?.(shown))}
        />
      </div>
    {/if}

    {#if canEdit && placing}
      <button
        type="button"
        class="dnd-map-catcher"
        aria-label="Place a {placing} pin"
        onclick={onClick}
      ></button>
    {/if}

    <div class="dnd-map-dial">
      {#if zoom > map.min_zoom}
        <div class="dnd-map-minimap" aria-hidden="true">
          <StoredImage src={map.image_url} alt="" draggable={false} />
          <span class="dnd-map-window" style:inset={windowInset}></span>
        </div>
      {/if}

      <div class="dnd-map-bar">
        <button type="button" class="dnd-map-step" onclick={() => step(1 / 1.4)} aria-label="Zoom out">
          <Glyph name="conceal" size="sm" />
        </button>
        <input
          class="dnd-map-slider"
          type="range"
          min={map.min_zoom}
          max={map.max_zoom}
          step="0.1"
          bind:value={zoom}
          aria-label="Zoom level"
        />
        <button type="button" class="dnd-map-step" onclick={() => step(1.4)} aria-label="Zoom in">
          <Glyph name="reveal" size="sm" />
        </button>
        <button type="button" class="dnd-map-step" onclick={reset} aria-label="Whole map" title="Whole map">
          <Glyph name="unfold" size="sm" />
        </button>
      </div>

      <p class="dnd-map-where">
        {zoom.toFixed(1)}x
        {#if zoom > map.min_zoom}
          &middot; {Math.round(centre.x * 100)}, {Math.round(centre.y * 100)}
        {/if}
        {#if layer}&middot; {layer.title}{/if}
      </p>
    </div>
  </div>
</div>

<style>
  .dnd-map {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
  }

  .dnd-map-viewport {
    position: relative;
    flex: 1;
    height: 100%;
    min-height: 20rem;
    overflow: hidden;
    background: var(--texture-noise), linear-gradient(180deg, var(--ground-raised), var(--ground-deep));
    border-radius: var(--radius-lg);
    box-shadow: var(--rim), inset 0 0 28px 6px var(--shade-hard);
    cursor: grab;
    touch-action: none;
  }

  .dnd-map-viewport:active {
    cursor: grabbing;
  }

  .dnd-map-placing {
    cursor: crosshair;
  }

  .dnd-map-sheet {
    position: absolute;
    inset: 0;
    display: block;
    width: 100%;
    height: 100%;
    user-select: none;
    pointer-events: none;
  }

  .dnd-map-pin {
    position: absolute;
    z-index: 2;
    transform: translate(-50%, -100%);
    transform-origin: bottom center;
    display: block;
    padding: 0;
    border: none;
    background: none;
    cursor: pointer;
    line-height: 0;
  }

  .dnd-map-drop {
    display: block;
    width: 1.9rem;
    height: 1.9rem;
    border: var(--border-width) solid var(--metal);
    border-radius: 50% 50% 50% 0;
    background: radial-gradient(circle at 38% 26%, var(--ground-lift) 0%, var(--ground-deep) 84%);
    transform: rotate(-45deg);
    box-shadow: 0 3px 6px var(--shade-hard), inset 0 0 0 1px var(--keyline), inset 0 1px 0 var(--sheen);
    transition: border-color 0.15s ease, filter 0.15s ease;
  }

  .dnd-map-drop-face {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
    transform: rotate(45deg);
    color: var(--metal);
  }

  .dnd-map-pin:hover .dnd-map-drop,
  .dnd-map-pin:focus-visible .dnd-map-drop {
    border-color: var(--metal-bright);
    filter: drop-shadow(0 0 8px var(--ember-glow));
  }

  .dnd-map-pin:focus-visible {
    outline: none;
  }

  .dnd-map-pin-hidden .dnd-map-drop {
    border-style: dashed;
    opacity: 0.55;
  }

  .dnd-map-pin:hover,
  .dnd-map-pin:focus-visible {
    z-index: 4;
    border-color: var(--metal-bright);
  }

  .dnd-map-card {
    position: absolute;
    z-index: 5;
    transform: translate(-50%, calc(-100% - var(--space-6)));
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    width: min(15rem, 80vw);
    box-shadow: var(--shadow-lg);
    text-align: start;
    white-space: normal;
  }

  .dnd-map-card::after {
    content: '';
    position: absolute;
    top: 100%;
    left: 50%;
    width: var(--space-2);
    height: var(--space-2);
    transform: translate(-50%, -50%) rotate(45deg);
    background: var(--ground-deep);
    border-right: var(--border-hair) solid var(--metal);
    border-bottom: var(--border-hair) solid var(--metal);
  }

  .dnd-map-pin-label {
    font-size: var(--text-xs);
    color: var(--ink);
  }

  .dnd-map-pin-danger {
    color: var(--state-bad);
    border-color: var(--state-bad);
  }

  .dnd-map-pin-treasure {
    color: var(--metal);
  }

  .dnd-map-pin-npc {
    color: var(--ember);
    border-color: var(--ember);
  }

  .dnd-map-catcher {
    position: absolute;
    inset: 0;
    border: 0;
    background: transparent;
    cursor: crosshair;
  }

  .dnd-map-catcher:focus-visible {
    outline: none;
    box-shadow: var(--focus-ring);
  }

  .dnd-map-dial {
    position: absolute;
    right: var(--space-3);
    bottom: var(--space-3);
    z-index: 3;
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    width: min(11.25rem, 45%);
    padding: var(--space-3);
    background:
      linear-gradient(180deg, color-mix(in srgb, var(--stone-light) 20%, transparent), color-mix(in srgb, #000 45%, transparent) 60%, color-mix(in srgb, #000 65%, transparent)),
      var(--texture-noise),
      var(--stone);
    border: none;
    border-radius: var(--radius-sm);
    box-shadow: var(--rim-thin), var(--bevel-up), var(--shadow-md);
  }

  .dnd-map-bar {
    display: flex;
    align-items: center;
    gap: var(--space-1);
  }

  .dnd-map-minimap {
    position: relative;
    width: 100%;
    overflow: hidden;
    border: var(--border-hair) solid var(--metal-dim);
    border-radius: var(--radius-sm);
    background: var(--ground-deep);
    box-shadow: var(--bevel-down);
    pointer-events: none;
  }

  .dnd-map-minimap :global(img) {
    display: block;
    width: 100%;
    height: auto;
    opacity: 0.75;
  }

  .dnd-map-window {
    position: absolute;
    border: var(--border-width) solid var(--metal-bright);
    box-shadow: 0 0 0 100vmax color-mix(in srgb, var(--shade-hard) 55%, transparent);
    pointer-events: none;
  }

  .dnd-map-where {
    margin: 0;
    font-family: var(--font-figures);
    font-variant-numeric: lining-nums tabular-nums;
    text-shadow: 0 1px 0 #000;
    font-size: var(--text-xs);
    color: var(--ink-faint);
    text-align: center;
  }

  .dnd-map-step {
    display: flex;
    align-items: center;
    justify-content: center;
    flex: none;
    width: var(--space-5);
    height: var(--space-5);
    padding: 0;
    border: none;
    background: none;
    color: var(--metal);
    cursor: pointer;
    transition: color 0.15s ease, text-shadow 0.15s ease, filter 0.15s ease;
  }

  .dnd-map-step:hover {
    color: var(--metal-bright);
    filter: drop-shadow(0 0 6px var(--ember-glow));
  }

  .dnd-map-step:active {
    transform: translateY(1px);
    filter: brightness(0.85);
  }

  .dnd-map-step:focus-visible {
    outline: none;
    box-shadow: var(--focus-ring);
  }

  .dnd-map-slider {
    flex: 1;
    min-width: 0;
    accent-color: var(--metal);
  }

  .dnd-map-layer {
    font-size: var(--text-xs);
    color: var(--ink-dim);
  }
</style>
