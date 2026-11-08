import type { ReturnObject, SamnaUser } from './types'

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

export const baseURL = '/api/'

export interface ApiOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE'
  body?: unknown
  headers?: Record<string, string>
}

export type QueryValue = string | number | boolean | undefined | null

let session: SamnaUser | null = null

export function getSession(): SamnaUser | null {
  return session
}

export function putSession(user: SamnaUser | null): void {
  session = user
}

export function getSessionId(): string {
  if (!session) throw new ApiError(401, 'User not authenticated')
  return session.user_id
}

function getCookie(name: string): string | null {
  const match = document.cookie.split('; ').find((row) => row.startsWith(`${name}=`))
  return match ? decodeURIComponent(match.slice(name.length + 1)) : null
}

export function getCsrfHeaders(): Record<string, string> {
  const csrf = getCookie('sauth_csrf_token')
  return csrf ? { 'SAuth-CSRF-Token': csrf } : {}
}

export function path(base: string, params?: Record<string, QueryValue>): string {
  if (!params) return base
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue
    search.set(key, String(value))
  }
  const query = search.toString()
  return query ? `${base}?${query}` : base
}

export async function request(url: string, options: ApiOptions = {}): Promise<Response> {
  const { method = 'GET', body, headers = {} } = options
  const isFormData = body instanceof FormData

  const config: RequestInit = {
    method,
    credentials: 'include',
    headers: {
      ...(method === 'GET' ? {} : getCsrfHeaders()),
      Accept: 'application/json',
      ...(isFormData || body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...headers
    }
  }
  if (body !== undefined && method !== 'GET') {
    config.body = isFormData || typeof body === 'string' ? (body as BodyInit) : JSON.stringify(body)
  }

  const response = await fetch(url.startsWith('/') ? url : `${baseURL}${url}`, config).catch(() => {
    throw new ApiError(0, 'Network error')
  })

  if (!response.ok) {
    const detail = await response
      .clone()
      .json()
      .then((held: ReturnObject<unknown>) => held.error?.message ?? '')
      .catch(() => '')
    throw new ApiError(response.status, detail || `${method} ${url} answered ${response.status}`)
  }

  return response
}

export async function unwrap<T>(url: string, options?: ApiOptions): Promise<T> {
  const response = await request(url, options)
  const json = (await response.json().catch(() => null)) as ReturnObject<T> | null
  return (json?.data ?? null) as T
}

interface Watcher {
  kind: string
  refresh: () => void
  fail: (error: unknown) => void
}

interface Stream {
  source: EventSource
  watchers: Set<Watcher>
  kinds: Set<string>
}

const streams = new Map<string, Stream>()

function getSource(url: string): Stream {
  const held = streams.get(url)
  if (held) return held

  const source = new EventSource(`${baseURL}${url}`, { withCredentials: true })
  const stream: Stream = { source, watchers: new Set(), kinds: new Set() }

  source.addEventListener('open', () => {
    for (const watcher of stream.watchers) watcher.refresh()
  })
  source.addEventListener('error', () => {
    if (source.readyState !== EventSource.CLOSED) return
    for (const watcher of stream.watchers) watcher.fail(new ApiError(0, `${url} closed`))
  })

  streams.set(url, stream)
  return stream
}

function putKind(stream: Stream, kind: string): void {
  if (stream.kinds.has(kind)) return
  stream.kinds.add(kind)
  stream.source.addEventListener(kind, () => {
    for (const watcher of stream.watchers) if (watcher.kind === kind) watcher.refresh()
  })
}

export function getStream<T>(
  url: string,
  kind: string,
  load: () => Promise<T>,
  onChange: (value: T) => void,
  onError?: (error: unknown) => void
): () => void {
  let closed = false
  let last = ''
  let running = false
  let again = false

  const refresh = async () => {
    if (closed) return
    if (running) {
      again = true
      return
    }
    running = true
    try {
      const value = await load()
      const seen = JSON.stringify(value)
      if (!closed && seen !== last) {
        last = seen
        onChange(value)
      }
    } catch (error) {
      if (!closed) onError?.(error)
    }
    running = false
    if (again) {
      again = false
      void refresh()
    }
  }

  const watcher: Watcher = { kind, refresh: () => void refresh(), fail: (error) => !closed && onError?.(error) }
  const stream = getSource(url)
  putKind(stream, kind)
  stream.watchers.add(watcher)
  void refresh()

  return () => {
    closed = true
    stream.watchers.delete(watcher)
    if (stream.watchers.size === 0) {
      stream.source.close()
      streams.delete(url)
    }
  }
}
