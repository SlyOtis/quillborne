import { describe, it, expect } from 'vitest'
import { Box3, Mesh, Raycaster, Vector3, type BufferGeometry } from 'three'
import { buildLevel, prism, roomFloors, solidsGeometry, standOnFloors, KEY_LIGHT, lightDirection, ROOM_HEIGHT, type LevelObject } from '$lib/nimap/render'
import { buildSolids, createLevel, createEditorStore, STOREY_HEIGHT, validateWall, wallBands, footprint, overlapArea, partVertices, partsExtent, placeItem, pointInPolygon, polygonArea, seededRandom } from '$lib/nimap'
import type { Opening, Part, Polygon, Wall } from '$lib/nimap'
import { demoFurniture, demoLevel } from '../fixtures/demo-building.fixture'

const wall = (id: string, points: [[number, number], [number, number]], width = 0.16): Wall => ({ id, points, width })
const room = () => [wall('n', [[0, 0], [6, 0]]), wall('e', [[6, 0], [6, 4]]), wall('s', [[6, 4], [0, 4]]), wall('w', [[0, 4], [0, 0]])]

const key = (p: number[]) => p.map(v => Math.round(v * 1e5)).join(',')

/**
 * A closed surface has every directed edge matched by its reverse: the
 * caps and the sides meet, and the sides all face the same way out.
 */
function unmatchedEdges(g: BufferGeometry): number {
  const pos = g.getAttribute('position')
  const count = new Map<string, number>()
  for (let i = 0; i < pos.count; i += 3) {
    const v = [0, 1, 2].map(j => key([pos.getX(i + j), pos.getY(i + j), pos.getZ(i + j)]))
    for (let j = 0; j < 3; j++) {
      const a = v[j]
      const b = v[(j + 1) % 3]
      const reverse = `${b}>${a}`
      if ((count.get(reverse) ?? 0) > 0) count.set(reverse, count.get(reverse)! - 1)
      else count.set(`${a}>${b}`, (count.get(`${a}>${b}`) ?? 0) + 1)
    }
  }
  return [...count.values()].reduce((s, n) => s + n, 0)
}

/** Signed volume by the divergence theorem: positive when every face points outward. */
function volume(g: BufferGeometry): number {
  const pos = g.getAttribute('position')
  let sum = 0
  for (let i = 0; i < pos.count; i += 3) {
    const [a, b, c] = [0, 1, 2].map(j => [pos.getX(i + j), pos.getY(i + j), pos.getZ(i + j)])
    sum += a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0])
  }
  return sum / 6
}

