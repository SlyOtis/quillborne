import { describe, it, expect } from 'vitest'
import type { BedEdge, CaseworkBand, CaseworkEdge, Line, Part, PartRole, Polygon, SofaEdge, SofaOptions, StockKind, TableEdge, TableResult, Transform, Vec2 } from '$lib/nimap'
import {
  COUNTER_BANDS,
  DEFAULT_CLEARANCE,
  STOCK_ITEMS,
  bed,
  bedEdges,
  boxPart,
  blobPart,
  bounds,
  casework,
  caseworkEdges,
  chain,
  cylinderPart,
  desk,
  distanceToSegment,
  ellipseEdges,
  lineChords,
  partsExtent,
  placeItem,
  placementParts,
  planting,
  plantingSpots,
  pottedPlant,
  PLANT_KINDS,
  PLANT_SPACING,
  pointInPolygon,
  polygonArea,
  polygonEdges,
  prismPart,
  scaling,
  signedArea,
  sofa,
  sofaEdges,
  seatLine,
  table,
  transformParts,
  translation,
  tipping,
  turning,
  unitMesh,
  partMesh,
  partVertices
} from '$lib/nimap'
import { offset } from '$lib/nimap/geometry/clip'
import { curvedSofaEdges, furnitureGallery } from '../fixtures/furniture-gallery.fixture'
import bushGolden from '../fixtures/bush-golden.json'
import { apart, dot2, floating, frontOf, hullOf, meshOf, nearestOnRing, overlap, screenCentre, seatCentre, toward, unmatchedEdges, volume } from './checks'

const rotate = (p: Vec2, angle: number, about: Vec2 = [0, 0]): Vec2 => {
  const c = Math.cos(angle)
  const s = Math.sin(angle)
  const x = p[0] - about[0]
  const y = p[1] - about[1]
  return [about[0] + c * x - s * y, about[1] + s * x + c * y]
}

/** Edges carried by a rotation and a shift; an affine map carries a Bézier exactly through its handles. */
const moved = <E extends Line>(edges: E[], angle: number, shift: Vec2 = [0, 0]): E[] => {
  const f = (p: Vec2): Vec2 => {
    const r = rotate(p, angle)
    return [r[0] + shift[0], r[1] + shift[1]]
  }
  return edges.map(e => ({ ...e, points: [f(e.points[0]), f(e.points[1])], ...(e.curve ? { curve: [f(e.curve[0]), f(e.curve[1])] as [Vec2, Vec2] } : {}) }))
}

const rectangle = (w: number, d: number): Vec2[] => [[0, 0], [w, 0], [w, d], [0, d]]
const reversedRing = <E extends Line>(edges: E[]): E[] => [...edges].reverse().map(e => ({ ...e, points: [e.points[1], e.points[0]], ...(e.curve ? { curve: [e.curve[1], e.curve[0]] as [Vec2, Vec2] } : {}) }))
const L_SHAPE: Vec2[] = [[0, 0], [2, 0], [2, 0.8], [0.8, 0.8], [0.8, 2], [0, 2]]
const U_SHAPE: Vec2[] = [[0, 0], [2.8, 0], [2.8, 2], [2, 2], [2, 0.8], [0.8, 0.8], [0.8, 2], [0, 2]]
/** Two legs 0.8 m thick meeting in a 36° notch at the origin: sharp enough that a mitre there would reach far past a back's depth. */
const V_SHAPE: Vec2[] = (() => {
  const s = Math.sin(Math.PI / 10)
  const c = Math.cos(Math.PI / 10)
  return [[0, -0.8 / s], [1.6 * s + 0.8 * c, 1.6 * c - 0.8 * s], [1.6 * s, 1.6 * c], [0, 0], [-1.6 * s, 1.6 * c], [-1.6 * s - 0.8 * c, 1.6 * c - 0.8 * s]]
})()

const chairWidth = (kind: StockKind) => {
  const { min, max } = partsExtent(STOCK_ITEMS[kind].parts)
  return max[0] - min[0]
}

/**
 * Every promise a table makes, whatever its outline: the top at its
 * height, the table holding together, standing on the floor when it has
 * supports and with every support inside the outline, chairs holding
 * together, clear of the table and of each other, and every chair with a
 * back facing the table.
 */
function checkTable(result: TableResult, height: number, label: string) {
  const top: Polygon = { outer: result.outline, holes: [] }
  const own = result.parts
  expect(partsExtent(own).max[2], `${label}: top height`).toBeCloseTo(height, 9)
  expect(apart(own), `${label}: table parts apart`).toEqual([])
  if (own.some(p => p.role === 'support')) expect(floating(own), `${label}: table parts in the air`).toEqual([])
  for (const support of own.filter(p => p.role === 'support')) {
    const hull = hullOf([support])
    for (const p of hull.outer) expect(pointInPolygon(p, top), `${label}: support at ${p} outside the top`).toBe(true)
  }
  const chairs = result.placements.filter(p => p.elevation === 0).map(p => ({ placement: p, parts: placementParts(p) }))
  chairs.forEach(({ placement, parts }, i) => {
    expect(partsExtent(parts).min[2], `${label}: ${placement.id} on the floor`).toBeCloseTo(0, 9)
    expect(floating(parts), `${label}: ${placement.id} parts in the air`).toEqual([])
    const hull = hullOf(parts)
    expect(overlap(hull, top), `${label}: ${placement.id} inside the table`).toBeLessThan(1e-9)
    for (const other of chairs.slice(0, i)) expect(overlap(hull, hullOf(other.parts)), `${label}: ${placement.id} meets ${other.placement.id}`).toBeLessThan(1e-9)
    const front = frontOf(parts)
    if (!front) return
    const seat = seatCentre(parts)
    expect(dot2(front, toward(seat, nearestOnRing(seat, result.outline))), `${label}: ${placement.id} faces the table`).toBeGreaterThan(0.95)
  })
}

/** Every screen on a desk stands on the top, inside it, clear of the other screens, facing its chair. */
function checkScreens(result: TableResult, height: number, label: string) {
  const top: Polygon = { outer: result.outline, holes: [] }
  const chair = result.placements.find(p => p.kind === 'officeChair')!
  const seat = seatCentre(placementParts(chair))
  const screens = result.placements.filter(p => p.kind === 'monitor').map(p => placementParts(p))
  screens.forEach((parts, i) => {
    expect(partsExtent(parts).min[2], `${label}: screen ${i} on the top`).toBeCloseTo(height, 9)
    for (const p of hullOf(parts).outer) expect(pointInPolygon(p, top), `${label}: screen ${i} off the top`).toBe(true)
    for (const other of screens.slice(0, i)) expect(overlap(hullOf(parts), hullOf(other)), `${label}: screens ${i} meets another`).toBeLessThan(1e-9)
    expect(dot2(frontOf(parts)!, toward(screenCentre(parts), seat)), `${label}: screen ${i} faces its chair`).toBeGreaterThan(0.99)
  })
}

