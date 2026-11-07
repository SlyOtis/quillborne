import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { createSelectTool, createWallPen, createLevel, lineMiddle, pointOnLine, projectOntoLine, createEditorStore, nodeKey, wallTopology, wallsFromSvg, buildEditGraph, quantize, selectionOf, pointInRing, placeOpenings, fitOpening, fixtureGrips, DEFAULT_LAYERS } from '$lib/nimap'
import type { Line, Wall, Vec2 } from '$lib/nimap'
import { harness } from './harness'

const wall = (id: string, points: [[number, number], [number, number]], width = 0.16): Wall => ({ id, points, width })
const line = (id: string, points: [[number, number], [number, number]]): Line => ({ id, points })
const room = () => [wall('n', [[0, 0], [6, 0]]), wall('e', [[6, 0], [6, 4]]), wall('s', [[6, 4], [0, 4]]), wall('w', [[0, 4], [0, 0]])]

describe('select tool', () => {
  it('clicks select a node, shift toggles, escape clears', () => {
    const tool = createSelectTool()
    const h = harness(tool, createLevel({ name: 'L', walls: room() }))
    h.click([6.03, 0.02])
    expect(tool.state).toBe('idle')
    expect([...h.store.selection.nodeIds]).toEqual([nodeKey([6, 0])])
    h.click([0.02, 0], { shift: true })
    expect(h.store.selection.nodeIds.size).toBe(2)
    h.click([0.02, 0], { shift: true })
    expect(h.store.selection.nodeIds.size).toBe(1)
    h.key('Escape')
    expect(tool.state).toBe('idle')
    expect(h.store.selection.nodeIds.size).toBe(0)
  })

  it('drags a corner and every wall that shares it, committing once', () => {
    const tool = createSelectTool()
    const h = harness(tool, createLevel({ name: 'L', walls: room() }))
    h.down([6, 0])
    h.move([6.5, -0.3])
    expect(tool.state).toBe('dragging')
    expect(h.store.working.walls[0].points[1]).toEqual([6.5, -0.3])
    expect(h.store.level.walls[0].points[1]).toEqual([6, 0])
    h.move([7, -0.5])
    h.up([7, -0.5])
    expect(tool.state).toBe('idle')
    expect(h.store.level.walls[0].points[1]).toEqual([7, -0.5])
    expect(h.store.level.walls[1].points[0]).toEqual([7, -0.5])
    expect(h.store.history).toEqual(['Open', 'Move'])
    expect([...h.store.selection.nodeIds]).toEqual([nodeKey([7, -0.5])])
  })

  it('escape during a drag reverts the preview', () => {
    const tool = createSelectTool()
    const h = harness(tool, createLevel({ name: 'L', walls: room() }))
    h.down([6, 0])
    h.move([7, 1])
    h.key('Escape')
    expect(tool.state).toBe('idle')
    expect(h.store.working.walls[0].points[1]).toEqual([6, 0])
    expect(h.store.canUndo).toBe(false)
  })

  it('a click without movement records the selection and nothing else', () => {
    const tool = createSelectTool()
    const h = harness(tool, createLevel({ name: 'L', walls: room() }))
    h.down([6, 0])
    h.move([6.005, 0])
    h.up([6.005, 0])
    expect(h.store.history).toEqual(['Open', 'Select'])
    expect(h.store.level.walls).toEqual(room())
    expect(tool.state).toBe('idle')
  })

  it('dragging snaps to alignments of the remaining nodes', () => {
    const tool = createSelectTool()
    const h = harness(tool, createLevel({ name: 'L', walls: [wall('a', [[0, 0], [4, 0]]), wall('b', [[10, 2], [10, 5]])] }))
    h.down([4, 0])
    h.move([7, 1.96])
    h.up([7, 1.96])
    expect(h.store.level.walls[0].points[1]).toEqual([7, 2])
  })

  it('a dragged endpoint moves freely and never snaps to itself', () => {
    const tool = createSelectTool()
    const h = harness(tool, createLevel({ name: 'L', walls: [wall('a', [[0, 0], [4, 1]]), wall('far', [[20, 20], [24, 21]])] }))
    h.down([4, 1])
    const path: [number, number][] = [[3.5, 0.9], [2, 0.55], [1.9, 0.55], [1.85, 0.57]]
    for (const p of path) {
      h.move(p)
      expect(tool.data.cursor!.types).toEqual([])
      expect(h.store.working.walls[0].points[1]).toEqual(p)
    }
    expect(h.trace.snappersBuilt).toBe(1)
    h.up([1.85, 0.57])
    expect(h.store.level.walls[0].points[1]).toEqual([1.85, 0.57])
  })

  it('a dragged group still snaps its companions to nodes that stay put', () => {
    const tool = createSelectTool()
    const h = harness(tool, createLevel({ name: 'L', walls: [...room(), wall('far', [[16, 5], [18, 5]])] }))
    h.click([1.5, 0.02])
    expect([...h.store.selection.lineIds]).toEqual(['n'])
    h.drag([1.5, 0.02], [11.53, 5])
    expect(h.store.level.walls.find(w => w.id === 'n')!.points).toEqual([[10, 5], [16, 5]])
  })

  it.each([
    ['room with a T and a crossing', () => [...room(), wall('t', [[3, 0], [3, 2]]), wall('x', [[2, -1], [2, 5]])]],
    ['the reference plan', () => wallsFromSvg(readFileSync(new URL('../fixtures/reference.svg', import.meta.url), 'utf8'))]
  ])('selecting every node and dragging translates %s rigidly', (_name, walls) => {
    const tool = createSelectTool()
    const h = harness(tool, createLevel({ name: 'L', walls: walls() }))
    const before = h.store.level.walls
    const nodes = buildEditGraph(before).nodes
    const xs = nodes.map(n => n.point[0])
    const ys = nodes.map(n => n.point[1])
    const corner: Vec2 = [Math.max(...xs) + 1, Math.max(...ys) + 1]
    h.down([Math.min(...xs) - 1, Math.min(...ys) - 1])
    h.move(corner)
    h.up(corner)
    expect(h.store.selection.nodeIds.size).toBe(nodes.length)
    const centre: Vec2 = [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2]
    const clear = (p: Vec2) => { const hit = h.ctx().hit.at(p); return !hit || hit.kind === 'room' }
    const start = Array.from({ length: 400 }, (_, i): Vec2 => [centre[0] + ((i % 20) - 10) * 0.05, centre[1] + (Math.floor(i / 20) - 10) * 0.05]).find(clear)!
    const delta: Vec2 = [0.731, -0.417]
    h.drag(start, [start[0] + delta[0], start[1] + delta[1]])
    expect(h.store.level.walls.map(w => w.points)).toEqual(before.map(w => w.points.map(p => quantize([p[0] + delta[0], p[1] + delta[1]]))))
  })

  it('alt-click removes a node and heals across it, in select and in the pen', () => {
    const tool = createSelectTool()
    const h = harness(tool, createLevel({ name: 'L', walls: [wall('a', [[0, 0], [4, 0]]), wall('b', [[4, 0], [4, 3]])] }))
    h.click([4.02, 0.01], { alt: true })
    expect(h.store.level.walls.map(w => w.points)).toEqual([[[0, 0], [4, 3]]])
    expect(h.store.history.at(-1)).toBe('Remove node')
    expect(tool.state).toBe('idle')
    const pen = createWallPen()
    const p = harness(pen, createLevel({ name: 'L', walls: [wall('a', [[0, 0], [4, 0]]), wall('b', [[4, 0], [4, 3]])] }))
    p.click([0, 5])
    p.click([4.02, 0.01], { alt: true })
    expect(p.store.level.walls.map(w => w.points)).toEqual([[[0, 0], [4, 3]]])
    expect(pen.state).toBe('drawing')
  })

  it('pressing on a crossing selects a wall instead of grabbing the invisible junction', () => {
    const tool = createSelectTool()
    const h = harness(tool, createLevel({ name: 'L', walls: [wall('h', [[-2, 0], [4, 0]]), wall('v', [[0, -2], [0, 3]])] }))
    h.down([0.02, 0.01])
    expect(tool.state).toBe('pendingDrag')
    h.up([0.02, 0.01])
    expect(tool.state).toBe('idle')
    expect(h.store.selection.nodeIds.size).toBe(0)
    expect(h.store.selection.lineIds.size).toBe(1)
    h.drag([0.02, 0.01], [1.02, 1.01])
    expect(h.store.level.walls.map(w => w.points)).toEqual([[[-1, 1], [5, 1]], [[0, -2], [0, 3]]])
  })

  it('dragging a T node keeps the host wall attached', () => {
    const tool = createSelectTool()
    const walls = [...room(), wall('t', [[3, 0], [3, 2]])]
    const h = harness(tool, createLevel({ name: 'L', walls }))
    h.drag([3, 0], [3.5, 0.5])
    const through = h.store.level.walls.filter(w => w.points.some(p => p[0] === 3.5 && p[1] === 0.5)).map(w => w.id)
    expect(through.sort()).toEqual(['n', 'n.1', 't'])
    expect(wallTopology(h.store.level.walls).faces.length).toBe(1)
  })

  it('box selects nodes, then nudges and deletes them', () => {
    const tool = createSelectTool()
    const h = harness(tool, createLevel({ name: 'L', walls: room() }))
    h.drag([-1, -1], [1, 5])
    expect(tool.state).toBe('idle')
    expect(h.store.selection.nodeIds.size).toBe(2)
    h.key('ArrowLeft', { shift: true })
    expect(h.store.level.walls.find(w => w.id === 'w')!.points).toEqual([[-0.1, 4], [-0.1, 0]])
    expect(h.store.history.at(-1)).toBe('Nudge')
    expect(h.store.selection.nodeIds.has(nodeKey([-0.1, 0]))).toBe(true)
    h.key('Delete')
    expect(tool.state).toBe('idle')
    expect(h.store.level.walls.map(w => w.id)).toEqual(['e'])
    expect(h.store.history.at(-1)).toBe('Delete')
  })

  it('clicking a segment selects its wall and delete removes it', () => {
    const tool = createSelectTool()
    const h = harness(tool, createLevel({ name: 'L', walls: room() }))
    h.click([1.5, 0.03])
    expect([...h.store.selection.lineIds]).toEqual(['n'])
    h.key('Backspace')
    expect(h.store.level.walls.length).toBe(3)
  })

  it('dragging a selected wall by its body moves all its points; one wall has no box, so its end node drags that node alone', () => {
    const tool = createSelectTool()
    const h = harness(tool, createLevel({ name: 'L', walls: [wall('a', [[0, 0], [4, 0]]), wall('b', [[4, 0], [4, 3]])] }))
    h.click([1, 0.02])
    expect(tool.overlay(h.ctx()).some(o => o.type === 'bounds')).toBe(false)
    h.drag([1, 0.02], [2, 1.02])
    expect(h.store.level.walls.map(w => w.points)).toEqual([[[1, 1], [5, 1]], [[5, 1], [4, 3]]])
    expect([...h.store.selection.lineIds]).toEqual(['a'])
    h.move([5, 1])
    expect(tool.cursor(h.ctx())).toBe('arrow')
    h.drag([5, 1], [6, 1])
    expect(h.store.level.walls.map(w => w.points)).toEqual([[[1, 1], [6, 1]], [[6, 1], [4, 3]]])
    expect([...h.store.selection.nodeIds]).toEqual([nodeKey([6, 1])])
    expect(h.store.selection.lineIds.size).toBe(0)
  })

  it('selection changes are history entries that undo replays in reverse, as in Figma', () => {
    const tool = createSelectTool()
    const h = harness(tool, createLevel({ name: 'L', walls: room() }))
    const corners: Vec2[] = [[0, 0], [6, 0], [6, 4], [0, 4]]
    for (const c of corners) h.click(c)
    expect(h.store.history).toEqual(['Open', 'Select', 'Select', 'Select', 'Select'])
    for (let i = corners.length - 1; i >= 1; i--) {
      h.store.undo()
      expect([...h.store.selection.nodeIds]).toEqual([nodeKey(corners[i - 1])])
    }
    h.store.undo()
    expect(h.store.selection.nodeIds.size).toBe(0)
    h.store.redo()
    expect([...h.store.selection.nodeIds]).toEqual([nodeKey(corners[0])])
    h.click(corners[0])
    expect(h.store.history).toEqual(['Open', 'Select'])
  })

  it('a drag records its selection with the move, and undo restores both', () => {
    const tool = createSelectTool()
    const h = harness(tool, createLevel({ name: 'L', walls: room() }))
    h.click([0, 0])
    h.drag([6, 0], [7, -1])
    expect(h.store.history).toEqual(['Open', 'Select', 'Move'])
    expect([...h.store.selection.nodeIds]).toEqual([nodeKey([7, -1])])
    h.store.undo()
    expect(h.store.level.walls).toEqual(room())
    expect([...h.store.selection.nodeIds]).toEqual([nodeKey([0, 0])])
    h.key('Escape')
    expect(h.store.history.at(-1)).toBe('Select')
    expect(h.store.selection.nodeIds.size).toBe(0)
    h.key('Escape')
    expect(h.store.history).toEqual(['Open', 'Select', 'Select'])
  })

  it('shift-click that deselects, delete and alt-click each leave the selection consistent', () => {
    const tool = createSelectTool()
    const h = harness(tool, createLevel({ name: 'L', walls: room() }))
    h.click([0, 0])
    h.click([6, 0], { shift: true })
    h.click([0, 0], { shift: true })
    expect([...h.store.selection.nodeIds]).toEqual([nodeKey([6, 0])])
    h.click([3, 0.02], { shift: true })
    h.click([6.02, 0.01], { alt: true })
    expect(h.store.history.at(-1)).toBe('Remove node')
    expect(h.store.level.walls.length).toBe(3)
    expect(h.store.selection.nodeIds.size).toBe(0)
    expect(h.store.selection.lineIds.size).toBe(0)
    h.click([6, 4])
    h.key('Delete')
    expect(h.store.selection.nodeIds.size).toBe(0)
    h.store.undo()
    expect([...h.store.selection.nodeIds]).toEqual([nodeKey([6, 4])])
  })

  it('a locked wall layer cannot be hit, boxed or dragged, but is still snapped to', () => {
    const tool = createSelectTool()
    const h = harness(tool, createLevel({ name: 'L', walls: room() }))
    h.layers = { ...DEFAULT_LAYERS, walls: { hidden: false, locked: true } }
    h.click([6, 0])
    h.click([3, 0.02])
    h.drag([-1, -1], [7, 5])
    expect(h.store.history).toEqual(['Open'])
    expect(h.store.selection.nodeIds.size).toBe(0)
    expect(h.ctx().targets.nodes.length).toBeGreaterThan(0)
  })

  it('shows the box while box selecting', () => {
    const tool = createSelectTool()
    const h = harness(tool, createLevel({ name: 'L', walls: room() }))
    h.down([-1, -1])
    h.move([2, 2])
    expect(tool.state).toBe('boxSelecting')
    expect(tool.overlay(h.ctx()).some(o => o.type === 'box')).toBe(true)
    h.key('Escape')
    expect(tool.state).toBe('idle')
  })

  it('shift pressed mid-drag re-snaps the preview without the pointer moving', () => {
    const tool = createSelectTool()
    const h = harness(tool, createLevel({ name: 'L', walls: [wall('a', [[0, 0], [4, 0]])] }))
    h.down([4, 0])
    h.move([3, 0.3])
    expect(h.store.working.walls[0].points[1]).toEqual([3, 0.3])
    h.modifiers({ shift: true })
    expect(h.store.working.walls[0].points[1]).toEqual([3, 0])
    h.up([3, 0.3], { shift: true })
    expect(h.store.level.walls[0].points[1]).toEqual([3, 0])
  })

  it('a selection of two or more points shows a snug transform box; dragging an edge scales that axis, a corner both, Shift keeps proportions', () => {
    const tool = createSelectTool()
    const h = harness(tool, createLevel({ name: 'L', walls: room() }))
    h.drag([-1, -1], [7, 5])
    expect(h.store.selection.nodeIds.size).toBe(4)
    expect(tool.overlay(h.ctx()).find(o => o.type === 'bounds')).toMatchObject({ box: { minX: 0, minY: 0, maxX: 6, maxY: 4 } })
    h.drag([6, 2], [9, 2])
    expect(h.store.level.walls.find(w => w.id === 'e')!.points).toEqual([[9, 0], [9, 4]])
    expect(h.store.history.at(-1)).toBe('Scale')
    expect(h.store.selection.nodeIds.has(nodeKey([9, 4]))).toBe(true)
    h.drag([3, 4], [3, 6])
    expect(h.store.level.walls.find(w => w.id === 'e')!.points).toEqual([[9, 0], [9, 6]])
    h.move([9.03, 3])
    expect(tool.cursor(h.ctx())).toBe('resize@0')
    h.move([4, 3])
    expect(tool.cursor(h.ctx())).toBe('move')
    h.store.undo()
    h.store.undo()
    expect(h.store.level.walls).toEqual(room())
  })

  it('a box corner that is not a node scales both axes, uniformly under Shift, and the box stays shown while transforming', () => {
    const tool = createSelectTool()
    const h = harness(tool, createLevel({ name: 'L', fixtureLines: [{ id: 'd', points: [[0, 0], [4, 3]] }] }))
    h.drag([-1, -1], [5, 4])
    h.move([4.02, 0.02])
    expect(tool.cursor(h.ctx())).toBe('resize@45')
    h.down([4.02, 0.02])
    h.move([6.02, -1.98])
    expect(tool.overlay(h.ctx()).some(o => o.type === 'bounds')).toBe(true)
    h.up([6.02, -1.98], { shift: true })
    expect(h.store.level.fixtureLines[0].points).toEqual([[0, -1.5], [6, 3]])
  })

  it('inside the box moves the whole selection; just outside a corner rotates, in 15° steps under Shift', () => {
    const tool = createSelectTool()
    const h = harness(tool, createLevel({ name: 'L', walls: room() }))
    h.drag([-1, -1], [7, 5])
    h.move([3, 2])
    expect(tool.cursor(h.ctx())).toBe('move')
    h.drag([3, 2], [4, 3])
    expect(h.store.level.walls.find(w => w.id === 'n')!.points).toEqual([[1, 1], [7, 1]])
    expect(h.store.history.at(-1)).toBe('Move')
    h.move([7.12, 5.12])
    expect(tool.cursor(h.ctx())).toBe('rotate@90')
    h.drag([7.12, 5.12], [4, 6.2], { shift: true })
    expect(h.store.history.at(-1)).toBe('Rotate')
    const n = h.store.level.walls.find(w => w.id === 'n')!
    const angle = Math.atan2(n.points[1][1] - n.points[0][1], n.points[1][0] - n.points[0][0])
    const steps = angle / (Math.PI / 12)
    expect(Math.abs(steps - Math.round(steps))).toBeLessThan(1e-6)
    expect(angle).not.toBe(0)
  })

  it('an edge zone scales one axis; a curve with both ends selected scales its handles', () => {
    const tool = createSelectTool()
    const h = harness(tool, createLevel({ name: 'L', fixtureLines: [
      { id: 'c', points: [[0, 0], [4, 0]], curve: [[1, 2], [3, 2]] },
      { id: 'd', points: [[4, 0], [4, 3]] }
    ] }))
    h.drag([-1, -1], [5, 4])
    h.drag([4, 1.5], [8, 1.5])
    const c = h.store.level.fixtureLines.find(l => l.id === 'c')!
    expect(c.points).toEqual([[0, 0], [8, 0]])
    expect(c.curve).toEqual([[2, 2], [6, 2]])
    expect(h.store.level.fixtureLines.find(l => l.id === 'd')!.points).toEqual([[8, 0], [8, 3]])
  })

  it('a single node has no box; the box wins over every node on it, selected or not: a drag there scales, a click selects the node, Shift toggles it', () => {
    const tool = createSelectTool()
    const h = harness(tool, createLevel({ name: 'L', walls: room() }))
    h.click([6, 0])
    expect(tool.overlay(h.ctx()).some(o => o.type === 'bounds')).toBe(false)
    h.drag([-1, -1], [7, 5])
    h.move([6, 0])
    expect(tool.cursor(h.ctx())).toBe('resize@45')
    expect(tool.overlay(h.ctx()).some(o => o.type === 'hover')).toBe(false)
    h.drag([6, 0], [9, -2])
    expect(h.store.history.at(-1)).toBe('Scale')
    expect(h.store.level.walls.find(w => w.id === 'e')!.points).toEqual([[9, -2], [9, 4]])
    h.click([9, -2], { shift: true })
    expect(h.store.selection.nodeIds.size).toBe(3)
    expect(h.store.history.at(-1)).toBe('Select')
    h.move([9, -2])
    expect(tool.cursor(h.ctx())).toBe('resize@45')
    h.click([9, -2])
    expect([...h.store.selection.nodeIds]).toEqual([nodeKey([9, -2])])
    h.drag([-1, -3], [10, 5])
    h.click([8.93, -1.93])
    expect([...h.store.selection.nodeIds]).not.toEqual([nodeKey([9, -2])])
  })

  it('a node on the box’s edge is not there for the hand while the box is shown, and at every corner the hand passes from scaling straight to rotating', () => {
    for (const walls of [room(), [wall('v', [[2, 0], [2, 4]])], [wall('a', [[0, 0], [4, 0]]), wall('b', [[4, 0], [4, 3]]), wall('m', [[2, 0], [2, -0.5]])]]) {
      const tool = createSelectTool()
      const h = harness(tool, createLevel({ name: 'L', walls }))
      h.drag([-1, -2], [7, 5])
      const box = tool.overlay(h.ctx()).find(o => o.type === 'bounds')
      expect(box).toBeTruthy()
      const { minX, minY, maxX, maxY } = (box as { box: { minX: number; minY: number; maxX: number; maxY: number } }).box
      const onEdge = h.ctx().graph.nodes.filter(n => [n.point[0] - minX, n.point[0] - maxX, n.point[1] - minY, n.point[1] - maxY].some(d => Math.abs(d) < 1e-9))
      expect(onEdge.length).toBeGreaterThan(1)
      for (const node of onEdge) {
        for (let k = 0; k < 16; k++) {
          for (const r of [0, 0.03, 0.05, 0.07, 0.099]) {
            const p: Vec2 = [node.point[0] + r * Math.cos((k * Math.PI) / 8), node.point[1] + r * Math.sin((k * Math.PI) / 8)]
            h.move(p)
            const hover = tool.overlay(h.ctx()).find(o => o.type === 'hover')
            expect(hover && hover.type === 'hover' && hover.hit.kind, `${node.id} at ${p}`).not.toBe('node')
            if (r < 0.059) expect(tool.cursor(h.ctx()), `${node.id} at ${p}`).toMatch(/^resize@/)
          }
        }
      }
      for (const corner of [[minX, minY], [maxX, minY], [minX, maxY], [maxX, maxY]] as Vec2[]) {
        const out: Vec2 = [corner[0] === minX ? -1 : 1, corner[1] === minY ? -1 : 1]
        for (let i = 0; i < 16; i++) {
          for (let j = 0; j < 16; j++) {
            const p: Vec2 = [corner[0] + (out[0] * i) / 100, corner[1] + (out[1] * j) / 100]
            h.move(p)
            expect(tool.cursor(h.ctx()), `corner ${corner} at ${p}`).toMatch(/^(resize|rotate)@/)
          }
        }
      }
    }
  })

  it('a selected wall’s face keeps its strip beside the box’s edge, on both sides, however thin the wall', () => {
    for (const width of [0.02, 0.1, 0.3]) {
      const tool = createSelectTool()
      const walls = room().map(w => (w.id === 'e' ? { ...w, width } : w))
      const h = harness(tool, createLevel({ name: 'L', walls }))
      h.doubleClick([6, 1])
      expect(h.store.selection.lineIds.size).toBe(4)
      for (const side of [1, -1]) {
        for (const d of [Math.max(0.065, width / 2 - Math.min(0.1, width / 4) + 0.005), width / 2 + 0.095]) {
          h.move([6 + side * d, 1])
          const hover = tool.overlay(h.ctx()).find(o => o.type === 'hover')
          expect(hover, `${width} at ${side * d}`).toMatchObject({ hit: { kind: 'line', lineId: 'e', part: 'face' } })
          expect(tool.cursor(h.ctx())).toBe('resize@0')
        }
        h.move([6 + side * 0.05, 1])
        expect(tool.overlay(h.ctx()).some(o => o.type === 'hover'), `${width} at ${side * 0.05}`).toBe(false)
        expect(tool.cursor(h.ctx())).toBe('resize@0')
      }
    }
  })

  it('inside the box, as in Figma: a click on a node selects just that node, a drag from it moves the whole selection, selected or not', () => {
    const tool = createSelectTool()
    const h = harness(tool, createLevel({ name: 'L', walls: [...room(), wall('t', [[3, 0], [3, 2]])] }))
    h.drag([-1, -1], [7, 5])
    expect(h.store.selection.nodeIds.size).toBe(6)
    h.move([3, 2])
    expect(tool.cursor(h.ctx())).toBe('move')
    expect(tool.overlay(h.ctx()).find(o => o.type === 'hover')).toMatchObject({ hit: { kind: 'node' } })
    h.drag([3, 2], [4, 3])
    expect(h.store.history.at(-1)).toBe('Move')
    expect(h.store.level.walls.find(w => w.id === 'n')!.points).toEqual([[1, 1], [4, 1]])
    expect(h.store.selection.nodeIds.size).toBe(6)
    h.click([4, 3])
    expect([...h.store.selection.nodeIds]).toEqual([nodeKey([4, 3])])
    h.drag([0, -1], [8, 6])
    h.click([4.02, 1.5])
    expect([...h.store.selection.lineIds]).toEqual(['t'])
    expect(h.store.selection.nodeIds.size).toBe(0)
  })

  it('a one-dimensional selection scales along its axis from either end', () => {
    const tool = createSelectTool()
    const h = harness(tool, createLevel({ name: 'L', walls: [wall('v', [[2, 0], [2, 4]])] }))
    h.drag([1, -1], [3, 5])
    h.move([2, 4])
    expect(tool.cursor(h.ctx())).toBe('resize@90')
    h.drag([2, 4], [2.5, 6])
    expect(h.store.level.walls[0].points).toEqual([[2, 0], [2, 6]])
    h.move([2, 2])
    expect(tool.cursor(h.ctx())).toBe('move')
  })

  it('a wide wall is hit anywhere in its band', () => {
    const tool = createSelectTool()
    const h = harness(tool, createLevel({ name: 'L', walls: [wall('w', [[0, 0], [4, 0]], 0.5)] }))
    h.click([2, 0.2])
    expect([...h.store.selection.lineIds]).toEqual(['w'])
    h.key('Escape')
    h.click([2, 0.35])
    expect(h.store.selection.lineIds.size).toBe(0)
  })

  it('pressing on a line and dragging selects it and moves it in one gesture', () => {
    const tool = createSelectTool()
    const h = harness(tool, createLevel({ name: 'L', walls: [wall('a', [[0, 0], [4, 0]]), wall('far', [[10, 10], [12, 10]])] }))
    h.drag([1, 0.02], [1, 1.02])
    expect([...h.store.selection.lineIds]).toEqual(['a'])
    expect(h.store.level.walls[0].points).toEqual([[0, 1], [4, 1]])
    expect(h.store.history).toEqual(['Open', 'Move'])
    h.click([1, 1.02], { shift: true })
    expect(h.store.selection.lineIds.size).toBe(0)
  })

  it('a scaled edge lands exactly on what it snaps to, wherever inside the zone it was grabbed', () => {
    const tool = createSelectTool()
    const h = harness(tool, createLevel({ name: 'L', walls: [wall('w', [[0, 3], [6, 3]], 0.2)], fixtureLines: [line('a', [[1, 1], [3, 1]]), line('b', [[3, 1], [3, 2]]), line('c', [[3, 2], [1, 2]]), line('d', [[1, 2], [1, 1]])] }))
    h.drag([0.5, 0.5], [3.5, 2.5])
    h.drag([2, 2.04], [2, 2.87])
    expect(h.store.level.fixtureLines.find(l => l.id === 'c')!.points).toEqual([[3, 2.9], [1, 2.9]])
  })

  it('a body drag carries the nodes, never the press point: passing a node with the hand does not snap the selection', () => {
    const tool = createSelectTool()
    const h = harness(tool, createLevel({ name: 'L', walls: [wall('a', [[0, 0], [4, 0]]), wall('b', [[4, 0], [4, 3]]), wall('lone', [[10, 10], [12, 10]])] }))
    h.click([10.5, 10.02])
    h.drag([10.5, 10.02], [4.03, 3.02])
    const ends = () => h.store.level.walls.filter(w => w.id.startsWith('lone')).flatMap(w => w.points).map(p => p.join(',')).sort()
    expect(ends()).toEqual(['3.53,3', '4,3', '4,3', '5.53,3'])
  })

  it('under Shift a body drag draws the lock ray through every carried node', () => {
    const tool = createSelectTool()
    const h = harness(tool, createLevel({ name: 'L', walls: [wall('lone', [[10, 10], [12, 10]])] }))
    h.click([10.5, 10.02])
    h.down([10.5, 10.02])
    h.move([12.5, 10.2], { shift: true })
    const rays = tool.overlay(h.ctx()).filter(o => o.type === 'guide' && o.guide.type === 'line' && o.guide.style === 'angle')
    expect(rays.length).toBe(2)
    h.up([12.5, 10.2], { shift: true })
    expect(h.store.level.walls[0].points).toEqual([[12, 10], [14, 10]])
  })
})

