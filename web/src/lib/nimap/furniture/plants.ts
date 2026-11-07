import type { Polygon, Ring, Vec2 } from '../geometry/vector'
import { bounds, distanceToSegment, pointInPolygon } from '../geometry/vector'
import { labelPoint } from '../geometry/label-point'
import type { Part, Vec3 } from './parts'
import { blobPart, boxPart, chain, cylinderPart, prismPart, scaling, tipping, translation, turning } from './parts'

/** Numbers in [0, 1) from a seed (mulberry32): the same seed grows the same plant. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const foliage = (rnd: () => number) => (rnd() < 0.3 ? 'plantDark' : 'plant')

const between = (rnd: () => number, a: number, b: number) => a + (b - a) * rnd()

/**
 * The bush's crown: a base blob of radius `first`, half sunk into the soil
 * at `soil`, and three to five blobs each grown out of one already there,
 * overlapping it, so the crown holds together whatever the seed.
 */
function bushCrown(at: Vec2, soil: number, first: number, rnd: () => number): Part[] {
  const blobs: { at: Vec3; r: number }[] = [{ at: [at[0], at[1], soil + first * 0.55], r: first }]
  const count = 3 + Math.floor(rnd() * 3)
  for (let i = 0; i < count; i++) {
    const parent = blobs[Math.floor(rnd() * blobs.length)]
    const r = parent.r * between(rnd, 0.55, 0.8)
    const azimuth = rnd() * 2 * Math.PI
    const rise = between(rnd, 0.2, 1)
    const d = (parent.r + r) * 0.55
    blobs.push({ at: [parent.at[0] + d * Math.cos(rise) * Math.cos(azimuth), parent.at[1] + d * Math.cos(rise) * Math.sin(azimuth), parent.at[2] + d * Math.sin(rise)], r })
  }
  return blobs.map(b => blobPart(b.r, foliage(rnd), b.at, [1, 1, 1], rnd() * Math.PI))
}

/** A round bush in a pot: what `pottedPlant` grows for the bush kind. */
function bush(seed: number, size = 1): Part[] {
  const rnd = seededRandom(seed)
  const potHeight = 0.3 * size
  const first = between(rnd, 0.22, 0.27) * size
  return [cylinderPart(0.14 * size, potHeight, 'pot', [0, 0, 0], { top: 0.18 * size, segments: 14 }), ...bushCrown([0, 0], potHeight, first, rnd)]
}

/** How finely a surface is sampled for bare soil. */
const SOIL_STEP = 0.03

/** The kinds of planting: how one plant grows on its spot. */
export const PLANT_KINDS = ['topiary', 'bush', 'leaves', 'grass', 'sticks', 'blocks'] as const

export type PlantKind = (typeof PLANT_KINDS)[number]

export interface PlantingOptions {
  kind?: PlantKind
  /** Scales every plant. */
  size?: number
  /** 1 is the kind's natural spacing; lower plants farther apart. */
  density?: number
  /** Grey pebbles over the soil between the plants. */
  pebbles?: boolean
}

/** A plant's place on the soil and how far it reaches. */
export interface PlantSpot {
  at: Vec2
  radius: number
}

interface Kind {
  /** A plant's reach at size 1, as a range. */
  radius: [number, number]
  /** How far apart plants stand, in reaches: under 1 they overlap into one mass. */
  spacing: number
  /** One plant grown on its spot; the blocks kind grows all its plants together as one field instead. */
  grow(spot: PlantSpot, top: number, rnd: () => number): Part[]
}

/** The side of a cube in the blocks kind, at size 1. */
const BLOCK = 0.07

/**
 * Plants of cubes: every spot is a dome, and the surface is cut into
 * columns on a grid of cubes, each as tall as the highest dome over it in
 * whole half-cubes, give or take one, so a lone dome is a stepped mound
 * and neighbouring domes merge into one. One green only: the steps carry
 * the shape, and mixed shades read as a game of blocks.
 */
