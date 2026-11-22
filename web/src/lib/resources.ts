import { deleteFile, deleteResource, getReachedResources, getResource, getResources, isStoredFile, postResource, putResource } from './api'
import type { Access, Owner } from './api/types'
import type { CharacterInventoryItem, Properties } from './character.types'
import { dropDoc } from './collab'
import type { ItemAttribute, ItemCharges, ItemGrants, ItemSpell } from './rules/item.types'
import type { RuleSystem } from './rules/spec.types'
import { getSystem } from './rules/system'

/** A label the writer added to the head, with the line written next to it. */
export interface Fact {
  label: string
  value: string
}

/** The fields every resource carries, whatever it is. */
export interface Resource extends Access {
  id: string
  title: string
  description: string
  tags: string[]
  /** The writer's own labels, after the kind's fields. */
  facts: Fact[]
  images: string[]
  /** The one picture chosen out of images. */
  image: string
  /** The traced surround the picture sits in, or none. */
  frame: string
  /** The block document the page is written in. */
  content: string
  /** Set on a resource that only gathers others on the roll. */
  group: boolean
  /** The group this one is gathered under, or none. */
  group_id: string
  /** The resource this one is a sub page of. */
  parent_id: string
  /** The organization that keeps it, a campaign or the one every row no campaign keeps is under. */
  owner_id: string
  /** When it was written down, which is what orders a chronicle. */
  created_at: string | null
}

export type Rarity = 'common' | 'uncommon' | 'rare' | 'very rare' | 'legendary' | 'artifact'
export type PlaceKind =
  | 'region' | 'city' | 'town' | 'village' | 'keep' | 'tower' | 'dungeon' | 'cave' | 'ruin' | 'temple' | 'inn'

/** A story entry or a note. */
export interface Entry extends Resource {}

/** Any object, a weapon and armor among them. */
export interface Item extends Resource {
  /** One of the item categories of its rule system. */
  category: string
  /** What it is within its type, such as lantern, key or book. */
  subtype: string
  rarity: Rarity
  attunement: boolean
  /** Who may attune to it, as it reads after "requires attunement", such as "by a wizard". */
  attuned_by: string
  consumable: boolean
  weight: number
  /** Worth in gold. */
  value: number
  /** A short line read beside the prose. */
  notes: string
  /** The rule system whose ids its grants name. */
  system: string
  grants: ItemGrants
  /** General items ship with the app and every player reads them; homebrew is what a player makes. */
  source: 'general' | 'homebrew'
  /** The book a general item comes from. */
  book: string
  /** Kept by a campaign the reader sits at without reading it, so only its name, type and rarity arrived. */
  locked: boolean
  /** What it is as a weapon or as armor, the shape a carried item has. */
  properties: Properties
}

/** Somewhere an encounter can happen. Always placed on a map. */
export interface Place extends Resource {
  category: PlaceKind
  map_id: string
}

export interface Chart extends Resource {}

/** A session played at the table. */
export interface Session extends Resource {
  number: number
  played_at: string
}



type Stored = Record<string, unknown> & { id: string }

function getShared(stored: Stored): Resource {
  return {
    id: stored.id,
    title: String(stored.name ?? 'Unnamed'),
    description: String(stored.description ?? ''),
    tags: Array.isArray(stored.tags) ? (stored.tags as string[]) : [],
    facts: Array.isArray(stored.facts) ? (stored.facts as Fact[]) : [],
    images: Array.isArray(stored.images) ? (stored.images as string[]) : [],
    image: String(stored.image_url ?? ''),
    frame: String(stored.frame ?? ''),
    content: String(stored.body ?? ''),
    parent_id: String(stored.parent_id ?? ''),
    group: Boolean(stored.group),
    group_id: String(stored.group_id ?? ''),
    user_id: String(stored.user_id ?? ''),
    owner_id: String(stored.owner_id ?? ''),
    share_campaigns: Array.isArray(stored.share_campaigns) ? (stored.share_campaigns as string[]) : [],
    share_users: Array.isArray(stored.share_users) ? (stored.share_users as string[]) : [],
    created_at: (stored.created_at as string | undefined) ?? null
  }
}

