export type Vec2 = [number, number]
export type Ring = Vec2[]

export interface Polygon {
  outer: Ring
  holes: Ring[]
}

export interface Box {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

/**
 * Coordinates are canonicalized to this grid (metres) after noding: ten
 * micrometres, coarser than the document precision so that rounding a
 * junction never lifts it off its host wall, and far below anything visible.
 */
export const EPS = 1e-5

export const cross = (a: Vec2, b: Vec2): number => a[0] * b[1] - a[1] * b[0]
export const dot = (a: Vec2, b: Vec2): number => a[0] * b[0] + a[1] * b[1]
export const sub = (a: Vec2, b: Vec2): Vec2 => [a[0] - b[0], a[1] - b[1]]
export const add = (a: Vec2, b: Vec2): Vec2 => [a[0] + b[0], a[1] + b[1]]
export const mul = (a: Vec2, t: number): Vec2 => [a[0] * t, a[1] * t]
export const length = (a: Vec2): number => Math.hypot(a[0], a[1])
export const distance = (a: Vec2, b: Vec2): number => Math.hypot(a[0] - b[0], a[1] - b[1])
export const midpoint = (a: Vec2, b: Vec2): Vec2 => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]

/** Left-hand normal of a direction (counter-clockwise rotation by 90 degrees). */
export const perpendicular = (a: Vec2): Vec2 => [-a[1], a[0]]

export function normalize(a: Vec2): Vec2 {
  const l = length(a)
  return l === 0 ? [0, 0] : [a[0] / l, a[1] / l]
}

export const snap = (p: Vec2): Vec2 => [Math.round(p[0] / EPS) * EPS, Math.round(p[1] / EPS) * EPS]
export const gridKey = (p: Vec2): string => `${Math.round(p[0] / EPS)},${Math.round(p[1] / EPS)}`

/** Shoelace area with sign: positive for counter-clockwise rings in a y-up frame. */
export function signedArea(ring: Ring): number {
  let sum = 0
  for (let i = 0; i < ring.length; i++) sum += cross(ring[i], ring[(i + 1) % ring.length])
  return sum / 2
}

export function pointInRing(p: Vec2, ring: Ring): boolean {
  let hit = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i]
    const b = ring[j]
    if (a[1] > p[1] !== b[1] > p[1] && p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]) hit = !hit
  }
  return hit
}

export function pointInPolygon(p: Vec2, polygon: Polygon): boolean {
  return pointInRing(p, polygon.outer) && !polygon.holes.some(h => pointInRing(p, h))
}

export function bounds(points: Vec2[]): Box {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const p of points) {
    if (p[0] < minX) minX = p[0]
    if (p[1] < minY) minY = p[1]
    if (p[0] > maxX) maxX = p[0]
    if (p[1] > maxY) maxY = p[1]
  }
  return { minX, minY, maxX, maxY }
}

export const inBounds = (p: Vec2, b: Box, eps = EPS): boolean =>
  p[0] >= b.minX - eps && p[1] >= b.minY - eps && p[0] <= b.maxX + eps && p[1] <= b.maxY + eps

export const boxesOverlap = (a: Box, b: Box, eps = EPS): boolean =>
  !(a.maxX + eps < b.minX || b.maxX + eps < a.minX || a.maxY + eps < b.minY || b.maxY + eps < a.minY)

export function projectOntoSegment(p: Vec2, a: Vec2, b: Vec2): { point: Vec2; t: number } {
  const d = sub(b, a)
  const l = dot(d, d)
  const t = l === 0 ? 0 : Math.max(0, Math.min(1, dot(sub(p, a), d) / l))
  return { point: add(a, mul(d, t)), t }
}

export function distanceToSegment(p: Vec2, a: Vec2, b: Vec2): number {
  return distance(p, projectOntoSegment(p, a, b).point)
}

/** The point halfway along a path by length. */
export function pathMiddle(points: Vec2[]): Vec2 {
  const lengths = points.slice(1).map((p, i) => distance(points[i], p))
  let remaining = lengths.reduce((s, l) => s + l, 0) / 2
  for (let i = 0; i < lengths.length; i++) {
    if (remaining <= lengths[i]) {
      const t = lengths[i] ? remaining / lengths[i] : 0
      return [points[i][0] + (points[i + 1][0] - points[i][0]) * t, points[i][1] + (points[i + 1][1] - points[i][1]) * t]
    }
    remaining -= lengths[i]
  }
  return [points[0][0], points[0][1]]
}

/** A polyline moved sideways by `d`, to the left of its direction for a positive `d`: each point along the normal there, the bisector's at a joint. */
export function offsetPolyline(points: Vec2[], d: number): Vec2[] {
  return points.map((p, i) => {
    const before = i > 0 ? normalize(sub(p, points[i - 1])) : null
    const after = i < points.length - 1 ? normalize(sub(points[i + 1], p)) : null
    const t = before && after ? normalize(add(before, after)) : before ?? after ?? [1, 0]
    return add(p, mul([-t[1], t[0]], d))
  })
}

/** The crossing of two segments strictly inside both, or null when they miss, touch at an end or are parallel. */
/** The part of segment ab inside the box (Liang–Barsky), or null when none of it is. */
export function clipSegmentToBox(a: Vec2, b: Vec2, box: Box): [Vec2, Vec2] | null {
  const d = sub(b, a)
  let t0 = 0
  let t1 = 1
  const edges: [number, number][] = [
    [-d[0], a[0] - box.minX],
    [d[0], box.maxX - a[0]],
    [-d[1], a[1] - box.minY],
    [d[1], box.maxY - a[1]]
  ]
  for (const [p, q] of edges) {
    if (p === 0) {
      if (q < 0) return null
      continue
    }
    const t = q / p
    if (p < 0) {
      if (t > t1) return null
      if (t > t0) t0 = t
    } else {
      if (t < t0) return null
      if (t < t1) t1 = t
    }
  }
  return [add(a, mul(d, t0)), add(a, mul(d, t1))]
}

export function segmentCrossing(a: Vec2, b: Vec2, c: Vec2, d: Vec2): Vec2 | null {
  const r = sub(b, a)
  const s = sub(d, c)
  const denominator = cross(r, s)
  if (Math.abs(denominator) < 1e-12) return null
  const ac = sub(c, a)
  const t = cross(ac, s) / denominator
  const u = cross(ac, r) / denominator
  if (t <= 0 || t >= 1 || u <= 0 || u >= 1) return null
  return add(a, mul(r, t))
}

export const copyRing = (ring: Ring): Ring => ring.map(p => [p[0], p[1]])
export const copyPolygon = (polygon: Polygon): Polygon => ({ outer: copyRing(polygon.outer), holes: polygon.holes.map(copyRing) })