describe('a press is not a drag: where the hand lands on a thing moves nothing', () => {
  const offsets = (reach: number): Vec2[] => [0, 0.03, 0.06, 0.09].slice(0, reach).flatMap(r => Array.from({ length: 8 }, (_, k): Vec2 => [r * Math.cos((k * Math.PI) / 4), r * Math.sin((k * Math.PI) / 4)]))

  it('a click anywhere within a node’s reach, with a hand’s jitter under the drag threshold, moves nothing; a drag moves the node by the hand’s travel, not to where it pressed', () => {
    for (const off of offsets(4)) {
      const tool = createSelectTool()
      const h = harness(tool, createLevel({ name: 'L', walls: [wall('a', [[0, 0], [4, 0]])] }))
      const press: Vec2 = [4 + off[0], off[1]]
      h.down(press)
      h.move([press[0] + 0.01, press[1]])
      h.up([press[0] + 0.01, press[1]])
      expect(h.store.level.walls[0].points, `${off}`).toEqual([[0, 0], [4, 0]])
      expect(h.store.history.at(-1), `${off}`).not.toBe('Move')
      h.drag(press, [press[0] + 0.37, press[1] + 0.61])
      expect(h.store.level.walls[0].points[1], `${off}`).toEqual([4.37, 0.61])
    }
  })

  it('a click anywhere within a curve handle’s reach moves nothing; a drag moves the handle by the hand’s travel', () => {
    for (const off of offsets(4)) {
      const tool = createSelectTool()
      const h = harness(tool, createLevel({ name: 'L', fixtureLines: [{ id: 'c', points: [[0, 0], [4, 0]], curve: [[1, 2], [3, 2]] }] }))
      h.click([0.906, 1.125])
      h.store.select(selectionOf([], ['c']))
      const press: Vec2 = [1 + off[0], 2 + off[1]]
      h.down(press)
      h.move([press[0] + 0.01, press[1]])
      h.up([press[0] + 0.01, press[1]])
      expect(h.store.level.fixtureLines[0].curve, `${off}`).toEqual([[1, 2], [3, 2]])
      h.drag(press, [press[0] + 0.37, press[1] + 0.61])
      expect(h.store.level.fixtureLines[0].curve![0], `${off}`).toEqual([1.37, 2.61])
    }
  })
})

