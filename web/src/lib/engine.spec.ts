import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { get } from 'svelte/store'
import type { Character } from './character.types'

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
    updates: [] as Array<{ id: string, character: Character }>,
    refuse: false
  }
})

vi.mock('./api', () => ({
  putCharacter: (id: string, character: Character) => {
    if (wire.refuse) return Promise.reject(new Error('permission-denied'))
    wire.updates.push({ id, character })
    return Promise.resolve()
  },
  postCampaignChat: () => Promise.resolve('entry-1'),
  getUserName: () => ''
}))

vi.mock('./dice', () => ({
  postThrow: () => Promise.resolve()
}))

import dnd5e from '../../public/sources/systems/dnd5e.json'
import { getResolvedCharacter } from './rules/derive'
import { getSheet } from './rules/sheet'
import { getItemGrants } from './resources'
import type { RuleSystem } from './rules/spec.types'
import {
  applyStateToCharacter,
  characterWriteError,
  deleteCondition,
  deleteItem,
  getCharacterStore,
  getEmptyCharacter,
  postCast,
  postItem,
  postItemCast,
  postItemUse,
  postLongRest,
  postRecharge,
  postShortRest,
  putCondition,
  putDamage,
  putDeathSave,
  putHealing,
  putItem,
  putSlots,
  putTemporaryHitPoints,
  setCharacterReadOnly
} from './engine'

const vault = (): Character => {
  const character = getEmptyCharacter()
  character.info.name = 'Testy'
  character.info.hp = { current: 22, max: 30, temporary: 0 }
  return character
}

let sheet = 0

