import type { Monster } from '../api/types'
import { getExpressionValue, type Scope } from './expression'
import type {
  MonsterBlock,
  MonsterEntry,
  MonsterFeature,
  MonsterFigure,
  MonsterFilter,
  MonsterStats,
  MonsterSystem
} from './monster.types'

const MONSTER_PATH = '/sources/systems/monsters'

const cache = new Map<string, MonsterSystem>()

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

function getFeatures(value: unknown): MonsterFeature[] {
  if (!Array.isArray(value)) return []
  return value.map((one) => {
    const held = getHeld(one)
    return { name: typeof held.name === 'string' ? held.name : '', text: typeof held.text === 'string' ? held.text : '' }
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
    features: Object.fromEntries(system.features.map((kind) => [kind.id, getFeatures(features[kind.id])]))
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

export function getSigned(value: number): string {
  return value >= 0 ? `+${value}` : `${value}`
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
    subtype: ''
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
    (!filter.subtype || stats.subtypes.some((one) => one.toLowerCase() === filter.subtype.toLowerCase()))
  )
}
