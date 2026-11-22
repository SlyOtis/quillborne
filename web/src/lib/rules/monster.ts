import type { EncounterCombatant, Monster, MonsterFields } from '../api/types'
import { getExpressionValue, type Scope } from './expression'
import type {
  MonsterAction,
  MonsterBlock,
  MonsterDamage,
  MonsterDifficulty,
  MonsterEntry,
  MonsterFeature,
  MonsterFigure,
  MonsterFilter,
  MonsterRoll,
  MonsterSource,
  MonsterStats,
  MonsterSystem
} from './monster.types'

const MONSTER_PATH = '/sources/systems/monsters'

const SOURCE_PATH = '/sources/monsters'

export const HOMEBREW = 'homebrew'

export const MINE = 'mine'

export const LEGENDARY = 'legendary'

const cache = new Map<string, MonsterSystem>()

const shipped = new Map<string, MonsterSource>()

export async function getMonsterSystem(id: string): Promise<MonsterSystem> {
  const cached = cache.get(id)
  if (cached) return cached
  const response = await fetch(`${MONSTER_PATH}/${id}.json`)
  if (!response.ok) throw new Error(`Monster system "${id}" did not load: ${response.status} ${response.statusText}`)
  const system = (await response.json()) as MonsterSystem
  cache.set(id, system)
  return system
}

export async function getMonsterSystems(): Promise<MonsterSystem[]> {
  const response = await fetch(`${MONSTER_PATH}/index.json`)
  if (!response.ok) throw new Error(`The monster system index did not load: ${response.status} ${response.statusText}`)
  const listed = (await response.json()) as { systems: string[] }
  return Promise.all(listed.systems.map((id) => getMonsterSystem(id)))
}

export async function getMonsterSource(id: string): Promise<MonsterSource> {
  const cached = shipped.get(id)
  if (cached) return cached
  const response = await fetch(`${SOURCE_PATH}/${id}.json`)
  if (!response.ok) throw new Error(`Monster source "${id}" did not load: ${response.status} ${response.statusText}`)
  const source = (await response.json()) as MonsterSource
  shipped.set(id, source)
  return source
}

export async function getMonsterSources(): Promise<MonsterSource[]> {
  const response = await fetch(`${SOURCE_PATH}/index.json`)
  if (!response.ok) throw new Error(`The monster source index did not load: ${response.status} ${response.statusText}`)
  const listed = (await response.json()) as { sources: string[] }
  return Promise.all(listed.sources.map((id) => getMonsterSource(id)))
}

function getHeld(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
}

function getFigure(value: unknown, absent: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : absent
}

function getFigures(value: unknown): Record<string, number> {
  return Object.fromEntries(
    Object.entries(getHeld(value)).filter((entry): entry is [string, number] => typeof entry[1] === 'number' && Number.isFinite(entry[1]))
  )
}

function getWords(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((one): one is string => typeof one === 'string' && one.trim() !== '') : []
}

