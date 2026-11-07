import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { readDocument, writeDocument, storeMap, resolveBindings, createDocument, createLevel, createEditorStore, FORMAT_VERSION, READER_VERSION } from '$lib/nimap'
import type { Binding, MapDocument } from '$lib/nimap'
import { buildLevel } from '$lib/nimap/render'

const golden = (name: string) => JSON.parse(readFileSync(new URL(`../fixtures/golden/${name}`, import.meta.url), 'utf8'))

describe('reading stored maps', () => {
  it('every map saved by an earlier version reads as meant and renders every level', () => {
    const files = readdirSync(new URL('../fixtures/golden/', import.meta.url)).filter(f => f.endsWith('.json'))
    expect(files.length).toBeGreaterThanOrEqual(FORMAT_VERSION)
    for (const file of files) {
      const read = readDocument(golden(file))
      expect(read.status, `${file}: ${read.warnings.join('; ')}`).toBe('ok')
      for (const level of read.document!.levels) {
        const built = buildLevel(level)
        expect(built.warnings, file).toEqual([])
        built.dispose()
      }
    }
  })

  it('a map that needs a newer reader is refused, not shown wrongly; a newer one an older reader can show is read with what it cannot use left out and said', () => {
    const v2 = golden('map-v2.json')
    expect(readDocument({ ...v2, version: READER_VERSION + 1, minReader: READER_VERSION + 1 })).toMatchObject({ status: 'tooNew', document: null })
    const odd = v2.levels[0].fixtures[0]
    const newer = { ...v2, version: READER_VERSION + 1, minReader: READER_VERSION, levels: v2.levels.map((l: Record<string, unknown>, i: number) => (i ? l : { ...l, lights: [{ id: 'x' }], fixtures: [{ ...odd, kind: 'aquarium' }] })) }
    const read = readDocument(newer)
    expect(read.status).toBe('degraded')
    expect(read.document!.levels[0].fixtures.find(f => f.id === odd.id)!.kind).toBe('object')
    expect(read.warnings.length).toBeGreaterThan(0)
    for (const level of read.document!.levels) expect(() => buildLevel(level).dispose()).not.toThrow()
  })

  it('a broken record is left out and said, never thrown; anything that is not a map is invalid', () => {
    const v1 = golden('map-v1.json')
    const broken = { ...v1, levels: [{ ...v1.levels[0], walls: [...v1.levels[0].walls, { id: 'bad', points: [[0, 0]], width: 0.1 }, 'nonsense'] }, 42] }
    const read = readDocument(broken)
    expect(read.status).toBe('degraded')
    expect(read.document!.levels.length).toBe(1)
    expect(read.document!.levels[0].walls.length).toBe(v1.levels[0].walls.length)
    for (const input of [null, 7, 'map', {}, { format: 'svg' }]) expect(readDocument(input).status).toBe('invalid')
  })

  it('a level’s ceiling height and a wall’s own height are kept through a store and a read; a ceiling that is not a positive number is left out and said', () => {
    const level = { ...createEditorStore(createLevel({ name: 'L', walls: [{ id: 'a', points: [[0, 0], [4, 0]], width: 0.1, height: 1.1 }, { id: 'b', points: [[4, 0], [4, 3]], width: 0.1 }] })).level, height: 3.1 }
    const stored = JSON.parse(JSON.stringify(storeMap(createDocument({ name: 'M', levels: [level] }), []).document))
    const read = readDocument(stored)
    expect(read.status).toBe('ok')
    expect(read.document!.levels[0].height).toBe(3.1)
    expect(read.document!.levels[0].walls.map(w => w.height)).toEqual([1.1, undefined])
    for (const bad of [0, -2, 'tall', null]) {
      const again = readDocument({ ...stored, levels: [{ ...stored.levels[0], height: bad }] })
      expect(again.status, String(bad)).toBe('degraded')
      expect(again.document!.levels[0].height, String(bad)).toBeUndefined()
    }
  })

  it('a written map says the format it was written in and the oldest reader it needs', () => {
    const written = writeDocument(createDocument({ name: 'M', levels: [createLevel({ name: '1' })] }))
    expect([written.version, written.minReader]).toEqual([FORMAT_VERSION, 2])
    expect(readDocument(written).status).toBe('ok')
  })
})

