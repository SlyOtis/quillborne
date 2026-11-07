import { COUNTER_BANDS, casework, caseworkEdges, createLevel, deriveUnits, desk, placeItem, planter, pointInRing, pottedPlant, polygonEdges, resultParts, sofa, sofaEdges, splitAtContacts, table, transformParts, translation } from '$lib/nimap/index'
import type { CaseworkBand, Level, Opening, Part, PlantKind, Space, UnitCategory, Vec2, Wall, Unit } from '$lib/nimap/index'

/** Lobby PoC plan pixels are 3 cm each; the PoC is y-down, the document is y-up. */
const PX = 0.03
const pt = ([x, y]: [number, number]): Vec2 => [x * PX, -y * PX]

const SHELL: [number, number][] = [[0, 0], [1067, 0], [1067, 600], [700, 600], [700, 500], [0, 500]]

/**
 * Interior runs with the PoC's door gaps closed; the doors are openings in
 * them (`demoDoors`). The fronts of Gaustadtoppen and McKinley are glass,
 * as in the PoC. Where the PoC has Boks 1 and 2 in the south-west,
 * this plan has a bathroom: two WC stalls along its north wall behind
 * partitions, and a washroom, which together are the space WC.
 */
const RUNS: [string, [number, number][], number, 'glass'?][] = [
  ['shell', [...SHELL, SHELL[0]], 0.16],
  ['w-north-150', [[633, 150], [900, 150]], 0.16],
  ['w-633', [[633, 0], [633, 150]], 0.16],
  ['w-783', [[783, 0], [783, 150]], 0.16],
  ['w-900', [[900, 0], [900, 150]], 0.16],
  ['w-south-367', [[700, 367], [1067, 367]], 0.16],
  ['w-883', [[883, 367], [883, 600]], 0.16],
  ['w-700', [[700, 367], [700, 500]], 0.16],
  ['w-wc-407', [[0, 407], [187, 407]], 0.16],
  ['w-187', [[187, 407], [187, 500]], 0.16],
  ['p-wc-40', [[40, 407], [40, 460]], 0.05],
  ['p-wc-80', [[80, 407], [80, 460]], 0.05],
  ['p-wc-front', [[0, 460], [80, 460]], 0.05],
  ['w-200', [[200, 0], [200, 140]], 0.16],
  ['g-mckinley', [[900, 150], [1067, 150]], 0.04, 'glass'],
  ['g-gaustad', [[0, 140], [200, 140]], 0.04, 'glass']
]

/** The named rooms: the PoC's meeting rooms. */
export const DEMO_ROOMS: Record<string, { ring: [number, number][]; category: UnitCategory }> = {
  Gaustadtoppen: { ring: [[0, 0], [200, 0], [200, 140], [0, 140]], category: 'conferenceroom' },
  Everest: { ring: [[633, 0], [783, 0], [783, 150], [633, 150]], category: 'conferenceroom' },
  Kilimanjaro: { ring: [[783, 0], [900, 0], [900, 150], [783, 150]], category: 'conferenceroom' },
  McKinley: { ring: [[900, 0], [1067, 0], [1067, 150], [900, 150]], category: 'conferenceroom' },
  'Mount Fuji': { ring: [[700, 367], [883, 367], [883, 600], [700, 600]], category: 'conferenceroom' },
  Elbrus: { ring: [[883, 367], [1067, 367], [1067, 600], [883, 600]], category: 'conferenceroom' }
}

/** The spaces: the bathroom, its two stalls and its washroom one WC under one label and one colour. */
export const DEMO_SPACES: Record<string, { ring: [number, number][]; category: UnitCategory }> = {
  WC: { ring: [[0, 407], [187, 407], [187, 500], [0, 500]], category: 'restroom' }
}

export function demoWalls(): Wall[] {
  const segments = RUNS.flatMap(([id, points, width, material]) => points.slice(1).map((b, i): Wall => ({ id: `${id}:${i}`, points: [pt(points[i]), pt(b)], width, ...(material ? { material } : {}) })))
  return splitAtContacts(segments)
}

