import type { Vec2 } from '../geometry/vector'
import { distance, distanceToSegment, pointInPolygon, pointInRing } from '../geometry/vector'
import type { EdgeRole, EntityRef, Fixture, Level, LineLayer, Opening, Unit } from '../model/types'
import type { Part } from '../furniture/parts'
import { faceEdges, fixtureParts, KIND_ROLES, SCREENS_MAX, tableParameters, tableRecipe, TABLE_CHAIRS, TABLE_SUPPORTS, type TableParameters } from '../furniture/recipes'
import { STOCK_ITEMS } from '../furniture/items'
import { lineChords } from '../model/lines'
import { polygonEdges, resultParts, table } from '../furniture/table'
import { fitOpening, type PlacedOpening } from '../model/openings'
import { MIN_FEATURE } from '../model/precision'
import { lineMiddle } from '../model/lines'
import type { Command } from './commands'
import type { CursorName } from './cursor'
import { flipCursor, resizeCursor } from './cursor'
import { nearestSegment, type EditGraph, type GraphSegment } from './graph'
import { canHit, canHitFaces, type Layers } from './layers'
import { selectionOf, toggleFixture, toggleLine, toggleOpening, toggleUnit, type Selection } from './selection'
import { OPENING_MAX, OPENING_MIN, stepOpeningWidth, stepWidth, WIDTH_MAX, WIDTH_MIN } from './width'
import { DEFAULT_FIXTURE_HEIGHT, FIXTURE_KINDS, type FixtureKind } from '../model/categories'
import { groundOf, type Ground } from '../model/floors'
import { AUTO, shared, type Action, type Field } from './inspect'

export type KindId = 'wall' | 'fixture-line' | 'fixture' | 'opening' | 'room'

/** `middle` is the line's midpoint, a node not stored yet: the part under the pointer within reach of it. */
export type LineHit = { kind: 'line'; layer: LineLayer; lineId: string; segment: GraphSegment; point: Vec2; middle: Vec2; part: 'body' | 'face' | 'middle'; side: 1 | -1 }
export type FixtureHit = { kind: 'fixture'; fixtureId: string; fixture: Fixture }
/** `along` is the screen angle of the host wall at the opening, clockwise in degrees, for cursors that turn with it; a jamb names which end it is, in the host's canonical direction, and its line across the wall. */
export type OpeningHit = { kind: 'opening'; opening: Opening; part: 'leaf' | 'swing' | 'jamb' | 'body'; along: number; jamb?: 0 | 1; jambLine?: [Vec2, Vec2] }
export type RoomHit = { kind: 'room'; unitId: string; unit: Unit }
export type KindHit = LineHit | FixtureHit | OpeningHit | RoomHit

/** What the hit service sees. */
export interface Scene {
  graph: EditGraph
  fixtures: Fixture[]
  openings: PlacedOpening[]
  units: Unit[]
  layers: Layers
  radius: number
}

/**
 * What a press on a thing of a kind starts: a drag of the selection, a
 * slide of an opening, a widening of a wall, an edit done on the spot, or,
 * on an area not yet selected, a wait to see whether it is a click, which
 * selects `selection`, or a drag, which box-selects from there.
 */
export type Press =
  | { gesture: 'drag'; selection: Selection }
  | { gesture: 'area'; selection: Selection }
  | { gesture: 'slide'; selection: Selection; opening: Opening }
  | { gesture: 'widen'; hit: LineHit }
  | { gesture: 'split'; hit: LineHit }
  | { gesture: 'stretch'; opening: Opening; jamb: 0 | 1 }
  | { gesture: 'edit'; commands: Command[]; commit: string; selection: Selection }
  | { gesture: 'none'; selection: Selection }

/**
 * A kind of thing in the document that the hand can touch: what it takes
 * to hit it, how a press on it reads, what a hover of it means for the
 * cursor, which selection set it lives in, and the commands that edit it
 * from keys. The select tool runs the gestures; the kinds decide them. A
 * hit reaches `press` and `cursor` through `touched`, so it names a part
 * (a wall's face, a door's leaf or arc) only on a selected thing.
 */
