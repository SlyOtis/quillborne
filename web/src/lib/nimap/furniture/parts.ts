import type { Polygon, Vec2 } from '../geometry/vector'

/** A point or direction in metres: x east, y north, z up, as the document's plan with height added. */
export type Vec3 = [number, number, number]

/**
 * An affine map as a 3×4 matrix in column order: the images of the x, y
 * and z axes, then the translation.
 */
export type Transform = readonly [number, number, number, number, number, number, number, number, number, number, number, number]

export const IDENTITY: Transform = [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0]

export const translation = (x: number, y: number, z = 0): Transform => [1, 0, 0, 0, 1, 0, 0, 0, 1, x, y, z]

export const scaling = (x: number, y: number, z: number): Transform => [x, 0, 0, 0, y, 0, 0, 0, z, 0, 0, 0]

/** A turn about the vertical axis, counter-clockwise seen from above. */
export function turning(angle: number): Transform {
  const c = Math.cos(angle)
  const s = Math.sin(angle)
  return [c, s, 0, -s, c, 0, 0, 0, 1, 0, 0, 0]
}

/** A tip of the vertical toward +x by `angle` radians, turning about the y axis; a negative angle lifts +x. */
export function tipping(angle: number): Transform {
  const c = Math.cos(angle)
  const s = Math.sin(angle)
  return [c, 0, -s, 0, 1, 0, s, 0, c, 0, 0, 0]
}

/**
 * The frame of a thing standing at `at` with its front toward `front`:
 * the local y axis becomes `front`, x its right, z stays up. Placements
 * say which way a thing faces, never by how much to turn it.
 */
export function facing(at: Vec2, front: Vec2, elevation = 0): Transform {
  const l = Math.hypot(front[0], front[1]) || 1
  const fx = front[0] / l
  const fy = front[1] / l
  return [fy, -fx, 0, fx, fy, 0, 0, 0, 1, at[0], at[1], elevation]
}

/** `a` applied after `b`. */
export function compose(a: Transform, b: Transform): Transform {
  const m = (i: number, j: number) => a[i] * b[j] + a[i + 3] * b[j + 1] + a[i + 6] * b[j + 2]
  return [
    m(0, 0), m(1, 0), m(2, 0),
    m(0, 3), m(1, 3), m(2, 3),
    m(0, 6), m(1, 6), m(2, 6),
    m(0, 9) + a[9], m(1, 9) + a[10], m(2, 9) + a[11]
  ]
}

/** Transforms applied right to left: `chain(a, b, c)` is a after b after c. */
export const chain = (...transforms: Transform[]): Transform => transforms.reduceRight((acc, t) => compose(t, acc), IDENTITY)

export const applyTransform = (t: Transform, p: Vec3): Vec3 => [
  t[0] * p[0] + t[3] * p[1] + t[6] * p[2] + t[9],
  t[1] * p[0] + t[4] * p[1] + t[7] * p[2] + t[10],
  t[2] * p[0] + t[5] * p[1] + t[8] * p[2] + t[11]
]

export const determinant = (t: Transform): number => t[0] * (t[4] * t[8] - t[7] * t[5]) - t[3] * (t[1] * t[8] - t[7] * t[2]) + t[6] * (t[1] * t[5] - t[4] * t[2])

/** The matrix that carries surface normals through `t`: the inverse transpose of its linear part, up to scale. */
export function normalMatrix(t: Transform): Transform {
  const s = determinant(t) < 0 ? -1 : 1
  return [
    s * (t[4] * t[8] - t[7] * t[5]), s * (t[6] * t[5] - t[3] * t[8]), s * (t[3] * t[7] - t[6] * t[4]),
    s * (t[7] * t[2] - t[1] * t[8]), s * (t[0] * t[8] - t[6] * t[2]), s * (t[6] * t[1] - t[0] * t[7]),
    s * (t[1] * t[5] - t[4] * t[2]), s * (t[3] * t[2] - t[0] * t[5]), s * (t[0] * t[4] - t[3] * t[1]),
    0, 0, 0
  ]
}

/**
 * The solids everything is built from, each in its own frame: a box
 * centred on x and y standing on z = 0, a cylinder (or cone frustum) on the
 * z axis standing on z = 0, a plan polygon extruded up from z = 0 (its top
 * scaled about the origin by `top`, so it tapers or flares), and a
 * blob, an icosahedron centred on the origin, for foliage.
 */
export type Shape =
  | { type: 'box'; size: Vec3 }
  | { type: 'cylinder'; radius: number; top?: number; height: number; segments?: number }
  | { type: 'prism'; polygon: Polygon; height: number; top?: number }
  | { type: 'blob'; radius: number }

/** What a part is made of. The room colours are for live status, put on a piece by the host, never by a recipe. */
export type PartMaterial = 'tableTop' | 'furniture' | 'furnitureDark' | 'sofa' | 'screen' | 'plant' | 'plantDark' | 'pot' | 'trunk' | 'pebble' | 'whiteboard' | 'metal' | 'blackGlass' | 'porcelain' | 'linen' | 'mirror' | 'wall' | 'slab'

/** What a part is for, where a rule has to find it: a seat, its back and arms, a screen and what holds it, an appliance's body and what is at its front. */
export type PartRole = 'seat' | 'back' | 'arm' | 'screen' | 'stand' | 'board' | 'tray' | 'top' | 'support' | 'body' | 'front'

export interface Part {
  shape: Shape
  material: PartMaterial
  transform: Transform
  role?: PartRole
}

/** Parts moved as one: `t` applied after each part's own transform. */
export const transformParts = (parts: Part[], t: Transform): Part[] => parts.map(p => ({ ...p, transform: compose(t, p.transform) }))

const withRole = (part: Part, role?: PartRole): Part => (role ? { ...part, role } : part)

/** A box of `size` whose bottom centre is at `at`. */
export const boxPart = (size: Vec3, material: PartMaterial, at: Vec3 = [0, 0, 0], role?: PartRole): Part =>
  withRole({ shape: { type: 'box', size }, material, transform: translation(...at) }, role)

/** A cylinder whose bottom centre is at `at`; `top` makes it a cone frustum, and a cone with a point at 0. */
export const cylinderPart = (radius: number, height: number, material: PartMaterial, at: Vec3 = [0, 0, 0], options: { top?: number; segments?: number; role?: PartRole } = {}): Part =>
  withRole({ shape: { type: 'cylinder', radius, height, ...(options.top !== undefined ? { top: options.top } : {}), ...(options.segments ? { segments: options.segments } : {}) }, material, transform: translation(...at) }, options.role)

/** A plan polygon extruded from `from` up by `height`. */
export const prismPart = (polygon: Polygon, from: number, height: number, material: PartMaterial, role?: PartRole): Part =>
  withRole({ shape: { type: 'prism', polygon, height }, material, transform: translation(0, 0, from) }, role)

/** A blob centred at `at`, stretched by `stretch` along its own axes and turned by `angle` about the vertical. */
export const blobPart = (radius: number, material: PartMaterial, at: Vec3, stretch: Vec3 = [1, 1, 1], angle = 0): Part => ({
  shape: { type: 'blob', radius },
  material,
  transform: chain(translation(...at), turning(angle), scaling(...stretch))
})
