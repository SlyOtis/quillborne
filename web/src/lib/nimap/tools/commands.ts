import type { Box, Vec2 } from '../geometry/vector'
import { EPS, bounds, distance } from '../geometry/vector'
import { CHORD_TOLERANCE } from '../model/lines'
import type { Fixture, Level, Line, LineLayer, Opening, Reference, Space, Unit, Wall } from '../model/types'
import { carryOpenings } from '../model/openings'
import { quantize, WALL_SEGMENT_MIN } from '../model/document'
import { moveLineEnd, projectOntoLine, splitLine } from '../model/lines'
import { NODE_EPS, nodeKey } from './graph'

export interface NodeMove {
  from: Vec2
  to: Vec2
}

/** Line commands name their layer; walls when omitted. */
export type Command =
  | { type: 'addWall'; wall: Wall }
  | { type: 'addFixtureLine'; line: Line }
  | { type: 'setWallWidth'; wallIds: string[]; width: number }
  /** A height of their own for these walls, or none, so they reach the ceiling. */
  | { type: 'setWallHeight'; wallIds: string[]; height: number | undefined }
  /** The level's floor-to-ceiling height, which every wall without its own reaches. */
  | { type: 'setStoreyHeight'; height: number }
  | { type: 'removeLines'; layer?: LineLayer; ids: string[] }
  | { type: 'moveNodes'; layer?: LineLayer; moves: NodeMove[] }
  | { type: 'removeNodes'; layer?: LineLayer; points: Vec2[] }
  | { type: 'healNode'; layer?: LineLayer; point: Vec2 }
  /** Puts a node at a point on the lines through it (`addNode`). */
  | { type: 'addNode'; layer?: LineLayer; point: Vec2 }
  | { type: 'setCurves'; layer?: LineLayer; curves: { lineId: string; curve: [Vec2, Vec2] | null }[] }
  /** Maps the listed points by an affine matrix [a, b, c, d, e, f]; a curve whose two ends both move has its handles mapped, one whose single end moves keeps its shape. */
  | { type: 'transformNodes'; layer?: LineLayer; points: Vec2[]; matrix: [number, number, number, number, number, number] }
  /** Adds fixture records beside the lines that will bound them, so the commit's reconcile hands them their faces: how a paste keeps kind, recipe and roles. */
  | { type: 'addFixtures'; fixtures: Fixture[] }
  | { type: 'setFixture'; fixtureId: string; patch: Partial<Pick<Fixture, 'name' | 'kind' | 'height' | 'roles' | 'recipe' | 'items'>> }
  | { type: 'addOpening'; opening: Opening }
  | { type: 'setOpening'; openingId: string; patch: Partial<Pick<Opening, 'kind' | 'at' | 'width' | 'from' | 'to' | 'swing'>> }
  | { type: 'removeOpenings'; ids: string[] }
  | { type: 'setUnit'; unitId: string; patch: Partial<Pick<Unit, 'name' | 'category' | 'hidden' | 'ref' | 'outside'>> }
  | { type: 'setSpaces'; spaces: Space[] }
  | { type: 'setReference'; reference: Reference | null }

const same = (a: Vec2, b: Vec2): boolean => distance(a, b) < NODE_EPS

const keepValid = <T extends Line>(lines: T[]): T[] => lines.filter(w => distance(w.points[0], w.points[1]) >= WALL_SEGMENT_MIN)

const linesOf = (level: Level, layer: LineLayer = 'walls'): Line[] => (layer === 'walls' ? level.walls : level.fixtureLines)
/** New walls take their openings along; an opening whose wall is gone waits for the commit to drop it. */
const withWalls = (level: Level, walls: Wall[]): Level => ({ ...level, walls, openings: carryOpenings(level.openings, level.walls, walls) })
const withLines = (level: Level, layer: LineLayer | undefined, lines: Line[]): Level => (layer === 'fixtures' ? { ...level, fixtureLines: lines } : withWalls(level, lines as Wall[]))

/**
 * Points within the minimum wall length of an earlier point become that
 * point. Two nodes closer than a wall can be long are one node; anything
 * finer is a hand or a snap that missed by less than a pixel.
 */
