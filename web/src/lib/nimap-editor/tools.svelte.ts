import {
  buildEditGraph,
  createBendTool,
  createDoorTool,
  createFixturePen,
  createHitService,
  createSelectTool,
  createSnapper,
  createWallPen,
  createWindowTool,
  curveHandles,
  DEFAULT_LAYERS,
  DRAWING_CONSTRAINTS,
  EMPTY_SELECTION,
  fixtureGrips,
  HIT_RADIUS_PX,
  mergeTargets,
  MOVING_CONSTRAINTS,
  NO_MODIFIERS,
  NO_TARGETS,
  runEvent,
  snapTargets,
  sprungTool,
  STAGES,
  stageLayers,
  stageOf,
  stageWithTool,
  type EditorContext,
  type Inputs,
  type LayerId,
  type Layers,
  type LayerState,
  type OverlayItem,
  type Selection,
  type SnapSources,
  type SnapTargets,
  type StageId,
  type ToolEvent,
  type ToolId,
  type ToolInstance,
  type ToolSettings,
  type Vec2
} from '$lib/nimap'
import { createPlaceTool } from '$lib/nimap/tools/place-tool'
import type { Clip } from '$lib/nimap/tools/clipboard'
import type { DocumentState } from './document.svelte'
import type { ViewState } from './view.svelte'

export interface ToolsDeps {
  enabled: () => boolean
  settings: () => ToolSettings
  held?: () => Clip | null
  dropped?: (delta: Vec2, selection: Selection) => void
}

export class ToolsState {
  readonly #doc: DocumentState
  readonly #view: ViewState
  readonly #deps: ToolsDeps
  readonly tools: Record<ToolId, ToolInstance>
  readonly stages = STAGES

  activeStage = $state<StageId>('trace')
  activeToolId = $state<ToolId>('select')
  gestureToolId = $state<ToolId | null>(null)
  tick = $state(0)
  layers = $state.raw<Layers>(DEFAULT_LAYERS)
  inputs = $state.raw<Inputs>({ point: null, modifiers: NO_MODIFIERS })

  constructor(doc: DocumentState, view: ViewState, deps: ToolsDeps) {
    this.#doc = doc
    this.#view = view
    this.#deps = deps
    this.tools = {
      'wall-pen': createWallPen(),
      'fixture-pen': createFixturePen(),
      select: createSelectTool(),
      bend: createBendTool(),
      door: createDoorTool(),
      window: createWindowTool(),
      place: createPlaceTool(deps.held ?? (() => null), (delta, selection) => deps.dropped?.(delta, selection))
    }
  }

  stage = $derived.by(() => stageOf(this.activeStage))
  shownToolId = $derived.by(() => sprungTool(this.activeToolId, this.inputs.modifiers, this.stage))
  frontToolId = $derived.by(() => this.gestureToolId ?? this.shownToolId)
  activeTool = $derived.by(() => this.tools[this.frontToolId])
  effectiveLayers = $derived.by(() => stageLayers(this.stage, this.layers))
  toolsEnabled = $derived.by(() => this.#deps.enabled() && this.stage.tools.length > 0)
  grips = $derived.by(() => this.effectiveLayers.fixtures.locked ? [] : fixtureGrips(this.#doc.committedSelection, this.#doc.working))

  context(): EditorContext {
    const doc = this.#doc
    const g = doc.graph
    const editing = this.frontToolId === 'select' || this.frontToolId === 'bend'
    const constraints = editing ? MOVING_CONSTRAINTS : DRAWING_CONSTRAINTS
    const l = this.effectiveLayers
    const sources: SnapSources = {
      document: l.walls.hidden ? NO_TARGETS : snapTargets(g),
      junctions: l.walls.hidden ? NO_TARGETS : snapTargets(buildEditGraph([]), doc.junctions),
      faces: l.walls.hidden ? NO_TARGETS : doc.faces,
      fixtures: l.fixtures.hidden ? NO_TARGETS : snapTargets(g, [], 'fixtures')
    }
    const targets = mergeTargets(sources.document, sources.junctions, sources.fixtures)
    const scale = this.#view.scale
    const viewport = this.#view.viewport
    const snapper = (t: SnapTargets) => createSnapper(t, constraints, scale, viewport)
    const hit = createHitService(g, doc.working.fixtures, l, HIT_RADIUS_PX / scale, editing ? curveHandles(doc.committedSelection, g) : [], doc.placedOpenings, doc.working.units, editing ? this.grips : [])
    return { level: doc.working, inputs: this.inputs, graph: g, selection: doc.committedSelection, layers: l, hit, sources, targets, scale, snapper, settings: this.#deps.settings() }
  }

  dispatch(event: ToolEvent) {
    if (!this.toolsEnabled) return
    if (event.type === 'pointerDown' && !this.gestureToolId) this.gestureToolId = this.frontToolId
    runEvent(this.#doc.store, this.activeTool, event, this.context())
    if (this.gestureToolId && this.activeTool.state === 'idle' && event.type !== 'update') this.gestureToolId = null
    if (this.activeToolId === 'place' && this.activeTool.state === 'idle') this.activeToolId = this.stage.tools[0] ?? 'select'
    this.tick++
  }

  interrupt() {
    this.activeTool.reset()
    this.gestureToolId = null
    this.#doc.store.cancelPreview()
    this.tick++
  }

  setLayer(id: LayerId, patch: Partial<LayerState>) {
    this.layers = { ...this.layers, [id]: { ...this.layers[id], ...patch } }
    this.interrupt()
  }

  setStage(id: StageId) {
    if (id === this.activeStage) return
    this.interrupt()
    this.#doc.store.select(EMPTY_SELECTION)
    this.activeStage = id
    this.activeToolId = stageOf(id).tools[0] ?? 'select'
  }

  setTool(id: ToolId) {
    const target = stageWithTool(id, this.activeStage)
    if (target && target.id !== this.activeStage) this.setStage(target.id)
    if (id === this.activeToolId) return
    this.interrupt()
    this.activeToolId = id
  }

  overlay = $derived.by<OverlayItem[]>(() => {
    void this.tick
    if (!this.toolsEnabled) return []
    return this.activeTool.overlay(this.context())
  })

  selection = $derived.by<Selection>(() => {
    const item = this.overlay.find(o => o.type === 'selection')
    return item && item.type === 'selection' ? item.selection : this.#doc.committedSelection
  })
}
