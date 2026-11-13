export * from './generated'
export type { SamnaUser } from './generated_auth'

import type * as generated from './generated'
import type { Character as CharacterSheet } from '../character.types'
import type { ComponentState, InstalledComponent, Rulings, VehicleOverlay } from '../rules/vehicle.types'
import type { MonsterStats } from '../rules/monster.types'
import type { MapDocument } from '../nimap'

export interface ReturnObject<T> {
  count: number
  data: T
  error?: ReturnError
}

export interface ReturnError {
  message: string
}

export interface Profile extends Omit<generated.Profile, 'preferences'> {
  preferences: UserPreferences
}

export interface UserPreferences {
  theme: string
  sound_enabled: boolean
  sound_volume: number
  animations_enabled: boolean
  recent_characters: string[]
  active_characters?: Record<string, string>
  shortcuts?: Shortcut[]
}

export interface Shortcut {
  action: string
  key: string
}

export interface Access extends generated.Share {
  owner_id: string
}

export interface Owner {
  at: 'campaign' | 'user'
  id: string
}

export interface Campaign extends Omit<generated.Campaign, 'settings'> {
  settings: CampaignSettings
}

export interface CampaignSettings {
  allow_character_editing: boolean
  share_character_sheets: boolean
  private_notes: boolean
  experience_mode: 'individual' | 'milestone' | 'shared'
}

export interface Character extends Omit<generated.Character, 'character' | 'metadata'> {
  character: CharacterSheet
  metadata: CharacterMetadata
}

export type CharacterStatus = 'draft' | 'ready'

export interface CharacterMetadata {
  name: string
  level: number
  class: string
  race: string
  status?: CharacterStatus
  created_at: string
  updated_at: string
  last_played_at?: string
  version: string
  tags: string[]
  is_template: boolean
  is_public: boolean
  layout?: Record<string, { x: number; y: number; w: number; h: number }>
}

export type MapMarkerKind =
  | 'region'
  | 'city'
  | 'town'
  | 'keep'
  | 'dungeon'
  | 'inn'
  | 'temple'
  | 'npc'
  | 'danger'
  | 'treasure'
  | 'note'
  | 'village'
  | 'ruin'
  | 'cave'
  | 'tower'
  | 'shrine'
  | 'camp'
  | 'harbour'
  | 'bridge'
  | 'forest'
  | 'mountain'
  | 'swamp'
  | 'lake'
  | 'road'
  | 'portal'
  | 'battle'
  | 'grave'
  | 'market'
  | 'forge'

export interface MapMarker {
  id: string
  title: string
  description?: string
  kind: MapMarkerKind
  x: number
  y: number
  is_visible: boolean
  min_zoom: number
  max_zoom: number
  link_map_id?: string
  record_kind?: CampaignRecordKind
  record_id?: string
}

export interface MapLayer {
  id: string
  title: string
  image_url: string
  min_zoom: number
  max_zoom: number
  x?: number
  y?: number
  width?: number
  height?: number
}

export interface CampaignMap extends Omit<generated.CampaignMap, 'layers' | 'markers' | 'plan'> {
  layers: MapLayer[]
  markers: MapMarker[]
  plan?: MapDocument | null
}

export type CampaignRecordKind = 'place' | 'character' | 'item' | 'session'

export type ChatKind = 'message' | 'roll'

export type CardKind = '' | 'item_card' | 'npc_card'

export interface ChatEntry extends Omit<generated.ChatEntry, 'kind' | 'card_kind' | 'dice'> {
  kind: ChatKind
  card_kind?: CardKind
  dice: number[]
}

export type CombatantKind = 'character' | 'npc'

export interface EncounterCombatant {
  id: string
  name: string
  kind: CombatantKind
  character_id?: string
  modifier: number
  initiative: number
  hit_points: number
  max_hit_points: number
  conditions: string[]
  is_hit_points_known: boolean
}

export interface Encounter extends Omit<generated.Encounter, 'combatants'> {
  combatants: EncounterCombatant[]
}

export interface Vehicle
  extends Omit<
    generated.Vehicle,
    'campaign_id' | 'components' | 'states' | 'stats' | 'rulings' | 'overlay' | 'crew' | 'history'
  > {
  campaign_id: string | null
  components: InstalledComponent[]
  states: Record<string, ComponentState>
  stats: Record<string, unknown>
  rulings: Rulings
  overlay: VehicleOverlay
  crew: VehicleCrewman[]
  history: VehicleRevision[]
}

export interface VehicleCrewman {
  character_id: string
  user_id: string
  role: string
}

export interface VehicleRevision {
  revision: number
  at: string
  user_id: string
  note: string
  components: InstalledComponent[]
}

export type VehicleFields = Partial<Omit<Vehicle, 'id' | 'owner_id' | 'history' | 'created_at' | 'updated_at'>> & {
  note?: string
}

export interface Monster extends Omit<generated.Monster, 'stats'> {
  stats: MonsterStats
}

export type MonsterFields = Partial<Omit<Monster, 'id' | 'owner_id' | 'created_at' | 'updated_at'>>
