import type { Vec2, Ring } from '../geometry/vector'
import { add, sub, mul, distance, dot, cross, normalize, offsetPolyline, projectOntoSegment } from '../geometry/vector'
import type { Opening, OpeningSwing, Wall } from './types'
import { lineChords } from './lines'
import { DOCUMENT_GRID, MIN_FEATURE, quantize } from './precision'

/** Two walls meeting at a node continue one run when their directions differ by less than this. */
const COLLINEAR_DEG = 5
const EPS = 1e-9

const nodeKey = (p: Vec2): string => `${Math.round(p[0] / DOCUMENT_GRID)},${Math.round(p[1] / DOCUMENT_GRID)}`

export interface Polyline {
  points: Vec2[]
  /** Arc length at each point. */
  cum: number[]
  length: number
}

export const polylineOf = (points: Vec2[]): Polyline => {
  const cum = [0]
  for (let i = 1; i < points.length; i++) cum.push(cum[i - 1] + distance(points[i - 1], points[i]))
  return { points, cum, length: cum[cum.length - 1] }
}

/** The point at arc length `s`, clamped to the polyline. */
export function pointAt(pl: Polyline, s: number): Vec2 {
  if (s <= 0) return pl.points[0]
  for (let i = 1; i < pl.points.length; i++) {
    if (s <= pl.cum[i]) {
      const l = pl.cum[i] - pl.cum[i - 1]
      const t = l ? (s - pl.cum[i - 1]) / l : 0
      return add(pl.points[i - 1], mul(sub(pl.points[i], pl.points[i - 1]), t))
    }
  }
  return pl.points[pl.points.length - 1]
}

/** The unit direction of the polyline at arc length `s`. */
export function directionAt(pl: Polyline, s: number): Vec2 {
  for (let i = 1; i < pl.points.length; i++) {
    if (s <= pl.cum[i] || i === pl.points.length - 1) return normalize(sub(pl.points[i], pl.points[i - 1]))
  }
  return [1, 0]
}

/** The arc length of the point on the polyline nearest `p`, and how far `p` is from it. */
export function nearestArc(pl: Polyline, p: Vec2): { s: number; distance: number; point: Vec2 } {
  let best = { s: 0, distance: Infinity, point: pl.points[0] }
  for (let i = 1; i < pl.points.length; i++) {
    const { point, t } = projectOntoSegment(p, pl.points[i - 1], pl.points[i])
    const d = distance(p, point)
    if (d < best.distance) best = { s: pl.cum[i - 1] + t * (pl.cum[i] - pl.cum[i - 1]), distance: d, point }
  }
  return best
}

/** A wall's canonical direction: its points read so that x increases, else y. Reversing the wall's points does not change it. */
export function canonicalForward(wall: Wall): boolean {
  const [a, b] = wall.points
  return b[0] > a[0] || (b[0] === a[0] && b[1] >= a[1])
}

export interface RunPiece {
  wall: Wall
  /** The wall's points read against the run's direction. */
  reversed: boolean
  /** Arc length of the piece's start and end on the run. */
  s0: number
  s1: number
}

export interface RunNode {
  s: number
  point: Vec2
  /** Walls meeting the run here that are not part of it: the corner or the T that ends or crosses the run. */
  others: Wall[]
}

/**
 * A straight run: the chain of walls that continue each other through
 * their shared nodes, past seams, T's and crossings alike. A run ends at
 * a free end, a corner or a fork; a seam left by drawing a straight wall
 * in two clicks is inside a run and means nothing to it. A closed ring
 * with no such node is one run starting anywhere.
 */
export interface Run {
  pieces: RunPiece[]
  polyline: Polyline
  nodes: RunNode[]
  closed: boolean
}

/** The direction a wall leaves its end in, outward: the handle's for a curve, the chord's for a straight wall. */
const endDirection = (wall: Wall, index: 0 | 1): Vec2 => {
  if (wall.curve && distance(wall.curve[index], wall.points[index]) > EPS) return normalize(sub(wall.points[index], wall.curve[index]))
  const chords = lineChords(wall)
  const from = index === 0 ? chords[1] : chords[chords.length - 2]
  return normalize(sub(wall.points[index], from))
}

const continues = (a: Wall, ai: 0 | 1, b: Wall, bi: 0 | 1): boolean => {
  const da = endDirection(a, ai)
  const db = endDirection(b, bi)
  return dot(da, db) < -Math.cos((COLLINEAR_DEG * Math.PI) / 180)
}

