import type { Box, Vec2 } from '../geometry/vector'
import type { Level, LineLayer, Opening, OpeningKind } from '../model/types'
import type { Command } from './commands'
import type { EditGraph } from './graph'
import type { HitService } from './hit'
import { mergeTargets, type Guide, type Modifiers, type Snapper, type SnapRequest, type SnapResult, type SnapSourceId, type SnapSources, type SnapTargets } from './snapping'
import type { Selection } from './selection'
import type { Layers } from './layers'
import type { CurveHandle } from './handles'
import type { EditorStore } from './store'
import type { CursorName } from './cursor'
import type { Hit } from './hit'

export interface PointerToolEvent {
  type: 'pointerDown' | 'pointerUp' | 'doubleClick'
  point: Vec2
  modifiers: Modifiers
}

export interface KeyToolEvent {
  type: 'key'
  key: string
  modifiers: Modifiers
}

/** The inputs changed: the pointer moved, a modifier went down or up, or the view moved under the pointer. */
export interface UpdateToolEvent {
  type: 'update'
}

export type ToolEvent = PointerToolEvent | KeyToolEvent | UpdateToolEvent

/** What the editor knows about the pointer and the keyboard right now. Owned by the editor, never by a tool. */
export interface Inputs {
  /** The pointer's document position, or null when it has not entered the canvas. */
  point: Vec2 | null
  modifiers: Modifiers
}

export type OverlayItem =
  | { type: 'guide'; guide: Guide }
  | { type: 'preview'; layer: LineLayer; points: Vec2[]; width: number }
  /** A shape being drawn: open until closed; `closable` draws the closing edge dashed as a hint. */
  | { type: 'outline'; points: Vec2[]; closed: boolean; closable: boolean }
  /** Where the pen's hand is: the snap that placed it, and the layer a node placed there would belong to. */
  | { type: 'cursor'; point: Vec2; snapTypes: string[]; layer?: LineLayer }
  /** The point a tool is working from: the pen's last corner. Drawn as the working node. */
  | { type: 'anchor'; point: Vec2 }
  /** A readout in the canvas: the length of the wall in hand at its middle, the size of a rectangle being dragged. */
  | { type: 'label'; at: Vec2; text: string }
  /** An opening where it would land: the one in hand, or one being slid along its wall. */
  | { type: 'opening'; opening: Opening }
  /** The selection's snug transform box; its zones are read from position, no handles drawn. */
  | { type: 'bounds'; box: Box }
  /** Bézier handles of the curved lines the selection touches. */
  | { type: 'handles'; handles: CurveHandle[] }
  | { type: 'box'; a: Vec2; b: Vec2 }
  | { type: 'selection'; selection: Selection }
  /** What is under the pointer and would take a press, lit up so the hand knows before it acts. */
  | { type: 'hover'; hit: Hit }

export interface ToolSettings {
  wallWidth: number
  penMethod: 'lines' | 'rectangle' | 'ellipse'
  /** The width of the door or window in hand. */
  openingWidth: Record<OpeningKind, number>
}

/** What the editor supplies per event. The tool runtime adds the tool's own targets and the snapper over them. */
export interface EditorContext {
  /** The store's working level. */
  level: Level
  inputs: Inputs
  /** The edit graph of the working level. */
  graph: EditGraph
  /** Pixels per metre. */
  scale: number
  /** The selection as of the current history entry. */
  selection: Selection
  layers: Layers
  /** Hit testing over the working level, respecting layer locks. */
  hit: HitService
  /** What the scene offers to snap to, by source; hidden layers contribute nothing. */
  sources: SnapSources
  /** The sources a tool gets when it declares none: everything. */
  targets: SnapTargets
  /** A snapper over any target set, for gestures that fix their targets up front. */
  snapper: (targets: SnapTargets) => Snapper
  settings: ToolSettings
}

export interface ToolContext extends EditorContext {
  /** The scene's targets plus the tool's own. */
  targets: SnapTargets
  /** Snaps against `targets`. */
  snap: Snapper
  /** The inputs snapped against `targets` with the current modifiers; the pointer must have entered. */
  snapInputs: (request?: Omit<SnapRequest, 'modifiers'>) => SnapResult
}

/** The guides and cursor dot of a snap result, as every tool draws them. */
export function snapOverlay(result: SnapResult, layer?: LineLayer): OverlayItem[] {
  const items: OverlayItem[] = result.guides.map(guide => ({ type: 'guide', guide }))
  items.push({ type: 'cursor', point: result.point, snapTypes: result.types, ...(layer ? { layer } : {}) })
  return items
}

export interface ToolResult {
  commands?: Command[]
  /** History label; when present the commands are committed. */
  commit?: string
  /** The commands are a live preview on top of the committed level. */
  preview?: boolean
  cancelPreview?: boolean
  /** The selection after this event: recorded with the commit, or as its own entry when nothing else changed. */
  selection?: Selection
}

