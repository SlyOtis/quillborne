export type MonsterEntry = {
  id: string
  name: string
}

export type MonsterAbility = MonsterEntry & { short: string }

export type MonsterSize = MonsterEntry & { hitDie: number }

export type MonsterType = MonsterEntry & { glyph?: string }

export type MonsterSkill = MonsterEntry & { ability: string }

export type MonsterFeatureKind = MonsterEntry & { one: string; legendary?: boolean }

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
  attack: string
  dc: string
  damage: string
  average: string
  rolledHitPoints: string
  recharged: string
}

export type MonsterLabels = {
  armorClass: string
  initiative: string
  hitPoints: string
  speed: string
  modifier: string
  save: string
  skills: string
  vulnerabilities: string
  resistances: string
  immunities: string
  conditionImmunities: string
  senses: string
  passivePerception: string
  languages: string
  none: string
  challenge: string
  experience: string
  proficiency: string
  habitats: string
  melee: string
  ranged: string
  meleeOrRanged: string
  or: string
  reach: string
  range: string
  hit: string
  plus: string
  damage: string
  savingThrow: string
  dc: string
  failure: string
  success: string
  half: string
  recharge: string
  perDay: string
  costs: string
  actions: string
  legendaryUses: string
  inLair: string
  source: string
  homebrew: string
  mine: string
  difficulty: string
}

export type MonsterBudget = Record<string, number> & { level: number }

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
  labels: MonsterLabels
  formulas: MonsterFormulas
  rechargeDie: number
  difficulties: MonsterEntry[]
  budgets: MonsterBudget[]
}

export type MonsterDamage = {
  dice: number
  die: number
  bonus: number
  type: string
  ability: boolean
}

export type MonsterAttack = {
  ability: string
  bonus: number
  reach: number
  range: number
  long_range: number
  damage: MonsterDamage[]
}

export type MonsterSave = {
  ability: string
  dc_ability: string
  bonus: number
  area: string
  damage: MonsterDamage[]
  half: boolean
}

export type MonsterFeature = {
  name: string
  text: string
  attack?: MonsterAttack
  save?: MonsterSave
  recharge?: number
  uses?: number
  cost?: number
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
  legendary_uses?: number
  legendary_lair_uses?: number
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
  source: string
}

export type MonsterRoll = {
  dice: number
  die: number
  flat: number
  average: number
  type: string
}

export type MonsterAction = {
  attack: number | null
  dc: number | null
  hit: MonsterRoll[]
  failure: MonsterRoll[]
}

export type MonsterSourceEntry = {
  slug: string
  name: string
  size: string
  type: string
  alignment: string
  challenge: number
  stats: unknown
  description: string
}

export type MonsterSource = {
  id: string
  title: string
  system: string
  license: string
  attribution: string
  monsters: MonsterSourceEntry[]
}

export type MonsterDifficulty = {
  xp: number
  budgets: MonsterFigure[]
  difficulty: MonsterEntry | null
}
