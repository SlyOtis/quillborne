import type { Vec2 } from '../geometry/vector'
import { distance } from '../geometry/vector'

/**
 * The precision ladder, coarse to fine. Each derived layer uses a grid at
 * least a hundred times finer than the smallest feature of the layer it must
 * not disturb, so rounding in one layer never moves anything in the layer
 * above it.
 *
 * - `MIN_FEATURE`: the smallest thing a hand can mean at any zoom. No two
 *   document points are closer than this and no wall is shorter. It is a
 *   rule about distances between points, never about widths.
 * - `DOCUMENT_GRID`: every stored coordinate is a multiple of this.
 * - `KERNEL_GRID`: the arrangement rounds every point to this once and decides
 *   topology in integers on it; derived crossings land here.
 * - `CLIP_GRID`: wall solids run through Clipper on this; offset constructions
 *   are inset two units so clips cut rather than touch.
 */
export const MIN_FEATURE = 0.01
export const DOCUMENT_GRID = 1e-6
export const KERNEL_GRID = 1e-5
export const CLIP_GRID = 1e-6

/** Rounds by an integer count per metre, since dividing by 1e6 is exact where multiplying by 1e-6 is not. */
const onGrid = (v: number, grid: number): number => {
  const perMetre = Math.round(1 / grid)
  return Math.round(v * perMetre) / perMetre
}

/** A point on the document grid. Every point that enters the document passes through this. */
export const quantize = (p: Vec2): Vec2 => [onGrid(p[0], DOCUMENT_GRID), onGrid(p[1], DOCUMENT_GRID)]

/** Two points the document would treat as one. The only definition tools may use. */
export const samePoint = (a: Vec2, b: Vec2): boolean => distance(a, b) < MIN_FEATURE
