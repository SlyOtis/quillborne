import { describe, expect, it } from 'vitest'
import dnd5e from '../../../public/sources/systems/monsters/dnd5e.json'
import srd from '../../../public/sources/monsters/srd-5.2.json'
import type { EncounterCombatant } from '../api/types'
import {
  getBestiaryCombatants,
  getBestiaryMissing,
  getCombatantNames,
  getDifficulty,
  getEmptyFilter,
  getHitDice,
  getMonsterAction,
  getMonsterBlock,
  getMonsterOrigins,
  getMonsterStats,
  getRechargeKeys,
  getRolledHitPoints,
  getTurnSpent,
  HOMEBREW,
  isMonsterShown,
  LEGENDARY,
  MINE
} from './monster'
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
    isMonsterShown(cultist, cultist.stats, block, tags, [], { ...getEmptyFilter(), ...change })

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

describe('a monster action', () => {
  const entry = srd.monsters.find((one) => one.slug === 'adult-red-dragon')!
  const dragon = { ...entry, stats: getMonsterStats(system, entry.stats) }
  const scaled = getMonsterBlock(system, dragon)
  const action = (name: string) => getMonsterAction(system, scaled, dragon.stats.features.actions.find((one) => one.name === name)!)

  it("works out the Adult Red Dragon's Rend at +14 for 13 slashing and 5 fire", () => {
    const rend = action('Rend')
    expect(rend.attack).toBe(14)
    expect(rend.hit).toEqual([
      { dice: 1, die: 10, flat: 8, average: 13, type: 'Slashing' },
      { dice: 2, die: 4, flat: 0, average: 5, type: 'Fire' }
    ])
  })

  it('works out its Fire Breath at DC 21 for 59 fire, a Recharge 5-6 halved on a success', () => {
    const breath = action('Fire Breath')
    expect([breath.attack, breath.dc]).toEqual([null, 21])
    expect(breath.failure).toEqual([{ dice: 17, die: 6, flat: 0, average: 59, type: 'Fire' }])
    expect(dragon.stats.features.actions.find((one) => one.name === 'Fire Breath')?.recharge).toBe(5)
    expect([dragon.stats.legendary_uses, dragon.stats.legendary_lair_uses]).toEqual([3, 4])
  })

  const goblin = {
    size: 'small',
    type: 'humanoid',
    alignment: 'unaligned',
    challenge: 0.25,
    stats: getMonsterStats(system, {
      abilities: { str: 8, dex: 14, con: 6 },
      hit_dice: 2,
      features: { actions: [{ name: 'Club', text: '', attack: { ability: 'str', bonus: 0, reach: 5, damage: [{ dice: 1, die: 4, bonus: 0, type: 'bludgeoning', ability: true }] } }] }
    })
  }
  const block = getMonsterBlock(system, goblin)

  it("takes a negative strength off a club's to-hit and damage", () => {
    const club = getMonsterAction(system, block, goblin.stats.features.actions[0])
    expect(club.attack).toBe(1)
    expect(club.dc).toBeNull()
    expect(club.hit).toEqual([{ dice: 1, die: 4, flat: -1, average: 1, type: 'Bludgeoning' }])
  })

  it('never averages a damage line below nothing', () => {
    const weak = getMonsterAction(system, block, {
      name: 'Slap',
      text: '',
      attack: { ability: 'str', bonus: 0, reach: 5, range: 0, long_range: 0, damage: [{ dice: 1, die: 4, bonus: -3, type: 'bludgeoning', ability: false }] }
    })
    expect(weak.hit[0].average).toBe(0)
  })

  it('rolls hit points as the dice rolled plus the constitution per die, and never below one', () => {
    expect(block.hitBonus).toBe(-4)
    expect(getRolledHitPoints(system, block, 9)).toBe(5)
    expect(getRolledHitPoints(system, block, 3)).toBe(1)
  })

  it("reads a feature's attack, save and uses defensively, dropping what is not a number or a list", () => {
    const stats = getMonsterStats(system, {
      legendary_uses: '3',
      features: {
        actions: [
          { name: 'Bite', text: 'It bites.' },
          { name: 'Odd', text: '', attack: { ability: 'str', bonus: '2', damage: 'fire' }, recharge: '5', uses: 0 },
          { name: 'Hollow', text: '', save: { ability: 'dex', damage: [{ die: null, type: 4 }] }, cost: 2 }
        ]
      }
    })
    const [bite, odd, hollow] = stats.features.actions
    expect(bite).toEqual({ name: 'Bite', text: 'It bites.' })
    expect(odd.attack).toEqual({ ability: 'str', bonus: 0, reach: 0, range: 0, long_range: 0, damage: [] })
    expect(odd.recharge).toBeUndefined()
    expect(odd.uses).toBeUndefined()
    expect(hollow.save?.damage).toEqual([{ dice: 0, die: 0, bonus: 0, type: '', ability: false }])
    expect(hollow.save?.half).toBe(false)
    expect(hollow.cost).toBe(2)
    expect(stats.legendary_uses).toBeUndefined()
  })
})

