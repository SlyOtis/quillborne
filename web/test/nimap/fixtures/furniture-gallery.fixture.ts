import type { CaseworkBand, Line, Part, SofaEdge, StockKind, Vec2 } from '$lib/nimap/index'
import { COUNTER_BANDS, bed, bedEdges, boxPart, casework, caseworkEdges, desk, ellipseCubics, ellipseEdges, placeItem, planter, polygonEdges, pottedPlant, resultParts, sofa, sofaEdges, table, transformParts, translation, PLANT_KINDS } from '$lib/nimap/index'

/** One thing on show: its parts where it stands in the gallery, and where its name goes. */
export interface Exhibit {
  name: string
  parts: Part[]
  label: Vec2
}

const CELL = 4.6
/** Toward the viewer: the standard view looks from the south-west. */
const VIEWER: Vec2 = [-0.5, -0.87]

const centred = (w: number, d: number): Vec2[] => [[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, d / 2], [-w / 2, d / 2]]
const shifted = (points: Vec2[], dx: number, dy: number): Vec2[] => points.map(p => [p[0] + dx, p[1] + dy])
const turnedEdges = <E extends Line>(edges: E[], angle: number): E[] => {
  const f = (p: Vec2): Vec2 => [Math.cos(angle) * p[0] - Math.sin(angle) * p[1], Math.sin(angle) * p[0] + Math.cos(angle) * p[1]]
  return edges.map(e => ({ ...e, points: [f(e.points[0]), f(e.points[1])], ...(e.curve ? { curve: [f(e.curve[0]), f(e.curve[1])] as [Vec2, Vec2] } : {}) }))
}

/**
 * A curved sofa: half a ring round `centre` between two radii, the back
 * along the outer arc over the north, open to the south.
 */
export function curvedSofaEdges(outer: number, inner: number, centre: Vec2 = [0, 0]): SofaEdge[] {
  const at = (p: Vec2): Vec2 => [p[0] + centre[0], p[1] + centre[1]]
  const [o0, o1] = ellipseCubics([-outer, -outer], [outer, outer]).map(c => c.map(at))
  const [i0, i1] = ellipseCubics([-inner, -inner], [inner, inner]).map(c => c.map(at))
  return [
    { id: 'o0', points: [o0[0], o0[3]], curve: [o0[1], o0[2]], back: true },
    { id: 'o1', points: [o1[0], o1[3]], curve: [o1[1], o1[2]], back: true },
    { id: 'l', points: [o1[3], i1[3]] },
    { id: 'i1', points: [i1[3], i1[0]], curve: [i1[2], i1[1]] },
    { id: 'i0', points: [i0[3], i0[0]], curve: [i0[2], i0[1]] },
    { id: 'r', points: [i0[0], o0[0]] }
  ]
}

/** How high a counter's top is. */
const WORKTOP = Math.max(...COUNTER_BANDS.map(b => b.to))

const L_KITCHEN: Vec2[] = [[0, 0], [2.4, 0], [2.4, 2], [1.78, 2], [1.78, 0.62], [0, 0.62]]

/** A kitchen: a counter, and cabinets a third as deep high at the back. */
const KITCHEN_BANDS: CaseworkBand[] = [...COUNTER_BANDS, { from: 1.45, to: 2.15, depth: 0.34 }]

/** Shelves: a plinth and one tall open band with four shelves. */
const SHELF_BANDS: CaseworkBand[] = [
  { from: 0, to: 0.08, inset: 0.03, material: 'furnitureDark' },
  { from: 0.08, to: 1.9, shelves: 4 }
]

/** A storage rack: open from the floor up, dark, with four shelves. */
const RACK_BANDS: CaseworkBand[] = [{ from: 0, to: 2, shelves: 4, material: 'furnitureDark' }]

/** A counter with an open shelf high at the back, a third as deep. */
const OPEN_KITCHEN_BANDS: CaseworkBand[] = [...COUNTER_BANDS, { from: 1.45, to: 1.95, depth: 0.3, shelves: 1 }]

