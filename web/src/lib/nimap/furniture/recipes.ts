import { surfaceItemParts } from './surface'
import type { Ring, Vec2 } from '../geometry/vector'
import { distanceToSegment, pointInRing } from '../geometry/vector'
import type { EdgeRole, Fixture, Line, Recipe } from '../model/types'
import { lineChords, projectOntoLine, splitLine } from '../model/lines'
import type { Part } from './parts'
import { STOCK_ITEMS, type StockKind } from './items'
import { applyTransform, facing } from './parts'
import { footprint } from './mesh'
import { resultParts, table, type ChairMark, type EdgePlace, type PedestalLayout, type PlacedChair, type PlacedSupport, type SupportLayout, type SupportStyle, type TableOptions, type TableResult, type Track, type TrackPiece } from './table'

/** One edge of a traced face as a recipe reads it: a chord of its outline, and the role the line it lies on has on this face. */
export interface FaceEdge extends Line {
  lineId: string | null
  role?: EdgeRole
}

/** How far an outline's edge may lie from the line it came from: the kernel rounds the outline to its grid. */
const ON_LINE = 1e-4

/** The stretch of a line from parameter `t0` to `t1`, running from `from` to `to`, curve included: the whole line when the stretch is all of it. */
function stretchOf(line: Line, t0: number, t1: number, from: Vec2, to: Vec2): Line {
  const [lo, hi] = t0 <= t1 ? [t0, t1] : [t1, t0]
  let piece: Line = line
  if (line.curve && hi < 1 - WHOLE) piece = splitLine(piece, hi, `${line.id}~`)[0]
  if (line.curve && lo > WHOLE) piece = splitLine(piece, lo / (hi < 1 - WHOLE ? hi : 1), `${line.id}~`)[1]
  const forward = t0 <= t1
  const curve = piece.curve ? ((forward ? piece.curve : [piece.curve[1], piece.curve[0]]) as [Vec2, Vec2]) : undefined
  return { id: line.id, points: [from, to], ...(curve ? { curve } : {}) }
}

/** How close to an end of a line a parameter counts as that end. */
const WHOLE = 1e-6

/**
 * The edges of a fixture's outline in ring order, each the traced line it
 * lies on, curve and all, or the stretch of it the outline follows where
 * another line crosses it, with the role that line has on this fixture.
 * A curve reaches the recipe as a curve, so a round table's joins are
 * smooth by their tangents, not by how finely its chords happen to fall.
 */
export function faceEdges(fixture: Fixture, lines: Line[]): FaceEdge[] {
  const ring = fixture.polygon?.outer ?? []
  const n = ring.length
  if (n < 2) return []
  const byId = new Map(lines.map(line => [line.id, line]))
  const chords = lines.map(line => ({ line, points: lineChords(line) }))
  const ownerOf = (a: Vec2, b: Vec2): string | null => {
    const mid: Vec2 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]
    for (const { line, points } of chords) for (let i = 1; i < points.length; i++) if (distanceToSegment(mid, points[i - 1], points[i]) < ON_LINE) return line.id
    return null
  }
  const owners = ring.map((a, i) => ownerOf(a, ring[(i + 1) % n]))
  let start = 0
  while (start < n && owners[(start - 1 + n) % n] === owners[start]) start++
  if (start === n) start = 0
  const groups: { owner: string | null; from: Vec2; to: Vec2 }[] = []
  for (let k = 0; k < n; k++) {
    const i = (start + k) % n
    const last = groups[groups.length - 1]
    if (last && last.owner === owners[i]) last.to = ring[(i + 1) % n]
    else groups.push({ owner: owners[i], from: ring[i], to: ring[(i + 1) % n] })
  }
  const seen = new Map<string, number>()
  return groups.map((g, k): FaceEdge => {
    const line = g.owner ? byId.get(g.owner) : undefined
    if (!line) return { id: `edge:${k}`, points: [g.from, g.to], lineId: null }
    const count = seen.get(line.id) ?? 0
    seen.set(line.id, count + 1)
    const piece = stretchOf(line, projectOntoLine(line, g.from).t, projectOntoLine(line, g.to).t, g.from, g.to)
    const role = fixture.roles?.[line.id]
    return { ...piece, id: count ? `${line.id}:${count}` : line.id, lineId: line.id, ...(role ? { role } : {}) }
  })
}