function putShared(one: Partial<Resource>): Record<string, unknown> {
  return {
    name: one.title ?? '',
    description: one.description ?? '',
    tags: one.tags ?? [],
    facts: one.facts ?? [],
    images: one.images ?? [],
    image_url: one.image ?? '',
    frame: one.frame ?? '',
    body: one.content ?? '',
    parent_id: one.parent_id ?? '',
    group: one.group ?? false,
    group_id: one.group_id ?? '',
    user_id: one.user_id ?? '',
    share_campaigns: one.share_campaigns ?? [],
    share_users: one.share_users ?? []
  }
}

// Entries

export async function getEntries(owner: Owner): Promise<Entry[]> {
  const stored = await getResources<Stored>(owner, 'entries')
  return stored.map((one) => ({ ...getShared(one) }))
}

export function postEntry(owner: Owner, one: Partial<Entry>): Promise<string> {
  return postResource(owner, 'entries', putShared(one))
}

export function putEntry(owner: Owner, id: string, one: Partial<Entry>): Promise<void> {
  return putResource(id, putShared(one))
}

// Items

const ITEM_PATH = '/sources/items'

const ITEM: Omit<Item, keyof Resource | 'grants' | 'properties'> = {
  category: 'adventuring gear',
  subtype: '',
  rarity: 'common',
  attunement: false,
  attuned_by: '',
  consumable: false,
  weight: 0,
  value: 0,
  notes: '',
  system: 'dnd5e',
  source: 'homebrew',
  book: '',
  locked: false
}

function getList<T>(value: unknown, read: (one: Record<string, unknown>) => T | null): T[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((one) => {
    const held = one && typeof one === 'object' ? read(one as Record<string, unknown>) : null
    return held ? [held] : []
  })
}

function getText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : typeof value === 'number' ? String(value) : ''
}

function getFigure(value: unknown): number | undefined {
  const figure = typeof value === 'string' && value.trim() !== '' ? Number(value) : value
  return typeof figure === 'number' && Number.isFinite(figure) ? figure : undefined
}

/** Reads the grants an item carries, from a world document or a homebrew page, dropping every row that names nothing. */
export function getItemGrants(value: unknown): ItemGrants {
  const held = value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
  const charges = held.charges && typeof held.charges === 'object' ? (held.charges as Record<string, unknown>) : {}
  const named = (one: Record<string, unknown>) => (getText(one.id) || getText(one.name) ? { id: getText(one.id), name: getText(one.id) ? '' : getText(one.name) } : null)
  const reach = (one: Record<string, unknown>) => (getText(one.id) ? { id: getText(one.id), value: getFigure(one.value) ?? 0 } : null)
  return {
    attributes: getList(held.attributes, (one) => {
      if (!getText(one.id)) return null
      const max = getFigure(one.max)
      const attribute: ItemAttribute = { id: getText(one.id), mode: one.mode === 'set' ? 'set' : 'bonus', value: getFigure(one.value) ?? 0 }
      return max === undefined ? attribute : { ...attribute, max }
    }),
    bonuses: getList(held.bonuses, reach),
    proficiencies: getList(held.proficiencies, (one) => {
      const target = named(one)
      return target ? { ...target, tier: getText(one.tier) } : null
    }),
    advantages: getList(held.advantages, (one) => {
      const target = named(one)
      return target ? { ...target, note: getText(one.note) } : null
    }),
    defences: getList(held.defences, (one) => (getText(one.id) && getText(one.damage) ? { id: getText(one.id), damage: getText(one.damage) } : null)),
    senses: getList(held.senses, reach),
    speeds: getList(held.speeds, reach),
    damage: getList(held.damage, (one) => (getText(one.dice) ? { dice: getText(one.dice), damage: getText(one.damage), note: getText(one.note) } : null)),
    spells: getList(held.spells, (one) => {
      if (!getText(one.name)) return null
      const dc = getFigure(one.dc)
      const attack = getFigure(one.attack)
      return {
        name: getText(one.name),
        level: getFigure(one.level) ?? 0,
        charges: getFigure(one.charges) ?? 0,
        ...(dc === undefined ? {} : { dc }),
        ...(attack === undefined ? {} : { attack }),
        note: getText(one.note)
      }
    }),
    features: getList(held.features, (one) => (getText(one.name) || getText(one.text) ? { name: getText(one.name), text: getText(one.text) } : null)),
    charges: {
      max: Math.max(0, getFigure(charges.max) ?? 0),
      regain: getText(charges.regain),
      at: getText(charges.at),
      last: getText(charges.last)
    }
  }
}

