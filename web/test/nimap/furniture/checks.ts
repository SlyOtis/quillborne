import type { Part, PartMesh, PartRole, Polygon, Ring, Vec2, Vec3 } from '$lib/nimap'
import { convexHull, overlapArea, partMesh, partVertices, partsExtent, projectOntoSegment, distance } from '$lib/nimap'

const key = (x: number, y: number, z: number) => `${Math.round(x * 1e5)},${Math.round(y * 1e5)},${Math.round(z * 1e5)}`

/** Directed edges not matched by their reverse: zero for a closed surface whose faces all turn the same way. */
export function unmatchedEdges(mesh: PartMesh): number {
  const p = mesh.positions
  const count = new Map<string, number>()
  for (let i = 0; i < p.length; i += 9) {
    const v = [0, 1, 2].map(j => key(p[i + j * 3], p[i + j * 3 + 1], p[i + j * 3 + 2]))
    for (let j = 0; j < 3; j++) {
      const forward = `${v[j]}>${v[(j + 1) % 3]}`
      const reverse = `${v[(j + 1) % 3]}>${v[j]}`
      if ((count.get(reverse) ?? 0) > 0) count.set(reverse, count.get(reverse)! - 1)
      else count.set(forward, (count.get(forward) ?? 0) + 1)
    }
  }
  return [...count.values()].reduce((s, n) => s + n, 0)
}

/** Signed volume by the divergence theorem: positive when every face points outward. */
export function volume(mesh: PartMesh): number {
  const p = mesh.positions
  let sum = 0
  for (let i = 0; i < p.length; i += 9) {
    const [a, b, c] = [0, 1, 2].map(j => [p[i + j * 3], p[i + j * 3 + 1], p[i + j * 3 + 2]])
    sum += a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0])
  }
  return sum / 6
}

const TOUCH = 1e-3

/**
 * Parts that neither rest on the given plane nor touch, through a chain of
 * touching parts, one that does. Touching is judged by bounding boxes, as
 * the PoC checks did: coarse, but it catches anything left in the air.
 */
export function floating(parts: Part[], rests: (min: Vec3) => boolean = min => Math.abs(min[2]) < 1e-6): Part[] {
  const boxes = parts.map(p => partsExtent([p]))
  const touching = (i: number, j: number) => [0, 1, 2].every(k => boxes[i].min[k] <= boxes[j].max[k] + TOUCH && boxes[j].min[k] <= boxes[i].max[k] + TOUCH)
  const reached = new Set(boxes.map((b, i) => (rests(b.min) ? i : -1)).filter(i => i >= 0))
  const queue = [...reached]
  while (queue.length) {
    const i = queue.pop()!
    for (let j = 0; j < parts.length; j++) {
      if (reached.has(j) || !touching(i, j)) continue
      reached.add(j)
      queue.push(j)
    }
  }
  return parts.filter((_, i) => !reached.has(i))
}

/** Parts not joined, through a chain of touching parts, to the lowest one: empty when a thing holds together, floating or not. */
export function apart(parts: Part[]): Part[] {
  if (!parts.length) return []
  const lowest = partsExtent(parts).min[2]
  return floating(parts, min => Math.abs(min[2] - lowest) < 1e-6)
}

/** The centre of the parts' volume, from their closed meshes: it turns with the parts and does not lean toward wherever the corners happen to be many. */
const centreOf = (parts: Part[]): Vec3 => {
  let volume = 0
  const sum: Vec3 = [0, 0, 0]
  for (const part of parts) {
    const p = partMesh(part).positions
    for (let i = 0; i < p.length; i += 9) {
      const [a, b, c] = [0, 1, 2].map(j => [p[i + j * 3], p[i + j * 3 + 1], p[i + j * 3 + 2]])
      const v = (a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0])) / 6
      volume += v
      for (let k = 0; k < 3; k++) sum[k] += (v * (a[k] + b[k] + c[k])) / 4
    }
  }
  return [sum[0] / volume, sum[1] / volume, sum[2] / volume]
}

const byRole = (parts: Part[], role: PartRole) => parts.filter(p => p.role === role)

/** The pairs a front is read from: from the second part's centre toward the first's, in the plan. */
const FRONT_PAIRS: [PartRole, PartRole][] = [
  ['seat', 'back'],
  ['screen', 'stand'],
  ['screen', 'back'],
  ['tray', 'board'],
  ['front', 'body'],
  ['body', 'back']
]

/** Which way an item faces, measured from its geometry, not from how it was placed; null when it has no front. */
export function frontOf(parts: Part[]): Vec2 | null {
  for (const [ahead, behind] of FRONT_PAIRS) {
    const a = byRole(parts, ahead)
    const b = byRole(parts, behind)
    if (!a.length || !b.length) continue
    const ca = centreOf(a)
    const cb = centreOf(b)
    const d: Vec2 = [ca[0] - cb[0], ca[1] - cb[1]]
    const l = Math.hypot(d[0], d[1])
    return l > 1e-6 ? [d[0] / l, d[1] / l] : null
  }
  return null
}

export const seatCentre = (parts: Part[]): Vec2 => {
  const c = centreOf(byRole(parts, 'seat'))
  return [c[0], c[1]]
}

export const screenCentre = (parts: Part[]): Vec2 => {
  const c = centreOf(byRole(parts, 'screen'))
  return [c[0], c[1]]
}

export const dot2 = (a: Vec2, b: Vec2) => a[0] * b[0] + a[1] * b[1]

export const toward = (from: Vec2, to: Vec2): Vec2 => {
  const d: Vec2 = [to[0] - from[0], to[1] - from[1]]
  const l = Math.hypot(d[0], d[1]) || 1
  return [d[0] / l, d[1] / l]
}

export function nearestOnRing(p: Vec2, ring: Ring): Vec2 {
  let best: Vec2 = ring[0]
  for (let i = 0; i < ring.length; i++) {
    const q = projectOntoSegment(p, ring[i], ring[(i + 1) % ring.length]).point
    if (distance(p, q) < distance(p, best)) best = q
  }
  return best
}

/** What parts cover seen from above, as a polygon. */
export const hullOf = (parts: Part[]): Polygon => ({ outer: convexHull(parts.flatMap(p => partVertices(p).map(v => [v[0], v[1]] as Vec2))), holes: [] })

export const overlap = (a: Polygon, b: Polygon) => overlapArea(a, b)

export const meshOf = partMesh
