<script lang="ts">
  import { centimetres, type PenMethod, type StageId, type ToolId } from '$lib/nimap'
  import type { Editor } from '$lib/nimap-editor/editor.svelte'
  import { COMMAND_KEY } from '$lib/nimap-editor/platform'
  import Button from '$components/ui/Button.svelte'
  import IconBtn from '$components/ui/IconBtn.svelte'
  import Glyph, { type GlyphName } from '$components/ui/Glyph.svelte'

  const {
    editor,
    onchooseimage,
    onfit
  }: {
    /** The editor whose stages and tools the bar offers. */
    editor: Editor
    /** Runs when the floorplan image is to be chosen. */
    onchooseimage: () => void
    /** Runs when the drawing is to be framed again. */
    onfit: () => void
  } = $props()

  const TOOLS: Record<Exclude<ToolId, 'place'>, { glyph: GlyphName; title: string; keys: string }> = {
    select: { glyph: 'pointer', title: 'Select', keys: 'V' },
    'wall-pen': { glyph: 'lines', title: 'Draw walls', keys: 'P' },
    'fixture-pen': { glyph: 'lines', title: 'Trace furniture', keys: 'F' },
    door: { glyph: 'door', title: 'Door', keys: 'D' },
    window: { glyph: 'window', title: 'Window', keys: 'W' },
    bend: { glyph: 'bend', title: 'Bend', keys: `B, or hold ${COMMAND_KEY} in Select` }
  }

  const STAGE_GLYPHS: Partial<Record<StageId, GlyphName>> = { setup: 'floorplan', trace: 'wall', furnish: 'furniture' }

  const METHODS: { value: PenMethod; glyph: GlyphName; title: string }[] = [
    { value: 'lines', glyph: 'lines', title: 'Lines' },
    { value: 'rectangle', glyph: 'rectangle', title: 'Rectangle' },
    { value: 'ellipse', glyph: 'ellipse', title: 'Ellipse' }
  ]

  const stage = $derived(editor.stage)
  const stages = $derived(editor.stages.filter(s => STAGE_GLYPHS[s.id]))
  const shown = $derived(stage.tools.filter((id): id is Exclude<ToolId, 'place'> => id !== 'place'))
  const active = $derived(editor.shownToolId)
  const enabled = $derived(editor.toolsEnabled)
  const pen = $derived(active === 'wall-pen' || active === 'fixture-pen')
  const width = $derived(active === 'wall-pen' ? centimetres(editor.wallWidth) : active === 'door' || active === 'window' ? centimetres(editor.openingWidth[active]) : null)
  const calibrateLabel = $derived(editor.calibration.active ? 'Cancel' : editor.drawn ? 'Align image' : editor.reference?.calibrated ? 'Recalibrate' : 'Calibrate')
  const calibrateTitle = $derived(editor.drawn ? 'Two points on the image, then the same two on the drawing' : 'Set the scale of the image from a distance you know')

  const toggleCalibration = () => (editor.calibration.active ? editor.cancelCalibration() : editor.startCalibration())
</script>

<div class="dnd-editor-toolbar" role="toolbar" aria-label="Tools" tabindex="-1" onpointerdown={e => e.stopPropagation()}>
  {#if stage.id === 'setup'}
    <Button variant="secondary" size="sm" title="Choose the floorplan image" onclick={onchooseimage}>Image</Button>
    {#if editor.reference}
      <Button variant={!editor.calibrated || editor.calibration.active ? 'primary' : 'secondary'} size="sm" title={calibrateTitle} onclick={toggleCalibration}>{calibrateLabel}</Button>
    {/if}
  {:else}
    {#each shown as id (id)}
      <IconBtn title={`${TOOLS[id].title} (${TOOLS[id].keys})`} active={active === id} disabled={!enabled} onclick={() => editor.setTool(id)}>
        <Glyph name={TOOLS[id].glyph} />
      </IconBtn>
    {/each}
    {#if pen}
      <span class="dnd-editor-toolbar-rule" aria-hidden="true"></span>
      {#each METHODS as method (method.value)}
        <IconBtn title={method.title} active={editor.penMethod === method.value} disabled={!enabled} onclick={() => (editor.penMethod = method.value)}>
          <Glyph name={method.glyph} />
        </IconBtn>
      {/each}
    {/if}
    {#if width}
      <span class="dnd-editor-toolbar-rule" aria-hidden="true"></span>
      <IconBtn title="Narrower (-), Shift for 5 cm" disabled={!enabled} onclick={e => editor.stepWidthInHand(-1, e.shiftKey)}>
        <Glyph name="minus" />
      </IconBtn>
      <span class="dnd-editor-toolbar-value">{width}</span>
      <IconBtn title="Wider (+), Shift for 5 cm" disabled={!enabled} onclick={e => editor.stepWidthInHand(1, e.shiftKey)}>
        <Glyph name="add" />
      </IconBtn>
    {/if}
  {/if}
  <span class="dnd-editor-toolbar-rule" aria-hidden="true"></span>
  <IconBtn title="Fit the drawing" onclick={onfit}>
    <Glyph name="fit" />
  </IconBtn>
  <span class="dnd-editor-toolbar-rule" aria-hidden="true"></span>
  {#each stages as s (s.id)}
    <IconBtn title={`${s.label}: ${s.heading}`} tone="verdigris" active={s.id === stage.id} onclick={() => editor.setStage(s.id)}>
      <Glyph name={STAGE_GLYPHS[s.id] ?? 'pane'} />
    </IconBtn>
  {/each}
</div>

<style>
  .dnd-editor-toolbar {
    position: absolute;
    left: 50%;
    bottom: var(--space-4);
    z-index: 2;
    display: flex;
    align-items: center;
    gap: var(--space-2);
    flex-wrap: wrap;
    justify-content: center;
    width: max-content;
    max-width: calc(100% - 2 * var(--space-4));
    padding: var(--space-2) var(--space-3);
    transform: translateX(-50%);
    background: var(--ground-raised);
    border: var(--border-hair) solid var(--metal-dim);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-md);
  }

  .dnd-editor-toolbar-rule {
    align-self: stretch;
    width: var(--border-hair);
    margin: 0 var(--space-1);
    background: var(--metal-dim);
  }

  .dnd-editor-toolbar-value {
    min-width: 3.5em;
    text-align: center;
    font-family: var(--font-figures);
    font-size: var(--text-sm);
    color: var(--ink);
  }
</style>
