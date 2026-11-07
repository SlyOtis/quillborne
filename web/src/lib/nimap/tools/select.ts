import type { Vec2 } from '../geometry/vector'
import { add, sub, distance, bounds, mul, normalize } from '../geometry/vector'
import { addNode, type Command } from './commands'
import { nodeKey, type EditGraph, type GraphNode } from './graph'
import { EMPTY_SELECTION, isEmptySelection, remapNodes, selectionOf, toggleNode, type Selection } from './selection'
import { mergeTargets, withoutNodes, type Snapper, type SnapResult } from './snapping'
import { createTool, type OverlayItem, type PointerToolEvent, type ToolContext, type ToolDefinition, type Transition } from './tool'
import { quantize } from '../model/precision'
import { applyMatrix, deleteCommands, moveCommands, movingPoints as allMovingPoints, rotateAbout, scaleAbout, transformCommands, type Matrix, type MovingPoint } from './walls'
import type { Box } from '../geometry/vector'
import { curveHandles, handleMoves, mirrorOf, sameLength, snappedOpposite, type CurveHandle } from './handles'
import type { Hit } from './hit'
import { resizeCursor, rotateCursor, type CursorName } from './cursor'
import { centimetres, OPENING_MAX, OPENING_MIN, THINNEST_WALL, WIDTH_MAX } from './width'
import type { Opening } from '../model/types'
import { fitOpening, placeOpenings } from '../model/openings'
import { MIN_FEATURE } from '../model/precision'
import { isPart, KINDS, kindOf, selectedOf, touched, type LineHit } from './kinds'
import { dragChange, gripClick, gripCursor, gripDrag, gripEdit, isPointGrip, pressGrip, unchanged, type GripDrag, type HeldGrip } from './grips'
import { alongAxis, settle } from './grab'

interface Drag {
  /** Where the pointer went down; the moving points keep their offsets from it, so the hand's travel is what moves them. */
  origin: Vec2
  /** The selection the drag applies to; recorded with the move, or alone if the pointer never moved. */
  selection: Selection
  /** Every point that moves with the drag, by node id. */
  originals: Map<string, MovingPoint>
  /** The drag origin's snap anchor: the single neighbour of a lone node, else the origin itself. */
  anchor: Vec2
  /** Snap targets fixed at drag start: the scene minus everything that moves. */
  snap: Snapper
  /** The cursor the gesture started with, kept for its whole length. */
  cursor: CursorName
  /** What a press that never moves selects instead: the thing under the pointer, when the press fell inside the box on one. */
  click?: Selection
}

export interface HandleDrag {
  handle: CurveHandle
  /** Where the hand pressed, and the handle's offset from it: the handle moves by the hand's travel once the hand has left the press. */
  origin: Vec2
  offset: Vec2
  moved: boolean
  /** The handle across a smooth joint, decided at mouse down; Alt while dragging breaks it. */
  mirror: CurveHandle | null
  /** Whether the mirror also follows this handle's length, decided at mouse down from the lengths being equal. */
  mirrorLength: boolean
  snap: Snapper
}

export function beginHandleDrag(handle: CurveHandle, press: Vec2, ctx: ToolContext): HandleDrag {
  const sets = handle.layer === 'walls' ? [ctx.sources.document, ctx.sources.junctions] : [ctx.sources.fixtures, ctx.sources.faces]
  const mirror = mirrorOf(handle, ctx.graph)
  return { handle, origin: press, offset: sub(handle.point, press), moved: false, mirror, mirrorLength: !!mirror && sameLength(handle, mirror), snap: ctx.snapper({ nodes: mergeTargets(...sets).nodes, segments: [] }) }
}

interface HandleDragData {
  handle: HandleDrag | null
  cursor: SnapResult | null
}

/**
 * Where a dragged handle goes: snapped, then, unless Alt, pulled exactly
 * opposite its neighbour when loose and nearly there, and to the
 * neighbour's length when the lengths are loose and nearly equal.
 */
function handleTarget(h: HandleDrag, cursor: SnapResult, ctx: ToolContext): { to: Vec2; mirror: CurveHandle | null } {
  if (ctx.inputs.modifiers.alt) return { to: cursor.point, mirror: null }
  const tolerance = 8 / ctx.scale
  if (!h.mirror) return { to: snappedOpposite(h.handle, cursor.point, ctx.graph, tolerance), mirror: null }
  if (h.mirrorLength) return { to: cursor.point, mirror: h.mirror }
  const v = sub(cursor.point, h.handle.anchor)
  const lv = Math.hypot(v[0], v[1])
  const ln = distance(h.mirror.point, h.mirror.anchor)
  const to = lv && Math.abs(lv - ln) < tolerance ? add(h.handle.anchor, [(v[0] / lv) * ln, (v[1] / lv) * ln]) : cursor.point
  return { to, mirror: h.mirror }
}

/** Where the hand has carried the handle: the pointer plus the handle's offset from the press. */
const handleAt = (h: HandleDrag, pointer: Vec2): Vec2 => add(pointer, h.offset)

/** The handle-drag state, shared with the bend tool: a press that never leaves the hand's jitter is a click and moves nothing. */
export const handleDragState = {
  update: (data: HandleDragData, ctx: ToolContext): Transition => {
    if (!ctx.inputs.point) return
    const h = data.handle!
    if (!h.moved && distance(ctx.inputs.point, h.origin) <= DRAG_START_PX / ctx.scale) return
    h.moved = true
    data.cursor = h.snap(handleAt(h, ctx.inputs.point), { anchor: h.handle.anchor, modifiers: ctx.inputs.modifiers })
    const { to, mirror } = handleTarget(h, data.cursor, ctx)
    return { commands: [{ type: 'setCurves', layer: h.handle.layer, curves: handleMoves(h.handle, to, ctx.graph, mirror, h.mirrorLength) }], preview: true }
  },
  pointerUp: (_event: PointerToolEvent, data: HandleDragData, ctx: ToolContext): Transition => {
    const h = data.handle!
    if (!h.moved) {
      data.handle = null
      data.cursor = null
      return { to: 'idle' }
    }
    const cursor = data.cursor ?? h.snap(handleAt(h, ctx.inputs.point!), { anchor: h.handle.anchor, modifiers: ctx.inputs.modifiers })
    const { to, mirror } = handleTarget(h, cursor, ctx)
    data.handle = null
    data.cursor = null
    return { commands: [{ type: 'setCurves', layer: h.handle.layer, curves: handleMoves(h.handle, to, ctx.graph, mirror, h.mirrorLength) }], commit: 'Bend', to: 'idle' }
  },
  key: (event: { key: string }, data: HandleDragData): Transition => {
    if (event.key !== 'Escape') return
    data.handle = null
    data.cursor = null
    return { cancelPreview: true, to: 'idle' }
  }
}

