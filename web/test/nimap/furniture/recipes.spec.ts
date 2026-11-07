import { describe, it, expect } from 'vitest'
import { createLevel, createEditorStore, ellipseEdges, fixturePlan, fixtureParts, faceEdges, partsExtent, footprint, pointInPolygon, STOCK_ITEMS, inspect, buildEditGraph, selectionOf, tableParameters, MIXED, AUTO, clearRecipeCache, DEFAULT_CLEARANCE } from '$lib/nimap'
import type { Line, Vec2, Fixture } from '$lib/nimap'

const straight = (id: string, a: Vec2, b: Vec2): Line => ({ id, points: [a, b] })
const circle = (d: number, at: Vec2 = [0, 0]): Line[] => ellipseEdges([at[0] - d / 2, at[1] - d / 2], [at[0] + d / 2, at[1] + d / 2], true, 'q').map(({ id, points, curve }) => ({ id, points, curve }))
const oval = (): Line[] => ellipseEdges([0, 0], [3.2, 1.6], true, 'o').map(({ id, points, curve }) => ({ id, points, curve }))
const rectangle = (): Line[] => [straight('r0', [0, 0], [2.4, 0]), straight('r1', [2.4, 0], [2.4, 1.2]), straight('r2', [2.4, 1.2], [0, 1.2]), straight('r3', [0, 1.2], [0, 0])]
/** Two straight sides and two half circles, drawn as quarter curves. */
const stadium = (): Line[] => {
  const k = 0.5523
  return [
    straight('s0', [0, 0], [2, 0]),
    { id: 's1', points: [[2, 0], [2.6, 0.6]], curve: [[2 + 0.6 * k, 0], [2.6, 0.6 - 0.6 * k]] },
    { id: 's2', points: [[2.6, 0.6], [2, 1.2]], curve: [[2.6, 0.6 + 0.6 * k], [2 + 0.6 * k, 1.2]] },
    straight('s3', [2, 1.2], [0, 1.2]),
    { id: 's4', points: [[0, 1.2], [-0.6, 0.6]], curve: [[-0.6 * k, 1.2], [-0.6, 0.6 + 0.6 * k]] },
    { id: 's5', points: [[-0.6, 0.6], [0, 0]], curve: [[-0.6, 0.6 - 0.6 * k], [-0.6 * k, 0]] }
  ]
}

/** A table traced from `lines`, every outline line seating except those in `off`. */
function tableOf(lines: Line[], off: string[] = []): { fixture: Fixture; lines: Line[] } {
  const store = createEditorStore(createLevel({ name: 'L', fixtureLines: lines }))
  const face = store.level.fixtures.find(f => f.polygon)!
  const roles = Object.fromEntries(lines.map(l => l.id).filter(id => !off.includes(id)).map(id => [id, 'seating' as const]))
  store.commit('Table', [{ type: 'setFixture', fixtureId: face.id, patch: { kind: 'table', roles } }])
  return { fixture: store.level.fixtures.find(f => f.id === face.id)!, lines: store.level.fixtureLines }
}

const centre = (ring: Vec2[]): Vec2 => [ring.reduce((s, p) => s + p[0], 0) / ring.length, ring.reduce((s, p) => s + p[1], 0) / ring.length]
const chairs = (t: { fixture: Fixture; lines: Line[] }) => new Map(fixturePlan(t.fixture, t.lines)!.pieces.map(p => [p.id, centre(p.outline)]))

