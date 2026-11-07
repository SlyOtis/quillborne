import { GRAPHITE_LOOK, LIGHT_LOOK, SLATE_LOOK, type MapLight, type MapLook } from './materials'
import { ISOMETRIC_VIEW, LOBBY_VIEW, type CameraView } from './session'
import { bearingOf, lightsOf, type Light, type MapStyle } from './style'

/**
 * Ready-made styles and lights nimap offers its hosts: values to use, copy
 * or change. Nothing in the renderer reads them; a host passes whichever
 * style it wants.
 */

/** A single piece up close: the key from above the viewer's left shoulder, the fill low from the other side, so the faces in view are lit. */
const PIECE_KEY = bearingOf(-0.9, 1.3, 0.35)
const PIECE_FILL = bearingOf(0.9, 0.5, -0.2)

/** A look's close-up light as lights, for one piece seen up close: the editor's preview and its pictures. */
export const pieceLightsOf = (light: MapLight): Light[] => lightsOf(light, PIECE_KEY, PIECE_FILL)

const fromLook = (look: MapLook, camera: CameraView = LOBBY_VIEW): MapStyle => ({
  version: 1,
  camera,
  lights: lightsOf(look.light),
  colours: { background: look.background, floor: look.floor, walls: look.walls, rooms: look.rooms, furniture: look.furniture, accent: look.accent },
  walls: { height: 1.15, outerHeight: 1.15, openings: true },
  furniture: { show: true }
})

/** The lobby look, the map's own since the PoC: dark slate, a dusk light with shadows, seen from the south-west, high. */
export const SLATE_STYLE = fromLook(SLATE_LOOK)
export const GRAPHITE_STYLE = fromLook(GRAPHITE_LOOK)
export const LIGHT_STYLE = fromLook(LIGHT_LOOK)

/**
 * The old map's look: true isometric, rooms as blocks in their colour on a
 * white floor, no walls or furniture, lit flat by four lights and no
 * shadows, as the first 3D map matched the old drawn map (the device's
 * `3d-map` branch): soft light all round, strong from above for the tops,
 * from the south for the lighter sides and the west for the darker ones.
 */
export const OLD_STYLE: MapStyle = {
  version: 1,
  camera: ISOMETRIC_VIEW,
  lights: [
    { type: 'ambient', color: 0xffffff, intensity: 0.7 },
    { type: 'directional', direction: { azimuth: 0, elevation: 90 }, color: 0xffffff, intensity: 2.426 },
    { type: 'directional', direction: { azimuth: 270, elevation: 0 }, color: 0xffffff, intensity: 1.292 },
    { type: 'directional', direction: { azimuth: 180, elevation: 0 }, color: 0xffffff, intensity: 1.847 }
  ],
  colours: { background: null, floor: 0xffffff, walls: 0xffffff, rooms: 0xe2e2e2, furniture: 0xdfdfdf, accent: SLATE_LOOK.accent },
  walls: { height: 0, outerHeight: 0, openings: false },
  furniture: { show: false }
}