/** The roles each kind of fixture reads from its edges; a kind not listed is a bare block. */
export const KIND_ROLES: Partial<Record<Fixture['kind'], EdgeRole[]>> = { table: ['seating'] }

/**
 * What a fixture is built as: its kind's recipe over its traced outline,
 * or null for a kind with no recipe, which the renderer draws as a block of
 * its outline. An open path has no outline and builds nothing yet.
 */
export function fixtureParts(fixture: Fixture, lines: Line[], fixtures: Fixture[] = []): Part[] | null {
  const built = tableOf(fixture, lines, fixtures)
  return built ? [...resultParts(built), ...surfaceItemParts(fixture, lines)] : null
}

/** The chairs a table may seat, and what may hold its top up. */
export const TABLE_CHAIRS = ['meetingChair', 'officeChair', 'stool'] as const satisfies readonly StockKind[]
export const TABLE_SUPPORTS = ['pedestal', 'legs', 'tbases', 'frames', 'panels', 'none'] as const satisfies readonly SupportStyle[]

/** The most space a table leaves between its edge and a chair's front, and how far under it a chair's front may reach: below zero a chair is pushed in, as far as its parts clear the table's. */
export const TABLE_CLEARANCE_MAX = 1
export const TABLE_CLEARANCE_MIN = -0.5

/** How far in from a table's edge its supports' track may run. */
export const SUPPORT_INSET_MIN = 0.03
export const SUPPORT_INSET_MAX = 0.6

/** What a table fixture asks of its recipe besides its outline and edges: a chair, a count (every chair that fits when left out), a support, the space between the table and its chairs, how far the chairs are turned along their runs as a share of the space between two, and, once a hand has placed them, where each chair stands; how far in its supports' track runs, and, once placed, where each support stands on it; and, once placed, where each pedestal stands. */
export interface TableParameters {
  chair?: (typeof TABLE_CHAIRS)[number]
  seats?: number
  supports?: (typeof TABLE_SUPPORTS)[number]
  clearance?: number
  turn?: number
  placed?: PlacedChair[]
  supportInset?: number
  supportPlaces?: PlacedSupport[]
  pedestals?: Vec2[]
  screens?: number
}

/** The most screens a table's rule stands in front of one chair. */
export const SCREENS_MAX = 4

const isEdgePlace = (c: unknown): c is EdgePlace => !!c && typeof (c as EdgePlace).edge === 'string' && typeof (c as EdgePlace).t === 'number' && (c as EdgePlace).t >= 0 && (c as EdgePlace).t <= 1
const edgePlaces = (list: unknown[]): EdgePlace[] => list.filter(isEdgePlace).map(c => ({ edge: c.edge, t: c.t }))

const isOffset = (v: unknown): v is Vec2 => Array.isArray(v) && v.length === 2 && v.every(x => typeof x === 'number' && Number.isFinite(x))
const supportPlaces = (list: unknown[]): PlacedSupport[] =>
  list.filter(isEdgePlace).map(s => {
    const { to, offset, curved } = s as PlacedSupport
    return { edge: s.edge, t: s.t, ...(isEdgePlace(to) ? { to: { edge: to.edge, t: to.t } } : {}), ...(typeof offset === 'number' && Number.isFinite(offset) ? { offset } : {}), ...(curved === true ? { curved } : {}) }
  })

