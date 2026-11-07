import type { Vec2 } from '../geometry/vector'
import { distanceToSegment, pointInPolygon } from '../geometry/vector'
import type { Fixture, Level, Line, MapDocument, Opening, Unit, Wall } from './types'
import type { Binding } from './bindings'
import { isUnitCategory, FIXTURE_KINDS } from './categories'
import { validateLine, validateWall } from './document'
import { deriveUnits } from './units'
import { deriveFixtures } from './fixtures'
import { FORMAT_VERSION, READER_VERSION } from './version'

export { FORMAT_VERSION, READER_VERSION }

/**
 * How a document read: `ok`, as meant; `degraded`, shown with what this
 * reader could not use left out (each said in `warnings`); `tooNew`, from a
 * writer whose document this reader would show wrongly, so it shows none;
 * `invalid`, not a map document at all.
 */
export type ReadStatus = 'ok' | 'degraded' | 'tooNew' | 'invalid'

export interface ReadResult {
  status: ReadStatus
  document: MapDocument | null
  warnings: string[]
}

type Loose = Record<string, unknown>

/** A room as stored: its identity and what was declared about it, and a point inside it that finds its face again. */
export interface StoredUnit {
  id: string
  at: Vec2
  name?: string
  category?: Unit['category']
  hidden?: true
  outside?: true
  ref?: Unit['ref']
}

/** A fixture as stored: all but what its lines give, with a point on it that finds its face or path again. */
export type StoredFixture = Omit<Fixture, 'signature' | 'polygon' | 'line' | 'anchor'> & { at: Vec2 }

/** Each step from a version to the next, keyed by the version it reads. None needed yet: a version 1 document is read in full as it is. */
const MIGRATIONS: Record<number, (doc: Loose) => Loose> = {}

const isObject = (v: unknown): v is Loose => !!v && typeof v === 'object' && !Array.isArray(v)
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])
const isPoint = (p: unknown): p is Vec2 => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite)

/** The records of one kind that pass their check; each one dropped is said. */
function kept<T>(records: unknown[], what: string, check: (record: T) => void, warnings: string[]): T[] {
  return records.filter((record): record is T => {
    try {
      if (!isObject(record) || typeof record.id !== 'string') throw new Error('not a record with an id')
      check(record as T)
      return true
    } catch (error) {
      warnings.push(`${what} ${isObject(record) ? String(record.id) : '?'} left out: ${(error as Error).message}`)
      return false
    }
  })
}

const knownKind = <T extends { id: string; kind: string }>(f: T, where: string, warnings: string[]): T => {
  if ((FIXTURE_KINDS as readonly string[]).includes(f.kind)) return f
  warnings.push(`${where} fixture ${f.id} is a ${String(f.kind)}, drawn as a plain object.`)
  return { ...f, kind: 'object' }
}

const knownCategory = <T extends { id: string; category?: unknown }>(u: T, where: string, warnings: string[]): T => {
  if (u.category === undefined || isUnitCategory(u.category)) return u
  warnings.push(`${where} room ${u.id} has category ${String(u.category)}, read as unspecified.`)
  return { ...u, category: 'unspecified' }
}

/** Whether a point lies on a path, within a tenth of a millimetre. */
const onPath = (p: Vec2, path: Vec2[]): boolean => path.slice(1).some((b, i) => distanceToSegment(p, path[i], b) < 1e-4)

/**
 * Rooms and fixtures derived from the level's lines, each stored record
 * given to the face or path its point lies in; a face nobody stored stays
 * a plain room or object. A stored record whose point no longer lies in
 * any face is left out and said.
 */