describe('a traced table through its recipe', () => {
  it('reaches the recipe as the lines it was traced with, curves and all', () => {
    const t = tableOf(circle(2))
    const edges = faceEdges(t.fixture, t.lines)
    expect(edges.map(e => e.lineId).sort()).toEqual(['q0', 'q1', 'q2', 'q3'])
    expect(edges.every(e => !!e.curve)).toBe(true)
  })

  it('round, traced as four curved lines, it seats all round, one chair more for every pitch along the chairs’ fronts as it grows', () => {
    const { min, max } = partsExtent(STOCK_ITEMS.meetingChair.parts)
    const pitch = max[0] - min[0] + 0.2
    let last = 0
    for (let d = 1; d <= 3.001; d += 0.1) {
      const count = chairs(tableOf(circle(d))).size
      expect(count, `${d.toFixed(1)} m`).toBe(Math.floor((Math.PI * (d + 2 * DEFAULT_CLEARANCE)) / pitch))
      expect(count, `${d.toFixed(1)} m`).toBeGreaterThanOrEqual(last)
      last = count
    }
  })

  it('moved, its chairs move exactly with it', () => {
    for (const [name, lines] of [['circle', circle(2.5)], ['oval', oval()], ['stadium', stadium()]] as [string, Line[]][]) {
      const here = chairs(tableOf(lines))
      const shift: Vec2 = [13.37, -4.21]
      const moved = chairs(tableOf(lines.map(l => ({ ...l, points: l.points.map(p => [p[0] + shift[0], p[1] + shift[1]]) as [Vec2, Vec2], ...(l.curve ? { curve: l.curve.map(p => [p[0] + shift[0], p[1] + shift[1]]) as [Vec2, Vec2] } : {}) }))))
      expect([...moved.keys()].sort(), name).toEqual([...here.keys()].sort())
      for (const [id, p] of here) {
        expect(moved.get(id)![0] - shift[0], `${name} ${id}`).toBeCloseTo(p[0], 4)
        expect(moved.get(id)![1] - shift[1], `${name} ${id}`).toBeCloseTo(p[1], 4)
      }
    }
  })

  it('turning an edge off takes away the chairs standing on it and moves no other, on any shape', () => {
    for (const [name, lines] of [['circle', circle(2.5)], ['oval', oval()], ['rectangle', rectangle()], ['stadium', stadium()]] as [string, Line[]][]) {
      const all = chairs(tableOf(lines))
      for (const line of lines) {
        const without = chairs(tableOf(lines, [line.id]))
        const own = [...all.keys()].filter(id => id.startsWith(`${line.id}:`))
        expect(own.length, `${name} ${line.id}`).toBeGreaterThan(0)
        expect([...without.keys()].sort(), `${name} ${line.id}`).toEqual([...all.keys()].filter(id => !own.includes(id)).sort())
        for (const [id, p] of without) expect(Math.hypot(p[0] - all.get(id)![0], p[1] - all.get(id)![1]), `${name} ${line.id} ${id}`).toBeLessThan(1e-6)
      }
    }
  })
})

