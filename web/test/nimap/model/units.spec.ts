import { describe, it, expect } from 'vitest'
import { wallTopology, reconcileUnits, resolveUnits, deriveUnits, createLevel, validateLevel } from '$lib/nimap'
import type { Wall, WallLike, Unit, Vec2 } from '$lib/nimap'

const line = (id: string, a: Vec2, b: Vec2, width = 0.16): Wall => ({ id, points: [a, b], width })

function starterWalls(): Wall[] {
  return [
    line('n', [0, 0], [10, 0], 0.24), line('e', [10, 0], [10, 7], 0.24), line('s', [10, 7], [0, 7], 0.24), line('w', [0, 7], [0, 0], 0.24),
    line('split', [0, 3], [10, 3]), line('middle', [5, 0], [5, 3]), line('partition', [7.6, 4.6], [9, 4.6])
  ]
}

function starter(): { walls: Wall[]; units: Unit[] } {
  const walls = starterWalls()
  const units = reconcileUnits([], wallTopology(walls).faces).units.map(u => {
    if (u.anchor[1] > 3) return { ...u, name: 'Shared lounge' }
    if (u.anchor[0] < 5) return { ...u, name: 'Meeting Room 1', ref: { kind: 'room', id: 'meeting-01' } }
    return { ...u, name: 'Meeting Room 2', ref: { kind: 'room', id: 'meeting-02' } }
  })
  return { walls, units }
}

const byName = (units: Unit[]) => Object.fromEntries(units.map(u => [u.name, u.id]))

describe('units derived from walls', () => {
  it('enumerates three rooms with signatures and anchors inside', () => {
    const { units } = starter()
    expect(units.length).toBe(3)
    expect(units.map(u => u.signature).every(s => s.includes('|'))).toBe(true)
    expect(new Set(units.map(u => u.id)).size).toBe(3)
  })

  it('keeps identity when a node moves along its host wall', () => {
    const { walls, units } = starter()
    const moved = walls.map(w => (w.id === 'middle' ? { ...w, points: [[5, 0], [5.6, 3]] as Vec2[] } : w))
    const r = reconcileUnits(units, wallTopology(moved).faces)
    expect(r.conflicts).toEqual([])
    for (const u of r.units) expect(u.id).toBe(byName(units)[u.name])
  })

  it('keeps identity across a width change and a rename', () => {
    const { walls, units } = starter()
    const wider = walls.map(w => (w.id === 'n' ? { ...w, width: 0.5 } : w))
    expect(reconcileUnits(units, wallTopology(wider).faces).units.map(u => u.id)).toEqual(units.map(u => u.id))
    const renamed = units.map((u, i) => (i === 0 ? { ...u, name: 'Renamed', ref: { kind: 'room', id: 'r-999' } } : u))
    expect(reconcileUnits(renamed, wallTopology(walls).faces).units.find(u => u.id === units[0].id)!.name).toBe('Renamed')
  })

  it('preserves hidden and category', () => {
    const { walls, units } = starter()
    const marked = units.map(u => ({ ...u, hidden: true, category: 'walkway' as const }))
    const r = reconcileUnits(marked, wallTopology(walls).faces)
    expect(r.units.every(u => u.hidden && u.category === 'walkway')).toBe(true)
  })

  it('splitting a named room is a conflict the user resolves', () => {
    const { walls, units } = starter()
    const split = [...walls, line('cut', [0, 5], [10, 5])]
    const r = reconcileUnits(units, wallTopology(split).faces)
    expect(r.units.length).toBe(4)
    expect(r.conflicts.map(u => u.name)).toContain('Shared lounge')
    const resolved = resolveUnits(units, r.faces, r.choices.map(c => c.selected))
    expect(new Set(resolved.units.map(u => u.id)).size).toBe(4)
    expect(resolved.units.filter(u => u.name === 'Shared lounge').length).toBe(1)

    const lounge = units.find(u => u.name === 'Shared lounge')!
    const twice = r.choices.map(c => (c.candidates.some(u => u.id === lounge.id) ? lounge.id : c.selected))
    expect(() => resolveUnits(units, r.faces, twice)).toThrow(/only be kept by one/)
  })

  it('merging two named rooms archives the loser', () => {
    const { walls, units } = starter()
    const merged = walls.filter(w => w.id !== 'middle')
    const r = reconcileUnits(units, wallTopology(merged).faces)
    expect(r.units.length).toBe(2)
    expect(r.conflicts.filter(u => u.name.startsWith('Meeting')).length).toBe(2)
    const resolved = resolveUnits(units, r.faces, r.choices.map(c => c.selected))
    expect(resolved.archived.length).toBe(1)
  })

  it('removing the perimeter is a conflict', () => {
    const { walls, units } = starter()
    const open = walls.filter(w => w.id !== 'n')
    expect(reconcileUnits(units, wallTopology(open).faces).conflicts.length).toBeGreaterThan(0)
  })

  it('rejects unknown identity choices', () => {
    const { walls, units } = starter()
    const faces = wallTopology(walls).faces
    expect(() => resolveUnits(units, faces, ['nope', null, null])).toThrow(/existing unit/)
  })

  it('corner split faces with identical provenance get distinct ids that survive re-derivation', () => {
    const walls: WallLike[] = [
      { id: 'perimeter', points: [[0, 0], [16, 0], [16, 10], [0, 10], [0, 0]], width: 0.16 },
      { id: 'diagonal', points: [[13, 0], [16, 3]], width: 0.16 }
    ]
    const faces = wallTopology(walls).faces
    expect(faces.length).toBe(2)
    expect(faces[0].signature).toBe(faces[1].signature)
    const first = reconcileUnits([], faces).units.map(u => ({ ...u, name: u.polygon.outer.length === 3 ? 'small' : 'big' }))
    expect(new Set(first.map(u => u.id)).size).toBe(2)
    const again = reconcileUnits(first, wallTopology(walls).faces)
    expect(again.conflicts).toEqual([])
    for (const u of again.units) expect(u.id).toBe(first.find(f => f.name === u.name)!.id)
  })

  it('deriveUnits round-trips through JSON and validates', () => {
    const { walls, units } = starter()
    const level = createLevel({ name: 'Ground', walls, units })
    const copy = JSON.parse(JSON.stringify(level))
    validateLevel(copy)
    const r = deriveUnits(copy)
    expect(r.conflicts).toEqual([])
    expect(r.units.map(u => u.id).sort()).toEqual(units.map(u => u.id).sort())
  })
})
