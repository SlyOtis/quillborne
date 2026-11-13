import { describe, expect, it } from 'vitest'
import dnd5e from '../../../public/sources/systems/dnd5e.json'
import gunslinger from '../../../public/sources/systems/gunslinger.json'
import nimble from '../../../public/sources/systems/nimble.json'
import { getResolvedCharacter, RuleCycleError } from './derive'
import { getMergedSystem } from './system'
import type { CharacterSheet, RuleSystem, RuleSystemOverlay } from './spec.types'

const core = dnd5e as RuleSystem

const lars: CharacterSheet = {
  systems: ['dnd5e'],
  level: 5,
  attributes: { str: 11, dex: 18, con: 14, int: 12, wis: 13, cha: 16 },
  proficiencies: {
    'skill.perception': 'proficient',
    'skill.stealth': 'expertise',
    'save.dex': 'proficient',
    'save.wis': 'proficient'
  },
  pools: {},
  bonuses: {}
}

describe('getResolvedCharacter on the 5e core', () => {
  const resolved = getResolvedCharacter(core, lars)

  it('derives the proficiency bonus from the level', () => {
    expect(resolved.proficiency).toBe(3)
  })

  it('derives every ability modifier', () => {
    const byId = Object.fromEntries(resolved.attributes.map((entry) => [entry.id, entry.value]))
    expect(byId).toEqual({ str: 0, dex: 4, con: 2, int: 1, wis: 1, cha: 3 })
  })

  it('applies the proficiency tier to a skill', () => {
    const skill = (id: string) => resolved.skills.find((entry) => entry.id === id)?.value
    expect(skill('perception')).toBe(4)
    expect(skill('stealth')).toBe(10)
    expect(skill('arcana')).toBe(1)
  })

  it('applies half proficiency as a half multiplier', () => {
    const half = getResolvedCharacter(core, {
      ...lars,
      proficiencies: { 'skill.arcana': 'half' }
    })
    expect(half.skills.find((entry) => entry.id === 'arcana')?.value).toBe(2.5)
  })

  it('resolves a sense that depends on a skill', () => {
    expect(resolved.senses.find((entry) => entry.id === 'passivePerception')?.value).toBe(14)
  })

  it('resolves derived values that depend on modifiers', () => {
    const derived = (id: string) => resolved.derived.find((entry) => entry.id === id)?.value
    expect(derived('initiative')).toBe(4)
    expect(derived('armorClass')).toBe(14)
    expect(derived('carryCapacity')).toBe(165)
  })

  it('resolves a pool whose maximum is a derived value', () => {
    const hitPoints = resolved.pools.find((entry) => entry.id === 'hitPoints')
    expect(hitPoints?.max).toBe(10)
    expect(hitPoints?.remaining).toBe(10)
  })

  it('resolves what a pool regains, and the whole pool when it declares no amount', () => {
    const pool = (id: string) => resolved.pools.find((entry) => entry.id === id)?.regain
    expect(pool('hitDice')).toBe(2)
    expect(pool('hitPoints')).toBe(10)
  })

  it('resolves the view a pool declares and plate for one that declares none', () => {
    const view = (id: string) => resolved.pools.find((entry) => entry.id === id)?.view
    expect(view('hitDice')).toBe('plate')
    expect(view('hitPoints')).toBe('plate')
    expect(view('inspiration')).toBe('pips')
    const layered = getResolvedCharacter(getMergedSystem(core, nimble as RuleSystemOverlay), { ...lars, systems: ['dnd5e', 'nimble'] })
    expect(layered.pools.find((entry) => entry.id === 'mana')?.view).toBe('plate')
  })

  it('keeps the death save thresholds and the hit die healing in the system', () => {
    expect(resolved.scope['derived.deathSaveTarget']).toBe(10)
    expect(resolved.scope['derived.deathSaveFumbleFailures']).toBe(2)
    expect(resolved.scope['derived.hitDieHealing']).toBe(2)
    expect(resolved.derived.some((entry) => entry.id === 'deathSaveTarget')).toBe(false)
  })

  it('declares the conditions and the damage types a sheet offers', () => {
    expect(core.conditions?.find((entry) => entry.id === 'exhaustion')?.levels).toBe(6)
    expect(core.conditions).toHaveLength(15)
    expect(core.damageTypes).toHaveLength(13)
    expect(core.defences?.map((entry) => entry.id)).toEqual(['resistance', 'immunity', 'vulnerability'])
  })

  it('spends against a pool without going below zero', () => {
    const hurt = getResolvedCharacter(core, { ...lars, pools: { hitPoints: 99 } })
    const hitPoints = hurt.pools.find((entry) => entry.id === 'hitPoints')
    expect(hitPoints?.spent).toBe(hitPoints?.max)
    expect(hitPoints?.remaining).toBe(0)
  })

  it('reads a bonus from the sheet and defaults a missing one to zero', () => {
    const armored = getResolvedCharacter(core, { ...lars, bonuses: { armorClass: 3 } })
    expect(armored.derived.find((entry) => entry.id === 'armorClass')?.value).toBe(17)
  })

  it('clamps an attribute to its declared range', () => {
    const overflowing = getResolvedCharacter(core, { ...lars, attributes: { ...lars.attributes, dex: 99 } })
    expect(overflowing.attributes.find((entry) => entry.id === 'dex')?.score).toBe(30)
  })

  it('clamps the level to the progression maximum', () => {
    expect(getResolvedCharacter(core, { ...lars, level: 40 }).level).toBe(20)
  })
})

