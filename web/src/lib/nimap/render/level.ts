import { Box3, Group, Mesh, type Material } from 'three'
import type { Polygon, Ring, Vec2 } from '../geometry/vector'
import { distanceToSegment, pointInPolygon, signedArea } from '../geometry/vector'
import { overlapArea } from '../geometry/overlap'
import { buildSolids } from '../geometry/walls'
import { difference, union } from '../geometry/clip'
import { labelPoint } from '../geometry/label-point'
import type { Fixture, Level, Space, Unit } from '../model/types'
import { exteriorWalls, groundOf, levelGround } from '../model/floors'
import { wallBands, type WallBand } from '../model/bands'
import { DEFAULT_FIXTURE_HEIGHT, wallHeight as modelWallHeight } from '../model/categories'
import type { Part } from '../furniture/parts'
import { transformParts, translation } from '../furniture/parts'
import { footprint } from '../furniture/mesh'
import { fixtureParts } from '../furniture/recipes'
import { surfaceItemParts } from '../furniture/surface'
import { prism, solidsGeometry, toScene } from './geometry'
import { disposeObject, partsObject } from './furniture'
import { createDimmer, createMaterials, disposeMaterials, type Dimmer, type MapLook, type MaterialName, type Materials } from './materials'

/** A surface pieces stand on: whatever of a piece's footprint lies on the polygon is set down at `top`. */
export interface Support {
  polygon: Polygon
  top: number
}


/** What carries a name, a link to live data and so a status: a room, or a space over several. */
export type Named = Pick<Unit, 'name' | 'ref'> | Space

export interface LevelOptions {
  /** Metres; where walls are cut, as a plan seen from above: each is drawn at its own height (`wallHeight` in the model) or this, whichever is lower, so a half wall stays half. Walls taller than a person hide the plan, so the default is the lobby look's cutaway. */
  wallHeight?: number
  /** Metres; where the walls on the level's outline (`exteriorWalls`) are cut, the cut of the others when left out. */
  exteriorWallHeight?: number
  slabThickness?: number
  /** What the map is drawn with (`MapLook`), the host's; Slate's for anything left out. The ground and the light are the host's to apply. */
  look?: Partial<MapLook>
  /** Whether traced fixtures and their furniture are built; true when left out. */
  fixtures?: boolean
  /** Whether doors and windows are cut out of the walls; left out or true they are, false draws every wall whole. */
  openings?: boolean
  /** Surfaces pieces stand on, such as a data layer's slabs; every piece stands on the highest under it. */
  supports?: Support[]
  /** Furniture on the level, one array of parts per piece, each set down on the floor under it (`standOnFloors`). */
  furniture?: Part[][]
}

export interface LevelObject {
  group: Group
  materials: Materials
  dimmer: Dimmer
  bounds: Box3
  /** The corners of the level's outline at the slab's underside and at the wall tops, in scene space, for a host to project into the silhouette its labels go round. */
  outline: [number, number, number][]
  warnings: string[]
  dispose(): void
}

const DEFAULTS = { wallHeight: 1.15, slabThickness: 0.16 }
/** A glass wall stands in a dark rail this tall at its foot and at its top, with the pane between. */
const GLASS_RAIL = 0.05
/** A see-through solid stands this far in from the walls and below their tops, so none of its faces lies on a wall's. */
export const SEE_THROUGH_INSET = 0.01
/** How far along a glass wall the dark post at a jamb or a free end reaches. */
const GLASS_POST = 0.05
/** How thick a room's coloured floor is drawn, a slab rather than a film, so it reads beside doorways. */
export const ROOM_HEIGHT = 0.03

const fixtureMaterial = (f: Fixture): MaterialName => (f.kind === 'table' ? 'tableTop' : f.kind === 'sofa' ? 'sofa' : 'furnitureDark')

