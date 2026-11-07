<script lang="ts">
  import { untrack } from 'svelte'
  import { EMPTY_SELECTION, selectionOf, type Level, type StageId } from '$lib/nimap'
  import type { Picked } from '$lib/nimap/render'
  import { Editor, type EditorAction, type EditorView } from '$lib/nimap-editor/editor.svelte'
  import type { LevelsControl } from '$lib/nimap-editor/levels'
  import { getCursorColours } from '$lib/nimap-editor/look'
  import Panel from '$components/ui/Panel.svelte'
  import CalibrationDialog from './CalibrationDialog.svelte'
  import EditorCanvas from './EditorCanvas.svelte'
  import EditorToolbar from './EditorToolbar.svelte'
  import FixturesSection from './FixturesSection.svelte'
  import FloorplanSection from './FloorplanSection.svelte'
  import LevelsSection from './LevelsSection.svelte'
  import ScenePane from './ScenePane.svelte'
  import SelectionSection from './SelectionSection.svelte'
  import StageBar from './StageBar.svelte'
  import StatusBar from './StatusBar.svelte'
  import ViewSection from './ViewSection.svelte'
  import WallsSection from './WallsSection.svelte'

  const {
    level,
    wallWidth,
    chooseImage,
    title,
    actions = [],
    levels,
    stage,
    view: initialView = 'plan',
    onchange,
    onstage,
    onview
  }: {
    /** The level edited; read once, the editor owns it from then on. */
    level: Level
    /** The width the wall pen starts with, in metres. */
    wallWidth?: number
    /** Asks the host for a floorplan image and resolves to a lasting address; left out, a local file is read. */
    chooseImage?: () => Promise<string | null | undefined>
    /** The host's name for what is edited, at the start of the top bar. */
    title?: string
    /** The host's buttons at the end of the top bar. */
    actions?: EditorAction[]
    /** The document's levels, when the editor is one level of several. */
    levels?: LevelsControl
    /** The stage the editor opens in. */
    stage?: StageId
    /** What the window shows when it opens. */
    view?: EditorView
    /** Runs with the level after every committed edit. */
    onchange?: (level: Level) => void
    /** Runs with the stage the editor moved to. */
    onstage?: (stage: StageId) => void
    /** Runs with the view the window moved to. */
    onview?: (view: EditorView) => void
  } = $props()

  const editor = untrack(() => new Editor({ level, wallWidth, cursorColours: getCursorColours() }))
  untrack(() => stage && editor.setStage(stage))

  let view = $state<EditorView>(untrack(() => initialView))
  let fileInput = $state<HTMLInputElement>()

  const SECTIONS: Record<StageId, ('floorplan' | 'selection' | 'walls' | 'fixtures' | 'view')[]> = {
    setup: ['floorplan'],
    trace: ['selection', 'walls', 'view'],
    furnish: ['selection', 'fixtures', 'view'],
    connect: ['selection']
  }

  const sections = $derived(SECTIONS[editor.activeStage])

  const pickable = $derived.by<Picked['kind'][]>(() => {
    const layers = editor.stage.layers
    return [...(layers.walls === 'live' || layers.walls === 'faces' ? (['room'] as const) : []), ...(layers.fixtures === 'live' || layers.fixtures === 'faces' ? (['fixture'] as const) : [])]
  })

  const picked = $derived<Picked[]>([...[...editor.selection.unitIds].map(id => ({ kind: 'room' as const, id })), ...[...editor.selection.fixtureIds].map(id => ({ kind: 'fixture' as const, id }))])

  const pick = (one: Picked | null) =>
    editor.select(one?.kind === 'room' ? selectionOf([], [], [], [], [one.id]) : one?.kind === 'fixture' ? selectionOf([], [], [one.id]) : EMPTY_SELECTION)

  const setView = (next: EditorView) => {
    if (next === view) return
    view = next
    onview?.(next)
  }

  const useImage = (url: string) => {
    const image = new Image()
    image.onload = () => editor.setReference({ url, widthPx: image.naturalWidth, heightPx: image.naturalHeight })
    image.src = url
  }

  const onImage = (e: Event & { currentTarget: HTMLInputElement }) => {
    const file = e.currentTarget.files?.[0]
    if (file) useImage(URL.createObjectURL(file))
  }

  const pickImage = async () => {
    if (!chooseImage) return fileInput?.click()
    const url = await chooseImage()
    if (url) useImage(url)
  }

  $effect(() => {
    const store = editor.doc.store
    let last = store.level
    return store.subscribe(() => {
      if (store.level === last) return
      last = store.level
      onchange?.(last)
    })
  })

  let lastStage = untrack(() => editor.activeStage)
  $effect(() => {
    const next = editor.activeStage
    if (next === lastStage) return
    lastStage = next
    untrack(() => onstage?.(next))
  })