/** Every run of a level's walls; an edge of no width stands no wall and carries no opening. */
export function wallRuns(all: Wall[]): Run[] {
  const walls = all.filter(w => w.width > 0)
  const at = new Map<string, { wall: Wall; index: 0 | 1 }[]>()
  for (const wall of walls) {
    wall.points.forEach((p, index) => {
      const key = nodeKey(p)
      at.set(key, [...(at.get(key) ?? []), { wall, index: index as 0 | 1 }])
    })
  }
  /** The one wall that carries on straight past this end, through a seam, a T or a crossing; none at a corner or a fork. */
  const through = (wall: Wall, index: 0 | 1): { wall: Wall; index: 0 | 1 } | null => {
    const here = at.get(nodeKey(wall.points[index])) ?? []
    const onward = here.filter(e => e.wall !== wall && continues(wall, index, e.wall, e.index))
    return onward.length === 1 ? onward[0] : null
  }
  const visited = new Set<string>()
  const runs: Run[] = []
  const build = (start: Wall, startIndex: 0 | 1) => {
    const pieces: { wall: Wall; reversed: boolean }[] = []
    let wall = start
    let entry = startIndex
    let closed = false
    while (!visited.has(wall.id)) {
      visited.add(wall.id)
      pieces.push({ wall, reversed: entry === 1 })
      const exit: 0 | 1 = entry === 0 ? 1 : 0
      const next = through(wall, exit)
      if (!next) break
      if (next.wall === start) {
        closed = true
        break
      }
      wall = next.wall
      entry = next.index
    }
    const points: Vec2[] = []
    for (const piece of pieces) {
      const chords = piece.reversed ? [...lineChords(piece.wall)].reverse() : lineChords(piece.wall)
      for (const p of chords) if (!points.length || distance(points[points.length - 1], p) > EPS) points.push(p)
    }
    const polyline = polylineOf(points)
    const runPieces: RunPiece[] = []
    let s = 0
    for (const piece of pieces) {
      const l = polylineOf(lineChords(piece.wall)).length
      runPieces.push({ ...piece, s0: s, s1: s + l })
      s += l
    }
    const inRun = new Set(pieces.map(p => p.wall.id))
    const nodes: RunNode[] = []
    const seen = new Set<string>()
    for (const piece of runPieces) {
      for (const [index, p] of piece.wall.points.entries()) {
        const key = nodeKey(p)
        if (seen.has(key)) continue
        seen.add(key)
        const others = (at.get(key) ?? []).map(e => e.wall).filter(w => !inRun.has(w.id))
        const s = piece.reversed === (index === 0) ? piece.s1 : piece.s0
        nodes.push({ s, point: p, others })
      }
    }
    nodes.sort((a, b) => a.s - b.s)
    runs.push({ pieces: runPieces, polyline, nodes, closed })
  }
  for (const wall of walls) {
    if (visited.has(wall.id)) continue
    if (!through(wall, 0)) build(wall, 0)
    else if (!through(wall, 1)) build(wall, 1)
  }
  for (const wall of walls) if (!visited.has(wall.id)) build(wall, 0)
  return runs
}

export interface Hosted {
  run: Run
  piece: RunPiece
  /** Arc length along the run. */
  s: number
  point: Vec2
  direction: Vec2
  distance: number
}

/** Where a point lies on the runs: the nearest run within `tolerance`, or null. */
export function locate(runs: Run[], p: Vec2, tolerance: number): Hosted | null {
  let best: Hosted | null = null
  for (const run of runs) {
    const near = nearestArc(run.polyline, p)
    if (near.distance > tolerance || (best && near.distance >= best.distance)) continue
    const piece = run.pieces.find(x => near.s <= x.s1 + EPS) ?? run.pieces[run.pieces.length - 1]
    best = { run, piece, s: near.s, point: near.point, direction: directionAt(run.polyline, near.s), distance: near.distance }
  }
  return best
}

/** The wall an opening sits on, by its centre; null when no wall passes within the minimum feature of it. */
export const hostOf = (opening: Opening, runs: Run[]): Hosted | null => locate(runs, opening.at, MIN_FEATURE)

export type Interval = [number, number]