/** An opening being slid: it follows the hand's displacement onto whichever wall is nearest, however far the hand is from it, refitted on every move. */
interface OpeningDrag {
  opening: Opening
  origin: Vec2
  selection: Selection
  moved: boolean
}

/** A selected wall's face being dragged: the width follows the hand, both faces moving together. */
interface Widen {
  wallId: string
  origin: Vec2
  startWidth: number
  /** Unit normal of the wall towards the grabbed face. */
  outward: Vec2
  moved: boolean
}

/** A selected opening's jamb being dragged: that jamb follows the hand along the wall, the other stays, and the opening is as wide as the hand asks or as the wall allows. */
interface Stretch {
  opening: Opening
  origin: Vec2
  /** The jamb that stays, and the unit direction from it toward the one in hand. */
  fixed: Vec2
  direction: Vec2
  startWidth: number
  moved: boolean
}

/** A line's middle pressed: the node it puts there is in the document from the press, so a click has made it, and a move drags it as any node. */
interface Split {
  origin: Vec2
  nodeId: string
}

/** A grip in hand: until the hand moves, a click; once it does, the drag it started. */
interface Gripping {
  held: HeldGrip
  drag: GripDrag | null
}

export interface SelectData {
  gripping: Gripping | null
  split: Split | null
  stretch: Stretch | null
  drag: Drag | null
  handle: HandleDrag | null
  transform: Transform | null
  openingDrag: OpeningDrag | null
  widen: Widen | null
  /** The selection a box gesture adds to, and what it selects instead if the press never moves: the area it started on. */
  box: { a: Vec2; b: Vec2; base: Selection; click?: Selection } | null
  cursor: SnapResult | null
}

const DRAG_START_PX = 2
const MAX_OFFSET_POINTS = 8

function dragAnchor(graph: EditGraph, initiator: GraphNode | null, movingCount: number): Vec2 | null {
  if (!initiator || movingCount !== 1) return null
  const neighbours = new Set<string>()
  for (const s of graph.segments) {
    if (s.aNode === initiator.id) neighbours.add(s.bNode)
    if (s.bNode === initiator.id) neighbours.add(s.aNode)
  }
  return neighbours.size === 1 ? graph.nodesById.get([...neighbours][0])!.point : null
}

/**
 * The carried points as offsets from the press: the moving points when
 * there are at most `MAX_OFFSET_POINTS`, else the corners of their bounding
 * box. The press itself is never one of them: where the hand landed on a
 * body is nothing, and a press on a node is already among the points.
 */
function dragOffsets(drag: Drag): Vec2[] {
  const points = [...drag.originals.values()].map(m => m.point)
  const carried = points.length <= MAX_OFFSET_POINTS ? points : (b => [[b.minX, b.minY], [b.maxX, b.minY], [b.minX, b.maxY], [b.maxX, b.maxY]] as Vec2[])(bounds(points))
  return carried.map(p => sub(p, drag.origin))
}

const movedSelection = (selection: Selection, originals: Map<string, MovingPoint>, delta: Vec2): Selection =>
  remapNodes(selection, id => {
    const m = originals.get(id)
    return m ? nodeKey(add(m.point, delta), m.layer) : id
  })

/** Where the drag has taken the origin, from the current inputs; the snap result is kept for the overlay. */
function dragDelta(data: SelectData, ctx: ToolContext): Vec2 {
  const drag = data.drag!
  const snapped = drag.snap(ctx.inputs.point!, { anchor: drag.anchor, offsets: dragOffsets(drag), pointerCarried: false, modifiers: ctx.inputs.modifiers })
  data.cursor = snapped
  return sub(snapped.point, drag.origin)
}

/** What a move snaps to depends on what moves: wall points to the wall sources, fixture points to faces and fixtures, a mix to both. Every chord of a moving line goes too. */
function dragTargets(originals: Map<string, MovingPoint>, ctx: ToolContext) {
  const layers = new Set([...originals.values()].map(m => m.layer))
  const sets = [
    ...(layers.has('walls') ? [ctx.sources.document, ctx.sources.junctions] : []),
    ...(layers.has('fixtures') ? [ctx.sources.fixtures, ctx.sources.faces] : [])
  ]
  const movingLines = new Set([...originals.keys()].flatMap(id => ctx.graph.nodesById.get(id)?.refs.map(r => r.lineId) ?? []))
  const targets = mergeTargets(...sets)
  const still = { nodes: targets.nodes, segments: targets.segments.filter(s => !movingLines.has(s.id.split(':')[0])) }
  return withoutNodes(still, new Set(originals.keys()))
}

/** The lines reachable from one through nodes that join exactly two lines: a run, or a ring when it comes back around. */
export function chainOf(graph: EditGraph, lineId: string): string[] {
  const chain = new Set<string>([lineId])
  const linesAt = (nodeId: string) => [...new Set(graph.nodesById.get(nodeId)?.refs.map(r => r.lineId) ?? [])]
  const ends = (id: string): string[] => {
    const line = graph.linesById.get(id)
    const layer = graph.segments.find(s => s.lineId === id)?.layer ?? 'walls'
    return line ? line.points.map(p => nodeKey(p, layer)) : []
  }
  const queue = [lineId]
  while (queue.length) {
    const id = queue.pop()!
    for (const nodeId of ends(id)) {
      const at = linesAt(nodeId)
      if (at.length !== 2) continue
      for (const next of at) if (!chain.has(next)) {
        chain.add(next)
        queue.push(next)
      }
    }
  }
  return [...chain]
}

