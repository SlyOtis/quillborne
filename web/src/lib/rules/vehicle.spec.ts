import { describe, expect, it } from 'vitest'
import voidsea from '../../../public/sources/systems/vehicles/voidsea.json'
import {
  getCompatibility,
  getContext,
  getDamage,
  getDef,
  getFacing,
  getLayout,
  getMergedVehicleSystem,
  getPackageIssues,
  getPerkBlock,
  getPerkIssues,
  getPerkLimit,
  getRepair,
  getAttacks,
  getTemplateBuild,
  getTemplateDrift,
  getTopSpeed,
  getVehicleIssues,
  getVehiclePackage,
  getVehicleStats,
  getWeaponModes,
  getWeight
} from './vehicle'
import type { ComponentState, Condition, Crewman, InstalledComponent, VehicleSystem } from './vehicle.types'

const system = voidsea as unknown as VehicleSystem
const jaws = system.templates.find((entry) => entry.key === 'jaws')!
const deck = getLayout(system, jaws.layout)!

const def = (key: string) => getDef(system, key)!
const st = (hp: number, condition: Condition = 'functional', destroyed = false): ComponentState => ({ hp, condition, destroyed })

const built = () => getTemplateBuild(system, jaws, (() => {
  let n = 0
  return () => `c${++n}`
})())

const bySlot = (components: InstalledComponent[], slot: string) => components.find((c) => c.slot === slot)!

const ctxFor = (components: InstalledComponent[], states: Record<string, ComponentState> = {}, rulings: Record<string, string> = {}) =>
  getContext(system, deck, components, jaws.stats, states, rulings)

const gunner: Crewman = {
  id: 'char-1',
  name: 'Marla',
  level: 5,
  crewLevel: 5,
  proficiency: 3,
  modifiers: { strength: 0, dexterity: 2, constitution: 1, intelligence: 4, wisdom: 1, charisma: -1 },
  perks: [{ id: 'artillery-proficiency', count: 2 }, { id: 'shot-specialist', count: 1 }]
}

describe('component conditions', () => {
  const cannon = def('magitech-cannon-basic')

  it('ignores damage that does not exceed the DT and applies damage that bypasses it', () => {
    expect(getDamage(system, cannon, st(30), 16, false).ignored).toBe(true)
    expect(getDamage(system, cannon, st(30), 5, true).state.hp).toBe(25)
  })

  it('impairs at or below the IT, breaks at 0 and destroys with 30 left over', () => {
    expect(getDamage(system, cannon, st(30), 17, false).state).toMatchObject({ hp: 13, condition: 'impaired' })
    expect(getDamage(system, cannon, st(18), 18, false).state).toMatchObject({ hp: 0, condition: 'broken', destroyed: false })
    expect(getDamage(system, cannon, st(10), 40, false).state.destroyed).toBe(true)
    expect(getDamage(system, cannon, st(10), 39, false).state.destroyed).toBe(false)
  })

  it('restores a broken component at its IT, or above it under the strict ruling', () => {
    expect(getRepair(system, cannon, st(0, 'broken'), 18, {}).state.condition).toBe('impaired')
    expect(getRepair(system, cannon, st(0, 'broken'), 17, {}).state.condition).toBe('broken')
    const strict = { 'AMB-BROKEN-RECOVERY': 'gt' }
    expect(getRepair(system, cannon, st(0, 'broken'), 18, strict).state.condition).toBe('broken')
    expect(getRepair(system, cannon, st(0, 'broken'), 19, strict).state.condition).toBe('impaired')
  })
})

describe('Jaws', () => {
  it('builds every template component from the catalogue', () => {
    const components = built()
    expect(components).toHaveLength(jaws.components.length)
    expect(ctxFor(components).components).toHaveLength(jaws.components.length)
    expect(getVehicleIssues(ctxFor(components).components).filter((i) => i.severity === 'error')).toEqual([])
  })

  it('sails at 90 ft and loses 30 when the mainsail is impaired', () => {
    const components = built()
    expect(getTopSpeed(ctxFor(components)).value).toBe(90)
    const mast = bySlot(components, 'P1')
    expect(getTopSpeed(ctxFor(components, { [mast.id]: st(10, 'impaired') })).value).toBe(60)
  })

  it('turns twice, once when the helm is impaired', () => {
    const components = built()
    const helm = bySlot(components, 'C1')
    expect(getFacing(ctxFor(components)).value).toBe(2)
    expect(getFacing(ctxFor(components, { [helm.id]: st(5, 'impaired') })).value).toBe(1)
  })

  it('weighs what its stat block states until the table rules otherwise', () => {
    const components = built()
    expect(getWeight(ctxFor(components))).toMatchObject({ value: 35, pending: 'AMB-SHIP-WEIGHT' })
    expect(getWeight(ctxFor(components, {}, { 'AMB-SHIP-WEIGHT': 'component-sum' })).pending).toBeUndefined()
  })

  it('counts the artillery that can still fire', () => {
    const components = built()
    const gun = bySlot(components, 'A1')
    const lines = getVehicleStats(ctxFor(components, { [gun.id]: st(0, 'broken') }))
    expect(lines.find((l) => l.key === 'artillery')?.value).toBe('3 / 4 ready')
  })
})