function blocks(polygon: Polygon, top: number, spots: PlantSpot[], rnd: () => number, size: number): Part[] {
  const cell = BLOCK * size
  const step = cell / 2
  const box = bounds(polygon.outer)
  const nx = Math.max(1, Math.round((box.maxX - box.minX) / cell))
  const ny = Math.max(1, Math.round((box.maxY - box.minY) / cell))
  const w = (box.maxX - box.minX) / nx
  const d = (box.maxY - box.minY) / ny
  const parts: Part[] = []
  for (let i = 0; i < nx; i++) {
    for (let j = 0; j < ny; j++) {
      const c: Vec2 = [box.minX + (i + 0.5) * w, box.minY + (j + 0.5) * d]
      const wobble = Math.floor(rnd() * 3) - 1
      if (!pointInPolygon(c, polygon)) continue
      const dome = Math.max(0, ...spots.map(s => {
        const t = Math.hypot(c[0] - s.at[0], c[1] - s.at[1]) / s.radius
        return t < 1 ? s.radius * 1.1 * Math.sqrt(1 - t * t) : 0
      }))
      if (dome <= 0) continue
      const height = Math.max(1, Math.round(dome / step) + wobble) * step
      parts.push(boxPart([w, d, height + 0.01], 'plant', [c[0], c[1], top - 0.01]))
    }
  }
  return parts
}

/** A leaf: a pointed flat blade along +x from its base, `length` long. */
const leafShape = (length: number, width: number): Polygon => ({
  outer: [[0, 0], [0.25 * length, 0.5 * width], [0.6 * length, 0.5 * width], [length, 0], [0.6 * length, -0.5 * width], [0.25 * length, -0.5 * width]],
  holes: []
})

const KINDS: Record<PlantKind, Kind> = {
  bush: {
    radius: [0.22, 0.27],
    spacing: 2,
    grow: (spot, top, rnd) => bushCrown(spot.at, top, spot.radius, rnd)
  },
  grass: {
    radius: [0.07, 0.1],
    spacing: 1.2,
    grow(spot, top, rnd) {
      const blades = 7 + Math.floor(rnd() * 6)
      const parts: Part[] = []
      for (let i = 0; i < blades; i++) {
        const length = spot.radius * between(rnd, 2.2, 3.6)
        const lean = between(rnd, 0.1, 0.55)
        parts.push({ ...cylinderPart(spot.radius * 0.2, length, foliage(rnd), [0, 0, 0], { top: 0, segments: 3 }), transform: chain(translation(spot.at[0], spot.at[1], top - 0.01), turning(rnd() * 2 * Math.PI), tipping(lean), scaling(0.45, 1, 1)) })
      }
      return parts
    }
  },
  leaves: {
    radius: [0.13, 0.19],
    spacing: 1.1,
    grow(spot, top, rnd) {
      const count = 6 + Math.floor(rnd() * 4)
      const parts: Part[] = []
      for (let i = 0; i < count; i++) {
        const inner = i >= count - 2
        const length = spot.radius * (inner ? between(rnd, 0.7, 0.9) : between(rnd, 0.9, 1.15))
        const pitch = inner ? between(rnd, 0.9, 1.2) : between(rnd, 0.25, 0.6)
        const azimuth = (2 * Math.PI * i) / count + between(rnd, -0.3, 0.3)
        parts.push({ ...prismPart(leafShape(length, length * 0.45), 0, 0.01, foliage(rnd)), transform: chain(translation(spot.at[0], spot.at[1], top - 0.005), turning(azimuth), tipping(-pitch)) })
      }
      return parts
    }
  },
  sticks: {
    radius: [0.05, 0.08],
    spacing: 1.5,
    grow(spot, top, rnd) {
      const count = 3 + Math.floor(rnd() * 4)
      const parts: Part[] = []
      for (let i = 0; i < count; i++) {
        const side = spot.radius * between(rnd, 0.35, 0.55)
        const height = spot.radius * between(rnd, 2.5, 6)
        const offset = spot.radius * 0.55 * Math.sqrt(rnd())
        const azimuth = rnd() * 2 * Math.PI
        parts.push({ ...boxPart([side, side, height], foliage(rnd)), transform: chain(translation(spot.at[0] + offset * Math.cos(azimuth), spot.at[1] + offset * Math.sin(azimuth), top - 0.01), turning(rnd() * Math.PI), tipping(between(rnd, -0.12, 0.12))) })
      }
      return parts
    }
  },
  blocks: {
    radius: [0.14, 0.2],
    spacing: 1,
    grow: () => []
  },
  topiary: {
    radius: [0.09, 0.13],
    spacing: 1.25,
    grow(spot, top, rnd) {
      const trunk = spot.radius * between(rnd, 0.8, 1.6)
      return [cylinderPart(spot.radius * 0.14, trunk + spot.radius * 0.5, 'trunk', [spot.at[0], spot.at[1], top - 0.01], { segments: 6 }), blobPart(spot.radius, foliage(rnd), [spot.at[0], spot.at[1], top + trunk + spot.radius * 0.8], [1, 1, 1], rnd() * Math.PI)]
    }
  }
}

/** How far apart each kind's plants stand, in reaches. */
export const PLANT_SPACING = Object.fromEntries(PLANT_KINDS.map(k => [k, KINDS[k].spacing])) as Record<PlantKind, number>

