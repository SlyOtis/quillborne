import type { Box } from './vector'
import { EPS } from './vector'
import { buildSolids, solidBoundary, wallSegments, type BoundaryEdge, type SolidCell, type StripCut, type WallLike, type WallPolygon, type WallSolids } from './walls'

/** What callers read from a solve: the cells, the outer edge, their area and the kernel's warnings. */
export interface SolidsResult {
  cells: SolidCell[]
  boundary: BoundaryEdge[]
  area: number
  warnings: string[]
}

export interface SolidsUpdater {
  /** The solids of these walls and cuts, re-solving only around the walls that changed since the last call. */
  update(walls: WallLike[], cuts?: StripCut[]): SolidsResult
  /** Takes a full solve of these walls as the base the next update works from. */
  adopt(walls: WallLike[], cuts: StripCut[], solids: WallSolids): void
  /** How the last update was answered, for tests and measurements. */
  readonly last: 'full' | 'local' | 'same'
}

export interface SolidsUpdaterOptions {
  miterLimit?: number
  /** Past this share of changed walls a full solve is cheaper than a local one. */
  fullShare?: number
}

/**
 * Wall solids kept between edits, re-solved only where walls changed. A
 * wall counts as changed when it is a different object from last time (the
 * store never edits a wall in place) or its cuts differ. No piece reaches
 * farther than the miter reach r from its wall's centreline, and a cell is
 * its piece less the pieces before it that overlap, so a change reaches
 * cells within a few r of the changed walls and no farther. Around the
 * changed walls' old and new extent D: the walls meeting D grown by 4r are
 * the affected ones, whose strips are replaced along with every junction
 * inside that grown box; they are solved together with every wall within 2r
 * of them, so each affected piece sees everything that can touch it. The
 * outer edge is taken again from all the pieces: patching it inside a
 * window would dissolve slivers that touch their surroundings, which the
 * full union keeps. The result is the full
 * solve's up to rounding: Clipper rounds each crossing to the micrometre
 * along the edges it is given, and a local solve is given fewer, so a point
 * may land one kernel grid step (10 µm) from where the full solve puts it;
 * no shape differs. `test/geometry/local-solids.test.ts` asserts that bound
 * after every step of random edit sequences. Hosts use it while an edit is
 * in progress and adopt a full solve once it is committed.
 */
export function createSolidsUpdater(options: SolidsUpdaterOptions = {}): SolidsUpdater {
  const miterLimit = options.miterLimit ?? 4
  const fullShare = options.fullShare ?? 0.25
  let state: { walls: Map<string, WallLike>; cuts: Map<string, string>; polygons: WallPolygon[]; result: SolidsResult } | null = null
  let last: SolidsUpdater['last'] = 'full'

  const cutKeys = (cuts: StripCut[]) => {
    const keys = new Map<string, string>()
    for (const c of cuts) keys.set(c.wallId, `${keys.get(c.wallId) ?? ''}${c.s0}:${c.s1};`)
    return keys
  }

  const adopt = (walls: WallLike[], cuts: StripCut[], solids: WallSolids): SolidsResult => {
    const result = { cells: solids.cells, boundary: solids.boundary, area: solids.area, warnings: solids.warnings }
    state = { walls: new Map(walls.map(w => [w.id, w])), cuts: cutKeys(cuts), polygons: solids.polygons, result }
    return result
  }

  const full = (walls: WallLike[], cuts: StripCut[]): SolidsResult => {
    last = 'full'
    return adopt(walls, cuts, buildSolids(walls, cuts))
  }

  return {
    get last() {
      return last
    },
    adopt(walls, cuts, solids) {
      adopt(walls, cuts, solids)
    },
    update(walls, cuts = []) {
      if (!state) return full(walls, cuts)
      const keys = cutKeys(cuts)
      const changed: WallLike[] = []
      for (const w of walls) if (state.walls.get(w.id) !== w || state.cuts.get(w.id) !== keys.get(w.id)) changed.push(w)
      const current = new Set(walls.map(w => w.id))
      const removed = [...state.walls.values()].filter(w => !current.has(w.id))
      if (!changed.length && !removed.length) {
        last = 'same'
        return state.result
      }
      if (changed.length + removed.length > walls.length * fullShare) return full(walls, cuts)

      const before = changed.map(w => state!.walls.get(w.id)).filter((w): w is WallLike => !!w)
      const widest = Math.max(0, ...walls.map(w => w.width), ...removed.map(w => w.width), ...before.map(w => w.width))
      const reach = (miterLimit * widest) / 2 + EPS
      const extent = [...changed, ...before, ...removed].map(boxOf).reduce(merged)
      const region = grown(extent, 4 * reach)
      const boxes = new Map(walls.map(w => [w.id, boxOf(w)]))

      const affected = walls.filter(w => overlaps(boxes.get(w.id)!, region))
      const neighbourhood = affected.map(w => grown(boxes.get(w.id)!, 2 * reach))
      const solved = walls.filter(w => overlaps(boxes.get(w.id)!, region) || neighbourhood.some(n => overlaps(boxes.get(w.id)!, n)))
      const solvedIds = new Set(solved.map(w => w.id))
      const sub = buildSolids(solved, cuts.filter(c => solvedIds.has(c.wallId)))

      const replaced = new Set([...affected.map(w => w.id), ...removed.map(w => w.id)])
      const replaces = (owner: string) => (owner.startsWith('j') ? inside(junctionPoint(owner), region) : replaced.has(owner))
      const cells = [...state.result.cells.filter(c => !replaces(c.owner)), ...sub.cells.filter(c => replaces(c.owner))].map((c, i) => ({ ...c, id: `cell-${i + 1}` }))
      const polygons = [...state.polygons.filter(p => !replaces(p.owner)), ...sub.polygons.filter(p => replaces(p.owner))]
      const warnings = [...new Set([...state.result.warnings, ...sub.warnings])]
      const result = { cells, boundary: solidBoundary(polygons), area: cells.reduce((s, c) => s + c.netArea, 0), warnings }
      state = { walls: new Map(walls.map(w => [w.id, w])), cuts: keys, polygons, result }
      last = 'local'
      return result
    }
  }
}

function boxOf(wall: WallLike): Box {
  const points = wallSegments([wall]).flatMap(s => [s.a, s.b])
  return {
    minX: Math.min(...points.map(p => p[0])),
    minY: Math.min(...points.map(p => p[1])),
    maxX: Math.max(...points.map(p => p[0])),
    maxY: Math.max(...points.map(p => p[1]))
  }
}

const merged = (a: Box, b: Box): Box => ({ minX: Math.min(a.minX, b.minX), minY: Math.min(a.minY, b.minY), maxX: Math.max(a.maxX, b.maxX), maxY: Math.max(a.maxY, b.maxY) })
const grown = (b: Box, d: number): Box => ({ minX: b.minX - d, minY: b.minY - d, maxX: b.maxX + d, maxY: b.maxY + d })
const overlaps = (a: Box, b: Box): boolean => a.minX <= b.maxX && b.minX <= a.maxX && a.minY <= b.maxY && b.minY <= a.maxY
const inside = (p: [number, number], b: Box): boolean => p[0] >= b.minX && p[0] <= b.maxX && p[1] >= b.minY && p[1] <= b.maxY

/** A junction's owner is `j` and its vertex's key on the kernel grid. */
function junctionPoint(owner: string): [number, number] {
  const [x, y] = owner.slice(1).split(',').map(Number)
  return [x * EPS, y * EPS]
}