describe('render geometry', () => {
  it('a prism is watertight with outward faces whatever the ring orientation, and its volume is area times height', () => {
    const square: Polygon = { outer: [[0, 0], [2, 0], [2, 3], [0, 3]], holes: [] }
    const reversed: Polygon = { outer: [...square.outer].reverse(), holes: [] }
    const withHole: Polygon = { outer: square.outer, holes: [[[0.5, 0.5], [1.5, 0.5], [1.5, 1.5], [0.5, 1.5]]] }
    const holeReversed: Polygon = { outer: square.outer, holes: [[...withHole.holes[0]].reverse()] }
    for (const [polygon, area] of [[square, 6], [reversed, 6], [withHole, 5], [holeReversed, 5]] as const) {
      const g = prism(polygon, -0.5, 1)
      expect(unmatchedEdges(g)).toBe(0)
      expect(volume(g)).toBeCloseTo(area * 1.5, 6)
    }
  })

  it('wall solids are watertight and outward for a room, a T, a crossing and the demo building, with and without openings', () => {
    const door: Opening = { id: 'd', kind: 'door', at: [3, 0], width: 0.9, from: 0, to: 2.1 }
    const window: Opening = { id: 'w', kind: 'window', at: [6, 2], width: 1.2, from: 0.9, to: 2.1 }
    const sets: [Wall[], Opening[]][] = [
      [room(), []],
      [room(), [door, window]],
      [[...room(), wall('t', [[3, 0], [3, 4]])], [{ ...door, at: [1.5, 0] }, { ...window, at: [3, 4] }]],
      [[...room(), wall('t', [[3, 0], [3, 4]])], [door]],
      [[...room(), wall('x', [[1, 2], [5, 2]]), wall('y', [[3, 1], [3, 3]])], []],
      [demoLevel().walls, []]
    ]
    for (const [walls, openings] of sets) {
      const level = createEditorStore(createLevel({ name: 'L', walls, openings })).level
      const cuts = wallBands(level.walls, level.openings, 1.15)[0].cuts
      const solids = buildSolids(level.walls, cuts)
      const g = solidsGeometry(solids, 0, 1.15)
      expect(unmatchedEdges(g), `${walls.length} walls`).toBe(0)
      expect(volume(g)).toBeCloseTo(solids.area * 1.15, 4)
    }
  })

  it('a level object holds one mesh per wall band, a slab and every closed fixture, at the level’s elevation', () => {
    const level = demoLevel()
    const object = buildLevel(level)
    expect(object.warnings).toEqual([])
    const meshes = object.group.children
    const byMaterial = (name: string) => meshes.filter(m => (m as { material?: { color?: unknown } }).material === object.materials[name as keyof typeof object.materials])
    expect(byMaterial('wall').length).toBe(1)
    expect(byMaterial('slab').length).toBe(1)
    expect(object.group.position.y).toBe(level.elevation)
    expect(object.bounds.min.y).toBeCloseTo(level.elevation - 0.16, 6)
    expect(object.bounds.max.y).toBeCloseTo(level.elevation + 1.15, 6)
    object.dispose()
  })

  it('a window splits the walls into a band below the sill and a cut band above it; a door leaves one cut band', () => {
    const door: Opening = { id: 'd', kind: 'door', at: [3, 0], width: 0.9, from: 0, to: 2.1 }
    const window: Opening = { id: 'w', kind: 'window', at: [6, 2], width: 1.2, from: 0.9, to: 2.1 }
    const bands = (openings: Opening[]) => {
      const object = buildLevel(createEditorStore(createLevel({ name: 'L', walls: room(), openings })).level)
      return object.group.children.filter(m => m instanceof Mesh && m.material === object.materials.wall)
    }
    expect(bands([]).length).toBe(1)
    expect(bands([door]).length).toBe(1)
    expect(bands([window]).length).toBe(2)
    expect(bands([door, window]).length).toBe(2)
  })

  it('every wall is drawn at its own height or the cut, whichever is lower, interior and exterior, whatever openings slice the bands', () => {
    const door: Opening = { id: 'd', kind: 'door', at: [1.5, 0], width: 0.9, from: 0, to: 2.1 }
    const window: Opening = { id: 'w', kind: 'window', at: [6, 2], width: 1.2, from: 0.9, to: 2.1 }
    const walls = [...room(), wall('divider', [[3, 0], [3, 4]]), { ...wall('half', [[4.5, 0], [4.5, 2]]), height: 0.9 }]
    const topNear = (object: LevelObject, x: number, y: number) => {
      object.group.updateMatrixWorld(true)
      const walls = object.group.children.filter(m => m instanceof Mesh && m.material === object.materials.wall)
      const hit = new Raycaster(new Vector3(x, 10, -y), new Vector3(0, -1, 0)).intersectObjects(walls)[0]
      return hit ? hit.point.y : -Infinity
    }
    for (const storey of [undefined, 2.4, 3.2]) {
      const level = { ...createEditorStore(createLevel({ name: 'L', walls, openings: [door, window] })).level, ...(storey ? { height: storey } : {}) }
      const ceiling = storey ?? STOREY_HEIGHT
      for (const cut of [0.5, 1.15, 2.1, 5]) {
        for (const exterior of [0.5, 1.15, 1.5, 1.9, 2.1, 2.5, 3, 5]) {
          const object = buildLevel(level, { wallHeight: cut, exteriorWallHeight: exterior })
          const at = `ceiling ${ceiling}, cut ${cut}, outer cut ${exterior}`
          expect(topNear(object, 3, 2), `divider, ${at}`).toBeCloseTo(Math.min(ceiling, cut), 6)
          expect(topNear(object, 4.5, 1), `half wall, ${at}`).toBeCloseTo(Math.min(0.9, cut), 6)
          expect(topNear(object, 0, 2), `outer wall, ${at}`).toBeCloseTo(Math.min(ceiling, exterior), 6)
          object.dispose()
        }
      }
    }
  })
})