/**
 * The slab a level stands on: its floor (the outline on the walls'
 * centrelines, less what is outside or open to below) joined with the
 * walls' own solids, so it reaches every wall's outer face exactly,
 * whatever its width or curve, and an edge of no width keeps the outline.
 */
function slabOf(level: Level, floor: Ring[]): Polygon[] {
  if (!floor.length) return []
  try {
    const cells = buildSolids(level.walls).cells.flatMap(c => [counterClockwise(c.points), ...c.holes.map(clockwise)])
    return union([...floor, ...cells])
  } catch {
    return union(floor)
  }
}

const counterClockwise = (ring: Ring): Ring => (signedArea(ring) < 0 ? [...ring].reverse() : ring)
const clockwise = (ring: Ring): Ring => (signedArea(ring) > 0 ? [...ring].reverse() : ring)

/**
 * The coloured floor of every drawn room: every named room, and every
 * room a space covers, with what its colour is read from, the room or its
 * space. The floor is the room's outline less the walls round it, so the
 * colour reaches each wall's own face, whatever its width, and stops there
 * in a doorway too.
 */
export function roomFloors(level: Level): { unit: Unit; owner: Named; polygons: Polygon[] }[] {
  const spaceOf = new Map((level.spaces ?? []).flatMap(space => space.units.map(id => [id, space] as const)))
  const shown = level.units.filter(u => !u.hidden && groundOf(u) === 'inside' && (u.name || u.ref || spaceOf.has(u.id)))
  if (!shown.length) return []
  return shown.map(unit => ({ unit, owner: spaceOf.get(unit.id) ?? unit, polygons: roomSurface(level, unit) }))
}

const cellsOf = new WeakMap<Level, Ring[]>()
/** The walls' solid cells as rings, kept per level, so a level's rooms are cut by them without solving the walls again. */
function wallCells(level: Level): Ring[] {
  let cells = cellsOf.get(level)
  if (!cells) cellsOf.set(level, (cells = buildSolids(level.walls).cells.flatMap(c => [counterClockwise(c.points), ...c.holes.map(clockwise)])))
  return cells
}

/** What of a room's floor shows: its outline less the rooms inside it and less the walls round it, so it reaches each wall's own face whatever its width. */
export function roomSurface(level: Level, unit: Unit): Polygon[] {
  return difference([counterClockwise(unit.polygon.outer)], [...unit.polygon.holes.map(counterClockwise), ...wallCells(level)])
}

/**
 * The dark posts that frame glass: one at each jamb of an opening in a
 * glass wall, as tall as the opening within the glass, and one full height
 * at each end of a glass wall that meets no other wall. A post reaches a
 * little out past the cut and past the faces, so the glass's cut faces
 * never share a plane with it.
 */
export function glassPosts(level: Level, wallHeight: number): { polygon: Polygon; from: number; to: number }[] {
  const glass = level.walls.filter(w => w.material === 'glass' && !w.curve)
  const post = (at: Vec2, into: Vec2, width: number, from: number, to: number) => {
    const across: Vec2 = [-into[1] * (width / 2 + 0.002), into[0] * (width / 2 + 0.002)]
    const back: Vec2 = [at[0] - into[0] * 0.001, at[1] - into[1] * 0.001]
    const far: Vec2 = [at[0] + into[0] * GLASS_POST, at[1] + into[1] * GLASS_POST]
    const outer: Vec2[] = [[back[0] + across[0], back[1] + across[1]], [back[0] - across[0], back[1] - across[1]], [far[0] - across[0], far[1] - across[1]], [far[0] + across[0], far[1] + across[1]]]
    return { polygon: { outer: counterClockwise(outer), holes: [] }, from, to }
  }
  return glass.flatMap(w => {
    const [a, b] = w.points
    const length = Math.hypot(b[0] - a[0], b[1] - a[1])
    if (!length) return []
    const t: Vec2 = [(b[0] - a[0]) / length, (b[1] - a[1]) / length]
    const top = w.height ?? wallHeight
    const free = (p: Vec2) => !level.walls.some(o => o.id !== w.id && distanceToSegment(p, o.points[0], o.points[1]) < 1e-4)
    const ends = [...(free(a) ? [post(a, t, w.width, 0, top)] : []), ...(free(b) ? [post(b, [-t[0], -t[1]], w.width, 0, top)] : [])]
    const jambs = level.openings
      .filter(o => distanceToSegment(o.at, a, b) < 1e-4 && Math.max(0, o.from) < Math.min(top, o.to))
      .flatMap(o => {
        const from = Math.max(0, o.from)
        const to = Math.min(top, o.to)
        const j0: Vec2 = [o.at[0] - (t[0] * o.width) / 2, o.at[1] - (t[1] * o.width) / 2]
        const j1: Vec2 = [o.at[0] + (t[0] * o.width) / 2, o.at[1] + (t[1] * o.width) / 2]
        return [post(j0, [-t[0], -t[1]], w.width, from, to), post(j1, t, w.width, from, to)]
      })
    return [...ends, ...jambs]
  })
}

