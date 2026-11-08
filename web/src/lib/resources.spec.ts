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

import { deleteOne, deleteResources, getBlank, type Resource } from './resources'


const one = (fields: Partial<Resource> = {}): Resource => ({ ...getBlank('entries', 'lars'), id: 'res-1', ...fields })

beforeEach(() => {
  wire.steps.length = 0
  wire.puts.length = 0
  wire.stored = {}
})

describe('deleteOne', () => {
  it('drops the shared document first, then the stored pictures, then the resource, at the stored collection', async () => {
    const held = one({ id: 'npc-1', image: 'file:a', images: ['file:a', 'file:b', 'https://example.test/c.png'] })

    await deleteOne({ at: 'campaign', id: 'camp-1' }, 'npcs', held)

    expect(wire.steps).toEqual([
      'drop campaign/camp-1/npcs/npc-1',
      'file file:a',
      'file file:b',
      'delete npc-1'
    ])
  })
})

describe('deleteResources', () => {
  it('deletes only what the named owner wrote, on every roll', async () => {
    wire.stored['campaign/camp-1/locations'] = [{ id: 'place-1', owner_id: 'lars' }, { id: 'place-2', owner_id: 'dis' }]
    wire.stored['campaign/camp-1/sessions'] = [{ id: 'session-1', owner_id: 'lars' }]

    const count = await deleteResources({ at: 'campaign', id: 'camp-1' }, 'lars')

    expect(count).toBe(2)
    expect(wire.steps.filter((step) => step.startsWith('delete'))).toEqual([
      'delete place-1',
      'delete session-1'
    ])
  })
})
