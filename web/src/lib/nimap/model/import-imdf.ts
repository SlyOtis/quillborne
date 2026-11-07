import type { Vec2 } from '../geometry/vector'
import { distance, midpoint } from '../geometry/vector'
import { createDocument, createLevel, quantize, uid } from './document'
import { MIN_FEATURE } from './precision'
import type { Level, MapDocument, Opening, Wall } from './types'

/** One GeoJSON feature of an IMDF archive, as far as the importer reads it. */
export interface ImdfFeature {
  id: string
  geometry: { type: string; coordinates: unknown } | null
  properties: Record<string, unknown>
}

export interface ImdfCollection {
  features: ImdfFeature[]
}

/** The files of an IMDF archive the importer reads, each parsed from its `.geojson`. */
export interface ImdfArchive {
  venue?: ImdfCollection
  level: ImdfCollection
  unit: ImdfCollection
  opening?: ImdfCollection
}

export interface ImdfImportOptions {
  /** Width of a wall between two units, in metres. */
  interiorWidth?: number
  /** Width of a wall with a unit on one side only. */
  exteriorWidth?: number
  /** Elevation step per ordinal, since IMDF levels carry no height. */
  storeyHeight?: number
  /** Unit categories that are open floor: an edge with open floor on both sides is no wall. */
  openCategories?: string[]
  /** Width and height of the railing round a void (`opentobelow`) where open floor meets it. */
  railingWidth?: number
  railingHeight?: number
  /** Head height given to every opening. */
  doorHeight?: number
}

/**
 * IMDF has no walls: units tile a level and meet edge to edge, and an edge
 * says only where one kind of space ends, not whether a wall stands there.
 * Every unit edge is split wherever another unit's corner lies on it, the
 * pieces are kept once, and each is judged by the categories beside it, a
 * best guess from the category names: a wall wherever an enclosed space
 * (a room, an office, a restroom, a shaft) is on either side, centred on the
 * edge; a railing where open floor meets a void; a wall on the building's
 * edge where open floor ends indoors, and wherever an indoor unit meets an
 * outdoor one; nothing between two open spaces or on the edge of an outdoor
 * level. Openings become doors on those walls. Levels
 * sharing an ordinal (IMDF splits a floor's indoor and outdoor parts) become
 * one level. Coordinates
 * are projected to local metres around the venue's display point, which
 * becomes the document's origin. Names and categories are not carried; the
 * levels come out raw, to be settled by the store like any opened level.
 */
export function documentFromImdf(archive: ImdfArchive, options: ImdfImportOptions = {}): MapDocument {
  const interiorWidth = options.interiorWidth ?? 0.12
  const exteriorWidth = options.exteriorWidth ?? 0.25
  const storeyHeight = options.storeyHeight ?? 4
  const open = new Set(options.openCategories ?? OPEN_CATEGORIES)
  const railing = { width: options.railingWidth ?? 0.05, height: options.railingHeight ?? 1.1 }
  const doorHeight = options.doorHeight ?? 2.1

  const units = archive.unit.features.filter(u => u.geometry && (u.geometry.type === 'Polygon' || u.geometry.type === 'MultiPolygon'))
  const origin = venueOrigin(archive.venue) ?? meanPoint(units)
  const project = localProjection(origin)

  const outdoorLevels = new Set(archive.level.features.filter(l => l.properties.outdoor === true).map(l => l.id))
  const ordinals = new Map<number, ImdfFeature[]>()
  for (const level of archive.level.features) {
    const ordinal = Number(level.properties.ordinal ?? 0)
    ordinals.set(ordinal, [...(ordinals.get(ordinal) ?? []), level])
  }

  const levels: Level[] = [...ordinals.entries()].sort(([a], [b]) => a - b).map(([ordinal, parts]) => {
    const ids = new Set(parts.map(p => p.id))
    const edges = units.filter(u => ids.has(String(u.properties.level_id))).flatMap(u => unitEdges(u, project, sideOf(String(u.properties.category), open), outdoorLevels.has(String(u.properties.level_id))))
    const walls = wallsFromEdges(edges, { interiorWidth, exteriorWidth, railing })
    const openings = (archive.opening?.features ?? [])
      .filter(o => ids.has(String(o.properties.level_id)) && o.geometry?.type === 'LineString')
      .flatMap(o => openingFrom(o, project, doorHeight))
    const indoor = parts.find(p => p.properties.outdoor !== true) ?? parts[0]
    return createLevel({ name: labelOf(indoor.properties.name) ?? String(ordinal), ordinal, elevation: ordinal * storeyHeight, walls, openings })
  })

  const document = createDocument({ name: labelOf(archive.venue?.features[0]?.properties.name) ?? 'Imported map', levels })
  return { ...document, origin: { longitude: origin[0], latitude: origin[1], bearing: 0 } }
}

