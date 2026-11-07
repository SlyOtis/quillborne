import { describe, it, expect } from 'vitest'
import { KINDS, kindOf, selectedOf, touched, createHitService, buildEditGraph, createLevel, createEditorStore, placeOpenings, EMPTY_SELECTION, DEFAULT_LAYERS, isEmptySelection } from '$lib/nimap'
import type { Wall, Line, Opening, Vec2, Kind, KindHit } from '$lib/nimap'

const wall = (id: string, points: [[number, number], [number, number]], width = 0.2): Wall => ({ id, points, width })
const line = (id: string, points: [[number, number], [number, number]]): Line => ({ id, points })
const door: Opening = { id: 'd1', kind: 'door', at: [4.5, 0], width: 0.9, from: 0, to: 2.1, swing: { side: 1, hinge: 0 } }

/** One thing of every kind, and a point that hits each, body first. */
const scene = () => {
  const level = createEditorStore(createLevel({ name: 'L', walls: [wall('a', [[0, 0], [6, 0]]), wall('b', [[6, 0], [6, 6]]), wall('c', [[6, 6], [0, 6]]), wall('d', [[0, 6], [0, 0]])], fixtureLines: [line('fa', [[1, 2], [3, 2]]), line('fb', [[3, 2], [3, 4]]), line('fc', [[3, 4], [1, 4]]), line('fd', [[1, 4], [1, 2]])], openings: [door] })).level
  const graph = buildEditGraph(level.walls, level.fixtureLines)
  const hit = createHitService(graph, level.fixtures, DEFAULT_LAYERS, 0.1, [], placeOpenings(level.openings, level.walls), level.units)
  const at: Record<string, Vec2> = { wall: [2, 0.02], 'fixture-line': [1.5, 2.02], fixture: [2, 3], opening: [4.5, 0.03], room: [5, 5] }
  return { level, graph, hit, at }
}

describe('kinds: every kind answers the same questions', () => {
  it('each kind hits its own thing, names its id, lives in one selection set, and a press selects it alone, toggles it under Shift, and starts its gesture', () => {
    const { level, graph, hit, at } = scene()
    const ctx = { level, graph }
    for (const kind of KINDS) {
      const h = hit.at(at[kind.id]) as KindHit
      expect(h, kind.id).not.toBeNull()
      expect(kindOf(h)).toBe(kind)
      const id = kind.idOf(h)
      const only = kind.only(id)
      expect(kind.has(only, id)).toBe(true)
      expect(selectedOf(kind, only, graph)).toEqual([id])
      for (const other of KINDS) if (other !== kind) expect(selectedOf(other, only, graph)).toEqual([])
      const press = kind.press(h, EMPTY_SELECTION, false, ctx)
      expect(press.gesture).not.toBe('none')
      if ('selection' in press) expect(kind.has(press.selection, id)).toBe(true)
      const toggledOn = kind.press(h, EMPTY_SELECTION, true, ctx)
      expect(toggledOn.gesture).not.toBe('none')
      const toggledOff = kind.press(h, only, true, ctx)
      expect(toggledOff.gesture).toBe('none')
      expect(isEmptySelection((toggledOff as { selection: typeof only }).selection)).toBe(true)
      expect(kind.cursor(h, EMPTY_SELECTION)).toBe('arrow')
      expect(kind.cursor(h, only)).toBe('move')
      if (kind.id === 'room') expect(kind.remove([id], ctx), 'a room’s walls are its neighbours’ too').toEqual([])
      else expect(kind.remove([id], ctx).length).toBeGreaterThan(0)
      expect(kind.remove([], ctx)).toEqual([])
    }
  })

  it('a part answers only on a selected thing: a wall’s face and a door’s leaf and arc are the body of an unselected one', () => {
    const { hit } = scene()
    for (const p of [[2, 0.09], [2, -0.09], [4.05, 0.5], [4.05 + 0.9 * Math.SQRT1_2, 0.9 * Math.SQRT1_2]] as Vec2[]) {
      const h = hit.at(p) as KindHit
      expect(h.kind === 'line' || h.kind === 'opening', `${p}`).toBe(true)
      const part = (h as { part: string }).part
      expect(part, `${p}`).not.toBe('body')
      expect((touched(h, EMPTY_SELECTION) as { part: string }).part, `${p}`).toBe('body')
      const kind = kindOf(h)
      expect((touched(h, kind.only(kind.idOf(h))) as { part: string }).part, `${p}`).toBe(part)
    }
  })

  it('the hit order is the registry order, so a smaller thing wins where kinds overlap', () => {
    const { hit } = scene()
    const order = KINDS.map(k => k.id)
    expect(order).toEqual(['opening', 'fixture-line', 'fixture', 'wall', 'room'])
    expect((hit.at([2, 2.02]) as KindHit).kind).toBe('line')
    expect((hit.at([4.5, 0.03]) as KindHit).kind).toBe('opening')
    expect((hit.at([4.5, 0.19]) as KindHit).kind).toBe('line')
  })

  it('a kind with widths steps them from each thing’s own width; the others step nothing', () => {
    const { level, graph } = scene()
    const ctx = { level, graph }
    const stepping = KINDS.filter((k): k is Kind & Required<Pick<Kind, 'stepWidth'>> => !!k.stepWidth)
    expect(stepping.map(k => k.id)).toEqual(['opening', 'wall'])
    expect(stepping.find(k => k.id === 'wall')!.stepWidth(['a'], 1, false, ctx).commands).toEqual([{ type: 'setWallWidth', wallIds: ['a'], width: 0.21 }])
    expect(stepping.find(k => k.id === 'opening')!.stepWidth(['d1'], -1, true, ctx).commands).toEqual([{ type: 'setOpening', openingId: 'd1', patch: { width: 0.85, at: [4.5, 0] } }])
    for (const k of stepping) expect(k.stepWidth([], 1, false, ctx).commands).toEqual([])
  })
})
