import { describe, it, expect } from 'vitest'
import { buildEditGraph, createHitService, DEFAULT_LAYERS, nodeKey } from '$lib/nimap'
import type { Wall } from '$lib/nimap'

const wall = (id: string, points: [[number, number], [number, number]], width = 0.16): Wall => ({ id, points, width })
const graph = () => buildEditGraph([wall('h', [[-2, 0], [2, 0]]), wall('v', [[0, -2], [0, 2]]), wall('t', [[2, 0], [2, 3]])])

describe('hit service', () => {
  it('prefers a node over the wall it sits on, then finds walls, then nothing', () => {
    const hit = createHitService(graph(), [], DEFAULT_LAYERS, 0.1)
    expect(hit.at([2.05, 0.03])).toMatchObject({ kind: 'node', node: { id: nodeKey([2, 0]) } })
    expect(hit.at([1, 0.05])).toMatchObject({ kind: 'line', layer: 'walls', lineId: 'h', point: [1, 0] })
    expect(hit.at([1, 1])).toBeNull()
  })

  it('a crossing without a node is a wall hit, not a node', () => {
    const hit = createHitService(graph(), [], DEFAULT_LAYERS, 0.1)
    expect(hit.at([0.02, 0.01])?.kind).toBe('line')
  })

  it('locked or hidden layers hit nothing', () => {
    for (const layers of [{ ...DEFAULT_LAYERS, walls: { hidden: false, locked: true } }, { ...DEFAULT_LAYERS, walls: { hidden: true, locked: false } }]) {
      const hit = createHitService(graph(), [], layers, 0.1)
      expect(hit.at([2.05, 0.03])).toBeNull()
      expect(hit.at([1, 0.05])).toBeNull()
      expect(hit.nodesInBox([-3, -3], [3, 3])).toEqual([])
    }
    expect(createHitService(graph(), [], DEFAULT_LAYERS, 0.1).nodesInBox([-3, -3], [3, 3]).length).toBe(5)
  })
})
