import { ApiError, deleteApi, getApi, getQuery, getSessionId, getStream, postApi, putApi } from './api';
import { deleteFile, isDeadFile, isStoredFile } from './storage.service';
import type {
  UserProfile,
  Campaign,
  CampaignChatEntry,
  CampaignEncounter,
  CampaignMap,
  CharacterDocument,
  CharacterMetadata,
  CharacterStatus,
  UserPreferences,
  Owner,
  Song,
  Vehicle,
  VehicleFields
} from './firestore.types';
import { COLLECTIONS } from './firestore.types';
import type { Character } from './character.types';

export type Unsubscribe = () => void;

type CampaignRecord = { id: string };

function getAbsent<T>(error: unknown, absent: T): T {
  if (error instanceof ApiError && (error.status === 404 || error.status === 403)) return absent;
  throw error;
}

function getPartPath(owner: Owner, part: string, id?: string): string {
  if (part === COLLECTIONS.SONGS) return `/campaign/${owner.id}/song${id ? `/${id}` : ''}`;
  if (part === COLLECTIONS.ENCOUNTERS) return `/campaign/${owner.id}/encounter${id ? `/${id}` : ''}`;
  return id ? `/resource/${id}` : '/resource';
}

function getOwnerQuery(owner: Owner, part: string): string {
  if (part === COLLECTIONS.SONGS || part === COLLECTIONS.ENCOUNTERS) return '';
  return getQuery(
    owner.at === COLLECTIONS.CAMPAIGNS ? { kind: part, campaign_id: owner.id } : { kind: part, user_id: owner.id }
  );
}

// User Profile Operations
export const userService = {
  async createProfile(userData: Partial<UserProfile>): Promise<void> {
    await postApi('/profile', {
      email: userData.email || '',
      display_name: userData.display_name || '',
      photo_url: userData.photo_url || ''
    });
  },

  async getProfile(userId?: string): Promise<UserProfile | null> {
    const path = userId && userId !== getSessionId() ? `/profile/${userId}` : '/profile';
    return getApi<UserProfile>(path).catch((error) => getAbsent(error, null));
  },

  async updateProfile(updates: Partial<UserProfile>): Promise<void> {
    await putApi('/profile', updates);
  },

  async putRecentCharacters(recent: string[]): Promise<void> {
    const profile = await this.getProfile();
    await putApi('/profile', { preferences: { ...(profile?.preferences ?? {}), recent_characters: recent } });
  },

  async updatePreferences(preferences: Partial<UserPreferences>): Promise<void> {
    await putApi('/profile', { preferences });
  },

  subscribeToProfile(callback: (profile: UserProfile | null) => void): Unsubscribe {
    return getStream('/profile/stream', 'profile', () => this.getProfile(), callback, () => callback(null));
  },

  async setUserDetails(_userId: string, details: Record<string, unknown>): Promise<void> {
    await putApi('/profile/details', details);
  },

  async getProfileEmail(email: string): Promise<UserProfile | null> {
    const found = await getApi<UserProfile[]>(`/profile/list${getQuery({ email: email.trim().toLowerCase() })}`);
    return found[0] ?? null;
  },

  async getProfiles(userIds: string[]): Promise<UserProfile[]> {
    const unique = Array.from(new Set(userIds)).filter(Boolean);
    if (unique.length === 0) return [];
    return getApi<UserProfile[]>(`/profile/list${getQuery({ ids: unique.join(',') })}`);
  },

  async postFriend(email: string): Promise<UserProfile> {
    return postApi<UserProfile>('/profile/friend', { email });
  },

  async deleteFriend(friendId: string): Promise<void> {
    await deleteApi(`/profile/friend/${friendId}`);
  },

  async putUserSecrets(secrets: Record<string, string>): Promise<void> {
    await putApi('/profile/details', secrets);
  },

  async getUserDetails(_userId?: string): Promise<any> {
    return getApi<Record<string, unknown>>('/profile/details').catch((error) => getAbsent(error, null));
  }
};

function deleteDeadPortrait(document: CharacterDocument): void {
  const info = document.character?.info;
  if (!info?.imageUrl || !isDeadFile(info.imageUrl)) return;

  info.imageUrl = '';
  putApi(`/character/${document.id}`, { character: document.character }).catch(() => undefined);
}

