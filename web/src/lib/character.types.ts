import type {FeatureSource} from "./class.types";
import type {ItemGrants} from "./rules/item.types";
import type {RuleSystemOverlay} from "./rules/spec.types";

/** Basic D&D currency types (cp, sp, gp, pp) */
export type Currency = keyof CharacterCurrency

/** One of the rule system's item categories, such as weapon, armor or ammunition */
export type ItemType = string

/** Standard D&D item rarity levels */
export type Rarity = 'common' | 'uncommon' | 'rare' | 'very rare' | 'legendary' | 'artifact'

/** Action timing classification in combat */
export type ActionType = 'Action' | 'Bonus' | 'Reaction' | 'Other'

/** Visual layout type for displaying actions */
export type ActionLayout = 'Attack' | 'Special'

/** Proficiency multiplier (0=none, 0.5=half, 1=proficient, 2=expertise) */
export type Proficiency = 0 | 0.5 | 1 | 2

/** Monetary value with amount and currency type */
export interface Value {
  amount: number
  currency: Currency
}

/** Damage definition with dice calculation */
export interface Damage {
  amount: number  // Number of dice
  dice: number    // Die type (d4, d6, etc)
  type: string    // Damage type (slashing, fire, etc)
  bonus: number   // Flat bonus to damage
}

/** Distance range definition */
export interface Range {
  normal: number  // Standard range in feet
  max: number     // Maximum range in feet
}

/** Armor Class calculation components */
export interface ArmorClass {
  base: number          // Base AC value
  bonus: number         // Additional AC bonus
  dexModifier: boolean  // Whether DEX mod applies
  maxDexBonus: number   // Maximum DEX bonus allowed
}

/** Item usage requirements */
interface Requirements {
  strength?: number   // Minimum strength score
  level?: number      // Minimum character level
  class?: string[]    // Required classes
  race?: string[]     // Required races
}

/** Status effect or bonus */
interface Effect {
  type: string          // Effect type (damage, heal, condition, etc)
  value: number | string  // Effect value
  duration: string      // Duration of effect
  condition: string     // Trigger condition
  target?: string       // Target of effect
}

/** Resource charges tracking */
interface Charges {
  max: number        // Maximum charges
  current: number    // Current charges
  rechargeOn: string // When charges replenish
}

/** Magical enhancement on items */
interface Enchantment {
  name: string
  description: string
  type: 'passive' | 'active' | 'charge'
  charges?: Charges
  effects: Effect[]
}

/** Container item properties */
interface Container {
  capacity: {
    weight: number   // Weight capacity
    items: number    // Item count capacity
  }
  contents: CharacterInventoryItem[]
}

/** What an item is as a weapon or as armor, the same on an item of the room and on a carried one */
export interface Properties {
  /** A weapon's dice and damage type; what an attack adds to it is the rule system's attack formula */
  damage?: Damage
  /** The damage a weapon with the versatile property deals held in two hands */
  versatile?: Damage
  range?: Range
  /** One of the rule system's weapon categories, which a character's weapon proficiencies name */
  weapon?: string
  /** What a magic weapon adds to its attack and damage rolls */
  magic?: number
  ac?: ArmorClass
  /** One of the rule system's armor categories */
  armor?: string
  /** The Strength score the armor slows a wearer below */
  strength?: number
  /** Disadvantage on Stealth while it is worn */
  stealth?: boolean
}

/** Item attunement status */
interface Attunement {
  required: boolean  // Whether attunement is required
  attuned: boolean  // Whether item is currently attuned
}

/** The item of the item room a carried item was added from */
export interface ItemOrigin {
  source: 'general' | 'homebrew'
  /** A general item's slug or a homebrew item's id */
  id: string
}

/** Complete item definition for inventory */
export interface CharacterInventoryItem {
  id: string
  title: string // Name of the item
  type: ItemType
  subtype?: string      // Specific type (longsword, chain mail, etc)
  rarity: Rarity
  attributes: string[]  // Item tags (finesse, versatile, etc)
  description: string
  value: Value
  weight: number
  quantity: number
  equippable: boolean
  /** Worn or wielded, so its grants reach the character; carried when not */
  equipped: boolean
  attunement?: Attunement
  origin?: ItemOrigin
  /** What it gives the character while it applies, by the rule system's rule for items */
  grants?: ItemGrants
  /** Used up when it is used, whatever its category says */
  consumable?: boolean
  properties?: Properties
  requirements?: Requirements
  enchantments?: Enchantment[]
  container?: Container
  customProperties?: Record<string, unknown>
}

/** Saving throw details for damaging effects */
export interface DamageSave {
  dc: number           // Difficulty class
  type: string        // Saving throw ability
  onSuccess: string   // Effect on successful save
}

/** Area of effect details */
export interface DamageAoe {
  type: string    // Shape of AoE (cone, sphere, etc)
  size: number    // Size in feet
}