export function mergeNearPoints<T extends Line>(walls: T[]): T[] {
  const cell = WALL_SEGMENT_MIN
  const cellKey = (x: number, y: number) => `${x},${y}`
  const accepted = new Map<string, Vec2[]>()
  const resolve = (p: Vec2): Vec2 => {
    const cx = Math.round(p[0] / cell)
    const cy = Math.round(p[1] / cell)
    let best: Vec2 | null = null
    let bestDistance = WALL_SEGMENT_MIN
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (const q of accepted.get(cellKey(cx + dx, cy + dy)) ?? []) {
          const d = distance(p, q)
          if (d < bestDistance) {
            best = q
            bestDistance = d
          }
        }
      }
    }
    if (best) return best
    const key = cellKey(cx, cy)
    if (!accepted.has(key)) accepted.set(key, [])
    accepted.get(key)!.push(p)
    return p
  }
  let changed = false
  const out = walls.map(w => {
    const a = resolve(w.points[0])
    const b = resolve(w.points[1])
    if (a === w.points[0] && b === w.points[1]) return w
    changed = true
    let moved = w
    if (a !== w.points[0]) moved = moveLineEnd(moved, 0, a)
    if (b !== w.points[1]) moved = moveLineEnd(moved, 1, b)
    return moved
  })
  return changed ? out : walls
}

const within = (box: Box, p: Vec2): boolean => p[0] >= box.minX - EPS && p[0] <= box.maxX + EPS && p[1] >= box.minY - EPS && p[1] <= box.maxY + EPS

/** Ids for new pieces of `lines`, used by none of them nor by one another: a piece of `a` is `a.1`, then `a.2`. */
function pieceIds(lines: Line[]): (id: string) => string {
  const used = new Set(lines.map(w => w.id))
  return id => {
    let n = 1
    while (used.has(`${id}.${n}`)) n++
    used.add(`${id}.${n}`)
    return `${id}.${n}`
  }
}

/**
 * A line cut at every point lying strictly inside it: on it, within the
 * chord tolerance of a curve, and a minimum feature from its ends and from
 * the cut before; a line's own points never cut it. The first piece keeps
 * the line's id. A cut on a curve lands on the curve itself, and `moved`
 * records where, by the point's key, so what met the curve there follows.
 */
function cutLine<T extends Line>(line: T, points: { p: Vec2; owner?: Line }[], pieceId: (id: string) => string, moved: Map<string, Vec2>): T[] {
  const [a, b] = line.points
  const box = line.curve ? bounds([a, b, ...line.curve]) : bounds([a, b])
  const tolerance = line.curve ? CHORD_TOLERANCE * 1.5 : EPS
  const cuts = points
    .filter(q => q.owner !== line && within(box, q.p) && distance(q.p, a) >= WALL_SEGMENT_MIN && distance(q.p, b) >= WALL_SEGMENT_MIN)
    .map(q => ({ p: q.p, ...projectOntoLine(line, q.p) }))
    .filter(cut => cut.t > 0 && cut.t < 1 && distance(cut.p, cut.point) < tolerance)
    .sort((x, y) => x.t - y.t)
  const pieces: T[] = []
  let rest = line
  let consumed = 0
  for (const cut of cuts) {
    const last = pieces.length ? pieces[pieces.length - 1].points[1] : a
    if (distance(cut.point, last) < WALL_SEGMENT_MIN || distance(cut.point, b) < WALL_SEGMENT_MIN) continue
    const local = (cut.t - consumed) / (1 - consumed)
    const [head, tail] = splitLine(rest, local, pieceId(line.id), cut.p)
    if (line.curve) moved.set(nodeKey(cut.p), head.points[1])
    pieces.push(head)
    rest = tail
    consumed = cut.t
  }
  pieces.push(rest)
  return pieces
}

/** Every line end standing where a curve was cut, moved onto the curve's own point there. */
function followCuts<T extends Line>(lines: T[], moved: Map<string, Vec2>): T[] {
  if (!moved.size) return lines
  return lines.map(w => {
    let line = w
    w.points.forEach((p, i) => {
      const to = moved.get(nodeKey(p))
      if (to) line = moveLineEnd(line, i as 0 | 1, to)
    })
    return line
  })
}

