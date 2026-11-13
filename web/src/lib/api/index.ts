import { getColumns, getDocument, type Block, type MediaAsset, type MediaKind } from '../blocks'
import type { Character as CharacterSheet } from '../character.types'
import {
  ApiError,
  baseURL,
  getCsrfHeaders,
  getSession,
  getSessionId,
  getStream,
  path,
  putSession,
  request,
  unwrap
} from './core'
import type {
  Tag,
  Asset,
  Campaign,
  CampaignMap,
  Character,
  CharacterMetadata,
  CharacterStatus,
  ChatEntry,
  Encounter,
  Owner,
  Profile,
  ResourceUpdate,
  SamnaUser,
  Song,
  UserPreferences,
  Vehicle,
  VehicleFields
} from './types'

export { ApiError, baseURL, getCsrfHeaders, getSession, getSessionId, getStream, path }

export type Unsubscribe = () => void

type Row = { id: string }

const apiGet = <T>(url: string) => unwrap<T>(url)
const apiPost = <T = void>(url: string, data: unknown = {}) => unwrap<T>(url, { method: 'POST', body: data })
const apiPut = <T = void>(url: string, data: unknown = {}) => unwrap<T>(url, { method: 'PUT', body: data })
const apiDelete = async (url: string) => {
  await request(url, { method: 'DELETE' })
}

function getAbsent<T>(error: unknown, absent: T): T {
  if (error instanceof ApiError && (error.status === 404 || error.status === 403)) return absent
  throw error
}

export function redirectToLogin(): Promise<never> {
  const back = window.location.pathname + window.location.search
  window.location.assign(path('/api/auth/login', { next: back }))
  return new Promise<never>(() => undefined)
}

export function deleteSession(): void {
  putSession(null)
  window.location.assign('/api/auth/logout')
}

export function getUserName(user: SamnaUser): string {
  return [user.first_name, user.last_name].filter(Boolean).join(' ') || user.user_name || user.email || ''
}

export async function getMe(): Promise<SamnaUser | null> {
  const me = await apiGet<SamnaUser>('auth/me').catch((error) => {
    if (error instanceof ApiError && (error.status === 401 || error.status === 403)) return null
    throw error
  })
  const found = me?.user_id ? me : null
  putSession(found)
  if (found && !(await getProfile())) {
    await postProfile({ email: found.email, display_name: getUserName(found), photo_url: found.user_image ?? '' })
  }
  return found
}

export const postProfile = (fields: Pick<Profile, 'email' | 'display_name' | 'photo_url'>) => apiPost('profile', fields)

export function getProfile(userId?: string): Promise<Profile | null> {
  const url = userId && userId !== getSession()?.user_id ? `profile/${userId}` : 'profile'
  return apiGet<Profile>(url).catch((error) => getAbsent(error, null))
}

export const putProfile = (updates: Partial<Profile>) => apiPut('profile', updates)

export const putProfilePreferences = (preferences: Partial<UserPreferences>) => apiPut('profile', { preferences })

export async function putProfileRecentCharacters(recent: string[]): Promise<void> {
  const profile = await getProfile()
  await apiPut('profile', { preferences: { ...(profile?.preferences ?? {}), recent_characters: recent } })
}

export const getProfileStream = (onChange: (profile: Profile | null) => void): Unsubscribe =>
  getStream('profile/stream', 'profile', () => getProfile(), onChange, () => onChange(null))

export const getProfileDetails = () =>
  apiGet<Record<string, unknown>>('profile/details').catch((error) => getAbsent(error, null))

export const putProfileDetails = (details: Record<string, unknown>) => apiPut('profile/details', details)

export async function getProfileEmail(email: string): Promise<Profile | null> {
  const found = await apiGet<Profile[]>(path('profile/list', { email: email.trim().toLowerCase() }))
  return found[0] ?? null
}

export async function getProfiles(userIds: string[]): Promise<Profile[]> {
  const unique = Array.from(new Set(userIds)).filter(Boolean)
  if (unique.length === 0) return []
  return apiGet<Profile[]>(path('profile/list', { ids: unique.join(',') }))
}

export const postProfileFriend = (email: string) => apiPost<Profile>('profile/friend', { email })

export const deleteProfileFriend = (friendId: string) => apiDelete(`profile/friend/${friendId}`)

