import { centimetres, stepOpeningWidth, stepWidth, type OpeningKind, type PenMethod, type ToolId, type ToolSettings } from '$lib/nimap'

const WHEEL_STEP_PX = 24
const HUD_MS = 1200

export interface HandDeps {
  toolId: () => ToolId
  stepSelection: (direction: 1 | -1, big: boolean) => void
  widthUnderPointer: () => number | null
}

export class HandState {
  readonly #deps: HandDeps
  wallWidth = $state(0.16)
  penMethod = $state<PenMethod>('lines')
  openingWidth = $state.raw<Record<OpeningKind, number>>({ door: 0.9, window: 1.2 })
  hud = $state<string | null>(null)
  #hudTimer: ReturnType<typeof setTimeout> | null = null
  #wheelTravel = 0

  constructor(options: { wallWidth?: number }, deps: HandDeps) {
    this.#deps = deps
    this.wallWidth = options.wallWidth ?? 0.16
  }

  #showHud(text: string) {
    this.hud = text
    if (this.#hudTimer) clearTimeout(this.#hudTimer)
    this.#hudTimer = setTimeout(() => (this.hud = null), HUD_MS)
  }

  stepWidthInHand(direction: 1 | -1, big: boolean) {
    const tool = this.#deps.toolId()
    if (tool === 'wall-pen') {
      this.wallWidth = stepWidth(this.wallWidth, direction, big)
      this.#showHud(centimetres(this.wallWidth))
      return
    }
    if (tool === 'door' || tool === 'window') {
      this.openingWidth = { ...this.openingWidth, [tool]: stepOpeningWidth(this.openingWidth[tool], direction, big) }
      this.#showHud(centimetres(this.openingWidth[tool]))
      return
    }
    this.#deps.stepSelection(direction, big)
  }

  wheelWidth(deltaY: number, big: boolean) {
    this.#wheelTravel += deltaY
    while (Math.abs(this.#wheelTravel) >= WHEEL_STEP_PX) {
      this.stepWidthInHand(this.#wheelTravel < 0 ? 1 : -1, big)
      this.#wheelTravel -= Math.sign(this.#wheelTravel) * WHEEL_STEP_PX
    }
  }

  pickWallWidth(): boolean {
    const width = this.#deps.widthUnderPointer()
    if (!width) return false
    this.wallWidth = width
    this.#showHud(centimetres(width))
    return true
  }

  settings = (): ToolSettings => ({ wallWidth: this.wallWidth, penMethod: this.penMethod, openingWidth: this.openingWidth })
}
