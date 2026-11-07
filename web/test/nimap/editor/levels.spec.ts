import { describe, it, expect } from 'vitest'
import { createDocument, createEditorStore, createLevel } from '$lib/nimap'
import type { Binding, Wall } from '$lib/nimap'
import { addLevel, orderedLevels, removeLevel, renameLevel, withLevel } from '$lib/nimap-editor/levels'

const wall = (id: string, points: [[number, number], [number, number]]): Wall => ({ id, points, width: 0.16 })
const room = (prefix: string) => createEditorStore(createLevel({ name: prefix, walls: [wall(`${prefix}0`, [[0, 0], [4, 0]]), wall(`${prefix}1`, [[4, 0], [4, 4]]), wall(`${prefix}2`, [[4, 4], [0, 4]]), wall(`${prefix}3`, [[0, 4], [0, 0]])] })).level

describe('levels of a document', () => {
  it('a new level goes on top and each keeps its place; the document owns names and places, the editor the rest; removing one takes the bindings only it held, never the last level', () => {
    const ground = room('g')
    let document = createDocument({ name: 'Map', levels: [ground] })
    const first = addLevel(document)
    const second = addLevel(first.document)
    document = second.document
    expect(orderedLevels(document).map(l => l.id)).toEqual([ground.id, first.level.id, second.level.id])
    expect(new Set(document.levels.map(l => l.ordinal)).size).toBe(3)

    document = renameLevel(document, first.level.id, 'Mezzanine')
    const edited = { ...room('m'), id: first.level.id, name: 'stale', ordinal: 99 }
    document = withLevel(document, edited)
    const kept = document.levels.find(l => l.id === first.level.id)!
    expect([kept.name, kept.ordinal, kept.walls.length]).toEqual(['Mezzanine', first.level.ordinal, 4])
    expect(document.levels.find(l => l.id === ground.id)).toBe(ground)

    const [groundRoom, upperRoom] = [ground.units[0].id, kept.units[0].id]
    const bindings: Binding[] = [
      { id: 'a', features: [groundRoom] },
      { id: 'b', features: [upperRoom] },
      { id: 'c', features: [groundRoom, upperRoom] }
    ]
    const removed = removeLevel(document, bindings, first.level.id)
    expect(removed.document.levels.map(l => l.id)).toEqual([ground.id, second.level.id])
    expect(removed.bindings.map(b => b.id)).toEqual(['a', 'c'])
    const alone = createDocument({ name: 'Map', levels: [ground] })
    expect(removeLevel(alone, bindings, ground.id).document).toBe(alone)
  })
})
