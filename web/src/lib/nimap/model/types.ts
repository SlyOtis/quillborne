import type { Vec2, Polygon } from '../geometry/vector'
import type { FixtureKind, UnitCategory } from './categories'

/** A reference to an entity in another system, e.g. `{ kind: 'room', id }`. */
export interface EntityRef {
  kind: string
  id: string
}

/**
 * One piece between two points, straight unless it carries two Bézier
 * handles, as a Figma vector segment does. Runs, rings and faces are derived,
 * never stored; every geometric consumer reads a line as chords.
 */
export interface Line {
  id: string
  points: [Vec2, Vec2]
  curve?: [Vec2, Vec2]
}

/** Construction layer: a line with its own width, in metres. */
export interface Wall extends Line {
  width: number
  /** Metres from the floor to the wall's top: its own, for a half wall, a partition or a screen; left out, it reaches the ceiling (`Level.height`). */
  height?: number
  /** What the wall is made of: solid, unless it is glass. A glass wall bounds rooms, carries doors and joins other walls as any wall does; only its drawing differs. */
  material?: 'glass'
}

/** Which line graph a node or line belongs to. The two never join. */
export type LineLayer = 'walls' | 'fixtures'

export type OpeningKind = 'door' | 'window'

/**
 * A door or window hosted by a wall. The host is never stored: it is the
 * wall whose centreline passes through `at`, found when needed, so a wall
 * split or healed under an opening cannot orphan it. Along the wall the
 * opening spans `width` centred on `at`; above the floor it spans the band
 * `from` to `to`, so two openings may share a stretch of wall when their
 * bands do not overlap. The swing is stored against the wall's canonical
 * direction (x increasing, else y increasing), which a reversal of the
 * wall's points does not change.
 */
export interface Opening {
  id: string
  kind: OpeningKind
  at: Vec2
  width: number
  from: number
  to: number
  swing?: OpeningSwing
}

export interface OpeningSwing {
  /** Which side of the wall the leaf opens to: the left of the canonical direction, or the right. */
  side: 1 | -1
  /** Which end of the opening carries the hinge, along the canonical direction. */
  hinge: 0 | 1
}

/**
 * A space derived from the wall graph. Geometry is recomputed from walls;
 * identity (id, name, category, ref, hidden) is declared and preserved by
 * reconcile.
 */
export interface Unit {
  id: string
  name: string
  category: UnitCategory
  /** Provenance: the wall ids bounding this unit, so identity survives re-edits. */
  signature: string
  polygon: Polygon
  anchor: Vec2
  hidden: boolean
  ref?: EntityRef
  /** Not part of the level: a hole in the building's outline, such as a courtyard, as outside as anything past the facade. A hole is no unit, so this is not a category. */
  outside?: true
}

/** A versioned parametric description interpreted by a procedural builder. */
export interface Recipe {
  kind: string
  version: number
  parameters: Record<string, unknown>
}

/** What an edge of a traced face does for its recipe: a table seats along it, a sofa's or a bed's back or head stands on it, casework faces out of it or stands against a wall with it. */
export type EdgeRole = 'seating' | 'back' | 'front' | 'head'

/**
 * A traced object, derived from the fixture lines the way units derive from
 * walls: a closed face is an outline, a chain of lines with a free end is an
 * open path. Geometry is recomputed; identity (id, kind, name, height,
 * recipe, roles) is declared and preserved by reconcile. A bare object is a block
 * of its outline, `height` metres tall.
 */
export interface Fixture {
  id: string
  kind: FixtureKind
  /** Provenance: the line ids bounding this fixture, so identity survives re-edits. */
  signature: string
  polygon?: Polygon
  line?: Vec2[]
  /** Where a label sits: inside an outline, at the middle of a path. */
  anchor: Vec2
  height?: number
  recipe?: Recipe
  name?: string
  /** What each of its edges does, by line id: keyed inside the face's own record, so a line two faces share has a role in each. */
  roles?: Record<string, EdgeRole>
  /** What it stands for outside the map, for live status: set from a binding, as a room's is. */
  ref?: EntityRef
  /** Stock items standing on its top, placed by hand. */
  items?: SurfaceItem[]
}

/**
 * A stock item standing on a fixture's top, named by the stock item's own
 * name (a monitor, a coffee machine), where it stands and which way it
 * faces in the fixture's own frame (`surfaceFrame`), so it moves with the
 * fixture. A name the reader does not know is skipped, never an error.
 */
export interface SurfaceItem {
  id: string
  item: string
  at: Vec2
  facing: Vec2
}

/**
 * Authoring metadata: the floorplan image a level was traced over. Its top-left
 * corner sits at the document origin and it extends along +x and -y.
 */
export interface Reference {
  url: string
  widthPx: number
  heightPx: number
  metresPerPixel: number
  /** Where the image's top-left corner lies, in document metres; the origin when left out. */
  origin?: Vec2
  opacity: number
  calibrated: boolean
}

/**
 * One thing with identity over several places: a name, a link to live
 * data, and one label and one status for all of them, as a suite of rooms
 * booked as one or a bathroom of stalls. Its places are units today, by
 * id; furniture and areas traced on the floor may join later. A unit
 * belongs to at most one space.
 */
export interface Space {
  id: string
  name: string
  category: UnitCategory
  units: string[]
  ref?: EntityRef
}

export interface Level {
  id: string
  name: string
  ordinal: number
  /** Metres above the document origin. */
  elevation: number
  /** Metres from floor to ceiling, which every wall reaches unless it has its own height; `STOREY_HEIGHT` when left out. */
  height?: number
  walls: Wall[]
  units: Unit[]
  spaces?: Space[]
  /** The fixture line graph; fixtures are its faces and open runs. */
  fixtureLines: Line[]
  fixtures: Fixture[]
  openings: Opening[]
  reference?: Reference
}

export interface Georeference {
  longitude: number
  latitude: number
  /** Degrees clockwise from true north to the document's +y axis. */
  bearing: number
}

/** A place in the building: a level by id, a point on its plan, and how many metres above its floor. */
export interface Place {
  level: string
  at: Vec2
  height?: number
}

export interface MapDocument {
  format: 'nimap'
  /** The format this document was written in (`FORMAT_VERSION` of the nimap that wrote it). */
  version: number
  /** The oldest reader that shows this document as meant; older readers refuse it. The writer's own version when left out. */
  minReader?: number
  /** The next id this document gives out (`storeMap`), in base 36; it only grows, so no id is ever given twice. */
  nextId?: number
  id: string
  name: string
  origin?: Georeference
  levels: Level[]
}
