import type { Polygon, Ring, Vec2 } from '../geometry/vector'
import { add, bounds, boxesOverlap, cross, distance, distanceToSegment, dot, mul, normalize, perpendicular, pointInPolygon, pointInRing, projectOntoSegment, segmentCrossing, signedArea, sub, type Box } from '../geometry/vector'
import { ellipseCubics, flattenCubic } from '../geometry/curve'
import { intersection, offset, union } from '../geometry/clip'
import { labelPoint } from '../geometry/label-point'
import { overlapArea } from '../geometry/overlap'
import type { Line } from '../model/types'
import { cubicOf, lineChords, pointOnLine } from '../model/lines'
import type { Part } from './parts'
import { applyTransform, cylinderPart, facing, prismPart } from './parts'
import { STOCK_ITEMS, placeItem, type StockKind } from './items'
import { convexHull, footprint, partsExtent } from './mesh'
import { along, chordRing, direction, lengthOf, ringOf } from './outline'

/** One edge of a table's outline: a line of the trace, and whether chairs are fitted along it. */
export interface TableEdge extends Line {
  seating?: boolean
}

export type SupportStyle = 'none' | 'auto' | 'legs' | 'pedestal' | 'tbases' | 'frames' | 'panels'

const DEFAULTS_HEIGHT = 0.74

export interface TableOptions {
  /** Height of the top surface. */
  height?: number
  /** Rings cut out of the top, such as the middle of a donut table. */
  holes?: Ring[]
  thickness?: number
  chair?: StockKind
  /** How many chairs; every chair that fits when left out. */
  seats?: number
  /** Space between neighbouring chairs along an edge. */
  gap?: number
  /** Space between the table's edge and the front of a chair. */
  clearance?: number
  /** How far the chairs are turned from where they are laid out, as a share of the space between two: every run's chairs slide along it by that share of their own spacing, so round a round table they turn round it. */
  turn?: number
  /** Chairs placed by hand, each on an edge by id and a share of the way along it; when given, these are the chairs, and the count and the turn are not read. */
  placed?: PlacedChair[]
  /** How far in from the top's edge the supports' track runs, which legs stand on and T-bases, frames and panels are laid along; each style has its own when left out (`SUPPORT_INSETS`). */
  supportInset?: number
  /** Legs, T-bases, frames or panels placed by hand on the supports' track; when given, these are the supports. */
  supportPlaces?: PlacedSupport[]
  /** Pedestals placed by hand, each by how far it stands from the middle of the top's area, along the table's first edge by id and out from it; when given, these are the pedestals. */
  pedestals?: Vec2[]
  /** Screens on the top in front of every chair, each facing its chair as far back as it fits: a rule that proposes where screens stand, as the chairs' is. None when left out. */
  screens?: number
  /**
   * What holds the top up: a pedestal by default, a column on a foot, which
   * reads cleanly from above, two under a long top; legs, T-bases, frames or
   * panels on the supports' track; or nothing. Each style builds its own supports on any outline. Auto picks
   * panels for a straight table with an end no one sits at next to one
   * someone does, as a bench or a desk has, and a pedestal otherwise.
   */
  supports?: SupportStyle
}

export interface DeskOptions extends TableOptions {
  monitors?: number
}

/** The table's height when none is asked for. */
export const TABLE_HEIGHT = DEFAULTS_HEIGHT

/** A place on a table's edge: an edge by its id, and a share of the way along it. */
export interface EdgePlace {
  edge: string
  t: number
}

/** A chair where a hand put it. */
export type PlacedChair = EdgePlace

/**
 * A support where a hand put it on the table's supports' track: a leg at
 * a place, or a T-base, frame or panel as a bar from there to `to`, the
 * way the table's edge runs, both ends on one side of the track
 * (`SupportPath.runs`), straight between them unless `curved` lays it
 * along the track where that side bends. `offset` stands it that much
 * farther in than the track: a straight bar moved in square to itself, a
 * curved one along the curve moved in.
 */
export interface PlacedSupport extends EdgePlace {
  to?: EdgePlace
  offset?: number
  curved?: boolean
}

/**
 * A table's supports' track: how far in from the top's edge it runs; the
 * pieces along each edge a support stands on; the whole track as one
 * closed path through them and what joins them, round inward corners too,
 * with how far round the path each of its points is, how long it is, and
 * how far round it each piece starts; and its sides, which a bar stays
 * within: the stretches of it from corner to corner, a curve meeting a
 * straight edge counting as a corner, each by how far round the path it
 * starts and ends (past `length` when it runs on past the start), or the
 * whole path, closed, when it has no corner; and how far in the track
 * can run before the top has none of it left.
 */
export interface SupportPath {
  inset: number
  deepest: number
  pieces: TrackPiece[]
  points: Vec2[]
  rs: number[]
  length: number
  starts: number[]
  runs: { from: number; to: number; closed: boolean }[]
}

/**
 * What stands on a table's supports' track: each support standing, with
 * its place in the list asked for, how far round the track's path it
 * starts and ends (the same for a leg), its line from above (a leg's one
 * point, a bar's ends and the points it bends at), its outline from above,
 * the direction in from the track at its middle, and whether the track
 * bends between a bar's ends, so it could be laid along it; and where one
 * more would stand.
 */
export interface SupportLayout extends SupportPath {
  supports: (PlacedSupport & { index: number; along: [number, number]; line: Vec2[]; outline: Polygon | null; inward: Vec2; bends: boolean })[]
  marks: (PlacedSupport & { at: Vec2 })[]
}

/** A table's pedestals: the table's own frame and the middle of its top's area, which each pedestal's offset is measured from, and each pedestal standing, with its place in the list asked for, its offset, where its column stands and its foot's outline from above. */
export interface PedestalLayout {
  frame: { along: Vec2; out: Vec2 }
  origin: Vec2
  pedestals: { index: number; offset: Vec2; at: Vec2; outline: Ring }[]
}

/** A stock item a recipe puts somewhere: where it stands, which way it faces, and how high the surface under it is; a chair round a table also says where round it, as a placed chair and as a distance round the table's loop. */
export interface Placement {
  id: string
  kind: StockKind
  at: Vec2
  front: Vec2
  elevation: number
  round?: PlacedChair & { loop: number }
}

/** One stretch of the track along one edge: where the centres of chairs along it stand, how far round the table's edge each point is, from where the edge starts round it, and how far along the seat line. */
export interface TrackPiece {
  edgeId: string
  seating: boolean
  from: number
  length: number
  points: Vec2[]
  loop: number[]
  seat: number[]
}

/**
 * Where chairs stand round a table: the clearance and the depth of a
 * chair in front of where it stands out from the table's edge, wherever a
 * chair there stands square to its own edge, all the way round, seating or
 * not. Measured round the table's edge from where its first edge by id
 * begins; `spans` say where each edge lies round it. Along the pieces runs
 * the seat line chairs are laid out on. `corners` join the pieces where a
 * chair steps from one to the next, for drawing.
 */
export interface Track {
  clearance: number
  reach: number
  /** How far apart two chairs' centres must stand along the seat line. */
  pitch: number
  length: number
  spans: { edgeId: string; from: number; length: number }[]
  /** The table's edge the track is measured round, as chords with how far round each point is. */
  edge: { points: Vec2[]; loop: number[] }
  pieces: TrackPiece[]
  corners: Vec2[][]
  /** The runs chairs are laid out along, as stretches of the seat line: where each starts along it, how long it is, and how far apart its chairs stand, nothing for a run with none. */
  runs: { from: number; length: number; spacing: number }[]
}

export interface TableResult {
  /** The outline as the recipe read it: chords, counter-clockwise. */
  outline: Ring
  parts: Part[]
  placements: Placement[]
  warnings: string[]
  track: Track
  /** Where one more chair fits. */
  chairMarks: ChairMark[]
  /** The supports' track and what stands on it, when the table stands on legs, T-bases, frames or panels. */
  supportTrack: SupportLayout | null
  /** The pedestals, when it stands on those. */
  pedestals: PedestalLayout | null
  /** How many chairs were left out because they would meet the table or one another, and how many supports because they would meet another or stand off the top. */
  leftOut: { chairs: number; supports: number }
  /** How many chairs fit along the seating edges as they are. */
  capacity: number
  /** How many chairs were spaced along the runs that seat, those falling on an edge that does not seat and left out included: the count a chair more or less changes. */
  spaced: number
}

/** The space a table leaves between its edge and a chair's front unless asked for another. */
export const DEFAULT_CLEARANCE = 0.08

const DEFAULTS = { height: DEFAULTS_HEIGHT, thickness: 0.05, gap: 0.2, clearance: DEFAULT_CLEARANCE }
/** Joins whose directions differ by less than this are one smooth edge for seating, and no corner for a leg. */
const SMOOTH = Math.cos((5 * Math.PI) / 180)
/** How far in from the top's edge legs stand unless asked for another. */
export const LEG_INSET = 0.07
const LEG_RADIUS = 0.025
/** Legs stand at most this far apart along the top's edge; a longer stretch gets legs between. */
const LEG_SPAN = 2.4
/** A stretch of the top's edge turning at least this much within `CORNER_REACH` is a corner, however rounded, and a leg stands in it. */
const CORNER_TURN = Math.PI / 4
const CORNER_REACH = 0.15
/** A top with no corner, as a round one, stands on at least this many legs. */
const ROUND_LEGS = 4
/** How far in from an end a panel stands when someone sits at that end, leaving room for knees. */
const PANEL_KNEES = 0.35
/** Two rectangles or two sides within this share of each other are as good as each other. */
const TIE = 0.01
/** A panel stands no nearer its end than where the top is this share of its widest across, so a rounded end still gets a panel worth the name. */
const PANEL_WIDTH = 0.7
const PANEL_INSET = 0.03
const PANEL_THICKNESS = 0.03
/** The square steel of a frame's posts, foot and rail, and how far a frame stands in from its end of the top. */
const FRAME_TUBE = 0.05
const FRAME_SETBACK = 0.05
/** A T-base's column, square, and its foot bar: as wide as the column, this high, and this share of the top across where it stands. */
const TBASE_COLUMN = 0.07
const TBASE_FOOT_HEIGHT = 0.05
const TBASE_FOOT_SPAN = 0.7
/** How far in from each end of the top a T-base stands, as a share of the top's length: a trestle's feet stand about two ninths in. */
const TBASE_SETBACK = 2 / 9
/** How much a stretch of the leg ring may turn and still be one corner: a rounded or cut corner turns about a right angle in all, two corners of a narrow ring twice that. */
const ONE_BEND = (3 * Math.PI) / 4
/** How far in from the top's edge a support's parts stop, so none shows past it. */
const EDGE_MARGIN = 0.005
/** A top longer than this stands on two pedestals. */
const PEDESTAL_SPAN = 1.8
const COLUMN_HALF_WIDTH = 0.09
const FOOT_HALF_WIDTH = 0.24
const FOOT_HEIGHT = 0.025
const MONITOR_MARGIN = 0.06
const MONITOR_GAP = 0.02

