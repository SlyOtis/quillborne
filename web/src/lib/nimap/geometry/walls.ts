import { EPS, type Vec2, type Ring, type Box, type Polygon, cross, sub, add, mul, length, signedArea, bounds, boxesOverlap, gridKey, segmentCrossing, dot, normalize, pointInRing, distanceToSegment } from './vector'
import { KERNEL_GRID } from '../model/precision'
import { lineChords } from '../model/lines'
import { arrangement, type Arrangement, type Segment } from './arrangement'
import { difference, offset, settle, CLIP_SCALE } from './clip'
import { triangulate } from './overlap'

export interface WallLike {
  id: string
  points: Vec2[]
  width: number
}

export interface WallPolygon {
  points: Ring
  /** Wall id for strips, `j<gridKey>` for junction sectors. */
  owner: string
  members: string[]
  box: Box
  /** Set on a corner cut: the owners that lose this region, the wall and its vertex's sectors. Never a cell itself. */
  cuts?: string[]
}

export interface WallPrimitives {
  graph: Arrangement
  polygons: WallPolygon[]
  warnings: string[]
}

export interface SolidCell {
  id: string
  points: Ring
  holes: Ring[]
  area: number
  netArea: number
  /** Wall id for strips, `j<gridKey>` for junction sectors. */
  owner: string
  members: string[]
}

export interface BoundaryEdge {
  a: Vec2
  b: Vec2
}

export interface WallSolids extends WallPrimitives {
  cells: SolidCell[]
  /** The outer edge of all wall solids, directed so the solid lies on the left. */
  boundary: BoundaryEdge[]
  area: number
}

/** A stretch of a wall's centreline to leave out of its strip: an opening between its two jambs, as arc lengths along the wall's chords from its first point. */
export interface StripCut {
  wallId: string
  s0: number
  s1: number
}

/** Arc length along a chord polyline of the point on it nearest `p`. */
function arcPosition(chords: Vec2[], cum: number[], p: Vec2): number {
  let best = 0
  let bestDistance = Infinity
  for (let i = 1; i < chords.length; i++) {
    const a = chords[i - 1]
    const b = chords[i]
    const ab = sub(b, a)
    const len2 = ab[0] * ab[0] + ab[1] * ab[1]
    const t = len2 ? Math.max(0, Math.min(1, dot(sub(p, a), ab) / len2)) : 0
    const q = add(a, mul(ab, t))
    const d = length(sub(p, q))
    if (d < bestDistance) {
      bestDistance = d
      best = cum[i - 1] + t * (cum[i] - cum[i - 1])
    }
  }
  return best
}

export const COINCIDENT_WALLS_WARNING = 'Coincident wall strokes merged; widest width wins.'
export const BEVEL_WARNING = 'Acute join limited to a bevel.'

/** A document line, or a legacy run of points; the kernel and its fixtures still accept runs. */
export interface LineLike {
  id: string
  points: Vec2[]
  curve?: [Vec2, Vec2]
}

/** The walls that stand: a line of no width is an edge, which bounds regions and builds no solid. */
export const standing = <W extends WallLike>(walls: W[]): W[] => walls.filter(w => w.width > 0)

export function wallSegments(walls: LineLike[]): Segment[] {
  return walls.flatMap(w => {
    const chords = w.points.length === 2 ? lineChords({ id: w.id, points: w.points as [Vec2, Vec2], ...(w.curve ? { curve: w.curve } : {}) }) : w.points
    return chords.slice(1).map((b, i) => ({ a: chords[i], b, owners: [w.id] }))
  })
}

/**
 * A rectangle per noded edge offset by that edge's own half-width, and an
 * explicit sector per consecutive pair of half-edges at every junction: the
 * two offset lines meet at the miter apex, or fall back to a bevel past the
 * miter limit.
 */
