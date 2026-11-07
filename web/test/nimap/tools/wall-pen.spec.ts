import { describe, it, expect } from 'vitest'
import { createWallPen, createFixturePen, createLevel, pointOnLine } from '$lib/nimap'
import type { Line, Vec2, Wall } from '$lib/nimap'
import { harness } from './harness'

const wall = (id: string, points: [[number, number], [number, number]], width = 0.16): Wall => ({ id, points, width })

describe('wall pen', () => {
  it('draws one wall per click, each its own undo step', () => {
    const pen = createWallPen()
    const h = harness(pen, createLevel({ name: 'L' }))
    h.click([0, 0])
    expect(pen.state).toBe('drawing')
    expect(h.store.level.walls.length).toBe(0)
    h.click([4, 0])
    expect(h.store.level.walls.map(w => w.points)).toEqual([[[0, 0], [4, 0]]])
    expect(h.store.history).toEqual(['Open', 'Draw wall'])
    h.click([4, 3])
    expect(h.store.level.walls.map(w => w.points)).toEqual([[[0, 0], [4, 0]], [[4, 0], [4, 3]]])
    expect(h.store.level.walls[1].width).toBe(0.16)
    h.key('Escape')
    expect(pen.state).toBe('idle')
    h.store.undo()
    expect(h.store.level.walls.length).toBe(1)
  })

  it('snaps to existing nodes exactly, closes on its first point and never draws a wall twice', () => {
    const pen = createWallPen()
    const h = harness(pen, createLevel({ name: 'L', walls: [wall('a', [[0, 0], [4, 0]])] }))
    h.click([4.03, 0.02])
    h.click([4, 3])
    h.click([0.02, 3])
    h.click([0.01, 0.03])
    expect(pen.state).toBe('drawing')
    expect(h.store.level.walls.map(w => w.points)).toEqual([[[0, 0], [4, 0]], [[4, 0], [4, 3]], [[4, 3], [0, 3]], [[0, 3], [0, 0]]])
    h.click([4.02, 0.01])
    expect(pen.state).toBe('idle')
    expect(h.store.level.walls.length).toBe(4)
    expect(h.store.level.units.length).toBe(1)
  })

  it('ignores a repeated click and finishes on double click, Enter or Escape', () => {
    const pen = createWallPen()
    const h = harness(pen, createLevel({ name: 'L' }))
    h.click([0, 0])
    h.click([3, 0])
    h.click([3, 0])
    expect(h.store.level.walls.length).toBe(1)
    h.doubleClick([3, 0])
    expect(pen.state).toBe('idle')
    h.click([5, 5])
    h.click([6, 5])
    h.key('Enter')
    expect(pen.state).toBe('idle')
    expect(h.store.level.walls.length).toBe(2)
  })

  it('backspace removes the last wall drawn and walks back to its start', () => {
    const pen = createWallPen()
    const h = harness(pen, createLevel({ name: 'L' }))
    h.click([0, 0])
    h.click([2, 0])
    h.click([2, 2])
    h.key('Backspace')
    expect(h.store.level.walls.map(w => w.points)).toEqual([[[0, 0], [2, 0]]])
    expect(pen.data.last).toEqual([2, 0])
    h.key('Backspace')
    expect(h.store.level.walls.length).toBe(0)
    expect(pen.state).toBe('drawing')
    expect(pen.data.last).toEqual([0, 0])
    h.key('Backspace')
    expect(pen.state).toBe('idle')
  })

  it('shows a preview and guides while drawing', () => {
    const pen = createWallPen()
    const h = harness(pen, createLevel({ name: 'L' }))
    h.click([0, 0])
    h.move([3, 0.02])
    const overlay = pen.overlay(h.ctx())
    const preview = overlay.find(o => o.type === 'preview')
    expect(preview && preview.type === 'preview' && preview.points).toEqual([[0, 0], [3, 0]])
    expect(overlay.some(o => o.type === 'guide')).toBe(true)
    expect(overlay.some(o => o.type === 'cursor' && o.snapTypes.includes('alignment'))).toBe(true)
    expect(pen.cursor(h.ctx())).toBe('arrow-wall')
  })

  it('snaps exactly to a crossing of two walls, which is a target but never a node', () => {
    const pen = createWallPen()
    const h = harness(pen, createLevel({ name: 'L', walls: [wall('h', [[-2, 0], [2, 0]]), wall('v', [[0, -2], [0, 2]])] }))
    h.click([0.03, 0.02])
    h.click([1, 1])
    h.key('Escape')
    expect(h.store.level.walls.map(w => w.points)).toEqual([[[-2, 0], [0, 0]], [[0, 0], [2, 0]], [[0, -2], [0, 0]], [[0, 0], [0, 2]], [[0, 0], [1, 1]]])
    expect(h.ctx().graph.nodes.every(n => n.refs.length > 0)).toBe(true)
  })

  it('a wall drawn onto an existing wall splits it and the room', () => {
    const pen = createWallPen()
    const h = harness(pen, createLevel({ name: 'L', walls: [wall('n', [[0, 0], [6, 0]]), wall('e', [[6, 0], [6, 4]]), wall('s', [[6, 4], [0, 4]]), wall('w', [[0, 4], [0, 0]])] }))
    expect(h.store.level.units.length).toBe(1)
    h.click([3, 0.03])
    h.click([3, 3.98])
    h.key('Escape')
    expect(h.store.level.walls.map(w => [w.id, ...w.points])).toEqual([
      ['n', [0, 0], [3, 0]], ['n.1', [3, 0], [6, 0]], ['e', [6, 0], [6, 4]], ['s', [6, 4], [3, 4]], ['s.1', [3, 4], [0, 4]], ['w', [0, 4], [0, 0]], [expect.any(String), [3, 0], [3, 4]]
    ])
    expect(h.store.level.units.length).toBe(2)
  })

  it('a modifier key alone changes the cursor: shift locks the direction without the pointer moving', () => {
    const pen = createWallPen()
    const h = harness(pen, createLevel({ name: 'L' }))
    h.click([0, 0])
    h.move([3, 0.3])
    const free = pen.overlay(h.ctx())
    expect(free.find(o => o.type === 'cursor')).toMatchObject({ snapTypes: [] })
    h.modifiers({ shift: true })
    const locked = pen.overlay(h.ctx())
    expect(locked.find(o => o.type === 'cursor')).toMatchObject({ snapTypes: ['hard-angle'], point: [3, 0] })
    expect(locked.some(o => o.type === 'guide' && o.guide.type === 'line' && o.guide.style === 'angle')).toBe(true)
    h.modifiers({})
    expect(pen.overlay(h.ctx()).find(o => o.type === 'cursor')).toMatchObject({ snapTypes: [] })
  })

  it('a node hit still shows the alignment guides through it', () => {
    const pen = createWallPen()
    const h = harness(pen, createLevel({ name: 'L', walls: [wall('a', [[0, 0], [4, 0]]), wall('b', [[4, 0], [4, 3]])] }))
    h.move([4.03, 0.02])
    const items = pen.overlay(h.ctx())
    expect(items.find(o => o.type === 'cursor')).toMatchObject({ point: [4, 0], snapTypes: ['node', 'alignment', 'alignment'] })
    expect(items.filter(o => o.type === 'guide' && o.guide.type === 'line' && o.guide.style === 'alignment').length).toBe(2)
  })

  it('shows nothing before the pointer has entered', () => {
    const pen = createWallPen()
    const h = harness(pen, createLevel({ name: 'L' }))
    expect(pen.overlay(h.ctx())).toEqual([])
  })

  it('the working point is a snap target and an anchor from the first click, so hovering it shows no rays', () => {
    const pen = createWallPen()
    const h = harness(pen, createLevel({ name: 'L' }))
    h.click([2, 3])
    for (const p of [[2.01, 3], [2.02, 2.99], [2.05, 3.05]] as [number, number][]) {
      h.move(p)
      const items = pen.overlay(h.ctx())
      expect(items.find(o => o.type === 'cursor')).toMatchObject({ point: [2, 3], snapTypes: ['node'] })
      expect(items.some(o => o.type === 'guide' && o.guide.type === 'line' && o.guide.style === 'angle')).toBe(false)
      expect(items.find(o => o.type === 'anchor')).toEqual({ type: 'anchor', point: [2, 3] })
    }
    h.move([2.3, 3.02])
    expect(pen.overlay(h.ctx()).find(o => o.type === 'cursor')).toMatchObject({ point: [2.3, 3], snapTypes: ['alignment'] })
  })

  it('a click on or within the minimum feature of the working point is nothing, at any zoom', () => {
    for (const scale of [100, 4000]) {
      const pen = createWallPen()
      const h = harness(pen, createLevel({ name: 'L' }), { scale })
      h.click([2, 3])
      h.click([2.004, 3.003])
      h.click([2, 3])
      expect(pen.state).toBe('drawing')
      expect(pen.data.last).toEqual([2, 3])
      expect(h.store.history).toEqual(['Open'])
      h.click([2.5, 3])
      expect(h.store.level.walls.map(w => w.points)).toEqual([[[2, 3], [2.5, 3]]])
    }
  })

  it('places document points: a free click lands on the document grid', () => {
    const pen = createWallPen()
    const h = harness(pen, createLevel({ name: 'L' }))
    h.click([0.1234567891, 0.9876543219])
    expect(pen.data.last).toEqual([0.123457, 0.987654])
  })
})

