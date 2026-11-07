import type { Polygon, Ring, Vec2 } from '../geometry/vector'
import { signedArea } from '../geometry/vector'
import { triangulate } from '../geometry/overlap'
import type { Part, Shape, Transform, Vec3 } from './parts'
import { applyTransform, compose, determinant, normalMatrix, scaling } from './parts'

/** Triangles as flat xyz triples, counter-clockwise seen from outside, with a unit normal per position: a part's in level space, or a unit mesh in its own frame. */
export interface PartMesh {
  positions: number[]
  normals: number[]
}

const DEFAULT_SEGMENTS = 20

type Triangle = [Vec3, Vec3, Vec3, Vec3?, Vec3?, Vec3?]

const sub3 = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const cross3 = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const unit3 = (a: Vec3): Vec3 => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1
  return [a[0] / l, a[1] / l, a[2] / l]
}

const counterClockwise = (ring: Ring): Ring => (signedArea(ring) < 0 ? [...ring].reverse() : ring)
const clockwise = (ring: Ring): Ring => (signedArea(ring) > 0 ? [...ring].reverse() : ring)

/**
 * A plan polygon between z = 0 and `height`, its top scaled by `topScale`
 * about the origin (a cone frustum when the polygon is a regular one, a
 * cone with its point on the axis at 0). `smooth` gives the sides the
 * normals of the round surface they stand for.
 */
function extrusion(polygon: Polygon, height: number, topScale = 1, smooth = false): Triangle[] {
  const out: Triangle[] = []
  const lift = (p: Vec2, z: number, s: number): Vec3 => [p[0] * s, p[1] * s, z]
  for (const [a, b, c] of triangulate(polygon)) {
    if (topScale > 0) out.push([lift(a, height, topScale), lift(b, height, topScale), lift(c, height, topScale)])
    out.push([lift(a, 0, 1), lift(c, 0, 1), lift(b, 0, 1)])
  }
  if (topScale === 0) {
    const apex: Vec3 = [0, 0, height]
    for (const ring of [counterClockwise(polygon.outer)]) for (let i = 0; i < ring.length; i++) out.push([lift(ring[i], 0, 1), lift(ring[(i + 1) % ring.length], 0, 1), apex])
    return out
  }
  const slope = height ? (1 - topScale) / height : 0
  const radial = (p: Vec2, r: number): Vec3 => unit3([p[0] / r, p[1] / r, r * slope])
  for (const ring of [counterClockwise(polygon.outer), ...polygon.holes.map(clockwise)]) {
    for (let i = 0; i < ring.length; i++) {
      const p = ring[i]
      const q = ring[(i + 1) % ring.length]
      const a = lift(p, 0, 1)
      const b = lift(q, 0, 1)
      const c = lift(q, height, topScale)
      const d = lift(p, height, topScale)
      if (smooth) {
        const np = radial(p, Math.hypot(p[0], p[1]))
        const nq = radial(q, Math.hypot(q[0], q[1]))
        out.push([a, b, c, np, nq, nq], [a, c, d, np, nq, np])
      } else {
        out.push([a, b, c], [a, c, d])
      }
    }
  }
  return out
}

/** The twenty faces of a unit icosahedron, found as the triples of mutually adjacent vertices and turned outward. */
function unitIcosahedron(): Triangle[] {
  const phi = (1 + Math.sqrt(5)) / 2
  const raw: Vec3[] = []
  for (const s of [-1, 1]) for (const t of [-1, 1]) raw.push([0, s, t * phi], [s, t * phi, 0], [t * phi, 0, s])
  const vertices = raw.map(unit3)
  const adjacent = (i: number, j: number) => Math.abs(Math.hypot(...sub3(raw[i], raw[j])) - 2) < 1e-9
  const faces: Triangle[] = []
  for (let i = 0; i < 12; i++) {
    for (let j = i + 1; j < 12; j++) {
      if (!adjacent(i, j)) continue
      for (let k = j + 1; k < 12; k++) {
        if (!adjacent(i, k) || !adjacent(j, k)) continue
        const [a, b, c] = [vertices[i], vertices[j], vertices[k]]
        const n = cross3(sub3(b, a), sub3(c, a))
        faces.push(n[0] * a[0] + n[1] * a[1] + n[2] * a[2] > 0 ? [a, b, c] : [a, c, b])
      }
    }
  }
  return faces
}

function regularPolygon(radius: number, segments: number): Ring {
  return Array.from({ length: segments }, (_, i) => {
    const a = (2 * Math.PI * i) / segments
    return [radius * Math.cos(a), radius * Math.sin(a)] as Vec2
  })
}

/** Triangles as a mesh, each corner with the normal its shape gives it, or its face's. */
function meshOf(triangles: Triangle[]): PartMesh {
  const positions: number[] = []
  const normals: number[] = []
  for (const [a, b, c, na, nb, nc] of triangles) {
    const flat = unit3(cross3(sub3(b, a), sub3(c, a)))
    for (const [p, normal] of [[a, na ?? flat], [b, nb ?? flat], [c, nc ?? flat]] as [Vec3, Vec3][]) {
      positions.push(...p)
      normals.push(...normal)
    }
  }
  return { positions, normals }
}

