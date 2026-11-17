<script lang="ts">
  import ResourceShell from '$components/campaign/ResourceShell.svelte'
  import ItemDetails from '$components/campaign/ItemDetails.svelte'
  import Chip from '$components/ui/Chip.svelte'
  import { onMount } from 'svelte'
  import { resolvedRoute } from 'sly-svelte-location-router'
  import { getChoices, getItemLine, getItemRoom, getItemType, getRarityInk, type Item } from '$lib/resources'
  import { user } from '$lib/stores/auth.store'
  import { getSystems } from '$lib/rules/system'
  import type { RuleSystem } from '$lib/rules/spec.types'

  const TYPES = getChoices('items', 'category')
  const RARITIES = getChoices('items', 'rarity')

  let room = $state<Item[] | null>(null)
  let systems = $state<RuleSystem[]>([])

  const steps = $derived($resolvedRoute.path.split('/').filter(Boolean).slice(1))
  const recordId = $derived(steps[0] === 'campaign' ? steps[3] : steps[1])
  const fixed = $derived(
    room?.find((one) => one.id === recordId && one.user_id !== $user?.user_id) as (Record<string, unknown> & Item) | undefined
  )

  onMount(() => {
    if (steps[0] === 'campaign') room = []
    else
      void getItemRoom()
        .catch(() => [])
        .then((found) => (room = found))
    void getSystems()
      .then((found) => (systems = found))
      .catch(() => (systems = []))
  })
</script>

{#if room === null}
  <div class="dnd-loading"><span class="dnd-spinner"></span></div>
{:else}
  <ResourceShell kind="items" {fixed}>
    {#snippet line(one)}
      {@const it = one as unknown as Item}
      <p class="item-line">
        <Chip still glyph={it.source === 'general' ? 'gem' : 'edit'}>{it.source === 'general' ? 'General' : 'Homebrew'}</Chip>
        <span>{getItemLine(it)}</span>
      </p>
    {/snippet}

    {#snippet facts(one)}
      {@const it = one as unknown as Item}
      <dt>Type</dt>
      <dd>{getItemType(it)}</dd>
      <dt>Rarity</dt>
      <dd style:color={getRarityInk(it.rarity)}>{it.rarity}</dd>
      {#if it.attunement}<dt>Attunement</dt><dd>Required{it.attuned_by ? ` ${it.attuned_by}` : ""}</dd>{/if}
      {#if it.consumable}<dt>Consumable</dt><dd>Used up when used</dd>{/if}
      {#if it.weight}<dt>Weight</dt><dd>{it.weight} lb</dd>{/if}
      {#if it.value}<dt>Worth</dt><dd>{it.value} gp</dd>{/if}
    {/snippet}

    {#snippet form(one)}
      <dt><label for="item-category">Type</label></dt>
      <dd>
        <select id="item-category" bind:value={one.category}>
          {#each TYPES as choice (choice)}
            <option value={choice}>{choice}</option>
          {/each}
        </select>
      </dd>
      <dt><label for="item-subtype">Subtype</label></dt>
      <dd>
        <input id="item-subtype" type="text" placeholder="lantern, key, book" bind:value={one.subtype} />
      </dd>
      <dt><label for="item-rarity">Rarity</label></dt>
      <dd>
        <select id="item-rarity" bind:value={one.rarity}>
          {#each RARITIES as choice (choice)}
            <option value={choice}>{choice}</option>
          {/each}
        </select>
      </dd>
      <dt><label for="item-attunement">Requires attunement</label></dt>
      <dd>
        <select id="item-attunement" bind:value={one.attunement}>
          <option value={false}>No</option>
          <option value={true}>Yes</option>
        </select>
      </dd>
      {#if one.attunement}
        <dt><label for="item-attuned-by">Attuned by</label></dt>
        <dd>
          <input id="item-attuned-by" type="text" placeholder="by a wizard" bind:value={one.attuned_by} />
        </dd>
      {/if}
      <dt><label for="item-consumable">Consumable</label></dt>
      <dd>
        <select id="item-consumable" bind:value={one.consumable}>
          <option value={false}>No</option>
          <option value={true}>Yes</option>
        </select>
      </dd>
      <dt><label for="item-weight">Weight</label></dt>
      <dd>
        <input id="item-weight" type="number" min="0" step="any" bind:value={one.weight} />
      </dd>
      <dt><label for="item-value">Worth in gold</label></dt>
      <dd>
        <input id="item-value" type="number" min="0" step="any" bind:value={one.value} />
      </dd>
      <dt><label for="item-notes">Notes</label></dt>
      <dd>
        <input id="item-notes" type="text" placeholder="Damage, Poison, Combat" bind:value={one.notes} />
      </dd>
      <dt><label for="item-system">Rules</label></dt>
      <dd>
        <select id="item-system" bind:value={one.system}>
          {#each systems as choice (choice.id)}
            <option value={choice.id}>{choice.title}</option>
          {/each}
        </select>
      </dd>
    {/snippet}

    {#snippet tail(one, writing)}
      <ItemDetails one={one as unknown as Item} {writing} />
    {/snippet}
  </ResourceShell>
{/if}

<style>
  .item-line {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2);
    margin: 0;
    font-style: italic;
    color: var(--ink-dim);
  }
</style>
