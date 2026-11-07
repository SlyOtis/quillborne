<script lang="ts">
  import type { Level } from '$lib/nimap'
  import type { Picked } from '$lib/nimap/render'
  import { getLook } from '$lib/nimap-editor/look'
  import { getScenePreview, putScenePreview } from '$lib/nimap-editor/scene.svelte'
  import Glyph from '$components/ui/Glyph.svelte'
  import IconBtn from '$components/ui/IconBtn.svelte'
  import MapView from './MapView.svelte'
  import NumberField from './NumberField.svelte'

  const {
    level,
    pickable = [],
    selected = [],
    onpick
  }: {
    /** The level as the map will show it. */
    level: Level
    /** Which things a click in the scene picks. */
    pickable?: Picked['kind'][]
    /** What is selected, marked in the scene. */
    selected?: Picked[]
    /** Runs with what a click picked, null on nothing. */
    onpick?: (picked: Picked | null) => void
  } = $props()

  const preview = getScenePreview()
  const look = getLook()
  let scene = $state<ReturnType<typeof MapView>>()
  let tuning = $state(false)

  $effect(() => {
    putScenePreview({ ...preview })
  })
</script>

<div class="dnd-scene-pane">
  <MapView
    bind:this={scene}
    {level}
    {look}
    fixtures={preview.furniture}
    openings={preview.openings}
    wallHeight={preview.wallHeight / 100}
    exteriorWallHeight={preview.exteriorWallHeight / 100}
    backdrop="spot"
    {pickable}
    {selected}
    {onpick}
  />
  <div class="dnd-scene-pane-corner">
    <span class="dnd-scene-pane-tools">
      <IconBtn title="Fit the map" onclick={() => scene?.fit()}>
        <Glyph name="fit" />
      </IconBtn>
      <IconBtn title="How the preview is cut" active={tuning} onclick={() => (tuning = !tuning)}>
        <Glyph name="gear" />
      </IconBtn>
    </span>
    {#if tuning}
      <div class="dnd-scene-pane-look">
        <label class="dnd-scene-pane-check">
          <input type="checkbox" bind:checked={preview.furniture} />
          <span>Furniture</span>
        </label>
        <label class="dnd-scene-pane-check">
          <input type="checkbox" bind:checked={preview.openings} />
          <span>Doors and windows</span>
        </label>
        <NumberField label="Cut walls at" value={preview.wallHeight} min={30} max={300} step={5} unit="cm" onchange={value => (preview.wallHeight = value)} />
        <NumberField label="Cut outer walls at" value={preview.exteriorWallHeight} min={30} max={300} step={5} unit="cm" onchange={value => (preview.exteriorWallHeight = value)} />
        <p class="dnd-scene-pane-note">Preview only. Nothing here is stored in the map.</p>
      </div>
    {/if}
  </div>
</div>

<style>
  .dnd-scene-pane {
    position: relative;
    display: flex;
    flex: 1;
    min-width: 0;
    min-height: 0;
  }

  .dnd-scene-pane-corner {
    position: absolute;
    top: var(--space-3);
    right: var(--space-3);
    z-index: 2;
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: var(--space-2);
    max-width: min(90%, 20rem);
  }

  .dnd-scene-pane-tools {
    display: flex;
    gap: var(--space-1);
    padding: var(--space-1);
    background: var(--ground-raised);
    border: var(--border-hair) solid var(--metal-dim);
    border-radius: var(--radius-md);
  }

  .dnd-scene-pane-look {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    padding: var(--space-3);
    background: var(--ground-raised);
    border: var(--border-hair) solid var(--metal-dim);
    border-radius: var(--radius-md);
    box-shadow: var(--shadow-md);
  }

  .dnd-scene-pane-check {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    font-size: var(--text-sm);
    color: var(--ink-dim);
  }

  .dnd-scene-pane-note {
    margin: 0;
    font-size: var(--text-xs);
    color: var(--ink-faint);
  }
</style>
