import type { Box, Vec2 } from '../geometry/vector'
import { add, bounds } from '../geometry/vector'
import type { Fixture, Level, Line } from '../model/types'
import { quantize, uid } from '../model/document'
import type { Command } from './commands'
import { nodeKey } from './graph'
import { EMPTY_SELECTION, type Selection } from './selection'

/**
 * What a copy holds: lines of the fixture layer and the identity of every
 * fixture they bound whole. Walls, rooms and openings are not copied yet.
 */
export interface Clip {
  lines: Line[]
  fixtures: Fixture[]
}

const faceLines = (fixture: Fixture): string[] => (fixture.signature ? fixture.signature.split('|') : [])

/**
 * The fixture lines a selection names, plus the boundary lines of every
 * selected fixture, and the records of every fixture whose lines are all
 * among them: its kind, recipe, name, height and roles. Its link is not
 * copied: what a copy stands for is given again in Connect. Null when
 * nothing on the fixture layer is selected.
 */
export function copySelection(level: Level, selection: Selection): Clip | null {
  const byId = new Map(level.fixtureLines.map(l => [l.id, l]))
  const ids = new Set([...selection.lineIds].filter(id => byId.has(id)))
  for (const fixture of level.fixtures) if (selection.fixtureIds.has(fixture.id)) for (const id of faceLines(fixture)) if (byId.has(id)) ids.add(id)
  if (!ids.size) return null
  const fixtures = level.fixtures
    .filter(f => f.polygon && faceLines(f).length && faceLines(f).every(id => ids.has(id)))
    .map(({ ref: _link, ...record }) => structuredClone(record))
  return { lines: level.fixtureLines.filter(l => ids.has(l.id)).map(l => structuredClone(l)), fixtures }
}

/** The clip's extent, which a paste carries by its middle. */
export const clipBox = (clip: Clip): Box => bounds(clip.lines.flatMap(l => l.points))

/** Every point a paste moves, its nodes: what snaps as the clip is carried. */
export const clipPoints = (clip: Clip): Vec2[] => {
  const seen = new Map<string, Vec2>()
  for (const l of clip.lines) for (const p of l.points) seen.set(nodeKey(p, 'fixtures'), p)
  return [...seen.values()]
}

/** Every string equal to an old id replaced by its new one, however deep: a recipe's places name the lines they stand on. */
function rekey<T>(value: T, ids: Map<string, string>): T {
  if (typeof value === 'string') return (ids.get(value) ?? value) as T
  if (Array.isArray(value)) return value.map(v => rekey(v, ids)) as T
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [ids.get(k) ?? k, rekey(v, ids)])) as T
  return value
}

/** A fresh set of ids for one paste of a clip, so every paste is a new thing. */
export function freshIds(clip: Clip): Map<string, string> {
  return new Map([...clip.lines.map(l => [l.id, uid()] as const), ...clip.fixtures.map(f => [f.id, uid()] as const)])
}

/**
 * The commands that put the clip down moved by `delta`: its lines under
 * new ids, and its fixture records with their outlines moved, their
 * signatures and roles naming the new lines, so the commit's reconcile
 * gives each its face by signature, or by overlap if the commit splits a
 * line. With the selection of what was put down.
 */
export function pasteCommands(clip: Clip, delta: Vec2, ids: Map<string, string>): { commands: Command[]; selection: Selection } {
  const move = (p: Vec2): Vec2 => quantize(add(p, delta))
  const lines: Line[] = clip.lines.map(l => ({ ...l, id: ids.get(l.id)!, points: [move(l.points[0]), move(l.points[1])], ...(l.curve ? { curve: [move(l.curve[0]), move(l.curve[1])] as [Vec2, Vec2] } : {}) }))
  const fixtures: Fixture[] = clip.fixtures.map(f => {
    const polygon = f.polygon && { outer: f.polygon.outer.map(move), holes: f.polygon.holes.map(r => r.map(move)) }
    return {
      ...f,
      id: ids.get(f.id)!,
      signature: faceLines(f).map(id => ids.get(id) ?? id).sort().join('|'),
      anchor: move(f.anchor),
      ...(polygon ? { polygon } : {}),
      ...(f.roles ? { roles: rekey(f.roles, ids) } : {}),
      ...(f.recipe ? { recipe: rekey(f.recipe, ids) } : {})
    }
  })
  return {
    commands: [...lines.map((line): Command => ({ type: 'addFixtureLine', line })), ...(fixtures.length ? [{ type: 'addFixtures', fixtures } as Command] : [])],
    selection: { ...EMPTY_SELECTION, fixtureIds: new Set(fixtures.map(f => f.id)), lineIds: new Set(fixtures.length ? [] : lines.map(l => l.id)) }
  }
}
