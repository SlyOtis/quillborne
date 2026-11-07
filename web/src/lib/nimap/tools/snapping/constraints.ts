import type { Vec2 } from '../../geometry/vector'
import { distance, projectOntoSegment, midpoint, sub, add, mul, dot } from '../../geometry/vector'
import { defineConstraint, type AnyConstraint, type Guide, type SnapContext, type SnapPoint, type SnapSegment } from './types'

const ZERO: Vec2 = [0, 0]
/** The offsets of every carried point: the pointer's own when it is one, plus the others. */
const carried = (ctx: SnapContext): Vec2[] => (ctx.pointerCarried ? [ZERO, ...ctx.offsets] : ctx.offsets.length ? ctx.offsets : [ZERO])
const coordKey = (v: number) => Math.round(v * 1000)
const px = (threshold: number, ctx: SnapContext) => threshold / ctx.scale
const angleOf = (from: Vec2, to: Vec2) => Math.atan2(to[1] - from[1], to[0] - from[0])
const normalizeTurn = (r: number) => {
  while (r < 0) r += 2 * Math.PI
  while (r >= 2 * Math.PI) r -= 2 * Math.PI
  return r
}
/** Smallest difference between two directions, ignoring orientation (0 and π are equal). */
const axisDifference = (a: number, b: number) => {
  const d = normalizeTurn(b - a) % Math.PI
  return Math.min(d, Math.PI - d)
}
/** Whichever of angle or angle+π points the same way as the cursor from the anchor. */
const facing = (angle: number, anchor: Vec2, point: Vec2) => {
  const d = sub(point, anchor)
  return dot(d, [Math.cos(angle), Math.sin(angle)]) >= 0 ? angle : angle + Math.PI
}
/** Projection of the cursor onto the ray from origin at angle, never behind the origin. */
const alongRay = (origin: Vec2, angle: number, point: Vec2): Vec2 | null => {
  const direction: Vec2 = [Math.cos(angle), Math.sin(angle)]
  const t = dot(sub(point, origin), direction)
  return t <= 0 ? null : add(origin, mul(direction, t))
}
const rayGuide = (origin: Vec2, angle: number, style: 'angle' | 'parallel' | 'perpendicular') => ({
  type: 'line' as const,
  from: origin,
  to: add(origin, mul([Math.cos(angle), Math.sin(angle)], 10000)),
  style
})
/** One ray per carried point through the locked direction, so a body drag shows the lock at every node, not where the hand pressed. */
const rayGuides = (origin: Vec2, angle: number, style: 'angle' | 'parallel' | 'perpendicular', ctx: SnapContext) =>
  carried(ctx).map(offset => rayGuide(add(origin, offset), angle, style))

interface NodeTarget {
  point: Vec2
  guides: { node: SnapPoint; offset: Vec2 }[]
}

export const nodeConstraint = defineConstraint<NodeTarget>({ type: 'node', rank: 1, threshold: 8 }, cfg => ({
  targets: ctx => {
    const offsets = carried(ctx)
    const targets = new Map<string, NodeTarget>()
    for (const node of ctx.nodes) {
      for (const offset of offsets) {
        const point = sub(node.point, offset)
        const key = `${coordKey(point[0])}:${coordKey(point[1])}`
        const existing = targets.get(key)
        if (existing) existing.guides.push({ node, offset })
        else targets.set(key, { point, guides: [{ node, offset }] })
      }
    }
    return [...targets.values()]
  },
  test: (target, ctx) => {
    const d = distance(ctx.point, target.point)
    return { active: d < px(cfg.threshold!, ctx), distance: d }
  },
  constrain: target => target.point,
  primitive: target => ({ type: 'point', point: target.point }),
  guide: (snapped, target) => target.guides.map(g => ({ type: 'highlight' as const, from: g.node.point, to: add(snapped, g.offset) }))
}))

interface SegmentTarget {
  segment: SnapSegment
  offset: Vec2
}

/** The nearest point on a segment: on the true curve for a chord of one, else clamped to an open chord joint, else null when the foot falls past a real node. */
function onSegment(p: Vec2, s: SnapSegment): Vec2 | null {
  if (s.line?.project) return s.line.project(p)
  const { point, t } = projectOntoSegment(p, s.a, s.b)
  if (t <= 0) return s.aOpen ? s.a : null
  if (t >= 1) return s.bOpen ? s.b : null
  return point
}

