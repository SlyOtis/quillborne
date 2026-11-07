import { describe, it, expect } from 'vitest'
import { applyCommand, applyCommands, createLevel, splitAtContacts, mergeNearPoints, normalizeWalls, normalizeLines, createEditorStore, wallTopology, quantize } from '$lib/nimap'
import type { Wall, Vec2, Line } from '$lib/nimap'

const wall = (id: string, points: [[number, number], [number, number]], width = 0.16): Wall => ({ id, points, width })

function starterWalls(): Wall[] {
  return [
    wall('n', [[0, 0], [10, 0]], 0.24), wall('e', [[10, 0], [10, 7]], 0.24), wall('s', [[10, 7], [0, 7]], 0.24), wall('w', [[0, 7], [0, 0]], 0.24),
    wall('split', [[0, 3], [10, 3]]), wall('middle', [[5, 0], [5, 3]]), wall('partition', [[7.6, 4.6], [9, 4.6]])
  ]
}

const line = (id: string, points: [[number, number], [number, number]]): Line => ({ id, points })
const deskLines = (x = 0, y = 0): Line[] => [line('a', [[x, y], [x + 1.6, y]]), line('b', [[x + 1.6, y], [x + 1.6, y + 0.8]]), line('c', [[x + 1.6, y + 0.8], [x, y + 0.8]]), line('d', [[x, y + 0.8], [x, y]])]

describe('fixture line commands', () => {
  it('fixture lines are a separate layer: moving, removing and healing name the layer and leave walls alone', () => {
    const level = createLevel({ name: 'L', walls: starterWalls(), fixtureLines: deskLines() })
    const added = applyCommand(level, { type: 'addFixtureLine', line: line('e', [[0.8, 0], [0.8, 0.8000000001]]) })
    expect(added.fixtureLines.length).toBe(5)
    expect(added.fixtureLines[4].points).toEqual([[0.8, 0], [0.8, 0.8]])
    const moved = applyCommand(added, { type: 'moveNodes', layer: 'fixtures', moves: [{ from: [0, 0], to: [0.1, 0.2] }] })
    expect(moved.fixtureLines.find(l => l.id === 'a')!.points[0]).toEqual([0.1, 0.2])
    expect(moved.walls).toEqual(starterWalls())
    const removed = applyCommand(moved, { type: 'removeLines', layer: 'fixtures', ids: ['e'] })
    expect(removed.fixtureLines.map(l => l.id)).toEqual(['a', 'b', 'c', 'd'])
    const healed = applyCommand(removed, { type: 'healNode', layer: 'fixtures', point: [1.6, 0] })
    expect(healed.fixtureLines.length).toBe(3)
    expect(healed.walls).toEqual(starterWalls())
  })

  it('a moved wall node with no layer given moves walls only', () => {
    const level = createLevel({ name: 'L', walls: [{ id: 'w', points: [[0, 0], [4, 0]], width: 0.1 }], fixtureLines: deskLines() })
    const moved = applyCommand(level, { type: 'moveNodes', moves: [{ from: [0, 0], to: [0, 1] }] })
    expect(moved.walls[0].points[0]).toEqual([0, 1])
    expect(moved.fixtureLines).toEqual(deskLines())
  })
})

