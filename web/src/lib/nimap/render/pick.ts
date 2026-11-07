import type { Ray } from 'three'
import type { Vec2 } from '../geometry/vector'
import { pointInPolygon } from '../geometry/vector'
import type { Level } from '../model/types'
import { groundOf } from '../model/floors'
import { DEFAULT_FIXTURE_HEIGHT } from '../model/categories'
import { TABLE_HEIGHT } from '../furniture/table'
import { supportTop, type Support } from './level'

/** Something on a level with an identity a hand can point at: a room, or a traced fixture. */
export interface Picked {
  kind: 'room' | 'fixture'
  id: string
}

/**
 * What a ray into the scene points at on a built level: each fixture as a
 * flat top at its own height (lifted as the renderer lifts it onto the
 * supports under it), tested against its outline, and each room as its
 * floor (the top of a support covering it), the nearest along the ray
 * winning. Walls are never picked.
 * It reads the model's outlines, not the meshes, so merged and instanced
 * furniture pick as exactly as anything else. `kinds` narrows what may be
 * picked; null when the ray meets none of it.
 */
export function pickFeature(level: Level, ray: Ray, kinds: Picked['kind'][] = ['room', 'fixture'], supports: Support[] = []): Picked | null {
  let best: { picked: Picked; t: number } | null = null
  const at = (height: number): { t: number; point: Vec2 } | null => {
    const y = level.elevation + height
    if (Math.abs(ray.direction.y) < 1e-9) return null
    const t = (y - ray.origin.y) / ray.direction.y
    if (t < 0) return null
    return { t, point: [ray.origin.x + ray.direction.x * t, -(ray.origin.z + ray.direction.z * t)] }
  }
  const offer = (picked: Picked, t: number) => {
    if (!best || t < best.t) best = { picked, t }
  }
  if (kinds.includes('fixture')) {
    for (const f of level.fixtures) {
      if (!f.polygon || f.kind === 'hole') continue
      const top = f.height ?? (f.kind === 'table' ? TABLE_HEIGHT : DEFAULT_FIXTURE_HEIGHT)
      const hit = at(top + (f.kind === 'table' ? supportTop(f.polygon, supports) : 0))
      if (hit && pointInPolygon(hit.point, f.polygon)) offer({ kind: 'fixture', id: f.id }, hit.t)
    }
  }
  if (kinds.includes('room')) {
    for (const u of level.units) {
      if (u.hidden || groundOf(u) === 'outside') continue
      const hit = at(supportTop(u.polygon, supports))
      if (hit && pointInPolygon(hit.point, u.polygon)) offer({ kind: 'room', id: u.id }, hit.t)
    }
  }
  return best ? (best as { picked: Picked }).picked : null
}