describe('the wall in hand reads out', () => {
  it('its snapped length at its middle, whichever way it points', () => {
    const pen = createWallPen()
    const h = harness(pen, createLevel({ name: 'L' }))
    h.click([0, 0])
    for (const [x, y] of [[3, 0], [0, 4], [-3, 4], [1.5, -2], [0.37, 0.11]] as [number, number][]) {
      h.move([x, y], { ctrl: true })
      const label = pen.overlay(h.ctx()).find(o => o.type === 'label')
      expect(label && label.type === 'label' && label.text).toBe(`${Math.hypot(x, y).toFixed(2)} m`)
      expect(label && label.type === 'label' && label.at).toEqual([x / 2, y / 2])
    }
    h.move([0.004, 0.003], { ctrl: true })
    expect(pen.overlay(h.ctx()).some(o => o.type === 'label')).toBe(false)
  })

  it('a rectangle or ellipse being dragged reads out its width and height at its centre', () => {
    for (const penMethod of ['rectangle', 'ellipse'] as const) {
      const pen = createWallPen()
      const h = harness(pen, createLevel({ name: 'L' }), { penMethod })
      h.down([1, 1])
      h.move([4, -1], { ctrl: true })
      const label = pen.overlay(h.ctx()).find(o => o.type === 'label')
      expect(label && label.type === 'label' && label.text).toBe('3.00 × 2.00 m')
      expect(label && label.type === 'label' && label.at).toEqual([2.5, 0])
    }
  })
})