function getItem(one: Stored): Item {
  return {
    ...getShared(one),
    category: String(one.category ?? ITEM.category),
    subtype: String(one.subtype ?? ITEM.subtype),
    rarity: (one.rarity as Rarity) ?? ITEM.rarity,
    attunement: Boolean(one.attunement ?? ITEM.attunement),
    attuned_by: String(one.attuned_by ?? ITEM.attuned_by),
    consumable: Boolean(one.consumable ?? ITEM.consumable),
    weight: Number(one.weight ?? ITEM.weight),
    value: Number(one.value ?? ITEM.value),
    notes: String(one.notes ?? ITEM.notes),
    system: String(one.system ?? ITEM.system),
    grants: getItemGrants(one.grants),
    source: ITEM.source,
    book: ITEM.book,
    locked: Boolean(one.locked),
    properties: one.properties && typeof one.properties === 'object' ? (one.properties as Properties) : {}
  }
}

/** The rule system an item is written for when it names none, whose item categories the item room is narrowed by. */
export function getItemSystem(): Promise<RuleSystem> {
  return getSystem(ITEM.system)
}

export async function getItems(owner: Owner): Promise<Item[]> {
  const stored = await getResources<Stored>(owner, 'items')
  return stored.map(getItem)
}

/** The general items, the world's list that ships under `/sources/items` with an index naming them. */
export async function getWorldItems(): Promise<Item[]> {
  const answer = await fetch(`${ITEM_PATH}/index.json`)
  if (!answer.ok) throw new Error(`The item index did not load: ${answer.status} ${answer.statusText}`)
  const listed = (await answer.json()) as { items: string[] }
  return Promise.all(
    listed.items.map(async (id) => {
      const held = await fetch(`${ITEM_PATH}/${id}.json`)
      if (!held.ok) throw new Error(`The item ${id} did not load: ${held.status} ${held.statusText}`)
      const document = (await held.json()) as Stored
      return { ...getItem({ ...document, id }), source: 'general' as const, book: String(document.book ?? '') }
    })
  )
}

/** Every item the reader reaches: the general items, then every homebrew item they read or a table they sit at keeps locked from them. */
export async function getItemRoom(): Promise<Item[]> {
  const [world, made] = await Promise.all([getWorldItems(), getReachedResources<Stored>('items')])
  return [...world, ...made.map(getItem)]
}

/** What a proficiency or an advantage may name out of a system: its skills, then its saves, by the scope each lands on. */
export function getItemTargets(system: RuleSystem): { id: string; title: string }[] {
  return [
    ...system.skills.map((one) => ({ id: `skill.${one.id}`, title: one.title })),
    ...system.saves.map((one) => ({ id: `save.${one.id}`, title: `${one.title} saves` }))
  ]
}

/** Every grant written out as a label and a line, with the names the system gives its ids. */
export function getGrantLines(grants: ItemGrants, system: RuleSystem): Fact[] {
  const title = (list: { id: string; title: string }[] | undefined, id: string) => list?.find((one) => one.id === id)?.title ?? id
  const signed = (value: number) => (value < 0 ? `${value}` : `+${value}`)
  const targets = getItemTargets(system)
  const target = (one: { id: string; name: string }) => (one.id ? title(targets, one.id) : one.name)
  const ranged = (one: { id: string; value: number }, list: { id: string; title: string; unit?: string }[] | undefined) => {
    const found = list?.find((entry) => entry.id === one.id)
    return { label: found?.title ?? one.id, value: `${one.value}${found?.unit ? ` ${found.unit}` : ''}` }
  }
  const joined = (label: string, values: string[]) => (values.length > 0 ? [{ label, value: values.join('; ') }] : [])
  const { charges } = grants
  return [
    ...grants.attributes.map((one) => ({
      label: title(system.attributes, one.id),
      value: one.mode === 'set' ? `Becomes ${one.value}` : `${signed(one.value)}${one.max ? `, to ${one.max} at most` : ''}`
    })),
    ...grants.bonuses.map((one) => ({ label: title(system.bonuses, one.id), value: signed(one.value) })),
    ...joined('Proficiency', grants.proficiencies.map((one) => `${target(one)}${one.tier ? ` (${title(system.proficiencyTiers, one.tier).toLowerCase()})` : ''}`)),
    ...joined('Advantage', grants.advantages.map((one) => `${target(one)}${one.note ? ` ${one.note}` : ''}`)),
    ...(system.defences ?? [])
      .map((defence) => ({ label: defence.title, damage: grants.defences.filter((one) => one.id === defence.id).map((one) => title(system.damageTypes, one.damage)) }))
      .flatMap((one) => joined(one.label, one.damage)),
    ...grants.senses.map((one) => ranged(one, system.senses)),
    ...grants.speeds.map((one) => ranged(one, system.speeds)),
    ...joined('On a hit', grants.damage.map((one) => `${/^[+-]/.test(one.dice) ? one.dice : `+${one.dice}`}${one.damage ? ` ${title(system.damageTypes, one.damage).toLowerCase()}` : ''}${one.note ? `, ${one.note}` : ''}`)),
    ...grants.spells.map((one) => ({ label: one.name, value: getItemSpellLine(one) })),
    ...grants.features.map((one) => ({ label: one.name, value: one.text })),
    ...(charges.max > 0 ? [{ label: 'Charges', value: getChargesLine(charges, system) }] : [])
  ]
}

