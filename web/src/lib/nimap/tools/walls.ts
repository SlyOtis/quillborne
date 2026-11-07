import type { Vec2 } from '../geometry/vector'
import type { LineLayer, Level } from '../model/types'
import type { Command, NodeMove } from './commands'
import { layerOfNode, nodeKey, type EditGraph, type GraphNode } from './graph'
import type { Selection } from './selection'
import { KINDS, selectedOf } from './kinds'

export interface MovingPoint {
  point: Vec2
  layer: LineLayer
}

/** How far a face's corner may lie from the stored node it is: the kernel's grid rounds corners, the document never puts two nodes this close. */
const FACE_NODE_REACH = 1e-4

/**
 * The stored nodes a face's boundary passes through, on its own layer:
 * what moves when the face moves, exactly as if those nodes were selected.
 * A corner where lines only cross is not stored and follows the lines.
 */
export function faceNodes(graph: EditGraph, rings: Vec2[][], layer: LineLayer): GraphNode[] {
  const corners = rings.flat()
  return graph.nodes.filter(n => n.layer === layer && corners.some(c => Math.abs(c[0] - n.point[0]) < FACE_NODE_REACH && Math.abs(c[1] - n.point[1]) < FACE_NODE_REACH))
}

/** Points that move with a selection: its nodes, every point of its lines, and the stored nodes on the boundary of its faces, rooms and fixtures alike. */
export function movingPoints(selection: Selection, graph: EditGraph, level: Level): Map<string, MovingPoint> {
  const points = new Map<string, MovingPoint>()
  const add = (node: GraphNode | undefined) => {
    if (node) points.set(node.id, { point: node.point, layer: node.layer })
  }
  for (const id of selection.nodeIds) add(graph.nodesById.get(id))
  for (const f of level.fixtures) if (selection.fixtureIds.has(f.id)) faceNodes(graph, f.polygon ? [f.polygon.outer, ...f.polygon.holes] : [f.line ?? []], 'fixtures').forEach(add)
  for (const u of level.units) if (selection.unitIds.has(u.id)) faceNodes(graph, [u.polygon.outer, ...u.polygon.holes], 'walls').forEach(add)
  for (const lineId of selection.lineIds) {
    const segment = graph.segments.find(s => s.lineId === lineId)
    const line = graph.linesById.get(lineId)
    if (!segment || !line) continue
    for (const p of line.points) points.set(nodeKey(p, segment.layer), { point: p, layer: segment.layer })
  }
  return points
}

/** One move command per layer that has moving points. */
export function moveCommands(points: Map<string, MovingPoint>, delta: Vec2): Command[] {
  const byLayer = new Map<LineLayer, NodeMove[]>()
  for (const { point, layer } of points.values()) {
    if (!byLayer.has(layer)) byLayer.set(layer, [])
    byLayer.get(layer)!.push({ from: point, to: [point[0] + delta[0], point[1] + delta[1]] })
  }
  return [...byLayer].map(([layer, moves]) => ({ type: 'moveNodes', layer, moves }))
}

export type Matrix = [number, number, number, number, number, number]

export const applyMatrix = (m: Matrix, p: Vec2): Vec2 => [m[0] * p[0] + m[2] * p[1] + m[4], m[1] * p[0] + m[3] * p[1] + m[5]]

/** Scale about a point. */
export const scaleAbout = (origin: Vec2, sx: number, sy: number): Matrix => [sx, 0, 0, sy, origin[0] - origin[0] * sx, origin[1] - origin[1] * sy]

/** Rotate about a point by `angle` radians. */
export const rotateAbout = (origin: Vec2, angle: number): Matrix => {
  const c = Math.cos(angle)
  const s = Math.sin(angle)
  return [c, s, -s, c, origin[0] - c * origin[0] + s * origin[1], origin[1] - s * origin[0] - c * origin[1]]
}

/** One transform command per layer that has moving points. */
export function transformCommands(points: Map<string, MovingPoint>, matrix: Matrix): Command[] {
  const byLayer = new Map<LineLayer, Vec2[]>()
  for (const { point, layer } of points.values()) {
    if (!byLayer.has(layer)) byLayer.set(layer, [])
    byLayer.get(layer)!.push(point)
  }
  return [...byLayer].map(([layer, pts]) => ({ type: 'transformNodes', layer, points: pts, matrix }))
}

/** Commands that remove everything in a selection: nodes take their lines with them, then each kind removes its own. */
export function deleteCommands(selection: Selection, graph: EditGraph, level: Level): Command[] {
  const commands: Command[] = []
  for (const layer of ['walls', 'fixtures'] as const) {
    const points = [...selection.nodeIds].filter(id => layerOfNode(id) === layer).map(id => graph.nodesById.get(id)?.point).filter((p): p is Vec2 => !!p)
    if (points.length) commands.push({ type: 'removeNodes', layer, points })
  }
  const ctx = { level, graph }
  for (const kind of KINDS) commands.push(...kind.remove(selectedOf(kind, selection, graph), ctx))
  return commands
}
