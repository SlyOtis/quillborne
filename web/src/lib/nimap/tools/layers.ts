export type LayerId = 'walls' | 'fixtures'

export interface LayerState {
  /** Not drawn and not offered as a snap target. */
  hidden: boolean
  /** Drawn and snapped to, but nothing in it can be hit or selected. */
  locked: boolean
  /** Locked except for its faces: rooms or objects can be selected, never moved, and its lines, nodes and openings stay locked. */
  faces?: boolean
}

export type Layers = Readonly<Record<LayerId, LayerState>>

export const DEFAULT_LAYERS: Layers = { walls: { hidden: false, locked: false }, fixtures: { hidden: false, locked: false } }

export const canHit = (layers: Layers, id: LayerId): boolean => !layers[id].hidden && !layers[id].locked

/** Whether the layer's faces, its rooms or objects, can be hit: when it is live, or locked to faces only. */
export const canHitFaces = (layers: Layers, id: LayerId): boolean => !layers[id].hidden && (!layers[id].locked || !!layers[id].faces)