/** IMDF unit categories read as open floor: circulation and open areas, where one space runs into the next without a wall. Every other category is read as enclosed. */
export const OPEN_CATEGORIES = ['walkway', 'walkway.island', 'unenclosedarea', 'parking', 'road', 'platform', 'footbridge', 'lobby', 'stairs', 'steps', 'escalator', 'movingwalkway', 'ramp', 'fieldofplay', 'vegetation', 'terrace', 'waitingroom']

const VOID = 'opentobelow'

type Side = 'enclosed' | 'open' | 'void'

const sideOf = (category: string, open: Set<string>): Side => (category === VOID ? 'void' : open.has(category) ? 'open' : 'enclosed')

interface Edge {
  a: Vec2
  b: Vec2
  unit: string
  side: Side
  outdoor: boolean
}

const WGS84_A = 6378137
const WGS84_E2 = 0.00669437999014

/** Longitude and latitude to metres east and north of `origin`, on the ellipsoid's local radii: exact to millimetres across a building. */
function localProjection([lon0, lat0]: Vec2): (p: Vec2) => Vec2 {
  const phi = (lat0 * Math.PI) / 180
  const w = 1 - WGS84_E2 * Math.sin(phi) ** 2
  const meridional = (WGS84_A * (1 - WGS84_E2)) / w ** 1.5
  const normal = WGS84_A / Math.sqrt(w)
  const east = (normal * Math.cos(phi) * Math.PI) / 180
  const north = (meridional * Math.PI) / 180
  return ([lon, lat]) => [(lon - lon0) * east, (lat - lat0) * north]
}

function venueOrigin(venue: ImdfCollection | undefined): Vec2 | null {
  const point = venue?.features[0]?.properties.display_point as { coordinates?: unknown } | undefined
  const c = point?.coordinates
  return Array.isArray(c) && c.length >= 2 && c.every(Number.isFinite) ? [c[0] as number, c[1] as number] : null
}

function meanPoint(units: ImdfFeature[]): Vec2 {
  const points = units.flatMap(u => polygonsOf(u).flat(2))
  const sum = points.reduce<Vec2>((s, p) => [s[0] + p[0], s[1] + p[1]], [0, 0])
  return points.length ? [sum[0] / points.length, sum[1] / points.length] : [0, 0]
}

function polygonsOf(feature: ImdfFeature): Vec2[][][] {
  const g = feature.geometry!
  return (g.type === 'Polygon' ? [g.coordinates] : g.coordinates) as Vec2[][][]
}

function unitEdges(unit: ImdfFeature, project: (p: Vec2) => Vec2, side: Side, outdoor: boolean): Edge[] {
  const edges: Edge[] = []
  for (const polygon of polygonsOf(unit)) {
    for (const ring of polygon) {
      for (let i = 0; i + 1 < ring.length; i++) {
        const a = project(ring[i]), b = project(ring[i + 1])
        if (distance(a, b) >= MIN_FEATURE) edges.push({ a, b, unit: unit.id, side, outdoor })
      }
    }
  }
  return edges
}

/** A value from IMDF's LABELS: English if there is one, else the first language. */
function labelOf(labels: unknown): string | null {
  if (!labels || typeof labels !== 'object') return null
  const values = labels as Record<string, unknown>
  const text = values.en ?? Object.values(values)[0]
  return typeof text === 'string' && text ? text : null
}