function deleteDeadPortrait(character: Character): void {
  const info = character.character?.info
  if (!info?.imageUrl || !isDeadFile(info.imageUrl)) return

  info.imageUrl = ''
  apiPut(`character/${character.id}`, { character: character.character }).catch(() => undefined)
}

export function getCharacterStatus(sheet: CharacterSheet): CharacterStatus {
  const info = sheet?.info
  const named = Boolean(info?.name?.trim())
  const classed = Boolean(info?.class?.name) && info.class.name !== 'Unknown'
  const raced = Boolean(info?.race?.name) && info.race.name !== 'Unknown'

  return named && classed && raced ? 'ready' : 'draft'
}

/** The tag that makes a character an NPC. */
export const NPC_TAG = 'npc'

export function isNpc(character: Character): boolean {
  return (character.metadata.tags ?? []).some((tag) => tag.toLowerCase() === NPC_TAG)
}

export type DerivedMetadata = Pick<CharacterMetadata, 'name' | 'level' | 'class' | 'race' | 'status'>

export function getCharacterMetadata(sheet: CharacterSheet): DerivedMetadata {
  const info = sheet?.info

  return {
    name: info?.name?.trim() || 'Unnamed Character',
    level: info?.level || 1,
    class: info?.class?.name || 'Unknown',
    race: info?.race?.name || 'Unknown',
    status: getCharacterStatus(sheet)
  }
}

export async function postCharacter(
  sheet: CharacterSheet,
  metadata?: Partial<CharacterMetadata>,
  campaignId?: string
): Promise<string> {
  const created = await apiPost<Character>('character', {
    character: sheet,
    campaign_id: campaignId || undefined,
    metadata: {
      ...getCharacterMetadata(sheet),
      version: '1.0.0',
      tags: [],
      is_template: false,
      is_public: false,
      ...metadata
    }
  })
  return created.id
}

export async function getCharacter(characterId: string): Promise<Character | null> {
  const character = await apiGet<Character>(`character/${characterId}`).catch((error) => getAbsent(error, null))
  if (!character) return null

  deleteDeadPortrait(character)
  return character
}

export const getCharacterStream = (characterId: string, onChange: (character: Character | null) => void): Unsubscribe =>
  getStream(`character/${characterId}/stream`, 'character', () => getCharacter(characterId), onChange, (error) =>
    console.error('Character did not load:', error)
  )

export const putCharacterPlayed = (characterId: string) => apiPut(`character/${characterId}/played`)

export const putCharacterLayout = (characterId: string, layout: CharacterMetadata['layout']) =>
  apiPut(`character/${characterId}`, { metadata: { layout } })

export const putCharacter = (characterId: string, sheet: CharacterSheet) =>
  apiPut(`character/${characterId}`, { character: sheet, metadata: getCharacterMetadata(sheet) })

export async function postCharacterCopy(characterId: string): Promise<string> {
  const held = await getCharacter(characterId)
  if (!held) throw new Error('That character is gone, so there is nothing to copy.')

  const sheet: CharacterSheet = {
    ...held.character,
    info: { ...held.character.info, name: `${held.character.info.name} (copy)` }
  }

  const copyId = await postCharacter(sheet, { tags: held.metadata.tags ?? [], is_template: false }, held.campaign_id)

  if (held.owner_id !== getSessionId()) return copyId

  const sources = await getCharacterSources(characterId)
  if (sources.length > 0) await putCharacterSources(copyId, sources)

  return copyId
}

export const deleteCharacter = (characterId: string) => apiDelete(`character/${characterId}`)

export async function getCharacters(userId?: string): Promise<Character[]> {
  const found = await apiGet<Character[]>(path('character', { user_id: userId }))

  for (const character of found) {
    deleteDeadPortrait(character)

    const derived = getCharacterMetadata(character.character)
    const stale = (Object.keys(derived) as (keyof DerivedMetadata)[]).some((key) => character.metadata[key] !== derived[key])
    if (!stale) continue

    character.metadata = { ...character.metadata, ...derived }
    apiPut(`character/${character.id}`, { metadata: derived }).catch(() => undefined)
  }

  return found
}

export const putCharacterSources = (characterId: string, sources: string[]) =>
  apiPut(`character/${characterId}/sources`, { sources })

