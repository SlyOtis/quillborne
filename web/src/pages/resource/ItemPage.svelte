<script lang="ts">
  import ResourceShell from '$components/campaign/ResourceShell.svelte'
  import { getChoices, getItemLine, getItemType, getRarityInk, type Item } from '$lib/resources'

  const TYPES = getChoices('items', 'category')
  const RARITIES = getChoices('items', 'rarity')
  const RECHARGES = getChoices('items', 'recharge')
</script>

<ResourceShell kind="items">
  {#snippet line(one)}
    <p class="item-line">{getItemLine(one as unknown as Item)}</p>
  {/snippet}

  {#snippet facts(one)}
    {@const it = one as unknown as Item}
    <dt>Type</dt>
    <dd>{getItemType(it)}</dd>
    <dt>Rarity</dt>
    <dd style:color={getRarityInk(it.rarity)}>{it.rarity}</dd>
    {#if it.attunement}<dt>Attunement</dt><dd>Required{it.attuned_by ? ` ${it.attuned_by}` : ""}</dd>{/if}
    {#if it.charges > 0}<dt>Charges</dt><dd>{it.charges}{it.recharge !== "none" ? `, recharges each ${it.recharge}` : ""}</dd>{/if}
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
    <dt><label for="item-charges">Charges</label></dt>
    <dd>
      <input id="item-charges" type="number" min="0" bind:value={one.charges} />
    </dd>
    {#if Number(one.charges) > 0}
      <dt><label for="item-recharge">Recharge</label></dt>
      <dd>
        <select id="item-recharge" bind:value={one.recharge}>
          {#each RECHARGES as choice (choice)}
            <option value={choice}>{choice}</option>
          {/each}
        </select>
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
  {/snippet}
</ResourceShell>

<style>
  .item-line {
    margin: 0;
    font-style: italic;
    color: var(--ink-dim);
  }
</style>
