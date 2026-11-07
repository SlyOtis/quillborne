<script lang="ts">
  import type { EditorAction, EditorView } from '$lib/nimap-editor/editor.svelte'
  import type { LevelsControl } from '$lib/nimap-editor/levels'
  import Button from '$components/ui/Button.svelte'
  import Field from '$components/ui/Field.svelte'
  import IconBtn from '$components/ui/IconBtn.svelte'
  import Glyph, { type GlyphName } from '$components/ui/Glyph.svelte'

  const {
    view,
    title,
    actions = [],
    levels,
    onview
  }: {
    /** What the window shows: the plan, the 3D, or both. */
    view: EditorView
    /** The host's name for what is edited, at the start of the bar. */
    title?: string
    /** The host's buttons at the end of the bar. */
    actions?: EditorAction[]
    /** The document's levels, for switching between them. */
    levels?: LevelsControl
    /** Runs when another view is chosen. */
    onview: (view: EditorView) => void
  } = $props()

  const id = $props.id()

  const VIEWS: { value: EditorView; label: string; glyph: GlyphName }[] = [
    { value: 'plan', label: 'Plan', glyph: 'pane' },
    { value: 'split', label: 'Plan and 3D side by side', glyph: 'split' },
    { value: '3d', label: '3D', glyph: 'cube' }
  ]
</script>

<header class="dnd-stage-bar">
  <span class="dnd-stage-bar-start">
    {#if title}
      <span class="dnd-stage-bar-title">{title}</span>
    {/if}
    {#if levels && levels.levels.length > 1}
      <Field label="Level" id={`${id}-level`}>
        <select id={`${id}-level`} value={levels.current} onchange={e => levels.switchTo(e.currentTarget.value)}>
          {#each levels.levels as level (level.id)}
            <option value={level.id}>{level.name || 'Unnamed'}</option>
          {/each}
        </select>
      </Field>
    {/if}
  </span>
  <span class="dnd-stage-bar-end">
    <span class="dnd-stage-bar-views" role="group" aria-label="View">
      {#each VIEWS as v (v.value)}
        <IconBtn title={v.label} active={view === v.value} onclick={() => onview(v.value)}>
          <Glyph name={v.glyph} />
        </IconBtn>
      {/each}
    </span>
    {#each actions as action (action.label)}
      <Button size="sm" variant={action.primary ? 'primary' : 'secondary'} onclick={() => action.run()}>{action.label}</Button>
    {/each}
  </span>
</header>

<style>
  .dnd-stage-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    padding: var(--space-2) var(--space-4);
    background: var(--ground-raised);
    border-bottom: var(--border-hair) solid var(--metal-dim);
  }

  .dnd-stage-bar-start,
  .dnd-stage-bar-end,
  .dnd-stage-bar-views {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    min-width: 0;
  }

  .dnd-stage-bar-views {
    gap: var(--space-1);
  }

  .dnd-stage-bar-title {
    font-family: var(--font-display);
    font-size: var(--text-md);
    letter-spacing: var(--tracking-caps);
    text-transform: uppercase;
    color: var(--metal-bright);
  }
</style>