/** The first edge by id: where a layout that could start anywhere starts, so it stays put as the table moves. */
const firstById = <E extends Line>(edges: E[]): E => [...edges].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))[0]

interface Run {
  edges: TableEdge[]
  closed: boolean
}

/**
 * Edges grouped into runs that continue through smooth joins, whether they
 * seat or not; a ring smooth all round, as a round table's, is one closed
 * run.
 */
function runsOf(edges: TableEdge[], smooth: boolean[]): Run[] {
  const n = edges.length
  const continues = (i: number) => smooth[i % n]
  if (edges.every((_, i) => continues(i))) return [{ edges, closed: true }]
  let start = 0
  while (continues((start - 1 + n) % n)) start++
  const runs: Run[] = []
  let current: TableEdge[] = []
  for (let k = 0; k < n; k++) {
    const i = (start + k) % n
    current.push(edges[i])
    if (!continues(i)) {
      runs.push({ edges: current, closed: false })
      current = []
    }
  }
  return runs
}

/** How close to a join a point along the loop counts as at it: a chair standing on a join belongs to the edge before it, whatever float noise says. */
const AT_JOIN = 1e-9

/** The table's edge as one loop, from where its first edge by id begins: where each edge starts round it and how long it is, and the point, the direction and the edge anywhere round it. */
interface Loop {
  length: number
  spans: { edge: TableEdge; from: number; length: number }[]
  /** On an edge given, the point of that edge `loop` round, so a join can belong to the edge after it. */
  at(loop: number, on?: TableEdge): { p: Vec2; tangent: Vec2; edge: TableEdge; t: number }
  /** How far round the loop its point nearest `p` is. */
  project(p: Vec2): number
  /** How far `p` is from the loop. */
  distance(p: Vec2): number
  /** The loop as chords: their points, and how far round each one is. */
  chords: { points: Vec2[]; loop: number[] }
}

const flattened = (edge: TableEdge) => (edge.curve ? flattenCubic(cubicOf(edge), 5e-4) : { points: edge.points, ts: [0, 1] })

function loopOf(edges: TableEdge[]): Loop {
  const start = edges.indexOf(firstById(edges))
  const pieces: { a: Vec2; b: Vec2; s0: number; len: number; edge: TableEdge; t0: number; t1: number }[] = []
  const spans: Loop['spans'] = []
  let length = 0
  for (const edge of [...edges.slice(start), ...edges.slice(0, start)]) {
    const from = length
    const { points, ts } = flattened(edge)
    for (let i = 1; i < points.length; i++) {
      const len = distance(points[i - 1], points[i])
      pieces.push({ a: points[i - 1], b: points[i], s0: length, len, edge, t0: ts[i - 1], t1: ts[i] })
      length += len
    }
    spans.push({ edge, from, length: length - from })
  }
  return {
    length,
    spans,
    chords: { points: [...pieces.map(p => p.a), pieces[pieces.length - 1].b], loop: [...pieces.map(p => p.s0), length] },
    at(loop, on) {
      const s = on ? loop : ((loop % length) + length) % length
      const own = on ? pieces.filter(p => p.edge === on) : pieces
      const piece = own.find(p => s <= p.s0 + p.len + AT_JOIN) ?? own[own.length - 1]
      const u = piece.len ? Math.max(0, Math.min(1, (s - piece.s0) / piece.len)) : 0
      const span = spans.find(x => x.edge === piece.edge)!
      return { p: add(piece.a, mul(sub(piece.b, piece.a), u)), tangent: direction(piece.edge, piece.t0 + (piece.t1 - piece.t0) * u), edge: piece.edge, t: span.length ? Math.min(1, (s - span.from) / span.length) : 0 }
    },
    project(p) {
      let best = { d: Infinity, s: 0 }
      for (const piece of pieces) {
        const { point, t } = projectOntoSegment(p, piece.a, piece.b)
        const d = distance(p, point)
        if (d < best.d) best = { d, s: piece.s0 + t * piece.len }
      }
      return best.s
    },
    distance(p) {
      return pieces.reduce((best, piece) => Math.min(best, distanceToSegment(p, piece.a, piece.b)), Infinity)
    }
  }
}

const ARC_STEPS = 8

/** How finely the table's edge is sampled for where a chair can stand. */
const TRACK_STEP = 0.02

/** How much nearer another edge than its own a chair's back may come and still stand square to its own: a curve is read as chords, whose normals lean a little from the curve's. */
const SQUARE = 2e-3

/** A chair as the track reads it: how wide it is, and how far in front of where it stands its front is and how far behind its back. */
interface ChairSize {
  width: number
  front: number
  back: number
}

const outward = (edge: TableEdge, t: number): Vec2 => mul(perpendicular(direction(edge, t)), -1)

/** A point of the table's edge, how far round it, and the direction straight out from the table there. */
interface Station {
  s: number
  p: Vec2
  out: Vec2
}

/** One edge's stations: where its chords begin and end round the table's edge, and the station at any distance round it. */
function stationsOf(edge: TableEdge, from: number): { knots: number[]; at(s: number): Station } {
  const { points, ts } = flattened(edge)
  const knots = [from]
  for (let i = 1; i < points.length; i++) knots.push(knots[i - 1] + distance(points[i - 1], points[i]))
  return {
    knots,
    at(s) {
      let k = 1
      while (k < knots.length - 1 && knots[k] < s) k++
      const chord = knots[k] - knots[k - 1]
      const f = chord ? Math.max(0, Math.min(1, (s - knots[k - 1]) / chord)) : 0
      return { s, p: add(points[k - 1], mul(sub(points[k], points[k - 1]), f)), out: outward(edge, ts[k - 1] + (ts[k] - ts[k - 1]) * f) }
    }
  }
}

/**
 * The chairs' track. A chair stands `clearance` in front of the table's
 * edge, facing straight in, wherever that edge is the nearest one to the
 * chair all the way from its front to its back, so the chair stands square
 * to its own edge and to no other: never where another edge comes nearer,
 * in a notch, round an inward corner or inside a tight inward bend however
 * far out the chairs stand, nor with its front pushed under the top past a
 * corner or past the middle of a narrow top. The seat line along it is measured where two
 * neighbours come nearest: along their fronts where the edge bends
 * outward, along their backs where it bends inward, so neighbours a pitch
 * apart have the same room between them on any bend. Where a chair cannot
 * stand, and round a corner, a chair steps across with no distance, which
 * leaves two chairs a pitch apart clear of each other there too.
 */
function trackOf(loop: Loop, clearance: number, chair: ChairSize): Pick<Track, 'pieces' | 'corners'> {
  const reach = clearance + chair.front
  const back = reach + chair.back
  const stands = (st: Station) => [clearance, back].every(d => loop.distance(add(st.p, mul(st.out, d))) >= Math.abs(d) - SQUARE)
  const pieces: TrackPiece[] = []
  let u = 0
  for (const { edge, from, length } of loop.spans) {
    const { knots, at } = stationsOf(edge, from)
    const samples = [knots[0]]
    for (let i = 1; i < knots.length; i++) {
      const n = Math.max(1, Math.ceil((knots[i] - knots[i - 1]) / TRACK_STEP))
      for (let j = 1; j <= n; j++) samples.push(knots[i - 1] + ((knots[i] - knots[i - 1]) * j) / n)
    }
    const standing = samples.map(s => stands(at(s)))
    const edgeOf = (a: number, b: number, fromStanding: boolean): number => {
      let [lo, hi] = [a, b]
      for (let k = 0; k < 30; k++) {
        const mid = (lo + hi) / 2
        if (stands(at(mid)) === fromStanding) lo = mid
        else hi = mid
      }
      return fromStanding ? lo : hi
    }
    const stretches: [number, number][] = []
    let open = standing[0] ? samples[0] : null
    for (let j = 1; j < samples.length; j++) {
      if (standing[j] === standing[j - 1]) continue
      const b = edgeOf(samples[j - 1], samples[j], standing[j - 1])
      if (open === null) open = b
      else {
        stretches.push([open, b])
        open = null
      }
    }
    if (open !== null) stretches.push([open, samples[samples.length - 1]])
    for (const [a, b] of stretches) {
      if (b - a < 1e-9) continue
      const loopAt = [a, ...knots.filter(k => k > a && k < b), b]
      const stations = loopAt.map(at)
      const seat = [u]
      for (let i = 1; i < stations.length; i++) {
        const travel = (d: number) => distance(add(stations[i - 1].p, mul(stations[i - 1].out, d)), add(stations[i].p, mul(stations[i].out, d)))
        u += Math.min(travel(clearance), travel(back))
        seat.push(u)
      }
      pieces.push({ edgeId: edge.id, seating: !!edge.seating, from, length, points: stations.map(st => add(st.p, mul(st.out, reach))), loop: loopAt, seat })
    }
  }
  return { pieces, corners: bridges(pieces, loop, reach) }
}

/**
 * What joins a track where one piece ends and the next begins: nothing
 * where they meet; an arc round a corner both reach, where the edge turns
 * the way the track stands from it, out for chairs, in (`reach` below zero)
 * for supports; else a line from each end on to where the two pieces would
 * meet, or straight across when they would not.
 */
function bridge(piece: TrackPiece, next: TrackPiece, loop: Loop, reach: number): Vec2[] {
  const near = (a: Vec2, b: Vec2) => distance(a, b) < 1e-6
  const end = piece.points[piece.points.length - 1]
  const start = next.points[0]
  if (near(end, start)) return []
  const k = loop.spans.findIndex(span => span.edge.id === piece.edgeId)
  const edge = loop.spans[k].edge
  const [n1, n2] = [outward(edge, 1), outward(loop.spans[(k + 1) % loop.spans.length].edge, 0)]
  const turn = Math.atan2(cross(n1, n2), dot(n1, n2))
  const corner = edge.points[1]
  if (reach !== 0 && turn * Math.sign(reach) > 1e-3 && near(end, add(corner, mul(n1, reach))) && near(start, add(corner, mul(n2, reach)))) {
    const from = Math.atan2(n1[1], n1[0])
    return Array.from({ length: ARC_STEPS + 1 }, (_, j): Vec2 => add(corner, mul([Math.cos(from + (turn * j) / ARC_STEPS), Math.sin(from + (turn * j) / ARC_STEPS)], reach)))
  }
  const d1 = normalize(sub(end, piece.points[piece.points.length - 2]))
  const d2 = normalize(sub(next.points[1], start))
  const denominator = cross(d1, d2)
  if (Math.abs(denominator) > 1e-9) {
    const u = cross(sub(start, end), d2) / denominator
    const v = -cross(sub(start, end), d1) / denominator
    if (u >= 0 && v >= 0) return [end, add(end, mul(d1, u)), start]
  }
  return [end, start]
}