/** What a selection moves, less anything on a locked layer: a stage that locks a layer to its faces lets them be selected, never moved. */
function movable(selection: Selection, ctx: ToolContext): Map<string, MovingPoint> {
  const points = allMovingPoints(selection, ctx.graph, ctx.level)
  for (const [id, m] of points) if (ctx.layers[m.layer].locked) points.delete(id)
  return points
}

function startDrag(data: SelectData, origin: Vec2, initiator: GraphNode | null, selection: Selection, ctx: ToolContext): void {
  const originals = movable(selection, ctx)
  data.drag = {
    origin,
    selection,
    originals,
    anchor: dragAnchor(ctx.graph, initiator, originals.size) ?? origin,
    snap: ctx.snapper(dragTargets(originals, ctx)),
    cursor: initiator ? 'arrow' : 'move'
  }
}

/** Pixel reach of the box's edge and corner zones. */
const ZONE_PX = 6
/** How far from a corner, outside the box, still rotates. */
const ROTATE_PX = 16

export type BoxZone =
  | { kind: 'scale'; axes: [boolean, boolean]; grabbed: Vec2; fixed: Vec2 }
  /** `corner` is the corner the hand is outside of, as the rotate cursor's angle: 0 top-left, 90 top-right, 180 bottom-right, 270 bottom-left. */
  | { kind: 'rotate'; corner: number }
  | { kind: 'move' }

const thingCount = (s: Selection): number => s.nodeIds.size + s.lineIds.size + s.fixtureIds.size + s.openingIds.size

/**
 * The snug bounding box of what a selection moves, on node centres, when
 * there is something to transform: a group of two or more things, or a
 * face, which moves as its shape. One wall or one node has no box; it is
 * edited through its own parts.
 */
export function selectionBounds(selection: Selection, ctx: ToolContext): { box: Box; moving: Map<string, MovingPoint> } | null {
  if (thingCount(selection) < 2 && !selection.fixtureIds.size && !selection.unitIds.size) return null
  const moving = movable(selection, ctx)
  if (moving.size < 2) return null
  const box = bounds([...moving.values()].map(m => m.point))
  if (box.maxX - box.minX < 1e-9 && box.maxY - box.minY < 1e-9) return null
  return { box, moving }
}

/**
 * What a point on or near the box means: within reach of an edge scales
 * that axis, of a corner both, anywhere else outside the box near a corner
 * rotates, so the hand passes from scaling straight to rotating, and
 * inside moves. Null away from the box.
 */
export function boxZone(box: Box, p: Vec2, scale: number): BoxZone | null {
  const zone = ZONE_PX / scale
  const rotate = ROTATE_PX / scale
  const nearMin = Math.abs(p[0] - box.minX) <= zone
  const nearMax = Math.abs(p[0] - box.maxX) <= zone
  const nearLo = Math.abs(p[1] - box.minY) <= zone
  const nearHi = Math.abs(p[1] - box.maxY) <= zone
  const withinX = p[0] >= box.minX - zone && p[0] <= box.maxX + zone
  const withinY = p[1] >= box.minY - zone && p[1] <= box.maxY + zone
  const flatX = box.maxX - box.minX < 1e-9
  const flatY = box.maxY - box.minY < 1e-9
  if (withinX && withinY) {
    const x = flatX ? null : nearMin ? box.minX : nearMax ? box.maxX : null
    const y = flatY ? null : nearLo ? box.minY : nearHi ? box.maxY : null
    if (x !== null || y !== null) {
      const grabbed: Vec2 = [x ?? (box.minX + box.maxX) / 2, y ?? (box.minY + box.maxY) / 2]
      const fixed: Vec2 = [box.minX + box.maxX - grabbed[0], box.minY + box.maxY - grabbed[1]]
      return { kind: 'scale', axes: [x !== null, y !== null], grabbed, fixed }
    }
    return { kind: 'move' }
  }
  const cornerX = Math.min(Math.abs(p[0] - box.minX), Math.abs(p[0] - box.maxX))
  const cornerY = Math.min(Math.abs(p[1] - box.minY), Math.abs(p[1] - box.maxY))
  if (cornerX <= rotate && cornerY <= rotate) {
    const right = p[0] > (box.minX + box.maxX) / 2
    const top = p[1] > (box.minY + box.maxY) / 2
    return { kind: 'rotate', corner: top ? (right ? 90 : 0) : right ? 180 : 270 }
  }
  return null
}

/** The cursor a zone announces: resize along the axis or diagonal it scales, rotate round its corner, or move. */
function zoneCursor(zone: BoxZone | null): CursorName | null {
  if (!zone) return null
  if (zone.kind === 'move') return 'move'
  if (zone.kind === 'rotate') return rotateCursor(zone.corner)
  const [x, y] = zone.axes
  if (x && y) return resizeCursor((zone.grabbed[0] > zone.fixed[0]) === (zone.grabbed[1] > zone.fixed[1]) ? 135 : 45)
  return resizeCursor(x ? 0 : 90)
}

interface Transform {
  moving: Map<string, MovingPoint>
  box: Box
  zone: BoxZone
  /** Where the pointer went down, and the box centre, for rotation. */
  origin: Vec2
  centre: Vec2
  snap: Snapper
  /** Whether the hand has left the press; a press that never does is a click. */
  moved: boolean
  /** What a click selects instead of transforming: the thing under the pointer, toggled under Shift. */
  click?: Selection
}

/** The grabbed edge or corner carried by the pointer's movement: what snaps, so the edge lands exactly where it snaps. */
const carried = (t: Transform, pointer: Vec2): Vec2 => (t.zone.kind === 'scale' ? add(t.zone.grabbed, sub(pointer, t.origin)) : pointer)