/** Where the label of these rooms belongs on the plan: a room's own anchor, or for several the label point of the largest part of their union. */
export function labelSpot(units: Unit[]): Vec2 | null {
  const shown = units.filter(u => !u.hidden)
  if (shown.length === 1) return shown[0].anchor
  const joined = union(shown.flatMap(u => [counterClockwise(u.polygon.outer), ...u.polygon.holes.map(clockwise)]))
  const largest = joined.sort((a, b) => Math.abs(signedArea(b.outer)) - Math.abs(signedArea(a.outer)))[0]
  return largest ? labelPoint(largest) : null
}

/** How high whatever stands on this footprint is set: on the top of the highest support any of it lies on, else on the slab. */
export function supportTop(covers: Polygon, supports: Support[]): number {
  return Math.max(0, ...supports.filter(s => overlapArea(covers, s.polygon) > 0 || covers.outer.some(v => pointInPolygon(v, s.polygon))).map(s => s.top))
}

/**
 * Furniture set down on the level: a piece any of whose footprint lies on a
 * support is lifted onto its top (`supportTop`), so a room's coloured slab
 * lies under what stands in the room and never covers a foot, even for a
 * piece only partly on it. Elsewhere a piece stays on the slab.
 */
export function standOnFloors(furniture: Part[][], supports: Support[]): Part[][] {
  return furniture.map(piece => {
    if (!piece.length) return piece
    const top = supportTop({ outer: footprint(piece), holes: [] }, supports)
    return top > 0 ? transformParts(piece, translation(0, 0, top)) : piece
  })
}


/**
 * A level as one group at its elevation: the slab under the level's floor (its outline less what is open to below; nothing outside it) inset from the outer rings of
 * the walls, the walls as one solid per height band with the openings that
 * cross that band cut out, glass walls as a see-through pane between dark
 * rails with a post at each jamb and free end, every room as a thin fill reaching its walls, a space's rooms in
 * its colour under one label,
 * every fixture built by its kind's recipe (a bare object as a block of
 * its outline), and the furniture set down on the floors. Materials are the level's own, so dimming one level
 * leaves the others alone.
 */
