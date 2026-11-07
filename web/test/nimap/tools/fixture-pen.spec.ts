import { describe, it, expect } from 'vitest'
import { createFixturePen, createSelectTool, createWallPen, createLevel, nodeKey, curveHandles, DEFAULT_LAYERS } from '$lib/nimap'
import type { Line, Wall } from '$lib/nimap'
import { harness } from './harness'

const wall = (id: string, points: [[number, number], [number, number]], width = 0.16): Wall => ({ id, points, width })
const line = (id: string, points: [[number, number], [number, number]]): Line => ({ id, points })
const room = () => [wall('n', [[0, 0], [6, 0]]), wall('e', [[6, 0], [6, 4]]), wall('s', [[6, 4], [0, 4]]), wall('w', [[0, 4], [0, 0]])]
const desk = (x = 0, y = 0, tag = 'd'): Line[] => [line(`${tag}a`, [[x, y], [x + 1.6, y]]), line(`${tag}b`, [[x + 1.6, y], [x + 1.6, y + 0.8]]), line(`${tag}c`, [[x + 1.6, y + 0.8], [x, y + 0.8]]), line(`${tag}d`, [[x, y + 0.8], [x, y]])]

describe('fixture pen', () => {
  it('traces one line per click like the wall pen; closing the run makes a face, a bare object', () => {
    const pen = createFixturePen()
    const h = harness(pen, createLevel({ name: 'L', walls: room() }))
    h.click([1, 1])
    h.click([2.6, 1])
    expect(h.store.history).toEqual(['Open', 'Draw fixture line'])
    expect(h.store.level.fixtureLines.length).toBe(1)
    expect(h.store.level.fixtures.length).toBe(1)
    expect(h.store.level.fixtures[0].line).toEqual([[1, 1], [2.6, 1]])
    h.click([2.6, 1.8])
    h.click([1, 1.8])
    h.click([1.004, 1.003])
    expect(pen.state).toBe('idle')
    expect(h.store.level.fixtureLines.length).toBe(4)
    expect(h.store.level.fixtures.length).toBe(1)
    expect(h.store.level.fixtures[0]).toMatchObject({ kind: 'object' })
    expect(h.store.level.fixtures[0].polygon!.outer.length).toBe(4)
    expect(h.store.level.fixtures[0].line).toBeUndefined()
    expect(h.store.level.units.length).toBe(1)
  })

  it('a desk block: a rectangle plus one divider is five lines and two faces', () => {
    const pen = createFixturePen()
    const h = harness(pen, createLevel({ name: 'L' }), { penMethod: 'rectangle' })
    h.drag([0, 0], [3.2, 0.8])
    expect(h.store.level.fixtureLines.length).toBe(4)
    expect(h.store.level.fixtures.length).toBe(1)
    h.settings.penMethod = 'lines'
    h.click([1.6, 0.01])
    h.click([1.6, 0.79])
    h.key('Escape')
    expect(h.store.level.fixtureLines.length).toBe(7)
    expect(h.store.level.fixtures.length).toBe(2)
    expect(h.store.level.fixtures.every(f => f.polygon!.outer.length === 4)).toBe(true)
  })

  it('an ellipse is four curved lines meeting at its quadrants, one face within the chord tolerance of the true curve', () => {
    const pen = createFixturePen()
    const h = harness(pen, createLevel({ name: 'L' }), { penMethod: 'ellipse' })
    h.drag([0, 0], [2, 1])
    const lines = h.store.level.fixtureLines
    expect(lines.length).toBe(4)
    expect(lines.every(l => l.curve)).toBe(true)
    expect(lines.map(l => l.points[0]).sort()).toEqual([[0, 0.5], [1, 0], [1, 1], [2, 0.5]])
    expect(h.store.level.fixtures.length).toBe(1)
    for (const [x, y] of h.store.level.fixtures[0].polygon!.outer) {
      const onEllipse = Math.hypot((x - 1) / 1, (y - 0.5) / 0.5)
      expect(Math.abs(onEllipse - 1)).toBeLessThan(0.01)
    }
    h.drag([5, 5], [5.005, 5.5])
    expect(h.store.level.fixtureLines.length).toBe(4)
  })

  it('dragging a quadrant node bends the ellipse there and keeps the rest', () => {
    const pen = createFixturePen()
    const h = harness(pen, createLevel({ name: 'L' }), { penMethod: 'ellipse' })
    h.drag([0, 0], [2, 1])
    const tool = createSelectTool()
    const s = harness(tool, h.store.level)
    s.drag([2, 0.5], [2.4, 0.5])
    const touched = s.store.level.fixtureLines.filter(l => l.points.some(p => p[0] === 2.4))
    expect(touched.length).toBe(2)
    for (const l of touched) {
      const i = l.points.findIndex(p => p[0] === 2.4)
      expect(l.curve![i][0]).toBeCloseTo(2.4, 6)
    }
    expect(s.store.level.fixtures.length).toBe(1)
  })

  it('double-clicking a line selects its ring; on a wall run, the run up to the next junction', () => {
    const pen = createFixturePen()
    const h = harness(pen, createLevel({ name: 'L', walls: [wall('a', [[0, 3], [2, 3]]), wall('b', [[2, 3], [4, 3]]), wall('c', [[4, 3], [6, 3]]), wall('t', [[4, 3], [4, 5]])] }), { penMethod: 'ellipse' })
    h.drag([0, 0], [2, 1])
    const tool = createSelectTool()
    const s = harness(tool, h.store.level)
    s.doubleClick([1.7071, 0.8536])
    expect(s.store.selection.lineIds.size).toBe(4)
    s.doubleClick([1, 3])
    expect([...s.store.selection.lineIds].sort()).toEqual(['a', 'b'])
  })

  it('a line ending on a curve splits the curve there and lands exactly on it', () => {
    const pen = createFixturePen()
    const h = harness(pen, createLevel({ name: 'L' }), { penMethod: 'ellipse' })
    h.drag([0, 0], [2, 2])
    h.settings.penMethod = 'lines'
    h.click([1, 1])
    h.click([1.71, 1.71])
    h.key('Escape')
    const lines = h.store.level.fixtureLines
    expect(lines.length).toBe(6)
    const spoke = lines.find(l => !l.curve)!
    const end = spoke.points[1]
    expect(Math.hypot(end[0] - 1, end[1] - 1)).toBeCloseTo(1, 2)
    expect(lines.filter(l => l.curve && l.points.some(p => p[0] === end[0] && p[1] === end[1])).length).toBe(2)
    expect(h.store.level.fixtures.filter(f => f.polygon).length).toBe(1)
    expect(h.store.level.fixtures.filter(f => f.line).length).toBe(1)
  })

  it('a straight line between the ends of a curve is allowed and splits the face', () => {
    const pen = createFixturePen()
    const h = harness(pen, createLevel({ name: 'L' }), { penMethod: 'ellipse' })
    h.drag([0, 0], [2, 2])
    h.settings.penMethod = 'lines'
    h.click([2, 1])
    h.click([1, 2])
    h.key('Escape')
    expect(h.store.level.fixtureLines.length).toBe(5)
    expect(h.store.level.fixtures.filter(f => f.polygon).length).toBe(2)
    h.click([2, 1])
    h.click([1, 2])
    h.key('Escape')
    expect(h.store.level.fixtureLines.length).toBe(5)
  })

  it('a wall ellipse is four curved walls and one round room', () => {
    const pen = createWallPen()
    const h = harness(pen, createLevel({ name: 'L' }), { penMethod: 'ellipse' })
    h.drag([0, 0], [6, 4])
    expect(h.store.level.walls.length).toBe(4)
    expect(h.store.level.walls.every(w => w.curve)).toBe(true)
    expect(h.store.level.units.length).toBe(1)
    expect(h.store.level.units[0].polygon.outer.length).toBeGreaterThan(20)
  })

  it('snaps to wall faces, not centrelines; the wall pen does the opposite', () => {
    const level = createLevel({ name: 'L', walls: [wall('a', [[0, 0], [6, 0]], 0.2)] })
    const pen = createFixturePen()
    const f = harness(pen, level)
    f.move([3, 0.115])
    expect(pen.overlay(f.ctx()).find(o => o.type === 'cursor')).toMatchObject({ point: [3, 0.1] })
    f.move([3, 0.005])
    expect(pen.overlay(f.ctx()).find(o => o.type === 'cursor')).toMatchObject({ point: [3, 0.005], snapTypes: [] })
    const walls = createWallPen()
    const w = harness(walls, level)
    w.move([3, 0.02])
    expect(walls.overlay(w.ctx()).find(o => o.type === 'cursor')).toMatchObject({ point: [3, 0] })
    w.move([3, 0.115])
    expect(walls.overlay(w.ctx()).find(o => o.type === 'cursor')).toMatchObject({ point: [3, 0.115], snapTypes: [] })
  })

  it('snaps to other fixture lines and joins their nodes, never a wall node at the same spot', () => {
    const pen = createFixturePen()
    const h = harness(pen, createLevel({ name: 'L', walls: room(), fixtureLines: desk(2, 2) }))
    h.click([3.62, 2.01])
    h.click([4.5, 2.5])
    h.key('Escape')
    const added = h.store.level.fixtureLines.find(l => l.points.some(p => p[0] === 4.5))!
    expect(added.points[0]).toEqual([3.6, 2])
    const g = h.ctx().graph
    expect(g.nodesById.get(nodeKey([3.6, 2], 'fixtures'))!.refs.length).toBe(3)
    expect(g.nodesById.has(nodeKey([3.6, 2], 'walls'))).toBe(false)
  })

  it('alt-click heals a fixture node from the fixture pen, and a wall node from the wall pen, each on its own layer', () => {
    const pen = createFixturePen()
    const h = harness(pen, createLevel({ name: 'L', walls: [wall('a', [[0, 0], [4, 0]]), wall('b', [[4, 0], [4, 3]])], fixtureLines: [line('p', [[0, 1], [2, 1]]), line('q', [[2, 1], [2, 2]])] }))
    h.click([2.02, 1.01], { alt: true })
    expect(h.store.level.fixtureLines.map(l => l.points)).toEqual([[[0, 1], [2, 2]]])
    expect(h.store.level.walls.length).toBe(2)
    h.click([4.02, 0.01], { alt: true })
    expect(h.store.level.walls.map(w => w.points)).toEqual([[[0, 0], [4, 3]]])
  })
})

