import { describe, it, expect } from 'vitest'
import { createLevel } from '$lib/nimap'
import type { Wall } from '$lib/nimap'
import { Editor } from '$lib/nimap-editor/editor.svelte'

const wall = (id: string, points: [[number, number], [number, number]], width = 0.16): Wall => ({ id, points, width })
const keys = { shift: false, alt: false, ctrl: false, meta: false }

function editorWith(walls: Wall[]) {
  const editor = new Editor({ level: createLevel({ name: 'L', walls }), cursorColours: { fill: 'white', line: 'black' } })
  editor.setViewportSize(800, 600)
  editor.viewBox = { x: -1, y: -7, width: 8, height: 6 }
  editor.setTool('wall-pen')
  return editor
}

describe('the wall in hand', () => {
  it('plus and minus step the pen width in the wall pen and show it at the cursor; in the select tool they go to the selection', () => {
    const editor = editorWith([wall('a', [[0, 0], [4, 0]], 0.3)])
    editor.pointerMove([2, 2], keys)
    expect(editor.keyDown('+', keys)).toBe(true)
    expect(editor.wallWidth).toBe(0.17)
    expect(editor.hud).toBe('17 cm')
    editor.keyDown('=', keys)
    expect(editor.wallWidth).toBe(0.18)
    editor.keyDown('-', { ...keys, shift: true })
    expect(editor.wallWidth).toBe(0.13)
    expect(editor.history).toEqual(['Open'])
    editor.setTool('select')
    editor.pointerDown([1, 0.02], keys)
    editor.pointerUp([1, 0.02], keys)
    editor.keyDown('+', keys)
    expect(editor.level.walls[0].width).toBe(0.31)
    editor.keyDown('-', { ...keys, shift: true })
    expect(editor.level.walls[0].width).toBe(0.26)
    expect(editor.wallWidth).toBe(0.13)
    expect(editor.history.at(-1)).toBe('Wall width')
  })

  it('Alt+wheel steps the width once per notch of travel, up when scrolling up, in both tools', () => {
    const editor = editorWith([wall('a', [[0, 0], [4, 0]], 0.3)])
    editor.pointerMove([2, 2], keys)
    for (let i = 0; i < 6; i++) editor.wheelWidth(-4, false)
    expect(editor.wallWidth).toBe(0.17)
    editor.wheelWidth(-100, false)
    expect(editor.wallWidth).toBe(0.21)
    editor.wheelWidth(48, true)
    expect(editor.wallWidth).toBe(0.16)
    editor.wheelWidth(4, true)
    expect(editor.wallWidth).toBe(0.11)
    editor.setTool('select')
    editor.pointerDown([1, 0.02], keys)
    editor.pointerUp([1, 0.02], keys)
    editor.wheelWidth(-24, false)
    expect(editor.level.walls[0].width).toBe(0.31)
    expect(editor.wallWidth).toBe(0.11)
  })

  it('Q over a wall gives the pen that wall width, over nothing changes nothing, whichever tool is active', () => {
    const editor = editorWith([wall('a', [[0, 0], [4, 0]], 0.3), wall('b', [[4, 0], [4, 3]], 0.08)])
    for (const tool of ['wall-pen', 'select'] as const) {
      editor.setTool(tool)
      editor.wallWidth = 0.16
      editor.pointerMove([2, 0.02], keys)
      expect(editor.keyDown('q', keys)).toBe(true)
      expect(editor.wallWidth).toBe(0.3)
      expect(editor.hud).toBe('30 cm')
      editor.pointerMove([4.02, 1.5], keys)
      editor.keyDown('q', keys)
      expect(editor.wallWidth).toBe(0.08)
      editor.pointerMove([4, 0], keys)
      editor.keyDown('q', keys)
      expect(editor.wallWidth).toBe(0.3)
      editor.pointerMove([2, 2], keys)
      expect(editor.keyDown('q', keys)).toBe(false)
      expect(editor.wallWidth).toBe(0.3)
    }
  })
})

describe('the cursor is named by the situation and drawn by the editor', () => {
  it('Alt over a node shows the heal badge in any tool, the pens carry their layer, and system mode falls back to keywords', () => {
    const editor = editorWith([wall('a', [[0, 0], [4, 0]], 0.3)])
    editor.pointerMove([2, 2], keys)
    expect(editor.cursorName).toBe('arrow-wall')
    editor.pointerMove([4, 0], { ...keys, alt: true })
    expect(editor.cursorName).toBe('arrow-heal')
    editor.setTool('select')
    editor.pointerMove([4, 0], { ...keys, alt: true })
    expect(editor.cursorName).toBe('arrow-heal')
    editor.pointerMove([2, 2], keys)
    expect(editor.cursorName).toBe('arrow')
    expect(editor.cursor.startsWith('url("data:image/svg+xml,')).toBe(true)
    editor.systemCursors = true
    expect(editor.cursor).toBe('default')
    editor.setTool('door')
    expect(editor.cursorName).toBe('arrow-door')
    expect(editor.cursor).toBe('default')
  })
})

