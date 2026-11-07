<script lang="ts">
  import type { LayerId } from '$lib/nimap'
  import type { Editor } from '$lib/nimap-editor/editor.svelte'
  import Fold from '$components/ui/Fold.svelte'

  const {
    editor
  }: {
    /** The editor whose other layer the section shows or hides. */
    editor: Editor
  } = $props()

  let open = $state(true)

  const other = $derived.by<{ id: LayerId; label: string } | null>(() => {
    const layers = editor.stage.layers
    if (layers.walls === 'live') return { id: 'fixtures', label: 'Show furniture' }
    if (layers.fixtures === 'live') return { id: 'walls', label: 'Show walls' }
    return null
  })
</script>

{#if other}
  <Fold title="View" {open} ontoggle={() => (open = !open)}>
    <label class="dnd-view-section">
      <input type="checkbox" checked={!editor.layers[other.id].hidden} onchange={e => editor.setLayer(other.id, { hidden: !e.currentTarget.checked })} />
      <span>{other.label}</span>
    </label>
  </Fold>
{/if}

<style>
  .dnd-view-section {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    font-size: var(--text-sm);
    color: var(--ink-dim);
  }
</style>
