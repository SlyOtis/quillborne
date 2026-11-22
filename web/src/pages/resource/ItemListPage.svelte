<script lang="ts">
  import BaseDialog from '$components/BaseDialog.svelte'
  import ItemFilters from '$components/campaign/ItemFilters.svelte'
  import ItemRow from '$components/campaign/ItemRow.svelte'
  import ResourceRoll from '$components/campaign/ResourceRoll.svelte'
  import Button from '$components/ui/Button.svelte'
  import Dropdown from '$components/ui/Dropdown.svelte'
  import Field from '$components/ui/Field.svelte'
  import SearchInput from '$components/ui/SearchInput.svelte'
  import { navigate, resolvedRoute } from 'sly-svelte-location-router'
  import { getCampaignCharacters, getCampaignId, isNpc } from '$lib/api'
  import type { Character } from '$lib/api/types'
  import type { CharacterCurrency } from '$lib/character.types'
  import { postCoinShares, postGift } from '$lib/engine'
  import type { RuleSystem } from '$lib/rules/spec.types'
  import { user, userProfile } from '$lib/stores/auth.store'
  import { userCampaigns } from '$lib/stores/campaign.store'
  import { getEmptyItemFilter, getGivenItem, getItemRoom, getItemSystem, isItemShown, type Item, type Resource } from '$lib/resources'

  const steps = $derived($resolvedRoute.path.split('/').filter(Boolean).slice(1))
  const room = $derived(steps[0] !== 'campaign')
  const campaignId = $derived(room ? '' : (steps[1] ?? ''))
  const isDm = $derived(Boolean(campaignId && $user && $userCampaigns.find((one) => one.id === campaignId)?.dm_id === $user.user_id))

  let filter = $state(getEmptyItemFilter())

  let giving = $state(false)
  let sharing = $state(false)
  let party = $state<Character[]>([])
  let loot = $state<Item[] | null>(null)
  let system = $state<RuleSystem | null>(null)
  let to = $state('')
  let hunt = $state('')
  let purse = $state<CharacterCurrency>({})
  let told = $state('')
  let busy = $state(false)

  const shown = $derived(
    (loot ?? []).filter((one) => !one.locked && one.title.toLowerCase().includes(hunt.trim().toLowerCase())).sort((a, b) => a.title.localeCompare(b.title))
  )

  async function openLoot(shares: boolean) {
    told = ''
    giving = !shares
    sharing = shares
    try {
      const [characters, items, rules] = await Promise.all([getCampaignCharacters(campaignId), loot ?? getItemRoom(), system ?? getItemSystem()])
      party = characters.filter((one) => !isNpc(one))
      loot = items
      system = rules
      if (!party.some((one) => one.id === to)) to = party[0]?.id ?? ''
    } catch (reason) {
      told = reason instanceof Error ? reason.message : String(reason)
    }
  }

  async function give(one: Item) {
    const named = party.find((entry) => entry.id === to)
    if (!named) return
    busy = true
    try {
      const given = getGivenItem(one, campaignId)
      await postGift(named.id, [given])
      told = `${given.title} is with ${named.name}${given.unidentified ? ', unidentified' : ''}.`
    } catch (reason) {
      told = reason instanceof Error ? reason.message : String(reason)
    } finally {
      busy = false
    }
  }

  async function share() {
    if (!system) return
    busy = true
    try {
      await postCoinShares(party.map((one) => one.id), purse, system)
      told = `The coin is shared among ${party.length} characters.`
      purse = {}
    } catch (reason) {
      told = reason instanceof Error ? reason.message : String(reason)
    } finally {
      busy = false
    }
  }

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
    {#if isDm}
      <Button variant="secondary" size="sm" title="Hand an item to a character at the table" onclick={() => openLoot(false)}>Give loot</Button>
      <Button variant="secondary" size="sm" title="Split coin among the characters at the table" onclick={() => openLoot(true)}>Share coin</Button>
    {/if}
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

<BaseDialog bind:isOpen={giving} title="Give loot" width="min(56rem, 94vw)" maxHeight="88vh">
  <div class="loot">
    <Dropdown label="Give to" value={to} options={party.map((one) => ({ value: one.id, label: one.name }))} glyph="character" onchange={(value) => (to = value)} />
    <SearchInput bind:value={hunt} placeholder="Search the items you reach..." label="Search the items you reach" />
    {#if loot === null && !told}
      <div class="dnd-loading"><span class="dnd-spinner"></span></div>
    {:else}
      <div class="loot-list">
        {#each shown as one (one.id)}
          <ItemRow item={one} room mark="Give" onclick={busy || !to ? undefined : () => give(one)} />
        {:else}
          <span class="loot-note">No item you reach answers to that.</span>
        {/each}
      </div>
    {/if}
    <div class="loot-foot">
      <span class="loot-note" role="status">{told}</span>
      <Button variant="secondary" size="sm" onclick={() => (giving = false)}>Done</Button>
    </div>
  </div>
</BaseDialog>

<BaseDialog bind:isOpen={sharing} title="Share coin" width="min(36rem, 94vw)">
  <form class="loot" onsubmit={(event) => { event.preventDefault(); void share() }}>
    <span class="loot-coins">
      {#each system?.coins ?? [] as coin (coin.id)}
        <Field label={coin.id} id="share-{coin.id}">
          <input
            id="share-{coin.id}"
            class="dnd-num"
            type="number"
            min="0"
            title={coin.title}
            value={purse[coin.id as keyof CharacterCurrency] ?? 0}
            onchange={(event) => (purse = { ...purse, [coin.id]: Math.max(0, parseInt((event.target as HTMLInputElement).value) || 0) })}
          />
        </Field>
      {/each}
    </span>
    <div class="loot-foot">
      <span class="loot-note" role="status">{told}</span>
      <Button type="submit" size="sm" loading={busy} disabled={busy || party.length === 0}>Split among {party.length} characters</Button>
    </div>
  </form>
</BaseDialog>

<style>
  .loot {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    padding: var(--space-4) var(--space-5) var(--space-5);
  }

  .loot-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    max-height: min(32rem, 52vh);
    overflow-y: auto;
    padding: var(--space-1);
  }

  .loot-coins {
    display: grid;
    grid-auto-flow: column;
    grid-auto-columns: minmax(0, 1fr);
    gap: var(--space-2);
  }

  .loot-foot {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: flex-end;
    gap: var(--space-2);
  }

  .loot-foot > .loot-note {
    flex: 1;
    min-width: 0;
  }

  .loot-note {
    font-size: var(--text-xs);
    font-style: italic;
    color: var(--ink-dim);
  }
</style>
