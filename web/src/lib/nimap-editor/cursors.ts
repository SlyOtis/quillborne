import { directional, type CursorName } from '$lib/nimap'
import { ICONS } from './icons'

export type CursorColours = { fill: string; line: string }

const ARROW_HOTSPOT = '9 7'
const CENTRE_HOTSPOT = '16 16'
const ARROW_SCALE = 0.95
const ARROW_OFFSET = [9 - 4.037 * ARROW_SCALE, 7 - 4.688 * ARROW_SCALE]

const SHADOW = `<filter id='s' x='-40%' y='-40%' width='180%' height='180%'><feDropShadow dx='0.8' dy='1' stdDeviation='0.9' flood-opacity='0.5'/></filter>`

const outlined = (d: string, c: CursorColours, width = 1.6): string =>
  `<path d='${d}' fill='none' stroke='${c.line}' stroke-width='${width + 1.8}' stroke-linecap='round' stroke-linejoin='round'/><path d='${d}' fill='none' stroke='${c.fill}' stroke-width='${width}' stroke-linecap='round' stroke-linejoin='round'/>`

const arrow = (c: CursorColours): string => {
  const d = /d="([^"]+)"/.exec(ICONS.select)![1]
  return `<g transform='translate(${ARROW_OFFSET[0].toFixed(2)} ${ARROW_OFFSET[1].toFixed(2)}) scale(${ARROW_SCALE})'><path d='${d}' fill='${c.fill}' stroke='${c.line}' stroke-width='${(1.6 / ARROW_SCALE).toFixed(2)}' stroke-linejoin='round'/></g>`
}

const GLYPH_SCALE = 0.46
const GLYPH_OFFSET = 19
const BADGED: Partial<Record<CursorName, string>> = {
  'arrow-add': ICONS.plus,
  'arrow-remove': ICONS.minus,
  'arrow-heal': ICONS.x,
  'arrow-wall': ICONS.wall,
  'arrow-fixture': ICONS.fixture,
  'arrow-door': ICONS.door,
  'arrow-window': ICONS.window,
  'arrow-bend': ICONS.bend
}

const badge = (markup: string, c: CursorColours): string => {
  const layer = (stroke: string, width: number) =>
    `<g transform='translate(${GLYPH_OFFSET} ${GLYPH_OFFSET}) scale(${GLYPH_SCALE})' fill='none' stroke='${stroke}' stroke-width='${(width / GLYPH_SCALE).toFixed(2)}' stroke-linecap='round' stroke-linejoin='round'>${markup}</g>`
  return layer(c.line, 3.2) + layer(c.fill, 1.5)
}

const centred = (markup: string, c: CursorColours): string => {
  const layer = (stroke: string, width: number) =>
    `<g transform='translate(7 7) scale(0.75)' fill='none' stroke='${stroke}' stroke-width='${(width / 0.75).toFixed(2)}' stroke-linecap='round' stroke-linejoin='round'>${markup}</g>`
  return layer(c.line, 3.4) + layer(c.fill, 1.6)
}

const rotate = (c: CursorColours): string =>
  outlined('M10.5 22.5 A12 12 0 0 1 22.5 10.5 M10.5 22.5 L7.6 19.4 M10.5 22.5 L13.4 19.4 M22.5 10.5 L19.4 7.6 M22.5 10.5 L19.4 13.4', c)

function drawing(name: CursorName, c: CursorColours): { svg: string; hotspot: string; angle: number } {
  const d = directional(name)
  if (d) return { svg: d.kind === 'resize' ? centred(ICONS.moveHorizontal, c) : d.kind === 'flip' ? centred(ICONS.flip, c) : rotate(c), hotspot: CENTRE_HOTSPOT, angle: d.angle }
  const glyph = BADGED[name]
  if (glyph) return { svg: arrow(c) + badge(glyph, c), hotspot: ARROW_HOTSPOT, angle: 0 }
  switch (name) {
    case 'move':
      return { svg: centred(ICONS.move, c), hotspot: CENTRE_HOTSPOT, angle: 0 }
    case 'grab':
      return { svg: centred(ICONS.hand, c), hotspot: CENTRE_HOTSPOT, angle: 0 }
    case 'grabbing':
      return { svg: centred(ICONS.grab, c), hotspot: CENTRE_HOTSPOT, angle: 0 }
    case 'not-allowed':
      return { svg: centred(ICONS.ban, c), hotspot: CENTRE_HOTSPOT, angle: 0 }
    default:
      return { svg: arrow(c), hotspot: ARROW_HOTSPOT, angle: 0 }
  }
}

export function systemCursor(name: CursorName): string {
  const d = directional(name)
  if (d?.kind === 'rotate') return 'grab'
  if (d?.kind === 'flip') return 'pointer'
  if (d) {
    const a = ((d.angle % 180) + 180) % 180
    return a < 22.5 || a >= 157.5 ? 'ew-resize' : a < 67.5 ? 'nwse-resize' : a < 112.5 ? 'ns-resize' : 'nesw-resize'
  }
  if (name === 'arrow-add') return 'copy'
  if (name.startsWith('arrow')) return 'default'
  return name
}

const cache = new Map<string, string>()

export function cursorCss(name: CursorName, colours: CursorColours | null, system = false): string {
  if (system || !colours) return systemCursor(name)
  const key = `${colours.fill}:${colours.line}:${name}`
  const cached = cache.get(key)
  if (cached) return cached
  const { svg, hotspot, angle } = drawing(name, colours)
  const image = `<svg xmlns='http://www.w3.org/2000/svg' width='32' height='32' viewBox='0 0 32 32'>${SHADOW}<g filter='url(#s)' transform='rotate(${angle} 16 16)'>${svg}</g></svg>`
  const css = `url("data:image/svg+xml,${encodeURIComponent(image).replace(/'/g, '%27')}") ${hotspot}, ${systemCursor(name)}`
  cache.set(key, css)
  return css
}
