import { describe, it, expect } from 'vitest'
import { cursorCss, systemCursor } from '$lib/nimap-editor/cursors'
import { resizeCursor, rotateCursor, directional, type CursorName } from '$lib/nimap'

const DARK = { fill: 'white', line: 'black' }
const LIGHT = { fill: 'black', line: 'white' }
const STATIC: CursorName[] = ['arrow', 'arrow-add', 'arrow-remove', 'arrow-heal', 'arrow-wall', 'arrow-fixture', 'arrow-door', 'arrow-window', 'move', 'grab', 'grabbing', 'not-allowed']

describe('cursors', () => {
  it('every name is a 32 px SVG data URL with a hotspot and a keyword fallback, in both colourings, the same string each time', () => {
    for (const theme of [DARK, LIGHT]) {
      for (const name of [...STATIC, resizeCursor(0), resizeCursor(45), rotateCursor(90), rotateCursor(270)]) {
        const css = cursorCss(name, theme)
        expect(css.startsWith('url("data:image/svg+xml,')).toBe(true)
        expect(css).toMatch(/\) (9 7|16 16), [a-z-]+$/)
        expect(decodeURIComponent(css)).toContain("width='32' height='32' viewBox='0 0 32 32'")
        expect(css.includes("'")).toBe(false)
        expect(cursorCss(name, theme)).toBe(css)
      }
      expect(cursorCss('arrow', theme)).not.toBe(cursorCss('arrow-heal', theme))
      expect(cursorCss('arrow', theme).endsWith(' default')).toBe(true)
      expect(cursorCss('arrow-add', theme).endsWith(' copy')).toBe(true)
    }
  })

  it('directional names carry a quantised angle and map to the nearest native resize keyword; system mode is keywords only', () => {
    expect(resizeCursor(3)).toBe('resize@5')
    expect(resizeCursor(182)).toBe('resize@0')
    expect(rotateCursor(-90)).toBe('rotate@270')
    expect(directional('resize@45')).toEqual({ kind: 'resize', angle: 45 })
    expect(directional('move')).toBeNull()
    expect(systemCursor('resize@0')).toBe('ew-resize')
    expect(systemCursor('resize@45')).toBe('nwse-resize')
    expect(systemCursor('resize@90')).toBe('ns-resize')
    expect(systemCursor('resize@135')).toBe('nesw-resize')
    expect(systemCursor('rotate@90')).toBe('grab')
    expect(systemCursor('flip@90')).toBe('pointer')
    expect(decodeURIComponent(cursorCss('flip@45', DARK))).toContain('rotate(45 16 16)')
    for (const name of STATIC) expect(cursorCss(name, DARK, true)).toBe(systemCursor(name))
    expect(decodeURIComponent(cursorCss('rotate@90', DARK))).toContain('rotate(90 16 16)')
  })
})
