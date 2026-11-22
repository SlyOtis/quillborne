<script lang="ts">
  import {getContext, tick} from "svelte";
  import type {Readable} from "svelte/store";
  import type {CharacterContext} from "$lib/types";
  import type {Character, Currency} from "$lib/character.types";
  import type {RulesState} from "$lib/rules/store";
  import {getAttunement, getCarriedWeight, getChargesLeft, getCoinValue, getContainer, getContainerLoad, getContainers, getEncumbrance, getInventoryValue, getRecharging, isConsumable, isItemApplied} from "$lib/rules/sheet";
  import {getCarriedItem, getEmptyItemFilter, getGrantLines, getItemRoom, getRarityInk, isItemShown, type Item} from "$lib/resources";
  import {addCurrencies, deleteItem, postItem, postItemUse, postRecharge, putAttunement, putCharges, putCurrency, putEquipped, putIdentified, putInside, putItem, putReplacedAttunement} from "$lib/engine";
  import {user} from "$lib/stores/auth.store";
  import {currentCampaignId, userCampaigns} from "$lib/stores/campaign.store";
  import BaseDialog from "$components/BaseDialog.svelte";
  import ItemFilters from "$components/campaign/ItemFilters.svelte";
  import ItemRow from "$components/campaign/ItemRow.svelte";
  import Button from "$components/ui/Button.svelte";
  import Chip from "$components/ui/Chip.svelte";
  import Dropdown from "$components/ui/Dropdown.svelte";
  import Field from "$components/ui/Field.svelte";
  import Glyph, {type GlyphName} from "$components/ui/Glyph.svelte";
  import IconBtn from "$components/ui/IconBtn.svelte";
  import Pool from "$components/ui/Pool.svelte";
  import SearchInput from "$components/ui/SearchInput.svelte";
  import Sigil from "$components/ui/Sigil.svelte";

  type InventoryItem = Character['inventory'][number]

  const {inventory, info, currency} = getContext<CharacterContext>('character')
  const rules = getContext<Readable<RulesState>>('rules')

  let coins = $derived(($rules.system?.coins ?? []).map(coin => ({...coin, id: coin.id as Currency})))
  let priced = $derived(coins.find(coin => coin.value === 1)?.id ?? '')
  let categories = $derived($rules.system?.items?.categories ?? [])
  let isDm = $derived(Boolean($currentCampaignId && $user && $userCampaigns.find(one => one.id === $currentCampaignId)?.dm_id === $user.user_id))
  let identifyError = $state('')
  let calls = $derived(($rules.system?.recharges ?? []).filter(one => !one.rests?.length && getRecharging($inventory, [one.id]).length > 0))

  let carryCapacity = $derived($rules.resolved?.scope['derived.carryCapacity'] ?? $info.carry_capacity)
  let carriedWeight = $derived($rules.system ? Number(getCarriedWeight($inventory, $currency, $rules.system).toFixed(2)) : 0)
  let encumbrance = $derived($rules.resolved ? getEncumbrance(carriedWeight, $rules.resolved) : null)
  let inventoryValue = $derived(getInventoryValue($inventory))

  let totalValuables = $derived(addCurrencies(inventoryValue, $currency))
  let searchInput = $state('')
  let draft = $state<InventoryItem | null>(null)

  let asked = $derived(searchInput.trim().toLowerCase())
  let filteredItems = $derived($inventory.filter(val => !asked || [
    ...val.attributes,
    val.description,
    ...(val.enchantments ?? []).flatMap(ench => [ench.name, ench.description]),
    val.rarity,
    val.subtype,
    val.type,
    val.title
  ].some(text => text?.toLowerCase().includes(asked))))
  let loose = $derived(filteredItems.filter(item => !filteredItems.includes(getContainer($inventory, item) as InventoryItem)))
  let equipment = $derived(loose.filter(item => item.equipped))
  let carried = $derived(loose.filter(item => !item.equipped))

  let attunement = $derived($rules.resolved?.system.items ? getAttunement($inventory, $rules.resolved) : null)
  let attunable = $derived($inventory.filter(item => item.attunement?.required))
  let waitingId = $state('')
  let waiting = $derived($inventory.find(item => item.id === waitingId && item.attunement?.required && !item.attunement.attuned) ?? null)
  let bonds = $state<HTMLElement>()

  let adding = $state(false)
  let room = $state<Item[] | null>(null)
  let roomError = $state('')
  let filter = $state(getEmptyItemFilter())
  let added = $state('')
  let reached = $derived((room ?? []).filter(one => !one.locked))
  let found = $derived(reached.filter(one => isItemShown(one, filter)).sort((a, b) => a.title.localeCompare(b.title)))

  function openRoom() {
    adding = true
    added = ''
    if (room) return
    roomError = ''
    getItemRoom()
      .then(items => (room = items))
      .catch(reason => (roomError = reason instanceof Error ? reason.message : String(reason)))
  }

  function addFromRoom(one: Item) {
    postItem(getCarriedItem(one))
    added = `${one.title} is in the pack.`
  }

  function writeOwn() {
    adding = false
    openItem()
  }

  function getGives(item: InventoryItem): string {
    if (!item.grants || !$rules.system) return ''
    return getGrantLines(item.grants, $rules.system).map(line => `${line.label} ${line.value}`).join(' · ')
  }

  function getTypeLine(item: InventoryItem): string {
    return item.origin ? item.subtype ?? item.type : item.type
  }

  async function attune(item: InventoryItem) {
    if (putAttunement(item, true, attunement?.slots ?? 0)) {
      waitingId = ''
      return
    }
    waitingId = item.id
    await tick()
    bonds?.scrollIntoView({behavior: 'smooth', block: 'nearest'})
  }

  function endAttunement(item: InventoryItem) {
    putAttunement(item, false, attunement?.slots ?? 0)
  }

  function replace(item: InventoryItem) {
    if (waiting && putReplacedAttunement(item, waiting, attunement?.slots ?? 0)) waitingId = ''
  }

  function getEquipIcon(itemType: string): GlyphName {
    return (categories.find(one => one.id === itemType)?.glyph as GlyphName | undefined) ?? 'gear'
  }

  function isUsed(item: InventoryItem): boolean {
    return Boolean($rules.system && (item.properties?.use || isConsumable(item, $rules.system)))
  }

  function identify(item: InventoryItem) {
    identifyError = ''
    if ($currentCampaignId) putIdentified(item, $currentCampaignId).catch(reason => (identifyError = reason instanceof Error ? reason.message : String(reason)))
  }

  function useItem(item: InventoryItem) {
    if ($rules.system) void postItemUse(item, $rules.system)
  }

  function openItem(item?: InventoryItem) {
    draft = item ? {...item, value: {...item.value}} : {
      id: '',
      title: '',
      type: 'misc',
      rarity: 'common',
      attributes: [],
      description: '',
      value: {amount: 0, currency: 'gp'},
      weight: 0,
      quantity: 1,
      equippable: true,
      equipped: false
    }
  }

  function saveItem() {
    if (!draft || !draft.title.trim()) return
    const item: InventoryItem = {
      ...draft,
      title: draft.title.trim(),
      quantity: Math.max(0, Number(draft.quantity) || 0),
      weight: Math.max(0, Number(draft.weight) || 0),
      value: {amount: Math.max(0, Number(draft.value.amount) || 0), currency: draft.value.currency}
    }
    if (draft.id) putItem(item)
    else postItem({...item, id: crypto.randomUUID()})
    draft = null
  }

  function getHeld(container: InventoryItem): InventoryItem[] {
    return filteredItems.filter(item => getContainer($inventory, item)?.id === container.id)
  }

  function getPlaces(item: InventoryItem): {value: string, label: string}[] {
    return [{value: '', label: 'Carried loose'}, ...getContainers($inventory, item).map(one => ({value: one.id, label: `In ${one.title}`}))]
  }

  function putCoin(coin: Currency, event: Event) {
    putCurrency({...$currency, [coin]: Math.max(0, parseInt((event.target as HTMLInputElement).value) || 0)})
  }