/** The part of a convex ring on the non-negative side of the plane through `origin` with normal `keep`. */
function clipHalfPlane(ring: Vec2[], origin: Vec2, keep: Vec2): Vec2[] {
  const out: Vec2[] = []
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i]
    const b = ring[(i + 1) % ring.length]
    const da = dot(sub(a, origin), keep)
    const db = dot(sub(b, origin), keep)
    if (da >= -EPS) out.push(a)
    if ((da < -EPS && db > EPS) || (da > EPS && db < -EPS)) out.push(add(a, mul(sub(b, a), da / (da - db))))
  }
  return out
}

/** A wall's strip from one of its ends outward, as a ring: the end, its direction, its length and its width. */
const stripFrom = (origin: Vec2, direction: Vec2, length: number, width: number): Vec2[] => {
  const n = mul([-direction[1], direction[0]], width / 2)
  const far = add(origin, mul(direction, length))
  return [add(origin, n), add(far, n), sub(far, n), sub(origin, n)]
}

/**
 * The stretch of the run another wall's body takes up at a node: the
 * extent along the run of the overlap between that wall's strip and the
 * run's own strip. At a right corner or a T it is
 * half the other wall's width; at a shallow bend it is the sliver of the
 * other wall's cap that dips into the run, so a door can reach almost
 * into the bend, as it can on site.
 */
function bandAlong(run: Run, node: RunNode, other: Wall): Interval {
  const along = directionAt(run.polyline, Math.min(node.s, run.polyline.length - EPS))
  const hostWidth = Math.max(...run.pieces.filter(p => p.s0 <= node.s + EPS && p.s1 >= node.s - EPS).map(p => p.wall.width))
  const oi = other.points.findIndex(p => distance(p, node.point) < MIN_FEATURE) as 0 | 1
  const d = mul(endDirection(other, oi), -1)
  const length = polylineOf(lineChords(other)).length
  const host = stripFrom(add(node.point, mul(along, -(length + hostWidth))), along, 2 * (length + hostWidth), hostWidth)
  let overlap = stripFrom(node.point, d, length, other.width)
  for (let i = 0; i < 4 && overlap.length; i++) {
    const a = host[i]
    const b = host[(i + 1) % 4]
    const edge = sub(b, a)
    overlap = clipHalfPlane(overlap, a, [edge[1], -edge[0]])
  }
  if (!overlap.length) return [node.s, node.s]
  const reach = overlap.map(v => dot(sub(v, node.point), along))
  return [node.s + Math.min(...reach), node.s + Math.max(...reach)]
}

const bandsOverlap = (a: Pick<Opening, 'from' | 'to'>, b: Pick<Opening, 'from' | 'to'>): boolean => a.from < b.to - EPS && b.from < a.to - EPS

/**
 * Where an opening's centre may lie on a run: the run minus the stretch
 * every wall meeting it takes up (`bandAlong`) and minus every other opening
 * whose elevation band overlaps, each shrunk by half the opening's width
 * so the whole opening fits. A free end blocks nothing: an opening may
 * start exactly there.
 */
export function legalCentres(run: Run, opening: Pick<Opening, 'id' | 'width' | 'from' | 'to'>, openings: Opening[], runs: Run[]): Interval[] {
  const blocked: Interval[] = []
  for (const node of run.nodes) for (const other of node.others) blocked.push(bandAlong(run, node, other))
  for (const o of openings) {
    if (o.id === opening.id || !bandsOverlap(o, opening)) continue
    const host = hostOf(o, runs)
    if (!host || host.run !== run) continue
    blocked.push([host.s - o.width / 2, host.s + o.width / 2])
  }
  blocked.sort((a, b) => a[0] - b[0])
  const free: Interval[] = []
  let cursor = 0
  for (const [a, b] of blocked) {
    if (a > cursor) free.push([cursor, Math.min(a, run.polyline.length)])
    cursor = Math.max(cursor, b)
  }
  if (cursor < run.polyline.length) free.push([cursor, run.polyline.length])
  const half = opening.width / 2
  return free.filter(([a, b]) => b - a >= opening.width - EPS).map(([a, b]) => [a + half, b - half])
}

/** The legal centre nearest `s`, or null when the opening fits nowhere on the run. */
export function fitOnRun(run: Run, s: number, opening: Pick<Opening, 'id' | 'width' | 'from' | 'to'>, openings: Opening[], runs: Run[]): number | null {
  let best: number | null = null
  for (const [a, b] of legalCentres(run, opening, openings, runs)) {
    const c = Math.max(a, Math.min(b, s))
    if (best === null || Math.abs(c - s) < Math.abs(best - s)) best = c
  }
  return best
}

