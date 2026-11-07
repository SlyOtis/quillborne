import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { buildEditGraph, junctionPoints, nearestNode, nearestSegment, nodesInBox, nodeKey, wallsFromSvg, splitAtContacts } from '$lib/nimap'
import type { Wall } from '$lib/nimap'

const wall = (id: string, points: [[number, number], [number, number]], width = 0.16): Wall => ({ id, points, width })

describe('edit graph', () => {
  it('collapses coincident wall points into shared nodes', () => {
    const g = buildEditGraph([wall('a', [[0, 0], [4, 0]]), wall('b', [[4, 0], [4, 3]])])
    expect(g.nodes.length).toBe(3)
    const corner = g.nodesById.get(nodeKey([4, 0]))!
    expect(corner.refs).toEqual([{ lineId: 'a', index: 1 }, { lineId: 'b', index: 0 }])
    expect(g.segments.length).toBe(2)
  })

  it('holds only document points as nodes; crossings are derived junction points', () => {
    const walls = [wall('h', [[-2, 0], [2, 0]]), wall('v', [[0, -2], [0, 2]]), wall('t', [[1, 0], [1, 1]])]
    const g = buildEditGraph(walls)
    expect(g.nodes.length).toBe(6)
    expect(g.nodes.every(n => n.refs.length > 0)).toBe(true)
    expect(g.nodesById.has(nodeKey([0, 0]))).toBe(false)
    expect(junctionPoints(walls)).toEqual([[0, 0]])
  })

  it('hit tests nodes and segments within a radius', () => {
    const g = buildEditGraph([wall('a', [[0, 0], [4, 0]])])
    expect(nearestNode(g, [0.05, 0.05], 0.1)?.point).toEqual([0, 0])
    expect(nearestNode(g, [0.5, 0.5], 0.1)).toBeNull()
    expect(nearestNode(g, [0.05, 0.05], 0.1, new Set([nodeKey([0, 0])]))).toBeNull()
    const crossing = buildEditGraph([wall('h', [[-2, 0], [2, 0]]), wall('v', [[0, -2], [0, 2]])])
    expect(nearestNode(crossing, [0.02, 0.02], 0.1)).toBeNull()
    const hit = nearestSegment(g, [2, 0.05], 0.1)!
    expect(hit.segment.lineId).toBe('a')
    expect(hit.point).toEqual([2, 0])
    expect(hit.t).toBeCloseTo(0.5, 9)
    expect(nearestSegment(g, [2, 1], 0.1)).toBeNull()
  })

  it('derived junction points never coincide with document nodes, on a real plan', () => {
    const plan = wallsFromSvg(readFileSync(new URL('../fixtures/reference.svg', import.meta.url), 'utf8'))
    const walls = splitAtContacts([...plan, wall('diagonal', [[0.5, -0.5], [15, -15]])])
    const g = buildEditGraph(walls)
    const junctions = junctionPoints(walls)
    expect(junctions.length).toBeGreaterThan(0)
    for (const j of junctions) {
      const nearest = Math.min(...g.nodes.map(n => Math.hypot(n.point[0] - j[0], n.point[1] - j[1])))
      expect(nearest).toBeGreaterThanOrEqual(1e-4)
    }
    expect(g.nodes.every(n => n.refs.length > 0)).toBe(true)
  })

  it('box selection sees only document nodes', () => {
    const g = buildEditGraph([wall('h', [[-2, 0], [2, 0]]), wall('v', [[0, -2], [0, 2]])])
    expect(nodesInBox(g, [-3, -3], [3, 3]).length).toBe(4)
    expect(nodesInBox(g, [-3, -1], [3, 1]).length).toBe(2)
  })

  it('walls and fixture lines are separate graphs: the same point is two nodes that never join', () => {
    const g = buildEditGraph([wall('a', [[0, 0], [4, 0]])], [{ id: 'f', points: [[0, 0], [0, 2]] }])
    expect(g.nodes.length).toBe(4)
    expect(g.nodesById.get(nodeKey([0, 0]))!.refs).toEqual([{ lineId: 'a', index: 0 }])
    expect(g.nodesById.get(nodeKey([0, 0], 'fixtures'))!.refs).toEqual([{ lineId: 'f', index: 0 }])
    expect(nearestNode(g, [0.01, 0.01], 0.1, undefined, 'fixtures')!.layer).toBe('fixtures')
    expect(nearestSegment(g, [0, 1], 0.1, undefined, 'walls')).toBeNull()
    expect(nodesInBox(g, [-1, -1], [1, 1], 'walls').length).toBe(1)
  })
})
