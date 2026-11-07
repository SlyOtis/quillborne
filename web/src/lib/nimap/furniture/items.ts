import type { Polygon, Vec2 } from '../geometry/vector'
import type { Part } from './parts'
import { boxPart, cylinderPart, facing, prismPart, transformParts, translation } from './parts'

export type StockKind =
  | 'officeChair'
  | 'meetingChair'
  | 'stool'
  | 'monitor'
  | 'tv'
  | 'whiteboard'
  | 'sink'
  | 'hob'
  | 'coffeeMachine'
  | 'microwave'
  | 'kettle'
  | 'basin'
  | 'binOpening'
  | 'toilet'
  | 'wallToilet'
  | 'urinal'
  | 'mirror'
  | 'washbasin'
  | 'bin'

/**
 * A thing with one fixed shape, placed rather than traced, in designs that
 * read from above: seats on a centre column with a round foot, no legs,
 * since a leg is a pixel wide at map distance. Every stock item faces +y in
 * its own frame. A standing item stands on z = 0 centred on the origin; a
 * wall item hangs with its back on y = 0 and its bottom edge on z = 0,
 * centred on x.
 */
export interface StockItem {
  kind: StockKind
  name: string
  mount: 'stand' | 'wall'
  parts: Part[]
}

/** A round foot on the floor and a column up to `height`: what every seat stands on. */
const pedestalBase = (foot: number, column: number, height: number): Part[] => [
  cylinderPart(foot, 0.02, 'furnitureDark'),
  cylinderPart(column, height - 0.02, 'furnitureDark', [0, 0, 0.02], { segments: 12 })
]

function officeChair(): Part[] {
  return [
    ...pedestalBase(0.26, 0.04, 0.42),
    boxPart([0.48, 0.46, 0.07], 'furniture', [0, 0.02, 0.42], 'seat'),
    boxPart([0.46, 0.06, 0.48], 'furniture', [0, -0.21, 0.49], 'back'),
    ...[-1, 1].map(side => boxPart([0.05, 0.26, 0.165], 'furnitureDark', [side * 0.255, 0.02, 0.49]))
  ]
}

function meetingChair(): Part[] {
  return [...pedestalBase(0.2, 0.035, 0.43), boxPart([0.44, 0.42, 0.05], 'furniture', [0, 0, 0.43], 'seat'), boxPart([0.44, 0.04, 0.4], 'furniture', [0, -0.19, 0.48], 'back')]
}

function stool(): Part[] {
  return [...pedestalBase(0.2, 0.035, 0.7), cylinderPart(0.18, 0.05, 'furniture', [0, 0, 0.7], { role: 'seat' })]
}

function monitor(): Part[] {
  return [
    boxPart([0.22, 0.16, 0.015], 'furnitureDark', [0, -0.05, 0]),
    boxPart([0.05, 0.03, 0.3], 'furnitureDark', [0, -0.03, 0.015], 'stand'),
    boxPart([0.54, 0.03, 0.32], 'furnitureDark', [0, 0, 0.1]),
    boxPart([0.51, 0.006, 0.29], 'screen', [0, 0.018, 0.115], 'screen')
  ]
}

function tv(): Part[] {
  return [boxPart([1.24, 0.05, 0.72], 'furnitureDark', [0, 0.025, 0], 'back'), boxPart([1.2, 0.006, 0.68], 'screen', [0, 0.053, 0.02], 'screen')]
}

function whiteboard(): Part[] {
  return [boxPart([1.2, 0.02, 0.9], 'whiteboard', [0, 0.01, 0.02], 'board'), boxPart([1, 0.06, 0.02], 'furnitureDark', [0, 0.03, 0], 'tray')]
}

/** A sink set on a worktop: a steel rim, the dark of its bowl beside a drainer, and a tap at the back bending over the bowl. */
function sink(): Part[] {
  return [
    boxPart([0.8, 0.5, 0.008], 'metal'),
    boxPart([0.42, 0.34, 0.002], 'furnitureDark', [-0.14, 0.02, 0.008], 'body'),
    boxPart([0.28, 0.34, 0.002], 'pebble', [0.24, 0.02, 0.008]),
    cylinderPart(0.02, 0.26, 'metal', [-0.14, -0.2, 0.008], { segments: 12, role: 'back' }),
    boxPart([0.03, 0.17, 0.025], 'metal', [-0.14, -0.105, 0.243])
  ]
}

/** A hob: a plate of black glass with four cooking zones and the controls along its front. */
function hob(): Part[] {
  return [
    boxPart([0.58, 0.51, 0.006], 'blackGlass', [0, 0, 0], 'body'),
    ...[[-0.14, 0.1, 0.09], [0.14, 0.1, 0.075], [-0.14, -0.12, 0.075], [0.14, -0.12, 0.09]].map(([x, y, r]) => cylinderPart(r, 0.002, 'furnitureDark', [x, y, 0.006], { segments: 24 })),
    boxPart([0.3, 0.02, 0.002], 'furnitureDark', [0, 0.22, 0.006], 'front')
  ]
}

