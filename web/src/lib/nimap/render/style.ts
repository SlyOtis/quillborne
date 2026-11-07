import type { Colour, MapLight } from './materials'
import { KEY_LIGHT, type CameraView, type KeyLight } from './session'
import type { LevelOptions } from './level'

/**
 * A light in the scene. Directions are where the light comes from, a
 * compass bearing (clockwise from north) and a height above the horizon, in
 * degrees, fixed to the building; a rotate in a host turns the camera and
 * every light by the same amount.
 */
export type Light =
  | { type: 'hemisphere'; sky: Colour; ground: Colour; intensity: number }
  | { type: 'ambient'; color: Colour; intensity: number }
  | { type: 'directional'; direction: KeyLight; color: Colour; intensity: number; shadows?: boolean }

/**
 * How a map is drawn, as plain values a host can store, mix and change:
 * the camera's home (where the view starts and where fitting returns), the
 * lights, the colours of the building, and what of it is drawn. Live state
 * (status, the pin, selection) and data drawn on the map are not style.
 */
export interface MapStyle {
  version: 1
  camera: CameraView
  lights: Light[]
  colours: { background: Colour | null; floor: Colour; walls: Colour; rooms: Colour; furniture: Colour; accent: Colour }
  /** Metres: where walls are cut, and where the walls on the building's outline are. Openings are cut out of them or not. */
  walls: { height: number; outerHeight: number; openings: boolean }
  furniture: { show: boolean }
}

/** Where a light comes from as a bearing and a height, from a direction in the scene's frame (x east, y up, z south). */
export function bearingOf(x: number, y: number, z: number): KeyLight {
  const length = Math.hypot(x, y, z)
  const elevation = Math.asin(y / length)
  return { azimuth: ((Math.atan2(x, -z) * 180) / Math.PI + 360) % 360, elevation: (elevation * 180) / Math.PI }
}

/** The lobby look's fill, from the south-west, low. */
const FILL_LIGHT = bearingOf(-14, 9, 16)

/** A look's light as lights: the soft light from all round, the key that casts shadows, the weak fill from the other side. */
export function lightsOf(light: MapLight, key: KeyLight = KEY_LIGHT, fill: KeyLight = FILL_LIGHT): Light[] {
  return [
    { type: 'hemisphere', sky: light.sky, ground: light.ground, intensity: light.soft },
    { type: 'directional', direction: key, color: 0xffffff, intensity: light.key, shadows: true },
    { type: 'directional', direction: fill, color: light.fill, intensity: light.fillStrength }
  ]
}


/** What the level builder takes from a style: the colours, where walls are cut, whether openings and furniture are drawn. */
export function levelOptionsOf(style: MapStyle): Pick<LevelOptions, 'look' | 'wallHeight' | 'exteriorWallHeight' | 'openings' | 'fixtures'> {
  return {
    look: style.colours,
    wallHeight: style.walls.height,
    exteriorWallHeight: style.walls.outerHeight,
    openings: style.walls.openings,
    fixtures: style.furniture.show
  }
}
