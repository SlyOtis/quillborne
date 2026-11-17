import * as api from './api'
import type { Song } from './api/types'
import { get, writable } from 'svelte/store'

const RESTART_AFTER = 3

export const library = writable<Song[]>([])
export const queue = writable<Song[]>([])
export const track = writable<Song | null>(null)
export const playing = writable(false)
export const progress = writable({ at: 0, length: 0 })
export const shuffle = writable(false)
export const repeat = writable<'off' | 'all' | 'one'>('off')
export const musicScope = writable('')

let audio: HTMLAudioElement | null = null
let played: Song[] = []
let held = ''
let stop: (() => void) | null = null
let kept: Song[] = []
let own: Song[] = []
let asked = 0

function getAudio(): HTMLAudioElement {
  if (audio) return audio

  audio = new Audio()
  audio.addEventListener('timeupdate', () =>
    progress.set({ at: audio?.currentTime ?? 0, length: audio?.duration || get(track)?.duration || 0 })
  )
  audio.addEventListener('play', () => playing.set(true))
  audio.addEventListener('pause', () => playing.set(false))
  audio.addEventListener('ended', () => {
    if (get(repeat) === 'one' && audio) {
      audio.currentTime = 0
      void audio.play().catch(() => undefined)
      return
    }
    void playNext()
  })

  return audio
}

function getDuration(file: File): Promise<number> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file)
    const probe = new Audio()
    probe.preload = 'metadata'
    probe.onloadedmetadata = () => {
      URL.revokeObjectURL(url)
      resolve(Number.isFinite(probe.duration) ? probe.duration : 0)
    }
    probe.onerror = () => {
      URL.revokeObjectURL(url)
      resolve(0)
    }
    probe.src = url
  })
}

export function getClock(seconds: number): string {
  const whole = Math.max(0, Math.floor(seconds))
  const minutes = Math.floor(whole / 60)
  const rest = whole % 60
  return `${minutes}:${rest < 10 ? '0' : ''}${rest}`
}

function setLibrary(): void {
  library.set([...kept, ...own].sort((a, b) => a.title.localeCompare(b.title)))
}

async function getOwnSongs(): Promise<void> {
  const mine = ++asked
  const songs = await api.getSongs().catch((error) => {
    console.error('Own songs did not load:', error)
    return null
  })
  if (!songs || mine !== asked) return

  own = songs
  setLibrary()
}

export function openLibrary(campaignId: string): void {
  void getOwnSongs()

  if (campaignId === held) return
  held = campaignId

  stop?.()
  stop = null
  kept = []
  setLibrary()
  musicScope.set(campaignId)

  if (!campaignId) return

  stop = api.getCampaignSongsStream(campaignId, (songs) => {
    kept = songs
    setLibrary()
  })
}

export async function playSong(song: Song): Promise<void> {
  const before = get(track)
  if (before && before.id !== song.id) played = [...played.slice(-20), before]

  track.set(song)
  progress.set({ at: 0, length: song.duration })

  const url = await api.getFileUrl(song.address)
  if (!url || get(track)?.id !== song.id) return

  const player = getAudio()
  player.src = url
  await player.play().catch(() => undefined)
}

export function toggleSong(): void {
  const player = getAudio()
  if (!player.src) {
    void playNext()
    return
  }
  if (player.paused) void player.play().catch(() => undefined)
  else player.pause()
}

export async function playNext(): Promise<void> {
  const now = get(track)
  const pool = get(repeat) === 'all' && now ? [...get(queue), now] : get(queue)
  if (pool.length === 0) {
    getAudio().pause()
    return
  }
  const at = get(shuffle) ? Math.floor(Math.random() * pool.length) : 0
  const next = pool[at]
  queue.set(pool.filter((_, index) => index !== at))
  await playSong(next)
}

export function toggleShuffle(): void {
  shuffle.update((on) => !on)
}

export function cycleRepeat(): void {
  repeat.update((mode) => (mode === 'off' ? 'all' : mode === 'all' ? 'one' : 'off'))
}

export async function playPrev(): Promise<void> {
  const player = getAudio()
  const last = played[played.length - 1]

  if (player.currentTime > RESTART_AFTER || !last) {
    player.currentTime = 0
    return
  }

  played = played.slice(0, -1)
  const now = get(track)
  if (now) queue.update((rest) => [now, ...rest])
  track.set(null)
  await playSong(last)
}

export function seekSong(at: number): void {
  getAudio().currentTime = at
}

export function enqueueSong(song: Song): void {
  queue.update((rest) => [...rest, song])
}

export function dequeueSong(index: number): void {
  queue.update((rest) => rest.filter((_, at) => at !== index))
}

export function moveSong(index: number, by: -1 | 1): void {
  queue.update((rest) => {
    const to = index + by
    if (to < 0 || to >= rest.length) return rest
    const next = [...rest]
    ;[next[index], next[to]] = [next[to], next[index]]
    return next
  })
}

export async function postSong(campaignId: string, file: File): Promise<void> {
  if (!file.type.startsWith('audio/')) throw new Error(`${file.name} is not an audio file.`)

  const [duration, { url: address }] = await Promise.all([
    getDuration(file),
    api.postFile(file, campaignId ? { kind: 'campaignAudio', campaignId } : { kind: 'user' })
  ])

  await api.postSong({
    title: file.name.replace(/\.[^.]+$/, ''),
    address,
    duration,
    owner_id: campaignId || undefined,
    share_campaigns: campaignId ? [campaignId] : [],
    share_users: []
  })

  if (!campaignId) await getOwnSongs()
}
