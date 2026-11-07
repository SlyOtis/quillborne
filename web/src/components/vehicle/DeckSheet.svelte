<script lang="ts">
  import { getPerkSummary, getSigned } from '$lib/rules/vehicle'
  import type { Crewman, VehicleContext } from '$lib/rules/vehicle.types'
  import Button from '$components/ui/Button.svelte'
  import Fold from '$components/ui/Fold.svelte'

  const {
    ctx,
    crewman,
    onperks
  }: {
    /** The vessel whose perks are read. */
    ctx: VehicleContext
    /** The character the reader sails as, whose abilities and perks fill the sheet. */
    crewman: Crewman | null
    /** Opens the place where the perks are taken. */
    onperks?: () => void
  } = $props()

  const ABILITIES = ['strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma']

  let open = $state<string[]>([])

  const perks = $derived(
    (crewman?.perks ?? []).flatMap((entry) => {
      const perk = ctx.system.perks.find((candidate) => candidate.id === entry.id)
      return perk ? [{ perk, count: entry.count, tree: ctx.system.perkTrees.findIndex((tree) => tree.key === perk.tree) }] : []
    })
  )
  const used = $derived((crewman?.perks ?? []).reduce((sum, entry) => sum + entry.count, 0))

  function toggle(id: string) {
    open = open.includes(id) ? open.filter((entry) => entry !== id) : [...open, id]
  }
</script>

<div class="ds">
  <dl class="ds-abilities" aria-label="Ability modifiers">
    {#each ABILITIES as ability (ability)}
      <div class="ds-ability">
        <dt>{ability.slice(0, 3).toUpperCase()}</dt>
        <dd>{crewman ? getSigned(crewman.modifiers[ability] ?? 0) : '—'}</dd>
      </div>
    {/each}
  </dl>

  <section class="ds-part" aria-label={ctx.system.crew.perks}>
    <div class="ds-line">
      <h3 class="dnd-label ds-head">{ctx.system.crew.perks}{crewman ? ` ${used}/${crewman.crewLevel}` : ''}</h3>
      {#if onperks}
        <Button variant="secondary" size="sm" onclick={onperks}>Perks</Button>
      {/if}
    </div>
    {#if !crewman}
      <p class="ds-quiet">Choose who you sail as to see their perks.</p>
    {:else}
      {#each perks as { perk, count, tree } (perk.id)}
        <Fold title="{perk.name}{count > 1 ? ` ×${count}` : ''}" variant="row" open={open.includes(perk.id)} ontoggle={() => toggle(perk.id)}>
          <div class="ds-perk-body">
            <p class="ds-meta"><span class="ds-tree ds-tree-{tree % 4}"></span>{ctx.system.perkTrees[tree]?.name ?? perk.tree} · {perk.actionType}{perk.range ? ` · ${perk.range}` : ''}{perk.duration ? ` · ${perk.duration}` : ''}</p>
            <p class="ds-text">{perk.description}</p>
            {#if perk.additional}<p class="ds-quiet">{perk.additional}</p>{/if}
          </div>
        </Fold>
        {#if !open.includes(perk.id)}
          <p class="ds-meta ds-summary"><span class="ds-tree ds-tree-{tree % 4}"></span>{getPerkSummary(perk, count, crewman)}</p>
        {/if}
      {:else}
        <p class="ds-quiet">No perks taken yet.</p>
      {/each}
    {/if}
  </section>
</div>

<style>
  .ds {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    min-width: 0;
  }

  .ds-abilities {
    display: grid;
    grid-template-columns: repeat(6, minmax(0, 1fr));
    gap: var(--space-1);
    margin: 0;
  }

  .ds-ability {
    display: grid;
    justify-items: center;
    padding: var(--space-1) 0;
    border-radius: var(--radius-sm);
    background: var(--ground-deep);
    box-shadow: var(--rim-thin);
  }

  .ds-ability dt {
    font-family: var(--font-display);
    font-size: var(--text-xs);
    color: var(--metal);
  }

  .ds-ability dd {
    margin: 0;
    font-family: var(--font-figures);
    font-weight: 700;
    color: var(--ink);
  }

  .ds-part {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .ds-head {
    margin: 0;
    color: var(--metal-bright);
  }

  .ds-line {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
    block-size: var(--space-6);
  }

  .ds-perk-body {
    display: grid;
    gap: var(--space-1);
    padding-block: var(--space-2);
  }

  .ds-meta {
    display: flex;
    align-items: baseline;
    gap: var(--space-1);
    margin: 0;
    font-size: var(--text-xs);
    color: var(--ink-dim);
  }

  .ds-summary {
    margin-block-start: calc(var(--space-1) * -1);
    padding-inline-start: var(--space-2);
  }

  .ds-tree {
    flex: none;
    inline-size: var(--space-2);
    block-size: var(--space-2);
    border-radius: var(--radius-pill);
    background: var(--metal);
  }

  .ds-tree-0 {
    background: var(--ember);
  }

  .ds-tree-1 {
    background: var(--state-good);
  }

  .ds-tree-2 {
    background: var(--metal);
  }

  .ds-tree-3 {
    background: var(--verdigris);
  }

  .ds-text {
    margin: 0;
    font-size: var(--text-sm);
    color: var(--ink);
  }

  .ds-quiet {
    margin: 0;
    font-size: var(--text-sm);
    font-style: italic;
    color: var(--ink-faint);
  }
</style>