export interface Kind<H extends KindHit = KindHit> {
  id: KindId
  /** What one of these is called, and several, for the panel. */
  noun: [string, string]
  /** The hit under a point, or null; precedence between kinds is the registry's order. */
  hit(point: Vec2, scene: Scene): H | null
  idOf(hit: H): string
  has(selection: Selection, id: string): boolean
  toggle(selection: Selection, id: string): Selection
  only(id: string): Selection
  press(hit: H, selection: Selection, shift: boolean, ctx: KindContext): Press
  cursor(hit: H, selection: Selection): CursorName
  /** Lines that move with the selected things of this kind. */
  movingLines(ids: Iterable<string>, ctx: KindContext): string[]
  remove(ids: string[], ctx: KindContext): Command[]
  stepWidth?(ids: string[], direction: 1 | -1, big: boolean, ctx: KindContext): { commands: Command[]; commit: string }
  flip?(ids: string[], side: boolean, ctx: KindContext): Command[]
  /** The fields the panel shows for the selected things of this kind, each read across all of them. */
  fields?(ids: string[], ctx: KindContext): Field[]
  /** What can be done to them besides editing a field; delete is every kind's and added by `inspect`. */
  actions?(ids: string[], ctx: KindContext): Action[]
  /** The parts to show the selection as on its own, when there is one piece worth a preview. */
  preview?(ids: string[], ctx: KindContext): Part[] | null
  /** What the selected things are, when the kind can say more than its noun: a desk rather than a piece. */
  title?(ids: string[], ctx: KindContext): string
}

export interface KindContext {
  level: Level
  graph: EditGraph
}

/** Something outside the document a room can stand for, as the host names it. */
export interface EntityLink {
  ref: EntityRef
  name: string
}

/**
 * A press on an area, a room or a fixture: it covers everything under it,
 * so it moves only once selected, and box select stays possible anywhere.
 * A press on a selected one drags it, under Shift deselects it; on any
 * other it waits to be a click or a box.
 */
function areaPress(kind: Kind, id: string, selection: Selection, shift: boolean): Press {
  if (kind.has(selection, id)) return shift ? { gesture: 'none', selection: kind.toggle(selection, id) } : { gesture: 'drag', selection }
  return { gesture: 'area', selection: shift ? kind.toggle(selection, id) : kind.only(id) }
}

/** Toggling off is the whole press; otherwise the thing is selected alone unless it already is. */
function selectOn(kind: Kind, id: string, selection: Selection, shift: boolean): { selection: Selection; off: boolean } {
  if (shift) {
    const next = kind.toggle(selection, id)
    return { selection: next, off: !kind.has(next, id) }
  }
  return { selection: kind.has(selection, id) ? selection : kind.only(id), off: false }
}

const lineHit = (point: Vec2, layer: LineLayer, scene: Scene): LineHit | null => {
  const { graph, radius } = scene
  const widest = layer === 'walls' ? radius + Math.max(0, ...[...graph.linesById.values()].map(l => ((l as { width?: number }).width ?? 0) / 2)) : radius
  const hit = nearestSegment(graph, point, widest, undefined, layer)
  if (!hit) return null
  const width = (graph.linesById.get(hit.segment.lineId) as { width?: number } | undefined)?.width ?? 0
  if (hit.distance > Math.max(radius, width / 2 + (layer === 'walls' ? radius : 0))) return null
  const { a, b } = hit.segment
  const side: 1 | -1 = (b[0] - a[0]) * (point[1] - a[1]) - (b[1] - a[1]) * (point[0] - a[0]) >= 0 ? 1 : -1
  const middle = lineMiddle(graph.linesById.get(hit.segment.lineId)!)
  // The middle is a node to be, so it takes the hand within a node's reach; the face reaches inward by at most a quarter of the width, so the body keeps at least the middle half of the band.
  const part = distance(point, middle) < radius ? 'middle' : layer === 'walls' && width > 0 && hit.distance >= width / 2 - Math.min(radius, width / 4) ? 'face' : 'body'
  return { kind: 'line', layer, lineId: hit.segment.lineId, segment: hit.segment, point: hit.point, middle, part, side }
}

/** The angle, clockwise on screen, of the direction across a segment. */
const acrossAngle = (segment: { a: Vec2; b: Vec2 }): number => (Math.atan2(-(segment.b[1] - segment.a[1]), segment.b[0] - segment.a[0]) * 180) / Math.PI + 90

/** Centimetres as a field shows them, from metres. */
const cm = (metres: number): number => Math.round(metres * 100)
/** A wall's own height, in metres: from a kerb to a hall's. */
const HEIGHT_MIN = 0.1
const HEIGHT_MAX = 10

