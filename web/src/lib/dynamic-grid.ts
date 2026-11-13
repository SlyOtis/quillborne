export interface DynamicGridItem {
  id: string
  x: number
  y: number
  w: number
  h: number
  minW?: number
  maxW?: number
  minH?: number
  maxH?: number
  fixed?: boolean
}

export interface DynamicGridPlacement {
  id: string
  x: number
  y: number
  w: number
  h: number
}

export interface DynamicGridPosition {
  left: number
  top: number
  width: number
  height: number
}

export type DynamicGridMode = 'fixed' | 'flow'

export type Layout = LayoutItem[]

export interface LayoutItem extends DynamicGridItem {
  moved?: boolean
}

export function clamp(value: number, lower: number, upper: number): number {
  return Math.max(lower, Math.min(value, upper))
}

export function cloneLayout(layout: Layout): Layout {
  return layout.map((item) => ({ ...item }))
}

export function getLayoutItem(layout: Layout, id: string): LayoutItem | undefined {
  return layout.find((item) => item.id === id)
}

export function bottom(layout: Layout): number {
  let max = 0
  for (const item of layout) {
    const itemBottom = item.y + item.h
    if (itemBottom > max) max = itemBottom
  }
  return max
}

export function collides(a: LayoutItem, b: LayoutItem): boolean {
  if (a.id === b.id) return false
  if (a.x + a.w <= b.x) return false
  if (a.x >= b.x + b.w) return false
  if (a.y + a.h <= b.y) return false
  if (a.y >= b.y + b.h) return false
  return true
}

export function getFirstCollision(layout: Layout, item: LayoutItem): LayoutItem | undefined {
  return layout.find((other) => collides(other, item))
}

export function getAllCollisions(layout: Layout, item: LayoutItem): LayoutItem[] {
  return layout.filter((other) => collides(other, item))
}

function getFixed(layout: Layout): Layout {
  return layout.filter((item) => item.fixed)
}

function sortByRowCol(layout: Layout): Layout {
  return [...layout].sort((a, b) => {
    if (a.y === b.y && a.x === b.x) return 0
    if (a.y > b.y || (a.y === b.y && a.x > b.x)) return 1
    return -1
  })
}

function compactItem(compareWith: Layout, item: LayoutItem, verticalCompact: boolean): LayoutItem {
  if (verticalCompact) {
    while (item.y > 0 && !getFirstCollision(compareWith, item)) {
      item.y--
    }
  }
  let collision: LayoutItem | undefined
  while ((collision = getFirstCollision(compareWith, item))) {
    item.y = collision.y + collision.h
  }
  return item
}

export function fits(layout: Layout, maxRows: number): boolean {
  return layout.every((item) => item.y + item.h <= maxRows)
}

export function compact(layout: Layout, verticalCompact: boolean, maxRows = Infinity): Layout {
  const result: Layout = new Array(layout.length)
  let guard = 0

  for (;;) {
    if (maxRows !== Infinity && bottom(layout) > maxRows) {
      const scale = maxRows / bottom(layout)
      for (const item of layout) {
        if (item.fixed) continue
        item.h = Math.max(item.minH ?? 1, Math.min(Math.round(item.h * scale), maxRows))
        item.y = clamp(Math.round(item.y * scale), 0, maxRows - item.h)
      }
    }

    const placed = getFixed(layout)
    for (const item of sortByRowCol(layout)) {
      if (!item.fixed) {
        compactItem(placed, item, verticalCompact)
        if (item.y + item.h > maxRows) item.h = Math.max(item.minH ?? 1, maxRows - item.y)
        placed.push(item)
      }
      result[layout.indexOf(item)] = item
      item.moved = false
    }

    if (maxRows === Infinity || fits(layout, maxRows) || guard++ >= 8) return result
  }
}

