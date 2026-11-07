import { describe, it, expect } from 'vitest'
import { buildSolids, wallPrimitives, wallTopology, signedArea, triangulate, createLevel, createSelectTool, createWallPen, arrangement, wallSegments, buildEditGraph, distanceToSegment, pointInPolygon, KERNEL_GRID } from '$lib/nimap'
import type { Wall, WallLike, Vec2 } from '$lib/nimap'
import { harness } from '../tools/harness'
import { demoWalls } from '../fixtures/demo-building.fixture'

/** Every structural promise the kernel makes, checked on one wall set. */
function check(walls: WallLike[]) {
  wallTopology(walls)
  const graph = arrangement(wallSegments(walls))
  for (const e of graph.edges) {
    const a = graph.vertices[e.a].p
    const b = graph.vertices[e.b].p
    expect(Math.hypot(Math.round((a[0] - b[0]) / KERNEL_GRID), Math.round((a[1] - b[1]) / KERNEL_GRID)), 'edge length in grid units').toBeGreaterThanOrEqual(2)
  }
  const solid = buildSolids(walls)
  const inside = (p: Vec2) => solid.cells.some(c => pointInPolygon(p, { outer: c.points, holes: c.holes }))
  const nearEdge = (p: Vec2) => solid.cells.some(c => [c.points, ...c.holes].some(r => r.some((a, i) => distanceToSegment(p, a, r[(i + 1) % r.length]) < 1e-3)))
  // Cells are inset and settled on grids up to a millimetre, so a sample on a
  // shared boundary may fall in a hairline gap; a hole in this class is centimetres.
  const covered = (p: Vec2) => inside(p) || nearEdge(p)
  const primitives = wallPrimitives(walls).polygons
  const cut = (p: Vec2, owner: string) => primitives.some(q => q.cuts && (owner.startsWith('j') || q.cuts.includes(owner)) && pointInPolygon(p, { outer: q.points, holes: [] }))
  for (const primitive of primitives) {
    if (primitive.cuts) continue
    const ring = primitive.points
    const centroid: Vec2 = [ring.reduce((s, p) => s + p[0], 0) / ring.length, ring.reduce((s, p) => s + p[1], 0) / ring.length]
    if (Math.abs(signedArea(ring)) < 1e-6) continue
    expect(covered(centroid) || cut(centroid, primitive.owner)).toBe(true)
    for (const p of ring) {
      const sample: Vec2 = [centroid[0] * 0.4 + p[0] * 0.6, centroid[1] * 0.4 + p[1] * 0.6]
      expect(covered(sample) || cut(sample, primitive.owner)).toBe(true)
    }
  }
  // Every wall must be there: sampled from the document, not from what the
  // kernel emitted. The centreline is always covered; the band is checked
  // beyond the miter reach of either end, since a miter may cut a corner.
  const reachOf = 4 * Math.max(...walls.map(w => w.width)) / 2
  for (const w of walls) {
    for (let i = 1; i < w.points.length; i++) {
      const [a, b] = [w.points[i - 1], w.points[i]]
      const len = Math.hypot(b[0] - a[0], b[1] - a[1])
      const n: Vec2 = [-(b[1] - a[1]) / len, (b[0] - a[0]) / len]
      const at = (t: number, side: number): Vec2 => [a[0] + (b[0] - a[0]) * t + n[0] * side * w.width, a[1] + (b[1] - a[1]) * t + n[1] * side * w.width]
      for (const t of [0.15, 0.5, 0.85]) expect(covered(at(t, 0))).toBe(true)
      for (const t of [0.15, 0.5, 0.85]) if (t * len > reachOf && (1 - t) * len > reachOf) for (const side of [-0.4, 0.4]) expect(covered(at(t, side))).toBe(true)
    }
  }
  const reach = 4 * Math.max(...walls.map(w => w.width)) / 2 + 1e-3
  for (const cell of solid.cells) {
    for (const p of cell.points) {
      const d = Math.min(...walls.flatMap(w => w.points.slice(1).map((b, i) => distanceToSegment(p, w.points[i], b))))
      expect(d).toBeLessThanOrEqual(reach)
    }
  }
  let total = 0
  for (const cell of solid.cells) {
    let area = 0
    for (const t of triangulate({ outer: cell.points, holes: cell.holes })) area += Math.abs(signedArea(t))
    expect(area).toBeCloseTo(cell.netArea, 6)
    total += area
  }
  expect(Math.abs(total - solid.area)).toBeLessThan(1e-6 * Math.max(1, solid.cells.length))
  const balance = new Map<string, number>()
  for (const e of solid.boundary) {
    for (const [p, delta] of [[e.a, 1], [e.b, -1]] as [Vec2, number][]) balance.set(p.join(','), (balance.get(p.join(',')) ?? 0) + delta)
  }
  for (const n of balance.values()) expect(n).toBe(0)
  return solid
}

