import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { buildSolids, wallPrimitives, wallTopology, wallsFromSvg, signedArea, triangulate, pointInRing, pointInPolygon, polygonArea, COINCIDENT_WALLS_WARNING, BEVEL_WARNING } from '$lib/nimap'
import { difference } from '$lib/nimap/geometry/clip'
import type { Wall, Vec2 } from '$lib/nimap'

const wall = (id: string, a: Vec2, b: Vec2, width = 0.2): Wall => ({ id, points: [a, b], width })
const rect = (x: number, y: number, w: number, h: number, prefix = 'w'): Wall[] =>
  ([[[x, y], [x + w, y]], [[x + w, y], [x + w, y + h]], [[x + w, y + h], [x, y + h]], [[x, y + h], [x, y]]] as [Vec2, Vec2][]).map(([a, b], i) => wall(prefix + i, a, b))

function check(walls: Wall[]) {
  const topology = wallTopology(walls)
  const solid = buildSolids(walls)
  let total = 0
  for (const cell of solid.cells) {
    expect(cell.netArea).toBeGreaterThan(0)
    let area = 0
    for (const t of triangulate({ outer: cell.points, holes: cell.holes })) area += Math.abs(signedArea(t))
    expect(area).toBeCloseTo(cell.netArea, 6)
    total += area
  }
  expect(Math.abs(total - solid.area)).toBeLessThan(1e-6 * Math.max(1, solid.cells.length))
  const balance = new Map<string, number>()
  for (const e of solid.boundary) {
    for (const [p, delta] of [[e.a, 1], [e.b, -1]] as [Vec2, number][]) {
      const k = p.join(',')
      balance.set(k, (balance.get(k) ?? 0) + delta)
    }
  }
  for (const n of balance.values()) expect(n).toBe(0)
  return { topology, solid }
}

const reference = readFileSync(new URL('../fixtures/reference.svg', import.meta.url), 'utf8')

