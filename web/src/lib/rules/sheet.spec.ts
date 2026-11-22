import { describe, expect, it } from 'vitest'
import belt from '../../../public/sources/items/belt-of-dwarvenkind.json'
import cloak from '../../../public/sources/items/cloak-of-protection.json'
import gauntlets from '../../../public/sources/items/gauntlets-of-ogre-power.json'
import dnd5e from '../../../public/sources/systems/dnd5e.json'
import type { Character, CharacterInventoryItem } from '../character.types'
import lars from '../character.fixture'
import { getItemGrants } from '../resources'
import { getResolvedCharacter } from './derive'
import { getAmmunition, getAmmunitionType, getAppliedItems, getAttackReach, getAttributeId, getAttunedInventory, getAttunement, getCarriedWeight, getInventoryValue, getReplacedAttunement, getSaveNotes, getSheet, getSkillId, getTierId, getWeaponAttacks } from './sheet'
import type { RuleSystem } from './spec.types'
import { getMergedSystem } from './system'

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
    expect(armorClass(warded)).toBe(15)
    expect(warded.saves.map((save) => save.value)).toEqual(bare.saves.map((save) => save.value + 1))
  })

  it('changes nothing with a Cloak of Protection carried', () => {
    const carried = resolve(held(cloak, false, true))
    expect(armorClass(carried)).toBe(14)
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

describe('what a character wears and wields', () => {
  const brann = (score: Record<string, number>) => Object.entries(score).map(([title, value]) => ({ id: title, title, score: value, modifier: Math.floor((value - 10) / 2) }))
  const worn = (id: string, ac: CharacterInventoryItem['properties'], equipped = true, tags: string[] = []): CharacterInventoryItem => ({
    id,
    title: id,
    type: 'armor',
    rarity: 'common',
    attributes: tags,
    description: '',
    value: { amount: 0, currency: 'gp' },
    weight: 0,
    quantity: 1,
    equippable: true,
    equipped,
    properties: ac
  })
  const chainMail = worn('Chain Mail', { armor: 'heavy', strength: 13, ac: { base: 16, bonus: 0, dexModifier: false, maxDexBonus: 0 } })
  const shield = worn('Shield', { ac: { base: 0, bonus: 2, dexModifier: false, maxDexBonus: 0 } }, true, ['shield'])
  const leather = worn('Leather Armor', { armor: 'light', ac: { base: 11, bonus: 0, dexModifier: true, maxDexBonus: 0 } })
  const scale = worn('Scale Mail', { armor: 'medium', ac: { base: 14, bonus: 0, dexModifier: true, maxDexBonus: 2 } })
  const fighter = (dex: number, inventory: CharacterInventoryItem[], overlay: Character['overlay'] = null): Character => ({
    ...lars,
    info: { ...lars.info, level: 3, ac: 0, speed: '30 ft' },
    abilities: brann({ Strength: 16, Dexterity: dex, Constitution: 16 }),
    inventory,
    overlay
  })
  const armorClass = (character: Character, system = core) => getResolvedCharacter(system, getSheet(character, system)).scope['derived.armorClass']

  it('gives Brann in Chain Mail with a Shield armor class 18, his Dexterity left out', () => {
    expect(armorClass(fighter(12, [chainMail, shield]))).toBe(18)
  })

  it('gives Wren in Leather Armor 11 and her full Dexterity of 17, armor class 14', () => {
    expect(armorClass(fighter(17, [leather]))).toBe(14)
  })

  it('gives Maela in Scale Mail 14 and her Dexterity only up to 2, armor class 16, and 15 with Dexterity 12', () => {
    expect(armorClass(fighter(17, [scale]))).toBe(16)
    expect(armorClass(fighter(12, [scale]))).toBe(15)
  })

  it('gives armor carried but not worn nothing: Wren unarmored is 10 and her Dexterity, 13', () => {
    expect(armorClass(fighter(17, [{ ...leather, equipped: false }]))).toBe(13)
  })

  it('adds the bonus of a +1 Chain Mail, armor class 17', () => {
    expect(armorClass(fighter(12, [{ ...chainMail, properties: { ...chainMail.properties, ac: { ...chainMail.properties!.ac!, bonus: 1 } } }]))).toBe(17)
  })

  it('takes a class overlay of 13 and Dexterity for unarmored, 15 at Dexterity 15, and lets worn armor replace it again', () => {
    const resilience = { id: 'resilience', title: 'Draconic Resilience', version: '1.0.0', derived: [{ id: 'unarmored', title: 'Unarmored Defence', value: '13 + mod.dex', hidden: true }] }
    const system = getMergedSystem(core, resilience)
    expect(armorClass(fighter(15, [], resilience), system)).toBe(15)
    expect(armorClass(fighter(15, [chainMail], resilience), system)).toBe(16)
  })

  it('gives Lars in Leather Armor with Dexterity 18 the armor class 15 he has stored, from what he wears', () => {
    expect(getResolvedCharacter(core, getSheet(lars, core)).scope['derived.armorClass']).toBe(15)
  })

  it('slows a wearer of Chain Mail by 10 feet below Strength 13, and not at 13', () => {
    const speed = (strength: number) => getResolvedCharacter(core, getSheet({ ...fighter(12, [chainMail]), abilities: brann({ Strength: strength }) }, core)).scope['derived.speed']
    expect(speed(12)).toBe(20)
    expect(speed(13)).toBe(30)
  })

  const weapon = (id: string, properties: CharacterInventoryItem['properties'], tags: string[] = []): CharacterInventoryItem => ({
    ...worn(id, properties, true, tags),
    type: 'weapon'
  })
  const longsword = weapon('Longsword', { weapon: 'martial', damage: { amount: 1, dice: 8, type: 'slashing', bonus: 0 }, versatile: { amount: 1, dice: 10, type: 'slashing', bonus: 0 } }, ['versatile'])
  const rapier = weapon('Rapier', { weapon: 'martial', damage: { amount: 1, dice: 8, type: 'piercing', bonus: 0 } }, ['finesse'])
  const longbow = weapon('Longbow', { weapon: 'martial', damage: { amount: 1, dice: 8, type: 'piercing', bonus: 0 }, range: { normal: 150, max: 600 } }, ['ammunition', 'heavy', 'two-handed'])
  const proficient = (...value: string[]) => [{ id: 'weapons', title: 'Weapons', value }]
  const attack = (character: Character, wielded: CharacterInventoryItem, proficients = proficient('Simple Weapons', 'Martial Weapons')) =>
    getWeaponAttacks([wielded], proficients, getResolvedCharacter(core, getSheet(character, core)))[0]

  it('hits with Brann\'s Longsword at Strength 16 and level 3 for +5 and 1d8 + 3, and 1d10 + 3 in two hands', () => {
    const swing = attack(fighter(12, []), longsword)
    expect(swing.hit).toBe(5)
    expect([swing.damage[0].dice, swing.damage[0].bonus]).toEqual([8, 3])
    expect([swing.versatile?.dice, swing.versatile?.bonus]).toEqual([10, 3])
    expect(swing.reach).toBe('melee')
    expect(swing.spends).toBe('')
  })

  it('hits with Wren\'s Rapier by her higher Dexterity of 17, +5 and 1d8 + 3, though her Strength is 8', () => {
    const wren = { ...fighter(17, []), abilities: brann({ Strength: 8, Dexterity: 17 }) }
    const thrust = attack(wren, rapier, proficient('Rapiers'))
    expect([thrust.hit, thrust.damage[0].bonus]).toEqual([5, 3])
  })

  it('adds no proficiency for a weapon the character is not proficient with: Wren\'s Longbow is +3', () => {
    const wren = { ...fighter(17, []), abilities: brann({ Strength: 8, Dexterity: 17 }) }
    const shot = attack(wren, longbow, proficient('Simple Weapons', 'Rapiers'))
    expect([shot.hit, shot.damage[0].bonus, shot.reach, shot.spends]).toEqual([3, 3, 'ranged', 'ammunition'])
  })

  it('adds a +1 weapon\'s bonus to hit and damage: +6 and 1d8 + 4', () => {
    const swing = attack(fighter(12, []), { ...longsword, properties: { ...longsword.properties, magic: 1 } })
    expect([swing.hit, swing.damage[0].bonus]).toEqual([6, 4])
  })
})
