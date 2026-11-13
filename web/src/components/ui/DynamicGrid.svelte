<script lang="ts">
  import { onMount, tick, type Snippet } from 'svelte'
  import {
    bottom,
    calcColWidth,
    calcGridItemPosition,
    calcWH,
    calcXY,
    clamp,
    cloneLayout,
    compact,
    createDrag,
    flowLayout,
    getLayoutItem,
    getScroller,
    growUpward,
    moveElement,
    type DynamicGridItem,
    type DynamicGridMode,
    type DynamicGridPlacement,
    type Layout,
    type LayoutItem
  } from '$lib/dynamic-grid'

  const {
    items = [],
    columns = 12,
    mode = 'fixed',
    minColWidth = 0,
    rowHeight = 30,
    margin = [10, 10],
    padding = [10, 10],
    draggable = true,
    resizable = true,
    verticalCompact = true,
    onmove,
    onresize,
    item
  }: {
    items?: DynamicGridItem[]
    columns?: number
    mode?: DynamicGridMode
    minColWidth?: number
    rowHeight?: number
    margin?: [number, number]
    padding?: [number, number]
    draggable?: boolean
    resizable?: boolean
    verticalCompact?: boolean
    onmove?: (placements: DynamicGridPlacement[]) => void
    onresize?: (placements: DynamicGridPlacement[]) => void
    item?: Snippet<[LayoutItem]>
  } = $props()

  const drag = createDrag()
  const corners = ['top-left', 'bottom-right'] as const

  let surface = $state<HTMLElement>()
  let width = $state(0)
  let settledWidth = $state(0)
  let working = $state<Layout | null>(null)
  let placeholder = $state<LayoutItem | null>(null)
  let activeId = $state<string | null>(null)
  let dragOffset = $state<{ left: number; top: number } | null>(null)
  let resizeSize = $state<{ width: number; height: number } | null>(null)
  let firstLaid = $state(false)

  const marginX = $derived(margin[0])
  const marginY = $derived(margin[1])
  const paddingX = $derived(padding[0])
  const paddingY = $derived(padding[1])

  const effectiveColumns = $derived.by(() => {
    if (mode === 'fixed' || minColWidth <= 0 || settledWidth <= 0) return columns
    const usable = settledWidth - paddingX * 2 + marginX
    return clamp(Math.floor(usable / (minColWidth + marginX)), 1, columns)
  })

  const reflowed = $derived(effectiveColumns < columns)
  const packed = $derived(mode === 'flow' || reflowed)
  const canDrag = $derived(draggable && !packed)
  const canResize = $derived(resizable && !packed)
  const colWidth = $derived(calcColWidth(width, effectiveColumns, marginX, paddingX))
  const measured = $derived(settledWidth > 0)

  function heightOf(entry: LayoutItem): number {
    return clamp(entry.h, entry.minH ?? 1, entry.maxH ?? Infinity)
  }

  function fitColumns(source: Layout): Layout {
    const sized = source.map((entry) => ({ ...entry, h: heightOf(entry) }))
    if (!packed) return sized
    return flowLayout(sized, effectiveColumns, mode === 'flow', heightOf)
  }

  const laid = $derived(compact(cloneLayout(fitColumns(working ?? items)), packed || verticalCompact))
  const rows = $derived(bottom(laid))
  const containerHeight = $derived(rows * rowHeight + Math.max(0, rows - 1) * marginY + paddingY * 2)

  function positionOf(entry: LayoutItem) {
    return calcGridItemPosition(entry.x, entry.y, entry.w, entry.h, colWidth, rowHeight, marginX, marginY, paddingX, paddingY)
  }

  function placedOf(entry: LayoutItem) {
    const cols = effectiveColumns
    const column = `((100% - ${paddingX * 2 + marginX * (cols - 1)}px) / ${cols})`
    return {
      left: `calc(${column} * ${entry.x} + ${entry.x * marginX + paddingX}px)`,
      width: `calc(${column} * ${entry.w} + ${Math.max(0, entry.w - 1) * marginX}px)`,
      top: rowHeight * entry.y + entry.y * marginY + paddingY,
      height: `${rowHeight * entry.h + Math.max(0, entry.h - 1) * marginY}px`
    }
  }

  function styleOf(entry: LayoutItem) {
    const placed = placedOf(entry)
    const active = activeId === entry.id
    const offset = active ? dragOffset : null
    const size = active ? resizeSize : null
    return {
      left: offset ? `${offset.left}px` : placed.left,
      transform: `translateY(${offset ? offset.top : placed.top}px)`,
      width: size ? `${size.width}px` : placed.width,
      height: size ? `${size.height}px` : placed.height
    }
  }

  function applyMove(id: string, mutate: (target: Layout, moving: LayoutItem) => void) {
    const target = cloneLayout(working ?? items)
    const moving = getLayoutItem(target, id)
    if (!moving) return
    mutate(target, moving)
    compact(target, verticalCompact)
    working = target
    placeholder = { ...moving }
  }

  function changedPlacements(): DynamicGridPlacement[] {
    const settled = working
    if (!settled) return []
    const placements: DynamicGridPlacement[] = []
    for (const entry of settled) {
      const source = items.find((one) => one.id === entry.id)
      if (!source) continue
      if (source.x === entry.x && source.y === entry.y && source.w === entry.w && source.h === entry.h) continue
      placements.push({ id: entry.id, x: entry.x, y: entry.y, w: entry.w, h: entry.h })
    }
    return placements
  }

  function reset() {
    working = null
    placeholder = null
    activeId = null
    dragOffset = null
    resizeSize = null
  }

  function onItemDown(event: PointerEvent, entry: LayoutItem) {
    if (!canDrag || entry.fixed || event.button !== 0) return
    if ((event.target as HTMLElement).closest('.dnd-grid-resizer')) return

    const origin = positionOf(entry)
    const startX = event.clientX
    const startY = event.clientY
    activeId = entry.id
    placeholder = { ...entry }
    dragOffset = { left: origin.left, top: origin.top }

    drag.start({
      onMove(moveEvent) {
        const left = origin.left + (moveEvent.clientX - startX)
        const top = origin.top + (moveEvent.clientY - startY)
        dragOffset = { left, top }
        const cell = calcXY(top, left, entry.w, entry.h, colWidth, rowHeight, marginX, marginY, effectiveColumns, Infinity, paddingX, paddingY)
        applyMove(entry.id, (target, moving) => {
          moveElement(target, moving, cell.x, cell.y, true, verticalCompact)
        })
      },
      onEnd() {
        const placements = changedPlacements()
        reset()
        if (placements.length) onmove?.(placements)
      },
      onCancel: reset
    })
  }

  function onResizeDown(event: PointerEvent, entry: LayoutItem, corner: (typeof corners)[number]) {
    event.stopPropagation()
    if (!canResize || entry.fixed || event.button !== 0) return

    const origin = positionOf(entry)
    const fromTop = corner === 'top-left'
    const scroller = fromTop ? getScroller(surface) : null
    const startX = event.clientX
    const startY = event.clientY
    let lifted = 0
    activeId = entry.id
    placeholder = { ...entry }
    resizeSize = { width: origin.width, height: origin.height }
    if (fromTop) dragOffset = { left: origin.left, top: origin.top }

    drag.start({
      cursor: fromTop ? 'nw-resize' : 'se-resize',
      onMove(moveEvent) {
        const sign = fromTop ? -1 : 1
        const pixelWidth = clamp(origin.width + sign * (moveEvent.clientX - startX), 0, fromTop ? origin.left + origin.width - paddingX : Infinity)
        const pixelHeight = Math.max(0, origin.height + sign * (moveEvent.clientY - startY))
        resizeSize = { width: pixelWidth, height: pixelHeight }
        const size = calcWH(pixelWidth, pixelHeight, fromTop ? 0 : entry.x, fromTop ? 0 : entry.y, colWidth, rowHeight, marginX, marginY, effectiveColumns, Infinity)
        applyMove(entry.id, (target, sizing) => {
          const reach = fromTop ? entry.x + entry.w : Infinity
          sizing.w = clamp(Math.min(size.w, reach), entry.minW ?? 1, entry.maxW ?? Infinity)
          const h = clamp(size.h, entry.minH ?? 1, entry.maxH ?? Infinity)
          if (!fromTop) {
            sizing.h = h
            return
          }
          sizing.x = Math.max(0, entry.x + entry.w - sizing.w)
          growUpward(target, sizing, h)
        })
        if (!fromTop || !placeholder) return
        const shift = (placeholder.y + placeholder.h - entry.y - entry.h) * (rowHeight + marginY)
        dragOffset = { left: origin.left + origin.width - pixelWidth, top: origin.top + shift + origin.height - pixelHeight }
        tick().then(() => {
          const before = scroller?.scrollTop ?? 0
          scroller?.scrollBy(0, shift - lifted)
          lifted += (scroller?.scrollTop ?? 0) - before
        })
      },
      onEnd() {
        const placements = changedPlacements()
        reset()
        if (placements.length) onresize?.(placements)
      },
      onCancel() {
        scroller?.scrollBy(0, -lifted)
        reset()
      }
    })
  }

  onMount(() => {
    const element = surface
    if (!element) return
    let settleTimer: ReturnType<typeof setTimeout> | undefined
    const observer = new ResizeObserver((entries) => {
      width = entries[0]?.contentRect.width ?? 0
      clearTimeout(settleTimer)
      settleTimer = setTimeout(() => (settledWidth = width), 150)
    })
    observer.observe(element)
    width = element.clientWidth
    settledWidth = width
    return () => {
      observer.disconnect()
      clearTimeout(settleTimer)
      drag.cancel()
    }
  })

  $effect(() => {
    if (!measured || firstLaid) return
    requestAnimationFrame(() => requestAnimationFrame(() => (firstLaid = true)))
  })
