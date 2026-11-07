<script lang="ts">
  import type { Editor } from '$lib/nimap-editor/editor.svelte'
  import { referenceExtent } from '$lib/nimap-editor/calibration'
  import Field from '$components/ui/Field.svelte'
  import Fold from '$components/ui/Fold.svelte'

  const {
    editor
  }: {
    /** The editor whose floorplan image the section shows. */
    editor: Editor
  } = $props()

  const id = $props.id()
  let open = $state(true)
  const extent = $derived(editor.reference ? referenceExtent(editor.reference) : null)
</script>

<Fold title="Floorplan" {open} ontoggle={() => (open = !open)}>
  <div class="dnd-floorplan-section">
    {#if !editor.reference || !extent}
      <p class="dnd-floorplan-section-hint">No image yet. Add one from the bar below.</p>
    {:else}
      <Field label="Opacity" {id}>
        <input {id} type="range" min="0" max="1" step="0.05" value={editor.reference.opacity} onchange={e => editor.setReferenceOpacity(Number(e.currentTarget.value))} />
      </Field>
      <p class="dnd-floorplan-section-hint">
        {extent.width.toFixed(1)} by {extent.height.toFixed(1)} m{editor.calibrated ? '' : ', not calibrated'}
      </p>
    {/if}
  </div>
</Fold>

<style>
  .dnd-floorplan-section {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .dnd-floorplan-section-hint {
    margin: 0;
    font-size: var(--text-sm);
    color: var(--ink-dim);
  }
</style>