/** What joins a track's pieces, one line where a chair steps from one to the next. */
function bridges(pieces: TrackPiece[], loop: Loop, reach: number): Vec2[][] {
  return pieces.flatMap((piece, i) => {
    const joining = bridge(piece, pieces[(i + 1) % pieces.length], loop, reach)
    return joining.length ? [joining] : []
  })
}

/** The plan rectangle a stock item's parts fill, carried to where it stands. */
function itemRect(kind: StockKind, at: Vec2, front: Vec2): Polygon {
  const { min, max } = partsExtent(STOCK_ITEMS[kind].parts)
  const t = facing(at, front)
  const corners: Vec2[] = [[min[0], min[1]], [max[0], min[1]], [max[0], max[1]], [min[0], max[1]]]
  return { outer: corners.map(c => applyTransform(t, [c[0], c[1], 0]).slice(0, 2) as Vec2), holes: [] }
}

const overlaps = (a: Polygon, b: Polygon): boolean => overlapArea(a, b) > 1e-6

/** A part as the test for meeting in space reads it: the heights it spans and its outline from above. */
interface Solid {
  low: number
  high: number
  outline: Polygon
  box: Box
}

/** Whether a transform keeps the vertical vertical, so a prism's outline from above is its own polygon carried across. */
const upright = (t: Part['transform']): boolean => Math.abs(t[2]) < 1e-9 && Math.abs(t[5]) < 1e-9 && Math.abs(t[6]) < 1e-9 && Math.abs(t[7]) < 1e-9

/** A part's heights and its outline from above: a straight upright prism's own polygon, so a concave top leaves its notches open; any other part's convex hull. */
function solidOf(part: Part): Solid {
  const { min, max } = partsExtent([part])
  const t = part.transform
  const shape = part.shape
  const across = (ring: Ring): Ring => ring.map(([x, y]) => [t[0] * x + t[3] * y + t[9], t[1] * x + t[4] * y + t[10]])
  const outline: Polygon = shape.type === 'prism' && (shape.top ?? 1) === 1 && upright(t) ? { outer: across(shape.polygon.outer), holes: shape.polygon.holes.map(across) } : { outer: footprint([part]), holes: [] }
  return { low: min[2], high: max[2], outline, box: bounds(outline.outer) }
}

/** Whether two parts meet in space: the heights they span overlap, and so do their outlines from above. So a seat slides under a table top above it, and a chair's back stops at the top's edge. */
const meet = (a: Solid, b: Solid): boolean => a.low < b.high - 1e-6 && b.low < a.high - 1e-6 && boxesOverlap(a.box, b.box, -1e-9) && overlaps(a.outline, b.outline)

const mod = (x: number, m: number): number => ((x % m) + m) % m

/** A chair `along` the loop, on the edge `on` when given, `reach` out from the table's edge and facing it, or null on an edge that does not seat. */
function standAt(loop: Loop, along: number, reach: number, on?: TableEdge): Candidate | null {
  const s = on ? along : mod(along, loop.length)
  const { p, tangent, edge, t } = loop.at(s, on)
  if (!edge.seating) return null
  const inward = perpendicular(tangent)
  return { index: -1, edge, t, loop: s, at: sub(p, mul(inward, reach)), front: inward }
}

/** A place on the track: how far round the table's edge, and on which edge, since a join lies on two. */
interface Spot {
  s: number
  edgeId: string
}

/** The track's pieces as one line to lay chairs along: how long it is, the spot any distance along it is, and how far along it a distance round the table's edge is. A distance round the table's edge where no chair stands is, along the line, where a chair steps across it. */
export interface SeatLine {
  length: number
  at(u: number): Spot
  fromLoop(s: number): number
}

const last = <T>(xs: T[]): T => xs[xs.length - 1]

/** Where `x` falls between the values of `xs`, read off `ys`. */
function lerpAlong(xs: number[], ys: number[], x: number): number {
  let k = 1
  while (k < xs.length - 1 && xs[k] < x) k++
  const d = xs[k] - xs[k - 1]
  return d > 0 ? ys[k - 1] + (ys[k] - ys[k - 1]) * Math.max(0, Math.min(1, (x - xs[k - 1]) / d)) : ys[k - 1]
}

/** The seat line along a track's pieces. */
export function seatLine(track: Pick<Track, 'length' | 'pieces'>): SeatLine {
  const { pieces } = track
  const total = pieces.length ? last(last(pieces).seat) : 0
  const loop = track.length
  return {
    length: total,
    at(u) {
      if (!pieces.length) return { s: 0, edgeId: '' }
      const v = total ? mod(u, total) : 0
      const piece = pieces.find(p => v <= last(p.seat) + AT_JOIN) ?? last(pieces)
      return { s: lerpAlong(piece.seat, piece.loop, v), edgeId: piece.edgeId }
    },
    fromLoop(s) {
      const x = mod(s, loop)
      const piece = pieces.find(p => x <= last(p.loop) + AT_JOIN)
      if (!piece) return total
      return x < piece.loop[0] ? piece.seat[0] : lerpAlong(piece.loop, piece.seat, x)
    }
  }
}

/** The spot `x` along a run's stretch of the track, from where it starts; the stretch's end belongs to its own last piece. */
function alongRun(pieces: TrackPiece[], x: number): Spot {
  let rest = x
  for (const piece of pieces) {
    const length = last(piece.seat) - piece.seat[0]
    if (rest <= length + AT_JOIN || piece === last(pieces)) return { s: lerpAlong(piece.seat, piece.loop, piece.seat[0] + Math.min(rest, length)), edgeId: piece.edgeId }
    rest -= length
  }
  return { s: 0, edgeId: '' }
}

/** The spot on the track nearest a place on an edge: the place itself where a chair can stand there, else the nearer end of the stretch where none can; null with no track at all. */
function nearestSpot(pieces: TrackPiece[], length: number, s: number, edgeId: string): Spot | null {
  if (pieces.some(p => p.edgeId === edgeId && s >= p.loop[0] - AT_JOIN && s <= last(p.loop) + AT_JOIN)) return { s, edgeId }
  let best: (Spot & { d: number }) | null = null
  for (const p of pieces) {
    for (const end of [p.loop[0], last(p.loop)]) {
      const d = Math.min(mod(end - s, length), mod(s - end, length))
      if (!best || d < best.d) best = { d, s: end, edgeId: p.edgeId }
    }
  }
  return best && { s: best.s, edgeId: best.edgeId }
}

/** A chair where the layout puts it, before the table's parts and the other chairs decide whether it stays. */
interface Candidate {
  index: number
  edge: TableEdge
  t: number
  loop: number
  at: Vec2
  front: Vec2
}

/** How far along the seat line a stretch of the track's pieces starts, and how long it is. */
function stretchOf(pieces: TrackPiece[]): { start: number; length: number } {
  return { start: pieces.length ? pieces[0].seat[0] : 0, length: pieces.reduce((sum, p) => sum + p.seat[p.seat.length - 1] - p.seat[0], 0) }
}

/**
 * Chairs round a table, along the seat line. Laid out, each run of smooth
 * edges that seats somewhere holds as many as fit along its stretch of the
 * line a pitch apart, a requested count going to the run with the most
 * line per chair first, and spaces them evenly: along an open run each in
 * the middle of an equal share of it, round a closed one starting at the
 * middle of its first edge by id, seating or not. Turned, every run's
 * chairs slide along it by the same share of their own spacing, one
 * leaving an open run's end coming back at its start, so each run keeps
 * its count and its spacing while the chairs go round the table together.
 * Placed, each stands where the hand put it, or at the nearest spot of the
 * track when a chair cannot stand there. Either way a chair faces straight
 * in, and a chair standing on an edge that does not seat is dropped where
 * it stands, so turning an edge off takes away its own chairs and moves no
 * other.
 */
function layChairs(edges: TableEdge[], smooth: boolean[], loop: Loop, line: SeatLine, pieces: TrackPiece[], chair: ChairSize, o: Required<Pick<TableOptions, 'gap' | 'clearance' | 'turn'>> & Pick<TableOptions, 'seats' | 'placed'>, warnings: string[]): { candidates: Candidate[]; capacity: number; spaced: number; runs: Track['runs'] } {
  const pitch = chair.width + o.gap
  const spanOf = new Map(loop.spans.map(span => [span.edge.id, span]))
  const edgeOf = new Map(edges.map(e => [e.id, e]))
  const runs = runsOf(edges, smooth)
    .filter(run => run.edges.some(e => e.seating))
    .map(run => {
      const own = run.edges.flatMap(e => pieces.filter(p => p.edgeId === e.id))
      if (!run.closed) return { run, own, ...stretchOf(own) }
      const first = spanOf.get(firstById(run.edges).id)!
      return { run, own, start: line.fromLoop(first.from + first.length / 2), length: line.length }
    })
  const capacity = runs.map(({ run, length }) => {
    const fit = Math.floor(length / pitch + 1e-9)
    return run.closed ? fit : length >= chair.width ? Math.max(1, fit) : 0
  })
  const counts = runs.map(() => 0)
  const wanted = o.seats ?? capacity.reduce((s, c) => s + c, 0)
  for (let k = 0; k < wanted; k++) {
    let best = -1
    for (let i = 0; i < runs.length; i++) {
      if (counts[i] >= capacity[i]) continue
      if (best < 0 || runs[i].length / (counts[i] + 1) > runs[best].length / (counts[best] + 1)) best = i
    }
    if (best < 0) break
    counts[best]++
  }
  const fitted = counts.reduce((s, c) => s + c, 0)
  const reach = o.clearance + chair.front

  const spots: (Spot | null)[] = o.placed
    ? o.placed.flatMap(c => {
        const span = spanOf.get(c.edge)
        return span ? [nearestSpot(pieces, loop.length, span.from + Math.max(0, Math.min(1, c.t)) * span.length, c.edge)] : []
      })
    : runs.flatMap(({ run, own, start, length }, i) => {
        const k = counts[i]
        return Array.from({ length: k }, (_, j): Spot | null => {
          if (run.closed) return line.at(start + (length * (j + o.turn)) / k)
          const share = mod(j + 0.5 + o.turn, k)
          return alongRun(own, ((share || k) * length) / k)
        })
      })
  const candidates = spots.flatMap((spot, index): Candidate[] => {
    const c = spot && standAt(loop, spot.s, reach, edgeOf.get(spot.edgeId))
    return c ? [{ ...c, index }] : []
  })
  if (!o.placed && o.seats !== undefined && fitted < o.seats) warnings.push(`Only ${fitted} chairs fit along the seating edges; ${o.seats} asked for.`)
  return {
    candidates,
    capacity: capacity.reduce((sum, c) => sum + c, 0),
    spaced: o.placed ? o.placed.length : fitted,
    runs: runs.map(({ start, length }, i) => ({ from: start, length, spacing: counts[i] ? length / counts[i] : 0 }))
  }
}