/**
 * Splits every wall where a point of another wall lies strictly inside it, so
 * the document holds every junction as a point: a dot on the canvas is a
 * point of every wall through it. The first piece keeps the wall's id, the
 * rest are numbered. Crossings without a point are left alone.
 */
export function splitAtContacts<T extends Line>(walls: T[]): T[] {
  const pieceId = pieceIds(walls)
  const points = walls.flatMap(wall => wall.points.map(p => ({ p, owner: wall })))
  const moved = new Map<string, Vec2>()
  let changed = false
  const out = walls.flatMap(wall => {
    const pieces = cutLine(wall, points, pieceId, moved)
    changed ||= pieces.length > 1
    return pieces
  })
  return changed ? followCuts(out, moved) : walls
}

/**
 * A node put at a point, the opposite of healing one: every line the
 * point lies strictly inside is cut there, as a contact cuts it, so a
 * crossing becomes a junction. The lines, and where the node stands: the
 * point, or a curve's own point there when a curve was cut. The same lines
 * and no node when the point lies inside none.
 */
export function addNode<T extends Line>(lines: T[], point: Vec2): { lines: T[]; node: Vec2 | null } {
  const at = quantize(point)
  const pieceId = pieceIds(lines)
  const moved = new Map<string, Vec2>()
  let cut = false
  const out = lines.flatMap(line => {
    const pieces = cutLine(line, [{ p: at }], pieceId, moved)
    cut ||= pieces.length > 1
    return pieces
  })
  return cut ? { lines: followCuts(out, moved), node: moved.get(nodeKey(at)) ?? at } : { lines, node: null }
}

/**
 * One line between two nodes: a line that joins the same two nodes the
 * same way as another (both straight, or the same curve either way round)
 * is the same line drawn twice, and only the widest is kept, the earlier
 * of equals. Two different curves between the same nodes are two lines.
 */
export function dropDuplicateLines<T extends Line>(lines: T[]): T[] {
  const key = (p: Vec2) => `${p[0]},${p[1]}`
  const shape = (l: Line): string => {
    const forward = key(l.points[0]) <= key(l.points[1])
    const ends = forward ? l.points : [l.points[1], l.points[0]]
    const handles = l.curve ? (forward ? l.curve : [l.curve[1], l.curve[0]]) : []
    return [...ends, ...handles].map(key).join('|')
  }
  const width = (l: Line) => (l as { width?: number }).width ?? 0
  const kept = new Map<string, number>()
  lines.forEach((l, i) => {
    const k = shape(l)
    const before = kept.get(k)
    if (before === undefined || width(l) > width(lines[before])) kept.set(k, i)
  })
  if (kept.size === lines.length) return lines
  const keep = new Set(kept.values())
  return lines.filter((_, i) => keep.has(i))
}

/**
 * The document invariant every commit restores: no two points closer than a
 * wall can be long, no wall shorter than that, every junction held as a
 * point of every wall through it, and one line between two nodes.
 */
export function normalizeLines<T extends Line>(lines: T[]): T[] {
  const merged = mergeNearPoints(lines)
  const valid = merged.length === keepValid(merged).length ? merged : keepValid(merged)
  return dropDuplicateLines(splitAtContacts(valid))
}

export const normalizeWalls = (walls: Wall[]): Wall[] => normalizeLines(walls)

/** A wall with its own height, or with none so it reaches the ceiling. */
const withHeight = (wall: Wall, height: number | undefined): Wall => {
  const { height: _, ...rest } = wall
  return height === undefined ? rest : { ...rest, height }
}

