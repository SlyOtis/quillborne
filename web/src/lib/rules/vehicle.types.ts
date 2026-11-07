export type SourceRef = {
  document: string
  version: string
  page?: number | string
  section?: string
  note?: string
}

export type Tone = 'default' | 'good' | 'warn' | 'bad'

export type Condition = 'functional' | 'impaired' | 'broken'

export type OverlayKey = 'arcs' | 'movement' | 'locations' | 'conditions' | 'navalGrid' | 'boardingGrid'

export type RulingRef = { ruling: string }

export type ShotRanges = { close: number | null; normal: number | null; long: number | null }

export type ShotProperty =
  | { key: 'rake' }
  | { key: 'advantage'; target: 'hulls' | 'masts' }
  | { key: 'anti_personnel' }
  | { key: 'area'; area: string }
  | { key: 'high_arc' }
  | { key: 'linking'; material: string }
  | { key: 'minimum_range'; feet: number }

export type Shot = {
  key: string
  name: string
  target: 'attack' | 'save'
  saveAbility?: string | null
  properties: ShotProperty[]
  damage: { dice: string; type: string }
  ranges: ShotRanges
  rulingRanges?: RulingRef & { options: Record<string, ShotRanges> }
  description?: string
}

export type ComponentProperty =
  | { key: 'wind_driven' }
  | { key: 'fuel' }
  | { key: 'noisy'; value: number }
  | { key: 'dead' }
  | { key: 'ferrous' }
  | { key: 'flammable'; value: number }
  | { key: 'heavy'; value: number }
  | { key: 'light'; value: number }

export type ComponentStats = {
  ac: number
  dt: number
  hp: number
  it: number
  con: number
  abilities?: string[]
  artilleryType?: string
  shots?: Shot[]
  controlType?: string
  changesOfFacing?: number
  propulsionType?: string
  speed?: { primary: number; secondary: number }
  properties?: ComponentProperty[]
  ramDamage?: { dice: string; type: string | null; average?: number }
  attackBonus?: number
  traits?: { name: string; text: string }[]
  actions?: { name: string; text: string }[]
  kaijuThreshold?: { value: number; condition: string }
  mimic?: boolean
}

export type ComponentDef = {
  key: string
  name: string
  category: string
  family: string | null
  tier: string | null
  quality: string | null
  size: string | null
  dimensions: string | null
  material: string | null
  weight: number | null
  cargoUnits: number | null
  materialCost: number | null
  craftingTime: number | null
  value: number | null
  stats: ComponentStats
  description: string | null
  source: SourceRef | null
  playerAvailable: boolean
  slotTypes: string[]
  retired?: boolean
  homebrew?: boolean
  materialRuling?: RulingRef & { options: Record<string, string> }
}

export type FiringArc = { centerDeg: number; widthDeg: number }

export type Slot = {
  code: string
  label: string | null
  acceptedTypes: string[]
  maxSize: string | null
  x: number
  y: number
  rotation: number
  arc: FiringArc | null
  approximate: boolean
  notes?: string | null
  arcRuling?: string
}

export type Layout = {
  key: string
  name: string
  widthFt: number
  lengthFt: number
  gridFt: number
  navalGridFt: number
  shape: {
    outline: [number, number][]
    traversable: [number, number][]
    bounds: { minX: number; minY: number; maxX: number; maxY: number }
  }
  approximate: boolean
  notes: string | null
  source: SourceRef | null
  slots: Slot[]
}

export type TemplateComponent = {
  slot: string
  component: string
  label: string | null
  override: boolean
  overrideReason: string | null
}

export type VehicleTemplate = {
  key: string
  version: number
  name: string
  description: string
  layout: string
  stats: Record<string, unknown>
  components: TemplateComponent[]
}

export type PerkEffect =
  | { kind: 'artillery_bonus'; perStack: number }
  | { kind: 'crit_threshold'; perStack: number }
  | { kind: 'extra_damage_dice'; die: string; perStack: number; artilleryTypes: string[]; against: string }
  | { kind: 'extra_damage_flat'; perStack: number; artilleryTypes: string[]; condition: string }
  | { kind: 'conditional_attack_bonus'; value: number; condition: string }
  | { kind: 'creature_size_step'; perStack: number }
  | { kind: 'scaling'; text: string }

export type Perk = {
  id: string
  tree: string
  name: string
  navalLevel: number
  prerequisites: string[]
  prerequisiteText: string
  repeatLimit: { kind: 'once' | 'pb' | 'half_pb' }
  tags: string[]
  actionType: string
  range?: string
  duration?: string
  resources?: string
  restrictions?: string
  description: string
  additional?: string
  appliesTo: string[]
  effects: PerkEffect[]
  source: SourceRef
  halfUnstated?: boolean
  levelRuling?: RulingRef & { options: Record<string, number> }
}