/**
 * The chairs that stay: each in turn, as long as none of its parts meets
 * a part of the table or of a chair already staying, in space. Ids count
 * the chairs along each edge, or the place in the hand's list for placed
 * ones. Then where one more fits: the middle of every gap along the seat
 * line between two chairs, or of every seating edge's stretch of it on a
 * table with none, where a chair standing there would meet nothing.
 */
function keepChairs(candidates: Candidate[], table: Part[], chair: StockKind, placed: boolean, loop: Loop, line: SeatLine, pieces: TrackPiece[], reach: number, warnings: string[]): { placements: Placement[]; marks: ChairMark[]; refused: number } {
  const fixed = table.map(solidOf)
  const kept: Solid[][] = []
  const placements: Placement[] = []
  const perEdge = new Map<string, number>()
  const clear = (c: Candidate) => {
    const solids = placeItem(chair, c.at, c.front).map(solidOf)
    return solids.some(a => fixed.some(b => meet(a, b)) || kept.some(other => other.some(b => meet(a, b)))) ? null : solids
  }
  for (const c of candidates) {
    const solids = clear(c)
    if (!solids) continue
    kept.push(solids)
    const index = perEdge.get(c.edge.id) ?? 0
    perEdge.set(c.edge.id, index + 1)
    placements.push({ id: placed ? `placed:${c.index}` : `${c.edge.id}:seat:${index}`, kind: chair, at: c.at, front: c.front, elevation: 0, round: { edge: c.edge.id, t: c.t, loop: c.loop } })
  }
  const refused = candidates.length - placements.length
  if (refused) warnings.push(`${refused} chairs would meet the table or another chair and were left out.`)
  const round = placements.map(p => line.fromLoop(p.round!.loop)).sort((a, b) => a - b)
  const middles = round.length
    ? round.map((u, i) => line.at(u + ((i + 1 < round.length ? round[i + 1] : round[0] + line.length) - u) / 2))
    : loop.spans.flatMap(span => {
        const { start, length } = stretchOf(pieces.filter(p => p.edgeId === span.edge.id))
        return span.edge.seating && length > 0 ? [line.at(start + length / 2)] : []
      })
  const marks = middles.flatMap(spot => {
    const c = standAt(loop, spot.s, reach, loop.spans.find(span => span.edge.id === spot.edgeId)?.edge)
    return c && clear(c) ? [{ edge: c.edge.id, t: c.t, loop: c.loop, at: c.at }] : []
  })
  return { placements, marks, refused }
}

/** Where one more chair fits round a table: its place on the edge, how far round the loop, and where it would stand. */
export type ChairMark = EdgePlace & { loop: number; at: Vec2 }

/** The middle of the area a ring encloses. */
function centroid(ring: Ring): Vec2 {
  let area = 0
  let x = 0
  let y = 0
  ring.forEach((p, i) => {
    const q = ring[(i + 1) % ring.length]
    const c = cross(p, q)
    area += c
    x += (p[0] + q[0]) * c
    y += (p[1] + q[1]) * c
  })
  return [x / (3 * area), y / (3 * area)]
}

/**
 * Where legs stand on a closed line, as distances along it: in every
 * corner and at every one of `anchors`, and spaced evenly wherever two
 * stand farther apart than `LEG_SPAN`. A line with neither, as round a
 * round top, has legs spaced evenly all round, `ROUND_LEGS` at least,
 * starting half a space from `start`. Until the legs stand round the
 * line's middle, one more goes in the middle of the longest space between
 * two.
 */
function legsAlong(ring: Ring, start: number, anchors: number[] = []): number[] {
  const n = ring.length
  const at: number[] = [0]
  for (let i = 1; i < n; i++) at.push(at[i - 1] + distance(ring[i - 1], ring[i]))
  const length = at[n - 1] + distance(ring[n - 1], ring[0])
  const apart = (a: number, b: number) => Math.min(Math.abs(a - b), length - Math.abs(a - b))
  const turn = ring.map((p, i) => {
    const tin = sub(p, ring[(i - 1 + n) % n])
    const tout = sub(ring[(i + 1) % n], p)
    return Math.atan2(cross(tin, tout), dot(tin, tout))
  })
  const turning = ring.map((_, i) => turn.reduce((sum, t, j) => (apart(at[i], at[j]) <= CORNER_REACH / 2 ? sum + t : sum), 0))
  const bends: { s: number; turn: number }[] = []
  let best = -1
  let bend = 0
  for (let k = 0; k <= n; k++) {
    const i = k % n
    const inCorner = k < n && turn[i] > 0 && turning[i] >= CORNER_TURN
    if (inCorner && best >= 0 && apart(at[i], at[best]) <= CORNER_REACH && bend + turn[i] <= ONE_BEND) {
      if (turning[i] > turning[best]) best = i
      bend += turn[i]
      continue
    }
    if (best >= 0) bends.push({ s: at[best], turn: bend })
    best = inCorner ? i : -1
    bend = inCorner ? turn[i] : 0
  }
  const [first, lastBend] = [bends[0], bends[bends.length - 1]]
  if (bends.length > 1 && apart(first.s, lastBend.s) <= CORNER_REACH && first.turn + lastBend.turn <= ONE_BEND) bends.pop()
  const corners = [...bends.map(b => b.s), ...anchors.filter(a => !bends.some(b => apart(a, b.s) <= CORNER_REACH))].sort((a, b) => a - b)
  let legs: number[]
  if (!corners.length) {
    const count = Math.max(ROUND_LEGS, Math.ceil(length / LEG_SPAN))
    legs = Array.from({ length: count }, (_, k) => (start + (length * (k + 0.5)) / count) % length)
  } else {
    legs = corners.flatMap((c, k) => {
      const gap = (((k + 1 < corners.length ? corners[k + 1] : corners[0] + length) - c) % length) || length
      const between = Math.ceil(gap / LEG_SPAN - 1e-9) - 1
      return [c, ...Array.from({ length: between }, (_, j) => (c + (gap * (j + 1)) / (between + 1)) % length)]
    })
  }
  const middle = centroid(ring)
  const point = (s: number) => along(ring, true, s).p
  while (legs.length < n && (legs.length < 3 || !pointInRing(middle, convexHull(legs.map(point))))) {
    const sorted = [...legs].sort((a, b) => a - b)
    const gaps = sorted.map((s, k) => ({ s, gap: (k + 1 < sorted.length ? sorted[k + 1] : sorted[0] + length) - s }))
    const widest = gaps.reduce((a, b) => (b.gap > a.gap ? b : a))
    legs.push((widest.s + widest.gap / 2) % length)
  }
  return legs
}

/** A gap between two legs, measured along the track they stand on, at least this long gets a mark for one more in its middle, as long as the mark stays half as far from every leg. */
const LEG_MARK_GAP = 0.5

/** A support as the track reads it: a point, with no width and no depth. */
const POINT: ChairSize = { width: 0, front: 0, back: 0 }

/** Track pieces cut where one crosses the next, as two pieces moved in from a corner do by the little a chair's track lets a piece run on, measured along again. */
function joined(pieces: TrackPiece[]): TrackPiece[] {
  const out = pieces.map(p => ({ ...p, points: [...p.points], loop: [...p.loop] }))
  out.forEach((piece, i) => {
    const next = out[(i + 1) % out.length]
    const n = piece.points.length
    if (next === piece || n < 2 || next.points.length < 2) return
    const [a, b, c, d] = [piece.points[n - 2], piece.points[n - 1], next.points[0], next.points[1]]
    const x = segmentCrossing(a, b, c, d)
    if (!x) return
    piece.loop[n - 1] = piece.loop[n - 2] + ((piece.loop[n - 1] - piece.loop[n - 2]) * distance(a, x)) / distance(a, b)
    piece.points[n - 1] = x
    next.loop[0] = next.loop[0] + ((next.loop[1] - next.loop[0]) * distance(c, x)) / distance(c, d)
    next.points[0] = x
  })
  let u = 0
  return out.map(p => ({ ...p, seat: p.points.map((q, k) => (k ? (u += distance(p.points[k - 1], q)) : u)) }))
}

/**
 * The supports' track: the table's edge moved in by `inset`, wherever a
 * point there is no nearer another edge than its own, as the pieces along
 * each edge and as one closed path through them and what joins them, which
 * goes round an inward corner and straight across where the top is too
 * narrow for the track.
 */
function supportPath(loop: Loop, inset: number, deepest: number): SupportPath {
  const pieces = joined(trackOf(loop, -inset, POINT).pieces)
  const points: Vec2[] = []
  const rs: number[] = []
  const starts: number[] = []
  const push = (p: Vec2) => {
    if (points.length && distance(last(points), p) < 1e-6) return
    rs.push(points.length ? last(rs) + distance(last(points), p) : 0)
    points.push(p)
  }
  pieces.forEach((piece, i) => {
    push(piece.points[0])
    starts.push(last(rs))
    piece.points.slice(1).forEach(push)
    bridge(piece, pieces[(i + 1) % pieces.length], loop, -inset).slice(1, -1).forEach(push)
  })
  if (points.length > 1 && distance(last(points), points[0]) < 1e-6) {
    points.pop()
    rs.pop()
  }
  const length = points.length ? last(rs) + distance(last(points), points[0]) : 0
  const path = { inset, deepest, pieces, points, rs, length, starts, runs: [] as SupportPath['runs'] }
  const order = new Map(loop.spans.map((span, i) => [span.edge.id, i]))
  const corner = (k: number): boolean => {
    const [piece, next] = [pieces[k], pieces[(k + 1) % pieces.length]]
    if (distance(last(piece.points), next.points[0]) > 1e-6) return true
    if (piece.edgeId === next.edgeId) return false
    const [i, j] = [order.get(piece.edgeId)!, order.get(next.edgeId)!]
    const [e, f] = [loop.spans[i].edge, loop.spans[j].edge]
    return j !== (i + 1) % loop.spans.length || !e.curve !== !f.curve || dot(direction(e, 1), direction(f, 0)) <= SMOOTH
  }
  const corners = pieces.flatMap((_, k) => (corner(k) ? [k] : []))
  path.runs = corners.length
    ? corners.map((k, i) => {
        const first = (k + 1) % pieces.length
        const end = corners[(i + 1) % corners.length]
        const from = starts[first]
        const to = pieceEnd(path, end)
        return { from, to: to < from - 1e-9 ? to + length : to, closed: false }
      })
    : pieces.length
      ? [{ from: 0, to: length, closed: true }]
      : []
  return path
}

