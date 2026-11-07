import { describe, it, expect } from 'vitest'
import { wallRuns, legalCentres, fitOnRun, fitOpening, hostOf, carryOpenings, hostedOpenings, openingCuts, openingGeometry, nearestArc, buildSolids, createLevel, createEditorStore, applyCommands, levelToSvg, ellipseLines, DEFAULT_OPENING } from '$lib/nimap'
import type { Wall, Opening, Vec2 } from '$lib/nimap'

const wall = (id: string, points: [[number, number], [number, number]], width = 0.2): Wall => ({ id, points, width })
const door = (id: string, at: Vec2, width = 0.9, band: Partial<Pick<Opening, 'from' | 'to'>> = {}): Opening => ({ id, kind: 'door', at, width, from: 0, to: 2.1, ...band })
const area = (walls: Wall[], openings: Opening[] = []) => buildSolids(walls, openingCuts(openings, walls)).area
const near = (intervals: [number, number][], expected: [number, number][]) => {
  expect(intervals.length).toBe(expected.length)
  intervals.forEach((iv, i) => {
    expect(iv[0]).toBeCloseTo(expected[i][0], 9)
    expect(iv[1]).toBeCloseTo(expected[i][1], 9)
  })
}

describe('runs: the straight stretches openings live on', () => {
  it('a seam between two collinear walls is inside one run; a corner ends it; a T is a node with the stem as other', () => {
    const seam = wallRuns([wall('a', [[0, 0], [2, 0]]), wall('b', [[2, 0], [4, 0]])])
    expect(seam.length).toBe(1)
    expect(seam[0].polyline.length).toBeCloseTo(4, 9)
    expect(seam[0].nodes.map(n => [n.s, n.others.length])).toEqual([[0, 0], [2, 0], [4, 0]])

    const corner = wallRuns([wall('a', [[0, 0], [4, 0]]), wall('b', [[4, 0], [4, 3]])])
    expect(corner.length).toBe(2)
    for (const run of corner) expect(run.nodes.filter(n => n.others.length === 1).length).toBe(1)

    const tee = wallRuns([wall('a', [[0, 0], [2, 0]]), wall('b', [[2, 0], [4, 0]]), wall('stem', [[2, 0], [2, 3]])])
    const through = tee.find(r => r.pieces.length === 2)!
    expect(through.nodes.find(n => n.s === 2)!.others.map(w => w.id)).toEqual(['stem'])
  })

  it('a run reads reversed pieces in one direction and a smooth ring is one closed run', () => {
    const backwards = wallRuns([wall('a', [[0, 0], [2, 0]]), wall('b', [[4, 0], [2, 0]])])
    expect(backwards.length).toBe(1)
    expect(backwards[0].pieces.map(p => p.reversed)).toEqual([false, true])
    const ellipse = wallRuns(ellipseLines([0, 0], [4, 2]).map(l => ({ ...l, width: 0.1 })))
    expect(ellipse.length).toBe(1)
    expect(ellipse[0].closed).toBe(true)
  })
})

