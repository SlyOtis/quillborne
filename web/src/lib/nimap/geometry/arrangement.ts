import { EPS, type Vec2, type Ring, sub, add, mul, length, signedArea, pointInRing } from './vector'
import { KERNEL_GRID } from '../model/precision'

export interface Segment {
  a: Vec2
  b: Vec2
  owners: string[]
}

export interface Vertex {
  p: Vec2
  /** Outgoing half-edge indices, sorted by angle. */
  out: number[]
}

export interface Edge {
  a: number
  b: number
  owners: string[]
}

export interface HalfEdge {
  from: number
  to: number
  twin: number
  edge: number
  next: number
}

export interface Face {
  id: string
  points: Ring
  area: number
  netArea: number
  holes: Ring[]
  halfEdges: number[]
  holeHalfEdges: number[][]
  sample: Vec2
}

export interface Arrangement {
  vertices: Vertex[]
  edges: Edge[]
  halfEdges: HalfEdge[]
  faces: Face[]
  components: number
  bridges: Set<number>
  /** Rings the traversal produced with no area; a non-empty list means the structure is degenerate. */
  degenerate: { points: Ring; halfEdges: number[] }[]
  /** The outer ring of every bridgeless block, counter-clockwise: what encloses each piece of the drawing. */
  outerRings: Ring[]
}

/** A point just left of the directed segment a→b (or right, with side -1). */
export function leftSample(a: Vec2, b: Vec2, side = 1): Vec2 {
  const d = sub(b, a)
  const l = length(d)
  const n: Vec2 = [-d[1] / l, d[0] / l]
  return add(mul(add(a, b), 0.5), mul(n, Math.min(l * 1e-4, EPS * 8) * side))
}

const edgeKey = (a: number, b: number): string => (a < b ? `${a}:${b}` : `${b}:${a}`)

/**
 * Full planar subdivision of a set of segments: crossings, endpoint contacts
 * and collinear overlaps are noded, vertices are canonicalized to the EPS
 * grid, half-edges are angularly ordered and faces are traversed. Bridges
 * (edges with the same face on both sides) stay in the graph but are left
 * out of face rings. The Euler characteristic is asserted.
 */
export interface ArrangementOptions {
  /** Throw when the Euler characteristic does not match the traversed faces. Default true. */
  strict?: boolean
  /** Grid size in metres; defaults to EPS. */
  eps?: number
}