describe('glass walls', () => {
  it('a glass wall stands as a pane between two dark rails, each closed, the solid walls closed without it, and a door through it cuts all three', () => {
    for (const door of [null, { id: 'd', kind: 'door' as const, at: [3, 4] as [number, number], width: 0.9, from: 0, to: 2.1 }]) {
      const walls = [...room().slice(0, 2), { ...wall('s', [[6, 4], [0, 4]], 0.04), material: 'glass' as const }, room()[3]]
      const level = createEditorStore(createLevel({ name: 'L', walls, openings: door ? [door] : [] })).level
      const object = buildLevel(level)
      const meshes = (name: 'wall' | 'glass' | 'glassFrame') => object.group.children.filter((m): m is Mesh => m instanceof Mesh && m.material === object.materials[name])
      const cuts = wallBands(level.walls, level.openings, 1.15)[0].cuts
      const solid = buildSolids(level.walls.filter(w => w.material !== 'glass'), cuts)
      const glass = buildSolids(level.walls.filter(w => w.material === 'glass'), cuts)
      const [wallMesh] = meshes('wall')
      expect(unmatchedEdges(wallMesh.geometry)).toBe(0)
      expect(volume(wallMesh.geometry)).toBeCloseTo(solid.area * 1.15, 4)
      const [pane] = meshes('glass')
      expect(unmatchedEdges(pane.geometry)).toBe(0)
      expect(volume(pane.geometry)).toBeCloseTo(glass.area * (1.15 - 0.1), 5)
      const frames = meshes('glassFrame').map(m => ({ m, box: new Box3().setFromObject(m) }))
      const rails = frames.filter(f => f.box.max.y - f.box.min.y < 0.06)
      const posts = frames.filter(f => f.box.max.y - f.box.min.y > 0.06)
      expect(rails.length).toBe(2)
      for (const { m } of rails) {
        expect(unmatchedEdges(m.geometry)).toBe(0)
        expect(volume(m.geometry)).toBeCloseTo(glass.area * 0.05, 5)
      }
      expect(posts.length, 'a post at each jamb').toBe(door ? 2 : 0)
      for (const { m, box } of posts) {
        expect(unmatchedEdges(m.geometry)).toBe(0)
        expect(box.max.y - box.min.y).toBeCloseTo(1.15, 6)
        const x = (box.min.x + box.max.x) / 2
        expect(Math.abs(x - 3), 'standing past the jamb, in the glass').toBeGreaterThan(0.45)
        expect(Math.abs(x - 3), 'within a post of the jamb').toBeLessThan(0.5)
      }
      if (door) expect(glass.area).toBeLessThan(buildSolids(level.walls.filter(w => w.material === 'glass')).area - 0.9 * 0.04 + 1e-6)
      object.dispose()
    }
  })

  it('a glass wall that meets no other wall gets a post at each free end', () => {
    const lone = { ...wall('g', [[1, 1], [4, 1]], 0.04), material: 'glass' as const }
    const level = createEditorStore(createLevel({ name: 'L', walls: [...room(), lone] })).level
    const object = buildLevel(level)
    const posts = object.group.children.filter((m): m is Mesh => m instanceof Mesh && m.material === object.materials.glassFrame).map(m => new Box3().setFromObject(m)).filter(b => b.max.y - b.min.y > 0.06)
    expect(posts.length).toBe(2)
    const xs = posts.map(b => (b.min.x + b.max.x) / 2).sort((p, q) => p - q)
    expect(xs[0]).toBeGreaterThan(1)
    expect(xs[0]).toBeLessThan(1.05)
    expect(xs[1]).toBeGreaterThan(3.95)
    expect(xs[1]).toBeLessThan(4)
    object.dispose()
  })

  it('a wall of an unknown material is refused', () => {
    expect(() => validateWall({ ...wall('x', [[0, 0], [1, 0]]), material: 'paper' as 'glass' })).toThrow(/material/)
  })
})

describe('the host’s look', () => {
  it('furniture and openings can be left out without touching anything else', () => {
    const level = demoLevel()
    const themed = buildLevel(level)
    const bare = buildLevel(level, { fixtures: false, openings: false })
    const whole = (o: LevelObject) => o.group.children.filter(m => m instanceof Mesh && m.material === o.materials.wall).reduce((v, m) => v + volume((m as Mesh).geometry), 0)
    expect(bare.group.children.length).toBeLessThan(themed.group.children.length)
    expect(whole(bare), 'walls drawn whole where doors were').toBeGreaterThan(whole(themed))
    themed.dispose()
    bare.dispose()
  })
})

describe('the key light', () => {
  it('turns from a bearing and a height: north, east and straight up where they should be, and the lobby look’s own light unchanged', () => {
    const close = (v: { x: number; y: number; z: number }, e: [number, number, number]) => [v.x, v.y, v.z].forEach((c, i) => expect(c).toBeCloseTo(e[i], 9))
    close(lightDirection({ azimuth: 0, elevation: 0 }), [0, 0, -1])
    close(lightDirection({ azimuth: 90, elevation: 0 }), [1, 0, 0])
    close(lightDirection({ azimuth: 213, elevation: 90 }), [0, 1, 0])
    const d = lightDirection(KEY_LIGHT)
    const l = Math.hypot(-4, 30, -18)
    close(d, [-4 / l, 30 / l, -18 / l])
  })
})