const opened = () => {
  sheet += 1
  const store = getCharacterStore(`char-${sheet}`, vault())
  applyStateToCharacter(vault(), true)
  return { id: `char-${sheet}`, store }
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.spyOn(console, 'error').mockImplementation(() => undefined)
  getCharacterStore('local')
  wire.updates.length = 0
  wire.refuse = false
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('a sheet edit reaching the character document', () => {
  it('writes nothing while the sheet is only opening', () => {
    getCharacterStore('char-opening', vault())
    vi.advanceTimersByTime(2000)

    expect(wire.updates).toEqual([])
  })

  it('writes nothing back for the document the sheet was loaded from', () => {
    opened()
    vi.advanceTimersByTime(2000)

    expect(wire.updates).toEqual([])
  })

  it('writes one document for one slider drag, carrying the value the drag settled on', () => {
    const { id, store } = opened()

    for (const current of [21, 19, 16, 14, 12]) {
      store.info.update((info) => ({ ...info, hp: { ...info.hp, current } }))
      vi.advanceTimersByTime(100)
    }
    expect(wire.updates).toEqual([])

    vi.advanceTimersByTime(600)

    expect(wire.updates).toHaveLength(1)
    expect(wire.updates[0].id).toBe(id)
    expect(wire.updates[0].character.info.hp.current).toBe(12)
    expect(wire.updates[0].character.info.name).toBe('Testy')
  })

  it('writes the whole character, so the second browser reads every part back', () => {
    const { store } = opened()

    store.info.update((info) => ({ ...info, ac: 15 }))
    vi.advanceTimersByTime(600)

    expect(Object.keys(wire.updates[0].character).sort()).toEqual(Object.keys(getEmptyCharacter()).sort())
    expect(wire.updates[0].character.info.ac).toBe(15)
  })

  it('writes a state once, not again on the next settle', async () => {
    const { store } = opened()

    store.info.update((info) => ({ ...info, ac: 15 }))
    await vi.advanceTimersByTimeAsync(600)
    store.info.update((info) => ({ ...info, ac: 15 }))
    await vi.advanceTimersByTimeAsync(600)

    expect(wire.updates).toHaveLength(1)
  })

  it('flushes a pending edit before the sheet turns to another character', () => {
    const { id, store } = opened()

    store.info.update((info) => ({ ...info, ac: 15 }))
    getCharacterStore('char-next', vault())

    expect(wire.updates.map((entry) => entry.id)).toEqual([id])
  })

  it('never writes a sheet held read only, and writes again once the next sheet opens', () => {
    const { store } = opened()
    setCharacterReadOnly(true)

    store.info.update((info) => ({ ...info, ac: 15 }))
    vi.advanceTimersByTime(2000)
    expect(wire.updates).toEqual([])

    const next = opened()
    next.store.info.update((info) => ({ ...info, ac: 16 }))
    vi.advanceTimersByTime(600)

    expect(wire.updates.map((entry) => entry.id)).toEqual([next.id])
  })

  it('never writes the local sheet, which lives in this browser alone', () => {
    const store = getCharacterStore('local')

    store.info.update((info) => ({ ...info, ac: 15 }))
    vi.advanceTimersByTime(2000)

    expect(wire.updates).toEqual([])
  })

  it('raises the alarm when the vault refuses the write, and clears it when the next lands', async () => {
    const { store } = opened()

    wire.refuse = true
    store.info.update((info) => ({ ...info, ac: 15 }))
    await vi.advanceTimersByTimeAsync(600)
    expect(get(characterWriteError)).toBe('That change did not reach the vault. The next change tries again.')

    wire.refuse = false
    store.info.update((info) => ({ ...info, ac: 16 }))
    await vi.advanceTimersByTimeAsync(600)

    expect(get(characterWriteError)).toBe('')
    expect(wire.updates).toHaveLength(1)
    expect(wire.updates[0].character.info.ac).toBe(16)
  })
})

const system = dnd5e as unknown as RuleSystem

const rules = (store: ReturnType<typeof getCharacterStore>) => {
  const character = Object.fromEntries(
    Object.entries(store).filter(([key]) => key !== 'unsubscribe').map(([key, value]) => [key, get(value as any)])
  ) as unknown as Character
  return getResolvedCharacter(system, getSheet(character, system))
}

const hp = (store: ReturnType<typeof getCharacterStore>) => get(store.info).hp

describe('hit points taken and given back', () => {
  it('eats temporary hit points before the current ones', () => {
    const { store } = opened()
    putTemporaryHitPoints(5)
    putDamage(8)

    expect(hp(store)).toMatchObject({ current: 19, temporary: 0 })
  })

  it('never drops below zero', () => {
    const { store } = opened()
    putDamage(100)

    expect(hp(store).current).toBe(0)
  })

  it('caps healing at the maximum and clears the death saves', () => {
    const { store } = opened()
    store.info.update((info) => ({ ...info, hp: { ...info.hp, current: 0, deathSaves: { successes: 2, failures: 1 } } }))
    putHealing(100)

    expect(hp(store)).toMatchObject({ current: 30, deathSaves: { successes: 0, failures: 0 } })
  })

  it('replaces temporary hit points rather than stacking them', () => {
    const { store } = opened()
    putTemporaryHitPoints(6)
    putTemporaryHitPoints(4)

    expect(hp(store).temporary).toBe(4)
  })
})

describe('a death save rolled at zero hit points', () => {
  const dying = () => {
    const opening = opened()
    opening.store.info.update((info) => ({ ...info, hp: { ...info.hp, current: 0 } }))
    return opening.store
  }

  it('counts ten or more as a success and less as a failure', () => {
    const store = dying()
    putDeathSave(10, rules(store).scope)
    putDeathSave(9, rules(store).scope)

    expect(hp(store).deathSaves).toEqual({ successes: 1, failures: 1 })
  })

  it('counts a natural one as two failures and stops at three', () => {
    const store = dying()
    putDeathSave(1, rules(store).scope)
    putDeathSave(1, rules(store).scope)

    expect(hp(store).deathSaves).toEqual({ successes: 0, failures: 3 })
  })

  it('brings the character back with one hit point on a natural twenty', () => {
    const store = dying()
    putDeathSave(5, rules(store).scope)
    putDeathSave(20, rules(store).scope)

    expect(hp(store)).toMatchObject({ current: 1, deathSaves: { successes: 0, failures: 0 } })
  })
})

describe('spell slots spent and restored', () => {
  const caster = () => {
    const opening = opened()
    opening.store.info.update((info) => ({ ...info, spells: { modifier: 'wis', slots: { 1: 2, 2: 1 } } }))
    return opening.store
  }

  it('spends one slot of the level a spell is cast at, and refuses when none is left', async () => {
    const store = caster()
    const spell = { id: 'bless', title: 'Bless', level: 1, prepared: true }

    expect(await postCast(spell, 2, 0)).toBe(true)
    expect(await postCast(spell, 2, 0)).toBe(false)
    expect(get(store.info).spells?.expended).toEqual({ 2: 1 })
  })

  it('spends no slot for a cantrip', async () => {
    const store = caster()

    expect(await postCast({ id: 'light', title: 'Light', level: 0, prepared: true }, 0, 0)).toBe(true)
    expect(get(store.info).spells?.expended).toBeUndefined()
  })

  it('clamps a pip toggle between none and the level maximum', () => {
    const store = caster()
    putSlots(5, 1)
    expect(get(store.info).spells?.expended?.[1]).toBe(2)
    putSlots(-1, 1)
    expect(get(store.info).spells?.expended?.[1]).toBe(0)
  })

  it('reads the save DC and the attack bonus off the spellcasting ability', () => {
    const store = caster()
    store.abilities.set([{ id: 'wisdom', title: 'Wisdom', score: 16, modifier: 3 }])
    const { scope } = rules(store)

    expect(scope['derived.spellSaveDc']).toBe(13)
    expect(scope['derived.spellAttack']).toBe(5)
  })
})

describe('resting', () => {
  const tired = () => {
    const opening = opened()
    opening.store.info.update((info) => ({
      ...info,
      level: 4,
      class: { name: 'Cleric', hitDice: { amount: 4, die: 8 } },
      hp: { current: 5, max: 30, temporary: 3, hitDiceSpent: 3, deathSaves: { successes: 1, failures: 1 } },
      spells: { modifier: 'wis', slots: { 1: 4 }, expended: { 1: 3 } },
      slots: { title: 'Pact', description: '', amount: 2, expended: 2, regainedAt: 'short rest' }
    }))
    opening.store.special.set({ name: 'Channel Divinity', regain: 'Short rest', current: 0, max: 1 })
    return opening.store
  }

  it('spends hit dice on a short rest, never more than remain, and heals what they roll', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, text: async () => '6\n' })))
    const store = tired()
    const { spend, healing } = await postShortRest(3, rules(store))
    vi.unstubAllGlobals()

    expect(spend).toBe(1)
    expect(healing).toBe(6)
    expect(hp(store)).toMatchObject({ current: 11, hitDiceSpent: 4 })
    expect(get(store.info).slots?.expended).toBe(0)
    expect(get(store.info).spells?.expended).toEqual({ 1: 3 })
    expect(get(store.special).current).toBe(1)
  })

  it('restores hit points, slots and half the hit dice on a long rest', () => {
    const store = tired()
    postLongRest(rules(store))

    expect(hp(store)).toMatchObject({ current: 30, temporary: 0, hitDiceSpent: 1, deathSaves: { successes: 0, failures: 0 } })
    expect(get(store.info).spells?.expended).toEqual({})
    expect(get(store.info).slots?.expended).toBe(0)
    expect(get(store.special).current).toBe(1)
  })
})