/** A coffee machine: a tower at the back, a head reaching forward over the cup, a lit display on its face, and a drip tray in front. */
function coffeeMachine(): Part[] {
  return [
    boxPart([0.28, 0.24, 0.38], 'furnitureDark', [0, -0.08, 0], 'body'),
    boxPart([0.28, 0.12, 0.1], 'furnitureDark', [0, 0.1, 0.28]),
    boxPart([0.1, 0.004, 0.05], 'screen', [0, 0.162, 0.305]),
    cylinderPart(0.06, 0.07, 'furniture', [0, -0.1, 0.38], { segments: 14 }),
    boxPart([0.24, 0.12, 0.02], 'metal', [0, 0.1, 0], 'front')
  ]
}

/** A microwave: a box with a door of black glass across its face and a panel of controls at its side. */
function microwave(): Part[] {
  return [
    boxPart([0.46, 0.36, 0.28], 'furniture', [0, 0, 0], 'body'),
    boxPart([0.42, 0.004, 0.24], 'blackGlass', [0, 0.182, 0.02], 'front'),
    boxPart([0.09, 0.004, 0.24], 'furnitureDark', [0.165, 0.186, 0.02])
  ]
}

/** A kettle on its base, its spout at the front. */
function kettle(): Part[] {
  return [
    cylinderPart(0.095, 0.015, 'furnitureDark', [0, 0, 0], { segments: 16 }),
    cylinderPart(0.08, 0.19, 'metal', [0, 0, 0.015], { top: 0.065, segments: 16, role: 'body' }),
    boxPart([0.03, 0.06, 0.03], 'metal', [0, 0.085, 0.13], 'front')
  ]
}

/** A basin set in a top, as on a vanity: the kitchen sink's shape at a bathroom's size, a flat porcelain rim with the dark of a square bowl in it and a tap behind. */
function basin(): Part[] {
  return [
    boxPart([0.5, 0.4, 0.01], 'porcelain'),
    boxPart([0.36, 0.26, 0.002], 'furnitureDark', [0, 0.03, 0.01], 'body'),
    cylinderPart(0.018, 0.2, 'metal', [0, -0.15, 0.01], { segments: 12, role: 'back' }),
    boxPart([0.025, 0.1, 0.02], 'metal', [0, -0.1, 0.19])
  ]
}

/** An opening in a top for waste, as on a recycling station: a steel rim, the dark below it, and a label plate in front. */
function binOpening(): Part[] {
  return [
    cylinderPart(0.14, 0.004, 'metal', [0, 0, 0], { segments: 24, role: 'body' }),
    cylinderPart(0.115, 0.002, 'furnitureDark', [0, 0, 0.004], { segments: 24 }),
    boxPart([0.12, 0.025, 0.002], 'furnitureDark', [0, 0.18, 0], 'front')
  ]
}

/** A shape seen from above, square at the back and rounded at its front corners by `radius`, with its back edge on `back` and its front toward +y. */
function lid(width: number, depth: number, back: number, radius: number): Polygon {
  const corner = (cx: number, from: number): Vec2[] => Array.from({ length: 7 }, (_, i): Vec2 => [cx + radius * Math.cos(from + (Math.PI / 2) * (i / 6)), back + depth - radius + radius * Math.sin(from + (Math.PI / 2) * (i / 6))])
  return { outer: [[-width / 2, back], [width / 2, back], ...corner(width / 2 - radius, 0), ...corner(-width / 2 + radius, Math.PI / 2)], holes: [] }
}

/** A toilet bowl's top: its width, how far it reaches forward, and the rounding of its front corners. */
const BOWL = { width: 0.36, radius: 0.14, taper: 1.38 }
/** A closed lid reaches this far past the bowl at the sides and front, and rests this far above it, so a line of shadow shows all round. */
const LID = { overhang: 0.005, gap: 0.01, thickness: 0.04 }

/** A toilet's bowl, its top `width` wide reaching from `back` to `front`, narrowing downward at the front and sides with its back straight. */
function bowl(back: number, front: number, height: number, width = BOWL.width): Part {
  const t = BOWL.taper
  return { shape: { type: 'prism', polygon: lid(width / t, (front - back) / t, 0, BOWL.radius / t), height, top: t }, material: 'porcelain', transform: translation(0, back, 0) }
}

/** The closed lid over a bowl reaching to `front`: the bowl's own outline grown by the overhang, from `back` forward, resting the gap above `top`. */
const closedLid = (back: number, front: number, top: number): Part =>
  prismPart(lid(BOWL.width + 2 * LID.overhang, front + LID.overhang - back, back, BOWL.radius + LID.overhang), top + LID.gap, LID.thickness, 'porcelain', 'body')

/** A toilet: a bowl running back under the cistern and narrowing to the floor, its closed lid a line above it, and the cistern on the back of the bowl with a flush button on top. */
function toilet(): Part[] {
  return [
    bowl(-0.3, 0.36, 0.38),
    closedLid(-0.145, 0.36, 0.38),
    boxPart([0.34, 0.15, 0.42], 'porcelain', [0, -0.22, 0.38], 'back'),
    cylinderPart(0.025, 0.006, 'metal', [0, -0.22, 0.8], { segments: 16 })
  ]
}