export function getCharacterStatus(character: Character): CharacterStatus {
  const info = character?.info;
  const named = Boolean(info?.name?.trim());
  const classed = Boolean(info?.class?.name) && info.class.name !== 'Unknown';
  const raced = Boolean(info?.race?.name) && info.race.name !== 'Unknown';

  return named && classed && raced ? 'ready' : 'draft';
}

export type DerivedMetadata = Pick<CharacterMetadata, 'name' | 'level' | 'class' | 'race' | 'status'>;

export function getCharacterMetadata(character: Character): DerivedMetadata {
  const info = character?.info;

  return {
    name: info?.name?.trim() || 'Unnamed Character',
    level: info?.level || 1,
    class: info?.class?.name || 'Unknown',
    race: info?.race?.name || 'Unknown',
    status: getCharacterStatus(character)
  };
}

// Character Operations
export const characterService = {
  async createCharacter(
    character: Character,
    metadata?: Partial<CharacterDocument['metadata']>,
    campaignId?: string
  ): Promise<string> {
    const created = await postApi<CharacterDocument>('/character', {
      character,
      campaign_id: campaignId || undefined,
      metadata: {
        ...getCharacterMetadata(character),
        version: '1.0.0',
        tags: [],
        is_template: false,
        is_public: false,
        ...metadata
      }
    });
    return created.id;
  },

  async getCharacter(characterId: string): Promise<CharacterDocument | null> {
    const document = await getApi<CharacterDocument>(`/character/${characterId}`).catch((error) => getAbsent(error, null));
    if (!document) return null;

    deleteDeadPortrait(document);
    return document;
  },

  subscribeToCharacter(characterId: string, onChange: (character: CharacterDocument | null) => void): Unsubscribe {
    return getStream(`/character/${characterId}/stream`, 'character', () => this.getCharacter(characterId), onChange, (error) => console.error('Character did not load:', error));
  },

  async putPlayed(characterId: string): Promise<void> {
    await putApi(`/character/${characterId}/played`);
  },

  async updateCharacter(characterId: string, character: Character): Promise<void> {
    await putApi(`/character/${characterId}`, { character, metadata: getCharacterMetadata(character) });
  },

  async postCharacterCopy(characterId: string): Promise<string> {
    const document = await this.getCharacter(characterId);
    if (!document) throw new Error('That character is gone, so there is nothing to copy.');

    const character: Character = {
      ...document.character,
      info: { ...document.character.info, name: `${document.character.info.name} (copy)` }
    };

    const copyId = await this.createCharacter(
      character,
      { tags: document.metadata.tags ?? [], is_template: false },
      document.campaign_id
    );

    if (document.owner_id !== getSessionId()) return copyId;

    const sources = await this.getCharacterSources(characterId);
    if (sources.length > 0) await this.setCharacterSources(copyId, sources);

    return copyId;
  },

  async deleteCharacter(characterId: string): Promise<void> {
    await deleteApi(`/character/${characterId}`);
  },

  async getUserCharacters(userId?: string): Promise<CharacterDocument[]> {
    const found = await getApi<CharacterDocument[]>(`/character${getQuery({ user_id: userId })}`);

    for (const document of found) {
      deleteDeadPortrait(document);

      const derived = getCharacterMetadata(document.character);
      const stale = (Object.keys(derived) as (keyof DerivedMetadata)[]).some(
        (key) => document.metadata[key] !== derived[key]
      );
      if (!stale) continue;

      document.metadata = { ...document.metadata, ...derived };
      putApi(`/character/${document.id}`, { metadata: derived }).catch(() => undefined);
    }

    return found;
  },

  async setCharacterSources(characterId: string, sources: string[]): Promise<void> {
    await putApi(`/character/${characterId}/sources`, { sources });
  },

  async getCharacterSources(characterId: string): Promise<string[]> {
    return getApi<string[]>(`/character/${characterId}/sources`).catch((error) => getAbsent(error, []));
  }
};