const polygonOf = (part: Part): Polygon => (part.shape as { polygon: Polygon }).polygon
const shoelace = (p: Polygon) => Math.abs(signedArea(p.outer)) - p.holes.reduce((sum, h) => sum + Math.abs(signedArea(h)), 0)

/** Whether a part of the role holds p in the plan; a sofa is made of prisms only. */
const holds = (parts: Part[], role: PartRole, p: Vec2) => parts.some(part => part.role === role && pointInPolygon(p, polygonOf(part)))

const segmentsOf = (points: Vec2[]): [Vec2, Vec2][] => points.slice(1).map((b, i): [Vec2, Vec2] => [points[i], b])
const chordsOf = (edges: Line[]) => edges.flatMap(e => segmentsOf(lineChords(e)))
const distanceTo = (p: Vec2, segments: [Vec2, Vec2][]) => Math.min(Infinity, ...segments.map(([a, b]) => distanceToSegment(p, a, b)))

/** Every part is closed, its triangles fill exactly its outline times its height, and it stays inside `outline`. */
function checkPrisms(parts: Part[], outline: Polygon, label: string) {
  for (const part of parts) {
    const polygon = polygonOf(part)
    const { min, max } = partsExtent([part])
    const mesh = meshOf(part)
    const name = part.role ?? `part at ${min[2].toFixed(2)}`
    expect(unmatchedEdges(mesh), `${label}: ${name} is not closed`).toBe(0)
    expect(volume(mesh), `${label}: ${name} triangles do not fill its outline`).toBeCloseTo(shoelace(polygon) * (max[2] - min[2]), 6)
    expect(shoelace(polygon) - overlap(polygon, outline), `${label}: ${name} reaches outside`).toBeLessThan(1e-5)
  }
}

/**
 * Every promise casework makes, whatever its outline and bands: every part
 * is closed, fills its outline and stays inside the trace, every part is a
 * band's and spans exactly its heights, and each band holds every point
 * within its depth of the back edges that is clear of three insets from
 * the fronts, and no point farther than three depths from the backs or
 * within its inset of the fronts. Three, because a mitre inside a corner
 * reaches up to that far.
 */
function checkCasework(edges: CaseworkEdge[], bands: CaseworkBand[], label: string) {
  const { outline: ring, parts } = casework(edges, { bands })
  const outline: Polygon = { outer: ring, holes: [] }
  checkPrisms(parts, outline, label)
  const spans = (b: CaseworkBand) => (p: Part) => {
    const { min, max } = partsExtent([p])
    return Math.abs(min[2] - b.from) < 1e-9 && Math.abs(max[2] - b.to) < 1e-9
  }
  expect(parts.filter(p => !bands.some(b => spans(b)(p))), `${label}: parts outside every band`).toEqual([])
  const backSegments = chordsOf(edges.filter(e => e.back))
  const frontSegments = chordsOf(edges.filter(e => e.front))
  const rim = segmentsOf([...ring, ring[0]])
  const box = bounds(ring)
  const margin = 2e-3
  for (const b of bands) {
    const own = parts.filter(spans(b))
    const depth = b.depth !== undefined && backSegments.length ? b.depth : Infinity
    const inset = b.inset && frontSegments.length ? b.inset : 0
    for (let x = box.minX; x <= box.maxX; x += 0.04) {
      for (let y = box.minY; y <= box.maxY; y += 0.04) {
        const q: Vec2 = [x, y]
        if (!pointInPolygon(q, outline) || distanceTo(q, rim) < margin) continue
        const toBack = distanceTo(q, backSegments)
        const toFront = distanceTo(q, frontSegments)
        const held = own.some(p => pointInPolygon(q, polygonOf(p)))
        const at = `${x.toFixed(2)}, ${y.toFixed(2)} in the band from ${b.from}`
        if (toBack < depth - margin && toFront > 3 * inset + margin) expect(held, `${label}: missing at ${at}`).toBe(true)
        if (toBack > 3 * depth + margin || toFront < inset - margin) expect(held, `${label}: present at ${at}`).toBe(false)
      }
    }
  }
}

const HEADBOARD_DEPTH = 0.08
const PILLOW_ZONE = 0.5

/**
 * Every promise a bed makes, whatever its outline: it stands on the floor
 * with no part in the air, every part is closed, fills its outline and
 * stays on the bed, the headboard stands at every point within its depth
 * of the head edges and the mattress everywhere else, together covering
 * the bed once, the duvet leaves the head clear for the pillows and covers
 * the rest, and the pillows lie on the mattress near the head, apart.
 */
