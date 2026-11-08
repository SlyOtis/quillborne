import { getCharacter, getVehicle } from './api'
import type { CardKind, ChatEntry, Profile, SamnaUser } from './api/types'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { get } from 'svelte/store'
import type { Readable, Unsubscriber, Writable } from 'svelte/store'
import type { RollLogItem } from './types'
import type { ChatLog, ReplicateLogItem } from './chat'
import chatItemSource from '../components/chat/ChatItem.svelte?raw'

const wire = vi.hoisted(() => {
  const values: Record<string, string> = {}

  ;(globalThis as any).localStorage = {
    getItem: (key: string) => values[key] ?? null,
    setItem: (key: string, value: string) => {
      values[key] = value
    },
    removeItem: (key: string) => {
      delete values[key]
    }
  }

  return {
    posted: [] as Array<{ campaignId: string, entry: Record<string, unknown> }>,
    listeners: [] as Array<{ campaignId: string, onChange: (entries: ChatEntry[]) => void }>,
    stopped: [] as string[]
  }
})

vi.mock('sly-svelte-location-router', async () => {
  const { writable } = await import('svelte/store')
  return { currentRoute: writable(null) }
})

vi.mock('./api', () => ({
  postCampaignChat: (campaignId: string, entry: Record<string, unknown>) => {
    wire.posted.push({ campaignId, entry })
    return Promise.resolve('entry-1')
  },
  getCampaignChatStream: (campaignId: string, onChange: (entries: ChatEntry[]) => void) => {
    wire.listeners.push({ campaignId, onChange })
    return () => wire.stopped.push(campaignId)
  },
  getCharacter: () => Promise.resolve({ campaign_id: null }),
  getVehicle: (id: string) => Promise.resolve(id === 'ship-1' ? { campaign_id: 'camp-9' } : null),
  getCsrfHeaders: () => ({})
}))

import { getChatLog, rollFormula } from './chat'
import { detectAction, getBuildMessage, getCombatActionsMessage, getFeatRecommendations, getInventoryItem, getSpellsMessage, getStatsMessage, getUIActionBlock, getUnusedItems, getUnusedItemsMessage, postUIAction, setUIActionDispatcher, type SourceFeat, type UIAction } from './chat'
import dnd5e from '../../public/sources/systems/dnd5e.json'
import lars from './character.fixture'
import type { Character } from './character.types'
import { getResolvedCharacter } from './rules/derive'
import { getSheet } from './rules/sheet'
import type { RuleSystem } from './rules/spec.types'
import { currentCharacterId } from './stores/character.store'
import { getRollLog, writeRollLog } from './engine'
import { user, userProfile } from './stores/auth.store'
import { currentCampaignId } from './stores/campaign.store'

const { rollStore } = getRollLog()

const stamp = (at: string) => at

const shared = (fields: Partial<ChatEntry>): ChatEntry => ({
  id: 'shared-1',
  campaign_id: 'camp-1',
  author_id: 'dis',
  author_name: 'Dis',
  kind: 'roll',
  body: 'Dis rolls perception',
  query: '',
  is_hidden: false,
  roll_kind: 'skill',
  formula: '1d20+5',
  dice: [13],
  roll: 13,
  total: 18,
  created_at: stamp('2026-09-06T10:00:00.000Z'),
  updated_at: stamp('2026-09-06T10:00:00.000Z'),
  ...fields
})

const rolled = (rolledAt: string, text: string): RollLogItem => ({
  type: 'skill',
  text,
  formula: '1d20+3',
  roll: 14,
  total: 17,
  details: '14',
  rolledAt
})

const items = (store: Readable<ChatLog>) =>
  get(store) as unknown as Array<{ createdAt: Date, type: string, data: RollLogItem }>

const signedIn = (userId: string, name: string) => {
  user.set({ id: userId, user_id: userId, email: '', profile: null } as unknown as SamnaUser)
  userProfile.set({ display_name: name } as unknown as Profile)
}

