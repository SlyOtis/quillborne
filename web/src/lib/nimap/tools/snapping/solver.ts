import type { Vec2 } from '../../geometry/vector'
import { distance } from '../../geometry/vector'
import { intersectPrimitives } from './primitives'
import type { ActiveConstraint, AnyConstraint, Guide, Primitive, SnapContext, SnapResult } from './types'

const MAX_INTERSECTION_DISTANCE_PX = 8
/** Candidates this close in distance are a tie and keep their source order, so a coincident face and fixture line do not flicker. */
const TIE_EPS = 1e-6
/** Tolerance, in metres, for a candidate point to count as satisfying a constraint. */
const SATISFIED_EPS = 1e-6

export interface SolverOptions {
  /** Only the nearest active constraints are combined; subsets are exponential in this number. */
  maxActive?: number
}

const passthrough = (point: Vec2): SnapResult => ({ point, active: [], types: [], guides: [] })

const result = (point: Vec2, subset: ActiveConstraint[], ctx: SnapContext): SnapResult => {
  const ordered = [...subset].sort((a, b) => a.constraint.rank - b.constraint.rank)
  return {
    point,
    active: ordered,
    types: ordered.map(ac => ac.constraint.type),
    guides: ordered.flatMap(ac => {
      const g = ac.constraint.guide?.(point, ac.target, ctx)
      return g ? (Array.isArray(g) ? g : [g]) : []
    }) as Guide[]
  }
}

const activeOf = (constraints: AnyConstraint[], ctx: SnapContext): ActiveConstraint[] =>
  constraints
    .flatMap(constraint =>
      constraint.targets(ctx).map(target => {
        const r = constraint.test(target, ctx)
        return { constraint, target, distance: r.distance, active: r.active }
      })
    )
    .filter(ac => ac.active)
    .sort((a, b) => (Math.abs(a.distance - b.distance) < TIE_EPS ? 0 : a.distance - b.distance))

/**
 * Snaps a point to the best combination of active constraints. A direction
 * lock, when one is active, is chosen first by rank and the point is
 * projected onto its ray; the other rules then test that projected point, so
 * sliding along a locked line still catches whatever crosses it. An exact
 * target (a node) wins outright, keeping every other active rule the node
 * already satisfies so their guides still show. Otherwise every subset of the nearest active
 * constraints is scored by rank, then by how many of the best rank it holds,
 * then by size, and the first subset whose primitives intersect near the
 * cursor and satisfy every member wins.
 */
export function resolveSnap(constraints: AnyConstraint[], context: SnapContext, options: SolverOptions = {}): SnapResult {
  if (context.modifiers.ctrl) return passthrough(context.point)
  const maxActive = options.maxActive ?? 8
  const enabled = constraints.filter(c => !c.enabled || c.enabled(context))

  const lock = activeOf(enabled.filter(c => c.locksDirection), context).sort((a, b) => a.constraint.rank - b.constraint.rank || a.distance - b.distance)[0]
  const locked = lock ? lock.constraint.constrain(lock.target, context) : null
  const ctx: SnapContext = locked ? { ...context, point: locked } : context
  const lockActive: ActiveConstraint[] = locked ? [{ ...lock, distance: 0 }] : []

  const active: ActiveConstraint[] = [...lockActive, ...activeOf(enabled.filter(c => !c.locksDirection), ctx).slice(0, maxActive)]

  if (active.length === 0) return passthrough(ctx.point)

  /**
   * The guides describe the snapped position, not the pointer: every rule
   * is judged again at the solved point, and those that hold there exactly
   * are shown, however far the pointer sits inside the snap radius.
   */
  const settle = (point: Vec2, winners: ActiveConstraint[]): SnapResult => {
    const at: SnapContext = { ...ctx, point }
    const key = (ac: ActiveConstraint) => `${ac.constraint.type}:${JSON.stringify(ac.constraint.primitive(ac.target, at))}`
    const seen = new Set(winners.map(key))
    const lines = winners.map(w => w.constraint.primitive(w.target, at))
    const held = activeOf(enabled.filter(c => !c.locksDirection), at).filter(ac => {
      if (seen.has(key(ac)) || !satisfied(ac, point, ctx) || ac.constraint.redundantAt?.(ac.target, point)) return false
      const primitive = ac.constraint.primitive(ac.target, at)
      if (lines.some(l => sameLine(l, primitive))) return false
      seen.add(key(ac))
      lines.push(primitive)
      return true
    })
    return result(point, [...winners, ...held], ctx)
  }

  const exact = active.find(ac => ac.constraint.primitive(ac.target, ctx).type === 'point')
  if (exact) {
    const point = exact.constraint.constrain(exact.target, ctx)
    if (point) return settle(point, [exact, ...lockActive])
  }

  const subsets = generateSubsets(active).sort((a, b) => scoreSubset(a) - scoreSubset(b))
  for (const subset of subsets) {
    const point = solveSubset(subset, ctx)
    if (point && subset.every(ac => satisfied(ac, point, ctx))) return settle(point, subset)
  }
  return passthrough(ctx.point)
}