const lineKind = (id: KindId, layer: LineLayer, noun: [string, string]): Kind<LineHit> => ({
  id,
  noun,
  hit: (point, scene) => (canHit(scene.layers, layer) ? lineHit(point, layer, scene) : null),
  idOf: hit => hit.lineId,
  has: (s, id) => s.lineIds.has(id),
  toggle: toggleLine,
  only: id => selectionOf([], [id]),
  press(hit, selection, shift) {
    if (hit.part === 'middle' && !shift) return { gesture: 'split', hit }
    if (hit.part === 'face' && !shift) return { gesture: 'widen', hit }
    const on = selectOn(this as Kind, hit.lineId, selection, shift)
    return on.off ? { gesture: 'none', selection: on.selection } : { gesture: 'drag', selection: on.selection }
  },
  cursor: (hit, selection) => (hit.part === 'middle' ? 'arrow-add' : hit.part === 'face' ? resizeCursor(acrossAngle(hit.segment)) : selection.lineIds.has(hit.lineId) ? 'move' : 'arrow'),
  movingLines: ids => [...ids],
  remove: ids => (ids.length ? [{ type: 'removeLines', layer, ids }] : []),
  ...(layer === 'walls'
    ? {
        stepWidth(ids: string[], direction: 1 | -1, big: boolean, ctx: KindContext) {
          const byWidth = new Map<number, string[]>()
          for (const wall of ctx.level.walls) {
            if (!ids.includes(wall.id)) continue
            const next = stepWidth(wall.width, direction, big)
            if (next !== wall.width) byWidth.set(next, [...(byWidth.get(next) ?? []), wall.id])
          }
          return { commands: [...byWidth].map(([width, wallIds]) => ({ type: 'setWallWidth' as const, wallIds, width })), commit: 'Wall width' }
        },
        fields(ids: string[], ctx: KindContext): Field[] {
          const walls = ctx.level.walls.filter(w => ids.includes(w.id))
          if (!walls.length) return []
          return [{
            key: 'width',
            label: 'Width',
            control: { type: 'number', min: cm(WIDTH_MIN), max: cm(WIDTH_MAX), step: 1, unit: 'cm' },
            value: shared(walls.map(w => cm(w.width))),
            set(value) {
              const width = Math.min(WIDTH_MAX, Math.max(WIDTH_MIN, Math.round(Number(value)) / 100))
              const wallIds = walls.filter(w => w.width !== width).map(w => w.id)
              return wallIds.length ? { commands: [{ type: 'setWallWidth', wallIds, width }], commit: 'Wall width' } : null
            }
          }, {
            key: 'height',
            label: 'Height',
            control: { type: 'count', min: cm(HEIGHT_MIN), max: cm(HEIGHT_MAX), unit: 'cm', auto: 'Ceiling' },
            value: shared(walls.map(w => (w.height === undefined ? AUTO : cm(w.height)))),
            set(value) {
              const height = value === AUTO ? undefined : Math.min(HEIGHT_MAX, Math.max(HEIGHT_MIN, Math.round(Number(value)) / 100))
              const wallIds = walls.filter(w => w.height !== height).map(w => w.id)
              return wallIds.length ? { commands: [{ type: 'setWallHeight', wallIds, height }], commit: 'Wall height' } : null
            }
          }]
        }
      }
    : {
        fields(ids: string[], ctx: KindContext): Field[] {
          return edgeRoleFields(ids, ctx)
        }
      })
})

const ROLE_LABELS: Record<EdgeRole, string> = { seating: 'Seating', back: 'Back', front: 'Front', head: 'Head' }

/** The lines of a fixture's outline, by id. */
const outlineLines = (f: Fixture, ctx: KindContext): string[] => [...new Set(faceEdges(f, ctx.level.fixtureLines).map(e => e.lineId).filter((id): id is string => !!id))]

/**
 * What the selected lines do for the fixtures whose outline they lie on:
 * a toggle per role those fixtures' kinds read, set on every such line of
 * every such fixture, so a line two tables share seats at both.
 */
function edgeRoleFields(ids: string[], ctx: KindContext): Field[] {
  const pairs = ctx.level.fixtures.filter(f => f.polygon && KIND_ROLES[f.kind]?.length).flatMap(f => outlineLines(f, ctx).filter(id => ids.includes(id)).map(lineId => ({ fixture: f, lineId })))
  const roles = [...new Set(pairs.flatMap(p => KIND_ROLES[p.fixture.kind] ?? []))]
  return roles.map(role => {
    const bearing = pairs.filter(p => KIND_ROLES[p.fixture.kind]!.includes(role))
    return {
      key: `role-${role}`,
      label: ROLE_LABELS[role],
      control: { type: 'toggle' },
      value: shared(bearing.map(p => p.fixture.roles?.[p.lineId] === role)),
      set(value) {
        const on = value === true
        const changing = [...new Set(bearing.filter(p => (p.fixture.roles?.[p.lineId] === role) !== on).map(p => p.fixture))]
        if (!changing.length) return null
        const commands = changing.map(f => {
          const next: Record<string, EdgeRole> = { ...f.roles }
          for (const p of bearing) if (p.fixture.id === f.id) (on ? (next[p.lineId] = role) : delete next[p.lineId])
          return { type: 'setFixture' as const, fixtureId: f.id, patch: { roles: next } }
        })
        return { commands, commit: `${ROLE_LABELS[role]} edges` }
      }
    }
  })
}

