import { describe, it, expect } from 'vitest'
import { cubicPoint, lineMiddle, ellipseCubics, faceTargets, safeSolids, mergeTargets, buildEditGraph, junctionPoints, snapTargets, withoutNodes, createSnapper, DRAWING_CONSTRAINTS, MOVING_CONSTRAINTS, nodeKey, NO_MODIFIERS, resolveSnap, nodeConstraint, alignmentConstraint, intersectPrimitives, projectOntoPrimitive } from '$lib/nimap'
import type { Wall, Vec2, SnapTargets } from '$lib/nimap'

const wall = (id: string, points: [[number, number], [number, number]], width = 0.16): Wall => ({ id, points, width })
const graph = () => buildEditGraph([wall('a', [[0, 0], [4, 0]]), wall('b', [[4, 0], [4, 3]]), wall('c', [[0, 3], [0, 6]])])
const SCALE = 100

describe('snapping', () => {
  it('snaps to a node within threshold and reports the type and a highlight', () => {
    const snap = createSnapper(snapTargets(graph()), DRAWING_CONSTRAINTS, SCALE)
    const r = snap([4.05, 0.03])
    expect(r.point).toEqual([4, 0])
    expect(r.types).toEqual(['node', 'alignment', 'alignment'])
    expect(r.guides[0].type).toBe('highlight')
    expect(r.guides.filter(g => g.type === 'line' && g.style === 'alignment').length).toBe(2)
    expect(snap([4.5, 0.5]).types).toEqual([])
  })

  it('a wall crossing the view snaps however far off screen both its ends are: any angle, any place along it, zoomed in close', () => {
    for (let k = 0; k < 12; k++) {
      const angle = (k * Math.PI) / 12 + 0.1
      const d: Vec2 = [Math.cos(angle), Math.sin(angle)]
      const long = buildEditGraph([wall('long', [[-200 * d[0], -200 * d[1]], [200 * d[0], 200 * d[1]]])])
      for (const t of [-150, -40, 0, 75, 180]) {
        const on: Vec2 = [d[0] * t, d[1] * t]
        const view = { minX: on[0] - 3, minY: on[1] - 2, maxX: on[0] + 3, maxY: on[1] + 2 }
        const snap = createSnapper(snapTargets(long), DRAWING_CONSTRAINTS, SCALE, view)
        const r = snap([on[0] - d[1] * 0.02, on[1] + d[0] * 0.02])
        expect(r.types, `angle ${k}, at ${t}`).toContain('segment')
        expect(Math.hypot(r.point[0] - on[0], r.point[1] - on[1]), `angle ${k}, at ${t}`).toBeLessThan(1e-6)
      }
    }
  })

  it('projects onto a segment, with a midpoint magnet', () => {
    const snap = createSnapper(snapTargets(graph()), DRAWING_CONSTRAINTS, SCALE)
    const r = snap([1, 0.04])
    expect(r.types).toContain('segment')
    expect(r.point[1]).toBeCloseTo(0, 9)
    expect(r.point[0]).toBeCloseTo(1, 9)
    expect(snap([2.03, 0.04]).point).toEqual([2, 0])
  })

  it('combines a horizontal and a vertical alignment into a corner', () => {
    const snap = createSnapper(snapTargets(graph()), DRAWING_CONSTRAINTS, SCALE)
    const r = snap([0.03, 2.97])
    expect(r.point).toEqual([0, 3])
    expect(r.types[0]).toBe('node')
    const corner = snap([4.03, 6.02])
    expect(corner.point[0]).toBeCloseTo(4, 9)
    expect(corner.point[1]).toBeCloseTo(6, 9)
    expect(corner.types).toEqual(['alignment', 'alignment'])
    expect(corner.guides.length).toBe(2)
  })

  it('lines up with the pen’s start both ways along its axes, with a cross in every other point on the line and the ray from the start toward the hand', () => {
    const start: Vec2 = [0, 0]
    const behind: Vec2 = [-2, 0]
    const snap = createSnapper({ nodes: [{ id: 'start', point: start }, { id: 'behind', point: behind }], segments: [] }, DRAWING_CONSTRAINTS, SCALE)
    for (const [raw, expected, direction, marks] of [
      [[3, 0.03], [3, 0], [1, 0], [behind]],
      [[-4, 0.03], [-4, 0], [-1, 0], [behind]],
      [[0.03, 2], [0, 2], [0, 1], []],
      [[-0.03, -1.5], [0, -1.5], [0, -1], []]
    ] as [Vec2, Vec2, Vec2, Vec2[]][]) {
      const r = snap(raw, { anchor: start })
      expect(r.point).toEqual(expected)
      expect(r.types[0]).toBe('alignment')
      const line = r.guides.find(g => g.type === 'line' && g.style === 'alignment')
      expect(line && line.type === 'line' && line.marks).toEqual(marks)
      const ray = r.guides.find(g => g.type === 'line' && g.style === 'angle')
      expect(ray && ray.type === 'line' && ray.from).toEqual(start)
      const to = ray && ray.type === 'line' ? ray.to : start
      expect((to[0] * direction[0] + to[1] * direction[1]) / Math.hypot(to[0], to[1])).toBeCloseTo(1, 9)
    }
  })

  it('shift locks to 15 degree increments before other constraints run', () => {
    const snap = createSnapper(buildEditGraph([]), DRAWING_CONSTRAINTS, SCALE)
    const r = snap([3, 0.9], { anchor: [0, 0], modifiers: { ...NO_MODIFIERS, shift: true } })
    expect(r.types).toEqual(['hard-angle'])
    const angle = Math.atan2(r.point[1], r.point[0])
    expect(angle).toBeCloseTo(Math.PI / 12, 9)
    expect(Math.hypot(r.point[0], r.point[1])).toBeCloseTo(3 * Math.cos(Math.PI / 12) + 0.9 * Math.sin(Math.PI / 12), 9)
    expect(snap([3, 0.9], { anchor: [0, 0] }).types).toEqual([])
  })

  it('sliding along the locked ray catches a far alignment the raw cursor would miss', () => {
    const g = buildEditGraph([wall('far', [[10, 3], [12, 3]])])
    const snap = createSnapper(snapTargets(g), DRAWING_CONSTRAINTS, SCALE)
    const shift = { ...NO_MODIFIERS, shift: true }
    const r = 6 / Math.cos((3 * Math.PI) / 180)
    const raw: Vec2 = [r * Math.cos((33 * Math.PI) / 180), r * Math.sin((33 * Math.PI) / 180)]
    expect(Math.abs(raw[1] - 3)).toBeGreaterThan(0.2)
    const locked = snap(raw, { anchor: [0, 0], modifiers: shift })
    expect(locked.types).toEqual(['hard-angle', 'alignment'])
    expect(locked.point[1]).toBeCloseTo(3, 9)
    expect(locked.point[0]).toBeCloseTo(3 / Math.tan(Math.PI / 6), 6)
    expect(locked.guides.some(g => g.type === 'line' && g.style === 'angle')).toBe(true)
    expect(snap(raw, { anchor: [0, 0] }).types).toEqual([])
  })

  it('a node near the projected point wins under the lock', () => {
    const g = buildEditGraph([wall('n', [[3, 3], [5, 3]])])
    const snap = createSnapper(snapTargets(g), DRAWING_CONSTRAINTS, SCALE)
    const r = snap([3.05, 2.98], { anchor: [0, 0], modifiers: { ...NO_MODIFIERS, shift: true } })
    expect(r.point).toEqual([3, 3])
    expect(r.types.slice(0, 2)).toEqual(['node', 'hard-angle'])
  })

  it('shift snaps parallel and perpendicular to existing walls in either direction', () => {
    const g = buildEditGraph([wall('d', [[0, 0], [3, 1]])])
    const snap = createSnapper(snapTargets(g), DRAWING_CONSTRAINTS, SCALE)
    const shift = { ...NO_MODIFIERS, shift: true }
    const parallel = snap([-3, -1.02], { anchor: [0, 0], modifiers: shift })
    expect(parallel.types).toContain('parallel')
    expect(parallel.point[1] / parallel.point[0]).toBeCloseTo(1 / 3, 6)
    expect(parallel.point[0]).toBeLessThan(0)
    const perpendicular = snap([-1, 3.02], { anchor: [0, 0], modifiers: shift })
    expect(perpendicular.types).toContain('perpendicular')
    expect(perpendicular.point[0] * 3 + perpendicular.point[1] * 1).toBeCloseTo(0, 6)
  })

  it('ctrl disables snapping', () => {
    const snap = createSnapper(snapTargets(graph()), DRAWING_CONSTRAINTS, SCALE)
    const r = snap([4.05, 0.03], { modifiers: { ...NO_MODIFIERS, ctrl: true } })
    expect(r.point).toEqual([4.05, 0.03])
    expect(r.types).toEqual([])
  })

  it('a graph without the moving nodes offers no self targets but snaps companions through offsets', () => {
    const t = withoutNodes(snapTargets(graph()), new Set([nodeKey([0, 3])]))
    expect(t.nodes.map(n => n.id)).not.toContain(nodeKey([0, 3]))
    expect(t.segments.map(s => s.id)).not.toContain('c:0')
    const snap = createSnapper(t, MOVING_CONSTRAINTS, SCALE)
    const r = snap([0.02, 2.98], { anchor: [0, 3] })
    expect(r.types).not.toContain('node')
    const withOffset = snap([1, 1.04], { offsets: [[3, -1]], anchor: [1, 1] })
    expect(withOffset.point).toEqual([1, 1])
    expect(withOffset.types[0]).toBe('node')
  })

  it('removing a T node also removes its host segment and the derived points that segment carried', () => {
    const walls = [wall('host', [[0, 0], [6, 0]]), wall('t', [[3, 0], [3, 2]]), wall('x', [[2, -1], [2, 1]])]
    const targets = snapTargets(buildEditGraph(walls), junctionPoints(walls))
    expect(targets.nodes.map(n => n.id)).toContain(nodeKey([2, 0]))
    const rest = withoutNodes(targets, new Set([nodeKey([3, 0])]))
    expect(rest.segments.map(s => s.id).sort()).toEqual(['x:0'])
    expect(rest.nodes.map(n => n.id).sort()).toEqual([nodeKey([0, 0]), nodeKey([6, 0]), nodeKey([3, 2]), nodeKey([2, -1]), nodeKey([2, 1])].sort())
  })

  it('caps the active set so dense scenes stay solvable', () => {
    const walls: Wall[] = []
    for (let i = 0; i < 40; i++) walls.push(wall(`w${i}`, [[i * 0.001, 0], [i * 0.001, 1]]))
    const g = buildEditGraph(walls)
    const started = performance.now()
    const r = resolveSnap(DRAWING_CONSTRAINTS, { point: [0.02, 0.5], nodes: g.nodes, segments: g.segments, anchor: null, offsets: [], pointerCarried: true, scale: SCALE, modifiers: NO_MODIFIERS })
    expect(performance.now() - started).toBeLessThan(500)
    expect(r.active.length).toBeLessThanOrEqual(8)
  })

  it('culls candidates to the viewport', () => {
    const g = buildEditGraph([wall('far', [[100, 100], [104, 100]])])
    const snap = createSnapper(snapTargets(g), DRAWING_CONSTRAINTS, SCALE, { minX: 0, minY: 0, maxX: 10, maxY: 10 })
    expect(snap([100.02, 100]).types).toEqual([])
  })

  it('primitives intersect and project', () => {
    expect(intersectPrimitives({ type: 'line', point: [0, 1], direction: [1, 0] }, { type: 'line', point: [2, 0], direction: [0, 1] })).toEqual([2, 1])
    expect(intersectPrimitives({ type: 'ray', origin: [0, 0], direction: [1, 0] }, { type: 'segment', start: [2, -1], end: [2, 1] })).toEqual([2, 0])
    expect(intersectPrimitives({ type: 'ray', origin: [0, 0], direction: [-1, 0] }, { type: 'segment', start: [2, -1], end: [2, 1] })).toBeNull()
    expect(intersectPrimitives({ type: 'line', point: [0, 0], direction: [1, 0] }, { type: 'line', point: [0, 1], direction: [1, 0] })).toBeNull()
    expect(projectOntoPrimitive([5, 5], { type: 'segment', start: [0, 0], end: [2, 0] })).toEqual([2, 0])
    expect(projectOntoPrimitive([5, 5], { type: 'ray', origin: [0, 0], direction: [0, -1] })).toEqual([0, 0])
  })

  it('exposes constraint targets for direct testing', () => {
    const g = graph()
    const ctx = { point: [0, 0] as Vec2, nodes: g.nodes, segments: g.segments, anchor: null, offsets: [] as Vec2[], pointerCarried: true, scale: SCALE, modifiers: NO_MODIFIERS }
    expect(nodeConstraint.targets(ctx).length).toBe(g.nodes.length)
    const alignments = alignmentConstraint.targets(ctx)
    expect(alignments.filter(t => t.axis === 0).map(t => t.coordinate).sort()).toEqual([0, 4])
    expect(alignments.filter(t => t.axis === 1).map(t => t.coordinate).sort()).toEqual([0, 3, 6])
  })

  it('viewport culling keeps every chord of a curve, not only those touching a node', () => {
    const curve = { id: 'c', points: [[0, 0], [4, 0]] as [Vec2, Vec2], curve: [[1, 2], [3, 2]] as [Vec2, Vec2] }
    const g = buildEditGraph([{ ...curve, width: 0.1 }])
    const targets = snapTargets(g)
    expect(targets.segments.length).toBeGreaterThan(4)
    const snap = createSnapper(targets, DRAWING_CONSTRAINTS, SCALE, { minX: -10, minY: -10, maxX: 10, maxY: 10 })
    const top = snap([2, 1.52])
    expect(top.types).toContain('segment')
    expect(top.point[1]).toBeCloseTo(1.5, 2)
  })

  it('chord joints of a curved wall are not junction points', () => {
    const curve = { id: 'c', points: [[0, 0], [4, 0]] as [Vec2, Vec2], curve: [[1, 2], [3, 2]] as [Vec2, Vec2], width: 0.1 }
    expect(junctionPoints([curve])).toEqual([])
    expect(junctionPoints([curve, wall('x', [[2, -1], [2, 3]])]).length).toBe(1)
  })

  it('a curve has one midpoint magnet halfway along its arc and one guide for the whole line, never per chord', () => {
    const curve = { id: 'c', points: [[0, 0], [4, 0]] as [Vec2, Vec2], curve: [[1, 2], [3, 2]] as [Vec2, Vec2], width: 0.1 }
    const snap = createSnapper(snapTargets(buildEditGraph([curve])), DRAWING_CONSTRAINTS, SCALE)
    const top = snap([2.03, 1.52])
    expect(top.point[0]).toBeCloseTo(2, 6)
    expect(top.point[1]).toBeCloseTo(1.5, 2)
    const guide = top.guides.find(g => g.type === 'path')
    expect(guide && guide.type === 'path' && guide.points.length).toBeGreaterThan(4)
    const off = snap([1, 1.13])
    expect(off.types).toContain('segment')
    expect(Math.abs(off.point[0] - 1)).toBeLessThan(0.05)
    expect(off.guides.filter(g => g.type === 'line' && g.midpoint).length).toBe(0)
  })

  it('snapping along a curve from outside is continuous: no cursor sticks at a chord joint', () => {
    const curve = { id: 'c', points: [[0, 0], [4, 0]] as [Vec2, Vec2], curve: [[1, 2], [3, 2]] as [Vec2, Vec2], width: 0.1 }
    const snap = createSnapper(snapTargets(buildEditGraph([curve])), DRAWING_CONSTRAINTS, SCALE)
    let last: Vec2 | null = null
    for (let t = 0.15; t <= 0.85; t += 0.005) {
      const on = cubicPoint([curve.points[0], curve.curve[0], curve.curve[1], curve.points[1]], t)
      const r = snap([on[0], on[1] + 0.04])
      expect(r.types).toContain('segment')
      const mid = lineMiddle(curve)
      const atMid = (q: Vec2) => Math.hypot(q[0] - mid[0], q[1] - mid[1]) < 1e-6
      if (last && !atMid(r.point) && !atMid(last)) expect(Math.hypot(r.point[0] - last[0], r.point[1] - last[1])).toBeLessThan(0.03)
      last = r.point
    }
  })

  it('guides describe the snapped position, not the pointer: a node snap shows its alignments anywhere inside the snap radius', () => {
    const tall = wall('tall', [[2, 0], [2, 6]])
    const snap = createSnapper(snapTargets(buildEditGraph([tall])), MOVING_CONSTRAINTS, SCALE)
    const guidesAt = (p: Vec2) => snap(p, { offsets: [[0, -1]] }).guides.filter(g => g.type === 'line' && g.style === 'alignment').length
    expect(snap([2.07, 0.02], { offsets: [[0, -1]] }).point).toEqual([2, 0])
    expect(guidesAt([2.01, 0.01])).toBe(guidesAt([2.06, 0.05]))
    expect(guidesAt([2.06, 0.05])).toBeGreaterThan(0)
    expect(guidesAt([2.09, 0.09])).toBe(0)
  })
})

