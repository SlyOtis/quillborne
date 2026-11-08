import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CharacterDocument } from './firestore.types'

const wire = vi.hoisted(() => ({
  calls: [] as Array<{ method: string, path: string, body?: unknown }>,
  answers: new Map<string, unknown>(),
  refusals: new Map<string, number>(),
  deleted: [] as string[],
  polls: [] as Array<{ path: string, kind: string, stopped: boolean }>
}))

vi.mock('./api', () => {
  class ApiError extends Error {
    status: number
    constructor(status: number, message: string) {
      super(message)
      this.status = status
    }
  }
  const answer = (method: string, path: string, body?: unknown) => {
    wire.calls.push({ method, path, body })
    const refused = wire.refusals.get(`${method} ${path}`)
    if (refused) return Promise.reject(new ApiError(refused, 'refused'))
    return Promise.resolve(wire.answers.get(`${method} ${path}`) ?? { id: 'made-1' })
  }
  return {
    ApiError,
    getApi: (path: string) => answer('GET', path),
    postApi: (path: string, body?: unknown) => answer('POST', path, body),
    putApi: (path: string, body?: unknown) => answer('PUT', path, body),
    deleteApi: (path: string) => answer('DELETE', path),
    getSessionId: () => 'lars',
    getQuery: (values: Record<string, string | undefined>) => {
      const query = new URLSearchParams()
      for (const [key, value] of Object.entries(values)) if (value) query.set(key, value)
      const text = query.toString()
      return text ? `?${text}` : ''
    },
    getStream: (path: string, kind: string, load: () => Promise<unknown>, onChange: (value: unknown) => void) => {
      const poll = { path, kind, stopped: false }
      wire.polls.push(poll)
      load().then((value) => !poll.stopped && onChange(value))
      return () => (poll.stopped = true)
    }
  }
})

vi.mock('./storage.service', () => ({
  isDeadFile: (address: string) => address.startsWith('blob:'),
  isStoredFile: (address: string) => address.startsWith('file:'),
  deleteFile: (address: string) => {
    wire.deleted.push(address)
    return Promise.resolve()
  }
}))

import { campaignService, characterService, getCharacterMetadata, userService } from './firestore.service'

const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

const sheet = (name: string, imageUrl = '') =>
  ({ info: { name, level: 2, class: { name: 'Bard' }, race: { name: 'Gnome' }, imageUrl } }) as unknown as CharacterDocument['character']

const document = (fields: Partial<CharacterDocument> = {}): CharacterDocument => ({
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
  permissions: { viewers: [], editors: [], dm_override: true },
  ...fields
})

beforeEach(() => {
  wire.calls.length = 0
  wire.answers.clear()
  wire.refusals.clear()
  wire.deleted.length = 0
  wire.polls.length = 0
})

describe('the campaign chat the table reads', () => {
  it('reads the campaign chat, which the service filters for hidden rolls', async () => {
    const seen: unknown[] = []
    wire.answers.set('GET /campaign/camp-1/chat', [{ id: 'one' }])

    campaignService.postChatListener('camp-1', (entries) => seen.push(entries))
    await settle()

    expect(wire.calls).toEqual([{ method: 'GET', path: '/campaign/camp-1/chat', body: undefined }])
    expect(seen).toEqual([[{ id: 'one' }]])
    expect(wire.polls[0]).toMatchObject({ path: '/campaign/camp-1/stream', kind: 'chat' })
  })

  it('stops reading once stopped', () => {
    const stop = campaignService.postChatListener('camp-1', () => {})
    stop()

    expect(wire.polls[0].stopped).toBe(true)
  })

  it('posts an entry to the campaign it is said at', async () => {
    await campaignService.postChatEntry('camp-1', { author_id: 'lars', author_name: 'Lars', kind: 'message', body: 'Hi' } as never)

    expect(wire.calls[0]).toMatchObject({ method: 'POST', path: '/campaign/camp-1/chat', body: { body: 'Hi' } })
  })
})

describe('characters', () => {
  it('creates one with the summary its sheet derives', async () => {
    wire.answers.set('POST /character', { id: 'char-9' })

    const id = await characterService.createCharacter(sheet('Brann'), { tags: ['dwarf'] }, 'camp-1')

    expect(id).toBe('char-9')
    expect(wire.calls[0]).toMatchObject({
      method: 'POST',
      path: '/character',
      body: { campaign_id: 'camp-1', metadata: { name: 'Brann', level: 2, class: 'Bard', race: 'Gnome', tags: ['dwarf'] } }
    })
  })

  it('reads as nothing what the service refuses or lacks', async () => {
    wire.refusals.set('GET /character/char-1', 403)
    expect(await characterService.getCharacter('char-1')).toBeNull()

    wire.refusals.set('GET /character/char-2', 404)
    expect(await characterService.getCharacter('char-2')).toBeNull()
  })

  it('clears a dead portrait and writes the sheet back', async () => {
    wire.answers.set('GET /character/char-1', document({ character: sheet('Lyra', 'blob:gone') }))

    const found = await characterService.getCharacter('char-1')

    expect(found?.character.info.imageUrl).toBe('')
    expect(wire.calls.some((call) => call.method === 'PUT' && call.path === '/character/char-1')).toBe(true)
  })

  it('refreshes a stale summary on the list', async () => {
    wire.answers.set('GET /character', [document({ metadata: { ...document().metadata, level: 1 } })])

    const [found] = await characterService.getUserCharacters()

    expect(found.metadata.level).toBe(2)
    expect(wire.calls.find((call) => call.method === 'PUT')).toMatchObject({
      path: '/character/char-1',
      body: { metadata: getCharacterMetadata(sheet('Lyra')) }
    })
  })

  it('copies the sources along only for the owner', async () => {
    wire.answers.set('GET /character/char-1', document())
    wire.answers.set('POST /character', { id: 'copy-1' })
    wire.answers.set('GET /character/char-1/sources', ['a.pdf'])

    expect(await characterService.postCharacterCopy('char-1')).toBe('copy-1')
    expect(wire.calls.find((call) => call.path === '/character/copy-1/sources')).toMatchObject({ method: 'PUT', body: { sources: ['a.pdf'] } })

    wire.calls.length = 0
    wire.answers.set('GET /character/char-1', document({ owner_id: 'dis' }))
    await characterService.postCharacterCopy('char-1')
    expect(wire.calls.some((call) => call.path.endsWith('/sources'))).toBe(false)
  })
})

