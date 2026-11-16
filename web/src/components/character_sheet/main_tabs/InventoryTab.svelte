<script lang="ts">
  import {getContext} from "svelte";
  import type {Readable} from "svelte/store";
  import type {CharacterContext} from "$lib/types";
  import type {Character, CharacterCurrency, Currency, ItemType} from "$lib/character.types";
  import type {RulesState} from "$lib/rules/store";
  import {getAttunement, isItemApplied} from "$lib/rules/sheet";
  import {getCarriedItem, getGrantLines, getItemLine, getItemRoom, type Item} from "$lib/resources";
  import {addCurrencies, asGold, deleteItem, postItem, putAttunement, putCurrency, putEquipped, putItem} from "$lib/engine";
  import Button from "$components/ui/Button.svelte";
  import Chip from "$components/ui/Chip.svelte";
  import Field from "$components/ui/Field.svelte";
  import Glyph, {type GlyphName} from "$components/ui/Glyph.svelte";
  import IconBtn from "$components/ui/IconBtn.svelte";
  import Pool from "$components/ui/Pool.svelte";
  import Row from "$components/ui/Row.svelte";
  import SearchInput from "$components/ui/SearchInput.svelte";
  import Sigil from "$components/ui/Sigil.svelte";

  type InventoryItem = Character['inventory'][number]

  const {inventory, info, currency} = getContext<CharacterContext>('character')
  const rules = getContext<Readable<RulesState>>('rules')

  const COINS: Currency[] = ['pp', 'gp', 'sp', 'cp']
  const ITEM_TYPES: ItemType[] = ['weapon', 'armor', 'consumable', 'tool', 'container', 'treasure', 'ammunition', 'misc']

  let carryCapacity = $derived($info.carry_capacity)
  let carriedWeight = $derived($inventory.reduce((prev, curr) => prev + curr.weight, 0))
  let encumbered = $derived(carriedWeight > carryCapacity)
  let inventoryValue = $derived($inventory.reduce((prev, curr) => {
    return {
      ...prev,
      [curr.value.currency]: curr.value.amount + (prev as any)?.[curr.value.currency] || 0,
    }
  }, {} as CharacterCurrency))

  let totalValuables = $derived(addCurrencies(inventoryValue, $currency))
  let searchInput = $state('')
  let draft = $state<InventoryItem | null>(null)

  let filteredItems = $derived($inventory.filter(val => val.attributes.find(attr => attr.includes(searchInput)) ||
    val.description.includes(searchInput) ||
    val.enchantments?.find(ench => ench.name.includes(searchInput) || ench.description.includes(searchInput)) ||
    val.rarity?.includes(searchInput) ||
    val.subtype?.includes(searchInput) ||
    val.type?.includes(searchInput) ||
    val.id?.includes(searchInput) ||
    val.title?.includes(searchInput)))
  let equipment = $derived(filteredItems.filter(item => item.equipped))
  let carried = $derived(filteredItems.filter(item => !item.equipped))

  let attunement = $derived($rules.resolved?.system.items ? getAttunement($inventory, $rules.resolved) : null)
  let note = $state('')

  let finding = $state(false)
  let room = $state<Item[] | null>(null)
  let roomError = $state('')
  let roomQuery = $state('')
  let found = $derived.by(() => {
    const words = roomQuery.trim().toLowerCase()
    return (room ?? []).filter(one => !one.locked && (!words ||
      [one.title, one.category, one.subtype, one.rarity, one.notes, ...one.tags].some(text => text.toLowerCase().includes(words))))
  })

  function openRoom() {
    finding = !finding
    if (!finding || room) return
    roomError = ''
    getItemRoom()
      .then(items => (room = items))
      .catch(reason => (roomError = reason instanceof Error ? reason.message : String(reason)))
  }

  function addFromRoom(one: Item) {
    postItem(getCarriedItem(one))
    note = `${one.title} is in the pack.`
  }

  function getGives(item: InventoryItem): string {
    if (!item.grants || !$rules.system) return ''
    return getGrantLines(item.grants, $rules.system).map(line => `${line.label} ${line.value}`).join(' · ')
  }

  function getTypeLine(item: InventoryItem): string {
    const type = item.origin ? item.subtype ?? item.type : getDisplayType(item)
    return item.equipped && item.attunement?.required && !item.attunement.attuned ? `${type} · not attuned` : type
  }

  function attune(item: InventoryItem) {
    const attuned = !item.attunement?.attuned
    if (putAttunement(item, attuned, attunement?.slots ?? 0)) {
      note = ''
      return
    }
    note = `All ${attunement?.slots ?? 0} attunement slots are taken. End an attunement before attuning to ${item.title}.`
  }

  function getEquipIcon(itemType: string): GlyphName {
    const icons: {[key: string]: GlyphName} = {
      weapon: 'weapon',
      armor: 'armor',
      ammunition: 'ammunition',
      tool: 'tool',
      consumable: 'potion',
      treasure: 'gem',
      container: 'chest',
      misc: 'scroll'
    }
    return icons[itemType] || 'gear'
  }

  function isAmmunition(item: InventoryItem): boolean {
    return item.type === 'ammunition' || (
      item.type === 'consumable' && (
        item.title.toLowerCase().includes('ammunition') ||
        item.title.toLowerCase().includes('rounds') ||
        item.title.toLowerCase().includes('bullets') ||
        item.title.toLowerCase().includes('shotshells') ||
        item.title.toLowerCase().includes('arrows') ||
        item.description.toLowerCase().includes('firearm')
      )
    );
  }

  function getDisplayType(item: InventoryItem): string {
    return isAmmunition(item) ? 'ammunition' : item.type;
  }

  function consumeItem(item: InventoryItem) {
    putItem({...item, quantity: item.quantity - 1})
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

  function putCoin(coin: Currency, event: Event) {
    putCurrency({...$currency, [coin]: Math.max(0, parseInt((event.target as HTMLInputElement).value) || 0)})
  }
</script>

<div class="root">
    <div class="header">
        <div class="weight">
            <span><b>Weight carried:</b> {carriedWeight}/{carryCapacity} lb.</span>
            <span class="encumbered">
                {#if encumbered}
                    ENCUMBERED
                {:else}
                    UNENCUMBERED
                {/if}
            </span>
        </div>
        {#if attunement}
            <Pool title="Attunement" note="{Math.max(0, attunement.slots - attunement.used)} free" max={attunement.slots} current={attunement.used} view="pips" />
        {/if}
        <div class="currency">
            <span class="coins">
                {#each COINS as coin (coin)}
                    <Field label={coin} id="coin-{coin}">
                        <input id="coin-{coin}" class="dnd-num" type="number" min="0" value={$currency[coin] ?? 0} onchange={event => putCoin(coin, event)} />
                    </Field>
                {/each}
            </span>
            <span><b>Currency carried:</b> {asGold($currency)}gp</span>
            <span><b>Total valuables:</b> {asGold(totalValuables)}gp</span>
        </div>
    </div>
    <div class="search">
        <input placeholder="search" bind:value={searchInput}/>
        <Button variant="secondary" size="sm" title="Find an item in the item room" onclick={openRoom}>{finding ? 'Done' : 'Find an item'}</Button>
        <Button variant="secondary" size="sm" title="Add an item" onclick={() => openItem()}>Add item</Button>
    </div>
    {#if finding}
        <div class="room">
            <SearchInput bind:value={roomQuery} placeholder="Search the item room" autofocus />
            {#if roomError}
                <span class="room-note" role="alert">{roomError}</span>
            {:else if !room}
                <span class="room-note">Opening the item room</span>
            {:else}
                <div class="room-list">
                    {#each found as one (one.id)}
                        <Row
                            title={one.title}
                            sub={getItemLine(one)}
                            rarity={one.rarity}
                            tone={one.source === 'general' ? 'verdigris' : 'metal'}
                            image={one.image}
                            mark="Add"
                            onclick={() => addFromRoom(one)}
                        >
                            <Chip still glyph={one.source === 'general' ? 'gem' : 'edit'}>{one.source === 'general' ? 'General' : 'Homebrew'}</Chip>
                            {#if one.notes}<span>{one.notes}</span>{/if}
                        </Row>
                    {:else}
                        <span class="room-note">No item in the room answers to that.</span>
                    {/each}
                </div>
            {/if}
        </div>
    {/if}
    {#if note}
        <span class="note" role="status">{note}</span>
    {/if}
    {#if draft}
        <form class="draft" onsubmit={event => { event.preventDefault(); saveItem() }}>
            <Field label="Name" id="item-title" required>
                <input id="item-title" bind:value={draft.title} />
            </Field>
            <Field label="Type" id="item-type">
                <select id="item-type" bind:value={draft.type}>
                    {#each ITEM_TYPES as type (type)}
                        <option value={type}>{type}</option>
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
                    {#each COINS as coin (coin)}
                        <option value={coin}>{coin}</option>
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
                <span>Weight</span>
                <span>Qty</span>
                <span>Cost (gp)</span>
                <span>Notes</span>
            </li>
            <li class="items-section">
                <b>Equipment</b>
                <span>Worn and wielded. What applies changes the sheet.</span>
            </li>
            {#each equipment as item (item.id)}
                {@render row(item)}
            {/each}
            <li class="items-section">
                <b>Carried</b>
                <span>In the pack. Changes nothing.</span>
            </li>
            {#each carried as item (item.id)}
                {@render row(item)}
            {/each}
        </ul>
    </div>
</div>

{#snippet row(item: InventoryItem)}
    {@const gives = getGives(item)}
    <li class="item">
        <div class="equippable center">
            {#if item.type === 'consumable' && !isAmmunition(item)}
                <Sigil
                    frame="ring"
                    size="sm"
                    tone="verdigris"
                    title="Consume {item.title}"
                    onclick={() => consumeItem(item)}
                >
                    <Glyph name="potion" size="sm" />
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
                    <Glyph name={isAmmunition(item) ? 'ammunition' : getEquipIcon(item.type)} size="sm" />
                </Sigil>
            {/if}
            {#if item.attunement?.required}
                <Sigil
                    frame="ring"
                    size="sm"
                    tone="arcane"
                    active={item.attunement.attuned}
                    title="{item.attunement.attuned ? 'End attunement to' : 'Attune to'} {item.title}"
                    onclick={() => attune(item)}
                >
                    <Glyph name="sparkles" size="sm" />
                </Sigil>
            {/if}
        </div>
        <div class="name">
            <h4 title={item.title}>{item.title}</h4>
            <span>{getTypeLine(item)}</span>
            {#if gives}
                <span class="gives" class:gives-on={$rules.system && isItemApplied(item, $rules.system)} title={gives}>{gives}</span>
            {/if}
        </div>
        <div class="weight center">
            <span><b>{item.weight}</b> lb.</span>
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
            <IconBtn title="Edit {item.title}" onclick={() => openItem(item)}>
                <Glyph name="edit" size="sm" />
            </IconBtn>
            <IconBtn title="Remove {item.title}" onclick={() => deleteItem(item.id)}>
                <Glyph name="remove" size="sm" />
            </IconBtn>
        </div>
    </li>
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
        grid-template-columns: repeat(4, minmax(0, 1fr));
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

    .search > input {
        position: relative;
        width: 100%;
        min-width: 0;
        height: 100%;
        padding: var(--space-2) var(--space-3);
        background: var(--texture-noise), linear-gradient(180deg, var(--ground-deep) 0%, var(--ground) 100%);
        border: var(--border-hair) solid var(--metal-dim);
        border-radius: var(--radius-sm);
        box-shadow: var(--bevel-down);
        outline: none;
        color: var(--ink);
        font-family: var(--font-body);
        transition: border-color 0.15s ease, box-shadow 0.15s ease;
    }

    .search > input::placeholder {
        color: var(--ink-faint);
        font-style: italic;
    }

    .search > input:focus {
        border-color: var(--metal-bright);
        box-shadow: var(--bevel-down), var(--glow-metal);
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
        grid-template-columns: auto 2fr auto auto auto 3fr;
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
        color: var(--metal-bright);
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
        color: var(--ink);
        text-shadow: 0 1px 0 var(--shadow-ink);
        transition: color 0.15s ease, text-shadow 0.15s ease;
    }

    .name span {
        font-size: var(--text-xs);
        font-style: italic;
        color: var(--ink-faint);
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

    .room {
        display: flex;
        flex-direction: column;
        gap: var(--space-2);
        width: 100%;
        min-height: 0;
    }

    .room-list {
        display: flex;
        flex-direction: column;
        gap: var(--space-1);
        max-height: 40vh;
        overflow-y: auto;
    }

    .room-note,
    .note {
        font-size: var(--text-xs);
        font-style: italic;
        color: var(--ink-dim);
    }

</style>