export function buildLevel(level: Level, options: LevelOptions = {}): LevelObject {
  const wallHeight = options.wallHeight ?? DEFAULTS.wallHeight
  const exteriorHeight = options.exteriorWallHeight ?? wallHeight
  const exterior = exteriorHeight === wallHeight ? new Set<string>() : exteriorWalls(level)
  const heightOf = (wall: Level['walls'][number]) => Math.min(modelWallHeight(wall, level), exterior.has(wall.id) ? exteriorHeight : wallHeight)
  const supports = options.supports ?? []
  const tallest = Math.max(wallHeight, ...level.walls.map(heightOf), ...supports.map(s => s.top))
  const slabThickness = options.slabThickness ?? DEFAULTS.slabThickness
  const materials = createMaterials(options.look)
  const group = new Group()
  group.name = level.name
  group.position.y = level.elevation
  const warnings: string[] = []

  const add = (polygons: Polygon[], lo: number, hi: number, material: MaterialName | Material, shadows = true) => {
    for (const polygon of polygons) {
      const mesh = new Mesh(prism(polygon, lo, hi), typeof material === 'string' ? materials[material] : material)
      mesh.castShadow = shadows
      mesh.receiveShadow = true
      group.add(mesh)
    }
  }

  const floor = levelGround(level).floor.flatMap(p => [counterClockwise(p.outer), ...p.holes.map(clockwise)])
  add(slabOf(level, floor), -slabThickness, 0, 'slab', false)

  const solidWalls = (walls: Level['walls'], band: WallBand, lo: number, hi: number, material: MaterialName, shadows: boolean) => {
    if (!walls.length || !(hi > lo)) return
    try {
      const solids = buildSolids(walls, band.cuts)
      warnings.push(...solids.warnings)
      const mesh = new Mesh(solidsGeometry(solids, lo, hi), materials[material])
      mesh.castShadow = shadows
      mesh.receiveShadow = true
      group.add(mesh)
    } catch (error) {
      warnings.push(`Walls ${lo}–${hi} m unavailable: ${(error as Error).message}`)
    }
  }

  const resolved = level.walls.map(w => ({ ...w, height: heightOf(w) }))
  for (const band of wallBands(resolved, options.openings === false ? [] : level.openings, tallest)) {
    const standing = resolved.filter(w => w.height > band.from)
    solidWalls(standing.filter(w => w.material !== 'glass'), band, band.from, band.to, 'wall', true)
    const glass = standing.filter(w => w.material === 'glass')
    if (!glass.length) continue
    const top = Math.min(band.to, Math.max(...glass.map(w => w.height)))
    for (const [lo, hi, material] of [[0, GLASS_RAIL, 'glassFrame'], [GLASS_RAIL, top - GLASS_RAIL, 'glass'], [top - GLASS_RAIL, top, 'glassFrame']] as const) {
      solidWalls(glass, band, Math.max(lo, band.from), Math.min(hi, band.to), material, material !== 'glass')
    }
  }

  for (const { polygon, from, to } of glassPosts({ ...level, walls: resolved, openings: options.openings === false ? [] : level.openings }, wallHeight)) if (to > from) add([polygon], from, to, 'glassFrame')

  const recipes: Part[][] = []
  for (const fixture of options.fixtures === false ? [] : level.fixtures) {
    if (fixture.kind === 'hole') continue
    try {
      const parts = fixtureParts(fixture, level.fixtureLines, level.fixtures)
      if (parts) {
        recipes.push(parts)
        continue
      }
    } catch (error) {
      warnings.push(`${fixture.name || fixture.kind} drawn as a block: ${(error as Error).message}`)
    }
    if (!fixture.polygon) continue
    add([fixture.polygon], 0, fixture.height ?? DEFAULT_FIXTURE_HEIGHT, fixtureMaterial(fixture))
    const items = surfaceItemParts(fixture, level.fixtureLines)
    if (items.length) recipes.push(items)
  }

  const furniture = [...recipes, ...(options.furniture ?? [])]
  if (furniture.length) group.add(partsObject(standOnFloors(furniture, supports).flat(), materials))

  const dimmer = createDimmer(materials)
  const bounds = new Box3().setFromObject(group)

  return {
    group,
    materials,
    dimmer,
    bounds,
    outline: levelGround(level).outline.flatMap(p => p.outer).flatMap(p => [toScene(p, level.elevation - slabThickness), toScene(p, level.elevation + tallest)]),
    warnings,
    dispose() {
      disposeObject(group)
      disposeMaterials(materials)
    }
  }
}