describe('wall faces as they look', () => {
  const round = (centre: Vec2, r: number, width: number): Wall[] =>
    ellipseCubics([centre[0] - r, centre[1] - r], [centre[0] + r, centre[1] + r]).map(([a, c1, c2, b], i) => ({ id: `q${i}`, points: [a, b], curve: [c1, c2], width }))
  const facesOf = (walls: Wall[]) => faceTargets(safeSolids(walls).boundary)
  const linesOf = (t: SnapTargets) => [...new Set(t.segments.map(s => s.line!))]
  const ROUNDS: [Vec2, number, number][] = [[[0, 0], 2.5, 0.1], [[-2.13, -2.71], 2.5, 0.1], [[0.37, 0.11], 1.2, 0.2], [[5, -3], 4, 0.3], [[1.234567, -7.654321], 0.8, 0.16]]

  it('a face runs from corner to corner of what is drawn: a round room is two closed faces with no ends, a rectangle eight, walls in a line one per side; no face offers a midpoint', () => {
    for (const [centre, r, width] of ROUNDS) {
      const t = facesOf(round(centre, r, width))
      const at = `round ${r} m at ${centre}, ${width} m walls`
      expect(t.nodes, at).toEqual([])
      expect(linesOf(t).length, at).toBe(2)
      expect(linesOf(t).every(l => l.closed && !l.midpoint), at).toBe(true)
    }
    const room = [wall('n', [[0, 0], [6, 0]]), wall('e', [[6, 0], [6, 4]]), wall('s', [[6, 4], [0, 4]]), wall('w', [[0, 4], [0, 0]])]
    const seamed = [wall('n1', [[0, 0], [2.5, 0]]), wall('n2', [[2.5, 0], [6, 0]]), ...room.slice(1)]
    for (const [name, walls] of [['room', room], ['room with a seam', seamed]] as [string, Wall[]][]) {
      const t = facesOf(walls)
      expect(t.nodes.length, name).toBe(8)
      expect(linesOf(t).length, name).toBe(8)
      expect(linesOf(t).every(l => !l.closed && !l.midpoint), name).toBe(true)
    }
  })

  it('a furniture corner slides round a round room’s face without sticking anywhere', () => {
    for (const [centre, r, width] of ROUNDS) {
      const snap = createSnapper(facesOf(round(centre, r, width)), DRAWING_CONSTRAINTS, SCALE)
      const inner = r - width / 2
      let last: Vec2 | null = null
      for (let k = 0; k <= 360; k++) {
        const a = (k * Math.PI) / 180
        const hand: Vec2 = [centre[0] + Math.cos(a) * (inner - 0.03), centre[1] + Math.sin(a) * (inner - 0.03)]
        const p = snap(hand).point
        const at = `round ${r} m at ${centre}, ${k}°`
        expect(Math.abs(Math.hypot(p[0] - centre[0], p[1] - centre[1]) - inner), at).toBeLessThan(0.003)
        if (last) expect(Math.hypot(p[0] - last[0], p[1] - last[1]), at).toBeLessThan((2 * Math.PI * inner) / 360 + 0.004)
        last = p
      }
    }
  })

  it('under Shift beside a curve the 45° diagonal is exact: a curve offers no direction of its own', () => {
    for (const [centre, r, width] of ROUNDS) {
      const walls = round(centre, r, width)
      const snap = createSnapper(mergeTargets(snapTargets(buildEditGraph(walls)), facesOf(walls)), DRAWING_CONSTRAINTS, SCALE)
      const anchor: Vec2 = [centre[0] - r / 2, centre[1] - r / 2]
      for (const degrees of [44, 44.5, 45.5, 46]) {
        const a = (degrees * Math.PI) / 180
        const p = snap([anchor[0] + Math.cos(a) * r * 0.6, anchor[1] + Math.sin(a) * r * 0.6], { anchor, modifiers: { ...NO_MODIFIERS, shift: true } }).point
        expect(Math.abs((Math.atan2(p[1] - anchor[1], p[0] - anchor[0]) * 180) / Math.PI - 45), `round ${r} m, hand at ${degrees}°`).toBeLessThan(1e-6)
      }
    }
  })
})
