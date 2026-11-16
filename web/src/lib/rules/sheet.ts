import type { Character, CharacterInventoryItem, CharacterSkill, Proficiency } from '../character.types'
import { getResolvedCharacter } from './derive'
import { getExpressionValue } from './expression'
import type { ItemGrants } from './item.types'
import type { CharacterSheet, ProficiencyTier, ResolvedCharacter, RuleSystem } from './spec.types'

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
 * recovered from them first, and the items that apply are laid over last, so each grant counts once.
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

  const base: CharacterSheet = {
    systems: [system.id],
    level: info?.level ?? 1,
    attributes,
    proficiencies,
    pools,
    bonuses: {}
  }

  const scope = getResolvedCharacter(system, base).scope
  const level = base.level
  const bonuses: Record<string, number> = {}

  if (info?.ac !== undefined) bonuses.armorClass = info.ac - 10 - (scope['mod.dex'] ?? 0)
  if (info?.hp?.max !== undefined) bonuses.hitPoints = info.hp.max - (scope['mod.con'] ?? 0) * level
  if (info?.initiative !== undefined) bonuses.initiative = info.initiative - (scope['mod.dex'] ?? 0)

  const speed = Number.parseInt(String(info?.speed ?? ''), 10)
  if (Number.isFinite(speed)) bonuses.speed = speed - 30

  const worn = getWornSheet({ ...base, bonuses }, getAppliedItems(character.inventory ?? [], system), system)
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