function checkBed(edges: BedEdge[], label: string) {
  const { outline: ring, parts } = bed(edges)
  const outline: Polygon = { outer: ring, holes: [] }
  expect(partsExtent(parts).min[2], `${label}: on the floor`).toBeCloseTo(0, 9)
  expect(floating(parts), `${label}: parts in the air`).toEqual([])
  checkPrisms(parts.filter(p => p.shape.type === 'prism'), outline, label)
  const headboard = parts.filter(p => p.role === 'back')
  const mattress = parts.filter(p => p.role === 'body')
  const duvet = parts.filter(p => p.role === 'top')
  const pillows = parts.filter(p => p.shape.type === 'box')
  const area = (list: Part[]) => list.reduce((sum, p) => sum + shoelace(polygonOf(p)), 0)
  expect(area(headboard) + area(mattress), `${label}: headboard and mattress cover the bed once`).toBeCloseTo(shoelace(outline), 4)
  const headSegments = chordsOf(edges.filter(e => e.head))
  const top = partsExtent(mattress).max[2]
  for (const [i, pillow] of pillows.entries()) {
    const hull = hullOf([pillow])
    expect(shoelace(hull) - overlap(hull, outline), `${label}: pillow ${i} off the bed`).toBeLessThan(1e-5)
    expect(partsExtent([pillow]).min[2], `${label}: pillow ${i} on the mattress`).toBeCloseTo(top, 9)
    for (const v of hull.outer) expect(distanceTo(v, headSegments), `${label}: pillow ${i} away from the head`).toBeLessThan(PILLOW_ZONE)
    for (const other of pillows.slice(0, i)) expect(overlap(hull, hullOf([other])), `${label}: pillows meet`).toBeLessThan(1e-9)
  }
  const rim = segmentsOf([...ring, ring[0]])
  const box = bounds(ring)
  const margin = 2e-3
  const holds = (list: Part[], q: Vec2) => list.some(p => pointInPolygon(q, polygonOf(p)))
  for (let x = box.minX; x <= box.maxX; x += 0.04) {
    for (let y = box.minY; y <= box.maxY; y += 0.04) {
      const q: Vec2 = [x, y]
      if (!pointInPolygon(q, outline) || distanceTo(q, rim) < margin) continue
      const toHead = distanceTo(q, headSegments)
      const at = `${x.toFixed(2)}, ${y.toFixed(2)}`
      if (toHead < HEADBOARD_DEPTH - margin) expect(holds(headboard, q) && !holds(mattress, q), `${label}: no headboard at ${at}`).toBe(true)
      if (toHead > 3 * HEADBOARD_DEPTH + margin) expect(!holds(headboard, q) && holds(mattress, q), `${label}: no mattress at ${at}`).toBe(true)
      if (toHead < PILLOW_ZONE - margin) expect(holds(duvet, q), `${label}: duvet over the pillows at ${at}`).toBe(false)
      if (toHead > 3 * PILLOW_ZONE + margin) expect(holds(duvet, q), `${label}: no duvet at ${at}`).toBe(true)
    }
  }
}

/**
 * Every promise a sofa makes, whatever its outline: it stands on the floor
 * with no part in the air, nothing reaches outside the outline, the seat
 * covers all of it, the back stands at every point within its depth of the
 * back edges, corners and ends included, an arm or the back at every point
 * within an arm's width of an edge that ends the back, the back is taller
 * than the arms and they never overlap, and the seat is open wherever it
 * is well away from both.
 */
function checkSofa(edges: SofaEdge[], options: SofaOptions & { backDepth: number; armWidth: number }, label: string) {
  const { outline: ring, parts } = sofa(edges, options)
  const outline: Polygon = { outer: ring, holes: [] }
  expect(partsExtent(parts).min[2], `${label}: on the floor`).toBeCloseTo(0, 9)
  expect(floating(parts), `${label}: parts in the air`).toEqual([])
  checkPrisms(parts, outline, label)
  expect(parts.filter(p => p.role === 'seat').reduce((sum, p) => sum + polygonArea(polygonOf(p)), 0), `${label}: seat`).toBeCloseTo(polygonArea(outline), 6)
  const backs = parts.filter(p => p.role === 'back')
  const arms = parts.filter(p => p.role === 'arm')
  for (const arm of arms) for (const back of backs) expect(overlap(polygonOf(arm), polygonOf(back)), `${label}: an arm meets the back`).toBeLessThan(1e-6)
  if (arms.length) expect(partsExtent(backs).max[2], `${label}: the back above the arms`).toBeGreaterThan(partsExtent(arms).max[2])
  const n = edges.length
  const ends = edges.filter((e, i) => options.arms !== false && !e.back && (edges[(i + n - 1) % n].back || edges[(i + 1) % n].back))
  if (!ends.length) expect(arms, `${label}: arms`).toEqual([])
  const backSegments = chordsOf(edges.filter(e => e.back))
  const armSegments = chordsOf(ends)
  const rim = segmentsOf([...ring, ring[0]])
  const box = bounds(ring)
  const margin = 2e-3
  for (let x = box.minX; x <= box.maxX; x += 0.04) {
    for (let y = box.minY; y <= box.maxY; y += 0.04) {
      const q: Vec2 = [x, y]
      if (!pointInPolygon(q, outline) || distanceTo(q, rim) < margin) continue
      const toBack = distanceTo(q, backSegments)
      const toArm = distanceTo(q, armSegments)
      const at = `${x.toFixed(2)}, ${y.toFixed(2)}`
      if (toBack < options.backDepth - margin) expect(holds(parts, 'back', q), `${label}: no back at ${at}`).toBe(true)
      else if (toArm < options.armWidth - margin) expect(holds(parts, 'arm', q) || holds(parts, 'back', q), `${label}: no arm at ${at}`).toBe(true)
      if (toBack > 3 * options.backDepth && toArm > 3 * options.armWidth) expect(holds(parts, 'back', q) || holds(parts, 'arm', q), `${label}: the seat is closed at ${at}`).toBe(false)
    }
  }
}

/**
 * The same structure with every number equal to within a billionth: what a
 * golden record promises. Maths functions may round their last digit
 * differently from one system to another, so exact equality would test the
 * machine, not the shape.
 */
function expectSameShape(actual: unknown, expected: unknown, at: string): void {
  if (typeof expected === 'number') return void expect(Math.abs((actual as number) - expected), at).toBeLessThan(1e-9)
  if (Array.isArray(expected)) {
    expect(Array.isArray(actual) && actual.length, at).toBe(expected.length)
    return expected.forEach((e, i) => expectSameShape((actual as unknown[])[i], e, `${at}[${i}]`))
  }
  if (expected && typeof expected === 'object') {
    expect(Object.keys(actual as object).sort(), at).toEqual(Object.keys(expected).sort())
    return Object.entries(expected).forEach(([k, e]) => expectSameShape((actual as Record<string, unknown>)[k], e, `${at}.${k}`))
  }
  expect(actual, at).toEqual(expected)
}

