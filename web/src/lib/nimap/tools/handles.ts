import type { Vec2 } from '../geometry/vector'
import { add, distance, distanceToSegment, mul, normalize, sub } from '../geometry/vector'
import type { LineLayer } from '../model/types'
import { quantize, samePoint } from '../model/precision'
import type { Line } from '../model/types'
import type { EditGraph, GraphNode } from './graph'
import { layerOfNode } from './graph'
import { projectOntoLine } from '../model/lines'
import type { Selection } from './selection'

export type CurveChange = { lineId: string; curve: [Vec2, Vec2] | null }

/** One Bézier handle: the control point at end `index` of a curved line. */
export interface CurveHandle {
  layer: LineLayer
  lineId: string
  index: 0 | 1
  /** The node the handle belongs to. */
  anchor: Vec2
  point: Vec2
}

/** The handles a selection exposes: those of every selected curved line, and of every curved line at a selected node. */
export function curveHandles(selection: Selection, graph: EditGraph): CurveHandle[] {
  const lineIds = new Set(selection.lineIds)
  for (const id of selection.nodeIds) for (const r of graph.nodesById.get(id)?.refs ?? []) lineIds.add(r.lineId)
  const out: CurveHandle[] = []
  for (const id of lineIds) {
    const line = graph.linesById.get(id)
    const layer = graph.segments.find(s => s.lineId === id)?.layer
    if (!line?.curve || !layer) continue
    out.push({ layer, lineId: id, index: 0, anchor: line.points[0], point: line.curve[0] })
    out.push({ layer, lineId: id, index: 1, anchor: line.points[1], point: line.curve[1] })
  }
  return out
}

const SMOOTH_EPS = Math.cos((2 * Math.PI) / 180)

/** Whether two handles leaving one node point opposite ways: a smooth joint, kept smooth while one is dragged. */
export const isSmoothJoint = (a: CurveHandle, b: CurveHandle): boolean => {
  const u = sub(a.point, a.anchor)
  const v = sub(b.point, b.anchor)
  const lu = distance(a.point, a.anchor)
  const lv = distance(b.point, b.anchor)
  if (!lu || !lv) return false
  return (u[0] * v[0] + u[1] * v[1]) / (lu * lv) < -SMOOTH_EPS
}

/**
 * The handle across a smooth joint from this one, decided once when a drag
 * starts and held for the whole drag, as Figma holds a point's type. Null at
 * a corner, an end, or a junction of more than two lines.
 */
export function mirrorOf(handle: CurveHandle, graph: EditGraph): CurveHandle | null {
  const at = graph.nodes.find(n => layerOfNode(n.id) === handle.layer && samePoint(n.point, handle.anchor))
  if (!at || at.refs.length !== 2) return null
  const other = at.refs.find(r => r.lineId !== handle.lineId)
  if (!other) return null
  const line = graph.linesById.get(other.lineId)
  if (!line?.curve) return null
  const index = other.index as 0 | 1
  const neighbour: CurveHandle = { layer: handle.layer, lineId: line.id, index, anchor: line.points[index], point: line.curve[index] }
  return isSmoothJoint(handle, neighbour) ? neighbour : null
}

/**
 * The lines to change when one handle moves to `to`: its own line, and the
 * mirror, when one was decided, whose handle takes the opposite angle and
 * either keeps its own length or, when the two were equal, follows.
 */
/** Handles that leave a line straight: a third of the way in from each end. */
export const straightHandles = (line: Line): [Vec2, Vec2] => {
  const [a, b] = line.points
  const d = sub(b, a)
  return [quantize(add(a, mul(d, 1 / 3))), quantize(add(b, mul(d, -1 / 3)))]
}

const curveOf = (line: Line): [Vec2, Vec2] => line.curve ?? straightHandles(line)

/**
 * Bowing a line by dragging its body: the point at parameter t follows the
 * cursor while both handles shift by the same amount, so the ends keep
 * their direction and the line bends between them.
 */
export function bowChange(line: Line, t: number, delta: Vec2): CurveChange {
  const weight = Math.max(3 * t * (1 - t), 0.05)
  const k = mul(delta, 1 / weight)
  const [c1, c2] = curveOf(line)
  return { lineId: line.id, curve: [quantize(add(c1, k)), quantize(add(c2, k))] }
}

/** The parameter along a line nearest a point. */
export const paramAt = (line: Line, p: Vec2): number => projectOntoLine(line, p).t

