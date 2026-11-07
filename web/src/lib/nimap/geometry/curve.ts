import type { Vec2 } from './vector'
import { add, distance, distanceToSegment, mul, sub } from './vector'

/** Control points of a cubic Bézier: the two ends and their two handles. */
export type Cubic = [Vec2, Vec2, Vec2, Vec2]

/** Handle distance that makes four cubics a near-exact ellipse. */
export const KAPPA = 0.5522847498

const lerp = (a: Vec2, b: Vec2, t: number): Vec2 => add(a, mul(sub(b, a), t))

export function cubicPoint([p0, c1, c2, p3]: Cubic, t: number): Vec2 {
  const a = lerp(p0, c1, t)
  const b = lerp(c1, c2, t)
  const c = lerp(c2, p3, t)
  return lerp(lerp(a, b, t), lerp(b, c, t), t)
}

/** The derivative of the curve at t: its direction of travel, scaled by speed. */
export function cubicTangent([p0, c1, c2, p3]: Cubic, t: number): Vec2 {
  const u = 1 - t
  const a = 3 * u * u
  const b = 6 * u * t
  const c = 3 * t * t
  return [a * (c1[0] - p0[0]) + b * (c2[0] - c1[0]) + c * (p3[0] - c2[0]), a * (c1[1] - p0[1]) + b * (c2[1] - c1[1]) + c * (p3[1] - c2[1])]
}

/** De Casteljau: the two cubics that together are this one, split at t. */
export function splitCubic([p0, c1, c2, p3]: Cubic, t: number): [Cubic, Cubic] {
  const a = lerp(p0, c1, t)
  const b = lerp(c1, c2, t)
  const c = lerp(c2, p3, t)
  const d = lerp(a, b, t)
  const e = lerp(b, c, t)
  const m = lerp(d, e, t)
  return [
    [p0, a, d, m],
    [m, e, c, p3]
  ]
}

const flat = ([p0, c1, c2, p3]: Cubic, tolerance: number): boolean => distanceToSegment(c1, p0, p3) <= tolerance && distanceToSegment(c2, p0, p3) <= tolerance

/**
 * The curve as chords no farther than `tolerance` from it, with the parameter
 * of every chord end, by subdividing until both handles lie within tolerance
 * of the chord.
 */
export function flattenCubic(cubic: Cubic, tolerance: number): { points: Vec2[]; ts: number[] } {
  const points: Vec2[] = [cubic[0]]
  const ts: number[] = [0]
  const visit = (c: Cubic, t0: number, t1: number, depth: number) => {
    if (depth >= 16 || flat(c, tolerance)) {
      points.push(c[3])
      ts.push(t1)
      return
    }
    const [l, r] = splitCubic(c, 0.5)
    const tm = (t0 + t1) / 2
    visit(l, t0, tm, depth + 1)
    visit(r, tm, t1, depth + 1)
  }
  visit(cubic, 0, 1, 0)
  return { points, ts }
}

/** The parameter of the curve point nearest `p`, from the chords, refined by a few Newton steps. */
export function projectOntoCubic(cubic: Cubic, p: Vec2, tolerance = 1e-4): { t: number; point: Vec2 } {
  const { points, ts } = flattenCubic(cubic, tolerance)
  let best = { t: 0, d: Infinity }
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]
    const b = points[i]
    const ab = sub(b, a)
    const len2 = ab[0] * ab[0] + ab[1] * ab[1]
    const u = len2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * ab[0] + (p[1] - a[1]) * ab[1]) / len2)) : 0
    const q = lerp(a, b, u)
    const d = distance(p, q)
    if (d < best.d) best = { t: ts[i - 1] + (ts[i] - ts[i - 1]) * u, d }
  }
  let t = best.t
  for (let k = 0; k < 4; k++) {
    const h = 1e-6
    const q = cubicPoint(cubic, t)
    const d1 = mul(sub(cubicPoint(cubic, Math.min(1, t + h)), cubicPoint(cubic, Math.max(0, t - h))), 1 / (2 * h))
    const f = (q[0] - p[0]) * d1[0] + (q[1] - p[1]) * d1[1]
    const fp = d1[0] * d1[0] + d1[1] * d1[1]
    if (!fp) break
    t = Math.max(0, Math.min(1, t - f / fp))
  }
  return { t, point: cubicPoint(cubic, t) }
}

/** Four cubics that trace the ellipse inscribed in the box from a to b, counter-clockwise from the right. */
export function ellipseCubics(a: Vec2, b: Vec2): Cubic[] {
  const cx = (a[0] + b[0]) / 2
  const cy = (a[1] + b[1]) / 2
  const rx = Math.abs(a[0] - b[0]) / 2
  const ry = Math.abs(a[1] - b[1]) / 2
  const kx = rx * KAPPA
  const ky = ry * KAPPA
  const right: Vec2 = [cx + rx, cy]
  const top: Vec2 = [cx, cy + ry]
  const left: Vec2 = [cx - rx, cy]
  const bottom: Vec2 = [cx, cy - ry]
  return [
    [right, [cx + rx, cy + ky], [cx + kx, cy + ry], top],
    [top, [cx - kx, cy + ry], [cx - rx, cy + ky], left],
    [left, [cx - rx, cy - ky], [cx - kx, cy - ry], bottom],
    [bottom, [cx + kx, cy - ry], [cx + rx, cy - ky], right]
  ]
}
