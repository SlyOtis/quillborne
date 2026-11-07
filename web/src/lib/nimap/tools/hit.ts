import type { Vec2 } from '../geometry/vector'
import { distance } from '../geometry/vector'
import type { Fixture, LineLayer, Unit } from '../model/types'
import type { PlacedOpening } from '../model/openings'
import { nearestNode, nodesInBox, type EditGraph, type GraphNode } from './graph'
import { canHit, canHitFaces, type Layers } from './layers'
import type { CurveHandle } from './handles'
import { gripAt, type Grip } from './grips'
import { KINDS, type KindHit } from './kinds'

export type Hit = { kind: 'node'; node: GraphNode } | { kind: 'handle'; handle: CurveHandle } | { kind: 'grip'; grip: Grip } | KindHit

export interface HitService {
  /** The smallest thing under the pointer wins: a handle, a grip, a node, then the kinds in their order. Only layers that can be hit are consulted; nodes in `passOver` are not there for the hand. */
  at(point: Vec2, passOver?: Set<string>): Hit | null
  /** Nodes inside the box, on layers that can be hit. */
  nodesInBox(a: Vec2, b: Vec2): GraphNode[]
  /** Closed fixtures whose every point lies inside the box, when the fixture layer can be hit. */
  fixturesInBox(a: Vec2, b: Vec2): Fixture[]
  /** Lines wholly inside the box, every chord of a curve included, on layers that can be hit. */
  linesInBox(a: Vec2, b: Vec2): string[]
  /** Rooms whose every point lies inside the box, when the wall layer can be hit. */
  unitsInBox(a: Vec2, b: Vec2): Unit[]
}

const fixturePoints = (f: Fixture): Vec2[] => f.polygon?.outer ?? f.line ?? []

const inBox = (a: Vec2, b: Vec2) => {
  const minX = Math.min(a[0], b[0])
  const maxX = Math.max(a[0], b[0])
  const minY = Math.min(a[1], b[1])
  const maxY = Math.max(a[1], b[1])
  return (p: Vec2) => p[0] >= minX && p[0] <= maxX && p[1] >= minY && p[1] <= maxY
}

export function createHitService(graph: EditGraph, fixtures: Fixture[], layers: Layers, radius: number, handles: CurveHandle[] = [], openings: PlacedOpening[] = [], units: Unit[] = [], grips: Grip[] = []): HitService {
  const layersHittable: LineLayer[] = (['walls', 'fixtures'] as const).filter(l => canHit(layers, l))
  const scene = { graph, fixtures, openings, units, layers, radius }
  return {
    at(point, passOver) {
      for (const handle of handles) if (canHit(layers, handle.layer) && distance(handle.point, point) < radius) return { kind: 'handle', handle }
      if (canHit(layers, 'fixtures')) {
        const grip = gripAt(grips, point, radius)
        if (grip) return { kind: 'grip', grip }
      }
      for (const layer of layersHittable) {
        const node = nearestNode(graph, point, radius, passOver, layer)
        if (node) return { kind: 'node', node }
      }
      for (const kind of KINDS) {
        const hit = kind.hit(point, scene)
        if (hit) return hit
      }
      return null
    },
    nodesInBox(a, b) {
      return layersHittable.flatMap(layer => nodesInBox(graph, a, b, layer))
    },
    fixturesInBox(a, b) {
      if (!canHitFaces(layers, 'fixtures')) return []
      const inside = inBox(a, b)
      return fixtures.filter(f => {
        const points = fixturePoints(f)
        return points.length > 0 && points.every(inside)
      })
    },
    linesInBox(a, b) {
      const inside = inBox(a, b)
      const out = new Set<string>()
      for (const s of graph.segments) if (layersHittable.includes(s.layer) && inside(s.a) && inside(s.b)) out.add(s.lineId)
      for (const s of graph.segments) if (out.has(s.lineId) && !(inside(s.a) && inside(s.b))) out.delete(s.lineId)
      return [...out]
    },
    unitsInBox(a, b) {
      if (!canHitFaces(layers, 'walls')) return []
      const inside = inBox(a, b)
      return units.filter(u => u.polygon.outer.every(inside))
    }
  }
}