/** Routes a tool result into the store the way every host does. */
export function applyToolResult(store: EditorStore, result: ToolResult): void {
  if (result.cancelPreview) store.cancelPreview()
  const commands = result.commands ?? []
  if (commands.length && result.commit) store.commit(result.commit, commands, result.selection)
  else if (commands.length && result.preview) store.preview(commands)
  else if (commands.length) store.commit('Edit', commands, result.selection)
  else if (result.selection) store.select(result.selection)
}

export type Transition = (ToolResult & { to?: string }) | void

export interface ToolStateHandlers<D> {
  onEnter?: (data: D, ctx: ToolContext) => void
  /** Recomputes whatever this state derives from the inputs; runs on every input change. */
  update?: (data: D, ctx: ToolContext) => Transition
  pointerDown?: (event: PointerToolEvent, data: D, ctx: ToolContext) => Transition
  pointerUp?: (event: PointerToolEvent, data: D, ctx: ToolContext) => Transition
  doubleClick?: (event: PointerToolEvent, data: D, ctx: ToolContext) => Transition
  key?: (event: KeyToolEvent, data: D, ctx: ToolContext) => Transition
}

export interface ToolDefinition<D> {
  id: string
  initial: string
  create: () => D
  states: Record<string, ToolStateHandlers<D>>
  /** Which of the scene's sources the tool snaps to; every source when omitted. */
  sources?: SnapSourceId[]
  /** What the tool adds to the scene's snap targets: the points it is working with that are not in the document yet. */
  targets?: (data: D, ctx: EditorContext) => SnapTargets
  overlay: (state: string, data: D, ctx: ToolContext) => OverlayItem[]
  cursor?: (state: string, data: D, ctx: ToolContext) => CursorName
}

export interface ToolInstance<D = unknown> {
  readonly id: string
  readonly state: string
  readonly data: D
  dispatch: (event: ToolEvent, ctx: EditorContext) => ToolResult
  overlay: (ctx: EditorContext) => OverlayItem[]
  cursor: (ctx: EditorContext) => CursorName
  reset: () => void
}

/**
 * A tool is a small hand-written state machine: each state handles the
 * pointer and key events it cares about, returns commands for the store and
 * optionally a transition. Anything a state derives from the inputs (a
 * snapped cursor, a drag preview) is recomputed in `update`, which the
 * editor sends on every input change, so nothing derived can go stale.
 * Tool-local data lives in the instance and is discarded on reset. The
 * runtime merges the tool's own targets into the scene's before every
 * event, so a point the tool is working with snaps like a document node.
 */
export function createTool<D>(definition: ToolDefinition<D>): ToolInstance<D> {
  let state = definition.initial
  let data = definition.create()
  const enter = (next: string, ctx: ToolContext) => {
    state = next
    definition.states[next]?.onEnter?.(data, ctx)
  }
  /** The tool's view of the context. Targets and the snapper are built on first use, since a drag brings its own. */
  const full = (base: EditorContext): ToolContext => {
    let targets: SnapTargets | undefined
    let snap: Snapper | undefined
    const ctx: ToolContext = {
      ...base,
      get targets() {
        if (targets) return targets
        const scene = definition.sources ? mergeTargets(...definition.sources.map(id => base.sources[id])) : base.targets
        return (targets = definition.targets ? mergeTargets(scene, definition.targets(data, base)) : scene)
      },
      get snap() {
        return (snap ??= base.snapper(ctx.targets))
      },
      snapInputs: (request = {}) => ctx.snap(base.inputs.point!, { ...request, modifiers: base.inputs.modifiers })
    }
    return ctx
  }
  return {
    id: definition.id,
    get state() {
      return state
    },
    get data() {
      return data
    },
    dispatch(event, base) {
      const ctx = full(base)
      const handlers = definition.states[state]
      if (!handlers) throw new Error(`Tool ${definition.id} has no state ${state}.`)
      let transition: Transition
      switch (event.type) {
        case 'pointerDown':
          transition = handlers.pointerDown?.(event, data, ctx)
          break
        case 'update':
          transition = handlers.update?.(data, ctx)
          break
        case 'pointerUp':
          transition = handlers.pointerUp?.(event, data, ctx)
          break
        case 'doubleClick':
          transition = handlers.doubleClick?.(event, data, ctx)
          break
        case 'key':
          transition = handlers.key?.(event, data, ctx)
          break
      }
      if (!transition) return {}
      const { to, ...result } = transition
      if (to && to !== state) enter(to, ctx)
      return result
    },
    overlay(base) {
      return definition.overlay(state, data, full(base))
    },
    cursor(base) {
      return definition.cursor?.(state, data, full(base)) ?? 'arrow'
    },
    reset() {
      state = definition.initial
      data = definition.create()
    }
  }
}

/** Pixel radius for hit tests. */
export const HIT_RADIUS_PX = 10