export const wallKind = lineKind('wall', 'walls', ['Wall', 'walls'])
export const fixtureLineKind = lineKind('fixture-line', 'fixtures', ['Line', 'lines'])

/** The line ids a fixture is made of, from its signature. */
export const fixtureLineIds = (f: Fixture): string[] => f.signature.split('::holes:')[0].split('|').filter(Boolean).concat(...(f.signature.split('::holes:')[1]?.split(';').map(h => h.split('|')) ?? []))

/** A field that sets one property of every selected fixture that does not have it yet. */
function fixtureField(fixtures: Fixture[], key: string, label: string, control: Field['control'], read: (f: Fixture) => string | number, patch: (value: string | number) => Partial<Pick<Fixture, 'name' | 'kind' | 'height'>>, commit: string): Field {
  return {
    key,
    label,
    control,
    value: shared(fixtures.map(read)),
    set(value) {
      const next = patch(value as string | number)
      const changing = fixtures.filter(f => read({ ...f, ...next }) !== read(f))
      return changing.length ? { commands: changing.map(f => ({ type: 'setFixture' as const, fixtureId: f.id, patch: next })), commit } : null
    }
  }
}

/** A field of every selected table's parameters: the value each reads, and the parameters it writes back into its recipe. */
function tableField(tables: Fixture[], key: keyof TableParameters, label: string, control: Field['control'], read: (p: TableParameters) => string | number, write: (value: string | number) => Partial<Record<keyof TableParameters, unknown>>, commit: string): Field {
  return {
    key,
    label,
    control,
    value: shared(tables.map(f => read(tableParameters(f)))),
    set(value) {
      const changing = tables.filter(f => read(tableParameters(f)) !== value)
      if (!changing.length) return null
      return { commands: changing.map(f => ({ type: 'setFixture' as const, fixtureId: f.id, patch: { recipe: tableRecipe(f, write(value as string | number)) } })), commit }
    }
  }
}

/** A small table seating its long sides, with no chair, to picture a support on. */
const SUPPORT_TABLE = polygonEdges([[-0.6, -0.375], [0.6, -0.375], [0.6, 0.375], [-0.6, 0.375]], [0, 2])

/** What a chair's tile says under its picture; the field says they are chairs. */
const CHAIR_TILE_LABELS: Record<(typeof TABLE_CHAIRS)[number], string> = { meetingChair: 'Meeting', officeChair: 'Office', stool: 'Stool' }

/** What a support's tile says under its picture. */
const SUPPORT_TILE_LABELS: Record<(typeof TABLE_SUPPORTS)[number], string> = { pedestal: 'Pedestal', legs: 'Legs', tbases: 'T-bases', frames: 'Frames', panels: 'Panels', none: 'None' }

let tableTiles: { chairs: Tile[]; supports: Tile[] } | null = null
type Tile = { value: string; label: string; parts: Part[] }

/** The chairs a table may seat and what may hold its top up, as the tiles that picture them: the chair itself, and a small table on that support. Built the first time they are asked for. */
const TABLE_TILES = () =>
  (tableTiles ??= {
    chairs: TABLE_CHAIRS.map(k => ({ value: k, label: CHAIR_TILE_LABELS[k], parts: STOCK_ITEMS[k].parts })),
    supports: TABLE_SUPPORTS.map(s => ({ value: s, label: SUPPORT_TILE_LABELS[s], parts: resultParts(table(SUPPORT_TABLE, { supports: s, seats: 0 })) }))
  })

