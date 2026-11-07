import { describe, it, expect } from 'vitest'
import { levelToSvg } from '$lib/nimap'
import { Editor } from '$lib/nimap-editor/editor.svelte'
import { demoLevel } from '../fixtures/demo-building.fixture'

const keys = { shift: false, alt: false, ctrl: false, meta: false }

describe('the plan’s wall solids while editing', () => {
  it('while a node is dragged the plan follows the hand, and once released it is exactly the full solve of the committed level', () => {
    const editor = new Editor({ level: demoLevel() })
    editor.setViewportSize(1200, 600)
    editor.viewBox = { x: -1, y: -16, width: 36, height: 18 }
    editor.setTool('select')
    const node = editor.level.walls[0].points[0]
    const committed = editor.svg.walls
    editor.pointerDown(node, keys)
    for (let i = 1; i <= 5; i++) editor.pointerMove([node[0] + i * 0.1, node[1] - i * 0.08], keys)
    expect(editor.svg.walls).not.toEqual(committed)
    editor.pointerUp([node[0] + 0.5, node[1] - 0.4], keys)
    expect(editor.history.length).toBeGreaterThan(1)
    const full = levelToSvg(editor.level, { flipY: false })
    expect(editor.svg.walls).toEqual(full.walls)
    expect(editor.svg.wallBoundary).toBe(full.wallBoundary)
  })
})
