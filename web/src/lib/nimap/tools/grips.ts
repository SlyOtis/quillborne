import type { Polygon, Ring, Vec2 } from '../geometry/vector'
import { distance, distanceToSegment, dot, normalize, pointInRing, projectOntoSegment, sub } from '../geometry/vector'
import type { EdgeRole, Fixture, Level, Line, SurfaceItem } from '../model/types'
import { itemFootprint, standsOn, surfaceFrame, surfacePlacements } from '../furniture/surface'
import { seatLine, settleBar, trackAt, trackNearest, trackPlace, trackPoint, trackRun, type EdgePlace, type PlacedSupport } from '../furniture/table'
import { along, lengthOf } from '../furniture/outline'
import { fixturePlan, KIND_ROLES, SUPPORT_INSET_MAX, SUPPORT_INSET_MIN, TABLE_CLEARANCE_MAX, TABLE_CLEARANCE_MIN, tableParameters, tableRecipe, type FixturePlan, type TableParameters } from '../furniture/recipes'
import type { Command } from './commands'
import type { CursorName } from './cursor'
import { resizeCursor } from './cursor'
import type { Selection } from './selection'
import { alongAxis, aroundFrom, settle } from './grab'
import { centimetres } from './width'
import { quantize } from '../model/precision'

/**
 * A control that belongs to a selected thing and exists only while it is
 * selected, drawn and hit before anything else, as a curve's handles are.
 * A selected table has its chairs' track along each line of its outline,
 * which stands for all its chairs; each chair, which stands for itself;
 * a mark in every gap where one more chair fits; and, standing on legs,
 * T-bases, frames or panels, the supports' track, which stands for all of
 * them, each support, the two ends of a T-base, frame or panel, and a mark
 * where one more would stand; on pedestals, a handle at each column.
 */
export type Grip =
  | { kind: 'track'; fixtureId: string; lineId: string; role: EdgeRole; on: boolean; points: Vec2[] }
  | { kind: 'chair'; fixtureId: string; index: number; outline: Ring }
  | { kind: 'add'; fixtureId: string; point: Vec2; place: EdgePlace }
  | { kind: 'supportTrack'; fixtureId: string; points: Vec2[] }
  | { kind: 'support'; fixtureId: string; index: number; point: Vec2; outline: Polygon | null; inward: Vec2; bends: boolean }
  | { kind: 'supportEnd'; fixtureId: string; index: number; end: 0 | 1; point: Vec2; tangent: Vec2 }
  | { kind: 'supportAdd'; fixtureId: string; point: Vec2; support: PlacedSupport }
  | { kind: 'pedestal'; fixtureId: string; index: number; point: Vec2 }
  | { kind: 'item'; fixtureId: string; index: number; point: Vec2; outline: Ring }

/** What names a grip, so the same one can be recognised from one frame to the next. */
export function gripKey(grip: Grip): string {
  switch (grip.kind) {
    case 'track':
      return `track:${grip.fixtureId}:${grip.lineId}:${grip.points[0].join()}`
    case 'chair':
    case 'support':
    case 'pedestal':
    case 'item':
      return `${grip.kind}:${grip.fixtureId}:${grip.index}`
    case 'add':
      return `add:${grip.fixtureId}:${grip.place.edge}:${grip.place.t.toFixed(4)}`
    case 'supportTrack':
      return `supportTrack:${grip.fixtureId}`
    case 'supportEnd':
      return `supportEnd:${grip.fixtureId}:${grip.index}:${grip.end}`
    case 'supportAdd':
      return `supportAdd:${grip.fixtureId}:${grip.support.edge}:${grip.support.t.toFixed(4)}`
  }
}

/** Grips that are a point or a small area, which win over the selection box wherever they are; the rest are lines, which give way to the box's edges and corners. */
export const isPointGrip = (grip: Grip): boolean => grip.kind !== 'track' && grip.kind !== 'supportTrack'

type Piece = FixturePlan['track']['pieces'][number]

const mod = (x: number, m: number): number => ((x % m) + m) % m

