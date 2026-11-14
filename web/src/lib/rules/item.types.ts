/**
 * What an item gives the character who holds it: a layer over the sheet, the way an overlay sits over a system.
 * Every id is one the item's rule system declares, and each list names the scope it lands on, so the engine can
 * put the layer onto a character without reading anything else.
 */
export type ItemGrants = {
  /** On `attr.<id>`: `set` makes the score the value unless it is already higher, `bonus` adds the value up to `max`. */
  attributes: ItemAttribute[]
  /** On `bonus.<id>`, one of the system's `bonuses`. */
  bonuses: ItemBonus[]
  /** On the sheet's proficiencies at `skill.<id>` or `save.<id>`, at one of the system's `proficiencyTiers`. */
  proficiencies: ItemProficiency[]
  /** Advantage on the rolls of `skill.<id>` or `save.<id>`, when the note says. */
  advantages: ItemAdvantage[]
  /** One of the system's `defences` against one of its `damageTypes`. */
  defences: ItemDefence[]
  /** On `sense.<id>`, a ranged sense of the system, reaching at least the value. */
  senses: ItemReach[]
  /** One of the system's `speeds`, at least the value. */
  speeds: ItemReach[]
  /** Dealt on top of a hit. */
  damage: ItemDamage[]
  spells: ItemSpell[]
  /** A named property, written out. */
  features: ItemFeature[]
  charges: ItemCharges
}

export type ItemAttribute = {
  id: string
  mode: 'set' | 'bonus'
  value: number
  /** The score a bonus stops at, when it has one. */
  max?: number
}

export type ItemBonus = {
  id: string
  value: number
}

export type ItemProficiency = {
  /** A `skill.<id>` or `save.<id>`, or empty when `name` holds something the system does not list, such as a weapon. */
  id: string
  name: string
  tier: string
}

export type ItemAdvantage = {
  /** A `skill.<id>` or `save.<id>`, or empty when `name` holds a roll the system does not list. */
  id: string
  name: string
  note: string
}

export type ItemDefence = {
  id: string
  damage: string
}

export type ItemReach = {
  id: string
  value: number
}

export type ItemDamage = {
  /** A dice expression or a flat number, `1d6` or `2`. */
  dice: string
  /** One of the system's `damageTypes`, or empty for the damage of the attack it rides on. */
  damage: string
  note: string
}

export type ItemSpell = {
  name: string
  /** Zero for a cantrip. */
  level: number
  /** What one casting spends of the item's charges. */
  charges: number
  dc?: number
  attack?: number
  note: string
}

export type ItemFeature = {
  name: string
  text: string
}

export type ItemCharges = {
  /** Zero when the item holds no charges. */
  max: number
  /** A dice expression, `1d6 + 4`. */
  regain: string
  /** One of the system's `recharges`. */
  at: string
  /** What happens when the last charge is spent. */
  last: string
}