/** A spell an item casts written out: its level, what it spends of the charges, its save or attack and its note. */
export function getItemSpellLine(one: ItemSpell): string {
  return [
    one.level === 0 ? 'Cantrip' : `Level ${one.level}`,
    one.charges > 0 ? `${one.charges} ${one.charges === 1 ? 'charge' : 'charges'}` : '',
    one.dc !== undefined ? `save DC ${one.dc}` : '',
    one.attack !== undefined ? `${one.attack < 0 ? one.attack : `+${one.attack}`} to hit` : '',
    one.note
  ]
    .filter(Boolean)
    .join(', ')
}

/** The charges an item holds written out, with when they come back in the system's words. */
export function getChargesLine(charges: ItemCharges, system: RuleSystem): string {
  const at = system.recharges?.find((one) => one.id === charges.at)?.title ?? charges.at
  return [`${charges.max}`, charges.regain ? `regains ${charges.regain}${at ? ` at ${at.toLowerCase()}` : ''}` : '', charges.last]
    .filter(Boolean)
    .join(', ')
}

function putItemFields(one: Partial<Item>): Record<string, unknown> {
  return {
    ...putShared(one),
    category: one.category ?? ITEM.category,
    subtype: one.subtype ?? ITEM.subtype,
    rarity: one.rarity ?? ITEM.rarity,
    attunement: one.attunement ?? ITEM.attunement,
    attuned_by: one.attuned_by ?? ITEM.attuned_by,
    consumable: one.consumable ?? ITEM.consumable,
    weight: one.weight ?? ITEM.weight,
    value: one.value ?? ITEM.value,
    notes: one.notes ?? ITEM.notes,
    system: one.system ?? ITEM.system,
    grants: getItemGrants(one.grants),
    properties: one.properties ?? {}
  }
}

export function postItem(owner: Owner, one: Partial<Item>): Promise<string> {
  return postResource(owner, 'items', putItemFields(one))
}

export function putItem(owner: Owner, id: string, one: Partial<Item>): Promise<void> {
  return putResource(id, putItemFields(one))
}

/** The type line under an item's name, "Wondrous item (lantern)". */
export function getItemType(one: Pick<Item, 'category' | 'subtype'>): string {
  const type = one.category.charAt(0).toUpperCase() + one.category.slice(1)
  return one.subtype ? `${type} (${one.subtype})` : type
}

/** The line D&D Beyond writes under an item's name, "Wondrous item (lantern), uncommon (requires attunement by a wizard)". */
export function getItemLine(one: Pick<Item, 'category' | 'subtype' | 'rarity' | 'attunement' | 'attuned_by'>): string {
  const bond = one.attuned_by ? `requires attunement ${one.attuned_by}` : 'requires attunement'
  return `${getItemType(one)}, ${one.rarity}${one.attunement ? ` (${bond})` : ''}`
}

/** What the item room is narrowed by. An empty field narrows nothing. */
export interface ItemFilter {
  /** Words the name holds. */
  name: string
  /** One of the item categories, or empty for every one. */
  type: string
  rarities: Rarity[]
  bond: '' | 'required' | 'free'
  source: '' | Item['source']
  lock: '' | 'open' | 'locked'
  /** The campaign that keeps it. */
  table: string
}