</script>

<div class="root">
    <div class="header">
        <div class="weight">
            <span><b>Weight carried:</b> {carriedWeight}/{carryCapacity} lb.</span>
            <span class="encumbered">{encumbrance?.title ?? 'Unencumbered'}</span>
            {#if encumbrance}<span>{encumbrance.effect}</span>{/if}
        </div>
        <div class="currency">
            <span class="coins">
                {#each coins as coin (coin.id)}
                    <Field label={coin.id} id="coin-{coin.id}">
                        <input id="coin-{coin.id}" class="dnd-num" type="number" min="0" title={coin.title} value={$currency[coin.id] ?? 0} onchange={event => putCoin(coin.id, event)} />
                    </Field>
                {/each}
            </span>
            {#if $rules.system}
                <span><b>Currency carried:</b> {getCoinValue($currency, $rules.system)} {priced}</span>
                <span><b>Total valuables:</b> {getCoinValue(totalValuables, $rules.system)} {priced}</span>
            {/if}
        </div>
    </div>
    {#if identifyError}
        <span class="picker-note" role="alert">{identifyError}</span>
    {/if}
    <div class="search">
        <SearchInput bind:value={searchInput} placeholder="Search the inventory..." label="Search the inventory" />
        {#each calls as call (call.id)}
            <Button variant="ghost" size="sm" title="Regain the charges that come back at {call.title.toLowerCase()}" onclick={() => postRecharge([call.id])}>{call.title}</Button>
        {/each}
        <Button variant="secondary" size="sm" title="Add an item to the inventory" onclick={openRoom}>Add item</Button>
    </div>
    {#if draft}
        <form class="draft" onsubmit={event => { event.preventDefault(); saveItem() }}>
            <Field label="Name" id="item-title" required>
                <input id="item-title" bind:value={draft.title} />
            </Field>
            <Field label="Type" id="item-type">
                <select id="item-type" bind:value={draft.type}>
                    {#each categories as type (type.id)}
                        <option value={type.id}>{type.title}</option>
                    {/each}
                </select>
            </Field>
            <Field label="Quantity" id="item-quantity">
                <input id="item-quantity" type="number" min="0" bind:value={draft.quantity} />
            </Field>
            <Field label="Weight (lb)" id="item-weight">
                <input id="item-weight" type="number" min="0" step="0.01" bind:value={draft.weight} />
            </Field>
            <Field label="Cost" id="item-cost">
                <input id="item-cost" type="number" min="0" step="0.01" bind:value={draft.value.amount} />
            </Field>
            <Field label="Coin" id="item-coin">
                <select id="item-coin" bind:value={draft.value.currency}>
                    {#each coins as coin (coin.id)}
                        <option value={coin.id}>{coin.title}</option>
                    {/each}
                </select>
            </Field>
            <Field label="Notes" id="item-description">
                <textarea id="item-description" rows="2" bind:value={draft.description}></textarea>
            </Field>
            <span class="draft-acts">
                <Button type="submit" size="sm" disabled={!draft.title.trim()}>Save item</Button>
                <Button variant="ghost" size="sm" onclick={() => (draft = null)}>Cancel</Button>
                {#if draft.id}
                    <Button variant="danger" size="sm" onclick={() => { if (draft) deleteItem(draft.id); draft = null }}>Remove item</Button>
                {/if}
            </span>
        </form>
    {/if}
    <div class="scroll">
        <ul>
            <li class="items-header">
                <span>Active</span>
                <span>Name</span>
                <span>Qty</span>
                <span>Cost (gp)</span>
                <span>Notes</span>
            </li>
            <li class="items-section">
                <b>Equipment</b>
                <span>Worn and wielded. What applies changes the sheet.</span>
            </li>
            {#each equipment as item (item.id)}
                {@render row(item, 0)}
            {/each}
            <li class="items-section">
                <b>Carried</b>
                <span>In the pack. Changes nothing.</span>
            </li>
            {#each carried as item (item.id)}
                {@render row(item, 0)}
            {/each}
        </ul>
        {#if attunement}
            <section class="bonds" aria-label="Attunement" bind:this={bonds}>
                <Pool title="Attunement" note="{Math.max(0, attunement.slots - attunement.used)} free" max={attunement.slots} current={attunement.used} view="pips" />
                {#if waiting}
                    <div class="bonds-ask" role="alert">
                        <span>All {attunement.slots} attunement slots are taken. Replace one to attune to <b style:--item-ink={getRarityInk(waiting.rarity)}>{waiting.title}</b>.</span>
                        <Button variant="ghost" size="sm" onclick={() => (waitingId = '')}>Cancel</Button>
                    </div>
                {/if}
                <ul class="bonds-list">
                    {#each attunable as item (item.id)}
                        {@const attuned = Boolean(item.attunement?.attuned)}
                        <li class="bond" class:bond-on={attuned} class:bond-waiting={item.id === waiting?.id}>
                            <span class="bond-name">
                                <b style:--item-ink={getRarityInk(item.rarity)}>{item.title}</b>
                                <span>{getTypeLine(item)}</span>
                            </span>
                            <span class="bond-state">{attuned ? 'Attuned' : item.id === waiting?.id ? 'Needs a slot' : 'Not attuned'}</span>
                            {#if attuned && waiting}
                                <Button variant="primary" size="sm" title="End attunement to {item.title} and attune to {waiting.title}" label="Replace {item.title}" onclick={() => replace(item)}>Replace</Button>
                            {:else if attuned}
                                <Button variant="ghost" size="sm" title="End attunement to {item.title}" label="End attunement to {item.title}" onclick={() => endAttunement(item)}>End attunement</Button>
                            {:else if item.id !== waiting?.id}
                                <Button variant="secondary" size="sm" title="Attune to {item.title}" label="Attune to {item.title}" onclick={() => attune(item)}>Attune</Button>
                            {/if}
                        </li>
                    {:else}
                        <li class="bond bonds-none">Nothing in the inventory requires attunement.</li>
                    {/each}
                </ul>
            </section>
        {/if}
    </div>
</div>

<BaseDialog bind:isOpen={adding} title="Add an item" width="min(56rem, 94vw)" maxHeight="88vh">
    <div class="picker">
        <SearchInput bind:value={filter.name} placeholder="Search the items you reach..." label="Search the items you reach" autofocus />
        <ItemFilters bind:filter facets={['source']} />
        {#if roomError}
            <span class="picker-note" role="alert">{roomError}</span>
        {:else if !room}
            <div class="dnd-loading"><span class="dnd-spinner"></span></div>
        {:else}
            <span class="picker-count">{found.length} of {reached.length}</span>
            <div class="picker-list">
                {#each found as one (one.id)}
                    <ItemRow item={one} room mark="Add" onclick={() => addFromRoom(one)} />
                {:else}
                    <span class="picker-note">No item you reach answers to that.</span>
                {/each}
            </div>
        {/if}
        <div class="picker-foot">
            <span class="picker-note" role="status">{added}</span>
            <Button variant="ghost" size="sm" title="Write an item of your own" onclick={writeOwn}>Write your own</Button>
            <Button variant="secondary" size="sm" onclick={() => (adding = false)}>Done</Button>
        </div>
    </div>
</BaseDialog>

{#snippet row(item: InventoryItem, depth: number)}
    {@const gives = getGives(item)}
    {@const places = getPlaces(item)}
    <li class="item">
        <div class="equippable center">
            {#if isUsed(item)}
                <Sigil
                    frame="ring"
                    size="sm"
                    tone="verdigris"
                    title="Use {item.title}"
                    onclick={() => useItem(item)}
                >
                    <Glyph name={getEquipIcon(item.type)} size="sm" />
                </Sigil>
            {:else if item.equippable}
                <Sigil
                    frame="ring"
                    size="sm"
                    tone="ember"
                    active={item.equipped}
                    title="{item.equipped ? 'Unequip' : 'Equip'} {item.title}"
                    onclick={() => putEquipped(item, !item.equipped)}
                >
                    <Glyph name={getEquipIcon(item.type)} size="sm" />
                </Sigil>
            {/if}
        </div>
        <div class="name" style:padding-inline-start="calc(var(--space-4) * {depth})">
            <h4 title={item.title} style:--item-ink={getRarityInk(item.rarity)}>{item.title}</h4>
            <span class="kind">
                <span class="kind-type">{getTypeLine(item)}</span>
                {#if item.unidentified}
                    <Chip still glyph="conceal">Unidentified</Chip>
                    {#if isDm && item.origin}
                        <Button variant="plain" size="sm" title="Identify {item.title} for the table" label="Identify {item.title}" onclick={() => identify(item)}>Identify</Button>
                    {/if}
                {/if}
                {#if attunement && item.attunement?.required}
                    {#if item.attunement.attuned}
                        <Chip still glyph="sparkles">Attuned</Chip>
                    {:else}
                        <Button variant="plain" size="sm" title="Attune to {item.title}" label="Attune to {item.title}" onclick={() => attune(item)}>Attune</Button>
                    {/if}
                {/if}
            </span>
            {#if gives}
                <span class="gives" class:gives-on={$rules.system && isItemApplied(item, $rules.system)} title={gives}>{gives}</span>
            {/if}
            {#if (item.properties?.capacity ?? 0) > 0}
                <span class="gives">Holds {getContainerLoad($inventory, item)}/{item.properties?.capacity} lb{item.properties?.weightless ? ', weighing nothing' : ''}</span>
            {/if}
            {#if item.grants && item.grants.charges.max > 0}
                <Pool title="Charges" max={item.grants.charges.max} current={getChargesLeft(item)} view="pips" onput={current => putCharges(item, (item.grants?.charges.max ?? 0) - current)} />
            {/if}
        </div>
        <div class="qty center">
            <span class="stepper">
                <IconBtn title="One fewer {item.title}" onclick={() => putItem({...item, quantity: item.quantity - 1})}>
                    <Glyph name="minus" size="sm" />
                </IconBtn>
                <b>{item.quantity}</b>
                <IconBtn title="One more {item.title}" onclick={() => putItem({...item, quantity: item.quantity + 1})}>
                    <Glyph name="add" size="sm" />
                </IconBtn>
            </span>
        </div>
        <div class="cost center">
            <span><b>{item.value.amount}</b> {item.value.currency}</span>
        </div>
        <div class="notes">
            <p title={item.description}>{item.description}</p>
            {#if places.length > 1}
                <Dropdown label="Put {item.title} in a container" value={item.inside && places.some(one => one.value === item.inside) ? item.inside : ''} options={places} glyph="chest" onchange={value => putInside(item, value)} />
            {/if}
            <IconBtn title="Edit {item.title}" onclick={() => openItem(item)}>
                <Glyph name="edit" size="sm" />
            </IconBtn>
            <IconBtn title="Remove {item.title}" onclick={() => deleteItem(item.id)}>
                <Glyph name="remove" size="sm" />
            </IconBtn>
        </div>
    </li>
    {#each (item.properties?.capacity ?? 0) > 0 ? getHeld(item) : [] as held (held.id)}
        {@render row(held, depth + 1)}
    {/each}
{/snippet}

<style>
    .root {
        position: relative;
        width: 100%;
        height: 100%;
        max-height: 100%;
        display: flex;
        justify-content: start;
        align-items: start;
        flex-direction: column;
        gap: var(--space-2);
        overflow: hidden;
    }

    .header {
        position: relative;
        width: 100%;
        height: auto;
        display: flex;
        justify-content: space-between;
        align-items: center;
        flex-direction: row;
        flex-wrap: wrap;
        gap: var(--space-2);
        padding: var(--space-2) var(--space-4);
        background: var(--texture-noise), linear-gradient(180deg, var(--ground-deep) 0%, var(--ground) 100%);
        border: var(--border-hair) solid color-mix(in srgb, var(--metal-dim) 60%, transparent);
        border-radius: var(--radius-sm);
        box-shadow: var(--bevel-down);
    }

    .weight {
        font-size: var(--text-xs);
        font-family: var(--font-figures);
        font-variant-numeric: lining-nums tabular-nums;
        display: flex;
        flex-direction: column;
        justify-content: start;
        align-items: start;
        gap: var(--space-1);
        color: var(--ink-dim);
    }

    .header b {
        font-family: var(--font-display);
        font-weight: 700;
        letter-spacing: var(--tracking-wide);
        color: var(--metal);
    }

    .encumbered {
        font-family: var(--font-display);
        font-weight: 700;
        letter-spacing: var(--tracking-caps);
        text-transform: uppercase;
        color: var(--metal-bright);
        text-shadow: 0 1px 0 var(--shadow-ink), 0 0 0.5rem var(--ember-glow);
    }

    .currency {
        font-size: var(--text-xs);
        font-family: var(--font-figures);
        font-variant-numeric: lining-nums tabular-nums;
        display: flex;
        flex-direction: column;
        align-items: end;
        justify-content: center;
        gap: var(--space-1);
        min-width: 0;
        color: var(--ink-dim);
    }

    .coins {
        display: grid;
        grid-auto-flow: column;
        grid-auto-columns: minmax(0, 1fr);
        gap: var(--space-1);
        min-width: 0;
    }

    .coins :global(input.dnd-num) {
        font-family: var(--font-figures);
        font-variant-numeric: lining-nums tabular-nums;
    }

    .draft {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(8rem, 1fr));
        align-items: end;
        gap: var(--space-2);
        width: 100%;
        padding: var(--space-2) var(--space-3);
    }

    .draft-acts {
        display: flex;
        flex-wrap: wrap;
        gap: var(--space-2);
        grid-column: 1 / -1;
    }

    .stepper {
        display: inline-flex;
        align-items: center;
        gap: var(--space-0);
    }

    .search {
        position: relative;
        width: 100%;
        height: auto;
        display: flex;
        justify-content: center;
        align-items: center;
        flex-direction: row;
        gap: var(--space-2);
    }

    ul {
        position: relative;
        width: 100%;
        height: auto;
        padding: var(--space-2) var(--space-3);
        margin: 0;
        list-style: none;
        display: grid;
        align-items: center;
        grid-template-columns: auto 3fr auto auto 2fr;
        grid-auto-rows: auto;
        grid-column-gap: 0;
        grid-row-gap: var(--space-1);
    }

    li {
        position: relative;
        width: 100%;
        height: auto;
        display: contents;
    }

    .items-header {
        position: sticky;
        top: 0;
    }

    .items-header span {
        align-self: stretch;
        padding: var(--space-1) var(--space-2);
        border-bottom: var(--border-hair) solid var(--metal-dim);
        font-family: var(--font-display);
        font-size: var(--text-xs);
        font-weight: 700;
        letter-spacing: var(--tracking-caps);
        text-transform: uppercase;
        white-space: nowrap;
        color: var(--metal);
        text-shadow: 0 1px 0 var(--shadow-ink);
    }

    .item > div {
        align-self: stretch;
        padding-inline: var(--space-1);
        box-shadow: inset 0 -1px 0 color-mix(in srgb, var(--metal-dim) 40%, transparent);
        transition: background-color 0.15s ease;
    }

    .item:hover > div {
        background-color: color-mix(in srgb, var(--ember) 9%, transparent);
    }

    .item:hover h4 {
        text-shadow: var(--glow-text);
    }

    .item b {
        font-family: var(--font-figures);
        font-variant-numeric: lining-nums tabular-nums;
        color: var(--ink);
    }

    .scroll {
        position: relative;
        width: 100%;
        flex: 1;
        min-height: 0;
        overflow: hidden;
        overflow-y: auto;
    }

    .center {
        position: relative;
        display: flex;
        justify-content: center;
        align-items: center;
        flex-direction: column;
        width: 100%;
        height: 100%;
        white-space: nowrap;
        font-size: var(--text-xs);
        color: var(--ink-dim);
    }

    .name {
        position: relative;
        min-width: 0;
        overflow: hidden;
        display: flex;
        flex-direction: column;
        justify-content: center;
    }

    .name > * {
        display: block;
        margin: 0;
        padding: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .name h4 {
        font-family: var(--font-display);
        font-size: var(--text-sm);
        font-weight: 700;
        color: var(--item-ink);
        text-shadow: 0 1px 0 var(--shadow-ink);
        transition: color 0.15s ease, text-shadow 0.15s ease;
    }

    .name span {
        font-size: var(--text-xs);
        font-style: italic;
        color: var(--ink-faint);
    }

    .name .kind {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 0 var(--space-2);
        overflow: visible;
        font-style: normal;
    }

    .kind-type {
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
    }

    .notes {
        display: flex;
        align-items: center;
        gap: var(--space-1);
        min-width: 0;
        overflow: hidden;
        font-size: var(--text-xs);
        color: var(--ink-dim);
    }

    .notes > p {
        flex: 1;
        min-width: 0;
        margin: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .equippable {
        flex-direction: row;
        gap: var(--space-1);
    }

    .name .gives {
        font-style: normal;
        color: var(--ink-faint);
    }

    .name .gives-on {
        color: var(--ember-core);
    }

    .items-section {
        display: flex;
        align-items: baseline;
        gap: var(--space-2);
        grid-column: 1 / -1;
        padding: var(--space-2) var(--space-2) var(--space-1);
        border-bottom: var(--border-hair) solid color-mix(in srgb, var(--metal-dim) 60%, transparent);
        font-size: var(--text-xs);
        color: var(--ink-faint);
    }

    .items-section b {
        font-family: var(--font-display);
        font-weight: 700;
        letter-spacing: var(--tracking-caps);
        text-transform: uppercase;
        color: var(--metal);
        text-shadow: 0 1px 0 var(--shadow-ink);
    }

    .bonds {
        display: flex;
        flex-direction: column;
        gap: var(--space-3);
        margin-top: var(--space-5);
        padding: var(--space-3);
        scroll-margin: var(--space-3);
    }

    .bonds-ask {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        justify-content: space-between;
        gap: var(--space-2);
        padding: var(--space-2) var(--space-3);
        border: var(--border-hair) solid var(--state-bad);
        border-radius: var(--radius-sm);
        background: var(--texture-noise), linear-gradient(180deg, color-mix(in srgb, var(--state-bad) 14%, var(--ground-raised)), var(--ground-deep));
        box-shadow: var(--bevel-down);
        font-size: var(--text-sm);
        color: var(--ink);
    }

    .bonds-ask b,
    .bond-name b {
        font-family: var(--font-display);
        font-weight: 700;
        color: var(--item-ink);
        text-shadow: 0 1px 0 var(--shadow-ink);
    }

    .bonds-list {
        display: flex;
        flex-direction: column;
        gap: var(--space-1);
        padding: 0;
    }

    .bond {
        display: flex;
        align-items: center;
        gap: var(--space-3);
        min-height: var(--space-7);
        padding: var(--space-1) var(--space-2);
        border-radius: var(--radius-sm);
        box-shadow: inset 0 -1px 0 color-mix(in srgb, var(--metal-dim) 40%, transparent);
    }

    .bond-on {
        background: linear-gradient(90deg, color-mix(in srgb, var(--ember) 12%, transparent) 0%, transparent 85%);
    }

    .bond-waiting {
        box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--metal-dim) 70%, transparent), inset 0 0 0.75rem var(--ember-glow);
    }

    .bond-name {
        display: flex;
        flex: 1;
        flex-direction: column;
        min-width: 0;
    }

    .bond-name > * {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .bond-name b {
        font-size: var(--text-sm);
    }

    .bond-name span {
        font-size: var(--text-xs);
        font-style: italic;
        color: var(--ink-faint);
    }

    .bond-state {
        flex: none;
        font-family: var(--font-display);
        font-size: var(--text-xs);
        letter-spacing: var(--tracking-caps);
        text-transform: uppercase;
        color: var(--ink-faint);
    }

    .bond-on .bond-state {
        color: var(--ember-core);
        text-shadow: 0 0 0.5rem var(--ember-glow);
    }

    .bonds-none {
        font-size: var(--text-xs);
        font-style: italic;
        color: var(--ink-faint);
    }

    .picker {
        display: flex;
        flex-direction: column;
        gap: var(--space-3);
        padding: var(--space-4) var(--space-5) var(--space-5);
    }

    .picker-count {
        font-family: var(--font-figures);
        font-size: var(--text-xs);
        color: var(--ink-faint);
    }

    .picker-list {
        display: flex;
        flex-direction: column;
        gap: var(--space-2);
        max-height: min(32rem, 52vh);
        overflow-y: auto;
        padding: var(--space-1);
    }

    .picker-foot {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        justify-content: flex-end;
        gap: var(--space-2);
    }

    .picker-foot > .picker-note {
        flex: 1;
        min-width: 0;
    }

    .picker-note {
        font-size: var(--text-xs);
        font-style: italic;
        color: var(--ink-dim);
    }

</style>