/** The matrix a transform gesture has reached with the grabbed point at `target`. */
function transformMatrix(t: Transform, target: Vec2, shift: boolean): Matrix {
  if (t.zone.kind === 'rotate') {
    const a0 = Math.atan2(t.origin[1] - t.centre[1], t.origin[0] - t.centre[0])
    const a1 = Math.atan2(target[1] - t.centre[1], target[0] - t.centre[0])
    let angle = a1 - a0
    if (shift) angle = Math.round(angle / (Math.PI / 12)) * (Math.PI / 12)
    return rotateAbout(t.centre, angle)
  }
  if (t.zone.kind !== 'scale') return [1, 0, 0, 1, 0, 0]
  const { grabbed, fixed, axes } = t.zone
  const factor = (axis: 0 | 1): number => {
    if (!axes[axis]) return 1
    const span = grabbed[axis] - fixed[axis]
    if (Math.abs(span) < 1e-9) return 1
    const f = (target[axis] - fixed[axis]) / span
    return Math.abs(f) < 0.01 ? 0.01 * Math.sign(f || 1) : f
  }
  let fx = factor(0)
  let fy = factor(1)
  if (shift && axes[0] && axes[1]) {
    const u = Math.abs(target[0] - grabbed[0]) >= Math.abs(target[1] - grabbed[1]) ? fx : fy
    fx = fy = u
  }
  return scaleAbout(fixed, fx, fy)
}

const transformedSelection = (selection: Selection, t: Transform, m: Matrix): Selection =>
  remapNodes(selection, id => {
    const p = t.moving.get(id)
    return p ? nodeKey(quantize(applyMatrix(m, p.point)), p.layer) : id
  })

function startTransform(data: SelectData, zone: BoxZone, b: { box: Box; moving: Map<string, MovingPoint> }, origin: Vec2, ctx: ToolContext): void {
  const centre: Vec2 = [(b.box.minX + b.box.maxX) / 2, (b.box.minY + b.box.maxY) / 2]
  data.transform = { moving: b.moving, box: b.box, zone, origin, centre, snap: ctx.snapper(dragTargets(b.moving, ctx)), moved: false }
}

/** A control of the selection itself rather than a thing: a curve handle or a grip. */
const control = (hit: Hit | null): boolean => hit?.kind === 'handle' || hit?.kind === 'grip'

const partHit = (hit: Hit | null): boolean => !!hit && hit.kind !== 'node' && !control(hit) && isPart(hit as Exclude<Hit, { kind: 'node' | 'handle' | 'grip' }>)

type Bounds = NonNullable<ReturnType<typeof selectionBounds>>
type ZoneAt = { b: Bounds; zone: BoxZone }

/** The nodes lying on the box's edge: while the box is shown they are part of it and not there for the hand. */
const edgeNodes = (box: Box, ctx: ToolContext): Set<string> =>
  new Set(ctx.graph.nodes.filter(({ point: [x, y] }) => x >= box.minX - 1e-9 && x <= box.maxX + 1e-9 && y >= box.minY - 1e-9 && y <= box.maxY + 1e-9 && [x - box.minX, x - box.maxX, y - box.minY, y - box.maxY].some(d => Math.abs(d) < 1e-9)).map(n => n.id))

const usable = (hit: Hit | null, selection: Selection): Hit | null => (hit && hit.kind !== 'node' && hit.kind !== 'handle' && hit.kind !== 'grip' ? touched(hit, selection) : hit)

/**
 * What the pointer is over, as the hand can use it: the box's zone when
 * the box takes the point, and the thing under it, a part only on a
 * selected thing and never a node lying on the box's edge. What a click on
 * the box's edge or corner selects is read with those nodes, since a click
 * there picks the node it lands on.
 */
function pointerAt(point: Vec2, ctx: ToolContext): { hit: Hit | null; at: ZoneAt | null; under: Hit | null } {
  const b = selectionBounds(ctx.selection, ctx)
  const hit = usable(ctx.hit.at(point, b ? edgeNodes(b.box, ctx) : undefined), ctx.selection)
  const at = zoneAt(hit, point, b, ctx)
  return { hit, at, under: at?.zone.kind === 'scale' ? usable(ctx.hit.at(point), ctx.selection) : hit }
}

/** What a click on a thing selects: just that thing, or under Shift the selection with it toggled. */
function clicked(hit: Hit | null, selection: Selection, shift: boolean): Selection | undefined {
  if (!hit || hit.kind === 'handle' || hit.kind === 'grip') return undefined
  if (hit.kind === 'node') return shift ? toggleNode(selection, hit.node.id) : selectionOf([hit.node.id])
  const kind = kindOf(hit)
  return shift ? kind.toggle(selection, kind.idOf(hit)) : kind.only(kind.idOf(hit))
}

/** The width a widening drag has reached: the grabbed face follows the hand, so the width changes by twice the hand's travel, on whole centimetres within the limits. */
function widenedWidth(w: Widen, pointer: Vec2): number {
  return Math.min(WIDTH_MAX, Math.max(THINNEST_WALL, Math.round((w.startWidth + 2 * alongAxis(w.origin, w.outward, pointer)) * 100) / 100))
}

/**
 * The box zone the press falls in, if the box takes it. Its edges, corners
 * and rotate zones win over anything lying there, nodes and a grip that is
 * a line included, as over a wall's face; inside, a part or a grip of a
 * selected thing, or anything under Shift, answers instead, and a curve
 * handle or a grip that is a point, a chair or a leg, always does.
 */
function zoneAt(hit: Hit | null, p: Vec2, b: Bounds | null, ctx: ToolContext): ZoneAt | null {
  if (hit?.kind === 'handle' || (hit?.kind === 'grip' && isPointGrip(hit.grip))) return null
  const zone = b && boxZone(b.box, p, ctx.scale)
  if (!b || !zone) return null
  if (zone.kind === 'move' && hit && (hit.kind === 'grip' || partHit(hit) || ctx.inputs.modifiers.shift)) return null
  return { b, zone }
}