const card = (fields: Partial<ChatEntry>): ChatEntry =>
  shared({
    id: 'shared-card',
    kind: 'message',
    body: '**Longsword**\n\nVersatile (1d10), 15 gp.',
    query: 'Lookup Item: longsword',
    roll_kind: '',
    formula: '',
    dice: [],
    roll: 0,
    total: 0,
    ...fields
  })

const chats = (store: Readable<ChatLog>) =>
  get(store) as unknown as Array<{ createdAt: Date, type: string, data: ReplicateLogItem }>

const streamed = (entry: ChatEntry) => {
  signedIn('lars', 'Lars')
  const log = getChatLog()
  close = log.unsubscribeChat

  currentCampaignId.set('camp-1')
  wire.listeners[0].onChange([entry])

  return chats(log.chatStore)[0]
}

let close: Unsubscriber | null = null

beforeEach(() => {
  wire.posted.length = 0
  wire.listeners.length = 0
  wire.stopped.length = 0
  rollStore.set([])
  currentCampaignId.set(null)
  user.set(null)
  userProfile.set(null)
})

afterEach(() => {
  close?.()
  close = null
})

describe('the shared roll log inside a campaign', () => {
  it('streams the campaign chat collection the rules open', () => {
    const log = getChatLog()
    close = log.unsubscribeChat

    currentCampaignId.set('camp-1')

    expect(wire.listeners.map((listener) => listener.campaignId)).toEqual(['camp-1'])
  })

  it('puts a roll another member made into this member log the moment it arrives, without a reload', () => {
    signedIn('lars', 'Lars')
    const log = getChatLog()
    close = log.unsubscribeChat

    currentCampaignId.set('camp-1')
    expect(get(log.chatStore)).toEqual([])

    wire.listeners[0].onChange([shared({})])

    expect(get(log.chatStore)).toEqual([
      {
        createdAt: new Date('2026-09-06T10:00:00.000Z'),
        type: 'roll',
        data: {
          type: 'skill',
          text: 'Dis rolls perception',
          author: 'Dis',
          formula: '1d20+5',
          roll: 13,
          total: 18,
          details: '13',
          rolledAt: '2026-09-06T10:00:00.000Z'
        }
      }
    ])
  })

  it('holds both members rolls in the order the stream delivers them', () => {
    signedIn('lars', 'Lars')
    const log = getChatLog()
    close = log.unsubscribeChat

    currentCampaignId.set('camp-1')
    wire.listeners[0].onChange([
      shared({ id: 'shared-1', author_id: 'lars', author_name: 'Lars', body: 'Lars rolls initiative' }),
      shared({
        id: 'shared-2',
        author_id: 'dis',
        author_name: 'Dis',
        body: 'Dis rolls initiative',
        created_at: stamp('2026-09-06T10:01:00.000Z'),
        updated_at: stamp('2026-09-06T10:01:00.000Z')
      })
    ])

    expect(items(log.chatStore).map((item) => [item.data.author, item.data.text])).toEqual([
      ['Lars', 'Lars rolls initiative'],
      ['Dis', 'Dis rolls initiative']
    ])
  })

  it('publishes a local roll with the author id the create rule tests', () => {
    signedIn('lars', 'Lars')
    const log = getChatLog()
    close = log.unsubscribeChat

    currentCampaignId.set('camp-1')
    writeRollLog('skill', 'Lars rolls stealth', '1d20+3', 14, 17, '14')

    expect(wire.posted).toHaveLength(1)
    expect(wire.posted[0].campaignId).toBe('camp-1')
    expect(get(rollStore)).toEqual([])
    expect(wire.posted[0].entry).toEqual({
      author_id: 'lars',
      author_name: 'Lars',
      kind: 'roll',
      body: 'Lars rolls stealth',
      query: '',
      is_hidden: false,
      roll_kind: 'skill',
      formula: '1d20+3',
      dice: [14],
      roll: 14,
      total: 17
    })
  })

  it('publishes a roll once and shows it through the stream, never twice', () => {
    signedIn('lars', 'Lars')
    const log = getChatLog()
    close = log.unsubscribeChat

    currentCampaignId.set('camp-1')
    writeRollLog('skill', 'Lars rolls stealth', '1d20+3', 14, 17, '14')

    expect(wire.posted).toHaveLength(1)
    expect(get(log.chatStore)).toEqual([])

    wire.listeners[0].onChange([shared({ author_id: 'lars', author_name: 'Lars', body: 'Lars rolls stealth' })])

    expect(get(log.chatStore)).toHaveLength(1)
  })

  it('republishes nothing when the local store grows inside a campaign', () => {
    signedIn('lars', 'Lars')
    const log = getChatLog()
    close = log.unsubscribeChat

    currentCampaignId.set('camp-1')
    rollStore.set([rolled('2026-09-06T10:02:00.000Z', 'Lars rolls stealth')])

    expect(wire.posted).toEqual([])
    expect(get(log.chatStore)).toEqual([])
  })

  it('subscribes once per campaign and stops the stream when the campaign is left', () => {
    const log = getChatLog()
    close = log.unsubscribeChat

    currentCampaignId.set('camp-1')
    currentCampaignId.set('camp-1')
    expect(wire.listeners).toHaveLength(1)

    currentCampaignId.set(null)
    expect(wire.stopped).toEqual(['camp-1'])
    expect(wire.listeners).toHaveLength(1)
  })
})