function derive(level: Level, units: StoredUnit[], fixtures: StoredFixture[], where: string, warnings: string[]): Pick<Level, 'units' | 'fixtures'> {
  let derivedUnits: Unit[] = []
  let derivedFixtures: Fixture[] = []
  try {
    derivedUnits = deriveUnits({ ...level, units: [] }).units
  } catch (error) {
    warnings.push(`${where} rooms could not be derived: ${(error as Error).message}`)
  }
  try {
    derivedFixtures = deriveFixtures({ ...level, fixtures: [] }).fixtures
  } catch (error) {
    warnings.push(`${where} fixtures could not be derived: ${(error as Error).message}`)
  }
  const claimed = new Set<number>()
  const claim = <T>(records: T[], hits: (record: T) => boolean): number => {
    const i = records.findIndex((r, index) => !claimed.has(index) && hits(r))
    if (i >= 0) claimed.add(i)
    return i
  }
  for (const stored of units) {
    const i = claim(derivedUnits, u => pointInPolygon(stored.at, u.polygon))
    if (i < 0) {
      warnings.push(`${where} room ${stored.id} no longer lies on any room and was left out.`)
      continue
    }
    const { at: _at, ...declared } = stored
    derivedUnits[i] = { ...derivedUnits[i], ...declared, name: declared.name ?? '', category: declared.category ?? 'unspecified', hidden: !!declared.hidden }
  }
  claimed.clear()
  for (const stored of fixtures) {
    const i = claim(derivedFixtures, f => (f.polygon ? pointInPolygon(stored.at, f.polygon) : !!f.line && onPath(stored.at, f.line)))
    if (i < 0) {
      warnings.push(`${where} fixture ${stored.id} no longer lies on any traced shape and was left out.`)
      continue
    }
    const { at: _at, ...declared } = stored
    derivedFixtures[i] = { ...derivedFixtures[i], ...declared }
  }
  return { units: derivedUnits, fixtures: derivedFixtures }
}

function readLevel(raw: Loose, index: number, version: number, warnings: string[]): Level | null {
  if (typeof raw.id !== 'string') {
    warnings.push(`Level ${index + 1} left out: it has no id.`)
    return null
  }
  const where = `Level ${String(raw.name ?? raw.id)}:`
  const walls = kept<Wall>(list(raw.walls), `${where} wall`, validateWall, warnings)
  const fixtureLines = kept<Line>(list(raw.fixtureLines), `${where} fixture line`, line => validateLine(line, 'Fixture line'), warnings)
  const openings = kept<Opening>(list(raw.openings), `${where} opening`, o => {
    if (!isPoint(o.at) || !(o.width > 0) || !(o.to > o.from)) throw new Error('needs a centre, a width and a band')
  }, warnings)
  const { floors: _legacy, height: storey, ...rest } = raw
  const height = typeof storey === 'number' && Number.isFinite(storey) && storey > 0 ? storey : undefined
  if (storey !== undefined && height === undefined) warnings.push(`${where} its ceiling height is not a positive number and was left out.`)
  const level: Level = {
    ...(rest as unknown as Level),
    name: typeof raw.name === 'string' ? raw.name : '',
    ordinal: Number.isInteger(raw.ordinal) ? (raw.ordinal as number) : index,
    elevation: Number.isFinite(raw.elevation) ? (raw.elevation as number) : 0,
    ...(height === undefined ? {} : { height }),
    walls,
    fixtureLines,
    openings,
    units: [],
    fixtures: []
  }
  if (version >= 2) {
    const units = kept<StoredUnit>(list(raw.units), `${where} room`, u => {
      if (!isPoint(u.at)) throw new Error('has no point to find it by')
    }, warnings).map(u => knownCategory(u, where, warnings))
    const fixtures = kept<StoredFixture>(list(raw.fixtures), `${where} fixture`, f => {
      if (!isPoint(f.at)) throw new Error('has no point to find it by')
    }, warnings).map(f => knownKind(f, where, warnings))
    return { ...level, ...derive(level, units, fixtures, where, warnings) }
  }
  const units = kept<Unit>(list(raw.units), `${where} room`, u => {
    if (!isObject(u.polygon) || !Array.isArray((u.polygon as Loose).outer)) throw new Error('has no outline')
  }, warnings).map(u => knownCategory(u, where, warnings))
  const fixtures = kept<Fixture>(list(raw.fixtures), `${where} fixture`, f => {
    if (typeof f.signature !== 'string') throw new Error('has no signature')
  }, warnings).map(f => knownKind(f, where, warnings))
  return { ...level, units, fixtures }
}