/** A filter that narrows nothing. */
export function getEmptyItemFilter(): ItemFilter {
  return { name: '', type: '', rarities: [], bond: '', source: '', lock: '', table: '' }
}

/** Whether an item answers to every field of the filter. */
export function isItemShown(one: Item, filter: ItemFilter): boolean {
  const asked = filter.name.trim().toLowerCase()
  return (
    (!asked || one.title.toLowerCase().includes(asked)) &&
    (!filter.type || one.category === filter.type) &&
    (filter.rarities.length === 0 || filter.rarities.includes(one.rarity)) &&
    (!filter.bond || one.attunement === (filter.bond === 'required')) &&
    (!filter.source || one.source === filter.source) &&
    (!filter.lock || one.locked === (filter.lock === 'locked')) &&
    (!filter.table || one.owner_id === filter.table)
  )
}

/** An item of the room as a character carries it: what the sheet shows of it, its grants, and where it came from. */
export function getCarriedItem(one: Item): CharacterInventoryItem {
  return {
    id: crypto.randomUUID(),
    title: one.title,
    type: one.category,
    subtype: getItemType(one),
    rarity: one.rarity,
    attributes: one.tags,
    description: one.description,
    value: { amount: one.value, currency: 'gp' },
    weight: one.weight,
    quantity: 1,
    equippable: !one.consumable,
    equipped: false,
    consumable: one.consumable,
    ...(one.attunement ? { attunement: { required: true, attuned: false } } : {}),
    origin: { source: one.source, id: one.id },
    grants: one.grants,
    properties: one.properties
  }
}

/** One homebrew item by its id, as far as the reader reads it. */
export async function getRoomItem(id: string): Promise<Item> {
  return getItem(await getResource<Stored>(id))
}

/**
 * An item as it lands in a sheet it is handed to at a table: whole when the table reads it, else its head alone,
 * unidentified, so the sheet the table reads gives nothing of it away.
 */
export function getGivenItem(one: Item, campaignId: string): CharacterInventoryItem {
  const carried = getCarriedItem(one)
  if (one.source === 'general' || one.share_campaigns.includes(campaignId)) return carried
  return {
    id: carried.id,
    title: carried.title,
    type: carried.type,
    rarity: carried.rarity,
    attributes: [],
    description: '',
    value: { amount: 0, currency: 'gp' },
    weight: carried.weight,
    quantity: 1,
    equippable: carried.equippable,
    equipped: false,
    origin: carried.origin,
    unidentified: true
  }
}

/** The token a rarity is written in under the active theme. */
export function getRarityInk(rarity: Rarity): string {
  return `var(--rarity-${rarity.replace(' ', '-')})`
}

// Places

export async function getPlaces(owner: Owner): Promise<Place[]> {
  const stored = await getResources<Stored>(owner, 'locations')
  return stored.map((one) => ({
    ...getShared(one),
    category: (one.category as PlaceKind) ?? (one.kind as PlaceKind) ?? 'region',
    map_id: String(one.map_id ?? '')
  }))
}

export function postPlace(owner: Owner, one: Partial<Place>): Promise<string> {
  return postResource(owner, 'locations', {
    ...putShared(one),
    category: one.category ?? 'region',
    kind: one.category ?? 'region',
    map_id: one.map_id ?? ''
  })
}

export function putPlace(owner: Owner, id: string, one: Partial<Place>): Promise<void> {
  return putResource(id, {
    ...putShared(one),
    category: one.category ?? 'region',
    kind: one.category ?? 'region',
    map_id: one.map_id ?? ''
  })
}

// Charts, the maps a campaign holds

export async function getCharts(owner: Owner): Promise<Chart[]> {
  const stored = await getResources<Stored>(owner, 'maps')
  return stored.map((one) => ({ ...getShared(one) }))
}

export function postChart(owner: Owner, one: Partial<Chart>): Promise<string> {
  return postResource(owner, 'maps', putShared(one))
}

export function putChart(owner: Owner, id: string, one: Partial<Chart>): Promise<void> {
  return putResource(id, putShared(one))
}

// Sessions

export async function getSessions(owner: Owner): Promise<Session[]> {
  const stored = await getResources<Stored>(owner, 'sessions')
  return stored.map((one) => ({
    ...getShared(one),
    number: Number(one.number ?? 0),
    played_at: String(one.played_at ?? '')
  }))
}