/** Character action/ability definition */
export interface CharacterAction {
  name: string
  description?: string
  level?: number          // The level you gain this attack in
  layout: ActionLayout
  type: ActionType
  range?: Range
  damage?: Array<Damage>
  save?: DamageSave
  aoe?: DamageAoe
  toHit?: number           // Attack bonus
  properties?: Array<string>
  itemId?: string          // Reference to item source
  spellId?: string        // Reference to spell source
  effects?: Effect[]
  usesSlots?: boolean     // Whether uses spell slots
}

/** Character saving throw proficiency */
export interface CharacterSavingThrow {
  title: string
  modifier: number
  proficiency: Proficiency
}

/** Ability score and modifier */
export interface CharacterAbility {
  id: string
  title: string
  score: number      // Base ability score
  modifier: number   // Calculated modifier
}

/** Death saving throws made while at 0 HP */
export interface DeathSaves {
  successes: number
  failures: number
}

/** HP tracking */
export interface CharacterHitPoints {
  current: number
  max: number
  temporary: number
  deathSaves?: DeathSaves
  hitDiceSpent?: number
}

/** Class hit dice definition */
export interface HitDice {
  amount: number
  die: number
}

/** Race information */
export interface RaceInfo {
  name: string
  type: string    // Subrace or variant
}

/** Class information */
export interface ClassInfo {
  name: string
  hitDice: HitDice
}

/** Feature or feat definition */
export interface Feat {
  id: string
  level: number // The level you took the feat in, or class level it is gotten
  source: FeatureSource // Where does the feat come from, gained at a class level, taken when leveling up, or earned outside of leveling up
  title: string
  description: string
}

/** Skill proficiency definition */
export interface CharacterSkill {
  name: string
  ability: string         // Associated ability
  modifier: number        // Total modifier
  proficiency: Proficiency
}

/** Passive sense definition */
export interface CharacterSense {
  title: string
  score: number | string
  condition?: null | string  // Special conditions
}

/** Spellcasting information */
export interface SpellsInfo {
  modifier: string
  slots: {
    [level: number]: number  // Spell slots per level
  }
  expended?: {
    [level: number]: number
  }
}

/** Known/prepared spell */
export interface CharacterSpell {
  id: string
  title: string
  level: number
  school?: string
  description?: string
  prepared: boolean
  attack?: boolean
  save?: string
  damage?: Array<Damage>
}

/** Group of proficiencies */
export interface CharacterProficiency {
  id: string
  title: string
  value: string[]        // List of proficient items
}

/** Image with overlay option */
export interface StateImage {
  overlay: boolean
  url: string
}

/** Status condition definition */
export interface ConditionInfo {
  title: string
  image?: StateImage
  effects?: string[]
  level?: number | null    // Condition level (exhaustion)
}

/** Damage resistance/immunity */
export interface DefenceInfo {
  title: string
  image?: StateImage
  effects?: string[]
}

/** Detailed state effect */
export type StateDetail = {
  id: string
  description: string
  value: string | number | boolean | object
  duration?: number
  savingThrow?: {
    type: string
    dc: number
  }
  removeConditions?: {
    onDamage?: boolean
    onAction?: boolean
    onTurnEnd?: boolean
    onSave?: boolean
  }
}

/** Current character state */
export interface StateInfo {
  type: string
  image?: StateImage
  source?: string
  startTime?: number
  duration?: number
  details?: StateDetail[]
  effects?: string[]
}

/** Resource slot tracking */
export interface SlotsInfo {
  title: string
  description: string
  amount: number
  expended: number
  regainedAt?: string      // When slots refresh
}

/** Core character information */
export interface CharacterInfo {
  name: string
  description: string
  gender: string
  imageUrl: string
  /** Which traced surround the portrait sits in. */
  imageFrame?: string
  infoUrl: string
  backgroundUrl?: string
  level: number
  inspiration: boolean
  hp: CharacterHitPoints
  ac: number
  initiative: number
  speed: string
  proficiencyBonus: number
  weight: number
  carry_capacity: number
  race: RaceInfo
  class: ClassInfo
  spells?: SpellsInfo
  slots?: SlotsInfo
  conditions: ConditionInfo[]
  defences: DefenceInfo[]
  state: StateInfo
}

/** Character's currency amounts */
export interface CharacterCurrency {
  gp?: number    // Gold pieces
  sp?: number    // Silver pieces
  cp?: number    // Copper pieces
  pp?: number    // Platinum pieces
}

/** Character's background information */
export interface CharacterBackground {
  title: string      // Background name (Acolyte, Criminal, etc)
  subTitle?: string // Secondary choice if any, such as Enforcer for criminal
  description: string // Background story and features
  additional?: {
    title: string, // Title of the additional data
    type: string, // Information, feature, language, equipment, proficiencies, and so on...
    description?: string // The description of the additional item if any
  }[] // List of additional notes or properties for the background, Default undefined,
}

export interface CharacterSpecial {
  name: string
  regain: string
  current: number
  max: number
}