export const segmentConstraint = defineConstraint<SegmentTarget>({ type: 'segment', rank: 2, threshold: 8 }, cfg => ({
  targets: ctx => {
    const curves = new Set<object>()
    const one = ctx.segments.filter(s => {
      if (!s.line?.project) return true
      if (curves.has(s.line)) return false
      curves.add(s.line)
      return true
    })
    return one.flatMap(segment => carried(ctx).map(offset => ({ segment, offset })))
  },
  test: (target, ctx) => {
    const threshold = px(cfg.threshold!, ctx)
    const p = add(ctx.point, target.offset)
    const { a, b, aOpen, bOpen, line } = target.segment
    const ends = line?.project ? (line.closed ? [] : [line.points[0], line.points[line.points.length - 1]]) : [...(aOpen ? [] : [a]), ...(bOpen ? [] : [b])]
    if (ends.some(e => distance(p, e) < threshold)) return { active: false, distance: Infinity }
    const point = onSegment(p, target.segment)
    if (!point) return { active: false, distance: Infinity }
    const d = distance(p, point)
    return { active: d < threshold, distance: d }
  },
  constrain: (target, ctx) => {
    const p = add(ctx.point, target.offset)
    const { a, b } = target.segment
    return sub(onSegment(p, target.segment) ?? projectOntoSegment(p, a, b).point, target.offset)
  },
  primitive: target => ({ type: 'segment', start: target.segment.a, end: target.segment.b }),
  guide: (_snapped, target) => {
    const { a, b, line } = target.segment
    if (line) return { type: 'path', points: line.points, midpoint: line.midpoint, style: 'edge' }
    return { type: 'line', from: a, to: b, midpoint: midpoint(a, b), style: 'edge' }
  }
}))

interface MidpointTarget {
  point: Vec2
  segment: SnapSegment
  offset: Vec2
}

/**
 * The midpoint of every line as a point target of its own, one per line
 * (halfway along a curve's arc) or per whole outline edge, so any carried
 * point within reach snaps to it exactly, the way nodes do. A magnet inside
 * the segment rule would only reach the one carried point that rule keeps.
 */
export const midpointConstraint = defineConstraint<MidpointTarget>({ type: 'midpoint', rank: 2, threshold: 8 }, cfg => ({
  targets: ctx => {
    const seen = new Set<object | string>()
    const mids: { point: Vec2; segment: SnapSegment }[] = []
    for (const segment of ctx.segments) {
      if (segment.line) {
        if (seen.has(segment.line)) continue
        seen.add(segment.line)
        if (segment.line.midpoint) mids.push({ point: segment.line.midpoint, segment })
      } else if (!segment.aOpen && !segment.bOpen) {
        mids.push({ point: midpoint(segment.a, segment.b), segment })
      }
    }
    return mids.flatMap(m => carried(ctx).map(offset => ({ point: sub(m.point, offset), segment: m.segment, offset })))
  },
  test: (target, ctx) => {
    const d = distance(ctx.point, target.point)
    return { active: d < px(cfg.threshold!, ctx), distance: d }
  },
  constrain: target => target.point,
  primitive: target => ({ type: 'point', point: target.point }),
  guide: (_snapped, target) => {
    const { a, b, line } = target.segment
    if (line) return { type: 'path', points: line.points, midpoint: line.midpoint, style: 'edge' }
    return { type: 'line', from: a, to: b, midpoint: midpoint(a, b), style: 'edge' }
  }
}))

interface AlignmentTarget {
  axis: 0 | 1
  coordinate: number
  guides: { coordinate: number; nodes: SnapPoint[]; offset: Vec2 }[]
}

export const alignmentConstraint = defineConstraint<AlignmentTarget>({ type: 'alignment', rank: 4, threshold: 5 }, cfg => ({
  targets: ctx => {
    const targets = new Map<string, AlignmentTarget>()
    for (const axis of [0, 1] as const) {
      const groups = new Map<number, SnapPoint[]>()
      for (const n of ctx.nodes) {
        const key = coordKey(n.point[axis])
        if (!groups.has(key)) groups.set(key, [])
        groups.get(key)!.push(n)
      }
      for (const group of groups.values()) {
        const coordinate = group[0].point[axis]
        for (const offset of carried(ctx)) {
          const adjusted = coordinate - offset[axis]
          const key = `${axis}:${coordKey(adjusted)}`
          const guide = { coordinate, nodes: group, offset }
          const existing = targets.get(key)
          if (existing) existing.guides.push(guide)
          else targets.set(key, { axis, coordinate: adjusted, guides: [guide] })
        }
      }
    }
    return [...targets.values()]
  },
  test: (target, ctx) => {
    const d = Math.abs(ctx.point[target.axis] - target.coordinate)
    return { active: d < px(cfg.threshold!, ctx), distance: d }
  },
  constrain: (target, ctx) => (target.axis === 0 ? [target.coordinate, ctx.point[1]] : [ctx.point[0], target.coordinate]),
  primitive: target => (target.axis === 0 ? { type: 'line', point: [target.coordinate, 0], direction: [0, 1] } : { type: 'line', point: [0, target.coordinate], direction: [1, 0] }),
  redundantAt: (target, point) => target.guides.every(g => g.nodes.every(n => distance(add(point, g.offset), n.point) < 1e-9)),
  // One line through every point lined up, with a cross in each existing
  // one. When the pen's start is among them, the line also carries the ray
  // from the start through the hand: the direction being drawn. The start
  // is the line's origin and a point under the hand is where the hand is,
  // not points lined up with it, so neither gets a cross.
  guide: (snapped, target, ctx) =>
    target.guides.flatMap(g => {
      const other = target.axis === 0 ? 1 : 0
      const hand = snapped[other] + g.offset[other]
      const values = [...g.nodes.map(n => n.point[other]), hand]
      const lo = Math.min(...values)
      const hi = Math.max(...values)
      const at = (v: number): Vec2 => (target.axis === 0 ? [g.coordinate, v] : [v, g.coordinate])
      const isStart = (n: SnapPoint) => !!ctx.anchor && distance(n.point, ctx.anchor) < 1e-9
      const atHand = (n: SnapPoint) => distance(n.point, add(snapped, g.offset)) < 1e-9
      const line: Guide = { type: 'line', from: at(lo), to: at(hi), style: 'alignment', marks: g.nodes.filter(n => !isStart(n) && !atHand(n)).map(n => n.point) }
      const start = ctx.anchor && g.nodes.some(isStart) ? ctx.anchor : null
      if (!start || Math.abs(hand - start[other]) < 1e-9) return [line]
      const angle = target.axis === 0 ? (hand > start[1] ? Math.PI / 2 : -Math.PI / 2) : hand > start[0] ? 0 : Math.PI
      return [line, rayGuide(start, angle, 'angle')]
    })
}))