function pointerDown(event: PointerToolEvent, data: SelectData, ctx: ToolContext): Transition {
  const current = ctx.selection
  const { hit, at, under } = pointerAt(event.point, ctx)
  if (at?.zone.kind === 'move') {
    startDrag(data, event.point, null, current, ctx)
    data.drag!.click = clicked(under, current, false)
    return { to: 'pendingDrag' }
  }
  if (at) {
    startTransform(data, at.zone, at.b, event.point, ctx)
    data.transform!.click = clicked(under, current, event.modifiers.shift)
    return { to: 'transforming' }
  }
  if (hit?.kind === 'handle') {
    data.handle = beginHandleDrag(hit.handle, event.point, ctx)
    return { to: 'handleDrag' }
  }
  if (hit?.kind === 'grip') {
    const press = pressGrip(hit.grip, ctx.level, event.point, event.modifiers.alt)
    switch (press.gesture) {
      case 'edit':
        return { commands: press.commands, commit: press.commit, selection: current }
      case 'hold':
        data.gripping = { held: press, drag: null }
        return { to: 'gripping' }
      case 'none':
        return undefined
    }
  }
  if (hit?.kind === 'node') {
    const node = hit.node
    let selection = current
    if (event.modifiers.shift) {
      selection = toggleNode(current, node.id)
      if (!selection.nodeIds.has(node.id)) return { selection }
    } else if (!current.nodeIds.has(node.id)) {
      selection = selectionOf([node.id])
    }
    startDrag(data, event.point, node, selection, ctx)
    return { to: 'pendingDrag' }
  }
  if (hit) {
    const press = kindOf(hit).press(hit, current, event.modifiers.shift, ctx)
    switch (press.gesture) {
      case 'none':
        return { selection: press.selection }
      case 'edit':
        return { commands: press.commands, commit: press.commit, selection: press.selection }
      case 'widen':
        return startWiden(data, press.hit, event.point, ctx)
      case 'split':
        return startSplit(data, press.hit, event.point, ctx)
      case 'stretch':
        return startStretch(data, press.opening, press.jamb, event.point, ctx)
      case 'slide':
        data.openingDrag = { opening: press.opening, origin: event.point, selection: press.selection, moved: false }
        return { to: 'openingDrag' }
      case 'drag':
        if (!movable(press.selection, ctx).size) {
          data.box = { a: event.point, b: event.point, base: event.modifiers.shift ? current : EMPTY_SELECTION, click: press.selection }
          return { to: 'boxSelecting' }
        }
        startDrag(data, event.point, null, press.selection, ctx)
        return { to: 'pendingDrag' }
      case 'area':
        data.box = { a: event.point, b: event.point, base: event.modifiers.shift ? current : EMPTY_SELECTION, click: press.selection }
        return { to: 'boxSelecting' }
    }
  }
  data.box = { a: event.point, b: event.point, base: event.modifiers.shift ? current : EMPTY_SELECTION }
  return { to: 'boxSelecting' }
}

function startStretch(data: SelectData, opening: Opening, jamb: 0 | 1, origin: Vec2, ctx: ToolContext): Transition {
  const placed = placeOpenings([opening], ctx.level.walls)[0]
  if (!placed) return
  const fixed = placed.geometry.jambs[1 - jamb]
  const direction = normalize(sub(placed.geometry.jambs[jamb], fixed))
  data.stretch = { opening, origin, fixed, direction, startWidth: opening.width, moved: false }
  return { to: 'stretching' }
}

/**
 * The widest the opening can be, up to what the hand asks, with its fixed
 * jamb where it is: whole centimetres within the opening limits, and no
 * wider than the wall allows before a junction or another opening, found
 * by asking the fitter for each width whether the centre it gives stays.
 */
function stretched(s: Stretch, pointer: Vec2, ctx: ToolContext): { width: number; at: Vec2 } {
  const inCentimetres = (width: number) => Math.round(width * 100) / 100
  const place = (width: number): Vec2 | null => {
    const centre = add(s.fixed, mul(s.direction, inCentimetres(width) / 2))
    const fit = fitOpening(centre, { ...s.opening, width: inCentimetres(width) }, ctx.level.walls, ctx.level.openings, MIN_FEATURE)
    return fit && distance(fit.at, centre) < 1e-4 ? fit.at : null
  }
  const asked = Math.min(OPENING_MAX, Math.max(OPENING_MIN, s.startWidth + alongAxis(s.origin, s.direction, pointer)))
  const width = settle(s.startWidth, asked, w => !!place(w), 0.005)
  const at = place(width)
  return at ? { width: inCentimetres(width), at } : { width: s.opening.width, at: s.opening.at }
}

/** Puts a node at a line's middle and selects it, the line the hand is on and any crossing there: the press alone makes it. */
function startSplit(data: SelectData, hit: LineHit, origin: Vec2, ctx: ToolContext): Transition {
  const { node } = addNode(hit.layer === 'walls' ? ctx.level.walls : ctx.level.fixtureLines, hit.middle)
  if (!node) return
  data.split = { origin, nodeId: nodeKey(node, hit.layer) }
  return { commands: [{ type: 'addNode', layer: hit.layer, point: hit.middle }], commit: 'Add node', selection: selectionOf([data.split.nodeId]), to: 'splitting' }
}

function startWiden(data: SelectData, hit: LineHit, origin: Vec2, ctx: ToolContext): Transition {
  const { a, b } = hit.segment
  const d = normalize(sub(b, a))
  const wall = ctx.level.walls.find(w => w.id === hit.lineId)!
  data.widen = { wallId: hit.lineId, origin, startWidth: wall.width, outward: [-d[1] * hit.side, d[0] * hit.side], moved: false }
  return { to: 'widening' }
}

function deleteSelection(ctx: ToolContext): Transition {
  if (isEmptySelection(ctx.selection)) return
  return { commands: deleteCommands(ctx.selection, ctx.graph, ctx.level), commit: 'Delete', selection: EMPTY_SELECTION }
}

const ARROWS: Record<string, Vec2> = { ArrowUp: [0, 1], ArrowDown: [0, -1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] }

