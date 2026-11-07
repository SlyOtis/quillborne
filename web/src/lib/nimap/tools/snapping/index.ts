import type { Vec2 } from '../../geometry/vector'
import { add, cross, distance, distanceToSegment, dot, mul, normalize, projectOntoSegment, sub } from '../../geometry/vector'
import { MIN_FEATURE } from '../../model/precision'
import { nodeKey, type EditGraph } from '../graph'
import type { LineLayer } from '../../model/types'
import type { BoundaryEdge } from '../../geometry/walls'
import { lineChords, lineMiddle, projectOntoLine } from '../../model/lines'
import type { AnyConstraint, Modifiers, SnapContext, SnapPoint, SnapResult, SnapSegment, SnapTargets } from './types'
import { NO_MODIFIERS } from './types'
import { resolveSnap, type SolverOptions } from './solver'

export * from './types'
export * from './constraints'
export { resolveSnap } from './solver'
export type { SolverOptions } from './solver'
export { intersectPrimitives, projectOntoPrimitive } from './primitives'

export interface SnapRequest {
  anchor?: Vec2 | null
  offsets?: Vec2[]
  /** Default true. A body drag passes false so only the offsets are carried. */
  pointerCarried?: boolean
  modifiers?: Modifiers
}

export type Snapper = (point: Vec2, request?: SnapRequest) => SnapResult