describe('a face moves the stored nodes on its boundary, and moves only once selected', () => {
  const rect = (prefix: string, x0: number, y0: number, x1: number, y1: number): Line[] => [
    line(`${prefix}1`, [[x0, y0], [x1, y0]]),
    line(`${prefix}2`, [[x1, y0], [x1, y1]]),
    line(`${prefix}3`, [[x1, y1], [x0, y1]]),
    line(`${prefix}4`, [[x0, y1], [x0, y0]])
  ]
  const wallRect = (prefix: string, x0: number, y0: number, x1: number, y1: number): Wall[] => rect(prefix, x0, y0, x1, y1).map(l => ({ ...l, width: 0.1 }))
  /** Three rooms as an L: 2 over 3 on the left, 1 to the right of 2, the node between 2 and 3 not a corner of 1. */
  const lRooms = (): Wall[] => [
    wall('t1', [[0, 2], [2, 2]], 0.1), wall('t2', [[2, 2], [5, 2]], 0.1), wall('r', [[5, 2], [5, 1]], 0.1), wall('b1', [[5, 1], [2, 1]], 0.1),
    wall('m', [[2, 1], [2, 2]], 0.1), wall('l1', [[0, 2], [0, 1]], 0.1), wall('l2', [[0, 1], [0, 0]], 0.1), wall('b2', [[0, 1], [1.5, 1]], 0.1),
    wall('b3', [[1.5, 1], [2, 1]], 0.1), wall('r3', [[1.5, 1], [1.5, 0]], 0.1), wall('b4', [[1.5, 0], [0, 0]], 0.1)
  ]
  const scenes: [string, () => { walls?: Wall[]; fixtureLines?: Line[] }][] = [
    ['two overlapping rectangles', () => ({ fixtureLines: [...rect('a', 0, 0, 4, 3), ...rect('b', 2, 1, 7, 5)] })],
    ['an L of squares and a separate rectangle', () => ({ fixtureLines: [...[0, 1, 2].flatMap(i => rect(`q${i}`, i, 0, i + 1, 1)), ...rect('u', 0, 1, 1, 2), ...rect('far', 5, 5, 7, 6)] })],
    ['a rectangle inside another', () => ({ fixtureLines: [...rect('o', 0, 0, 6, 6), ...rect('i', 2, 2, 4, 4)] })],
    ['rooms as an L', () => ({ walls: lRooms() })],
    ['rooms crossing without a shared node', () => ({ walls: [...wallRect('tall', 0, 0, 3, 6), ...wallRect('wide', 2, 2, 6, 4)] })],
    ['rooms with corners off the kernel grid', () => ({ walls: [...wallRect('p', 0.123457, 0.234561, 2.345673, 1.456781), ...wallRect('q', 2.345673, 0.234561, 4.567893, 1.456781)] })]
  ]
  const shape = (h: ReturnType<typeof harness>) => [...h.store.level.walls, ...h.store.level.fixtureLines].map(l => `${l.id}:${l.points.join(';')}`).sort()
  /** The stored points on a face's boundary, read from the lines themselves. */
  const storedCorners = (lines: Line[], rings: Vec2[][], layer: 'walls' | 'fixtures') =>
    [...new Set(lines.flatMap(l => l.points).filter(p => rings.flat().some(c => Math.abs(c[0] - p[0]) < 1e-4 && Math.abs(c[1] - p[1]) < 1e-4)).map(p => nodeKey(p, layer)))]

  it.each(scenes)('%s: every face moved gives the same plan as its stored boundary nodes moved', (_name, make) => {
    const faces = (() => {
      const h = harness(createSelectTool(), createLevel({ name: 'L', ...make() }))
      return [...h.store.level.fixtures.map(f => ({ anchor: f.anchor, room: false })), ...h.store.level.units.map(u => ({ anchor: u.anchor, room: true }))]
    })()
    expect(faces.length).toBeGreaterThan(1)
    /** The same face in another store over the same lines: ids are fresh per store, anchors are not. */
    const find = (level: ReturnType<typeof createLevel>, face: (typeof faces)[number]) => {
      const same = (a: Vec2) => a[0] === face.anchor[0] && a[1] === face.anchor[1]
      return face.room ? level.units.find(u => same(u.anchor))! : level.fixtures.find(f => same(f.anchor))!
    }
    for (const face of faces) {
      const byFace = harness(createSelectTool(), createLevel({ name: 'L', ...make() }))
      const id = find(byFace.store.level, face).id
      byFace.store.select(face.room ? selectionOf([], [], [], [], [id]) : selectionOf([], [], [id]))
      byFace.key('ArrowDown', { shift: true })
      const byNodes = harness(createSelectTool(), createLevel({ name: 'L', ...make() }))
      const level = byNodes.store.level
      const found = find(level, face)
      const f = 'polygon' in found && found.polygon ? found.polygon : { outer: (found as { line: Vec2[] }).line, holes: [] }
      const corners = storedCorners(face.room ? level.walls : level.fixtureLines, [f.outer, ...f.holes], face.room ? 'walls' : 'fixtures')
      expect(corners.length, `${face.anchor}`).toBeGreaterThan(0)
      const before = shape(byNodes)
      byNodes.store.select(selectionOf(corners))
      byNodes.key('ArrowDown', { shift: true })
      expect(shape(byNodes), `${face.anchor}`).not.toEqual(before)
      expect(shape(byFace), `${face.anchor}`).toEqual(shape(byNodes))
    }
  })

  it('room 3 of the L dragged down stretches room 2 and bends the wall to room 1, as its four nodes would', () => {
    const h = harness(createSelectTool(), createLevel({ name: 'L', walls: lRooms() }))
    const three = h.store.level.units.find(u => pointInRing([0.7, 0.5], u.polygon.outer))!
    h.store.select(selectionOf([], [], [], [], [three.id]))
    h.key('ArrowDown', { shift: true })
    const points = new Set(h.store.level.walls.flatMap(w => w.points.map(p => p.join(','))))
    for (const p of ['0,-0.1', '1.5,-0.1', '0,0.9', '1.5,0.9', '2,1', '0,2', '5,1']) expect(points, p).toContain(p)
    for (const p of ['0,0', '1.5,0', '0,1', '1.5,1']) expect(points, p).not.toContain(p)
  })

  it('rooms crossing without a shared node: moving the overlap moves only its two stored corners, the crossings follow', () => {
    const h = harness(createSelectTool(), createLevel({ name: 'L', walls: [...wallRect('tall', 0, 0, 3, 6), ...wallRect('wide', 2, 2, 6, 4)] }))
    const overlap = h.store.level.units.find(u => pointInRing([2.5, 3], u.polygon.outer))!
    h.store.select(selectionOf([], [], [], [], [overlap.id]))
    h.key('ArrowUp', { shift: true })
    const points = new Set(h.store.level.walls.flatMap(w => w.points.map(p => p.join(','))))
    for (const p of ['2,2.1', '2,4.1', '6,2', '6,4', '3,0', '3,6']) expect(points, p).toContain(p)
  })

  for (const [what, level, inside, other] of [
    ['a fixture', () => createLevel({ name: 'L', fixtureLines: [...rect('a', 0, 0, 2, 2), ...rect('b', 4, 0, 6, 2)] }), [1, 1], [5, 1]],
    ['a room', () => createLevel({ name: 'L', walls: [...wallRect('a', 0, 0, 2, 2), ...wallRect('b', 4, 0, 6, 2)] }), [1, 1], [5, 1]]
  ] as [string, () => ReturnType<typeof createLevel>, Vec2, Vec2][]) {
    it(`${what}: a press and drag on it unselected box-selects and moves nothing; a click selects it, and then a drag moves it; Shift adds and removes`, () => {
      const tool = createSelectTool()
      const h = harness(tool, level())
      const before = shape(h)
      const faceAt = (p: Vec2) => [...h.store.level.fixtures.filter(f => f.polygon && pointInRing(p, f.polygon.outer)).map(f => f.id), ...h.store.level.units.filter(u => pointInRing(p, u.polygon.outer)).map(u => u.id)]
      const faces = () => [...h.store.selection.fixtureIds, ...h.store.selection.unitIds]
      h.drag(inside, [inside[0] + 3.5, inside[1] + 1.5])
      expect(shape(h)).toEqual(before)
      expect(faces()).toEqual([])
      expect(h.store.selection.nodeIds.size).toBeGreaterThan(0)
      h.click(inside)
      expect(faces()).toEqual(faceAt(inside))
      h.move(inside)
      expect(tool.cursor(h.ctx())).toBe('move')
      h.drag(inside, [inside[0] + 0.3, inside[1] + 0.2])
      expect(h.store.history.at(-1)).toBe('Move')
      expect(shape(h)).not.toEqual(before)
      h.click(other, { shift: true })
      expect(faces().length).toBe(2)
      h.click([inside[0] + 0.3, inside[1] + 0.2], { shift: true })
      expect(faces()).toEqual(faceAt(other))
    })
  }

  it('box select picks the lines and rooms lying wholly inside, with their nodes, and not a line the box cuts, a curve bulging out of it included', () => {
    const tool = createSelectTool()
    const h = harness(tool, createLevel({ name: 'L', walls: room(), fixtureLines: [line('inner', [[1, 2], [2, 2]]), { id: 'arc', points: [[1, 1], [2, 1]], curve: [[1, -4], [2, -4]] }] }))
    h.drag([-1, -1], [7, 5])
    expect(h.store.selection.nodeIds.size).toBe(8)
    expect([...h.store.selection.lineIds].sort()).toEqual(['e', 'inner', 'n', 's', 'w'])
    expect(h.store.selection.unitIds.size).toBe(1)
    h.key('Escape')
    h.drag([-1, -1], [3, 5])
    expect([...h.store.selection.lineIds].sort()).toEqual(['inner', 'w'])
    expect(h.store.selection.unitIds.size).toBe(0)
  })

  it('the store keeps a selection to what exists: an edit that takes a thing away takes it out of the selection, and undo brings both back', () => {
    const store = createEditorStore(createLevel({ name: 'L', walls: room(), fixtureLines: rect('f', 1, 1, 2, 2) }))
    const fixture = store.level.fixtures[0].id
    const selection = selectionOf([nodeKey([0, 0]), nodeKey([1, 1], 'fixtures')], ['n', 'f1'], [fixture])
    store.select(selection)
    store.commit('Remove', [{ type: 'removeLines', layer: 'fixtures', ids: ['f1', 'f2', 'f3', 'f4'] }])
    expect([...store.selection.lineIds]).toEqual(['n'])
    expect([...store.selection.nodeIds]).toEqual([nodeKey([0, 0])])
    expect(store.selection.fixtureIds.size).toBe(0)
    store.undo()
    expect(store.selection).toEqual(selection)
  })
})