export const vehicleService = {
  async getVehicles(campaignId?: string): Promise<Vehicle[]> {
    return getApi<Vehicle[]>(`/vehicle${getQuery({ campaign_id: campaignId })}`);
  },

  async getVehicle(vehicleId: string): Promise<Vehicle | null> {
    return getApi<Vehicle>(`/vehicle/${vehicleId}`).catch((error) => getAbsent(error, null));
  },

  subscribeToVehicle(vehicleId: string, onChange: (vehicle: Vehicle | null) => void): Unsubscribe {
    return getStream(`/vehicle/${vehicleId}/stream`, 'vehicle', () => this.getVehicle(vehicleId), onChange, (error) => console.error('Vehicle did not load:', error));
  },

  postVehiclesListener(campaignId: string, onChange: (vehicles: Vehicle[]) => void): Unsubscribe {
    return getStream(`/campaign/${campaignId}/stream`, 'vehicle', () => this.getVehicles(campaignId), onChange, (error) => console.error('Campaign vehicles did not load:', error));
  },

  async postVehicle(fields: VehicleFields): Promise<Vehicle> {
    return postApi<Vehicle>('/vehicle', fields);
  },

  async putVehicle(vehicleId: string, updates: VehicleFields): Promise<Vehicle> {
    return putApi<Vehicle>(`/vehicle/${vehicleId}`, updates);
  },

  async deleteVehicle(vehicleId: string): Promise<void> {
    await deleteApi(`/vehicle/${vehicleId}`);
  }
};

