import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

class FakeSource {
  static CLOSED = 2
  static made: FakeSource[] = []
  url: string
  readyState = 0
  closed = false
  handlers = new Map<string, Array<() => void>>()

  constructor(url: string) {
    this.url = url
    FakeSource.made.push(this)
  }

  addEventListener(name: string, handler: () => void) {
    this.handlers.set(name, [...(this.handlers.get(name) ?? []), handler])
  }

  fire(name: string) {
    for (const handler of this.handlers.get(name) ?? []) handler()
  }

  close() {
    this.closed = true
  }
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0))

beforeEach(() => {
  FakeSource.made = []
  vi.stubGlobal('EventSource', FakeSource)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('a live list over the stream', () => {
  it('shares one connection between the lists of a campaign', async () => {
    const { getStream } = await import('./core')
    const stopChat = getStream('campaign/c/stream', 'chat', async () => [], () => {})
    const stopMaps = getStream('campaign/c/stream', 'map', async () => [], () => {})

    expect(FakeSource.made).toHaveLength(1)
    expect(FakeSource.made[0].url).toBe('/api/campaign/c/stream')
    stopChat()
    expect(FakeSource.made[0].closed).toBe(false)
    stopMaps()
    expect(FakeSource.made[0].closed).toBe(true)
  })

  it('reloads on its own kind and on a reconnect, not on another kind', async () => {
    const { getStream } = await import('./core')
    let loads = 0
    const seen: number[] = []
    const stop = getStream('campaign/k/stream', 'chat', async () => ++loads, (value) => seen.push(value))
    await settle()

    FakeSource.made[0].fire('map')
    await settle()
    FakeSource.made[0].fire('chat')
    await settle()
    FakeSource.made[0].fire('open')
    await settle()

    expect(seen).toEqual([1, 2, 3])
    stop()
  })

  it('hands nothing on when the reload answers the same list', async () => {
    const { getStream } = await import('./core')
    const seen: unknown[] = []
    const stop = getStream('profile/stream', 'profile', async () => ({ user_id: 'u' }), (value) => seen.push(value))
    await settle()
    FakeSource.made[0].fire('profile')
    await settle()

    expect(seen).toEqual([{ user_id: 'u' }])
    stop()
  })

  it('tells the list when the stream is refused', async () => {
    const { getStream } = await import('./core')
    const errors: unknown[] = []
    const stop = getStream('resource/r/stream', 'update', async () => [], () => {}, (error) => errors.push(error))
    await settle()
    FakeSource.made[0].readyState = FakeSource.CLOSED
    FakeSource.made[0].fire('error')

    expect(errors).toHaveLength(1)
    stop()
  })
})

describe('a write carries the session csrf token', () => {
  it('sends SAuth-CSRF-Token from the cookie on a write and not on a read', async () => {
    const sent: Array<{ method: string; headers: Record<string, string> }> = []
    vi.stubGlobal('document', { cookie: 'other=1; sauth_csrf_token=tok%3Dvalue' })
    vi.stubGlobal('fetch', async (_url: string, init: { method: string; headers: Record<string, string> }) => {
      sent.push({ method: init.method, headers: init.headers })
      return { ok: true, json: async () => ({ data: null }) }
    })
    const { request, unwrap } = await import('./core')
    await unwrap('thing')
    await unwrap('thing', { method: 'POST', body: { a: 1 } })
    await unwrap('thing', { method: 'PUT', body: { a: 2 } })
    await request('thing', { method: 'DELETE' })
    expect(sent.map((call) => [call.method, call.headers['SAuth-CSRF-Token']])).toEqual([
      ['GET', undefined],
      ['POST', 'tok=value'],
      ['PUT', 'tok=value'],
      ['DELETE', 'tok=value']
    ])
  })

  it('sends no token when the session has no csrf cookie', async () => {
    vi.stubGlobal('document', { cookie: 'other=1' })
    const { getCsrfHeaders } = await import('./core')
    expect(getCsrfHeaders()).toEqual({})
  })
})
