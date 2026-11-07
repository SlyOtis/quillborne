import type { Level, Line, LineLayer, Unit } from '../model/types'
import { deriveUnits } from '../model/units'
import { deriveFixtures } from '../model/fixtures'
import { hostedOpenings } from '../model/openings'
import { applyCommands, normalizeLines, type Command } from './commands'
import { EMPTY_SELECTION, keepExisting, sameSelection, type Selection } from './selection'
import { nodeKey } from './graph'

export interface HistoryEntry {
  label: string
  level: Level
  selection: Selection
  /** State a host keeps beside the level that undo should follow, by key (the editor's bindings); carried into every later entry until set again. */
  extras?: Readonly<Record<string, unknown>>
}

export interface EditorStore {
  /** The committed level. */
  readonly level: Level
  /** The committed level with any preview commands applied. What the canvas draws. */
  readonly working: Level
  /** The selection as of the current history entry. */
  readonly selection: Selection
  readonly conflicts: Unit[]
  /** Set when the last commit could not re-derive units; the previous units were kept. */
  readonly warning: string | null
  readonly canUndo: boolean
  readonly canRedo: boolean
  readonly history: readonly string[]
  preview(commands: Command[]): void
  cancelPreview(): void
  /** Commits an edit; the selection defaults to the current one. */
  commit(label: string, commands?: Command[], selection?: Selection): void
  /** The value kept under `key` as of the current entry. */
  extra(key: string): unknown
  /** Keeps `value` under `key` as a history entry of its own, so undo takes it back. */
  setExtra(label: string, key: string, value: unknown): void
  /** Keeps `value` under `key` in the current entry, without a history entry: a starting value. */
  initExtra(key: string, value: unknown): void
  /** Records a selection change as its own entry; a no-op when nothing changed. */
  select(selection: Selection): void
  replace(label: string, level: Level): void
  undo(): void
  redo(): void
  subscribe(listener: () => void): () => void
}

export interface EditorStoreOptions {
  historyLimit?: number
  /** Re-derive units from walls after every commit. */
  reconcile?: boolean
}

/** Every id a selection may name in a level. */
function existing(level: Level) {
  const nodes = (lines: Line[], layer: LineLayer) => lines.flatMap(l => l.points.map(p => nodeKey(p, layer)))
  return {
    nodeIds: new Set([...nodes(level.walls, 'walls'), ...nodes(level.fixtureLines, 'fixtures')]),
    lineIds: new Set([...level.walls, ...level.fixtureLines].map(l => l.id)),
    fixtureIds: new Set(level.fixtures.map(f => f.id)),
    openingIds: new Set(level.openings.map(o => o.id)),
    unitIds: new Set(level.units.map(u => u.id))
  }
}

/**
 * Snapshot history over an immutable level and selection, as in Figma:
 * edits and selection changes are both entries, undo restores both. Previews
 * apply on top of the committed level without entering history; a commit
 * restores the wall invariant (near points merged, short walls dropped,
 * contacts split), drops openings no wall holds any more, then by default
 * re-derives units so declared identity follows the walls.
 */
export function createEditorStore(initial: Level, options: EditorStoreOptions = {}): EditorStore {
  const historyLimit = options.historyLimit ?? 1000
  const reconcile = options.reconcile ?? true
  const past: HistoryEntry[] = []
  const future: HistoryEntry[] = []
  const normalize = (level: Level): Level => {
    const walls = normalizeLines(level.walls)
    const fixtureLines = normalizeLines(level.fixtureLines)
    const openings = hostedOpenings(level.openings, walls)
    return walls === level.walls && fixtureLines === level.fixtureLines && openings === level.openings ? level : { ...level, walls, fixtureLines, openings }
  }
  let conflicts: Unit[] = []
  let warning: string | null = null
  const listeners = new Set<() => void>()
  const notify = () => listeners.forEach(l => l())

  const settle = (level: Level): Level => {
    if (!reconcile) return level
    try {
      const r = deriveUnits(level)
      const f = deriveFixtures(level)
      conflicts = r.conflicts
      warning = null
      const kept = new Set(r.units.map(u => u.id))
      const spaces = level.spaces?.map(space => (space.units.every(id => kept.has(id)) ? space : { ...space, units: space.units.filter(id => kept.has(id)) }))
      return { ...level, units: r.units, fixtures: f.fixtures, ...(spaces ? { spaces } : {}) }
    } catch (error) {
      warning = `Rooms not updated: ${(error as Error).message}`
      return level
    }
  }

  /** The opened level is normalised and settled too, so what the editor holds is always consistent. */
  let current: HistoryEntry = { label: 'Open', level: settle(normalize(initial)), selection: EMPTY_SELECTION }
  let working: Level = current.level

  /** Units and fixtures re-derived for a preview, so faces follow their lines while they move; identity and conflicts settle at commit. */
  const derived = (level: Level): Level => {
    if (!reconcile) return level
    try {
      return { ...level, units: deriveUnits(level).units, fixtures: deriveFixtures(level).fixtures }
    } catch {
      return level
    }
  }

  const push = (entry: HistoryEntry) => {
    past.push(current)
    if (past.length > historyLimit) past.shift()
    future.length = 0
    current = entry.extras || !current.extras ? entry : { ...entry, extras: current.extras }
    working = current.level
    notify()
  }

  /** A commit's selection holds only what still exists once the level has settled, so nothing downstream reads an id that names nothing. */
  const pushLevel = (label: string, level: Level, selection: Selection) => {
    const settled = settle(normalize(level))
    push({ label, level: settled, selection: keepExisting(selection, existing(settled)) })
  }

  return {
    get level() {
      return current.level
    },
    get working() {
      return working
    },
    get selection() {
      return current.selection
    },
    get conflicts() {
      return conflicts
    },
    get warning() {
      return warning
    },
    get canUndo() {
      return past.length > 0
    },
    get canRedo() {
      return future.length > 0
    },
    get history() {
      return [...past.map(e => e.label), current.label]
    },
    preview(commands) {
      working = derived(applyCommands(current.level, commands))
      notify()
    },
    cancelPreview() {
      working = current.level
      notify()
    },
    extra(key) {
      return current.extras?.[key]
    },
    setExtra(label, key, value) {
      push({ label, level: current.level, selection: current.selection, extras: { ...current.extras, [key]: value } })
    },
    initExtra(key, value) {
      current = { ...current, extras: { ...current.extras, [key]: value } }
    },
    commit(label, commands, selection = current.selection) {
      pushLevel(label, commands ? applyCommands(current.level, commands) : working, selection)
    },
    select(selection) {
      if (sameSelection(selection, current.selection)) return
      push({ label: 'Select', level: current.level, selection })
    },
    replace(label, level) {
      pushLevel(label, level, EMPTY_SELECTION)
    },
    undo() {
      const previous = past.pop()
      if (!previous) return
      future.push(current)
      current = previous
      working = current.level
      notify()
    },
    redo() {
      const next = future.pop()
      if (!next) return
      past.push(current)
      current = next
      working = current.level
      notify()
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    }
  }
}