/** The side of a support path `r` lies on, with `r` as far round as that side counts it; on what joins two sides, the side whose end is nearer. */
export function trackRun(path: SupportPath, r: number): (SupportPath['runs'][number] & { at: number }) | null {
  const x = mod(r, path.length)
  for (const run of path.runs) for (const at of [x, x + path.length]) if (at >= run.from - 1e-9 && at <= run.to + 1e-9) return { ...run, at }
  let best: (SupportPath['runs'][number] & { at: number; d: number }) | null = null
  for (const run of path.runs) {
    for (const end of [run.from, run.to]) {
      const d = Math.min(mod(end - x, path.length), mod(x - end, path.length))
      if (!best || d < best.d) best = { ...run, at: end, d }
    }
  }
  return best && { from: best.from, to: best.to, closed: best.closed, at: best.at }
}

/** A bar from `r0` round by `span`, kept on one side of the track: on the side its middle is on, as long as it asked for when that side is long enough, and on a closed side no longer than half of it. */
export function settleBar(path: SupportPath, r0: number, span: number): [number, number] {
  const run = trackRun(path, r0 + span / 2)
  if (!run) return [r0, r0 + span]
  const room = run.closed ? (run.to - run.from) / 2 : run.to - run.from
  const length = Math.min(span, room)
  if (run.closed) return [run.at - length / 2, run.at + length / 2]
  const from = Math.max(run.from, Math.min(run.to - length, run.at - length / 2))
  return [from, from + length]
}

/** How far round a support path the piece `k` ends. */
const pieceEnd = (path: SupportPath, k: number): number => path.starts[k] + last(path.pieces[k].seat) - path.pieces[k].seat[0]

/** The point `r` round a support path, and the direction the path runs there. */
function pathAt(path: SupportPath, r: number): { p: Vec2; tangent: Vec2 } {
  const n = path.points.length
  const x = mod(r, path.length)
  for (let i = 0; i < n; i++) {
    const a = path.points[i]
    const b = path.points[(i + 1) % n]
    const [r0, r1] = [path.rs[i], i + 1 < n ? path.rs[i + 1] : path.length]
    if (x <= r1 + 1e-12 || i === n - 1) return { p: r1 > r0 ? add(a, mul(sub(b, a), Math.min(1, (x - r0) / (r1 - r0)))) : a, tangent: normalize(sub(b, a)) }
  }
  return { p: [0, 0], tangent: [1, 0] }
}

/** How far round a support path a place on the table's edge stands: on the piece of its edge through it, else at the end of a piece nearest it round the table; null when its edge is gone. */
export function trackAt(path: SupportPath, spans: Track['spans'], place: EdgePlace): number | null {
  const span = spans.find(s => s.edgeId === place.edge)
  if (!span || !path.pieces.length) return null
  const total = spans.reduce((sum, s) => sum + s.length, 0)
  const s = span.from + Math.max(0, Math.min(1, place.t)) * span.length
  const k = path.pieces.findIndex(p => p.edgeId === place.edge && s >= p.loop[0] - AT_JOIN && s <= last(p.loop) + AT_JOIN)
  if (k >= 0) return path.starts[k] + lerpAlong(path.pieces[k].loop, path.pieces[k].seat, s) - path.pieces[k].seat[0]
  let best = { d: Infinity, r: 0 }
  path.pieces.forEach((p, i) => {
    for (const [end, r] of [[p.loop[0], path.starts[i]], [last(p.loop), pieceEnd(path, i)]]) {
      const d = Math.min(mod(end - s, total), mod(s - end, total))
      if (d < best.d) best = { d, r }
    }
  })
  return best.r
}

/** The place on the table's edge a point `r` round a support path stands in from, and that point, which on what joins two pieces is the nearer of their ends. */
export function trackPlace(path: SupportPath, spans: Track['spans'], r: number): { place: EdgePlace; r: number } {
  const x = mod(r, path.length)
  let best = { d: Infinity, k: 0, r: 0 }
  for (let k = 0; k < path.pieces.length; k++) {
    const [from, to] = [path.starts[k], pieceEnd(path, k)]
    if (x >= from - 1e-9 && x <= to + 1e-9) {
      best = { d: 0, k, r: Math.max(from, Math.min(to, x)) }
      break
    }
    for (const end of [from, to]) {
      const d = Math.min(mod(end - x, path.length), mod(x - end, path.length))
      if (d < best.d) best = { d, k, r: end }
    }
  }
  const piece = path.pieces[best.k]
  const s = lerpAlong(piece.seat, piece.loop, piece.seat[0] + best.r - path.starts[best.k])
  const span = spans.find(p => p.edgeId === piece.edgeId)!
  return { place: { edge: piece.edgeId, t: span.length ? Math.max(0, Math.min(1, (s - span.from) / span.length)) : 0 }, r: best.r }
}

/** The point `r` round a support path. */
export const trackPoint = (path: SupportPath, r: number): Vec2 => pathAt(path, r).p

/** How far round a support path its point nearest `p` is. */
export function trackNearest(path: SupportPath, p: Vec2): number {
  const n = path.points.length
  let best = { d: Infinity, r: 0 }
  for (let i = 0; i < n; i++) {
    const [a, b] = [path.points[i], path.points[(i + 1) % n]]
    const { point, t } = projectOntoSegment(p, a, b)
    const d = distance(p, point)
    if (d < best.d) best = { d, r: path.rs[i] + t * distance(a, b) }
  }
  return best.r
}

/** A support path from `r0` round to `r1`. */
function pathBetween(path: SupportPath, r0: number, r1: number): Vec2[] {
  const a = mod(r0, path.length)
  const span = r1 - r0
  const inside = path.rs.map((r, i) => ({ i, d: mod(r - a, path.length) })).filter(v => v.d > 1e-9 && v.d < span - 1e-9).sort((x, y) => x.d - y.d)
  const points = [pathAt(path, a).p, ...inside.map(v => path.points[v.i]), pathAt(path, a + span).p]
  return points.filter((p, i) => !i || distance(p, points[i - 1]) > 1e-9)
}

/** An open line moved `d` to its left, which is in along a counter-clockwise track, each bend mitred. */
function parallel(points: Vec2[], d: number): Vec2[] {
  if (!d) return points
  const n = points.length
  const left = (i: number) => perpendicular(normalize(sub(points[i + 1], points[i])))
  return points.map((p, i) => {
    if (i === 0) return add(p, mul(left(0), d))
    if (i === n - 1) return add(p, mul(left(n - 2), d))
    const [before, after] = [left(i - 1), left(i)]
    const m = normalize(add(before, after))
    return add(p, mul(m, d / Math.max(dot(m, after), 0.25)))
  })
}

/** A line drawn `width` wide from above, as rings to clip: a strip along each of its stretches and a round joint wherever two meet. */
function stroke(line: Vec2[], closed: boolean, width: number): Ring[] {
  const h = width / 2
  const n = line.length
  const rings: Ring[] = []
  for (let i = 0; i < (closed ? n : n - 1); i++) {
    const [a, b] = [line[i], line[(i + 1) % n]]
    if (distance(a, b) < 1e-9) continue
    const side = mul(perpendicular(normalize(sub(b, a))), h)
    rings.push([sub(a, side), sub(b, side), add(b, side), add(a, side)])
  }
  for (let i = closed ? 0 : 1; i < (closed ? n : n - 1); i++) rings.push(Array.from({ length: 16 }, (_, k): Vec2 => add(line[i], mul([Math.cos((k * Math.PI) / 8), Math.sin((k * Math.PI) / 8)], h))))
  return union(rings).flatMap(p => [p.outer, ...p.holes])
}

/** A square `size` across at `p`, turned to `dir`. */
function squareAt(p: Vec2, dir: Vec2, size: number): Ring {
  const [u, v] = [mul(dir, size / 2), mul(perpendicular(dir), size / 2)]
  return [sub(sub(p, u), v), sub(add(p, u), v), add(add(p, u), v), add(sub(p, u), v)]
}

/**
 * The direction of a ring's length: the long side of the smallest
 * rectangle round it. When two rectangles are about as small, or its two
 * sides about as long, the one nearest `prefer` wins, so a round or square
 * top takes its first edge's direction rather than whatever rounding picks.
 */
function longAxis(ring: Ring, prefer: Vec2): Vec2 {
  const hull = convexHull(ring)
  const directions = [normalize(prefer), ...hull.map((a, i) => normalize(sub(hull[(i + 1) % hull.length], a)))]
  const candidates = directions.flatMap(e => {
    const f = perpendicular(e)
    const extent = (d: Vec2) => Math.max(...hull.map(p => dot(p, d))) - Math.min(...hull.map(p => dot(p, d)))
    const [w, h] = [extent(e), extent(f)]
    return [{ axis: e, area: w * h, length: w }, { axis: f, area: w * h, length: h }]
  })
  const least = Math.min(...candidates.map(c => c.area))
  const small = candidates.filter(c => c.area <= least * (1 + TIE))
  const longest = Math.max(...small.map(c => c.length))
  const axis = small.filter(c => c.length >= longest * (1 - TIE)).reduce((a, b) => (Math.abs(dot(b.axis, prefer)) > Math.abs(dot(a.axis, prefer)) ? b : a)).axis
  return dot(axis, prefer) < 0 ? mul(axis, -1) : axis
}

/** The points `x` of the plane at least as near `p` as `q`, as a ring as large as `size`. */
function nearerTo(p: Vec2, q: Vec2, size: number): Ring {
  const n = normalize(sub(p, q))
  const m: Vec2 = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2]
  const v = perpendicular(n)
  return [add(m, mul(v, -size)), add(m, mul(v, size)), add(add(m, mul(v, size)), mul(n, size)), add(add(m, mul(v, -size)), mul(n, size))]
}

