import { describe, it, expect } from 'vitest'
import { pathToStrokes, extractPathData, distance } from '$lib/nimap'

const last = <T,>(a: T[]) => a[a.length - 1]

describe('svg path data', () => {
  it('absolute lines and close', () => {
    const s = pathToStrokes('M0 0 L10 0 L10 10 Z')
    expect(s.map(x => x.command)).toEqual(['L', 'L', 'Z'])
    expect(s[2].points).toEqual([[10, 10], [0, 0]])
  })

  it('relative commands accumulate', () => {
    const s = pathToStrokes('m1 1 l2 0 v2 h-2 z')
    expect(s.map(x => last(x.points))).toEqual([[3, 1], [3, 3], [1, 3], [1, 1]])
  })

  it('implicit lineto after moveto', () => {
    const s = pathToStrokes('M0 0 10 0 10 10')
    expect(s.length).toBe(2)
    expect(s[1].points).toEqual([[10, 0], [10, 10]])
  })

  it('comma and sign separated numbers', () => {
    const s = pathToStrokes('M1,2L3-4')
    expect(s[0].points).toEqual([[1, 2], [3, -4]])
  })

  it('cubic curves flatten within tolerance', () => {
    const [s] = pathToStrokes('M0 0 C0 10 10 10 10 0', { tolerance: 0.1 })
    expect(s.command).toBe('C')
    expect(s.points[0]).toEqual([0, 0])
    expect(last(s.points)).toEqual([10, 0])
    expect(s.points.length).toBeGreaterThan(4)
    for (const p of s.points) {
      expect(p[1]).toBeGreaterThanOrEqual(0)
      expect(p[1]).toBeLessThanOrEqual(7.5 + 1e-9)
    }
  })

  it('quadratic and smooth continuations', () => {
    const q = pathToStrokes('M0 0 Q5 10 10 0 T20 0')
    expect(q.length).toBe(2)
    expect(last(q[1].points)).toEqual([20, 0])
    const c = pathToStrokes('M0 0 C0 5 5 5 5 0 S10 -5 10 0')
    expect(last(c[1].points)).toEqual([10, 0])
  })

  it('arcs stay on the circle and end exactly at the endpoint', () => {
    const [s] = pathToStrokes('M10 0 A10 10 0 0 1 0 10', { tolerance: 0.01 })
    expect(s.command).toBe('A')
    expect(last(s.points)).toEqual([0, 10])
    for (const p of s.points) expect(distance(p, [0, 0])).toBeCloseTo(10, 6)
    let arcLength = 0
    for (let i = 1; i < s.points.length; i++) arcLength += distance(s.points[i - 1], s.points[i])
    expect(arcLength).toBeCloseTo((Math.PI * 10) / 2, 1)
    const large = pathToStrokes('M10 0 A10 10 0 1 1 0 10', { tolerance: 0.01 })[0]
    expect(large.points.length).toBeGreaterThan(s.points.length * 2)
  })

  it('skips a degenerate close', () => {
    expect(pathToStrokes('M0 0 L1 0 L0 0 Z').length).toBe(2)
  })

  it('rejects data without a leading command', () => {
    expect(() => pathToStrokes('0 0 L1 1')).toThrow()
  })

  it('extracts d attributes with either quote style', () => {
    expect(extractPathData(`<path d="M0 0"/><path d='M1 1 L2 2' />`)).toEqual(['M0 0', 'M1 1 L2 2'])
  })
})
