import { arrangement, type Arrangement, type Face } from '../geometry/arrangement'
import { wallSegments } from '../geometry/walls'
import { overlapArea } from '../geometry/overlap'
import { labelPoint } from '../geometry/label-point'
import { copyRing, type Vec2, type Polygon } from '../geometry/vector'
import type { Level, Unit } from './types'
import type { LineLike } from '../geometry/walls'
import { uid } from './document'

export interface UnitFace extends Face {
  signature: string
  anchor: Vec2
}

export interface UnitTopology extends Omit<Arrangement, 'faces'> {
  faces: UnitFace[]
}

const ownersOf = (g: Arrangement, halfEdges: number[]): string =>
  [...new Set(halfEdges.flatMap(h => g.edges[g.halfEdges[h].edge].owners))].sort().join('|')

/** A line graph with a provenance signature and a label anchor per face. */
export function wallTopology(walls: LineLike[]): UnitTopology {
  const g = arrangement(wallSegments(walls))
  const faces = g.faces.map(f => {
    const outer = ownersOf(g, f.halfEdges)
    const holes = f.holeHalfEdges.map(hs => ownersOf(g, hs)).sort()
    const signature = outer + (holes.length ? '::holes:' + holes.join(';') : '')
    return { ...f, signature, anchor: labelPoint({ outer: f.points, holes: f.holes }, f.sample) }
  })
  return { ...g, faces }
}

const facePolygon = (f: UnitFace): Polygon => ({ outer: f.points, holes: f.holes })
const significantUnit = (u: Unit): boolean => !!(u.name || u.ref)

/** Anything with declared identity carried across re-enumeration. */
export interface Identified {
  id: string
  signature: string
  polygon: Polygon
}

function unitFrom(f: UnitFace, existing?: Unit): Unit {
  return {
    id: existing?.id ?? uid(),
    name: existing?.name ?? '',
    category: existing?.category ?? 'unspecified',
    signature: f.signature,
    polygon: { outer: copyRing(f.points), holes: f.holes.map(copyRing) },
    anchor: [f.anchor[0], f.anchor[1]],
    hidden: existing?.hidden ?? false,
    ...(existing?.ref ? { ref: { ...existing.ref } } : {}),
    ...(existing?.outside ? { outside: true as const } : {})
  }
}

export interface UnitChoice {
  index: number
  candidates: Unit[]
  selected: string | null
}

export interface ReconcileResult {
  units: Unit[]
  /** Existing named units whose identity cannot be assigned automatically. */
  conflicts: Unit[]
  faces: UnitFace[]
  choices: UnitChoice[]
}

export interface FaceReconcile<T> {
  records: T[]
  conflicts: T[]
  assigned: Map<number, T>
  weight: (record: T, index: number) => number
}

/**
 * Carries declared identity from existing records onto freshly enumerated
 * faces. Unique signature matches win first; changed boundaries fall back to
 * an overlap-area matrix; an ambiguous split or merge of a significant
 * record is reported as a conflict for the user to resolve.
 */
export function reconcileFaces<T extends Identified>(existing: T[], faces: UnitFace[], make: (face: UnitFace, existing?: T) => T, significant: (record: T) => boolean): FaceReconcile<T> {
  const assigned = new Map<number, T>()
  const used = new Set<string>()
  faces.forEach((f, i) => {
    const candidates = existing.filter(u => u.signature === f.signature)
    if (candidates.length === 1 && faces.filter(n => n.signature === f.signature).length === 1) {
      assigned.set(i, candidates[0])
      used.add(candidates[0].id)
    }
  })

  const remaining = existing.filter(u => !used.has(u.id))
  const indices = faces.map((_, i) => i).filter(i => !assigned.has(i))
  const polygons = faces.map(facePolygon)
  const weights = new Map<string, number>()
  for (const old of remaining) {
    for (const i of indices) {
      const value = overlapArea(old.polygon, polygons[i])
      if (value > 0) weights.set(`${old.id}:${i}`, value)
    }
  }
  const weight = (u: T, i: number) => weights.get(`${u.id}:${i}`) ?? 0
  const oldFor = (i: number) => remaining.filter(u => weight(u, i) > 1e-6)
  const newFor = (u: T) => indices.filter(i => weight(u, i) > 1e-6)

  const conflicts: T[] = []
  for (const u of remaining.filter(significant)) {
    const ns = newFor(u)
    if (ns.length !== 1 || oldFor(ns[0]).some(o => o.id !== u.id && significant(o))) conflicts.push(u)
  }

  for (const i of indices) {
    const candidates = oldFor(i).sort((a, b) => Number(significant(b)) - Number(significant(a)) || weight(b, i) - weight(a, i))
    const u = candidates.find(c => !used.has(c.id))
    if (u) {
      assigned.set(i, u)
      used.add(u.id)
    }
  }

  return { records: faces.map((f, i) => make(f, assigned.get(i))), conflicts, assigned, weight }
}

export function reconcileUnits(existing: Unit[], faces: UnitFace[]): ReconcileResult {
  const r = reconcileFaces(existing, faces, unitFrom, significantUnit)
  const choices = faces.map((f, i) => ({
    index: i,
    candidates: existing.filter(u => u.signature === f.signature || r.weight(u, i) > 1e-6),
    selected: r.assigned.get(i)?.id ?? null
  }))
  return { units: r.records, conflicts: r.conflicts, faces, choices }
}

/** Applies explicit identity choices; named units nobody kept are archived. */
export function resolveUnits(existing: Unit[], faces: UnitFace[], choices: (string | null)[]): { units: Unit[]; archived: Unit[] } {
  const used = new Set<string>()
  const units = faces.map((f, i) => {
    const id = choices[i]
    const u = id ? existing.find(e => e.id === id) : undefined
    if (id && !u) throw new Error('Choose an existing unit or a new unit.')
    if (u && used.has(u.id)) throw new Error('A unit identity can only be kept by one resulting unit.')
    if (u) used.add(u.id)
    return unitFrom(f, u)
  })
  return { units, archived: existing.filter(u => !used.has(u.id) && significantUnit(u)) }
}

/** Faces thinner than this are construction slivers, never rooms. */
export const MIN_UNIT_AREA = 0.01

export function deriveUnits(level: Level): ReconcileResult {
  return reconcileUnits(level.units, wallTopology(level.walls).faces.filter(f => f.netArea >= MIN_UNIT_AREA))
}
