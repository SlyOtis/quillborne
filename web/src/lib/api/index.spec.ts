import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Character } from './types'
import portraitSource from '../../components/ui/Portrait.svelte?raw'
import storedImageSource from '../../components/ui/StoredImage.svelte?raw'
import createPageSource from '../../pages/CharacterCreatePage.svelte?raw'
import resourceShellSource from '../../components/campaign/ResourceShell.svelte?raw'
import resourceRollSource from '../../components/campaign/ResourceRoll.svelte?raw'
import backgroundTabSource from '../../components/character_sheet/main_tabs/BackgroundTab.svelte?raw'
import blockEditorSource from '../../components/ui/BlockEditor.svelte?raw'
import blockReaderSource from '../../components/ui/BlockReader.svelte?raw'
import mediaDialogSource from '../../components/MediaDialog.svelte?raw'

const wire = vi.hoisted(() => ({
  reads: [] as string[],
  deletes: [] as string[],
  posts: [] as { path: string; body: unknown }[],
  answers: {} as Record<string, unknown>,
  calls: [] as Array<{ method: string; path: string; body?: unknown }>,
  replies: new Map<string, unknown>(),
  refusals: new Map<string, number>(),
  polls: [] as Array<{ path: string; kind: string; stopped: boolean }>
}))

vi.mock('./core', async (original) => {
  const real = await original<typeof import('./core')>()
  const answer = (method: string, url: string, body?: unknown) => {
    const path = `/${url}`
    wire.calls.push({ method, path, body })
    if (method === 'GET') wire.reads.push(path)
    if (method === 'POST') wire.posts.push({ path, body })
    if (method === 'DELETE') wire.deletes.push(path)
    const refused = wire.refusals.get(`${method} ${path}`)
    if (refused) return Promise.reject(new real.ApiError(refused, 'refused'))
    if (wire.replies.has(`${method} ${path}`)) return Promise.resolve(wire.replies.get(`${method} ${path}`))
    if (method !== 'GET') return Promise.resolve({ id: 'made-1' })
    if (path in wire.answers) return Promise.resolve(wire.answers[path])
    return Promise.resolve(path.includes('?') ? [] : { id: 'a1', name: 'theme.mp3', mime_type: 'audio/mpeg', size_bytes: 3, etag: 'tag-a', uploaded_by: 'lars' })
  }
  return {
    ...real,
    getSession: () => ({ user_id: 'lars', email: '' }),
    getSessionId: () => 'lars',
    unwrap: (url: string, options: { method?: string; body?: unknown } = {}) => {
      if (options.body instanceof FormData) return real.unwrap(url, options as Parameters<typeof real.unwrap>[1])
      return answer(options.method ?? 'GET', url, options.body)
    },
    request: async (url: string, options: { method?: string } = {}) => {
      await answer(options.method ?? 'GET', url)
      return new Response(null)
    },
    getStream: (path: string, kind: string, load: () => Promise<unknown>, onChange: (value: unknown) => void) => {
      const poll = { path: `/${path}`, kind, stopped: false }
      wire.polls.push(poll)
      load().then((value) => !poll.stopped && onChange(value))
      return () => (poll.stopped = true)
    }
  }
})

import {
  deleteFile,
  getAssets,
  getAssetTab,
  getAsset,
  getFileUrl,
  getMediaUrl,
  isDeadFile,
  isFileRecord,
  isStoredFile,
  postFile,
  putAttachments,
  UploadError,
  deleteCampaign,
  deleteCampaignPlayer,
  deleteProfileFriend,
  getCampaignChatStream,
  getCharacter,
  getCharacterMetadata,
  getCharacters,
  getProfile,
  getResources,
  postCampaignCharacter,
  postCampaignChat,
  postCampaignPlayer,
  postCampaignSong,
  postCharacter,
  postCharacterCopy,
  postProfileFriend,
  postResource,
  putProfileDetails,
  putResource
} from './index'

const dead = 'blob:http://localhost:5174/5d0c2b1e-4f1a-4b7e-9d1c-0b6e7f3a2c11'
const stored = '/api/asset/0b6e7f3a-2c11-4f1a-9d1c-5d0c2b1e4b7e/data'