/** The nearest point of the track to `p` among the pieces `pick` allows: how far from it, how far round the loop and on which edge, and the direction along the loop there. */
function nearest(plan: FixturePlan, p: Vec2, pick: (piece: Piece) => boolean = () => true): { distance: number; loop: number; edgeId: string; tangent: Vec2 } | null {
  let best: { distance: number; loop: number; edgeId: string; tangent: Vec2 } | null = null
  for (const piece of plan.track.pieces) {
    if (!pick(piece)) continue
    for (let i = 1; i < piece.points.length; i++) {
      const [a, b] = [piece.points[i - 1], piece.points[i]]
      const { point, t } = projectOntoSegment(p, a, b)
      const d = distance(p, point)
      if (!best || d < best.distance) best = { distance: d, loop: piece.loop[i - 1] + t * (piece.loop[i] - piece.loop[i - 1]), edgeId: piece.edgeId, tangent: normalize(sub(b, a)) }
    }
  }
  return best
}

type Span = FixturePlan['track']['spans'][number]

/** The edge `loop` round the table lies on; a point on a join belongs to the edge before it. */
const spanAt = (plan: FixturePlan, loop: number): Span => {
  const s = mod(loop, plan.track.length)
  return plan.track.spans.find(p => s <= p.from + p.length + 1e-9) ?? plan.track.spans[plan.track.spans.length - 1]
}

/** Where round the table `loop` is, as a place on its edge, or on the edge `edgeId` when given, since a join lies on two. */
function placeAt(plan: FixturePlan, loop: number, edgeId?: string): EdgePlace {
  const span = (edgeId && plan.track.spans.find(p => p.edgeId === edgeId)) || spanAt(plan, loop)
  const s = edgeId ? loop : mod(loop, plan.track.length)
  return { edge: span.edgeId, t: span.length ? Math.max(0, Math.min(1, (s - span.from) / span.length)) : 0 }
}

/** How far round the loop a place on the table's edge is, or null when its edge is gone. */
function loopOf(plan: FixturePlan, place: EdgePlace): number | null {
  const span = plan.track.spans.find(p => p.edgeId === place.edge)
  return span ? span.from + place.t * span.length : null
}

/** The table's chairs as a hand would edit them: the placed ones as stored, or the laid-out ones as they stand now, so the first edit of one chair keeps every other where it is. */
const chairsOf = (fixture: Fixture, plan: FixturePlan): EdgePlace[] => tableParameters(fixture).placed ?? plan.pieces.flatMap(p => (p.round ? [{ edge: p.round.edge, t: p.round.t }] : []))

/** The shortest a T-base's foot, a frame or a panel may be made by dragging an end. */
const MIN_SPAN = 0.15

/** The table's supports on its track as a hand would edit them, the same way: the placed ones as stored, or those it stands on of its own as they stand. */
const placesOf = (fixture: Fixture, plan: FixturePlan): PlacedSupport[] =>
  tableParameters(fixture).supportPlaces ??
  (plan.supportTrack?.supports ?? []).map(({ edge, t, to, offset, curved }) => {
    const inset = quantize([offset ?? 0, 0])[0]
    return { edge, t, ...(to ? { to: { edge: to.edge, t: to.t } } : {}), ...(inset ? { offset: inset } : {}), ...(curved ? { curved } : {}) }
  })

/** The table's pedestals as a hand would edit them, the same way. */
const pedestalsOf = (fixture: Fixture, plan: FixturePlan): Vec2[] => tableParameters(fixture).pedestals ?? (plan.pedestals?.pedestals ?? []).map(p => quantize(p.offset))

/** The middle of a line by its length. */
const middleOf = (line: Vec2[]): Vec2 => along(line, false, lengthOf({ points: line, closed: false }) / 2).p