describe('derived fixtures', () => {
  it('closed faces of the fixture graph are fixtures and never take part in room enumeration', () => {
    const store = createEditorStore(createLevel({ name: 'L', walls: starterWalls() }))
    store.commit('Settle', [])
    const before = store.level.units.map(u => u.signature)
    expect(before.length).toBe(3)
    store.commit('Draw', deskLines(1, 1).map(l => ({ type: 'addFixtureLine', line: l })))
    expect(store.level.units.map(u => u.signature)).toEqual(before)
    expect(store.level.fixtures.length).toBe(1)
    expect(store.level.fixtures[0]).toMatchObject({ kind: 'object', signature: 'a|b|c|d' })
    expect(store.level.fixtures[0].polygon!.outer.length).toBe(4)
  })

  it('a divider makes two faces; declared kind survives moving a shared corner', () => {
    const store = createEditorStore(createLevel({ name: 'L', fixtureLines: deskLines() }))
    store.commit('Settle', [])
    store.commit('Divide', [{ type: 'addFixtureLine', line: line('m', [[0.8, 0], [0.8, 0.8]]) }])
    expect(store.level.fixtures.length).toBe(2)
    const left = store.level.fixtures.find(f => f.polygon!.outer.some(p => p[0] === 0))!
    store.commit('Classify', [{ type: 'setFixture', fixtureId: left.id, patch: { kind: 'table', name: 'Left' } }])
    store.commit('Move', [{ type: 'moveNodes', layer: 'fixtures', moves: [{ from: [0, 0], to: [-0.2, -0.1] }] }])
    const after = store.level.fixtures.find(f => f.id === left.id)!
    expect(after).toMatchObject({ kind: 'table', name: 'Left' })
    expect(after.polygon!.outer.some(p => p[0] === -0.2)).toBe(true)
    expect(store.level.fixtures.length).toBe(2)
  })

  it('a chain of lines with a free end is an open fixture with a path', () => {
    const store = createEditorStore(createLevel({ name: 'L', fixtureLines: [line('p', [[0, 0], [2, 0]]), line('q', [[2, 0], [2, 1]])] }))
    store.commit('Settle', [])
    expect(store.level.fixtures.length).toBe(1)
    const [sofa] = store.level.fixtures
    expect(sofa.polygon).toBeUndefined()
    expect(sofa.line).toEqual([[0, 0], [2, 0], [2, 1]])
    store.commit('Classify', [{ type: 'setFixture', fixtureId: sofa.id, patch: { kind: 'sofa' } }])
    store.commit('Extend', [{ type: 'addFixtureLine', line: line('r', [[2, 1], [3, 1]]) }])
    expect(store.level.fixtures.length).toBe(1)
    expect(store.level.fixtures[0]).toMatchObject({ id: sofa.id, kind: 'sofa' })
    expect(store.level.fixtures[0].line!.length).toBe(4)
  })
})