describe('a blob: portrait address', () => {
  it('is dead, since an object URL lives for one page in one browser', () => {
    expect(isDeadFile(dead)).toBe(true)
    expect(isStoredFile(dead)).toBe(false)
    expect(isDeadFile(stored)).toBe(false)
    expect(isDeadFile('file:users/lars/files/1757000000000-a1b2c3d4.webp')).toBe(false)
    expect(isDeadFile('local:users/lars/1757000000000-portrait.png')).toBe(false)
    expect(isDeadFile('https://example.test/portrait.webp')).toBe(false)
  })

  it('resolves to nothing, so no image is requested and no console error follows', async () => {
    expect(await getFileUrl(dead)).toBe('')
  })

  it('draws the portrait initial in place of the image', () => {
    expect(portraitSource).toContain("const picture = $derived(src && !isDeadFile(src) ? src : '')")
    expect(portraitSource).toContain('{#if picture}')
    expect(portraitSource).toContain('<StoredImage src={picture} {alt} />')
  })

  it('leaves a stored image unresolved rather than handing the browser a dead src', () => {
    expect(storedImageSource).toContain("resolved = isDeadFile(address) ? '' : address")
  })
})

describe('the portrait preview on the create page', () => {
  it('is the stored address the file was posted to, never an object URL', () => {
    expect(createPageSource).not.toContain('createObjectURL')
    expect(createPageSource).toContain("creationData.imageUrl = (await postFile(file, { kind: 'user' })).url")
    expect(createPageSource).toContain('<Portrait src={creationData.imageUrl}')
  })
})

describe('a file the editor makes on a page', () => {
  it('goes to the campaign folder on a campaign page and to the player otherwise, whatever its type', () => {
    expect(resourceShellSource).toContain("const scope = $derived<UploadScope>(campaignId ? { kind: 'campaignFile', campaignId } : { kind: 'user' })")
    expect(resourceShellSource).toContain('return await postFile(file, scope)')
    expect(resourceShellSource).toContain('getAssets={(query, wanted) => getAssets(query, wanted, scope)}')
  })

  it('sends a page picture to the campaign only on a campaign page, so a player\'s own page posts no empty campaign', () => {
    expect(resourceShellSource).toContain("postFile(file, campaignId ? { kind: 'campaignMap', campaignId } : { kind: 'user' })")
  })
})

