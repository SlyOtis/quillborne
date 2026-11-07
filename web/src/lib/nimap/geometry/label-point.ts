import type { Vec2, Polygon } from './vector'
import { pointInPolygon, distanceToSegment } from './vector'

/**
 * A label anchor well inside the polygon: the grid sample farthest from any
 * ring edge. Deterministic and cheap; not the exact pole of inaccessibility.
 */
export function labelPoint(polygon: Polygon, fallback?: Vec2, resolution = 12): Vec2 {
  const xs = polygon.outer.map(p => p[0])
  const ys = polygon.outer.map(p => p[1])
  const x = Math.min(...xs)
  const y = Math.min(...ys)
  const w = Math.max(...xs) - x
  const h = Math.max(...ys) - y
  const rings = [polygon.outer, ...polygon.holes]
  let best: Vec2 = fallback ?? polygon.outer[0]
  let score = -1
  for (let i = 1; i < resolution; i++) {
    for (let j = 1; j < resolution; j++) {
      const p: Vec2 = [x + (w * i) / resolution, y + (h * j) / resolution]
      if (!pointInPolygon(p, polygon)) continue
      let d = Infinity
      for (const ring of rings) {
        for (let k = 0; k < ring.length; k++) {
          d = Math.min(d, distanceToSegment(p, ring[k], ring[(k + 1) % ring.length]))
        }
      }
      if (d > score) {
        score = d
        best = p
      }
    }
  }
  return best
}
