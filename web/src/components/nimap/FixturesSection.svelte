<script lang="ts">
  import { fixtureGroup } from '$lib/nimap'
  import type { Editor } from '$lib/nimap-editor/editor.svelte'
  import Fold from '$components/ui/Fold.svelte'
  import Row from '$components/ui/Row.svelte'

  const {
    editor
  }: {
    /** The editor whose furniture the section lists by kind. */
    editor: Editor
  } = $props()

  let open = $state(true)
  const fixtures = $derived(editor.level.fixtures)
  const selected = $derived(editor.selection.fixtureIds)
  const groups = $derived.by(() => {
    const byGroup = new Map<string, string[]>()
    for (const f of fixtures) byGroup.set(fixtureGroup(f), [...(byGroup.get(fixtureGroup(f)) ?? []), f.id])
    return [...byGroup].map(([name, ids]) => ({ name, ids })).sort((a, b) => b.ids.length - a.ids.length)
  })

  const pick = (ids: string[], add: boolean) => {
    const current = editor.selection
    const base = add ? current : { nodeIds: new Set<string>(), lineIds: new Set<string>(), openingIds: new Set<string>(), unitIds: new Set<string>(), fixtureIds: new Set<string>() }
    editor.select({ ...base, fixtureIds: new Set([...base.fixtureIds, ...ids]) })
  }
</script>

<Fold title="Furniture" count={fixtures.length} {open} ontoggle={() => (open = !open)}>
  <div class="dnd-fixtures-section">
    {#if !fixtures.length}
      <p class="dnd-fixtures-section-hint">Nothing traced yet.</p>
    {/if}
    {#each groups as group (group.name)}
      <Row title={group.name} mark={String(group.ids.length)} on={group.ids.every(id => selected.has(id))} onclick={e => pick(group.ids, e.shiftKey)} />
    {/each}
  </div>
</Fold>

<style>
  .dnd-fixtures-section {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  .dnd-fixtures-section-hint {
    margin: 0;
    font-size: var(--text-sm);
    color: var(--ink-dim);
  }
</style>