/** A table fixture's parameters as stored in its recipe, anything unknown or of another recipe left out. */
export function tableParameters(fixture: Fixture): TableParameters {
  const p = fixture.recipe?.kind === 'table' ? fixture.recipe.parameters : {}
  return {
    ...(TABLE_CHAIRS.includes(p.chair as never) ? { chair: p.chair as TableParameters['chair'] } : {}),
    ...(typeof p.seats === 'number' && Number.isInteger(p.seats) && p.seats >= 0 ? { seats: p.seats } : {}),
    ...(TABLE_SUPPORTS.includes(p.supports as never) ? { supports: p.supports as TableParameters['supports'] } : {}),
    ...(typeof p.clearance === 'number' && p.clearance >= TABLE_CLEARANCE_MIN && p.clearance <= TABLE_CLEARANCE_MAX ? { clearance: p.clearance } : {}),
    ...(typeof p.turn === 'number' && p.turn >= 0 && p.turn < 1 ? { turn: p.turn } : {}),
    ...(Array.isArray(p.placed) ? { placed: edgePlaces(p.placed) } : {}),
    ...(typeof p.supportInset === 'number' && p.supportInset >= SUPPORT_INSET_MIN && p.supportInset <= SUPPORT_INSET_MAX ? { supportInset: p.supportInset } : {}),
    ...(Array.isArray(p.supportPlaces) ? { supportPlaces: supportPlaces(p.supportPlaces) } : {}),
    ...(Array.isArray(p.pedestals) ? { pedestals: p.pedestals.filter(isOffset).map((o): Vec2 => [o[0], o[1]]) } : {}),
    ...(typeof p.screens === 'number' && Number.isInteger(p.screens) && p.screens > 0 && p.screens <= SCREENS_MAX ? { screens: p.screens } : {})
  }
}

/** A table fixture's recipe with some of its parameters changed; a parameter changed to undefined is left out, so the recipe decides it. */
export function tableRecipe(fixture: Fixture, changes: Partial<Record<keyof TableParameters, unknown>>): Recipe {
  const parameters: Record<string, unknown> = { ...tableParameters(fixture), ...changes }
  for (const key of Object.keys(parameters)) if (parameters[key] === undefined) delete parameters[key]
  return { kind: 'table', version: 1, parameters }
}

/** How many recipe results are kept: enough for every table on a large floor. */
const CACHE_SIZE = 512
const results = new Map<string, TableResult>()

/** Forgets every kept recipe result, as a fresh page would. */
export function clearRecipeCache(): void {
  results.clear()
}

/** Everything a table's result depends on, as one string: equal strings give equal results. */
function inputsOf(fixture: Fixture, lines: Line[], holes: Ring[]): string {
  const own = new Set(fixture.signature.split(/[|;]|::holes:/))
  return JSON.stringify([fixture.kind, fixture.polygon, fixture.roles ?? null, fixture.recipe ?? null, fixture.height ?? null, lines.filter(l => own.has(l.id)), holes])
}

/** The rings inside a fixture's outline that are declared nothing: those every fixture within is a hole, such as the middle of a donut table. Another shape inside keeps the outline whole under it. */
export function declaredHoles(fixture: Fixture, fixtures: Fixture[]): Ring[] {
  return (fixture.polygon?.holes ?? []).filter(ring => {
    const inside = fixtures.filter(f => f.id !== fixture.id && pointInRing(f.anchor, ring))
    return inside.length > 0 && inside.every(f => f.kind === 'hole')
  })
}

/**
 * A table fixture through the table recipe, or null for any other fixture.
 * Results are kept by their inputs, so a table that did not change is not
 * built again, while another is dragged or on the next frame of a scene.
 */