const lineOf = (p: Primitive): { point: Vec2; direction: Vec2 } | null => {
  if (p.type === 'line') return { point: p.point, direction: p.direction }
  if (p.type === 'ray') return { point: p.origin, direction: p.direction }
  if (p.type === 'segment') return { point: p.start, direction: [p.end[0] - p.start[0], p.end[1] - p.start[1]] }
  return null
}

/** Two straight primitives on one geometric line: a second rule there adds nothing to the picture. */
function sameLine(a: Primitive, b: Primitive): boolean {
  const la = lineOf(a)
  const lb = lineOf(b)
  if (!la || !lb) return false
  const cross = (u: Vec2, v: Vec2) => u[0] * v[1] - u[1] * v[0]
  const norm = (v: Vec2) => Math.hypot(v[0], v[1]) || 1
  const parallel = Math.abs(cross(la.direction, lb.direction)) / (norm(la.direction) * norm(lb.direction)) < 1e-6
  const offset: Vec2 = [lb.point[0] - la.point[0], lb.point[1] - la.point[1]]
  const on = Math.abs(cross(la.direction, offset)) / norm(la.direction) < 1e-6
  return parallel && on
}

function generateSubsets(active: ActiveConstraint[]): ActiveConstraint[][] {
  const subsets: ActiveConstraint[][] = []
  for (let mask = 1; mask < 1 << active.length; mask++) {
    const subset: ActiveConstraint[] = []
    for (let i = 0; i < active.length; i++) if (mask & (1 << i)) subset.push(active[i])
    subsets.push(subset)
  }
  return subsets
}

function scoreSubset(subset: ActiveConstraint[]): number {
  const bestRank = Math.min(...subset.map(ac => ac.constraint.rank))
  const countOfBest = subset.filter(ac => ac.constraint.rank === bestRank).length
  return bestRank * 65536 + (255 - countOfBest) * 256 + (255 - subset.length)
}

function satisfied(ac: ActiveConstraint, point: Vec2, ctx: SnapContext): boolean {
  const constrained = ac.constraint.constrain(ac.target, { ...ctx, point })
  return !!constrained && distance(constrained, point) < SATISFIED_EPS
}

function solveSubset(subset: ActiveConstraint[], ctx: SnapContext): Vec2 | null {
  if (subset.length === 1) return subset[0].constraint.constrain(subset[0].target, ctx)
  const primitives = subset.map(ac => ac.constraint.primitive(ac.target, ctx))
  const point = primitives.find(p => p.type === 'point')
  if (point && point.type === 'point') return point.point
  const maxDistance = MAX_INTERSECTION_DISTANCE_PX / ctx.scale
  for (let i = 0; i < primitives.length; i++) {
    for (let j = i + 1; j < primitives.length; j++) {
      const hit = intersectPrimitives(primitives[i], primitives[j])
      if (hit && distance(ctx.point, hit) < maxDistance) return hit
    }
  }
  return null
}
