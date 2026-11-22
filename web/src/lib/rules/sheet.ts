import type { Character, CharacterAction, CharacterCurrency, CharacterInventoryItem, CharacterProficiency, CharacterSkill, Damage, Proficiency, Range } from '../character.types'
import { getResolvedCharacter } from './derive'
import { getExpressionNames, getExpressionValue } from './expression'
import type { ItemGrants } from './item.types'
import type { ArmorCategorySpec, CharacterSheet, EncumbranceSpec, ProficiencyTier, ResolvedCharacter, RuleSystem } from './spec.types'

export type AppliedItem = CharacterInventoryItem & { grants: ItemGrants }

const ATTRIBUTE_IDS: Record<string, string> = {
  strength: 'str',
  dexterity: 'dex',
  constitution: 'con',
  intelligence: 'int',
  wisdom: 'wis',
  charisma: 'cha'
}

export function getAttributeId(title: string): string {
  const key = title.trim().toLowerCase()
  return ATTRIBUTE_IDS[key] ?? key.replace(/[^a-z0-9]/g, '')
}

export function getSkillId(name: string): string {
  const words = name.trim().toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)
  if (words.length === 0) return ''
  return words[0] + words.slice(1).map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join('')
}

export function getTierId(tiers: ProficiencyTier[], multiplier: Proficiency): string {
  const exact = tiers.find((tier) => tier.multiplier === multiplier)
  if (exact) return exact.id
  return tiers[0]?.id ?? 'none'
}

function getProficiencyMap(skills: CharacterSkill[], tiers: ProficiencyTier[]): Record<string, string> {
  const map: Record<string, string> = {}
  for (const skill of skills ?? []) {
    map[`skill.${getSkillId(skill.name)}`] = getTierId(tiers, skill.proficiency)
  }
  return map
}

/**
 * The stored character as the engine reads it. The stored totals leave out what worn items grant: the bonuses are
 * recovered from them first, and the items that apply are laid over last, so each grant counts once. Armor class is
 * never recovered: the system works it out from the armor worn.
 */
export function getSheet(character: Character, system: RuleSystem): CharacterSheet {
  const tiers = system.proficiencyTiers
  const info = character.info

  const attributes: Record<string, number> = {}
  for (const ability of character.abilities ?? []) {
    attributes[getAttributeId(ability.title)] = ability.score
  }

  const proficiencies = getProficiencyMap(character.skills ?? [], tiers)
  for (const save of character.savingThrows ?? []) {
    proficiencies[`save.${getAttributeId(save.title)}`] = getTierId(tiers, save.proficiency)
  }

  const pools: Record<string, number> = {}
  if (info?.hp) pools.hitPoints = Math.max(0, info.hp.max - info.hp.current)
  if (info?.hp?.hitDiceSpent) pools.hitDice = info.hp.hitDiceSpent
  if (info?.slots) pools.spellSlots = info.slots.expended
  if (info?.inspiration === false) pools.inspiration = 1
  if (character.special) {
    pools[getSkillId(character.special.name)] = Math.max(0, character.special.max - character.special.current)
  }

  const reaches: Record<string, number> = {}
  for (const sense of character.senses ?? []) {
    const ranged = system.senses.find((one) => one.unit && one.id === getSkillId(sense.title))
    const range = Number.parseInt(String(sense.score), 10)
    if (ranged && Number.isFinite(range)) reaches[`sense.${ranged.id}`] = range
  }

  const base: CharacterSheet = {
    systems: [system.id],
    level: info?.level ?? 1,
    attributes,
    proficiencies,
    pools,
    bonuses: {},
    reaches
  }

  const scope = getResolvedCharacter(system, base).scope
  const level = base.level
  const bonuses: Record<string, number> = {}

  if (info?.hp?.max !== undefined) bonuses.hitPoints = info.hp.max - (scope['mod.con'] ?? 0) * level
  if (info?.initiative !== undefined) bonuses.initiative = info.initiative - (scope['mod.dex'] ?? 0)

  const speed = Number.parseInt(String(info?.speed ?? ''), 10)
  if (Number.isFinite(speed)) bonuses.speed = speed - 30

  const worn = getWornSheet({ ...base, bonuses, armor: getWornArmor(character.inventory ?? [], system) }, getAppliedItems(character.inventory ?? [], system), system)
  if (!info?.spells?.modifier) return worn

  const spellcasting = getResolvedCharacter(system, worn).scope[`mod.${getAttributeId(info.spells.modifier)}`] ?? 0
  return { ...worn, bonuses: { ...worn.bonuses, spellcasting: spellcasting + (worn.bonuses.spellcasting ?? 0) } }
}

