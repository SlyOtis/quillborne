import { describe, it, expect } from 'vitest'
import { inspect, MIXED, KINDS, buildEditGraph, createLevel, createEditorStore, selectionOf, isEmptySelection } from '$lib/nimap'
import type { Wall, Line, Opening, Selection, FieldValue, Field } from '$lib/nimap'

const wall = (id: string, points: [[number, number], [number, number]], width: number): Wall => ({ id, points, width })
const rect = (prefix: string, x0: number, y0: number, x1: number, y1: number): Line[] => [
  { id: `${prefix}1`, points: [[x0, y0], [x1, y0]] },
  { id: `${prefix}2`, points: [[x1, y0], [x1, y1]] },
  { id: `${prefix}3`, points: [[x1, y1], [x0, y1]] },
  { id: `${prefix}4`, points: [[x0, y1], [x0, y0]] }
]
const opening = (id: string, kind: Opening['kind'], at: [number, number], width: number): Opening => ({ id, kind, at, width, from: kind === 'door' ? 0 : 0.9, to: 2.1, ...(kind === 'door' ? { swing: { side: 1, hinge: 0 } } : {}) })

/** Two of every kind, differing in every field. */
function scene() {
  const store = createEditorStore(createLevel({
    name: 'L',
    walls: [{ ...wall('a', [[0, 0], [6, 0]], 0.2), height: 1.1 }, wall('b', [[0, 4], [6, 4]], 0.16), wall('c', [[0, 0], [0, 4]], 0.16), wall('d', [[6, 0], [6, 4]], 0.16), wall('e', [[3, 0], [3, 4]], 0.16)],
    fixtureLines: [...rect('r', 1, 1, 2, 2), ...rect('s', 3, 1, 5, 2)],
    openings: [opening('d1', 'door', [2, 0], 0.9), opening('d2', 'door', [2, 4], 1)]
  }))
  const [f1, f2] = store.level.fixtures
  const [u1, u2] = [...store.level.units].sort((p, q) => p.anchor[0] - q.anchor[0])
  store.commit('Differ', [
    { type: 'setFixture', fixtureId: f1.id, patch: { name: 'Desk', kind: 'table', height: 0.75, roles: { r1: 'seating' } } },
    { type: 'setFixture', fixtureId: f2.id, patch: { name: 'Shelf', kind: 'cabinet', height: 1.2 } },
    { type: 'setUnit', unitId: u1.id, patch: { name: 'West', category: 'office' } },
    { type: 'setUnit', unitId: u2.id, patch: { name: 'East', category: 'lounge', outside: true } },
    { type: 'setSpaces', spaces: [{ id: 'sp', name: 'Suite', category: 'office', units: [u1.id] }] }
  ])
  const ctx = () => ({ level: store.level, graph: buildEditGraph(store.level.walls, store.level.fixtureLines) })
  const selections: Record<string, Selection> = {
    wall: selectionOf([], ['a', 'b']),
    'fixture-line': selectionOf([], ['r1', 'r2']),
    fixture: selectionOf([], [], [f1.id, f2.id]),
    opening: selectionOf([], [], [], ['d1', 'd2']),
    room: selectionOf([], [], [], [], [u1.id, u2.id])
  }
  return { store, ctx, selections }
}

/** A value the field allows that is not `current`. */
function another(field: Field): FieldValue {
  const c = field.control
  if (c.type === 'number') return c.min + 7 * c.step === field.value ? c.min + 8 * c.step : c.min + 7 * c.step
  if (c.type === 'count') return c.min + 7 === field.value ? c.min + 8 : c.min + 7
  if (c.type === 'text') return 'Reception'
  if (c.type === 'choice') return c.options.find(o => o.value !== field.value)!.value
  return field.value !== true
}

