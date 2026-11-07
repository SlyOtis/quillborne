import earcut from 'earcut'
import type { Vec2, Polygon } from './vector'

type Triangle = [Vec2, Vec2, Vec2]

const orient = (a: Vec2, b: Vec2, c: Vec2): number => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])

const cache = new WeakMap<Polygon, Triangle[]>()

/** Counter-clockwise triangles covering the polygon, cached per polygon object. */
export function triangulate(polygon: Polygon): Triangle[] {
  const cached = cache.get(polygon)
  if (cached) return cached
  const rings = [polygon.outer, ...polygon.holes]
  const flat: number[] = []
  const holeIndices: number[] = []
  rings.forEach((ring, i) => {
    if (i > 0) holeIndices.push(flat.length / 2)
    for (const p of ring) flat.push(p[0], p[1])
  })
  const points = rings.flat()
  const indices = earcut(flat, holeIndices, 2)
  const result: Triangle[] = []
  for (let i = 0; i < indices.length; i += 3) {
    const t: Triangle = [points[indices[i]], points[indices[i + 1]], points[indices[i + 2]]]
    if (orient(t[0], t[1], t[2]) < 0) t.reverse()
    result.push(t)
  }
  cache.set(polygon, result)
  return result
}

function clippedArea(subject: Triangle, clip: Triangle): number {
  let polygon: Vec2[] = subject
  for (let i = 0; i < 3 && polygon.length; i++) {
    const a = clip[i]
    const b = clip[(i + 1) % 3]
    const output: Vec2[] = []
    let previous = polygon[polygon.length - 1]
    let pd = orient(a, b, previous)
    for (const current of polygon) {
      const cd = orient(a, b, current)
      if (pd >= 0 !== cd >= 0) {
        const t = pd / (pd - cd)
        output.push([previous[0] + t * (current[0] - previous[0]), previous[1] + t * (current[1] - previous[1])])
      }
      if (cd >= 0) output.push(current)
      previous = current
      pd = cd
    }
    polygon = output
  }
  let sum = 0
  for (let i = 1; i + 1 < polygon.length; i++) sum += orient(polygon[0], polygon[i], polygon[i + 1])
  return Math.abs(sum) / 2
}

/**
 * Area of the intersection of two polygons by clipping triangle pairs. Unlike
 * a planar overlay this creates no new graph at nearly coincident edges, which
 * is what identity matching between old and new rooms needs.
 */
export function overlapArea(a: Polygon, b: Polygon): number {
  let sum = 0
  for (const ta of triangulate(a)) for (const tb of triangulate(b)) sum += clippedArea(ta, tb)
  return sum
}

export function polygonArea(polygon: Polygon): number {
  let sum = 0
  for (const t of triangulate(polygon)) sum += Math.abs(orient(t[0], t[1], t[2])) / 2
  return sum
}