describe('parts', () => {
  const transforms: Transform[] = [translation(0, 0, 0), chain(translation(1, -2, 0.5), turning(0.7)), chain(turning(2.2), scaling(1.5, 0.5, 2)), scaling(-1, 1, 1), chain(translation(3, 1, 0), scaling(1, -2, 0.5), turning(1))]
  const det = (t: Transform) => t[0] * (t[4] * t[8] - t[7] * t[5]) - t[3] * (t[1] * t[8] - t[7] * t[2]) + t[6] * (t[1] * t[5] - t[4] * t[2])
  const ngon = (r: number, n: number) => (n / 2) * r * r * Math.sin((2 * Math.PI) / n)
  const icosahedronVolume = (r: number) => {
    const a = (4 * r) / Math.sqrt(10 + 2 * Math.sqrt(5))
    return (5 / 12) * (3 + Math.sqrt(5)) * a ** 3
  }
  const withHole: Polygon = { outer: [[0, 0], [2, 0], [2, 1.5], [0, 1.5]], holes: [[[0.5, 0.5], [1, 0.5], [1, 1], [0.5, 1]]] }
  const shapes: [Part, number][] = [
    [boxPart([0.4, 0.7, 1.1], 'furniture'), 0.4 * 0.7 * 1.1],
    [cylinderPart(0.3, 0.8, 'pot', [0, 0, 0], { segments: 12 }), ngon(0.3, 12) * 0.8],
    [cylinderPart(0.14, 0.3, 'pot', [0, 0, 0], { top: 0.18, segments: 14 }), (0.3 / 3) * (ngon(0.14, 14) + ngon(0.18, 14) + Math.sqrt(ngon(0.14, 14) * ngon(0.18, 14)))],
    [prismPart(withHole, 0, 0.5, 'tableTop'), (3 - 0.25) * 0.5],
    [prismPart({ outer: [...withHole.outer].reverse(), holes: [[...withHole.holes[0]].reverse()] }, 0, 0.5, 'tableTop'), (3 - 0.25) * 0.5],
    ...[1.5, 0.6].map((top): [Part, number] => [{ ...prismPart(withHole, 0, 0.5, 'tableTop'), shape: { type: 'prism', polygon: withHole, height: 0.5, top } }, (0.5 / 3) * (3 - 0.25) * (1 + top + top * top)]),
    [blobPart(0.3, 'plant', [0, 0, 0]), icosahedronVolume(0.3)],
    [cylinderPart(0.05, 0.4, 'plant', [0, 0, 0], { top: 0, segments: 3 }), (0.4 / 3) * ngon(0.05, 3)],
    [{ ...cylinderPart(0.05, 0.4, 'plant', [0, 0, 0], { top: 0, segments: 3 }), transform: chain(translation(0.2, 0, 0), turning(1), tipping(0.6), scaling(0.4, 1, 1)) }, (0.4 / 3) * ngon(0.05, 3) * 0.4]
  ]

  it('every part is a closed surface facing outward, and its volume is the shape’s, under any transform, mirrors included', () => {
    for (const [part, expected] of shapes) {
      for (const t of transforms) {
        const [placed] = transformParts([part], t)
        const mesh = meshOf(placed)
        expect(unmatchedEdges(mesh), `${part.shape.type}`).toBe(0)
        expect(volume(mesh), `${part.shape.type}`).toBeCloseTo(expected * Math.abs(det(t)), 9)
      }
    }
  })

  it('shapes that differ only in size share one mesh, shapes that differ in anything else never do, and each keeps its own volume', () => {
    const forms: { form: string; part: Part; volume: number }[] = []
    for (const [w, d, h] of [[0.4, 0.7, 1.1], [2, 0.1, 0.3]]) forms.push({ form: 'box', part: boxPart([w, d, h], 'furniture'), volume: w * d * h })
    for (const segments of [3, 6, 12, 20]) {
      for (const taper of [0, 0.5, 1, 1.3]) {
        for (const [radius, height] of [[0.1, 0.4], [0.7, 0.05]]) {
          const top = radius * taper
          const [a, b] = [ngon(radius, segments), ngon(top, segments)]
          forms.push({ form: `cylinder ${segments} ${taper}`, part: cylinderPart(radius, height, 'pot', [0, 0, 0], { top, segments }), volume: (height / 3) * (a + b + Math.sqrt(a * b)) })
        }
      }
    }
    for (const radius of [0.3, 0.05]) forms.push({ form: 'blob', part: blobPart(radius, 'plant', [0, 0, 0]), volume: icosahedronVolume(radius) })
    const prism = prismPart(withHole, 0, 0.5, 'tableTop')
    forms.push({ form: 'this prism', part: prism, volume: (3 - 0.25) * 0.5 }, { form: 'this prism', part: { ...prism, transform: translation(1, 1, 0) }, volume: (3 - 0.25) * 0.5 })
    forms.push({ form: 'another prism', part: prismPart({ outer: [[0, 0], [1, 0], [0, 1]], holes: [] }, 0, 0.5, 'tableTop'), volume: 0.25 })
    for (const a of forms) {
      expect(volume(meshOf(a.part)), a.form).toBeCloseTo(a.volume, 9)
      for (const b of forms) expect(unitMesh(a.part.shape).mesh === unitMesh(b.part.shape).mesh, `${a.form} and ${b.form}`).toBe(a.form === b.form)
    }
  })

  it('a part’s corners are the corners of its triangles, each once', () => {
    for (const [part] of shapes) {
      for (const t of transforms) {
        const [placed] = transformParts([part], t)
        const { positions } = partMesh(placed)
        const corners = new Set(Array.from({ length: positions.length / 3 }, (_, i) => positions.slice(3 * i, 3 * i + 3).join()))
        const listed = partVertices(placed).map(v => v.join())
        expect(listed.length, part.shape.type).toBe(corners.size)
        expect(new Set(listed), part.shape.type).toEqual(corners)
      }
    }
  })

  it('normals are unit length and point out of the solid', () => {
    for (const [part] of shapes) {
      for (const t of transforms) {
        const [placed] = transformParts([part], t)
        const { positions, normals } = meshOf(placed)
        const centre = [0, 1, 2].map(k => positions.filter((_, i) => i % 3 === k).reduce((sum, v) => sum + v, 0) / (positions.length / 3))
        for (let i = 0; i < positions.length; i += 9) {
          const face = [0, 1, 2].map(k => (positions[i + k] + positions[i + 3 + k] + positions[i + 6 + k]) / 3)
          for (let j = 0; j < 3; j++) {
            const n = [normals[i + j * 3], normals[i + j * 3 + 1], normals[i + j * 3 + 2]]
            expect(Math.hypot(...n)).toBeCloseTo(1, 9)
            if (part.shape.type !== 'prism') expect(n[0] * (face[0] - centre[0]) + n[1] * (face[1] - centre[1]) + n[2] * (face[2] - centre[2])).toBeGreaterThan(0)
          }
        }
      }
    }
  })
})