describe('legal centres: an opening may start at a free end, never inside a crossing wall band or another opening of its band', () => {
  const stemAt = (x: number, width = 0.16) => wall('stem', [[x, 0], [x, 3]], width)

  it('a free end blocks nothing and a corner blocks half the crossing width', () => {
    const lone = [wall('a', [[0, 0], [4, 0]])]
    near(legalCentres(wallRuns(lone)[0], door('d', [0, 0]), [], wallRuns(lone)), [[0.45, 3.55]])
    const corner = [wall('a', [[0, 0], [4, 0]]), wall('b', [[4, 0], [4, 3]], 0.3)]
    const runs = wallRuns(corner)
    const run = runs.find(r => r.pieces[0].wall.id === 'a')!
    near(legalCentres(run, door('d', [0, 0]), [], runs), [[0.45, 3.4]])
  })

  it('a T blocks its band along the run, wider when it meets at a shallow angle, and the fitter goes to the nearer side', () => {
    for (const [x, width] of [[2, 0.16], [1, 0.4], [3.2, 0.1]] as const) {
      const walls = [wall('a', [[0, 0], [x, 0]]), wall('b', [[x, 0], [4, 0]]), stemAt(x, width)]
      const runs = wallRuns(walls)
      const run = runs.find(r => r.pieces.length === 2)!
      const centres = legalCentres(run, door('d', [0, 0]), [], runs)
      for (const [a, b] of centres) {
        expect(a - 0.45).toBeGreaterThanOrEqual(-1e-9)
        expect(b + 0.45 <= x - width / 2 + 1e-9 || a - 0.45 >= x + width / 2 - 1e-9).toBe(true)
      }
      const left = x - width / 2 - 0.45
      const right = x + width / 2 + 0.45
      const leftFits = x - width / 2 >= 0.9
      const rightFits = 4 - (x + width / 2) >= 0.9
      expect(fitOnRun(run, x + 0.02, door('d', [0, 0]), [], runs)).toBeCloseTo(rightFits ? right : left, 9)
      expect(fitOnRun(run, x - 0.02, door('d', [0, 0]), [], runs)).toBeCloseTo(leftFits ? left : right, 9)
    }
    const oblique = [wall('a', [[0, 0], [2, 0]]), wall('b', [[2, 0], [4, 0]]), wall('s', [[2, 0], [2 + 3 * Math.cos(Math.PI / 6), 3 * Math.sin(Math.PI / 6)]], 0.2)]
    const runs = wallRuns(oblique)
    const run = runs.find(r => r.pieces.length === 2)!
    const [, right] = legalCentres(run, door('d', [0, 0]), [], runs)
    expect(right[0]).toBeCloseTo(2 + 0.1 / Math.sin(Math.PI / 6) + 0.1 / Math.tan(Math.PI / 6) + 0.45, 6)
  })

  it('a bend blocks only the sliver of the next wall that dips into the run: half its width times the sine of the bend, for every angle', () => {
    const lastLegal = (deg: number) => {
      const a = (deg * Math.PI) / 180
      const walls = [wall('a', [[0, 0], [4, 0]]), wall('b', [[4, 0], [4 + 3 * Math.cos(a), 3 * Math.sin(a)]])]
      const runs = wallRuns(walls)
      const run = runs.find(r => r.pieces[0].wall.id === 'a')!
      const [[, last]] = legalCentres(run, door('d', [0, 0]), [], runs)
      return last
    }
    for (const deg of [5.5, 15, 30, 45, 60, 90]) expect(4 - 0.1 * Math.sin((deg * Math.PI) / 180) - 0.45).toBeCloseTo(lastLegal(deg), 6)
    for (const deg of [120, 150]) expect(lastLegal(deg)).toBeLessThan(lastLegal(90))
  })

  it('another opening blocks only when the bands overlap: a window over a door is legal', () => {
    const walls = [wall('a', [[0, 0], [6, 0]])]
    const runs = wallRuns(walls)
    const existing = door('x', [3, 0])
    near(legalCentres(runs[0], door('d', [0, 0]), [existing], runs), [[0.45, 2.1], [3.9, 5.55]])
    near(legalCentres(runs[0], { id: 'w', width: 1.2, from: 2.3, to: 2.9 }, [existing], runs), [[0.6, 5.4]])
    near(legalCentres(runs[0], existing, [existing], runs), [[0.45, 5.55]])
  })

  it('an opening wider than any free stretch fits nowhere', () => {
    const walls = [wall('a', [[0, 0], [0.5, 0]])]
    const runs = wallRuns(walls)
    expect(fitOnRun(runs[0], 0.25, door('d', [0, 0]), [], runs)).toBeNull()
    expect(fitOpening([0.25, 0.05], door('d', [0, 0]), walls, [], 0.3)).toBeNull()
  })

  it('the hand lands on the nearest run in reach, nudged legal, straddling a seam as if it were not there', () => {
    const walls = [wall('a', [[0, 0], [2, 0]]), wall('b', [[2, 0], [4, 0]]), wall('c', [[0, 3], [4, 3]])]
    for (const x of [0.1, 1.9, 2, 2.1, 3.9]) {
      const fit = fitOpening([x, 0.06], door('d', [0, 0]), walls, [], 0.2)!
      expect(fit.at[1]).toBe(0)
      expect(fit.at[0]).toBeCloseTo(Math.max(0.45, Math.min(3.55, x)), 6)
    }
    expect(fitOpening([2, 1.5], door('d', [0, 0]), walls, [], 0.2)).toBeNull()
    expect(fitOpening([2, 2.9], door('d', [0, 0]), walls, [], 0.2)!.at).toEqual([2, 3])
  })
})

