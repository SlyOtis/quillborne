<script lang="ts">
  import type { Editor } from '$lib/nimap-editor/editor.svelte'
  import BaseDialog from '$components/BaseDialog.svelte'
  import Button from '$components/ui/Button.svelte'
  import Field from '$components/ui/Field.svelte'

  const {
    editor
  }: {
    /** The editor whose two calibration points the dialog gives a real distance. */
    editor: Editor
  } = $props()

  const id = $props.id()
  let metres = $state('5')
  const open = $derived(editor.calibration.active && editor.calibration.mode === 'scale' && editor.calibration.points.length === 2)
  const value = $derived(Number(metres.replace(',', '.')))

  const apply = () => {
    if (value > 0) editor.applyCalibration(value)
  }
</script>

<BaseDialog isOpen={open} title="Set scale" width="min(90%, 28rem)" onClose={() => editor.cancelCalibration()}>
  <div class="dnd-calibration-dialog">
    <Field label="Real distance between the two points, in metres" {id}>
      <input {id} type="text" inputmode="decimal" bind:value={metres} onkeydown={e => e.key === 'Enter' && apply()} />
    </Field>
    <span class="dnd-calibration-dialog-actions">
      <Button variant="ghost" onclick={() => editor.cancelCalibration()}>Cancel</Button>
      <Button variant="primary" disabled={!(value > 0)} onclick={apply}>Apply</Button>
    </span>
  </div>
</BaseDialog>

<style>
  .dnd-calibration-dialog {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }

  .dnd-calibration-dialog-actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-2);
  }
</style>
