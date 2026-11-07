import { DoubleSide, Group, Mesh, MeshBasicMaterial } from 'three'
import type { Level } from '../model/types'
import { DEFAULT_FIXTURE_HEIGHT } from '../model/categories'
import { TABLE_HEIGHT } from '../furniture/table'
import { prism } from './geometry'
import { roomSurface, supportTop, type Support } from './level'
import type { Picked } from './pick'

/** How a highlighted thing is marked: selected, or under the hand. */
export type HighlightStyle = 'selected' | 'hover'

/** How far above its surface a highlight floats, in metres, so it is never hidden in it. */
const LIFT = 0.012
const COLOURS: Record<HighlightStyle, { color: number; opacity: number }> = {
  selected: { color: 0xa7c5b2, opacity: 0.42 },
  hover: { color: 0xd6e6dc, opacity: 0.2 }
}

/**
 * Marks on a built level for what is selected and what is under the hand:
 * a light over what shows of a room's floor (`roomSurface`), or over a fixture's top at
 * its height, each lifted onto the supports under it as the level stands
 * them, which shows wherever the surface does, in the editor's
 * accent. A group of its own, with its
 * own materials, so a host adds it to the level's group, replaces it when
 * the marks change and disposes it; nothing else is rebuilt. A selected
 * thing under the hand keeps the selected mark.
 */
export function highlightGroup(level: Level, marks: { picked: Picked; style: HighlightStyle }[], supports: Support[] = []): Group {
  const group = new Group()
  group.name = 'highlights'
  const materials = new Map<HighlightStyle, MeshBasicMaterial>()
  const material = (style: HighlightStyle) => {
    let m = materials.get(style)
    if (!m) materials.set(style, (m = new MeshBasicMaterial({ color: COLOURS[style].color, transparent: true, opacity: COLOURS[style].opacity, depthWrite: false, side: DoubleSide })))
    return m
  }
  const seen = new Set<string>()
  const ordered = [...marks].sort((a, b) => (a.style === b.style ? 0 : a.style === 'selected' ? -1 : 1))
  for (const { picked, style } of ordered) {
    const key = `${picked.kind}:${picked.id}`
    if (seen.has(key)) continue
    seen.add(key)
    const unit = picked.kind === 'room' ? level.units.find(u => u.id === picked.id) : undefined
    const fixture = picked.kind === 'fixture' ? level.fixtures.find(f => f.id === picked.id) : undefined
    const polygon = (unit ?? fixture)?.polygon
    if (!polygon) continue
    const height = fixture ? (fixture.height ?? (fixture.kind === 'table' ? TABLE_HEIGHT : DEFAULT_FIXTURE_HEIGHT)) + (fixture.kind === 'table' ? supportTop(polygon, supports) : 0) : supportTop(polygon, supports)
    const surface = unit ? roomSurface(level, unit) : [polygon]
    for (const piece of surface) {
      const tint = new Mesh(prism(piece, height + LIFT, height + LIFT + 0.002), material(style))
      tint.renderOrder = 10
      group.add(tint)
    }
  }
  return group
}