describe('selecting fixtures', () => {
  it('clicks a face body, drags it by its lines with corners snapping, and undo restores selection', () => {
    const tool = createSelectTool()
    const h = harness(tool, createLevel({ name: 'L', walls: room(), fixtureLines: desk(1, 1) }))
    h.click([0.1, 0.1])
    h.click([1.5, 1.5])
    const [f] = h.store.level.fixtures
    expect([...h.store.selection.fixtureIds]).toEqual([f.id])
    h.drag([1.5, 1.5], [4.9, 3.68])
    const moved = h.store.level.fixtures[0].polygon!.outer
    expect(moved.map(p => p[0]).sort()).toEqual([4.4, 4.4, 6, 6])
    expect(moved.map(p => p[1]).sort()).toEqual([3.12, 3.12, 3.92, 3.92])
    expect(h.store.level.walls).toEqual(room())
    expect(h.store.history.slice(-2)).toEqual(['Select', 'Move'])
    h.store.undo()
    expect(h.store.level.fixtureLines).toEqual(desk(1, 1))
    expect([...h.store.selection.fixtureIds]).toEqual([f.id])
  })

  it('moving a fixture snaps to wall faces, moving a wall node snaps to centrelines', () => {
    const tool = createSelectTool()
    const h = harness(tool, createLevel({ name: 'L', walls: [wall('a', [[0, 0], [6, 0]], 0.2)], fixtureLines: desk(1, 1) }))
    h.click([1.5, 1.5])
    h.drag([1.5, 1.5], [1.5, 0.615])
    expect(h.store.level.fixtureLines.find(l => l.id === 'da')!.points[0]).toEqual([1, 0.1])
    h.click([6, 0])
    h.drag([6, 0], [6, 0.115])
    expect(h.store.level.walls[0].points[1]).toEqual([6, 0.115])
  })

  it('an open path fixture is labelled at its middle, an outline inside', () => {
    const tool = createSelectTool()
    const h = harness(tool, createLevel({ name: 'L', fixtureLines: [line('p', [[0, 0], [2, 0]]), line('q', [[2, 0], [2, 2]]), ...desk(4, 4)] }))
    const path = h.store.level.fixtures.find(f => f.line)!
    expect(path.anchor).toEqual([2, 0])
    const face = h.store.level.fixtures.find(f => f.polygon)!
    expect(face.anchor[0]).toBeGreaterThan(4)
    expect(face.anchor[0]).toBeLessThan(5.6)
  })

  it('a fixture line wins over a face body and over a wall; a node wins over everything', () => {
    const tool = createSelectTool()
    const h = harness(tool, createLevel({ name: 'L', walls: room(), fixtureLines: desk(0, -0.4) }))
    h.click([0.8, 0.02])
    expect([...h.store.selection.fixtureIds].length).toBe(1)
    h.key('Escape')
    h.click([0.4, -0.4])
    expect([...h.store.selection.lineIds]).toEqual(['da'])
    h.click([0.02, 0.01])
    expect([...h.store.selection.nodeIds]).toEqual([nodeKey([0, 0])])
  })

  it('box selects only faces fully inside, shift adds, delete removes their lines', () => {
    const tool = createSelectTool()
    const h = harness(tool, createLevel({ name: 'L', fixtureLines: [...desk(0, 0, 'a'), ...desk(3, 0, 'b')] }))
    h.click([9, 9])
    const [a, b] = h.store.level.fixtures
    h.drag([-1, -1], [2, 2])
    expect(h.store.selection.fixtureIds.has(a.id) || h.store.selection.fixtureIds.has(b.id)).toBe(true)
    expect(h.store.selection.fixtureIds.size).toBe(1)
    h.click([3.5, 0.4], { shift: true })
    expect(h.store.selection.fixtureIds.size).toBe(2)
    h.key('Delete')
    expect(h.store.level.fixtureLines).toEqual([])
    expect(h.store.level.fixtures).toEqual([])
  })

  it('nudges a mixed selection across both layers and keeps it selected', () => {
    const tool = createSelectTool()
    const h = harness(tool, createLevel({ name: 'L', walls: room(), fixtureLines: desk(1, 1) }))
    h.click([1.5, 1.5])
    h.click([6, 4], { shift: true })
    h.key('ArrowRight', { shift: true })
    expect(h.store.level.fixtureLines.find(l => l.id === 'da')!.points[0]).toEqual([1.1, 1])
    expect(h.store.level.walls.find(w => w.id === 'e')!.points[1]).toEqual([6.1, 4])
    expect([...h.store.selection.nodeIds]).toEqual([nodeKey([6.1, 4])])
    expect(h.store.selection.fixtureIds.size).toBe(1)
  })

  it('a locked fixture layer cannot be hit but a wall under it can', () => {
    const tool = createSelectTool()
    const h = harness(tool, createLevel({ name: 'L', walls: room(), fixtureLines: desk(0, -0.4) }))
    h.layers = { ...DEFAULT_LAYERS, fixtures: { hidden: false, locked: true } }
    h.click([0.8, 0.02])
    expect([...h.store.selection.lineIds]).toEqual(['n'])
    expect(h.store.selection.fixtureIds.size).toBe(0)
  })
})

