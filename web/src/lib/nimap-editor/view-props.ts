import { lightsOf, LOBBY_VIEW, SLATE_LOOK, type MapLook, type MapStyle } from '$lib/nimap/render'

export interface ViewLookProps {
  look?: Partial<MapLook>
  wallHeight?: number
  exteriorWallHeight?: number
  fixtures?: boolean
  openings?: boolean
}

export function styleOfViewProps(props: ViewLookProps): MapStyle {
  const look = { ...SLATE_LOOK, ...props.look }
  const height = props.wallHeight || 1.15
  return {
    version: 1,
    camera: LOBBY_VIEW,
    lights: lightsOf(look.light),
    colours: { background: look.background, floor: look.floor, walls: look.walls, rooms: look.rooms, furniture: look.furniture, accent: look.accent },
    walls: { height, outerHeight: props.exteriorWallHeight || height, openings: props.openings ?? true },
    furniture: { show: props.fixtures ?? true }
  }
}