describe('inspect: the panel reads a selection through its kinds', () => {
  it('every kind names itself, one or several, and a mixed selection gives one section per kind in the registry’s order, delete last in each', () => {
    const { ctx, selections } = scene()
    for (const kind of KINDS) {
      const [section] = inspect(selections[kind.id], ctx())
      expect(section.label).toBe(`2 ${kind.noun[1]}`)
      const s = selections[kind.id]
      const one = inspect(selectionOf([...s.nodeIds], [...s.lineIds].slice(0, 1), [...s.fixtureIds].slice(0, 1), [...s.openingIds].slice(0, 1), [...s.unitIds].slice(0, 1)), ctx())
      expect(one[0].label).toBe(kind.noun[0])
      if (kind.id !== 'room') expect(section.actions.at(-1)!.key).toBe('delete')
      else expect(section.actions.map(a => a.key), 'a room is never deleted').not.toContain('delete')
    }
    const all = selectionOf([], ['a', 'r1'], [...selections.fixture.fixtureIds], ['d1'], [...selections.room.unitIds])
    expect(inspect(all, ctx()).map(s => s.kind)).toEqual(KINDS.map(k => k.id))
  })

  it('every field reads Mixed over things that differ, reads back exactly what it sets, and setting that again is no edit', () => {
    const { store, ctx, selections } = scene()
    let checked = 0
    for (const kind of KINDS) {
      const selection = selections[kind.id]
      for (const key of (inspect(selection, ctx())[0].fields).map(f => f.key)) {
        const field = () => inspect(selection, ctx())[0].fields.find(f => f.key === key)!
        expect(field().value, `${kind.id}.${key}`).toBe(MIXED)
        const value = another(field())
        const edit = field().set(value)
        expect(edit, `${kind.id}.${key}`).not.toBeNull()
        store.commit(edit!.commit, edit!.commands, edit!.selection)
        expect(field().value, `${kind.id}.${key}`).toBe(value)
        expect(field().set(value), `${kind.id}.${key}`).toBeNull()
        checked++
      }
    }
    expect(checked).toBe(7)
    expect(inspect(selections.room, ctx())[0].fields.map(f => f.key), 'a room shows only what lies under it; its meaning is given in Connect').toEqual(['ground'])
  })

  it('a number set past its limits is held at them', () => {
    const store = createEditorStore(createLevel({ name: 'L', walls: [wall('a', [[0, 0], [6, 0]], 0.2)], openings: [opening('d1', 'door', [2, 0], 0.9)] }))
    const ctx = () => ({ level: store.level, graph: buildEditGraph(store.level.walls, store.level.fixtureLines) })
    const selections: Record<string, Selection> = { wall: selectionOf([], ['a']), opening: selectionOf([], [], [], ['d1']) }
    for (const [kind, over, under] of [['opening', 10000, 1], ['wall', 1000, -5]] as const) {
      const width = () => inspect(selections[kind], ctx())[0].fields.find(f => f.key === 'width')!
      const c = width().control as { min: number; max: number }
      let edit = width().set(over)!
      store.commit(edit.commit, edit.commands)
      expect(width().value, kind).toBe(c.max)
      edit = width().set(under)!
      store.commit(edit.commit, edit.commands)
      expect(width().value, kind).toBe(c.min)
    }
  })

  it('an opening widened from the panel is refitted, so it stays clear of a wall meeting its run', () => {
    const store = createEditorStore(createLevel({ name: 'L', walls: [wall('a', [[0, 0], [6, 0]], 0.2), wall('t', [[1, 0], [1, 2]], 0.16)], openings: [opening('d1', 'door', [2, 0], 0.9)] }))
    const ctx = { level: store.level, graph: buildEditGraph(store.level.walls, store.level.fixtureLines) }
    const edit = inspect(selectionOf([], [], [], ['d1']), ctx)[0].fields.find(f => f.key === 'width')!.set(200)!
    store.commit(edit.commit, edit.commands)
    const d = store.level.openings[0]
    expect(d.width).toBe(2)
    expect(d.at[0] - 1).toBeGreaterThanOrEqual(0.08 + 1 - 1e-9)
  })

  it('delete removes the things of its section and drops them from the selection; doors can be flipped from the panel, windows not', () => {
    const { store, ctx } = scene()
    const north = () => store.level.walls.filter(w => w.points.every(p => p[1] === 0)).map(w => w.id)
    store.select(selectionOf([], north(), [], ['d2']))
    const del = inspect(store.selection, ctx()).find(s => s.kind === 'wall')!.actions.find(a => a.key === 'delete')!.run()!
    store.commit(del.commit, del.commands, del.selection)
    expect(north()).toEqual([])
    expect(store.selection.lineIds.size).toBe(0)
    expect([...store.selection.openingIds]).toEqual(['d2'])
    expect(isEmptySelection(store.selection)).toBe(false)
    const { store: s2, ctx: c2 } = scene()
    const doors = inspect(selectionOf([], [], [], ['d1']), c2())[0]
    expect(doors.actions.map(a => a.key)).toEqual(['flip-side', 'flip-hinge', 'delete'])
    const flip = doors.actions[0].run()!
    s2.commit(flip.commit, flip.commands)
    expect(s2.level.openings.find(o => o.id === 'd1')!.swing).toEqual({ side: -1, hinge: 0 })
    s2.commit('Window', [{ type: 'setOpening', openingId: 'd2', patch: { kind: 'window', from: 0.9, swing: undefined } }])
    expect(inspect(selectionOf([], [], [], ['d2']), c2())[0].actions.map(a => a.key)).toEqual(['delete'])
  })
})
