import type { Vec2 } from '../geometry/vector'
import { add, midpoint, pathMiddle, sub } from '../geometry/vector'
import { cubicPoint, flattenCubic, projectOntoCubic, splitCubic, type Cubic } from '../geometry/curve'
import type { Line } from './types'
import { quantize } from './precision'

/** The largest gap allowed between a curve and the chords that stand for it. */
export const CHORD_TOLERANCE = 0.002

export const isCurved = (line: Line): boolean => !!line.curve

export const cubicOf = (line: Line): Cubic => [line.points[0], line.curve![0], line.curve![1], line.points[1]]

/**
 * The one place a line becomes straight pieces. Everything geometric reads
 * lines through this: the kernel, the edit graph, snapping, hit testing.
 */
export function lineChords(line: Line, tolerance = CHORD_TOLERANCE): Vec2[] {
  if (!line.curve) return [line.points[0], line.points[1]]
  return flattenCubic(cubicOf(line), tolerance).points
}

/** A line with one end moved to exactly `to`; the handle at that end moves with it so the curve keeps its shape. */
export function moveLineEnd<T extends Line>(line: T, index: 0 | 1, to: Vec2): T {
  const points = [...line.points] as [Vec2, Vec2]
  const delta = sub(to, points[index])
  points[index] = to
  if (!line.curve) return { ...line, points }
  const curve = [...line.curve] as [Vec2, Vec2]
  curve[index] = quantize(add(curve[index], delta))
  return { ...line, points, curve }
}

/** The point on a line nearest `p`, with its parameter along the line. */
export function projectOntoLine(line: Line, p: Vec2): { t: number; point: Vec2 } {
  if (line.curve) return projectOntoCubic(cubicOf(line), p)
  const [a, b] = line.points
  const ab = sub(b, a)
  const len2 = ab[0] * ab[0] + ab[1] * ab[1]
  const t = len2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * ab[0] + (p[1] - a[1]) * ab[1]) / len2)) : 0
  return { t, point: add(a, [ab[0] * t, ab[1] * t]) }
}

export const pointOnLine = (line: Line, t: number): Vec2 => (line.curve ? cubicPoint(cubicOf(line), t) : add(line.points[0], [(line.points[1][0] - line.points[0][0]) * t, (line.points[1][1] - line.points[0][1]) * t]))

/** The point halfway along a line, on the curve itself for a curved one: its midpoint, where the hand snaps to it and splits it. */
export function lineMiddle(line: Line): Vec2 {
  if (!line.curve) return midpoint(line.points[0], line.points[1])
  return projectOntoLine(line, pathMiddle(lineChords(line))).point
}

/** The two lines that together are this one, split at t, or at `at` exactly when straight; ids are the caller's. */
export function splitLine<T extends Line>(line: T, t: number, secondId: string, at?: Vec2): [T, T] {
  if (!line.curve) {
    const m = at ?? quantize(pointOnLine(line, t))
    return [
      { ...line, points: [line.points[0], m] },
      { ...line, id: secondId, points: [m, line.points[1]] }
    ]
  }
  const [l, r] = splitCubic(cubicOf(line), t)
  const m = quantize(l[3])
  return [
    { ...line, points: [line.points[0], m], curve: [quantize(l[1]), quantize(l[2])] },
    { ...line, id: secondId, points: [m, line.points[1]], curve: [quantize(r[1]), quantize(r[2])] }
  ]
}

/** SVG path data for a line: a cubic when curved, a straight segment otherwise. */
export function linePath(line: Line, flipY = true): string {
  const f = (v: number) => (Math.round(v * 1000) / 1000).toString()
  const pt = (p: Vec2) => `${f(p[0])} ${f(flipY ? -p[1] : p[1])}`
  const [a, b] = line.points
  if (!line.curve) return `M${pt(a)} L${pt(b)}`
  return `M${pt(a)} C${pt(line.curve[0])} ${pt(line.curve[1])} ${pt(b)}`
}