describe('artillery with the crewman aboard', () => {
  it('adds the best ability and the artillery perks to hit, and the shot specialist dice', () => {
    const components = built()
    const ctx = ctxFor(components)
    const gun = ctx.components.find((c) => c.slot === 'A1')!
    const [first] = getWeaponModes(ctx, gun, gunner, 'functional')
    expect(first.bonus).toBe(6)
    expect(first.toHit).toBe('+6')
    expect(first.damageShort).toContain('+ 1d6')
  })

  it('reads the formula without a crewman', () => {
    const ctx = ctxFor(built())
    const gun = ctx.components.find((c) => c.slot === 'A1')!
    const [first] = getWeaponModes(ctx, gun, null, 'functional')
    expect(first.toHit).toMatch(/^\+[A-Z]{3}(\/[A-Z]{3})*$/)
    expect(first.bonus).toBeNull()
  })

  it('takes the stat block chain range only when the table rules so', () => {
    const ctx = ctxFor(built(), {}, { 'AMB-CHAIN-RANGE': 'statblock' })
    const gun = ctx.components.find((c) => c.slot === 'A1')!
    const chain = getWeaponModes(ctx, gun, null, 'functional').find((m) => m.key === 'chain')!
    expect(chain.ranges.find((r) => r.label === 'Long')?.value).toBe('960')
    expect(chain.pendingRuling).toBeUndefined()
  })
})

describe('what the vessel can attack with', () => {
  it('lists every weapon and the tail club with what a broken one cannot do', () => {
    const components = built()
    const gun = bySlot(components, 'A1')
    const attacks = getAttacks(ctxFor(components, { [gun.id]: st(0, 'broken') }), gunner)
    expect(attacks.map((entry) => entry.component.slot)).toEqual(expect.arrayContaining(['A1', 'A2', 'A3', 'A4', 'M2']))
    expect(attacks.find((entry) => entry.component.slot === 'A1')?.modes.every((mode) => mode.unavailable)).toBe(true)
    expect(attacks.find((entry) => entry.component.slot === 'M2')?.modes[0].kind).toBe('melee')
  })
})

describe('compatibility', () => {
  it('refuses an occupied slot, a wrong type and a second hull', () => {
    const ctx = ctxFor(built())
    const a1 = deck.slots.find((s) => s.code === 'A1')!
    const codes = getCompatibility(system, a1, def('magitech-cannon-basic'), ctx.components).map((i) => i.code)
    expect(codes).toContain('occupied')
    const hullCodes = getCompatibility(system, a1, def('adamantine-hull-superior'), ctx.components).map((i) => i.code)
    expect(hullCodes).toEqual(expect.arrayContaining(['slot-type', 'one-hull']))
  })

  it('accepts a cannon in the empty slot it replaces', () => {
    const ctx = ctxFor(built())
    const a1 = deck.slots.find((s) => s.code === 'A1')!
    const current = ctx.components.find((c) => c.slot === 'A1')!
    expect(getCompatibility(system, a1, def('magitech-cannon-basic'), ctx.components, current.id)).toEqual([])
  })
})

describe('perks', () => {
  it('limits a perk taken up to the proficiency bonus', () => {
    const perk = system.perks.find((p) => p.id === 'artillery-proficiency')!
    expect(getPerkLimit(system, perk, 3, {})).toBe(3)
  })

  it('reports a budget past the crew level and blocks another perk', () => {
    const over = { ...gunner, crewLevel: 2 }
    expect(getPerkIssues(system, over, {}).map((i) => i.code)).toContain('perk-budget')
    const crit = system.perks.find((p) => p.id === 'crit-fisher')!
    expect(getPerkBlock(system, { ...gunner, crewLevel: 3 }, crit, {})).not.toBeNull()
    expect(getPerkBlock(system, { ...gunner, crewLevel: 6 }, crit, {})).toBeNull()
  })
})

describe('homebrew', () => {
  it('adds a component the vessel alone carries and keeps the catalogue untouched', () => {
    const merged = getMergedVehicleSystem(system, { components: [{ ...def('magitech-cannon-basic'), key: 'brass-cannon', name: 'Brass Cannon' }] })
    expect(getDef(merged, 'brass-cannon')?.homebrew).toBe(true)
    expect(getDef(system, 'brass-cannon')).toBeUndefined()
  })
})

describe('vehicle files', () => {
  it('round trips a built vessel and refuses a component the catalogue lacks', () => {
    const pkg = getVehiclePackage({ name: 'Jaws', system: 'voidsea', template: 'jaws', template_version: 1, layout: deck.key, components: built(), stats: jaws.stats, rulings: {}, overlay: {} })
    expect(getPackageIssues(JSON.parse(JSON.stringify(pkg)), [system])).toEqual([])
    const broken = { ...pkg, components: [...pkg.components, { ...pkg.components[0], component: 'no-such-part' }] }
    expect(getPackageIssues(broken, [system])).toHaveLength(1)
  })

  it('names the slots that drifted from the template', () => {
    const components = built().map((row) => (row.slot === 'A1' ? { ...row, component: 'energy-ray-basic' } : row))
    expect(getTemplateDrift(system, jaws, components).map((row) => row.slot)).toEqual(['A1'])
  })
})
