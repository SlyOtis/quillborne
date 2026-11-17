<script lang="ts">
  import ItemFilters from '$components/campaign/ItemFilters.svelte'
  import ItemRow from '$components/campaign/ItemRow.svelte'
  import ResourceRoll from '$components/campaign/ResourceRoll.svelte'
  import { navigate, resolvedRoute } from 'sly-svelte-location-router'
  import { getCampaignId } from '$lib/api'
  import { userProfile } from '$lib/stores/auth.store'
  import { getEmptyItemFilter, getItemRoom, isItemShown, type Item, type Resource } from '$lib/resources'

  const steps = $derived($resolvedRoute.path.split('/').filter(Boolean).slice(1))
  const room = $derived(steps[0] !== 'campaign')

  let filter = $state(getEmptyItemFilter())

  function address(one: Resource): string | null {
    const it = one as Item
    if (it.locked) return null
    const campaignId = getCampaignId(it, $userProfile)
    return campaignId ? `/main/campaign/${campaignId}/items/${it.id}` : `/main/items/${it.id}`
  }
</script>

<ResourceRoll
  kind="items"
  keep={(one) => isItemShown(one as Item, filter)}
  load={room ? getItemRoom : undefined}
  open={room ? address : undefined}
>
  {#snippet tools()}
    <ItemFilters bind:filter facets={room ? ['source', 'lock', 'table'] : []} />
  {/snippet}

  {#snippet row(one, under, peek)}
    {@const it = one as unknown as Item}
    {@const opens = room ? address(one) : `${under}/${one.id}`}
    <ItemRow
      item={it}
      {room}
      onclick={it.locked ? undefined : () => peek(one)}
      onopen={opens ? () => navigate(opens) : undefined}
    />
  {/snippet}
</ResourceRoll>