describe('commands', () => {
  it('moves every wall point that shares a node', () => {
    const level = createLevel({ name: 'L', walls: [wall('a', [[0, 0], [4, 0]]), wall('b', [[4, 0], [4, 3]])] })
    const next = applyCommand(level, { type: 'moveNodes', moves: [{ from: [4, 0], to: [5, 0.5] }] })
    expect(next.walls[0].points[1]).toEqual([5, 0.5])
    expect(next.walls[1].points[0]).toEqual([5, 0.5])
    expect(level.walls[0].points[1]).toEqual([4, 0])
  })

  it('splits walls where a point of another wall lies on them, keeping the id on the first piece', () => {
    const split = splitAtContacts(starterWalls())
    expect(split.map(w => w.id)).toEqual(['n', 'n.1', 'e', 'e.1', 's', 'w', 'w.1', 'split', 'split.1', 'middle', 'partition'])
    expect(split.find(w => w.id === 'n')!.points).toEqual([[0, 0], [5, 0]])
    expect(split.find(w => w.id === 'n.1')!.points).toEqual([[5, 0], [10, 0]])
    expect(splitAtContacts(split)).toBe(split)
  })

  it('points within a centimetre of an earlier point merge onto it at commit', () => {
    const merged = mergeNearPoints([wall('a', [[0, 0], [4, 0]]), wall('b', [[4.004, 0.003], [4, 3]]), wall('c', [[4.02, 0], [8, 0]])])
    expect(merged[1].points[0]).toBe(merged[0].points[1])
    expect(merged[2].points[0]).toEqual([4.02, 0])
    const store = createEditorStore(createLevel({ name: 'L', walls: [wall('a', [[0, 0], [4, 0]]), wall('b', [[4.004, 0.003], [4, 3]])] }))
    expect(store.level.walls[1].points[0]).toEqual([4, 0])
  })

  it('a contact within a centimetre of a wall end joins the end instead of splitting the wall', () => {
    const walls = normalizeWalls([wall('host', [[0, 0], [6, 0]]), wall('t', [[5.995, 0.002], [6, 2]])])
    expect(walls.map(w => [w.id, ...w.points])).toEqual([['host', [0, 0], [6, 0]], ['t', [6, 0], [6, 2]]])
  })

  it('a moved T point carries every wall through it, so the room split survives', () => {
    const store = createEditorStore(createLevel({ name: 'L', walls: starterWalls() }))
    store.commit('Move', [{ type: 'moveNodes', moves: [{ from: [5, 3], to: [5.6, 3.4] }] }])
    const through = store.level.walls.filter(w => w.points.some(p => p[0] === 5.6 && p[1] === 3.4)).map(w => w.id)
    expect(through.sort()).toEqual(['middle', 'split', 'split.1'])
    expect(wallTopology(store.level.walls).faces.length).toBe(3)
  })

  it('pulling a corner bends the host at the junctions it holds', () => {
    const store = createEditorStore(createLevel({ name: 'L', walls: starterWalls() }))
    store.commit('Move', [{ type: 'moveNodes', moves: [{ from: [10, 0], to: [10.4, -0.4] }] }])
    expect(store.level.walls.find(w => w.id === 'e')!.points).toEqual([[10.4, -0.4], [10, 3]])
    expect(wallTopology(store.level.walls).faces.length).toBe(3)
  })

  it('a T point off the micrometre grid is split exactly and moves with its host', () => {
    const store = createEditorStore(createLevel({ name: 'L', walls: [wall('host', [[0, 0], [6, 0]]), wall('t', [[3.123457, 0], [3.123457, 2]])] }))
    expect(store.level.walls.map(w => w.points)).toEqual([[[0, 0], [3.123457, 0]], [[3.123457, 0], [6, 0]], [[3.123457, 0], [3.123457, 2]]])
    store.commit('Move', [{ type: 'moveNodes', moves: [{ from: [3.123457, 0], to: [3.5, 0.5] }] }])
    expect(store.level.walls.map(w => w.points)).toEqual([[[0, 0], [3.5, 0.5]], [[3.5, 0.5], [6, 0]], [[3.5, 0.5], [3.123457, 2]]])
  })

  it('a rigid move of every node changes nothing but position', () => {
    const walls = [wall('n', [[0, 0], [6, 0]]), wall('e', [[6, 0], [6, 4]]), wall('s', [[6, 4], [0, 4]]), wall('w', [[0, 4], [0, 0]]), wall('t', [[3, 0], [3, 2]]), wall('x', [[2, -1], [2, 5]])]
    const store = createEditorStore(createLevel({ name: 'L', walls }))
    const before = store.level.walls
    const delta: Vec2 = [0.731, -0.417]
    const froms = [...new Map(before.flatMap(w => w.points.map(p => [p.join(','), p] as const))).values()]
    store.commit('Move', [{ type: 'moveNodes', moves: froms.map(from => ({ from, to: [from[0] + delta[0], from[1] + delta[1]] })) }])
    expect(store.level.walls.map(w => w.points)).toEqual(before.map(w => w.points.map(p => quantize([p[0] + delta[0], p[1] + delta[1]]))))
  })

  it('a crossing never creates a point', () => {
    const store = createEditorStore(createLevel({ name: 'L', walls: [wall('n', [[0, 0], [6, 0]]), wall('x', [[2, -1], [2, 5]])] }))
    expect(store.level.walls.length).toBe(2)
    store.commit('Move', [{ type: 'moveNodes', moves: [{ from: [6, 0], to: [6, 1] }] }])
    expect(store.level.walls.map(w => w.points)).toEqual([[[0, 0], [6, 1]], [[2, -1], [2, 5]]])
  })

  it('removing a node removes its walls, and a collapsed wall is dropped', () => {
    const level = createLevel({ name: 'L', walls: [wall('a', [[0, 0], [4, 0]]), wall('b', [[4, 0], [4, 3]])] })
    expect(applyCommand(level, { type: 'removeNodes', points: [[4, 0]] }).walls).toEqual([])
    const collapsed = applyCommand(level, { type: 'moveNodes', moves: [{ from: [4, 3], to: [4, 0] }] })
    expect(collapsed.walls.map(w => w.id)).toEqual(['a'])
  })

  it('healing a node joins the two walls that met there, keeps the wider width, and otherwise just removes', () => {
    const level = createLevel({ name: 'L', walls: [wall('a', [[0, 0], [4, 0]], 0.16), wall('b', [[4, 0], [4, 3]], 0.24), wall('c', [[10, 10], [12, 10]])] })
    const healed = applyCommand(level, { type: 'healNode', point: [4, 0] })
    expect(healed.walls.map(w => [w.id, ...w.points, w.width])).toEqual([['c', [10, 10], [12, 10], 0.16], ['a', [0, 0], [4, 3], 0.24]])
    const three = applyCommand(createLevel({ name: 'L', walls: [wall('a', [[0, 0], [4, 0]]), wall('b', [[4, 0], [4, 3]]), wall('t', [[4, 0], [6, 2]])] }), { type: 'healNode', point: [4, 0] })
    expect(three.walls).toEqual([])
    const lone = applyCommand(createLevel({ name: 'L', walls: [wall('a', [[0, 0], [4, 0]])] }), { type: 'healNode', point: [4, 0] })
    expect(lone.walls).toEqual([])
  })

  it('adds, edits and removes walls immutably', () => {
    const level = createLevel({ name: 'L' })
    const points: [Vec2, Vec2] = [[0, 0], [1, 0]]
    const a = applyCommands(level, [
      { type: 'addWall', wall: { id: 'a', points, width: 0.16 } },
      { type: 'setWallWidth', wallIds: ['a'], width: 0.3 }
    ])
    expect(a.walls[0].width).toBe(0.3)
    points[0][0] = 99
    expect(a.walls[0].points[0][0]).toBe(0)
    expect(applyCommand(a, { type: 'removeLines', ids: ['a'] }).walls).toEqual([])
    expect(level.walls).toEqual([])
  })
})