/** Whether an item's grants reach the character, by the system's rule for items. */
export function isItemApplied(item: CharacterInventoryItem, system: RuleSystem): boolean {
  if (!system.items) return false
  const flags = { equipped: item.equipped ? 1 : 0, attuned: item.attunement?.attuned ? 1 : 0, attunement: item.attunement?.required ? 1 : 0 }
  return getExpressionValue(system.items.applies, flags) !== 0
}

export function getAppliedItems(inventory: CharacterInventoryItem[], system: RuleSystem): AppliedItem[] {
  return inventory.filter((item): item is AppliedItem => Boolean(item.grants) && isItemApplied(item, system))
}

export type SaveNote = { kind: 'advantage'; title: string; note: string } | { kind: 'bonus'; title: string; value: number }

/** What the items that apply give the saves: each advantage on a save the system lists, then each bonus a save formula reads. */
export function getSaveNotes(items: AppliedItem[], system: RuleSystem): SaveNote[] {
  const grants = items.map((item) => item.grants)
  const advantages = grants.flatMap((entry) => entry.advantages).flatMap((one): SaveNote[] => {
    const save = system.saves.find((entry) => one.id === `save.${entry.id}`)
    return save ? [{ kind: 'advantage', title: save.title, note: one.note }] : []
  })

  const read = new Set(system.saves.flatMap((save) => getExpressionNames(save.modifier ?? '')))
  const bonuses = new Map<string, number>()
  for (const one of grants.flatMap((entry) => entry.bonuses)) {
    if (read.has(`bonus.${one.id}`)) bonuses.set(one.id, (bonuses.get(one.id) ?? 0) + one.value)
  }

  return [
    ...advantages,
    ...[...bonuses].map(([id, value]): SaveNote => ({ kind: 'bonus', title: system.bonuses?.find((one) => one.id === id)?.title ?? id, value }))
  ]
}

/** The system's armor category a carried item is, from its own field or else the first of its tags the system names. */
export function getArmorCategory(item: CharacterInventoryItem, system: RuleSystem): ArmorCategorySpec | undefined {
  const categories = system.items?.armorCategories ?? []
  const id = item.properties?.armor ?? item.attributes.find((tag) => categories.some((one) => one.id === tag))
  return categories.find((one) => one.id === id)
}

/**
 * The armor and shields worn, as the `armor.` names the system's armor class reads: `worn` when body armor is on,
 * its `base`, whether its `dex` counts and the `cap` on it, its `strength`, and the `bonus` of it and every shield.
 */
export function getWornArmor(inventory: CharacterInventoryItem[], system: RuleSystem): Record<string, number> {
  const worn = inventory.filter((item) => item.equipped && item.properties?.ac)
  const shields = worn.filter((item) => getArmorCategory(item, system)?.shield)
  const body = worn.find((item) => !shields.includes(item))
  const ac = body?.properties?.ac
  return {
    worn: body ? 1 : 0,
    base: ac?.base ?? 0,
    dex: ac?.dexModifier ? 1 : 0,
    cap: ac?.maxDexBonus ?? 0,
    strength: body?.properties?.strength ?? 0,
    bonus: (ac?.bonus ?? 0) + shields.reduce((all, item) => all + (item.properties?.ac?.base ?? 0) + (item.properties?.ac?.bonus ?? 0), 0)
  }
}

/** The item category one attack with a weapon uses up, by the system's weapon properties, or empty when it uses none. */
export function getAmmunitionType(weapon: CharacterInventoryItem, system: RuleSystem): string {
  return system.items?.weaponProperties?.find((one) => one.spends && weapon.attributes.includes(one.id))?.spends ?? ''
}

/** The equipped item a weapon's next attack uses up, or null when it uses none or none is left. */
export function getAmmunition(inventory: CharacterInventoryItem[], weapon: CharacterInventoryItem, system: RuleSystem): CharacterInventoryItem | null {
  const type = getAmmunitionType(weapon, system)
  return (type && inventory.find((item) => item.type === type && item.equipped && item.quantity > 0)) || null
}