/**
 * A pedestal holding up `cell`, a part of the top, where it stands on its
 * own: a column on a foot, each the cell's outline drawn in as far as the
 * whole top's outline would be round the point deepest inside it (`depth`
 * in from its edge), so an oval top stands on an oval foot and two
 * pedestals stand as far from the edge as one; drawn in round the cell's
 * own deepest point when that leaves nothing. `at` is its column's middle.
 */
function pedestalIn(cell: Polygon, depth: number): { foot: Polygon[]; column: Polygon[]; at: Vec2 } {
  const ring = (deep: number, halfWidth: number) => offset([cell.outer], -Math.max(deep - halfWidth, PANEL_INSET)).map((outer): Polygon => ({ outer, holes: [] }))
  let deep = depth
  let column = ring(deep, COLUMN_HALF_WIDTH)
  if (!column.length) {
    const own = labelPoint(cell, undefined, 24)
    deep = Math.min(...cell.outer.map((p, i) => distanceToSegment(own, p, cell.outer[(i + 1) % cell.outer.length])))
    column = ring(deep, COLUMN_HALF_WIDTH)
    if (!column.length) return { foot: [], column: [], at: own }
  }
  return { foot: ring(deep, FOOT_HALF_WIDTH), column, at: centroid(convexHull(column.flatMap(p => p.outer))) }
}

/** Where a table's pedestals stand on their own, from `origin` in its own frame: one, or two under a top longer than `PEDESTAL_SPAN`, one in each half of its length. */
function autoPedestals(top: Polygon, origin: Vec2, depth: number, frame: { along: Vec2; out: Vec2 }): Vec2[] {
  const axis = longAxis(top.outer, frame.along)
  const reach = top.outer.map(p => dot(p, axis))
  const length = Math.max(...reach) - Math.min(...reach)
  const split = add(origin, mul(axis, (Math.max(...reach) + Math.min(...reach)) / 2 - dot(origin, axis)))
  const cells = length <= PEDESTAL_SPAN ? [top] : [add(split, axis), sub(split, axis)].map(side => intersection([top.outer], [nearerTo(side, sub(mul(split, 2), side), 2 * length)]).reduce((a, b) => (Math.abs(signedArea(b.outer)) > Math.abs(signedArea(a.outer)) ? b : a)))
  return cells.map(cell => {
    const d = sub(pedestalIn(cell, depth).at, origin)
    return [dot(d, frame.along), dot(d, frame.out)]
  })
}

/**
 * A table's pedestals: those placed by hand or those it stands on of its
 * own, each holding the part of the top nearer it than any other
 * (`pedestalIn`), carried to where it stands. One whose foot leaves the
 * top seen from above is counted as left out.
 */
function standPedestals(edges: TableEdge[], top: Polygon, underside: number, placed: Vec2[] | undefined): { parts: Part[]; layout: PedestalLayout; refused: number } {
  const pole = labelPoint(top, undefined, 24)
  const depth = Math.min(...top.outer.map((p, i) => distanceToSegment(pole, p, top.outer[(i + 1) % top.outer.length])))
  const origin = centroid(top.outer)
  const frame = frameOf(edges)
  const offsets = placed ?? autoPedestals(top, origin, depth, frame)
  const at = offsets.map(o => add(origin, add(mul(frame.along, o[0]), mul(frame.out, o[1]))))
  const size = Math.max(...top.outer.map(p => distance(p, origin))) * 4 + 1
  const parts: Part[] = []
  let refused = 0
  const pedestals = offsets.map((offsetBy, index) => {
    let cells: Polygon[] = [top]
    for (const q of at.filter((q, j) => j !== index && distance(q, at[index]) > 1e-6)) cells = intersection(cells.flatMap(c => [c.outer, ...c.holes]), [nearerTo(at[index], q, size)])
    const cell = cells.length ? cells.reduce((a, b) => (Math.abs(signedArea(b.outer)) > Math.abs(signedArea(a.outer)) ? b : a)) : top
    const built = pedestalIn(cell, depth)
    const shift = sub(at[index], built.at)
    const carried = (polygons: Polygon[]) => polygons.map(p => ({ outer: p.outer.map(q => add(q, shift)), holes: [] }))
    const [foot, column] = [carried(built.foot), carried(built.column)]
    parts.push(...foot.map(p => prismPart(p, 0, FOOT_HEIGHT, 'furnitureDark', 'support')), ...column.map(p => prismPart(p, FOOT_HEIGHT, underside - FOOT_HEIGHT, 'furnitureDark', 'support')))
    const outline = foot.length ? convexHull(foot.flatMap(p => p.outer)) : []
    if (!outline.every(p => pointInPolygon(p, top))) refused++
    return { index, offset: offsetBy, at: at[index], outline }
  })
  return { parts, layout: { frame, origin, pedestals }, refused }
}

/** The table's own frame, which turns and moves with it: along its first edge by id where it starts, and out from the table there. */
function frameOf(edges: TableEdge[]): { along: Vec2; out: Vec2 } {
  const first = firstById(edges)
  return { along: direction(first, 0), out: outward(first, 0) }
}


/**
 * The direction a table's seating runs along, when it mostly runs one way:
 * every chord of a seating edge votes for its direction by its length, a
 * direction and its reverse alike. Null when the votes mostly cancel, as
 * round a round table or a square one seated all round.
 */
function seatingAxis(edges: TableEdge[]): Vec2 | null {
  let x = 0
  let y = 0
  let total = 0
  for (const e of edges.filter(e => e.seating)) {
    const points = lineChords(e)
    for (let i = 1; i < points.length; i++) {
      const d = sub(points[i], points[i - 1])
      const length = Math.hypot(d[0], d[1])
      const angle = 2 * Math.atan2(d[1], d[0])
      x += length * Math.cos(angle)
      y += length * Math.sin(angle)
      total += length
    }
  }
  if (!total || Math.hypot(x, y) < total / 4) return null
  const half = Math.atan2(y, x) / 2
  return [Math.cos(half), Math.sin(half)]
}


/** Whether a straight edge no one sits at lies next to one someone does: the end of a bench or a desk. */
const hasFreeEnd = (edges: TableEdge[]): boolean => edges.some((e, i) => !e.seating && !e.curve && (edges[(i + edges.length - 1) % edges.length].seating || edges[(i + 1) % edges.length].seating))

type StationStyle = 'tbases' | 'frames' | 'panels'

/** How deep each station style is across its own line, and how far in from its side it stands on its own, given how far the table reaches in from that side. */
const STATION = {
  tbases: { thickness: TBASE_COLUMN, setback: (depth: number) => TBASE_SETBACK * depth },
  frames: { thickness: FRAME_TUBE, setback: () => FRAME_SETBACK },
  panels: { thickness: PANEL_THICKNESS, setback: () => PANEL_INSET }
} satisfies Record<StationStyle, { thickness: number; setback: (depth: number) => number }>

/** A side a support can stand at: a place on an edge, the point there and the direction out from the table there. */
interface SupportSide extends EdgePlace {
  p: Vec2
  out: Vec2
}

const sideOf = (edge: TableEdge, t: number): SupportSide => ({ edge: edge.id, t, p: pointOnLine(edge, t), out: outward(edge, t) })

/**
 * The sides of a table a support can stand at, as seen: every straight
 * edge, and on a curved outline each place it reaches farthest along its
 * own frame (`frameOf`) and across it, as the two ends of an oval, unless
 * that place is a corner or on a straight edge already counted.
 */
function supportSides(edges: TableEdge[]): SupportSide[] {
  const sides = edges.filter(e => !e.curve).map(e => sideOf(e, 0.5))
  const { along } = frameOf(edges)
  const across = perpendicular(along)
  const n = edges.length
  for (const d of [along, across, mul(along, -1), mul(across, -1)]) {
    let best: { edge: TableEdge; t: number; reach: number } | null = null
    for (const e of edges) {
      const { points, ts } = flattened(e)
      points.forEach((p, i) => {
        if (!best || dot(p, d) > best.reach + 1e-9) best = { edge: e, t: ts[i], reach: dot(p, d) }
      })
    }
    const found = best as { edge: TableEdge; t: number; reach: number } | null
    if (!found?.edge.curve) continue
    const i = edges.indexOf(found.edge)
    const joined = found.t < 1e-9 ? edges[(i - 1 + n) % n] : found.t > 1 - 1e-9 ? edges[(i + 1) % n] : null
    if (joined && (!joined.curve || dot(direction(found.t < 1e-9 ? joined : found.edge, 1), direction(found.t < 1e-9 ? found.edge : joined, 0)) < SMOOTH)) continue
    const side = sideOf(found.edge, found.t)
    if (!sides.some(other => distance(other.p, side.p) < 1e-6)) sides.push(side)
  }
  return sides
}

/** How wide the top is across `u` at `a` along it. */
function widthAt(top: Polygon, u: Vec2, a: number): number {
  const v = perpendicular(u)
  const crossings = top.outer.flatMap((p, i) => {
    const q = top.outer[(i + 1) % top.outer.length]
    const [pa, qa] = [dot(p, u), dot(q, u)]
    return (pa - a) * (qa - a) <= 0 && pa !== qa ? [dot(add(p, mul(sub(q, p), (a - pa) / (qa - pa))), v)] : []
  })
  return crossings.length ? Math.max(...crossings) - Math.min(...crossings) : 0
}

/**
 * How far in from a side a station stands on its own: its style's
 * setback, at least `PANEL_KNEES` when a chair faces the table from that
 * side, and never nearer it than where the top is `PANEL_WIDTH` of its
 * widest across, so a rounded end still gets a support worth the name.
 */
function autoInset(style: StationStyle, side: SupportSide, top: Polygon, placements: Placement[]): number {
  const u = side.out
  const hi = dot(side.p, u)
  const lo = Math.min(...top.outer.map(p => dot(p, u)))
  const STEP = 0.01
  const samples = Array.from({ length: Math.max(1, Math.ceil((hi - lo) / STEP)) + 1 }, (_, k) => Math.max(lo, hi - k * STEP))
  const widest = Math.max(...samples.map(a => widthAt(top, u, a)))
  const wide = samples.find(a => widthAt(top, u, a) >= PANEL_WIDTH * widest) ?? hi
  const seated = placements.some(p => -dot(p.front, u) > Math.SQRT1_2 && dot(p.at, u) > hi - PANEL_KNEES - 0.5)
  return Math.max(STATION[style].setback(hi - lo), seated ? PANEL_KNEES : 0, hi - wide)
}

