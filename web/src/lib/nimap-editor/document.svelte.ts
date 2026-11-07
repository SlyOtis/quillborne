import {
  buildEditGraph,
  createEditorStore,
  createSolidsUpdater,
  fixturePlan,
  junctionPoints,
  levelFaceTargets,
  levelToSvg,
  openingCuts,
  placeOpenings,
  safeSolids,
  wallRuns,
  type Command,
  type EditGraph,
  type EditorStore,
  type FixturePlan,
  type Level,
  type Selection,
  type SolidsResult,
  type Unit
} from '$lib/nimap'

export class DocumentState {
  readonly store: EditorStore
  level = $state.raw<Level>() as Level
  working = $state.raw<Level>() as Level
  committedSelection = $state.raw<Selection>() as Selection
  history = $state.raw<readonly string[]>([])
  canUndo = $state(false)
  canRedo = $state(false)
  conflicts = $state.raw<Unit[]>([])
  warning = $state<string | null>(null)

  readonly #updater = createSolidsUpdater()

  constructor(initial: Level) {
    this.store = createEditorStore(initial)
    this.#read()
    this.store.subscribe(() => this.#read())
  }

  #read() {
    const store = this.store
    this.level = store.level
    this.working = store.working
    this.committedSelection = store.selection
    this.history = store.history
    this.canUndo = store.canUndo
    this.canRedo = store.canRedo
    this.conflicts = store.conflicts
    this.warning = store.warning
  }

  graph = $derived<EditGraph>(buildEditGraph(this.working.walls, this.working.fixtureLines))
  junctions = $derived(junctionPoints(this.level.walls))

  committedSolids = $derived.by<SolidsResult>(() => {
    const l = this.level
    const solids = safeSolids(l.walls, l.openings)
    this.#updater.adopt(l.walls, openingCuts(l.openings, l.walls), solids)
    return solids
  })

  workingSolids = $derived.by<SolidsResult>(() => {
    const w = this.working
    if (w === this.level) return this.committedSolids
    void this.committedSolids
    try {
      return this.#updater.update(w.walls, openingCuts(w.openings, w.walls))
    } catch {
      return safeSolids(w.walls, w.openings)
    }
  })

  faces = $derived(levelFaceTargets(this.level.walls, this.committedSolids.boundary))
  runs = $derived(wallRuns(this.working.walls))
  placedOpenings = $derived(placeOpenings(this.working.openings, this.working.walls, this.runs))
  svg = $derived(levelToSvg(this.working, { flipY: false, solids: this.workingSolids }))

  fixturePlans = $derived.by(() => {
    const plans = new Map<string, FixturePlan>()
    for (const f of this.working.fixtures) {
      try {
        const plan = fixturePlan(f, this.working.fixtureLines, this.working.fixtures)
        if (plan) plans.set(f.id, plan)
      } catch {}
    }
    return plans
  })

  commit(label: string, commands: Command[], next?: Selection) {
    this.store.commit(label, commands, next)
  }
}