export function applyCommand(level: Level, command: Command): Level {
  switch (command.type) {
    case 'addWall':
      return { ...level, walls: keepValid([...level.walls, { ...command.wall, points: [quantize(command.wall.points[0]), quantize(command.wall.points[1])] }]) }
    case 'addFixtureLine':
      return { ...level, fixtureLines: keepValid([...level.fixtureLines, { ...command.line, points: [quantize(command.line.points[0]), quantize(command.line.points[1])] }]) }
    case 'setWallWidth':
      return { ...level, walls: level.walls.map(w => (command.wallIds.includes(w.id) ? { ...w, width: command.width } : w)) }
    case 'setWallHeight':
      return { ...level, walls: level.walls.map(w => (command.wallIds.includes(w.id) ? withHeight(w, command.height) : w)) }
    case 'setStoreyHeight':
      return { ...level, height: command.height }
    case 'removeLines':
      return withLines(level, command.layer, linesOf(level, command.layer).filter(w => !command.ids.includes(w.id)))
    case 'setCurves':
      return withLines(level, command.layer, linesOf(level, command.layer).map(w => {
        const c = command.curves.find(x => x.lineId === w.id)
        if (!c) return w
        if (!c.curve) {
          const { curve: _dropped, ...straight } = w
          return straight
        }
        return { ...w, curve: [quantize(c.curve[0]), quantize(c.curve[1])] as [Vec2, Vec2] }
      }))
    case 'transformNodes': {
      const [a, b, c, d, e, f] = command.matrix
      const map = (p: Vec2): Vec2 => quantize([a * p[0] + c * p[1] + e, b * p[0] + d * p[1] + f])
      const listed = (p: Vec2) => command.points.some(q => same(p, q))
      const scaled = linesOf(level, command.layer).map(w => {
        const both = listed(w.points[0]) && listed(w.points[1])
        if (both && w.curve) return { ...w, points: [map(w.points[0]), map(w.points[1])] as [Vec2, Vec2], curve: [map(w.curve[0]), map(w.curve[1])] as [Vec2, Vec2] }
        let line = w
        w.points.forEach((p, i) => {
          if (listed(p)) line = moveLineEnd(line, i as 0 | 1, map(p))
        })
        return line
      })
      return withLines(level, command.layer, keepValid(scaled))
    }
    case 'moveNodes': {
      const moved = linesOf(level, command.layer).map(w => {
        let line = w
        w.points.forEach((p, i) => {
          const move = command.moves.find(m => same(m.from, p))
          if (move) line = moveLineEnd(line, i as 0 | 1, quantize(move.to))
        })
        return line
      })
      return withLines(level, command.layer, keepValid(moved))
    }
    case 'removeNodes':
      return withLines(level, command.layer, linesOf(level, command.layer).filter(w => !w.points.some(p => command.points.some(q => same(p, q)))))
    case 'healNode': {
      const lines = linesOf(level, command.layer)
      const at = lines.filter(w => w.points.some(p => same(p, command.point)))
      const rest = lines.filter(w => !at.includes(w))
      if (at.length !== 2) return withLines(level, command.layer, rest)
      const ends = at.map(w => (same(w.points[0], command.point) ? w.points[1] : w.points[0])) as [Vec2, Vec2]
      const widths = at.map(w => (w as Wall).width).filter(w => w !== undefined)
      const { curve: _curve, ...first } = at[0]
      const healed: Line = { ...first, points: ends, ...(widths.length ? { width: Math.max(...widths) } : {}) }
      return withLines(level, command.layer, keepValid([...rest, healed]))
    }
    case 'addNode':
      return withLines(level, command.layer, addNode(linesOf(level, command.layer), command.point).lines)
    case 'addFixtures':
      return { ...level, fixtures: [...level.fixtures, ...command.fixtures] }
    case 'setFixture':
      return { ...level, fixtures: level.fixtures.map(f => (f.id === command.fixtureId ? { ...f, ...command.patch } : f)) }
    case 'addOpening':
      return { ...level, openings: [...level.openings, { ...command.opening, at: quantize(command.opening.at) }] }
    case 'setOpening':
      return { ...level, openings: level.openings.map(o => (o.id === command.openingId ? { ...o, ...command.patch, ...(command.patch.at ? { at: quantize(command.patch.at) } : {}) } : o)) }
    case 'removeOpenings':
      return { ...level, openings: level.openings.filter(o => !command.ids.includes(o.id)) }
    case 'setSpaces':
      return { ...level, spaces: command.spaces.map(space => ({ ...space, units: [...space.units] })) }
    case 'setUnit':
      return { ...level, units: level.units.map(u => (u.id === command.unitId ? { ...u, ...command.patch } : u)) }
    case 'setReference': {
      const { reference: _dropped, ...rest } = level
      return command.reference ? { ...rest, reference: { ...command.reference } } : rest
    }
  }
}

export function applyCommands(level: Level, commands: Command[]): Level {
  return commands.reduce(applyCommand, level)
}