const TABLE_FIELDS = (tables: Fixture[]): Field[] => [
  tableField(tables, 'chair', 'Chairs', { type: 'tiles', options: TABLE_TILES().chairs }, p => p.chair ?? 'meetingChair', value => ({ chair: value }), 'Table chairs'),
  tableField(tables, 'seats', 'Seats', { type: 'count', min: 0, max: 60 }, p => p.placed?.length ?? p.seats ?? AUTO, value => ({ seats: value === AUTO ? undefined : Math.max(0, Math.round(Number(value))), placed: undefined }), 'Table seats'),
  tableField(tables, 'screens', 'Screens per seat', { type: 'number', min: 0, max: SCREENS_MAX, step: 1 }, p => p.screens ?? 0, value => ({ screens: Math.min(SCREENS_MAX, Math.max(0, Math.round(Number(value)))) || undefined }), 'Table screens'),
  tableField(tables, 'supports', 'Supports', { type: 'tiles', options: TABLE_TILES().supports }, p => p.supports ?? 'pedestal', value => ({ supports: value, supportInset: undefined, supportPlaces: undefined, pedestals: undefined }), 'Table supports'),
]


const lengthOfLine = (id: string, ctx: KindContext): number => {
  const line = ctx.level.fixtureLines.find(l => l.id === id)
  if (!line) return 0
  const points = lineChords(line)
  return points.slice(1).reduce((sum, p, i) => sum + distance(points[i], p), 0)
}

/** A table as a desk: one seating edge (the one it seats already when that is one, else its longest), one office chair, one screen facing it, on panels; its own chairs and supports laid out afresh. */
function deskPatch(f: Fixture, ctx: KindContext): Partial<Fixture> {
  const lines = outlineLines(f, ctx)
  const seating = lines.filter(id => f.roles?.[id] === 'seating')
  const edge = seating.length === 1 ? seating[0] : [...lines].sort((a, b) => lengthOfLine(b, ctx) - lengthOfLine(a, ctx))[0]
  return {
    roles: edge ? { [edge]: 'seating' } : {},
    recipe: tableRecipe(f, { chair: 'officeChair', seats: 1, screens: 1, supports: 'panels', placed: undefined, supportPlaces: undefined, supportInset: undefined, pedestals: undefined, turn: undefined })
  }
}


/** A fixture group's word for one of it. */
const GROUP_ONE: Record<string, string> = { Desks: 'Desk', Tables: 'Table', Lines: 'Line', Objects: 'Object', Sofas: 'Sofa', Cabinets: 'Cabinet', Holes: 'Hole' }

/** What a fixture is, read from its kind and recipe, as the fixtures list groups them: a table seating one with a screen is a desk. */
export function fixtureGroup(f: Fixture): string {
  if (f.kind === 'table') {
    const p = tableParameters(f)
    return p.seats === 1 && (p.screens ?? 0) > 0 ? 'Desks' : 'Tables'
  }
  if (!f.polygon) return 'Lines'
  return ({ object: 'Objects', sofa: 'Sofas', cabinet: 'Cabinets', hole: 'Holes' } as Record<string, string>)[f.kind] ?? 'Objects'
}