describe('the roll log outside a campaign', () => {
  it('writes nothing to the api, which takes a roll only at a campaign table', () => {
    const log = getChatLog()
    close = log.unsubscribeChat

    rollStore.set([rolled('2026-09-06T10:03:00.000Z', 'Lars rolls alone')])

    expect(wire.posted).toEqual([])
    expect(wire.listeners).toEqual([])
  })

  it('keeps showing the local roll log', () => {
    const log = getChatLog()
    close = log.unsubscribeChat

    rollStore.set([rolled('2026-09-06T10:03:00.000Z', 'Lars rolls alone')])

    expect(items(log.chatStore).map((item) => item.data.text)).toEqual(['Lars rolls alone'])
  })

  it('drops back to the local log when the campaign is left', () => {
    signedIn('lars', 'Lars')
    const log = getChatLog()
    close = log.unsubscribeChat

    currentCampaignId.set('camp-1')
    wire.listeners[0].onChange([shared({})])
    expect(get(log.chatStore)).toHaveLength(1)

    rollStore.set([rolled('2026-09-06T10:04:00.000Z', 'Lars rolls alone')])
    currentCampaignId.set(null)

    expect(items(log.chatStore).map((item) => item.data.text)).toEqual(['Lars rolls alone'])
  })
})

describe('the card payload another member reads off the shared log', () => {
  it('rebuilds the item card payload the card treatment is bound to', () => {
    expect(streamed(card({ card_kind: 'item_card' }))).toEqual({
      createdAt: new Date('2026-09-06T10:00:00.000Z'),
      type: 'chat',
      data: {
        sentAt: new Date('2026-09-06T10:00:00.000Z'),
        returnedAt: new Date('2026-09-06T10:00:00.000Z'),
        hidden: false,
        query: 'Dis: Lookup Item: longsword',
        response: '**Longsword**\n\nVersatile (1d10), 15 gp.',
        message: '**Longsword**\n\nVersatile (1d10), 15 gp.',
        data: { type: 'item_card' }
      }
    })
  })

  it('rebuilds the npc card payload the same way', () => {
    const item = streamed(
      card({
        card_kind: 'npc_card',
        body: '**Goblin**\n\nAC 15, 7 hp.',
        query: 'Lookup NPC: goblin'
      })
    )

    expect(item.type).toBe('chat')
    expect(item.data.data).toEqual({ type: 'npc_card' })
  })

  it('carries the kind alone, never the item or npc blob the sender held', () => {
    const item = streamed(card({ card_kind: 'item_card' }))

    expect(Object.keys(item.data.data)).toEqual(['type'])
  })

  it('leaves a message that is no card without a payload, so it renders plain', () => {
    const item = streamed(card({ card_kind: '' }))

    expect(item.type).toBe('chat')
    expect(item.data.data).toBeUndefined()
  })

  it('leaves an entry written before the kind was stored without a payload', () => {
    expect(streamed(card({})).data.data).toBeUndefined()
  })

  it('narrows a kind the treatment does not know to no payload', () => {
    const item = streamed(card({ card_kind: 'monster_card' as unknown as CardKind }))

    expect(item.data.data).toBeUndefined()
  })

  it('keeps a roll off the card path, whatever the entry carries', () => {
    const item = streamed(shared({ card_kind: 'item_card' }))

    expect(item.type).toBe('roll')
  })

  it('binds the card class to the payload the rebuilt entry hands the item', () => {
    expect(chatItemSource.replace(/\s+/g, ' ')).toContain(
      "class:card={logItem.data.data?.type === 'item_card' || logItem.data.data?.type === 'npc_card'}"
    )
  })
})

