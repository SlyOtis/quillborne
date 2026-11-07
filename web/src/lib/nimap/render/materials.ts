import { Color, MeshStandardMaterial, SRGBColorSpace } from 'three'

/** The lobby look: slate walls and slab, slate rooms, dark furniture, lit screens, muted greens for plants, steel and black glass in the kitchen, porcelain, linen and a pale glossy pane for a mirror, see-through glass walls in dark frames, a violet accent. */
export const PALETTE = {
  background: 0x17171b,
  wall: 0x5d5d68,
  slab: 0x393941,
  room: 0x3f4d55,
  furniture: 0x3c3c45,
  furnitureDark: 0x32323a,
  tableTop: 0x4a4a54,
  sofa: 0x46464f,
  screen: 0x0e0e14,
  screenLight: 0x6f8fe8,
  plant: 0x4a7a52,
  plantDark: 0x3a6344,
  pot: 0x2e2e35,
  trunk: 0x4a3f38,
  pebble: 0x5c5c66,
  whiteboard: 0xcfd0d6,
  metal: 0x7b7e88,
  blackGlass: 0x17171d,
  porcelain: 0xb3b5be,
  linen: 0x8b8d98,
  mirror: 0xb4c2cf,
  glass: 0xa9c6da,
  glassFrame: 0x2a2a31,
  accent: 0x8b7cf6,
  dim: 0x1f1f26
} as const

/** A colour as three.js takes it: a number such as 0x5d5d68, or a CSS colour such as '#5d5d68'. */
export type Colour = number | string

/**
 * How the map is lit: a soft light from all round (a sky colour above, a
 * ground colour below, a strength), the key light that comes from one
 * direction and casts the shadows, and a weak fill from the other side so
 * shadowed faces are not black. Directions are the session's.
 */
export interface MapLight {
  sky: Colour
  ground: Colour
  soft: number
  key: number
  fill: Colour
  fillStrength: number
}

/**
 * Everything a map is drawn with, as plain values a
 * host may store and mix: the ground behind the map (null leaves it to the
 * host, the view then transparent), the floor, the walls, the rooms, the
 * furniture (tops, seats and darker parts are shades of it),
 * the accent of the pin and its words, the light the map is seen in from
 * afar, and the light a single piece is seen in up close, where a dark
 * look needs more light than the map does and a light one does not.
 */
export interface MapLook {
  background: Colour | null
  floor: Colour
  walls: Colour
  rooms: Colour
  furniture: Colour
  accent: Colour
  light: MapLight
  pieceLight: MapLight
}

/** Slate, the look the map has had all along, the lobby PoC's: a dark ground, slate floor and walls, dark furniture, a cool dusk light with clear shadows. */
export const SLATE_LOOK: MapLook = {
  background: PALETTE.background,
  floor: PALETTE.slab,
  walls: PALETTE.wall,
  rooms: PALETTE.room,
  furniture: PALETTE.furniture,
  accent: PALETTE.accent,
  light: { sky: 0x9aa0c0, ground: 0x27272f, soft: 2.0, key: 1.35, fill: 0xbcc4ff, fillStrength: 0.35 },
  pieceLight: { sky: 0xb4b9d6, ground: 0x3a3a44, soft: 3.2, key: 1.9, fill: 0xbcc4ff, fillStrength: 0.9 }
}

/** Graphite, the designer's grey: slate's look in neutral greys under a neutral light. */
export const GRAPHITE_LOOK: MapLook = {
  background: 0x1c1c1f,
  floor: 0x2e2e30,
  walls: 0x6e6e70,
  rooms: 0x3a3a3d,
  furniture: 0x535356,
  accent: PALETTE.accent,
  light: { sky: 0xb4b4b4, ground: 0x2a2a2a, soft: 2.1, key: 1.3, fill: 0xffffff, fillStrength: 0.3 },
  pieceLight: { sky: 0xc8c8c8, ground: 0x3c3c3c, soft: 3.2, key: 1.8, fill: 0xffffff, fillStrength: 0.8 }
}

/** Light: a pale ground, a light grey floor, white walls and furniture, mostly soft light so shadows stay pale. */
export const LIGHT_LOOK: MapLook = {
  background: 0xdfe4e8,
  floor: 0xc6c8cb,
  walls: 0xf7f7f7,
  rooms: 0xd2d8de,
  furniture: 0xf0f0f0,
  accent: PALETTE.accent,
  light: { sky: 0xffffff, ground: 0xc8c8c8, soft: 2.7, key: 0.65, fill: 0xffffff, fillStrength: 0.3 },
  pieceLight: { sky: 0xffffff, ground: 0xb4b4b4, soft: 2.2, key: 0.9, fill: 0xffffff, fillStrength: 0.35 }
}

