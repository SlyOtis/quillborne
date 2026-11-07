import { describe, it, expect } from 'vitest'
import { createDoorTool, createWindowTool, createSelectTool, createLevel, openingGeometry, wallRuns } from '$lib/nimap'
import type { Wall, Opening, Vec2, Line } from '$lib/nimap'
import { harness } from './harness'

const wall = (id: string, points: [[number, number], [number, number]], width = 0.2): Wall => ({ id, points, width })
const line = (id: string, points: [[number, number], [number, number]]): Line => ({ id, points })
const door = (id: string, at: Vec2, width = 0.9): Opening => ({ id, kind: 'door', at, width, from: 0, to: 2.1, swing: { side: 1, hinge: 0 } })
const preview = (tool: ReturnType<typeof createDoorTool>, h: ReturnType<typeof harness>) => {
  const item = tool.overlay(h.ctx()).find(o => o.type === 'opening')
  return item && item.type === 'opening' ? item.opening : null
}

describe('door tool: what is shown is what a click places', () => {
  it('the door in hand sits on the nearest wall in reach, nudged legal, swinging to the side of the hand, on walls in every direction', () => {
    const walls = [wall('a', [[0, 0], [4, 0]]), wall('b', [[4, 0], [4, 3]]), wall('c', [[4, 3], [0, 3]]), wall('d', [[0, 3], [0, 0]])]
    const tool = createDoorTool()
    const h = harness(tool, createLevel({ name: 'L', walls }))
    for (const [hand, at, inside] of [
      [[2, 0.15], [2, 0], true],
      [[3.9, -0.15], [3.45, 0], false],
      [[4.1, 1.5], [4, 1.5], false],
      [[2, 2.85], [2, 3], true],
      [[-0.1, 0.2], [0, 0.55], false]
    ] as [Vec2, Vec2, boolean][]) {
      h.move(hand)
      const o = preview(tool, h)!
      expect(o.at[0]).toBeCloseTo(at[0], 6)
      expect(o.at[1]).toBeCloseTo(at[1], 6)
      const g = openingGeometry(o, wallRuns(walls))!
      const tip = g.leaf![1]
      const towardsInside = tip[0] > 0 && tip[0] < 4 && tip[1] > 0 && tip[1] < 3
      expect(towardsInside).toBe(inside)
    }
    h.move([2, 1.5])
    expect(preview(tool, h)).toBeNull()
  })

  it('a click places exactly the door shown, selects it and keeps the tool; Tab flips the hinge in hand and for the next door', () => {
    const tool = createDoorTool()
    const h = harness(tool, createLevel({ name: 'L', walls: [wall('a', [[0, 0], [6, 0]])] }))
    h.move([2, 0.05])
    const shown = preview(tool, h)!
    h.click([2, 0.05])
    expect(h.store.level.openings.length).toBe(1)
    expect(h.store.level.openings[0].at).toEqual(shown.at)
    expect(h.store.level.openings[0].swing).toEqual({ side: 1, hinge: 0 })
    expect([...h.store.selection.openingIds]).toEqual([h.store.level.openings[0].id])
    expect(h.store.history.at(-1)).toBe('Place door')
    expect(tool.state).toBe('idle')
    h.key('Tab')
    h.move([4.5, -0.05])
    expect(preview(tool, h)!.swing).toEqual({ side: -1, hinge: 1 })
    h.click([4.5, -0.05])
    expect(h.store.level.openings[1].swing).toEqual({ side: -1, hinge: 1 })
    h.move([2.6, 0.05])
    expect(preview(tool, h)!.at[0]).toBeCloseTo(2.9, 6)
  })

  it('a window has no swing and its own width in hand', () => {
    const tool = createWindowTool()
    const h = harness(tool, createLevel({ name: 'L', walls: [wall('a', [[0, 0], [6, 0]])] }))
    h.click([3, 0.02])
    expect(h.store.level.openings[0]).toMatchObject({ kind: 'window', at: [3, 0], width: 1.2, from: 0.9, to: 2.1 })
    expect(h.store.level.openings[0].swing).toBeUndefined()
  })
})

