import type { Vec2 } from '../../geometry/vector'

export interface Modifiers {
  shift: boolean
  alt: boolean
  /** Snapping off while held. */
  ctrl: boolean
  /** The platform's command key: Cmd on a Mac, Ctrl elsewhere. Held at a press in select, the gesture bends. */
  command?: boolean
}

export const NO_MODIFIERS: Modifiers = { shift: false, alt: false, ctrl: false }

/** Something to snap to. Document nodes are snap points; so are derived points such as crossings. */
export interface SnapPoint {
  id: string
  point: Vec2
}

/** A segment to snap to, ending in two snap points. Wall segments and fixture edges both qualify. */
export interface SnapSegment {
  id: string
  a: Vec2
  b: Vec2
  aNode: string
  bNode: string
  /** An end that is a chord joint inside a curve, not a node: snapping runs right up to it. */
  aOpen?: boolean
  bOpen?: boolean
  /** The whole line this chord belongs to: its guide, the one midpoint magnet halfway along it by length, and for a curve the true projection. A closed line, a ring, has no ends and no middle. */
  line?: { points: Vec2[]; midpoint?: Vec2; closed?: boolean; project?: (p: Vec2) => Vec2 }
}

/** What a snapper snaps against. Composed by the editor from the edit graph, derived points and fixtures. */
export interface SnapTargets {
  nodes: SnapPoint[]
  segments: SnapSegment[]
}

export interface SnapContext {
  /** The point being snapped, in document metres. */
  point: Vec2
  nodes: SnapPoint[]
  segments: SnapSegment[]
  /** The previous point of a line being drawn, or the drag origin; enables angle constraints. */
  anchor: Vec2 | null
  /** Offsets of the carried points relative to `point`, so they snap too. */
  offsets: Vec2[]
  /** Whether `point` itself is a carried point. False for a body drag: where the hand pressed is nothing. */
  pointerCarried: boolean
  /** Pixels per metre; thresholds are expressed in pixels. */
  scale: number
  modifiers: Modifiers
}

export type Primitive =
  | { type: 'point'; point: Vec2 }
  | { type: 'line'; point: Vec2; direction: Vec2 }
  | { type: 'ray'; origin: Vec2; direction: Vec2 }
  | { type: 'segment'; start: Vec2; end: Vec2 }

export interface TestResult {
  active: boolean
  distance: number
}

export type GuideStyle = 'alignment' | 'angle' | 'parallel' | 'perpendicular' | 'edge'

export type Guide =
  /** A straight guide; `marks` are the existing points it lines up, drawn with a cross. */
  | { type: 'line'; from: Vec2; to: Vec2; style: GuideStyle; midpoint?: Vec2; marks?: Vec2[] }
  /** A whole line lit up, straight or curved, with its midpoint magnet. */
  | { type: 'path'; points: Vec2[]; midpoint?: Vec2; style: GuideStyle }
  | { type: 'highlight'; from: Vec2; to: Vec2 }

export interface ConstraintConfig {
  type: string
  /** Lower rank wins when constraints compete. */
  rank: number
  /** Pixels, or radians for angular constraints. */
  threshold?: number
  /**
   * A direction lock: chosen before the other constraints run, and the point
   * is projected onto its ray so every other rule tests the projected point.
   */
  locksDirection?: boolean
  enabled?: (ctx: SnapContext) => boolean
}

export interface ConstraintHandlers<T> {
  targets: (ctx: SnapContext) => T[]
  test: (target: T, ctx: SnapContext) => TestResult
  constrain: (target: T, ctx: SnapContext) => Vec2 | null
  primitive: (target: T, ctx: SnapContext) => Primitive
  guide?: (snapped: Vec2, target: T, ctx: SnapContext) => Guide | Guide[] | null
  /** True when the constraint says nothing at this point, e.g. a node aligned only with itself. */
  redundantAt?: (target: T, point: Vec2) => boolean
}

export type Constraint<T = unknown> = ConstraintConfig & ConstraintHandlers<T>

/** A constraint of any target type; the solver never inspects targets itself. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyConstraint = Constraint<any>

export function defineConstraint<T>(config: ConstraintConfig, create: (cfg: ConstraintConfig) => ConstraintHandlers<T>): Constraint<T> {
  return { ...config, ...create(config) }
}

export interface ActiveConstraint<T = unknown> {
  constraint: Constraint<T>
  target: T
  distance: number
}

export interface SnapResult {
  point: Vec2
  active: ActiveConstraint[]
  /** Constraint types that produced the point, best rank first. */
  types: string[]
  guides: Guide[]
}