describe('a pen’s first click on a line', () => {
  const straight: Line = { id: 'l', points: [[0, 0], [4, 1]] }
  const curved: Line = { id: 'l', points: [[0, 0], [4, 1]], curve: [[1, 1.5], [3, 2.2]] }
  const pens = [
    { name: 'wall pen', make: createWallPen, level: (l: Line) => createLevel({ name: 'L', walls: [{ ...l, width: 0.16 }] }), lines: (h: ReturnType<typeof harness>) => h.store.level.walls },
    { name: 'fixture pen', make: createFixturePen, level: (l: Line) => createLevel({ name: 'L', fixtureLines: [l] }), lines: (h: ReturnType<typeof harness>) => h.store.level.fixtureLines }
  ]

  it('puts a node there at once, its own undo step, which stays when the pen stops: anywhere along any line of its layer, straight or curved', () => {
    for (const pen of pens) {
      for (const line of [straight, curved]) {
        for (const t of [0.2, 0.37, 0.5, 0.81]) {
          const at = `${pen.name}, ${line.curve ? 'curved' : 'straight'}, t ${t}`
          const h = harness(pen.make(), pen.level(line))
          const p = pointOnLine(line, t)
          h.click(p)
          expect(h.store.history, at).toEqual(['Open', 'Add node'])
          const pieces = pen.lines(h)
          expect(pieces.length, at).toBe(2)
          expect(Math.hypot(pieces[0].points[1][0] - p[0], pieces[0].points[1][1] - p[1]), at).toBeLessThan(1e-5)
          h.key('Escape')
          expect(pen.lines(h).length, at).toBe(2)
          expect(h.store.history, at).toEqual(['Open', 'Add node'])
        }
      }
    }
  })

  it('on nothing, or on a node, adds nothing; where two walls cross, it makes a junction of both', () => {
    for (const p of [[1, 3], [4, 1], [0, 0]] as Vec2[]) {
      const h = harness(createWallPen(), createLevel({ name: 'L', walls: [{ ...straight, width: 0.16 }] }))
      h.click(p)
      h.key('Escape')
      expect(h.store.history, `${p}`).toEqual(['Open'])
    }
    const h = harness(createWallPen(), createLevel({ name: 'L', walls: [wall('h', [[-2, 0], [4, 0]]), wall('v', [[0, -2], [0, 3]])] }))
    h.click([0.02, 0.01])
    h.key('Escape')
    expect(h.store.history).toEqual(['Open', 'Add node'])
    expect(h.store.level.walls.map(w => w.points)).toEqual([[[-2, 0], [0, 0]], [[0, 0], [4, 0]], [[0, -2], [0, 0]], [[0, 0], [0, 3]]])
  })
})