export const fixtureKind: Kind<FixtureHit> = {
  id: 'fixture',
  noun: ['Piece', 'pieces'],
  hit(point, scene) {
    if (!canHitFaces(scene.layers, 'fixtures')) return null
    for (let i = scene.fixtures.length - 1; i >= 0; i--) {
      const f = scene.fixtures[i]
      if (f.polygon && pointInPolygon(point, f.polygon)) return { kind: 'fixture', fixtureId: f.id, fixture: f }
    }
    return null
  },
  idOf: hit => hit.fixtureId,
  has: (s, id) => s.fixtureIds.has(id),
  toggle: toggleFixture,
  only: id => selectionOf([], [], [id]),
  press(hit, selection, shift) {
    return areaPress(this as Kind, hit.fixtureId, selection, shift)
  },
  cursor: (hit, selection) => (selection.fixtureIds.has(hit.fixtureId) ? 'move' : 'arrow'),
  movingLines: () => [],
  remove: (ids, ctx) => {
    const lines = ctx.level.fixtures.filter(f => ids.includes(f.id)).flatMap(fixtureLineIds)
    return lines.length ? [{ type: 'removeLines', layer: 'fixtures', ids: [...new Set(lines)] }] : []
  },
  fields(ids, ctx) {
    const fixtures = ctx.level.fixtures.filter(f => ids.includes(f.id))
    if (!fixtures.length) return []
    return [
      {
        key: 'kind',
        label: 'Kind',
        control: { type: 'choice', options: FIXTURE_KINDS.filter(k => OFFERED_KINDS.includes(k) || fixtures.some(f => f.kind === k)).map(k => ({ value: k, label: k })) },
        value: shared(fixtures.map(f => f.kind)),
        set(value) {
          const kind = value as Fixture['kind']
          const changing = fixtures.filter(f => f.kind !== kind)
          if (!changing.length) return null
          const role = KIND_ROLES[kind]?.[0]
          return {
            commands: changing.map(f => ({ type: 'setFixture' as const, fixtureId: f.id, patch: { kind, ...(role && !f.roles && f.polygon ? { roles: Object.fromEntries(outlineLines(f, ctx).map(id => [id, role])) } : {}) } })),
            commit: 'Fixture kind'
          }
        }
      },
      fixtureField(fixtures, 'height', 'Height', { type: 'number', min: 5, max: 400, step: 5, unit: 'cm' }, f => cm(f.height ?? DEFAULT_FIXTURE_HEIGHT), value => ({ height: Math.min(400, Math.max(5, Math.round(Number(value)))) / 100 }), 'Fixture height'),
      ...(fixtures.every(f => f.kind === 'table' && f.polygon) ? TABLE_FIELDS(fixtures) : [])
    ]
  },
  actions(ids, ctx) {
    const tables = ctx.level.fixtures.filter(f => ids.includes(f.id) && f.kind === 'table')
    const auto = (keys: (keyof TableParameters)[], label: string): Action[] => {
      const placed = tables.filter(f => keys.some(key => tableParameters(f)[key]))
      return placed.length ? [{ key: `auto-${keys[0]}`, label, run: () => ({ commands: placed.map(f => ({ type: 'setFixture' as const, fixtureId: f.id, patch: { recipe: tableRecipe(f, Object.fromEntries(keys.map(key => [key, undefined]))) } })), commit: label }) }] : []
    }
    const holding = ctx.level.fixtures.filter(f => ids.includes(f.id) && f.items?.length)
    const clear: Action[] = holding.length ? [{ key: 'clear-items', label: 'Clear top', run: () => ({ commands: holding.map(f => ({ type: 'setFixture' as const, fixtureId: f.id, patch: { items: undefined } })), commit: 'Clear top' }) }] : []
    const desks: Action[] = tables.length ? [{ key: 'desk', label: 'Make desk', run: () => ({ commands: tables.map(f => ({ type: 'setFixture' as const, fixtureId: f.id, patch: deskPatch(f, ctx) })), commit: 'Make desk' }) }] : []
    return [...desks, ...auto(['placed'], 'Auto chairs'), ...auto(['supportPlaces', 'pedestals'], 'Auto supports'), ...clear]
  },
  title(ids, ctx) {
    const groups = [...new Set(ctx.level.fixtures.filter(f => ids.includes(f.id)).map(fixtureGroup))]
    if (groups.length !== 1) return `${ids.length} pieces`
    return ids.length === 1 ? GROUP_ONE[groups[0]] ?? 'Piece' : `${ids.length} ${groups[0].toLowerCase()}`
  },
  preview(ids, ctx) {
    const fixture = ids.length === 1 ? ctx.level.fixtures.find(f => f.id === ids[0]) : undefined
    if (!fixture) return null
    try {
      return fixtureParts(fixture, ctx.level.fixtureLines, ctx.level.fixtures)
    } catch {
      return null
    }
  }
}

const swingOf = (o: Opening) => o.swing ?? { side: 1 as const, hinge: 0 as const }

/** The line across the wall at one end of an opening: from the corner of its box nearest that jamb to the corner opposite it. */
export function jambLine(geometry: { box: Vec2[]; jambs: [Vec2, Vec2] }, jamb: 0 | 1): [Vec2, Vec2] {
  const j = geometry.jambs[jamb]
  const corner = geometry.box.reduce((best, v) => (Math.hypot(v[0] - j[0], v[1] - j[1]) < Math.hypot(best[0] - j[0], best[1] - j[1]) ? v : best))
  return [corner, [2 * j[0] - corner[0], 2 * j[1] - corner[1]]]
}