describe('a table fixture as a record, a plan and a scene', () => {
  it('keeps its roles through an edit that re-derives it, as it keeps its name', () => {
    const store = createEditorStore(createLevel({ name: 'L', fixtureLines: rectangle() }))
    const id = store.level.fixtures[0].id
    store.commit('Table', [{ type: 'setFixture', fixtureId: id, patch: { kind: 'table', name: 'Board', roles: { r0: 'seating', r2: 'seating' } } }])
    store.commit('Stretch', [{ type: 'moveNodes', layer: 'fixtures', moves: [{ from: [2.4, 0], to: [2.8, 0] }, { from: [2.4, 1.2], to: [2.8, 1.2] }] }])
    const f = store.level.fixtures.find(x => x.id === id)!
    expect(f.name).toBe('Board')
    expect(f.roles).toEqual({ r0: 'seating', r2: 'seating' })
  })

  it('made a table from the panel, it seats every edge of its outline, unless it already has roles', () => {
    for (const [lines, preset] of [[rectangle(), undefined], [circle(2), undefined], [rectangle(), { r1: 'seating' as const }]] as const) {
      const store = createEditorStore(createLevel({ name: 'L', fixtureLines: [...lines] }))
      const id = store.level.fixtures[0].id
      if (preset) store.commit('Preset', [{ type: 'setFixture', fixtureId: id, patch: { roles: preset } }])
      const kind = inspect(selectionOf([], [], [id]), { level: store.level, graph: buildEditGraph(store.level.walls, store.level.fixtureLines) })[0].fields.find(f => f.key === 'kind')!
      const edit = kind.set('table')!
      store.commit(edit.commit, edit.commands)
      const roles = store.level.fixtures.find(x => x.id === id)!.roles
      expect(roles).toEqual(preset ?? Object.fromEntries(lines.map(l => [l.id, 'seating'])))
    }
  })

  it('the plan and the scene are the same table: one plan chair for each seat in the scene, every plan support inside a support there', () => {
    for (const lines of [rectangle(), circle(2.5), oval(), stadium()]) {
      const t = tableOf(lines, [lines[0].id])
      const plan = fixturePlan(t.fixture, t.lines)!
      const parts = fixtureParts(t.fixture, t.lines)!
      const seats = parts.filter(p => p.role === 'seat')
      expect(plan.pieces.length).toBe(seats.length)
      for (const seat of seats) {
        const [x, y] = seat.transform.slice(9, 11) as [number, number]
        expect(plan.pieces.some(p => pointInPolygon([x, y], { outer: p.outline, holes: [] }))).toBe(true)
      }
      const supports = parts.filter(p => p.role === 'support').map(p => ({ outer: footprint([p]), holes: [] }))
      expect(plan.supports.length).toBeGreaterThan(0)
      for (const s of plan.supports) expect(supports.some(f => pointInPolygon(s.at, f))).toBe(true)
    }
  })

  it('a face that crossing lines make, with no stored corner of its own, builds as a table too', () => {
    const store = createEditorStore(createLevel({ name: 'L', fixtureLines: [straight('a0', [0, 0], [3, 0]), straight('a1', [3, 0], [3, 2]), straight('a2', [3, 2], [0, 2]), straight('a3', [0, 2], [0, 0]), straight('b0', [1, -1], [5, -1]), straight('b1', [5, -1], [5, 1]), straight('b2', [5, 1], [1, 1]), straight('b3', [1, 1], [1, -1])] }))
    const overlap = store.level.fixtures.find(f => f.polygon && pointInPolygon([2, 0.5], f.polygon) && Math.abs(f.anchor[0] - 2) < 0.6 && Math.abs(f.anchor[1] - 0.5) < 0.6)!
    store.commit('Table', [{ type: 'setFixture', fixtureId: overlap.id, patch: { kind: 'table', roles: { a0: 'seating', a1: 'seating', b2: 'seating', b3: 'seating' } } }])
    const f = store.level.fixtures.find(x => x.id === overlap.id)!
    const edges = faceEdges(f, store.level.fixtureLines)
    expect(edges.map(e => e.lineId).sort()).toEqual(['a0', 'a1', 'b2', 'b3'])
    expect(fixtureParts(f, store.level.fixtureLines)!.some(p => p.role === 'top')).toBe(true)
  })
})

describe('a table’s parameters', () => {
  const withRecipe = (parameters: Record<string, unknown>) => {
    const t = tableOf(rectangle())
    return { ...t, fixture: { ...t.fixture, recipe: { kind: 'table', version: 1, parameters } } }
  }

  it('the recipe takes its chair, its count and its supports from the record, and ignores what it does not know', () => {
    const t = withRecipe({ chair: 'officeChair', seats: 3, supports: 'legs' })
    const plan = fixturePlan(t.fixture, t.lines)!
    expect(plan.pieces.map(p => p.kind)).toEqual(['officeChair', 'officeChair', 'officeChair'])
    expect(plan.supports.length).toBe(4)
    expect(tableParameters(withRecipe({ chair: 'throne', seats: -2, supports: 'stilts', colour: 'red' }).fixture)).toEqual({})
    expect(tableParameters({ ...t.fixture, recipe: { kind: 'sofa', version: 1, parameters: { seats: 3 } } })).toEqual({})
    expect(fixturePlan(withRecipe({ supports: 'none' }).fixture, t.lines)!.supports).toEqual([])
  })

  it('in the panel, over tables that differ, each reads Mixed, reads back what it sets, and a count goes back to Auto', () => {
    const store = createEditorStore(createLevel({ name: 'L', fixtureLines: [...rectangle(), ...rectangle().map(l => ({ ...l, id: `b${l.id}`, points: l.points.map(p => [p[0] + 5, p[1]]) as [Vec2, Vec2] }))] }))
    const ids = store.level.fixtures.map(f => f.id)
    store.commit('Tables', ids.map((id, i) => ({ type: 'setFixture' as const, fixtureId: id, patch: { kind: 'table' as const, recipe: { kind: 'table', version: 1, parameters: i ? { chair: 'stool', seats: 2, supports: 'panels' } : {} } } })))
    const field = (key: string) => inspect(selectionOf([], [], ids), { level: store.level, graph: buildEditGraph(store.level.walls, store.level.fixtureLines) })[0].fields.find(f => f.key === key)!
    for (const [key, value] of [['chair', 'officeChair'], ['seats', 5], ['supports', 'legs'], ['seats', AUTO]] as const) {
      if (key !== 'seats' || value !== AUTO) expect(field(key).value, key).toBe(MIXED)
      const edit = field(key).set(value)!
      store.commit(edit.commit, edit.commands)
      expect(field(key).value, key).toBe(value)
      expect(field(key).set(value), key).toBeNull()
    }
    expect(store.level.fixtures.map(f => tableParameters(f))).toEqual([{ chair: 'officeChair', supports: 'legs' }, { chair: 'officeChair', supports: 'legs' }])
  })
})

