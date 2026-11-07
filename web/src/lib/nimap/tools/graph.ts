import type { Vec2 } from '../geometry/vector'
import { distance, projectOntoSegment } from '../geometry/vector'
import { arrangement } from '../geometry/arrangement'
import { wallSegments } from '../geometry/walls'
import type { Line, LineLayer, Wall } from '../model/types'
import { WALL_SEGMENT_MIN } from '../model/document'
import { lineChords } from '../model/lines'

/** Points closer than this are the same node. */
export const NODE_EPS = 1e-6

/** A node id: the layer and the position. Two layers never share a node. */
export const nodeKey = (p: Vec2, layer: LineLayer = 'walls'): string => `${layer === 'walls' ? 'w' : 'f'}:${Math.round(p[0] / NODE_EPS)},${Math.round(p[1] / NODE_EPS)}`

export const layerOfNode = (id: string): LineLayer => (id.startsWith('f:') ? 'fixtures' : 'walls')

export interface NodeRef {
  lineId: string
  index: number
}

export interface GraphNode {
  id: string
  layer: LineLayer
  point: Vec2
  /** The line points located at this node; never empty. */
  refs: NodeRef[]
}

export interface GraphSegment {
  id: string
  layer: LineLayer
  lineId: string
  index: number
  a: Vec2
  b: Vec2
  aNode: string
  bNode: string
}

export interface EditGraph {
  nodes: GraphNode[]
  nodesById: Map<string, GraphNode>
  segments: GraphSegment[]
  linesById: Map<string, Line>
}

/**
 * The editing view of a level's lines, holding only what the document holds:
 * coincident line points collapse into nodes within a layer and every line
 * is a segment, or a run of chords when curved. Derived points such as crossings live in `junctionPoints`,
 * not here. Walls and fixture lines are separate graphs in one structure.
 */
export function buildEditGraph(walls: Wall[], fixtureLines: Line[] = []): EditGraph {
  const nodesById = new Map<string, GraphNode>()
  const segments: GraphSegment[] = []
  const linesById = new Map<string, Line>()
  const add = (lines: Line[], layer: LineLayer) => {
    const node = (p: Vec2, ref: NodeRef): GraphNode => {
      const id = nodeKey(p, layer)
      let n = nodesById.get(id)
      if (!n) {
        n = { id, layer, point: [p[0], p[1]], refs: [] }
        nodesById.set(id, n)
      }
      n.refs.push(ref)
      return n
    }
    for (const line of lines) {
      linesById.set(line.id, line)
      line.points.forEach((p, index) => node(p, { lineId: line.id, index }))
      const chords = lineChords(line)
      for (let i = 1; i < chords.length; i++) {
        segments.push({
          id: `${line.id}:${i - 1}`,
          layer,
          lineId: line.id,
          index: i - 1,
          a: chords[i - 1],
          b: chords[i],
          aNode: nodeKey(chords[i - 1], layer),
          bNode: nodeKey(chords[i], layer)
        })
      }
    }
  }
  add(walls, 'walls')
  add(fixtureLines, 'fixtures')
  return { nodes: [...nodesById.values()], nodesById, segments, linesById }
}

/**
 * Crossing points the kernel finds that no line point occupies. They are snap
 * targets and nothing else: never drawn as nodes, never selectable. A
 * crossing closer to a line point than a line can be long is not offered,
 * since snapping to it could only create a line shorter than that. A joint
 * between two chords of one curve is not a junction: only one line is there.
 */
export function junctionPoints(lines: Line[]): Vec2[] {
  const cell = WALL_SEGMENT_MIN
  const cellKey = (x: number, y: number) => `${x},${y}`
  const occupied = new Set(lines.flatMap(w => w.points.map(p => cellKey(Math.round(p[0] / cell), Math.round(p[1] / cell)))))
  const nearNode = (p: Vec2): boolean => {
    const cx = Math.round(p[0] / cell)
    const cy = Math.round(p[1] / cell)
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) if (occupied.has(cellKey(cx + dx, cy + dy))) return true
    return false
  }
  try {
    const g = arrangement(wallSegments(lines))
    const ownersAt = (v: { out: number[] }) => new Set(v.out.flatMap(h => g.edges[g.halfEdges[h].edge].owners))
    return g.vertices
      .filter(v => v.out.length >= 2 && !nearNode(v.p) && ownersAt(v).size > 1)
      .map(v => [v.p[0], v.p[1]] as Vec2)
  } catch {
    return []
  }
}

/** Every line reachable from one through shared nodes: the connected shape it belongs to, on its own layer. */
export function connectedLines(graph: EditGraph, lineId: string): string[] {
  const layer = graph.segments.find(s => s.lineId === lineId)?.layer ?? 'walls'
  const shape = new Set<string>([lineId])
  const queue = [lineId]
  while (queue.length) {
    const line = graph.linesById.get(queue.pop()!)
    if (!line) continue
    for (const p of line.points) {
      for (const r of graph.nodesById.get(nodeKey(p, layer))?.refs ?? []) {
        if (shape.has(r.lineId)) continue
        shape.add(r.lineId)
        queue.push(r.lineId)
      }
    }
  }
  return [...shape]
}

const inLayer = (layer: LineLayer | undefined, item: { layer: LineLayer }) => !layer || item.layer === layer

export function nearestNode(graph: EditGraph, p: Vec2, radius: number, exclude?: Set<string>, layer?: LineLayer): GraphNode | null {
  let best: GraphNode | null = null
  let bestDistance = radius
  for (const n of graph.nodes) {
    if (exclude?.has(n.id) || !inLayer(layer, n)) continue
    const d = distance(p, n.point)
    if (d < bestDistance) {
      bestDistance = d
      best = n
    }
  }
  return best
}

export interface SegmentHit {
  segment: GraphSegment
  point: Vec2
  t: number
  distance: number
}

export function nearestSegment(graph: EditGraph, p: Vec2, radius: number, excludeLineIds?: Set<string>, layer?: LineLayer): SegmentHit | null {
  let best: SegmentHit | null = null
  for (const s of graph.segments) {
    if (excludeLineIds?.has(s.lineId) || !inLayer(layer, s)) continue
    const { point, t } = projectOntoSegment(p, s.a, s.b)
    const d = distance(p, point)
    if (d < radius && (!best || d < best.distance)) best = { segment: s, point, t, distance: d }
  }
  return best
}

export function nodesInBox(graph: EditGraph, a: Vec2, b: Vec2, layer?: LineLayer): GraphNode[] {
  const minX = Math.min(a[0], b[0])
  const maxX = Math.max(a[0], b[0])
  const minY = Math.min(a[1], b[1])
  const maxY = Math.max(a[1], b[1])
  return graph.nodes.filter(n => inLayer(layer, n) && n.point[0] >= minX && n.point[0] <= maxX && n.point[1] >= minY && n.point[1] <= maxY)
}