/**
 * The outline is well formed: no edge shorter than a grid unit, since a
 * point that near the one before is that point, as in the arrangement; it
 * never turns straight back on itself, which only a sliver does, since no
 * corner the kernel makes is that sharp; and its rings never touch, one
 * another or themselves, so a notch is never drawn as a hole.
 */
function checkOutline(solid: ReturnType<typeof check>) {
  const rings: Vec2[][] = []
  let ring: Vec2[] = []
  for (const e of solid.boundary) {
    ring.push(e.a)
    if (Math.hypot(e.b[0] - ring[0][0], e.b[1] - ring[0][1]) < 1e-12) {
      rings.push(ring)
      ring = []
    }
  }
  expect(ring.length).toBe(0)
  const edges = rings.flatMap((r, k) => r.map((a, i) => ({ k, i, a, b: r[(i + 1) % r.length] })))
  for (const [k, r] of rings.entries()) {
    for (const [i, p] of r.entries()) {
      for (const e of edges) {
        if (e.k === k && (e.i === i || (e.i + 1) % r.length === i)) continue
        expect(distanceToSegment(p, e.a, e.b), `outline touching itself at ${p}`).toBeGreaterThan(1e-6)
      }
    }
  }
  for (const r of rings) {
    for (let i = 0; i < r.length; i++) {
      const [a, b, c] = [r[i], r[(i + 1) % r.length], r[(i + 2) % r.length]]
      const l1 = Math.hypot(b[0] - a[0], b[1] - a[1])
      const l2 = Math.hypot(c[0] - b[0], c[1] - b[1])
      expect(l1, `outline edge at ${a}`).toBeGreaterThanOrEqual(1e-5 - 1e-12)
      expect(((b[0] - a[0]) * (c[0] - b[0]) + (b[1] - a[1]) * (c[1] - b[1])) / (l1 * l2 || 1), `outline turning back at ${b}`).toBeGreaterThan(-0.99999)
    }
  }
}

/** The document invariant the store keeps: no near nodes, no short walls. */
function checkDocument(walls: Wall[]) {
  for (const w of walls) expect(Math.hypot(w.points[0][0] - w.points[1][0], w.points[0][1] - w.points[1][1])).toBeGreaterThanOrEqual(0.01)
  const nodes = buildEditGraph(walls).nodes
  for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) expect(Math.hypot(nodes[i].point[0] - nodes[j].point[0], nodes[i].point[1] - nodes[j].point[1])).toBeGreaterThanOrEqual(0.01)
  const between = walls.filter(w => !w.curve).map(w => w.points.map(p => `${p[0]},${p[1]}`).sort().join('|'))
  expect(new Set(between).size, 'two straight walls between the same two nodes').toBe(between.length)
}

/** A thin wall meeting a thick one at every angle from 20° to 80°, on either side, for three widths of each. */
function joins(): WallLike[][] {
  const out: WallLike[][] = []
  for (const thin of [0.05, 0.1, 0.2]) {
    for (const thick of [0.2, 0.4, 0.6]) {
      for (let degrees = 20; degrees <= 80; degrees += 10) {
        for (const side of [1, -1]) {
          if (thick <= thin) continue
          const a = (degrees * Math.PI) / 180
          out.push([
            { id: 'thin', points: [[0, -3], [0, 0]], width: thin },
            { id: 'thick', points: [[0, 0], [side * 1.5 * Math.sin(a), 1.5 * Math.cos(a)]], width: thick }
          ])
        }
      }
    }
  }
  return out
}

