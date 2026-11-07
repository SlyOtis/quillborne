import { describe, expect, it } from 'vitest'
import { styleOfViewProps } from '$lib/nimap-editor/view-props'
import { LIGHT_LOOK, LOBBY_VIEW, SLATE_STYLE, lightsOf } from '$lib/nimap/render'

describe('the map view’s older look props', () => {
  it('read as the lobby style when none are given', () => {
    expect(styleOfViewProps({})).toEqual(SLATE_STYLE)
  })

  it('carry a look’s colours and light, the lobby camera, and walls cut where asked, the outer ones with them unless given', () => {
    const style = styleOfViewProps({ look: LIGHT_LOOK, wallHeight: 0.9, fixtures: false, openings: false })
    expect(style.camera).toEqual(LOBBY_VIEW)
    expect(style.lights).toEqual(lightsOf(LIGHT_LOOK.light))
    expect(style.colours.background).toBe(LIGHT_LOOK.background)
    expect(style.walls).toEqual({ height: 0.9, outerHeight: 0.9, openings: false })
    expect(style.furniture.show).toBe(false)
    expect(styleOfViewProps({ wallHeight: 0.9, exteriorWallHeight: 2.4 }).walls.outerHeight).toBe(2.4)
  })
})