/**
 * A map document from anything stored, as the editor and the renderer hold
 * it: brought up to this reader's format through the migrations, rooms and
 * fixtures derived again from the lines where only their identity was
 * stored, and every record this reader cannot use left out and said, never
 * thrown. A document whose writer says an older reader would show it
 * wrongly (`minReader` above `READER_VERSION`) is refused as `tooNew`, so a
 * host keeps what it showed before.
 */
export function readDocument(input: unknown): ReadResult {
  if (!isObject(input) || input.format !== 'nimap' || typeof input.id !== 'string') return { status: 'invalid', document: null, warnings: ['Not a map document.'] }
  let version = Number.isInteger(input.version) ? (input.version as number) : 1
  const minReader = Number.isInteger(input.minReader) ? (input.minReader as number) : version
  if (minReader > READER_VERSION) return { status: 'tooNew', document: null, warnings: [`This map needs a reader of version ${minReader}; this one is version ${READER_VERSION}.`] }
  const warnings: string[] = []
  let doc: Loose = input
  while (version < FORMAT_VERSION && MIGRATIONS[version]) {
    doc = MIGRATIONS[version](doc)
    version++
  }
  if (version > READER_VERSION) warnings.push(`Written in version ${version}; parts newer than version ${READER_VERSION} may be missing.`)
  const levels = list(doc.levels).flatMap((raw, i) => {
    if (!isObject(raw)) {
      warnings.push(`Level ${i + 1} left out: not a level.`)
      return []
    }
    const level = readLevel(raw, i, version, warnings)
    return level ? [level] : []
  })
  const document: MapDocument = { ...(doc as unknown as MapDocument), version: FORMAT_VERSION, levels }
  return { status: warnings.length ? 'degraded' : 'ok', document, warnings }
}

/** The oldest reader that shows a stored document as meant: version 2, since rooms and fixtures are no longer stored in full. */
export const minReaderOf = (_doc: MapDocument): number => 2

/** Whether a room carries anything a reader could not derive from the walls. */
const declaredUnit = (u: Unit, bound: Set<string>, spaced: Set<string>): boolean => bound.has(u.id) || spaced.has(u.id) || !!u.name || !!u.ref || u.hidden || !!u.outside || u.category !== 'unspecified'

/** Whether a fixture carries anything a reader could not derive from its lines. */
const declaredFixture = (f: Fixture, bound: Set<string>): boolean => bound.has(f.id) || f.kind !== 'object' || !!f.name || f.height !== undefined || !!f.recipe || !!f.roles || !!f.items?.length || !!f.ref

const storedUnit = (u: Unit): StoredUnit => ({
  id: u.id,
  at: u.anchor,
  ...(u.name ? { name: u.name } : {}),
  ...(u.category !== 'unspecified' ? { category: u.category } : {}),
  ...(u.hidden ? { hidden: true as const } : {}),
  ...(u.outside ? { outside: true as const } : {}),
  ...(u.ref ? { ref: u.ref } : {})
})

function storedFixture(f: Fixture): StoredFixture {
  const { signature: _signature, polygon: _polygon, line: _line, anchor, ...declared } = f
  return { ...declared, at: anchor }
}

/**
 * A document as it is stored: what was drawn (walls, fixture lines,
 * openings) and what was declared (the rooms and fixtures that carry a
 * name, a kind, a recipe, items, a link, or are bound in `bindings`, each
 * with a point inside it), stamped with the format this nimap writes and
 * the oldest reader it needs. Outlines, anchors and signatures are left
 * out: `readDocument` derives them again. Ids are kept as they are.
 */