describe('stock items', () => {
  const kinds = Object.keys(STOCK_ITEMS) as StockKind[]

  it('stand on their surface or hang on the wall, with no part in the air', () => {
    for (const kind of kinds) {
      const item = STOCK_ITEMS[kind]
      const { min } = partsExtent(item.parts)
      expect(min[2], kind).toBeCloseTo(0, 9)
      if (item.mount === 'wall') expect(min[1], kind).toBeCloseTo(0, 9)
      const rests = item.mount === 'wall' ? (m: number[]) => Math.abs(m[1]) < 1e-6 : undefined
      expect(floating(item.parts, rests), kind).toEqual([])
    }
  })

  it('all face +y in their own frame, measured from their geometry', () => {
    for (const kind of kinds) {
      const front = frontOf(STOCK_ITEMS[kind].parts)
      if (kind === 'stool') {
        expect(front).toBeNull()
        continue
      }
      expect(front, kind).not.toBeNull()
      expect(dot2(front!, [0, 1]), kind).toBeGreaterThan(0.999)
    }
  })

  it('placed facing any direction, face exactly that direction, lifted by the given height', () => {
    for (const kind of kinds.filter(k => k !== 'stool')) {
      for (let i = 0; i < 24; i++) {
        const d: Vec2 = [Math.cos((i * Math.PI) / 12 + 0.1), Math.sin((i * Math.PI) / 12 + 0.1)]
        const parts = placeItem(kind, [3, -2], d, 0.74)
        expect(dot2(frontOf(parts)!, d), `${kind} toward ${i * 15}°`).toBeGreaterThan(0.999999)
        expect(partsExtent(parts).min[2]).toBeCloseTo(0.74 + partsExtent(STOCK_ITEMS[kind].parts).min[2], 9)
      }
    }
  })
})

describe('plants', () => {
  it('the bush grows exactly as it did when it was chosen, for the seeds and sizes the demo and gallery use', () => {
    for (const { seed, size, parts } of bushGolden as { seed: number; size: number; parts: unknown }[]) expectSameShape(JSON.parse(JSON.stringify(pottedPlant(seed, { kind: 'bush', size }))), parts, `seed ${seed} size ${size}`)
  })

  it('planting fills a surface: every blob in the soil stands on it, and every other grows out of one', () => {
    const surfaces: Polygon[] = [
      { outer: rectangle(2.4, 0.4), holes: [] },
      { outer: L_SHAPE, holes: [] },
      { outer: Array.from({ length: 40 }, (_, i): Vec2 => [0.6 * Math.cos((i * Math.PI) / 20), 0.6 * Math.sin((i * Math.PI) / 20)]), holes: [] },
      { outer: rectangle(0.12, 0.12), holes: [] }
    ]
    for (const surface of surfaces) {
      for (let seed = 1; seed <= 10; seed++) {
        const parts = planting(surface, 0.8, seed)
        expect(parts.length).toBeGreaterThan(0)
        expect(floating(parts, m => m[2] < 0.8)).toEqual([])
        for (const blob of parts) {
          const { min, max } = partsExtent([blob])
          const centre: Vec2 = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2]
          if (min[2] < 0.8) expect(pointInPolygon(centre, surface), 'a blob in the soil stands on the surface').toBe(true)
        }
      }
    }
  })
})

describe('planting', () => {
  const surfaces: [string, Polygon][] = [
    ['run', { outer: rectangle(0.4, 1.4), holes: [] }],
    ['planter', { outer: rectangle(2.4, 0.45), holes: [] }],
    ['L', { outer: L_SHAPE, holes: [] }],
    ['round', { outer: Array.from({ length: 40 }, (_, i): Vec2 => [0.6 * Math.cos((i * Math.PI) / 20), 0.6 * Math.sin((i * Math.PI) / 20)]), holes: [] }]
  ]

  it('stands its plants evenly at any size and density: every spot a little inside lies within its kind’s spacing of a plant', { timeout: 30_000 }, () => {
    for (const kind of PLANT_KINDS) {
      for (const [name, surface] of surfaces) {
        const inside = offset([surface.outer], -0.05).map((outer): Polygon => ({ outer, holes: [] }))
        const box = partsExtent([prismPart(surface, 0, 1, 'pot')])
        for (let seed = 1; seed <= 6; seed++) {
          const size = [0.6, 1, 1.4][seed % 3]
          const density = [1, 0.6][seed % 2]
          const spots = plantingSpots(surface, seed, { kind, size, density })
          for (let x = box.min[0]; x <= box.max[0]; x += 0.03) {
            for (let y = box.min[1]; y <= box.max[1]; y += 0.03) {
              if (!inside.some(p => pointInPolygon([x, y], p))) continue
              expect(spots.some(s => Math.hypot(x - s.at[0], y - s.at[1]) <= (s.radius * PLANT_SPACING[kind]) / density), `${kind} ${name} seed ${seed}: gap at ${x.toFixed(2)}, ${y.toFixed(2)}`).toBe(true)
            }
          }
        }
      }
    }
  })

  it('every kind grows from the soil with no part in the air, the same for the same seed, pebbles only when asked', () => {
    for (const kind of PLANT_KINDS) {
      for (const [name, surface] of surfaces) {
        for (const pebbles of [false, true]) {
          const parts = planting(surface, 0.8, 3, { kind, pebbles })
          expect(parts.length, `${kind} ${name}`).toBeGreaterThan(0)
          expect(floating(parts, m => m[2] < 0.8), `${kind} ${name}${pebbles ? ' with pebbles' : ''}`).toEqual([])
          expect(parts.some(p => p.material === 'pebble'), `${kind} ${name}`).toBe(pebbles)
          expect(planting(surface, 0.8, 3, { kind, pebbles })).toEqual(parts)
        }
      }
      const potted = pottedPlant(4, { kind })
      expect(partsExtent(potted).min[2], kind).toBeCloseTo(0, 9)
      expect(floating(potted), `${kind} in a pot`).toEqual([])
    }
  })
})