describe('the difficulty of a fight', () => {
  const xp = (...challenges: number[]) => challenges.reduce((sum, one) => sum + (system.challenges.find((cr) => cr.value === one)?.xp ?? 0), 0)
  const four = (level: number) => [level, level, level, level]
  const named = (levels: number[], spent: number) => getDifficulty(system, levels, spent).difficulty?.name

  it('four goblin warriors are a low fight for four 5th level characters', () => {
    const fight = getDifficulty(system, four(5), xp(0.25, 0.25, 0.25, 0.25))
    expect(fight.budgets.map((one) => [one.id, one.value])).toEqual([
      ['low', 2000],
      ['moderate', 3000],
      ['high', 4400]
    ])
    expect([fight.xp, fight.difficulty?.name]).toEqual([200, 'Low'])
  })

  it('a budget holds XP equal to it', () => {
    expect(named(four(5), xp(4, 3, 1))).toBe('Low')
  })

  it('a CR 5 and a CR 3 are moderate, two CR 5 high and three beyond four 5th level characters', () => {
    expect(named(four(5), xp(5, 3))).toBe('Moderate')
    expect(named(four(5), xp(5, 5))).toBe('High')
    expect(named(four(5), xp(5, 5, 5))).toBe('Beyond High')
  })

  it("a mixed party sums each character's own budget", () => {
    expect(getDifficulty(system, [1, 1, 5, 5], 0).budgets.map((one) => one.value)).toEqual([1100, 1650, 2400])
    expect(named([1, 1, 5, 5], xp(5))).toBe('High')
  })

  it('the Adult Red Dragon is beyond four 10th level characters and low for four 20th level ones', () => {
    expect(named(four(10), xp(17))).toBe('Beyond High')
    expect(named(four(20), xp(17))).toBe('Low')
  })

  it('an empty party and an empty fight have no difficulty', () => {
    expect(getDifficulty(system, [], xp(5)).difficulty).toBeNull()
    expect(getDifficulty(system, four(5), 0).difficulty).toBeNull()
  })

  it('a level outside 1 to 20 counts as the nearest level with a budget', () => {
    expect(getDifficulty(system, [0, 21], 0).budgets.map((one) => one.value)).toEqual([6450, 13275, 22100])
  })
})

describe('the source filter', () => {
  const block = getMonsterBlock(system, cultist)
  const shown = (origins: string[], source: string) => isMonsterShown(cultist, cultist.stats, block, [], origins, { ...getEmptyFilter(), source })
  const campaign = 'c0ffee00-0000-4000-8000-000000000001'

  it('an empty source shows every monster', () => {
    expect(shown(['srd-5.2'], '')).toBe(true)
    expect(shown([HOMEBREW], '')).toBe(true)
  })

  it('the SRD source shows its documents and no row, and homebrew the rows and no SRD document', () => {
    expect(shown(['srd-5.2'], 'srd-5.2')).toBe(true)
    expect(shown([HOMEBREW], 'srd-5.2')).toBe(false)
    expect(shown([HOMEBREW], HOMEBREW)).toBe(true)
    expect(shown(['srd-5.2'], HOMEBREW)).toBe(false)
  })

  it("mine shows only the reader's own monsters, and a campaign only the monsters in its bestiary", () => {
    expect(getMonsterOrigins({ user_id: 'testy', owner_id: 'knights' }, 'testy', [campaign])).toEqual([HOMEBREW, MINE])
    expect(getMonsterOrigins({ user_id: 'pip', owner_id: 'knights' }, 'testy', [campaign])).toEqual([HOMEBREW])
    expect(getMonsterOrigins({ user_id: 'pip', owner_id: campaign }, 'testy', [campaign])).toEqual([campaign])
    expect(shown([HOMEBREW], MINE)).toBe(false)
    expect(shown([campaign], campaign)).toBe(true)
    expect(shown([HOMEBREW], campaign)).toBe(false)
  })

  it('a monster is shown under each source it belongs to', () => {
    const origins = getMonsterOrigins({ user_id: 'testy', owner_id: campaign }, 'testy', [campaign])
    expect(shown(origins, MINE)).toBe(true)
    expect(shown(origins, campaign)).toBe(true)
    expect(shown(origins, HOMEBREW)).toBe(false)
  })
})

