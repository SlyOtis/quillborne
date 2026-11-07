import type { Command } from './commands'
import type { Part } from '../furniture/parts'
import type { Selection } from './selection'
import { withoutSelected } from './selection'
import { KINDS, selectedOf, type Kind, type KindContext, type KindId } from './kinds'

/** What a field shows when the selected things disagree. */
export const MIXED: unique symbol = Symbol('mixed')

export type FieldValue = string | number | boolean

/** How a field is edited: free text, a number within limits in its unit, one of many choices, one of a few shown side by side, one of a few kinds of thing each shown by a picture of its parts, a count that is `AUTO` or a number, or on and off. */
export type FieldControl =
  | { type: 'text'; placeholder?: string }
  | { type: 'number'; min: number; max: number; step: number; unit?: string }
  | { type: 'choice'; options: { value: string; label: string }[] }
  | { type: 'segment'; options: { value: string; label: string }[] }
  | { type: 'tiles'; options: { value: string; label: string; parts: Part[] }[] }
  | { type: 'count'; min: number; max: number; unit?: string; /** What the automatic choice is called; Auto when left out. */ auto?: string }
  | { type: 'toggle' }

/** A count's value when the recipe decides it. */
export const AUTO = 'auto'

/** An edit ready for the store: its commands, the name it gets in history, and the selection after it when it changes. */
export interface Edit {
  commands: Command[]
  commit: string
  selection?: Selection
}

/** One property of the selected things of a kind, read across all of them. */
export interface Field {
  key: string
  label: string
  control: FieldControl
  value: FieldValue | typeof MIXED
  /** The edit that gives every selected thing `value`; null when none would change. */
  set(value: FieldValue): Edit | null
}

/** Something to do to the selected things of a kind, with the key that does the same. */
export interface Action {
  key: string
  label: string
  shortcut?: string
  run(): Edit | null
}

/** What the panel shows for the selected things of one kind. */
export interface InspectorSection {
  kind: KindId
  label: string
  /** What the selected things are, in a word or two: "Desk", "4 tables", "3 walls". */
  title: string
  ids: string[]
  fields: Field[]
  actions: Action[]
  /** The piece on its own, as parts to render, when the kind offers one. */
  preview: Part[] | null
}

/** The value every thing shares, or `MIXED` when they differ. */
export function shared<T extends FieldValue>(values: T[]): T | typeof MIXED {
  return values.every(v => v === values[0]) ? values[0] : MIXED
}

const deleteAction = (kind: Kind, ids: string[], selection: Selection, ctx: KindContext): Action => ({
  key: 'delete',
  label: 'Delete',
  shortcut: 'Delete',
  run() {
    const commands = kind.remove(ids, ctx)
    if (!commands.length) return null
    const lines = kind.id === 'wall' || kind.id === 'fixture-line' ? ids : []
    return { commands, commit: 'Delete', selection: withoutSelected(selection, [], lines, kind.id === 'fixture' ? ids : [], kind.id === 'opening' ? ids : [], kind.id === 'room' ? ids : []) }
  }
})

/**
 * What a selection shows in the panel: a section for every kind with
 * something selected, in the registry's order, each with the fields its
 * kind declares, read across every selected thing of it, and its actions,
 * delete last where the kind can remove them. The panel renders this and nothing else, so a kind that
 * declares a field has it in every host.
 */
export function inspect(selection: Selection, ctx: KindContext): InspectorSection[] {
  return KINDS.flatMap(kind => {
    const ids = selectedOf(kind, selection, ctx.graph)
    if (!ids.length) return []
    return [{
      kind: kind.id,
      label: ids.length === 1 ? kind.noun[0] : `${ids.length} ${kind.noun[1]}`,
      title: kind.title?.(ids, ctx) ?? (ids.length === 1 ? kind.noun[0] : `${ids.length} ${kind.noun[1]}`),
      ids,
      fields: kind.fields?.(ids, ctx) ?? [],
      actions: [...(kind.actions?.(ids, ctx) ?? []), ...(kind.remove(ids, ctx).length ? [deleteAction(kind, ids, selection, ctx)] : [])],
      preview: kind.preview?.(ids, ctx) ?? null
    }]
  })
}
