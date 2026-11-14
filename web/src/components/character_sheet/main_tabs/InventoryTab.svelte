<script lang="ts">
  import {getContext} from "svelte";
  import type {CharacterContext} from "$lib/types";
  import type {Character, CharacterCurrency, Currency, ItemType} from "$lib/character.types";
  import {ChangeActions} from "$lib/changelog";
  import {addCurrencies, asGold, deleteItem, postItem, putCurrency, putItem, updateCharacterWithChangeLog} from "$lib/engine";
  import Button from "$components/ui/Button.svelte";
  import Field from "$components/ui/Field.svelte";
  import Glyph, {type GlyphName} from "$components/ui/Glyph.svelte";
  import IconBtn from "$components/ui/IconBtn.svelte";
  import Sigil from "$components/ui/Sigil.svelte";

  type InventoryItem = Character['inventory'][number]

  const {inventory, info, currency, equipped} = getContext<CharacterContext>('character')

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

  function isItemEquipped(itemId: string): boolean {
    return Array.isArray($equipped) && $equipped.some(equippedItem => equippedItem.id === itemId);
  }

  function equipItem(item: InventoryItem) {
    const wearing = isItemEquipped(item.id)
    updateCharacterWithChangeLog(
      'equipped',
      curr => {
        const list = Array.isArray(curr) ? curr : []
        if (wearing) return list.filter(equippedItem => equippedItem.id !== item.id)
        return [
          ...list.filter(equippedItem => !equippedItem.type.split(',').map(t => t.trim()).includes(item.type)),
          {id: item.id, title: item.title, type: item.type}
        ]
      },
      ChangeActions.EQUIPMENT_CHANGE,
      `${wearing ? 'Unequipped' : 'Equipped'} ${item.title}`
    )
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
        <Button variant="secondary" size="sm" title="Add an item" onclick={() => openItem()}>Add item</Button>
    </div>
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
            {#each filteredItems as item (item.id)}
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
                        {:else}
                            <Sigil
                                frame="ring"
                                size="sm"
                                tone="ember"
                                active={isItemEquipped(item.id)}
                                title="{isItemEquipped(item.id) ? 'Unequip' : 'Equip'} {item.title}"
                                onclick={() => equipItem(item)}
                            >
                                <Glyph name={isAmmunition(item) ? 'ammunition' : getEquipIcon(item.type)} size="sm" />
                            </Sigil>
                        {/if}
                    </div>
                    <div class="name">
                        <h4 title={item.title}>{item.title}</h4>
                        <span>{getDisplayType(item)}</span>
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
            {/each}
        </ul>
    </div>
</div>

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

</style>