// Campaign Operations
export const campaignService = {
  async createCampaign(campaignData: Omit<Campaign, 'id' | 'created_at' | 'updated_at'>): Promise<string> {
    const created = await postApi<Campaign>('/campaign', {
      name: campaignData.name,
      description: campaignData.description,
      is_active: campaignData.is_active,
      settings: campaignData.settings
    });
    return created.id;
  },

  async getCampaign(campaignId: string): Promise<Campaign | null> {
    return getApi<Campaign>(`/campaign/${campaignId}`).catch((error) => getAbsent(error, null));
  },

  async putCampaign(campaignId: string, updates: Partial<Campaign>): Promise<void> {
    await putApi(`/campaign/${campaignId}`, updates);
  },

  async deleteCampaign(campaignId: string): Promise<void> {
    const self = getSessionId();
    const [maps, songs] = await Promise.all([
      this.getMaps(campaignId),
      getApi<Song[]>(`/campaign/${campaignId}/song`).catch(() => [] as Song[])
    ]);

    const addresses = [
      ...maps.flatMap((map) => [map.image_url, ...map.layers.map((layer) => layer.image_url)]),
      ...songs.filter((song) => song.owner_id === self).map((song) => song.address)
    ].filter(isStoredFile);

    await Promise.all(addresses.map((address) => deleteFile(address)));
    await deleteApi(`/campaign/${campaignId}`);
  },

  async postCampaignPlayer(campaignId: string, email: string): Promise<UserProfile> {
    return postApi<UserProfile>(`/campaign/${campaignId}/player`, { email });
  },

  async deleteCampaignPlayer(campaignId: string, playerId: string): Promise<void> {
    await deleteApi(`/campaign/${campaignId}/player/${playerId}`);
  },

  async postCampaignCharacter(campaignId: string, characterId: string): Promise<void> {
    await postApi(`/campaign/${campaignId}/character/${characterId}`);
  },

  async deleteCampaignCharacter(campaignId: string, characterId: string): Promise<void> {
    await deleteApi(`/campaign/${campaignId}/character/${characterId}`);
  },

  async getCampaignCharacters(campaignId: string): Promise<CharacterDocument[]> {
    return getApi<CharacterDocument[]>(`/campaign/${campaignId}/character`);
  },

  postCharactersListener(campaignId: string, onChange: (characters: CharacterDocument[]) => void): Unsubscribe {
    return getStream(`/campaign/${campaignId}/stream`, 'character', () => this.getCampaignCharacters(campaignId), onChange, (error) => console.error('Campaign characters did not load:', error));
  },

  async getMaps(campaignId: string): Promise<CampaignMap[]> {
    return getApi<CampaignMap[]>(`/campaign/${campaignId}/map`);
  },

  async postMap(campaignId: string, map: Pick<CampaignMap, 'title' | 'image_url'> & { parent_map_id?: string }): Promise<string> {
    const created = await postApi<CampaignMap>(`/campaign/${campaignId}/map`, {
      title: map.title,
      image_url: map.image_url,
      parent_map_id: map.parent_map_id || undefined,
      is_visible: false,
      min_zoom: 1,
      max_zoom: 8
    });
    return created.id;
  },

  async putMap(campaignId: string, mapId: string, updates: Partial<CampaignMap>): Promise<void> {
    await putApi(`/campaign/${campaignId}/map/${mapId}`, updates);
  },

  async deleteMap(campaignId: string, mapId: string): Promise<void> {
    await deleteApi(`/campaign/${campaignId}/map/${mapId}`);
  },

  postMapsListener(campaignId: string, onChange: (maps: CampaignMap[]) => void): Unsubscribe {
    return getStream(`/campaign/${campaignId}/stream`, 'map', () => this.getMaps(campaignId), onChange, (error) => console.error('Campaign maps did not load:', error));
  },

  postSongsListener(campaignId: string, onChange: (songs: Song[]) => void): Unsubscribe {
    return getStream(
      `/campaign/${campaignId}/stream`,
      'song',
      () => getApi<Song[]>(`/campaign/${campaignId}/song`),
      onChange,
      (error) => console.error('Campaign songs did not load:', error)
    );
  },

  async getPart<T extends CampaignRecord>(owner: Owner, part: string): Promise<T[]> {
    const entries = await getApi<T[]>(getPartPath(owner, part) + getOwnerQuery(owner, part));
    return entries.sort((a, b) =>
      String((a as Record<string, unknown>).title ?? (a as Record<string, unknown>).name ?? '').localeCompare(
        String((b as Record<string, unknown>).title ?? (b as Record<string, unknown>).name ?? '')
      )
    );
  },

  async postPart(owner: Owner, part: string, values: Record<string, unknown>): Promise<string> {
    const placed =
      part === COLLECTIONS.SONGS || part === COLLECTIONS.ENCOUNTERS
        ? values
        : { ...values, kind: part, campaign_id: owner.at === COLLECTIONS.CAMPAIGNS ? owner.id : undefined };
    const created = await postApi<CampaignRecord>(getPartPath(owner, part), placed);
    return created.id;
  },

  async putPart(owner: Owner, part: string, id: string, values: Record<string, unknown>): Promise<void> {
    await putApi(getPartPath(owner, part, id), values);
  },

  async deletePart(owner: Owner, part: string, id: string): Promise<void> {
    await deleteApi(getPartPath(owner, part, id));
  },

  async getEncounters(campaignId: string): Promise<CampaignEncounter[]> {
    return getApi<CampaignEncounter[]>(`/campaign/${campaignId}/encounter`);
  },

  async postEncounter(campaignId: string, encounter: Partial<CampaignEncounter>): Promise<string> {
    const created = await postApi<CampaignEncounter>(`/campaign/${campaignId}/encounter`, {
      title: encounter.title ?? 'Untitled encounter',
      combatants: encounter.combatants ?? [],
      round: encounter.round ?? 1,
      turn: encounter.turn ?? 0,
      is_active: encounter.is_active ?? false,
      share_campaigns: encounter.share_campaigns ?? [],
      share_users: encounter.share_users ?? []
    });
    return created.id;
  },

  async putEncounter(campaignId: string, id: string, updates: Partial<CampaignEncounter>): Promise<void> {
    await putApi(`/campaign/${campaignId}/encounter/${id}`, updates);
  },

  async deleteEncounter(campaignId: string, id: string): Promise<void> {
    await deleteApi(`/campaign/${campaignId}/encounter/${id}`);
  },

  postEncountersListener(
    campaignId: string,
    onChange: (encounters: CampaignEncounter[]) => void
  ): Unsubscribe {
    return getStream(
      `/campaign/${campaignId}/stream`,
      'encounter',
      () => this.getEncounters(campaignId),
      onChange,
      (error) => console.error('Campaign encounters did not load:', error)
    );
  },

  async postChatEntry(
    campaignId: string,
    entry: Omit<CampaignChatEntry, 'id' | 'created_at' | 'updated_at'>
  ): Promise<string> {
    const created = await postApi<CampaignChatEntry>(`/campaign/${campaignId}/chat`, entry);
    return created.id;
  },

  postChatListener(campaignId: string, onChange: (entries: CampaignChatEntry[]) => void): Unsubscribe {
    return getStream(
      `/campaign/${campaignId}/stream`,
      'chat',
      () => getApi<CampaignChatEntry[]>(`/campaign/${campaignId}/chat`),
      onChange,
      (error) => console.error('Campaign chat did not load:', error)
    );
  },

  async getUserCampaigns(): Promise<Campaign[]> {
    return getApi<Campaign[]>('/campaign');
  }
};