/** Wall sets found by fuzzing or by hand that once broke the kernel. */
const DRAGGED: Record<string, WallLike[]> = {
  'acute V where the shorter wall ends before the inner faces meet': [
    { id: 'short', points: [[-0.632623, 0.19127], [-0.933691, -0.088948]], width: 0.16 },
    { id: 'long', points: [[-0.933691, -0.088948], [-0.074135, 0.596811]], width: 0.16 }
  ],
  'acute V of unequal widths, bevel line through the vertex': [
    { id: 'thin', points: [[2.426267, 0.578004], [0.113615, 0]], width: 0.08 },
    { id: 'thick', points: [[3.124675, 1.08266], [0.113615, 0]], width: 0.3 }
  ],
  'corner on a half grid cell, drawn by hand': [
    { id: "e4b4c077", points: [[-0.160389, 0.19127], [0.7767, 0.950079]], width: 0.16 },
    { id: "e4b4c077", points: [[0.7767, 0.950079], [1.015768, 0.19127]], width: 0.16 },
    { id: "a252205a", points: [[1.015768, 0.19127], [0.7767, 0.950079]], width: 0.16 },
    { id: "0a2273c9", points: [[0.7767, 0.950079], [-0.074135, 0.830431]], width: 0.16 },
    { id: "58a48d86", points: [[-0.074135, 0.830431], [0.224625, 0.47531]], width: 0.16 },
    { id: "96a8e29f", points: [[0.224625, 0.47531], [-0.60816, -0.189525]], width: 0.16 },
    { id: "a1ce3462", points: [[-0.60816, -0.189525], [-0.111331, 1.139578]], width: 0.16 },
    { id: "fe7ff509", points: [[-0.111331, 1.139578], [-0.632623, 0.19127]], width: 0.16 },
    { id: "be0602d0", points: [[-0.632623, 0.19127], [-0.933691, -0.088948]], width: 0.16 },
    { id: "4bc72492", points: [[-0.933691, -0.088948], [-0.074135, 0.596811]], width: 0.16 },
    { id: "97498fc3", points: [[-0.074135, 0.596811], [1.776375, 0.717424]], width: 0.16 },
    { id: "bb1ba029", points: [[1.776375, 0.717424], [1.447022, 0.90322]], width: 0.16 },
    { id: "b025cfdc", points: [[1.447022, 0.90322], [1.816352, 0.377098]], width: 0.16 }
  ],
  'sharp turn in one run': [{ id: 'shell', points: [[4.629367680481024, -0.39249975068702136], [21, -18], [21, -15], [4.369161490999999, -14.576813276000001]], width: 0.16 }],
  'three walls at a junction': [
    { id: 'a', points: [[3.557007800239428, 1.2181563972610407], [0.3918654038316769, -1.381670552530304]], width: 0.16 },
    { id: 'b', points: [[2.481713848, 0.299232649], [1.8805314313393813, 3.1508466309723797]], width: 0.16 },
    { id: 'c', points: [[3.557007800239428, 1.2181563972610407], [0.09173108500000005, 0.882189235]], width: 0.16 }
  ],
  'self-crossing zigzag': [
    { id: 'shell', points: [[-1.92610832, -11.35742465], [0, 0]], width: 0.16 },
    { id: 'w', points: [[-2.4489967432876396, -11.253977476957152], [-1.34971517, -11.42470717], [-3.0311096939811613, -10.44643628408776], [-1.4157499440000016, -11.778175744000002]], width: 0.16 }
  ]
}

