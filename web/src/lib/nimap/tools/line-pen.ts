import type { Vec2 } from '../geometry/vector'
import { distance } from '../geometry/vector'
import type { Level, Line, LineLayer } from '../model/types'
import { metres } from './width'
import { lineChords } from '../model/lines'
import { ellipseCubics } from '../geometry/curve'
import { uid } from '../model/document'
import { MIN_FEATURE, quantize, samePoint } from '../model/precision'
import { addNode, type Command } from './commands'
import type { SnapSourceId, SnapTargets } from './snapping'
import { createTool, snapOverlay, type OverlayItem, type ToolContext, type ToolDefinition, type Transition } from './tool'
import type { CursorName } from './cursor'

export type PenMethod = 'lines' | 'rectangle' | 'ellipse'

export interface LinePenData {
  /** Where the pen was put down; clicking it again closes the run. */
  start: Vec2 | null
  /** The end of the last line drawn, where the next one starts. */
  last: Vec2 | null
  /** Ids of the lines drawn since the pen was put down, newest last. */
  drawn: string[]
  /** The first corner of a rectangle or ellipse being dragged out. */
  origin: Vec2 | null
}

export interface LinePenConfig {
  id: string
  layer: LineLayer
  sources: SnapSourceId[]
  /** The command that adds one line between two points. */
  add: (line: Line, ctx: ToolContext) => Command
  label: string
  cursor: CursorName
}

/** A rectangle as four straight lines. */
export function rectangleLines(a: Vec2, b: Vec2): Line[] {
  const x0 = Math.min(a[0], b[0])
  const x1 = Math.max(a[0], b[0])
  const y0 = Math.min(a[1], b[1])
  const y1 = Math.max(a[1], b[1])
  const ring: Vec2[] = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]
  return ring.map((p, i) => ({ id: uid(), points: [p, ring[(i + 1) % 4]] }))
}

/** An ellipse as four curved lines meeting at its quadrant points, as in Figma. */
export function ellipseLines(a: Vec2, b: Vec2): Line[] {
  return ellipseCubics(a, b).map(([p0, c1, c2, p3]) => ({ id: uid(), points: [quantize(p0), quantize(p3)] as [Vec2, Vec2], curve: [quantize(c1), quantize(c2)] as [Vec2, Vec2] }))
}

const dragLines = (method: PenMethod, a: Vec2, b: Vec2): Line[] => (method === 'ellipse' ? ellipseLines(a, b) : rectangleLines(a, b))
const dragOutline = (method: PenMethod, a: Vec2, b: Vec2): Vec2[] => dragLines(method, a, b).flatMap(l => lineChords(l).slice(0, -1))
const bigEnough = (a: Vec2, b: Vec2): boolean => Math.abs(a[0] - b[0]) >= MIN_FEATURE && Math.abs(a[1] - b[1]) >= MIN_FEATURE

const linesOf = (level: Level, layer: LineLayer): Line[] => (layer === 'walls' ? level.walls : level.fixtureLines)
/** A straight line already between two points; a curve between them is another line and does not count. */
const hasLine = (lines: Line[], a: Vec2, b: Vec2) => lines.some(w => !w.curve && ((samePoint(w.points[0], a) && samePoint(w.points[1], b)) || (samePoint(w.points[0], b) && samePoint(w.points[1], a))))

/** The working points as targets, so hovering them snaps exactly before they are document nodes. */
function ownTargets(data: LinePenData): SnapTargets {
  const points = [data.start, data.last].filter((p): p is Vec2 => !!p)
  const unique = points.filter((p, i) => points.findIndex(q => samePoint(p, q)) === i)
  return { nodes: unique.map((p, i) => ({ id: `pen/${i}`, point: p })), segments: [] }
}

function finish(data: LinePenData): Transition {
  data.start = null
  data.last = null
  data.drawn = []
  data.origin = null
  return { to: 'idle' }
}

const addedId = (command: Command): string | null => (command.type === 'addWall' ? command.wall.id : command.type === 'addFixtureLine' ? command.line.id : null)

/**
 * The tracing gesture shared by walls and fixtures. Lines: one line per
 * click, each its own undo step; clicking an existing node joins it exactly;
 * a first click on a line puts a node there at once, its own undo step, so
 * it stays when the pen stops there;
 * clicking the starting point closes the run; Enter, Escape or a double
 * click finish; Backspace removes the last line drawn. Rectangle and
 * ellipse: press at one corner and release at the opposite one, emitting
 * four lines in one step, curved for the ellipse. A click within the document's minimum
 * feature of the working point is nothing, and a line that already exists
 * between two points is not drawn twice. The cursor is derived from the
 * inputs at render time, and so is the readout: the snapped length of the
 * line in hand at its middle, the size of a rectangle being dragged.
 */