describe('plus and minus step the width of every selected wall', () => {
  it('a centimetre per press, five under Shift, each wall from its own width, never past the limits, unselected walls untouched', () => {
    const tool = createSelectTool()
    const h = harness(tool, createLevel({ name: 'L', walls: [wall('a', [[0, 0], [4, 0]], 0.16), wall('b', [[0, 3], [4, 3]], 0.3), wall('c', [[0, 6], [4, 6]], 0.16)] }))
    const widths = () => Object.fromEntries(h.store.level.walls.map(w => [w.id, w.width]))
    h.click([1, 0.02])
    h.click([1, 3.02], { shift: true })
    h.key('+')
    expect(widths()).toEqual({ a: 0.17, b: 0.31, c: 0.16 })
    expect(h.store.history.at(-1)).toBe('Wall width')
    h.key('-', { shift: true })
    expect(widths()).toEqual({ a: 0.12, b: 0.26, c: 0.16 })
    for (let i = 0; i < 40; i++) h.key('-')
    expect(widths(), 'below the thinnest wall is an edge').toEqual({ a: 0, b: 0, c: 0.16 })
    const entries = h.store.history.length
    h.key('-')
    expect(h.store.history.length).toBe(entries)
    h.key('+')
    expect(widths(), 'an edge stepped up is the thinnest wall').toEqual({ a: 0.02, b: 0.02, c: 0.16 })
    h.key('-')
    expect(widths()).toEqual({ a: 0, b: 0, c: 0.16 })
    for (let i = 0; i < 40; i++) h.key('+', { shift: true })
    expect(widths()).toEqual({ a: 1, b: 1, c: 0.16 })
    expect(h.store.selection.lineIds).toEqual(new Set(['a', 'b']))
  })
})

