import { describe, it, expect } from 'vitest'
import { createDocument, createLevel, createEditorStore, createBindings, resolveBindings, validateBindings, statusByFeature, bindingsFromDocument, linkKey, withLinkNames } from '$lib/nimap'
import type { Line, MapDocument } from '$lib/nimap'
import { demoLevel } from '../fixtures/demo-building.fixture'

const demo = (): MapDocument => createDocument({ name: 'Demo', levels: [demoLevel()] })

const rect = (prefix: string, x0: number, y0: number, x1: number, y1: number): Line[] => [
  { id: `${prefix}1`, points: [[x0, y0], [x1, y0]] },
  { id: `${prefix}2`, points: [[x1, y0], [x1, y1]] },
  { id: `${prefix}3`, points: [[x1, y1], [x0, y1]] },
  { id: `${prefix}4`, points: [[x0, y1], [x0, y0]] }
]

describe('bindings: what features of a map mean for one use of it', () => {
  it('a map written before data layers carries over: each space one binding over its rooms, each named or linked room outside a space its own, every one covered once, and the layer valid', () => {
    const map = demo()
    const level = map.levels[0]
    const layer = createBindings(map, bindingsFromDocument(map))
    expect(validateBindings(map, layer)).toEqual([])
    const resolved = resolveBindings(map, layer)
    expect(resolved.missing.size).toBe(0)
    for (const space of level.spaces ?? []) {
      const b = resolved.byFeature.get(space.units[0])!
      expect(b.label).toBe(space.name)
      expect([...b.features].sort()).toEqual([...space.units].sort())
      for (const u of space.units) expect(resolved.byFeature.get(u)).toBe(b)
    }
    const inSpace = new Set((level.spaces ?? []).flatMap(s => s.units))
    for (const u of level.units.filter(u => !inSpace.has(u.id))) {
      const b = resolved.byFeature.get(u.id)
      if (!u.name && !u.ref) expect(b).toBeUndefined()
      else {
        expect(b!.features).toEqual([u.id])
        expect(b!.label).toBe(u.name || undefined)
        expect(b!.link).toEqual(u.ref)
      }
    }
  })

  it('statuses per link reach every feature of the binding that carries the link, and nothing else', () => {
    const map = demo()
    const layer = createBindings(map, bindingsFromDocument(map))
    const resolved = resolveBindings(map, layer)
    const linked = resolved.bindings.filter(r => r.binding.link)
    const statuses = new Map(linked.map((r, i) => [linkKey(r.binding.link!), i % 2 ? 'busy' : 'free']))
    const byFeature = statusByFeature(resolved, statuses)
    for (const [i, r] of linked.entries()) for (const f of r.features) expect(byFeature.get(f.id)).toBe(i % 2 ? 'busy' : 'free')
    const covered = new Set(linked.flatMap(r => r.features.map(f => f.id)))
    expect([...byFeature.keys()].every(id => covered.has(id))).toBe(true)
  })

  it('a binding may cover traced objects as it covers rooms, and names what an edit made vanish as missing, not as an error', () => {
    const store = createEditorStore(createLevel({ name: 'L', fixtureLines: [...rect('a', 0, 0, 1, 1), ...rect('b', 3, 0, 4, 1)] }))
    const map = createDocument({ name: 'Objects', levels: [store.level] })
    const [first, second] = store.level.fixtures
    const layer = createBindings(map, [{ id: 'desks', features: [first.id, second.id], link: { kind: 'bookable', id: 'd1' } }])
    const resolved = resolveBindings(map, layer)
    expect(resolved.bindings[0].features.map(f => f.kind)).toEqual(['object', 'object'])
    store.commit('Remove', [{ type: 'removeLines', layer: 'fixtures', ids: ['b1', 'b2', 'b3', 'b4'] }])
    const after = createDocument({ name: 'Objects', id: map.id, levels: [store.level] })
    const again = resolveBindings(after, layer)
    expect(again.missing.get('desks')).toEqual([second.id])
    expect(again.bindings[0].features.map(f => f.id)).toEqual([first.id])
    expect(validateBindings(after, layer)).toEqual([])
  })

  it('a layer is refused for another map, an empty binding, a duplicate id, or a feature in two bindings', () => {
    const map = demo()
    const [a, b] = map.levels[0].units
    const problems = validateBindings(map, { ...createBindings(map, [
      { id: 'x', features: [a.id] },
      { id: 'x', features: [] },
      { id: 'y', features: [a.id, b.id] }
    ]), mapId: 'elsewhere' })
    expect(problems).toHaveLength(4)
    expect(problems.join(' | ')).toMatch(/elsewhere.*used twice.*covers no feature.*in bindings x and y/)
  })
})

