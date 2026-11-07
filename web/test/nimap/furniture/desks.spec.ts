import { describe, it, expect } from 'vitest'
import { fixturePlan, inspect, buildEditGraph, createLevel, createEditorStore, selectionOf, fixtureParts, surfacePlacements, itemFootprint, pointInPolygon, fixtureGrips, pressGrip, gripDrag, dragChange, gripEdit } from '$lib/nimap'
import type { Line, Vec2 } from '$lib/nimap'

const rect = (p: string, x0: number, y0: number, x1: number, y1: number): Line[] => [
  { id: `${p}1`, points: [[x0, y0], [x1, y0]] },
  { id: `${p}2`, points: [[x1, y0], [x1, y1]] },
  { id: `${p}3`, points: [[x1, y1], [x0, y1]] },
  { id: `${p}4`, points: [[x0, y1], [x0, y0]] }
]

function deskScene() {
  const store = createEditorStore(createLevel({ name: 'L', fixtureLines: rect('d', 0, 0, 1.6, 0.8) }))
  const id = store.level.fixtures[0].id
  store.commit('Table', [{ type: 'setFixture', fixtureId: id, patch: { kind: 'table' } }])
  const ctx = () => ({ level: store.level, graph: buildEditGraph(store.level.walls, store.level.fixtureLines) })
  const act = (key: string) => {
    const edit = inspect(selectionOf([], [], [id]), ctx())[0].actions.find(a => a.key === key)!.run()!
    store.commit(edit.commit, edit.commands)
  }
  return { store, id, act, fixture: () => store.level.fixtures.find(f => f.id === id)! }
}

describe('desks and things on tops', () => {
  it('a table made a desk seats one office chair at one long edge with a screen facing it', () => {
    const { store, act, fixture } = deskScene()
    act('desk')
    const parts = fixtureParts(fixture(), store.level.fixtureLines, store.level.fixtures)!
    expect(parts.length).toBeGreaterThan(0)
    const roles = Object.entries(fixture().roles ?? {})
    expect(roles.length).toBe(1)
    expect(['d1', 'd3']).toContain(roles[0][0])
    const pieces = fixturePlan(fixture(), store.level.fixtureLines, store.level.fixtures)!.pieces
    expect(pieces.map(p => p.kind).sort()).toEqual(['monitor', 'officeChair'])
    const [chair, screen] = ['officeChair', 'monitor'].map(k => pieces.find(p => p.kind === k)!)
    const toChair = [chair.at[0] - screen.at[0], chair.at[1] - screen.at[1]]
    const plan = fixturePlan(fixture(), store.level.fixtureLines, store.level.fixtures)!
    expect(plan.pieces.length).toBe(2)
    expect(Math.hypot(toChair[0], toChair[1])).toBeGreaterThan(0.3)
  })

  it('an item stands on the top, moves with the fixture, is dragged no farther than the top reaches, and Alt-click takes it off', () => {
    const { store, id, fixture } = deskScene()
    store.commit('Coffee machine', [{ type: 'setFixture', fixtureId: id, patch: { items: [{ id: 'c1', item: 'coffeeMachine', at: [0, 0], facing: [0, 1] }] } }])
    const placed = () => surfacePlacements(fixture(), store.level.fixtureLines)
    expect(placed().length).toBe(1)
    const on = (p: ReturnType<typeof placed>[number]) => itemFootprint(p.kind, p.at, p.front).every(q => pointInPolygon(q, fixture().polygon!))
    expect(on(placed()[0])).toBe(true)

    const before = placed()[0].at
    store.commit('Move', [{ type: 'moveNodes', layer: 'fixtures', moves: [[0, 0], [1.6, 0], [1.6, 0.8], [0, 0.8]].map(p => ({ from: p as Vec2, to: [p[0] + 3, p[1] + 1] as Vec2 })) }])
    expect(placed()[0].at[0]).toBeCloseTo(before[0] + 3, 6)
    expect(placed()[0].at[1]).toBeCloseTo(before[1] + 1, 6)

    const grip = fixtureGrips(selectionOf([], [], [id]), store.level).find(g => g.kind === 'item')!
    const press = pressGrip(grip, store.level, grip.point, false)
    expect(press.gesture).toBe('hold')
    if (press.gesture !== 'hold') return
    const far: Vec2 = [grip.point[0] + 5, grip.point[1]]
    const drag = gripDrag(press, far)
    const edit = gripEdit(press, drag, dragChange(press, drag, far))
    store.commit(edit.commit, edit.commands)
    expect(on(placed()[0]), 'stopped at the edge of the top').toBe(true)
    expect(placed()[0].at[0]).toBeGreaterThan(before[0] + 3 + 0.3)

    const again = fixtureGrips(selectionOf([], [], [id]), store.level).find(g => g.kind === 'item')!
    const removed = pressGrip(again, store.level, again.point, true)
    if (removed.gesture === 'edit') store.commit(removed.commit, removed.commands)
    expect(fixture().items ?? []).toEqual([])
  })

  it('a stock item the reader does not know is skipped, not an error', () => {
    const { store, id, fixture } = deskScene()
    store.commit('Odd', [{ type: 'setFixture', fixtureId: id, patch: { items: [{ id: 'x', item: 'hoverboard', at: [0, 0], facing: [0, 1] }] } }])
    expect(surfacePlacements(fixture(), store.level.fixtureLines)).toEqual([])
    expect(() => fixtureParts(fixture(), store.level.fixtureLines, store.level.fixtures)).not.toThrow()
  })
})
