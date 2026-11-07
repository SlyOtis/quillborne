import { BufferGeometry, Float32BufferAttribute, type Object3D } from 'three'
import type { Polygon, Ring, Vec2 } from '../geometry/vector'
import { signedArea } from '../geometry/vector'
import { triangulate } from '../geometry/overlap'
import type { WallSolids } from '../geometry/walls'

/**
 * Document to scene: x stays east, the document's north becomes the scene's
 * negative z, and height is y. One flip, in this module and nowhere else:
 * `toScene` for a point, `inScene` for an object built in the document's
 * frame.
 */
export const toScene = (p: Vec2, height: number): [number, number, number] => [p[0], height, -p[1]]

/** An object built in the document's frame, x east, y north and z up, turned into the scene by the flip `toScene` makes. */
export function inScene<T extends Object3D>(object: T): T {
  object.rotation.x = -Math.PI / 2
  return object
}

/** Collects triangles as flat positions; normals come from the faces, so every face is flat. */
class TriangleSink {
  positions: number[] = []
  triangle(a: [number, number, number], b: [number, number, number], c: [number, number, number]) {
    this.positions.push(...a, ...b, ...c)
  }
  /** A vertical quad over the document edge a→b between two heights, facing the right of a→b. */
  side(a: Vec2, b: Vec2, lo: number, hi: number) {
    const aLo = toScene(a, lo)
    const bLo = toScene(b, lo)
    const aHi = toScene(a, hi)
    const bHi = toScene(b, hi)
    this.triangle(aLo, bLo, bHi)
    this.triangle(aLo, bHi, aHi)
  }
  /** The polygon's triangles at a height, facing up or down. */
  cap(polygon: Polygon, height: number, up: boolean) {
    for (const [a, b, c] of triangulate(polygon)) {
      if (up) this.triangle(toScene(a, height), toScene(b, height), toScene(c, height))
      else this.triangle(toScene(a, height), toScene(c, height), toScene(b, height))
    }
  }
  geometry(): BufferGeometry {
    const g = new BufferGeometry()
    g.setAttribute('position', new Float32BufferAttribute(this.positions, 3))
    g.computeVertexNormals()
    return g
  }
}

const counterClockwise = (ring: Ring): Ring => (signedArea(ring) < 0 ? [...ring].reverse() : ring)
const clockwise = (ring: Ring): Ring => (signedArea(ring) > 0 ? [...ring].reverse() : ring)

/** A polygon extruded between two heights: caps at both, sides on the outer ring facing out and on the holes facing in. */
export function prism(polygon: Polygon, lo: number, hi: number): BufferGeometry {
  const sink = new TriangleSink()
  sink.cap(polygon, hi, true)
  sink.cap(polygon, lo, false)
  const rings = [counterClockwise(polygon.outer), ...polygon.holes.map(clockwise)]
  for (const ring of rings) for (let i = 0; i < ring.length; i++) sink.side(ring[i], ring[(i + 1) % ring.length], lo, hi)
  return sink.geometry()
}

const ON_EDGE = 1e-6
const HASH_CELL = 0.5

/** Cell vertices in a coarse grid, for finding the ones that lie on a given edge. */
type VertexHash = Map<string, Vec2[]>
const hashKey = (x: number, y: number) => `${Math.floor(x / HASH_CELL)},${Math.floor(y / HASH_CELL)}`

function hashVertices(cells: WallSolids['cells']): VertexHash {
  const hash: VertexHash = new Map()
  for (const cell of cells) {
    for (const ring of [cell.points, ...cell.holes]) {
      for (const p of ring) {
        const k = hashKey(p[0], p[1])
        const bucket = hash.get(k)
        if (bucket) bucket.push(p)
        else hash.set(k, [p])
      }
    }
  }
  return hash
}

/** The vertices strictly inside the edge a→b, in order along it. */
function verticesOn(a: Vec2, b: Vec2, hash: VertexHash): Vec2[] {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const len2 = dx * dx + dy * dy
  if (!len2) return []
  const cuts: { t: number; p: Vec2 }[] = []
  const x0 = Math.floor(Math.min(a[0], b[0]) / HASH_CELL)
  const x1 = Math.floor(Math.max(a[0], b[0]) / HASH_CELL)
  const y0 = Math.floor(Math.min(a[1], b[1]) / HASH_CELL)
  const y1 = Math.floor(Math.max(a[1], b[1]) / HASH_CELL)
  for (let x = x0; x <= x1; x++) {
    for (let y = y0; y <= y1; y++) {
      for (const p of hash.get(`${x},${y}`) ?? []) {
        const t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2
        if (t <= 0 || t >= 1) continue
        const off = Math.abs((p[0] - a[0]) * dy - (p[1] - a[1]) * dx) / Math.sqrt(len2)
        if (off < ON_EDGE && !cuts.some(c => c.p[0] === p[0] && c.p[1] === p[1])) cuts.push({ t, p })
      }
    }
  }
  return cuts.sort((u, v) => u.t - v.t).map(c => c.p)
}

/**
 * A ring with every other cell's vertex that lies on one of its edges
 * inserted. Neighbouring cells stop and start at their own corners, and a
 * T sector's two lobes meet at a point on the stem's face, so without this
 * the caps would meet in T-junctions and the surface would not close
 * vertex to vertex.
 */
const refineRing = (ring: Ring, hash: VertexHash): Ring => ring.flatMap((p, i) => [p, ...verticesOn(p, ring[(i + 1) % ring.length], hash)])

/**
 * Wall solids between two heights: every cell capped top and bottom, and
 * sides only along the solids' outer boundary, so the seams between strips
 * and junction sectors get no faces. The boundary runs with the solid on
 * its left, which is the winding the side quads expect.
 */
export function solidsGeometry(solids: WallSolids, lo: number, hi: number): BufferGeometry {
  const sink = new TriangleSink()
  const hash = hashVertices(solids.cells)
  for (const cell of solids.cells) {
    const polygon = { outer: refineRing(cell.points, hash), holes: cell.holes.map(h => refineRing(h, hash)) }
    sink.cap(polygon, hi, true)
    sink.cap(polygon, lo, false)
  }
  for (const e of solids.boundary) {
    const points = [e.a, ...verticesOn(e.a, e.b, hash), e.b]
    for (let i = 1; i < points.length; i++) sink.side(points[i - 1], points[i], lo, hi)
  }
  return sink.geometry()
}