const HARD_INCREMENT = (15 * Math.PI) / 180
const snapAngle = (origin: Vec2, point: Vec2) => Math.round(angleOf(origin, point) / HARD_INCREMENT) * HARD_INCREMENT

/** With Shift held, the direction locks to 15 degree steps unless a wall's direction is closer. */
export const hardAngleConstraint = defineConstraint<Vec2>(
  { type: 'hard-angle', rank: 1, locksDirection: true, enabled: ctx => ctx.modifiers.shift && !!ctx.anchor },
  () => ({
    targets: ctx => (ctx.anchor ? [ctx.anchor] : []),
    test: (origin, ctx) => {
      const diff = Math.abs(angleOf(origin, ctx.point) - snapAngle(origin, ctx.point))
      return { active: diff <= HARD_INCREMENT / 2, distance: diff }
    },
    constrain: (origin, ctx) => alongRay(origin, snapAngle(origin, ctx.point), ctx.point),
    primitive: (origin, ctx) => {
      const a = snapAngle(origin, ctx.point)
      return { type: 'ray', origin, direction: [Math.cos(a), Math.sin(a)] }
    },
    guide: (_snapped, origin, ctx) => rayGuides(origin, snapAngle(origin, ctx.point), 'angle', ctx)
  })
)

interface DirectionTarget {
  segment: SnapSegment
  /** Direction mod π. */
  axisAngle: number
}

/** Under Shift, the direction of a straight line, or square to it. A curve has no direction of its own, only one per chord, and would offer every direction there is. */
function directionConstraint(type: 'parallel' | 'perpendicular', turn: number) {
  return defineConstraint<DirectionTarget>(
    { type, rank: 0, threshold: (5 * Math.PI) / 180, locksDirection: true, enabled: ctx => ctx.modifiers.shift && !!ctx.anchor },
    cfg => ({
      targets: ctx => {
        const unique = new Map<number, DirectionTarget>()
        for (const segment of ctx.segments) {
          if (segment.line?.project) continue
          const axisAngle = normalizeTurn(angleOf(segment.a, segment.b) + turn) % Math.PI
          const key = Math.round(axisAngle * 1000) % Math.round(Math.PI * 1000)
          if (!unique.has(key)) unique.set(key, { segment, axisAngle })
        }
        return [...unique.values()]
      },
      test: (target, ctx) => {
        const diff = axisDifference(angleOf(ctx.anchor!, ctx.point), target.axisAngle)
        return { active: diff < cfg.threshold!, distance: diff }
      },
      constrain: (target, ctx) => alongRay(ctx.anchor!, facing(target.axisAngle, ctx.anchor!, ctx.point), ctx.point),
      primitive: (target, ctx) => {
        const a = facing(target.axisAngle, ctx.anchor!, ctx.point)
        return { type: 'ray', origin: ctx.anchor!, direction: [Math.cos(a), Math.sin(a)] }
      },
      guide: (_snapped, target, ctx) => rayGuides(ctx.anchor!, facing(target.axisAngle, ctx.anchor!, ctx.point), type, ctx)
    })
  )
}

export const parallelConstraint = directionConstraint('parallel', 0)
export const perpendicularConstraint = directionConstraint('perpendicular', Math.PI / 2)

export const DRAWING_CONSTRAINTS: AnyConstraint[] = [nodeConstraint, midpointConstraint, segmentConstraint, alignmentConstraint, hardAngleConstraint, parallelConstraint, perpendicularConstraint]
export const MOVING_CONSTRAINTS: AnyConstraint[] = [hardAngleConstraint, nodeConstraint, midpointConstraint, segmentConstraint, alignmentConstraint]
