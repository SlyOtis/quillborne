import { describe, it, expect } from 'vitest'
import { arrangement, wallsFromSvg, wallSegments } from '$lib/nimap'
import type { Segment, Vec2 } from '$lib/nimap'

const seg = (a: Vec2, b: Vec2, owner: string): Segment => ({ a, b, owners: [owner] })
const square = (x: number, y: number, s: number, prefix: string): Segment[] => [
  seg([x, y], [x + s, y], prefix + 'a'), seg([x + s, y], [x + s, y + s], prefix + 'b'),
  seg([x + s, y + s], [x, y + s], prefix + 'c'), seg([x, y + s], [x, y], prefix + 'd')
]

describe('one location, one vertex', () => {
  it('a shared endpoint on a half grid cell is one vertex however it is reached', () => {
    const corner: Vec2 = [-0.60816, -0.189525]
    const g = arrangement([{ a: [0.224625, 0.47531], b: corner, owners: ['a'] }, { a: corner, b: [-0.111331, 1.139578], owners: ['b'] }])
    expect(g.vertices.length).toBe(3)
    expect(g.edges.length).toBe(2)
    expect(g.degenerate).toEqual([])
  })

  it('a crossing on a half grid cell is one vertex for both segments', () => {
    const g = arrangement([{ a: [-1, -0.189525], b: [1, -0.189525], owners: ['h'] }, { a: [0.000005, -1], b: [0.000005, 1], owners: ['v'] }])
    expect(g.vertices.length).toBe(5)
    expect(g.edges.length).toBe(4)
    for (const e of g.edges) {
      const a = g.vertices[e.a].p
      const b = g.vertices[e.b].p
      expect(Math.hypot(a[0] - b[0], a[1] - b[1])).toBeGreaterThan(0.5)
    }
  })

  it('points within one grid unit are one vertex', () => {
    const g = arrangement([{ a: [0, 0], b: [1, 0], owners: ['a'] }, { a: [1.00001, 0.00001], b: [1, 1], owners: ['b'] }])
    expect(g.vertices.length).toBe(3)
    expect(g.edges.length).toBe(2)
  })
})

describe('arrangement', () => {
  it('nodes a crossing into a shared vertex', () => {
    const g = arrangement([seg([-1, 0], [1, 0], 'h'), seg([0, -1], [0, 1], 'v')])
    expect(g.vertices.length).toBe(5)
    expect(g.edges.length).toBe(4)
    expect(g.faces.length).toBe(0)
    expect(g.components).toBe(1)
  })

  it('splits an edge where another segment ends on it (T-junction)', () => {
    const g = arrangement([seg([0, 0], [10, 0], 'base'), seg([5, 0], [5, 5], 'stub')])
    expect(g.vertices.length).toBe(4)
    expect(g.edges.length).toBe(3)
    expect(g.edges.filter(e => e.owners.includes('base')).length).toBe(2)
  })

  it('merges collinear overlaps and unions their owners', () => {
    const g = arrangement([seg([0, 0], [3, 0], 'a'), seg([1, 0], [4, 0], 'b')])
    expect(g.vertices.length).toBe(4)
    expect(g.edges.length).toBe(3)
    const shared = g.edges.find(e => e.owners.length === 2)!
    expect(shared.owners.sort()).toEqual(['a', 'b'])
  })

  it('a closed square is one counter-clockwise face', () => {
    const g = arrangement(square(0, 0, 2, 's'))
    expect(g.faces.length).toBe(1)
    expect(g.faces[0].area).toBeCloseTo(4, 9)
    expect(g.faces[0].netArea).toBeCloseTo(4, 9)
    expect(g.faces[0].holes).toEqual([])
  })

  it('a dangling stub inside a room is a bridge and leaves the face ring', () => {
    const g = arrangement([...square(0, 0, 4, 's'), seg([2, 4], [2, 3], 'stub')])
    expect(g.faces.length).toBe(1)
    expect(g.bridges.size).toBe(1)
    expect(g.faces[0].points.length).toBe(5)
    expect(g.faces[0].points.some(p => p[0] === 2 && p[1] === 3)).toBe(false)
    expect(g.faces[0].netArea).toBeCloseTo(16, 9)
    expect(g.edges.length).toBe(6)
  })

  it('an island becomes a hole of the containing face with its own provenance', () => {
    const g = arrangement([...square(0, 0, 4, 'o'), ...square(1, 1, 1, 'i')])
    expect(g.faces.length).toBe(2)
    const outer = g.faces.find(f => f.holes.length === 1)!
    const inner = g.faces.find(f => f.holes.length === 0)!
    expect(outer.netArea).toBeCloseTo(15, 9)
    expect(inner.netArea).toBeCloseTo(1, 9)
    expect(outer.holeHalfEdges[0].length).toBe(4)
    expect(g.components).toBe(2)
  })

  it('satisfies the Euler characteristic on a grid', () => {
    const segments: Segment[] = []
    for (let i = 0; i <= 2; i++) {
      segments.push(seg([i, 0], [i, 2], `v${i}`), seg([0, i], [2, i], `h${i}`))
    }
    const g = arrangement(segments)
    expect(g.faces.length).toBe(4)
    expect(g.faces.length).toBe(g.edges.length - g.vertices.length + g.components)
  })

  it('ignores degenerate segments', () => {
    const g = arrangement([seg([1, 1], [1, 1], 'zero'), ...square(0, 0, 1, 's')])
    expect(g.faces.length).toBe(1)
  })

  it('handles the map2 antenna floorplan (two bounded faces, antenna as bridge)', () => {
    const svg = '<svg><path d="M81 0.5H161.5V125H81H0.5V91.5M81 0.5H0.5V51M81 0.5V45.5M0.5 51H26V91.5H0.5M0.5 51V91.5"/></svg>'
    const walls = wallsFromSvg(svg, { scale: 1 })
    const g = arrangement(wallSegments(walls))
    expect(g.faces.length).toBe(2)
    expect(g.bridges.size).toBe(1)
    expect(g.faces.reduce((s, f) => s + f.netArea, 0)).toBeCloseTo(161 * 124.5, 6)
    const big = [...g.faces].sort((a, b) => b.netArea - a.netArea)[0]
    expect(big.points.some(p => Math.abs(p[0] - 81) < 1e-6 && Math.abs(p[1] + 45.5) < 1e-6)).toBe(false)
  })
})
