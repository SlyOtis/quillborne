import type { Character } from './character.types';
import type { ComponentState, InstalledComponent, Rulings, VehicleOverlay } from './rules/vehicle.types';

// A player's profile
export interface UserProfile {
  uid: string;
  email: string;
  display_name: string;
  photo_url?: string;
  friends: string[];
  created_at: string;
  updated_at: string;
  preferences: UserPreferences;
}

// User preferences
export interface UserPreferences {
  theme: string;
  sound_enabled: boolean;
  sound_volume: number;
  animations_enabled: boolean;
  recent_characters: string[];
  shortcuts?: Shortcut[];
}

// An action the player pinned to the navigator, with the key that fires it or none.
export interface Shortcut {
  action: string;
  key: string;
}

export interface Song extends Access {
  id: string;
  title: string;
  address: string;
  duration: number;
  created_at: string;
  updated_at: string;
}

// What every shared document carries. The owner is the uid that made it.
export interface Access {
  owner_id: string;
  share_campaigns: string[];
  share_users: string[];
}

// A table of play
export interface Campaign {
  id: string;
  name: string;
  description: string;
  dm_id: string;
  player_ids: string[];
  character_ids: string[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
  settings: CampaignSettings;
}

export interface CampaignSettings {
  allow_character_editing: boolean;
  share_character_sheets: boolean;
  private_notes: boolean;
  experience_mode: 'individual' | 'milestone' | 'shared';
}

// A character with its summary
export interface CharacterDocument {
  id: string;
  owner_id: string;
  campaign_id?: string;
  character: Character;
  metadata: CharacterMetadata;
  permissions: CharacterPermissions;
}

export type CharacterStatus = 'draft' | 'ready';

export interface CharacterMetadata {
  name: string;
  level: number;
  class: string;
  race: string;
  status?: CharacterStatus;
  created_at: string;
  updated_at: string;
  last_played_at?: string;
  version: string;
  tags: string[];
  is_template: boolean;
  is_public: boolean;
}

export interface CharacterPermissions {
  viewers: string[];
  editors: string[];
  dm_override: boolean;
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
  | 'forge';

export interface MapMarker {
  id: string;
  title: string;
  description?: string;
  kind: MapMarkerKind;
  x: number;
  y: number;
  is_visible: boolean;
  min_zoom: number;
  max_zoom: number;
  link_map_id?: string;
  record_kind?: CampaignRecordKind;
  record_id?: string;
}

export interface MapLayer {
  id: string;
  title: string;
  image_url: string;
  min_zoom: number;
  max_zoom: number;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
}

export interface CampaignMap {
  id: string;
  title: string;
  image_url: string;
  layers: MapLayer[];
  markers: MapMarker[];
  is_visible: boolean;
  parent_map_id?: string;
  min_zoom: number;
  max_zoom: number;
  created_at: string;
  updated_at: string;
}

export type CampaignRecordKind = 'place' | 'npc' | 'item' | 'session';

export type CampaignChatKind = 'message' | 'roll';

export type CampaignCardKind = '' | 'item_card' | 'npc_card';

export interface CampaignChatEntry {
  id: string;
  author_id: string;
  author_name: string;
  kind: CampaignChatKind;
  body: string;
  query: string;
  is_hidden: boolean;
  card_kind?: CampaignCardKind;
  roll_kind: string;
  formula: string;
  dice: number[];
  roll: number;
  total: number;
  created_at: string;
  updated_at: string;
}

export type CombatantKind = 'character' | 'npc';

export interface EncounterCombatant {
  id: string;
  name: string;
  kind: CombatantKind;
  character_id?: string;
  npc_id?: string;
  modifier: number;
  initiative: number;
  hit_points: number;
  max_hit_points: number;
  conditions: string[];
  is_hit_points_known: boolean;
}

export interface CampaignEncounter extends Access {
  id: string;
  title: string;
  combatants: EncounterCombatant[];
  round: number;
  turn: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// A vehicle the table sails: its design, the state of each component, its crew and its history
export interface Vehicle {
  id: string;
  owner_id: string;
  campaign_id: string | null;
  name: string;
  system: string;
  template: string;
  template_version: number;
  layout: string;
  components: InstalledComponent[];
  states: Record<string, ComponentState>;
  stats: Record<string, unknown>;
  rulings: Rulings;
  overlay: VehicleOverlay;
  crew: VehicleCrewman[];
  revision: number;
  history: VehicleRevision[];
  created_at: string;
  updated_at: string;
}

export interface VehicleCrewman {
  character_id: string;
  user_id: string;
  role: string;
}

export interface VehicleRevision {
  revision: number;
  at: string;
  user_id: string;
  note: string;
  components: InstalledComponent[];
}

export type VehicleFields = Partial<Omit<Vehicle, 'id' | 'owner_id' | 'history' | 'created_at' | 'updated_at'>> & { note?: string };

// The places a record belongs to
export const COLLECTIONS = {
  USERS: 'users',
  CHARACTERS: 'characters',
  CAMPAIGNS: 'campaigns',
  CHAT: 'chat',
  MAPS: 'maps',
  ENCOUNTERS: 'encounters',
  SONGS: 'songs'
} as const;

export type CollectionName = typeof COLLECTIONS[keyof typeof COLLECTIONS];

// Who a resource belongs to. A campaign holds what the table shares, a user holds their own.
export interface Owner {
  at: typeof COLLECTIONS.CAMPAIGNS | typeof COLLECTIONS.USERS;
  id: string;
}
