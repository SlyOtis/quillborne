import { describe, it, expect } from 'vitest'
import { documentFromImdf, createEditorStore, pointInPolygon, distance } from '$lib/nimap'

/** The categories the tilings use, read as the importer should read them: open floor has no walls between, a room or an office is enclosed, a void gets a railing. */
const OPEN = ['walkway', 'stairs']
import type { ImdfArchive, ImdfFeature, Level, Vec2 } from '$lib/nimap'

const LON0 = 10.75, LAT0 = 59.91
const E2 = 0.00669437999014
const phi = (LAT0 * Math.PI) / 180
const w = 1 - E2 * Math.sin(phi) ** 2
const EAST = ((6378137 / Math.sqrt(w)) * Math.cos(phi) * Math.PI) / 180
const NORTH = ((6378137 * (1 - E2)) / w ** 1.5 * Math.PI) / 180
const geo = ([x, y]: Vec2): Vec2 => [LON0 + x / EAST, LAT0 + y / NORTH]

interface Cell { x0: number; y0: number; x1: number; y1: number; category: string }

const rectRing = (c: Cell): Vec2[] => [[c.x0, c.y0], [c.x1, c.y0], [c.x1, c.y1], [c.x0, c.y1], [c.x0, c.y0]]

/** A rectangle cut again and again along random lines, so a cut across one piece meets its neighbours' edges in T-junctions; cells whole centimetres, each a room or open floor. */
function tiling(seed: number): Cell[] {
  let s = seed + 1
  const rand = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296)
  let cells: Cell[] = [{ x0: 0, y0: 0, x1: 24, y1: 16, category: 'room' }]
  for (let i = 0; i < 9; i++) {
    const k = Math.floor(rand() * cells.length)
    const c = cells[k]
    const vertical = c.x1 - c.x0 > c.y1 - c.y0 ? rand() < 0.8 : rand() < 0.2
    const span = vertical ? c.x1 - c.x0 : c.y1 - c.y0
    if (span < 3) continue
    const at = Math.round((0.3 + 0.4 * rand()) * span * 100) / 100
    const halves: Cell[] = vertical
      ? [{ ...c, x1: c.x0 + at }, { ...c, x0: c.x0 + at }]
      : [{ ...c, y1: c.y0 + at }, { ...c, y0: c.y0 + at }]
    cells = [...cells.slice(0, k), ...halves, ...cells.slice(k + 1)]
  }
  const categories = ['room', 'room', 'office', 'walkway', 'walkway', 'stairs', 'opentobelow']
  return cells.map(c => ({ ...c, category: categories[Math.floor(rand() * categories.length)] }))
}

const feature = (id: string, geometry: ImdfFeature['geometry'], properties: Record<string, unknown>): ImdfFeature => ({ id, geometry, properties })

function archiveOf(cells: Cell[], doors: [Vec2, Vec2][] = [], levels = [{ id: 'L0', ordinal: 0, outdoor: false }]): ImdfArchive {
  return {
    venue: { features: [feature('v', null, { name: { en: 'Venue' }, display_point: { type: 'Point', coordinates: [LON0, LAT0] } })] },
    level: { features: levels.map(l => feature(l.id, null, { ordinal: l.ordinal, outdoor: l.outdoor, name: { en: `Level ${l.id}` } })) },
    unit: { features: cells.map((c, i) => feature(`u${i}`, { type: 'Polygon', coordinates: [rectRing(c).map(geo)] }, { category: c.category, level_id: (c as Cell & { level?: string }).level ?? levels[0].id })) },
    opening: { features: doors.map(([a, b], i) => feature(`o${i}`, { type: 'LineString', coordinates: [geo(a), geo(b)] }, { category: 'pedestrian', level_id: levels[0].id })) }
  }
}

const settled = (level: Level): Level => createEditorStore(level).level
const netArea = (p: { outer: Vec2[]; holes: Vec2[][] }): number => {
  const a = (r: Vec2[]) => Math.abs(r.reduce((s, v, i) => { const q = r[(i + 1) % r.length]; return s + v[0] * q[1] - q[0] * v[1] }, 0) / 2)
  return a(p.outer) - p.holes.reduce((s, h) => s + a(h), 0)
}

