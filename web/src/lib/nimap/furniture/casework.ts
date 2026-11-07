import type { Ring, Vec2 } from '../geometry/vector'
import { add, mul, perpendicular, sub } from '../geometry/vector'
import { difference, intersection } from '../geometry/clip'
import type { Line } from '../model/types'
import type { Part, PartMaterial } from './parts'
import { prismPart } from './parts'
import type { Chain } from './outline'
import { along, band, chains, chordRing, lengthOf, ringOf, ringsOf } from './outline'

/** One edge of casework's outline: a line of the trace, and whether it is a front, where the doors and drawers are, or a back, against the wall. */
export interface CaseworkEdge extends Line {
  front?: boolean
  back?: boolean
}

/**
 * One slice of casework between two heights above the floor: the outline,
 * as deep as `depth` in from the back edges (all of it when left out or
 * when no edge is a back), less `inset` in from the front edges. A band is
 * a solid block, or open at its fronts when it has `shelves`: a top and a
 * bottom board with that many shelves between them, a panel along its
 * backs and ends, and uprights dividing each front into bays. Stacked,
 * bands make a counter, a kitchen with a shallow band of cabinets high at
 * the back, open shelves, a storage rack or a reception desk; a height
 * with no band is empty.
 */
export interface CaseworkBand {
  from: number
  to: number
  depth?: number
  inset?: number
  material?: PartMaterial
  shelves?: number
}

export interface CaseworkOptions {
  bands?: CaseworkBand[]
}

export interface CaseworkResult {
  /** The outline as the recipe read it: chords, counter-clockwise. */
  outline: Ring
  parts: Part[]
}

/** How thick the boards and panels of an open band are. */
const PANEL = 0.02
/** About how wide a bay of an open band is between its uprights. */
const BAY = 0.9
/** Far enough that an upright crosses any outline from its front, to be cut back by the band. */
const REACH = 1000

/** A counter: a plinth set back under the fronts, a body, and a top. */
export const COUNTER_BANDS: CaseworkBand[] = [
  { from: 0, to: 0.1, inset: 0.06, material: 'furnitureDark' },
  { from: 0.1, to: 0.88, material: 'furniture' },
  { from: 0.88, to: 0.92, material: 'tableTop' }
]

/**
 * Casework from its traced outline: every band a block of its slice of the
 * outline, between its heights. The outline holds the depth in the plan,
 * so a run that is deeper in one place than another is traced that way,
 * and the bands hold what changes with height. Nothing here is a kitchen or
 * a shelf; a counter is the bands given when none are.
 */
export function casework(input: CaseworkEdge[], options: CaseworkOptions = {}): CaseworkResult {
  const edges = ringOf(input)
  const outline = chordRing(edges)
  const backs = chains(edges, i => !!edges[i].back)
  const fronts = chains(edges, i => !!edges[i].front)
  const ends = chains(edges, i => !edges[i].front && !edges[i].back)
  const clip = (rings: Ring[]) => intersection(rings, [outline])
  const parts = (options.bands ?? COUNTER_BANDS).flatMap(b => {
    if (!(b.to > b.from)) throw new Error(`A band must end above where it starts: ${b.from} to ${b.to}.`)
    const deep = b.depth !== undefined && backs.length ? band(backs, b.depth) : [outline]
    const slice = b.inset && fronts.length ? ringsOf(difference(deep, band(fronts, b.inset))) : deep
    const material = b.material ?? 'furniture'
    if (b.shelves === undefined) return clip(slice).map(p => prismPart(p, b.from, b.to - b.from, material))
    if (!(b.to - b.from > 2 * PANEL)) throw new Error(`An open band must be taller than its top and bottom boards: ${b.from} to ${b.to}.`)
    const levels = b.shelves + 1
    const boards = [b.from, ...Array.from({ length: b.shelves }, (_, k) => b.from + ((k + 1) * (b.to - b.from)) / levels - PANEL / 2), b.to - PANEL]
    const within = (rings: Ring[]) => (rings.length ? clip(ringsOf(intersection(slice, rings))) : [])
    const panels = [...within(band(backs, PANEL)), ...within(band(ends, PANEL)), ...within(uprights(fronts))]
    return [...boards.flatMap(z => clip(slice).map(p => prismPart(p, z, PANEL, material))), ...panels.map(p => prismPart(p, b.from + PANEL, b.to - b.from - 2 * PANEL, material))]
  })
  return { outline, parts }
}

/** Uprights dividing each run of fronts into bays of about `BAY`, each a panel reaching in square from its front. */
function uprights(fronts: Chain[]): Ring[] {
  return fronts.flatMap(chain => {
    const length = lengthOf(chain)
    const bays = Math.max(1, Math.round(length / BAY))
    return Array.from({ length: chain.closed ? bays : bays - 1 }, (_, k): Ring => {
      const { p, tangent } = along(chain.points, chain.closed, (length * (k + 1)) / bays)
      const half = mul(tangent, PANEL / 2)
      const far = mul(perpendicular(tangent), REACH)
      return [sub(p, half), add(p, half), add(add(p, half), far), add(sub(p, half), far)]
    })
  })
}

/** Straight edges round a polygon, the fronts and backs on the listed indices. */
export function caseworkEdges(points: Vec2[], roles: { front?: number[]; back?: number[] }, prefix = 'e'): CaseworkEdge[] {
  return points.map((p, i) => ({ id: `${prefix}${i}`, points: [p, points[(i + 1) % points.length]], front: !!roles.front?.includes(i), back: !!roles.back?.includes(i) }))
}