export const getCharacterSources = (characterId: string) =>
  apiGet<string[]>(`character/${characterId}/sources`).catch((error) => getAbsent(error, [] as string[]))

export const getVehicles = (campaignId?: string) => apiGet<Vehicle[]>(path('vehicle', { campaign_id: campaignId }))

export const getVehicle = (vehicleId: string) =>
  apiGet<Vehicle>(`vehicle/${vehicleId}`).catch((error) => getAbsent(error, null))

export const getVehicleStream = (vehicleId: string, onChange: (vehicle: Vehicle | null) => void): Unsubscribe =>
  getStream(`vehicle/${vehicleId}/stream`, 'vehicle', () => getVehicle(vehicleId), onChange, (error) =>
    console.error('Vehicle did not load:', error)
  )

export const getCampaignVehiclesStream = (campaignId: string, onChange: (vehicles: Vehicle[]) => void): Unsubscribe =>
  getStream(`campaign/${campaignId}/stream`, 'vehicle', () => getVehicles(campaignId), onChange, (error) =>
    console.error('Campaign vehicles did not load:', error)
  )

export const postVehicle = (fields: VehicleFields) => apiPost<Vehicle>('vehicle', fields)

export const putVehicle = (vehicleId: string, updates: VehicleFields) => apiPut<Vehicle>(`vehicle/${vehicleId}`, updates)

export const deleteVehicle = (vehicleId: string) => apiDelete(`vehicle/${vehicleId}`)

export async function postCampaign(fields: Omit<Campaign, 'id' | 'created_at' | 'updated_at'>): Promise<string> {
  const created = await apiPost<Campaign>('campaign', {
    name: fields.name,
    description: fields.description,
    is_active: fields.is_active,
    settings: fields.settings
  })
  return created.id
}

export const getCampaign = (campaignId: string) =>
  apiGet<Campaign>(`campaign/${campaignId}`).catch((error) => getAbsent(error, null))

export const getCampaigns = () => apiGet<Campaign[]>('campaign')

export const putCampaign = (campaignId: string, updates: Partial<Campaign>) => apiPut(`campaign/${campaignId}`, updates)

export async function deleteCampaign(campaignId: string): Promise<void> {
  const self = getSessionId()
  const [maps, songs] = await Promise.all([getCampaignMaps(campaignId), getCampaignSongs(campaignId).catch(() => [] as Song[])])

  const addresses = [
    ...maps.flatMap((map) => [map.image_url, ...map.layers.map((layer) => layer.image_url)]),
    ...songs.filter((song) => song.owner_id === self).map((song) => song.address)
  ].filter(isStoredFile)

  await Promise.all(addresses.map((address) => deleteFile(address)))
  await apiDelete(`campaign/${campaignId}`)
}

export const postCampaignPlayer = (campaignId: string, email: string) =>
  apiPost<Profile>(`campaign/${campaignId}/player`, { email })

export const deleteCampaignPlayer = (campaignId: string, playerId: string) =>
  apiDelete(`campaign/${campaignId}/player/${playerId}`)

export const postCampaignCharacter = (campaignId: string, characterId: string) =>
  apiPost(`campaign/${campaignId}/character/${characterId}`)

export const deleteCampaignCharacter = (campaignId: string, characterId: string) =>
  apiDelete(`campaign/${campaignId}/character/${characterId}`)

export const getCampaignCharacters = (campaignId: string) => apiGet<Character[]>(`campaign/${campaignId}/character`)

export const getCampaignCharactersStream = (campaignId: string, onChange: (characters: Character[]) => void): Unsubscribe =>
  getStream(`campaign/${campaignId}/stream`, 'character', () => getCampaignCharacters(campaignId), onChange, (error) =>
    console.error('Campaign characters did not load:', error)
  )

export const getCampaignMaps = (campaignId: string) => apiGet<CampaignMap[]>(`campaign/${campaignId}/map`)

export async function postCampaignMap(
  campaignId: string,
  map: Pick<CampaignMap, 'title' | 'image_url'> & { parent_map_id?: string }
): Promise<string> {
  const created = await apiPost<CampaignMap>(`campaign/${campaignId}/map`, {
    title: map.title,
    image_url: map.image_url,
    parent_map_id: map.parent_map_id || undefined,
    is_visible: false,
    min_zoom: 1,
    max_zoom: 8
  })
  return created.id
}

