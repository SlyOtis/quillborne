import { describe, expect, it } from 'vitest'
import dnd5e from '../../../public/sources/systems/monsters/dnd5e.json'
import { getEmptyFilter, getHitDice, getMonsterBlock, getMonsterStats, isMonsterShown } from './monster'
import type { MonsterSystem } from './monster.types'

const system = dnd5e as unknown as MonsterSystem

const cultist = {
  name: 'Aberrant Cultist',
  size: 'medium',
  type: 'humanoid',
  alignment: 'neutral-evil',
  challenge: 8,
  stats: getMonsterStats(system, {
    ac: 14,
    hit_dice: 25,
    abilities: { str: 11, dex: 18, con: 12, int: 10, wis: 18, cha: 14 },
    saves: ['wis'],
    skills: { perception: 1, insight: 2 },
    initiative: 1,
    senses: { darkvision: 90 },
    resistances: ['psychic'],
    habitats: ['underdark'],
    flags: ['lair']
  })
}

describe('a monster stat block', () => {
  const block = getMonsterBlock(system, cultist)
  const ability = (id: string) => block.abilities.find((one) => one.id === id)!

  it('works out every figure from the system formulas', () => {
    expect(ability('dex').mod).toBe(4)
    expect(ability('wis').save).toBe(7)
    expect(ability('str').save).toBe(0)
    expect(block.skills.map((one) => [one.id, one.value])).toEqual([
      ['insight', 10],
      ['perception', 7]
    ])
    expect(block.passivePerception).toBe(17)
    expect([block.initiative, block.initiativeScore]).toEqual([7, 17])
    expect([block.hitPoints, block.hitDie, block.hitBonus]).toEqual([137, 8, 25])
    expect([block.challenge?.name, block.challenge?.xp, block.prof]).toEqual(['8', 3900, 3])
    expect(block.senses).toEqual([{ id: 'darkvision', name: 'Darkvision', value: 90 }])
  })

  it('writes the hit dice with the constitution bonus, and without one when it is nothing', () => {
    expect(getHitDice(cultist.stats.hit_dice, block)).toBe('25d8 + 25')
    expect(getHitDice(4, { hitDie: 10, hitBonus: 0 })).toBe('4d10')
    expect(getHitDice(2, { hitDie: 6, hitBonus: -2 })).toBe('2d6 - 2')
  })

  it('fills what a stored block leaves out from the system defaults', () => {
    const empty = getMonsterStats(system, {})
    expect(empty.abilities.con).toBe(10)
    expect(empty.speeds).toEqual({ walk: 30 })
    expect(Object.keys(empty.features)).toEqual(system.features.map((one) => one.id))
  })
})

describe('the monster filters', () => {
  const block = getMonsterBlock(system, cultist)
  const shown = (change: Partial<ReturnType<typeof getEmptyFilter>>, tags: string[] = []) =>
    isMonsterShown(cultist, cultist.stats, block, tags, { ...getEmptyFilter(), ...change })

  it('narrows by type, challenge, flags, defences, senses and tags', () => {
    expect(shown({})).toBe(true)
    expect(shown({ name: 'cult', type: 'humanoid', challengeMin: 5, challengeMax: 10 })).toBe(true)
    expect(shown({ type: 'dragon' })).toBe(false)
    expect(shown({ challengeMax: 1 })).toBe(false)
    expect(shown({ flags: { lair: 'yes', legendary: 'no' } })).toBe(true)
    expect(shown({ flags: { legendary: 'yes' } })).toBe(false)
    expect(shown({ resistance: 'psychic', sense: 'darkvision', habitat: 'underdark' })).toBe(true)
    expect(shown({ sense: 'truesight' })).toBe(false)
    expect(shown({ hpMin: 140 })).toBe(false)
    expect(shown({ tag: 'npc' }, ['npc'])).toBe(true)
    expect(shown({ tag: 'npc' })).toBe(false)
  })
})
