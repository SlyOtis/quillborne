<script lang="ts">
  import type { LevelsControl } from '$lib/nimap-editor/levels'
  import Button from '$components/ui/Button.svelte'
  import Field from '$components/ui/Field.svelte'
  import Fold from '$components/ui/Fold.svelte'
  import Row from '$components/ui/Row.svelte'

  const {
    levels
  }: {
    /** The document's levels from the lowest up, and what may be done to them. */
    levels: LevelsControl
  } = $props()

  const id = $props.id()
  let open = $state(true)
  const current = $derived(levels.levels.find(l => l.id === levels.current))

  const remove = () => {
    if (current && window.confirm(`Remove level ${current.name || 'Unnamed'} and everything traced on it?`)) levels.remove(current.id)
  }
</script>

<Fold title="Levels" count={levels.levels.length} {open} ontoggle={() => (open = !open)}>
  <div class="dnd-levels-section">
    {#each levels.levels as level (level.id)}
      <Row title={level.name || 'Unnamed'} on={level.id === levels.current} onclick={() => levels.switchTo(level.id)} />
    {/each}
    {#if current}
      <Field label="Name of this level" id={`${id}-name`}>
        <input id={`${id}-name`} type="text" value={current.name} placeholder="Name" onchange={e => levels.rename(current.id, e.currentTarget.value)} />
      </Field>
    {/if}
    <span class="dnd-levels-section-actions">
      <Button size="sm" variant="secondary" onclick={() => levels.add()}>Add a level</Button>
      {#if levels.levels.length > 1}
        <Button size="sm" variant="danger" onclick={remove}>Remove this level</Button>
      {/if}
    </span>
  </div>
</Fold>

<style>
  .dnd-levels-section {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .dnd-levels-section-actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
  }
</style>
