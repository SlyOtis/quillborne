export type Expression = string

export type ProficiencyTier = {
  id: string
  title: string
  multiplier: number
}

export type AttributeSpec = {
  id: string
  title: string
  short: string
  default: number
  min: number
  max: number
  modifier: Expression
}

export type SkillSpec = {
  id: string
  title: string
  attribute: string
  modifier?: Expression
}

export type SaveSpec = {
  id: string
  title: string
  attribute: string
  modifier?: Expression
}

export type SenseSpec = {
  id: string
  title: string
  value: Expression
  unit?: string
}

export type TitledSpec = {
  id: string
  title: string
  description?: string
}

export type ConditionSpec = TitledSpec & {
  levels?: number
}

export type PoolRegain = 'short' | 'long' | 'turn' | 'never'

export type PoolView = 'plate' | 'pips'

export type PoolSpec = {
  id: string
  title: string
  description?: string
  max: Expression
  regainedAt: PoolRegain
  regainAmount?: Expression
  tiered?: boolean
  view?: PoolView
}

export type DerivedSpec = {
  id: string
  title: string
  value: Expression
  unit?: string
  hidden?: boolean
}

export type ProgressionStep = {
  level: number
  values: Record<string, number>
}

export type ProgressionSpec = {
  maxLevel: number
  proficiency: Expression
  steps: ProgressionStep[]
}

export type ImprovementSpec = {
  levels: number[]
  points: number
  cap: number
}

export type AdvancementSpec = {
  firstHitPoints: Expression
  hitPoints: Expression
  improvement: ImprovementSpec
  slots: Record<string, number[][]>
}

export type PanelField = {
  source: 'attribute' | 'skill' | 'save' | 'sense' | 'pool' | 'derived'
  id: string
}

export type PanelSpec = {
  id: string
  title: string
  layout: 'grid' | 'list' | 'row'
  fields: PanelField[]
}

export type RuleSystem = {
  id: string
  title: string
  version: string
  description?: string
  extends?: string[]
  attributes: AttributeSpec[]
  proficiencyTiers: ProficiencyTier[]
  skills: SkillSpec[]
  saves: SaveSpec[]
  senses: SenseSpec[]
  pools: PoolSpec[]
  derived: DerivedSpec[]
  progression: ProgressionSpec
  advancement?: AdvancementSpec
  panels: PanelSpec[]
  conditions?: ConditionSpec[]
  damageTypes?: TitledSpec[]
  defences?: TitledSpec[]
}

export type RuleSystemOverlay = Partial<Omit<RuleSystem, 'id' | 'title' | 'version'>> & {
  id: string
  title: string
  version: string
}

export type CharacterProficiencyMap = Record<string, string>

export type CharacterSheet = {
  systems: string[]
  overlay?: RuleSystemOverlay
  level: number
  attributes: Record<string, number>
  proficiencies: CharacterProficiencyMap
  pools: Record<string, number>
  bonuses: Record<string, number>
}

export type ResolvedValue = {
  id: string
  title: string
  value: number
  unit?: string
}

export type ResolvedSkill = ResolvedValue & {
  attribute: string
  tier: string
  multiplier: number
}

export type ResolvedPool = {
  id: string
  title: string
  description?: string
  max: number
  spent: number
  remaining: number
  regainedAt: PoolRegain
  regain: number
  view: PoolView
}

export type ResolvedAttribute = ResolvedValue & {
  score: number
  short: string
}

export type ResolvedCharacter = {
  system: RuleSystem
  level: number
  proficiency: number
  attributes: ResolvedAttribute[]
  skills: ResolvedSkill[]
  saves: ResolvedSkill[]
  senses: ResolvedValue[]
  pools: ResolvedPool[]
  derived: ResolvedValue[]
  panels: PanelSpec[]
  scope: Record<string, number>
}