/** The grips of the selected fixtures whose kind reads a role on its edges: for a table, its track, its chairs and where one more fits, and its supports, their track, a stretch's ends and where one more would stand, or its pedestals. */
export function fixtureGrips(selection: Selection, level: Level): Grip[] {
  const grips: Grip[] = []
  for (const f of level.fixtures) {
    if (f.polygon && f.items?.length && selection.fixtureIds.has(f.id))
      surfacePlacements(f, level.fixtureLines).forEach(p => grips.push({ kind: 'item', fixtureId: f.id, index: f.items!.indexOf(p.item), point: p.at, outline: itemFootprint(p.kind, p.at, p.front) }))
    const role = KIND_ROLES[f.kind]?.[0]
    if (!role || !f.polygon || !selection.fixtureIds.has(f.id)) continue
    const plan = fixturePlan(f, level.fixtureLines, level.fixtures)
    if (!plan) continue
    const parameters = tableParameters(f)
    plan.pieces.forEach((p, i) => {
      if (p.round) grips.push({ kind: 'chair', fixtureId: f.id, index: parameters.placed ? Number(p.id.split(':')[1]) : i, outline: p.outline })
    })
    for (const mark of plan.chairMarks) grips.push({ kind: 'add', fixtureId: f.id, point: mark.at, place: { edge: mark.edge, t: mark.t } })
    for (const piece of plan.track.pieces) if (piece.lineId) grips.push({ kind: 'track', fixtureId: f.id, lineId: piece.lineId, role, on: f.roles?.[piece.lineId] === role, points: piece.points })
    const track = plan.supportTrack
    track?.supports.forEach((s, i) => {
      const index = parameters.supportPlaces ? s.index : i
      grips.push({ kind: 'support', fixtureId: f.id, index, point: middleOf(s.line), outline: s.outline, inward: s.inward, bends: s.bends })
      if (s.line.length < 2) return
      const n = s.line.length
      grips.push({ kind: 'supportEnd', fixtureId: f.id, index, end: 0, point: s.line[0], tangent: normalize(sub(s.line[1], s.line[0])) })
      grips.push({ kind: 'supportEnd', fixtureId: f.id, index, end: 1, point: s.line[n - 1], tangent: normalize(sub(s.line[n - 1], s.line[n - 2])) })
    })
    for (const { at, ...support } of track?.marks ?? []) grips.push({ kind: 'supportAdd', fixtureId: f.id, point: at, support })
    if (track?.points.length) grips.push({ kind: 'supportTrack', fixtureId: f.id, points: [...track.points, track.points[0]] })
    plan.pedestals?.pedestals.forEach((p, i) => grips.push({ kind: 'pedestal', fixtureId: f.id, index: parameters.pedestals ? p.index : i, point: p.at }))
  }
  return grips
}

const toPolyline = (points: Vec2[], p: Vec2): number => points.slice(1).reduce((best, b, i) => Math.min(best, distanceToSegment(p, points[i], b)), Infinity)

/** The grip under a point: a mark for one more chair or support first, then the nearest of the supports' dots (a leg, a bar's middle or end, a pedestal), then a chair, then the chairs' track and the supports' track, each within `radius`. A bar is taken by its dots only, so the track under it is the track. */
export function gripAt(grips: Grip[], point: Vec2, radius: number): Grip | null {
  const dots = grips.filter((g): g is Extract<Grip, { kind: 'support' | 'supportEnd' | 'pedestal' }> => (g.kind === 'support' || g.kind === 'supportEnd' || g.kind === 'pedestal') && distance(g.point, point) < radius)
  return (
    grips.find(g => (g.kind === 'add' || g.kind === 'supportAdd') && distance(g.point, point) < radius) ??
    dots.reduce<Grip | null>((best, g) => (!best || distance(g.point, point) < distance((best as { point: Vec2 }).point, point) ? g : best), null) ??
    grips.find(g => g.kind === 'item' && pointInRing(point, g.outline)) ??
    grips.find(g => g.kind === 'chair' && pointInRing(point, g.outline)) ??
    grips.find(g => (g.kind === 'track' || g.kind === 'supportTrack') && toPolyline(g.points, point) < radius) ??
    null
  )
}

/** The unit direction across a polyline at its point nearest `p`. */
function across(points: Vec2[], p: Vec2): Vec2 {
  let best = { d: Infinity, dir: [0, 1] as Vec2 }
  points.slice(1).forEach((b, i) => {
    const d = distanceToSegment(p, points[i], b)
    const t = normalize(sub(b, points[i]))
    if (d < best.d) best = { d, dir: [-t[1], t[0]] }
  })
  return best.dir
}

const acrossCursor = (d: Vec2): CursorName => resizeCursor((Math.atan2(-d[1], d[0]) * 180) / Math.PI)

