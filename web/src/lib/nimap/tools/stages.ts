import type { LayerId, Layers, LayerState } from './layers'

/** `place` carries a paste; no stage lists it, it is taken up by a paste and put down by a click. */
export type ToolId = 'wall-pen' | 'fixture-pen' | 'select' | 'bend' | 'door' | 'window' | 'place'
export type StageId = 'setup' | 'trace' | 'furnish' | 'connect'

/** A layer as a stage treats it: `live` can be touched, `muted` is drawn quietly and only snapped to, `faces` is drawn quietly with its rooms or objects selectable and nothing movable. */
export type LayerTreatment = 'live' | 'muted' | 'faces'

/**
 * A stage is what the user is doing: it names the tools on offer, the
 * first of them being the one the stage rests in, and how each layer is
 * treated while it lasts. Tools never know a stage exists; the stage tells
 * the hit service and the canvas what is live.
 */
export interface Stage {
  id: StageId
  label: string
  /** One line saying what the stage is for, the panel's heading. */
  heading: string
  tools: ToolId[]
  layers: Record<LayerId, LayerTreatment>
}

export const STAGES: Stage[] = [
  { id: 'setup', label: 'Floorplan', heading: 'Place the floorplan and give it its real size.', tools: [], layers: { walls: 'muted', fixtures: 'muted' } },
  { id: 'trace', label: 'Walls', heading: 'Draw the walls, doors and windows.', tools: ['select', 'wall-pen', 'door', 'window', 'bend'], layers: { walls: 'live', fixtures: 'muted' } },
  { id: 'furnish', label: 'Furniture', heading: 'Trace the furniture and set what each piece is.', tools: ['select', 'fixture-pen', 'bend'], layers: { walls: 'muted', fixtures: 'live' } },
  { id: 'connect', label: 'Links', heading: 'Link rooms to what they stand for.', tools: ['select'], layers: { walls: 'faces', fixtures: 'muted' } }
]

export const stageOf = (id: StageId): Stage => STAGES.find(s => s.id === id)!

/**
 * A spring-loaded tool: while `key` is held and `from` is the chosen tool,
 * `to` takes its place, in a stage that offers it; letting go brings
 * `from` back. A gesture keeps the tool it started with until it ends.
 */
export interface Spring {
  key: 'shift' | 'alt' | 'ctrl' | 'command'
  from: ToolId
  to: ToolId
}

export const SPRINGS: Spring[] = [{ key: 'command', from: 'select', to: 'bend' }]

/** The tool the held keys put in place of the chosen one, the chosen one when no spring applies. */
export function sprungTool(chosen: ToolId, held: Partial<Record<Spring['key'], boolean>>, stage: Stage): ToolId {
  return SPRINGS.find(s => held[s.key] && s.from === chosen && stage.tools.includes(s.to))?.to ?? chosen
}

/** The stage a tool belongs to, the current one when it has it. */
export function stageWithTool(tool: ToolId, current: StageId): Stage | null {
  const here = stageOf(current)
  if (here.tools.includes(tool)) return here
  return STAGES.find(s => s.tools.includes(tool)) ?? null
}

const treated = (own: LayerState, treatment: LayerTreatment): LayerState => ({
  hidden: own.hidden,
  locked: own.locked || treatment !== 'live',
  ...(treatment === 'faces' && !own.locked ? { faces: true } : {})
})

/** The layer toggles in force: the user's overrides, plus a lock on every layer the stage mutes. */
export function stageLayers(stage: Stage, overrides: Layers): Layers {
  return {
    walls: treated(overrides.walls, stage.layers.walls),
    fixtures: treated(overrides.fixtures, stage.layers.fixtures)
  }
}
