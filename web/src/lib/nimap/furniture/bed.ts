import type { Polygon, Ring, Vec2 } from '../geometry/vector'
import { add, mul, perpendicular } from '../geometry/vector'
import { difference, intersection, offset } from '../geometry/clip'
import type { Line } from '../model/types'
import { overlapArea, polygonArea } from '../geometry/overlap'
import type { Part, Transform } from './parts'
import { applyTransform, boxPart, facing, prismPart, transformParts } from './parts'
import type { Chain } from './outline'
import { along, band, chains, chordRing, lengthOf, ringOf, ringsOf } from './outline'

/** One edge of a bed's outline: a line of the trace, and whether the head of the bed is along it. */
export interface BedEdge extends Line {
  head?: boolean
}

export interface BedResult {
  /** The outline as the recipe read it: chords, counter-clockwise. */
  outline: Ring
  parts: Part[]
}

const PLINTH_INSET = 0.06
const PLINTH_HEIGHT = 0.1
const FRAME_TOP = 0.3
const MATTRESS_TOP = 0.5
const DUVET_THICKNESS = 0.03
const HEADBOARD_DEPTH = 0.08
const HEADBOARD_TOP = 0.95
/** How far in from the head edges the duvet stops, leaving the pillows on the mattress. */
const PILLOW_ZONE = 0.5
const PILLOW = { depth: 0.34, height: 0.1, width: 0.7, pitch: 0.75, gap: 0.12, least: 0.3 }

/**
 * Pillows along a chain of head edges on the mattress, lying just clear of
 * the headboard: as many as fit a pitch along the head, each as wide as
 * its share allows and narrowed until its footprint stands a gap apart
 * from its neighbours, since a head that curves round the bed leaves less
 * room at the pillows' far edge than along itself. A pillow that would
 * leave the bed is left out, and a pillow narrower than the least is not
 * made.
 */
function pillows(chain: Chain, bed: Polygon): Part[] {
  const length = lengthOf(chain)
  for (let count = Math.max(1, Math.floor(length / PILLOW.pitch)); count > 0; count--) {
    const spots = Array.from({ length: count }, (_, j) => {
      const { p, tangent } = along(chain.points, chain.closed, (length * (j + (chain.closed ? 0 : 0.5))) / count)
      const inward = perpendicular(tangent)
      return facing(add(p, mul(inward, HEADBOARD_DEPTH + 0.04 + PILLOW.depth / 2)), inward, MATTRESS_TOP)
    })
    const footprint = (at: Transform, width: number): Polygon => ({
      outer: [[-width / 2, -PILLOW.depth / 2], [width / 2, -PILLOW.depth / 2], [width / 2, PILLOW.depth / 2], [-width / 2, PILLOW.depth / 2]].map(c => applyTransform(at, [c[0], c[1], 0]).slice(0, 2) as Vec2),
      holes: []
    })
    const apart = (width: number) => spots.every((at, j) => (j === 0 && !chain.closed) || count === 1 || overlapArea(footprint(spots[(j - 1 + count) % count], width + PILLOW.gap), footprint(at, width + PILLOW.gap)) < 1e-9)
    let width = Math.min(PILLOW.width, length / count - PILLOW.gap)
    if (!apart(width)) {
      let lo = 0
      for (let i = 0; i < 20; i++) {
        const mid = (lo + width) / 2
        if (apart(mid)) lo = mid
        else width = mid
      }
      width = lo
    }
    if (width < PILLOW.least) continue
    const fitting = spots.filter(at => polygonArea(footprint(at, width)) - overlapArea(footprint(at, width), bed) < 1e-9)
    return fitting.map(at => transformParts([boxPart([width, PILLOW.depth, PILLOW.height], 'linen')], at)[0])
  }
  return []
}

/**
 * A bed from its traced outline: a frame on a plinth set in from its
 * edges, a headboard along the head edges, the mattress on the frame,
 * pillows at the head and a duvet over the rest. The outline holds the
 * size, so a single, a double and a bed of any shape are one recipe.
 */
export function bed(input: BedEdge[]): BedResult {
  const edges = ringOf(input)
  const outline = chordRing(edges)
  const heads = chains(edges, i => !!edges[i].head)
  const clear = (depth: number) => (heads.length ? intersection(ringsOf(difference([outline], band(heads, depth))), [outline]) : [{ outer: outline, holes: [] }])
  const plinth = offset([outline], -PLINTH_INSET)
  const frameFrom = plinth.length ? PLINTH_HEIGHT : 0
  return {
    outline,
    parts: [
      ...plinth.map(outer => prismPart({ outer, holes: [] }, 0, PLINTH_HEIGHT, 'furnitureDark', 'support')),
      prismPart({ outer: outline, holes: [] }, frameFrom, FRAME_TOP - frameFrom, 'furniture'),
      ...(heads.length ? intersection(band(heads, HEADBOARD_DEPTH), [outline]) : []).map(p => prismPart(p, FRAME_TOP, HEADBOARD_TOP - FRAME_TOP, 'sofa', 'back')),
      ...clear(HEADBOARD_DEPTH).map(p => prismPart(p, FRAME_TOP, MATTRESS_TOP - FRAME_TOP, 'linen', 'body')),
      ...clear(PILLOW_ZONE).map(p => prismPart(p, MATTRESS_TOP, DUVET_THICKNESS, 'sofa', 'top')),
      ...heads.flatMap(chain => pillows(chain, { outer: outline, holes: [] }))
    ]
  }
}

/** Straight edges round a polygon, the head along the listed indices. */
export function bedEdges(points: Vec2[], head: number[], prefix = 'e'): BedEdge[] {
  return points.map((p, i) => ({ id: `${prefix}${i}`, points: [p, points[(i + 1) % points.length]], head: head.includes(i) }))
}