function nudge(key: string, shift: boolean, ctx: ToolContext): Transition {
  const dir = ARROWS[key]
  if (!dir) return
  const amount = (shift ? 10 : 1) / ctx.scale
  const delta: Vec2 = [dir[0] * amount, dir[1] * amount]
  const originals = movable(ctx.selection, ctx)
  if (!originals.size) return
  return { commands: moveCommands(originals, delta), commit: 'Nudge', selection: movedSelection(ctx.selection, originals, delta) }
}

/** Every kind steps the width of its selected things; the commit is named by the first kind that had any. */
function stepSelectedWidths(direction: 1 | -1, big: boolean, ctx: ToolContext): Transition {
  const commands: Command[] = []
  let commit = ''
  for (const kind of KINDS) {
    const step = kind.stepWidth?.(selectedOf(kind, ctx.selection, ctx.graph), direction, big, ctx)
    if (!step?.commands.length) continue
    commands.push(...step.commands)
    commit ||= step.commit
  }
  return commands.length ? { commands, commit } : undefined
}

/** Tab flips the hinge of every selected door, Shift+Tab the side it swings to. */
function flipSelectedDoors(side: boolean, ctx: ToolContext): Transition {
  const commands = KINDS.flatMap(kind => kind.flip?.(selectedOf(kind, ctx.selection, ctx.graph), side, ctx) ?? [])
  return commands.length ? { commands, commit: 'Flip door' } : undefined
}

/** Where a slid opening lands with the hand at `pointer`: the hand's displacement applied to it, refitted on the nearest wall however far, or where it was when it fits on none. */
function slideOpening(d: OpeningDrag, pointer: Vec2, ctx: ToolContext): Vec2 {
  const fit = fitOpening(add(d.opening.at, sub(pointer, d.origin)), d.opening, ctx.level.walls, ctx.level.openings, Infinity)
  return fit ? fit.at : d.opening.at
}

const preview = (drag: Drag, delta: Vec2): Command[] => moveCommands(drag.originals, delta)

/** The store's selection is authoritative except while a drag holds one the store has not seen yet. */
function overlay(state: string, data: SelectData, ctx: ToolContext): OverlayItem[] {
  const items: OverlayItem[] = []
  if (state === 'idle' || state === 'handleDrag') {
    const handles = curveHandles(ctx.selection, ctx.graph)
    if (handles.length) items.push({ type: 'handles', handles })
    const b = selectionBounds(ctx.selection, ctx)
    if (b) items.push({ type: 'bounds', box: b.box })
  }
  if (state === 'idle' && ctx.inputs.point) {
    const { hit, at } = pointerAt(ctx.inputs.point, ctx)
    if (hit && (!at || at.zone.kind === 'move')) items.push({ type: 'hover', hit })
  }
  if (state === 'transforming' && data.cursor) for (const guide of data.cursor.guides) items.push({ type: 'guide', guide })
  if (state === 'handleDrag' && data.cursor) for (const guide of data.cursor.guides) items.push({ type: 'guide', guide })
  if (state === 'boxSelecting' && data.box) items.push({ type: 'box', a: data.box.a, b: data.box.b })
  const point = ctx.inputs.point
  if (state === 'openingDrag' && data.openingDrag?.moved && point) items.push({ type: 'opening', opening: { ...data.openingDrag.opening, at: slideOpening(data.openingDrag, point, ctx) } })
  if (state === 'widening' && data.widen?.moved && point) items.push({ type: 'label', at: point, text: centimetres(widenedWidth(data.widen, point)) })
  if (state === 'stretching' && data.stretch?.moved && point) items.push({ type: 'label', at: point, text: centimetres(stretched(data.stretch, point, ctx).width) })
  const g = state === 'gripping' ? data.gripping : null
  const readout = g?.drag?.label && point ? g.drag.label(dragChange(g.held, g.drag, point)) : null
  if (readout && point) items.push({ type: 'label', at: point, text: readout })
  if (state === 'pendingDrag' && data.drag) items.push({ type: 'selection', selection: data.drag.selection })
  if (state === 'dragging' && data.drag && data.cursor) {
    const moved = movedSelection(data.drag.selection, data.drag.originals, sub(data.cursor.point, data.drag.origin))
    items.push({ type: 'selection', selection: moved })
    const b = selectionBounds(moved, ctx)
    if (b) items.push({ type: 'bounds', box: b.box })
    for (const guide of data.cursor.guides) items.push({ type: 'guide', guide })
  }
  if (state === 'transforming' && data.transform && ctx.inputs.point) {
    const t = data.transform
    const target = data.cursor?.point ?? ctx.inputs.point
    const b = selectionBounds(transformedSelection(ctx.selection, t, transformMatrix(t, target, ctx.inputs.modifiers.shift)), ctx)
    if (b) items.push({ type: 'bounds', box: b.box })
  }
  return items
}

/**
 * Selects nodes, lines, rooms and fixtures on either layer, drags them with
 * snapping (every coincident point of a layer moves together; a face moves
 * the stored nodes on its boundary, and moves only once selected, since a
 * press on an unselected one is a click that selects it or a drag that
 * box-selects), box-selects nodes and whatever lies wholly inside, double-clicks a line to
 * select its run or ring, nudges with the arrow keys, steps the width of
 * selected walls and openings with plus and minus, slides a door or window
 * along its wall and onto the next, flips a door with Tab or, once it is
 * selected, by clicking its leaf (side) or its swing arc (hinge), widens a
 * selected wall by dragging its face, lights up whatever is under the
 * pointer, puts a node at the middle of any line pressed there (a drag
 * then moves it), deletes, and drags the Bézier handles of selected curves,
 * keeping a smooth joint smooth for the whole drag unless Alt breaks it.
 * A thing's parts act only while it is selected, and a selected thing's
 * body shows the move cursor. A group of two or more things, or a face,
 * gets a snug transform box; one wall or one node does not. The box's
 * edges scale, its corners scale both axes (uniformly under Shift), just
 * outside a corner rotates (in 15° steps under Shift), all of them over any
 * node lying there; inside, a drag moves everything and a click selects
 * just the thing under the pointer. The
 * selection lives in the store: every change is
 * returned as a result and becomes a history entry, and a drag records its
 * selection with the move so undo restores both.
 */