describe('conditions and items', () => {
  it('sets an exhaustion level on the one condition and removes it by title', () => {
    const { store } = opened()
    putCondition({ title: 'Exhaustion', level: 1 })
    putCondition({ title: 'Exhaustion', level: 2 })
    expect(get(store.info).conditions).toEqual([{ title: 'Exhaustion', level: 2 }])

    deleteCondition('exhaustion')
    expect(get(store.info).conditions).toEqual([])
  })

  it('removes an item whose quantity reaches zero', () => {
    const { store } = opened()
    const item = {
      id: 'rope', title: 'Rope', type: 'misc' as const, rarity: 'common' as const, attributes: [], description: '',
      value: { amount: 1, currency: 'gp' as const }, weight: 10, quantity: 2, equippable: true, equipped: false
    }
    postItem(item)
    putItem({ ...item, quantity: 1 })
    expect(get(store.inventory)[0].quantity).toBe(1)

    putItem({ ...item, quantity: 0 })
    expect(get(store.inventory)).toEqual([])
  })

  it('keeps one deletion path for an item', () => {
    const { store } = opened()
    postItem({
      id: 'torch', title: 'Torch', type: 'misc', rarity: 'common', attributes: [], description: '',
      value: { amount: 1, currency: 'cp' }, weight: 1, quantity: 1, equippable: false, equipped: false
    })
    deleteItem('torch')

    expect(get(store.inventory)).toEqual([])
  })
})