export function postSession(owner: Owner, one: Partial<Session>): Promise<string> {
  return postResource(owner, 'sessions', {
    ...putShared(one),
    number: one.number ?? 0,
    played_at: one.played_at ?? ''
  })
}

export function putSession(owner: Owner, id: string, one: Partial<Session>): Promise<void> {
  return putResource(id, {
    ...putShared(one),
    number: one.number ?? 0,
    played_at: one.played_at ?? ''
  })
}

// What a page needs to draw a resource it was handed by name

export type ResourceKind =
  | 'entries' | 'items' | 'places' | 'maps' | 'sessions'

export type FieldForm = 'text' | 'number' | 'choice' | 'flag'

export interface ResourceField {
  key: string
  label: string
  form: FieldForm
  choices?: readonly string[]
}

export interface ResourceShape {
  /** The kind it is stored as, which is the old name for places. */
  part: string
  one: string
  many: string
  /** The name as it reads inside a sentence. */
  word: string
  words: string
  fields: readonly ResourceField[]
  /** The one fact that tells this type apart, written on the card wherever it is drawn. */
  mark: (one: Resource) => string
  /** The page a new one opens with, written as markdown the block editor parses. */
  example: string
  /** Starts kept from the campaign it is written in, locked to its table until its owner shares it. */
  locks?: boolean
}

const EXAMPLES: Record<ResourceKind, string> = {
  entries: `## What this is

A note, a rumour, a scrap of lore. Write it however it is useful.

> "The old road is closed. Nobody says why."

- Where it came from
- Who repeats it
- What it would cost to check`,

  items: `## What it is

The plain description, before anyone identifies it.

## What it does

- The effect, written the way it is read at the table
- What it costs to use

## Where it came from

> Found in the silt under Duskin Keep.`,

  places: `## What you see

The first thing a traveller notices coming in.

## Who is here

- The one who speaks for the place
- The one who will not

## What is going on

The trouble under the surface.

## If the party digs

> Something they were not meant to find.`,

  maps: `## What it charts

The ground this map covers, and the edge where it stops.

## Marks on it

- What the pins mean
- What is drawn wrong on purpose

## Who made it

And why it should not be trusted.`,

  sessions: `## What happened

The run of play, in the order it happened.

## Decisions

- What the party chose
- What it cost

## Left open

Threads to pick up next time.

## Loot`
}

export const RESOURCES: Record<ResourceKind, ResourceShape> = {
  entries: { part: 'entries', one: 'Entry', many: 'Lore', word: 'entry', words: 'entries', fields: [], mark: () => '', example: EXAMPLES.entries },
  items: {
    part: 'items',
    one: 'Item',
    many: 'Items',
    word: 'item',
    words: 'items',
    fields: [
      { key: 'subtype', label: 'Subtype', form: 'text' },
      { key: 'rarity', label: 'Rarity', form: 'choice', choices: ['common', 'uncommon', 'rare', 'very rare', 'legendary', 'artifact'] },
      { key: 'attunement', label: 'Requires attunement', form: 'flag' },
      { key: 'attuned_by', label: 'Attuned by', form: 'text' },
      { key: 'consumable', label: 'Consumable', form: 'flag' },
      { key: 'weight', label: 'Weight', form: 'number' },
      { key: 'value', label: 'Worth in gold', form: 'number' }
    ],
    mark: (one) => (one as Item).rarity,
    example: EXAMPLES.items,
    locks: true
  },
  places: {
    part: 'locations',
    one: 'Place',
    many: 'Places',
    word: 'place',
    words: 'places',
    fields: [
      { key: 'category', label: 'Kind', form: 'choice', choices: ['region', 'city', 'town', 'village', 'keep', 'tower', 'dungeon', 'cave', 'ruin', 'temple', 'inn'] },
      { key: 'map_id', label: 'On the map', form: 'text' }
    ],
    mark: (one) => (one as Place).category,
    example: EXAMPLES.places
  },
  maps: { part: 'maps', one: 'Map', many: 'Maps', word: 'map', words: 'maps', fields: [], mark: () => '', example: EXAMPLES.maps },
  sessions: {
    part: 'sessions',
    one: 'Session',
    many: 'Sessions',
    word: 'session',
    words: 'sessions',
    fields: [
      { key: 'number', label: 'Number', form: 'number' },
      { key: 'played_at', label: 'Played on', form: 'text' }
    ],
    mark: (one) => `Session ${(one as Session).number}`,
    example: EXAMPLES.sessions
  }
}