/** A reception desk: a desk-height top for the staff at the front, and a raised top for visitors along the back. */
const RECEPTION_BANDS: CaseworkBand[] = [
  { from: 0, to: 0.1, inset: 0.06, material: 'furnitureDark' },
  { from: 0.1, to: 0.72 },
  { from: 0.72, to: 0.75, material: 'tableTop' },
  { from: 0.75, to: 1.05, depth: 0.25 },
  { from: 1.05, to: 1.08, depth: 0.3, material: 'tableTop' }
]

/** An L kitchen against walls to the north and east, its upper cabinets hanging on them. */
function kitchenOnWalls(): Part[] {
  const kitchen = casework(turnedEdges(caseworkEdges(shifted(L_KITCHEN, -1.2, -1), { front: [3, 4], back: [0, 1] }), Math.PI / 2), { bands: KITCHEN_BANDS })
  const south: Vec2 = [0, -1]
  const west: Vec2 = [-1, 0]
  return [
    boxPart([2.12, 0.12, 2.4], 'wall', [0.06, 1.26, 0]),
    boxPart([0.12, 2.4, 2.4], 'wall', [1.06, 0, 0]),
    ...kitchen.parts,
    ...placeItem('sink', [-0.55, 0.89], south, WORKTOP),
    ...placeItem('microwave', [0.12, 0.93], south, WORKTOP),
    ...placeItem('kettle', [0.72, 0.2], west, WORKTOP),
    ...placeItem('hob', [0.69, -0.4], west, WORKTOP),
    ...placeItem('coffeeMachine', [0.74, -0.95], west, WORKTOP)
  ]
}

/** A stock item on a short counter, facing the viewer's side. */
const onCounter = (kind: StockKind, width: number): Part[] => [...casework(caseworkEdges(centred(width, 0.62), { front: [0], back: [2] })).parts, ...placeItem(kind, [0, 0.02], [0, -1], WORKTOP)]

const L_SOFA: Vec2[] = [[0, 0], [2.4, 0], [2.4, 0.85], [0.85, 0.85], [0.85, 2.2], [0, 2.2]]
const U_SOFA: Vec2[] = [[0, 0], [3, 0], [3, 2.2], [2.15, 2.2], [2.15, 0.85], [0.85, 0.85], [0.85, 2.2], [0, 2.2]]

function wallWithScreens(): Part[] {
  const face = -0.06
  return [boxPart([3.2, 0.12, 2.4], 'wall'), ...placeItem('tv', [-0.8, face], [0, -1], 1.1), ...placeItem('whiteboard', [0.85, face], [0, -1], 0.9)]
}

function deskGroup(): Part[] {
  const desks = [
    polygonEdges(shifted(centred(1.2, 0.7), -0.6, -0.35), [0], 'sw'),
    polygonEdges(shifted(centred(1.2, 0.7), 0.6, -0.35), [0], 'se'),
    polygonEdges(shifted(centred(1.2, 0.7), -0.6, 0.35), [2], 'nw'),
    polygonEdges(shifted(centred(1.2, 0.7), 0.6, 0.35), [2], 'ne')
  ]
  return desks.flatMap(edges => resultParts(desk(edges)))
}