/** The cursor over a grip: a hand on the chairs' track and the supports' track, which drag them all round or in and out; the move cursor on a chair, a support or a pedestal's handle, with the remove badge under Alt; along a stretch at its ends, which make it longer or shorter; the add badge on a mark. */
export function gripCursor(grip: Grip, _point: Vec2, alt: boolean): CursorName {
  if (grip.kind === 'add' || grip.kind === 'supportAdd') return 'arrow-add'
  if (grip.kind === 'chair' || grip.kind === 'support' || grip.kind === 'pedestal' || grip.kind === 'item') return alt ? 'arrow-remove' : 'move'
  if (grip.kind === 'supportEnd') return acrossCursor(grip.tangent)
  return 'grab'
}

type Edit = { commands: Command[]; commit: string }

/** A change a grip asks for: to a table's parameters, or to the items on a top. */
export type TableChange = Partial<TableParameters> & { items?: SurfaceItem[] }

/**
 * What a press on a grip starts: an edit on the spot (a chair, a support or
 * a pedestal removed or added), or a grip in hand, which the next moves make
 * a click or a drag.
 */
export type GripPress =
  | ({ gesture: 'edit' } & Edit)
  | { gesture: 'hold'; grip: Exclude<Grip, { kind: 'add' } | { kind: 'supportAdd' }>; fixture: Fixture; plan: FixturePlan | null; lines: Line[]; fixtures: Fixture[]; point: Vec2 }
  | { gesture: 'none' }
export type HeldGrip = Extract<GripPress, { gesture: 'hold' }>

const changeEdit = (fixture: Fixture, change: TableChange, commit: string): Edit => {
  const { items, ...parameters } = change
  return { commands: [{ type: 'setFixture', fixtureId: fixture.id, patch: { ...(Object.keys(parameters).length ? { recipe: tableRecipe(fixture, parameters) } : {}), ...('items' in change ? { items } : {}) } }], commit }
}

export function pressGrip(grip: Grip, level: Level, point: Vec2, alt: boolean): GripPress {
  const fixture = level.fixtures.find(f => f.id === grip.fixtureId)
  if (fixture && grip.kind === 'item') {
    if (alt) return { gesture: 'edit', ...changeEdit(fixture, { items: (fixture.items ?? []).filter((_, i) => i !== grip.index) }, 'Remove item') }
    return { gesture: 'hold', grip, fixture, plan: null, lines: level.fixtureLines, fixtures: level.fixtures, point }
  }
  const plan = fixture && fixturePlan(fixture, level.fixtureLines, level.fixtures)
  if (!fixture || !plan) return { gesture: 'none' }
  if (grip.kind === 'add') return { gesture: 'edit', ...changeEdit(fixture, { placed: [...chairsOf(fixture, plan), grip.place] }, 'Add chair') }
  if (grip.kind === 'chair' && alt) return { gesture: 'edit', ...changeEdit(fixture, { placed: chairsOf(fixture, plan).filter((_, i) => i !== grip.index) }, 'Remove chair') }
  if (grip.kind === 'supportAdd') return { gesture: 'edit', ...changeEdit(fixture, { supportPlaces: [...placesOf(fixture, plan), grip.support] }, 'Add support') }
  if (grip.kind === 'support' && alt) return { gesture: 'edit', ...changeEdit(fixture, { supportPlaces: placesOf(fixture, plan).filter((_, i) => i !== grip.index) }, 'Remove support') }
  if (grip.kind === 'pedestal' && alt) return { gesture: 'edit', ...changeEdit(fixture, { pedestals: pedestalsOf(fixture, plan).filter((_, i) => i !== grip.index) }, 'Remove pedestal') }
  return { gesture: 'hold', grip, fixture, plan, lines: level.fixtureLines, fixtures: level.fixtures, point }
}

/** What a click on a grip in hand does: on the chairs' track, seats that edge or stops seating it; on a bar's middle where the track bends between its ends, lays it along the curve or straight again; elsewhere nothing. */
export function gripClick(held: HeldGrip): Edit | null {
  const grip = held.grip
  if (grip.kind === 'support' && grip.bends) {
    const places = placesOf(held.fixture, held.plan!)
    const place = places[grip.index]
    if (!place?.to) return null
    const { curved: _, ...straight } = place
    return changeEdit(held.fixture, { supportPlaces: places.map((p, i) => (i === grip.index ? (place.curved ? straight : { ...straight, curved: true }) : p)) }, place.curved ? 'Straight support' : 'Support along the curve')
  }
  if (grip.kind !== 'track') return null
  const roles = { ...held.fixture.roles }
  if (grip.on) delete roles[grip.lineId]
  else roles[grip.lineId] = grip.role
  return { commands: [{ type: 'setFixture', fixtureId: held.fixture.id, patch: { roles } }], commit: grip.on ? 'Edge off' : 'Edge on' }
}