export const putCampaignMap = (campaignId: string, mapId: string, updates: Partial<CampaignMap>) =>
  apiPut(`campaign/${campaignId}/map/${mapId}`, updates)

export const deleteCampaignMap = (campaignId: string, mapId: string) => apiDelete(`campaign/${campaignId}/map/${mapId}`)

export const getCampaignMapsStream = (campaignId: string, onChange: (maps: CampaignMap[]) => void): Unsubscribe =>
  getStream(`campaign/${campaignId}/stream`, 'map', () => getCampaignMaps(campaignId), onChange, (error) =>
    console.error('Campaign maps did not load:', error)
  )

export const getCampaignSongs = (campaignId: string) => apiGet<Song[]>(`campaign/${campaignId}/song`)

export const postCampaignSong = async (campaignId: string, song: Partial<Song>): Promise<string> =>
  (await apiPost<Row>(`campaign/${campaignId}/song`, song)).id

export const getCampaignSongsStream = (campaignId: string, onChange: (songs: Song[]) => void): Unsubscribe =>
  getStream(`campaign/${campaignId}/stream`, 'song', () => getCampaignSongs(campaignId), onChange, (error) =>
    console.error('Campaign songs did not load:', error)
  )

export const getCampaignEncounters = (campaignId: string) => apiGet<Encounter[]>(`campaign/${campaignId}/encounter`)

export async function postCampaignEncounter(campaignId: string, encounter: Partial<Encounter>): Promise<string> {
  const created = await apiPost<Encounter>(`campaign/${campaignId}/encounter`, {
    title: encounter.title ?? 'Untitled encounter',
    combatants: encounter.combatants ?? [],
    round: encounter.round ?? 1,
    turn: encounter.turn ?? 0,
    is_active: encounter.is_active ?? false,
    share_campaigns: encounter.share_campaigns ?? [],
    share_users: encounter.share_users ?? []
  })
  return created.id
}

export const putCampaignEncounter = (campaignId: string, id: string, updates: Partial<Encounter>) =>
  apiPut(`campaign/${campaignId}/encounter/${id}`, updates)

export const deleteCampaignEncounter = (campaignId: string, id: string) =>
  apiDelete(`campaign/${campaignId}/encounter/${id}`)

export const getCampaignEncountersStream = (campaignId: string, onChange: (encounters: Encounter[]) => void): Unsubscribe =>
  getStream(`campaign/${campaignId}/stream`, 'encounter', () => getCampaignEncounters(campaignId), onChange, (error) =>
    console.error('Campaign encounters did not load:', error)
  )

export const getCampaignChat = (campaignId: string) => apiGet<ChatEntry[]>(`campaign/${campaignId}/chat`)

export async function postCampaignChat(
  campaignId: string,
  entry: Omit<ChatEntry, 'id' | 'campaign_id' | 'created_at' | 'updated_at'>
): Promise<string> {
  const created = await apiPost<ChatEntry>(`campaign/${campaignId}/chat`, entry)
  return created.id
}

export const getCampaignChatStream = (campaignId: string, onChange: (entries: ChatEntry[]) => void): Unsubscribe =>
  getStream(`campaign/${campaignId}/stream`, 'chat', () => getCampaignChat(campaignId), onChange, (error) =>
    console.error('Campaign chat did not load:', error)
  )

function getOwnerQuery(owner: Owner, kind: string): Record<string, string> {
  return owner.at === 'campaign' ? { kind, campaign_id: owner.id } : { kind, user_id: owner.id }
}

export async function getResources<T extends Row>(owner: Owner, kind: string): Promise<T[]> {
  const entries = await apiGet<T[]>(path('resource', getOwnerQuery(owner, kind)))
  return entries.sort((a, b) =>
    String((a as Record<string, unknown>).title ?? (a as Record<string, unknown>).name ?? '').localeCompare(
      String((b as Record<string, unknown>).title ?? (b as Record<string, unknown>).name ?? '')
    )
  )
}

export async function postResource(owner: Owner, kind: string, values: Record<string, unknown>): Promise<string> {
  const created = await apiPost<Row>('resource', {
    ...values,
    kind,
    campaign_id: owner.at === 'campaign' ? owner.id : undefined
  })
  return created.id
}