</script>

{#snippet plan()}
  <div class="dnd-map-editor-plan">
    <EditorCanvas {editor} />
    {#if editor.calibrationStep}
      <p class="dnd-map-editor-step">{editor.calibrationStep} Esc cancels.</p>
    {/if}
    <EditorToolbar {editor} onchooseimage={pickImage} onfit={() => editor.fitToContent()} />
  </div>
{/snippet}

<div class="dnd-map-editor">
  <StageBar {view} {title} {actions} {levels} onview={setView} />
  <div class="dnd-map-editor-body">
    <div class="dnd-map-editor-stage dnd-map-editor-stage-{view}">
      {#if view === '3d'}
        <ScenePane level={editor.level} {pickable} selected={picked} onpick={pick} />
      {:else if view === 'split'}
        {@render plan()}
        <ScenePane level={editor.level} {pickable} selected={picked} onpick={pick} />
      {:else}
        {@render plan()}
      {/if}
    </div>
    <Panel title={editor.stage.label} pad="sm" corners={false}>
      <p class="dnd-map-editor-heading">{editor.stage.heading}</p>
      {#if levels && editor.activeStage === 'setup'}
        <LevelsSection {levels} />
      {/if}
      {#each sections as section (section)}
        {#if section === 'floorplan'}
          <FloorplanSection {editor} />
        {:else if section === 'selection'}
          <SelectionSection {editor} />
        {:else if section === 'walls'}
          <WallsSection {editor} />
        {:else if section === 'fixtures'}
          <FixturesSection {editor} />
        {:else}
          <ViewSection {editor} />
        {/if}
      {/each}
    </Panel>
  </div>
  <StatusBar {editor} />
  <CalibrationDialog {editor} />
  <input bind:this={fileInput} class="dnd-map-editor-file" type="file" accept="image/*" aria-label="Floorplan image" onchange={onImage} />
</div>

<style>
  .dnd-map-editor {
    display: grid;
    grid-template-rows: auto minmax(0, 1fr) auto;
    width: 100%;
    height: 100%;
    min-height: 0;
    color: var(--ink);
    background: var(--ground);
    font-family: var(--font-body);
    font-size: var(--text-sm);
    overscroll-behavior: none;
  }

  .dnd-map-editor-body {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, clamp(16rem, 24%, 24rem));
    gap: var(--space-2);
    min-height: 0;
    padding: var(--space-2);
  }

  .dnd-map-editor-stage {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    min-width: 0;
    min-height: 0;
    overflow: hidden;
    border: var(--border-hair) solid var(--metal-dim);
    border-radius: var(--radius-md);
  }

  .dnd-map-editor-stage-split {
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  }

  .dnd-map-editor-plan {
    position: relative;
    display: flex;
    min-width: 0;
    min-height: 0;
  }

  .dnd-map-editor-step {
    position: absolute;
    top: var(--space-3);
    left: 50%;
    z-index: 2;
    margin: 0;
    padding: var(--space-2) var(--space-4);
    transform: translateX(-50%);
    font-size: var(--text-sm);
    white-space: nowrap;
    color: var(--ink);
    background: var(--ground-raised);
    border: var(--border-hair) solid var(--metal-dim);
    border-radius: var(--radius-pill);
    box-shadow: var(--shadow-md);
    pointer-events: none;
  }

  .dnd-map-editor-heading {
    margin: 0;
    font-size: var(--text-sm);
    color: var(--ink-dim);
  }

  .dnd-map-editor-file {
    display: none;
  }
</style>