function moveAwayFromCollision(
  layout: Layout,
  collidesWith: LayoutItem,
  itemToMove: LayoutItem,
  isUserAction: boolean,
  verticalCompact: boolean
): Layout {
  if (isUserAction) {
    const fake: LayoutItem = {
      ...itemToMove,
      id: '__fake_collision__',
      y: Math.max(collidesWith.y - itemToMove.h, 0)
    }
    if (!getFirstCollision(layout, fake)) {
      return moveElement(layout, itemToMove, undefined, fake.y, false, verticalCompact)
    }
  }
  return moveElement(layout, itemToMove, undefined, itemToMove.y + 1, false, verticalCompact)
}

export function moveElement(
  layout: Layout,
  item: LayoutItem,
  x: number | undefined,
  y: number | undefined,
  isUserAction: boolean,
  verticalCompact: boolean
): Layout {
  if (item.fixed) return layout

  const movingUp = verticalCompact && typeof y === 'number' && item.y > y

  if (typeof x === 'number') item.x = x
  if (typeof y === 'number') item.y = y
  item.moved = true

  let sorted = sortByRowCol(layout)
  if (movingUp) sorted = sorted.reverse()
  const collisions = getAllCollisions(sorted, item)

  for (const collision of collisions) {
    if (collision.moved) continue
    if (collision.fixed) {
      layout = moveAwayFromCollision(layout, collision, item, isUserAction, verticalCompact)
    } else {
      layout = moveAwayFromCollision(layout, item, collision, isUserAction, verticalCompact)
    }
  }
  return layout
}

export function growUpward(layout: Layout, item: LayoutItem, h: number): Layout {
  const floor = bottom(layout)
  const flip = (entry: LayoutItem) => (entry.y = floor - entry.y - entry.h)
  layout.forEach(flip)
  item.h = h
  const fixed = item.fixed
  item.fixed = true
  compact(layout, false)
  item.fixed = fixed
  layout.forEach(flip)
  const lift = Math.min(0, ...layout.map((entry) => entry.y))
  layout.forEach((entry) => (entry.y -= lift))
  return layout
}

export function getScroller(element: HTMLElement | null | undefined): Element | null {
  for (let node = element?.parentElement; node; node = node.parentElement) {
    const { overflowY } = getComputedStyle(node)
    if (/auto|scroll|overlay/.test(overflowY) && node.scrollHeight > node.clientHeight) return node
  }
  return document.scrollingElement
}

export function calcColWidth(containerWidth: number, colNum: number, marginX: number, paddingX = marginX): number {
  return (containerWidth - marginX * (colNum - 1) - paddingX * 2) / colNum
}

export function calcGridItemPosition(
  x: number,
  y: number,
  w: number,
  h: number,
  colWidth: number,
  rowHeight: number,
  marginX: number,
  marginY: number,
  paddingX = marginX,
  paddingY = marginY
): DynamicGridPosition {
  return {
    left: Math.round(colWidth * x + x * marginX + paddingX),
    top: Math.round(rowHeight * y + y * marginY + paddingY),
    width: Math.round(colWidth * w + Math.max(0, w - 1) * marginX),
    height: Math.round(rowHeight * h + Math.max(0, h - 1) * marginY)
  }
}

export function calcXY(
  top: number,
  left: number,
  w: number,
  h: number,
  colWidth: number,
  rowHeight: number,
  marginX: number,
  marginY: number,
  colNum: number,
  maxRows: number,
  paddingX = marginX,
  paddingY = marginY
): { x: number; y: number } {
  const x = clamp(Math.round((left - paddingX) / (colWidth + marginX)), 0, colNum - w)
  const y = clamp(Math.round((top - paddingY) / (rowHeight + marginY)), 0, maxRows - h)
  return { x, y }
}

export function calcWH(
  width: number,
  height: number,
  x: number,
  y: number,
  colWidth: number,
  rowHeight: number,
  marginX: number,
  marginY: number,
  colNum: number,
  maxRows: number
): { w: number; h: number } {
  const w = clamp(Math.round((width + marginX) / (colWidth + marginX)), 1, colNum - x)
  const h = clamp(Math.round((height + marginY) / (rowHeight + marginY)), 1, maxRows - y)
  return { w, h }
}

