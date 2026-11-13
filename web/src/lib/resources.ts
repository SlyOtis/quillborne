import { deleteFile, deleteResource, getResources, isStoredFile, postResource, putResource } from './api'
import type { Access, Owner } from './api/types'
import { dropDoc } from './collab'

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
  /** When it was written down, which is what orders a chronicle. */
  created_at: string | null
}

export type Rarity = 'common' | 'uncommon' | 'rare' | 'very rare' | 'legendary' | 'artifact'
export type DamageKind =
  | 'bludgeoning' | 'piercing' | 'slashing' | 'fire' | 'cold' | 'lightning' | 'necrotic' | 'radiant'
export type ArmorWeight = 'light' | 'medium' | 'heavy' | 'shield'
export type PlaceKind =
  | 'region' | 'city' | 'town' | 'village' | 'keep' | 'tower' | 'dungeon' | 'cave' | 'ruin' | 'temple' | 'inn'

/** A story entry or a note. */
export interface Entry extends Resource {}

/** Any object that is not a weapon or armor. */
export interface Item extends Resource {
  category: string
  rarity: Rarity
  attunement: boolean
  weight: number
  value: number
}

export interface Weapon extends Resource {
  damage: string
  damage_kind: DamageKind
  rarity: Rarity
  reach: number
  attunement: boolean
  weight: number
}