describe('the media contract', () => {
  const hosts = { resourceShellSource, resourceRollSource, backgroundTabSource, blockEditorSource, blockReaderSource }
  const tags = (source: string, name: string) => source.match(new RegExp(`<${name}\\b[\\s\\S]*?/>`, 'g')) ?? []

  it('asks the host for media and stores a recording through it, with the kinds Mar declares', () => {
    expect(blockEditorSource).toContain('requestMedia?: (kind: MediaKind, current?: string) => Promise<MediaAsset | null>')
    expect(blockEditorSource).toContain('uploadFile?: (file: File, kind: MediaKind) => Promise<MediaAsset>')
    expect(blockEditorSource).toContain('openAsset?: (assetId: string) => void')
    expect(blockEditorSource).toContain("uploadFile(sound, 'audio')")
  })

  it('keeps no file input and no upload hook of its own in the editor', () => {
    expect(blockEditorSource).not.toContain('type="file"')
    expect(blockEditorSource).not.toContain('onfile')
  })

  it('stores all four values a file block is attached with', () => {
    expect(blockEditorSource).toContain('{ assetId: asset.id, name: asset.name, url: asset.url, mimeType: asset.mimeType }')
  })

  it('opens a file block through the host while reading', () => {
    expect(blockReaderSource).toContain('openAsset?: (assetId: string) => void')
    expect(blockReaderSource).toContain("onclick={() => openAsset?.(block.options.assetId ?? '')}")
  })

  it('plays a video and a pdf from what its address resolves to, so an old file: reference reaches no player, and reads a recording as a link row', () => {
    for (const source of [blockReaderSource, blockEditorSource]) {
      expect(source).not.toMatch(/<(audio|video|object)\b[^>]*(src|data)=\{block\.options\.src/)
    }
    expect(blockReaderSource).not.toContain('<audio')
    expect(blockReaderSource).toContain('<a class="dnd-read-link dnd-read-sound-link" href={address(block)}')
    expect(blockReaderSource).toContain('<video controls src={url}></video>')
    expect(blockReaderSource).toContain('<object data={url} type="application/pdf"')
    expect(blockEditorSource).toContain('<video controls src={url}></video>')
    expect(blockReaderSource.match(/\{#await getFileUrl\(block\.options\.src \?\? ''\) then url\}/g)).toHaveLength(2)
  })

  it('feeds the dialog its listing and its upload from the host', () => {
    expect(mediaDialogSource).toContain('getAssets: (query: string, kind: MediaKind) => Promise<MediaAsset[]>')
    expect(mediaDialogSource).toContain('uploadFile: (file: File, kind: MediaKind) => Promise<MediaAsset>')
    expect(mediaDialogSource).toContain('onclose: (asset: MediaAsset | null) => void')
  })

  it.each(Object.entries(hosts))('hands every editor in %s its media hooks and every reader its opener', (_, source) => {
    expect(tags(source, 'BlockEditor').length + tags(source, 'BlockReader').length).toBeGreaterThan(0)
    for (const tag of tags(source, 'BlockEditor')) {
      expect(tag).toContain('requestMedia={')
      expect(tag).toContain('uploadFile={')
      expect(tag).toContain('openAsset={')
    }
    for (const tag of tags(source, 'BlockReader')) expect(tag).toMatch(/openAsset=\{|\{openAsset\}/)
  })
})

function getStore(answer: (url: string, init: RequestInit) => Response) {
  const calls: { url: string; init: RequestInit }[] = []
  vi.stubGlobal('document', { cookie: 'sauth_csrf_token=tok' })
  vi.stubGlobal('fetch', (url: string, init: RequestInit = {}) => {
    calls.push({ url, init })
    return Promise.resolve(answer(url, init))
  })
  return calls
}

describe('the service asset store', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    wire.reads = []
    wire.deletes = []
    wire.answers = {}
  })

  it('addresses an asset on its data route', () => {
    expect(getMediaUrl('a1')).toBe('/api/asset/a1/data')
  })

  it('opens an asset on its data route in a new tab', () => {
    const open = vi.fn()
    vi.stubGlobal('window', { open })

    getAssetTab('a1')

    expect(open).toHaveBeenCalledWith('/api/asset/a1/data', '_blank', 'noopener')
  })

  it('resolves an asset address to itself, so audio and video stream by range', async () => {
    expect(isFileRecord(stored)).toBe(true)
    expect(isStoredFile(stored)).toBe(true)
    expect(await getFileUrl(stored)).toBe(stored)
  })

  it('resolves an old file: record and a legacy local: reference to nothing, since neither store remains', async () => {
    expect(isFileRecord('file:users/lars/files/1-a.webp')).toBe(false)
    expect(isStoredFile('file:users/lars/files/1-a.webp')).toBe(true)
    expect(await getFileUrl('file:users/lars/files/1-a.webp')).toBe('')
    expect(await getFileUrl('local:users/lars/1757000000000-portrait.png')).toBe('')
  })

  it('leaves a hosted address as it is', async () => {
    expect(isStoredFile('https://example.test/portrait.webp')).toBe(false)
    expect(await getFileUrl('https://example.test/portrait.webp')).toBe('https://example.test/portrait.webp')
  })

  it('posts the original with its name, type and campaign in one form and answers the asset it became', async () => {
    const calls = getStore(() => new Response(JSON.stringify({ data: { id: 'a1', name: 'theme.mp3', mime_type: 'audio/mpeg', etag: 'tag-a' } }), { status: 201 }))
    const file = new File([new Uint8Array([1, 2, 3])], 'theme.mp3', { type: 'audio/mpeg' })

    const asset = await postFile(file, { kind: 'campaignAudio', campaignId: 'c1' })

    expect(asset).toEqual({ id: 'a1', url: '/api/asset/a1/data', name: 'theme.mp3', mimeType: 'audio/mpeg' })
    expect(calls).toHaveLength(1)
    expect(calls[0].url).toBe('/api/asset')
    expect(calls[0].init.method).toBe('POST')
    const form = calls[0].init.body as FormData
    expect(form.get('name')).toBe('theme.mp3')
    expect(form.get('mime_type')).toBe('audio/mpeg')
    expect(form.get('campaign_id')).toBe('c1')
    expect((form.get('file') as File).name).toBe('theme.mp3')
    expect((calls[0].init.headers as Record<string, string>)['SAuth-CSRF-Token']).toBe('tok')
    expect((calls[0].init.headers as Record<string, string>)['Content-Type']).toBeUndefined()
  })

  it('posts a player\'s own file without a campaign', async () => {
    const calls = getStore(() => new Response(JSON.stringify({ data: { id: 'a2', name: 'portrait.webp', mime_type: 'image/webp' } }), { status: 201 }))
    const file = new File([new Uint8Array([1])], 'portrait.webp', { type: 'image/webp' })

    expect((await postFile(file, { kind: 'user' })).url).toBe('/api/asset/a2/data')
    expect((calls[0].init.body as FormData).has('campaign_id')).toBe(false)
  })

  it('posts any type of file to a campaign folder', async () => {
    const calls = getStore(() => new Response(JSON.stringify({ data: { id: 'a3', name: 'clip.webm', mime_type: 'video/webm' } }), { status: 201 }))
    const file = new File([new Uint8Array([1])], 'clip.webm', { type: 'video/webm' })

    expect((await postFile(file, { kind: 'campaignFile', campaignId: 'c1' })).url).toBe('/api/asset/a3/data')
    expect((calls[0].init.body as FormData).get('campaign_id')).toBe('c1')
  })

  it('carries the service refusal as an UploadError', async () => {
    getStore(() => new Response(JSON.stringify({ error: { message: 'The file is larger than 256 MB' } }), { status: 413 }))
    const file = new File([new Uint8Array([1])], 'huge.mp3', { type: 'audio/mpeg' })

    await expect(postFile(file, { kind: 'user' })).rejects.toThrow(new UploadError('The file is larger than 256 MB'))
  })

  it('refuses a map that is not an image before anything is written', async () => {
    const calls = getStore(() => new Response(null, { status: 200 }))
    const file = new File([new Uint8Array([1])], 'notes.txt', { type: 'text/plain' })

    await expect(postFile(file, { kind: 'campaignMap', campaignId: 'c1' })).rejects.toThrow('A map needs an image file.')
    expect(calls).toHaveLength(0)
  })

  it('reads and deletes an asset by the id in its address, and leaves an old file: record alone', async () => {
    expect(await getAsset(stored)).toMatchObject({ id: 'a1', mime_type: 'audio/mpeg' })
    expect(await getAsset('file:users/lars/files/1-a.webp')).toBeNull()
    await deleteFile(stored)
    await deleteFile('file:users/lars/files/1-a.webp')

    expect(wire.reads).toEqual(['/asset/0b6e7f3a-2c11-4f1a-9d1c-5d0c2b1e4b7e'])
    expect(wire.deletes).toEqual(['/asset/0b6e7f3a-2c11-4f1a-9d1c-5d0c2b1e4b7e'])
  })
})

describe('the media the pick tab lists', () => {
  afterEach(() => {
    wire.reads = []
    wire.answers = {}
  })

  const folders = [
    { id: 'f-blackwood', name: 'Blackwood', mime_type: 'inode/directory', parent_id: 'f-blackwood', slug: 'campaign-c2' },
    { id: 'f-own', name: 'Personal', mime_type: 'inode/directory', parent_id: 'f-own', slug: 'user-lars' },
    { id: 'f-ashfall', name: 'Ashfall', mime_type: 'inode/directory', parent_id: 'f-ashfall', slug: 'campaign-c3' }
  ]

  const images = [
    { id: 'i-ruin', name: 'ruin.webp', mime_type: 'image/webp', parent_id: 'f-blackwood', slug: null, tags: [{ name: 'Ruins' }] },
    { id: 'i-keep', name: 'keep.png', mime_type: 'image/png', parent_id: 'f-own', slug: null, tags: [] },
    { id: 'i-gift', name: 'gift.jpg', mime_type: 'image/jpeg', parent_id: 'f-unseen', slug: null }
  ]

  it.each([
    ['image', 'image%2F*'],
    ['video', 'video%2F*'],
    ['audio', 'audio%2F*'],
    ['pdf', 'application%2Fpdf'],
    ['file', '*%2F*']
  ] as const)('asks for %s media by its type, and for the folders it sits in', async (kind, type) => {
    await getAssets('', kind, { kind: 'user' })

    expect(wire.reads).toEqual([`/asset?mime_type=${type}`, '/asset?mime_type=inode%2Fdirectory'])
  })

  it('searches names by the words and holds the hash words back for the tags', async () => {
    await getAssets('old keep #ruins', 'image', { kind: 'user' })

    expect(wire.reads[0]).toBe('/asset?q=old+keep&mime_type=image%2F*')
  })

  it('groups by folder, the folder an upload lands in first, each folder drawn before what it holds', async () => {
    wire.answers = { '/asset?mime_type=image%2F*': images, '/asset?mime_type=inode%2Fdirectory': folders }

    const listed = await getAssets('', 'image', { kind: 'user' })

    expect(listed.map((one) => one.id)).toEqual(['i-gift', 'f-own', 'i-keep', 'f-blackwood', 'i-ruin'])
    expect(listed[1]).toEqual({ id: 'f-own', url: '/api/asset/f-own/data', name: 'Personal', mimeType: 'inode/directory' })
    expect(listed[2]).toEqual({ id: 'i-keep', url: '/api/asset/i-keep/data', name: 'keep.png', mimeType: 'image/png' })
  })

  it('puts the campaign folder first on a campaign page', async () => {
    wire.answers = { '/asset?mime_type=image%2F*': images, '/asset?mime_type=inode%2Fdirectory': folders }

    const listed = await getAssets('', 'image', { kind: 'campaignFile', campaignId: 'c2' })

    expect(listed.map((one) => one.id)).toEqual(['i-gift', 'f-blackwood', 'i-ruin', 'f-own', 'i-keep'])
  })

  it('narrows on a hash word to what carries a tag holding it', async () => {
    wire.answers = { '/asset?mime_type=image%2F*': images, '/asset?mime_type=inode%2Fdirectory': folders }

    const listed = await getAssets('#ruin', 'image', { kind: 'user' })

    expect(listed.map((one) => one.id)).toEqual(['f-blackwood', 'i-ruin'])
  })

  it('never offers a folder as a file to pick', async () => {
    wire.answers = { '/asset?mime_type=*%2F*': [...folders, ...images], '/asset?mime_type=inode%2Fdirectory': folders }

    const listed = await getAssets('', 'file', { kind: 'user' })

    expect(listed.map((one) => one.id)).toEqual(['i-gift', 'f-own', 'i-keep', 'f-blackwood', 'i-ruin'])
  })
})

describe('the media a page attaches', () => {
  afterEach(() => {
    wire.reads = []
    wire.deletes = []
    wire.posts = []
    wire.answers = {}
  })

  const page = 'r1'
  const content = [
    '![The keep](/api/asset/0a1/data)',
    '[video: The ambush](/api/asset/0b2/data)',
    '```file {"assetId":"0c3","name":"charter.txt","url":"/api/asset/0c3/data","mimeType":"text/plain"}\n\n```',
    '```columns\n![](/api/asset/0d4/data)\n---\nRight\n```',
    '![Old](file:users/lars/files/1-a.webp)'
  ].join('\n\n')

  it('attaches every asset a block names and detaches the ones no block names any more', async () => {
    wire.answers = { '/asset/object?object_type=resource&object_id=r1': [{ id: 'l1', asset_id: '0a1' }, { id: 'l9', asset_id: '0f9' }] }

    await putAttachments(page, content)

    expect(wire.reads).toEqual(['/asset/object?object_type=resource&object_id=r1'])
    expect(wire.posts.map((one) => one.path).sort()).toEqual(['/asset/0b2/object', '/asset/0c3/object', '/asset/0d4/object'])
    expect(wire.posts[0].body).toEqual({ object_type: 'resource', object_id: 'r1' })
    expect(wire.deletes).toEqual(['/asset/0f9/object/l9'])
  })

  it('follows the page on every save of the shell', () => {
    expect(resourceShellSource).toContain('await putAttachments(id, one.content)')
    expect(resourceShellSource).toContain('await putAttachments(recordId, one.content)')
  })
})

const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

const sheet = (name: string, imageUrl = '') =>
  ({ info: { name, level: 2, class: { name: 'Bard' }, race: { name: 'Gnome' }, imageUrl } }) as unknown as Character['character']

const row = (fields: Partial<Character> = {}): Character => ({
  id: 'char-1',
  owner_id: 'lars',
  character: sheet('Lyra'),
  metadata: {
    name: 'Lyra',
    level: 2,
    class: 'Bard',
    race: 'Gnome',
    status: 'ready',
    created_at: '2026-09-06T10:00:00.000Z',
    updated_at: '2026-09-06T10:00:00.000Z',
    version: '1.0.0',
    tags: ['bard'],
    is_template: false,
    is_public: false
  },
  ...fields
})

beforeEach(() => {
  wire.calls.length = 0
  wire.replies.clear()
  wire.refusals.clear()
  wire.polls.length = 0
  wire.reads = []
  wire.deletes = []
  wire.posts = []
})

describe('the campaign chat the table reads', () => {
  it('reads the campaign chat, which the service filters for hidden rolls', async () => {
    const seen: unknown[] = []
    wire.replies.set('GET /campaign/camp-1/chat', [{ id: 'one' }])

    getCampaignChatStream('camp-1', (entries) => seen.push(entries))
    await settle()

    expect(wire.calls).toEqual([{ method: 'GET', path: '/campaign/camp-1/chat', body: undefined }])
    expect(seen).toEqual([[{ id: 'one' }]])
    expect(wire.polls[0]).toMatchObject({ path: '/campaign/camp-1/stream', kind: 'chat' })
  })

  it('stops reading once stopped', () => {
    const stop = getCampaignChatStream('camp-1', () => {})
    stop()

    expect(wire.polls[0].stopped).toBe(true)
  })

  it('posts an entry to the campaign it is said at', async () => {
    await postCampaignChat('camp-1', { author_id: 'lars', author_name: 'Lars', kind: 'message', body: 'Hi' } as never)

    expect(wire.calls[0]).toMatchObject({ method: 'POST', path: '/campaign/camp-1/chat', body: { body: 'Hi' } })
  })
})

describe('characters', () => {
  it('creates one with the summary its sheet derives', async () => {
    wire.replies.set('POST /character', { id: 'char-9' })

    const id = await postCharacter(sheet('Brann'), { tags: ['dwarf'] }, 'camp-1')

    expect(id).toBe('char-9')
    expect(wire.calls[0]).toMatchObject({
      method: 'POST',
      path: '/character',
      body: { campaign_id: 'camp-1', metadata: { name: 'Brann', level: 2, class: 'Bard', race: 'Gnome', tags: ['dwarf'] } }
    })
  })

  it('reads as nothing what the service refuses or lacks', async () => {
    wire.refusals.set('GET /character/char-1', 403)
    expect(await getCharacter('char-1')).toBeNull()

    wire.refusals.set('GET /character/char-2', 404)
    expect(await getCharacter('char-2')).toBeNull()
  })

  it('clears a dead portrait and writes the sheet back', async () => {
    wire.replies.set('GET /character/char-1', row({ character: sheet('Lyra', 'blob:gone') }))

    const found = await getCharacter('char-1')

    expect(found?.character.info.imageUrl).toBe('')
    expect(wire.calls.some((call) => call.method === 'PUT' && call.path === '/character/char-1')).toBe(true)
  })

  it('refreshes a stale summary on the list', async () => {
    wire.replies.set('GET /character', [row({ metadata: { ...row().metadata, level: 1 } })])

    const [found] = await getCharacters()

    expect(found.metadata.level).toBe(2)
    expect(wire.calls.find((call) => call.method === 'PUT')).toMatchObject({
      path: '/character/char-1',
      body: { metadata: getCharacterMetadata(sheet('Lyra')) }
    })
  })

  it('copies the sources along only for the owner', async () => {
    wire.replies.set('GET /character/char-1', row())
    wire.replies.set('POST /character', { id: 'copy-1' })
    wire.replies.set('GET /character/char-1/sources', ['a.pdf'])

    expect(await postCharacterCopy('char-1')).toBe('copy-1')
    expect(wire.calls.find((call) => call.path === '/character/copy-1/sources')).toMatchObject({ method: 'PUT', body: { sources: ['a.pdf'] } })

    wire.calls.length = 0
    wire.replies.set('GET /character/char-1', row({ owner_id: 'dis' }))
    await postCharacterCopy('char-1')
    expect(wire.calls.some((call) => call.path.endsWith('/sources'))).toBe(false)
  })
})

describe('the table', () => {
  it('seats a player by address and unseats them by id', async () => {
    await postCampaignPlayer('camp-1', 'dis@example.test')
    await deleteCampaignPlayer('camp-1', 'dis')

    expect(wire.calls).toEqual([
      { method: 'POST', path: '/campaign/camp-1/player', body: { email: 'dis@example.test' } },
      { method: 'DELETE', path: '/campaign/camp-1/player/dis', body: undefined }
    ])
  })

  it('brings a character to the table', async () => {
    await postCampaignCharacter('camp-1', 'char-1')

    expect(wire.calls.map((call) => `${call.method} ${call.path}`)).toEqual(['POST /campaign/camp-1/character/char-1'])
  })

  it('removes the stored map pictures and the songs it added before the campaign', async () => {
    wire.replies.set('GET /campaign/camp-1/map', [{ image_url: '/api/asset/0a1/data', layers: [{ image_url: '/api/asset/0b2/data' }, { image_url: 'https://x' }] }])
    wire.replies.set('GET /campaign/camp-1/song', [
      { owner_id: 'lars', address: '/api/asset/0c3/data' },
      { owner_id: 'dis', address: '/api/asset/0d4/data' }
    ])

    await deleteCampaign('camp-1')

    expect(wire.deletes.slice(0, 3)).toEqual(['/asset/0a1', '/asset/0b2', '/asset/0c3'])
    expect(wire.calls.at(-1)).toMatchObject({ method: 'DELETE', path: '/campaign/camp-1' })
  })
})

describe('the parts a campaign or a player keeps', () => {
  it('lists a kind under the campaign or under the player', async () => {
    wire.replies.set('GET /resource?kind=sessions&campaign_id=camp-1', [{ id: 'b', title: 'Zed' }, { id: 'a', title: 'Ann' }])
    wire.replies.set('GET /resource?kind=entries&user_id=lars', [])

    const found = await getResources({ at: 'campaign', id: 'camp-1' }, 'sessions')
    await getResources({ at: 'user', id: 'lars' }, 'entries')

    expect(found.map((one) => one.id)).toEqual(['a', 'b'])
    expect(wire.calls[1].path).toBe('/resource?kind=entries&user_id=lars')
  })

  it('writes a kind with its campaign, and a song under the campaign', async () => {
    await postResource({ at: 'campaign', id: 'camp-1' }, 'quests', { title: 'Find the ladle' })
    await postCampaignSong('camp-1', { title: 'Drums' })
    await putResource('q-1', { title: 'Found' })

    expect(wire.calls).toEqual([
      { method: 'POST', path: '/resource', body: { title: 'Find the ladle', kind: 'quests', campaign_id: 'camp-1' } },
      { method: 'POST', path: '/campaign/camp-1/song', body: { title: 'Drums' } },
      { method: 'PUT', path: '/resource/q-1', body: { title: 'Found' } }
    ])
  })
})

describe('the profile', () => {
  it('reads the own profile at its own address and another by id', async () => {
    await getProfile()
    await getProfile('dis')

    expect(wire.calls.map((call) => call.path)).toEqual(['/profile', '/profile/dis'])
  })

  it('adds and drops a friend', async () => {
    await postProfileFriend('dis@example.test')
    await deleteProfileFriend('dis')

    expect(wire.calls).toEqual([
      { method: 'POST', path: '/profile/friend', body: { email: 'dis@example.test' } },
      { method: 'DELETE', path: '/profile/friend/dis', body: undefined }
    ])
  })

  it('keeps the integration keys apart from the profile', async () => {
    await putProfileDetails({ replicate_api_key: 'r8_x' })

    expect(wire.calls[0]).toEqual({ method: 'PUT', path: '/profile/details', body: { replicate_api_key: 'r8_x' } })
  })
})