describe('an opening keeps its place through what happens to its wall', () => {
  const at = (o: Opening[]) => o.map(x => x.at)

  it('moving the far end leaves it, moving the near end carries it, moving both takes it along, all from either end', () => {
    for (const [nearX, farX] of [[0, 4], [4, 0]] as const) {
      const before = [wall('a', [[nearX, 0], [farX, 0]])]
      const d = door('d', [nearX + Math.sign(farX - nearX) * 1, 0])
      const far = [wall('a', [[nearX, 0], [farX + Math.sign(farX - nearX) * 2, 0]])]
      expect(at(carryOpenings([d], before, far))).toEqual([d.at])
      const near = [wall('a', [[nearX - Math.sign(farX - nearX) * 2, 0], [farX, 0]])]
      expect(at(carryOpenings([d], before, near))).toEqual([[d.at[0] - Math.sign(farX - nearX) * 2, 0]])
      const both = [wall('a', [[nearX + 1, 5], [farX + 1, 5]])]
      expect(at(carryOpenings([d], before, both))).toEqual([[d.at[0] + 1, 5]])
    }
  })

  it('a rotated wall carries its opening round, and a wall turned about keeps the swing where it physically was', () => {
    const before = [wall('a', [[0, 0], [4, 0]])]
    const d = { ...door('d', [1, 0]), swing: { side: 1 as const, hinge: 0 as const } }
    const up = carryOpenings([d], before, [wall('a', [[0, 0], [0, 4]])])
    expect(up[0].at).toEqual([0, 1])
    expect(up[0].swing).toEqual({ side: 1, hinge: 0 })
    const turned = carryOpenings([d], before, [wall('a', [[4, 0], [0, 0]])])
    expect(turned[0].at).toEqual([3, 0])
    expect(turned[0].swing).toEqual({ side: -1, hinge: 1 })
    const leafBefore = openingGeometry(d, wallRuns(before))!.leaf!
    const leafAfter = openingGeometry(turned[0], wallRuns([wall('a', [[4, 0], [0, 0]])]))!.leaf!
    expect(leafAfter[0][0]).toBeCloseTo(4 - leafBefore[0][0], 9)
    expect(leafAfter[1][1]).toBeCloseTo(-leafBefore[1][1], 9)
  })

  it('survives a wall split under it, a split through it, and a heal of the seam; leaves with its wall', () => {
    const level = createLevel({ name: 'L', walls: [wall('a', [[0, 0], [4, 0]])], openings: [door('d', [1, 0]), door('e', [2, 0])] })
    const store = createEditorStore(level)
    store.commit('Cross', [{ type: 'addWall', wall: wall('b', [[2, 0], [2, 3]]) }])
    expect(store.level.walls.length).toBe(3)
    expect(at(store.level.openings)).toEqual([[1, 0], [2, 0]])
    expect(openingCuts(store.level.openings, store.level.walls).map(c => c.wallId).sort()).toEqual(['a', 'a', 'a.1'])
    store.commit('Remove stem', [{ type: 'removeLines', ids: ['b'] }])
    store.commit('Heal', [{ type: 'healNode', point: [2, 0] }])
    expect(store.level.walls.length).toBe(1)
    expect(at(store.level.openings)).toEqual([[1, 0], [2, 0]])
    store.commit('Remove host', [{ type: 'removeLines', ids: [store.level.walls[0].id] }])
    expect(store.level.openings).toEqual([])
  })

  it('is dropped only when no wall passes through its centre any more', () => {
    const walls = [wall('a', [[0, 0], [4, 0]])]
    expect(hostedOpenings([door('d', [2, 0]), door('e', [2, 0.005]), door('f', [2, 0.02])], walls).map(o => o.id)).toEqual(['d', 'e'])
    expect(hostOf(door('f', [2, 0.02]), wallRuns(walls))).toBeNull()
  })
})

