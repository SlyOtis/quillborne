import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { createDocument, createLevel, validateDocument, validateLevel, validateWall, deriveUnits, createEditorStore, UNIT_CATEGORIES, wallsFromSvg, quantize, fitOpening, MIN_FEATURE, FORMAT_VERSION } from '$lib/nimap'
import type { Unit, Wall } from '$lib/nimap'
import { demoLevel, DEMO_ROOMS } from '../fixtures/demo-building.fixture'

describe('document', () => {
  it('creates a versioned document with ids', () => {
    const doc = createDocument({ name: 'Office', levels: [createLevel({ name: 'Ground' })] })
    expect(doc.format).toBe('nimap')
    expect(doc.version).toBe(FORMAT_VERSION)
    expect(doc.id).toMatch(/[0-9a-f-]{36}/)
    validateDocument(doc)
  })

  it('rejects bad walls', () => {
    expect(() => validateWall({ id: 'w', points: [[0, 0], [1, 0]], width: -0.01 })).toThrow(/width/)
    expect(() => validateWall({ id: 'w', points: [[0, 0], [1, 0]], width: 0 }), 'a line of no width is an edge').not.toThrow()
    expect(() => validateWall({ id: 'w', points: [[0, 0], [0.001, 0]], width: 0.1 })).toThrow(/shorter/)
    expect(() => validateWall({ id: 'w', points: [[0, 0]], width: 0.1 } as unknown as Wall)).toThrow(/two finite points/)
    expect(() => validateWall({ id: 'w', points: [[0, 0], [1, 0]], width: 0.1, height: -1 })).toThrow(/height/)
  })

  it('rejects duplicate ids and unknown categories', () => {
    const level = createLevel({ name: 'L', walls: [{ id: 'a', points: [[0, 0], [1, 0]], width: 0.1 }, { id: 'a', points: [[0, 0], [0, 1]], width: 0.1 }] })
    expect(() => validateLevel(level)).toThrow(/duplicate/)
    const unit = { id: 'u', name: '', category: 'castle', signature: '', polygon: { outer: [[0, 0], [1, 0], [1, 1]], holes: [] }, anchor: [0.5, 0.5], hidden: false } as unknown as Unit
    expect(() => validateLevel(createLevel({ name: 'L', units: [unit] }))).toThrow(/category/)
    expect(UNIT_CATEGORIES).toContain('conferenceroom')
  })

  it('a space covers units that exist, each in no other space, and keeps covering what survives an edit', () => {
    const walls: Wall[] = [
      { id: 'n', points: [[0, 0], [6, 0]], width: 0.16 },
      { id: 'e', points: [[6, 0], [6, 4]], width: 0.16 },
      { id: 's', points: [[6, 4], [0, 4]], width: 0.16 },
      { id: 'w', points: [[0, 4], [0, 0]], width: 0.16 },
      { id: 'p', points: [[3, 0], [3, 4]], width: 0.05 }
    ]
    const store = createEditorStore(createLevel({ name: 'L', walls }))
    const [a, b] = store.level.units.map(u => u.id)
    const space = { id: 'suite', name: 'Suite', category: 'room' as const, units: [a, b] }
    expect(() => validateLevel({ ...store.level, spaces: [space] })).not.toThrow()
    expect(() => validateLevel({ ...store.level, spaces: [{ ...space, units: [a, 'nowhere'] }] })).toThrow(/no unit/)
    expect(() => validateLevel({ ...store.level, spaces: [space, { ...space, id: 'other' }] })).toThrow(/already belongs/)
    expect(() => validateLevel({ ...store.level, spaces: [{ ...space, id: a }] })).toThrow(/duplicate/)
    store.replace('Space', { ...store.level, spaces: [space] })
    store.commit('Merge', [{ type: 'removeLines', ids: ['p'] }])
    const merged = store.level
    expect(merged.units.length).toBe(1)
    expect(merged.spaces![0].units).toEqual([merged.units[0].id].filter(id => id === a || id === b))
    expect(() => validateLevel(merged)).not.toThrow()
  })

  it('the demo building derives ten units: its six named rooms, the two stalls and the washroom of the WC space, and the open floor', () => {
    const level = demoLevel()
    validateLevel(level)
    expect(level.units.length).toBe(10)
    expect(level.spaces?.map(s => [s.name, s.units.length])).toEqual([['WC', 3]])
    const named = level.units.filter(u => u.name)
    expect(named.map(u => u.name).sort()).toEqual(Object.keys(DEMO_ROOMS).sort())
    expect(named.every(u => u.ref?.kind === 'room')).toBe(true)
    const again = deriveUnits(level)
    expect(again.conflicts).toEqual([])
    expect(again.units.map(u => u.id).sort()).toEqual(level.units.map(u => u.id).sort())
    const main = level.units.find(u => !u.name)!
    expect(main.polygon.holes).toEqual([])
    expect(main.anchor[1]).toBeLessThan(0)
  })

  it('the demo building has its nine doors, each already where the fitter would put it', () => {
    const level = demoLevel()
    expect(level.openings.length).toBe(9)
    for (const door of level.openings) {
      const fit = fitOpening(door.at, door, level.walls, level.openings.filter(o => o.id !== door.id), MIN_FEATURE)
      expect(fit, door.id).not.toBeNull()
      expect(fit!.at[0], door.id).toBeCloseTo(door.at[0], 6)
      expect(fit!.at[1], door.id).toBeCloseTo(door.at[1], 6)
    }
  })
})

describe('svg import', () => {
  it('stores imported coordinates at micrometre precision', () => {
    const walls = wallsFromSvg(readFileSync(new URL('../fixtures/reference.svg', import.meta.url), 'utf8'))
    for (const w of walls) for (const p of w.points) expect(p).toEqual(quantize(p))
  })
})