/** The choices a kind's field offers, the one list its form and its filters read. */
export function getChoices(kind: ResourceKind, key: string): readonly string[] {
  return RESOURCES[kind].fields.find((field) => field.key === key)?.choices ?? []
}

export function isResourceKind(value: string | undefined): value is ResourceKind {
  return Boolean(value && value in RESOURCES)
}

/** A fresh resource of a kind, owned by whoever is writing it, opened on the kind's example page. */
export function getBlank(kind: ResourceKind, userId: string): Record<string, unknown> & Resource {
  return {
    ...(kind === 'items' ? { ...ITEM, grants: getItemGrants({}), properties: {} } : {}),
    id: '',
    title: '',
    description: '',
    tags: [],
    facts: [],
    images: [],
    image: '',
    frame: '',
    content: RESOURCES[kind].example,
    parent_id: '',
    group: false,
    group_id: '',
    user_id: userId,
    owner_id: '',
    share_campaigns: [],
    share_users: [],
    created_at: null
  }
}

/** Reads whichever resource the address named. */
export async function getAll(owner: Owner, kind: ResourceKind, groups = false): Promise<Resource[]> {
  const all = await getEvery(owner, kind)
  return all.filter((one) => one.group === groups)
}

export function getEvery(owner: Owner, kind: ResourceKind): Promise<Resource[]> {
  if (kind === 'entries') return getEntries(owner)
  if (kind === 'items') return getItems(owner)
  if (kind === 'places') return getPlaces(owner)
  if (kind === 'maps') return getCharts(owner)
  return getSessions(owner)
}

export function postOne(owner: Owner, kind: ResourceKind, one: Record<string, unknown>): Promise<string> {
  if (kind === 'entries') return postEntry(owner, one)
  if (kind === 'items') return postItem(owner, one)
  if (kind === 'places') return postPlace(owner, one)
  if (kind === 'maps') return postChart(owner, one)
  return postSession(owner, one)
}

export function putOne(
  owner: Owner,
  kind: ResourceKind,
  id: string,
  one: Record<string, unknown>
): Promise<void> {
  if (kind === 'entries') return putEntry(owner, id, one)
  if (kind === 'items') return putItem(owner, id, one)
  if (kind === 'places') return putPlace(owner, id, one)
  if (kind === 'maps') return putChart(owner, id, one)
  return putSession(owner, id, one)
}

/**
 * Removes a resource with everything that hangs off it: the shared document it is
 * written in and the stored pictures it carries. The updates go first, because the
 * rule that lets them go reads the resource they sit under.
 */
export async function deleteOne(owner: Owner, kind: ResourceKind, one: Resource): Promise<void> {
  const part = RESOURCES[kind].part
  await dropDoc(owner, part, one.id)
  await Promise.all([...new Set([one.image, ...one.images])].filter(isStoredFile).map((address) => deleteFile(address)))
  await deleteResource(one.id)
}

/** Removes every resource of every kind the owner holds that userId wrote, which a campaign does before it is deleted. */
export async function deleteResources(owner: Owner, userId: string): Promise<number> {
  const kinds = Object.keys(RESOURCES) as ResourceKind[]
  const rolls = await Promise.all(kinds.map((kind) => getEvery(owner, kind)))
  const held = kinds.flatMap((kind, index) =>
    rolls[index].filter((one) => one.user_id === userId).map((one) => ({ kind, one }))
  )

  await Promise.all(held.map((entry) => deleteOne(owner, entry.kind, entry.one)))
  return held.length
}

export function getChildren(all: Resource[], parentId: string): Resource[] {
  return all.filter((one) => one.parent_id === parentId)
}

export function getRoots(all: Resource[]): Resource[] {
  return all.filter((one) => !one.parent_id || !all.some((other) => other.id === one.parent_id))
}

/** Walks a page up to its root so a breadcrumb can be drawn. */
export function getTrail(all: Resource[], id: string): Resource[] {
  const walk: Resource[] = []
  let step = all.find((one) => one.id === id) ?? null

  while (step && !walk.some((one) => one.id === step!.id)) {
    const here: Resource = step
    walk.unshift(here)
    step = all.find((one) => one.id === here.parent_id) ?? null
  }

  return walk
}