export const openingKind: Kind<OpeningHit> = {
  id: 'opening',
  noun: ['Opening', 'openings'],
  hit(point, scene) {
    if (!canHit(scene.layers, 'walls')) return null
    const { openings, radius } = scene
    const along = (g: { jambs: [Vec2, Vec2] }) => (Math.atan2(-(g.jambs[1][1] - g.jambs[0][1]), g.jambs[1][0] - g.jambs[0][0]) * 180) / Math.PI
    for (const { opening, geometry } of openings) {
      const [near] = ([0, 1] as const).map(jamb => ({ jamb, line: jambLine(geometry, jamb) })).map(j => ({ ...j, d: distanceToSegment(point, j.line[0], j.line[1]) })).sort((a, b) => a.d - b.d)
      if (near.d < radius) return { kind: 'opening', opening, part: 'jamb', along: along(geometry), jamb: near.jamb, jambLine: near.line }
    }
    for (const { opening, geometry } of openings) if (geometry.leaf && distanceToSegment(point, geometry.leaf[0], geometry.leaf[1]) < radius) return { kind: 'opening', opening, part: 'leaf', along: along(geometry) }
    for (const { opening, geometry } of openings) if (geometry.arc?.some((p, i) => i > 0 && distanceToSegment(point, geometry.arc![i - 1], p) < radius)) return { kind: 'opening', opening, part: 'swing', along: along(geometry) }
    for (const { opening, geometry } of openings) if (pointInRing(point, geometry.box)) return { kind: 'opening', opening, part: 'body', along: along(geometry) }
    return null
  },
  idOf: hit => hit.opening.id,
  has: (s, id) => s.openingIds.has(id),
  toggle: toggleOpening,
  only: id => selectionOf([], [], [], [id]),
  press(hit, selection, shift) {
    if (hit.part === 'jamb' && !shift) return { gesture: 'stretch', opening: hit.opening, jamb: hit.jamb! }
    if (hit.opening.kind === 'door' && hit.part !== 'body' && !shift) {
      const swing = swingOf(hit.opening)
      const patch = hit.part === 'leaf' ? { ...swing, side: -swing.side as 1 | -1 } : { ...swing, hinge: (1 - swing.hinge) as 0 | 1 }
      return { gesture: 'edit', commands: [{ type: 'setOpening', openingId: hit.opening.id, patch: { swing: patch } }], commit: 'Flip door', selection: selectionOf([], [], [], [hit.opening.id]) }
    }
    const on = selectOn(this as Kind, hit.opening.id, selection, shift)
    return on.off ? { gesture: 'none', selection: on.selection } : { gesture: 'slide', selection: on.selection, opening: hit.opening }
  },
  cursor: (hit, selection) =>
    !selection.openingIds.has(hit.opening.id) ? 'arrow' : hit.part === 'jamb' ? resizeCursor(hit.along) : hit.part === 'leaf' ? flipCursor(hit.along) : hit.part === 'swing' ? flipCursor(hit.along + 90) : 'move',
  movingLines: () => [],
  remove: ids => (ids.length ? [{ type: 'removeOpenings', ids }] : []),
  stepWidth(ids, direction, big, ctx) {
    const commands: Command[] = []
    for (const o of ctx.level.openings) {
      if (!ids.includes(o.id)) continue
      const width = stepOpeningWidth(o.width, direction, big)
      if (width === o.width) continue
      const fit = fitOpening(o.at, { ...o, width }, ctx.level.walls, ctx.level.openings, MIN_FEATURE)
      if (fit) commands.push({ type: 'setOpening', openingId: o.id, patch: { width, at: fit.at } })
    }
    return { commands, commit: 'Opening width' }
  },
  flip(ids, side, ctx) {
    const commands: Command[] = []
    for (const o of ctx.level.openings) {
      if (!ids.includes(o.id) || o.kind !== 'door') continue
      const swing = swingOf(o)
      commands.push({ type: 'setOpening', openingId: o.id, patch: { swing: side ? { ...swing, side: -swing.side as 1 | -1 } : { ...swing, hinge: (1 - swing.hinge) as 0 | 1 } } })
    }
    return commands
  },
  fields(ids, ctx) {
    const openings = ctx.level.openings.filter(o => ids.includes(o.id))
    if (!openings.length) return []
    return [{
      key: 'width',
      label: 'Width',
      control: { type: 'number', min: cm(OPENING_MIN), max: cm(OPENING_MAX), step: 1, unit: 'cm' },
      value: shared(openings.map(o => cm(o.width))),
      set(value) {
        const width = Math.min(OPENING_MAX, Math.max(OPENING_MIN, Math.round(Number(value)) / 100))
        const commands: Command[] = []
        for (const o of openings) {
          if (o.width === width) continue
          const fit = fitOpening(o.at, { ...o, width }, ctx.level.walls, ctx.level.openings, MIN_FEATURE)
          if (fit) commands.push({ type: 'setOpening', openingId: o.id, patch: { width, at: fit.at } })
        }
        return commands.length ? { commands, commit: 'Opening width' } : null
      }
    }]
  },
  actions(ids, ctx) {
    if (!ctx.level.openings.some(o => ids.includes(o.id) && o.kind === 'door')) return []
    const flip = (side: boolean, label: string, shortcut: string): Action => ({ key: side ? 'flip-side' : 'flip-hinge', label, shortcut, run: () => ({ commands: openingKind.flip!(ids, side, ctx), commit: 'Flip door' }) })
    return [flip(true, 'Flip side', 'Shift+Tab'), flip(false, 'Flip hinge', 'Tab')]
  }
}

