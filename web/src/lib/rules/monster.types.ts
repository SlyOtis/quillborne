export type MonsterEntry = {
  id: string
  name: string
}

export type MonsterAbility = MonsterEntry & { short: string }

export type MonsterSize = MonsterEntry & { hitDie: number }

export type MonsterType = MonsterEntry & { glyph?: string }

export type MonsterSkill = MonsterEntry & { ability: string }

export type MonsterFeatureKind = MonsterEntry & { one: string }

export type MonsterChallenge = {
  value: number
  name: string
  xp: number
  proficiency: number
}

export type MonsterTier = {
  value: number
  name: string
}

export type MonsterFormulas = {
  modifier: string
  save: string
  skill: string
  passivePerception: string
  initiative: string
  initiativeScore: string
  hitPoints: string
  hitBonus: string
}

export type MonsterDefaults = {
  size: string
  type: string
  alignment: string
  challenge: number
  score: number
  ac: number
  hitDice: number
  speeds: Record<string, number>
}

export type MonsterSystem = {
  id: string
  title: string
  version: string
  description: string
  distance: string
  typeGlyph: string
  defaults: MonsterDefaults
  abilities: MonsterAbility[]
  sizes: MonsterSize[]
  types: MonsterType[]
  alignments: MonsterEntry[]
  damageTypes: MonsterEntry[]
  conditions: MonsterEntry[]
  senses: MonsterEntry[]
  movements: MonsterEntry[]
  languages: MonsterEntry[]
  habitats: MonsterEntry[]
  skills: MonsterSkill[]
  challenges: MonsterChallenge[]
  tiers: MonsterTier[]
  flags: MonsterEntry[]
  features: MonsterFeatureKind[]
  formulas: MonsterFormulas
}

export type MonsterFeature = {
  name: string
  text: string
}

export type MonsterStats = {
  subtypes: string[]
  ac: number
  ac_note: string
  hit_dice: number
  speeds: Record<string, number>
  abilities: Record<string, number>
  saves: string[]
  skills: Record<string, number>
  initiative: number
  senses: Record<string, number>
  languages: string[]
  resistances: string[]
  immunities: string[]
  vulnerabilities: string[]
  condition_immunities: string[]
  habitats: string[]
  flags: string[]
  features: Record<string, MonsterFeature[]>
}

export type MonsterFigure = MonsterEntry & { value: number }

export type MonsterAbilityLine = MonsterAbility & {
  score: number
  mod: number
  save: number
  proficient: boolean
}

export type MonsterBlock = {
  size: string
  type: string
  alignment: string
  challenge: MonsterChallenge | null
  prof: number
  abilities: MonsterAbilityLine[]
  skills: (MonsterFigure & { tier: number })[]
  passivePerception: number
  initiative: number
  initiativeScore: number
  hitPoints: number
  hitBonus: number
  hitDie: number
  speeds: MonsterFigure[]
  senses: MonsterFigure[]
  languages: string[]
  resistances: string[]
  immunities: string[]
  vulnerabilities: string[]
  conditionImmunities: string[]
  habitats: string[]
  flags: string[]
}

export type MonsterChoice = 'yes' | 'no'

export type MonsterFilter = {
  name: string
  type: string
  challengeMin: number | null
  challengeMax: number | null
  size: string
  habitat: string
  alignment: string
  acMin: number | null
  acMax: number | null
  hpMin: number | null
  hpMax: number | null
  sense: string
  save: string
  skill: string
  flags: Record<string, MonsterChoice | ''>
  resistance: string
  immunity: string
  conditionImmunity: string
  vulnerability: string
  language: string
  movement: string
  tag: string
  subtype: string
}