describe('the dice the search command rolls', () => {
  const dieFalls = (...throws: number[][]) => {
    const answers = [...throws]
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: true, text: () => Promise.resolve((answers.shift() ?? []).join('\n') + '\n') })))
  }

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('writes one roll into the log for the formula it is handed', async () => {
    dieFalls([7])

    const rolled = await rollFormula('1d20')

    expect(rolled).toMatchObject({ func: 'rollDice', args: { formula: '1d20', rolled: [[7]], total: 7 } })
    expect(get(rollStore)).toMatchObject([{ type: 'roll', formula: '1d20', roll: 7, total: 7, details: '7' }])
  })

  it('carries the modifier into the total and every die into the details', async () => {
    dieFalls([3, 4])

    await rollFormula('2d6+3')

    expect(get(rollStore)).toMatchObject([{ formula: '2d6+3', roll: 7, total: 10, details: '3,4' }])
  })

  it('adds and takes away every term of a mixed formula', async () => {
    dieFalls([5, 2], [3])

    await rollFormula('2d8 - 1d4 + 2')

    expect(get(rollStore)).toMatchObject([{ formula: '2d8-1d4+2', roll: 4, total: 6, details: '5,2,3' }])
  })

  it('keeps the highest or lowest dice a formula asks for', async () => {
    dieFalls([6, 1, 4, 3])

    await rollFormula('4d6kh3')

    expect(get(rollStore)).toMatchObject([{ formula: '4d6kh3', roll: 13, total: 13, details: '6,1,4,3' }])
  })

  it('reads advantage and disadvantage off the end of a lone d20', async () => {
    dieFalls([4, 17], [4, 17])

    await rollFormula('1d20+2 adv')
    await rollFormula('d20+2 dis')

    expect(get(rollStore)).toMatchObject([
      { formula: '2d20kh1+2', roll: 17, total: 19 },
      { formula: '2d20kl1+2', roll: 4, total: 6 }
    ])
  })

  it('rolls nothing for a formula that names no die the tray can throw', async () => {
    dieFalls([7])

    expect(await rollFormula('bones')).toBeUndefined()
    expect(await rollFormula('1d7')).toBeUndefined()
    expect(await rollFormula('3')).toBeUndefined()
    expect(await rollFormula('21d6')).toBeUndefined()
    expect(await rollFormula('2d6kh3')).toBeUndefined()
    expect(get(rollStore)).toEqual([])
    expect(fetch).not.toHaveBeenCalled()
  })

  it('says so when random.org does not answer, and logs nothing', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))))

    await expect(rollFormula('1d20')).rejects.toThrow('random.org did not answer, so no dice were rolled: offline')
    expect(get(rollStore)).toEqual([])
  })

  it('posts the roll to the campaign in scope instead of the local log', async () => {
    dieFalls([7])
    signedIn('lars', 'Lars')
    currentCampaignId.set('camp-1')

    await rollFormula('1d20')

    expect(wire.posted).toMatchObject([{ campaignId: 'camp-1', entry: { kind: 'roll', formula: '1d20', dice: [7], roll: 7, total: 7, is_hidden: false } }])
    expect(get(rollStore)).toEqual([])
  })
})

