import type { Vec2 } from '../../geometry/vector'
import { cross, dot, sub, add, mul } from '../../geometry/vector'
import type { Primitive } from './types'

const PARALLEL_EPS = 1e-4

function lineLine(p1: Vec2, d1: Vec2, p2: Vec2, d2: Vec2): { point: Vec2; t: number; u: number } | null {
  const den = cross(d1, d2)
  if (Math.abs(den) < PARALLEL_EPS) return null
  const delta = sub(p2, p1)
  const t = cross(delta, d2) / den
  const u = cross(delta, d1) / den
  return { point: add(p1, mul(d1, t)), t, u }
}

const asLine = (p: Primitive): { point: Vec2; direction: Vec2; tMin: number; tMax: number } | null => {
  switch (p.type) {
    case 'line':
      return { point: p.point, direction: p.direction, tMin: -Infinity, tMax: Infinity }
    case 'ray':
      return { point: p.origin, direction: p.direction, tMin: 0, tMax: Infinity }
    case 'segment':
      return { point: p.start, direction: sub(p.end, p.start), tMin: 0, tMax: 1 }
    case 'point':
      return null
  }
}

export function intersectPrimitives(a: Primitive, b: Primitive): Vec2 | null {
  if (a.type === 'point') return a.point
  if (b.type === 'point') return b.point
  const la = asLine(a)!
  const lb = asLine(b)!
  const hit = lineLine(la.point, la.direction, lb.point, lb.direction)
  if (!hit) return null
  if (hit.t < la.tMin || hit.t > la.tMax || hit.u < lb.tMin || hit.u > lb.tMax) return null
  return hit.point
}

export function projectOntoPrimitive(p: Vec2, primitive: Primitive): Vec2 {
  if (primitive.type === 'point') return primitive.point
  const l = asLine(primitive)!
  const len2 = dot(l.direction, l.direction)
  if (len2 === 0) return l.point
  const t = Math.max(l.tMin, Math.min(l.tMax, dot(sub(p, l.point), l.direction) / len2))
  return add(l.point, mul(l.direction, t))
}