export interface Fit {
  at: Vec2
  host: Hosted
}

/**
 * Where an opening lands when the hand is at `p`: on the nearest run
 * within `reach`, nudged to the nearest legal centre. Null when no run is
 * in reach or the opening fits nowhere on it.
 */
export function fitOpening(p: Vec2, opening: Pick<Opening, 'id' | 'width' | 'from' | 'to'>, walls: Wall[], openings: Opening[], reach: number, runs = wallRuns(walls)): Fit | null {
  const host = locate(runs, p, reach)
  if (!host) return null
  const s = fitOnRun(host.run, host.s, opening, openings, runs)
  if (s === null) return null
  const at = quantize(pointAt(host.run.polyline, s))
  const placed = locate(runs, at, MIN_FEATURE)
  return placed ? { at, host: placed } : null
}

/** The side of the host an off-wall point lies on, against the wall's canonical direction. */
export function sideOf(p: Vec2, host: Hosted): 1 | -1 {
  const forward = canonicalForward(host.piece.wall) !== host.piece.reversed
  const d = forward ? host.direction : mul(host.direction, -1)
  return cross(d, sub(p, host.point)) >= 0 ? 1 : -1
}

export interface OpeningGeometry {
  /** The stretch of wall the opening replaces, across the wall's full width, following the wall's bend. */
  box: Ring
  /** The two jambs on the centreline, in the host's canonical direction. */
  jambs: [Vec2, Vec2]
  /** The centreline between the jambs, following the bend: a window's symbol. */
  centre: Vec2[]
  /** A door's leaf from its hinge, straight across the hole, and the arc its free end sweeps, as a polyline. */
  leaf?: [Vec2, Vec2]
  arc?: Vec2[]
}

/** The polyline's points from arc length `s0` to `s1`, ends included. */
function stretch(pl: Polyline, s0: number, s1: number): Vec2[] {
  const points: Vec2[] = [pointAt(pl, s0)]
  for (let i = 0; i < pl.points.length; i++) if (pl.cum[i] > s0 + EPS && pl.cum[i] < s1 - EPS) points.push(pl.points[i])
  points.push(pointAt(pl, s1))
  return points
}

/** A band of half-width `hw` around the polyline's stretch between two arc lengths, as a ring. */
function bandRing(pl: Polyline, s0: number, s1: number, hw: number): Ring {
  const centre = stretch(pl, s0, s1)
  return [...offsetPolyline(centre, hw), ...offsetPolyline(centre, -hw).reverse()]
}

/** What an opening looks like on its host: null for an opening no wall holds. */
export function openingGeometry(opening: Opening, runs: Run[]): OpeningGeometry | null {
  const host = hostOf(opening, runs)
  if (!host) return null
  const forward = canonicalForward(host.piece.wall) !== host.piece.reversed
  const half = opening.width / 2
  const w = host.piece.wall.width / 2
  const pl = host.run.polyline
  const s0 = Math.max(0, host.s - half)
  const s1 = Math.min(pl.length, host.s + half)
  const along = stretch(pl, s0, s1)
  const centre = forward ? along : [...along].reverse()
  const a = centre[0]
  const b = centre[centre.length - 1]
  const box = bandRing(pl, s0, s1, w)
  if (opening.kind !== 'door') return { box, jambs: [a, b], centre }
  const d = normalize(sub(b, a))
  const n: Vec2 = [-d[1], d[0]]
  const swing: OpeningSwing = opening.swing ?? { side: 1, hinge: 0 }
  const hinge = swing.hinge === 0 ? a : b
  const toward = mul(d, swing.hinge === 0 ? 1 : -1)
  const out = mul(n, swing.side)
  const tip = add(hinge, mul(out, opening.width))
  const arc: Vec2[] = []
  const steps = 12
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * (Math.PI / 2)
    arc.push(add(hinge, add(mul(out, Math.cos(t) * opening.width), mul(toward, Math.sin(t) * opening.width))))
  }
  return { box, jambs: [a, b], centre, leaf: [hinge, tip], arc }
}