/** How an attack reaches: in melee, by firing what its weapon uses up or as a ranged attack of no weapon, or by throwing a melee weapon. */
export function getAttackReach(range: Range | undefined, weapon: CharacterInventoryItem | undefined, system: RuleSystem): 'melee' | 'ranged' | 'thrown' {
  const far = (range?.normal ?? 5) > 5
  if (weapon ? getAmmunitionType(weapon, system) : far) return 'ranged'
  return far ? 'thrown' : 'melee'
}

/** An attack as the actions tab draws it, built from an equipped weapon or read from a stored action such as a spell. */
export type Attack = {
  name: string
  reach: 'melee' | 'ranged' | 'thrown'
  /** The feet a melee attack reaches. */
  melee: number
  range?: Range
  hit: number
  damage: Damage[]
  /** The damage dealt held in two hands, for a versatile weapon. */
  versatile?: Damage
  properties: string[]
  /** The item category each attack uses up, or empty. */
  spends: string
  itemId?: string
}

function getComparable(name: string): string {
  return name.toLowerCase().replace(/[^a-z]/g, '').replace(/s$/, '')
}

/** Whether a character's proficiencies name a weapon, by its category's title, its name or what it is. */
export function isWeaponProficient(proficients: CharacterProficiency[], weapon: CharacterInventoryItem, system: RuleSystem): boolean {
  const category = system.items?.weaponCategories?.find((one) => one.id === weapon.properties?.weapon)?.title
  const names = [category, weapon.title, weapon.subtype].filter((one): one is string => Boolean(one)).map(getComparable)
  return proficients.some((group) => group.value.some((one) => names.includes(getComparable(one))))
}

/** Every attack the equipped weapons make, each worked out by the system's attack formulas against the resolved character. */
export function getWeaponAttacks(inventory: CharacterInventoryItem[], proficients: CharacterProficiency[], resolved: ResolvedCharacter): Attack[] {
  const system = resolved.system
  const rule = system.items?.attack
  if (!rule) return []
  const properties = system.items?.weaponProperties ?? []
  return inventory
    .filter((item) => item.equipped && item.properties?.damage)
    .map((weapon) => {
      const reach = getAttackReach(weapon.properties?.range, weapon, system)
      const flags = Object.fromEntries(properties.filter((one) => /^[a-z]\w*$/i.test(one.id)).map((one) => [one.id, weapon.attributes.includes(one.id) ? 1 : 0]))
      const locals = {
        ...resolved.scope,
        ...flags,
        ranged: reach === 'ranged' ? 1 : 0,
        proficient: isWeaponProficient(proficients, weapon, system) ? 1 : 0,
        magic: weapon.properties?.magic ?? 0
      }
      const ability = getExpressionValue(rule.ability, locals)
      const bonus = getExpressionValue(rule.damage, { ...locals, ability })
      const dealt = (damage: Damage): Damage => ({ ...damage, bonus })
      return {
        name: weapon.title,
        reach,
        melee: getExpressionValue(rule.reach, locals),
        range: reach === 'melee' ? undefined : weapon.properties?.range,
        hit: getExpressionValue(rule.hit, { ...locals, ability }),
        damage: [dealt(weapon.properties!.damage!)],
        ...(weapon.properties?.versatile ? { versatile: dealt(weapon.properties.versatile) } : {}),
        properties: weapon.attributes.map((tag) => properties.find((one) => one.id === tag)?.title ?? tag),
        spends: getAmmunitionType(weapon, system),
        itemId: weapon.id
      }
    })
}

/** A stored attack action, such as a spell, as the actions tab draws it; one tied to a carried weapon is built from the weapon instead. */
export function getStoredAttack(action: CharacterAction, inventory: CharacterInventoryItem[], system: RuleSystem): Attack | null {
  const weapon = action.itemId ? inventory.find((item) => item.id === action.itemId) : undefined
  if (weapon?.properties?.damage) return null
  const reach = getAttackReach(action.range, weapon, system)
  return {
    name: action.name,
    reach,
    melee: reach === 'melee' ? action.range?.normal ?? 5 : 5,
    range: reach === 'melee' ? undefined : action.range,
    hit: action.toHit ?? 0,
    damage: action.damage ?? [],
    properties: action.properties ?? [],
    spends: weapon ? getAmmunitionType(weapon, system) : '',
    itemId: action.itemId
  }
}