function getWord(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function getCount(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : undefined
}

function getDamage(value: unknown): MonsterDamage[] {
  if (!Array.isArray(value)) return []
  return value.map((one) => {
    const held = getHeld(one)
    return {
      dice: getFigure(held.dice, 0),
      die: getFigure(held.die, 0),
      bonus: getFigure(held.bonus, 0),
      type: getWord(held.type),
      ability: held.ability === true
    }
  })
}

function getFeatures(value: unknown): MonsterFeature[] {
  if (!Array.isArray(value)) return []
  return value.map((one) => {
    const held = getHeld(one)
    const attack = held.attack && typeof held.attack === 'object' ? getHeld(held.attack) : null
    const save = held.save && typeof held.save === 'object' ? getHeld(held.save) : null
    const recharge = getCount(held.recharge)
    const uses = getCount(held.uses)
    const cost = getCount(held.cost)
    return {
      name: getWord(held.name),
      text: getWord(held.text),
      ...(attack && {
        attack: {
          ability: getWord(attack.ability),
          bonus: getFigure(attack.bonus, 0),
          reach: getFigure(attack.reach, 0),
          range: getFigure(attack.range, 0),
          long_range: getFigure(attack.long_range, 0),
          damage: getDamage(attack.damage)
        }
      }),
      ...(save && {
        save: {
          ability: getWord(save.ability),
          dc_ability: getWord(save.dc_ability),
          bonus: getFigure(save.bonus, 0),
          area: getWord(save.area),
          damage: getDamage(save.damage),
          half: save.half === true
        }
      }),
      ...(recharge && { recharge }),
      ...(uses && { uses }),
      ...(cost && { cost })
    }
  })
}

export function getMonsterStats(system: MonsterSystem, raw: unknown): MonsterStats {
  const held = getHeld(raw)
  const abilities = getHeld(held.abilities)
  const features = getHeld(held.features)
  return {
    subtypes: getWords(held.subtypes),
    ac: getFigure(held.ac, system.defaults.ac),
    ac_note: typeof held.ac_note === 'string' ? held.ac_note : '',
    hit_dice: getFigure(held.hit_dice, system.defaults.hitDice),
    speeds: held.speeds === undefined ? { ...system.defaults.speeds } : getFigures(held.speeds),
    abilities: Object.fromEntries(system.abilities.map((one) => [one.id, getFigure(abilities[one.id], system.defaults.score)])),
    saves: getWords(held.saves),
    skills: getFigures(held.skills),
    initiative: getFigure(held.initiative, 0),
    senses: getFigures(held.senses),
    languages: getWords(held.languages),
    resistances: getWords(held.resistances),
    immunities: getWords(held.immunities),
    vulnerabilities: getWords(held.vulnerabilities),
    condition_immunities: getWords(held.condition_immunities),
    habitats: getWords(held.habitats),
    flags: getWords(held.flags),
    features: Object.fromEntries(system.features.map((kind) => [kind.id, getFeatures(features[kind.id])])),
    ...(getCount(held.legendary_uses) && { legendary_uses: getCount(held.legendary_uses) }),
    ...(getCount(held.legendary_lair_uses) && { legendary_lair_uses: getCount(held.legendary_lair_uses) })
  }
}

export function getMonsterFields(
  system: string,
  monster: Pick<Monster, 'name' | 'size' | 'type' | 'alignment' | 'challenge' | 'stats' | 'description'> & { image?: string }
): MonsterFields {
  return {
    name: monster.name,
    system,
    size: monster.size,
    type: monster.type,
    alignment: monster.alignment,
    challenge: monster.challenge,
    stats: monster.stats,
    description: monster.description,
    image: monster.image ?? ''
  }
}

export function getNewMonster(system: MonsterSystem): Pick<Monster, 'name' | 'system' | 'size' | 'type' | 'alignment' | 'challenge' | 'stats'> {
  return {
    name: 'Unnamed monster',
    system: system.id,
    size: system.defaults.size,
    type: system.defaults.type,
    alignment: system.defaults.alignment,
    challenge: system.defaults.challenge,
    stats: getMonsterStats(system, {})
  }
}

export function getEntryName(entries: MonsterEntry[], id: string): string {
  return entries.find((one) => one.id === id)?.name ?? id
}

export function getChallenge(system: MonsterSystem, value: number) {
  return [...system.challenges].reverse().find((one) => one.value <= value) ?? system.challenges[0] ?? null
}

function getPresent(entries: MonsterEntry[], held: Record<string, number>): MonsterFigure[] {
  return entries.filter((one) => (held[one.id] ?? 0) > 0).map((one) => ({ ...one, value: held[one.id] }))
}

export function getMonsterBlock(system: MonsterSystem, monster: Pick<Monster, 'size' | 'type' | 'alignment' | 'challenge' | 'stats'>): MonsterBlock {
  const stats = getMonsterStats(system, monster.stats)
  const formulas = system.formulas
  const challenge = getChallenge(system, monster.challenge)
  const prof = challenge?.proficiency ?? 0
  const scope: Scope = { prof }

  const abilities = system.abilities.map((ability) => {
    const score = stats.abilities[ability.id]
    const mod = getExpressionValue(formulas.modifier, { score })
    const proficient = stats.saves.includes(ability.id)
    scope[`attr.${ability.id}`] = score
    scope[`mod.${ability.id}`] = mod
    return { ...ability, score, mod, proficient, save: getExpressionValue(formulas.save, { mod, prof, tier: proficient ? 1 : 0 }) }
  })

  const skills = system.skills.map((skill) => {
    const tier = stats.skills[skill.id] ?? 0
    const value = getExpressionValue(formulas.skill, { mod: scope[`mod.${skill.ability}`] ?? 0, prof, tier })
    scope[`skill.${skill.id}`] = value
    return { id: skill.id, name: skill.name, value, tier }
  })

  const initiative = getExpressionValue(formulas.initiative, { ...scope, tier: stats.initiative })
  const hitDie = system.sizes.find((one) => one.id === monster.size)?.hitDie ?? 0
  const dice = { ...scope, dice: stats.hit_dice, die: hitDie }
  const names = (entries: MonsterEntry[], ids: string[]) => ids.map((id) => getEntryName(entries, id))

  return {
    size: getEntryName(system.sizes, monster.size),
    type: getEntryName(system.types, monster.type),
    alignment: getEntryName(system.alignments, monster.alignment),
    challenge,
    prof,
    abilities,
    skills: skills.filter((one) => one.tier > 0),
    passivePerception: getExpressionValue(formulas.passivePerception, scope),
    initiative,
    initiativeScore: getExpressionValue(formulas.initiativeScore, { ...scope, initiative }),
    hitPoints: getExpressionValue(formulas.hitPoints, dice),
    hitBonus: getExpressionValue(formulas.hitBonus, dice),
    hitDie,
    speeds: getPresent(system.movements, stats.speeds),
    senses: getPresent(system.senses, stats.senses),
    languages: names(system.languages, stats.languages),
    resistances: names(system.damageTypes, stats.resistances),
    immunities: names(system.damageTypes, stats.immunities),
    vulnerabilities: names(system.damageTypes, stats.vulnerabilities),
    conditionImmunities: names(system.conditions, stats.condition_immunities),
    habitats: names(system.habitats, stats.habitats),
    flags: names(system.flags, stats.flags)
  }
}

export function getMonsterAction(system: MonsterSystem, block: Pick<MonsterBlock, 'abilities' | 'prof'>, feature: MonsterFeature): MonsterAction {
  const formulas = system.formulas
  const mod = (id: string) => block.abilities.find((one) => one.id === id)?.mod ?? 0
  const rolls = (damage: MonsterDamage[], ability: string): MonsterRoll[] =>
    damage.map((one) => {
      const flat = getExpressionValue(formulas.damage, { mod: mod(ability), ability: one.ability ? 1 : 0, bonus: one.bonus })
      return {
        dice: one.dice,
        die: one.die,
        flat,
        average: getExpressionValue(formulas.average, { dice: one.dice, die: one.die, flat }),
        type: getEntryName(system.damageTypes, one.type)
      }
    })
  const { attack, save } = feature
  return {
    attack: attack ? getExpressionValue(formulas.attack, { mod: mod(attack.ability), prof: block.prof, bonus: attack.bonus }) : null,
    dc: save ? getExpressionValue(formulas.dc, { mod: mod(save.dc_ability), prof: block.prof, bonus: save.bonus }) : null,
    hit: attack ? rolls(attack.damage, attack.ability) : [],
    failure: save ? rolls(save.damage, save.dc_ability) : []
  }
}

export function getRolledHitPoints(system: MonsterSystem, block: Pick<MonsterBlock, 'hitBonus'>, roll: number): number {
  return getExpressionValue(system.formulas.rolledHitPoints, { roll, hitBonus: block.hitBonus })
}

export function getDifficulty(system: MonsterSystem, levels: number[], xp: number): MonsterDifficulty {
  const known = system.budgets.map((one) => one.level)
  const low = Math.min(...known)
  const high = Math.max(...known)
  const party = levels.flatMap((level) => {
    const held = Number.isFinite(level) ? Math.min(Math.max(Math.floor(level), low), high) : low
    return system.budgets.filter((one) => one.level === held)
  })
  const budgets = system.difficulties
    .filter((one) => party.length > 0 && party.every((row) => typeof row[one.id] === 'number'))
    .map((one) => ({ ...one, value: party.reduce((sum, row) => sum + row[one.id], 0) }))
  const beyond = system.difficulties.find((one) => !budgets.some((band) => band.id === one.id)) ?? null
  const difficulty = party.length === 0 || xp <= 0 ? null : (budgets.find((one) => xp <= one.value) ?? beyond)
  return { xp, budgets, difficulty: difficulty && { id: difficulty.id, name: difficulty.name } }
}

export function getFeatureKey(section: string, feature: Pick<MonsterFeature, 'name'>): string {
  return `${section}.${feature.name}`
}

export function getRechargeKeys(stats: MonsterStats, spent: Record<string, number>): string[] {
  return Object.entries(stats.features).flatMap(([section, features]) =>
    features.filter((one) => one.recharge && (spent[getFeatureKey(section, one)] ?? 0) > 0).map((one) => getFeatureKey(section, one))
  )
}

export function getTurnSpent(system: MonsterSystem, stats: MonsterStats, spent: Record<string, number>, rolled: Record<string, number>): Record<string, number> {
  const recharges = new Map(
    Object.entries(stats.features).flatMap(([section, features]) =>
      features.filter((one) => one.recharge).map((one) => [getFeatureKey(section, one), one.recharge ?? 0] as const)
    )
  )
  return Object.fromEntries(
    Object.entries(spent).filter(([key]) => {
      if (key === LEGENDARY) return false
      const recharge = recharges.get(key)
      const roll = rolled[key]
      return recharge === undefined || roll === undefined || !getExpressionValue(system.formulas.recharged, { roll, recharge })
    })
  )
}

export function getCombatantNames(name: string, count: number, taken: string[]): string[] {
  const numbered = new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} (\\d+)$`)
  const highest = taken.reduce((top, one) => Math.max(top, one === name ? 1 : Number(numbered.exec(one)?.[1] ?? 0)), 0)
  if (count === 1 && highest === 0) return [name]
  return Array.from({ length: count }, (_, at) => `${name} ${highest + at + 1}`)
}

function getFold(name: string): string {
  return name.trim().toLowerCase()
}

export function getBestiaryMissing(names: string[], held: Pick<Monster, 'name'>[]): string[] {
  const kept = new Set(held.map((one) => getFold(one.name)))
  return [...new Map(names.filter((one) => !kept.has(getFold(one))).map((one) => [getFold(one), one])).values()]
}

export function getBestiaryCombatants(
  combatants: EncounterCombatant[],
  names: Record<string, string>,
  held: Pick<Monster, 'id' | 'name'>[]
): EncounterCombatant[] {
  return combatants.map((one) => {
    const named = names[one.id]
    const copy = one.kind === 'monster' && named ? held.find((row) => getFold(row.name) === getFold(named)) : undefined
    if (!copy) return one
    const { monster_slug: _slug, ...rest } = one
    return { ...rest, monster_id: copy.id }
  })
}

export function getMonsterOrigins(monster: Pick<Monster, 'user_id' | 'owner_id'>, reader: string, campaigns: string[]): string[] {
  return [campaigns.includes(monster.owner_id) ? monster.owner_id : HOMEBREW, ...(monster.user_id === reader ? [MINE] : [])]
}

export function getSigned(value: number): string {
  return value >= 0 ? `+${value}` : `${value}`
}

export function getHitDice(dice: number, block: Pick<MonsterBlock, 'hitDie' | 'hitBonus'>): string {
  const roll = `${dice}d${block.hitDie}`
  return block.hitBonus ? `${roll} ${block.hitBonus < 0 ? '-' : '+'} ${Math.abs(block.hitBonus)}` : roll
}

export function getEmptyFilter(): MonsterFilter {
  return {
    name: '',
    type: '',
    challengeMin: null,
    challengeMax: null,
    size: '',
    habitat: '',
    alignment: '',
    acMin: null,
    acMax: null,
    hpMin: null,
    hpMax: null,
    sense: '',
    save: '',
    skill: '',
    flags: {},
    resistance: '',
    immunity: '',
    conditionImmunity: '',
    vulnerability: '',
    language: '',
    movement: '',
    tag: '',
    subtype: '',
    source: ''
  }
}

function isWithin(value: number, low: number | null, high: number | null): boolean {
  const bound = (one: number | null) => typeof one === 'number' && Number.isFinite(one)
  return (!bound(low) || value >= (low as number)) && (!bound(high) || value <= (high as number))
}

export function isMonsterShown(
  monster: Pick<Monster, 'name' | 'type' | 'size' | 'alignment' | 'challenge'>,
  stats: MonsterStats,
  block: Pick<MonsterBlock, 'hitPoints'>,
  tags: string[],
  origins: string[],
  filter: MonsterFilter
): boolean {
  const asked = filter.name.trim().toLowerCase()
  const has = (held: string[], wanted: string) => !wanted || held.includes(wanted)
  const reaches = (held: Record<string, number>, wanted: string) => !wanted || (held[wanted] ?? 0) > 0
  return (
    (!asked || monster.name.toLowerCase().includes(asked)) &&
    (!filter.type || monster.type === filter.type) &&
    (!filter.size || monster.size === filter.size) &&
    (!filter.alignment || monster.alignment === filter.alignment) &&
    isWithin(monster.challenge, filter.challengeMin, filter.challengeMax) &&
    isWithin(stats.ac, filter.acMin, filter.acMax) &&
    isWithin(block.hitPoints, filter.hpMin, filter.hpMax) &&
    has(stats.habitats, filter.habitat) &&
    reaches(stats.senses, filter.sense) &&
    has(stats.saves, filter.save) &&
    reaches(stats.skills, filter.skill) &&
    Object.entries(filter.flags).every(([flag, choice]) => !choice || stats.flags.includes(flag) === (choice === 'yes')) &&
    has(stats.resistances, filter.resistance) &&
    has(stats.immunities, filter.immunity) &&
    has(stats.condition_immunities, filter.conditionImmunity) &&
    has(stats.vulnerabilities, filter.vulnerability) &&
    has(stats.languages, filter.language) &&
    reaches(stats.speeds, filter.movement) &&
    has(tags, filter.tag) &&
    has(origins, filter.source) &&
    (!filter.subtype || stats.subtypes.some((one) => one.toLowerCase() === filter.subtype.toLowerCase()))
  )
}
