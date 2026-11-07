import type { Vec2 } from '../geometry/vector'
import { distance, sub } from '../geometry/vector'
import type { Line, LineLayer } from '../model/types'
import { bowChange, curveHandles, paramAt, straightHandles, toggleSmooth, withoutHandle, type CurveHandle } from './handles'
import { selectionOf, EMPTY_SELECTION, isEmptySelection } from './selection'
import type { SnapResult } from './snapping'
import { beginHandleDrag, handleDragState, type HandleDrag } from './select'
import { createTool, type OverlayItem, type ToolDefinition } from './tool'

interface Bow {
  layer: LineLayer
  line: Line
  t: number
  origin: Vec2
}

export interface BendData {
  handle: HandleDrag | null
  /** A press on a handle that has not moved yet: a click removes it, a move drags it. */
  pendingHandle: CurveHandle | null
  bow: Bow | null
  cursor: SnapResult | null
}

const DRAG_START_PX = 2

/**
 * Figma's bend tool. Click a straight line: it gets handles and stays
 * straight. Drag a line's body: it bows through the cursor. Click a node:
 * it toggles between corner and smooth. Click a handle: that handle goes.
 * Drag a handle: as in select, with a smooth joint held and a loose handle
 * snapping opposite its neighbour.
 */
export const bendDefinition: ToolDefinition<BendData> = {
  id: 'bend',
  initial: 'idle',
  create: () => ({ handle: null, pendingHandle: null, bow: null, cursor: null }),
  states: {
    idle: {
      pointerDown: (event, data, ctx) => {
        const hit = ctx.hit.at(event.point)
        if (hit?.kind === 'handle') {
          data.pendingHandle = hit.handle
          data.handle = beginHandleDrag(hit.handle, event.point, ctx)
          data.bow = { layer: hit.handle.layer, line: ctx.graph.linesById.get(hit.handle.lineId)!, t: 0, origin: event.point }
          return { to: 'pendingHandle' }
        }
        if (hit?.kind === 'node') {
          const changes = toggleSmooth(hit.node, ctx.graph)
          const selection = selectionOf([hit.node.id])
          if (!changes.length) return { selection }
          return { commands: [{ type: 'setCurves', layer: hit.node.layer, curves: changes }], commit: 'Bend', selection }
        }
        if (hit?.kind === 'line') {
          const line = ctx.graph.linesById.get(hit.lineId)!
          data.bow = { layer: hit.layer, line, t: paramAt(line, event.point), origin: event.point }
          return { to: 'pendingBow', selection: selectionOf([], [hit.lineId]) }
        }
        return isEmptySelection(ctx.selection) ? undefined : { selection: EMPTY_SELECTION }
      },
      key: (event, _data, ctx) => {
        if (event.key === 'Escape' && !isEmptySelection(ctx.selection)) return { selection: EMPTY_SELECTION }
      }
    },
    pendingHandle: {
      update: (data, ctx) => {
        if (!ctx.inputs.point || distance(ctx.inputs.point, data.bow!.origin) <= DRAG_START_PX / ctx.scale) return
        data.pendingHandle = null
        data.bow = null
        return { to: 'handleDrag', ...(handleDragState.update(data, ctx) ?? {}) }
      },
      pointerUp: (_event, data) => {
        const h = data.pendingHandle!
        const line = data.bow!.line
        data.pendingHandle = null
        data.handle = null
        data.bow = null
        return { commands: [{ type: 'setCurves', layer: h.layer, curves: [withoutHandle(line, h.index)] }], commit: 'Remove handle', to: 'idle' }
      },
      key: (event, data) => {
        if (event.key !== 'Escape') return
        data.pendingHandle = null
        data.handle = null
        data.bow = null
        return { to: 'idle' }
      }
    },
    handleDrag: handleDragState,
    pendingBow: {
      update: (data, ctx) => {
        if (!ctx.inputs.point || distance(ctx.inputs.point, data.bow!.origin) <= DRAG_START_PX / ctx.scale) return
        return { to: 'bowing', commands: [{ type: 'setCurves', layer: data.bow!.layer, curves: [bowChange(data.bow!.line, data.bow!.t, sub(ctx.inputs.point, data.bow!.origin))] }], preview: true }
      },
      pointerUp: (_event, data) => {
        const bow = data.bow!
        data.bow = null
        if (bow.line.curve) return { to: 'idle' }
        return { commands: [{ type: 'setCurves', layer: bow.layer, curves: [{ lineId: bow.line.id, curve: straightHandles(bow.line) }] }], commit: 'Bend', to: 'idle' }
      },
      key: (event, data) => {
        if (event.key !== 'Escape') return
        data.bow = null
        return { to: 'idle' }
      }
    },
    bowing: {
      update: (data, ctx) => ({ commands: [{ type: 'setCurves', layer: data.bow!.layer, curves: [bowChange(data.bow!.line, data.bow!.t, sub(ctx.inputs.point!, data.bow!.origin))] }], preview: true }),
      pointerUp: (event, data) => {
        const bow = data.bow!
        data.bow = null
        return { commands: [{ type: 'setCurves', layer: bow.layer, curves: [bowChange(bow.line, bow.t, sub(event.point, bow.origin))] }], commit: 'Bend', to: 'idle' }
      },
      key: (event, data) => {
        if (event.key !== 'Escape') return
        data.bow = null
        return { cancelPreview: true, to: 'idle' }
      }
    }
  },
  overlay: (state, data, ctx) => {
    const items: OverlayItem[] = []
    const handles = curveHandles(ctx.selection, ctx.graph)
    if (handles.length) items.push({ type: 'handles', handles })
    if (state === 'handleDrag' && data.cursor) for (const guide of data.cursor.guides) items.push({ type: 'guide', guide })
    return items
  },
  cursor: (state, _data, ctx) => {
    if (state === 'bowing' || state === 'handleDrag') return 'grabbing'
    if (state !== 'idle') return 'arrow-bend'
    const hit = ctx.inputs.point ? ctx.hit.at(ctx.inputs.point) : null
    return hit?.kind === 'line' || hit?.kind === 'node' || hit?.kind === 'handle' ? 'arrow-bend' : 'arrow'
  }
}

export const createBendTool = () => createTool(bendDefinition)