describe('the rotate cursor wraps the corner the hand is outside of', () => {
  it('names the corner as its angle: top-left 0, top-right 90, bottom-right 180, bottom-left 270', () => {
    const tool = createSelectTool()
    const h = harness(tool, createLevel({ name: 'L', fixtureLines: [{ id: 'd', points: [[0, 0], [4, 3]] }] }))
    h.drag([-1, -1], [5, 4])
    for (const [p, angle] of [[[-0.1, 3.1], 0], [[4.1, 3.1], 90], [[4.1, -0.1], 180], [[-0.1, -0.1], 270]] as [Vec2, number][]) {
      h.move(p)
      expect(tool.cursor(h.ctx())).toBe(`rotate@${angle}`)
    }
  })
})

describe('a selected wall’s face is its width grip', () => {
  const widthOf = (h: ReturnType<typeof harness>, id: string) => h.store.level.walls.find(w => w.id === id)!.width

  it('dragging the face outward widens by twice the travel on whole centimetres, inward narrows, never past the limits; Escape reverts', () => {
    const tool = createSelectTool()
    const h = harness(tool, createLevel({ name: 'L', walls: [wall('a', [[0, 0], [6, 0]], 0.2)] }))
    h.click([1.5, 0.02])
    expect(tool.cursor(h.ctx())).toBe('move')
    h.move([1.5, 0.1])
    expect(tool.cursor(h.ctx())).toBe('resize@90')
    h.drag([1.5, 0.1], [1.5, 0.15])
    expect(widthOf(h, 'a')).toBe(0.3)
    expect(h.store.history.at(-1)).toBe('Wall width')
    h.drag([1.5, -0.15], [1.5, -0.08])
    expect(widthOf(h, 'a')).toBeCloseTo(0.16, 9)
    h.drag([1.5, 0.08], [1.5, 2])
    expect(widthOf(h, 'a')).toBe(1)
    h.drag([1.5, 0.5], [1.5, -3])
    expect(widthOf(h, 'a')).toBe(0.02)
    h.down([1.5, 0.01])
    h.move([1.5, 0.3])
    expect(h.store.working.walls[0].width).toBeCloseTo(0.6, 9)
    h.key('Escape')
    expect(widthOf(h, 'a')).toBe(0.02)
  })

  it('the grip cursor stands across the wall whichever way it runs, and an unselected wall’s face is just its body', () => {
    for (const [end, angle] of [[[6, 0], 90], [[0, 6], 0], [[6, 6], 45], [[-6, 6], 135]] as [Vec2, number][]) {
      const tool = createSelectTool()
      const h = harness(tool, createLevel({ name: 'L', walls: [wall('a', [[0, 0], end], 0.2)] }))
      const quarter: Vec2 = [end[0] / 4, end[1] / 4]
      const l = Math.hypot(end[0], end[1])
      const across: Vec2 = [-end[1] / l, end[0] / l]
      const onFace: Vec2 = [quarter[0] + across[0] * 0.1, quarter[1] + across[1] * 0.1]
      h.move(onFace)
      expect(tool.cursor(h.ctx())).toBe('arrow')
      h.click(onFace)
      expect([...h.store.selection.lineIds]).toEqual(['a'])
      h.move(onFace)
      expect(tool.cursor(h.ctx())).toBe(`resize@${angle}`)
      h.drag(onFace, [onFace[0] + across[0] * 0.05, onFace[1] + across[1] * 0.05])
      expect(widthOf(h, 'a')).toBeCloseTo(0.3, 9)
      expect(h.store.level.walls[0].points).toEqual([[0, 0], end])
    }
  })

  it('a selected door’s swing arc flips the hinge and its leaf the side, both with the flip cursor; an unselected door’s are just its body', () => {
    const tool = createSelectTool()
    const h = harness(tool, createLevel({ name: 'L', walls: [wall('a', [[0, 0], [6, 0]], 0.2)], openings: [{ id: 'd1', kind: 'door', at: [3, 0], width: 0.9, from: 0, to: 2.1, swing: { side: 1, hinge: 0 } }] }))
    const onArc: Vec2 = [2.55 + 0.9 * Math.SQRT1_2, 0.9 * Math.SQRT1_2]
    h.move(onArc)
    expect(tool.cursor(h.ctx())).toBe('arrow')
    h.click(onArc)
    expect(h.store.level.openings[0].swing).toEqual({ side: 1, hinge: 0 })
    expect([...h.store.selection.openingIds]).toEqual(['d1'])
    h.move(onArc)
    expect(tool.cursor(h.ctx())).toBe('flip@90')
    h.click(onArc)
    expect(h.store.level.openings[0].swing).toEqual({ side: 1, hinge: 1 })
    h.move([3.45, 0.5])
    expect(tool.cursor(h.ctx())).toBe('flip@0')
    h.click([3.45, 0.5])
    expect(h.store.level.openings[0].swing).toEqual({ side: -1, hinge: 1 })
    h.move([3, 0.03])
    expect(tool.cursor(h.ctx())).toBe('move')
  })
})

