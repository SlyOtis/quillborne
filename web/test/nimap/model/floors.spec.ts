import { describe, it, expect } from 'vitest'
import { floorOutlines, signedArea, arrangement, wallSegments, levelGround, createEditorStore, createLevel, pointInPolygon, buildSolids, wallRuns, fixtureParts, declaredHoles, exteriorWalls } from '$lib/nimap'
import type { Wall, Level, Unit, Line, Fixture, Polygon } from '$lib/nimap'

const wall = (id: string, points: [[number, number], [number, number]], width = 0.16): Wall => ({ id, points, width })
const square = (prefix: string, x: number, y: number, size: number): Wall[] => {
  const c: [number, number][] = [[x, y], [x + size, y], [x + size, y + size], [x, y + size]]
  return c.map((p, i) => wall(`${prefix}${i}`, [p, c[(i + 1) % 4]]))
}

describe('floor outlines', () => {
  it('every bridgeless block yields one counter-clockwise outer ring, whatever hangs off it', () => {
    const plans: Wall[][] = [
      square('a', 0, 0, 4),
      [...square('a', 0, 0, 4), wall('stub', [[4, 2], [6, 2]])],
      [...square('a', 0, 0, 4), ...square('b', 4, 0, 4), ...square('c', 0, 4, 4)],
      [...square('a', 0, 0, 4), wall('divider', [[2, 0], [2, 4]])]
    ]
    for (const walls of plans) {
      const rings = arrangement(wallSegments(walls)).outerRings
      expect(rings.length, walls.length.toString()).toBe(1)
      expect(signedArea(rings[0])).toBeGreaterThan(0)
      expect(rings[0].some(p => p[0] === 6)).toBe(false)
    }
    expect(floorOutlines(square('a', 0, 0, 4))[0].length).toBe(4)
    expect(signedArea(floorOutlines([...square('a', 0, 0, 4), ...square('b', 4, 0, 4), ...square('c', 0, 4, 4)])[0])).toBeCloseTo(48, 6)
  })

  it('separate pieces each get a floor, a piece inside another does not, and two rooms joined by one wall are two floors', () => {
    const apart = [...square('a', 0, 0, 4), ...square('b', 10, 0, 4)]
    expect(floorOutlines(apart).length).toBe(2)
    const nested = [...square('a', 0, 0, 10), ...square('b', 3, 3, 2)]
    const rings = floorOutlines(nested)
    expect(rings.length).toBe(1)
    expect(signedArea(rings[0])).toBeCloseTo(100, 6)
    const bridged = [...square('a', 0, 0, 4), ...square('b', 6, 0, 4), wall('link', [[4, 2], [6, 2]])]
    expect(floorOutlines(bridged).length).toBe(2)
    expect(floorOutlines([])).toEqual([])
  })
})