/** Whether a ground is light or dark, by its luminance: what text reads over it. */
export function isLight(ground: Colour): boolean {
  const c = new Color(ground)
  return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b > 0.2
}

/** Text that reads over a look's background, for the map's labels and whatever a host writes beside them: near black on a light ground, white on a dark one; the accent for the pin's words. */
export function mapTextColours(look: Partial<MapLook> = {}): { primary: string; secondary: string; accent: string } {
  const background = look.background === undefined ? SLATE_LOOK.background : look.background
  const light = background !== null && isLight(background)
  return {
    primary: light ? '#26292e' : '#ffffff',
    secondary: light ? '#5f6670' : '#b9b9c4',
    accent: look.accent === undefined ? '#9a8cf8' : `#${new Color(look.accent).getHexString()}`
  }
}

/** A shade of a colour, lighter or darker by `lightness` (-1 to 1) as the eye reads it. The furniture's shades are the lobby's own to within a unit or two. */
const shade = (colour: Colour, lightness: number) => {
  const c = new Color(colour)
  const { h, s, l } = c.getHSL({ h: 0, s: 0, l: 0 }, SRGBColorSpace)
  return c.setHSL(h, s, Math.min(1, Math.max(0, l + lightness)), SRGBColorSpace).getHex()
}

export type MaterialName = 'wall' | 'slab' | 'room' | 'furniture' | 'furnitureDark' | 'tableTop' | 'sofa' | 'screen' | 'plant' | 'plantDark' | 'pot' | 'trunk' | 'pebble' | 'whiteboard' | 'metal' | 'blackGlass' | 'porcelain' | 'linen' | 'mirror' | 'glass' | 'glassFrame' | 'pin'

export type Materials = Record<MaterialName, MeshStandardMaterial>


/** One fresh set per level, so a level can be dimmed without touching another; in Slate, or in a host's look for what it gives. */
export function createMaterials(look: Partial<MapLook> = {}): Materials {
  const std = (color: Colour, roughness = 0.9) => new MeshStandardMaterial({ color, roughness })
  const furniture = look.furniture
  return {
    wall: std(look.walls ?? PALETTE.wall),
    slab: std(look.floor ?? PALETTE.slab, 0.95),
    room: std(look.rooms ?? PALETTE.room),
    furniture: std(furniture ?? PALETTE.furniture),
    furnitureDark: std(furniture === undefined ? PALETTE.furnitureDark : shade(furniture, -0.0425)),
    tableTop: std(furniture === undefined ? PALETTE.tableTop : shade(furniture, 0.0575), 0.85),
    sofa: std(furniture === undefined ? PALETTE.sofa : shade(furniture, 0.0375), 0.95),
    screen: new MeshStandardMaterial({ color: PALETTE.screen, emissive: PALETTE.screenLight, emissiveIntensity: 0.55, roughness: 0.6 }),
    plant: std(PALETTE.plant, 0.95),
    plantDark: std(PALETTE.plantDark, 0.95),
    pot: std(PALETTE.pot, 0.95),
    trunk: std(PALETTE.trunk, 0.95),
    pebble: std(PALETTE.pebble, 0.9),
    whiteboard: std(PALETTE.whiteboard, 0.4),
    metal: std(PALETTE.metal, 0.45),
    blackGlass: std(PALETTE.blackGlass, 0.3),
    porcelain: std(PALETTE.porcelain, 0.35),
    linen: std(PALETTE.linen, 0.95),
    mirror: std(PALETTE.mirror, 0.15),
    glass: new MeshStandardMaterial({ color: PALETTE.glass, transparent: true, opacity: 0.3, roughness: 0.25 }),
    glassFrame: std(PALETTE.glassFrame, 0.8),
    pin: new MeshStandardMaterial({ color: look.accent ?? PALETTE.accent, emissive: look.accent ?? PALETTE.accent, emissiveIntensity: 0.35, roughness: 0.5 }),
  }
}

const DIM = new Color(PALETTE.dim)

/** Remembers each material's own colour and glow so dimming can be applied by amount and undone. */
export interface Dimmer {
  /** 0 is the material's own colour, 1 is almost the dim colour. */
  apply(amount: number): void
}

export function createDimmer(materials: Materials): Dimmer {
  const originals = Object.values(materials).map(m => ({ m, color: m.color.clone(), glow: m.emissiveIntensity }))
  return {
    apply(amount) {
      for (const { m, color, glow } of originals) {
        m.color.copy(color).lerp(DIM, amount * 0.93)
        m.emissiveIntensity = glow * (1 - amount * 0.97)
      }
    }
  }
}

export function disposeMaterials(materials: Materials): void {
  for (const m of Object.values(materials)) m.dispose()
}