describe('ui actions', () => {
  afterEach(() => {
    setUIActionDispatcher(null)
    currentCharacterId.set(null)
  })

  it('opens the theme and the sources anywhere, and holds the character actions until a sheet is open', () => {
    expect(getUIActionBlock('openThemeDialog', null)).toBe('')
    expect(getUIActionBlock('openSourceImport', null)).toBe('')
    expect(getUIActionBlock('openLevelUpDialog', null)).toBe('Open a character first.')
    expect(getUIActionBlock('openFrameDialog', null)).toBe('Open a character first.')
    expect(getUIActionBlock('exportCharacter', null)).toBe('Open a character first.')
    expect(getUIActionBlock('exportCharacter', 'sheet-1')).toBe('')
  })

  it('routes an action to the dispatcher by the one name, and says why when it cannot', () => {
    const opened: UIAction[] = []
    expect(postUIAction('openThemeDialog')).toBe('The dialogs are not mounted.')

    setUIActionDispatcher((action) => opened.push(action))
    expect(postUIAction('openThemeDialog')).toBe('')
    expect(postUIAction('exportCharacter')).toBe('Open a character first.')

    currentCharacterId.set('sheet-1')
    expect(postUIAction('exportCharacter')).toBe('')
    expect(opened).toEqual(['openThemeDialog', 'exportCharacter'])
  })

  it('opens the level up dialog from the chat command under the name the dialogs listen for', async () => {
    const opened: UIAction[] = []
    setUIActionDispatcher((action) => opened.push(action))
    currentCharacterId.set('sheet-1')

    await detectAction('level up')

    expect(opened).toEqual(['openLevelUpDialog'])
  })
})

