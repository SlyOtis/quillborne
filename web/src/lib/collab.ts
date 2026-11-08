import { deleteResourceUpdates, getResourceUpdatesStream, postResourceUpdate, putResourceUpdates } from './api'
import type { Owner } from './api/types'
import * as Y from 'yjs'

/** How long a run of local edits is gathered before it is written. */
const SETTLE_MS = 1200

/** How many stored updates a document carries before they are folded into one. */
const FOLD_AT = 40

export interface Session {
  /** The shared document every peer converges on. */
  ydoc: Y.Doc
  /** The block markdown, shared character by character. */
  content: Y.Text
  /** Walks the local peer's own edits, so one peer's undo never lifts another's work. */
  history: Y.UndoManager
  /** Writes whatever is still gathered and stops listening. */
  leave: () => Promise<void>
}

function toBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let index = 0; index < bytes.length; index += 8192) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 8192))
  }
  return btoa(binary)
}

function fromBase64(written: string): Uint8Array {
  const binary = atob(written)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
  return bytes
}

/**
 * Joins the shared document a resource is written in. Every peer appends its own
 * updates under the resource and applies what the others append, so the block
 * text converges without anyone's keystrokes overwriting anyone else's.
 *
 * The service carries the updates under the resource, read by everyone who reads
 * it. A run of edits is gathered for SETTLE_MS before it is written, so a
 * sentence costs one update rather than one per key.
 */
export function joinDoc(_owner: Owner, _kind: string, id: string, seed: string): Session {
  const ydoc = new Y.Doc()
  const content = ydoc.getText('content')

  const history = new Y.UndoManager(content, { trackedOrigins: new Set(['self']) })

  let gathered: Uint8Array[] = []
  let timer: ReturnType<typeof setTimeout> | null = null
  let seen = new Set<string>()
  let live = true
  let started = false

  ydoc.on('update', (update: Uint8Array, origin: unknown) => {
    if (origin === 'remote') return
    gathered.push(update)
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => void flush(), SETTLE_MS)
  })

  async function flush() {
    if (timer) {
      clearTimeout(timer)
      timer = null
    }
    if (gathered.length === 0 || !live) return

    const held = Y.mergeUpdates(gathered)
    gathered = []

    const written = await postResourceUpdate(id, toBase64(held))
    seen.add(written.id)
  }

  const stop = getResourceUpdatesStream(id, (updates) => {
  const held: Uint8Array[] = []

    updates.forEach((entry) => {
      if (seen.has(entry.id)) return
      seen.add(entry.id)
      if (typeof entry.body === 'string') held.push(fromBase64(entry.body))
    })

    if (held.length > 0) Y.applyUpdate(ydoc, Y.mergeUpdates(held), 'remote')

    // Nothing stored yet, so the text the resource already carries is the start.
    if (!started && updates.length === 0 && content.length === 0 && seed) {
      content.insert(0, seed)
    }
    started = true

      if (updates.length > FOLD_AT) void fold()
  })

  async function fold() {
    const merged = Y.encodeStateAsUpdate(ydoc)
    const written = await putResourceUpdates(id, toBase64(merged))
    seen = new Set([written.id])
  }

  return {
    ydoc,
    content,
    history,
    async leave() {
      live = false
      stop()
      if (timer) clearTimeout(timer)
      if (gathered.length > 0) {
        live = true
        await flush()
        live = false
      }
      history.destroy()
      ydoc.destroy()
    }
  }
}

/** Drops every stored update, which a resource does when it is removed. */
export async function dropDoc(_owner: Owner, _kind: string, id: string): Promise<void> {
  await deleteResourceUpdates(id).catch(() => undefined)
}