describe('editor store', () => {
  it('previews without history, commits with history, undoes and redoes', () => {
    const store = createEditorStore(createLevel({ name: 'L' }))
    store.preview([{ type: 'addWall', wall: wall('a', [[0, 0], [1, 0]]) }])
    expect(store.working.walls.length).toBe(1)
    expect(store.level.walls.length).toBe(0)
    expect(store.canUndo).toBe(false)
    store.cancelPreview()
    expect(store.working.walls.length).toBe(0)
    store.commit('Draw', [{ type: 'addWall', wall: wall('a', [[0, 0], [1, 0]]) }])
    expect(store.level.walls.length).toBe(1)
    expect(store.history).toEqual(['Open', 'Draw'])
    store.undo()
    expect(store.level.walls.length).toBe(0)
    expect(store.canRedo).toBe(true)
    store.redo()
    expect(store.level.walls.length).toBe(1)
  })

  it('re-derives units on commit and keeps their identity', () => {
    const store = createEditorStore(createLevel({ name: 'L', walls: starterWalls() }), { reconcile: true })
    store.commit('Settle')
    expect(store.level.units.length).toBe(3)
    const ids = store.level.units.map(u => u.id)
    store.commit('Move', [{ type: 'moveNodes', moves: [{ from: [5, 3], to: [5.5, 3] }] }])
    expect(store.level.units.map(u => u.id)).toEqual(ids)
    expect(store.conflicts).toEqual([])
    store.commit('Split', [{ type: 'addWall', wall: wall('cut', [[0, 5], [10, 5]]) }])
    expect(store.level.units.length).toBe(4)
  })

  it('notifies subscribers and caps history', () => {
    const store = createEditorStore(createLevel({ name: 'L' }), { historyLimit: 2 })
    let calls = 0
    const off = store.subscribe(() => calls++)
    for (let i = 0; i < 4; i++) store.commit(`c${i}`, [{ type: 'addWall', wall: wall(`w${i}`, [[i, 0], [i + 1, 0]]) }])
    expect(calls).toBe(4)
    expect(store.history.length).toBe(3)
    off()
    store.undo()
    expect(calls).toBe(4)
  })
})