describe('room floors', () => {
  /** A room split by a partition, closed on one side by a thin glass-width wall, every unit named so each is coloured. */
  function mixedWidths() {
    const walls = [
      wall('n', [[0, 0], [6, 0]]),
      wall('e', [[6, 0], [6, 4]]),
      wall('s', [[6, 4], [0, 4]], 0.04),
      wall('w', [[0, 4], [0, 0]]),
      wall('p', [[2.5, 0], [2.5, 4]], 0.05),
      wall('stub', [[4, 0], [4, 1.5]], 0.1)
    ]
    const level = createEditorStore(createLevel({ name: 'L', walls })).level
    return { ...level, units: level.units.map((u, i) => ({ ...u, name: `Room ${i}` })) }
  }

  it('the colour of a room reaches the face of every wall round it, whatever its width, and never enters one', () => {
    for (const level of [mixedWidths(), demoLevel()]) {
      const cells = buildSolids(level.walls).cells.map((c): Polygon => ({ outer: c.points, holes: c.holes }))
      for (const { unit, polygons } of roomFloors(level)) {
        const fill = polygons.reduce((sum, p) => sum + polygonArea(p), 0)
        const walled = cells.reduce((sum, c) => sum + overlapArea(unit.polygon, c), 0)
        expect(fill + walled, `${unit.name}: colour and walls cover the room once`).toBeCloseTo(polygonArea(unit.polygon), 3)
        for (const p of polygons) expect(cells.reduce((sum, c) => sum + overlapArea(p, c), 0), `${unit.name}: colour inside a wall`).toBeLessThan(1e-4)
      }
    }
  })
})

describe('furniture on the floors', () => {
  const inFloor = (floors: Polygon[], p: [number, number]) => floors.some(f => pointInPolygon(p, f))

  /** No vertex of any piece lies under the top of a room's coloured floor, and a piece clear of every room floor is left where it stood. */
  function checkStanding(level: ReturnType<typeof demoLevel>, pieces: Part[][]) {
    const floors = roomFloors(level).flatMap(f => f.polygons)
    const stood = standOnFloors(pieces, floors.map(polygon => ({ polygon, top: ROOM_HEIGHT })))
    stood.forEach((piece, i) => {
      const touches = pieces[i].some(part => partVertices(part).some(v => inFloor(floors, [v[0], v[1]])))
      for (const part of piece) {
        for (const v of partVertices(part)) {
          if (inFloor(floors, [v[0], v[1]])) expect(v[2], `piece ${i}`).toBeGreaterThanOrEqual(ROOM_HEIGHT - 1e-9)
        }
      }
      if (!touches) expect(piece, `piece ${i}`).toEqual(pieces[i])
    })
  }

  it('a room’s colour lies under everything standing in the room, including a piece only partly on it', () => {
    const level = demoLevel()
    checkStanding(level, demoFurniture())
    const random = seededRandom(11)
    const { min, max } = partsExtent(level.walls.map(w => ({ shape: { type: 'box' as const, size: [0.01, 0.01, 0.01] as [number, number, number] }, material: 'wall' as const, transform: [1, 0, 0, 0, 1, 0, 0, 0, 1, w.points[0][0], w.points[0][1], 0] as const })))
    const pieces: Part[][] = []
    for (let i = 0; i < 400; i++) {
      const at: [number, number] = [min[0] + random() * (max[0] - min[0]), min[1] + random() * (max[1] - min[1])]
      const angle = random() * 2 * Math.PI
      pieces.push(placeItem(i % 2 ? 'meetingChair' : 'officeChair', at, [Math.cos(angle), Math.sin(angle)]))
    }
    checkStanding(level, pieces)
  })
})

