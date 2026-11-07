import { HIT_RADIUS_PX, NO_MODIFIERS, type Command, type LayerId, type LayerState, type Level, type Modifiers, type PenMethod, type Selection, type StageId, type ToolId, type Unit, type Vec2 } from '$lib/nimap'
import { referenceOrigin } from './calibration'
import { Calibrating } from './calibrating.svelte'
import { ClipboardState } from './clipboard.svelte'
import { CursorState } from './cursor.svelte'
import type { CursorColours } from './cursors'
import { DocumentState } from './document.svelte'
import { HandState } from './hand.svelte'
import { InspectorState } from './inspector.svelte'
import { ToolsState } from './tools.svelte'
import { ViewState, type ViewBox } from './view.svelte'

export type EditorView = 'plan' | '3d' | 'split'

export interface EditorAction {
  label: string
  primary?: boolean
  run(): void
}

export interface EditorOptions {
  level: Level
  wallWidth?: number
  cursorColours?: CursorColours | null
}

const TOOL_EVENT_KEYS = new Set(['Escape', 'Enter', 'Backspace', 'Delete', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', '+', '-', 'Tab'])

export const TOOL_KEYS: Record<string, ToolId> = { v: 'select', p: 'wall-pen', f: 'fixture-pen', b: 'bend', d: 'door', w: 'window' }

export class Editor {
  readonly doc: DocumentState
  readonly view: ViewState
  readonly calibrating: Calibrating
  readonly hand: HandState
  readonly clipboard: ClipboardState
  readonly tools: ToolsState
  readonly cursorState: CursorState
  readonly inspector: InspectorState

  constructor(options: EditorOptions) {
    this.doc = new DocumentState(options.level)
    this.view = new ViewState()
    this.calibrating = new Calibrating(this.doc, p => this.#snapToDrawing(p))
    this.hand = new HandState(options, {
      toolId: () => this.tools.activeToolId,
      stepSelection: (direction, big) => this.tools.dispatch({ type: 'key', key: direction > 0 ? '+' : '-', modifiers: { ...this.tools.inputs.modifiers, shift: big } }),
      widthUnderPointer: () => this.#widthUnderPointer()
    })
    this.clipboard = new ClipboardState(this.doc)
    this.tools = new ToolsState(this.doc, this.view, {
      enabled: () => this.calibrating.calibrated && !this.calibrating.calibration.active,
      settings: this.hand.settings,
      held: this.clipboard.held,
      dropped: this.clipboard.dropped
    })
    this.clipboard.attach(this.tools)
    this.cursorState = new CursorState(this.tools, this.calibrating, options.cursorColours ?? null)
    this.inspector = new InspectorState(this.doc)
  }

  #snapToDrawing(p: Vec2): Vec2 {
    const reach = HIT_RADIUS_PX / this.view.scale
    let best: Vec2 = p
    let nearest = reach
    for (const n of this.doc.graph.nodes) {
      const d = Math.hypot(n.point[0] - p[0], n.point[1] - p[1])
      if (d < nearest) {
        nearest = d
        best = n.point
      }
    }
    return best
  }

  #widthUnderPointer(): number | null {
    const point = this.tools.inputs.point
    const hit = point && this.tools.context().hit.at(point)
    const widthOf = (lineId: string) => (this.doc.graph.linesById.get(lineId) as { width?: number } | undefined)?.width
    const widths = hit?.kind === 'line' && hit.layer === 'walls' ? [widthOf(hit.lineId)] : hit?.kind === 'node' && hit.node.layer === 'walls' ? hit.node.refs.map(r => widthOf(r.lineId)) : []
    return Math.max(...widths.filter((w): w is number => w !== undefined), 0) || null
  }

  get level() {
    return this.doc.level
  }
  get working() {
    return this.doc.working
  }
  get history() {
    return this.doc.history
  }
  get canUndo() {
    return this.doc.canUndo
  }
  get canRedo() {
    return this.doc.canRedo
  }
  get warning() {
    return this.doc.warning
  }
  get svg() {
    return this.doc.svg
  }
  get graph() {
    return this.doc.graph
  }
  get runs() {
    return this.doc.runs
  }
  get fixturePlans() {
    return this.doc.fixturePlans
  }
  get selection() {
    return this.tools.selection
  }
  get stages() {
    return this.tools.stages
  }
  get stage() {
    return this.tools.stage
  }
  get activeStage() {
    return this.tools.activeStage
  }
  get activeToolId() {
    return this.tools.activeToolId
  }
  get shownToolId() {
    return this.tools.shownToolId
  }
  get frontToolId() {
    return this.tools.frontToolId
  }
  get toolsEnabled() {
    return this.tools.toolsEnabled
  }
  get layers() {
    return this.tools.layers
  }
  get effectiveLayers() {
    return this.tools.effectiveLayers
  }
  get overlay() {
    return this.tools.overlay
  }
  get grips() {
    return this.tools.grips
  }
  get inputs() {
    return this.tools.inputs
  }
  get wallWidth() {
    return this.hand.wallWidth
  }
  set wallWidth(width: number) {
    this.hand.wallWidth = width
  }
  get penMethod() {
    return this.hand.penMethod
  }
  set penMethod(method: PenMethod) {
    this.hand.penMethod = method
  }
  get openingWidth() {
    return this.hand.openingWidth
  }
  get hud() {
    return this.hand.hud
  }
  get cursorName() {
    return this.cursorState.cursorName
  }
  get cursor() {
    return this.cursorState.cursor
  }
  get systemCursors() {
    return this.cursorState.systemCursors
  }
  set systemCursors(on: boolean) {
    this.cursorState.systemCursors = on
  }
  get viewBox() {
    return this.view.viewBox
  }
  set viewBox(box: ViewBox) {
    this.view.viewBox = box
  }
  get scale() {
    return this.view.scale
  }
  get viewport() {
    return this.view.viewport
  }
  get reference() {
    return this.calibrating.reference
  }
  get calibration() {
    return this.calibrating.calibration
  }
  get calibrated() {
    return this.calibrating.calibrated
  }
  get drawn() {
    return this.calibrating.drawn
  }

  calibrationStep = $derived.by(() => {
    const c = this.calibrating.calibration
    if (!c.active) return null
    if (c.mode === 'scale') return c.points.length < 2 ? `Click point ${c.points.length + 1} of a distance you know on the image.` : null
    return c.points.length < 2 ? `Click point ${c.points.length + 1} of 2 on the image.` : `Click where point ${c.points.length - 1} belongs on the drawing.`
  })

  commit(label: string, commands: Command[], next?: Selection) {
    this.doc.commit(label, commands, next)
  }

  setUnit(unitId: string, patch: Partial<Pick<Unit, 'name' | 'category' | 'hidden' | 'ref'>>) {
    this.doc.commit('Edit unit', [{ type: 'setUnit', unitId, patch }])
  }

  undo() {
    this.tools.interrupt()
    this.doc.store.undo()
  }

  redo() {
    this.tools.interrupt()
    this.doc.store.redo()
  }

  select(next: Selection) {
    this.tools.interrupt()
    this.doc.store.select(next)
  }

  setViewportSize(width: number, height: number) {
    this.view.setViewportSize(width, height)
  }

  zoomAt(svgPoint: Vec2, factor: number) {
    this.view.zoomAt(svgPoint, factor)
  }

  panBy(dxPx: number, dyPx: number) {
    this.view.panBy(dxPx, dyPx)
  }

  fitToReference() {
    const r = this.calibrating.reference
    if (!r) return
    const [x, y] = referenceOrigin(r)
    this.view.fitTo(x, -y, x + r.widthPx * r.metresPerPixel, -y + r.heightPx * r.metresPerPixel)
  }

  fitToContent() {
    const level = this.doc.level
    if (this.calibrating.reference && !level.walls.length) return this.fitToReference()
    if (!level.walls.length && !level.fixtureLines.length) return
    const b = this.doc.svg.viewBox
    this.view.fitTo(b.x, -(b.y + b.height), b.x + b.width, -b.y)
  }

  setReference(init: { url: string; widthPx: number; heightPx: number } | null) {
    this.calibrating.setReference(init)
    if (init) this.fitToReference()
  }

  setReferenceOpacity(opacity: number) {
    this.calibrating.setReferenceOpacity(opacity)
  }

  startCalibration() {
    this.tools.interrupt()
    this.calibrating.start()
  }

  cancelCalibration() {
    this.calibrating.cancel()
  }

  applyCalibration(metres: number) {
    if (this.calibrating.apply(metres)) this.fitToReference()
  }

  setStage(id: StageId) {
    this.tools.setStage(id)
  }

  setTool(id: ToolId) {
    this.tools.setTool(id)
  }

  interrupt() {
    this.tools.interrupt()
  }

  setLayer(id: LayerId, patch: Partial<LayerState>) {
    this.tools.setLayer(id, patch)
  }

  stepWidthInHand(direction: 1 | -1, big: boolean) {
    this.hand.stepWidthInHand(direction, big)
  }

  wheelWidth(deltaY: number, big: boolean) {
    this.hand.wheelWidth(deltaY, big)
  }

  cursorFor(name: Parameters<CursorState['cursorFor']>[0]) {
    return this.cursorState.cursorFor(name)
  }

  #setInputs(point: Vec2 | null, modifiers: Modifiers) {
    this.tools.inputs = { point: point ?? this.tools.inputs.point, modifiers }
  }

  pointerDown(point: Vec2, modifiers: Modifiers) {
    this.#setInputs(point, modifiers)
    if (this.calibrating.calibration.active) return this.calibrating.addPoint(point)
    this.tools.dispatch({ type: 'pointerDown', point, modifiers })
  }

  pointerMove(point: Vec2, modifiers: Modifiers) {
    this.#setInputs(point, modifiers)
    this.tools.dispatch({ type: 'update' })
  }

  pointerUp(point: Vec2, modifiers: Modifiers) {
    this.#setInputs(point, modifiers)
    this.tools.dispatch({ type: 'pointerUp', point, modifiers })
  }

  doubleClick(point: Vec2, modifiers: Modifiers) {
    this.#setInputs(point, modifiers)
    this.tools.dispatch({ type: 'doubleClick', point, modifiers })
  }

  modifiersChanged(modifiers: Modifiers) {
    const was = this.tools.inputs.modifiers
    if (modifiers.shift === was.shift && modifiers.alt === was.alt && modifiers.ctrl === was.ctrl && !!modifiers.command === !!was.command) return
    this.#setInputs(null, modifiers)
    this.tools.dispatch({ type: 'update' })
  }

  pointerLeave() {
    this.tools.inputs = { point: null, modifiers: NO_MODIFIERS }
    this.tools.tick++
  }

  keyDown(key: string, modifiers: Modifiers & { meta: boolean }): boolean {
    const tools = this.tools
    const calibrating = this.calibrating.calibration.active
    const command = modifiers.meta || modifiers.ctrl
    const letter = key.toLowerCase()
    if (command && letter === 'z') {
      if (modifiers.shift) this.redo()
      else this.undo()
      return true
    }
    if (command && !modifiers.shift && !calibrating) {
      if (letter === 'c') return this.clipboard.copy()
      if (letter === 'v') return this.clipboard.paste()
      if (letter === 'd') return this.clipboard.duplicate()
      if (letter === 'x' && this.clipboard.copy()) {
        tools.dispatch({ type: 'key', key: 'Delete', modifiers })
        return true
      }
    }
    if (calibrating) {
      if (key === 'Escape') this.calibrating.cancel()
      return key === 'Escape'
    }
    const resting = tools.stage.tools[0]
    if (key === 'Escape' && tools.activeTool.state === 'idle' && resting && tools.activeToolId !== resting) {
      tools.setTool(resting)
      return true
    }
    if (!command && TOOL_KEYS[letter]) {
      tools.setTool(TOOL_KEYS[letter])
      return true
    }
    if (!command && letter === 'q') return this.hand.pickWallWidth()
    if (!command && (key === '+' || key === '=' || key === '-')) {
      this.hand.stepWidthInHand(key === '-' ? -1 : 1, modifiers.shift)
      return true
    }
    if (TOOL_EVENT_KEYS.has(key)) {
      tools.dispatch({ type: 'key', key, modifiers })
      return true
    }
    return false
  }
}
