import type { Vec2 } from '../geometry/vector'
import { copyRing, pathMiddle } from '../geometry/vector'
import type { Fixture, Level, Line } from './types'
import { uid } from './document'
import { reconcileFaces, wallTopology, type UnitFace, type UnitTopology } from './units'

/** Faces thinner than this are construction slivers, never fixtures. */
export const MIN_FIXTURE_AREA = 0.001

export interface FixtureRun {
  signature: string
  points: Vec2[]
}

/**
 * Open runs of the fixture line graph: chains of bridge edges, walked from
 * every end or branch through the plain vertices between, and oriented from
 * the lexicographically smaller end so the order is stable. A closed loop is
 * a face, never a run.
 */
export function fixtureRuns(g: UnitTopology): FixtureRun[] {
  const byVertex = new Map<number, number[]>()
  for (const e of g.bridges) {
    const edge = g.edges[e]
    for (const v of [edge.a, edge.b]) byVertex.set(v, [...(byVertex.get(v) ?? []), e])
  }
  const visited = new Set<number>()
  const runs: FixtureRun[] = []
  const walk = (start: number, first: number) => {
    const points: Vec2[] = [g.vertices[start].p]
    const owners = new Set<string>()
    let v = start
    let e = first
    while (!visited.has(e)) {
      visited.add(e)
      const edge = g.edges[e]
      for (const o of edge.owners) owners.add(o)
      v = edge.a === v ? edge.b : edge.a
      points.push(g.vertices[v].p)
      const next = (byVertex.get(v) ?? []).filter(x => x !== e)
      if (next.length !== 1) break
      e = next[0]
    }
    const head = points[0]
    const end = points[points.length - 1]
    const forward = head[0] < end[0] || (head[0] === end[0] && head[1] <= end[1])
    const ordered = forward ? points : [...points].reverse()
    runs.push({ signature: [...owners].sort().join('|'), points: ordered.map(p => [p[0], p[1]] as Vec2) })
  }
  for (const [v, edges] of byVertex) if (edges.length !== 2) for (const e of edges) if (!visited.has(e)) walk(v, e)
  return runs
}

export const fixtureTopology = (lines: Line[]): UnitTopology => wallTopology(lines)

type ClosedFixture = Fixture & { polygon: NonNullable<Fixture['polygon']> }

function fixtureFrom(f: UnitFace, existing?: ClosedFixture): ClosedFixture {
  return {
    id: existing?.id ?? uid(),
    kind: existing?.kind ?? 'object',
    signature: f.signature,
    polygon: { outer: copyRing(f.points), holes: f.holes.map(copyRing) },
    anchor: [f.anchor[0], f.anchor[1]],
    ...(existing?.name !== undefined ? { name: existing.name } : {}),
    ...(existing?.height !== undefined ? { height: existing.height } : {}),
    ...(existing?.recipe ? { recipe: { ...existing.recipe } } : {}),
    ...(existing?.roles ? { roles: { ...existing.roles } } : {}),
    ...(existing?.items ? { items: existing.items.map(i => ({ ...i })) } : {})
  }
}

const significant = (f: Fixture): boolean => f.kind !== 'object' || !!f.name

function runFrom(r: FixtureRun, existing?: Fixture): Fixture {
  return {
    id: existing?.id ?? uid(),
    kind: existing?.kind ?? 'object',
    signature: r.signature,
    line: r.points,
    anchor: pathMiddle(r.points),
    ...(existing?.name !== undefined ? { name: existing.name } : {}),
    ...(existing?.height !== undefined ? { height: existing.height } : {}),
    ...(existing?.recipe ? { recipe: { ...existing.recipe } } : {}),
    ...(existing?.roles ? { roles: { ...existing.roles } } : {})
  }
}

/** A run keeps the identity of the existing run sharing most of its lines. */
function reconcileRuns(existing: Fixture[], runs: FixtureRun[]): Fixture[] {
  const used = new Set<string>()
  return runs.map(r => {
    const ids = new Set(r.signature.split('|'))
    const best = existing
      .filter(f => f.line && !used.has(f.id))
      .map(f => ({ f, shared: f.signature.split('|').filter(id => ids.has(id)).length }))
      .filter(x => x.shared > 0)
      .sort((a, b) => b.shared - a.shared)[0]
    if (best) used.add(best.f.id)
    return runFrom(r, best?.f)
  })
}

export interface DeriveFixturesResult {
  fixtures: Fixture[]
  /** Existing classified fixtures whose identity cannot be assigned automatically. */
  conflicts: Fixture[]
}

/**
 * Fixtures are the faces and open runs of the fixture line graph, with
 * declared identity carried over the way units carry theirs. The graph is
 * separate from the walls, so a fixture never subdivides a room and a wall
 * never subdivides a fixture.
 */
export function deriveFixtures(level: Level): DeriveFixturesResult {
  const g = fixtureTopology(level.fixtureLines)
  const faces = g.faces.filter(f => f.netArea >= MIN_FIXTURE_AREA)
  const closed = reconcileFaces<ClosedFixture>(level.fixtures.filter((f): f is ClosedFixture => !!f.polygon), faces, fixtureFrom, significant)
  const open = reconcileRuns(level.fixtures, fixtureRuns(g))
  return { fixtures: [...closed.records, ...open], conflicts: closed.conflicts }
}