export function wallPrimitives(all: WallLike[], miterLimit = 4, cuts: StripCut[] = []): WallPrimitives {
  const walls = standing(all)
  const graph = arrangement(wallSegments(walls))
  const lookup = new Map(walls.map(w => [w.id, w]))
  const cutsByWall = new Map<string, StripCut[]>()
  for (const c of cuts) cutsByWall.set(c.wallId, [...(cutsByWall.get(c.wallId) ?? []), c])
  /** Each cut wall's chords with their arc lengths, so an edge's stretch of the wall is read by position along the curve, not by projection. */
  const arcs = new Map<string, { chords: Vec2[]; cum: number[] }>()
  for (const id of cutsByWall.keys()) {
    const w = lookup.get(id)
    if (!w) continue
    const chords = w.points.length === 2 ? lineChords({ id: w.id, points: w.points as [Vec2, Vec2], ...((w as LineLike).curve ? { curve: (w as LineLike).curve } : {}) }) : w.points
    const cum = [0]
    for (let i = 1; i < chords.length; i++) cum.push(cum[i - 1] + length(sub(chords[i], chords[i - 1])))
    arcs.set(id, { chords, cum })
  }
  /** The cut, if any, an owner wall has strictly around a point on it. */
  const cutAround = (owners: string[], p: Vec2): boolean =>
    owners.some(id => {
      const arc = arcs.get(id)
      if (!arc) return false
      const s = arcPosition(arc.chords, arc.cum, p)
      return (cutsByWall.get(id) ?? []).some(c => s > c.s0 + EPS && s < c.s1 - EPS)
    })
  const polygons: WallPolygon[] = []
  const warnings = new Set<string>()

  const widths = graph.edges.map(e => {
    const owners = e.owners.map(id => lookup.get(id)!)
    if (owners.length > 1) warnings.add(COINCIDENT_WALLS_WARNING)
    return Math.max(...owners.map(w => w.width))
  })

  const put = (points: Ring, owner: string, members: string[], cuts?: string[]) => {
    if (Math.abs(signedArea(points)) < EPS * EPS) return
    polygons.push({ points, owner, members, box: bounds(points), ...(cuts ? { cuts } : {}) })
  }

  const strips = new Map<number, Ring>()
  graph.edges.forEach((e, i) => {
    const a = graph.vertices[e.a].p
    const b = graph.vertices[e.b].p
    const d = sub(b, a)
    const l = length(d)
    const n = mul([-d[1] / l, d[0] / l], widths[i] / 2)
    const ring: Ring = [add(a, n), add(b, n), sub(b, n), sub(a, n)]
    strips.set(i, ring)
    // An opening leaves the strip in the pieces on either side of it; the
    // full strip still stands in for the wall's body at its junctions.
    const spans = e.owners
      .flatMap(id => (cutsByWall.get(id) ?? []).map(c => ({ id, c })))
      .map(({ id, c }) => {
        const arc = arcs.get(id)!
        const sa = arcPosition(arc.chords, arc.cum, a)
        const sb = arcPosition(arc.chords, arc.cum, b)
        if (Math.abs(sb - sa) < EPS) return [0, 0] as [number, number]
        const t0 = (c.s0 - sa) / (sb - sa)
        const t1 = (c.s1 - sa) / (sb - sa)
        return [Math.max(0, Math.min(t0, t1)), Math.min(1, Math.max(t0, t1))] as [number, number]
      })
      .filter(([t0, t1]) => t1 - t0 > EPS)
      .sort((x, y) => x[0] - y[0])
    if (!spans.length) {
      put(ring, e.owners[0], e.owners)
      return
    }
    const pieces: [number, number][] = []
    let t = 0
    for (const [t0, t1] of spans) {
      if (t0 > t + EPS) pieces.push([t, t0])
      t = Math.max(t, t1)
    }
    if (t < 1 - EPS) pieces.push([t, 1])
    for (const [t0, t1] of pieces) {
      const pa = add(a, mul(d, t0))
      const pb = add(a, mul(d, t1))
      put([add(pa, n), add(pb, n), sub(pb, n), sub(pa, n)], e.owners[0], e.owners)
    }
  })

  graph.vertices.forEach(v => {
    if (v.out.length < 2) return
    const members = [...new Set(v.out.flatMap(h => graph.edges[graph.halfEdges[h].edge].owners))]
    // A joint between two chords inside an opening has no wall around it; its sector would be a hair across the hole.
    if (cutAround(members, v.p)) return
    const owner = `j${gridKey(v.p)}`
    const cutters: Ring[] = []
    const widest = Math.max(...v.out.map(h => widths[graph.halfEdges[h].edge]))
    for (let k = 0; k < v.out.length; k++) {
      const ha = graph.halfEdges[v.out[k]]
      const hb = graph.halfEdges[v.out[(k + 1) % v.out.length]]
      const da = sub(graph.vertices[ha.to].p, v.p)
      const db = sub(graph.vertices[hb.to].p, v.p)
      const u = mul(da, 1 / length(da))
      const w = mul(db, 1 / length(db))
      const wa = widths[ha.edge]
      const wb = widths[hb.edge]
      const a = add(v.p, mul([-u[1], u[0]], wa / 2))
      const b = add(v.p, mul([w[1], -w[0]], wb / 2))
      const den = cross(u, w)
      const reach = (miterLimit * Math.max(wa, wb)) / 2
      let points: Ring = [v.p, a, b]
      if (Math.abs(den) > 1e-10) {
        const x = add(a, mul(u, cross(sub(b, a), w) / den))
        if (length(sub(x, v.p)) <= reach) points = [v.p, a, x, b]
        else warnings.add(BEVEL_WARNING)
      }
      // Miter. A wall's corner that points into this gap meets the gap's two
      // bounding faces. Walking outward along the corner's own face, if it
      // enters a neighbour through that neighbour's bounding face within the
      // miter reach, the corner is caught: the face extends up to it and
      // nothing cuts. Otherwise a bounding face crossing the corner's face
      // inside the wall's body cuts the corner beyond it, up to the cap. The
      // gap's size does not matter; a corner pointing elsewhere belongs to
      // another gap.
      const turn = (p: Vec2) => {
        const t = Math.atan2(cross(u, p), dot(u, p))
        return t < 0 ? t + 2 * Math.PI : t
      }
      const gap = turn(w) <= EPS ? 2 * Math.PI : turn(w)
      const cutReach = (miterLimit * widest) / 2
      for (const h of v.out) {
        const half = graph.halfEdges[h]
        const tDir = normalize(sub(graph.vertices[half.to].p, v.p))
        const tHalf = widths[half.edge] / 2
        const tRing = strips.get(half.edge)!
        const target = graph.edges[half.edge].owners[0]
        for (const side of [1, -1]) {
          const corner = add(v.p, mul([-tDir[1] * side, tDir[0] * side], tHalf))
          const at = turn(sub(corner, v.p))
          if (at <= EPS || at >= gap - EPS) continue
          // A corner inside another wall's strip at the vertex is not an
          // exposed end: the wall continues, or a host runs through.
          const covered = v.out.some(o => o !== h && insideOrOn(strips.get(graph.halfEdges[o].edge)!, corner))
          if (covered) continue
          const meetings = ([[a, u, ha.edge], [b, w, hb.edge]] as const)
            .filter(([, , nEdge]) => nEdge !== half.edge)
            .map(([nFace, nDir]) => {
              const d = cross(tDir, nDir)
              if (Math.abs(d) < 1e-10) return null
              const x = add(corner, mul(tDir, cross(sub(nFace, corner), nDir) / d))
              const along = dot(sub(x, v.p), tDir)
              const bodyward = normalize(sub(v.p, nFace))
              const outside = dot(sub(corner, nFace), bodyward) < 0
              return length(sub(x, v.p)) <= cutReach ? { nFace, bodyward, along, outside } : null
            })
            .filter((m): m is NonNullable<typeof m> => !!m)
          const caught = meetings.find(m => m.along < -EPS && m.outside)
          if (caught) {
            const n = mul([-tDir[1], tDir[0]], tHalf)
            const back = mul(tDir, -cutReach)
            const extension: Ring = [add(v.p, n), sub(v.p, n), add(sub(v.p, n), back), add(add(v.p, n), back)]
            const fill = clipHalfPlane(extension, caught.nFace, mul(caught.bodyward, -1))
            if (Math.abs(signedArea(fill)) > EPS * EPS) put(fill, owner, members)
            continue
          }
          // The cut is taken from the strip grown by the cells' inset, so it
          // reaches a hair past the strip's own face and end instead of having
          // to meet them exactly, which rounding would miss by a micrometre and
          // leave a splinter along the face.
          const grown = offset([tRing], CELL_INSET)[0] ?? tRing
          for (const m of meetings) {
            if (m.along <= EPS) continue
            const beyond = clipHalfPlane(grown, m.nFace, mul(m.bodyward, -1))
            const piece = clipHalfPlane(beyond, add(v.p, mul(tDir, m.along)), mul(tDir, -1))
            if (Math.abs(signedArea(piece)) < EPS * EPS) continue
            const box = bounds(piece)
            const others = [...strips].filter(([i, ring]) => i !== half.edge && boxesOverlap(bounds(ring), box)).map(([, ring]) => ring)
            for (const cut of difference([piece], others)) {
              if (Math.abs(signedArea(cut.outer)) < EPS * EPS) continue
              cutters.push(cut.outer)
              put(cut.outer, owner, members, [target, owner])
            }
          }
        }
      }
      for (const lobe of simpleLobes(points)) {
        const centroid: Vec2 = [lobe.reduce((t, q) => t + q[0], 0) / lobe.length, lobe.reduce((t, q) => t + q[1], 0) / lobe.length]
        if (cutters.some(c => pointInRing(centroid, c))) continue
        put(lobe, owner, members)
      }
    }
  })

  return { graph, polygons, warnings: [...warnings] }
}