/**
 * The doors: the centre, the side of the wall the room lies on, where the
 * leaf swings, and the width. A side is 1 left of the wall's run: north of
 * an east-west wall, west of a north-south one. The PoC's door gaps are 30
 * plan pixels (90 cm); the bathroom has its entrance in its east wall and
 * a 70 cm door into each stall.
 */
const DOORS: [number, number, 1 | -1, number][] = [
  [668, 150, 1, 0.9],
  [818, 150, 1, 0.9],
  [935, 150, 1, 0.9],
  [172, 140, 1, 0.9],
  [735, 367, -1, 0.9],
  [918, 367, -1, 0.9],
  [187, 430, 1, 0.9],
  [20, 460, 1, 0.7],
  [60, 460, 1, 0.7]
]

export function demoDoors(): Opening[] {
  return DOORS.map(([x, y, side, width], i) => ({ id: `door-${i}`, kind: 'door', at: pt([x, y]), width, from: 0, to: 2.1, swing: { side, hinge: 0 } }))
}

/** A freestanding wall in the west of the lobby, north to south, carrying a screen on its west face. */
const SCREEN_WALL: Wall = { id: 'w-screen', points: [[3.8, -6], [3.8, -9]], width: 0.16 }

/** Where the device showing the map stands: in front of the screen, west of the screen wall. */
export const DEMO_HERE: Vec2 = [2.4, -7.5]

/** The demo building's second floor as a document level, with its rooms named, the bathroom a space, its doors and the screen wall. */
export function demoLevel(): Level {
  const level = createLevel({ name: '2. etasje', ordinal: 1, elevation: 4.2, walls: [...demoWalls(), { ...SCREEN_WALL }], openings: demoDoors() })
  const rooms = Object.entries(DEMO_ROOMS).map(([name, { ring, category }]) => ({ name, ring: ring.map(pt), category }))
  const units: Unit[] = deriveUnits(level).units.map(unit => {
    const room = rooms.find(r => pointInRing(unit.anchor, r.ring))
    if (!room) return unit
    return { ...unit, name: room.name, category: room.category, ref: { kind: 'room', id: room.name.toLowerCase().replace(/\s+/g, '-') } }
  })
  const spaces: Space[] = Object.entries(DEMO_SPACES).map(([name, { ring, category }]) => ({
    id: `space-${name.toLowerCase()}`,
    name,
    category,
    ref: { kind: 'room', id: name.toLowerCase() },
    units: units.filter(u => pointInRing(u.anchor, ring.map(pt))).map(u => u.id)
  }))
  return { ...level, units, spaces }
}

const centredOn = ([x, y]: Vec2, w: number, d: number): Vec2[] => [[x - w / 2, y - d / 2], [x + w / 2, y - d / 2], [x + w / 2, y + d / 2], [x - w / 2, y + d / 2]]

/**
 * The furnishing of this floor, one array of parts per piece. From the
 * lobby PoC (its `demoFurnishMain`): the meeting tables with their chairs,
 * the plants and the TV in McKinley, at its positions, and its counter,
 * which stands against the east wall where the camera sees it rather than
 * against the south wall, with a coffee machine, a microwave, a sink and a
 * kettle on it; its sizes are centimetres. Our own: the desks as benches,
 * three rows of three pairs, centred in the open floor between
 * Gaustadtoppen and Everest, a plant run of topiary as deep as a bench set
 * against each end of every row, its box tall enough that the foliage
 * hanging over the desks clears them; a screen on the screen wall; the
 * bathroom, a wall-hung toilet in each stall and in the washroom a vanity
 * with two basins, a pedal bin and open shelves; and a lounge by the
 * counter, two sofas facing across a low table, an armchair and a plant,
 * behind open shelves that screen it from the desks without hiding it.
 */
