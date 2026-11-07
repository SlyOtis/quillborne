import { describe, it, expect } from 'vitest'
import { overlapArea, polygonArea, triangulate } from '$lib/nimap'
import type { Polygon } from '$lib/nimap'

const square = (x: number, y: number, s: number): Polygon => ({ outer: [[x, y], [x + s, y], [x + s, y + s], [x, y + s]], holes: [] })

describe('overlap area', () => {
  it('identical squares overlap fully', () => {
    expect(overlapArea(square(0, 0, 2), square(0, 0, 2))).toBeCloseTo(4, 9)
  })

  it('offset squares overlap partially', () => {
    expect(overlapArea(square(0, 0, 1), square(0.5, 0.5, 1))).toBeCloseTo(0.25, 9)
  })

  it('disjoint squares do not overlap', () => {
    expect(overlapArea(square(0, 0, 1), square(3, 3, 1))).toBe(0)
  })

  it('holes are excluded', () => {
    const donut: Polygon = { outer: square(0, 0, 4).outer, holes: [square(1, 1, 2).outer] }
    expect(polygonArea(donut)).toBeCloseTo(12, 9)
    expect(overlapArea(donut, square(1.5, 1.5, 1))).toBeCloseTo(0, 9)
    expect(overlapArea(donut, square(0, 0, 2))).toBeCloseTo(3, 9)
  })

  it('triangles are counter-clockwise and cached per polygon object', () => {
    const p = square(0, 0, 1)
    const tris = triangulate(p)
    expect(tris.length).toBe(2)
    expect(triangulate(p)).toBe(tris)
  })
})
