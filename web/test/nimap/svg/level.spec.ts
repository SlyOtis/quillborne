import { describe, it, expect } from 'vitest'
import { createLevel, levelToSvg, polygonToPath, toSvgPoint } from '$lib/nimap'
import { demoLevel } from '../fixtures/demo-building.fixture'

describe('level to svg', () => {
  it('flips y once at the boundary', () => {
    expect(toSvgPoint([1, 2])).toEqual([1, -2])
    expect(toSvgPoint([1, 2], false)).toEqual([1, 2])
    expect(polygonToPath({ outer: [[0, 0], [1, 0], [1, 1]], holes: [] })).toBe('M0 0 L1 0 L1 -1 Z')
  })

  it('emits wall cells, centerlines and units with a padded viewBox', () => {
    const level = createLevel({ name: 'L', walls: [{ id: 'w', points: [[0, 0], [3, 0]], width: 0.2 }] })
    const svg = levelToSvg(level, { padding: 1 })
    expect(svg.walls.length).toBe(1)
    expect(svg.walls[0].path.startsWith('M')).toBe(true)
    expect(svg.centerlines[0].path).toBe('M0 0 L3 0')
    expect(svg.viewBox.x).toBeCloseTo(-1, 6)
    expect(svg.viewBox.width).toBeCloseTo(5, 6)
    expect(svg.units).toEqual([])
  })

  it('renders the demo level', () => {
    const svg = levelToSvg(demoLevel())
    expect(svg.units.length).toBe(10)
    expect(svg.walls.length).toBeGreaterThan(14)
    expect(svg.warnings).toEqual([])
  })
})