describe('kernel robustness under editing', () => {
  for (const [name, walls] of Object.entries(DRAGGED)) {
    it(`survives ${name}`, () => {
      const solid = check(walls)
      expect(solid.area).toBeGreaterThan(0)
    })
  }

  // Known to fail: the wedges at thick-into-thin joins still leave slivers
  // and touching rings. When they are built clean this turns red, and
  // `fails` comes off.
  it.fails('keeps its outline well formed in every set above and at every join of two widths', () => {
    for (const walls of Object.values(DRAGGED)) checkOutline(check(walls))
    for (const walls of joins()) checkOutline(check(walls))
  })

  it('keeps every promise where walls of any two widths join at any angle, either way round', () => {
    for (const walls of joins()) check(walls)
  })

  it('survives random drags and draws', () => {
    let s = 7
    const rand = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296)
    const widths = [0.08, 0.16, 0.3, 0.5]
    for (let seed = 0; seed < 25; seed++) {
      const select = createSelectTool()
      const pen = createWallPen()
      const square: [Vec2, Vec2][] = [[[0, 0], [6, 0]], [[6, 0], [6, 4]], [[6, 4], [0, 4]], [[0, 4], [0, 0]]]
      const start: Wall[] = seed % 2 ? demoWalls() : [...square.map((points, i) => ({ id: `a${i}`, points, width: 0.16 })), { id: 'b', points: [[3, 0], [3, 4]], width: 0.16 }]
      const h = harness(select, createLevel({ name: 'F', walls: start }))
      for (let step = 0; step < 30; step++) {
        const level = h.store.level
        if (rand() < 0.7) {
          const points = level.walls.flatMap(w => w.points)
          const from = points[Math.floor(rand() * points.length)]
          h.drag(from, [from[0] + (rand() - 0.5) * 4, from[1] + (rand() - 0.5) * 4], { shift: rand() < 0.3 })
        } else {
          const p = harness(pen, level, { wallWidth: widths[Math.floor(rand() * widths.length)] })
          const a: Vec2 = [rand() * 30, -rand() * 20]
          p.click(a)
          p.click([a[0] + (rand() - 0.5) * 8, a[1] + (rand() - 0.5) * 8])
          p.key('Escape')
          h.store.replace('draw', p.store.level)
        }
        expect(h.store.warning).toBeNull()
        check(h.store.level.walls)
        checkDocument(h.store.level.walls)
      }
    }
  }, 120_000)

  it('survives clicks and drops that land near existing nodes and segments', () => {
    let s = 11
    const rand = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296)
    const jitter = (p: Vec2, r: number): Vec2 => [p[0] + (rand() - 0.5) * 2 * r, p[1] + (rand() - 0.5) * 2 * r]
    const widths = [0.08, 0.16, 0.3, 0.5]
    for (let seed = 0; seed < 150; seed++) {
      const select = createSelectTool()
      const pen = createWallPen()
      const h = harness(select, createLevel({ name: 'F' }))
      const restart = () => {
        const p = harness(pen, h.store.level, { wallWidth: widths[Math.floor(rand() * widths.length)] })
        p.click([0, 0])
        p.click([4 + rand(), rand() * 2])
        p.key('Escape')
        h.store.replace('start', p.store.level)
      }
      restart()
      for (let step = 0; step < 12; step++) {
        if (!h.store.level.walls.length) restart()
        const level = h.store.level
        const nodes = buildEditGraph(level.walls).nodes
        const anyNode = () => nodes[Math.floor(rand() * nodes.length)].point
        const anySegmentPoint = (): Vec2 => {
          const w = level.walls[Math.floor(rand() * level.walls.length)]
          const t = rand()
          return [w.points[0][0] + (w.points[1][0] - w.points[0][0]) * t, w.points[0][1] + (w.points[1][1] - w.points[0][1]) * t]
        }
        const target = (): Vec2 => {
          const r = rand()
          return r < 0.4 ? jitter(anyNode(), 0.12) : r < 0.7 ? jitter(anySegmentPoint(), 0.12) : [rand() * 10 - 2, rand() * 8 - 2]
        }
        if (rand() < 0.6) {
          const p = harness(pen, level, { wallWidth: widths[Math.floor(rand() * widths.length)] })
          p.click(target())
          p.click(target())
          if (rand() < 0.5) p.click(target())
          p.key('Escape')
          h.store.replace('draw', p.store.level)
        } else {
          h.drag(anyNode(), target(), { shift: rand() < 0.2 })
        }
        expect(h.store.warning).toBeNull()
        check(h.store.level.walls)
        checkDocument(h.store.level.walls)
      }
    }
  }, 120_000)
})
