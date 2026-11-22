import { describe, expect, it } from 'vitest'
import belt from '../../../public/sources/items/belt-of-dwarvenkind.json'
import cloak from '../../../public/sources/items/cloak-of-protection.json'
import gauntlets from '../../../public/sources/items/gauntlets-of-ogre-power.json'
import dnd5e from '../../../public/sources/systems/dnd5e.json'
import type { CharacterInventoryItem } from '../character.types'
import lars from '../character.fixture'
import { getItemGrants } from '../resources'
import { getResolvedCharacter } from './derive'
import { getAmmunition, getAmmunitionType, getAppliedItems, getAttackReach, getAttributeId, getAttunedInventory, getAttunement, getCarriedWeight, getInventoryValue, getReplacedAttunement, getSaveNotes, getSheet, getSkillId, getTierId } from './sheet'
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

  it('reproduces the stored darkvision of 60 ft through the engine', () => {
    expect(resolved.senses.find((entry) => entry.id === 'darkvision')?.value).toBe(60)
  })

  it('reaches nothing from a stored sense whose range is not a number', () => {
    const keen = getResolvedCharacter(core, getSheet({ ...lars, senses: [{ title: 'Darkvision', score: 'keen' }] }, core))
    expect(keen.senses.find((entry) => entry.id === 'darkvision')?.value).toBe(0)
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
  const held = (document: typeof cloak | typeof gauntlets | typeof belt, equipped: boolean, attuned: boolean): CharacterInventoryItem => ({
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

  it('notes the advantage on Constitution saves against poison under a Belt of Dwarvenkind, and the Cloak of Protection as one +1 for every save', () => {
    const notes = getSaveNotes(getAppliedItems([held(belt, true, true), held(cloak, true, true)], core), core)
    expect(notes).toEqual([
      { kind: 'advantage', title: 'Constitution', note: 'against poison' },
      { kind: 'bonus', title: 'Saving Throws', value: 1 }
    ])
  })

  it('notes no save for an advantage that names none', () => {
    const vague = { ...held(belt, true, true), grants: { ...getItemGrants(belt.grants), advantages: [{ id: '', name: 'Saves against spells', note: '' }] } }
    expect(getSaveNotes(getAppliedItems([vague], core), core)).toEqual([])
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

describe('what a character carries', () => {
  const carried = (id: string, type: CharacterInventoryItem['type'], weight: number, quantity: number, amount: number, extra: Partial<CharacterInventoryItem> = {}): CharacterInventoryItem => ({
    id,
    title: id,
    type,
    rarity: 'common',
    attributes: [],
    description: '',
    value: { amount, currency: 'gp' },
    weight,
    quantity,
    equippable: true,
    equipped: false,
    ...extra
  })

  it('weighs two handaxes at 2 lb each and twenty arrows at 0.05 lb each as 5 lb', () => {
    expect(getCarriedWeight([carried('handaxe', 'weapon', 2, 2, 5), carried('arrows', 'ammunition', 0.05, 20, 0.05)])).toBeCloseTo(5)
  })

  it('prices every item, the first of each coin included, as many times as there are of it', () => {
    const potion = carried('potion', 'consumable', 0.5, 2, 50)
    const rope = { ...carried('rope', 'misc', 10, 1, 2), value: { amount: 2, currency: 'sp' as const } }
    expect(getInventoryValue([potion, rope])).toEqual({ gp: 100, sp: 2 })
  })

  it('spends arrows only for a weapon with the ammunition property, and never for a thrown or a melee weapon', () => {
    const arrows = carried('arrows', 'ammunition', 0.05, 20, 0.05, { equipped: true })
    const shortbow = carried('shortbow', 'weapon', 2, 1, 25, { attributes: ['ammunition', 'two-handed'] })
    const handaxe = carried('handaxe', 'weapon', 2, 1, 5, { attributes: ['light', 'thrown'] })
    const warhammer = carried('warhammer', 'weapon', 2, 1, 15, { attributes: ['versatile'] })
    const inventory = [arrows, shortbow, handaxe, warhammer]
    expect(getAmmunition(inventory, shortbow, core)?.id).toBe('arrows')
    expect(getAmmunitionType(handaxe, core)).toBe('')
    expect(getAmmunitionType(warhammer, core)).toBe('')
  })

  it('reads a melee weapon stored with a 5 ft range as melee, a handaxe as thrown, a shortbow and a spell as ranged', () => {
    const handaxe = carried('handaxe', 'weapon', 2, 1, 5, { attributes: ['light', 'thrown'] })
    const shortbow = carried('shortbow', 'weapon', 2, 1, 25, { attributes: ['ammunition'] })
    const warhammer = carried('warhammer', 'weapon', 2, 1, 15, { attributes: ['versatile'] })
    expect(getAttackReach({ normal: 5, max: 5 }, warhammer, core)).toBe('melee')
    expect(getAttackReach({ normal: 20, max: 60 }, handaxe, core)).toBe('thrown')
    expect(getAttackReach({ normal: 80, max: 320 }, shortbow, core)).toBe('ranged')
    expect(getAttackReach({ normal: 120, max: 120 }, undefined, core)).toBe('ranged')
  })

  it('holds what Strength 12 carries at 180 lb from the rules, whatever the sheet stored', () => {
    const resolved = getResolvedCharacter(core, getSheet({ ...lars, info: { ...lars.info, carry_capacity: 0 } }, core))
    expect(resolved.scope['derived.carryCapacity']).toBe(180)
  })

  it('finds no ammunition by its name: arrows carried as a consumable are not spent', () => {
    const shortbow = carried('shortbow', 'weapon', 2, 1, 25, { attributes: ['ammunition'] })
    expect(getAmmunition([carried('Arrows', 'consumable', 0.05, 20, 0.05, { equipped: true }), shortbow], shortbow, core)).toBeNull()
  })
})