/** The part of a ring on the non-negative side of the plane through `origin` with normal `keep`. */
function clipHalfPlane(ring: Ring, origin: Vec2, keep: Vec2): Ring {
  const out: Ring = []
  for (let i = 0; i < ring.length; i++) {
    const p = ring[i]
    const q = ring[(i + 1) % ring.length]
    const sp = dot(sub(p, origin), keep)
    const sq = dot(sub(q, origin), keep)
    if (sp >= 0) out.push(p)
    if ((sp >= 0) !== (sq >= 0)) out.push(add(p, mul(sub(q, p), sp / (sp - sq))))
  }
  return out.filter((p, i) => i === 0 || length(sub(p, out[i - 1])) > EPS).filter((p, i, r) => i < r.length - 1 || length(sub(p, r[0])) > EPS)
}

/**
 * When the miter apex lies past one wall's cap the sector quad crosses
 * itself. Its two lobes are both wanted, one filling the wedge between the
 * caps and one already inside a strip, but a self-crossing ring is not a
 * polygon, so each lobe is emitted on its own with the orientation the other
 * primitives use.
 */
function simpleLobes(ring: Ring): Ring[] {
  if (ring.length !== 4) return [ring]
  const [p0, p1, p2, p3] = ring
  const oriented = (lobe: Ring): Ring => (signedArea(lobe) > 0 ? [...lobe].reverse() : lobe)
  const across = segmentCrossing(p0, p1, p2, p3)
  if (across) return [[p0, across, p3], [across, p1, p2]].map(oriented)
  const along = segmentCrossing(p1, p2, p3, p0)
  if (along) return [[p0, p1, along], [along, p2, p3]].map(oriented)
  return [ring]
}