describe('the ground of a level', () => {
  const area = (polygons: Polygon[]) => polygons.reduce((s, p) => s + Math.abs(signedArea(p.outer)) - p.holes.reduce((h, r) => h + Math.abs(signedArea(r)), 0), 0)
  const settled = (walls: Wall[]) => createEditorStore(createLevel({ name: 'L', walls })).level
  const regionAt = (level: Level, p: [number, number]) => level.units.find(u => pointInPolygon(p, u.polygon))!

  it('a line of no width bounds a region like a wall, stands no solid and carries no opening', () => {
    const balcony = [wall('e1', [[4, 1], [6, 1]], 0), wall('e2', [[6, 1], [6, 3]], 0), wall('e3', [[6, 3], [4, 3]], 0)]
    const level = settled([...square('a', 0, 0, 4), ...balcony])
    const edges = new Set(level.walls.filter(w => w.width === 0).map(w => w.id))
    expect(edges.size).toBe(3)
    expect(level.units.length).toBe(2)
    expect(buildSolids(level.walls).cells.every(c => !edges.has(c.owner) && c.members.every(m => !edges.has(m)))).toBe(true)
    expect(wallRuns(level.walls).every(r => r.pieces.every(p => !edges.has(p.wall.id)))).toBe(true)
    expect(area(levelGround(level).floor)).toBeCloseTo(16 + 4, 6)
  })

  it('a region outside is a hole in the level’s outline and has no floor, one open to below is in the outline with no floor, whether walls or edges bound it and however deep it nests', () => {
    for (const width of [0.16, 0]) {
      const level = settled([...square('a', 0, 0, 10), ...square('b', 4, 4, 2).map(w => ({ ...w, width })), ...square('c', 4.5, 4.5, 1)])
      const courtyard = regionAt(level, [4.2, 4.2])
      const declare = (patch: Partial<Unit>) => ({ ...level, units: level.units.map(u => (u.id === courtyard.id ? { ...u, ...patch } : u)) })
      const inside = levelGround(level)
      expect(area(inside.outline), `${width}`).toBeCloseTo(100, 6)
      expect(area(inside.floor), `${width}`).toBeCloseTo(100, 6)
      const outside = levelGround(declare({ outside: true }))
      expect(area(outside.outline), `${width}`).toBeCloseTo(100 - 4 + 1, 6)
      expect(area(outside.floor), `${width}`).toBeCloseTo(100 - 4 + 1, 6)
      expect(outside.floor.some(p => pointInPolygon([5, 5], p)), 'the kiosk in the courtyard keeps its floor').toBe(true)
      const open = levelGround(declare({ category: 'opentobelow' }))
      expect(area(open.outline), `${width}`).toBeCloseTo(100, 6)
      expect(area(open.floor), `${width}`).toBeCloseTo(100 - 4 + 1, 6)
      expect(area(open.open), `${width}`).toBeCloseTo(3, 6)
    }
  })

  it('outside is kept through an edit that moves the region’s walls', () => {
    const store = createEditorStore(createLevel({ name: 'L', walls: [...square('a', 0, 0, 10), ...square('b', 4, 4, 2)] }))
    const courtyard = regionAt(store.level, [5, 5])
    store.commit('Outside', [{ type: 'setUnit', unitId: courtyard.id, patch: { outside: true } }])
    const node = store.level.walls.find(w => w.id === 'b0')!.points[0]
    store.commit('Move', [{ type: 'moveNodes', moves: [{ from: node, to: [3.5, 3.5] }] }])
    expect(regionAt(store.level, [5, 5]).outside).toBe(true)
  })

  it('a table’s top leaves out a ring inside it only where what fills the ring is declared a hole', () => {
    const ring = (prefix: string, x: number, y: number, size: number): Line[] => square(prefix, x, y, size).map(({ id, points }) => ({ id, points }))
    const store = createEditorStore(createLevel({ name: 'L', fixtureLines: [...ring('o', 0, 0, 2), ...ring('i', 0.8, 0.8, 0.4)] }))
    const outer = store.level.fixtures.find(f => f.polygon?.holes.length)!
    const inner = store.level.fixtures.find(f => f.id !== outer.id)!
    const topHoles = (innerKind: Fixture['kind']) => {
      store.commit('Kinds', [{ type: 'setFixture', fixtureId: outer.id, patch: { kind: 'table' } }, { type: 'setFixture', fixtureId: inner.id, patch: { kind: innerKind } }])
      const table = store.level.fixtures.find(f => f.id === outer.id)!
      const tops = fixtureParts(table, store.level.fixtureLines, store.level.fixtures)!.filter(p => p.shape.type === 'prism')
      return { declared: declaredHoles(table, store.level.fixtures).length, cut: tops.some(p => p.shape.type === 'prism' && p.shape.polygon.holes.length === 1) }
    }
    expect(topHoles('hole')).toEqual({ declared: 1, cut: true })
    expect(topHoles('object')).toEqual({ declared: 0, cut: false })
  })

  it('a wall is exterior when the level lies on one side of it only: the outline and a courtyard’s walls are, dividers, walls round a room inside, stubs and walls standing outside are not', () => {
    const walls = [...square('a', 0, 0, 10), ...square('c', 4, 4, 2), wall('divider', [[0, 2], [10, 2]]), wall('stub', [[1, 5], [2, 5]]), wall('outer stub', [[10, 5], [12, 5]]), wall('fence', [[14, 0], [14, 4]])]
    const plain = settled(walls)
    const courtyard = regionAt(plain, [5, 5])
    const yard: Level = { ...plain, units: plain.units.map(u => (u.id === courtyard.id ? { ...u, outside: true as const } : u)) }
    const at = (level: Level, p: [number, number]) => level.walls.find(w => pointInPolygon(p, { outer: [[w.points[0][0] - 0.01, w.points[0][1] - 0.01], [w.points[1][0] + 0.01, w.points[0][1] - 0.01], [w.points[1][0] + 0.01, w.points[1][1] + 0.01], [w.points[0][0] - 0.01, w.points[1][1] + 0.01]], holes: [] }))!.id
    const exterior = (level: Level) => (p: [number, number]) => exteriorWalls(level).has(at(level, p))
    for (const [level, courtyardOut] of [[plain, false], [yard, true]] as const) {
      const is = exterior(level)
      for (const p of [[5, 0], [0, 1], [0, 6], [10, 1], [10, 8], [5, 10]] as [number, number][]) expect(is(p), `${courtyardOut} ${p}`).toBe(true)
      for (const p of [[5, 2], [1.5, 5], [11, 5], [14, 2]] as [number, number][]) expect(is(p), `${courtyardOut} ${p}`).toBe(false)
      for (const p of [[5, 4], [6, 5], [5, 6], [4, 5]] as [number, number][]) expect(is(p), `${courtyardOut} ${p}`).toBe(courtyardOut)
    }
  })
})