/** Whether a change leaves out no more chairs for meeting the table or one another, nor supports for meeting another or standing off the top, than the table did as it was pressed. How many the rule lays out may change with it; only a clash may not. */
function fits(held: HeldGrip, change: TableChange): boolean {
  if (change.items) {
    const moved = { ...held.fixture, items: change.items }
    return !!held.fixture.polygon && surfacePlacements(moved, held.lines).every(p => standsOn(held.fixture.polygon!, itemFootprint(p.kind, p.at, p.front)))
  }
  if (!held.plan) return true
  const plan = fixturePlan({ ...held.fixture, recipe: tableRecipe(held.fixture, change) }, held.lines, held.fixtures)
  return !!plan && plan.leftOut.chairs <= held.plan.leftOut.chairs && plan.leftOut.supports <= held.plan.leftOut.supports
}

const inCentimetres = (metres: number, min: number, max: number): number => Math.min(max, Math.max(min, Math.round(metres * 100) / 100))

/**
 * A drag of a grip in hand, as one number: its value at the press, the
 * value the hand asks for, and the table's parameters at a value with the
 * hand at a point, or null where the thing in hand cannot be; how finely
 * the door rule searches between the two; what its edit is called, its
 * cursor, and what it reads out at the hand. A drag in two directions, as
 * the pedestal's, reads the share of the way from the press to the hand.
 */
export interface GripDrag {
  start: number
  read(point: Vec2): number
  change(x: number, point: Vec2): TableChange | null
  resolution: number
  commit: string
  cursor: CursorName
  label?(change: TableChange): string | null
}

/** Where a drag has taken the table with the hand at `point`: the change at the value the hand asks for, or, when that would leave out more chairs, legs or supports than at the press, at the farthest value toward it that does not. */
export function dragChange(held: HeldGrip, drag: GripDrag, point: Vec2): TableChange {
  const at = (x: number) => drag.change(x, point)
  const x = settle(drag.start, drag.read(point), x => {
    const change = at(x)
    return !!change && fits(held, change)
  }, drag.resolution)
  return at(x) ?? at(drag.start)!
}

/**
 * What a drag of a grip in hand does, decided when it starts: along the
 * chairs' track it turns every chair round the table, the laid-out ones
 * along their runs, so those on the run pressed follow the hand, and the
 * placed ones each by the same distance along the seat line; across it,
 * the space between the table and the chairs follows the hand's travel
 * across the track where it pressed, below nothing pushing them under the
 * top; a chair moves alone along its track, to the point nearest the
 * hand. Along the supports' track every support moves round the table by
 * the hand's travel along it, and across it the track moves in or out, the
 * supports with it; along a support, it moves alone round the track, and
 * across it, it moves in or out from the track; a stretch's end moves
 * round the track to the point nearest the hand, the stretch no shorter
 * than `MIN_SPAN`; a pedestal follows the hand's travel, as far toward the
 * hand as its foot stays on the top.
 */