/** The primitives' unit meshes, by what tells them apart besides their size. */
const units = new Map<string, PartMesh>()
/** Each prism's own mesh, kept as long as its shape is. */
const prisms = new WeakMap<Shape, PartMesh>()

const unit = (key: string, build: () => Triangle[]): PartMesh => {
  let mesh = units.get(key)
  if (!mesh) units.set(key, (mesh = meshOf(build())))
  return mesh
}

/**
 * The mesh a shape is drawn from, in its own frame, and the scaling that
 * sizes it into the shape. Shapes that differ only in size share one mesh,
 * built once: every box is a unit cube, every cylinder of one segment count
 * and taper a unit cylinder, every blob a unit icosahedron. A prism is its
 * own polygon one metre tall. However many parts a scene has, it holds each
 * mesh once.
 */
export function unitMesh(shape: Shape): { mesh: PartMesh; size: Transform } {
  switch (shape.type) {
    case 'box':
      return { mesh: unit('box', () => extrusion({ outer: [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]], holes: [] }, 1)), size: scaling(...shape.size) }
    case 'cylinder': {
      const segments = shape.segments ?? DEFAULT_SEGMENTS
      const top = (shape.top ?? shape.radius) / shape.radius
      return { mesh: unit(`cylinder:${segments}:${top}`, () => extrusion({ outer: regularPolygon(1, segments), holes: [] }, 1, top, segments > 6)), size: scaling(shape.radius, shape.radius, shape.height) }
    }
    case 'blob':
      return { mesh: unit('blob', unitIcosahedron), size: scaling(shape.radius, shape.radius, shape.radius) }
    case 'prism': {
      let mesh = prisms.get(shape)
      if (!mesh) prisms.set(shape, (mesh = meshOf(extrusion(shape.polygon, 1, shape.top ?? 1))))
      return { mesh, size: scaling(1, 1, shape.height) }
    }
  }
}

/** A mesh carried by a transform; a mirroring transform has its triangles turned back outward. */
function transformMesh({ positions, normals }: PartMesh, t: Transform): PartMesh {
  const n = normalMatrix(t)
  const corners = determinant(t) < 0 ? [6, 3, 0] : [0, 3, 6]
  const out: PartMesh = { positions: [], normals: [] }
  for (let i = 0; i < positions.length; i += 9) {
    for (const k of corners) {
      const [x, y, z] = [normals[i + k], normals[i + k + 1], normals[i + k + 2]]
      out.positions.push(...applyTransform(t, [positions[i + k], positions[i + k + 1], positions[i + k + 2]]))
      out.normals.push(...unit3([n[0] * x + n[3] * y + n[6] * z, n[1] * x + n[4] * y + n[7] * z, n[2] * x + n[5] * y + n[8] * z]))
    }
  }
  return out
}

/** A part's triangles in level space: its unit mesh, sized, then carried by its transform. */
export const partMesh = (part: Part): PartMesh => {
  const { mesh, size } = unitMesh(part.shape)
  return transformMesh(mesh, compose(part.transform, size))
}

/** Each mesh's corners, every one once, found the first time they are asked for. */
const cornersOf = new WeakMap<PartMesh, Vec3[]>()

function corners(mesh: PartMesh): Vec3[] {
  let found = cornersOf.get(mesh)
  if (!found) {
    const distinct = new Map<string, Vec3>()
    for (let i = 0; i < mesh.positions.length; i += 3) {
      const p: Vec3 = [mesh.positions[i], mesh.positions[i + 1], mesh.positions[i + 2]]
      distinct.set(p.join(), p)
    }
    cornersOf.set(mesh, (found = [...distinct.values()]))
  }
  return found
}

/** Every corner of a part in level space, each once: its unit mesh's corners, sized, then carried by its transform. */
export function partVertices(part: Part): Vec3[] {
  const { mesh, size } = unitMesh(part.shape)
  const t = compose(part.transform, size)
  return corners(mesh).map(p => applyTransform(t, p))
}

export interface Extent {
  min: Vec3
  max: Vec3
}

/** The axis-aligned box around parts. */
export function partsExtent(parts: Part[]): Extent {
  const min: Vec3 = [Infinity, Infinity, Infinity]
  const max: Vec3 = [-Infinity, -Infinity, -Infinity]
  for (const part of parts) {
    for (const p of partVertices(part)) {
      for (let k = 0; k < 3; k++) {
        if (p[k] < min[k]) min[k] = p[k]
        if (p[k] > max[k]) max[k] = p[k]
      }
    }
  }
  return { min, max }
}

/** The convex hull of points in the plan, counter-clockwise. */
export function convexHull(points: Vec2[]): Ring {
  const sorted = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1])
  const orient = (o: Vec2, a: Vec2, b: Vec2) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
  const half = (list: Vec2[]) => {
    const h: Vec2[] = []
    for (const p of list) {
      while (h.length >= 2 && orient(h[h.length - 2], h[h.length - 1], p) <= 1e-12) h.pop()
      h.push(p)
    }
    h.pop()
    return h
  }
  return [...half(sorted), ...half([...sorted].reverse())]
}

/** What parts cover seen from above: the convex hull of their plan projection. */
export const footprint = (parts: Part[]): Ring => convexHull(parts.flatMap(p => partVertices(p).map(v => [v[0], v[1]] as Vec2)))
