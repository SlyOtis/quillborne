import type { Reference, Vec2 } from '$lib/nimap'
import { alignReference, calibratedScale, createReference } from './calibration'
import type { DocumentState } from './document.svelte'

export interface CalibrationState {
  active: boolean
  mode: 'scale' | 'align'
  points: Vec2[]
}

const IDLE: CalibrationState = { active: false, mode: 'scale', points: [] }

export class Calibrating {
  readonly #doc: DocumentState
  readonly #snap: (point: Vec2) => Vec2
  calibration = $state.raw<CalibrationState>(IDLE)

  constructor(doc: DocumentState, snap: (point: Vec2) => Vec2 = p => p) {
    this.#doc = doc
    this.#snap = snap
  }

  reference = $derived.by<Reference | undefined>(() => this.#doc.level.reference)
  drawn = $derived.by(() => this.#doc.level.walls.length > 0 || this.#doc.level.fixtureLines.length > 0)
  calibrated = $derived.by(() => !this.reference || this.reference.calibrated || this.drawn)

  setReference(init: { url: string; widthPx: number; heightPx: number } | null) {
    const kept = this.reference
    const next = init ? { ...createReference(init), ...(kept?.origin ? { origin: kept.origin } : {}) } : null
    this.#doc.commit('Reference image', [{ type: 'setReference', reference: next }])
  }

  setReferenceOpacity(opacity: number) {
    if (!this.reference) return
    this.#doc.commit('Reference opacity', [{ type: 'setReference', reference: { ...this.reference, opacity } }])
  }

  start(): boolean {
    if (!this.reference) return false
    this.calibration = { active: true, mode: this.drawn ? 'align' : 'scale', points: [] }
    return true
  }

  addPoint(point: Vec2) {
    const c = this.calibration
    const at = c.mode === 'align' && c.points.length >= 2 ? this.#snap(point) : point
    this.calibration = { ...c, points: [...c.points, at] }
    if (c.mode === 'align' && this.calibration.points.length === 4) this.#align()
  }

  cancel() {
    this.calibration = IDLE
  }

  #align() {
    const r = this.reference
    const [a, b, c, d] = this.calibration.points
    this.calibration = IDLE
    if (!r) return
    try {
      this.#doc.commit('Align image', [{ type: 'setReference', reference: alignReference(r, a, b, c, d) }])
    } catch {}
  }

  apply(metres: number): boolean {
    const r = this.reference
    const [a, b] = this.calibration.points
    if (!r || !a || !b) return false
    const metresPerPixel = calibratedScale(r, a, b, metres)
    this.#doc.commit('Calibrate', [{ type: 'setReference', reference: { ...r, metresPerPixel, calibrated: true } }])
    this.calibration = IDLE
    return true
  }
}