export interface Armor extends Resource {
  armor_class: number
  category: ArmorWeight
  rarity: Rarity
  stealth_penalty: boolean
  weight: number
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
    owner_id: one.owner_id ?? '',
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

export async function getItems(owner: Owner): Promise<Item[]> {
  const stored = await getResources<Stored>(owner, 'items')
  return stored.map((one) => ({
    ...getShared(one),
    category: String(one.category ?? ''),
    rarity: (one.rarity as Rarity) ?? 'common',
    attunement: Boolean(one.attunement),
    weight: Number(one.weight ?? 0),
    value: Number(one.value ?? 0)
  }))
}

export function postItem(owner: Owner, one: Partial<Item>): Promise<string> {
  return postResource(owner, 'items', {
    ...putShared(one),
    category: one.category ?? '',
    rarity: one.rarity ?? 'common',
    attunement: one.attunement ?? false,
    weight: one.weight ?? 0,
    value: one.value ?? 0
  })
}

export function putItem(owner: Owner, id: string, one: Partial<Item>): Promise<void> {
  return putResource(id, {
    ...putShared(one),
    category: one.category ?? '',
    rarity: one.rarity ?? 'common',
    attunement: one.attunement ?? false,
    weight: one.weight ?? 0,
    value: one.value ?? 0
  })
}

// Weapons

export async function getWeapons(owner: Owner): Promise<Weapon[]> {
  const stored = await getResources<Stored>(owner, 'weapons')
  return stored.map((one) => ({
    ...getShared(one),
    damage: String(one.damage ?? ''),
    damage_kind: (one.damage_kind as DamageKind) ?? 'slashing',
    rarity: (one.rarity as Rarity) ?? 'common',
    reach: Number(one.reach ?? 5),
    attunement: Boolean(one.attunement),
    weight: Number(one.weight ?? 0)
  }))
}

export function postWeapon(owner: Owner, one: Partial<Weapon>): Promise<string> {
  return postResource(owner, 'weapons', {
    ...putShared(one),
    damage: one.damage ?? '',
    damage_kind: one.damage_kind ?? 'slashing',
    rarity: one.rarity ?? 'common',
    reach: one.reach ?? 5,
    attunement: one.attunement ?? false,
    weight: one.weight ?? 0
  })
}

export function putWeapon(owner: Owner, id: string, one: Partial<Weapon>): Promise<void> {
  return putResource(id, {
    ...putShared(one),
    damage: one.damage ?? '',
    damage_kind: one.damage_kind ?? 'slashing',
    rarity: one.rarity ?? 'common',
    reach: one.reach ?? 5,
    attunement: one.attunement ?? false,
    weight: one.weight ?? 0
  })
}

// Armor

export async function getArmor(owner: Owner): Promise<Armor[]> {
  const stored = await getResources<Stored>(owner, 'armor')
  return stored.map((one) => ({
    ...getShared(one),
    armor_class: Number(one.armor_class ?? 10),
    category: (one.category as ArmorWeight) ?? 'light',
    rarity: (one.rarity as Rarity) ?? 'common',
    stealth_penalty: Boolean(one.stealth_penalty),
    weight: Number(one.weight ?? 0)
  }))
}

export function postArmor(owner: Owner, one: Partial<Armor>): Promise<string> {
  return postResource(owner, 'armor', {
    ...putShared(one),
    armor_class: one.armor_class ?? 10,
    category: one.category ?? 'light',
    rarity: one.rarity ?? 'common',
    stealth_penalty: one.stealth_penalty ?? false,
    weight: one.weight ?? 0
  })
}

export function putArmor(owner: Owner, id: string, one: Partial<Armor>): Promise<void> {
  return putResource(id, {
    ...putShared(one),
    armor_class: one.armor_class ?? 10,
    category: one.category ?? 'light',
    rarity: one.rarity ?? 'common',
    stealth_penalty: one.stealth_penalty ?? false,
    weight: one.weight ?? 0
  })
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
  | 'entries' | 'items' | 'weapons' | 'armor' | 'places' | 'maps' | 'sessions'

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

  weapons: `## What it is

How it looks and how it feels to hold.

## In a fight

- The attack, and what it does on a hit
- What it does on a critical
- What it will not do

## History

Who carried it before, and how they lost it.`,

  armor: `## What it is

The make of it, and what it is worth to look at.

## Wearing it

- What it turns aside
- What it makes harder
- How long it takes to get into

## History

The battle it came out of.`,

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
      { key: 'category', label: 'Kind', form: 'text' },
      { key: 'rarity', label: 'Rarity', form: 'choice', choices: ['common', 'uncommon', 'rare', 'very rare', 'legendary', 'artifact'] },
      { key: 'attunement', label: 'Needs attunement', form: 'flag' },
      { key: 'weight', label: 'Weight', form: 'number' },
      { key: 'value', label: 'Worth in gold', form: 'number' }
    ],
    mark: (one) => (one as Item).rarity,
    example: EXAMPLES.items
  },
  weapons: {
    part: 'weapons',
    one: 'Weapon',
    many: 'Weapons',
    word: 'weapon',
    words: 'weapons',
    fields: [
      { key: 'damage', label: 'Damage', form: 'text' },
      { key: 'damage_kind', label: 'Damage kind', form: 'choice', choices: ['bludgeoning', 'piercing', 'slashing', 'fire', 'cold', 'lightning', 'necrotic', 'radiant'] },
      { key: 'rarity', label: 'Rarity', form: 'choice', choices: ['common', 'uncommon', 'rare', 'very rare', 'legendary', 'artifact'] },
      { key: 'reach', label: 'Reach in feet', form: 'number' },
      { key: 'attunement', label: 'Needs attunement', form: 'flag' },
      { key: 'weight', label: 'Weight', form: 'number' }
    ],
    mark: (one) => (one as Weapon).damage,
    example: EXAMPLES.weapons
  },
  armor: {
    part: 'armor',
    one: 'Armor',
    many: 'Armor',
    word: 'armor',
    words: 'armor',
    fields: [
      { key: 'armor_class', label: 'Armor class', form: 'number' },
      { key: 'category', label: 'Weight class', form: 'choice', choices: ['light', 'medium', 'heavy', 'shield'] },
      { key: 'rarity', label: 'Rarity', form: 'choice', choices: ['common', 'uncommon', 'rare', 'very rare', 'legendary', 'artifact'] },
      { key: 'stealth_penalty', label: 'Hinders stealth', form: 'flag' },
      { key: 'weight', label: 'Weight', form: 'number' }
    ],
    mark: (one) => `AC ${(one as Armor).armor_class}`,
    example: EXAMPLES.armor
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

export function isResourceKind(value: string | undefined): value is ResourceKind {
  return Boolean(value && value in RESOURCES)
}

/** A fresh resource of a kind, owned by whoever is writing it, opened on the kind's example page. */
export function getBlank(kind: ResourceKind, ownerId: string): Record<string, unknown> & Resource {
  return {
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
    owner_id: ownerId,
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
  if (kind === 'weapons') return getWeapons(owner)
  if (kind === 'armor') return getArmor(owner)
  if (kind === 'places') return getPlaces(owner)
  if (kind === 'maps') return getCharts(owner)
  return getSessions(owner)
}

export function postOne(owner: Owner, kind: ResourceKind, one: Record<string, unknown>): Promise<string> {
  if (kind === 'entries') return postEntry(owner, one)
  if (kind === 'items') return postItem(owner, one)
  if (kind === 'weapons') return postWeapon(owner, one)
  if (kind === 'armor') return postArmor(owner, one)
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
  if (kind === 'weapons') return putWeapon(owner, id, one)
  if (kind === 'armor') return putArmor(owner, id, one)
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

/** Removes every resource of every kind the owner holds that ownerId wrote, which a campaign does before it is deleted. */
export async function deleteResources(owner: Owner, ownerId: string): Promise<number> {
  const kinds = Object.keys(RESOURCES) as ResourceKind[]
  const rolls = await Promise.all(kinds.map((kind) => getEvery(owner, kind)))
  const held = kinds.flatMap((kind, index) =>
    rolls[index].filter((one) => one.owner_id === ownerId).map((one) => ({ kind, one }))
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