export function arrangement(input: Segment[], options: ArrangementOptions = {}): Arrangement {
  const EPS = options.eps ?? KERNEL_GRID
  const cell = (v: number): number => Math.round(v / EPS)
  /** Cells back to metres by an integer count per metre, so a cell on a whole metre comes out exact. */
  const perMetre = Math.round(1 / EPS)
  const metres = (c: number): number => c / perMetre
  const gridKey = (x: number, y: number): string => `${x},${y}`

  const vertices: Vertex[] = []
  const grid: [bigint, bigint][] = []
  const vertexIndex = new Map<string, number>()
  let edges: Edge[] = []
  const edgeIndex = new Map<string, number>()

  // A point is rounded to the grid exactly once, and a point landing within
  // one grid unit of an existing vertex is that vertex, so the kernel never
  // holds two vertices for one location. Floats may create a point; only the
  // integer passes below decide what touches what.
  const vertex = (raw: Vec2): number => {
    const x = cell(raw[0])
    const y = cell(raw[1])
    const exact = vertexIndex.get(gridKey(x, y))
    if (exact !== undefined) return exact
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const near = vertexIndex.get(gridKey(x + dx, y + dy))
        if (near !== undefined) return near
      }
    }
    const index = vertices.length
    vertexIndex.set(gridKey(x, y), index)
    vertices.push({ p: [metres(x), metres(y)], out: [] })
    grid.push([BigInt(x), BigInt(y)])
    return index
  }

  const addEdge = (a: number, b: number, owners: string[]) => {
    const k = edgeKey(a, b)
    const existing = edgeIndex.get(k)
    if (existing !== undefined) {
      const e = edges[existing]
      e.owners = [...new Set([...e.owners, ...owners])]
    } else {
      edgeIndex.set(k, edges.length)
      edges.push({ a, b, owners: [...owners] })
    }
  }

  for (const s of input) {
    const a = vertex(s.a)
    const b = vertex(s.b)
    if (a !== b) addEdge(a, b, s.owners)
  }

  // A vertex on another edge, and two edges that cross, are both resolved
  // exactly in integer grid space, repeated until no new incidence appears,
  // so the half-edge structure below is consistent by construction.
  const orient = (a: [bigint, bigint], b: [bigint, bigint], c: [bigint, bigint]): bigint => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])
  const divRound = (n: bigint, d: bigint): bigint => {
    if (d < 0n) {
      n = -n
      d = -d
    }
    return (2n * n + (n < 0n ? -d : d)) / (2n * d)
  }
  const gridBox = (e: Edge) => {
    const a = grid[e.a]
    const b = grid[e.b]
    return { minX: a[0] < b[0] ? a[0] : b[0], maxX: a[0] > b[0] ? a[0] : b[0], minY: a[1] < b[1] ? a[1] : b[1], maxY: a[1] > b[1] ? a[1] : b[1] }
  }
  const splitEdges = (source: Edge[], cuts: Map<number, number[]>): Edge[] => {
    edges = []
    edgeIndex.clear()
    source.forEach((e, index) => {
      const extra = cuts.get(index)
      if (!extra?.length) {
        addEdge(e.a, e.b, e.owners)
        return
      }
      const a = grid[e.a]
      const b = grid[e.b]
      const axis = b[0] - a[0] !== 0n ? 0 : 1
      const chain = [...new Set([e.a, e.b, ...extra])].sort((i, j) => (grid[i][axis] < grid[j][axis] ? -1 : grid[i][axis] > grid[j][axis] ? 1 : 0))
      for (let i = 1; i < chain.length; i++) addEdge(chain[i - 1], chain[i], e.owners)
    })
    return edges
  }

  for (let pass = 0; pass < 8; pass++) {
    // A vertex within one grid unit of an edge lies on it: the perpendicular
    // distance is |orient| / |ab|, so compare orient² against |ab|² exactly.
    const onEdge = new Map<number, number[]>()
    edges.forEach((e, index) => {
      const a = grid[e.a]
      const b = grid[e.b]
      const box = gridBox(e)
      const dx = b[0] - a[0]
      const dy = b[1] - a[1]
      const length2 = dx * dx + dy * dy
      for (let i = 0; i < grid.length; i++) {
        if (i === e.a || i === e.b) continue
        const p = grid[i]
        if (p[0] < box.minX - 1n || p[0] > box.maxX + 1n || p[1] < box.minY - 1n || p[1] > box.maxY + 1n) continue
        const o = orient(a, b, p)
        if (o * o <= length2) onEdge.set(index, [...(onEdge.get(index) ?? []), i])
      }
    })
    if (onEdge.size) edges = splitEdges(edges, onEdge)

    const crossings = new Map<number, number[]>()
    const boxes = edges.map(gridBox)
    for (let i = 0; i < edges.length; i++) {
      for (let j = i + 1; j < edges.length; j++) {
        const e = edges[i]
        const f = edges[j]
        if (e.a === f.a || e.a === f.b || e.b === f.a || e.b === f.b) continue
        const bi = boxes[i]
        const bj = boxes[j]
        if (bi.maxX < bj.minX || bj.maxX < bi.minX || bi.maxY < bj.minY || bj.maxY < bi.minY) continue
        const a = grid[e.a]
        const b = grid[e.b]
        const c = grid[f.a]
        const d = grid[f.b]
        const o1 = orient(a, b, c)
        const o2 = orient(a, b, d)
        const o3 = orient(c, d, a)
        const o4 = orient(c, d, b)
        const straddles = (x: bigint, y: bigint) => (x > 0n && y < 0n) || (x < 0n && y > 0n)
        if (!straddles(o1, o2) || !straddles(o3, o4)) continue
        // The crossing point in exact grid arithmetic, rounded to the nearest
        // grid vertex; doubles go wild for near-parallel edges.
        const den = (b[0] - a[0]) * (d[1] - c[1]) - (b[1] - a[1]) * (d[0] - c[0])
        if (den === 0n) continue
        const num = (c[0] - a[0]) * (d[1] - c[1]) - (c[1] - a[1]) * (d[0] - c[0])
        const x = a[0] + divRound((b[0] - a[0]) * num, den)
        const y = a[1] + divRound((b[1] - a[1]) * num, den)
        const v = vertex([metres(Number(x)), metres(Number(y))])
        const onE = v === e.a || v === e.b
        const onF = v === f.a || v === f.b
        if (onE && onF) continue
        if (!onE) crossings.set(i, [...(crossings.get(i) ?? []), v])
        if (!onF) crossings.set(j, [...(crossings.get(j) ?? []), v])
      }
    }
    if (!crossings.size) break
    edges = splitEdges(edges, crossings)
  }

  const halfEdges: HalfEdge[] = []
  edges.forEach((e, i) => {
    const h = halfEdges.length
    halfEdges.push({ from: e.a, to: e.b, twin: h + 1, edge: i, next: -1 }, { from: e.b, to: e.a, twin: h, edge: i, next: -1 })
    vertices[e.a].out.push(h)
    vertices[e.b].out.push(h + 1)
  })
  for (const v of vertices) {
    v.out.sort((a, b) => {
      const pa = sub(vertices[halfEdges[a].to].p, v.p)
      const pb = sub(vertices[halfEdges[b].to].p, v.p)
      return Math.atan2(pa[1], pa[0]) - Math.atan2(pb[1], pb[0])
    })
  }
  for (const h of halfEdges) {
    const out = vertices[h.to].out
    h.next = out[(out.indexOf(h.twin) + out.length - 1) % out.length]
  }

  const discovery = new Int32Array(vertices.length)
  const low = new Int32Array(vertices.length)
  const bridges = new Set<number>()
  let time = 0
  let components = 0
  const visit = (u: number, parent: number) => {
    discovery[u] = low[u] = ++time
    for (const hi of vertices[u].out) {
      const h = halfEdges[hi]
      if (h.edge === parent) continue
      if (!discovery[h.to]) {
        visit(h.to, h.edge)
        low[u] = Math.min(low[u], low[h.to])
        if (low[h.to] > discovery[u]) bridges.add(h.edge)
      } else {
        low[u] = Math.min(low[u], discovery[h.to])
      }
    }
  }
  for (let i = 0; i < vertices.length; i++) {
    if (!discovery[i]) {
      components++
      visit(i, -1)
    }
  }

  // Bridgeless blocks: pieces left when bridges are cut. Each has exactly one
  // outer ring, so that is the unit for classifying rings.
  const block = new Int32Array(vertices.length).fill(-1)
  let blocks = 0
  for (let start = 0; start < vertices.length; start++) {
    if (block[start] !== -1) continue
    const stack = [start]
    block[start] = blocks
    while (stack.length) {
      const u = stack.pop()!
      for (const hi of vertices[u].out) {
        const h = halfEdges[hi]
        if (bridges.has(h.edge) || block[h.to] !== -1) continue
        block[h.to] = blocks
        stack.push(h.to)
      }
    }
    blocks++
  }

  const seen = new Set<number>()
  const rings: { points: Ring; area: number; hs: number[]; block: number }[] = []
  for (let seed = 0; seed < halfEdges.length; seed++) {
    if (seen.has(seed) || bridges.has(halfEdges[seed].edge)) continue
    const hs: number[] = []
    let h = seed
    do {
      if (seen.has(h)) throw new Error('Inconsistent boundary traversal.')
      seen.add(h)
      hs.push(h)
      const out = vertices[halfEdges[h].to].out.filter(i => !bridges.has(halfEdges[i].edge))
      h = out[(out.indexOf(halfEdges[h].twin) + out.length - 1) % out.length]
    } while (h !== seed)
    const points = hs.map(i => vertices[halfEdges[i].from].p)
    rings.push({ points, area: signedArea(points), hs, block: block[halfEdges[seed].from] })
  }

  // Each block has exactly one outer ring: the one enclosing everything,
  // hence the most negative signed area. Every other ring is a bounded face,
  // however thin; classifying by the sign of a near-zero area would drop
  // slivers and break the count.
  const outer = new Set<number>()
  const byBlock = new Map<number, number[]>()
  rings.forEach((r, i) => byBlock.set(r.block, [...(byBlock.get(r.block) ?? []), i]))
  for (const indices of byBlock.values()) {
    outer.add(indices.reduce((best, i) => (rings[i].area < rings[best].area ? i : best), indices[0]))
  }

  const degenerate: { points: Ring; halfEdges: number[] }[] = []
  const faces: Face[] = []
  rings.forEach((r, i) => {
    if (outer.has(i)) return
    if (Math.abs(r.area) <= EPS * EPS) degenerate.push({ points: r.points, halfEdges: r.hs })
    faces.push({
      id: `face-${faces.length + 1}`,
      points: r.points,
      area: Math.abs(r.area),
      netArea: Math.abs(r.area),
      holes: [],
      halfEdges: r.hs,
      holeHalfEdges: [],
      sample: leftSample(r.points[0], r.points[1])
    })
  })
  for (const i of outer) {
    const r = rings[i]
    const sample = leftSample(r.points[0], r.points[1])
    const parent = faces.filter(f => pointInRing(sample, f.points)).sort((a, b) => a.area - b.area)[0]
    if (parent) {
      parent.holes.push(r.points)
      parent.holeHalfEdges.push(r.hs)
    }
  }
  for (const f of faces) f.netArea = f.area - f.holes.reduce((s, h) => s + Math.abs(signedArea(h)), 0)

  const expected = edges.length - vertices.length + components
  if (faces.length !== expected && options.strict !== false) {
    throw new Error(`Topology invariant failed: ${faces.length} regions; expected ${expected}.`)
  }

  const outerRings = [...outer].map(i => [...rings[i].points].reverse())
  return { vertices, edges, halfEdges, faces, components, bridges, degenerate, outerRings }
}
