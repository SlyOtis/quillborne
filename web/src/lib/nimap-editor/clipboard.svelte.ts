import type { Selection, Vec2 } from '$lib/nimap'
import { copySelection, freshIds, pasteCommands, type Clip } from '$lib/nimap/tools/clipboard'
import type { DocumentState } from './document.svelte'
import type { ToolsState } from './tools.svelte'

let copied: Clip | null = null

const sameIds = (a: ReadonlySet<string>, b: ReadonlySet<string>) => a.size === b.size && [...a].every(id => b.has(id))

export class ClipboardState {
  readonly #doc: DocumentState
  #held: Clip | null = null
  #last: { delta: Vec2; selection: Selection } | null = null
  #tools: ToolsState | null = null

  constructor(doc: DocumentState) {
    this.#doc = doc
  }

  held = (): Clip | null => this.#held

  dropped = (delta: Vec2, selection: Selection) => {
    this.#last = { delta, selection }
  }

  attach(tools: ToolsState) {
    this.#tools = tools
  }

  #hold(clip: Clip) {
    const tools = this.#tools!
    this.#held = clip
    if (tools.activeStage !== 'furnish') tools.setStage('furnish')
    tools.interrupt()
    tools.tools.place.reset()
    tools.setTool('place')
    tools.dispatch({ type: 'update' })
  }

  copy = (): boolean => {
    const clip = copySelection(this.#doc.level, this.#doc.store.selection)
    if (clip) copied = clip
    return !!clip
  }

  paste = (): boolean => {
    if (!copied) return false
    this.#hold(copied)
    return true
  }

  duplicate = (): boolean => {
    const clip = copySelection(this.#doc.level, this.#doc.store.selection)
    if (!clip) return false
    const selection = this.#doc.store.selection
    const last = this.#last
    if (last && sameIds(last.selection.fixtureIds, selection.fixtureIds) && sameIds(last.selection.lineIds, selection.lineIds)) {
      this.#tools!.interrupt()
      const put = pasteCommands(clip, last.delta, freshIds(clip))
      this.#doc.store.commit('Duplicate', put.commands, put.selection)
      this.#last = { delta: last.delta, selection: this.#doc.store.selection }
      return true
    }
    this.#hold(clip)
    return true
  }
}