export function linePenDefinition(config: LinePenConfig): ToolDefinition<LinePenData> {
  const method = (ctx: ToolContext): PenMethod => ctx.settings.penMethod
  const addLines = (lines: Line[], ctx: ToolContext): Command[] => {
    const existing = linesOf(ctx.level, config.layer)
    return lines.filter(l => !hasLine(existing, l.points[0], l.points[1])).map(l => config.add(l, ctx))
  }
  return {
    id: config.id,
    initial: 'idle',
    create: () => ({ start: null, last: null, drawn: [], origin: null }),
    sources: config.sources,
    targets: ownTargets,
    states: {
      idle: {
        pointerDown: (_event, data, ctx) => {
          const point = quantize(ctx.snapInputs().point)
          if (method(ctx) !== 'lines') {
            data.origin = point
            return { to: 'dragging' }
          }
          const { node } = addNode(linesOf(ctx.level, config.layer), point)
          data.start = node ?? point
          data.last = data.start
          data.drawn = []
          if (!node) return { to: 'drawing' }
          return { commands: [{ type: 'addNode', layer: config.layer, point }], commit: 'Add node', to: 'drawing' }
        }
      },
      drawing: {
        pointerDown: (_event, data, ctx) => {
          const point = quantize(ctx.snapInputs({ anchor: data.last }).point)
          const last = data.last!
          if (samePoint(point, last)) return
          const closing = data.drawn.length >= 2 && samePoint(point, data.start!)
          data.last = point
          const commands = addLines([{ id: uid(), points: [last, point] }], ctx)
          if (!commands.length) return closing ? finish(data) : undefined
          const id = addedId(commands[0])
          if (id) data.drawn.push(id)
          if (closing) return { commands, commit: `Close ${config.label}`, ...finish(data) }
          return { commands, commit: `Draw ${config.label}` }
        },
        doubleClick: (_event, data) => finish(data),
        key: (event, data, ctx) => {
          if (event.key === 'Escape' || event.key === 'Enter') return finish(data)
          if (event.key !== 'Backspace') return
          const id = data.drawn.pop()
          if (!id) return finish(data)
          const pieces = linesOf(ctx.level, config.layer).filter(w => w.id === id || w.id.startsWith(`${id}.`))
          data.last = pieces.find(w => w.id === id)?.points[0] ?? data.last
          return { commands: [{ type: 'removeLines', layer: config.layer, ids: pieces.map(w => w.id) }], commit: `Remove ${config.label}` }
        }
      },
      dragging: {
        pointerUp: (_event, data, ctx) => {
          const corner = quantize(ctx.snapInputs({ anchor: data.origin }).point)
          const origin = data.origin!
          if (!bigEnough(origin, corner)) return finish(data)
          const commands = addLines(dragLines(method(ctx), origin, corner), ctx)
          return { commands, commit: `Draw ${config.label}s`, ...finish(data) }
        },
        key: (event, data) => {
          if (event.key === 'Escape') return finish(data)
        }
      }
    },
    overlay: (state, data, ctx) => {
      if (!ctx.inputs.point) return []
      const anchor = state === 'dragging' ? data.origin : data.last
      const cursor = ctx.snapInputs({ anchor })
      const items: OverlayItem[] = snapOverlay(cursor, config.layer)
      if (state === 'drawing' && data.last) {
        const last = data.last
        items.push({ type: 'preview', layer: config.layer, points: [last, cursor.point], width: config.layer === 'walls' ? ctx.settings.wallWidth : 0 })
        items.push({ type: 'anchor', point: last })
        const length = distance(last, cursor.point)
        if (length >= MIN_FEATURE) items.push({ type: 'label', at: [(last[0] + cursor.point[0]) / 2, (last[1] + cursor.point[1]) / 2], text: metres(length) })
      }
      if (state === 'dragging' && data.origin && bigEnough(data.origin, cursor.point)) {
        const origin = data.origin
        items.push({ type: 'outline', points: dragOutline(method(ctx), origin, cursor.point), closed: true, closable: false })
        const w = Math.abs(cursor.point[0] - origin[0])
        const h = Math.abs(cursor.point[1] - origin[1])
        items.push({ type: 'label', at: [(origin[0] + cursor.point[0]) / 2, (origin[1] + cursor.point[1]) / 2], text: `${w.toFixed(2)} × ${h.toFixed(2)} m` })
      }
      return items
    },
    cursor: () => config.cursor
  }
}

export const wallPenDefinition = linePenDefinition({
  id: 'wall-pen',
  layer: 'walls',
  sources: ['document', 'junctions'],
  add: (line, ctx) => ({ type: 'addWall', wall: { ...line, width: ctx.settings.wallWidth } }),
  label: 'wall',
  cursor: 'arrow-wall'
})

export const fixturePenDefinition = linePenDefinition({
  id: 'fixture-pen',
  layer: 'fixtures',
  sources: ['fixtures', 'faces'],
  add: line => ({ type: 'addFixtureLine', line }),
  label: 'fixture line',
  cursor: 'arrow-fixture'
})

export const createWallPen = () => createTool(wallPenDefinition)
export const createFixturePen = () => createTool(fixturePenDefinition)