/** A curve whose handles both lie on the straight line between its ends draws straight, so it is stored straight. */
const isStraight = (line: Line, curve: [Vec2, Vec2]): boolean => curve.every(c => distanceToSegment(c, line.points[0], line.points[1]) < 1e-6)

/** Removes one handle; a line left straight by that is straight again. */
export function withoutHandle(line: Line, index: 0 | 1): CurveChange {
  if (!line.curve) return { lineId: line.id, curve: null }
  const curve = [...line.curve] as [Vec2, Vec2]
  curve[index] = line.points[index]
  return { lineId: line.id, curve: isStraight(line, curve) ? null : curve }
}

/**
 * Toggles a node between corner and smooth. A corner between two lines
 * gets two opposite handles along the average direction; a node that has
 * handles loses them. Junctions of more than two lines are left alone.
 */
export function toggleSmooth(node: GraphNode, graph: EditGraph): CurveChange[] {
  if (node.refs.length !== 2) return []
  const sides = node.refs.map(r => ({ line: graph.linesById.get(r.lineId)!, index: r.index as 0 | 1 }))
  const has = sides.some(s => s.line.curve && !samePoint(s.line.curve[s.index], node.point))
  if (has) return sides.map(s => withoutHandle(s.line, s.index))
  const far = (s: (typeof sides)[number]) => s.line.points[1 - s.index]
  const dirs = sides.map(s => normalize(sub(far(s), node.point)))
  const tangent = normalize(sub(dirs[0], dirs[1]))
  if (!Number.isFinite(tangent[0])) return []
  return sides.map((s, i) => {
    const curve = [...curveOf(s.line)] as [Vec2, Vec2]
    const length = distance(far(s), node.point) / 3
    curve[s.index] = quantize(add(node.point, mul(tangent, (i === 0 ? 1 : -1) * length)))
    return { lineId: s.line.id, curve }
  })
}

const SNAP_LOCK = Math.cos((6 * Math.PI) / 180)

/** Handles whose lengths differ by less than this are the same length: mirrored together, as Figma's "mirror angle and length". */
export const sameLength = (a: CurveHandle, b: CurveHandle, tolerance = 1e-3): boolean => Math.abs(distance(a.point, a.anchor) - distance(b.point, b.anchor)) < tolerance

/**
 * A dragged handle within a few degrees of opposite its neighbour snaps
 * exactly opposite, and within `lengthTolerance` of its length snaps to the
 * same length; from then on it is locked that way.
 */
export function snappedOpposite(handle: CurveHandle, to: Vec2, graph: EditGraph, lengthTolerance = 0): Vec2 {
  const at = graph.nodes.find(n => layerOfNode(n.id) === handle.layer && samePoint(n.point, handle.anchor))
  if (!at || at.refs.length !== 2) return to
  const other = at.refs.find(r => r.lineId !== handle.lineId)
  const line = other && graph.linesById.get(other.lineId)
  if (!other || !line?.curve) return to
  const n = sub(line.curve[other.index], handle.anchor)
  const v = sub(to, handle.anchor)
  const ln = Math.hypot(n[0], n[1])
  const lv = Math.hypot(v[0], v[1])
  if (!ln || !lv) return to
  if ((n[0] * v[0] + n[1] * v[1]) / (ln * lv) > -SNAP_LOCK) return to
  const length = Math.abs(lv - ln) < lengthTolerance ? ln : lv
  return add(handle.anchor, mul(normalize(n), -length))
}

export function handleMoves(handle: CurveHandle, to: Vec2, graph: EditGraph, mirror: CurveHandle | null, mirrorLength = false): { lineId: string; curve: [Vec2, Vec2] }[] {
  const own = graph.linesById.get(handle.lineId)!
  const curve = [...own.curve!] as [Vec2, Vec2]
  curve[handle.index] = quantize(to)
  const moves = [{ lineId: handle.lineId, curve }]
  if (!mirror) return moves
  const line = graph.linesById.get(mirror.lineId)
  if (!line?.curve) return moves
  const direction = normalize(sub(to, handle.anchor))
  const length = mirrorLength ? distance(to, handle.anchor) : distance(mirror.point, mirror.anchor)
  const mirrored = [...line.curve] as [Vec2, Vec2]
  mirrored[mirror.index] = quantize(add(handle.anchor, mul(direction, -length)))
  moves.push({ lineId: line.id, curve: mirrored })
  return moves
}
