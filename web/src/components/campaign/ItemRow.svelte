<script lang="ts">
  import { userCampaigns } from '$lib/stores/campaign.store'
  import { getItemType, type Item } from '$lib/resources'
  import Chip from '$components/ui/Chip.svelte'
  import Row from '$components/ui/Row.svelte'

  const {
    item,
    room = false,
    mark,
    onclick,
    onopen
  }: {
    /** The item the row is for. */
    item: Item
    /** Says whether it is general or homebrew and which campaign keeps it, as the item room reads it. */
    room?: boolean
    /** Short word set at the end of the row. */
    mark?: string
    /** Runs when the row is pressed. */
    onclick?: () => void
    /** Draws an Open action at the end of the row and runs when it is pressed. */
    onopen?: () => void
  } = $props()

  const table = $derived(room ? ($userCampaigns.find((one) => one.id === item.owner_id)?.name ?? '') : '')
</script>

<Row
  title={item.title}
  sub={getItemType(item)}
  rarity={item.rarity}
  tone={item.source === 'general' ? 'verdigris' : 'metal'}
  image={item.image}
  {mark}
  {onclick}
  {onopen}
>
  {#if room}
    <Chip still glyph={item.source === 'general' ? 'gem' : 'edit'}>{item.source === 'general' ? 'General' : 'Homebrew'}</Chip>
  {/if}
  {#if item.locked}<Chip still glyph="lock">Locked</Chip>{/if}
  <span>{item.rarity}</span>
  {#if item.attunement}<span>Requires attunement</span>{/if}
  {#if item.grants.charges.max > 0}<span>{item.grants.charges.max} {item.grants.charges.max === 1 ? 'charge' : 'charges'}</span>{/if}
  {#if item.value}<span>{item.value} gp</span>{/if}
  {#if table}<span>{table}</span>{/if}
  {#if item.tags.length > 0}
    <span class="dnd-item-row-tags">
      {#each item.tags as tag (tag)}<span class="dnd-item-row-tag">#{tag}</span>{/each}
    </span>
  {/if}
</Row>

<style>
  .dnd-item-row-tags {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
  }

  .dnd-item-row-tag {
    font-family: var(--font-display);
    letter-spacing: var(--tracking-wide);
    color: var(--metal);
    text-shadow: 0 1px 0 var(--keyline);
  }
</style>