/** How far in from the top's edge the supports' track runs for each style unless asked for another: where a leg's middle stands, and where the middle of a frame or panel stands on its own. */
export const SUPPORT_INSETS: Record<'legs' | StationStyle, number> = { legs: LEG_INSET, tbases: LEG_INSET, frames: FRAME_SETBACK + FRAME_TUBE / 2, panels: PANEL_INSET + PANEL_THICKNESS / 2 }

/** How far the track between a bar's ends may stray from the straight line between them and still count as straight. */
const BENDS = 1e-3

/** How much of the top's width the supports' track keeps between its sides however far in it is moved. */
const TRACK_LEFT = 0.1

/** The shortest a T-base's foot, a frame or a panel is laid by the track at a curved side. */
const CURVED_REACH = 0.05

/**
 * A T-base, frame or panel standing on its own at a side, its middle
 * `depth` in from it with the track where its style has it, and as much
 * farther in as the track is moved in from there: a bar between two points
 * of the track on that side, as far along it both ways as the side goes,
 * or on a curve until the top reaches that far in, a T-base's foot only
 * `TBASE_FOOT_SPAN` of the top's width there; moved in square to itself to
 * that depth.
 */
function autoStretch(style: StationStyle, side: SupportSide, styleDepth: number, path: SupportPath, spans: Track['spans'], top: Polygon): PlacedSupport | null {
  const depth = styleDepth + path.inset - SUPPORT_INSETS[style]
  const r = trackAt(path, spans, side)
  const run = r === null ? null : trackRun(path, r)
  if (r === null || !run) return null
  const u = side.out
  const v = perpendicular(u)
  const reach = dot(side.p, u)
  const half = style === 'tbases' ? (TBASE_FOOT_SPAN * widthAt(top, u, reach - depth)) / 2 : Infinity
  const deep = Math.max(depth, path.inset + CURVED_REACH)
  const reached = (x: number) => {
    const q = pathAt(path, x).p
    return reach - dot(q, u) >= deep || Math.abs(dot(sub(q, side.p), v)) >= half
  }
  const walk = (way: 1 | -1): number => {
    const room = run.closed ? (run.to - run.from) / 4 : way > 0 ? run.to - run.at : run.at - run.from
    const steps = Math.max(1, Math.ceil(room / 0.01))
    for (let k = 1; k <= steps; k++) {
      const d = (room * k) / steps
      if (!reached(r + way * d)) continue
      let [lo, hi] = [(room * (k - 1)) / steps, d]
      for (let k = 0; k < 20; k++) {
        const mid = (lo + hi) / 2
        if (reached(r + way * mid)) hi = mid
        else lo = mid
      }
      return r + way * hi
    }
    return r + way * room
  }
  const [a, b] = [trackPlace(path, spans, walk(-1)), trackPlace(path, spans, walk(1))]
  const sunk = reach - (dot(pathAt(path, a.r).p, u) + dot(pathAt(path, b.r).p, u)) / 2
  return { ...a.place, to: b.place, offset: sunk >= deep - 1e-6 ? 0 : depth - sunk }
}

/**
 * Where a table's supports stand on their own. Legs along the track: in
 * every corner and wherever a curve meets a straight edge, spaced evenly
 * between (`legsAlong`). T-bases, frames or panels at the two sides at the
 * ends of the way its seating runs (`seatingAxis`), or of its length
 * (`longAxis`) when the seating runs every way or there is none, to the
 * left and right of whoever sits there (`autoInset`); one across the
 * middle when the two would meet.
 */
function autoSupports(style: 'legs' | StationStyle, edges: TableEdge[], top: Polygon, placements: Placement[], path: SupportPath, spans: Track['spans']): PlacedSupport[] {
  if (!path.points.length) return []
  if (style === 'legs') {
    const anchors = edges.flatMap((e, i) => {
      const next = edges[(i + 1) % edges.length]
      if (!e.curve === !next.curve || dot(direction(e, 1), direction(next, 0)) <= SMOOTH) return []
      const r = trackAt(path, spans, { edge: next.id, t: 0 })
      return r === null ? [] : [r]
    })
    return legsAlong(path.points, 0, anchors).map(r => trackPlace(path, spans, r).place)
  }
  const sides = supportSides(edges)
  if (!sides.length) return []
  const axis = seatingAxis(edges) ?? longAxis(top.outer, frameOf(edges).along)
  const far = sides.reduce((a, b) => (dot(b.out, axis) > dot(a.out, axis) ? b : a))
  const near = sides.reduce((a, b) => (dot(b.out, axis) < dot(a.out, axis) ? b : a))
  const { thickness } = STATION[style]
  const stand = (side: SupportSide, inset: number) => autoStretch(style, side, inset + thickness / 2, path, spans, top)
  if (far === near) return [stand(far, autoInset(style, far, top, placements))].flatMap(s => (s ? [s] : []))
  const [a, b] = [autoInset(style, near, top, placements), autoInset(style, far, top, placements)]
  const depth = dot(far.p, far.out) - Math.min(...top.outer.map(p => dot(p, far.out)))
  const pair = depth - a - b > 2 * thickness ? [stand(near, a), stand(far, b)] : [stand(far, depth / 2 - thickness / 2)]
  return pair.flatMap(s => (s ? [s] : []))
}

/** Where a frame's posts stand along its line: a post's width in from each end, at every corner, and four evenly round a closed line with no corner. */
function postsOf(line: Vec2[], closed: boolean, size: number): { p: Vec2; dir: Vec2 }[] {
  const n = line.length
  const corners = line.flatMap((p, i) => {
    if (!closed && (i === 0 || i === n - 1)) return []
    const tin = normalize(sub(p, line[(i - 1 + n) % n]))
    const tout = normalize(sub(line[(i + 1) % n], p))
    return Math.abs(Math.atan2(cross(tin, tout), dot(tin, tout))) >= CORNER_TURN ? [{ p, dir: normalize(add(tin, tout)) }] : []
  })
  const length = lengthOf({ points: line, closed })
  const at = (s: number) => {
    const { p, tangent } = along(line, closed, s)
    return { p, dir: tangent }
  }
  if (closed) return corners.length ? corners : [0, 1, 2, 3].map(k => at((length * k) / 4))
  return length > size ? [at(size / 2), at(length - size / 2), ...corners] : [at(length / 2)]
}

/**
 * The parts of a T-base, frame or panel along its line: a panel is a slab
 * as long as the line; a frame a loop of square steel, a rail at the floor
 * and one under the top along the line, on posts at its ends and corners;
 * a T-base a foot bar along the line under a column at its middle. Each
 * stops short of the top's edge.
 */
function stretchParts(style: StationStyle, line: Vec2[], closed: boolean, underside: number, within: Ring[]): Part[] {
  const t = STATION[style].thickness
  const lay = (polygons: Polygon[], from: number, height: number) => polygons.map(p => prismPart(p, from, height, 'furnitureDark', 'support'))
  const band = intersection(stroke(line, closed, t), within)
  if (!band.length) return []
  const square = (p: Vec2, dir: Vec2) => intersection([squareAt(p, dir, t)], within)
  if (style === 'panels') return lay(band, 0, underside)
  if (style === 'frames') return [...lay(band, 0, t), ...lay(band, underside - t, t), ...postsOf(line, closed, t).flatMap(({ p, dir }) => lay(square(p, dir), t, underside - 2 * t))]
  const { p, tangent } = along(line, closed, lengthOf({ points: line, closed }) / 2)
  return [...lay(band, 0, TBASE_FOOT_HEIGHT), ...lay(square(p, tangent), TBASE_FOOT_HEIGHT, underside - TBASE_FOOT_HEIGHT)]
}

/**
 * The supports standing on a table's track, placed by hand or of its own:
 * a leg at its place, moved in by its offset; a T-base, frame or panel as
 * a straight bar between its places, kept on one side of the track
 * (`settleBar`), moved in square to itself by its offset. A leg that
 * would meet one already standing, or stand off the top, and a bar of
 * which nothing stands under the top, are left out.
 */
function standSupports(style: 'legs' | StationStyle, places: PlacedSupport[], path: SupportPath, spans: Track['spans'], top: Polygon, underside: number): { parts: Part[]; supports: SupportLayout['supports']; refused: number } {
  const within = offset([top.outer], -EDGE_MARGIN)
  const legRoom = offset([top.outer], -LEG_RADIUS)
  const parts: Part[] = []
  const supports: SupportLayout['supports'] = []
  let refused = 0
  places.forEach((place, index) => {
    const r0 = trackAt(path, spans, place)
    if (r0 === null) return
    const shift = place.offset ?? 0
    if (style === 'legs') {
      const { p, tangent } = pathAt(path, r0)
      const inward = perpendicular(tangent)
      const at = add(p, mul(inward, shift))
      if (!legRoom.some(ring => pointInRing(at, ring)) || supports.some(s => distance(s.line[0], at) < 2 * LEG_RADIUS)) {
        refused++
        return
      }
      parts.push(cylinderPart(LEG_RADIUS, underside, 'furnitureDark', [at[0], at[1], 0], { segments: 10, role: 'support' }))
      supports.push({ ...place, index, along: [r0, r0], line: [at], outline: null, inward, bends: false })
      return
    }
    const r1 = place.to ? trackAt(path, spans, place.to) : null
    const [a, b] = settleBar(path, r0, r1 === null ? 0 : mod(r1 - r0, path.length))
    const ends = [pathAt(path, a).p, pathAt(path, b).p]
    if (distance(ends[0], ends[1]) < 1e-6) {
      refused++
      return
    }
    const route = pathBetween(path, a, b)
    const across = perpendicular(normalize(sub(ends[1], ends[0])))
    const bends = route.some(p => Math.abs(dot(sub(p, ends[0]), across)) > BENDS)
    const curved = !!place.curved && bends
    const line = curved ? parallel(route, shift) : ends.map(p => add(p, mul(across, shift)))
    const inward = curved ? perpendicular(along(route, false, lengthOf({ points: route, closed: false }) / 2).tangent) : across
    const built = stretchParts(style, line, false, underside, within)
    if (!built.length) {
      refused++
      return
    }
    parts.push(...built)
    const outline = intersection(stroke(line, false, STATION[style].thickness), within)[0] ?? null
    supports.push({ ...place, index, along: [a, b], line, outline, inward, bends })
  })
  return { parts, supports, refused }
}