export type PerkTree = { key: string; name: string; abilities: string; blurb: string }

export type RuleQuestion = {
  id: string
  title: string
  description: string
  sources: SourceRef[]
  options: { key: string; label: string; description?: string }[]
  provisionalOption: string
  affects: string
}

export type ShipStep = {
  key: string
  name: string
  needs: string | null
  perks: string[]
  text: string
  actions: { name: string; text: string }[]
}

export type CoreStats = { ac: number; dt: number; hp: number; it: number; con: number }

export type VehicleSystem = {
  id: string
  title: string
  version: string
  engine: string
  description: string
  kind: string
  crew: { level: string; perks: string; roles: string[] }
  sizes: string[]
  footprints: Record<string, number>
  overlays: OverlayKey[]
  rules: {
    destroyOverflow: number
    speedPenalty: number
    facingPenalty: number
    saveBase: number
    critRange: number
    movementStep: number
    turnDegrees: number
    brokenRecovery: RulingRef & { strictWhen: string }
    weight: RulingRef & { statedWhen: string }
    areaSave: RulingRef & { abilities: Record<string, string> }
    impairedNoClose: string
    kaijuNoise: RulingRef & { noisyWhen: string }
    halfProficiency: RulingRef & { downWhen: string }
  }
  text: {
    impaired: Record<string, string>
    broken: Record<string, string>
    destroyed: string
    repairTools: Record<string, string>
    properties: Record<string, string>
    shotProperties: Record<string, string>
    shotTags: Record<string, string>
    ramming: { label: string; value: string }[]
    artilleryAction: string
    helmStep: string
    coreRules: { title: string; body: string }[]
  }
  installHours: Record<string, { light: number; heavy: number; hull: number }>
  qualities: Record<string, CoreStats>
  categories: { key: string; name: string; description: string }[]
  components: ComponentDef[]
  perkTrees: PerkTree[]
  perks: Perk[]
  layouts: Layout[]
  templates: VehicleTemplate[]
  rulings: RuleQuestion[]
  shipPhase: { rule: string; steps: ShipStep[] }
}

export type VehicleOverlay = { components?: ComponentDef[] }

export type Rulings = Record<string, string>

export type InstalledComponent = {
  id: string
  slot: string | null
  component: string
  label: string | null
  x: number | null
  y: number | null
  rotation: number | null
  override: boolean
  overrideReason: string | null
}

export type ComponentState = {
  hp: number
  condition: Condition
  destroyed: boolean
}

export type CrewPerk = { id: string; count: number }

export type Crewman = {
  id: string
  name: string
  level: number
  crewLevel: number
  proficiency: number
  modifiers: Record<string, number>
  perks: CrewPerk[]
}

export type Placed = InstalledComponent & { def: ComponentDef }

export type VehicleContext = {
  system: VehicleSystem
  layout: Layout
  components: Placed[]
  stats: Record<string, unknown>
  states: Record<string, ComponentState>
  rulings: Rulings
}

export type Issue = { severity: 'error' | 'warning'; code: string; message: string }

export type StatLine = {
  key: string
  label: string
  value: string
  numeric?: number | null
  detail?: string
  tone?: Tone
  pendingRuling?: string
}

export type KeyValue = {
  label: string
  value: string
  detail?: string
  tone?: Tone
  pendingRuling?: string
}

export type WeaponMode = {
  key: string
  name: string
  kind: 'attack' | 'save' | 'melee'
  toHit: string | null
  bonus: number | null
  ability: string | null
  damageShort: string
  damageDice: string | null
  tags: string[]
  unavailable?: boolean
  formula: string
  damage: string
  ranges: { label: string; value: string; reduced?: boolean }[]
  properties: string[]
  notes: string[]
  pendingRuling?: string
}

export type PanelSection =
  | { kind: 'stats'; title: string; rows: KeyValue[] }
  | { kind: 'modes'; title: string; modes: WeaponMode[] }
  | { kind: 'text'; title: string; items: { title?: string; body: string; tone?: Tone }[] }
  | { kind: 'perks'; title: string; perks: { name: string; count: number; summary: string; owner: string }[] }

export type ComponentPanel = {
  title: string
  subtitle: string
  core: KeyValue[]
  quick: KeyValue[]
  sections: PanelSection[]
  warnings: string[]
}

export type StatDiff = {
  label: string
  before: string
  after: string
  direction: 'better' | 'worse' | 'same' | 'changed'
}

export type MapInfo = {
  length: number
  width: number
  ranges: ({ label: string } & ShotRanges)[]
  isWeapon: boolean
  isStructure: boolean
  shortLabel: string
}