export function demoFurniture(options: { plantKind?: PlantKind } = {}): Part[][] {
  const pieces: Part[][] = []
  let n = 0
  const centre: Vec2 = [12.5, -7.5]
  const rows = [3, 0, -3].map(dy => centre[1] + dy)
  const clusters = [-3.6, 0, 3.6].map(dx => centre[0] + dx)
  const rowEnd = 3.6 + 0.78 + 0.7
  for (const y of rows) {
    for (const x of clusters.flatMap(cx => [cx - 0.78, cx + 0.78])) {
      pieces.push(resultParts(desk(polygonEdges(centredOn([x, y + 0.35], 1.4, 0.7), [2], `d${n++}-`))))
      pieces.push(resultParts(desk(polygonEdges(centredOn([x, y - 0.35], 1.4, 0.7), [0], `d${n++}-`))))
    }
    for (const side of [-1, 1]) pieces.push(planter(centredOn([centre[0] + side * (rowEnd + 0.02 + 0.2), y], 0.4, 1.4), 0.86, n++, { kind: options.plantKind ?? 'topiary' }))
  }
  for (const [px, py, w, d, seats] of [[100, 70, 220, 90, 6], [708, 75, 200, 85, 6], [842, 75, 150, 80, 4], [983, 75, 240, 95, 8], [792, 483, 240, 95, 8], [975, 483, 240, 95, 8]]) {
    pieces.push(resultParts(table(polygonEdges(centredOn(pt([px, py]), w / 100, d / 100), [0, 2], `t${n++}-`), { seats, gap: 0.15 })))
  }
  ;[[610, 30, 1.15], [220, 480, 1], [687, 350, 1.1], [1043, 180, 1]].forEach(([px, py, size], i) => {
    const at = pt([px, py])
    pieces.push(transformParts(pottedPlant(i + 1, { kind: 'bush', size }), translation(at[0], at[1])))
  })
  pieces.push(casework(caseworkEdges(centredOn([31.6, -7.9], 0.62, 3.4), { front: [3], back: [1] }, `c${n++}-`)).parts)
  const worktop = Math.max(...COUNTER_BANDS.map(b => b.to))
  for (const [kind, y] of [['coffeeMachine', -6.7], ['microwave', -7.35], ['sink', -8.4], ['kettle', -9.2]] as const) pieces.push(placeItem(kind, [31.62, y], [-1, 0], worktop))
  const shelves: CaseworkBand[] = [{ from: 0, to: 0.08, inset: 0.03, material: 'furnitureDark' }, { from: 0.08, to: 1.1, shelves: 2 }]
  for (const x of [0.6, 1.8]) pieces.push(placeItem('wallToilet', [x, -12.29], [0, -1], 0.175))
  pieces.push(casework(caseworkEdges(centredOn([3.5, -12.54], 1.8, 0.5), { front: [0], back: [2] }, `v${n++}-`)).parts)
  for (const x of [3.05, 3.95]) pieces.push(placeItem('basin', [x, -12.54], [0, -1], worktop))
  pieces.push(placeItem('bin', [4.75, -12.55], [0, -1]))
  pieces.push(casework(caseworkEdges(centredOn([5.31, -14.2], 0.4, 1.2), { front: [3], back: [1] }, `h${n++}-`), { bands: shelves }).parts)
  pieces.push(sofa(sofaEdges(centredOn([26, -6.35], 2.2, 0.85), [2], `s${n++}-`)).parts)
  pieces.push(sofa(sofaEdges(centredOn([26, -9.15], 2.2, 0.85), [0], `s${n++}-`)).parts)
  pieces.push(sofa(sofaEdges(centredOn([24.2, -7.75], 0.85, 0.85), [3], `s${n++}-`)).parts)
  pieces.push(resultParts(table(polygonEdges(centredOn([26, -7.75], 1.2, 0.6), [], `t${n++}-`), { height: 0.42 })))
  pieces.push(transformParts(pottedPlant(9, { kind: 'bush', size: 1.1 }), translation(27.85, -6)))
  pieces.push(casework(caseworkEdges(centredOn([21.8, -7.75], 0.4, 2.4), { front: [1, 3] }, `h${n++}-`), { bands: shelves }).parts)
  pieces.push(placeItem('tv', [pt([983, 0])[0], -0.08], [0, -1], 0.4))
  const face = SCREEN_WALL.points[0][0] - SCREEN_WALL.width / 2
  pieces.push(placeItem('tv', [face, (SCREEN_WALL.points[0][1] + SCREEN_WALL.points[1][1]) / 2], [-1, 0], 0.4))
  return pieces
}
