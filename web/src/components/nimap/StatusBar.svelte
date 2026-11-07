<script lang="ts">
  import type { Editor } from '$lib/nimap-editor/editor.svelte'

  const {
    editor
  }: {
    /** The editor whose hand, warning and last step the bar reports. */
    editor: Editor
  } = $props()

  const TOOL_NAMES: Record<string, string> = { select: 'Select', 'wall-pen': 'Walls', 'fixture-pen': 'Furniture', door: 'Door', window: 'Window', bend: 'Bend', place: 'Place' }

  const status = $derived.by(() => {
    if (editor.calibration.active) return editor.calibrationStep ?? 'Setting the scale'
    if (!editor.calibrated) return 'Calibrate the floorplan before tracing'
    const tool = editor.stage.tools.length ? `, ${TOOL_NAMES[editor.shownToolId] ?? ''}` : ''
    return `${editor.stage.label}${tool}`
  })
</script>

<footer class="dnd-status-bar">
  {#if editor.warning}
    <span class="dnd-status-bar-warning">{editor.warning}</span>
  {:else}
    <span>{status}</span>
  {/if}
  <span class="dnd-status-bar-last">{editor.history.at(-1)}</span>
</footer>

<style>
  .dnd-status-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    padding: var(--space-1) var(--space-4);
    font-size: var(--text-xs);
    color: var(--ink-dim);
    background: var(--ground-raised);
    border-top: var(--border-hair) solid var(--metal-dim);
  }

  .dnd-status-bar-warning {
    color: var(--state-warn);
  }

  .dnd-status-bar-last {
    color: var(--ink-faint);
  }
</style>