/** The corners of every edge lying on another edge split it there, so edges that overlap in part become shared pieces; each piece is kept once, with what lies on either side. */
function wallsFromEdges(edges: Edge[], widths: { interiorWidth: number; exteriorWidth: number; railing: { width: number; height: number } }): Wall[] {
  const corners = mergedCorners(edges)
  const pieces = new Map<string, { a: Vec2; b: Vec2; units: Set<string>; sides: Set<Side>; indoor: boolean; outdoor: boolean }>()
  for (const edge of edges) {
    const a = corners.at(edge.a), b = corners.at(edge.b)
    const cuts = corners.onSegment(a, b)
    const stops = [a, ...cuts, b]
    for (let i = 0; i + 1 < stops.length; i++) {
      const p = stops[i], q = stops[i + 1]
      if (distance(p, q) < MIN_FEATURE) continue
      const key = pieceKey(p, q)
      const piece = pieces.get(key) ?? { a: p, b: q, units: new Set<string>(), sides: new Set<Side>(), indoor: false, outdoor: false }
      piece.units.add(edge.unit)
      piece.sides.add(edge.side)
      piece.indoor = piece.indoor || !edge.outdoor
      piece.outdoor = piece.outdoor || edge.outdoor
      pieces.set(key, piece)
    }
  }
  const walls: Wall[] = []
  for (const piece of pieces.values()) {
    const points: [Vec2, Vec2] = [quantize(piece.a), quantize(piece.b)]
    const edgeOfLevel = piece.units.size === 1
    const envelope = piece.indoor && piece.outdoor
    if (envelope) walls.push({ id: uid(), points, width: widths.exteriorWidth })
    else if (piece.sides.has('enclosed')) walls.push({ id: uid(), points, width: edgeOfLevel ? widths.exteriorWidth : widths.interiorWidth })
    else if (piece.sides.has('void')) walls.push({ id: uid(), points, width: widths.railing.width, height: widths.railing.height })
    else if (edgeOfLevel && !piece.outdoor) walls.push({ id: uid(), points, width: widths.exteriorWidth })
  }
  return walls
}

const pieceKey = (p: Vec2, q: Vec2): string => [cornerKey(p), cornerKey(q)].sort().join('|')
const cornerKey = (p: Vec2): string => `${Math.round(p[0] / MIN_FEATURE)},${Math.round(p[1] / MIN_FEATURE)}`

/** Corners within a centimetre of each other become one, and each can be found on the edges it lies on, through a grid of cells a metre wide. */
function mergedCorners(edges: Edge[]) {
  const cell = 1
  const cells = new Map<string, Vec2[]>()
  const cellOf = (p: Vec2) => `${Math.floor(p[0] / cell)},${Math.floor(p[1] / cell)}`
  const near = (p: Vec2): Vec2 | null => {
    const cx = Math.floor(p[0] / cell), cy = Math.floor(p[1] / cell)
    for (let x = cx - 1; x <= cx + 1; x++) for (let y = cy - 1; y <= cy + 1; y++) for (const q of cells.get(`${x},${y}`) ?? []) if (distance(p, q) < MIN_FEATURE) return q
    return null
  }
  const at = (p: Vec2): Vec2 => {
    const found = near(p)
    if (found) return found
    const key = cellOf(p)
    cells.set(key, [...(cells.get(key) ?? []), p])
    return p
  }
  for (const e of edges) {
    at(e.a)
    at(e.b)
  }
  /** Corners strictly inside the segment, within a centimetre of it, in order from `a`. */
  const onSegment = (a: Vec2, b: Vec2): Vec2[] => {
    const length = distance(a, b)
    const dx = (b[0] - a[0]) / length, dy = (b[1] - a[1]) / length
    const found: { t: number; p: Vec2 }[] = []
    const x0 = Math.floor((Math.min(a[0], b[0]) - MIN_FEATURE) / cell), x1 = Math.floor((Math.max(a[0], b[0]) + MIN_FEATURE) / cell)
    const y0 = Math.floor((Math.min(a[1], b[1]) - MIN_FEATURE) / cell), y1 = Math.floor((Math.max(a[1], b[1]) + MIN_FEATURE) / cell)
    for (let x = x0; x <= x1; x++) {
      for (let y = y0; y <= y1; y++) {
        for (const p of cells.get(`${x},${y}`) ?? []) {
          const t = (p[0] - a[0]) * dx + (p[1] - a[1]) * dy
          if (t < MIN_FEATURE || t > length - MIN_FEATURE) continue
          if (Math.abs((p[0] - a[0]) * dy - (p[1] - a[1]) * dx) < MIN_FEATURE) found.push({ t, p })
        }
      }
    }
    return found.sort((u, v) => u.t - v.t).map(f => f.p)
  }
  return { at, onSegment }
}

/** An IMDF opening is a segment on a unit edge: a door there, as wide as the segment. */
function openingFrom(feature: ImdfFeature, project: (p: Vec2) => Vec2, doorHeight: number): Opening[] {
  const points = (feature.geometry!.coordinates as Vec2[]).map(project)
  if (points.length < 2) return []
  const a = points[0], b = points[points.length - 1]
  const width = distance(a, b)
  if (width < MIN_FEATURE) return []
  return [{ id: uid(), kind: 'door', at: quantize(midpoint(a, b)), width, from: 0, to: doorHeight }]
}
