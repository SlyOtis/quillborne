import { inspect, type Edit, type InspectorSection } from '$lib/nimap'
import type { DocumentState } from './document.svelte'

export class InspectorState {
  readonly #doc: DocumentState

  constructor(doc: DocumentState) {
    this.#doc = doc
  }

  sections = $derived.by<InspectorSection[]>(() => inspect(this.#doc.committedSelection, { level: this.#doc.working, graph: this.#doc.graph }))

  apply = (edit: Edit | null) => {
    if (edit) this.#doc.commit(edit.commit, edit.commands, edit.selection)
  }
}
