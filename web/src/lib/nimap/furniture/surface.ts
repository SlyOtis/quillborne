import type { Polygon, Ring, Vec2 } from '../geometry/vector'
import { add, mul, normalize, pointInPolygon, signedArea, sub } from '../geometry/vector'
import type { Fixture, Line, SurfaceItem } from '../model/types'
import { DEFAULT_FIXTURE_HEIGHT } from '../model/categories'
import { applyTransform, facing, type Part } from './parts'
import { partsExtent } from './mesh'
import { placeItem, STOCK_ITEMS, type StockKind } from './items'
import { TABLE_HEIGHT } from './table'

/** The stock items a hand may stand on a top. */
export const TOP_ITEMS = ['monitor', 'coffeeMachine', 'microwave', 'kettle', 'sink', 'hob', 'basin', 'binOpening'] as const satisfies readonly StockKind[]

/** A fixture's own frame: from the middle of its outline's area, along its first line by id and out to the left of it; what moves and turns with the fixture. */
export interface SurfaceFrame {
  origin: Vec2
  along: Vec2
  out: Vec2
}

function areaMiddle(ring: Ring): Vec2 {
  const a = signedArea(ring)
  if (!a) return mul(ring.reduce((s, p) => add(s, p), [0, 0] as Vec2), 1 / ring.length)
  let x = 0
  let y = 0
  for (let i = 0; i < ring.length; i++) {
    const [p, q] = [ring[i], ring[(i + 1) % ring.length]]
    const c = p[0] * q[1] - q[0] * p[1]
    x += (p[0] + q[0]) * c
    y += (p[1] + q[1]) * c
  }
  return [x / (6 * a), y / (6 * a)]
}

export function surfaceFrame(fixture: Fixture, lines: Line[]): SurfaceFrame | null {
  if (!fixture.polygon) return null
  const own = new Set(fixture.signature.split('|'))
  const first = lines.filter(l => own.has(l.id)).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))[0]
  const along = first ? normalize(sub(first.points[1], first.points[0])) : ([1, 0] as Vec2)
  return { origin: areaMiddle(fixture.polygon.outer), along, out: [-along[1], along[0]] }
}

/** A point of the frame in level space, and back. */
export const fromFrame = (frame: SurfaceFrame, p: Vec2): Vec2 => add(frame.origin, add(mul(frame.along, p[0]), mul(frame.out, p[1])))
export const toFrame = (frame: SurfaceFrame, p: Vec2): Vec2 => {
  const d = sub(p, frame.origin)
  return [d[0] * frame.along[0] + d[1] * frame.along[1], d[0] * frame.out[0] + d[1] * frame.out[1]]
}
const directionFrom = (frame: SurfaceFrame, d: Vec2): Vec2 => normalize(add(mul(frame.along, d[0]), mul(frame.out, d[1])))

const known = (item: string): item is StockKind => Object.prototype.hasOwnProperty.call(STOCK_ITEMS, item)

/** Where each item a fixture holds stands in level space, which way it faces and how high: those whose stock item this reader knows. */
export function surfacePlacements(fixture: Fixture, lines: Line[]): { item: SurfaceItem; kind: StockKind; at: Vec2; front: Vec2; elevation: number }[] {
  const frame = surfaceFrame(fixture, lines)
  if (!frame || !fixture.items?.length) return []
  const elevation = fixture.height ?? (fixture.kind === 'table' ? TABLE_HEIGHT : DEFAULT_FIXTURE_HEIGHT)
  return fixture.items.filter(i => known(i.item)).map(item => ({ item, kind: item.item as StockKind, at: fromFrame(frame, item.at), front: directionFrom(frame, item.facing), elevation }))
}

/** The parts of the items a fixture holds. */
export const surfaceItemParts = (fixture: Fixture, lines: Line[]): Part[] => surfacePlacements(fixture, lines).flatMap(p => placeItem(p.kind, p.at, p.front, p.elevation))

/** An item's outline from above where it stands. */
export function itemFootprint(kind: StockKind, at: Vec2, front: Vec2): Ring {
  const { min, max } = partsExtent(STOCK_ITEMS[kind].parts)
  const t = facing(at, front)
  return ([[min[0], min[1]], [max[0], min[1]], [max[0], max[1]], [min[0], max[1]]] as Vec2[]).map(c => applyTransform(t, [c[0], c[1], 0]).slice(0, 2) as Vec2)
}

/** Whether an item stands wholly on the fixture's top. */
export const standsOn = (top: Polygon, footprint: Ring): boolean => footprint.every(p => pointInPolygon(p, top))