describe('tables', () => {
  const outlines: [string, TableEdge[]][] = []
  for (const [w, d] of [[0.5, 0.5], [0.7, 0.7], [1.2, 0.8], [1.6, 0.9], [2.2, 1.0], [3.4, 1.2]]) {
    for (const seating of [undefined, [0, 2], [0], []]) {
      for (const angle of [0, 0.3, Math.PI / 2, 2.1]) {
        const edges = moved(polygonEdges(rectangle(w, d), seating), angle, [5, -3])
        outlines.push([`${w}×${d} seats ${seating ?? 'all'} at ${angle}`, edges], [`${w}×${d} seats ${seating ?? 'all'} at ${angle}, clockwise`, reversedRing(edges)])
      }
    }
  }
  for (const [a, b] of [[[0, 0], [1.2, 1.2]], [[0, 0], [2.4, 1.2]], [[0, 0], [1.6, 0.9]], [[0, 0], [0.7, 0.7]]] as [Vec2, Vec2][]) {
    for (const angle of [0, 0.8]) outlines.push([`ellipse ${b} at ${angle}`, moved(ellipseEdges(a, b), angle)], [`ellipse ${b} at ${angle}, clockwise`, reversedRing(moved(ellipseEdges(a, b), angle))])
  }
  for (const angle of [0, 1.1]) {
    outlines.push([`L at ${angle}`, moved(polygonEdges(L_SHAPE), angle)], [`L outer edges at ${angle}`, moved(polygonEdges(L_SHAPE, [0, 1, 4, 5]), angle)])
  }

  it('keep every promise over rectangles, ellipses and an L, in any orientation and winding, with any chair', () => {
    for (const chair of ['meetingChair', 'officeChair', 'stool'] as StockKind[]) {
      for (const [label, edges] of outlines) {
        const height = chair === 'stool' ? 1.05 : 0.74
        checkTable(table(edges, { chair, height }), height, `${chair} ${label}`)
      }
    }
  })

  it('keep every promise on any supports', () => {
    for (const supports of ['none', 'auto', 'legs', 'panels'] as const) {
      for (const [label, edges] of outlines) checkTable(table(edges, { supports }), 0.74, `${supports} ${label}`)
    }
  })

  it('seat as many chairs along a straight edge as fit side by side with the gap between them, one if only one fits', () => {
    for (const chair of ['meetingChair', 'officeChair'] as StockKind[]) {
      const width = chairWidth(chair)
      for (let w = 0.3; w <= 4; w += 0.1) {
        const result = table(polygonEdges(rectangle(w, 0.9), [0]), { chair })
        const expected = w >= width ? Math.max(1, Math.floor(w / (width + 0.2) + 1e-9)) : 0
        expect(result.placements.length, `${chair} along ${w.toFixed(1)} m`).toBe(expected)
      }
    }
  })

  it('every chair stands on the track and every run is evenly spaced, over notches, bends, curves and corners, at any gap, count and turn; none is left out from a gap of -15 cm up', () => {
    const curve = (id: string, a: Vec2, c1: Vec2, c2: Vec2, b: Vec2): TableEdge => ({ id, points: [a, b], curve: [c1, c2], seating: true })
    const line = (id: string, a: Vec2, b: Vec2): TableEdge => ({ id, points: [a, b], seating: true })
    const shapes: [string, TableEdge[]][] = [
      ['arch', [line('a', [0, 0], [0, -4.43]), line('b', [0, -4.43], [1.25, -5.43]), curve('c', [1.25, -5.43], [1.6, -3.5], [3.3, -3.6], [4.17, -4.43]), line('d', [4.17, -4.43], [5.69, -4.43]), line('e', [5.69, -4.43], [5.69, 0]), line('f', [5.69, 0], [0, 0])]],
      ['triangle notch', [line('a', [0, 0], [0, -2]), line('b', [0, -2], [1.2, -2]), line('c', [1.2, -2], [1.8, -1]), line('d', [1.8, -1], [2.4, -2]), line('e', [2.4, -2], [3.6, -2]), line('f', [3.6, -2], [3.6, 0]), line('g', [3.6, 0], [0, 0])]],
      ['square notch', polygonEdges([[0, 0], [3, 0], [3, 2], [2, 2], [2, 1], [1, 1], [1, 2], [0, 2]])],
      ['kidney', [curve('a', [0, 0], [0.8, -0.6], [2.2, -0.6], [3, 0]), curve('b', [3, 0], [3.9, 0.6], [3.2, 1.9], [2.2, 1.4]), curve('c', [2.2, 1.4], [1.8, 1.15], [1.2, 1.15], [0.8, 1.4]), curve('d', [0.8, 1.4], [-0.2, 1.9], [-0.9, 0.6], [0, 0])]],
      ['L', polygonEdges([[0, 0], [3, 0], [3, 1], [1, 1], [1, 2.5], [0, 2.5]])],
      ['rectangle', polygonEdges([[0, 0], [2.2, 0], [2.2, 1], [0, 1]])],
      ['ellipse', ellipseEdges([0, 0], [2.4, 1.2])],
      ['round 0.9', ellipseEdges([0, 0], [0.9, 0.9])],
      ['round 2.5', ellipseEdges([0, 0], [2.5, 2.5])]
    ]
    const toTrack = (r: TableResult, p: Vec2) => Math.min(...r.track.pieces.map(piece => piece.points.slice(1).reduce((best, q, i) => Math.min(best, distanceToSegment(p, piece.points[i], q)), Infinity)))
    for (const [name, edges] of shapes) {
      for (const clearance of [-0.15, 0, 0.08, 0.3, 0.6]) {
        for (const seats of [undefined, 3, 7]) {
          for (let k = 0; k < 10; k++) {
            const turn = k / 10
            const at = `${name}, gap ${clearance}, ${seats ?? 'all'} seats, turn ${turn}`
            const r = table(edges, { clearance, seats, turn })
            expect(r.leftOut.chairs, at).toBe(0)
            for (const p of r.placements) expect(toTrack(r, p.at), `${at}: ${p.id}`).toBeLessThan(1e-3)
            const seat = seatLine(r.track)
            for (const run of r.track.runs) {
              if (!run.spacing) continue
              const along = r.placements.map(p => (((seat.fromLoop(p.round!.loop) - run.from) % seat.length) + seat.length) % seat.length).filter(u => u > 1e-7 && u <= run.length + 1e-7).sort((a, b) => a - b)
              for (let i = 1; i < along.length; i++) expect(along[i] - along[i - 1], at).toBeCloseTo(run.spacing, 4)
            }
          }
        }
      }
    }
  }, 30000)

  it('seat as many chairs round a closed curve as fit along their fronts, the edge moved out by the clearance', () => {
    const width = chairWidth('meetingChair')
    for (let r = 0.3; r <= 1.5; r += 0.05) {
      const perimeter = 2 * Math.PI * (r + DEFAULT_CLEARANCE)
      const fraction = perimeter / (width + 0.2)
      if (Math.abs(fraction - Math.round(fraction)) < 0.02) continue
      const result = table(ellipseEdges([-r, -r], [r, r]))
      expect(result.placements.length, `r ${r.toFixed(2)}`).toBe(Math.floor(fraction))
    }
  })

  it('a requested count goes to the edges with the most length per chair, and never more than fit', () => {
    const edges = polygonEdges(rectangle(2.2, 1.0))
    const perEdge = (seats: number) => [0, 1, 2, 3].map(i => table(edges, { seats }).placements.filter(p => p.id.startsWith(`e${i}:`)).length)
    expect(perEdge(1)).toEqual([1, 0, 0, 0])
    expect(perEdge(2)).toEqual([1, 0, 1, 0])
    expect(perEdge(4)).toEqual([2, 0, 2, 0])
    expect(perEdge(6)).toEqual([2, 1, 2, 1])
    expect(perEdge(8)).toEqual([3, 1, 3, 1])
    const tooMany = table(edges, { seats: 12 })
    expect(tooMany.placements.length).toBe(8)
    expect(tooMany.warnings.length).toBe(1)
  })

  it('stand on a pedestal by default, two under a top longer than 1.8 m; asked for, on panels at the ends of their seating or a pedestal when there are none, on legs, or on nothing', () => {
    const supports = (result: TableResult) => result.parts.filter(p => p.role === 'support').length
    const auto = { supports: 'auto' as const }
    const pedestal = 2
    expect(supports(table(polygonEdges(rectangle(2.2, 1.0), [0, 2])))).toBe(2 * pedestal)
    expect(supports(table(polygonEdges(rectangle(1.8, 1.0), [0, 2])))).toBe(pedestal)
    for (const edges of [polygonEdges(rectangle(1.4, 1.4)), ellipseEdges([0, 0], [1.2, 1.2])]) expect(supports(table(edges))).toBe(pedestal)
    expect(supports(table(polygonEdges(L_SHAPE)))).toBe(2 * pedestal)
    expect(supports(desk(polygonEdges(rectangle(1.4, 0.7), [0])))).toBe(pedestal)
    expect(supports(table(polygonEdges(rectangle(2.2, 1.0), [0, 2]), { supports: 'none' }))).toBe(0)
    expect(supports(table(polygonEdges(rectangle(2.2, 1.0), [0, 2]), auto))).toBe(2)
    expect(supports(table(polygonEdges(rectangle(2.2, 1.0), [0]), auto))).toBe(2)
    expect(supports(table(polygonEdges(rectangle(1.4, 1.4)), auto))).toBe(pedestal)
    expect(supports(table(polygonEdges(rectangle(1.4, 1.4), []), auto))).toBe(pedestal)
    expect(supports(table(ellipseEdges([0, 0], [1.2, 1.2]), auto))).toBe(pedestal)
    expect(supports(table(polygonEdges(L_SHAPE), auto))).toBe(2 * pedestal)
    expect(table(polygonEdges(rectangle(1.4, 1.4)), { supports: 'legs' }).parts.filter(p => p.shape.type === 'cylinder').length).toBe(4)
    for (const front of [0, 1, 2, 3]) {
      const d = desk(polygonEdges(rectangle(1.4, 0.7), [front]), auto)
      const panels = d.parts.filter(p => p.role === 'support')
      expect(panels.length, `desk front ${front}`).toBe(2)
      const [a, b] = polygonEdges(rectangle(1.4, 0.7))[(front + 2) % 4].points
      for (const panel of panels) {
        const { min, max } = partsExtent([panel])
        expect(distanceToSegment([(min[0] + max[0]) / 2, (min[1] + max[1]) / 2], a, b), `desk front ${front}: a panel along the back`).toBeGreaterThan(0.2)
      }
    }
  })
})