/** Whether an item is used up when it is used: by its own flag, or else by its category. */
export function isConsumable(item: CharacterInventoryItem, system: RuleSystem): boolean {
  return item.consumable ?? Boolean(system.items?.categories?.find((one) => one.id === item.type)?.consumable)
}

/** How many of the charges an item's grants hold are left. */
export function getChargesLeft(item: CharacterInventoryItem): number {
  return Math.max(0, (item.grants?.charges.max ?? 0) - (item.spent ?? 0))
}

/** The inventory with charges of one item spent, or null when fewer than that are left. */
export function getSpentInventory(inventory: CharacterInventoryItem[], id: string, charges: number): CharacterInventoryItem[] | null {
  const item = inventory.find((one) => one.id === id)
  if (!item || getChargesLeft(item) < charges) return null
  return inventory.map((one) => (one.id === id ? { ...one, spent: (one.spent ?? 0) + charges } : one))
}

/** The recharges of the system a rest brings about. */
export function getRestRecharges(system: RuleSystem, rest: 'short' | 'long'): string[] {
  return (system.recharges ?? []).filter((one) => one.rests?.includes(rest)).map((one) => one.id)
}

/** The carried items with charges spent that regain them at one of the recharges. */
export function getRecharging(inventory: CharacterInventoryItem[], at: string[]): CharacterInventoryItem[] {
  return inventory.filter((item) => (item.spent ?? 0) > 0 && item.grants && at.includes(item.grants.charges.at))
}

/** The carried container an item sits in, or none when it sits in none or in one no longer carried. */
export function getContainer(inventory: CharacterInventoryItem[], item: CharacterInventoryItem): CharacterInventoryItem | undefined {
  return item.inside ? inventory.find((one) => one.id === item.inside && (one.properties?.capacity ?? 0) > 0) : undefined
}

/** Whether an item weighs nothing because it sits, however deep, in a container whose contents weigh nothing. */
export function isWeightless(inventory: CharacterInventoryItem[], item: CharacterInventoryItem): boolean {
  const seen: string[] = []
  for (let holder = getContainer(inventory, item); holder && !seen.includes(holder.id); holder = getContainer(inventory, holder)) {
    if (holder.properties?.weightless) return true
    seen.push(holder.id)
  }
  return false
}

/** The containers an item may be put in: every carried container but itself and those inside it. */
export function getContainers(inventory: CharacterInventoryItem[], item: CharacterInventoryItem): CharacterInventoryItem[] {
  const holds = (holder: CharacterInventoryItem, seen: string[]): boolean => {
    const container = getContainer(inventory, holder)
    return Boolean(container && !seen.includes(container.id) && (container.id === item.id || holds(container, [...seen, container.id])))
  }
  return inventory.filter((one) => one.id !== item.id && (one.properties?.capacity ?? 0) > 0 && !holds(one, []))
}

/** What the items in a container weigh, whether or not the container lets them weigh on its carrier. */
export function getContainerLoad(inventory: CharacterInventoryItem[], container: CharacterInventoryItem): number {
  return inventory.filter((one) => one.inside === container.id).reduce((all, one) => all + one.weight * one.quantity, 0)
}

/** What carried coins weigh, by the system. */
export function getCoinWeight(currency: CharacterCurrency, system: RuleSystem): number {
  const coins = (system.coins ?? []).reduce((all, coin) => all + (currency[coin.id as keyof CharacterCurrency] ?? 0), 0)
  return system.items?.coinWeight ? getExpressionValue(system.items.coinWeight, { coins }) : 0
}

/** What everything carried weighs, each item as many times as there are of it, its coins with it, less what a weightless container holds. */
export function getCarriedWeight(inventory: CharacterInventoryItem[], currency: CharacterCurrency, system: RuleSystem): number {
  const items = inventory.filter((item) => !isWeightless(inventory, item)).reduce((all, item) => all + item.weight * item.quantity, 0)
  return items + getCoinWeight(currency, system)
}