describe('storing maps', () => {
  const v1 = () => readDocument(golden('map-v1.json')).document!
  const layer = (doc: MapDocument, bindings: Binding[]) => ({ format: 'nimap-bindings' as const, version: 1 as const, mapId: doc.id, bindings })

  it('only what was drawn and declared is stored, and reading it back gives the same rooms and fixtures, the same declared identity, every binding still resolving', () => {
    const doc = v1()
    const level = doc.levels[0]
    const plain = level.units.find(u => !u.name && u.category === 'unspecified' && !u.hidden)!
    const bindings: Binding[] = [{ id: 'b', features: [plain.id], label: 'Bound plain room' }]
    const stored = storeMap(doc, bindings)
    const text = JSON.stringify(stored.document)
    expect(text.length).toBeLessThan(JSON.stringify(golden('map-v1.json')).length)
    expect(text).not.toContain('"polygon"')
    expect(text).not.toContain('"signature"')
    const back = readDocument(JSON.parse(text))
    expect(back.status, back.warnings.join('; ')).toBe('ok')
    const again = back.document!.levels[0]
    expect(again.units.length).toBe(level.units.length)
    expect(again.fixtures.length).toBe(level.fixtures.length)
    expect(again.units.filter(u => u.name).map(u => u.name).sort()).toEqual(level.units.filter(u => u.name).map(u => u.name).sort())
    expect(again.fixtures.map(f => [f.kind, !!f.recipe, f.items?.length ?? 0])).toEqual(level.fixtures.map(f => [f.kind, !!f.recipe, f.items?.length ?? 0]))
    expect(resolveBindings(back.document!, layer(back.document!, stored.bindings)).missing.size).toBe(0)
    const boundRoom = again.units.find(u => u.id === stored.bindings[0].features[0])!
    expect(Math.abs(boundRoom.anchor[0] - plain.anchor[0]) + Math.abs(boundRoom.anchor[1] - plain.anchor[1])).toBeLessThan(1e-6)
  })

  it('ids are short counts from the document, stable from one store to the next, and never given twice, not even after the thing holding one is deleted', () => {
    const stored = storeMap(v1(), [])
    const ids = stored.document.levels.flatMap(l => [...l.walls, ...l.fixtureLines, ...l.openings].map(r => r.id))
    expect(ids.every(id => /^[0-9a-z]{1,4}$/.test(id))).toBe(true)
    const read = () => readDocument(JSON.parse(JSON.stringify(stored.document))).document!
    expect(JSON.stringify(storeMap(read(), []).document)).toBe(JSON.stringify(stored.document))

    const doc = read()
    const last = doc.levels[0].walls.reduce((a, b) => (parseInt(a.id, 36) > parseInt(b.id, 36) ? a : b))
    const store = createEditorStore(doc.levels[0])
    store.commit('Delete', [{ type: 'removeLines', ids: [last.id] }])
    const trimmed = storeMap({ ...doc, levels: [store.level, ...doc.levels.slice(1)] }, [])
    const reread = readDocument(JSON.parse(JSON.stringify(trimmed.document))).document!
    const added = createEditorStore(reread.levels[0])
    added.commit('Draw', [{ type: 'addWall', wall: { id: 'fresh-uuid', points: [[40, 40], [42, 40]], width: 0.1 } }])
    const next = storeMap({ ...reread, levels: [added.level, ...reread.levels.slice(1)] }, [])
    const newWall = next.document.levels[0].walls.find(w => w.points[0][0] === 40)!
    expect(newWall.id).not.toBe(last.id)
    expect(parseInt(newWall.id, 36)).toBeGreaterThanOrEqual(stored.document.nextId!)
  })
})
