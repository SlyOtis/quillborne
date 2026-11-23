<script lang="ts">
  import { userCampaigns } from '$lib/stores/campaign.store'
  import { getChoices, getEmptyItemFilter, getItemSystem, type ItemFilter, type Rarity } from '$lib/resources'
  import type { ItemCategorySpec } from '$lib/rules/spec.types'
  import Button from '$components/ui/Button.svelte'
  import Chip from '$components/ui/Chip.svelte'
  import Dropdown from '$components/ui/Dropdown.svelte'

  let {
    filter = $bindable(),
    facets = []
  }: {
    /** What the items are narrowed by, written as the reader picks. */
    filter: ItemFilter
    /** The filters drawn after type, rarity and attunement. */
    facets?: ('source' | 'lock' | 'table')[]
  } = $props()

  const RARITIES = getChoices('items', 'rarity') as readonly Rarity[]

  let types = $state<ItemCategorySpec[]>([])

  $effect(() => {
    let live = true
    getItemSystem()
      .then((system) => live && (types = system.items?.categories ?? []))
      .catch(() => live && (types = []))
    return () => {
      live = false
    }
  })

  const narrowed = $derived(
    Boolean(filter.type || filter.rarities.length > 0 || filter.bond || filter.source || filter.lock || filter.table)
  )

  function toggle(rarity: Rarity) {
    filter.rarities = filter.rarities.includes(rarity) ? filter.rarities.filter((one) => one !== rarity) : [...filter.rarities, rarity]
  }

  function reset() {
    filter = { ...getEmptyItemFilter(), name: filter.name }
  }
</script>

<div class="dnd-item-filters">
  <Dropdown
    label="Filter by type"
    value={filter.type}
    options={[{ value: '', label: 'Every type' }, ...types.map((one) => ({ value: one.id, label: one.title }))]}
    onchange={(value) => (filter.type = value)}
  />

  <span class="dnd-item-filters-rarities" role="group" aria-label="Filter by rarity">
    {#each RARITIES as one (one)}
      <Chip on={filter.rarities.includes(one)} rarity={one} onclick={() => toggle(one)}>{one}</Chip>
    {/each}
  </span>

  <Dropdown
    label="Filter by attunement"
    value={filter.bond}
    options={[
      { value: '', label: 'Any attunement' },
      { value: 'required', label: 'Requires attunement' },
      { value: 'free', label: 'No attunement' }
    ]}
    onchange={(value) => (filter.bond = value as ItemFilter['bond'])}
  />

  {#if facets.includes('source')}
    <Dropdown
      label="Filter by source"
      value={filter.source}
      options={[
        { value: '', label: 'General and homebrew' },
        { value: 'general', label: 'General' },
        { value: 'homebrew', label: 'Homebrew' }
      ]}
      onchange={(value) => (filter.source = value as ItemFilter['source'])}
    />
  {/if}

  {#if facets.includes('lock')}
    <Dropdown
      label="Filter by lock"
      value={filter.lock}
      options={[
        { value: '', label: 'Locked or not' },
        { value: 'open', label: 'Unlocked' },
        { value: 'locked', label: 'Locked' }
      ]}
      onchange={(value) => (filter.lock = value as ItemFilter['lock'])}
    />
  {/if}

  {#if facets.includes('table')}
    <Dropdown
      label="Filter by campaign"
      value={filter.table}
      options={[{ value: '', label: 'Every campaign' }, ...$userCampaigns.map((one) => ({ value: one.id, label: one.name }))]}
      onchange={(value) => (filter.table = value)}
    />
  {/if}

  {#if narrowed}
    <Button variant="ghost" size="sm" onclick={reset}>Reset</Button>
  {/if}
</div>

<style>
  .dnd-item-filters {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-3);
    min-width: 0;
  }

  .dnd-item-filters-rarities {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
    min-width: 0;
  }
</style>