export const putResource = (id: string, values: Record<string, unknown>) => apiPut(`resource/${id}`, values)

export const deleteResource = (id: string) => apiDelete(`resource/${id}`)

export const getResourceUpdates = (resourceId: string) => apiGet<ResourceUpdate[]>(`resource/${resourceId}/update`)

export const postResourceUpdate = (resourceId: string, body: string) =>
  apiPost<ResourceUpdate>(`resource/${resourceId}/update`, { by: getSession()?.user_id ?? 'nobody', body })

export const putResourceUpdates = (resourceId: string, body: string) =>
  apiPut<ResourceUpdate>(`resource/${resourceId}/update`, { body })

export const deleteResourceUpdates = (resourceId: string) => apiDelete(`resource/${resourceId}/update`)

export const getResourceUpdatesStream = (resourceId: string, onChange: (updates: ResourceUpdate[]) => void): Unsubscribe =>
  getStream(`resource/${resourceId}/stream`, 'update', () => getResourceUpdates(resourceId), onChange)

const LOCAL_PREFIX = 'local:'
const FILE_PREFIX = 'file:'
const BLOB_PREFIX = 'blob:'
const ASSET_ADDRESS = /^\/api\/asset\/([0-9a-f-]+)\/data$/
const FOLDER_TYPE = 'inode/directory'
const MEDIA_TYPES: Record<MediaKind, string> = {
  image: 'image/*',
  video: 'video/*',
  audio: 'audio/*',
  pdf: 'application/pdf',
  file: '*/*'
}

export type UploadScope =
  | { kind: 'user' }
  | { kind: 'campaignMap'; campaignId: string }
  | { kind: 'campaignAudio'; campaignId: string }
  | { kind: 'campaignFile'; campaignId: string }

export class UploadError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'UploadError'
  }
}

function getUploaderId(): string {
  const user = getSession()
  if (!user) throw new UploadError('Sign in before uploading a file.')
  return user.user_id
}

function getAssetId(address: string): string {
  return ASSET_ADDRESS.exec(address)?.[1] ?? ''
}

export function isLocalFile(address: string): boolean {
  return address.startsWith(LOCAL_PREFIX)
}

export function isFileRecord(address: string): boolean {
  return ASSET_ADDRESS.test(address)
}

export function isDeadFile(address: string): boolean {
  return address.startsWith(BLOB_PREFIX)
}

export function isStoredFile(address: string): boolean {
  return isLocalFile(address) || isFileRecord(address) || address.startsWith(FILE_PREFIX)
}

export function getMediaUrl(id: string): string {
  return `${baseURL}asset/${id}/data`
}

function getMediaAsset(asset: Asset): MediaAsset {
  return { id: asset.id, url: getMediaUrl(asset.id), name: asset.name, mimeType: asset.mime_type }
}

export function getAssetTab(assetId: string): void {
  window.open(getMediaUrl(assetId), '_blank', 'noopener')
}

export async function getAssets(query: string, kind: MediaKind, scope: UploadScope): Promise<MediaAsset[]> {
  const words = query.split(/\s+/).filter(Boolean)
  const tags = words.filter((word) => word.startsWith('#') && word.length > 1).map((word) => word.slice(1).toLowerCase())
  const named = words.filter((word) => !word.startsWith('#')).join(' ')

  const [found, folders] = await Promise.all([
    apiGet<Asset[]>(path('asset', { q: named, mime_type: MEDIA_TYPES[kind] })),
    apiGet<Asset[]>(path('asset', { mime_type: FOLDER_TYPE }))
  ])

  const home = scope.kind === 'user' ? `user-${getUploaderId()}` : `campaign-${scope.campaignId}`
  const held = (found ?? [])
    .filter((asset) => asset.mime_type !== FOLDER_TYPE)
    .filter((asset) => tags.every((tag) => (asset.tags ?? []).some((one) => one.name.toLowerCase().includes(tag))))
    .sort((a, b) => a.name.localeCompare(b.name))
  const shelves = [...(folders ?? [])].sort(
    (a, b) => Number(b.slug === home) - Number(a.slug === home) || a.name.localeCompare(b.name)
  )
  const loose = held.filter((asset) => !shelves.some((folder) => folder.id === asset.parent_id))

  return [
    ...loose.map(getMediaAsset),
    ...shelves.flatMap((folder) => {
      const inside = held.filter((asset) => asset.parent_id === folder.id)
      return inside.length > 0 ? [folder, ...inside].map(getMediaAsset) : []
    })
  ]
}