/** A toilet hanging on the wall: a bowl out from the wall narrowing underneath, its closed lid a line above it, and a flush plate on the wall above that. */
function wallToilet(): Part[] {
  return [bowl(0, 0.52, 0.2), closedLid(0, 0.52, 0.2), boxPart([0.24, 0.012, 0.16], 'metal', [0, 0.006, 0.55], 'back')]
}

/** A urinal hanging on the wall: a body out from the wall narrowing downward, the dark of its bowl open in its top, and a flush plate on the wall above it. */
function urinal(): Part[] {
  return [
    bowl(0, 0.34, 0.55, 0.36),
    prismPart(lid(0.28, 0.26, 0.05, 0.1), 0.55, 0.002, 'furnitureDark', 'body'),
    boxPart([0.1, 0.012, 0.14], 'metal', [0, 0.006, 0.8], 'back')
  ]
}

/** A mirror on the wall: a pale, glossy pane on a thin dark backing, read as a mirror rather than reflecting anything. */
function mirror(): Part[] {
  return [boxPart([0.6, 0.006, 0.8], 'furnitureDark', [0, 0.003, 0], 'back'), boxPart([0.58, 0.006, 0.78], 'mirror', [0, 0.009, 0.01], 'screen')]
}

/** A washbasin standing on its own pedestal: a straight column, the basin on it with the dark of a square bowl, and a tap at the back. */
function washbasin(): Part[] {
  return [
    boxPart([0.16, 0.14, 0.72], 'porcelain'),
    boxPart([0.56, 0.44, 0.13], 'porcelain', [0, 0.02, 0.72]),
    boxPart([0.38, 0.26, 0.002], 'furnitureDark', [0, 0.06, 0.85], 'body'),
    cylinderPart(0.018, 0.14, 'metal', [0, -0.15, 0.85], { segments: 12, role: 'back' }),
    boxPart([0.025, 0.1, 0.02], 'metal', [0, -0.1, 0.97])
  ]
}

/** A pedal bin: a steel body, a lid, and the pedal at its front. */
function bin(): Part[] {
  return [
    cylinderPart(0.15, 0.55, 'metal', [0, 0, 0], { top: 0.16, segments: 20, role: 'body' }),
    cylinderPart(0.165, 0.03, 'furnitureDark', [0, 0, 0.55], { segments: 20 }),
    boxPart([0.12, 0.08, 0.02], 'furnitureDark', [0, 0.18, 0], 'front')
  ]
}

export const STOCK_ITEMS: Record<StockKind, StockItem> = {
  officeChair: { kind: 'officeChair', name: 'Office chair', mount: 'stand', parts: officeChair() },
  meetingChair: { kind: 'meetingChair', name: 'Meeting chair', mount: 'stand', parts: meetingChair() },
  stool: { kind: 'stool', name: 'Bar stool', mount: 'stand', parts: stool() },
  monitor: { kind: 'monitor', name: 'Monitor', mount: 'stand', parts: monitor() },
  tv: { kind: 'tv', name: 'TV', mount: 'wall', parts: tv() },
  whiteboard: { kind: 'whiteboard', name: 'Whiteboard', mount: 'wall', parts: whiteboard() },
  sink: { kind: 'sink', name: 'Sink', mount: 'stand', parts: sink() },
  hob: { kind: 'hob', name: 'Hob', mount: 'stand', parts: hob() },
  coffeeMachine: { kind: 'coffeeMachine', name: 'Coffee machine', mount: 'stand', parts: coffeeMachine() },
  microwave: { kind: 'microwave', name: 'Microwave', mount: 'stand', parts: microwave() },
  kettle: { kind: 'kettle', name: 'Kettle', mount: 'stand', parts: kettle() },
  basin: { kind: 'basin', name: 'Basin', mount: 'stand', parts: basin() },
  binOpening: { kind: 'binOpening', name: 'Bin opening', mount: 'stand', parts: binOpening() },
  toilet: { kind: 'toilet', name: 'Toilet', mount: 'stand', parts: toilet() },
  wallToilet: { kind: 'wallToilet', name: 'Wall-hung toilet', mount: 'wall', parts: wallToilet() },
  urinal: { kind: 'urinal', name: 'Urinal', mount: 'wall', parts: urinal() },
  mirror: { kind: 'mirror', name: 'Mirror', mount: 'wall', parts: mirror() },
  washbasin: { kind: 'washbasin', name: 'Washbasin', mount: 'stand', parts: washbasin() },
  bin: { kind: 'bin', name: 'Pedal bin', mount: 'stand', parts: bin() }
}

/** A stock item standing at `at` on a surface `elevation` metres up, or hanging on a wall face there, its front toward `front`. */
export const placeItem = (kind: StockKind, at: Vec2, front: Vec2, elevation = 0): Part[] => transformParts(STOCK_ITEMS[kind].parts, facing(at, front, elevation))
