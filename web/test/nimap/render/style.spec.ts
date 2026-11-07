import { describe, expect, it } from 'vitest'
import { bearingOf, levelOptionsOf, lightDirection, lightsOf, pieceLightsOf, KEY_LIGHT, OLD_STYLE, SLATE_LOOK, SLATE_STYLE, type Light } from '$lib/nimap/render'

const directionOf = (l: Light) => (l.type === 'directional' ? lightDirection(l.direction) : null)
const unit = (v: [number, number, number]) => {
  const length = Math.hypot(...v)
  return v.map(c => c / length)
}
const same = (a: { x: number; y: number; z: number } | null, b: number[]) => {
  expect(a).not.toBeNull()
  expect(Math.max(Math.abs(a!.x - b[0]), Math.abs(a!.y - b[1]), Math.abs(a!.z - b[2]))).toBeLessThan(1e-12)
}

describe('styles', () => {
  it('turn any direction into a bearing and back without loss', () => {
    for (let i = 0; i < 200; i++) {
      const v: [number, number, number] = [Math.sin(i * 1.7) * 9, Math.abs(Math.cos(i * 0.9)) * 9 + 0.01, Math.cos(i * 2.3) * 9]
      const d = lightDirection(bearingOf(...v))
      same(d, unit(v))
    }
  })

  it('light the lobby look exactly as the session always did: soft light, the key from its bearing with shadows, the fill from the south-west', () => {
    const lights = lightsOf(SLATE_LOOK.light)
    expect(lights.map(l => l.type)).toEqual(['hemisphere', 'directional', 'directional'])
    expect(lights[0]).toMatchObject({ sky: SLATE_LOOK.light.sky, ground: SLATE_LOOK.light.ground, intensity: SLATE_LOOK.light.soft })
    expect(lights[1]).toMatchObject({ direction: KEY_LIGHT, intensity: SLATE_LOOK.light.key, shadows: true })
    same(directionOf(lights[2]), unit([-14, 9, 16]))
    expect(lights[2]).toMatchObject({ color: SLATE_LOOK.light.fill, intensity: SLATE_LOOK.light.fillStrength })
    expect(SLATE_STYLE.lights).toEqual(lights)
  })

  it('light a piece up close from over the viewer’s left shoulder, the fill from the other side, as the preview always was', () => {
    const lights = pieceLightsOf(SLATE_LOOK.pieceLight)
    same(directionOf(lights[1]), unit([-0.9, 1.3, 0.35]))
    same(directionOf(lights[2]), unit([0.9, 0.5, -0.2]))
  })

  it('light the old look from above, the west and the south, with no shadows', () => {
    const directional = OLD_STYLE.lights.filter(l => l.type === 'directional')
    same(directionOf(directional[0]), [0, 1, 0])
    same(directionOf(directional[1]), [-1, 0, 0])
    same(directionOf(directional[2]), [0, 0, 1])
    expect(OLD_STYLE.lights.some(l => l.type === 'directional' && l.shadows)).toBe(false)
  })

  it('hand the level builder a style’s colours, wall cuts, openings and furniture', () => {
    const style = { ...SLATE_STYLE, walls: { height: 0.8, outerHeight: 2.4, openings: false }, furniture: { show: false } }
    expect(levelOptionsOf(style)).toEqual({ look: style.colours, wallHeight: 0.8, exteriorWallHeight: 2.4, openings: false, fixtures: false })
  })
})
