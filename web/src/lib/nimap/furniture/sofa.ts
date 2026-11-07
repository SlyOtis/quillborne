import type { Ring, Vec2 } from '../geometry/vector'
import { difference, intersection, offset } from '../geometry/clip'
import type { Line } from '../model/types'
import type { Part } from './parts'
import { prismPart } from './parts'
import { band, chains, chordRing, ringOf, ringsOf } from './outline'

/** One edge of a sofa's outline: a line of the trace, and whether the back stands along it. */
export interface SofaEdge extends Line {
  back?: boolean
}

export interface SofaOptions {
  /** How deep the back is, measured in from the back edges. */
  backDepth?: number
  /** How wide an arm is, measured in from its edge. */
  armWidth?: number
  /** Arms along every edge that ends a run of back; on unless turned off. */
  arms?: boolean
}

export interface SofaResult {
  /** The outline as the recipe read it: chords, counter-clockwise. */
  outline: Ring
  parts: Part[]
}

const DEFAULTS = { backDepth: 0.16, armWidth: 0.14 }
const PLINTH_INSET = 0.05
const PLINTH_HEIGHT = 0.06
const SEAT_HEIGHT = 0.4
const ARM_HEIGHT = 0.58
const BACK_HEIGHT = 0.72

/**
 * A sofa from its traced outline: a seat block of the whole outline on a
 * plinth set in from its edges, a back standing along the back edges as
 * deep as `backDepth`, mitred where they meet, and an arm along every edge
 * that ends a run of back. The outline holds the seat's depth, so a
 * straight sofa, an L, a U and a curve are one recipe, and a square with
 * one back edge is an armchair.
 */
export function sofa(input: SofaEdge[], options: SofaOptions = {}): SofaResult {
  const edges = ringOf(input)
  const outline = chordRing(edges)
  const n = edges.length
  const isBack = (i: number) => !!edges[i % n].back
  const isArm = (i: number) => (options.arms ?? true) && !isBack(i) && (isBack(i + n - 1) || isBack(i + 1))
  const backBand = band(chains(edges, isBack), options.backDepth ?? DEFAULTS.backDepth)
  const back = intersection(backBand, [outline])
  const arms = intersection(ringsOf(difference(band(chains(edges, isArm), options.armWidth ?? DEFAULTS.armWidth), backBand)), [outline])
  const plinth = offset([outline], -PLINTH_INSET)
  const seatFrom = plinth.length ? PLINTH_HEIGHT : 0
  return {
    outline,
    parts: [
      ...plinth.map(outer => prismPart({ outer, holes: [] }, 0, PLINTH_HEIGHT, 'furnitureDark', 'support')),
      prismPart({ outer: outline, holes: [] }, seatFrom, SEAT_HEIGHT - seatFrom, 'sofa', 'seat'),
      ...back.map(p => prismPart(p, SEAT_HEIGHT, BACK_HEIGHT - SEAT_HEIGHT, 'sofa', 'back')),
      ...arms.map(p => prismPart(p, SEAT_HEIGHT, ARM_HEIGHT - SEAT_HEIGHT, 'sofa', 'arm'))
    ]
  }
}

/** Straight edges round a polygon, the back along the listed indices. */
export function sofaEdges(points: Vec2[], back: number[], prefix = 'e'): SofaEdge[] {
  return points.map((p, i) => ({ id: `${prefix}${i}`, points: [p, points[(i + 1) % points.length]], back: back.includes(i) }))
}
