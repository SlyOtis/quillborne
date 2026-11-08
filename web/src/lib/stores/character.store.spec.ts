import type { Character } from '../api/types'
import { describe, expect, it } from 'vitest'
import { getRecentCharacters, getRecentFirst } from './character.store'

describe('recent characters', () => {
  it('puts the opened character first, once, and keeps eight', () => {
    expect(getRecentCharacters([], 'a')).toEqual(['a'])
    expect(getRecentCharacters(['b', 'a', 'c'], 'a')).toEqual(['a', 'b', 'c'])
    expect(getRecentCharacters(['1', '2', '3', '4', '5', '6', '7', '8'], 'x')).toEqual(['x', '1', '2', '3', '4', '5', '6', '7'])
  })

  it('orders the roll by recency and leaves the unopened in their stored order', () => {
    const roll = ['a', 'b', 'c', 'd'].map((id) => ({ id }) as Character)

    expect(getRecentFirst(roll, ['c', 'a']).map((one) => one.id)).toEqual(['c', 'a', 'b', 'd'])
    expect(getRecentFirst(roll, []).map((one) => one.id)).toEqual(['a', 'b', 'c', 'd'])
  })
})
