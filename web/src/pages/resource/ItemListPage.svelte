<script lang="ts">
  import ResourceRoll from '$components/campaign/ResourceRoll.svelte'
  import { navigate, resolvedRoute } from 'sly-svelte-location-router'
  import Button from '$components/ui/Button.svelte'
  import Chip from '$components/ui/Chip.svelte'
  import Row from '$components/ui/Row.svelte'
  import { getCampaignId } from '$lib/api'
  import { userProfile } from '$lib/stores/auth.store'
  import { userCampaigns } from '$lib/stores/campaign.store'
  import { getChoices, getItemRoom, getItemType, type Item, type Rarity, type Resource } from '$lib/resources'

  const TYPES = getChoices('items', 'category')
  const RARITIES = getChoices('items', 'rarity') as readonly Rarity[]

  const steps = $derived($resolvedRoute.path.split('/').filter(Boolean).slice(1))
  const room = $derived(steps[0] !== 'campaign')
  const tables = $derived(Object.fromEntries($userCampaigns.map((one) => [one.id, one.name])))

  let type = $state('')
  let rarities = $state<Rarity[]>([])
  let bond = $state<'' | 'required' | 'free'>('')
  let source = $state<'' | Item['source']>('')
  let lock = $state<'' | 'open' | 'locked'>('')
  let table = $state('')

  const narrowed = $derived(Boolean(type || rarities.length > 0 || bond || source || lock || table))

  function keep(one: Resource) {
    const it = one as Item
    return (
      (!type || it.category === type) &&
      (rarities.length === 0 || rarities.includes(it.rarity)) &&
      (!bond || it.attunement === (bond === 'required')) &&
      (!source || it.source === source) &&
      (!lock || it.locked === (lock === 'locked')) &&
      (!table || it.owner_id === table)
    )
  }

  function address(one: Resource): string | null {
    const it = one as Item
    if (it.locked) return null
    const campaignId = getCampaignId(it, $userProfile)
    return campaignId ? `/main/campaign/${campaignId}/items/${it.id}` : `/main/items/${it.id}`
  }

  function toggle(rarity: Rarity) {
    rarities = rarities.includes(rarity) ? rarities.filter((one) => one !== rarity) : [...rarities, rarity]
  }

  function reset() {
    type = ''
    rarities = []
    bond = ''
    source = ''
    lock = ''
    table = ''
  }
</script>

<ResourceRoll kind="items" {keep} load={room ? getItemRoom : undefined} open={room ? address : undefined}>
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

    {#if room}
      <select class="item-pick" aria-label="Filter by source" bind:value={source}>
        <option value="">General and homebrew</option>
        <option value="general">General</option>
        <option value="homebrew">Homebrew</option>
      </select>

      <select class="item-pick" aria-label="Filter by lock" bind:value={lock}>
        <option value="">Locked or not</option>
        <option value="open">Unlocked</option>
        <option value="locked">Locked</option>
      </select>

      <select class="item-pick" aria-label="Filter by campaign" bind:value={table}>
        <option value="">Every campaign</option>
        {#each $userCampaigns as one (one.id)}
          <option value={one.id}>{one.name}</option>
        {/each}
      </select>
    {/if}

    {#if narrowed}
      <Button variant="ghost" size="sm" onclick={reset}>Reset</Button>
    {/if}
  {/snippet}

  {#snippet row(one, under, peek)}
    {@const it = one as unknown as Item}
    {@const opens = room ? address(one) : `${under}/${one.id}`}
    <Row
      title={one.title}
      sub={getItemType(it)}
      rarity={it.rarity}
      tone={it.source === 'general' ? 'verdigris' : 'metal'}
      image={one.image}
      onclick={it.locked ? undefined : () => peek(one)}
      onopen={opens ? () => navigate(opens) : undefined}
    >
      {#if room}
        <Chip still glyph={it.source === 'general' ? 'gem' : 'edit'}>{it.source === 'general' ? 'General' : 'Homebrew'}</Chip>
      {/if}
      {#if it.locked}<Chip still glyph="lock">Locked</Chip>{/if}
      <span>{it.rarity}</span>
      {#if it.attunement}<span>Requires attunement</span>{/if}
      {#if it.grants.charges.max > 0}<span>{it.grants.charges.max} {it.grants.charges.max === 1 ? 'charge' : 'charges'}</span>{/if}
      {#if it.value}<span>{it.value} gp</span>{/if}
      {#if room && tables[it.owner_id]}<span>{tables[it.owner_id]}</span>{/if}
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