export function writeDocument(doc: MapDocument, bindings: Binding[] = []): MapDocument {
  const bound = new Set(bindings.flatMap(b => b.features))
  const levels = doc.levels.map(level => {
    const spaced = new Set((level.spaces ?? []).flatMap(s => s.units))
    const { units, fixtures, floors: _legacy, ...drawn } = level as Level & { floors?: unknown }
    return {
      ...drawn,
      units: units.filter(u => declaredUnit(u, bound, spaced)).map(storedUnit),
      fixtures: fixtures.filter(f => declaredFixture(f, bound)).map(storedFixture)
    } as unknown as Level
  })
  return { ...doc, format: 'nimap', version: FORMAT_VERSION, minReader: minReaderOf(doc), levels }
}

/** Ids this document numbers itself: a short base 36 count, never a random id or a split's suffix. */
const SHORT_ID = /^[0-9a-z]{1,10}$/

/** Every string in a recipe's parameters that is an id renamed: its places name the lines they stand on. */
function renameDeep<T>(value: T, name: (id: string) => string): T {
  if (typeof value === 'string') return name(value) as T
  if (Array.isArray(value)) return value.map(v => renameDeep(v, name)) as T
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, renameDeep(v, name)])) as T
  return value
}

/** A level with every id it gives, and every id it names, renamed: never a name, a kind or anything outside the map. */
function renameLevel(level: Level, name: (id: string) => string): Level {
  return {
    ...level,
    id: name(level.id),
    walls: level.walls.map(w => ({ ...w, id: name(w.id) })),
    fixtureLines: level.fixtureLines.map(l => ({ ...l, id: name(l.id) })),
    openings: level.openings.map(o => ({ ...o, id: name(o.id) })),
    units: level.units.map(u => ({ ...u, id: name(u.id) })),
    fixtures: level.fixtures.map(f => ({
      ...f,
      id: name(f.id),
      ...(f.roles ? { roles: Object.fromEntries(Object.entries(f.roles).map(([line, role]) => [name(line), role])) } : {}),
      ...(f.recipe ? { recipe: { ...f.recipe, parameters: renameDeep(f.recipe.parameters, name) } } : {}),
      ...(f.items ? { items: f.items.map(i => ({ ...i, id: name(i.id) })) } : {})
    })),
    ...(level.spaces ? { spaces: level.spaces.map(sp => ({ ...sp, id: name(sp.id), units: sp.units.map(name) })) } : {})
  }
}

/** Every id a document gives its own records, in document order. */
function ownIds(doc: MapDocument): string[] {
  return doc.levels.flatMap(level => [
    level.id,
    ...level.walls.map(w => w.id),
    ...level.fixtureLines.map(l => l.id),
    ...level.openings.map(o => o.id),
    ...level.units.map(u => u.id),
    ...level.fixtures.flatMap(f => [f.id, ...(f.items ?? []).map(i => i.id)]),
    ...(level.spaces ?? []).map(s => s.id)
  ])
}

/**
 * The map and its bindings as they are stored: every id the map gives its
 * own records made a short count from the document's `nextId`, which only
 * grows, so no id is ever given twice, not even one whose record was
 * deleted, and a binding left naming a deleted room can never come to
 * name a new one. Ids already counted stay as they are. The bindings are
 * renamed with the map. Only what is stored (`writeDocument`) is numbered.
 */
export function storeMap(doc: MapDocument, bindings: Binding[] = []): { document: MapDocument; bindings: Binding[] } {
  const lean = writeDocument(doc, bindings)
  let next = Number.isInteger(doc.nextId) && doc.nextId! > 0 ? doc.nextId! : 1
  const all = ownIds(lean)
  const counted = new Set(all.filter(id => SHORT_ID.test(id) && parseInt(id, 36) < next))
  const ids = new Map<string, string>()
  for (const id of all) {
    if (counted.has(id) || ids.has(id)) continue
    let fresh = (next++).toString(36)
    while (counted.has(fresh)) fresh = (next++).toString(36)
    ids.set(id, fresh)
  }
  const name = (id: string) => ids.get(id) ?? id
  return {
    document: { ...lean, nextId: next, levels: lean.levels.map(level => renameLevel(level, name)) },
    bindings: bindings.map(b => ({ ...b, features: b.features.map(name) }))
  }
}