describe('curve handles', () => {
  const ring = () => {
    const pen = createFixturePen()
    const h = harness(pen, createLevel({ name: 'L' }), { penMethod: 'ellipse' })
    h.drag([0, 0], [2, 2])
    return h.store.level
  }

  it('selecting a curved line exposes its two handles; selecting a node exposes the handles of the curves at it', () => {
    const tool = createSelectTool()
    const s = harness(tool, ring())
    s.click([1.5, 0.134])
    expect(curveHandles(s.store.selection, s.ctx().graph).length).toBe(2)
    s.key('Escape')
    s.click([2, 1])
    expect(curveHandles(s.store.selection, s.ctx().graph).length).toBe(4)
    expect(tool.overlay(s.ctx()).find(o => o.type === 'handles')).toBeDefined()
  })

  it('dragging a handle bends its curve and mirrors the neighbour at a smooth joint', () => {
    const tool = createSelectTool()
    const s = harness(tool, ring())
    s.click([2, 1])
    const before = curveHandles(s.store.selection, s.ctx().graph)
    const h = before.find(x => x.point[1] > 1)!
    s.drag(h.point, [2.3, 1.7])
    expect(s.store.history.at(-1)).toBe('Bend')
    const lines = s.store.level.fixtureLines
    const own = lines.find(l => l.id === h.lineId)!
    expect(own.curve![h.index]).toEqual([2.3, 1.7])
    const other = lines.find(l => l.id !== h.lineId && l.points.some(p => p[0] === 2 && p[1] === 1))!
    const i = other.points.findIndex(p => p[0] === 2 && p[1] === 1)
    const v = [other.curve![i][0] - 2, other.curve![i][1] - 1]
    const u = [0.3, 0.7]
    const cos = (u[0] * v[0] + u[1] * v[1]) / (Math.hypot(...u) * Math.hypot(...v))
    expect(cos).toBeCloseTo(-1, 3)
    expect(Math.hypot(...v)).toBeCloseTo(Math.hypot(0.3, 0.7), 3)
    expect(s.store.level.fixtures.length).toBe(1)
    s.store.undo()
    expect(s.store.level.fixtureLines.find(l => l.id === h.lineId)!.curve![h.index]).toEqual(h.point)
  })

  it('the mirror is held for the whole drag, through intermediate positions, and Alt breaks it', () => {
    const tool = createSelectTool()
    const s = harness(tool, ring())
    s.click([2, 1])
    const h = curveHandles(s.store.selection, s.ctx().graph).find(x => x.point[1] > 1)!
    s.down(h.point)
    s.move([2.4, 1.3])
    s.move([1.6, 1.9])
    s.move([2.3, 1.7])
    const other = () => s.store.working.fixtureLines.find(l => l.id !== h.lineId && l.points.some(p => p[0] === 2 && p[1] === 1))!
    const i = other().points.findIndex(p => p[0] === 2 && p[1] === 1)
    const v = [other().curve![i][0] - 2, other().curve![i][1] - 1]
    expect((0.3 * v[0] + 0.7 * v[1]) / (Math.hypot(0.3, 0.7) * Math.hypot(...v))).toBeCloseTo(-1, 3)
    s.up([2.3, 1.7])
    const s2 = harness(createSelectTool(), s.store.level)
    s2.click([2, 1])
    const h2 = curveHandles(s2.store.selection, s2.ctx().graph).find(x => x.lineId === h.lineId)!
    s2.down(h2.point)
    s2.move([2.6, 1.2], { alt: true })
    s2.up([2.6, 1.2], { alt: true })
    const kept = s2.store.level.fixtureLines.find(l => l.id !== h.lineId && l.points.some(p => p[0] === 2 && p[1] === 1))!
    expect(kept.curve![i]).toEqual(other().curve![i])
  })

  it('a corner joint is not mirrored', () => {
    const tool = createSelectTool()
    const level = createLevel({ name: 'L', fixtureLines: [
      { id: 'a', points: [[0, 0], [2, 0]], curve: [[0.5, 1], [1.5, 1]] },
      { id: 'b', points: [[2, 0], [2, 2]], curve: [[2.5, 0.5], [2.5, 1.5]] }
    ] })
    const s = harness(tool, level)
    s.click([2, 0])
    const h = curveHandles(s.store.selection, s.ctx().graph).find(x => x.lineId === 'a')!
    s.drag(h.point, [1.5, 1.4])
    expect(s.store.level.fixtureLines.find(l => l.id === 'b')!.curve).toEqual([[2.5, 0.5], [2.5, 1.5]])
  })

  it('a curved wall offers its face as one continuous edge, with nodes only at wall corners', () => {
    const pen = createWallPen()
    const h = harness(pen, createLevel({ name: 'L' }), { penMethod: 'ellipse' })
    h.drag([0, 0], [6, 4])
    const f = harness(createFixturePen(), h.store.level)
    const faces = f.ctx().sources.faces
    expect(faces.segments.length).toBeGreaterThan(20)
    expect(faces.nodes.length).toBeLessThanOrEqual(8)
    const straight = harness(createFixturePen(), createLevel({ name: 'L', walls: [wall('a', [[0, 0], [4, 0]], 0.2), wall('b', [[4, 0], [4, 3]], 0.2)] }))
    expect(straight.ctx().sources.faces.nodes.length).toBeGreaterThan(0)
  })

  it('a fixture line lying on a wall face keeps its own midpoint magnet', () => {
    const pen = createFixturePen()
    const h = harness(pen, createLevel({ name: 'L', walls: [wall('a', [[0, 0], [10, 0]], 0.2)], fixtureLines: [line('f', [[2, 0.1], [4, 0.1]])] }))
    h.move([3.03, 0.11])
    expect(pen.overlay(h.ctx()).find(o => o.type === 'cursor')).toMatchObject({ point: [3, 0.1] })
  })

  it('faces follow their lines during a preview', () => {
    const tool = createSelectTool()
    const h = harness(tool, createLevel({ name: 'L', fixtureLines: desk(1, 1) }))
    h.click([1.5, 1.5])
    h.down([1.5, 1.5])
    h.move([3.5, 3.5])
    const preview = h.store.working.fixtures[0].polygon!.outer
    expect(preview.map(p => p[0]).sort()[0]).toBeCloseTo(3, 6)
    expect(h.store.level.fixtures[0].polygon!.outer.map(p => p[0]).sort()[0]).toBe(1)
  })

  it('every carried point reaches a midpoint: a two-node fixture line snaps its top or its bottom node to the middle of another line', () => {
    for (const which of ['top', 'bottom'] as const) {
      const tool = createSelectTool()
      const h = harness(tool, createLevel({ name: 'L', fixtureLines: [line('g', [[-1, 3], [1.2, 3]]), line('f', [[2, 1], [2, 2]])] }))
      h.click([2, 1.25])
      const targetY = which === 'top' ? 2.5 : 3.5
      h.drag([2, 1.25], [0.13, targetY - 0.22])
      const points = h.store.level.fixtureLines.find(l => l.id === 'f')!.points
      expect(points.map(p => p[0])).toEqual([0.1, 0.1])
      expect(points.map(p => p[1]).sort()).toEqual(which === 'top' ? [2, 3] : [3, 4])
    }
  })

  it('a fixture line on a wall face does not flicker between the two: the fixture line wins every time', () => {
    const pen = createFixturePen()
    const h = harness(pen, createLevel({ name: 'L', walls: [wall('a', [[0, 0], [10, 0]], 0.2)], fixtureLines: [line('f', [[2, 0.1], [4, 0.1]])] }))
    for (let x = 2.2; x < 3.8; x += 0.07) {
      h.move([x, 0.115])
      const g = pen.overlay(h.ctx()).find(o => o.type === 'guide')
      expect(g && g.type === 'guide' && g.guide.type === 'path' && g.guide.points.length).toBe(2)
    }
  })
})