/**
 * Openings carried through a change of their walls. An opening keeps its
 * distance from the nearer end of its run, so moving the far end leaves it
 * in place, moving the near end takes it along, and healing a seam under
 * it changes nothing; on a curved run it keeps its fraction. A host that
 * reversed its canonical direction flips the swing with it. An opening
 * whose host is gone stays where it was, for the commit to drop or re-home.
 */
export function carryOpenings(openings: Opening[], before: Wall[], after: Wall[]): Opening[] {
  if (!openings.length) return openings
  const runsBefore = wallRuns(before)
  const runsAfter = wallRuns(after)
  const afterById = new Map(after.map(w => [w.id, w]))
  const runAfterOf = (id: string): { run: Run; piece: RunPiece } | null => {
    for (const run of runsAfter) {
      const piece = run.pieces.find(p => p.wall.id === id)
      if (piece) return { run, piece }
    }
    return null
  }
  return openings.map(o => {
    const host = hostOf(o, runsBefore)
    if (!host) return o
    const was = host.piece.wall
    const now = afterById.get(was.id)
    const target = now && runAfterOf(was.id)
    if (!now || !target) return o
    if (host.run.pieces.length === target.run.pieces.length && host.run.pieces.every((p, i) => p.wall === target.run.pieces[i].wall)) return o
    const sameWay = host.piece.reversed === target.piece.reversed
    const l0 = host.run.polyline.length
    const l1 = target.run.polyline.length
    const curved = host.run.pieces.some(p => p.wall.curve) || target.run.pieces.some(p => p.wall.curve)
    let s: number
    if (curved) {
      const fraction = host.s / l0
      s = sameWay ? fraction * l1 : (1 - fraction) * l1
    } else {
      const fromStart = host.s
      const fromEnd = l0 - host.s
      const nearStart = fromStart <= fromEnd
      const d = nearStart ? fromStart : fromEnd
      s = nearStart === sameWay ? d : l1 - d
    }
    const at = quantize(pointAt(target.run.polyline, Math.max(0, Math.min(l1, s))))
    const flipped = canonicalForward(was) !== canonicalForward(now)
    const swing = o.swing && flipped ? { side: -o.swing.side as 1 | -1, hinge: (1 - o.swing.hinge) as 0 | 1 } : o.swing
    return { ...o, at, ...(swing ? { swing } : {}) }
  })
}

/** Openings that still have a host, after walls were normalised or removed. */
export const hostedOpenings = (openings: Opening[], walls: Wall[]): Opening[] => {
  if (!openings.length) return openings
  const runs = wallRuns(walls)
  const kept = openings.filter(o => hostOf(o, runs))
  return kept.length === openings.length ? openings : kept
}

/** Where each wall is cut for its openings, as arc lengths along that wall's own chords from its first point, for the kernel. */
export function openingCuts(openings: Opening[], walls: Wall[]): { wallId: string; s0: number; s1: number }[] {
  if (!openings.length) return []
  const runs = wallRuns(walls)
  const cuts: { wallId: string; s0: number; s1: number }[] = []
  for (const o of openings) {
    const host = hostOf(o, runs)
    if (!host) continue
    const from = host.s - o.width / 2
    const to = host.s + o.width / 2
    for (const piece of host.run.pieces) {
      if (piece.s1 < from - EPS || piece.s0 > to + EPS) continue
      const lo = Math.max(from, piece.s0)
      const hi = Math.min(to, piece.s1)
      const own = piece.reversed ? [piece.s1 - hi, piece.s1 - lo] : [lo - piece.s0, hi - piece.s0]
      if (own[1] - own[0] > EPS) cuts.push({ wallId: piece.wall.id, s0: own[0], s1: own[1] })
    }
  }
  return cuts
}

export interface PlacedOpening {
  opening: Opening
  geometry: OpeningGeometry
}

/** Every opening a wall holds, with its geometry; the ones no wall holds are left out. */
export function placeOpenings(openings: Opening[], walls: Wall[], runs = wallRuns(walls)): PlacedOpening[] {
  const placed: PlacedOpening[] = []
  for (const opening of openings) {
    const geometry = openingGeometry(opening, runs)
    if (geometry) placed.push({ opening, geometry })
  }
  return placed
}

export const DEFAULT_OPENING: Record<Opening['kind'], Pick<Opening, 'width' | 'from' | 'to'>> = {
  door: { width: 0.9, from: 0, to: 2.1 },
  window: { width: 1.2, from: 0.9, to: 2.1 }
}