describe('monsters joining a fight', () => {
  it('four goblins added to an empty fight are Goblin Warrior 1 to 4, and one alone keeps its name', () => {
    expect(getCombatantNames('Goblin Warrior', 4, [])).toEqual(['Goblin Warrior 1', 'Goblin Warrior 2', 'Goblin Warrior 3', 'Goblin Warrior 4'])
    expect(getCombatantNames('Goblin Warrior', 1, ['Wren Ashdown'])).toEqual(['Goblin Warrior'])
  })

  it('goblins added after Goblin Warrior 2 continue at 3, filling no gap, and an unnamed one counts as the first', () => {
    expect(getCombatantNames('Goblin Warrior', 2, ['Goblin Warrior 2'])).toEqual(['Goblin Warrior 3', 'Goblin Warrior 4'])
    expect(getCombatantNames('Goblin Warrior', 1, ['Goblin Warrior'])).toEqual(['Goblin Warrior 2'])
  })

  it("numbers on another monster's combatants are not counted", () => {
    expect(getCombatantNames('Goblin Warrior', 2, ['Goblin Warrior Boss', 'Bandit 7', 'Goblin Warrior Boss 3'])).toEqual(['Goblin Warrior 1', 'Goblin Warrior 2'])
  })
})

describe("the start of a monster's turn", () => {
  const stats = getMonsterStats(system, {
    legendary_uses: 3,
    features: {
      actions: [
        { name: 'Fire Breath', text: '', recharge: 5 },
        { name: 'Scorching Ray', text: '', uses: 2 }
      ]
    }
  })
  const spent = { 'actions.Fire Breath': 1, 'actions.Scorching Ray': 1, [LEGENDARY]: 2 }

  it('asks a d6 of each spent recharge alone', () => {
    expect(getRechargeKeys(stats, spent)).toEqual(['actions.Fire Breath'])
    expect(getRechargeKeys(stats, {})).toEqual([])
  })

  it("a monster's turn clears its spent legendary actions", () => {
    expect(getTurnSpent(system, stats, spent, {})).toEqual({ 'actions.Fire Breath': 1, 'actions.Scorching Ray': 1 })
  })

  it('a spent Recharge 5-6 returns on a 5 and stays spent on a 4, and uses per day are not restored', () => {
    expect(getTurnSpent(system, stats, spent, { 'actions.Fire Breath': 5 })).toEqual({ 'actions.Scorching Ray': 1 })
    expect(getTurnSpent(system, stats, spent, { 'actions.Fire Breath': 4 })).toEqual({ 'actions.Fire Breath': 1, 'actions.Scorching Ray': 1 })
  })
})

describe('the campaign bestiary at the end of a fight', () => {
  const fighter = (id: string, name: string, more: Partial<EncounterCombatant> = {}): EncounterCombatant => ({
    id,
    name,
    kind: 'monster',
    modifier: 0,
    initiative: 0,
    hit_points: 1,
    max_hit_points: 1,
    conditions: [],
    is_hit_points_known: false,
    ...more
  })
  const goblins = [1, 2, 3, 4].map((at) => fighter(`g${at}`, `Goblin Warrior ${at}`, { monster_slug: 'goblin-warrior' }))
  const names = Object.fromEntries(goblins.map((one) => [one.id, 'Goblin Warrior']))

  it('ending a fight copies each monster into the bestiary once and points every one of its combatants at the copy', () => {
    expect(getBestiaryMissing(Object.values(names), [])).toEqual(['Goblin Warrior'])
    const pointed = getBestiaryCombatants(goblins, names, [{ id: 'copy-1', name: 'Goblin Warrior' }])
    expect(pointed.map((one) => [one.monster_id, one.monster_slug])).toEqual(Array(4).fill(['copy-1', undefined]))
  })

  it('a monster the campaign already holds by name, in any case, is not copied again', () => {
    expect(getBestiaryMissing(['Goblin Warrior', 'Owlbear'], [{ name: 'goblin warrior ' }])).toEqual(['Owlbear'])
  })

  it("characters, NPCs and combatants already on the campaign's copy are left alone", () => {
    const hero = { ...fighter('h', 'Wren Ashdown'), kind: 'character' as const, character_id: 'wren' }
    const bandit = { ...fighter('b', 'Bandit'), kind: 'npc' as const }
    const kept = fighter('k', 'Cinder Hound', { monster_id: 'hound' })
    const pointed = getBestiaryCombatants([hero, bandit, kept], { k: 'Cinder Hound' }, [{ id: 'hound', name: 'Cinder Hound' }])
    expect(pointed).toEqual([hero, bandit, kept])
    expect(getBestiaryMissing(['Cinder Hound'], [{ name: 'Cinder Hound' }])).toEqual([])
  })
})