/** Character level progression for each level */
export interface LevelProgression {
  level: number
  proficiencyBonus: number
  features: Feat[]
  abilityScoreImprovement?: boolean
  featChoice?: boolean
  subclassChoice?: boolean
  hitDie: HitDice
  spellSlots?: {
    [level: number]: number
  }
  cantripsKnown?: number
  spellsKnown?: number
  additionalChoices?: {
    type: 'skill' | 'language' | 'tool' | 'fighting_style' | 'metamagic' | 'invocation' | 'maneuver' | 'spell'
    count: number
    from: string[]
    description: string
  }[]
}

/** Complete class progression from 1-20 */
export interface ClassProgression {
  className: string
  hitDie: number
  primaryAbility: string[]
  savingThrowProficiencies: string[]
  skillProficiencies: {
    count: number
    from: string[]
  }
  armorProficiencies: string[]
  weaponProficiencies: string[]
  toolProficiencies: string[]
  startingEquipment: CharacterInventoryItem[]
  levels: LevelProgression[]
}

/** Character source import data */
export interface CharacterSourceData {
  type: 'json' | 'text' | 'pdf' | 'image'
  content: string | File
  extractedData?: any
}

/** Level up choice options */
export interface LevelUpChoice {
  type: 'abilityScore' | 'feat' | 'skill' | 'spell' | 'subclass' | 'fighting_style'
  title: string
  description: string
  options: string[]
  maxSelections: number
  selected?: string[]
}

/** Complete level up data for a specific level */
export interface LevelUpData {
  level: number
  hitDiceGain: HitDice
  proficiencyBonus: number
  newFeatures: Feat[]
  choices: LevelUpChoice[]
  spellSlotChanges?: {
    [level: number]: number
  }
}

/** Individual sound clip for the sound board */
export interface SoundClip {
  id: string
  name: string
  address: string
  volume: number
  duration?: number
  created_at: string
}

/** Collection of sound clips for quick access during gameplay */
export interface SoundBoard {
  id: string
  name: string
  clips: SoundClip[]
}

/** Complete character data structure */
export interface Character {
  /** Core character information including name, race, class, HP, etc */
  info: CharacterInfo

  /** All character features, feats, and traits including:
   * - Class features (Extra Attack, Channel Divinity, etc)
   * - Racial features (Darkvision, Trance, etc)
   * - Background features (Criminal Contact, etc)
   * - Selected feats (Alert, Lucky, etc)
   * - And any other feature that can fit into this
   */
  feats: Feat[]

  /** The six primary ability scores (STR, DEX, CON, INT, WIS, CHA) */
  abilities: CharacterAbility[]

  /** All saving throw modifiers, including:
   * - Base ability modifier
   * - Proficiency bonus if proficient
   * - Any additional bonuses
   */
  savingThrows: CharacterSavingThrow[]

  /** All possible skills in 5e, including:
   * - Acrobatics, Athletics, Deception, etc
   * - Proficiency status (none, half, proficient, expertise)
   * - Total modifier including ability and proficiency
   * - Included all skills used in dnd 5e proficient or not
   */
  skills: CharacterSkill[]

  /** All character senses and passive abilities:
   * - Passive Perception
   * - Passive Investigation
   * - Passive Insight
   * - Darkvision if not 0
   * - Blindsight if not 0
   * - Tremorsense if not 0
   * - Truesight if not 0
   */
  senses: CharacterSense[]

  /** All possible actions the character can take:
   * - Weapon attacks
   * - Class features
   * - Racial abilities
   * - Item actions
   * - Spells converted to actions
   */
  actions: CharacterAction[]

  /** All spells known or prepared:
   * - Cantrips
   * - Leveled spells
   * - Innate spells
   * - Spell-like abilities
   */
  spells: CharacterSpell[]

  /** All proficiencies grouped by type:
   * - Weapons (Simple, Martial, Specific)
   * - Armor (Light, Medium, Heavy, Shields)
   * - Tools (Artisan's, Gaming, Musical, etc)
   * - Languages
   */
  proficients: CharacterProficiency[]

  /** All items possessed by the character */
  inventory: CharacterInventoryItem[]

  /** All currency possessed by the character */
  currency: CharacterCurrency

  /** Character's background choice and story */
  background: CharacterBackground

  /** Chi, sorcery points, grit points and so on */
  special: CharacterSpecial

  /** Sound board for playing audio clips during gameplay */
  soundBoard: SoundBoard

  /** The rule systems the sheet resolves against, applied left to right */
  systems: string[]

  /** Rules this character alone carries, applied over the systems */
  overlay: RuleSystemOverlay | null

  /** The character aboard a vehicle, by vehicle system id: the crew level and the perks taken */
  crew?: Record<string, CharacterCrew>
}

/** A character's standing as crew under one vehicle system */
export interface CharacterCrew {
  level: number
  perks: { id: string; count: number }[]
}