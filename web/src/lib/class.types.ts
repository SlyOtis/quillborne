
/** Types of spellcasting for classes */
export type SpellcastingType = 'prepared' | 'known' | 'pact' | 'none'

/** Class resource types (rage, ki, sorcery points etc) */
export type ResourceType = 'static' | 'scaling' | 'spellPoints'

/** Feature source type */
export type FeatureSource = 'base' | 'subclass' | 'optional' | 'class'

/** Level-based class feature */
export interface ClassFeature {
  id: string
  name: string
  description: string
  level: number
  source: FeatureSource
  optional?: boolean
  replaces?: string   // ID of feature this replaces
}

/** Function for calculating the number resource slots */
export type ClassResourceCalc = (...args: any) => number

/** Class resource definition such as Grit points, Ki, and so on */
export interface ClassResource {
  id: string
  name: string
  description: string
  type: ResourceType
  amount: ClassResourceCalc    // Fixed number or formula
  rechargeOn: 'short' | 'long' | 'dawn'
}

/** Spellcasting properties */
export interface SpellcastingProperties {
  type: SpellcastingType
  ability: string
  focusTypes: string[]
  ritual: boolean
  preparation?: {
    formula: string    // e.g. "level + wisdom modifier"
    minimum: number
  }
}

/** Proficiency granted by class */
export interface ClassProficiency {
  type: 'armor' | 'weapon' | 'tool' | 'saving-throw' | 'skill'
  items: string[]      // What is granted
  choose?: {           // Optional choices
    count: number
    from: string[]
  }
}

/** Custom roll tables relevant to the class */
export interface CustomTable {
  id: string
  name: string
  description: string
  columns: string[]
  rows: Record<string, string | number>[]
}

/** Level progression table row */
export interface LevelTableRow {
  level: number
  proficiencyBonus: number
  features: string[]   // Feature IDs gained
  spellSlots?: {[key: number]: number}
  classResources?: {[key: string]: number}
}

/** An item of the item room by its slug, and how many of it */
export interface EquipmentEntry {
  id: string
  quantity: number
}

/** Subclass definition */
export interface Subclass {
  id: string
  name: string
  description: string
  features: string[] // ID of features gained in this subclass from the shared features list
  spellList?: string[]  // Additional spells
}

/** Complete class definition */
export interface Class {
  id: string
  name: string
  description: string
  hitDie: number
  primaryAbility: string[]
  savingThrows: string[]
  // Base features and proficiencies
  features: ClassFeature[]
  proficiencies: ClassProficiency[]
  // Spellcasting if applicable
  spellcasting?: SpellcastingProperties
  // Resources like rage, ki points
  resources?: ClassResource[]
  // Level progression
  levelTable: LevelTableRow[]
  /** What every member starts with, then for each choice the sets of items picked between, the first being the one a new character takes */
  startingEquipment?: {
    fixed: EquipmentEntry[]
    choices: { options: EquipmentEntry[][] }[]
  }
  // Available subclasses
  subclasses: Subclass[]
  // Optional class features
  optionalFeatures?: ClassFeature[]
  // Any custom tables specific to the class
  customTables?: CustomTable[]
}
