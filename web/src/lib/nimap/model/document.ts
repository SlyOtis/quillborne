import { FORMAT_VERSION, READER_VERSION } from './version'
import type { Level, Line, MapDocument, Wall } from './types'
import { distance } from '../geometry/vector'
import { isUnitCategory } from './categories'

import { DOCUMENT_GRID, MIN_FEATURE } from './precision'

/** A line of no width on the wall layer is an edge: it bounds regions, such as a balcony's or an atrium's edge, and stands no wall. */
export const WALL_WIDTH_MIN = 0
export const WALL_WIDTH_MAX = 1
export const WALL_SEGMENT_MIN = MIN_FEATURE
export const DOCUMENT_PRECISION = DOCUMENT_GRID
export { quantize } from './precision'

export const uid = (): string => crypto.randomUUID()

export function createLevel(init: { name: string; ordinal?: number; elevation?: number; id?: string } & Partial<Pick<Level, 'walls' | 'units' | 'spaces' | 'fixtureLines' | 'fixtures' | 'openings' | 'reference'>>): Level {
  return {
    id: init.id ?? uid(),
    name: init.name,
    ordinal: init.ordinal ?? 0,
    elevation: init.elevation ?? 0,
    walls: init.walls ?? [],
    units: init.units ?? [],
    fixtureLines: init.fixtureLines ?? [],
    fixtures: init.fixtures ?? [],
    openings: init.openings ?? [],
    ...(init.spaces ? { spaces: init.spaces } : {}),
    ...(init.reference ? { reference: init.reference } : {})
  }
}

export function createDocument(init: { name: string; id?: string; levels?: Level[] }): MapDocument {
  return { format: 'nimap', version: FORMAT_VERSION, id: init.id ?? uid(), name: init.name, levels: init.levels ?? [] }
}

const finitePoint = (p: unknown): p is [number, number] => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite)

export function validateLine(line: Line, what = 'Line'): void {
  if (!Array.isArray(line.points) || line.points.length !== 2 || !line.points.every(finitePoint)) {
    throw new Error(`${what} ${line.id}: needs exactly two finite points.`)
  }
  if (distance(line.points[0], line.points[1]) < WALL_SEGMENT_MIN) throw new Error(`${what} ${line.id}: segment 1 is shorter than ${WALL_SEGMENT_MIN} metres.`)
  if (line.curve && (line.curve.length !== 2 || !line.curve.every(finitePoint))) throw new Error(`${what} ${line.id}: a curve needs two finite handles.`)
}

export function validateWall(wall: Wall): void {
  validateLine(wall, 'Wall')
  if (!Number.isFinite(wall.width) || wall.width < WALL_WIDTH_MIN || wall.width > WALL_WIDTH_MAX) {
    throw new Error(`Wall ${wall.id}: width must be between ${WALL_WIDTH_MIN} and ${WALL_WIDTH_MAX} metres.`)
  }
  if (wall.height !== undefined && (!Number.isFinite(wall.height) || wall.height <= 0)) throw new Error(`Wall ${wall.id}: height must be positive.`)
  if (wall.material !== undefined && wall.material !== 'glass') throw new Error(`Wall ${wall.id}: unknown material ${String(wall.material)}.`)
}

export function validateLevel(level: Level): void {
  if (!Number.isInteger(level.ordinal)) throw new Error(`Level ${level.id}: ordinal must be an integer.`)
  if (!Number.isFinite(level.elevation)) throw new Error(`Level ${level.id}: elevation must be finite.`)
  if (level.height !== undefined && (!Number.isFinite(level.height) || level.height <= 0)) throw new Error(`Level ${level.id}: height must be positive.`)
  const ids = new Set<string>()
  for (const item of [...level.walls, ...level.units, ...(level.spaces ?? []), ...level.fixtureLines, ...level.fixtures, ...level.openings]) {
    if (typeof item.id !== 'string' || !item.id) throw new Error(`Level ${level.id}: every record needs a string id.`)
    if (ids.has(item.id)) throw new Error(`Level ${level.id}: duplicate id ${item.id}.`)
    ids.add(item.id)
  }
  for (const wall of level.walls) validateWall(wall)
  for (const line of level.fixtureLines) validateLine(line, 'Fixture line')
  for (const o of level.openings) {
    if (!finitePoint(o.at) || !(o.width > 0) || !Number.isFinite(o.from) || !(o.to > o.from)) throw new Error(`Opening ${o.id}: needs a finite centre, a positive width and a band from below to above.`)
  }
  if (level.reference) {
    const r = level.reference
    if (!r.url || !(r.widthPx > 0) || !(r.heightPx > 0) || !(r.metresPerPixel > 0)) throw new Error(`Level ${level.id}: reference needs a url, pixel size and a positive scale.`)
  }
  for (const unit of level.units) {
    if (!isUnitCategory(unit.category)) throw new Error(`Unit ${unit.id}: unknown category ${String(unit.category)}.`)
    if (unit.polygon.outer.length < 3) throw new Error(`Unit ${unit.id}: polygon needs at least three points.`)
  }
  const units = new Set(level.units.map(u => u.id))
  const taken = new Set<string>()
  for (const space of level.spaces ?? []) {
    if (!isUnitCategory(space.category)) throw new Error(`Space ${space.id}: unknown category ${String(space.category)}.`)
    for (const id of space.units) {
      if (!units.has(id)) throw new Error(`Space ${space.id}: no unit ${id}.`)
      if (taken.has(id)) throw new Error(`Space ${space.id}: unit ${id} already belongs to a space.`)
      taken.add(id)
    }
  }
}

export function validateDocument(doc: MapDocument): void {
  if (doc.format !== 'nimap' || !(doc.version >= 1) || (doc.minReader ?? doc.version) > READER_VERSION) throw new Error(`Not a nimap document this reader (version ${READER_VERSION}) can read.`)
  const ids = new Set<string>([doc.id])
  for (const level of doc.levels) {
    if (ids.has(level.id)) throw new Error(`Duplicate level id ${level.id}.`)
    ids.add(level.id)
    validateLevel(level)
  }
}