/**
 * Where the plants of a planting stand: every spot of the soil that is
 * farther than the kind's spacing (over the density) from the plants
 * already there gets a plant. Spots are visited deepest first, farthest
 * from the edges with a little seeded jitter, so a narrow run is planted
 * down its middle and a wide bed from its centre out, with few plants.
 */
export function plantingSpots(polygon: Polygon, seed: number, options: PlantingOptions = {}): PlantSpot[] {
  const kind = KINDS[options.kind ?? 'topiary']
  const size = options.size ?? 1
  const density = options.density ?? 1
  const rnd = seededRandom(seed)
  const box = bounds(polygon.outer)
  const soil: Vec2[] = []
  for (let x = box.minX + SOIL_STEP / 2; x < box.maxX; x += SOIL_STEP) {
    for (let y = box.minY + SOIL_STEP / 2; y < box.maxY; y += SOIL_STEP) if (pointInPolygon([x, y], polygon)) soil.push([x, y])
  }
  const rings = [polygon.outer, ...polygon.holes]
  const depth = (p: Vec2) => Math.min(...rings.flatMap(r => r.map((a, i) => distanceToSegment(p, a, r[(i + 1) % r.length]))))
  const order = soil.map(p => ({ p, key: depth(p) + rnd() * 0.04 })).sort((a, b) => b.key - a.key)
  soil.splice(0, soil.length, ...order.map(o => o.p))
  if (!soil.length) soil.push(labelPoint(polygon))
  const spots: PlantSpot[] = []
  const reach = (s: PlantSpot) => (s.radius * kind.spacing) / density - SOIL_STEP
  for (const at of soil) {
    if (spots.some(s => Math.hypot(at[0] - s.at[0], at[1] - s.at[1]) <= reach(s))) continue
    spots.push({ at, radius: between(rnd, kind.radius[0], kind.radius[1]) * size })
  }
  return spots
}

/**
 * Planting as a fill over a surface at height `top`: plants of one kind on
 * the spots `plantingSpots` finds, each grown from the soil, and pebbles
 * over the soil between them when asked for.
 */
export function planting(polygon: Polygon, top: number, seed: number, options: PlantingOptions = {}): Part[] {
  const kind = KINDS[options.kind ?? 'topiary']
  const rnd = seededRandom(seed + 1)
  const spots = plantingSpots(polygon, seed, options)
  const parts = options.kind === 'blocks' ? blocks(polygon, top, spots, rnd, options.size ?? 1) : spots.flatMap(spot => kind.grow(spot, top, rnd))
  return options.pebbles ? [...pebbles(polygon, top, seed + 2), ...parts] : parts
}

/** Small grey stones over the soil, on a jittered grid inside the outline. */
function pebbles(polygon: Polygon, top: number, seed: number): Part[] {
  const rnd = seededRandom(seed)
  const box = bounds(polygon.outer)
  const step = 0.05
  const parts: Part[] = []
  for (let x = box.minX + step / 2; x < box.maxX; x += step) {
    for (let y = box.minY + step / 2; y < box.maxY; y += step) {
      const p: Vec2 = [x + between(rnd, -0.015, 0.015), y + between(rnd, -0.015, 0.015)]
      const r = between(rnd, 0.02, 0.032)
      const angle = rnd() * Math.PI
      if (pointInPolygon(p, polygon)) parts.push(blobPart(r, 'pebble', [p[0], p[1], top], [1, 1, 0.5], angle))
    }
  }
  return parts
}

/** A plant of a kind in a round pot; a bush in a pot is the bush. */
export function pottedPlant(seed: number, options: PlantingOptions = {}): Part[] {
  if (options.kind === 'bush') return bush(seed, options.size)
  const height = 0.3
  const rim = 0.17
  const soil: Polygon = { outer: Array.from({ length: 16 }, (_, i): Vec2 => [rim * 0.9 * Math.cos((i * Math.PI) / 8), rim * 0.9 * Math.sin((i * Math.PI) / 8)]), holes: [] }
  return [cylinderPart(0.13, height, 'pot', [0, 0, 0], { top: rim, segments: 14 }), ...planting(soil, height, seed, options)]
}

/** A planter box of the outline, `height` tall, planted on top. */
export const planter = (outline: Ring, height: number, seed: number, options: PlantingOptions = {}): Part[] => {
  const polygon: Polygon = { outer: outline, holes: [] }
  return [prismPart(polygon, 0, height, 'furnitureDark'), ...planting(polygon, height, seed, options)]
}