describe('select tool: an opening slides along its wall and onto the next, and is edited by keys', () => {
  const room = () => [wall('a', [[0, 0], [2, 0]]), wall('a2', [[2, 0], [4, 0]]), wall('b', [[4, 0], [4, 3]]), wall('c', [[4, 3], [0, 3]]), wall('d', [[0, 3], [0, 0]])]
  const at = (h: ReturnType<typeof harness>) => h.store.level.openings[0].at

  it('a press selects it, a drag slides it across a seam and stops short of a corner, dropping records one move', () => {
    const tool = createSelectTool()
    const h = harness(tool, createLevel({ name: 'L', walls: room(), openings: [door('d1', [1, 0])] }))
    h.click([1, 0.02])
    expect([...h.store.selection.openingIds]).toEqual(['d1'])
    h.drag([1, 0.02], [2.3, 0.05])
    expect(at(h)).toEqual([2.3, 0])
    expect(h.store.history.at(-1)).toBe('Move door')
    h.drag([2.3, 0.02], [3.95, 0.02])
    expect(at(h)[0]).toBeCloseTo(3.45, 6)
    expect(h.store.level.openings[0].swing).toEqual({ side: 1, hinge: 0 })
  })

  it('dragging past a corner jumps onto the next wall; far from every wall it slides along the nearest', () => {
    const tool = createSelectTool()
    const h = harness(tool, createLevel({ name: 'L', walls: room(), openings: [door('d1', [3, 0])] }))
    h.down([3, 0])
    h.move([3.5, 0])
    h.move([4.02, 0.6])
    h.move([4.02, 1.5])
    expect(h.store.working.openings[0].at).toEqual([4, 1.5])
    h.move([3.2, 1.8])
    expect(h.store.working.openings[0].at).toEqual([4, 1.8])
    h.up([3.2, 1.8])
    expect(at(h)).toEqual([4, 1.8])
    expect(h.store.history.filter(l => l === 'Move door').length).toBe(1)
  })

  it('escape during a slide puts it back; delete removes it; plus and minus step its width and keep it legal; Tab flips it', () => {
    const tool = createSelectTool()
    const h = harness(tool, createLevel({ name: 'L', walls: room(), openings: [door('d1', [3.45, 0])] }))
    h.down([3.45, 0.02])
    h.move([2, 0.02])
    expect(h.store.working.openings[0].at).toEqual([2, 0])
    h.key('Escape')
    expect(at(h)).toEqual([3.45, 0])
    h.click([3.45, 0.02])
    h.key('+')
    expect(h.store.level.openings[0].width).toBe(0.91)
    expect(at(h)[0]).toBeCloseTo(3.445, 6)
    h.key('-', { shift: true })
    expect(h.store.level.openings[0].width).toBe(0.86)
    h.key('Tab')
    expect(h.store.level.openings[0].swing).toEqual({ side: 1, hinge: 1 })
    h.key('Tab', { shift: true })
    expect(h.store.level.openings[0].swing).toEqual({ side: -1, hinge: 1 })
    expect(h.store.history.slice(-3)).toEqual(['Opening width', 'Flip door', 'Flip door'])
    h.key('Delete')
    expect(h.store.level.openings).toEqual([])
    expect(h.store.selection.openingIds.size).toBe(0)
  })

  it('an opening rides with its wall when the wall moves and stays put when the far end moves', () => {
    const tool = createSelectTool()
    const h = harness(tool, createLevel({ name: 'L', walls: [wall('a', [[0, 0], [4, 0]])], openings: [door('d1', [1, 0])] }))
    h.click([3, 0.02])
    h.drag([3, 0.02], [3, 1.02], { ctrl: true })
    expect(at(h)).toEqual([1, 1])
    h.key('Escape')
    h.drag([4, 1], [6, 1], { ctrl: true })
    expect(at(h)).toEqual([1, 1])
    expect(h.store.level.walls[0].points).toEqual([[0, 1], [6, 1]])
  })
})