describe('stages in the editor', () => {
  const level = () => createLevel({ name: 'L', walls: [wall('a', [[0, 0], [4, 0]], 0.2)], fixtureLines: [{ id: 'f', points: [[1, 2], [3, 2]] }] })
  const make = () => {
    const editor = new Editor({ level: level() })
    editor.setViewportSize(800, 600)
    editor.viewBox = { x: -1, y: -7, width: 8, height: 6 }
    return editor
  }

  it('in Trace a room is selected by a click inside it, in Furnish it cannot be touched', () => {
    const editor = new Editor({ level: createLevel({ name: 'L', walls: [wall('n', [[0, 0], [4, 0]]), wall('e', [[4, 0], [4, 3]]), wall('s', [[4, 3], [0, 3]]), wall('w', [[0, 3], [0, 0]])] }) })
    editor.setViewportSize(800, 600)
    editor.viewBox = { x: -1, y: -7, width: 8, height: 6 }
    editor.pointerDown([2, 1.5], keys)
    editor.pointerUp([2, 1.5], keys)
    expect([...editor.selection.unitIds]).toEqual([editor.level.units[0].id])
    expect(editor.inspector.sections.map(s => s.label)).toEqual(['Room'])
    editor.setStage('furnish')
    editor.pointerDown([2, 1.5], keys)
    editor.pointerUp([2, 1.5], keys)
    expect(editor.selection.unitIds.size).toBe(0)
  })

  it('opens in Trace resting in select; in Trace a fixture line cannot be touched, in Furnish a wall cannot', () => {
    const editor = make()
    expect(editor.activeStage).toBe('trace')
    expect(editor.activeToolId).toBe('select')
    editor.pointerDown([1.5, 2.02], keys)
    editor.pointerUp([1.5, 2.02], keys)
    expect(editor.selection.lineIds.size).toBe(0)
    editor.pointerDown([1, 0.02], keys)
    editor.pointerUp([1, 0.02], keys)
    expect([...editor.selection.lineIds]).toEqual(['a'])
    editor.setStage('furnish')
    expect(editor.selection.lineIds.size).toBe(0)
    expect(editor.activeToolId).toBe('select')
    editor.pointerDown([1, 0.02], keys)
    editor.pointerUp([1, 0.02], keys)
    expect(editor.selection.lineIds.size).toBe(0)
    editor.pointerDown([1.5, 2.02], keys)
    editor.pointerUp([1.5, 2.02], keys)
    expect([...editor.selection.lineIds]).toEqual(['f'])
    expect(editor.effectiveLayers.walls.locked).toBe(true)
    expect(editor.effectiveLayers.fixtures.locked).toBe(false)
  })

  it('a tool key enters the stage that offers the tool; Escape walks a drawing tool back to select', () => {
    const editor = make()
    editor.keyDown('f', keys)
    expect(editor.activeStage).toBe('furnish')
    expect(editor.activeToolId).toBe('fixture-pen')
    editor.keyDown('d', keys)
    expect(editor.activeStage).toBe('trace')
    expect(editor.activeToolId).toBe('door')
    editor.keyDown('Escape', keys)
    expect(editor.activeToolId).toBe('select')
    editor.keyDown('p', keys)
    editor.pointerMove([1, 1], keys)
    editor.pointerDown([1, 1], keys)
    editor.pointerUp([1, 1], keys)
    expect(editor.tools.tools['wall-pen'].state).toBe('drawing')
    editor.keyDown('Escape', keys)
    expect(editor.activeToolId).toBe('wall-pen')
    expect(editor.tools.tools['wall-pen'].state).toBe('idle')
    editor.keyDown('Escape', keys)
    expect(editor.activeToolId).toBe('select')
    editor.setStage('setup')
    expect(editor.toolsEnabled).toBe(false)
    expect(editor.cursorName).toBe('arrow')
  })
})

describe('the inspector follows the selection', () => {
  it('a click on a wall shows its width; a change there is one history entry, and the canvas and the panel read the same level', () => {
    const editor = editorWith([wall('a', [[0, 0], [4, 0]], 0.3), wall('b', [[0, 3], [4, 3]], 0.2)])
    editor.setTool('select')
    expect(editor.inspector.sections).toEqual([])
    editor.pointerDown([1, 0.02], keys)
    editor.pointerUp([1, 0.02], keys)
    const [section] = editor.inspector.sections
    expect(section.label).toBe('Wall')
    const width = section.fields.find(f => f.key === 'width')!
    expect(width.value).toBe(30)
    editor.inspector.apply(width.set(45))
    expect(editor.level.walls.find(w => w.id === 'a')!.width).toBe(0.45)
    expect(editor.inspector.sections[0].fields[0].value).toBe(45)
    expect(editor.history.at(-1)).toBe('Wall width')
    editor.inspector.apply(editor.inspector.sections[0].actions.find(a => a.key === 'delete')!.run())
    expect(editor.level.walls.map(w => w.id)).toEqual(['b'])
    expect(editor.inspector.sections).toEqual([])
  })
})

