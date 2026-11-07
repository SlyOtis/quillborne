import ClipperLib, { type Path, type ClipType } from 'clipper-lib'
import type { Vec2, Ring, Polygon } from './vector'

/** Integer grid for boolean operations: one micrometre. */
import { CLIP_GRID } from '../model/precision'

export const CLIP_SCALE = 1 / CLIP_GRID

const toPath = (ring: Ring): Path => ring.map(p => ({ X: Math.round(p[0] * CLIP_SCALE), Y: Math.round(p[1] * CLIP_SCALE) }))
const fromPath = (path: Path): Ring => path.map(p => [p.X / CLIP_SCALE, p.Y / CLIP_SCALE] as Vec2)

export interface ClipOptions {
  /** Ask Clipper for strictly simple output. Cheap on small inputs, very costly on huge outlines. */
  strictlySimple?: boolean
}

function run(type: ClipType, subjects: Ring[], clips: Ring[], options: ClipOptions): Polygon[] {
  const clipper = new ClipperLib.Clipper()
  clipper.StrictlySimple = options.strictlySimple ?? false
  if (subjects.length) clipper.AddPaths(subjects.map(toPath), ClipperLib.PolyType.ptSubject, true)
  if (clips.length) clipper.AddPaths(clips.map(toPath), ClipperLib.PolyType.ptClip, true)
  const tree = new ClipperLib.PolyTree()
  clipper.Execute(type, tree, ClipperLib.PolyFillType.pftNonZero, ClipperLib.PolyFillType.pftNonZero)
  return ClipperLib.JS.PolyTreeToExPolygons(tree)
    .filter(ex => ex.outer.length >= 3)
    .map(ex => ({ outer: fromPath(ex.outer), holes: ex.holes.filter(h => h.length >= 3).map(fromPath) }))
}

/** Rings grown (positive delta) or shrunk (negative) by a distance in metres, with mitered corners. */
export function offset(rings: Ring[], delta: number): Ring[] {
  const offsetter = new ClipperLib.ClipperOffset(4, 0.25)
  offsetter.AddPaths(rings.map(toPath), ClipperLib.JoinType.jtMiter, ClipperLib.EndType.etClosedPolygon)
  const solution: Path[] = []
  offsetter.Execute(solution, delta * CLIP_SCALE)
  return solution.filter(p => p.length >= 3).map(fromPath)
}

/** A polygon rebuilt on a coarser grid and re-unioned, so micrometre folds and spikes collapse. */
export function settle(polygon: Polygon, grid = 1e-5): Polygon[] {
  const quantize = (ring: Ring): Ring => ring.map(p => [Math.round(p[0] / grid) * grid, Math.round(p[1] / grid) * grid] as Vec2)
  const rings = [polygon.outer, ...polygon.holes].map(quantize)
  return run(ClipperLib.ClipType.ctUnion, rings, [], { strictlySimple: true })
}

/** Union of rings of any orientation; outer rings come back counter-clockwise, holes clockwise. */
export function union(rings: Ring[], options: ClipOptions = {}): Polygon[] {
  return run(ClipperLib.ClipType.ctUnion, rings, [], options)
}

/** The subject rings minus the clip rings. */
export function difference(subjects: Ring[], clips: Ring[], options: ClipOptions = {}): Polygon[] {
  if (!clips.length) return union(subjects, options)
  return run(ClipperLib.ClipType.ctDifference, subjects, clips, options)
}

/** The parts of the subject rings inside the clip rings. */
export function intersection(subjects: Ring[], clips: Ring[], options: ClipOptions = {}): Polygon[] {
  if (!subjects.length || !clips.length) return []
  return run(ClipperLib.ClipType.ctIntersection, subjects, clips, options)
}
