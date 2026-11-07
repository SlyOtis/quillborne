import type { Polygon, Ring } from '../geometry/vector'
import { pointInPolygon, pointInRing, signedArea } from '../geometry/vector'
import type { Vec2 } from '../geometry/vector'
import { lineChords } from './lines'
import { MIN_FEATURE } from './precision'
import { difference, union } from '../geometry/clip'
import type { Level, Unit, Wall } from './types'
import { arrangement } from '../geometry/arrangement'
import { wallSegments } from '../geometry/walls'
import type { LineLike } from '../geometry/walls'

/**
 * The floor a set of walls stands on: the outer ring of every bridgeless
 * block of the wall graph, minus rings that lie inside another, since a
 * room drawn inside a room is floor already. Counter-clockwise rings on
 * the centrelines; a slab drawn from one is later inset or grown by the
 * host as its look requires. Voids (courtyards, open to below) are the
 * level's stored floors, not derived here.
 */
export function floorOutlines(walls: LineLike[]): Ring[] {
  if (!walls.length) return []
  const rings = arrangement(wallSegments(walls)).outerRings
  return rings.filter(ring => !rings.some(other => other !== ring && pointInRing(ring[0], other)))
}

const ccw = (ring: Ring): Ring => (signedArea(ring) < 0 ? [...ring].reverse() : ring)
const cw = (ring: Ring): Ring => (signedArea(ring) > 0 ? [...ring].reverse() : ring)
const rings = (units: Unit[]): Ring[] => units.flatMap(u => [ccw(u.polygon.outer), ...u.polygon.holes.map(cw)])

/**
 * What a region of the wall layer is to the level: inside it, outside it (a
 * hole in the building's outline, such as a courtyard), or inside it and
 * open to the level below (an atrium, a stairwell), which IMDF calls the
 * category `opentobelow`.
 */
export type Ground = 'inside' | 'outside' | 'open'

export const groundOf = (unit: Pick<Unit, 'category' | 'outside'>): Ground => (unit.outside ? 'outside' : unit.category === 'opentobelow' ? 'open' : 'inside')

/**
 * The level on the walls' centrelines: its outline (the outer rings less
 * the regions outside it, so a courtyard is a hole, as in a building's
 * footprint), its floor (the outline less the regions open to below), and
 * those open regions. Holes of any shape come from the regions, traced with
 * walls or with lines of no width.
 */
export function levelGround(level: Pick<Level, 'walls' | 'units'>): { outline: Polygon[]; floor: Polygon[]; open: Polygon[] } {
  const outer = floorOutlines(level.walls).map(ccw)
  const outside = level.units.filter(u => groundOf(u) === 'outside')
  const open = level.units.filter(u => groundOf(u) === 'open')
  const outline = outer.length ? difference(outer, rings(outside)) : []
  return {
    outline,
    floor: outline.length ? difference(outline.flatMap(p => [ccw(p.outer), ...p.holes.map(cw)]), rings(open)) : [],
    open: open.length ? union(rings(open)) : []
  }
}

/** The point halfway along a line's chords and the direction it runs there. */
function middleAndDirection(line: Wall): { at: Vec2; along: Vec2 } | null {
  const chords = lineChords(line)
  const lengths = chords.slice(1).map((p, i) => Math.hypot(p[0] - chords[i][0], p[1] - chords[i][1]))
  let left = lengths.reduce((a, b) => a + b, 0) / 2
  for (let i = 0; i < lengths.length; i++) {
    if (left > lengths[i] && i < lengths.length - 1) {
      left -= lengths[i]
      continue
    }
    if (!lengths[i]) return null
    const [a, b] = [chords[i], chords[i + 1]]
    const along: Vec2 = [(b[0] - a[0]) / lengths[i], (b[1] - a[1]) / lengths[i]]
    return { at: [a[0] + along[0] * left, a[1] + along[1] * left], along }
  }
  return null
}

/**
 * The walls on the level's outline: those with the level on one side and
 * not the other, so a courtyard's walls are exterior too. A wall with the
 * level on both sides, or on neither (a free-standing wall outside), is not.
 */
export function exteriorWalls(level: Pick<Level, 'walls' | 'units'>): Set<string> {
  const { outline } = levelGround(level)
  const inside = (p: Vec2) => outline.some(polygon => pointInPolygon(p, polygon))
  return new Set(
    level.walls
      .filter(wall => {
        const middle = middleAndDirection(wall)
        if (!middle) return false
        const { at, along } = middle
        const left = inside([at[0] - along[1] * MIN_FEATURE, at[1] + along[0] * MIN_FEATURE])
        const right = inside([at[0] + along[1] * MIN_FEATURE, at[1] - along[0] * MIN_FEATURE])
        return left !== right
      })
      .map(wall => wall.id)
  )
}