describe('wall solids', () => {
  it('straight wall is a rectangle of length times width', () => {
    const r = check([wall('w1', [0, 0], [3, 0])])
    expect(r.solid.area).toBeCloseTo(0.6, 4)
    expect(r.topology.faces.length).toBe(0)
    expect(r.solid.warnings).toEqual([])
  })

  it('corner join is mitered without double counting', () => {
    expect(check([wall('w1', [0, 0], [3, 0]), wall('w2', [0, 0], [0, 3])]).solid.area).toBeCloseTo(1.2, 4)
  })

  it('crossing walls of different widths node into four edges', () => {
    const r = check([wall('w1', [-2, 0], [2, 0], 0.3), wall('w2', [0, -2], [0, 2], 0.1)])
    expect(r.solid.area).toBeCloseTo(1.57, 4)
    expect(r.topology.edges.length).toBe(4)
  })

  it('a divider splits a room; removing it merges again', () => {
    const two = [...rect(0, 0, 4, 3), wall('divider', [2, 0], [2, 3], 0.1)]
    expect(check(two).topology.faces.length).toBe(2)
    expect(check(two.slice(0, 4)).topology.faces.length).toBe(1)
  })

  it('nested rooms and a dangling stub', () => {
    const r = check([...rect(0, 0, 5, 5), ...rect(1, 1, 3, 3, 'i'), ...rect(2, 2, 1, 1, 'j'), wall('dangling', [2.5, 5], [2.5, 4.5])])
    expect(r.topology.faces.length).toBe(3)
    expect(r.topology.faces.reduce((s, f) => s + f.netArea, 0)).toBeCloseTo(25, 6)
    expect(r.topology.bridges.size).toBe(1)
  })

  it('coincident strokes merge with a warning', () => {
    const r = check([wall('w1', [0, 0], [3, 0]), wall('w2', [1, 0], [4, 0])])
    expect(r.solid.area).toBeCloseTo(0.8, 4)
    expect(r.solid.warnings).toContain(COINCIDENT_WALLS_WARNING)
  })

  it('two close parallel walls crossing a third', () => {
    const r = check([wall('w1', [-2, 0], [2, 0], 0.28), wall('w2', [-0.12, -1.5], [-0.12, 1.5], 0.3), wall('w3', [0.12, -1.5], [0.12, 1.5], 0.3)])
    expect(r.solid.area).toBeCloseTo(4 * 0.28 + 3 * 0.54 - 0.28 * 0.54, 4)
  })

  it('acute joins bevel past the miter limit', () => {
    expect(check([wall('w1', [0, 0], [3, 0], 0.18), wall('w2', [0, 0], [3, 0.5], 0.18)]).solid.warnings).toContain(BEVEL_WARNING)
  })

  it('angle and width matrix', () => {
    for (const angle of [10, 30, 75, 90, 135, 175]) {
      for (const width of [0.02, 0.16, 0.5]) {
        const a = (angle * Math.PI) / 180
        check([wall('w1', [0, 0], [2, 0], 0.3), wall('w2', [0, 0], [2 * Math.cos(a), 2 * Math.sin(a)], width)])
      }
    }
  })

  it('five-way junction with mixed widths', () => {
    check(Array.from({ length: 5 }, (_, i) => {
      const a = (i * 2 * Math.PI) / 5
      return wall('w' + i, [0, 0], [2 * Math.cos(a), 2 * Math.sin(a)], 0.06 + i * 0.05)
    }))
  })

  it('reference floorplan baseline: 292 strokes as 488 walls, 64 rooms, 41 components', () => {
    const walls = wallsFromSvg(reference, { scale: 0.01, width: 0.06 })
    expect(walls.length).toBe(488)
    const r = check(walls)
    expect(r.topology.faces.length).toBe(64)
    expect(r.topology.components).toBe(41)
    for (const width of [0.02, 0.12, 0.3]) check(walls.map(w => ({ ...w, width })))
    check(walls.map((w, i) => ({ ...w, width: [0.04, 0.12, 0.3][i % 3] })))
  })

  it('float32-scale drag perturbations keep topology and closure', () => {
    const office = [
      ...rect(0, 0, 10, 7).map(w => ({ ...w, width: 0.24 })),
      wall('split', [0, 3], [10, 3], 0.16),
      wall('middle', [5, 0], [5, 3], 0.16),
      wall('partition', [7.6, 4.6], [10, 4.599999904632568], 0.16)
    ]
    check(office)
    for (const dy of [-1e-5, -1e-6, -1e-7, -1e-8, 0, 1e-8, 1e-7, 1e-6, 1e-5]) {
      const sample = structuredClone(office)
      sample[sample.length - 1].points[1][1] = 4.6 + dy
      check(sample)
    }
  })

  it('a microscopic join keeps the whole wall cap', () => {
    const walls: Wall[] = [
      { id: 'wall-0', points: [[39.03378671929033, 2.045058835561857], [33.33854424, 1.87333498]], width: 0.16 },
      { id: 'wall-1', points: [[33.33854424, 1.87333498], [29.185461629195174, 1.7481105680634967]], width: 0.16 },
      { id: 'wall-2', points: [[39.03378672, 2.04505884], [38.05655588, 6.82347]], width: 0.16 }
    ]
    const midpoint: Vec2 = [(walls[0].points[0][0] + walls[0].points[1][0]) / 2, (walls[0].points[0][1] + walls[0].points[1][1]) / 2]
    for (const delta of [-1e-8, 0, 1e-8]) {
      const n = structuredClone(walls)
      n[1].points[0][0] += delta
      const solid = buildSolids(n)
      expect(solid.cells.some(c => pointInRing(midpoint, c.points))).toBe(true)
      expect(solid.cells.filter(c => c.members.includes('wall-0')).reduce((s, c) => s + c.netArea, 0)).toBeGreaterThan(0.91)
    }
  })

  it('empty input yields an empty solid', () => {
    const solid = buildSolids([])
    expect(solid.cells).toEqual([])
    expect(solid.area).toBe(0)
  })

  it('a thick and a thin wall at an obtuse join leave no hole and no notch', () => {
    const walls: Wall[] = [wall('thick', [0, 0], [0.05, -1.2], 0.5), wall('thin', [0, 0], [2.4, 2.1], 0.16)]
    const solid = buildSolids(walls)
    const primitives = wallPrimitives(walls).polygons
    const intended = difference(primitives.filter(p => !p.cuts).map(p => p.points), primitives.filter(p => p.cuts).map(p => p.points)).reduce((s, p) => s + polygonArea(p), 0)
    expect(Math.abs(solid.area - intended)).toBeLessThan(1e-4)
    const covered = (p: Vec2) => solid.cells.some(c => pointInPolygon(p, { outer: c.points, holes: c.holes }))
    expect(covered([-0.06, 0.018])).toBe(true)
    expect(covered([0.03, -0.03])).toBe(true)
  })

  it('two walls of different widths miter along the line through both face intersections', () => {
    const walls: Wall[] = [wall('thick', [0, 0], [0.05, -1.2], 0.5), wall('thin', [0, 0], [2.4, 2.1], 0.16)]
    const solid = buildSolids(walls)
    const covered = (p: Vec2) => solid.cells.some(c => pointInPolygon(p, { outer: c.points, holes: c.holes }))
    expect(covered([-0.06, 0.018])).toBe(true)
    expect(covered([-0.2, -0.02])).toBe(false)
    expect(covered([0.22, 0.05])).toBe(true)
    expect(wallPrimitives(walls).polygons.filter(p => p.cuts).length).toBe(1)
  })

  it('a thin wall leaving a thick one at a shallow angle: the thick wall rises to the apex and loses the corner beyond the thin face', () => {
    const walls: Wall[] = [wall('thick', [0, 0], [0, -2], 0.5), wall('thin', [0, 0], [0.6, -1.4], 0.16)]
    const solid = buildSolids(walls)
    const covered = (p: Vec2) => solid.cells.some(c => pointInPolygon(p, { outer: c.points, holes: c.holes }))
    expect(covered([-0.1, 0.1])).toBe(true)
    expect(covered([0.22, -0.1])).toBe(false)
    expect(covered([0.1, -0.05])).toBe(true)
  })

  it('an L corner with unequal widths miters with no leftover cap', () => {
    const walls: Wall[] = [wall('thick', [0, 0], [0, -2], 0.5), wall('thin', [0, 0], [2, 0], 0.16)]
    const solid = buildSolids(walls)
    const covered = (p: Vec2) => solid.cells.some(c => pointInPolygon(p, { outer: c.points, holes: c.holes }))
    expect(covered([-0.2, 0.05])).toBe(true)
    expect(covered([-0.1, 0.1])).toBe(false)
    expect(wallPrimitives(walls).polygons.filter(p => p.cuts).length).toBe(0)
  })

  it('an acute V keeps both walls whole, bevels the outer spike and cuts nothing inside', () => {
    for (const widths of [[0.16, 0.16], [0.5, 0.16]] as const) {
      const walls: Wall[] = [wall('a', [0, 0], [0.1, 2], widths[0]), wall('b', [0, 0], [0.8, 1.9], widths[1])]
      const solid = buildSolids(walls)
      const covered = (p: Vec2) => solid.cells.some(c => pointInPolygon(p, { outer: c.points, holes: c.holes }))
      for (const w of walls) for (const t of [0.1, 0.5, 0.9]) expect(covered([w.points[0][0] + (w.points[1][0] - w.points[0][0]) * t, w.points[0][1] + (w.points[1][1] - w.points[0][1]) * t])).toBe(true)
      expect(solid.area).toBeGreaterThan(0.9 * walls.reduce((s, w) => s + w.width * Math.hypot(w.points[1][0] - w.points[0][0], w.points[1][1] - w.points[0][1]), 0) * 0.7)
      const lowest = Math.min(...solid.cells.flatMap(c => c.points.map(p => p[1])))
      expect(lowest).toBeGreaterThan(-4 * Math.max(...widths) / 2 - 1e-6)
    }
  })

  it('an arrowhead: two thin walls leaving a thick end both cut its corners and meet in a tip', () => {
    const walls: Wall[] = [wall('thick', [0, 0], [0, -2], 0.5), wall('left', [0, 0], [-0.6, -1.4], 0.16), wall('right', [0, 0], [0.6, -1.4], 0.16)]
    const solid = buildSolids(walls)
    const covered = (p: Vec2) => solid.cells.some(c => pointInPolygon(p, { outer: c.points, holes: c.holes }))
    expect(covered([0, 0.05])).toBe(true)
    expect(covered([0.22, -0.1])).toBe(false)
    expect(covered([-0.22, -0.1])).toBe(false)
    expect(covered([0, -0.3])).toBe(true)
    expect(wallPrimitives(walls).polygons.filter(p => p.cuts).length).toBe(2)
  })

  it('a Y of three equal angles has no outer corner and cuts nothing', () => {
    const walls: Wall[] = [wall('a', [0, 0], [0, 2], 0.3), wall('b', [0, 0], [1.732, -1], 0.16), wall('c', [0, 0], [-1.732, -1], 0.5)]
    const solid = buildSolids(walls)
    const covered = (p: Vec2) => solid.cells.some(c => pointInPolygon(p, { outer: c.points, holes: c.holes }))
    for (const w of walls) for (const t of [0.1, 0.5, 0.9]) expect(covered([w.points[1][0] * t, w.points[1][1] * t])).toBe(true)
    expect(wallPrimitives(walls).polygons.filter(p => p.cuts).length).toBe(0)
  })

  it('a thin wall passing over a thick end has the thick corners cut at any angle of its bend', () => {
    for (const right of [[0.9, 1.3], [1.2, 0.84]] as const) {
      const walls: Wall[] = [wall('thick', [0, 0], [0, -2], 0.5), wall('left', [0, 0], [-1.2, -1.5], 0.16), wall('right', [0, 0], [right[0], right[1]], 0.16)]
      const solid = buildSolids(walls)
      const covered = (p: Vec2) => solid.cells.some(c => pointInPolygon(p, { outer: c.points, holes: c.holes }))
      expect(covered([-0.2, -0.03])).toBe(false)
      expect(covered([0.22, -0.03])).toBe(true)
      expect(covered([0.2, 0.03])).toBe(true)
      expect(covered([0, -0.3])).toBe(true)
    }
  })

  it('a second thin wall leaving lower down does not take away the extension up to the first', () => {
    const walls: Wall[] = [wall('thick', [0, 0], [0.05, -1.2], 0.5), wall('up', [0, 0], [2.4, 2.1], 0.16), wall('down', [0, 0], [1.4, -1.4], 0.16)]
    const solid = buildSolids(walls)
    const covered = (p: Vec2) => solid.cells.some(c => pointInPolygon(p, { outer: c.points, holes: c.holes }))
    expect(covered([0.22, 0.05])).toBe(true)
    expect(covered([0.22, -0.05])).toBe(true)
    expect(covered([-0.2, -0.02])).toBe(false)
    expect(covered([-0.06, 0.018])).toBe(true)
  })
})