describe('a selected opening’s jambs are its width grips', () => {
  const opening = (kind: 'door' | 'window', at: Vec2, width = 0.9) => ({ id: 'o', kind, at, width, from: kind === 'door' ? 0 : 0.9, to: 2.1, ...(kind === 'door' ? { swing: { side: 1 as const, hinge: 0 as const } } : {}) })
  const jambsOf = (h: ReturnType<typeof harness>) => placeOpenings(h.store.level.openings, h.store.level.walls)[0].geometry.jambs
  const close = (a: Vec2, b: Vec2) => Math.hypot(a[0] - b[0], a[1] - b[1]) < 1e-6

  it('on every wall direction, for doors and windows and either jamb: a drag moves that jamb by the hand’s travel along the wall, the other stays; unselected, a jamb is just the body', () => {
    for (const [end, angle] of [[[6, 0], 0], [[0, 6], 90], [[6, 6], 135], [[-6, 6], 45]] as [Vec2, number][]) {
      for (const kind of ['door', 'window'] as const) {
        for (const jamb of [0, 1] as const) {
          const tool = createSelectTool()
          const mid: Vec2 = [end[0] / 2, end[1] / 2]
          const h = harness(tool, createLevel({ name: 'L', walls: [wall('a', [[0, 0], end], 0.2)], openings: [opening(kind, mid)] }))
          const before = jambsOf(h)
          const grip = before[jamb]
          const label = `${end} ${kind} ${jamb}`
          h.move(grip)
          expect(tool.cursor(h.ctx()), label).toBe('arrow')
          h.click(mid)
          expect([...h.store.selection.openingIds], label).toEqual(['o'])
          h.move(grip)
          expect(tool.cursor(h.ctx()), label).toBe(`resize@${angle}`)
          const out = [grip[0] - before[1 - jamb][0], grip[1] - before[1 - jamb][1]]
          const l = Math.hypot(out[0], out[1])
          const along: Vec2 = [out[0] / l, out[1] / l]
          h.drag(grip, [grip[0] + along[0] * 0.3, grip[1] + along[1] * 0.3])
          expect(h.store.level.openings[0].width, label).toBeCloseTo(1.2, 9)
          expect(h.store.history.at(-1), label).toBe('Opening width')
          expect(close(jambsOf(h)[1 - jamb], before[1 - jamb]), label).toBe(true)
          const now = jambsOf(h)[jamb]
          h.drag(now, [now[0] - along[0] * 0.5, now[1] - along[1] * 0.5])
          expect(h.store.level.openings[0].width, label).toBeCloseTo(0.7, 9)
          expect(close(jambsOf(h)[1 - jamb], before[1 - jamb]), label).toBe(true)
        }
      }
    }
  })

  it('stops where the wall stops allowing it, with its other jamb in place, and is still legal there', () => {
    const tool = createSelectTool()
    const h = harness(tool, createLevel({ name: 'L', walls: [wall('a', [[0, 0], [6, 0]], 0.2), wall('t', [[4, 0], [4, 2]], 0.16)], openings: [opening('door', [2, 0])] }))
    h.click([2, 0.03])
    const [left, right] = jambsOf(h)
    h.drag(right, [5.5, 0])
    const d = h.store.level.openings[0]
    const [l2, r2] = jambsOf(h)
    expect(close(l2, left)).toBe(true)
    expect(r2[0]).toBeLessThanOrEqual(3.92 + 1e-9)
    expect(r2[0]).toBeGreaterThanOrEqual(3.9)
    expect(fitOpening(d.at, d, h.store.level.walls, h.store.level.openings, 0.01)!.at).toEqual(d.at)
  })

  it('is held within the opening limits; a click on a jamb changes nothing, and Escape puts a stretch back', () => {
    const tool = createSelectTool()
    const h = harness(tool, createLevel({ name: 'L', walls: [wall('a', [[0, 0], [6, 0]], 0.2)], openings: [opening('door', [3, 0])] }))
    h.click([3, 0.03])
    const [left, right] = jambsOf(h)
    h.down(right)
    h.move([right[0] + 0.01, right[1]])
    h.up([right[0] + 0.01, right[1]])
    expect(h.store.level.openings[0].width).toBe(0.9)
    expect(h.store.history.at(-1)).toBe('Select')
    h.drag(right, [0, 0])
    expect(h.store.level.openings[0].width).toBe(0.1)
    expect(close(jambsOf(h)[0], left)).toBe(true)
    const now = jambsOf(h)[1]
    h.down(now)
    h.move([5, 0])
    expect(h.store.working.openings[0].width).toBeGreaterThan(0.1)
    h.key('Escape')
    expect(h.store.level.openings[0].width).toBe(0.1)
    expect(h.store.working.openings[0].width).toBe(0.1)
  })
})

