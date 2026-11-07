import { globalCursor, type CursorName } from '$lib/nimap'
import { cursorCss, type CursorColours } from './cursors'
import type { Calibrating } from './calibrating.svelte'
import type { ToolsState } from './tools.svelte'

export class CursorState {
  readonly #tools: ToolsState
  readonly #calibrating: Calibrating
  colours = $state.raw<CursorColours | null>(null)
  systemCursors = $state(false)

  constructor(tools: ToolsState, calibrating: Calibrating, colours: CursorColours | null) {
    this.#tools = tools
    this.#calibrating = calibrating
    this.colours = colours
  }

  cursorName = $derived.by<CursorName>(() => {
    const tools = this.#tools
    void tools.tick
    if (this.#calibrating.calibration.active) return 'arrow-add'
    if (!tools.stage.tools.length) return 'arrow'
    if (!tools.toolsEnabled) return 'not-allowed'
    const ctx = tools.context()
    return globalCursor(ctx) ?? tools.activeTool.cursor(ctx)
  })

  cursorFor = (name: CursorName): string => cursorCss(name, this.colours, this.systemCursors)

  cursor = $derived(this.cursorFor(this.cursorName))
}
