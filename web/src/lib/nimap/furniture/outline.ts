import type { Polygon, Ring, Vec2 } from '../geometry/vector'
import { add, cross, distance, dot, mul, normalize, perpendicular, signedArea, sub } from '../geometry/vector'
import { cubicPoint, cubicTangent } from '../geometry/curve'
import type { Line } from '../model/types'
import { cubicOf, lineChords } from '../model/lines'
import { samePoint } from '../model/precision'

export const reversed = <E extends Line>(e: E): E => ({ ...e, points: [e.points[1], e.points[0]], ...(e.curve ? { curve: [e.curve[1], e.curve[0]] as [Vec2, Vec2] } : {}) })

/** A traced outline as the chords of its edges, in ring order. */
export const chordRing = (edges: Line[]): Ring => edges.flatMap(e => lineChords(e).slice(0, -1))

/** The edges of a traced outline as one ring, each running from where the previous one ends, counter-clockwise. */
export function ringOf<E extends Line>(input: E[]): E[] {
  if (input.length < 2) throw new Error('An outline needs at least two edges.')
  const edges = [...input]
  if (!samePoint(edges[0].points[1], edges[1].points[0]) && !samePoint(edges[0].points[1], edges[1].points[1])) edges[0] = reversed(edges[0])
  for (let i = 1; i < edges.length; i++) {
    if (!samePoint(edges[i].points[0], edges[i - 1].points[1])) edges[i] = reversed(edges[i])
    if (!samePoint(edges[i].points[0], edges[i - 1].points[1])) throw new Error('Outline edges must form one ring, in order.')
  }
  if (!samePoint(edges[edges.length - 1].points[1], edges[0].points[0])) throw new Error('Outline edges must close.')
  return signedArea(chordRing(edges)) < 0 ? edges.reverse().map(reversed) : edges
}

/** The direction of travel along an edge at parameter t. */
export function direction(e: Line, t: number): Vec2 {
  if (!e.curve) return normalize(sub(e.points[1], e.points[0]))
  const cubic = cubicOf(e)
  const d = cubicTangent(cubic, t)
  if (Math.hypot(d[0], d[1]) > 1e-9) return normalize(d)
  const h = 1e-4
  return normalize(sub(cubicPoint(cubic, Math.min(1, t + h)), cubicPoint(cubic, Math.max(0, t - h))))
}

/** A joint whose normals meet sharper than this (`1 + n1·n2`) is rounded rather than mitred, so its mitre never runs far past the depth. */
const MITRE_LIMIT = 0.25
const ROUND_STEPS = 12

export interface Chain {
  points: Vec2[]
  closed: boolean
}

const counterClockwise = (ring: Ring): Ring => (signedArea(ring) < 0 ? [...ring].reverse() : ring)

export const ringsOf = (polygons: Polygon[]): Ring[] => polygons.flatMap(p => [p.outer, ...p.holes])

/** The chords of consecutive edges as one chain of points. */
function chainOf(edges: Line[], closed: boolean): Chain {
  const points = edges.flatMap((e, i) => lineChords(e).slice(i ? 1 : 0))
  return { points: closed ? points.slice(0, -1) : points, closed }
}

/** The edges `pick` marks, as chains of consecutive edges in ring order; a ring marked all round is one closed chain. */
export function chains(edges: Line[], pick: (i: number) => boolean): Chain[] {
  const n = edges.length
  if (edges.every((_, i) => pick(i))) return [chainOf(edges, true)]
  let start = 0
  while (pick((start - 1 + n) % n)) start++
  const out: Chain[] = []
  let current: Line[] = []
  for (let k = 0; k <= n; k++) {
    const i = (start + k) % n
    if (k < n && pick(i)) {
      current.push(edges[i])
      continue
    }
    if (current.length) out.push(chainOf(current, false))
    current = []
  }
  return out
}

/** The wedge a chain leaves open inside where it turns away from the inside at `p`: mitred, or rounded when the turn is sharp. */
function joint(p: Vec2, n1: Vec2, n2: Vec2, depth: number): Ring {
  const k = 1 + dot(n1, n2)
  if (k > MITRE_LIMIT) return [p, add(p, mul(n2, depth)), add(p, mul(add(n1, n2), depth / k)), add(p, mul(n1, depth))]
  const from = Math.atan2(n2[1], n2[0])
  let span = Math.atan2(n1[1], n1[0]) - from
  if (span < 0) span += 2 * Math.PI
  return [p, ...Array.from({ length: ROUND_STEPS + 1 }, (_, i): Vec2 => add(p, mul([Math.cos(from + (span * i) / ROUND_STEPS), Math.sin(from + (span * i) / ROUND_STEPS)], depth)))]
}

/**
 * What lies within `depth` in from chains of an outline's chords, before
 * the outline cuts off what reaches outside it: a strip inside every
 * chord, the wedge a chain leaves open where it turns away from the
 * inside, and every open chain carried `depth` past its ends, so an end
 * edge that slants outward is met rather than stopped short of.
 */
export function band(of: Chain[], depth: number): Ring[] {
  const rings: Ring[] = []
  for (const { points, closed } of of) {
    const n = points.length
    const count = closed ? n : n - 1
    const heading = (i: number) => normalize(sub(points[(i + 1) % n], points[i]))
    for (let i = 0; i < count; i++) {
      const t = heading(i)
      const inward = mul(perpendicular(t), depth)
      const a = !closed && i === 0 ? sub(points[i], mul(t, depth)) : points[i]
      const b = !closed && i === count - 1 ? add(points[(i + 1) % n], mul(t, depth)) : points[(i + 1) % n]
      rings.push([a, b, add(b, inward), add(a, inward)])
    }
    for (let i = closed ? 0 : 1; i < count; i++) {
      const tin = heading((i - 1 + n) % n)
      const tout = heading(i)
      if (cross(tin, tout) < 0) rings.push(joint(points[i], perpendicular(tin), perpendicular(tout), depth))
    }
  }
  return rings.map(counterClockwise)
}

/** The point and direction of travel `s` along a chain. */
export function along(points: Vec2[], closed: boolean, s: number): { p: Vec2; tangent: Vec2 } {
  const n = points.length
  const count = closed ? n : n - 1
  let travelled = 0
  for (let i = 0; i < count; i++) {
    const a = points[i]
    const b = points[(i + 1) % n]
    const l = distance(a, b)
    if (travelled + l >= s || i === count - 1) return { p: add(a, mul(sub(b, a), l ? Math.min(1, (s - travelled) / l) : 0)), tangent: normalize(sub(b, a)) }
    travelled += l
  }
  return { p: points[0], tangent: [1, 0] }
}

export const lengthOf = ({ points, closed }: Chain) => points.slice(0, closed ? undefined : -1).reduce((sum, p, i) => sum + distance(p, points[(i + 1) % points.length]), 0)