export const selectDefinition: ToolDefinition<SelectData> = {
  id: 'select',
  initial: 'idle',
  create: () => ({ gripping: null, split: null, stretch: null, drag: null, handle: null, transform: null, openingDrag: null, widen: null, box: null, cursor: null }),
  states: {
    idle: {
      pointerDown,
      doubleClick: (event, _data, ctx) => {
        const hit = ctx.hit.at(event.point)
        if (hit?.kind !== 'line') return
        return { selection: selectionOf([], chainOf(ctx.graph, hit.lineId)) }
      },
      key: (event, _data, ctx) => {
        if (event.key === 'Escape') return isEmptySelection(ctx.selection) ? undefined : { selection: EMPTY_SELECTION }
        if (event.key === 'Delete' || event.key === 'Backspace') return deleteSelection(ctx)
        if (event.key === '+' || event.key === '-') return stepSelectedWidths(event.key === '+' ? 1 : -1, event.modifiers.shift, ctx)
        if (event.key === 'Tab') return flipSelectedDoors(event.modifiers.shift, ctx)
        return nudge(event.key, event.modifiers.shift, ctx)
      }
    },
    pendingDrag: {
      update: (data, ctx) => {
        if (!ctx.inputs.point || distance(ctx.inputs.point, data.drag!.origin) <= DRAG_START_PX / ctx.scale) return
        return { to: 'dragging', commands: preview(data.drag!, dragDelta(data, ctx)), preview: true }
      },
      pointerUp: (_event, data) => {
        const selection = data.drag!.click ?? data.drag!.selection
        data.drag = null
        return { selection, to: 'idle' }
      },
      key: (event, data) => {
        if (event.key !== 'Escape') return
        data.drag = null
        return { to: 'idle' }
      }
    },
    dragging: {
      update: (data, ctx) => ({ commands: preview(data.drag!, dragDelta(data, ctx)), preview: true }),
      pointerUp: (_event, data, ctx) => {
        const drag = data.drag!
        const delta = dragDelta(data, ctx)
        data.drag = null
        data.cursor = null
        return { commands: preview(drag, delta), commit: 'Move', selection: movedSelection(drag.selection, drag.originals, delta), to: 'idle' }
      },
      key: (event, data) => {
        if (event.key !== 'Escape') return
        data.drag = null
        data.cursor = null
        return { cancelPreview: true, to: 'idle' }
      }
    },
    handleDrag: handleDragState,
    splitting: {
      update: (data, ctx) => {
        const s = data.split!
        if (!ctx.inputs.point || distance(ctx.inputs.point, s.origin) <= DRAG_START_PX / ctx.scale) return
        data.split = null
        const node = ctx.graph.nodesById.get(s.nodeId)
        if (!node) return { to: 'idle' }
        startDrag(data, s.origin, node, selectionOf([node.id]), ctx)
        return { to: 'dragging', commands: preview(data.drag!, dragDelta(data, ctx)), preview: true }
      },
      pointerUp: (_event, data) => {
        data.split = null
        return { to: 'idle' }
      },
      key: (event, data) => {
        if (event.key !== 'Escape') return
        data.split = null
        return { to: 'idle' }
      }
    },
    widening: {
      update: (data, ctx) => {
        const w = data.widen!
        if (!ctx.inputs.point) return
        if (!w.moved && distance(ctx.inputs.point, w.origin) <= DRAG_START_PX / ctx.scale) return
        w.moved = true
        return { commands: [{ type: 'setWallWidth', wallIds: [w.wallId], width: widenedWidth(w, ctx.inputs.point) }], preview: true }
      },
      pointerUp: (event, data) => {
        const w = data.widen!
        data.widen = null
        if (!w.moved) return { cancelPreview: true, to: 'idle' }
        const width = widenedWidth(w, event.point)
        if (width === w.startWidth) return { cancelPreview: true, to: 'idle' }
        return { commands: [{ type: 'setWallWidth', wallIds: [w.wallId], width }], commit: 'Wall width', to: 'idle' }
      },
      key: (event, data) => {
        if (event.key !== 'Escape') return
        data.widen = null
        return { cancelPreview: true, to: 'idle' }
      }
    },
    stretching: {
      update: (data, ctx) => {
        const s = data.stretch!
        if (!ctx.inputs.point) return
        if (!s.moved && distance(ctx.inputs.point, s.origin) <= DRAG_START_PX / ctx.scale) return
        s.moved = true
        return { commands: [{ type: 'setOpening', openingId: s.opening.id, patch: stretched(s, ctx.inputs.point, ctx) }], preview: true }
      },
      pointerUp: (event, data, ctx) => {
        const s = data.stretch!
        data.stretch = null
        if (!s.moved) return { to: 'idle' }
        const { width, at } = stretched(s, event.point, ctx)
        if (width === s.startWidth) return { cancelPreview: true, to: 'idle' }
        return { commands: [{ type: 'setOpening', openingId: s.opening.id, patch: { width, at } }], commit: 'Opening width', to: 'idle' }
      },
      key: (event, data) => {
        if (event.key !== 'Escape') return
        data.stretch = null
        return { cancelPreview: true, to: 'idle' }
      }
    },
    gripping: {
      update: (data, ctx) => {
        const g = data.gripping!
        if (!ctx.inputs.point) return
        if (!g.drag && distance(ctx.inputs.point, g.held.point) <= DRAG_START_PX / ctx.scale) return
        g.drag ??= gripDrag(g.held, ctx.inputs.point)
        return { commands: gripEdit(g.held, g.drag, dragChange(g.held, g.drag, ctx.inputs.point)).commands, preview: true }
      },
      pointerUp: (event, data) => {
        const g = data.gripping!
        data.gripping = null
        if (!g.drag) {
          const click = gripClick(g.held)
          return click ? { ...click, to: 'idle' } : { to: 'idle' }
        }
        const change = dragChange(g.held, g.drag, event.point)
        if (unchanged(g.held, change)) return { cancelPreview: true, to: 'idle' }
        return { ...gripEdit(g.held, g.drag, change), to: 'idle' }
      },
      key: (event, data) => {
        if (event.key !== 'Escape') return
        data.gripping = null
        return { cancelPreview: true, to: 'idle' }
      }
    },
    openingDrag: {
      update: (data, ctx) => {
        const d = data.openingDrag!
        if (!ctx.inputs.point) return
        if (!d.moved && distance(ctx.inputs.point, d.origin) <= DRAG_START_PX / ctx.scale) return
        d.moved = true
        return { commands: [{ type: 'setOpening', openingId: d.opening.id, patch: { at: slideOpening(d, ctx.inputs.point, ctx) } }], preview: true }
      },
      pointerUp: (event, data, ctx) => {
        const d = data.openingDrag!
        data.openingDrag = null
        if (!d.moved) return { selection: d.selection, to: 'idle' }
        return { commands: [{ type: 'setOpening', openingId: d.opening.id, patch: { at: slideOpening(d, event.point, ctx) } }], commit: `Move ${d.opening.kind}`, selection: d.selection, to: 'idle' }
      },
      key: (event, data) => {
        if (event.key !== 'Escape') return
        data.openingDrag = null
        return { cancelPreview: true, to: 'idle' }
      }
    },
    transforming: {
      update: (data, ctx) => {
        if (!ctx.inputs.point) return
        const t = data.transform!
        if (!t.moved && distance(ctx.inputs.point, t.origin) <= DRAG_START_PX / ctx.scale) return
        t.moved = true
        data.cursor = t.zone.kind === 'rotate' ? null : t.snap(carried(t, ctx.inputs.point), { modifiers: ctx.inputs.modifiers })
        const target = data.cursor?.point ?? ctx.inputs.point
        return { commands: transformCommands(t.moving, transformMatrix(t, target, ctx.inputs.modifiers.shift)), preview: true }
      },
      pointerUp: (event, data, ctx) => {
        const t = data.transform!
        if (!t.moved) {
          data.transform = null
          data.cursor = null
          return t.click ? { selection: t.click, to: 'idle' } : { to: 'idle' }
        }
        const target = t.zone.kind === 'rotate' ? event.point : (data.cursor ?? t.snap(carried(t, event.point), { modifiers: ctx.inputs.modifiers })).point
        const m = transformMatrix(t, target, ctx.inputs.modifiers.shift)
        data.transform = null
        data.cursor = null
        const label = t.zone.kind === 'rotate' ? 'Rotate' : 'Scale'
        return { commands: transformCommands(t.moving, m), commit: label, selection: transformedSelection(ctx.selection, t, m), to: 'idle' }
      },
      key: (event, data) => {
        if (event.key !== 'Escape') return
        data.transform = null
        data.cursor = null
        return { cancelPreview: true, to: 'idle' }
      }
    },
    boxSelecting: {
      update: (data, ctx) => {
        if (ctx.inputs.point) data.box!.b = ctx.inputs.point
      },
      pointerUp: (event, data, ctx) => {
        const box = data.box!
        box.b = event.point
        data.box = null
        if (box.click && distance(box.a, box.b) <= DRAG_START_PX / ctx.scale) return { selection: box.click, to: 'idle' }
        const union = (base: ReadonlySet<string>, ids: Iterable<string>) => new Set([...base, ...ids])
        return {
          selection: {
            nodeIds: union(box.base.nodeIds, ctx.hit.nodesInBox(box.a, box.b).map(n => n.id)),
            lineIds: union(box.base.lineIds, ctx.hit.linesInBox(box.a, box.b)),
            fixtureIds: union(box.base.fixtureIds, ctx.hit.fixturesInBox(box.a, box.b).map(f => f.id)),
            openingIds: box.base.openingIds,
            unitIds: union(box.base.unitIds, ctx.hit.unitsInBox(box.a, box.b).map(u => u.id))
          },
          to: 'idle'
        }
      },
      key: (event, data) => {
        if (event.key !== 'Escape') return
        data.box = null
        return { to: 'idle' }
      }
    }
  },
  overlay,
  cursor: (state, data, ctx) => {
    if (state === 'transforming') return zoneCursor(data.transform!.zone) ?? 'arrow'
    if ((state === 'dragging' || state === 'pendingDrag') && data.drag) return data.drag.cursor
    if (state === 'openingDrag') return 'move'
    if (state === 'splitting') return 'arrow-add'
    if (state === 'widening' && data.widen) return resizeCursor((Math.atan2(-data.widen.outward[1], data.widen.outward[0]) * 180) / Math.PI)
    if (state === 'stretching' && data.stretch) return resizeCursor((Math.atan2(-data.stretch.direction[1], data.stretch.direction[0]) * 180) / Math.PI)
    if (state === 'gripping' && data.gripping) return data.gripping.drag?.cursor ?? gripCursor(data.gripping.held.grip, data.gripping.held.point, ctx.inputs.modifiers.alt)
    if (state !== 'idle' || !ctx.inputs.point) return 'arrow'
    const { hit, at } = pointerAt(ctx.inputs.point, ctx)
    if (at) return zoneCursor(at.zone) ?? 'arrow'
    if (hit?.kind === 'node') return ctx.selection.nodeIds.has(hit.node.id) ? 'move' : 'arrow'
    if (hit?.kind === 'grip') return gripCursor(hit.grip, ctx.inputs.point, ctx.inputs.modifiers.alt)
    return hit && !control(hit) ? kindOf(hit as Exclude<Hit, { kind: 'node' | 'handle' | 'grip' }>).cursor(hit as Exclude<Hit, { kind: 'node' | 'handle' | 'grip' }>, ctx.selection) : 'arrow'
  }
}

export const createSelectTool = () => createTool(selectDefinition)
