import { describe, it, expect } from 'vitest'
import { createBendTool, createSelectTool, createFixturePen, createLevel, curveHandles, cubicPoint, nodeKey } from '$lib/nimap'
import type { Line, Wall } from '$lib/nimap'
import { harness } from './harness'

const wall = (id: string, points: [[number, number], [number, number]], width = 0.16): Wall => ({ id, points, width })
const line = (id: string, points: [[number, number], [number, number]]): Line => ({ id, points })

describe('bend tool', () => {
  it('clicking a straight line gives it handles along itself; dragging its body bows it through the cursor', () => {
    const tool = createBendTool()
    const h = harness(tool, createLevel({ name: 'L', walls: [wall('a', [[0, 0], [4, 0]])] }))
    h.click([2, 0])
    expect(h.store.level.walls[0].curve).toEqual([[1.333333, 0], [2.666667, 0]])
    expect([...h.store.selection.lineIds]).toEqual(['a'])
    h.drag([2, 0], [2, 1])
    const bowed = h.store.level.walls[0]
    const mid = cubicPoint([bowed.points[0], bowed.curve![0], bowed.curve![1], bowed.points[1]], 0.5)
    expect(mid[0]).toBeCloseTo(2, 3)
    expect(mid[1]).toBeCloseTo(1, 3)
    expect(h.store.history.slice(-2)).toEqual(['Bend', 'Bend'])
  })

  it('clicking a corner node makes it smooth with opposite handles; clicking again makes it a corner', () => {
    const tool = createBendTool()
    const h = harness(tool, createLevel({ name: 'L', fixtureLines: [line('a', [[0, 0], [2, 0]]), line('b', [[2, 0], [2, 2]])] }))
    h.click([2, 0])
    const [a, b] = h.store.level.fixtureLines
    expect(a.curve && b.curve).toBeTruthy()
    const ha = [a.curve![1][0] - 2, a.curve![1][1]]
    const hb = [b.curve![0][0] - 2, b.curve![0][1]]
    expect((ha[0] * hb[0] + ha[1] * hb[1]) / (Math.hypot(...ha) * Math.hypot(...hb))).toBeCloseTo(-1, 6)
    expect(curveHandles(h.store.selection, h.ctx().graph).length).toBe(4)
    h.click([2, 0])
    expect(h.store.level.fixtureLines.every(l => !l.curve)).toBe(true)
  })

  it('clicking a handle removes only that handle; the line straightens once both are gone', () => {
    const tool = createBendTool()
    const h = harness(tool, createLevel({ name: 'L', fixtureLines: [{ id: 'a', points: [[0, 0], [4, 0]], curve: [[1, 1], [3, 1]] }] }))
    h.click([2, 0.7])
    const handles = curveHandles(h.store.selection, h.ctx().graph)
    expect(handles.length).toBe(2)
    h.click(handles[0].point)
    expect(h.store.level.fixtureLines[0].curve).toEqual([[0, 0], [3, 1]])
    h.click([3, 1])
    expect(h.store.level.fixtureLines[0].curve).toBeUndefined()
    expect(h.store.history.at(-1)).toBe('Remove handle')
  })

  it('a loose handle dragged nearly opposite its neighbour snaps exactly opposite and is locked afterwards', () => {
    const level = createLevel({ name: 'L', fixtureLines: [
      { id: 'a', points: [[0, 0], [2, 0]], curve: [[0.5, 1], [1, 1]] },
      { id: 'b', points: [[2, 0], [4, 0]], curve: [[2.5, 1], [3.5, 1]] }
    ] })
    const s = harness(createSelectTool(), level)
    s.click([2, 0])
    const h = curveHandles(s.store.selection, s.ctx().graph).find(x => x.lineId === 'a' && x.index === 1)!
    s.drag(h.point, [1.5, -1.02])
    const a = s.store.level.fixtureLines.find(l => l.id === 'a')!
    const v = [a.curve![1][0] - 2, a.curve![1][1]]
    expect(v[0] / Math.hypot(...v)).toBeCloseTo(-0.4472, 3)
    expect(v[1] / Math.hypot(...v)).toBeCloseTo(-0.8944, 3)
    const s2 = harness(createSelectTool(), s.store.level)
    s2.click([2, 0])
    const h2 = curveHandles(s2.store.selection, s2.ctx().graph).find(x => x.lineId === 'a' && x.index === 1)!
    s2.drag(h2.point, [0.8, 0.6])
    const b = s2.store.level.fixtureLines.find(l => l.id === 'b')!
    const w = [b.curve![0][0] - 2, b.curve![0][1]]
    const u = [0.8 - 2, 0.6]
    expect((u[0] * w[0] + u[1] * w[1]) / (Math.hypot(...u) * Math.hypot(...w))).toBeCloseTo(-1, 3)
  })

  it('a node with three lines never toggles smooth', () => {
    const tool = createBendTool()
    const h = harness(tool, createLevel({ name: 'L', walls: [wall('a', [[0, 0], [2, 0]]), wall('b', [[2, 0], [4, 0]]), wall('c', [[2, 0], [2, 2]])] }))
    h.click([2, 0])
    expect(h.store.level.walls.every(w => !w.curve)).toBe(true)
    expect([...h.store.selection.nodeIds]).toEqual([nodeKey([2, 0])])
  })

  it('bending a fixture line keeps its face', () => {
    const pen = createFixturePen()
    const h = harness(pen, createLevel({ name: 'L' }), { penMethod: 'rectangle' })
    h.drag([0, 0], [2, 1])
    const b = harness(createBendTool(), h.store.level)
    b.drag([1, 1], [1, 1.4])
    expect(b.store.level.fixtures.length).toBe(1)
    expect(b.store.level.fixtures[0].polygon!.outer.length).toBeGreaterThan(4)
  })

  it('equal-length opposite handles mirror length too, so an ellipse quadrant scales symmetrically; unequal ones mirror angle only', () => {
    const pen = createFixturePen()
    const h = harness(pen, createLevel({ name: 'L' }), { penMethod: 'ellipse' })
    h.drag([0, 0], [2, 2])
    const s = harness(createSelectTool(), h.store.level)
    s.click([2, 1])
    const up = curveHandles(s.store.selection, s.ctx().graph).find(x => x.point[1] > 1)!
    s.drag(up.point, [2, 1.9])
    const lines = s.store.level.fixtureLines
    const other = lines.find(l => l.id !== up.lineId && l.points.some(p => p[0] === 2 && p[1] === 1))!
    const i = other.points.findIndex(p => p[0] === 2 && p[1] === 1)
    expect(Math.hypot(other.curve![i][0] - 2, other.curve![i][1] - 1)).toBeCloseTo(0.9, 3)
    const level = createLevel({ name: 'L', fixtureLines: [
      { id: 'a', points: [[0, 0], [2, 0]], curve: [[0.5, 1], [2, 1]] },
      { id: 'b', points: [[2, 0], [4, 0]], curve: [[2, -0.5], [3.5, 1]] }
    ] })
    const u = harness(createSelectTool(), level)
    u.click([2, 0])
    const top = curveHandles(u.store.selection, u.ctx().graph).find(x => x.lineId === 'a' && x.index === 1)!
    u.drag(top.point, [2.4, 1.5])
    const b = u.store.level.fixtureLines.find(l => l.id === 'b')!
    expect(Math.hypot(b.curve![0][0] - 2, b.curve![0][1])).toBeCloseTo(0.5, 5)
  })

  it('a loose handle dragged to nearly the same length as its opposite snaps to equal length', () => {
    const level = createLevel({ name: 'L', fixtureLines: [
      { id: 'a', points: [[0, 0], [2, 0]], curve: [[0.5, 1], [2, 1]] },
      { id: 'b', points: [[2, 0], [4, 0]], curve: [[2, -0.5], [3.5, 1]] }
    ] })
    const u = harness(createSelectTool(), level)
    u.click([2, 0])
    const top = curveHandles(u.store.selection, u.ctx().graph).find(x => x.lineId === 'a' && x.index === 1)!
    u.drag(top.point, [2.005, 0.53])
    const a = u.store.level.fixtureLines.find(l => l.id === 'a')!
    expect(a.curve![1]).toEqual([2, 0.5])
  })
})
