import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { buildSolids, createSolidsUpdater, createEditorStore, createLevel, wallsFromSvg, normalizeLines, openingCuts, distanceToSegment, KERNEL_GRID } from '$lib/nimap'
import type { Level, SolidsResult, Vec2, Wall } from '$lib/nimap'
import { demoLevel } from '../fixtures/demo-building.fixture'

const reference = readFileSync(new URL('../fixtures/reference.svg', import.meta.url), 'utf8')

const rng = (seed: number) => {
  let s = seed + 1
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296)
}

function canonicalRing(ring: Vec2[]): string {
  const area = ring.reduce((s, p, i) => { const q = ring[(i + 1) % ring.length]; return s + p[0] * q[1] - q[0] * p[1] }, 0)
  const ccw = area < 0 ? [...ring].reverse() : ring
  const key = (p: Vec2) => `${p[0]},${p[1]}`
  let start = 0
  for (let i = 1; i < ccw.length; i++) if (key(ccw[i]) < key(ccw[start])) start = i
  return [...ccw.slice(start), ...ccw.slice(0, start)].map(key).join(' ')
}

const canonical = (s: Pick<SolidsResult, 'cells' | 'boundary'>) => ({
  cells: s.cells.map(c => `${c.owner} [${[...c.members].sort().join(',')}] ${canonicalRing(c.points)} | ${c.holes.map(canonicalRing).sort().join(' | ')}`).sort(),
  boundary: s.boundary.map(e => `${e.a[0]},${e.a[1]}>${e.b[0]},${e.b[1]}`).sort()
})

/** One edit a hand could make: a node dragged, a wall widened, a wall drawn off a node, a wall deleted, a door moved along its wall. */
function randomEdit(level: Level, rand: () => number) {
  const walls = level.walls
  const pick = <T>(xs: T[]) => xs[Math.floor(rand() * xs.length)]
  const kind = rand()
  if (kind < 0.45 || walls.length < 4) {
    const from = pick(walls).points[Math.floor(rand() * 2)]
    const to: Vec2 = [from[0] + (rand() - 0.5) * 2, from[1] + (rand() - 0.5) * 2]
    return [{ type: 'moveNodes' as const, moves: [{ from, to }] }]
  }
  if (kind < 0.6) return [{ type: 'setWallWidth' as const, wallIds: [pick(walls).id], width: Math.round((0.06 + rand() * 0.34) * 100) / 100 }]
  if (kind < 0.75) {
    const a = pick(walls).points[0]
    const angle = rand() * Math.PI * 2
    const b: Vec2 = [a[0] + Math.cos(angle) * (1 + rand() * 3), a[1] + Math.sin(angle) * (1 + rand() * 3)]
    return [{ type: 'addWall' as const, wall: { id: `n${Math.floor(rand() * 1e9)}`, points: [a, b] as [Vec2, Vec2], width: 0.12 } }]
  }
  if (kind < 0.9) return [{ type: 'removeLines' as const, ids: [pick(walls).id] }]
  if (!level.openings.length) return [{ type: 'removeLines' as const, ids: [pick(walls).id] }]
  const opening = pick(level.openings)
  return [{ type: 'setOpening' as const, openingId: opening.id, patch: { at: [opening.at[0] + (rand() - 0.5) * 0.4, opening.at[1] + (rand() - 0.5) * 0.4] as Vec2 } }]
}

function tiling(seed: number): Wall[] {
  const rand = rng(3000 + seed)
  let cells = [{ x0: 0, y0: 0, x1: 20, y1: 14 }]
  for (let i = 0; i < 9; i++) {
    const k = Math.floor(rand() * cells.length)
    const c = cells[k]
    const vertical = c.x1 - c.x0 > c.y1 - c.y0
    const span = vertical ? c.x1 - c.x0 : c.y1 - c.y0
    if (span < 3) continue
    const at = Math.round((0.3 + 0.4 * rand()) * span * 100) / 100
    const halves = vertical ? [{ ...c, x1: c.x0 + at }, { ...c, x0: c.x0 + at }] : [{ ...c, y1: c.y0 + at }, { ...c, y0: c.y0 + at }]
    cells = [...cells.slice(0, k), ...halves, ...cells.slice(k + 1)]
  }
  const walls: Wall[] = []
  cells.forEach((c, i) => {
    const r: Vec2[] = [[c.x0, c.y0], [c.x1, c.y0], [c.x1, c.y1], [c.x0, c.y1]]
    r.forEach((p, k) => walls.push({ id: `t${i}-${k}`, points: [p, r[(k + 1) % 4]], width: 0.12 }))
  })
  return normalizeLines(walls)
}

