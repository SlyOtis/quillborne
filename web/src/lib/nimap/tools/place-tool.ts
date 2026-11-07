import type { Vec2 } from '../geometry/vector'
import { add, bounds, sub } from '../geometry/vector'
import { clipBox, clipPoints, freshIds, pasteCommands, type Clip } from './clipboard'
import { nodeKey } from './graph'
import type { Selection } from './selection'
import type { SnapResult, SnapTargets } from './snapping'
import { snapOverlay, createTool, type OverlayItem, type ToolContext, type ToolDefinition } from './tool'

/** A paste in hand: what is held, the ids its next drop will take, and where it last was. */
export interface PlaceData {
  ids: Map<string, string> | null
  delta: Vec2 | null
  cursor: SnapResult | null
}

const MAX_CARRIED = 8

/**
 * The clip in hand: it follows the pointer as a preview, its nodes snapping
 * as a moved selection's do, a click puts it down in one commit with what
 * was put down selected, and Escape lets go. `clip` is read on every event,
 * so the host's clipboard is the one source; `dropped` hears each offset a
 * drop used, from the clip's own place.
 */
export function createPlaceTool(clip: () => Clip | null, dropped: (delta: Vec2, selection: Selection) => void = () => {}) {
  const origin = (c: Clip): Vec2 => {
    const box = clipBox(c)
    return [(box.minX + box.maxX) / 2, (box.minY + box.maxY) / 2]
  }

  /** The scene less the preview of the clip itself, which the working level holds from the last move. */
  const others = (c: Clip, data: PlaceData, ctx: ToolContext): SnapTargets => {
    const own = new Set(data.ids ? c.lines.map(l => data.ids!.get(l.id)!) : [])
    const nodes = new Set(data.delta ? clipPoints(c).map(p => nodeKey(add(p, data.delta!), 'fixtures')) : [])
    return { nodes: ctx.targets.nodes.filter(n => !nodes.has(n.id)), segments: ctx.targets.segments.filter(s => !own.has(s.id.split(':')[0])) }
  }

  const follow = (data: PlaceData, ctx: ToolContext) => {
    const c = clip()
    const p = ctx.inputs.point
    if (!c || !p) return { cancelPreview: true }
    data.ids ??= freshIds(c)
    const from = origin(c)
    const points = clipPoints(c)
    const carried = points.length <= MAX_CARRIED ? points : (b => [[b.minX, b.minY], [b.maxX, b.minY], [b.minX, b.maxY], [b.maxX, b.maxY]] as Vec2[])(bounds(points))
    const snapped = ctx.snapper(others(c, data, ctx))(p, { offsets: carried.map(q => sub(q, from)), pointerCarried: false, modifiers: ctx.inputs.modifiers })
    data.cursor = snapped
    data.delta = sub(snapped.point, from)
    return { commands: pasteCommands(c, data.delta, data.ids).commands, preview: true }
  }

  const definition: ToolDefinition<PlaceData> = {
    id: 'place',
    initial: 'holding',
    create: () => ({ ids: null, delta: null, cursor: null }),
    sources: ['fixtures', 'faces'],
    states: {
      idle: {},
      holding: {
        update: follow,
        pointerDown(_event, data, ctx) {
          follow(data, ctx)
          const c = clip()
          if (!c || !data.delta || !data.ids) return
          const { commands, selection } = pasteCommands(c, data.delta, data.ids)
          dropped(data.delta, selection)
          return { to: 'idle', cancelPreview: true, commands, commit: 'Paste', selection }
        },
        key(event) {
          if (event.key === 'Escape') return { to: 'idle', cancelPreview: true }
        }
      }
    },
    overlay: (state, data) => (state === 'holding' && data.cursor ? snapOverlay(data.cursor).filter(o => o.type === 'guide') : ([] as OverlayItem[])),
    cursor: state => (state === 'holding' ? 'grabbing' : 'arrow')
  }
  return createTool(definition)
}