describe('the demo floor', () => {
  it('its furniture stands clear of every wall, and no two pieces meet in space', () => {
    checkClear()
  })

  function checkClear() {
    const level = demoLevel()
    const strips: Polygon[] = level.walls.map(w => {
      const [a, b] = w.points
      const l = Math.hypot(b[0] - a[0], b[1] - a[1])
      const n: [number, number] = [(-(b[1] - a[1]) / l) * (w.width / 2), ((b[0] - a[0]) / l) * (w.width / 2)]
      return { outer: [[a[0] + n[0], a[1] + n[1]], [b[0] + n[0], b[1] + n[1]], [b[0] - n[0], b[1] - n[1]], [a[0] - n[0], a[1] - n[1]]], holes: [] }
    })
    const pieces = demoFurniture()
    pieces.forEach((piece, i) => {
      const hull: Polygon = { outer: footprint(piece), holes: [] }
      strips.forEach((strip, j) => expect(overlapArea(hull, strip), `piece ${i} meets wall ${level.walls[j].id}`).toBeLessThan(1e-6))
    })
    const parts = pieces.flatMap((piece, i) => piece.map(part => ({ i, part, box: partsExtent([part]) })))
    const overlapping = (a: (typeof parts)[number], b: (typeof parts)[number]) => [0, 1, 2].every(k => a.box.min[k] < b.box.max[k] - 1e-6 && b.box.min[k] < a.box.max[k] - 1e-6)
    for (let x = 0; x < parts.length; x++) {
      for (let y = 0; y < x; y++) {
        const a = parts[x]
        const b = parts[y]
        if (a.i === b.i || !overlapping(a, b)) continue
        expect(overlapArea({ outer: footprint([a.part]), holes: [] }, { outer: footprint([b.part]), holes: [] }), `pieces ${a.i} and ${b.i} meet`).toBeLessThan(1e-6)
      }
    }
  }
})

describe('fixtures in the scene', () => {
  const rect = (): { id: string; points: [[number, number], [number, number]] }[] => [
    { id: 'r0', points: [[0, 0], [2.4, 0]] }, { id: 'r1', points: [[2.4, 0], [2.4, 1.2]] }, { id: 'r2', points: [[2.4, 1.2], [0, 1.2]] }, { id: 'r3', points: [[0, 1.2], [0, 0]] }
  ]
  const built = (kind: 'table' | 'object') => {
    const store = createEditorStore(createLevel({ name: 'L', fixtureLines: rect() }))
    store.commit('Kind', [{ type: 'setFixture', fixtureId: store.level.fixtures[0].id, patch: { kind, roles: { r0: 'seating', r2: 'seating' } } }])
    const object = buildLevel(store.level)
    const meshes: Mesh[] = []
    object.group.traverse(o => { if (o instanceof Mesh) meshes.push(o) })
    return { object, uses: (name: keyof typeof object.materials) => meshes.some(m => m.material === object.materials[name]) }
  }

  it('a table is built by its recipe, top, support and chairs; a bare object is a block of its outline', () => {
    const table = built('table')
    expect(table.object.warnings).toEqual([])
    expect(table.uses('tableTop')).toBe(true)
    expect(table.uses('furniture')).toBe(true)
    const object = built('object')
    expect(object.uses('furniture')).toBe(false)
    expect(object.uses('furnitureDark')).toBe(true)
  })
})

describe('the slab', () => {
  it('reaches every wall’s outer face exactly, whatever its width or curve: slab just inside the face, none just outside', () => {
    const walls: Wall[] = [
      { id: 's', points: [[0, 0], [8, 0]], width: 0.1 },
      { id: 'e', points: [[8, 0], [8, 5]], width: 0.4 },
      { id: 'n', points: [[8, 5], [0, 5]], width: 0.25, curve: [[5, 7], [3, 7]] },
      { id: 'w', points: [[0, 5], [0, 0]], width: 0.16 }
    ]
    const level = createEditorStore(createLevel({ name: 'L', walls })).level
    const object = buildLevel(level)
    object.group.updateMatrixWorld(true)
    const slab = object.group.children.filter(m => m instanceof Mesh && m.material === object.materials.slab)
    const covered = (x: number, y: number) => new Raycaster(new Vector3(x, 5, -y), new Vector3(0, -1, 0)).intersectObjects(slab).length > 0
    const probes: [number, number, number, number][] = [
      [4, 0, 0, -1],
      [8, 2.5, 1, 0],
      [0, 2.5, -1, 0]
    ]
    for (const [x, y, nx, ny] of probes) {
      const half = walls.find(w => (nx ? w.points[0][0] === x && w.points[1][0] === x : w.points[0][1] === y && w.points[1][1] === y))!.width / 2
      expect(covered(x + nx * (half - 0.002), y + ny * (half - 0.002)), `${x},${y} inside`).toBe(true)
      expect(covered(x + nx * (half + 0.002), y + ny * (half + 0.002)), `${x},${y} outside`).toBe(false)
    }
    const top = new Vector3(4, 6.5, 0)
    const inward = (d: number) => covered(4, 6.5 + 0.125 - d)
    expect(inward(0.004), 'inside the curved wall').toBe(true)
    expect(covered(top.x, 6.5 + 0.125 + 0.03), 'outside the curved wall').toBe(false)
    object.dispose()
  })
})