describe('desks', () => {
  it('seat one person at the middle of the front edge, with each screen on the top facing them, in any orientation', () => {
    for (const [w, d] of [[1.0, 0.6], [1.2, 0.7], [1.4, 0.7], [1.6, 0.8], [1.8, 0.8]]) {
      for (const front of [0, 1, 2, 3]) {
        for (const angle of [0, 0.5, Math.PI, 4]) {
          for (const monitors of [0, 1, 2]) {
            const label = `${w}×${d} front ${front} at ${angle} with ${monitors}`
            const edges = moved(polygonEdges(rectangle(w, d), [front]), angle, [2, 1])
            const result = desk(edges, { monitors })
            checkTable(result, 0.74, label)
            checkScreens(result, 0.74, label)
            const chairs = result.placements.filter(p => p.kind === 'officeChair')
            expect(chairs.length, label).toBe(1)
            const edge = edges[front]
            const middle: Vec2 = [(edge.points[0][0] + edge.points[1][0]) / 2, (edge.points[0][1] + edge.points[1][1]) / 2]
            const seat = seatCentre(placementParts(chairs[0]))
            const along = toward(edge.points[0], edge.points[1])
            expect(Math.abs(dot2([seat[0] - middle[0], seat[1] - middle[1]], along)), label).toBeLessThan(1e-9)
            const screens = result.placements.filter(p => p.kind === 'monitor').length
            expect(screens + result.warnings.filter(m => m.startsWith('Monitor')).length, label).toBe(monitors)
            const edgeLength = Math.hypot(edge.points[1][0] - edge.points[0][0], edge.points[1][1] - edge.points[0][1])
            if (monitors * 0.56 + 0.1 <= edgeLength) expect(screens, `${label}: every monitor that fits side by side is placed`).toBe(monitors)
          }
        }
      }
    }
  })

  it('back to back, each person sits outside both desks and each screen faces its own person', () => {
    for (const angle of [0, 0.9, 2.5]) {
      const a = desk(moved(polygonEdges(rectangle(1.4, 0.7), [0], 'a'), angle), { monitors: 2 })
      const b = desk(moved(polygonEdges([[0, 0.7], [1.4, 0.7], [1.4, 1.4], [0, 1.4]], [2], 'b'), angle), { monitors: 2 })
      for (const [own, other] of [[a, b], [b, a]]) {
        expect(own.placements.filter(p => p.kind === 'monitor').length, `bench at ${angle}`).toBe(2)
        checkScreens(own, 0.74, `bench at ${angle}`)
        const chair = placementParts(own.placements.find(p => p.kind === 'officeChair')!)
        expect(overlap(hullOf(chair), { outer: other.outline, holes: [] })).toBeLessThan(1e-9)
      }
    }
  })
})