export interface Viewport {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

/** One layer of the edit graph's nodes and segments plus derived points, as one target set. */
export function snapTargets(graph: EditGraph, derived: Vec2[] = [], layer: LineLayer = 'walls'): SnapTargets {
  const extra: SnapPoint[] = derived.map(p => ({ id: nodeKey(p, layer), point: p })).filter(p => !graph.nodesById.has(p.id))
  const lines = new Map<string, { points: Vec2[]; midpoint: Vec2 }>()
  const lineOf = (id: string) => {
    let l = lines.get(id)
    if (!l) {
      const line = graph.linesById.get(id)!
      const points = lineChords(line)
      l = { points, midpoint: lineMiddle(line), ...(line.curve ? { project: (p: Vec2) => projectOntoLine(line, p).point } : {}) }
      lines.set(id, l)
    }
    return l
  }
  const segments: SnapSegment[] = graph.segments
    .filter(s => s.layer === layer)
    .map(s => ({ ...s, aOpen: !graph.nodesById.has(s.aNode), bOpen: !graph.nodesById.has(s.bNode), line: lineOf(s.lineId) }))
  return { nodes: [...graph.nodes.filter(n => n.layer === layer), ...extra], segments }
}

export const NO_TARGETS: SnapTargets = { nodes: [], segments: [] }

/**
 * The outer faces of the wall solids as targets: what furniture sits
 * against. A face is a side of the walls as it looks, running from one
 * corner of the outline to the next, however many walls, chords and
 * rounding steps it is built from: one line, straight or curved, with one
 * guide and snapping along it as a whole. A corner is where the outline
 * turns by `minTurn` or more, measured a feature either side, so no edge
 * shorter than the smallest feature the document keeps can make one; its
 * corners are the only points a face offers. It has no midpoint magnet: a
 * corner of a fixture on the middle of a side centres nothing. A ring with
 * no corner, as a round room's, is one closed face with no ends.
 */
export function faceTargets(boundary: BoundaryEdge[], minTurn = FACE_CORNER_TURN): SnapTargets {
  const nodes: SnapPoint[] = []
  const segments: SnapSegment[] = []
  const rings: BoundaryEdge[][] = []
  let ring: BoundaryEdge[] = []
  for (const e of boundary) {
    ring.push(e)
    if (distance(e.b, ring[0].a) < 1e-12) {
      rings.push(ring)
      ring = []
    }
  }
  if (ring.length) rings.push(ring)
  for (const edges of rings) {
    const n = edges.length
    const at = [0]
    for (const e of edges) at.push(at[at.length - 1] + distance(e.a, e.b))
    const total = at[n]
    const reach = Math.min(MIN_FEATURE, total / 4)
    const pointAt = (s: number): Vec2 => {
      const x = ((s % total) + total) % total
      let i = 0
      while (i < n - 1 && at[i + 1] < x) i++
      const e = edges[i]
      const l = at[i + 1] - at[i]
      return l ? add(e.a, mul(sub(e.b, e.a), (x - at[i]) / l)) : e.a
    }
    const turns = edges.map((e, i) => {
      const [before, after] = [sub(e.a, pointAt(at[i] - reach)), sub(pointAt(at[i] + reach), e.a)]
      return Math.abs(Math.atan2(cross(before, after), dot(before, after)))
    })
    const corners: number[] = []
    for (let i = 0; i < n; i++) {
      if (turns[i] < minTurn) continue
      const last = corners[corners.length - 1]
      if (last !== undefined && at[i] - at[last] <= reach) {
        if (turns[i] > turns[last]) corners[corners.length - 1] = i
      } else corners.push(i)
    }
    if (corners.length > 1 && total - at[corners[corners.length - 1]] + at[corners[0]] <= reach) {
      if (turns[corners[corners.length - 1]] > turns[corners[0]]) corners[0] = corners[corners.length - 1]
      corners.pop()
    }
    const isCorner = new Set(corners)
    for (const i of corners) nodes.push({ id: `face/${nodeKey(edges[i].a)}`, point: edges[i].a })
    const faces: { from: number; count: number }[] = corners.length
      ? corners.map((c, k) => ({ from: c, count: ((corners[(k + 1) % corners.length] - c + n - 1) % n) + 1 }))
      : [{ from: 0, count: n }]
    for (const { from, count } of faces) {
      const run = Array.from({ length: count }, (_, j) => edges[(from + j) % n])
      const points = [run[0].a, ...run.map(e => e.b)]
      const closed = !corners.length
      const straight = points.every(p => Math.abs(cross(normalize(sub(points[points.length - 1], points[0])), sub(p, points[0]))) <= ON_FACE)
      const face = { points, ...(closed ? { closed } : {}), ...(straight && !closed ? {} : { project: (p: Vec2) => nearestOn(points, p) }) }
      run.forEach((e, j) => {
        const i = (from + j) % n
        segments.push({ id: `face/e${segments.length}`, a: e.a, b: e.b, aNode: `face/${nodeKey(e.a)}`, bNode: `face/${nodeKey(e.b)}`, aOpen: !isCorner.has(i), bOpen: !isCorner.has((i + 1) % n), line: face })
      })
    }
  }
  return { nodes, segments }
}

/** How far off a straight line the points of a straight face may lie: the kernel settles the outline on its grid. */
const ON_FACE = 1e-4

/** The point of a polyline nearest `p`. */
function nearestOn(points: Vec2[], p: Vec2): Vec2 {
  let best = { d: Infinity, point: points[0] }
  for (let i = 1; i < points.length; i++) {
    const { point } = projectOntoSegment(p, points[i - 1], points[i])
    const d = distance(p, point)
    if (d < best.d) best = { d, point }
  }
  return best.point
}

/** An outline vertex turning at least this much is a corner; chord joints of a curve within tolerance turn far less. */
export const FACE_CORNER_TURN = (15 * Math.PI) / 180

export const levelFaceTargets = (_walls: unknown, boundary: BoundaryEdge[]): SnapTargets => faceTargets(boundary)

/** The named target sets an editor offers; a tool declares which it snaps to. */
export type SnapSourceId = 'document' | 'junctions' | 'faces' | 'fixtures'
export type SnapSources = Record<SnapSourceId, SnapTargets>

export function mergeTargets(...sets: SnapTargets[]): SnapTargets {
  return { nodes: sets.flatMap(s => s.nodes), segments: sets.flatMap(s => s.segments) }
}

/** Wider than the kernel grid, since derived points sit up to a grid step off the exact line. */
const ON_SEGMENT_EPS = 1e-4
const strictlyOn = (p: Vec2, s: SnapSegment): boolean => distanceToSegment(p, s.a, s.b) < ON_SEGMENT_EPS && distance(p, s.a) >= ON_SEGMENT_EPS && distance(p, s.b) >= ON_SEGMENT_EPS

/**
 * The targets without the given nodes, the segments they end or lie on, and
 * any derived point on those segments. A drag builds this once, before
 * anything moves, and snaps against it for the whole gesture.
 */
export function withoutNodes(targets: SnapTargets, nodeIds: Set<string>): SnapTargets {
  const removed = targets.nodes.filter(n => nodeIds.has(n.id))
  const segments = targets.segments.filter(s => !nodeIds.has(s.aNode) && !nodeIds.has(s.bNode) && !removed.some(n => strictlyOn(n.point, s)))
  const kept = new Set(segments)
  const gone = targets.segments.filter(s => !kept.has(s))
  const nodes = targets.nodes.filter(n => !nodeIds.has(n.id) && !gone.some(s => strictlyOn(n.point, s)))
  return { nodes, segments }
}

/** Whether any stretch of the segment lies in the box, however far off its ends are: the segment clipped to the box's four sides, parameter by parameter. */
function crossesBox(a: Vec2, b: Vec2, box: Viewport): boolean {
  let t0 = 0
  let t1 = 1
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  for (const [p, q] of [[-dx, a[0] - box.minX], [dx, box.maxX - a[0]], [-dy, a[1] - box.minY], [dy, box.maxY - a[1]]] as const) {
    if (p === 0) {
      if (q < 0) return false
      continue
    }
    const r = q / p
    if (p < 0) t0 = Math.max(t0, r)
    else t1 = Math.min(t1, r)
    if (t0 > t1) return false
  }
  return true
}

/**
 * Builds a snapper over a target set. Candidates are culled to the viewport
 * plus a margin so zooming out never explodes the constraint count.
 */
export function createSnapper(targets: SnapTargets, constraints: AnyConstraint[], scale: number, viewport?: Viewport, options?: SolverOptions): Snapper {
  let nodes = targets.nodes
  let segments = targets.segments
  if (viewport) {
    const margin = Math.max(viewport.maxX - viewport.minX, viewport.maxY - viewport.minY) * 0.2
    const inside = (p: Vec2) => p[0] >= viewport.minX - margin && p[0] <= viewport.maxX + margin && p[1] >= viewport.minY - margin && p[1] <= viewport.maxY + margin
    const box = { minX: viewport.minX - margin, minY: viewport.minY - margin, maxX: viewport.maxX + margin, maxY: viewport.maxY + margin }
    nodes = nodes.filter(n => inside(n.point))
    segments = segments.filter(s => crossesBox(s.a, s.b, box))
  }
  return (point, request = {}) => {
    const context: SnapContext = {
      point,
      nodes,
      segments,
      anchor: request.anchor ?? null,
      offsets: request.offsets ?? [],
      pointerCarried: request.pointerCarried ?? true,
      scale,
      modifiers: request.modifiers ?? NO_MODIFIERS
    }
    return resolveSnap(constraints, context, options)
  }
}
