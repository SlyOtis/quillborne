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
  postLongRest,
  postShortRest,
  putCondition,
  putDamage,
  putDeathSave,
  putHealing,
  putItem,
  putSlots,
  putTemporaryHitPoints
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
    const derived = (id: string) => rules(store).derived.find((entry) => entry.id === id)?.value

    expect(derived('spellSaveDc')).toBe(13)
    expect(derived('spellAttack')).toBe(5)
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

  it('removes an item whose quantity reaches zero and unequips it', () => {
    const { store } = opened()
    const item = {
      id: 'rope', title: 'Rope', type: 'misc' as const, rarity: 'common' as const, attributes: [], description: '',
      value: { amount: 1, currency: 'gp' as const }, weight: 10, quantity: 2, equippable: true, equipped: false
    }
    postItem(item)
    store.equipped.set([{ id: 'rope', title: 'Rope', type: 'misc' }])
    putItem({ ...item, quantity: 1 })
    expect(get(store.inventory)[0].quantity).toBe(1)

    putItem({ ...item, quantity: 0 })
    expect(get(store.inventory)).toEqual([])
    expect(get(store.equipped)).toEqual([])
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