/** The asset bank on show: stock items, tables, desks, sofas, casework and beds from traced outlines, wall items, kitchen things on counters, the bathroom and waste, and plants. */
export function furnitureGallery(): Exhibit[] {
  const rows: [string, Part[]][][] = [
    [
      ['Office chair', placeItem('officeChair', [0, 0], VIEWER)],
      ['Meeting chair', placeItem('meetingChair', [0, 0], VIEWER)],
      ['Bar stool', placeItem('stool', [0, 0], VIEWER)],
      ['Monitor', placeItem('monitor', [0, 0], VIEWER)],
      ['Bush in a pot', pottedPlant(3, { kind: 'bush' })],
      ['Topiary in a pot', pottedPlant(7, { kind: 'topiary' })]
    ],
    [
      ['Meeting table, long sides', resultParts(table(polygonEdges(centred(2.2, 1.0), [0, 2])))],
      ['Square table, all sides', resultParts(table(polygonEdges(centred(1.4, 1.4))))],
      ['Round table', resultParts(table(ellipseEdges([-0.6, -0.6], [0.6, 0.6])))],
      ['Oval table', resultParts(table(ellipseEdges([-1.2, -0.6], [1.2, 0.6])))]
    ],
    [
      ['L table, outer edges', resultParts(table(polygonEdges(shifted([[0, 0], [2, 0], [2, 0.8], [0.8, 0.8], [0.8, 2], [0, 2]], -1, -1), [0, 1, 4, 5])))],
      ['Desk', resultParts(desk(polygonEdges(centred(1.4, 0.7), [0])))],
      ['Bench, two desks back to back', [...resultParts(desk(polygonEdges(shifted(centred(1.4, 0.7), 0, -0.35), [0], 'a'), { monitors: 2 })), ...resultParts(desk(polygonEdges(shifted(centred(1.4, 0.7), 0, 0.35), [2], 'b'), { monitors: 2 }))]],
      ['Bar table', resultParts(table(ellipseEdges([-0.4, -0.4], [0.4, 0.4]), { chair: 'stool', height: 1.05 }))]
    ],
    [
      ['On legs', resultParts(table(polygonEdges(centred(1.6, 0.8), [0]), { supports: 'legs' }))],
      ['On a pedestal', resultParts(table(polygonEdges(centred(1.6, 0.8), [0]), { supports: 'pedestal' }))],
      ['On T-bases', resultParts(table(polygonEdges(centred(1.6, 0.8), [0]), { supports: 'tbases' }))],
      ['On frames', resultParts(table(polygonEdges(centred(1.6, 0.8), [0]), { supports: 'frames' }))],
      ['On panels', resultParts(table(polygonEdges(centred(1.6, 0.8), [0]), { supports: 'panels' }))]
    ],
    [
      ['Oval table on T-bases', resultParts(table(ellipseEdges([-1.2, -0.6], [1.2, 0.6]), { supports: 'tbases' }))],
      ['Oval table on frames', resultParts(table(ellipseEdges([-1.2, -0.6], [1.2, 0.6]), { supports: 'frames' }))],
      ['Round table on T-bases', resultParts(table(ellipseEdges([-0.6, -0.6], [0.6, 0.6]), { supports: 'tbases' }))],
      ['L table on frames', resultParts(table(polygonEdges(shifted([[0, 0], [2, 0], [2, 0.8], [0.8, 0.8], [0.8, 2], [0, 2]], -1, -1), [0, 1, 4, 5]), { supports: 'frames' }))]
    ],
    [
      ['TV and whiteboard on a wall', wallWithScreens()],
      ['Planter', planter(centred(2.4, 0.45), 0.75, 5)],
      ['Desk, turned', resultParts(desk(turnedEdges(polygonEdges(centred(1.6, 0.8), [0]), 0.5), { monitors: 2 }))],
      ['Desk group', deskGroup()]
    ],
    [
      ['Sofa', sofa(sofaEdges(centred(2.2, 0.85), [2])).parts],
      ['Armchair', sofa(sofaEdges(centred(0.85, 0.85), [2])).parts],
      ['L sofa', sofa(turnedEdges(sofaEdges(shifted(L_SOFA, -1.2, -1.1), [0, 5]), Math.PI)).parts],
      ['U sofa', sofa(turnedEdges(sofaEdges(shifted(U_SOFA, -1.5, -1.1), [0, 1, 7]), Math.PI)).parts],
      ['Curved sofa', sofa(curvedSofaEdges(1.5, 0.7, [0, -0.75])).parts]
    ],
    [
      ['Counter', casework(caseworkEdges(centred(2.4, 0.62), { front: [0], back: [2] })).parts],
      ['Kitchen, L, on two walls', kitchenOnWalls()],
      ['Island', casework(caseworkEdges(centred(2, 0.9), { front: [0, 2] })).parts],
      ['Shelves, open at the back', casework(caseworkEdges(centred(1.6, 0.4), { front: [0, 2] }), { bands: SHELF_BANDS }).parts],
      ['Storage rack, open at the back', casework(caseworkEdges(centred(2.7, 0.5), { front: [0, 2] }), { bands: RACK_BANDS }).parts],
      ['Counter with an open shelf', [boxPart([2.6, 0.12, 2.2], 'wall', [0, 0.37, 0]), ...casework(caseworkEdges(centred(2.4, 0.62), { front: [0], back: [2] }), { bands: OPEN_KITCHEN_BANDS }).parts]],
      ['Reception desk', casework(curvedSofaEdges(1.5, 0.8, [0, -0.75]).map(e => ({ ...e, front: e.id.startsWith('i') })), { bands: RECEPTION_BANDS }).parts]
    ],
    [
      ['Sink', onCounter('sink', 1)],
      ['Hob', onCounter('hob', 0.8)],
      ['Coffee machine', onCounter('coffeeMachine', 0.6)],
      ['Microwave', onCounter('microwave', 0.7)],
      ['Kettle', onCounter('kettle', 0.5)]
    ],
    [
      ['Single bed', bed(bedEdges(centred(0.9, 2), [2])).parts],
      ['Double bed', bed(bedEdges(centred(1.6, 2.05), [2])).parts],
      ['Round bed', bed(ellipseEdges([-1.1, -1.1], [1.1, 1.1]).map((e, i) => ({ ...e, head: i === 1 }))).parts]
    ],
    [
      ['Toilet', placeItem('toilet', [0, 0], VIEWER)],
      ['Wall-hung toilet', [boxPart([1, 0.12, 1.2], 'wall', [0, 0.06, 0]), ...placeItem('wallToilet', [0, 0], [0, -1], 0.175)]],
      ['Washbasin', placeItem('washbasin', [0, 0], VIEWER)],
      ['Vanity with a basin and a mirror', [boxPart([1.2, 0.12, 2.1], 'wall', [0, 0.31, 0]), ...casework(caseworkEdges(centred(1, 0.5), { front: [0], back: [2] })).parts, ...placeItem('basin', [0, 0], [0, -1], WORKTOP), ...placeItem('mirror', [0, 0.25], [0, -1], 1.2)]],
      ['Urinals', [boxPart([1.6, 0.12, 1.4], 'wall', [0, 0.06, 0]), ...[-0.35, 0.35].flatMap(x => placeItem('urinal', [x, 0], [0, -1], 0.1))]],
      ['Pedal bin', placeItem('bin', [0, 0], VIEWER)],
      ['Recycling station', [...casework(caseworkEdges(centred(1.4, 0.6), { front: [0], back: [2] })).parts, ...[-0.48, -0.16, 0.16, 0.48].flatMap(x => placeItem('binOpening', [x, 0], [0, -1], WORKTOP))]]
    ]
  ]
  return rows.flatMap((row, r) =>
    row.map(([name, parts], c) => {
      const origin: Vec2 = [c * CELL, -r * CELL]
      return { name, parts: transformParts(parts, translation(origin[0], origin[1])), label: [origin[0], origin[1] - 1.9] as Vec2 }
    })
  )
}

/** Every kind of planting side by side: as a planter run the size of the demo's, the same with pebbles, and in a pot. */
export function plantGallery(): Exhibit[] {
  const step = 1.4
  const rows: [string, (kind: (typeof PLANT_KINDS)[number], i: number) => Part[]][] = [
    ['', (kind, i) => planter(centred(0.4, 1.4), 0.86, 10 + i, { kind })],
    [' with pebbles', (kind, i) => planter(centred(0.4, 1.4), 0.86, 10 + i, { kind, pebbles: true })],
    [' in a pot', (kind, i) => pottedPlant(20 + i, { kind })]
  ]
  return rows.flatMap(([suffix, make], r) =>
    PLANT_KINDS.map((kind, c) => {
      const origin: Vec2 = [c * step, -r * 2.6]
      return { name: `${kind}${suffix}`, parts: transformParts(make(kind, c), translation(origin[0], origin[1])), label: [origin[0], origin[1] - (r === 2 ? 0.35 : 1.05)] as Vec2 }
    })
  )
}