const plans: [string, Level, number][] = [
  ['demo floor', demoLevel(), 40],
  ['reference plan', createLevel({ name: 'reference', walls: normalizeLines(wallsFromSvg(reference, { scale: 0.01, width: 0.06 })) }), 15],
  ...Array.from({ length: 6 }, (_, i) => [`tiling ${i}`, createLevel({ name: `tiling ${i}`, walls: tiling(i) }), 25] as [string, Level, number])
]

/** How far apart two solves are: the largest distance from any cell or outline vertex of one to the same owner's cells, or the outline, of the other. */
function deviation(a: Pick<SolidsResult, 'cells' | 'boundary'>, b: Pick<SolidsResult, 'cells' | 'boundary'>): number {
  if (JSON.stringify(canonical(a)) === JSON.stringify(canonical(b))) return 0
  const rings = (s: typeof a, owner: string) => s.cells.filter(c => c.owner === owner).flatMap(c => [c.points, ...c.holes])
  const toRings = (p: Vec2, rs: Vec2[][]) => Math.min(...rs.flatMap(r => r.map((q, i) => distanceToSegment(p, q, r[(i + 1) % r.length]))))
  const toEdges = (p: Vec2, s: typeof a) => Math.min(...s.boundary.map(e => distanceToSegment(p, e.a, e.b)))
  let worst = 0
  for (const owner of new Set([...a.cells, ...b.cells].map(c => c.owner))) {
    const ra = rings(a, owner), rb = rings(b, owner)
    if (!ra.length || !rb.length) return Infinity
    for (const r of ra) for (const p of r) worst = Math.max(worst, toRings(p, rb))
    for (const r of rb) for (const p of r) worst = Math.max(worst, toRings(p, ra))
  }
  for (const e of a.boundary) worst = Math.max(worst, toEdges(e.a, b))
  for (const e of b.boundary) worst = Math.max(worst, toEdges(e.a, a))
  return worst
}

describe('local wall solids: re-solving around a change gives the full solve, up to one grid step of rounding', () => {
  it('through random edit sequences on real and generated plans, previews and commits alike, every cell and the outline lie within one kernel grid step of a full solve, and most steps are answered locally', () => {
    let local = 0
    let steps = 0
    for (const [name, initial, count] of plans) {
      const store = createEditorStore(initial)
      const updater = createSolidsUpdater()
      const rand = rng(name.length * 7919)
      const agree = (level: Level, when: string) => {
        const cuts = openingCuts(level.openings, level.walls)
        const got = updater.update(level.walls, cuts)
        const want = buildSolids(level.walls, cuts)
        expect(deviation(got, want), `${name}, ${when}`).toBeLessThanOrEqual(KERNEL_GRID * 1.01)
        steps++
        if (updater.last === 'local') local++
      }
      agree(store.level, 'opened')
      for (let i = 0; i < count; i++) {
        const commands = randomEdit(store.level, rand)
        store.preview(commands)
        agree(store.working, `step ${i} preview`)
        store.commit('Edit', commands)
        agree(store.level, `step ${i} commit`)
      }
    }
    expect(local / steps).toBeGreaterThan(0.5)
  }, 120_000)

  it('a full solve it adopts is given back exactly, and an unchanged level is answered from memory; a level whose walls all changed is solved in full', () => {
    const level = demoLevel()
    const cuts = openingCuts(level.openings, level.walls)
    const updater = createSolidsUpdater()
    const full = buildSolids(level.walls, cuts)
    updater.adopt(level.walls, cuts, full)
    const again = updater.update(level.walls, cuts)
    expect(updater.last).toBe('same')
    expect(canonical(again)).toEqual(canonical(full))
    updater.update(level.walls.map(w => ({ ...w })), cuts)
    expect(updater.last).toBe('full')
  })
})