describe('layering a system over the core', () => {
  const layered = getMergedSystem(core, nimble as RuleSystemOverlay)

  it('keeps every core skill', () => {
    expect(layered.skills).toHaveLength(core.skills.length)
  })

  it('redefines a derived value in place rather than adding a second one', () => {
    const armorClass = layered.derived.filter((entry) => entry.id === 'armorClass')
    expect(armorClass).toHaveLength(1)
    expect(armorClass[0].value).toBe('bonus.armorClass')
  })

  it('adds the pools the overlay brings', () => {
    const ids = layered.pools.map((entry) => entry.id)
    expect(ids).toContain('hitDice')
    expect(ids).toContain('mana')
    expect(ids).toContain('actions')
  })

  it('changes the maximum hit points through the progression steps', () => {
    const resolved = getResolvedCharacter(layered, { ...lars, systems: ['dnd5e', 'nimble'] })
    expect(resolved.scope['step.hitPointsPerLevel']).toBe(6)
    expect(resolved.pools.find((entry) => entry.id === 'hitPoints')?.max).toBe(40)
  })

  it('replaces a panel of the same id and adds the new one', () => {
    const defence = layered.panels.filter((entry) => entry.id === 'defence')
    expect(defence).toHaveLength(1)
    expect(defence[0].fields.some((field) => field.id === 'wounds')).toBe(true)
    expect(layered.panels.some((entry) => entry.id === 'turn')).toBe(true)
  })
})

describe('a custom character system', () => {
  const custom = getMergedSystem(core, gunslinger as RuleSystemOverlay)
  const sheet: CharacterSheet = {
    ...lars,
    systems: ['dnd5e', 'gunslinger'],
    attributes: { ...lars.attributes, grt: 16 },
    proficiencies: { ...lars.proficiencies, 'skill.gunsmithing': 'proficient' }
  }
  const resolved = getResolvedCharacter(custom, sheet)

  it('adds an attribute the core does not have', () => {
    expect(resolved.attributes.find((entry) => entry.id === 'grt')?.value).toBe(3)
  })

  it('adds a skill that scales off the new attribute', () => {
    expect(resolved.skills.find((entry) => entry.id === 'gunsmithing')?.value).toBe(6)
  })

  it('adds a point system of its own', () => {
    expect(resolved.pools.find((entry) => entry.id === 'grit')?.max).toBe(6)
  })

  it('adds a derived value that reads the new attribute', () => {
    expect(resolved.derived.find((entry) => entry.id === 'trickShotDc')?.value).toBe(14)
  })

  it('leaves the core untouched for a character that does not take the overlay', () => {
    expect(core.attributes.some((entry) => entry.id === 'grt')).toBe(false)
    expect(getResolvedCharacter(core, lars).attributes).toHaveLength(6)
  })
})

describe('layering three systems', () => {
  it('applies them left to right', () => {
    const stacked = getMergedSystem(getMergedSystem(core, nimble as RuleSystemOverlay), gunslinger as RuleSystemOverlay)
    expect(stacked.id).toBe('gunslinger')
    expect(stacked.pools.map((entry) => entry.id)).toContain('mana')
    expect(stacked.pools.map((entry) => entry.id)).toContain('grit')
    expect(stacked.attributes).toHaveLength(7)
  })
})

describe('a broken system', () => {
  it('reports a cycle instead of hanging', () => {
    const cyclic: RuleSystem = {
      ...core,
      derived: [
        { id: 'a', title: 'A', value: 'derived.b' },
        { id: 'b', title: 'B', value: 'derived.a' }
      ]
    }
    expect(() => getResolvedCharacter(cyclic, lars)).toThrow(RuleCycleError)
  })
})
