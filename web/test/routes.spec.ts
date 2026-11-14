import { describe, it, vi, expect } from 'vitest'

vi.hoisted(() => {
  ;(globalThis as any).window = { location: { pathname: '/', search: '', origin: 'http://localhost' } }
})

import { resolveRoute } from '../node_modules/sly-svelte-location-router/dist/router.js'

const page = () => async () => ({ default: {} })

const routes: any = {
  '/': '/main',
  '/main': { name: 'main', component: page() },
  '/login': '/main',
  '/signup': '/main',
  '/main/create/character': { name: 'character-create', component: page() },
  '/main/create/character/class': { name: 'character-class', component: page() },
  '/main/create/character/race': { name: 'character-race', component: page() },
  '/sources/:kind/:id': { name: 'source-view', component: page() },
  '/main/create/campaign': { name: 'campaign-create', component: page() },
  '/character/:id': { name: 'character-view', component: page() },
  '/user': { name: 'user', component: page() },
  '/campaign/:id': { name: 'campaign-view', component: page() },
  '/main/campaign/:id': { name: 'main-campaign-view', component: page() },
  '/main/vehicles': { name: 'vehicles-list', component: page() },
  '/main/campaign/:id/vehicles': { name: 'campaign-vehicles', component: page() },
  '/main/vehicles/:id': { name: 'vehicle-view', component: page() },
  '/main/vehicles/:id/design': { name: 'vehicle-design', component: page() },
  '/main/vehicles/:id/crew': { name: 'vehicle-crew', component: page() },
  '/main/monsters': { name: 'monsters-list', component: page() },
  '/main/monsters/:id': { name: 'monster-view', component: page() }
}

describe('every route the app can reach resolves to its own page', () => {
  for (const [path, want] of [
    ['/main', 'main'],
    ['/login', 'main'],
    ['/signup', 'main'],
    ['/user', 'user'],
    ['/character/GBrry3iBrlac8Pdb1n6e', 'character-view'],
    ['/campaign/abc123', 'campaign-view'],
    ['/main/create/character', 'character-create'],
    ['/main/create/character/class', 'character-class'],
    ['/main/create/character/race', 'character-race'],
    ['/sources/classes/fighter', 'source-view'],
    ['/sources/races/tiefling', 'source-view'],
    ['/main/vehicles', 'vehicles-list'],
    ['/main/vehicles/0c6f1d2e-0000-4000-8000-000000000001', 'vehicle-view'],
    ['/main/vehicles/0c6f1d2e-0000-4000-8000-000000000001/design', 'vehicle-design'],
    ['/main/vehicles/0c6f1d2e-0000-4000-8000-000000000001/crew', 'vehicle-crew'],
    ['/main/campaign/abc123/vehicles', 'campaign-vehicles'],
    ['/main/campaign/abc123', 'main-campaign-view'],
    ['/main/monsters', 'monsters-list'],
    ['/main/monsters/0c6f1d2e-0000-4000-8000-000000000002', 'monster-view']
  ] as const) {
    it(`${path} resolves to ${want}`, () => {
      const found = resolveRoute(path.split('/').filter(Boolean), routes)
      expect({ name: found.matched?.name, remaining: found.remaining }).toEqual({ name: want, remaining: [] })
    })
  }

  it('the root redirects to the hearth', () => {
    expect(resolveRoute([], routes).matched?.name).toBe('main')
  })
})

describe('character status', () => {
  it('marks a character with an unknown race as a draft', async () => {
    const { getCharacterStatus } = await import('../src/lib/api')
    const doc: any = {
      character: { info: { name: 'Testy', class: { name: 'Cleric' }, race: { name: 'Unknown' } } }
    }
    expect(getCharacterStatus(doc.character)).toBe('draft')
  })

  it('marks a fully configured character as ready', async () => {
    const { getCharacterStatus } = await import('../src/lib/api')
    const doc: any = {
      character: { info: { name: 'Fatty', class: { name: 'Gunslinger' }, race: { name: 'Human' } } }
    }
    expect(getCharacterStatus(doc.character)).toBe('ready')
  })

  it('marks a nameless character as a draft', async () => {
    const { getCharacterStatus } = await import('../src/lib/api')
    const doc: any = {
      character: { info: { name: '  ', class: { name: 'Rogue' }, race: { name: 'Elf' } } }
    }
    expect(getCharacterStatus(doc.character)).toBe('draft')
  })
})