describe('one line between two nodes', () => {
  const twoNodes = (l: Line) => l.points.map(p => `${p[0]},${p[1]}`).sort().join('|')
  /** Whether a line passes within the minimum feature of a point: the same place, as the document reads it. */
  const covers = (lines: Line[], p: Vec2) => lines.some(l => {
    const [a, b] = l.points
    const t = ((p[0] - a[0]) * (b[0] - a[0]) + (p[1] - a[1]) * (b[1] - a[1])) / ((b[0] - a[0]) ** 2 + (b[1] - a[1]) ** 2)
    return t >= -1e-9 && t <= 1 + 1e-9 && Math.hypot(a[0] + t * (b[0] - a[0]) - p[0], a[1] + t * (b[1] - a[1]) - p[1]) < 0.01
  })
  it('however a straight line comes to lie on another (again, reversed, overlapping part of it, in pieces, a hair off), a commit leaves one line there, the widest, still drawing everything that was drawn', () => {
    for (const angle of [0, 30, 90, 137]) {
      const r = (angle * Math.PI) / 180
      const at = (x: number, y = 0): Vec2 => [Math.round((x * Math.cos(r) - y * Math.sin(r)) * 1e6) / 1e6, Math.round((x * Math.sin(r) + y * Math.cos(r)) * 1e6) / 1e6]
      const base: Wall = { id: 'base', points: [at(0), at(4)], width: 0.16 }
      const ways: Record<string, Wall[]> = {
        again: [{ id: 'x', points: [at(0), at(4)], width: 0.32 }],
        reversed: [{ id: 'x', points: [at(4), at(0)], width: 0.1 }],
        'overlapping part': [{ id: 'x', points: [at(1), at(6)], width: 0.2 }],
        'in pieces': [{ id: 'x', points: [at(0), at(1.5)], width: 0.16 }, { id: 'y', points: [at(1.5), at(4)], width: 0.16 }],
        'a hair off': [{ id: 'x', points: [at(0.004, 0.003), at(4, -0.002)], width: 0.2 }]
      }
      for (const [way, extra] of Object.entries(ways)) {
        for (const order of [[base, ...extra], [...extra, base]]) {
          const out = normalizeLines(order)
          const keys = out.filter(l => !l.curve).map(twoNodes)
          expect(new Set(keys).size, `${way} at ${angle}°`).toBe(keys.length)
          for (const x of [0.25, 1, 2, 3.75, ...(way === 'overlapping part' ? [5, 5.75] : [])]) expect(covers(out, at(x)), `${way} at ${angle}°, ${x} m along`).toBe(true)
          const widest = Math.max(...order.map(w => w.width))
          expect(Math.max(...out.filter(w => covers([w], at(2))).map(w => w.width)), `${way} at ${angle}°`).toBe(widest)
          expect(out.filter(w => covers([w], at(2))).length, `${way} at ${angle}°: one line under the middle`).toBe(1)
        }
      }
    }
  })

  it('two different curves between the same two nodes are two lines; the same curve twice is one', () => {
    const a: Vec2 = [0, 0]
    const b: Vec2 = [4, 0]
    const up: Line = { id: 'up', points: [a, b], curve: [[1, 1.5], [3, 1.5]] }
    const down: Line = { id: 'down', points: [a, b], curve: [[1, -1.5], [3, -1.5]] }
    const upAgain: Line = { id: 'again', points: [b, a], curve: [[3, 1.5], [1, 1.5]] }
    expect(normalizeLines([up, down]).map(l => l.id).sort()).toEqual(['down', 'up'])
    expect(normalizeLines([up, upAgain]).map(l => l.id)).toEqual(['up'])
    expect(normalizeLines([up, { id: 'straight', points: [a, b] }]).length).toBe(2)
  })
})