describe('a selected table’s edges carry grips', () => {
  const table = () => {
    const h = harness(createSelectTool(), createLevel({ name: 'L', fixtureLines: [line('r0', [[0, 0], [2.4, 0]]), line('r1', [[2.4, 0], [2.4, 1.2]]), line('r2', [[2.4, 1.2], [0, 1.2]]), line('r3', [[0, 1.2], [0, 0]])] }))
    const id = h.store.level.fixtures[0].id
    h.store.commit('Table', [{ type: 'setFixture', fixtureId: id, patch: { kind: 'table', roles: { r0: 'seating', r1: 'seating', r2: 'seating', r3: 'seating' } } }])
    return { h, id, roles: () => h.store.level.fixtures.find(f => f.id === id)!.roles }
  }

  it('the chairs’ track runs along each line of the outline while the table is selected, and none otherwise', () => {
    const { h, id } = table()
    expect(fixtureGrips(h.store.selection, h.store.level)).toEqual([])
    h.click([1.2, 0.6])
    expect([...h.store.selection.fixtureIds]).toEqual([id])
    const track = fixtureGrips(h.store.selection, h.store.level).flatMap(g => (g.kind === 'track' ? [[g.lineId, g.on]] : []))
    expect(track.sort()).toEqual([['r0', true], ['r1', true], ['r2', true], ['r3', true]])
  })

  it('a click on the track between two chairs turns that edge off and on, one history entry each', () => {
    const { h, roles } = table()
    h.click([1.2, 0.6])
    const between: [number, number] = [0.8, -0.29]
    h.move(between)
    expect(h.ctx().hit.at(between)?.kind).toBe('grip')
    h.click(between)
    expect(roles()).toEqual({ r1: 'seating', r2: 'seating', r3: 'seating' })
    expect(h.store.history.at(-1)).toBe('Edge off')
    h.click(between)
    expect(roles()).toEqual({ r0: 'seating', r1: 'seating', r2: 'seating', r3: 'seating' })
    expect(h.store.history.at(-1)).toBe('Edge on')
  })

  it('unselected, the same click selects the line and turns nothing off', () => {
    const { h, roles } = table()
    h.click([0.7, 0])
    expect([...h.store.selection.lineIds]).toEqual(['r0'])
    expect(roles()).toEqual({ r0: 'seating', r1: 'seating', r2: 'seating', r3: 'seating' })
  })
})