describe('sofas', () => {
  const outlines: [string, SofaEdge[]][] = [
    ['sofa', sofaEdges(rectangle(2.2, 0.85), [2])],
    ['armchair', sofaEdges(rectangle(0.85, 0.85), [2])],
    ['flared', sofaEdges([[-0.3, 0], [2.3, 0], [2, 0.85], [0, 0.85]], [2])],
    ['tapered', sofaEdges([[0, 0], [2, 0], [2.3, 0.85], [-0.3, 0.85]], [2])],
    ['L, back outside', sofaEdges(L_SHAPE, [0, 5])],
    ['L, back inside', sofaEdges(L_SHAPE, [2, 3])],
    ['U', sofaEdges(U_SHAPE, [0, 1, 7])],
    ['V, back in the notch', sofaEdges(V_SHAPE, [2, 3])],
    ['curved', curvedSofaEdges(1.5, 0.7)],
    ['round, back all round', ellipseEdges([-0.8, -0.8], [0.8, 0.8]).map(e => ({ ...e, back: true }))],
    ['bench', sofaEdges(rectangle(1.6, 0.5), [])]
  ]
  const variants = [
    { backDepth: 0.16, armWidth: 0.14 },
    { backDepth: 0.25, armWidth: 0.1, arms: false }
  ]

  for (const [i, options] of variants.entries()) {
    it(`keep every promise over straight, flared, L, U, V, curved and round outlines, in any orientation and winding (${i ? 'deep back, no arms' : 'as they come'})`, () => {
      for (const [name, edges] of outlines) {
        for (const angle of [0, 0.7, 2.3]) {
          const placed = moved(edges, angle, [5, -3])
          checkSofa(placed, options, `${name} at ${angle}`)
          checkSofa(reversedRing(placed), options, `${name} at ${angle}, clockwise`)
        }
      }
    })
  }

  it('a straight sofa faces away from its back', () => {
    for (const [w, d] of [[2.2, 0.85], [0.85, 0.85], [1.6, 1]]) {
      for (const back of [0, 1, 2, 3]) {
        for (const angle of [0, 0.7, 2.3, 4]) {
          const edges = moved(sofaEdges(rectangle(w, d), [back]), angle, [2, 1])
          const along = toward(...edges[back].points)
          expect(dot2(frontOf(sofa(edges).parts)!, [-along[1], along[0]]), `${w}×${d} back ${back} at ${angle}`).toBeGreaterThan(0.999)
        }
      }
    }
  })
})

describe('beds', () => {
  const outlines: [string, BedEdge[]][] = [
    ['single', bedEdges(rectangle(0.9, 2), [2])],
    ['double', bedEdges(rectangle(1.6, 2.05), [2])],
    ['king', bedEdges(rectangle(1.8, 2.1), [2])],
    ['tapering', bedEdges([[0.1, 0], [1.3, 0], [1.4, 2], [0, 2]], [2])],
    ['round, head on a quarter', ellipseEdges([-1.1, -1.1], [1.1, 1.1]).map((e, i) => ({ ...e, head: i === 1 }))],
    ['daybed, no head', bedEdges(rectangle(0.9, 2), [])]
  ]

  it('keep every promise over straight, tapering and round outlines, in any orientation and winding', () => {
    for (const [name, edges] of outlines) {
      for (const angle of [0, 0.7, 2.3]) {
        const placed = moved(edges, angle, [5, -3])
        checkBed(placed, `${name} at ${angle}`)
        checkBed(reversedRing(placed), `${name} at ${angle}, clockwise`)
      }
    }
  })

  it('a bed with a head gets pillows, one for each 75 cm of head, and faces away from its head', () => {
    for (const [w, pillows] of [[0.9, 1], [1.2, 1], [1.6, 2], [1.8, 2], [2.4, 3]]) {
      for (const angle of [0, 0.7, 2.3, 4]) {
        const edges = moved(bedEdges(rectangle(w, 2.05), [2]), angle, [2, 1])
        const { parts } = bed(edges)
        expect(parts.filter(p => p.shape.type === 'box').length, `${w} at ${angle}`).toBe(pillows)
        const along = toward(...edges[2].points)
        expect(dot2(frontOf(parts)!, [-along[1], along[0]]), `${w} at ${angle}`).toBeGreaterThan(0.999)
      }
    }
  })
})

describe('casework', () => {
  const outlines: [string, CaseworkEdge[]][] = [
    ['run', caseworkEdges(rectangle(2.4, 0.62), { front: [0], back: [2] })],
    ['run deeper in one place', caseworkEdges([[0, 0], [1.6, 0], [1.6, -0.1], [2.4, -0.1], [2.4, 0.62], [0, 0.62]], { front: [0, 1, 2], back: [4] })],
    ['L', caseworkEdges([[0, 0], [2.4, 0], [2.4, 2], [1.78, 2], [1.78, 0.62], [0, 0.62]], { front: [3, 4], back: [0, 1] })],
    ['U', caseworkEdges(U_SHAPE, { front: [3, 4, 5], back: [0, 1, 7] })],
    ['island', caseworkEdges(rectangle(2, 0.9), { front: [0, 2] })],
    ['curved', curvedSofaEdges(1.5, 0.8).map(e => ({ ...e, front: e.id.startsWith('i') }))],
    ['box', caseworkEdges(rectangle(0.5, 0.5), {})]
  ]
  const bandSets: [string, CaseworkBand[]][] = [
    ['counter', COUNTER_BANDS],
    ['kitchen', [...COUNTER_BANDS, { from: 1.45, to: 2.15, depth: 0.34 }]],
    [
      'reception',
      [
        { from: 0, to: 0.1, inset: 0.06, material: 'furnitureDark' },
        { from: 0.1, to: 0.72 },
        { from: 0.72, to: 0.75, material: 'tableTop' },
        { from: 0.75, to: 1.05, depth: 0.25 },
        { from: 1.05, to: 1.08, depth: 0.3, material: 'tableTop' }
      ]
    ],
    [
      'depth and inset together',
      [
        { from: 0, to: 0.5, inset: 0.2 },
        { from: 0.5, to: 1, depth: 0.2, inset: 0.05 }
      ]
    ]
  ]

  for (const [setName, bands] of bandSets) {
    it(`keep every promise over runs, an L, a U, an island, a curve and a box, in any orientation and winding (${setName})`, () => {
      for (const [name, edges] of outlines) {
        for (const angle of [0, 0.7, 2.3]) {
          const placed = moved(edges, angle, [5, -3])
          checkCasework(placed, bands, `${name} at ${angle}`)
          checkCasework(reversedRing(placed), bands, `${name} at ${angle}, clockwise`)
        }
      }
    })
  }

  it('refuse a band that does not end above where it starts', () => {
    expect(() => casework(caseworkEdges(rectangle(1, 0.6), {}), { bands: [{ from: 0.9, to: 0.9 }] })).toThrow()
  })
})

describe('gallery', () => {
  it('every exhibit stands on the floor with no part in the air', () => {
    for (const exhibit of furnitureGallery()) expect(floating(exhibit.parts), exhibit.name).toEqual([])
  })
})
