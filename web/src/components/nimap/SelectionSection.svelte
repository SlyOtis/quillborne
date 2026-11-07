<script lang="ts">
  import type { Editor } from '$lib/nimap-editor/editor.svelte'
  import Button from '$components/ui/Button.svelte'
  import FieldControl from './FieldControl.svelte'
  import PartsPreview from './PartsPreview.svelte'

  const {
    editor
  }: {
    /** The editor whose selection the section shows and edits through its inspector. */
    editor: Editor
  } = $props()

  const sections = $derived(editor.inspector.sections)
</script>

<div class="dnd-selection-section">
  {#if !sections.length}
    <p class="dnd-selection-section-hint">Select something to edit it.</p>
  {/if}
  {#each sections as section (section.kind)}
    <section class="dnd-selection-section-block" aria-label={section.label}>
      <p class="dnd-selection-section-eyebrow">{section.label}</p>
      <h3 class="dnd-selection-section-title">{section.title}</h3>
      {#if section.preview}
        <PartsPreview parts={section.preview} frame={section.ids.join()} />
      {/if}
      {#each section.fields as field (field.key)}
        <FieldControl {field} onchange={value => editor.inspector.apply(field.set(value))} />
      {/each}
      {#if section.actions.length}
        <span class="dnd-selection-section-actions">
          {#each section.actions as action (action.key)}
            <Button size="sm" variant="ghost" title={action.shortcut ? `${action.label} (${action.shortcut})` : action.label} onclick={() => editor.inspector.apply(action.run())}>{action.label}</Button>
          {/each}
        </span>
      {/if}
    </section>
  {/each}
</div>

<style>
  .dnd-selection-section {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }

  .dnd-selection-section-block {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .dnd-selection-section-hint {
    margin: 0;
    font-size: var(--text-sm);
    color: var(--ink-dim);
  }

  .dnd-selection-section-eyebrow {
    margin: 0;
    font-size: var(--text-xs);
    letter-spacing: var(--tracking-caps);
    text-transform: uppercase;
    color: var(--ink-faint);
  }

  .dnd-selection-section-title {
    margin: 0;
    font-family: var(--font-display);
    font-size: var(--text-md);
    color: var(--metal-bright);
  }

  .dnd-selection-section-actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
  }
</style>
