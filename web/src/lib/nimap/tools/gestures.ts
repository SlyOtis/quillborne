import { withoutSelected } from './selection'
import { applyToolResult, type EditorContext, type ToolEvent, type ToolInstance, type ToolResult } from './tool'
import type { EditorStore } from './store'
import type { CursorName } from './cursor'

/**
 * Gestures every tool shares, handled before the active tool sees the
 * event. Alt-click on a node removes it and heals the two walls that met
 * there, whatever tool is active.
 */
export function globalGesture(event: ToolEvent, ctx: EditorContext): ToolResult | null {
  if (event.type !== 'pointerDown' || !event.modifiers.alt) return null
  const hit = ctx.hit.at(event.point)
  if (hit?.kind !== 'node') return null
  const node = hit.node
  const selection = withoutSelected(
    ctx.selection,
    [node.id],
    node.refs.map(r => r.lineId)
  )
  return { commands: [{ type: 'healNode', layer: node.layer, point: node.point }], commit: 'Remove node', selection }
}

/** The cursor a global gesture announces before the tool's own: heal, with Alt over a node. */
export function globalCursor(ctx: EditorContext): CursorName | null {
  if (!ctx.inputs.point || !ctx.inputs.modifiers.alt) return null
  return ctx.hit.at(ctx.inputs.point)?.kind === 'node' ? 'arrow-heal' : null
}

/** Routes one event: a global gesture if it claims it, else the active tool, then the result into the store. */
export function runEvent(store: EditorStore, tool: ToolInstance, event: ToolEvent, ctx: EditorContext): void {
  applyToolResult(store, globalGesture(event, ctx) ?? tool.dispatch(event, ctx))
}