function flowRows(layout: Layout, cols: number): Layout[] {
  const rows: Layout[] = []
  let row: Layout = []
  let used = 0
  for (const item of [...layout].sort((a, b) => a.y - b.y || a.x - b.x)) {
    const w = Math.min(item.w, cols)
    if (used + w > cols && row.length) {
      rows.push(row)
      row = []
      used = 0
    }
    row.push({ ...item, w })
    used += w
  }
  if (row.length) rows.push(row)
  return rows
}

export function flowLayout(
  layout: Layout,
  cols: number,
  stretchHeight: boolean,
  heightOf: (item: LayoutItem, w: number) => number
): Layout {
  let y = 0
  return flowRows(layout, cols).flatMap((row) => {
    const widths = row.map((item) => item.w)
    let extra = cols - widths.reduce((sum, w) => sum + w, 0)
    for (let i = 0; extra > 0; i = (i + 1) % row.length, extra -= 1) widths[i] += 1
    const heights = row.map((item, i) => heightOf(item, widths[i]))
    const tallest = Math.max(...heights)
    let x = 0
    const placed = row.map((item, i) => {
      const next = { ...item, x, y, w: widths[i], h: stretchHeight ? tallest : heights[i] }
      x += widths[i]
      return next
    })
    y += tallest
    return placed
  })
}

export interface DragHandlers {
  cursor?: string
  onMove: (event: PointerEvent) => void
  onEnd?: (event: PointerEvent | null) => void
  onCancel?: () => void
}

export interface Drag {
  start: (handlers: DragHandlers) => void
  cancel: () => void
  dragging: () => boolean
}

export function createDrag(): Drag {
  let active = false
  let handlers: DragHandlers | null = null
  let priorCursor = ''
  let priorUserSelect = ''
  let releaseTimer: ReturnType<typeof setTimeout> | null = null
  let pendingMove: PointerEvent | null = null
  let rafToken = 0

  const flushMove = () => {
    rafToken = 0
    const event = pendingMove
    pendingMove = null
    if (event && handlers) handlers.onMove(event)
  }

  const onMove = (event: PointerEvent) => {
    pendingMove = event
    if (rafToken !== 0) return
    rafToken = window.requestAnimationFrame(flushMove)
  }

  const onUp = (event: PointerEvent) => teardown(false, event)
  const onPointerCancel = () => teardown(true, null)
  const onKey = (event: KeyboardEvent) => {
    if (event.key === 'Escape') teardown(true, null)
  }

  const teardown = (cancelled: boolean, event: PointerEvent | null) => {
    if (!handlers) return
    if (rafToken !== 0) {
      window.cancelAnimationFrame(rafToken)
      rafToken = 0
    }
    pendingMove = null
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', onUp)
    window.removeEventListener('pointercancel', onPointerCancel)
    window.removeEventListener('lostpointercapture', onPointerCancel)
    window.removeEventListener('keydown', onKey)
    document.body.style.cursor = priorCursor
    document.body.style.userSelect = priorUserSelect
    const held = handlers
    handlers = null
    if (cancelled) held.onCancel?.()
    else held.onEnd?.(event)
    if (releaseTimer != null) clearTimeout(releaseTimer)
    releaseTimer = setTimeout(() => {
      active = false
      releaseTimer = null
    }, 50)
  }

  return {
    start(next) {
      if (handlers) return
      handlers = next
      active = true
      priorCursor = document.body.style.cursor
      priorUserSelect = document.body.style.userSelect
      document.body.style.cursor = next.cursor ?? 'grabbing'
      document.body.style.userSelect = 'none'
      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
      window.addEventListener('pointercancel', onPointerCancel)
      window.addEventListener('lostpointercapture', onPointerCancel)
      window.addEventListener('keydown', onKey)
    },
    cancel() {
      teardown(true, null)
      if (releaseTimer != null) clearTimeout(releaseTimer)
    },
    dragging: () => active
  }
}
