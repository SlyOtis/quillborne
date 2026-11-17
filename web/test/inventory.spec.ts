import { describe, it, expect } from 'vitest'
import { component, tabs } from './tables.fixture'

const tab = component(`${tabs}/InventoryTab.svelte`)

const headers = ['Active', 'Name', 'Qty', 'Cost (gp)', 'Notes']
const cells = ['equippable', 'name', 'qty', 'cost', 'notes']

describe('the inventory table lays one column per header', () => {
  it('flexes the name and the notes and fits the rest', () => {
    expect(tab.tracks('ul')).toEqual(['auto', '3fr', 'auto', 'auto', '2fr'])
    expect(tab.tracks('ul')).toHaveLength(headers.length)
  })

  it('binds an item to its track instead of to its own fit-content width', () => {
    expect(tab.style('ul')?.['justify-items']).toBeUndefined()
  })

  it('heads the list with five columns', () => {
    const heads = tab.listed('li', 'items-header')

    expect(heads).toHaveLength(1)
    expect(tab.children(heads[0]).map((span) => tab.content(span))).toEqual(headers)
  })

  it('gives a row one cell per track, in header order', () => {
    const items = tab.listed('li', 'item')

    expect(items).toHaveLength(1)
    expect(tab.style('li')?.display).toBe('contents')
    expect(tab.children(items[0]).map((child) => tab.classes(child)[0])).toEqual(cells)
  })
})

describe('a column header reads in full', () => {
  it('never breaks a header mid word', () => {
    expect(tab.style('.items-header span')?.['white-space']).toBe('nowrap')
  })

  it('never clips a header', () => {
    const span = tab.style('.items-header span') ?? {}

    expect(span.overflow).toBeUndefined()
    expect(span['text-overflow']).toBeUndefined()
    expect(span['min-width']).toBeUndefined()
    expect(span.width).toBeUndefined()
    expect(tab.style('ul')?.overflow).toBeUndefined()
  })

  it('never wraps the quantity or the cost in their auto tracks', () => {
    expect(tab.tracks('ul').slice(2, 4)).toEqual(['auto', 'auto'])
    expect(tab.style('.center')?.['white-space']).toBe('nowrap')
  })
})

describe('an item name occupies one line', () => {
  it('lets the name cell shrink below its content', () => {
    expect(tab.tracks('ul')[1]).toBe('3fr')
    expect(tab.style('.name')).toMatchObject({ 'min-width': '0', overflow: 'hidden' })
  })

  it('ellipsises the name and the type under it', () => {
    expect(tab.style('.name > *')).toMatchObject({
      display: 'block',
      margin: '0',
      overflow: 'hidden',
      'text-overflow': 'ellipsis',
      'white-space': 'nowrap'
    })
  })

  it('keeps the whole name on the title', () => {
    const heading = tab.elements('h4')

    expect(heading).toHaveLength(1)
    expect(tab.attribute(heading[0], 'title')).toBe('{item.title}')
    expect(tab.content(heading[0])).toBe('{item.title}')
  })
})

describe('a note occupies one line', () => {
  it('lets the notes cell shrink below its content', () => {
    expect(tab.tracks('ul')[4]).toBe('2fr')
    expect(tab.style('.notes')).toMatchObject({ 'min-width': '0', overflow: 'hidden' })
  })

  it('ellipsises the note and drops the paragraph margin that pushed the row open', () => {
    expect(tab.style('.notes > p')).toMatchObject({
      margin: '0',
      overflow: 'hidden',
      'text-overflow': 'ellipsis',
      'white-space': 'nowrap'
    })
  })

  it('keeps the whole note on the title', () => {
    const note = tab.elements('p')

    expect(note).toHaveLength(1)
    expect(tab.attribute(note[0], 'title')).toBe('{item.description}')
    expect(tab.content(note[0])).toBe('{item.description}')
  })
})
