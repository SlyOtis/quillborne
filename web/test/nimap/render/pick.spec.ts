import { describe, it, expect } from 'vitest'
import { Mesh, Ray, Raycaster, Vector3 } from 'three'
import { highlightGroup, pickFeature, ROOM_HEIGHT } from '$lib/nimap/render'
import { Box3 } from 'three'
import { TABLE_HEIGHT } from '$lib/nimap'
import { createEditorStore, createLevel } from '$lib/nimap'
import type { Line, Wall } from '$lib/nimap'

const wall = (id: string, a: [number, number], b: [number, number]): Wall => ({ id, points: [a, b], width: 0.16 })
const table: Line[] = [
  { id: 't1', points: [[1, 1], [2.6, 1]] },
  { id: 't2', points: [[2.6, 1], [2.6, 1.8]] },
  { id: 't3', points: [[2.6, 1.8], [1, 1.8]] },
  { id: 't4', points: [[1, 1.8], [1, 1]] }
]

/** A ray from the map's usual view toward a document point at some height: from up and to one side, as the camera looks. */
const toward = (x: number, y: number, height: number) => {
  const target = new Vector3(x, height, -y)
  const direction = new Vector3(-1, -1.3, -1).normalize()
  return new Ray(target.clone().addScaledVector(direction, -50), direction)
}

describe('picking in the 3D', () => {
  const store = createEditorStore(createLevel({ name: 'L', walls: [wall('a', [0, 0], [6, 0]), wall('b', [6, 0], [6, 4]), wall('c', [6, 4], [0, 4]), wall('d', [0, 4], [0, 0]), wall('e', [3, 0], [3, 4])], fixtureLines: table }))
  const level = store.level
  const fixture = level.fixtures[0]
  const [west, east] = [...level.units].sort((p, q) => p.anchor[0] - q.anchor[0])

  it('a fixture is picked at its own top, over the room under it; elsewhere the room; kinds narrow what may be picked; walls never', () => {
    expect(pickFeature(level, toward(1.8, 1.4, 0.75))).toEqual({ kind: 'fixture', id: fixture.id })
    expect(pickFeature(level, toward(1.8, 1.4, 0.75), ['room'])).toEqual({ kind: 'room', id: west.id })
    expect(pickFeature(level, toward(4.5, 2, 0.03))).toEqual({ kind: 'room', id: east.id })
    expect(pickFeature(level, toward(4.5, 2, 0.03), ['fixture'])).toBeNull()
    expect(pickFeature(level, toward(3, 2, 1.15), ['fixture'])).toBeNull()
    expect(pickFeature(level, toward(40, 40, 0))).toBeNull()
  })

  it('a table on a support stands lifted onto it, and is picked and highlighted at its lifted top; a room on one at the support’s top', () => {
    const tables = { ...level, fixtures: level.fixtures.map(f => ({ ...f, kind: 'table' as const })) }
    const supports = [{ polygon: west.polygon, top: ROOM_HEIGHT }]
    expect(pickFeature(tables, toward(1.8, 1.4, TABLE_HEIGHT + ROOM_HEIGHT), undefined, supports)).toEqual({ kind: 'fixture', id: fixture.id })
    const mark = new Box3().setFromObject(highlightGroup(tables, [{ picked: { kind: 'fixture', id: fixture.id }, style: 'selected' }], supports))
    expect(mark.min.y).toBeGreaterThan(TABLE_HEIGHT + ROOM_HEIGHT)
    expect(mark.min.y).toBeLessThan(TABLE_HEIGHT + ROOM_HEIGHT + 0.03)
    const room = new Box3().setFromObject(highlightGroup(tables, [{ picked: { kind: 'room', id: west.id }, style: 'selected' }], supports))
    expect(room.min.y).toBeGreaterThan(ROOM_HEIGHT)
    expect(room.min.y).toBeLessThan(ROOM_HEIGHT + 0.03)
  })
})

describe('a room’s highlight', () => {
  it('covers what shows of its floor and never a room standing free inside it, wherever that room stands', () => {
    const ring = (prefix: string, x0: number, y0: number, x1: number, y1: number, width: number): Wall[] => [
      { id: `${prefix}s`, points: [[x0, y0], [x1, y0]], width },
      { id: `${prefix}e`, points: [[x1, y0], [x1, y1]], width },
      { id: `${prefix}n`, points: [[x1, y1], [x0, y1]], width },
      { id: `${prefix}w`, points: [[x0, y1], [x0, y0]], width }
    ]
    for (const [ix, iy] of [[2, 2], [5, 3], [7.5, 5.5]]) {
      const level = createEditorStore(createLevel({ name: 'L', walls: [...ring('o', 0, 0, 10, 8, 0.24), ...ring('i', ix, iy, ix + 1.6, iy + 1.4, 0.1)] })).level
      const outer = level.units.find(u => u.polygon.holes.length)!
      const group = highlightGroup(level, [{ picked: { kind: 'room', id: outer.id }, style: 'selected' }])
      group.updateMatrixWorld(true)
      const marks = group.children.filter((m): m is Mesh => m instanceof Mesh)
      const lit = (x: number, y: number) => new Raycaster(new Vector3(x, 5, -y), new Vector3(0, -1, 0)).intersectObjects(marks).length > 0
      expect(lit(ix + 0.8, iy + 0.7), `inside the room at ${ix},${iy}`).toBe(false)
      expect(lit(ix - 0.1, iy + 0.7), `beside the room at ${ix},${iy}`).toBe(true)
      expect(lit(0.13, 4), 'just inside the outer wall’s face').toBe(true)
      expect(lit(0.11, 4), 'in the outer wall').toBe(false)
    }
  })
})
