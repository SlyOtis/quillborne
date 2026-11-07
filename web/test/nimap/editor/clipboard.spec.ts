import { describe, it, expect } from 'vitest'
import { createLevel } from '$lib/nimap'
import type { Fixture, Level } from '$lib/nimap'
import { Editor } from '$lib/nimap-editor/editor.svelte'
import { EMPTY_SELECTION } from '$lib/nimap'

const keys = { shift: false, alt: false, ctrl: false, meta: false }
const cmd = { ...keys, meta: true }
const rect = (p: string, x: number, y: number, w: number, h: number) => {
  const c: [number, number][] = [[x, y], [x + w, y], [x + w, y + h], [x, y + h]]
  return c.map((q, i) => ({ id: `${p}${i}`, points: [q, c[(i + 1) % 4]] as [[number, number], [number, number]] }))
}
const tables = (level: Level) => level.fixtures.filter(f => f.kind === 'table')
const centre = (f: Fixture) => {
  const xs = f.polygon!.outer.map(p => p[0])
  const ys = f.polygon!.outer.map(p => p[1])
  return [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2]
}

function tableEditor() {
  const editor = new Editor({ level: createLevel({ name: 'L', fixtureLines: rect('t', 0, 0, 1.6, 0.8) }) })
  editor.setViewportSize(800, 600)
  editor.viewBox = { x: -1, y: -7, width: 12, height: 9 }
  editor.setStage('furnish')
  const table = editor.level.fixtures[0]
  const place = { edge: 't0', t: 0.25 }
  editor.commit('Table', [{ type: 'setFixture', fixtureId: table.id, patch: { kind: 'table', roles: { t0: 'seating', t2: 'seating' }, recipe: { kind: 'table', version: 1, parameters: { chair: 'officeChair', placed: [place] } } } }])
  editor.select({ ...EMPTY_SELECTION, fixtureIds: new Set([table.id]) })
  return { editor, table: editor.level.fixtures[0] }
}

describe('copy and paste on the fixture layer', () => {
  it('a copied table goes into the hand, follows the pointer and is put down by a click with its kind, roles and placed chairs on its own new lines, the original untouched; Escape lets go of it', () => {
    const { editor, table } = tableEditor()
    expect(editor.keyDown('c', cmd)).toBe(true)
    expect(editor.keyDown('v', cmd)).toBe(true)
    editor.pointerMove([5.3, 3.4], keys)
    expect(tables(editor.working).length, 'the copy shows in hand').toBe(2)
    expect(tables(editor.level).length, 'nothing is committed yet').toBe(1)
    editor.pointerDown([5.3, 3.4], keys)
    editor.pointerUp([5.3, 3.4], keys)
    const all = tables(editor.level)
    expect(all.length).toBe(2)
    const copy = all.find(f => f.id !== table.id)!
    expect(centre(copy)[0]).toBeCloseTo(5.3, 1)
    expect(centre(copy)[1]).toBeCloseTo(3.4, 1)
    const lines = new Set(copy.signature.split('|'))
    expect([...lines].some(id => table.signature.split('|').includes(id))).toBe(false)
    expect(Object.values(copy.roles!).sort()).toEqual(['seating', 'seating'])
    expect(Object.keys(copy.roles!).every(id => lines.has(id))).toBe(true)
    const placed = (copy.recipe!.parameters as { placed: { edge: string }[] }).placed
    expect(lines.has(placed[0].edge)).toBe(true)
    expect(editor.level.fixtures.find(f => f.id === table.id)).toEqual(table)
    expect([...editor.selection.fixtureIds]).toEqual([copy.id])
    expect(editor.activeToolId).toBe('select')

    editor.keyDown('v', cmd)
    editor.pointerMove([8, 1], keys)
    editor.keyDown('Escape', keys)
    expect(tables(editor.working).length).toBe(2)
    expect(editor.activeToolId).toBe('select')
  })

  it('duplicate goes into the hand, and duplicating what it put down repeats the same offset, so the copies make an even row', () => {
    const { editor } = tableEditor()
    editor.keyDown('d', cmd)
    editor.pointerMove([0.8, 2.4], keys)
    editor.pointerDown([0.8, 2.4], keys)
    editor.pointerUp([0.8, 2.4], keys)
    editor.keyDown('d', cmd)
    editor.keyDown('d', cmd)
    const ys = tables(editor.level).map(f => centre(f)[1]).sort((a, b) => a - b)
    expect(ys.length).toBe(4)
    const steps = ys.slice(1).map((y, i) => y - ys[i])
    for (const step of steps) expect(step).toBeCloseTo(steps[0], 6)
    expect(steps[0]).toBeGreaterThan(1)
  })

  it('walls are not copied', () => {
    const editor = new Editor({ level: createLevel({ name: 'L', walls: rect('w', 0, 0, 4, 3).map(l => ({ ...l, width: 0.16 })) }) })
    editor.select({ ...EMPTY_SELECTION, lineIds: new Set(['w0', 'w1']) })
    expect(editor.keyDown('c', cmd)).toBe(false)
  })
})
