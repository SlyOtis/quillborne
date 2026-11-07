/**
 * What the editor has selected: nodes by graph id (either layer), lines by
 * id (walls or fixture lines), fixtures, openings and rooms by id.
 * Immutable; every change is a new value and, as in Figma, a history entry.
 */
export interface Selection {
  readonly nodeIds: ReadonlySet<string>
  readonly lineIds: ReadonlySet<string>
  readonly fixtureIds: ReadonlySet<string>
  readonly openingIds: ReadonlySet<string>
  readonly unitIds: ReadonlySet<string>
}

export const EMPTY_SELECTION: Selection = { nodeIds: new Set(), lineIds: new Set(), fixtureIds: new Set(), openingIds: new Set(), unitIds: new Set() }

export const isEmptySelection = (s: Selection): boolean => s.nodeIds.size === 0 && s.lineIds.size === 0 && s.fixtureIds.size === 0 && s.openingIds.size === 0 && s.unitIds.size === 0

const sameSet = (a: ReadonlySet<string>, b: ReadonlySet<string>): boolean => a.size === b.size && [...a].every(id => b.has(id))

export const sameSelection = (a: Selection, b: Selection): boolean =>
  sameSet(a.nodeIds, b.nodeIds) && sameSet(a.lineIds, b.lineIds) && sameSet(a.fixtureIds, b.fixtureIds) && sameSet(a.openingIds, b.openingIds) && sameSet(a.unitIds, b.unitIds)

export const selectionOf = (nodeIds: Iterable<string> = [], lineIds: Iterable<string> = [], fixtureIds: Iterable<string> = [], openingIds: Iterable<string> = [], unitIds: Iterable<string> = []): Selection => ({
  nodeIds: new Set(nodeIds),
  lineIds: new Set(lineIds),
  fixtureIds: new Set(fixtureIds),
  openingIds: new Set(openingIds),
  unitIds: new Set(unitIds)
})

const toggled = (set: ReadonlySet<string>, id: string): Set<string> => {
  const out = new Set(set)
  if (!out.delete(id)) out.add(id)
  return out
}

export const toggleNode = (s: Selection, id: string): Selection => ({ ...s, nodeIds: toggled(s.nodeIds, id) })
export const toggleLine = (s: Selection, id: string): Selection => ({ ...s, lineIds: toggled(s.lineIds, id) })
export const toggleFixture = (s: Selection, id: string): Selection => ({ ...s, fixtureIds: toggled(s.fixtureIds, id) })
export const toggleOpening = (s: Selection, id: string): Selection => ({ ...s, openingIds: toggled(s.openingIds, id) })
export const toggleUnit = (s: Selection, id: string): Selection => ({ ...s, unitIds: toggled(s.unitIds, id) })

export function withoutSelected(s: Selection, nodeIds: Iterable<string>, lineIds: Iterable<string>, fixtureIds: Iterable<string> = [], openingIds: Iterable<string> = [], unitIds: Iterable<string> = []): Selection {
  const without = (set: ReadonlySet<string>, ids: Iterable<string>) => {
    const out = new Set(set)
    for (const id of ids) out.delete(id)
    return out
  }
  return { nodeIds: without(s.nodeIds, nodeIds), lineIds: without(s.lineIds, lineIds), fixtureIds: without(s.fixtureIds, fixtureIds), openingIds: without(s.openingIds, openingIds), unitIds: without(s.unitIds, unitIds) }
}

/** The selection with every id dropped that names nothing in `exists`: what an edit removed, or a face it made vanish. The same selection when nothing was dropped. */
export function keepExisting(s: Selection, exists: { nodeIds: ReadonlySet<string>; lineIds: ReadonlySet<string>; fixtureIds: ReadonlySet<string>; openingIds: ReadonlySet<string>; unitIds: ReadonlySet<string> }): Selection {
  const keep = (set: ReadonlySet<string>, known: ReadonlySet<string>) => [...set].filter(id => !known.has(id))
  const gone = { nodeIds: keep(s.nodeIds, exists.nodeIds), lineIds: keep(s.lineIds, exists.lineIds), fixtureIds: keep(s.fixtureIds, exists.fixtureIds), openingIds: keep(s.openingIds, exists.openingIds), unitIds: keep(s.unitIds, exists.unitIds) }
  if (Object.values(gone).every(ids => !ids.length)) return s
  return withoutSelected(s, gone.nodeIds, gone.lineIds, gone.fixtureIds, gone.openingIds, gone.unitIds)
}

/** The same selection with node ids rewritten, for nodes that moved. */
export function remapNodes(s: Selection, map: (id: string) => string): Selection {
  return { ...s, nodeIds: new Set([...s.nodeIds].map(map)) }
}