describe('the preview follows the hand', () => {
  it('while a selected table is dragged, the panel’s preview shows it where the hand has it, before anything is committed', () => {
    const editor = new Editor({ level: createLevel({ name: 'L', fixtureLines: [{ id: 'r0', points: [[0, 0], [2, 0]] }, { id: 'r1', points: [[2, 0], [2, 1]] }, { id: 'r2', points: [[2, 1], [0, 1]] }, { id: 'r3', points: [[0, 1], [0, 0]] }] }) })
    editor.setViewportSize(800, 600)
    editor.viewBox = { x: -1, y: -4, width: 8, height: 6 }
    editor.setStage('furnish')
    const id = editor.level.fixtures[0].id
    editor.commit('Table', [{ type: 'setFixture', fixtureId: id, patch: { kind: 'table', roles: { r0: 'seating' } } }])
    editor.pointerDown([1, 0.5], keys)
    editor.pointerUp([1, 0.5], keys)
    const top = () => editor.inspector.sections[0].preview!.find(p => p.role === 'top')!
    const before = JSON.stringify(top())
    editor.pointerDown([1, 0.5], keys)
    editor.pointerMove([1.5, 0.8], keys)
    editor.pointerMove([2, 1.1], keys)
    expect(editor.history.at(-1)).not.toBe('Move')
    expect(JSON.stringify(top())).not.toBe(before)
    editor.pointerUp([2, 1.1], keys)
    expect(editor.history.at(-1)).toBe('Move')
  })
})

describe('the browser taking the pointer', () => {
  it('drops the gesture in hand as Escape does: no preview left, nothing committed, the tool at rest for the next press', () => {
    const editor = new Editor({ level: createLevel({ name: 'L', walls: [wall('a', [[0, 0], [4, 0]]), wall('b', [[4, 0], [4, 3]])] }) })
    editor.setViewportSize(800, 600)
    editor.viewBox = { x: -1, y: -4, width: 8, height: 6 }
    editor.pointerDown([4, 0], keys)
    editor.pointerMove([4.5, 1], keys)
    expect(editor.working).not.toBe(editor.level)
    editor.interrupt()
    expect(editor.working).toBe(editor.level)
    expect(editor.history).toEqual(['Open'])
    editor.pointerMove([5, 2], keys)
    editor.pointerUp([5, 2], keys)
    expect(editor.level.walls.map(w => w.points)).toEqual([[[0, 0], [4, 0]], [[4, 0], [4, 3]]])
    editor.pointerDown([4, 3], keys)
    editor.pointerMove([4.5, 3.5], keys)
    editor.pointerUp([4.5, 3.5], keys)
    expect(editor.level.walls[1].points).toEqual([[4, 0], [4.5, 3.5]])
  })
})

describe('the command key in select', () => {
  it('brings bend to the front while held: the bar, the cursor and the overlay are bend\'s; a bend started with it lasts until the mouse is released, while the bar returns to select at once', () => {
    const editor = editorWith([wall('a', [[0, 0], [4, 0]])])
    editor.setTool('select')
    const command = { ...keys, command: true }
    editor.pointerMove([1, 0.02], keys)
    expect(editor.cursorName).not.toBe('arrow-bend')
    editor.modifiersChanged(command)
    expect(editor.shownToolId).toBe('bend')
    expect(editor.cursorName).toBe('arrow-bend')
    expect(editor.overlay.some(o => o.type === 'hover')).toBe(false)
    editor.pointerMove([2, 3], command)
    expect(editor.cursorName).toBe('arrow')
    editor.pointerDown([1, 0.02], command)
    editor.pointerMove([1, 0.3], command)
    editor.modifiersChanged(keys)
    expect(editor.shownToolId).toBe('select')
    expect(editor.cursorName).toBe('grabbing')
    editor.pointerMove([1, 0.5], keys)
    editor.pointerUp([1, 0.5], keys)
    expect(editor.level.walls[0].curve).toBeDefined()
    expect(editor.level.walls[0].points).toEqual([[0, 0], [4, 0]])
    expect(editor.history.at(-1)).toBe('Bend')
    expect(editor.activeToolId).toBe('select')
    expect(editor.frontToolId).toBe('select')
  })

  it('pressed only during a drag, the line moves', () => {
    const moved = editorWith([wall('a', [[0, 0], [4, 0]])])
    moved.setTool('select')
    moved.pointerDown([1, 0.02], keys)
    moved.pointerMove([1, 0.5], { ...keys, command: true })
    moved.pointerUp([1, 0.5], { ...keys, command: true })
    expect(moved.level.walls[0].curve).toBeUndefined()
    expect(moved.level.walls[0].points[0][1]).toBeCloseTo(0.48, 2)
  })
})