describe('charges and what an item does when used', () => {
  const core = dnd5e as RuleSystem
  const dice = (...faces: number[]) => vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, text: async () => faces.join('\n') + '\n' })))
  const wand = (spent: number) => ({
    id: 'wand', title: 'Wand of Magic Missiles', type: 'wand', rarity: 'uncommon' as const, attributes: [], description: '',
    value: { amount: 0, currency: 'gp' as const }, weight: 1, quantity: 1, equippable: true, equipped: true, spent,
    grants: getItemGrants({ spells: [{ name: 'Magic Missile', level: 1, charges: 1 }], charges: { max: 7, regain: '1d6 + 1', at: 'dawn' } })
  })
  const potion = (use: { roll: string, effect: string }) => ({
    id: 'potion', title: 'Potion of Healing', type: 'potion', rarity: 'common' as const, attributes: [], description: '',
    value: { amount: 50, currency: 'gp' as const }, weight: 0.5, quantity: 2, equippable: false, equipped: false, consumable: true,
    properties: { use }
  })
  const charged = (store: ReturnType<typeof getCharacterStore>) => get(store.inventory)[0].spent

  it('spends one charge of seven casting Magic Missile from the wand, and refuses a cast with none left', async () => {
    const { store } = opened()
    postItem(wand(0))
    expect(await postItemCast(wand(0), { name: 'Magic Missile', level: 1, charges: 1, note: '' })).toBe(true)
    expect(charged(store)).toBe(1)

    store.inventory.set([wand(7)])
    expect(await postItemCast(wand(7), { name: 'Magic Missile', level: 1, charges: 1, note: '' })).toBe(false)
    expect(charged(store)).toBe(7)
  })

  it('regains 1d6 + 1 at dawn: a roll of 4 gives back five, so three spent are all back and never past the seven', async () => {
    const { store } = opened()
    postItem(wand(3))
    dice(4)
    await postRecharge(['dawn'])
    vi.unstubAllGlobals()
    expect(charged(store)).toBe(0)
  })

  it('regains nothing for a dawn item on a short rest', async () => {
    const { store } = opened()
    postItem(wand(3))
    await postRecharge(['shortRest'])
    expect(charged(store)).toBe(3)
  })

  it('heals a Potion of Healing\'s 2d4 + 2, rolled 2 and 3, from 22 to 29 of 30, and spends one of the two', async () => {
    const { store } = opened()
    postItem(potion({ roll: '2d4 + 2', effect: 'heal' }))
    dice(2, 3)
    await postItemUse(potion({ roll: '2d4 + 2', effect: 'heal' }), core)
    vi.unstubAllGlobals()
    expect(hp(store).current).toBe(29)
    expect(get(store.inventory)[0].quantity).toBe(1)
  })

  it('grants temporary hit points with a temporary use, and takes them with a damage use', async () => {
    const { store } = opened()
    postItem(potion({ roll: '1d4', effect: 'temporary' }))
    dice(3)
    await postItemUse(potion({ roll: '1d4', effect: 'temporary' }), core)
    expect(hp(store).temporary).toBe(3)

    dice(4)
    await postItemUse(potion({ roll: '1d4', effect: 'damage' }), core)
    vi.unstubAllGlobals()
    expect(hp(store)).toMatchObject({ temporary: 0, current: 21 })
  })
})