/** Every stretch where two cells meet: the piece of edge they share, with both categories. */
function sharedEdges(cells: Cell[]): { a: Vec2; b: Vec2; open: boolean }[] {
  const out: { a: Vec2; b: Vec2; open: boolean }[] = []
  for (let i = 0; i < cells.length; i++) {
    for (let j = i + 1; j < cells.length; j++) {
      const p = cells[i], q = cells[j]
      const open = OPEN.includes(p.category) && OPEN.includes(q.category)
      if (p.x1 === q.x0 || q.x1 === p.x0) {
        const x = p.x1 === q.x0 ? p.x1 : p.x0
        const y0 = Math.max(p.y0, q.y0), y1 = Math.min(p.y1, q.y1)
        if (y1 - y0 > 0.5) out.push({ a: [x, y0], b: [x, y1], open })
      }
      if (p.y1 === q.y0 || q.y1 === p.y0) {
        const y = p.y1 === q.y0 ? p.y1 : p.y0
        const x0 = Math.max(p.x0, q.x0), x1 = Math.min(p.x1, q.x1)
        if (x1 - x0 > 0.5) out.push({ a: [x0, y], b: [x1, y], open })
      }
    }
  }
  return out
}

describe('IMDF import: walls from the edges where units meet', () => {
  it('over random tilings with T-junctions: every unit not open floor comes back as one room of its own area, every door on a wall stays, and where open floor meets open floor there is no wall and the door there is dropped', () => {
    for (let seed = 0; seed < 40; seed++) {
      const cells = tiling(seed)
      const shared = sharedEdges(cells)
      const doors = shared.map(e => {
        const m: Vec2 = [(e.a[0] + e.b[0]) / 2, (e.a[1] + e.b[1]) / 2]
        const along = e.a[0] === e.b[0] ? [0, 0.45] : [0.45, 0]
        return [[m[0] - along[0], m[1] - along[1]], [m[0] + along[0], m[1] + along[1]]] as [Vec2, Vec2]
      })
      const doc = documentFromImdf(archiveOf(cells, doors))
      const level = settled(doc.levels[0])
      for (const cell of cells) {
        if (OPEN.includes(cell.category)) continue
        const centre: Vec2 = [(cell.x0 + cell.x1) / 2, (cell.y0 + cell.y1) / 2]
        const rooms = level.units.filter(u => pointInPolygon(centre, u.polygon))
        expect(rooms, `seed ${seed}: cell at ${centre}`).toHaveLength(1)
        expect(netArea(rooms[0].polygon), `seed ${seed}: cell at ${centre}`).toBeCloseTo((cell.x1 - cell.x0) * (cell.y1 - cell.y0), 1)
      }
      const kept = shared.filter(e => !e.open).length
      expect(level.openings, `seed ${seed}`).toHaveLength(kept)
      for (const e of shared.filter(e => e.open)) {
        const m: Vec2 = [(e.a[0] + e.b[0]) / 2, (e.a[1] + e.b[1]) / 2]
        expect(level.walls.some(wl => distance(wl.points[0], m) + distance(m, wl.points[1]) - distance(wl.points[0], wl.points[1]) < 1e-3), `seed ${seed}: open edge at ${m}`).toBe(false)
      }
    }
  })

  it('a wall is one line per stretch: no two walls overlap, however the units split their shared edges', () => {
    for (let seed = 0; seed < 40; seed++) {
      const level = settled(documentFromImdf(archiveOf(tiling(seed))).levels[0])
      const walls = level.walls
      for (let i = 0; i < walls.length; i++) {
        for (let j = i + 1; j < walls.length; j++) {
          const [a, b] = walls[i].points, [c, d] = walls[j].points
          const onA = (p: Vec2) => distance(a, p) + distance(p, b) - distance(a, b) < 1e-4
          const overlap = onA(c) && onA(d) || (onA(c) || onA(d)) && [a, b].some(p => distance(c, p) + distance(p, d) - distance(c, d) < 1e-4 && distance(p, c) > 1e-3 && distance(p, d) > 1e-3)
          expect(overlap, `seed ${seed}: walls ${i} and ${j}`).toBe(false)
        }
      }
    }
  })

  it('a wall between two units gets the interior width, one with a unit on one side only the exterior width', () => {
    const cells: Cell[] = [{ x0: 0, y0: 0, x1: 4, y1: 3, category: 'room' }, { x0: 4, y0: 0, x1: 8, y1: 3, category: 'room' }]
    const level = settled(documentFromImdf(archiveOf(cells), { interiorWidth: 0.1, exteriorWidth: 0.3 }).levels[0])
    const middle = level.walls.filter(wl => wl.points.every(p => Math.abs(p[0] - 4) < 1e-3))
    expect(middle.map(wl => wl.width)).toEqual([0.1])
    expect(level.walls.filter(wl => wl !== middle[0]).every(wl => wl.width === 0.3)).toBe(true)
  })

  it('projects to metres on the ellipsoid: a degree of latitude and of longitude at 60° north come out at their known lengths', () => {
    const cells: Cell[] = [{ x0: 0, y0: 0, x1: 1, y1: 1, category: 'room' }]
    const archive = archiveOf(cells)
    archive.unit.features[0].geometry = { type: 'Polygon', coordinates: [[[10, 60], [11, 60], [11, 61], [10, 61], [10, 60]]] }
    archive.venue!.features[0].properties.display_point = { type: 'Point', coordinates: [10, 60] }
    const walls = documentFromImdf(archive).levels[0].walls
    const lengths = walls.map(wl => distance(wl.points[0], wl.points[1]))
    expect(Math.min(...lengths)).toBeCloseTo(55800, -2)
    expect(Math.max(...lengths)).toBeCloseTo(111412, -2)
  })

  it('a void gets a railing where open floor meets it, a wall where an enclosed space does', () => {
    const cells: Cell[] = [
      { x0: 0, y0: 0, x1: 6, y1: 4, category: 'walkway' },
      { x0: 6, y0: 0, x1: 9, y1: 4, category: 'opentobelow' },
      { x0: 6, y0: 4, x1: 9, y1: 7, category: 'room' }
    ]
    const level = settled(documentFromImdf(archiveOf(cells), { railingWidth: 0.05, railingHeight: 1.1 }).levels[0])
    const on = (p: Vec2) => level.walls.find(wl => distance(wl.points[0], p) + distance(p, wl.points[1]) - distance(wl.points[0], wl.points[1]) < 1e-4)
    expect(on([6, 2])).toMatchObject({ width: 0.05, height: 1.1 })
    expect(on([7.5, 4])!.height).toBeUndefined()
    expect(level.units.filter(u => pointInPolygon([7.5, 2], u.polygon))).toHaveLength(1)
  })

  it('open floor ends in a wall at the building’s edge indoors, and in nothing at the edge of an outdoor level', () => {
    const indoor = settled(documentFromImdf(archiveOf([{ x0: 0, y0: 0, x1: 5, y1: 5, category: 'walkway' }])).levels[0])
    expect(indoor.walls.length).toBeGreaterThan(0)
    const outdoor = documentFromImdf(archiveOf([{ x0: 0, y0: 0, x1: 5, y1: 5, category: 'walkway' }], [], [{ id: 'L0', ordinal: 0, outdoor: true }])).levels[0]
    expect(outdoor.walls).toHaveLength(0)
  })

  it('where an indoor unit meets an outdoor one there is an exterior wall, even with open floor on both sides', () => {
    const hall: Cell & { level: string } = { x0: 0, y0: 0, x1: 6, y1: 4, category: 'walkway', level: 'in' }
    const plaza: Cell & { level: string } = { x0: 6, y0: 0, x1: 12, y1: 4, category: 'walkway', level: 'out' }
    const level = settled(documentFromImdf(archiveOf([hall, plaza], [], [{ id: 'in', ordinal: 0, outdoor: false }, { id: 'out', ordinal: 0, outdoor: true }]), { exteriorWidth: 0.3 }).levels[0])
    const facade = level.walls.filter(wl => wl.points.every(p => Math.abs(p[0] - 6) < 1e-3))
    expect(facade.map(wl => wl.width)).toEqual([0.3])
    expect(level.units.filter(u => pointInPolygon([3, 2], u.polygon))).toHaveLength(1)
  })

  it('levels sharing an ordinal become one, named after the indoor part, at the ordinal times the storey height, with the venue as the origin', () => {
    const inside: Cell & { level: string } = { x0: 0, y0: 0, x1: 4, y1: 4, category: 'room', level: 'in' }
    const outside: Cell & { level: string } = { x0: 4, y0: 0, x1: 8, y1: 4, category: 'room', level: 'out' }
    const doc = documentFromImdf(archiveOf([inside, outside], [], [{ id: 'out', ordinal: 2, outdoor: true }, { id: 'in', ordinal: 2, outdoor: false }]), { storeyHeight: 3.5 })
    expect(doc.levels).toHaveLength(1)
    expect(doc.levels[0].name).toBe('Level in')
    expect(doc.levels[0].elevation).toBe(7)
    expect(doc.origin).toEqual({ longitude: LON0, latitude: LAT0, bearing: 0 })
    expect(settled(doc.levels[0]).units).toHaveLength(2)
  })
})
