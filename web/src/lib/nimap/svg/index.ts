import { groundOf, type Ground } from '../model/floors'
import type { Level } from '../model/types'
import type { Vec2, Ring, Polygon } from '../geometry/vector'
import { bounds } from '../geometry/vector'
import { buildSolids, type WallSolids } from '../geometry/walls'
import type { SolidsResult } from '../geometry/local-solids'
import { lineChords, linePath } from '../model/lines'
import { openingCuts, placeOpenings, type OpeningGeometry } from '../model/openings'
import type { Opening } from '../model/types'

/** Solids for a level with its openings cut out, or an empty solid plus the kernel's message when the geometry defeats it. */
export function safeSolids(walls: Level['walls'], openings: Opening[] = []): WallSolids {
  try {
    return buildSolids(walls, openingCuts(openings, walls))
  } catch (error) {
    const empty = buildSolids([])
    return { ...empty, warnings: [`Wall solids unavailable: ${(error as Error).message}`] }
  }
}

export interface SvgViewBox {
  x: number
  y: number
  width: number
  height: number
  value: string
}

export interface LevelSvg {
  viewBox: SvgViewBox
  walls: { path: string; owner: string; members: string[] }[]
  /** The outer edge of all wall solids as one path. */
  wallBoundary: string
  centerlines: { id: string; path: string }[]
  units: { id: string; name: string; category: string; ground: Ground; path: string; anchor: Vec2; hidden: boolean }[]
  fixtureLines: { id: string; path: string }[]
  fixtures: { id: string; kind: string; name?: string; path: string; closed: boolean; anchor: Vec2 }[]
  openings: { id: string; kind: string; box: string; symbol: string }[]
  warnings: string[]
}

export interface LevelSvgOptions {
  /** Document y is up; SVG y is down. */
  flipY?: boolean
  padding?: number
  /** Solids already solved for this level's walls and openings, to draw instead of solving them again. */
  solids?: SolidsResult
}

const fmt = (v: number) => (Math.round(v * 1000) / 1000).toString()

export function toSvgPoint(p: Vec2, flipY = true): Vec2 {
  return [p[0], flipY ? -p[1] : p[1]]
}

export function ringToPath(ring: Ring, flipY = true): string {
  return ring.map((p, i) => {
    const q = toSvgPoint(p, flipY)
    return `${i === 0 ? 'M' : 'L'}${fmt(q[0])} ${fmt(q[1])}`
  }).join(' ') + ' Z'
}

/** Outer ring and holes as one path; render with `fill-rule="evenodd"`. */
export function polygonToPath(polygon: Polygon, flipY = true): string {
  return [polygon.outer, ...polygon.holes].map(r => ringToPath(r, flipY)).join(' ')
}

/** A door's leaf and swing, or a window's jamb line, as one path. */
export function openingSymbolPath(g: OpeningGeometry, flipY = true): string {
  if (g.leaf && g.arc) return `${polylineToPath(g.leaf, flipY)} ${polylineToPath(g.arc, flipY)}`
  return polylineToPath(g.centre, flipY)
}

export function polylineToPath(points: Vec2[], flipY = true): string {
  return points.map((p, i) => {
    const q = toSvgPoint(p, flipY)
    return `${i === 0 ? 'M' : 'L'}${fmt(q[0])} ${fmt(q[1])}`
  }).join(' ')
}

/** Everything needed to draw a level flat: wall solids, centerlines and units. */
export function levelToSvg(level: Level, options: LevelSvgOptions = {}): LevelSvg {
  const { flipY = true, padding = 0.5 } = options
  const solids = options.solids ?? safeSolids(level.walls, level.openings)
  const points: Vec2[] = [
    ...solids.cells.flatMap(c => c.points),
    ...level.walls.flatMap(w => lineChords(w)),
    ...level.units.flatMap(u => u.polygon.outer),
    ...level.fixtureLines.flatMap(l => lineChords(l))
  ].map(p => toSvgPoint(p, flipY))
  const b = points.length ? bounds(points) : { minX: 0, minY: 0, maxX: 1, maxY: 1 }
  const x = b.minX - padding
  const y = b.minY - padding
  const width = b.maxX - b.minX + padding * 2
  const height = b.maxY - b.minY + padding * 2
  return {
    viewBox: { x, y, width, height, value: `${fmt(x)} ${fmt(y)} ${fmt(width)} ${fmt(height)}` },
    walls: solids.cells.map(c => ({ path: polygonToPath({ outer: c.points, holes: c.holes }, flipY), owner: c.owner, members: c.members })),
    wallBoundary: solids.boundary.map(e => `M${fmt(toSvgPoint(e.a, flipY)[0])} ${fmt(toSvgPoint(e.a, flipY)[1])} L${fmt(toSvgPoint(e.b, flipY)[0])} ${fmt(toSvgPoint(e.b, flipY)[1])}`).join(' '),
    centerlines: level.walls.map(w => ({ id: w.id, path: linePath(w, flipY) })),
    units: level.units.map(u => ({
      id: u.id,
      name: u.name,
      category: u.category,
      ground: groundOf(u),
      path: polygonToPath(u.polygon, flipY),
      anchor: toSvgPoint(u.anchor, flipY),
      hidden: u.hidden
    })),
    fixtureLines: level.fixtureLines.map(l => ({ id: l.id, path: linePath(l, flipY) })),
    fixtures: level.fixtures.map(f => ({
      id: f.id,
      kind: f.kind,
      name: f.name,
      path: f.polygon ? polygonToPath(f.polygon, flipY) : polylineToPath(f.line ?? [], flipY),
      closed: !!f.polygon,
      anchor: toSvgPoint(f.anchor, flipY)
    })),
    openings: placeOpenings(level.openings, level.walls).map(({ opening, geometry }) => ({
      id: opening.id,
      kind: opening.kind,
      box: ringToPath(geometry.box, flipY),
      symbol: openingSymbolPath(geometry, flipY)
    })),
    warnings: solids.warnings
  }
}