describe('the table', () => {
  it('seats a player by address and unseats them by id', async () => {
    await campaignService.postCampaignPlayer('camp-1', 'dis@example.test')
    await campaignService.deleteCampaignPlayer('camp-1', 'dis')

    expect(wire.calls).toEqual([
      { method: 'POST', path: '/campaign/camp-1/player', body: { email: 'dis@example.test' } },
      { method: 'DELETE', path: '/campaign/camp-1/player/dis', body: undefined }
    ])
  })

  it('brings a character to the table and takes it away', async () => {
    await campaignService.postCampaignCharacter('camp-1', 'char-1')
    await campaignService.deleteCampaignCharacter('camp-1', 'char-1')

    expect(wire.calls.map((call) => `${call.method} ${call.path}`)).toEqual([
      'POST /campaign/camp-1/character/char-1',
      'DELETE /campaign/camp-1/character/char-1'
    ])
  })

  it('removes the stored map pictures and the songs it added before the campaign', async () => {
    wire.answers.set('GET /campaign/camp-1/map', [{ image_url: 'file:map', layers: [{ image_url: 'file:layer' }, { image_url: 'https://x' }] }])
    wire.answers.set('GET /campaign/camp-1/song', [
      { owner_id: 'lars', address: 'file:song' },
      { owner_id: 'dis', address: 'file:theirs' }
    ])

    await campaignService.deleteCampaign('camp-1')

    expect(wire.deleted).toEqual(['file:map', 'file:layer', 'file:song'])
    expect(wire.calls.at(-1)).toMatchObject({ method: 'DELETE', path: '/campaign/camp-1' })
  })
})

describe('the parts a campaign or a player keeps', () => {
  it('lists a kind under the campaign or under the player', async () => {
    wire.answers.set('GET /resource?kind=npcs&campaign_id=camp-1', [{ id: 'b', title: 'Zed' }, { id: 'a', title: 'Ann' }])
    wire.answers.set('GET /resource?kind=entries&user_id=lars', [])

    const found = await campaignService.getPart({ at: 'campaigns', id: 'camp-1' }, 'npcs')
    await campaignService.getPart({ at: 'users', id: 'lars' }, 'entries')

    expect(found.map((one) => one.id)).toEqual(['a', 'b'])
    expect(wire.calls[1].path).toBe('/resource?kind=entries&user_id=lars')
  })

  it('writes a kind with its campaign, and a song under the campaign', async () => {
    await campaignService.postPart({ at: 'campaigns', id: 'camp-1' }, 'npcs', { title: 'The ladle keeper' })
    await campaignService.postPart({ at: 'campaigns', id: 'camp-1' }, 'songs', { title: 'Drums' })
    await campaignService.putPart({ at: 'campaigns', id: 'camp-1' }, 'npcs', 'n-1', { title: 'Found' })

    expect(wire.calls).toEqual([
      { method: 'POST', path: '/resource', body: { title: 'The ladle keeper', kind: 'npcs', campaign_id: 'camp-1' } },
      { method: 'POST', path: '/campaign/camp-1/song', body: { title: 'Drums' } },
      { method: 'PUT', path: '/resource/n-1', body: { title: 'Found' } }
    ])
  })
})

describe('the profile', () => {
  it('reads the own profile at its own address and another by id', async () => {
    await userService.getProfile()
    await userService.getProfile('dis')

    expect(wire.calls.map((call) => call.path)).toEqual(['/profile', '/profile/dis'])
  })

  it('adds and drops a friend', async () => {
    await userService.postFriend('dis@example.test')
    await userService.deleteFriend('dis')

    expect(wire.calls).toEqual([
      { method: 'POST', path: '/profile/friend', body: { email: 'dis@example.test' } },
      { method: 'DELETE', path: '/profile/friend/dis', body: undefined }
    ])
  })

  it('keeps the integration keys apart from the profile', async () => {
    await userService.putUserSecrets({ replicate_api_key: 'r8_x' })

    expect(wire.calls[0]).toEqual({ method: 'PUT', path: '/profile/details', body: { replicate_api_key: 'r8_x' } })
  })
})