describe('character answers', () => {
  const core = dnd5e as unknown as RuleSystem
  const resolve = (character: Character) => getResolvedCharacter(core, getSheet(character, core))

  it('reads the stats off the resolved sheet rather than a canned card', () => {
    const message = getStatsMessage(lars, resolve(lars))

    expect(message).toContain('Armor Class: 15')
    expect(message).toContain('Hit Points: 42/42')
    expect(message).toContain('Initiative: 4')
    expect(message).toContain('Dexterity 18 (+4)')
    expect(message).not.toContain('45/45')
  })

  it('calls an item unused when it is neither equipped nor behind an action, heaviest first', () => {
    const unused = getUnusedItems({
      ...lars,
      actions: [...lars.actions, { name: 'Pick a lock', layout: 'Special', type: 'Action', itemId: 'thieves-tools' }]
    })

    expect(unused.map((item) => item.id)).toEqual(['explorers-pack', 'ammunition'])
    expect(getUnusedItemsMessage(lars)).toContain("Explorer's Pack")
  })

  it('lists the combat actions from the sheet, grouped by the action they cost', () => {
    const message = getCombatActionsMessage(lars)

    expect(message).toContain('**Hand Cannon Attack** — +7 to hit, 1d8+4 piercing, 60/180 ft')
    expect(message.indexOf('**Bonus Actions**')).toBeLessThan(message.indexOf('**Reactions**'))
    expect(message).toContain('**Covering Fire**')
  })

  it('lists the spells by level with the slots still left', () => {
    const caster: Character = {
      ...lars,
      info: { ...lars.info, spells: { modifier: 'Intelligence', slots: { 1: 2, 2: 1 }, expended: { 2: 1 } } },
      spells: [
        { id: 'bolt', title: 'Fire Bolt', level: 0, prepared: true, attack: true },
        { id: 'shield', title: 'Shield', level: 1, prepared: true },
        { id: 'web', title: 'Web', level: 2, prepared: false }
      ]
    }

    const message = getSpellsMessage(caster)

    expect(message).toContain('• Level 1: 2/2')
    expect(message).toContain('• Level 2: 0/1')
    expect(message).toContain('**Level 2 (no slots left)**')
    expect(message).toContain('**Web** *(not prepared)*')
    expect(getSpellsMessage(lars)).toContain('has no spells on the sheet')
  })

  it('recommends only feats the character lacks and qualifies for, the ones that fit first', () => {
    const feats: SourceFeat[] = [
      { id: 'tough', name: 'Tough', type: 'feat', description: 'More HP', prerequisites: [], tags: ['feat', 'hp'] },
      { id: 'sharpshooter', name: 'Sharpshooter', type: 'feat', description: 'Far shots', prerequisites: [], tags: ['feat', 'ranged'] },
      { id: 'war_caster', name: 'War Caster', type: 'feat', description: 'Casts in melee', prerequisites: [{ type: 'feature', value: 'spellcasting' }], tags: ['feat', 'spellcasting'] },
      { id: 'asi', name: 'Ability Score Improvement', type: 'feat', description: '+2', prerequisites: [], tags: ['core'] },
      { id: 'lucky', name: 'Lucky', type: 'feat', description: 'Rerolls', prerequisites: [], tags: ['feat'] }
    ]

    const picks = getFeatRecommendations({ ...lars, feats: [...lars.feats, { id: 'lucky', level: 4, source: 'optional', title: 'Lucky', description: '' }] }, feats)

    expect(picks.map((one) => one.feat.name)).toEqual(['Sharpshooter', 'Tough'])
    expect(picks[0].reason).toBe('you attack at range')
  })

  it('names the scores one point short of a better modifier by the system formula', () => {
    const odd: Character = { ...lars, abilities: lars.abilities.map((one) => (one.id === 'str' ? { ...one, score: 13 } : one)) }

    expect(getBuildMessage(odd, resolve(odd))).toContain('One point from a better modifier:** Strength 13')
    expect(getBuildMessage(lars, resolve(lars))).toContain('No score sits one point from a better modifier.')
    const fourth: Character = { ...lars, info: { ...lars.info, level: 4 } }
    expect(getBuildMessage(fourth, resolve(fourth))).toContain('**Level 5** raises the proficiency bonus to +3.')
    expect(getBuildMessage(lars, resolve(lars))).not.toContain('raises the proficiency bonus')
  })

  it('finds an inventory item by its exact title before a partial one', () => {
    const inventory = [
      { ...lars.inventory[2], id: 'arrows-magic', title: 'Ammunition +1' },
      lars.inventory[2]
    ]

    expect(getInventoryItem(inventory, 'ammunition')?.id).toBe('ammunition')
    expect(getInventoryItem(inventory, '+1')?.id).toBe('arrows-magic')
    expect(getInventoryItem(inventory, '  ')).toBeUndefined()
  })
})

describe('the roll log aboard a vehicle', () => {
  it('rolls into the campaign the vessel sails in', async () => {
    const { currentRoute } = await import('sly-svelte-location-router')
    const log = getChatLog()
    close = log.unsubscribeChat

    ;(currentRoute as unknown as Writable<unknown>).set({ path: '/main/vehicles/ship-1', params: { id: 'ship-1' } })
    await Promise.resolve()
    await Promise.resolve()

    expect(get(currentCampaignId)).toBe('camp-9')
    ;(currentRoute as unknown as Writable<unknown>).set(null)
  })
})