/** Where one more support would stand: for legs, in the middle of every long gap between two along the track, or at its start with none; for T-bases, frames or panels, where one would stand on its own at each side none stands at. */
function supportMarks(style: 'legs' | StationStyle, edges: TableEdge[], top: Polygon, placements: Placement[], path: SupportPath, spans: Track['spans'], standing: SupportLayout['supports'], underside: number): SupportLayout['marks'] {
  if (!path.points.length) return []
  if (style === 'legs') {
    const round = standing.map(s => mod(s.along[0], path.length)).sort((a, b) => a - b)
    if (!round.length) return [{ ...trackPlace(path, spans, 0).place, at: pathAt(path, 0).p }]
    return round.flatMap((r, i) => {
      const gap = (i + 1 < round.length ? round[i + 1] : round[0] + path.length) - r
      if (gap < LEG_MARK_GAP) return []
      const { place, r: x } = trackPlace(path, spans, r + gap / 2)
      const at = pathAt(path, x).p
      return standing.some(s => distance(s.line[0], at) < LEG_MARK_GAP / 2) ? [] : [{ ...place, at }]
    })
  }
  return supportSides(edges).flatMap(side => {
    const r = trackAt(path, spans, side)
    if (r === null || standing.some(s => mod(r - s.along[0], path.length) <= s.along[1] - s.along[0] + 1e-9)) return []
    const support = autoStretch(style, side, autoInset(style, side, top, placements) + STATION[style].thickness / 2, path, spans, top)
    const built = support && standSupports(style, [support], path, spans, top, underside).supports[0]
    return built ? [{ ...support, at: along(built.line, false, lengthOf({ points: built.line, closed: false }) / 2).p }] : []
  })
}

/** What a table stands on: the style asked for, auto picking panels for a straight table with an end no one sits at next to one someone does, and a pedestal otherwise. */
const supportStyle = (style: SupportStyle, edges: TableEdge[]): Exclude<SupportStyle, 'auto'> => (style === 'auto' ? (hasFreeEnd(edges) ? 'panels' : 'pedestal') : style)

/** A table's supports in the style asked for, the layouts their controls read, and how many were left out for meeting another or standing off the top. */
function supports(style: Exclude<SupportStyle, 'auto'>, edges: TableEdge[], top: Polygon, underside: number, placements: Placement[], loop: Loop, options: TableOptions): { parts: Part[]; supportTrack: SupportLayout | null; pedestals: PedestalLayout | null; refused: number } {
  if (style === 'none') return { parts: [], supportTrack: null, pedestals: null, refused: 0 }
  if (style === 'pedestal') {
    const built = standPedestals(edges, top, underside, options.pedestals)
    return { parts: built.parts, supportTrack: null, pedestals: built.layout, refused: built.refused }
  }
  const spans = loop.spans.map(span => ({ edgeId: span.edge.id, from: span.from, length: span.length }))
  const pole = labelPoint(top, undefined, 24)
  const depth = Math.min(...top.outer.map((p, i) => distanceToSegment(pole, p, top.outer[(i + 1) % top.outer.length])))
  const path = supportPath(loop, options.supportInset ?? SUPPORT_INSETS[style], Math.max(0, depth - TRACK_LEFT))
  const places = options.supportPlaces ?? autoSupports(style, edges, top, placements, path, spans)
  const built = standSupports(style, places, path, spans, top, underside)
  const marks = supportMarks(style, edges, top, placements, path, spans, built.supports, underside)
  return { parts: built.parts, supportTrack: { ...path, supports: built.supports, marks }, pedestals: null, refused: built.refused }
}

/**
 * A table from its traced outline: a top of the outline at `height`,
 * supports under it, and chairs fitted along the seating edges. What fits
 * is decided by the chairs' real footprints; nothing here limits a size.
 */
export function table(input: TableEdge[], options: TableOptions = {}): TableResult {
  const edges = ringOf(input)
  const height = options.height ?? DEFAULTS.height
  const thickness = options.thickness ?? DEFAULTS.thickness
  const outline = chordRing(edges)
  const top: Polygon = { outer: outline, holes: options.holes ?? [] }
  const smooth = edges.map((e, i) => dot(direction(e, 1), direction(edges[(i + 1) % edges.length], 0)) > SMOOTH)
  const warnings: string[] = []
  const chair = options.chair ?? 'meetingChair'
  const clearance = options.clearance ?? DEFAULTS.clearance
  const gap = options.gap ?? DEFAULTS.gap
  const { min, max } = partsExtent(STOCK_ITEMS[chair].parts)
  const size: ChairSize = { width: max[0] - min[0], front: max[1], back: -min[1] }
  const loop = loopOf(edges)
  const { pieces, corners } = trackOf(loop, clearance, size)
  const line = seatLine({ length: loop.length, pieces })
  const { candidates, capacity, spaced, runs } = layChairs(edges, smooth, loop, line, pieces, size, { gap, clearance, turn: options.turn ?? 0, seats: options.seats, placed: options.placed }, warnings)
  const facing = candidates.map((c): Placement => ({ id: '', kind: chair, at: c.at, front: c.front, elevation: 0 }))
  const style = supportStyle(options.supports ?? 'pedestal', edges)
  const held = supports(style, edges, top, height - thickness, facing, loop, options)
  if (held.refused) warnings.push(`${held.refused} supports would meet another or stand off the top and were left out.`)
  const parts = [prismPart(top, height - thickness, thickness, 'tableTop', 'top'), ...held.parts]
  const { placements, marks: chairMarks, refused } = keepChairs(candidates, parts, chair, !!options.placed, loop, line, pieces, clearance + size.front, warnings)
  const spans = loop.spans.map(span => ({ edgeId: span.edge.id, from: span.from, length: span.length }))
  const screens = options.screens ? screensFacing(placements, outline, options.screens, height, clearance, warnings) : []
  return { outline, parts, placements: [...placements, ...screens], warnings, track: { clearance, reach: size.front, pitch: size.width + gap, length: loop.length, spans, edge: loop.chords, pieces, corners, runs }, chairMarks, supportTrack: held.supportTrack, pedestals: held.pedestals, leftOut: { chairs: refused, supports: held.refused }, capacity, spaced }
}

/** How far a ray from `p` along `d` travels before it leaves the ring. */
function reachInside(p: Vec2, d: Vec2, ring: Ring): number {
  let best = Infinity
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i]
    const e = sub(ring[(i + 1) % ring.length], a)
    const denominator = cross(d, e)
    if (Math.abs(denominator) < 1e-12) continue
    const ap = sub(a, p)
    const s = cross(ap, e) / denominator
    const u = cross(ap, d) / denominator
    if (s > 1e-4 && u >= 0 && u <= 1) best = Math.min(best, s)
  }
  return best
}

/**
 * The deepest spot along a monitor's lane where it fits on the top, turned
 * toward its chair. The turn swings its back corners, so the fit is
 * searched rather than taken from the unturned depth.
 */
function monitorSpot<T extends { fits: boolean }>(standing: (depth: number) => T, deepest: number): T | null {
  const far = standing(deepest)
  if (far.fits) return far
  const step = 0.005
  for (let depth = deepest - step; depth > 0; depth -= step) {
    if (!standing(depth).fits) continue
    let lo = depth
    let hi = depth + step
    for (let i = 0; i < 20; i++) {
      const mid = (lo + hi) / 2
      if (standing(mid).fits) lo = mid
      else hi = mid
    }
    return standing(lo)
  }
  return null
}

/**
 * A desk: a table with one seating edge, one office chair at its middle,
 * and monitors on the top as far back as they fit, each facing the chair.
 */
export function desk(input: TableEdge[], options: DeskOptions = {}): TableResult {
  if (input.filter(e => e.seating).length !== 1) throw new Error('A desk has exactly one seating edge.')
  const { monitors, ...rest } = options
  return table(input, { chair: 'officeChair', seats: 1, screens: monitors ?? 1, ...rest })
}

/**
 * Screens in front of each chair: `count` side by side across the chair's
 * front, each as far back on the top as it fits turned to face the chair,
 * and none where it would meet another screen, so two chairs facing each
 * other across a bench each keep their own.
 */
function screensFacing(chairs: Placement[], outline: Ring, count: number, height: number, clearance: number, warnings: string[]): Placement[] {
  const { min, max } = partsExtent(STOCK_ITEMS.monitor.parts)
  const step = max[0] - min[0] + MONITOR_GAP
  const top: Polygon = { outer: outline, holes: [] }
  const screens: Placement[] = []
  const taken: Polygon[] = []
  for (const chair of chairs) {
    const reach = partsExtent(STOCK_ITEMS[chair.kind].parts).max[1]
    const edgePoint = add(chair.at, mul(chair.front, clearance + reach))
    const deepest = reachInside(edgePoint, chair.front, outline) + min[1] - MONITOR_MARGIN
    const along = perpendicular(chair.front)
    for (let j = 0; j < count; j++) {
      const lane = add(edgePoint, mul(along, (j - (count - 1) / 2) * step))
      const standing = (depth: number) => {
        const at = add(lane, mul(chair.front, depth))
        const front = normalize(sub(chair.at, at))
        const rect = itemRect('monitor', at, front)
        return { at, front, rect, fits: rect.outer.every(p => pointInPolygon(p, top)) && !taken.some(t => overlaps(t, rect)) }
      }
      const spot = monitorSpot(standing, deepest)
      if (!spot) {
        warnings.push(`Monitor ${j + 1} does not fit on the top.`)
        continue
      }
      taken.push(spot.rect)
      screens.push({ id: `${chair.id}:monitor:${j}`, kind: 'monitor', at: spot.at, front: spot.front, elevation: height })
    }
  }
  return screens
}

/** The parts of a placed stock item. */
export const placementParts = (p: Placement): Part[] => placeItem(p.kind, p.at, p.front, p.elevation)

/** Everything a recipe built, its own parts and its placed items. */
export const resultParts = (r: TableResult): Part[] => [...r.parts, ...r.placements.flatMap(placementParts)]

/** Straight edges round a polygon, seating on the listed indices, or on all of them when left out. */
export function polygonEdges(points: Vec2[], seating?: number[], prefix = 'e'): TableEdge[] {
  return points.map((p, i) => ({ id: `${prefix}${i}`, points: [p, points[(i + 1) % points.length]], seating: seating ? seating.includes(i) : true }))
}

/** The four curved edges of the ellipse inside the box from a to b. */
export function ellipseEdges(a: Vec2, b: Vec2, seating = true, prefix = 'e'): TableEdge[] {
  return ellipseCubics(a, b).map(([p0, c1, c2, p3], i) => ({ id: `${prefix}${i}`, points: [p0, p3], curve: [c1, c2], seating }))
}