describe('applyBindings', async () => {
  const { applyBindings, createDocument: doc } = await import('$lib/nimap')
  it('a level read through its bindings has the names, links and spaces the bindings give, and none of its own', () => {
    const level = demoLevel()
    const [a, b, c] = level.units
    const next = applyBindings(level, [
      { id: 'one', features: [a.id], label: 'Alpha', link: { kind: 'meetingroom', id: 'm1' } },
      { id: 'two', features: [b.id, c.id], label: 'Pair', link: { kind: 'bookable', id: 'p' } }
    ])
    expect(next.units.find(u => u.id === a.id)).toMatchObject({ name: 'Alpha', ref: { kind: 'meetingroom', id: 'm1' } })
    expect(next.units.find(u => u.id === b.id)!.name).toBe('')
    expect(next.units.filter(u => u.id !== a.id).every(u => !u.ref)).toBe(true)
    expect(next.spaces).toEqual([{ id: 'two', name: 'Pair', category: b.category, units: [b.id, c.id], ref: { kind: 'bookable', id: 'p' } }])
    expect(applyBindings(level, bindingsFromDocument(doc({ name: 'd', levels: [level] }))).units.map(u => [u.name, u.ref])).toEqual(level.units.map(u => [(level.spaces ?? []).some(s => s.units.includes(u.id)) ? '' : u.name, (level.spaces ?? []).some(s => s.units.includes(u.id)) ? undefined : u.ref]))
  })

  it('every object a binding covers takes its label as name and its link as ref, and an unbound one has no ref', () => {
    const store = createEditorStore(createLevel({ name: 'L', fixtureLines: [...rect('a', 0, 0, 1, 1), ...rect('b', 3, 0, 4, 1)] }))
    const [desk, other] = store.level.fixtures
    const next = applyBindings({ ...store.level, fixtures: store.level.fixtures.map(f => ({ ...f, ref: { kind: 'old', id: 'x' } })) }, [{ id: 'd', features: [desk.id], label: 'Desk 4', link: { kind: 'bookable', id: 'b4' } }])
    expect(next.fixtures.find(f => f.id === desk.id)).toMatchObject({ name: 'Desk 4', ref: { kind: 'bookable', id: 'b4' } })
    expect(next.fixtures.find(f => f.id === other.id)!.ref).toBeUndefined()
  })
})

describe('names from the host', () => {
  it('a linked binding with no label of its own is named as its link is, a label overrides that name, and a binding with no link keeps what it has', () => {
    const names = new Map([['r1', 'Everest'], ['r2', 'K2']])
    const nameOf = (link: { id: string }) => names.get(link.id)
    const bindings = [
      { id: 'a', features: ['u1'], link: { kind: 'meetingroom', id: 'r1' } },
      { id: 'b', features: ['u2'], link: { kind: 'meetingroom', id: 'r2' }, label: 'Kitchen' },
      { id: 'c', features: ['u3'], label: 'Lobby' },
      { id: 'd', features: ['u4'], link: { kind: 'meetingroom', id: 'gone' } }
    ]
    expect(withLinkNames(bindings, nameOf).map(b => b.label)).toEqual(['Everest', 'Kitchen', 'Lobby', undefined])
  })
})
