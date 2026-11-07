import { createEditorStore, buildEditGraph, junctionPoints, createSnapper, snapTargets, levelFaceTargets, mergeTargets, safeSolids, runEvent, curveHandles, fixtureGrips, createHitService, placeOpenings, HIT_RADIUS_PX, DEFAULT_LAYERS, DRAWING_CONSTRAINTS, MOVING_CONSTRAINTS, NO_MODIFIERS } from '$lib/nimap/index'
import type { Level, Vec2, ToolInstance, EditorContext, ToolEvent, Modifiers, EditorStore, AnyConstraint, Snapper, SnapRequest, SnapSources, SnapTargets, Layers, Inputs, ToolSettings } from '$lib/nimap/index'

export interface HarnessTrace {
  /** Snappers built through the context factory, one per gesture that fixes its targets. */
  snappersBuilt: number
  requests: SnapRequest[]
}

export interface Harness {
  store: EditorStore
  trace: HarnessTrace
  layers: Layers
  settings: ToolSettings
  ctx: () => EditorContext
  send: (event: ToolEvent) => void
  down: (point: Vec2, modifiers?: Partial<Modifiers>) => void
  move: (point: Vec2, modifiers?: Partial<Modifiers>) => void
  up: (point: Vec2, modifiers?: Partial<Modifiers>) => void
  click: (point: Vec2, modifiers?: Partial<Modifiers>) => void
  drag: (from: Vec2, to: Vec2, modifiers?: Partial<Modifiers>) => void
  key: (key: string, modifiers?: Partial<Modifiers>) => void
  /** A modifier went down or up with the pointer where it is. */
  modifiers: (modifiers: Partial<Modifiers>) => void
  doubleClick: (point: Vec2) => void
}

/** Drives a tool against a store the way the editor shell will: rebuild context per event, route results. */
export function harness(tool: ToolInstance, level: Level, options: { scale?: number; constraints?: AnyConstraint[]; wallWidth?: number; penMethod?: ToolSettings['penMethod'] } = {}): Harness {
  const store = createEditorStore(level)
  const scale = options.scale ?? 100
  const constraints = options.constraints ?? (tool.id === 'select' ? MOVING_CONSTRAINTS : DRAWING_CONSTRAINTS)
  const settings: ToolSettings = { wallWidth: options.wallWidth ?? 0.16, penMethod: options.penMethod ?? 'lines', openingWidth: { door: 0.9, window: 1.2 } }
  const trace: HarnessTrace = { snappersBuilt: 0, requests: [] }
  const snapper = (targets: SnapTargets): Snapper => {
    trace.snappersBuilt++
    const snap = createSnapper(targets, constraints, scale)
    return (point, request) => {
      trace.requests.push(request ?? {})
      return snap(point, request)
    }
  }
  let derived: { level: Level; junctions: Vec2[]; faces: SnapTargets } | null = null
  const h = { layers: DEFAULT_LAYERS }
  const inputs: Inputs = { point: null, modifiers: NO_MODIFIERS }
  const ctx = (): EditorContext => {
    const graph = buildEditGraph(store.working.walls, store.working.fixtureLines)
    if (derived?.level !== store.level) derived = { level: store.level, junctions: junctionPoints(store.level.walls), faces: levelFaceTargets(store.level.walls, safeSolids(store.level.walls, store.level.openings).boundary) }
    const sources: SnapSources = { document: snapTargets(graph), junctions: snapTargets(buildEditGraph([]), derived.junctions), faces: derived.faces, fixtures: snapTargets(graph, [], 'fixtures') }
    const targets = mergeTargets(sources.document, sources.junctions, sources.fixtures)
    const hit = createHitService(graph, store.working.fixtures, h.layers, HIT_RADIUS_PX / scale, tool.id === 'select' || tool.id === 'bend' ? curveHandles(store.selection, graph) : [], placeOpenings(store.working.openings, store.working.walls), store.working.units, tool.id === 'select' ? fixtureGrips(store.selection, store.working) : [])
    return { level: store.working, inputs, graph, selection: store.selection, layers: h.layers, hit, sources, targets, scale, snapper, settings }
  }
  const send = (event: ToolEvent) => runEvent(store, tool, event, ctx())
  const mods = (m?: Partial<Modifiers>): Modifiers => ({ ...NO_MODIFIERS, ...m })
  const setInputs = (point: Vec2 | null, m?: Partial<Modifiers>) => {
    inputs.point = point ?? inputs.point
    inputs.modifiers = mods(m)
  }
  const down = (point: Vec2, m?: Partial<Modifiers>) => {
    setInputs(point, m)
    send({ type: 'pointerDown', point, modifiers: mods(m) })
  }
  const move = (point: Vec2, m?: Partial<Modifiers>) => {
    setInputs(point, m)
    send({ type: 'update' })
  }
  const up = (point: Vec2, m?: Partial<Modifiers>) => {
    setInputs(point, m)
    send({ type: 'pointerUp', point, modifiers: mods(m) })
  }
  return {
    store,
    trace,
    get layers() {
      return h.layers
    },
    set layers(layers: Layers) {
      h.layers = layers
    },
    settings,
    ctx,
    send,
    down,
    move,
    up,
    click: (point, m) => {
      move(point, m)
      down(point, m)
      up(point, m)
    },
    drag: (from, to, m) => {
      down(from, m)
      move([from[0] + (to[0] - from[0]) / 2, from[1] + (to[1] - from[1]) / 2], m)
      move(to, m)
      up(to, m)
    },
    key: (key, m) => send({ type: 'key', key, modifiers: mods(m) }),
    modifiers: m => {
      setInputs(null, m)
      send({ type: 'update' })
    },
    doubleClick: point => {
      setInputs(point)
      send({ type: 'doubleClick', point, modifiers: mods() })
    }
  }
}
