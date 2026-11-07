<script lang="ts">
  import { untrack } from 'svelte'
  import { createDocument, createLevel, readDocument, storeMap, type MapDocument, type StageId } from '$lib/nimap'
  import type { EditorAction, EditorView } from '$lib/nimap-editor/editor.svelte'
  import { addLevel, orderedLevels, removeLevel, renameLevel, withLevel, type LevelsControl } from '$lib/nimap-editor/levels'
  import MapEditor from './MapEditor.svelte'

  const {
    document,
    onchange,
    chooseImage,
    title,
    actions = []
  }: {
    /** The map to edit; read once, the editor owns it from then on. */
    document: MapDocument
    /** Runs with the whole document as stored after every committed edit. */
    onchange?: (document: MapDocument) => void
    /** Asks the host for a floorplan image and resolves to a lasting address; left out, a local file is read, gone with the page. */
    chooseImage?: () => Promise<string | null | undefined>
    /** The host's name for the map, at the start of the top bar. */
    title?: string
    /** The host's buttons at the end of the top bar. */
    actions?: EditorAction[]
  } = $props()

  const read = untrack(() => readDocument(document))
  const refused = read.document ? null : read.status === 'tooNew' ? `This map was saved by a newer editor. ${read.warnings[0] ?? ''}` : 'This is not a map this editor can open.'
  const initial = read.document ?? createDocument({ name: 'Map', levels: [createLevel({ name: '1' })] })

  const opened: MapDocument = initial.levels.length ? initial : { ...initial, levels: [createLevel({ name: '1' })] }

  let doc = $state.raw<MapDocument>(opened)
  let current = $state(orderedLevels(opened)[0].id)
  let stage = $state<StageId>()
  let view = $state<EditorView>()
  const level = $derived(doc.levels.find(l => l.id === current)!)

  const setDocument = (next: MapDocument) => {
    doc = next
    onchange?.(storeMap(next).document)
  }

  const levels = $derived<LevelsControl>({
    levels: orderedLevels(doc).map(l => ({ id: l.id, name: l.name })),
    current,
    switchTo: id => (current = id),
    add() {
      const made = addLevel(doc)
      setDocument(made.document)
      current = made.level.id
    },
    rename: (id, name) => setDocument(renameLevel(doc, id, name)),
    remove(id) {
      const next = removeLevel(doc, [], id)
      if (next.document === doc) return
      if (current === id) current = orderedLevels(next.document)[0].id
      setDocument(next.document)
    }
  })
</script>

{#if refused}
  <p class="dnd-document-editor-refused" role="alert">{refused}</p>
{:else}
  {#key current}
    <MapEditor
      {level}
      {levels}
      {stage}
      {view}
      {chooseImage}
      {title}
      {actions}
      onchange={edited => setDocument(withLevel(doc, edited))}
      onstage={next => (stage = next)}
      onview={next => (view = next)}
    />
  {/key}
{/if}

<style>
  .dnd-document-editor-refused {
    margin: 0;
    padding: var(--space-4);
    color: var(--state-bad);
  }
</style>
