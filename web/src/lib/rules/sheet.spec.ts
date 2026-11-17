import { describe, expect, it } from 'vitest'
import cloak from '../../../public/sources/items/cloak-of-protection.json'
import gauntlets from '../../../public/sources/items/gauntlets-of-ogre-power.json'
import dnd5e from '../../../public/sources/systems/dnd5e.json'
import type { CharacterInventoryItem } from '../character.types'
import lars from '../character.fixture'
import { getItemGrants } from '../resources'
import { getResolvedCharacter } from './derive'
import { getAttributeId, getAttunedInventory, getAttunement, getReplacedAttunement, getSheet, getSkillId, getTierId } from './sheet'
import type { RuleSystem } from './spec.types'

const core = dnd5e as RuleSystem

describe('identifier mapping', () => {
  it('maps an ability title to its system id', () => {
    expect(getAttributeId('Strength')).toBe('str')
    expect(getAttributeId('  dexterity ')).toBe('dex')
  })

  it('maps a skill name to a camel case id', () => {
    expect(getSkillId('Animal Handling')).toBe('animalHandling')
    expect(getSkillId('Sleight of Hand')).toBe('sleightOfHand')
    expect(getSkillId('Perception')).toBe('perception')
  })

  it('maps a proficiency multiplier to a tier id', () => {
    expect(getTierId(core.proficiencyTiers, 0)).toBe('none')
    expect(getTierId(core.proficiencyTiers, 0.5)).toBe('half')
    expect(getTierId(core.proficiencyTiers, 1)).toBe('proficient')
    expect(getTierId(core.proficiencyTiers, 2)).toBe('expertise')
  })
})

describe('getSheet on the sample character', () => {
  const sheet = getSheet(lars, core)
  const resolved = getResolvedCharacter(core, sheet)

  it('carries the level', () => {
    expect(sheet.level).toBe(lars.info.level)
  })

  it('carries every ability score under its system id', () => {
    for (const ability of lars.abilities) {
      expect(sheet.attributes[getAttributeId(ability.title)]).toBe(ability.score)
    }
  })

  it('reproduces the stored armor class through the engine', () => {
    expect(resolved.derived.find((entry) => entry.id === 'armorClass')?.value).toBe(lars.info.ac)
  })

  it('reproduces the stored initiative through the engine', () => {
    expect(resolved.derived.find((entry) => entry.id === 'initiative')?.value).toBe(lars.info.initiative)
  })

  it('reproduces the stored maximum hit points through the engine', () => {
    expect(resolved.pools.find((entry) => entry.id === 'hitPoints')?.max).toBe(lars.info.hp.max)
  })

  it('reproduces the stored speed through the engine', () => {
    const speed = resolved.derived.find((entry) => entry.id === 'speed')?.value
    expect(speed).toBe(Number.parseInt(lars.info.speed, 10))
  })

  it('reproduces every stored skill modifier through the engine', () => {
    for (const skill of lars.skills) {
      const id = getSkillId(skill.name)
      const derived = resolved.skills.find((entry) => entry.id === id)
      if (!derived) continue
      expect([id, derived.value]).toEqual([id, skill.modifier])
    }
  })

  it('reproduces every stored saving throw through the engine', () => {
    for (const save of lars.savingThrows) {
      const id = getAttributeId(save.title)
      const derived = resolved.saves.find((entry) => entry.id === id)
      if (!derived) continue
      expect([id, derived.value]).toEqual([id, save.modifier])
    }
  })

  it('carries damage taken as spent hit points', () => {
    const pool = resolved.pools.find((entry) => entry.id === 'hitPoints')
    expect(pool?.spent).toBe(lars.info.hp.max - lars.info.hp.current)
    expect(pool?.remaining).toBe(lars.info.hp.current)
  })

  it('carries the custom resource pool the character owns', () => {
    expect(sheet.pools[getSkillId(lars.special.name)]).toBe(lars.special.max - lars.special.current)
  })
})

describe('what a character wears', () => {
  const held = (document: typeof cloak | typeof gauntlets, equipped: boolean, attuned: boolean): CharacterInventoryItem => ({
    id: document.name,
    title: document.name,
    type: 'misc',
    rarity: 'uncommon',
    attributes: [],
    description: '',
    value: { amount: 0, currency: 'gp' },
    weight: 0,
    quantity: 1,
    equippable: true,
    equipped,
    attunement: { required: document.attunement, attuned },
    grants: getItemGrants(document.grants)
  })
  const resolve = (...inventory: CharacterInventoryItem[]) => getResolvedCharacter(core, getSheet({ ...lars, inventory }, core))
  const bare = resolve()
  const armorClass = (resolved: typeof bare) => resolved.derived.find((entry) => entry.id === 'armorClass')?.value
  const strength = (resolved: typeof bare) => resolved.attributes.find((entry) => entry.id === 'str')?.score

  it('sets Strength to 19 with Gauntlets of Ogre Power equipped and attuned, and not before they are attuned', () => {
    expect(strength(resolve(held(gauntlets, true, true)))).toBe(19)
    expect(strength(resolve(held(gauntlets, true, false)))).toBe(strength(bare))
  })

  it('raises armor class and every save by 1 with a Cloak of Protection equipped and attuned, counting it once', () => {
    const warded = resolve(held(cloak, true, true))
    expect(armorClass(warded)).toBe(lars.info.ac + 1)
    expect(warded.saves.map((save) => save.value)).toEqual(bare.saves.map((save) => save.value + 1))
  })

  it('changes nothing with a Cloak of Protection carried', () => {
    const carried = resolve(held(cloak, false, true))
    expect(armorClass(carried)).toBe(lars.info.ac)
    expect(carried.saves).toEqual(bare.saves)
  })

  it('refuses a fourth attunement', () => {
    const attuned = [held(cloak, true, true), { ...held(gauntlets, true, true), id: 'left' }, { ...held(gauntlets, false, true), id: 'right' }]
    const { slots } = getAttunement(attuned, bare)
    expect(slots).toBe(3)
    expect(getAttunedInventory([...attuned, { ...held(cloak, false, false), id: 'fourth' }], 'fourth', true, slots)).toBeNull()
    expect(getAttunedInventory(attuned, cloak.name, false, slots)?.filter((item) => item.attunement?.attuned)).toHaveLength(2)
  })

  it('attunes a fourth in place of one of three, and never past the slots', () => {
    const attuned = [held(cloak, true, true), { ...held(gauntlets, true, true), id: 'left' }, { ...held(gauntlets, false, true), id: 'right' }]
    const fourth = { ...held(cloak, false, false), id: 'fourth' }
    const { slots } = getAttunement(attuned, bare)
    const replaced = getReplacedAttunement([...attuned, fourth], 'left', 'fourth', slots)
    expect(replaced?.filter((item) => item.attunement?.attuned).map((item) => item.id)).toEqual([cloak.name, 'right', 'fourth'])
    expect(getReplacedAttunement([...attuned, fourth], 'fourth', 'fourth', slots)).toBeNull()
  })
})