/** The heaviest load of the system a weight is past, or null when it is past none. */
export function getEncumbrance(weight: number, resolved: ResolvedCharacter): EncumbranceSpec | null {
  return (resolved.system.items?.encumbrance ?? []).filter((one) => weight > getExpressionValue(one.over, resolved.scope)).at(-1) ?? null
}

/** What a purse is worth in the coin the system writes its prices in. */
export function getCoinValue(currency: CharacterCurrency, system: RuleSystem): number {
  const value = (system.coins ?? []).reduce((all, coin) => all + (currency[coin.id as keyof CharacterCurrency] ?? 0) * coin.value, 0)
  return Number(value.toFixed(3))
}

/** What everything carried is worth, by the coin each is priced in, each item as many times as there are of it. */
export function getInventoryValue(inventory: CharacterInventoryItem[]): CharacterCurrency {
  return inventory.reduce<CharacterCurrency>(
    (all, item) => ({ ...all, [item.value.currency]: (all[item.value.currency] ?? 0) + item.value.amount * item.quantity }),
    {}
  )
}

/**
 * Lays the grants of the items that apply over a sheet, the way an overlay lays over a system: scores raised and set,
 * bonuses added, proficiencies at the higher tier, and the least each sense and speed reaches.
 */
export function getWornSheet(sheet: CharacterSheet, items: AppliedItem[], system: RuleSystem): CharacterSheet {
  const grants = items.map((item) => item.grants)
  const attributes = { ...sheet.attributes }
  const bonuses = { ...sheet.bonuses }
  const proficiencies = { ...sheet.proficiencies }
  const reaches = { ...sheet.reaches }

  const score = (id: string) => attributes[id] ?? system.attributes.find((one) => one.id === id)?.default ?? 0
  const scores = grants.flatMap((one) => one.attributes)
  for (const one of scores.filter((entry) => entry.mode === 'bonus')) {
    const held = score(one.id)
    attributes[one.id] = one.max === undefined ? held + one.value : Math.max(held, Math.min(held + one.value, one.max))
  }
  for (const one of scores.filter((entry) => entry.mode === 'set')) attributes[one.id] = Math.max(score(one.id), one.value)

  for (const one of grants.flatMap((entry) => entry.bonuses)) bonuses[one.id] = (bonuses[one.id] ?? 0) + one.value

  const tier = (id: string | undefined) => system.proficiencyTiers.find((one) => one.id === id)?.multiplier ?? -Infinity
  for (const one of grants.flatMap((entry) => entry.proficiencies)) {
    if (one.id && tier(one.tier) > tier(proficiencies[one.id])) proficiencies[one.id] = one.tier
  }

  const reach = (key: string, value: number) => (reaches[key] = Math.max(reaches[key] ?? value, value))
  for (const one of grants.flatMap((entry) => entry.senses)) reach(`sense.${one.id}`, one.value)
  for (const one of grants.flatMap((entry) => entry.speeds)) reach(`speed.${one.id}`, one.value)

  return { ...sheet, attributes, bonuses, proficiencies, reaches }
}

/** How many items the character is attuned to, and how many the system lets them be attuned to at once. */
export function getAttunement(inventory: CharacterInventoryItem[], resolved: ResolvedCharacter): { used: number; slots: number } {
  const rule = resolved.system.items?.attunement
  return {
    used: inventory.filter((item) => item.attunement?.attuned).length,
    slots: rule ? Math.max(0, Math.floor(getExpressionValue(rule, resolved.scope))) : 0
  }
}

/** The inventory with one item attuned or let go, or null when attuning it would pass the slots the system allows. */
export function getAttunedInventory(
  inventory: CharacterInventoryItem[],
  id: string,
  attuned: boolean,
  slots: number
): CharacterInventoryItem[] | null {
  const others = inventory.filter((item) => item.id !== id && item.attunement?.attuned).length
  if (attuned && others >= slots) return null
  return inventory.map((item) => (item.id === id && item.attunement ? { ...item, attunement: { ...item.attunement, attuned } } : item))
}

/** The inventory with one attunement ended and another begun in its place, or null when that would still pass the slots. */
export function getReplacedAttunement(
  inventory: CharacterInventoryItem[],
  ending: string,
  beginning: string,
  slots: number
): CharacterInventoryItem[] | null {
  const freed = getAttunedInventory(inventory, ending, false, slots)
  return freed && getAttunedInventory(freed, beginning, true, slots)
}