const positive = (ring: Ring): Ring => (signedArea(ring) < 0 ? [...ring].reverse() : ring)

const insideOrOn = (ring: Ring, p: Vec2): boolean => pointInRing(p, ring) || ring.some((a, i) => distanceToSegment(p, a, ring[(i + 1) % ring.length]) < EPS)

/** Cells thinner than this are rounding residue of the integer clip, not walls. */
const MIN_CELL_AREA = 1e-8

/** True when ear clipping covers exactly the polygon's area, i.e. it is fit for rendering. */
function triangulates(polygon: Polygon): boolean {
  const covered = triangulate(polygon).reduce((s, t) => s + Math.abs(signedArea(t)), 0)
  const net = Math.abs(signedArea(polygon.outer)) - polygon.holes.reduce((s, h) => s + Math.abs(signedArea(h)), 0)
  return Math.abs(covered - net) <= 5e-7
}

/** A piece settled on the fine grid, or on a coarser one when that leaves it unfit for triangulation. */
function settled(piece: Polygon): Polygon[] {
  for (const grid of [KERNEL_GRID, KERNEL_GRID * 10, KERNEL_GRID * 100]) {
    const result = settle(piece, grid)
    if (result.every(triangulates)) return result
  }
  return settle(piece, KERNEL_GRID * 100)
}
/**
 * Where two pieces overlap, the one placed first keeps the overlap, so the
 * placing order must come from the geometry and the walls' ids, never from
 * the order the walls were listed in: by owner, then by where the piece
 * lies. The sort is stable, so pieces one junction makes keep their order.
 */
function stableOrder(polygons: WallPolygon[]): WallPolygon[] {
  return [...polygons].sort((p, q) => (p.owner < q.owner ? -1 : p.owner > q.owner ? 1 : p.box.minX - q.box.minX || p.box.minY - q.box.minY))
}