export function gripDrag(held: HeldGrip, point: Vec2): GripDrag {
  const { grip, fixture } = held
  if (grip.kind === 'item') {
    const items = fixture.items ?? []
    const frame = surfaceFrame(fixture, held.lines)!
    const from = items[grip.index].at
    const inCm = (v: number) => Math.round(v * 100) / 100
    return {
      start: 0,
      read: () => 1,
      change: (x, p) => {
        const d = sub(p, held.point)
        const to: Vec2 = [from[0] + x * dot(d, frame.along), from[1] + x * dot(d, frame.out)]
        return { items: items.map((item, i) => (i === grip.index ? { ...item, at: [inCm(to[0]), inCm(to[1])] as Vec2 } : item)) }
      },
      resolution: 1e-3,
      commit: 'Move item',
      cursor: 'move'
    }
  }
  const plan = held.plan!
  const parameters = tableParameters(fixture)
  const line = seatLine(plan.track)
  const U = line.length || 1
  if (grip.kind === 'track') {
    const on = nearest(plan, held.point)!
    const outward: Vec2 = [on.tangent[1], -on.tangent[0]]
    if (Math.abs(alongAxis(held.point, on.tangent, point)) >= Math.abs(alongAxis(held.point, outward, point))) {
      const pressed = line.fromLoop(on.loop)
      const moved = (p: Vec2) => aroundFrom(pressed, line.fromLoop(nearest(plan, p)?.loop ?? on.loop), U) - pressed
      const common = { commit: 'Turn chairs', cursor: 'grabbing' as const, resolution: 1e-3 }
      if (!parameters.placed) {
        const run = plan.track.runs.find(r => r.spacing && mod(pressed - r.from, U) <= r.length)
        const spacing = run?.spacing ?? (plan.spaced ? U / plan.spaced : U)
        const start = parameters.turn ?? 0
        return { ...common, start, read: p => start + moved(p) / spacing, change: x => ({ turn: mod(x, 1) }) }
      }
      const placed = parameters.placed
      return {
        ...common,
        start: 0,
        read: moved,
        change: x => ({
          placed: placed.map(c => {
            const s = loopOf(plan, c)
            if (s === null) return c
            const spot = line.at(line.fromLoop(s) + x)
            return placeAt(plan, spot.s, spot.edgeId)
          })
        })
      }
    }
    const start = plan.track.clearance
    return {
      start,
      read: p => start + alongAxis(held.point, outward, p),
      change: x => ({ clearance: inCentimetres(x, TABLE_CLEARANCE_MIN, TABLE_CLEARANCE_MAX) }),
      resolution: 0.005,
      commit: 'Chair gap',
      cursor: acrossCursor(outward),
      label: change => (change.clearance === undefined ? null : centimetres(change.clearance))
    }
  }
  if (grip.kind === 'chair') {
    const chairs = chairsOf(fixture, plan)
    const start = line.fromLoop(loopOf(plan, chairs[grip.index]) ?? 0)
    return {
      start,
      read(p) {
        const on = nearest(plan, p, piece => piece.seating)
        return on ? aroundFrom(start, line.fromLoop(on.loop), U) : start
      },
      change(x) {
        const spot = line.at(x)
        const piece = plan.track.pieces.find(p => p.edgeId === spot.edgeId)
        return piece?.seating ? { placed: chairs.map((c, i) => (i === grip.index ? placeAt(plan, spot.s, spot.edgeId) : c)) } : null
      },
      resolution: 1e-3,
      commit: 'Move chair',
      cursor: 'move'
    }
  }
  if (grip.kind === 'pedestal') {
    const list = pedestalsOf(fixture, plan)
    const from = list[grip.index] ?? [0, 0]
    const { frame } = plan.pedestals!
    const toward = (p: Vec2): Vec2 => {
      const d = sub(p, held.point)
      return [from[0] + dot(d, frame.along), from[1] + dot(d, frame.out)]
    }
    const inCm = (v: number) => Math.round(v * 100) / 100
    return {
      start: 0,
      read: () => 1,
      change: (x, p) => {
        const to = toward(p)
        return { pedestals: list.map((o, i): Vec2 => (i === grip.index ? [inCm(from[0] + (to[0] - from[0]) * x), inCm(from[1] + (to[1] - from[1]) * x)] : o)) }
      },
      resolution: 1e-3,
      commit: 'Move pedestal',
      cursor: 'move'
    }
  }
  const path = plan.supportTrack!
  const spans = plan.track.spans
  const L = path.length || 1
  const places = placesOf(fixture, plan)
  const round = (p: Vec2) => trackNearest(path, p)
  const pressed = round(held.point)
  const travel = (p: Vec2) => aroundFrom(pressed, round(p), L) - pressed
  const barOf = (s: PlacedSupport): [number, number] | null => {
    const from = trackAt(path, spans, s)
    const to = s.to ? trackAt(path, spans, s.to) : null
    return from === null || to === null ? null : settleBar(path, from, mod(to - from, L))
  }
  const moved = (s: PlacedSupport, by: number): PlacedSupport => {
    const from = trackAt(path, spans, s)
    const bar = barOf(s)
    if (from === null) return s
    if (!bar) return { ...s, ...trackPlace(path, spans, from + by).place }
    const [a, b] = settleBar(path, bar[0] + by, bar[1] - bar[0])
    return { ...s, ...trackPlace(path, spans, a).place, to: trackPlace(path, spans, b).place }
  }
  const withSupport = (index: number, support: PlacedSupport): TableChange => ({ supportPlaces: places.map((s, i) => (i === index ? support : s)) })
  const depth = (offset: number | undefined) => centimetres(path.inset + (offset ?? 0))
  if (grip.kind === 'supportEnd') {
    const support = places[grip.index]
    const [r0, r1] = barOf(support) ?? [0, 0]
    const run = trackRun(path, (r0 + r1) / 2)
    const shift = run ? run.at - (r0 + r1) / 2 : 0
    const [a, b] = [r0 + shift, r1 + shift]
    const room = run ? run.to - run.from : L
    const [lo, hi] = !run ? [a, b] : run.closed ? [b - room / 2, a + room / 2] : [run.from, run.to]
    const start = grip.end ? b : a
    return {
      start,
      read: p => start + travel(p),
      change: x =>
        grip.end
          ? withSupport(grip.index, { ...support, to: trackPlace(path, spans, Math.min(hi, Math.max(a + MIN_SPAN, x))).place })
          : withSupport(grip.index, { ...support, ...trackPlace(path, spans, Math.max(lo, Math.min(b - MIN_SPAN, x))).place }),
      resolution: 1e-3,
      commit: 'Support length',
      cursor: acrossCursor(grip.tangent),
      label: change => {
        const s = change.supportPlaces?.[grip.index]
        const bar = s && barOf(s)
        return bar ? centimetres(distance(trackPoint(path, bar[0]), trackPoint(path, bar[1]))) : null
      }
    }
  }
  const inward = grip.kind === 'support' ? grip.inward : across(grip.points, held.point)
  const tangent: Vec2 = [inward[1], -inward[0]]
  const sideways = Math.abs(alongAxis(held.point, tangent, point)) >= Math.abs(alongAxis(held.point, inward, point))
  if (grip.kind === 'supportTrack') {
    if (sideways) return { start: 0, read: travel, change: x => ({ supportPlaces: places.map(s => moved(s, x)) }), resolution: 1e-3, commit: 'Move supports', cursor: 'grabbing' }
    const start = path.inset
    return {
      start,
      read: p => start + alongAxis(held.point, inward, p),
      change: x => ({ supportInset: inCentimetres(x, SUPPORT_INSET_MIN, Math.max(SUPPORT_INSET_MIN, Math.min(SUPPORT_INSET_MAX, path.deepest))) }),
      resolution: 0.005,
      commit: 'Support inset',
      cursor: acrossCursor(inward),
      label: change => (change.supportInset === undefined ? null : centimetres(change.supportInset))
    }
  }
  const support = places[grip.index]
  if (sideways) return { start: 0, read: travel, change: x => withSupport(grip.index, moved(support, x)), resolution: 1e-3, commit: 'Move support', cursor: 'grabbing' }
  const start = support.offset ?? 0
  return {
    start,
    read: p => start + alongAxis(held.point, inward, p),
    change: x => {
      const offset = inCentimetres(x, -path.inset, SUPPORT_INSET_MAX)
      const { offset: _, ...rest } = support
      return withSupport(grip.index, offset ? { ...rest, offset } : rest)
    },
    resolution: 0.005,
    commit: 'Move support',
    cursor: acrossCursor(inward),
    label: change => depth(change.supportPlaces?.[grip.index]?.offset)
  }
}

/** A drag's change as an edit. */
export const gripEdit = (held: HeldGrip, drag: GripDrag, change: TableChange): Edit => changeEdit(held.fixture, change, drag.commit)

/** Whether a change leaves the table's parameters as they were, so a drag that ends there changes nothing. */
export const unchanged = (held: HeldGrip, change: TableChange): boolean => {
  const { items, ...parameters } = change
  return (!('items' in change) || JSON.stringify(items) === JSON.stringify(held.fixture.items)) && (!Object.keys(parameters).length || JSON.stringify(tableRecipe(held.fixture, parameters)) === JSON.stringify(tableRecipe(held.fixture, {})))
}