function tableOf(fixture: Fixture, lines: Line[], fixtures: Fixture[]): TableResult | null {
  if (!fixture.polygon || fixture.kind !== 'table') return null
  const holes = declaredHoles(fixture, fixtures)
  const key = inputsOf(fixture, lines, holes)
  const kept = results.get(key)
  if (kept) {
    results.delete(key)
    results.set(key, kept)
    return kept
  }
  const built = buildTable(fixture, lines, holes)
  results.set(key, built)
  if (results.size > CACHE_SIZE) results.delete(results.keys().next().value!)
  return built
}

function buildTable(fixture: Fixture, lines: Line[], holes: Ring[]): TableResult {
  const edges = faceEdges(fixture, lines).map(e => ({ id: e.id, points: e.points, ...(e.curve ? { curve: e.curve } : {}), seating: e.role === 'seating' }))
  const options: TableOptions = { ...tableParameters(fixture), ...(fixture.height !== undefined ? { height: fixture.height } : {}), ...(holes.length ? { holes } : {}) }
  return table(edges, options)
}

/** A fixture seen from above, from the same result its parts come from: every placed piece where it stands, where round the table for a chair, and its outline; each support part's outline and middle; the chairs' track with the line each piece of it lies along; how many chairs fit, and how many were laid out. */
export interface FixturePlan {
  pieces: { id: string; kind: StockKind; at: Vec2; outline: Ring; round?: PlacedChair & { loop: number } }[]
  supports: { outline: Ring; at: Vec2 }[]
  track: Omit<Track, 'pieces'> & { pieces: (TrackPiece & { lineId: string | null })[] }
  chairMarks: ChairMark[]
  supportTrack: SupportLayout | null
  pedestals: PedestalLayout | null
  leftOut: TableResult['leftOut']
  capacity: number
  spaced: number
}

/**
 * What the plan draws for a fixture, read from the result its parts come
 * from, so the plan and the scene cannot disagree: each chair as the hull
 * of its parts from above, and the middle of each support. Null for a
 * fixture no recipe builds.
 */
export function fixturePlan(fixture: Fixture, lines: Line[], fixtures: Fixture[] = []): FixturePlan | null {
  const built = tableOf(fixture, lines, fixtures)
  if (!built) return null
  const kept = plans.get(built)
  if (kept) return kept
  const plan = planOf(built, new Map(faceEdges(fixture, lines).map(e => [e.id, e.lineId])))
  plans.set(built, plan)
  return plan
}

/** Plans kept with the results they were read from, so a kept result is not read again. */
const plans = new WeakMap<TableResult, FixturePlan>()

/** Each stock item's outline from above in its own frame, found once: a chair's plan is this outline carried to where it stands. */
const itemOutlines = new Map<StockKind, Ring>()
function itemOutline(kind: StockKind): Ring {
  let outline = itemOutlines.get(kind)
  if (!outline) itemOutlines.set(kind, (outline = footprint(STOCK_ITEMS[kind].parts)))
  return outline
}

function planOf(built: TableResult, lineOf: Map<string, string | null>): FixturePlan {
  const supports = built.parts.flatMap(part => {
    if (part.role !== 'support') return []
    const outline = footprint([part])
    return [{ outline, at: [outline.reduce((s, p) => s + p[0], 0) / outline.length, outline.reduce((s, p) => s + p[1], 0) / outline.length] as Vec2 }]
  })
  return {
    pieces: built.placements.map(p => {
      const t = facing(p.at, p.front, p.elevation)
      return { id: p.id, kind: p.kind, at: p.at, outline: itemOutline(p.kind).map(([x, y]): Vec2 => applyTransform(t, [x, y, 0]).slice(0, 2) as Vec2), ...(p.round ? { round: p.round } : {}) }
    }),
    supports,
    track: { ...built.track, pieces: built.track.pieces.map(piece => ({ ...piece, lineId: lineOf.get(piece.edgeId) ?? null })) },
    chairMarks: built.chairMarks,
    supportTrack: built.supportTrack,
    pedestals: built.pedestals,
    leftOut: built.leftOut,
    capacity: built.capacity,
    spaced: built.spaced
  }
}
