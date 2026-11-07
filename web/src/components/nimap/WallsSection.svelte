<script lang="ts">
  import { EMPTY_SELECTION, exteriorWalls, STOREY_HEIGHT } from '$lib/nimap'
  import type { Editor } from '$lib/nimap-editor/editor.svelte'
  import Button from '$components/ui/Button.svelte'
  import Fold from '$components/ui/Fold.svelte'
  import NumberField from './NumberField.svelte'

  const {
    editor
  }: {
    /** The editor whose level ceiling and walls the section sets. */
    editor: Editor
  } = $props()

  let open = $state(true)
  const ceiling = $derived(Math.round((editor.level.height ?? STOREY_HEIGHT) * 100))

  const setCeiling = (centimetres: number) => {
    const height = centimetres / 100
    if (height !== (editor.level.height ?? STOREY_HEIGHT)) editor.commit('Ceiling height', [{ type: 'setStoreyHeight', height }])
  }

  const selectWalls = (outer: boolean) => {
    const level = editor.level
    const exterior = exteriorWalls(level)
    const lineIds = new Set(level.walls.filter(w => w.width > 0 && exterior.has(w.id) === outer).map(w => w.id))
    editor.select({ ...EMPTY_SELECTION, lineIds })
  }
</script>

<Fold title="Walls" {open} ontoggle={() => (open = !open)}>
  <div class="dnd-walls-section">
    <NumberField label="Ceiling height" value={ceiling} min={200} max={600} step={5} unit="cm" onchange={setCeiling} />
    <span class="dnd-walls-section-actions">
      <Button size="sm" variant="ghost" onclick={() => selectWalls(true)}>Select exterior</Button>
      <Button size="sm" variant="ghost" onclick={() => selectWalls(false)}>Select interior</Button>
    </span>
  </div>
</Fold>

<style>
  .dnd-walls-section {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .dnd-walls-section-actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
  }
</style>