</script>

<div
  bind:this={surface}
  class="dnd-grid"
  class:dnd-grid-pending={!measured}
  class:dnd-grid-settled={firstLaid}
  style:height="{containerHeight}px"
>
  {#if placeholder}
    {@const placed = placedOf(placeholder)}
    <div
      class="dnd-grid-placeholder"
      style:left={placed.left}
      style:transform="translateY({placed.top}px)"
      style:width={placed.width}
      style:height={placed.height}
    ></div>
  {/if}

  {#each laid as entry (entry.id)}
    {@const placed = styleOf(entry)}
    <div
      class="dnd-grid-item"
      role="presentation"
      class:dnd-grid-item-draggable={canDrag && !entry.fixed}
      class:dnd-grid-item-active={activeId === entry.id}
      data-id={entry.id}
      style:left={placed.left}
      style:transform={placed.transform}
      style:width={placed.width}
      style:height={placed.height}
      onpointerdown={(event) => onItemDown(event, entry)}
    >
      {@render item?.(entry)}
      {#if canResize && !entry.fixed}
        {#each corners as corner (corner)}
          <span
            class="dnd-grid-resizer dnd-grid-resizer-{corner}"
            role="presentation"
            onpointerdown={(event) => onResizeDown(event, entry, corner)}
          ></span>
        {/each}
      {/if}
    </div>
  {/each}
</div>

<style>
  .dnd-grid {
    position: relative;
    width: 100%;
    min-width: 0;
    transition: height 0.2s ease;
  }

  .dnd-grid-placeholder {
    position: absolute;
    top: 0;
    left: 0;
    z-index: 2;
    background: color-mix(in srgb, var(--ember) 15%, transparent);
    border: var(--border-hair) dashed color-mix(in srgb, var(--ember) 60%, transparent);
    border-radius: var(--radius-md);
    pointer-events: none;
    user-select: none;
    transition: transform 0.1s ease, left 0.1s ease;
  }

  .dnd-grid-item {
    position: absolute;
    top: 0;
    left: 0;
    box-sizing: border-box;
    min-width: 0;
    touch-action: none;
    transition: transform 0.2s ease, left 0.2s ease, width 0.2s ease, height 0.2s ease;
  }

  .dnd-grid-pending .dnd-grid-item {
    visibility: hidden;
  }

  .dnd-grid:not(.dnd-grid-settled),
  .dnd-grid:not(.dnd-grid-settled) .dnd-grid-item {
    transition: none;
  }

  .dnd-grid-item-draggable {
    cursor: grab;
  }

  .dnd-grid-item-active {
    z-index: 3;
    cursor: grabbing;
    transition: none;
    user-select: none;
  }

  .dnd-grid-resizer {
    position: absolute;
    z-index: 4;
    width: 1.125rem;
    height: 1.125rem;
  }

  .dnd-grid-resizer::after {
    content: '';
    position: absolute;
    width: 0.45rem;
    height: 0.45rem;
    opacity: 0.6;
  }

  .dnd-grid-resizer:hover::after {
    opacity: 1;
  }

  .dnd-grid-resizer-top-left {
    top: 0;
    left: 0;
    cursor: nw-resize;
  }

  .dnd-grid-resizer-top-left::after {
    top: 0.25rem;
    left: 0.25rem;
    border-top: var(--border-width) solid var(--metal-bright);
    border-left: var(--border-width) solid var(--metal-bright);
  }

  .dnd-grid-resizer-bottom-right {
    right: 0;
    bottom: 0;
    cursor: se-resize;
  }

  .dnd-grid-resizer-bottom-right::after {
    right: 0.25rem;
    bottom: 0.25rem;
    border-right: var(--border-width) solid var(--metal-bright);
    border-bottom: var(--border-width) solid var(--metal-bright);
  }
</style>