/**
 * A room: a face of the walls, not moved by its own drag until selected,
 * and never removed, since its walls are its neighbours' too. What lies
 * under it (floor, nothing because it is outside the building, or nothing
 * because it is open to the level below) is a fact of the building and set
 * here; what a room means (its label, its
 * link, the rooms it is one thing with) is given in the Connect stage, as a
 * binding.
 */
export const roomKind: Kind<RoomHit> = {
  id: 'room',
  noun: ['Room', 'rooms'],
  hit(point, scene) {
    if (!canHitFaces(scene.layers, 'walls')) return null
    for (const unit of scene.units) if (pointInPolygon(point, unit.polygon)) return { kind: 'room', unitId: unit.id, unit }
    return null
  },
  idOf: hit => hit.unitId,
  has: (s, id) => s.unitIds.has(id),
  toggle: toggleUnit,
  only: id => selectionOf([], [], [], [], [id]),
  press(hit, selection, shift) {
    return areaPress(this as Kind, hit.unitId, selection, shift)
  },
  cursor: (hit, selection) => (selection.unitIds.has(hit.unitId) ? 'move' : 'arrow'),
  movingLines: () => [],
  remove: () => [],
  fields(ids, ctx) {
    const units = ctx.level.units.filter(u => ids.includes(u.id))
    if (!units.length) return []
    return [{
      key: 'ground',
      label: 'Floor',
      control: { type: 'choice', options: GROUNDS.map(([value, label]) => ({ value, label })) },
      value: shared(units.map(u => groundOf(u))),
      set(value) {
        const ground = value as Ground
        const changing = units.filter(u => groundOf(u) !== ground)
        if (!changing.length) return null
        const patch = (u: Unit) => ({ outside: ground === 'outside' ? (true as const) : undefined, ...(ground === 'open' ? { category: 'opentobelow' as const } : u.category === 'opentobelow' ? { category: 'unspecified' as const } : {}) })
        return { commands: changing.map(u => ({ type: 'setUnit' as const, unitId: u.id, patch: patch(u) })), commit: 'Room floor' }
      }
    }]
  },
  actions: () => []
}

/** The kinds a fixture can be given for now; the model holds every kind, and one a fixture already has stays on offer for it. */
const OFFERED_KINDS: readonly FixtureKind[] = ['object', 'table', 'hole']

const GROUNDS: [Ground, string][] = [['inside', 'Inside'], ['outside', 'Outside'], ['open', 'Open to below']]

/** A hit as the hand can use it: a selected thing answers with the part under the pointer, anything else only as its body, so an unselected thing's parts neither light up nor act. A line's middle answers on any line: it stands for a node, and nodes need no selection. */
export function touched(hit: KindHit, selection: Selection): KindHit {
  if (hit.kind === 'line') return hit.part === 'body' || hit.part === 'middle' || selection.lineIds.has(hit.lineId) ? hit : { ...hit, part: 'body' }
  if (hit.kind === 'opening') return hit.part === 'body' || selection.openingIds.has(hit.opening.id) ? hit : { ...hit, part: 'body' }
  return hit
}

/** Whether a hit names a part of a selected thing, which acts in place of whatever the body would do. */
export const isPart = (hit: KindHit): boolean => (hit.kind === 'line' || hit.kind === 'opening') && hit.part !== 'body'

/** The kinds in hit precedence: the smallest thing under the pointer wins. */
export const KINDS: Kind[] = [openingKind as Kind, fixtureLineKind as Kind, fixtureKind as Kind, wallKind as Kind, roomKind as Kind]

/** The kind a hit belongs to. */
export function kindOf(hit: KindHit): Kind {
  if (hit.kind === 'line') return (hit.layer === 'walls' ? wallKind : fixtureLineKind) as Kind
  if (hit.kind === 'room') return roomKind as Kind
  return (hit.kind === 'fixture' ? fixtureKind : openingKind) as Kind
}

/** The ids of a selection that belong to a kind; the two line kinds share one set and are told apart by their layer. */
export function selectedOf(kind: Kind, selection: Selection, graph: EditGraph): string[] {
  if (kind.id === 'fixture') return [...selection.fixtureIds]
  if (kind.id === 'opening') return [...selection.openingIds]
  if (kind.id === 'room') return [...selection.unitIds]
  const layer: LineLayer = kind.id === 'wall' ? 'walls' : 'fixtures'
  return [...selection.lineIds].filter(id => graph.segments.some(s => s.lineId === id && s.layer === layer))
}
