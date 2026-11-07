import type { Vec2 } from '../geometry/vector'
import { dot, sub } from '../geometry/vector'

/**
 * Pieces a drag of a grip is made of, for the drags that set one number: a
 * width, a gap, a turn, a place along a track. The drag reads the hand as
 * that number and settles on the nearest to it that fits. Both depend only
 * on where the hand is and on what was decided at the press, never on the
 * way the hand got there, so a fast hand and a slow one end in the same
 * place. Each drag keeps its own state and calls the pieces it needs.
 */

const mod = (x: number, m: number): number => ((x % m) + m) % m

/** How far the hand has travelled from where it pressed along `direction`, a unit vector fixed at the press: a slider's reading, whatever the hand does across it. */
export const alongAxis = (press: Vec2, direction: Vec2, point: Vec2): number => dot(sub(point, press), direction)

/** A value round a closed path of length `length`, as the value at the press moved the shorter way round to `asked`, so a search from the press goes the way the hand went. */
export const aroundFrom = (start: number, asked: number, length: number): number => start + mod(asked - start + length / 2, length) - length / 2

/**
 * The value a drag settles on: the one asked for when it fits; else, between
 * the value at the press and the one asked for, the farthest toward the ask
 * that fits, found by halving to within `resolution`. The values that fit
 * are taken to run on from the press as one stretch, as a gap does up to
 * where chairs meet the table, or a chair along its track up to its
 * neighbour.
 */
export function settle(start: number, asked: number, fits: (x: number) => boolean, resolution: number): number {
  if (fits(asked)) return asked
  let [lo, hi] = [start, asked]
  while (Math.abs(hi - lo) > resolution) {
    const mid = (lo + hi) / 2
    if (fits(mid)) lo = mid
    else hi = mid
  }
  return lo
}