describe('the cut: an opening removes exactly its stretch of its own wall and nothing of a junction', () => {
  it('a door mid-wall, across a seam, and hard against a corner each take width times wall width', () => {
    const lone = [wall('a', [[0, 0], [4, 0]])]
    expect(area(lone, [door('d', [2, 0])])).toBeCloseTo(area(lone) - 0.18, 9)
    const seam = [wall('a', [[0, 0], [2, 0]]), wall('b', [[2, 0], [4, 0]])]
    expect(area(seam, [door('d', [2, 0])])).toBeCloseTo(area(seam) - 0.18, 9)
    const corner = [wall('a', [[0, 0], [4, 0]]), wall('b', [[4, 0], [4, 3]])]
    const fit = fitOpening([3.9, -0.06], door('d', [0, 0]), corner, [], 0.2)!
    expect(fit.at[0]).toBeCloseTo(3.45, 9)
    expect(area(corner, [door('d', fit.at)])).toBeCloseTo(area(corner) - 0.18, 9)
    const solid = buildSolids(corner, openingCuts([door('d', fit.at)], corner))
    expect(solid.cells.filter(c => c.owner.startsWith('j')).length).toBe(buildSolids(corner).cells.filter(c => c.owner.startsWith('j')).length)
  })

  it('draws as a box across the wall and a leaf with its swing, on the side and hinge asked for', () => {
    const walls = [wall('a', [[0, 0], [4, 0]])]
    for (const side of [1, -1] as const) {
      for (const hinge of [0, 1] as const) {
        const g = openingGeometry({ ...door('d', [2, 0]), swing: { side, hinge } }, wallRuns(walls))!
        expect(g.jambs).toEqual([[1.55, 0], [2.45, 0]])
        expect(g.leaf![0]).toEqual(hinge === 0 ? [1.55, 0] : [2.45, 0])
        expect(Math.sign(g.leaf![1][1])).toBe(side)
        expect(g.arc![g.arc!.length - 1][0]).toBeCloseTo(hinge === 0 ? 2.45 : 1.55, 9)
      }
    }
    const svg = levelToSvg(createLevel({ name: 'L', walls, openings: [door('d', [2, 0]), { ...door('w', [1, 0], 0.6), kind: 'window', ...DEFAULT_OPENING.window, width: 0.6 }] }))
    expect(svg.openings.map(o => o.kind)).toEqual(['door', 'window'])
    expect(svg.openings[0].symbol.split('M').length).toBe(3)
    expect(svg.openings[1].symbol.split('M').length).toBe(2)
  })

  it('a wall command carries openings so a preview and a commit agree', () => {
    const level = createLevel({ name: 'L', walls: [wall('a', [[0, 0], [4, 0]])], openings: [door('d', [3, 0])] })
    const moved = applyCommands(level, [{ type: 'moveNodes', moves: [{ from: [4, 0], to: [6, 0] }] }])
    expect(moved.openings[0].at).toEqual([5, 0])
    const store = createEditorStore(level)
    store.commit('Stretch', [{ type: 'moveNodes', moves: [{ from: [4, 0], to: [6, 0] }] }])
    expect(store.level.openings[0].at).toEqual([5, 0])
  })
})

describe('openings on curved walls: the hole follows the bend, the door leaf goes straight across', () => {
  const quarter = (): Wall => ({ id: 'q', points: [[0, 0], [4, 4]], curve: [[2.2, 0], [4, 1.8]], width: 0.2 })

  it('cuts the whole stretch of the curve and leaves no hair of any chord or joint inside the hole', () => {
    const walls = [quarter()]
    const runs = wallRuns(walls)
    for (const s of [1.2, 2.6, 4.1]) {
      const at = fitOpening(runs[0].polyline.points[Math.floor((s / runs[0].polyline.length) * (runs[0].polyline.points.length - 1))], door('d', [0, 0]), walls, [], 0.3)!.at
      const d = door('d', at)
      const g = openingGeometry(d, wallRuns(walls))!
      const solid = buildSolids(walls, openingCuts([d], walls))
      expect(area(walls) - solid.area).toBeCloseTo(0.9 * 0.2, 3)
      for (const cell of solid.cells) {
        const inside = cell.points.every(p => {
          const near = nearestArc(runs[0].polyline, p)
          return near.s > nearestArc(runs[0].polyline, g.jambs[0]).s + 1e-6 && near.s < nearestArc(runs[0].polyline, g.jambs[1]).s - 1e-6
        })
        expect(inside).toBe(false)
      }
      for (const p of g.box) expect(Math.abs(nearestArc(runs[0].polyline, p).distance - 0.1)).toBeLessThan(0.004)
      const chord = [g.jambs[1][0] - g.jambs[0][0], g.jambs[1][1] - g.jambs[0][1]]
      const leaf = [g.leaf![1][0] - g.leaf![0][0], g.leaf![1][1] - g.leaf![0][1]]
      expect(Math.abs(chord[0] * leaf[0] + chord[1] * leaf[1])).toBeLessThan(1e-9)
      expect(g.centre.length).toBeGreaterThan(2)
    }
  })
})