describe('the preview of a selection', () => {
  it('is offered for exactly one fixture a recipe builds, as that fixture’s parts, and for nothing else', () => {
    const store = createEditorStore(createLevel({ name: 'L', fixtureLines: [...rectangle(), ...rectangle().map(l => ({ ...l, id: `b${l.id}`, points: l.points.map(p => [p[0] + 5, p[1]]) as [Vec2, Vec2] }))] }))
    const [a, b] = store.level.fixtures.map(f => f.id)
    const preview = (ids: string[]) => inspect(selectionOf([], [], ids), { level: store.level, graph: buildEditGraph(store.level.walls, store.level.fixtureLines) })[0].preview
    expect(preview([a])).toBeNull()
    store.commit('Tables', [a, b].map(id => ({ type: 'setFixture' as const, fixtureId: id, patch: { kind: 'table' as const, roles: { r0: 'seating' as const, br0: 'seating' as const } } })))
    const one = preview([a])!
    expect(one).toEqual(fixtureParts(store.level.fixtures.find(f => f.id === a)!, store.level.fixtureLines))
    expect(one.some(p => p.role === 'seat')).toBe(true)
    expect(preview([a, b])).toBeNull()
  })
})

describe('kept recipe results', () => {
  it('a kept result is always the one a fresh build gives, whatever changed: a node, a bend, the roles, the parameters, the height', () => {
    const store = createEditorStore(createLevel({ name: 'L', fixtureLines: rectangle() }))
    const id = store.level.fixtures[0].id
    const edits: [string, Parameters<typeof store.commit>[1]][] = [
      ['table', [{ type: 'setFixture', fixtureId: id, patch: { kind: 'table', roles: { r0: 'seating', r1: 'seating', r2: 'seating', r3: 'seating' } } }]],
      ['node', [{ type: 'moveNodes', layer: 'fixtures', moves: [{ from: [2.4, 0], to: [3, -0.2] }] }]],
      ['bend', [{ type: 'setCurves', layer: 'fixtures', curves: [{ lineId: 'r2', curve: [[2.2, 2], [0.4, 2]] }] }]],
      ['roles', [{ type: 'setFixture', fixtureId: id, patch: { roles: { r0: 'seating', r2: 'seating' } } }]],
      ['parameters', [{ type: 'setFixture', fixtureId: id, patch: { recipe: { kind: 'table', version: 1, parameters: { chair: 'officeChair', supports: 'legs' } } } }]],
      ['height', [{ type: 'setFixture', fixtureId: id, patch: { height: 1.05 } }]]
    ]
    for (const [name, commands] of edits) {
      store.commit(name, commands)
      const f = store.level.fixtures.find(x => x.id === id)!
      const kept = fixtureParts(f, store.level.fixtureLines)
      clearRecipeCache()
      expect(fixtureParts(f, store.level.fixtureLines), name).toEqual(kept)
    }
  })
})
