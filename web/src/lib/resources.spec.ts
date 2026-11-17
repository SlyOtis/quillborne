import { beforeEach, describe, expect, it, vi } from 'vitest'

const wire = vi.hoisted(() => ({
  steps: [] as string[],
  stored: {} as Record<string, Array<Record<string, unknown>>>,
  puts: [] as Array<{ id: string, values: Record<string, unknown> }>
}))

vi.mock('./api', () => ({
  getResources: (owner: { at: string, id: string }, kind: string) =>
    Promise.resolve(wire.stored[`${owner.at}/${owner.id}/${kind}`] ?? []),
  putResource: (id: string, values: Record<string, unknown>) => {
    wire.puts.push({ id, values })
    return Promise.resolve()
  },
  deleteResource: (id: string) => {
    wire.steps.push(`delete ${id}`)
    return Promise.resolve()
  },
  isStoredFile: (address: string) => address.startsWith('file:'),
  deleteFile: (address: string) => {
    wire.steps.push(`file ${address}`)
    return Promise.resolve()
  }
}))

vi.mock('./collab', () => ({
  dropDoc: (owner: { at: string, id: string }, part: string, id: string) => {
    wire.steps.push(`drop ${owner.at}/${owner.id}/${part}/${id}`)
    return Promise.resolve()
  }
}))

import dnd5e from '../../public/sources/systems/dnd5e.json'
import type { RuleSystem } from './rules/spec.types'
import { deleteOne, deleteResources, getBlank, getGrantLines, getItemGrants, getItemLine, type Resource } from './resources'


const one = (fields: Partial<Resource> = {}): Resource => ({ ...getBlank('entries', 'lars'), id: 'res-1', ...fields })

beforeEach(() => {
  wire.steps.length = 0
  wire.puts.length = 0
  wire.stored = {}
})

describe('deleteOne', () => {
  it('drops the shared document first, then the stored pictures, then the resource, at the stored collection', async () => {
    const held = one({ id: 'entry-1', image: 'file:a', images: ['file:a', 'file:b', 'https://example.test/c.png'] })

    await deleteOne({ at: 'campaign', id: 'camp-1' }, 'entries', held)

    expect(wire.steps).toEqual([
      'drop campaign/camp-1/entries/entry-1',
      'file file:a',
      'file file:b',
      'delete entry-1'
    ])
  })
})

describe('deleteResources', () => {
  it('deletes only what the named owner wrote, on every roll', async () => {
    wire.stored['campaign/camp-1/locations'] = [{ id: 'place-1', user_id: 'lars' }, { id: 'place-2', user_id: 'dis' }]
    wire.stored['campaign/camp-1/sessions'] = [{ id: 'session-1', user_id: 'lars' }]

    const count = await deleteResources({ at: 'campaign', id: 'camp-1' }, 'lars')

    expect(count).toBe(2)
    expect(wire.steps.filter((step) => step.startsWith('delete'))).toEqual([
      'delete place-1',
      'delete session-1'
    ])
  })
})

describe('getItemLine', () => {
  it('writes the type, the subtype, the rarity and who may attune, the way D&D Beyond does', () => {
    const lantern = { category: 'wondrous item', subtype: 'lantern', rarity: 'uncommon', attunement: true, attuned_by: 'by a wizard' } as const

    expect(getItemLine(lantern)).toBe('Wondrous item (lantern), uncommon (requires attunement by a wizard)')
    expect(getItemLine({ ...lantern, attuned_by: '' })).toBe('Wondrous item (lantern), uncommon (requires attunement)')
    expect(getItemLine({ ...lantern, subtype: '', attunement: false })).toBe('Wondrous item, uncommon')
  })
})

describe('getItemGrants', () => {
  it('reads every kind of grant, keeps a free named proficiency, and drops the rows that name nothing', () => {
    const grants = getItemGrants({
      attributes: [{ id: 'con', mode: 'bonus', value: '2', max: 20 }, { mode: 'set', value: 19 }],
      bonuses: [{ id: 'armorClass', value: 1 }],
      proficiencies: [{ name: 'longbow', tier: 'proficient' }, { tier: 'proficient' }],
      advantages: [{ id: 'skill.stealth', name: 'ignored', note: 'when moving silently' }],
      defences: [{ id: 'resistance', damage: 'poison' }, { id: 'immunity' }],
      senses: [{ id: 'darkvision', value: 60 }],
      speeds: [{ id: 'swim', value: 40 }],
      damage: [{ dice: '1d6', damage: 'poison' }, { damage: 'fire' }],
      spells: [{ name: 'Web', level: 2, charges: 2, dc: 15, attack: null }, { level: 1 }],
      features: [{ name: 'Crumbles', text: 'On a 1 it turns to dust.' }],
      charges: { max: 10, regain: '1d6 + 4', at: 'dusk', last: 'roll a d20' }
    })

    expect(grants).toEqual({
      attributes: [{ id: 'con', mode: 'bonus', value: 2, max: 20 }],
      bonuses: [{ id: 'armorClass', value: 1 }],
      proficiencies: [{ id: '', name: 'longbow', tier: 'proficient' }],
      advantages: [{ id: 'skill.stealth', name: '', note: 'when moving silently' }],
      defences: [{ id: 'resistance', damage: 'poison' }],
      senses: [{ id: 'darkvision', value: 60 }],
      speeds: [{ id: 'swim', value: 40 }],
      damage: [{ dice: '1d6', damage: 'poison', note: '' }],
      spells: [{ name: 'Web', level: 2, charges: 2, dc: 15, note: '' }],
      features: [{ name: 'Crumbles', text: 'On a 1 it turns to dust.' }],
      charges: { max: 10, regain: '1d6 + 4', at: 'dusk', last: 'roll a d20' }
    })
    expect(getItemGrants('not grants')).toEqual(getItemGrants({}))
  })

  it('writes the grants out with the names the system gives its ids', () => {
    const grants = getItemGrants({
      attributes: [{ id: 'str', mode: 'set', value: 19 }],
      bonuses: [{ id: 'saves', value: 1 }],
      defences: [{ id: 'resistance', damage: 'fire' }],
      spells: [{ name: 'Web', level: 2, charges: 2, dc: 15 }],
      charges: { max: 10, regain: '1d6 + 4', at: 'dusk' }
    })

    expect(getGrantLines(grants, dnd5e as RuleSystem)).toEqual([
      { label: 'Strength', value: 'Becomes 19' },
      { label: 'Saving Throws', value: '+1' },
      { label: 'Resistance', value: 'Fire' },
      { label: 'Web', value: 'Level 2, 2 charges, save DC 15' },
      { label: 'Charges', value: '10, regains 1d6 + 4 at dusk' }
    ])
  })
})