describe('a drag ends where the hand ends, whatever way it went there', () => {
  type H = ReturnType<typeof harness>
  /**
   * The same drag twice from a fresh start, ending where the hand asks
   * for more than fits: straight there, and by way of points that fit and
   * points past every limit. A drag that remembered where it last fitted
   * would end the two apart.
   */
  const same = (what: string, setup: () => H, from: Vec2, to: Vec2, detour: Vec2[], read: (h: H) => unknown) => {
    const straight = setup()
    straight.down(from)
    straight.move(to)
    straight.up(to)
    const wandering = setup()
    wandering.down(from)
    for (const p of detour) wandering.move(p)
    wandering.move(to)
    wandering.up(to)
    expect(read(straight), what).not.toEqual(read(setup()))
    expect(read(wandering), what).toEqual(read(straight))
  }
  const tableWith = (parameters: Record<string, unknown>) => () => {
    const h = harness(createSelectTool(), createLevel({ name: 'L', fixtureLines: [line('r0', [[0, 0], [2.4, 0]]), line('r1', [[2.4, 0], [2.4, 1.2]]), line('r2', [[2.4, 1.2], [0, 1.2]]), line('r3', [[0, 1.2], [0, 0]])] }))
    const id = h.store.level.fixtures[0].id
    h.store.commit('Table', [{ type: 'setFixture', fixtureId: id, patch: { kind: 'table', roles: { r0: 'seating', r1: 'seating', r2: 'seating', r3: 'seating' }, recipe: { kind: 'table', version: 1, parameters } } }])
    h.click([1.2, 0.6])
    return h
  }
  const recipe = (h: H) => JSON.stringify(h.store.level.fixtures.find(f => f.kind === 'table')!.recipe)
  const grips = (h: H) => fixtureGrips(h.store.selection, h.store.level)
  const centre = (ring: Vec2[]): Vec2 => [ring.reduce((s, p) => s + p[0], 0) / ring.length, ring.reduce((s, p) => s + p[1], 0) / ring.length]

  it('the table’s gap and turn, one chair, one leg and the supports’ track', () => {
    const chairs = tableWith({})
    same('gap', chairs, [0.8, -0.29], [0.8, 0.9], [[0.8, -0.4], [0.8, -0.05], [0.8, -3], [3, -0.4], [0.8, 0.1]], recipe)
    same('turn', chairs, [0.8, -0.29], [1.5, -0.29], [[2.0, -0.3], [3.4, 0.6], [-0.8, 1.6], [2.3, -0.3]], recipe)
    const chair = centre((grips(chairs()).find(g => g.kind === 'chair') as { outline: Vec2[] }).outline)
    same('one chair', chairs, chair, [chair[0] + 1.2, chair[1]], [[chair[0] + 0.1, chair[1]], [chair[0] + 0.3, chair[1]], [chair[0] - 2, chair[1]], [3.5, 1], [chair[0] + 0.2, chair[1]]], recipe)
    const legs = tableWith({ supports: 'legs' })
    const track = (grips(legs()).find(g => g.kind === 'supportTrack') as { points: Vec2[] }).points
    const onTrack: Vec2 = [track[0][0] + (track[1][0] - track[0][0]) / 4, track[0][1] + (track[1][1] - track[0][1]) / 4]
    const inward = onTrack[1] < 0.6 ? 1 : -1
    same('the supports’ track', legs, onTrack, [onTrack[0], onTrack[1] + inward * 2], [[onTrack[0], onTrack[1] + inward * 0.05], [onTrack[0], onTrack[1] + inward * 0.2], [onTrack[0], onTrack[1] - inward * 2], [onTrack[0] + 1, onTrack[1]]], recipe)
    same('the supports’ track along', legs, onTrack, [onTrack[0] + 0.5, onTrack[1]], [[onTrack[0] + 0.1, onTrack[1]], [onTrack[0] + 1.5, onTrack[1] - 0.3], [onTrack[0] - 0.4, onTrack[1]], [onTrack[0] + 0.3, onTrack[1]]], recipe)
    const all = grips(legs()).flatMap(g => (g.kind === 'support' ? [g.point] : []))
    const [leg, next] = [all[0], all.slice(1).sort((a, b) => Math.hypot(a[0] - all[0][0], a[1] - all[0][1]) - Math.hypot(b[0] - all[0][0], b[1] - all[0][1]))[0]]
    same('one leg', legs, leg, next, [[leg[0] + (next[0] - leg[0]) * 0.3, leg[1] + (next[1] - leg[1]) * 0.3], [1.2, 0.6], [-1, 2], [leg[0] + (next[0] - leg[0]) * 0.6, leg[1] + (next[1] - leg[1]) * 0.6]], recipe)
  })

  it('a wall’s width, a door’s jamb and a door sliding along the walls', () => {
    const walls = () => harness(createSelectTool(), createLevel({ name: 'L', walls: [wall('a', [[0, 0], [6, 0]], 0.2), wall('e', [[6, 0], [6, 4]]), wall('s', [[6, 4], [0, 4]]), wall('w', [[0, 4], [0, 0]])], openings: [{ id: 'd', kind: 'door', at: [3, 0], width: 0.9, from: 0, to: 2.1, swing: { side: 1, hinge: 0 } }] }))
    const width = (h: H) => h.store.level.walls.find(w => w.id === 'a')!.width
    const door = (h: H) => JSON.stringify(h.store.level.openings[0])
    same('wall width', () => {
      const h = walls()
      h.click([1.2, 0.02])
      return h
    }, [1.2, 0.1], [1.2, 3], [[1.2, 0.2], [1.2, -2], [4, 0.5], [1.2, 0.3]], width)
    const selected = () => {
      const h = walls()
      h.click([3.1, 0])
      return h
    }
    same('jamb', selected, [3.45, 0], [8, 0], [[3.8, 0], [4.5, 0.02], [2, 0], [0.5, 0], [5, 0]], door)
    same('slide', selected, [3.1, 0], [3, 5], [[3.5, 0.1], [8, 3], [-3, 2], [6.5, 2]], door)
  })
})

describe('a line’s middle is a node not stored yet', () => {
  type Layer = 'walls' | 'fixtures'
  /** Lines 3 m long every 30°, straight and bowed, on both layers. */
  const lines = (): { name: string; layer: Layer; line: Line }[] =>
    Array.from({ length: 12 }, (_, k) => {
      const a = (k * Math.PI) / 6
      const d: Vec2 = [Math.cos(a) * 3, Math.sin(a) * 3]
      const from: Vec2 = [0.37, -0.21]
      const to: Vec2 = [from[0] + d[0], from[1] + d[1]]
      const bow = (f: number): Vec2 => [from[0] + d[0] * f - d[1] * 0.25, from[1] + d[1] * f + d[0] * 0.25]
      const straight: Line = { id: 'l', points: [from, to] }
      const curved: Line = { id: 'l', points: [from, to], curve: [bow(1 / 3), bow(2 / 3)] }
      return [
        { name: `wall at ${k * 30}°`, layer: 'walls' as Layer, line: { ...straight, width: 0.16 } as Line },
        { name: `curved wall at ${k * 30}°`, layer: 'walls' as Layer, line: { ...curved, width: 0.16 } as Line },
        { name: `fixture line at ${k * 30}°`, layer: 'fixtures' as Layer, line: straight },
        { name: `curved fixture line at ${k * 30}°`, layer: 'fixtures' as Layer, line: curved }
      ]
    }).flat()
  const levelWith = (layer: Layer, line: Line) => createLevel({ name: 'L', ...(layer === 'walls' ? { walls: [line as Wall] } : { fixtureLines: [line] }) })
  const linesIn = (h: ReturnType<typeof harness>, layer: Layer) => (layer === 'walls' ? h.store.level.walls : h.store.level.fixtureLines)
  const around = (p: Vec2): Vec2[] => [[0, 0], [0.04, 0], [0, -0.06], [-0.05, 0.05], [0.06, 0.06]].map(([x, y]) => [p[0] + x, p[1] + y])

  it('any line shows its middle while the hand is on it, and a click there puts a node exactly where it showed, selects it, and leaves the line’s shape as it was', () => {
    for (const { name, layer, line } of lines()) {
      const middle = lineMiddle(line)
      for (const press of around(middle)) {
        const tool = createSelectTool()
        const h = harness(tool, levelWith(layer, line))
        h.move(pointOnLine(line, 0.2))
        expect(tool.overlay(h.ctx()).find(o => o.type === 'hover'), name).toMatchObject({ hit: { kind: 'line', part: 'body', middle } })
        h.move(press)
        expect(tool.overlay(h.ctx()).find(o => o.type === 'hover'), `${name}, hand at ${press}`).toMatchObject({ hit: { kind: 'line', part: 'middle', middle } })
        expect(tool.cursor(h.ctx()), name).toBe('arrow-add')
        h.click(press)
        const pieces = linesIn(h, layer)
        expect(pieces.length, name).toBe(2)
        const node = pieces[0].points[1]
        expect(pieces[1].points[0], name).toEqual(node)
        expect(Math.hypot(node[0] - middle[0], node[1] - middle[1]), name).toBeLessThan(1e-6)
        expect([...h.store.selection.nodeIds], name).toEqual([nodeKey(node, layer)])
        expect(h.store.history, name).toEqual(['Open', 'Add node'])
        for (const piece of pieces) for (let t = 0; t <= 1; t += 0.1) {
          const p = pointOnLine(piece, t)
          const back = projectOntoLine(line, p).point
          expect(Math.hypot(p[0] - back[0], p[1] - back[1]), `${name}, ${piece.id} at ${t.toFixed(1)}`).toBeLessThan(1e-5)
        }
      }
    }
  })

  it('a drag from a line’s middle puts the node there and carries it by the hand’s travel; Escape keeps the node where it was put', () => {
    const tool = createSelectTool()
    const h = harness(tool, createLevel({ name: 'L', walls: [wall('a', [[0, 0], [4, 0]])] }))
    h.drag([2.03, 0.02], [2.46, 0.73])
    expect(h.store.level.walls.map(w => w.points)).toEqual([[[0, 0], [2.43, 0.71]], [[2.43, 0.71], [4, 0]]])
    expect([...h.store.selection.nodeIds]).toEqual([nodeKey([2.43, 0.71])])
    expect(h.store.history).toEqual(['Open', 'Add node', 'Move'])
    const other = harness(createSelectTool(), createLevel({ name: 'L', walls: [wall('a', [[0, 0], [4, 0]])] }))
    other.down([2.03, 0.02])
    other.move([2.5, 0.8])
    other.key('Escape')
    other.up([2.5, 0.8])
    expect(other.store.level.walls.map(w => w.points)).toEqual([[[0, 0], [2, 0]], [[2, 0], [4, 0]]])
    expect(other.store.history).toEqual(['Open', 'Add node'])
  })
})
