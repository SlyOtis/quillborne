import { describe, it, expect } from 'vitest'
import { component, placed, tabs } from './tables.fixture'

const tab = component(`${tabs}/ActionsTab.svelte`)
const row = component(`${tabs}/ActionAttack.svelte`)

const headers = ['Name', 'Range', 'Hit/Dc', 'Damage', 'Properties']
const cells = ['title', 'range', 'hit', 'attack', 'properties']

describe('the actions table lays one column per header', () => {
  it('flexes the name and the properties and fits the rest', () => {
    expect(tab.tracks('.attack')).toEqual(['2fr', 'auto', 'auto', 'auto', '2fr'])
    expect(tab.tracks('.attack')).toHaveLength(headers.length)
  })

  it('heads every section with the same five columns', () => {
    const heads = tab.listed('li', 'attack-header')

    expect(heads).toHaveLength(4)
    for (const head of heads) expect(tab.children(head).map((span) => tab.content(span))).toEqual(headers)
  })

  it('gives a row one cell per track, in header order', () => {
    const items = row.elements('li')

    expect(items).toHaveLength(1)
    expect(row.style('li')?.display).toBe('contents')
    expect(row.children(items[0]).map((child) => row.classes(child)[0])).toEqual(cells)
  })
})

describe('a column header reads in full', () => {
  it('makes each header its own grid item, so it floors its own track', () => {
    expect(tab.style('.attack-header')?.display).toBe('contents')
  })

  it('never breaks a header mid word', () => {
    expect(tab.style('.attack-header span')?.['white-space']).toBe('nowrap')
  })

  it('never clips a header, which is what cut Properties to one letter', () => {
    const span = tab.style('.attack-header span') ?? {}

    expect(span.overflow).toBeUndefined()
    expect(span['text-overflow']).toBeUndefined()
    expect(span['min-width']).toBeUndefined()
    expect(span.width).toBeUndefined()
    expect(tab.style('.attack')?.overflow).toBeUndefined()
  })
})

describe('an action name occupies one line', () => {
  it('lets the name cell shrink below its content', () => {
    expect(tab.tracks('.attack')[0]).toBe('2fr')
    expect(row.style('.title')).toMatchObject({ 'min-width': '0', overflow: 'hidden' })
  })

  it('ellipsises the name instead of wrapping it over three lines', () => {
    expect(row.style('h4')).toMatchObject({
      overflow: 'hidden',
      'text-overflow': 'ellipsis',
      'white-space': 'nowrap'
    })
    expect(row.style('.sub')?.['white-space']).toBe('nowrap')
  })

  it('keeps the whole name on the title', () => {
    const heading = row.elements('h4')

    expect(heading).toHaveLength(1)
    expect(row.attribute(heading[0], 'title')).toBe('{action.name}')
    expect(row.content(heading[0])).toBe('{action.name}')
  })
})

describe('the properties occupy one line', () => {
  it('lets the properties cell shrink below its content', () => {
    expect(tab.tracks('.attack')[4]).toBe('2fr')
    expect(row.style('.properties')).toMatchObject({ 'min-width': '0', overflow: 'hidden' })
    expect(row.style('.properties')?.width).toBeUndefined()
  })

  it('ellipsises the properties', () => {
    expect(row.style('.properties > span')).toMatchObject({
      display: 'block',
      overflow: 'hidden',
      'text-overflow': 'ellipsis',
      'white-space': 'nowrap'
    })
  })

  it('renders and titles the one derived string, so the two cannot diverge', () => {
    const text = row.children(row.cell(row.elements('li')[0], 'properties'))

    expect(text).toHaveLength(1)
    expect(row.attribute(text[0], 'title')).toBe('{properties}')
    expect(row.content(text[0])).toBe('{properties}')

    const declared = row.nodes(
      row.parsed.instance,
      (node) => node.type === 'VariableDeclarator' && node.id?.name === 'properties'
    )

    expect(declared).toHaveLength(1)
    expect(declared[0].init.callee.name).toBe('$derived')
  })

  it('never wraps the range, which sits in an auto track', () => {
    expect(tab.tracks('.attack')[1]).toBe('auto')
    expect(row.style('.range')?.['white-space']).toBe('nowrap')
  })
})

describe('the No ammo badge sits in its own cell', () => {
  it('carries no absolute wrapper, which is what put it over the row above', () => {
    expect(row.selectors).not.toContain('.debug-info')
    expect(row.listed('div', 'debug-info')).toEqual([])
  })

  it('is in flow, offset from nothing', () => {
    expect(placed(row.style('.ammo-warning') ?? {})).toEqual([])
  })

  it('is no badge at all: the hit and damage cells carry the dry class and the button says No ammo', () => {
    expect(row.listed('span', 'ammo-warning')).toEqual([])
    expect(row.source).toContain('class:attack-dry={isRanged && buttonsDisabled}')
    expect(row.source).toContain("'No ammo'")
  })

  it('stacks under the button it belongs to', () => {
    expect(row.style('.hit, .attack')).toMatchObject({
      display: 'flex',
      'flex-direction': 'column',
      gap: 'var(--space-1)'
    })
  })
})