/**
 * Every subject shrinks by this much before subtraction, so a clip that only
 * touched its boundary now cuts it. That keeps every cell a simple polygon;
 * the two-micrometre seams between cells are invisible and the outer
 * boundary comes from the unshrunk union.
 */
const CELL_INSET = 2 / CLIP_SCALE

interface Placed {
  box: Box
  rings: Ring[]
}

/**
 * Resolves all strip and sector overlaps into disjoint cells with one owner
 * each, by exact integer boolean operations. Junction sectors are placed
 * first, a later junction winning where two overlap; then every edge strip
 * minus the sectors and earlier strips it touches. Noding puts junctions at
 * strip ends, so a strip only ever loses wedges at its ends and cells stay
 * simple polygons, which is what triangulation for rendering needs. The outer
 * boundary is the union of everything.
 */
export function buildSolids(walls: WallLike[], cuts: StripCut[] = []): WallSolids {
  const primitives = wallPrimitives(walls, 4, cuts)
  if (!standing(walls).length) return { ...primitives, cells: [], boundary: [], area: 0 }
  const { polygons } = primitives

  // A piece is clipped only by the cuts that reach it, in the stable order:
  // a far cut changes nothing in it, but Clipper may write the same shape
  // with other vertices when its input differs, and then a piece would
  // depend on walls it never touches.
  const sectorCutters = stableOrder(polygons.filter(p => p.cuts))
  const cutters = new Map<string, WallPolygon[]>()
  for (const p of sectorCutters) for (const id of p.cuts!) if (!id.startsWith('j')) cutters.set(id, [...(cutters.get(id) ?? []), p])
  const junctions = stableOrder(polygons.filter(p => !p.cuts && p.owner.startsWith('j')).reverse())
  const strips = stableOrder(polygons.filter(p => !p.cuts && !p.owner.startsWith('j')))

  const placed: Placed[] = []
  const cells: SolidCell[] = []
  for (const polygon of [...junctions, ...strips]) {
    const own = (polygon.owner.startsWith('j') ? sectorCutters : cutters.get(polygon.owner) ?? []).filter(c => boxesOverlap(c.box, polygon.box)).map(c => c.points)
    // Clips are all solid regions; under the nonzero rule two of them with
    // opposite orientation would cancel where they overlap, so they share one.
    const clips = [...placed.filter(q => boxesOverlap(q.box, polygon.box)).flatMap(q => q.rings), ...own].map(positive)
    const pieces = difference(offset([polygon.points], -CELL_INSET), clips, { strictlySimple: true })
    const rings: Ring[] = []
    for (const piece of pieces.flatMap(p => settled(p))) {
      if (piece.outer.length < 3) continue
      const area = Math.abs(signedArea(piece.outer))
      const netArea = area - piece.holes.reduce((s, h) => s + Math.abs(signedArea(h)), 0)
      if (netArea < MIN_CELL_AREA) continue
      rings.push(piece.outer, ...piece.holes)
      cells.push({
        id: `cell-${cells.length + 1}`,
        points: piece.outer,
        holes: piece.holes,
        area,
        netArea,
        owner: polygon.owner,
        members: polygon.members
      })
    }
    if (rings.length) placed.push({ box: polygon.box, rings: [polygon.points] })
  }

  return { ...primitives, cells, boundary: solidBoundary(polygons), area: cells.reduce((s, c) => s + c.netArea, 0) }
}

/** Everything the solids cover: every strip and sector united, less the corner cuts. Clipper rounds a crossing point by which edge it meets first, so the pieces go in the stable order too. */
function solidOutline(polygons: WallPolygon[]): Polygon[] {
  const ordered = stableOrder(polygons)
  return difference(ordered.filter(p => !p.cuts).map(p => positive(p.points)), ordered.filter(p => p.cuts).map(p => positive(p.points)))
}

/** An outline's rings as edges, each directed so the solid lies on its left. */
function outlineEdges(outline: Polygon[]): BoundaryEdge[] {
  const boundary: BoundaryEdge[] = []
  for (const piece of outline) {
    for (const ring of [piece.outer, ...piece.holes]) {
      for (let i = 0; i < ring.length; i++) boundary.push({ a: ring[i], b: ring[(i + 1) % ring.length] })
    }
  }
  return boundary
}

/** The outer edge of the solids the primitives make. */
export function solidBoundary(polygons: WallPolygon[]): BoundaryEdge[] {
  return outlineEdges(solidOutline(polygons))
}
