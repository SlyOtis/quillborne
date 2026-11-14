<script lang="ts">
  import ResourceRoll from '$components/campaign/ResourceRoll.svelte'
  import { navigate } from 'sly-svelte-location-router'
  import Button from '$components/ui/Button.svelte'
  import Chip from '$components/ui/Chip.svelte'
  import Row from '$components/ui/Row.svelte'
  import { getChoices, getItemType, type Item, type Rarity, type Resource } from '$lib/resources'

  const TYPES = getChoices('items', 'category')
  const RARITIES = getChoices('items', 'rarity') as readonly Rarity[]

  let type = $state('')
  let rarities = $state<Rarity[]>([])
  let bond = $state<'' | 'required' | 'free'>('')

  const narrowed = $derived(Boolean(type || rarities.length > 0 || bond))

  function keep(one: Resource) {
    const it = one as Item
    return (
      (!type || it.category === type) &&
      (rarities.length === 0 || rarities.includes(it.rarity)) &&
      (!bond || it.attunement === (bond === 'required'))
    )
  }

  function toggle(rarity: Rarity) {
    rarities = rarities.includes(rarity) ? rarities.filter((one) => one !== rarity) : [...rarities, rarity]
  }

  function reset() {
    type = ''
    rarities = []
    bond = ''
  }
</script>

<ResourceRoll kind="items" {keep}>
  {#snippet tools()}
    <select class="item-pick" aria-label="Filter by type" bind:value={type}>
      <option value="">Every type</option>
      {#each TYPES as one (one)}
        <option value={one}>{one}</option>
      {/each}
    </select>

    <span class="item-rarities" role="group" aria-label="Filter by rarity">
      {#each RARITIES as one (one)}
        <Chip on={rarities.includes(one)} rarity={one} onclick={() => toggle(one)}>{one}</Chip>
      {/each}
    </span>

    <select class="item-pick" aria-label="Filter by attunement" bind:value={bond}>
      <option value="">Any attunement</option>
      <option value="required">Requires attunement</option>
      <option value="free">No attunement</option>
    </select>

    {#if narrowed}
      <Button variant="ghost" size="sm" onclick={reset}>Reset</Button>
    {/if}
  {/snippet}

  {#snippet row(one, under, peek)}
    {@const it = one as unknown as Item}
    <Row
      title={one.title}
      sub={getItemType(it)}
      rarity={it.rarity}
      tone="metal"
      image={one.image}
      onclick={() => peek(one)}
      onopen={() => navigate(`${under}/${one.id}`)}
    >
      <span>{it.rarity}</span>
      {#if it.attunement}<span>Requires attunement</span>{/if}
      {#if it.charges > 0}<span>{it.charges} {it.charges === 1 ? 'charge' : 'charges'}</span>{/if}
      {#if it.value}<span>{it.value} gp</span>{/if}
      {#if one.tags.length > 0}
        <span class="roll-tags">
          {#each one.tags as tag (tag)}<span class="roll-tag">#{tag}</span>{/each}
        </span>
      {/if}
    </Row>
  {/snippet}
</ResourceRoll>

<style>
  .item-pick {
    flex: none;
    width: auto;
  }

  .item-rarities {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
    min-width: 0;
  }

  .roll-tags {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
  }

  .roll-tag {
    font-family: var(--font-display);
    letter-spacing: var(--tracking-wide);
    color: var(--metal);
    text-shadow: 0 1px 0 var(--keyline);
  }
</style>