describe('hover: the select tool reports what is under the pointer, and a door leaf is a control', () => {
  const hoverAt = (tool: ReturnType<typeof createSelectTool>, h: ReturnType<typeof harness>, p: Vec2) => {
    h.move(p)
    const item = tool.overlay(h.ctx()).find(o => o.type === 'hover')
    return item && item.type === 'hover' ? item.hit : null
  }

  it('names a node, a wall, a fixture line, a fixture body, an opening body, an unselected door’s leaf as its body and a selected door’s leaf, and nothing over empty space or the selection box', () => {
    const tool = createSelectTool()
    const h = harness(tool, createLevel({ name: 'L', walls: [wall('a', [[0, 0], [6, 0]])], fixtureLines: [line('fa', [[1, 2], [3, 2]]), line('fb', [[3, 2], [3, 4]]), line('fc', [[3, 4], [1, 4]]), line('fd', [[1, 4], [1, 2]])], openings: [door('d1', [4.5, 0])] }))
    expect(hoverAt(tool, h, [0, 0.02])?.kind).toBe('node')
    expect(hoverAt(tool, h, [2, 0.05])).toMatchObject({ kind: 'line', lineId: 'a' })
    expect(hoverAt(tool, h, [2, 2.02])).toMatchObject({ kind: 'line', lineId: 'fa' })
    expect(hoverAt(tool, h, [2, 3])?.kind).toBe('fixture')
    expect(hoverAt(tool, h, [4.5, 0.03])).toMatchObject({ kind: 'opening', part: 'body' })
    expect(hoverAt(tool, h, [4.05, 0.5])).toMatchObject({ kind: 'opening', part: 'body' })
    expect(tool.cursor(h.ctx())).toBe('arrow')
    h.click([4.5, 0.03])
    expect(hoverAt(tool, h, [4.05, 0.5])).toMatchObject({ kind: 'opening', part: 'leaf' })
    expect(tool.cursor(h.ctx())).toBe('flip@0')
    expect(hoverAt(tool, h, [5, 5])).toBeNull()
    h.drag([0.5, 1.5], [3.5, 4.5])
    expect(h.store.selection.nodeIds.size).toBe(4)
    expect(hoverAt(tool, h, [1, 2.02])).toBeNull()
    expect(tool.cursor(h.ctx())).toBe('resize@135')
  })

  it('a click on an unselected door’s leaf selects it; on a selected door it flips the swing to the other side, without moving it, on either side', () => {
    const tool = createSelectTool()
    const h = harness(tool, createLevel({ name: 'L', walls: [wall('a', [[0, 0], [6, 0]])], openings: [door('d1', [3, 0])] }))
    h.click([2.55, 0.5])
    expect(h.store.level.openings[0].swing).toEqual({ side: 1, hinge: 0 })
    expect([...h.store.selection.openingIds]).toEqual(['d1'])
    expect(h.store.history.at(-1)).toBe('Select')
    h.click([2.55, 0.5])
    expect(h.store.level.openings[0].swing).toEqual({ side: -1, hinge: 0 })
    expect(h.store.level.openings[0].at).toEqual([3, 0])
    expect([...h.store.selection.openingIds]).toEqual(['d1'])
    expect(h.store.history.at(-1)).toBe('Flip door')
    h.click([2.55, -0.5])
    expect(h.store.level.openings[0].swing).toEqual({ side: 1, hinge: 0 })
    h.key('Tab')
    h.click([3.45, 0.5])
    expect(h.store.level.openings[0].swing).toEqual({ side: -1, hinge: 1 })
  })
})