export async function getAsset(address: string): Promise<Asset | null> {
  if (!isFileRecord(address)) return null

  return apiGet<Asset>(`asset/${getAssetId(address)}`).catch(() => null)
}

export async function getBlockHash(bytes: ArrayBuffer): Promise<string> {
  if (!crypto.subtle) {
    throw new UploadError('Hashing needs a secure context. Reach the app on localhost, not a LAN address.')
  }

  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
}

export async function getFileUrl(address: string): Promise<string> {
  if (isDeadFile(address) || isLocalFile(address) || address.startsWith(FILE_PREFIX)) return ''

  return address
}

export async function postFile(file: File, scope: UploadScope): Promise<MediaAsset> {
  getUploaderId()

  if (scope.kind === 'campaignMap' && !file.type.startsWith('image/')) {
    throw new UploadError('A map needs an image file.')
  }

  if (scope.kind === 'campaignAudio' && !file.type.startsWith('audio/')) {
    throw new UploadError('A sound needs an audio file.')
  }

  const form = new FormData()
  form.set('name', file.name)
  form.set('mime_type', file.type || 'application/octet-stream')
  if (scope.kind !== 'user') form.set('campaign_id', scope.campaignId)
  form.set('file', file)

  const created = await apiPost<Asset>('asset', form).catch((error) => {
    throw new UploadError(error instanceof ApiError ? error.message : 'The file was refused (no answer).')
  })
  if (!created?.id) throw new UploadError('The file was refused.')

  return getMediaAsset(created)
}

export async function deleteFile(address: string): Promise<void> {
  if (!isFileRecord(address)) return

  await apiDelete(`asset/${getAssetId(address)}`)
}

function getBlockAssets(blocks: Block[]): string[] {
  return blocks.flatMap((block) => {
    if (block.kind === 'columns') return getColumns(block.text).flatMap((column) => getBlockAssets(getDocument(column).blocks))
    const address =
      block.kind === 'file' ? getMediaUrl(block.options.assetId ?? '') : block.kind === 'map' ? block.text.trim() : (block.options.src ?? '')
    const id = getAssetId(address)
    return id ? [id] : []
  })
}

export async function putAttachments(resourceId: string, content: string): Promise<void> {
  const wanted = new Set(getBlockAssets(getDocument(content).blocks))
  const held =
    (await apiGet<{ id: string; asset_id: string }[]>(path('asset/object', { object_type: 'resource', object_id: resourceId }))) ?? []

  await Promise.all([
    ...[...wanted]
      .filter((assetId) => !held.some((link) => link.asset_id === assetId))
      .map((assetId) => apiPost(`asset/${assetId}/object`, { object_type: 'resource', object_id: resourceId })),
    ...held.filter((link) => !wanted.has(link.asset_id)).map((link) => apiDelete(`asset/${link.asset_id}/object/${link.id}`))
  ])
}

export const getCatalogEntry = <T>(kind: string, id: string) => apiGet<T>(`catalog/${kind}/${encodeURIComponent(id)}`)

export const getCatalog = <T>(kind: string, digest?: string) => apiGet<T[]>(path(`catalog/${kind}`, { digest }))

export const putCatalogEntry = (kind: string, id: string, entry: unknown) =>
  apiPut(`catalog/${kind}/${encodeURIComponent(id)}`, entry)

export interface SearchHit {
  id: string
  object_type: string
  name: string | null
  description: string | null
  rank: number
  kind?: string
  campaign_id?: string
}

export interface SearchBody {
  q?: string
  object_types?: string[]
  ids?: string[]
  exclude_ids?: string[]
  tag_ids?: string[]
  parent_id?: string
  parent_type?: string
  limit?: number
}

export const postSearch = (body: SearchBody) => apiPost<SearchHit[]>('search', body)

export const getTags = (q: string) => apiGet<Tag[]>(path('tag', { q, limit: '10' }))
