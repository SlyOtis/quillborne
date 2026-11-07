import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { buildSolids, wallsFromSvg, normalizeLines, documentFromImdf, createEditorStore } from '$lib/nimap'
import type { Wall, WallSolids, Vec2, ImdfArchive } from '$lib/nimap'
import { demoWalls } from '../fixtures/demo-building.fixture'

const reference = readFileSync(new URL('../fixtures/reference.svg', import.meta.url), 'utf8')

const rng = (seed: number) => {
  let s = seed + 1
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296)
}

function shuffled<T>(items: T[], seed: number): T[] {
  const rand = rng(seed)
  const out = [...items]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

/** A ring written from its smallest vertex, counter-clockwise, so two equal rings print the same whatever their start and direction. */
function canonicalRing(ring: Vec2[]): string {
  const area = ring.reduce((s, p, i) => { const q = ring[(i + 1) % ring.length]; return s + p[0] * q[1] - q[0] * p[1] }, 0)
  const ccw = area < 0 ? [...ring].reverse() : ring
  const key = (p: Vec2) => `${p[0]},${p[1]}`
  let start = 0
  for (let i = 1; i < ccw.length; i++) if (key(ccw[i]) < key(ccw[start])) start = i
  return [...ccw.slice(start), ...ccw.slice(0, start)].map(key).join(' ')
}

/** Everything the solve decides, independent of the order it was written in: each cell by owner, members and rings, and the outer boundary as a set of edges. */
function canonical(solids: WallSolids) {
  const cells = solids.cells.map(c => `${c.owner} [${[...c.members].sort().join(',')}] ${canonicalRing(c.points)} | ${c.holes.map(canonicalRing).sort().join(' | ')}`).sort()
  const boundary = solids.boundary.map(e => `${e.a[0]},${e.a[1]}>${e.b[0]},${e.b[1]}`).sort()
  return { cells, boundary }
}

/** Walls dropped at random in a 10 m square, widths from 8 to 40 cm, restored to the document invariant: crossings, T-junctions, acute joins and mixed widths. */
function soup(seed: number): Wall[] {
  const rand = rng(1000 + seed)
  const walls: Wall[] = []
  for (let i = 0; i < 24; i++) {
    const a: Vec2 = [Math.round(rand() * 1000) / 100, Math.round(rand() * 1000) / 100]
    const b: Vec2 = [Math.round(rand() * 1000) / 100, Math.round(rand() * 1000) / 100]
    walls.push({ id: `w${i}`, points: [a, b], width: Math.round((0.08 + rand() * 0.32) * 100) / 100 })
  }
  return normalizeLines(walls)
}

/** A floor imported from a random IMDF tiling, so the walls meet the way traced rooms do. */
function tiled(seed: number): Wall[] {
  const rand = rng(2000 + seed)
  let cells = [{ x0: 0, y0: 0, x1: 20, y1: 14 }]
  for (let i = 0; i < 8; i++) {
    const k = Math.floor(rand() * cells.length)
    const c = cells[k]
    const vertical = c.x1 - c.x0 > c.y1 - c.y0
    const span = vertical ? c.x1 - c.x0 : c.y1 - c.y0
    if (span < 3) continue
    const at = Math.round((0.3 + 0.4 * rand()) * span * 100) / 100
    const halves = vertical ? [{ ...c, x1: c.x0 + at }, { ...c, x0: c.x0 + at }] : [{ ...c, y1: c.y0 + at }, { ...c, y0: c.y0 + at }]
    cells = [...cells.slice(0, k), ...halves, ...cells.slice(k + 1)]
  }
  const geo = ([x, y]: Vec2): Vec2 => [10 + x / 55800, 60 + y / 111412]
  const archive: ImdfArchive = {
    level: { features: [{ id: 'L', geometry: null, properties: { ordinal: 0 } }] },
    unit: { features: cells.map((c, i) => ({ id: `u${i}`, geometry: { type: 'Polygon', coordinates: [[[c.x0, c.y0], [c.x1, c.y0], [c.x1, c.y1], [c.x0, c.y1], [c.x0, c.y0]].map(p => geo(p as Vec2))] }, properties: { category: 'room', level_id: 'L' } })) }
  }
  return createEditorStore(documentFromImdf(archive).levels[0]).level.walls
}

const sets: [string, Wall[]][] = [
  ['demo floor', demoWalls()],
  ['reference plan', normalizeLines(wallsFromSvg(reference, { scale: 0.01, width: 0.06 }))],
  ...Array.from({ length: 12 }, (_, i) => [`soup ${i}`, soup(i)] as [string, Wall[]]),
  ...Array.from({ length: 6 }, (_, i) => [`tiling ${i}`, tiled(i)] as [string, Wall[]])
]

describe('wall solids do not depend on the order of the walls', () => {
  it('every wall set solves to the same cells, owners and boundary whatever order its walls are listed in', { timeout: 30_000 }, () => {
    for (const [name, walls] of sets) {
      const expected = canonical(buildSolids(walls))
      for (const [label, order] of [['reversed', [...walls].reverse()], ...[1, 2, 3].map(s => [`shuffle ${s}`, shuffled(walls, s)])] as [string, Wall[]][]) {
        const got = canonical(buildSolids(order))
        expect(got.cells, `${name}, ${label}: cells`).toEqual(expected.cells)
        expect(got.boundary, `${name}, ${label}: boundary`).toEqual(expected.boundary)
      }
    }
  })
})
