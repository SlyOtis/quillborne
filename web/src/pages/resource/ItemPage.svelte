<script lang="ts">
  import ResourceShell from '$components/campaign/ResourceShell.svelte'
  import ItemDetails from '$components/campaign/ItemDetails.svelte'
  import Chip from '$components/ui/Chip.svelte'
  import { onMount } from 'svelte'
  import { resolvedRoute } from 'sly-svelte-location-router'
  import { getChoices, getItemLine, getItemRoom, getItemType, getRarityInk, type Item, type Resource } from '$lib/resources'
  import { user } from '$lib/stores/auth.store'
  import { getSystems } from '$lib/rules/system'
  import type { RuleSystem } from '$lib/rules/spec.types'
  import type { ArmorClass, Damage, Properties } from '$lib/character.types'
  import { FORMULA_DICE } from '$lib/engine'

  type Draft = Record<string, unknown> & Resource

  const RARITIES = getChoices('items', 'rarity')

  let room = $state<Item[] | null>(null)
  let systems = $state<RuleSystem[]>([])

  const steps = $derived($resolvedRoute.path.split('/').filter(Boolean).slice(1))
  const recordId = $derived(steps[0] === 'campaign' ? steps[3] : steps[1])
  const fixed = $derived(
    room?.find((one) => one.id === recordId && one.user_id !== $user?.user_id) as (Record<string, unknown> & Item) | undefined
  )

  function getRules(one: Draft): RuleSystem | undefined {
    return systems.find((choice) => choice.id === one.system)
  }

  function held(one: Draft): Properties {
    return (one.properties as Properties | undefined) ?? {}
  }

  function put(one: Draft, changes: Partial<Properties>) {
    one.properties = { ...held(one), ...changes }
  }

  function getDice(one: Draft, key: 'damage' | 'versatile'): Damage {
    return held(one)[key] ?? { amount: 1, dice: key === 'damage' ? 6 : 8, type: held(one).damage?.type ?? '', bonus: 0 }
  }

  function putDice(one: Draft, key: 'damage' | 'versatile', changes: Partial<Damage>) {
    put(one, { [key]: { ...getDice(one, key), ...changes } })
  }

  function getAc(one: Draft): ArmorClass {
    return held(one).ac ?? { base: 10, bonus: 0, dexModifier: true, maxDexBonus: 0 }
  }

  function putAc(one: Draft, changes: Partial<ArmorClass>) {
    put(one, { ac: { ...getAc(one), ...changes } })
  }

  function putArmor(one: Draft, id: string) {
    const category = getRules(one)?.items?.armorCategories?.find((choice) => choice.id === id)
    put(one, { armor: id, ac: { ...getAc(one), dexModifier: Boolean(category?.dex), maxDexBonus: category?.cap ?? 0 } })
  }

  function putRange(one: Draft, normal: number, max: number) {
    put(one, { range: normal > 0 ? { normal, max: Math.max(normal, max) } : undefined })
  }

  function toggleTag(one: Draft, id: string) {
    one.tags = one.tags.includes(id) ? one.tags.filter((tag) => tag !== id) : [...one.tags, id]
  }

  function getDamageLine(damage: Damage | undefined, rules: RuleSystem | undefined): string {
    if (!damage) return ''
    const type = rules?.damageTypes?.find((choice) => choice.id === damage.type)?.title ?? damage.type
    return `${damage.amount}d${damage.dice}${type ? ` ${type.toLowerCase()}` : ''}`
  }

  function getDexLine(ac: ArmorClass): string {
    if (!ac.dexModifier) return 'Not added'
    return ac.maxDexBonus > 0 ? `Up to +${ac.maxDexBonus}` : 'Added in full'
  }

  function getTagLine(one: Draft, rules: RuleSystem | undefined): string {
    return (rules?.items?.weaponProperties ?? [])
      .filter((choice) => one.tags.includes(choice.id))
      .map((choice) => choice.title)
      .join(', ')
  }

  onMount(() => {
    if (steps[0] === 'campaign') room = []
    else
      void getItemRoom()
        .catch(() => [])
        .then((found) => (room = found))
    void getSystems()
      .then((found) => (systems = found))
      .catch(() => (systems = []))
  })
</script>

{#if room === null}
  <div class="dnd-loading"><span class="dnd-spinner"></span></div>
{:else}
  <ResourceShell kind="items" {fixed}>
    {#snippet line(one)}
      {@const it = one as unknown as Item}
      <p class="item-line">
        <Chip still glyph={it.source === 'general' ? 'gem' : 'edit'}>{it.source === 'general' ? 'General' : 'Homebrew'}</Chip>
        <span>{getItemLine(it)}</span>
      </p>
    {/snippet}

    {#snippet facts(one)}
      {@const it = one as unknown as Item}
      {@const rules = getRules(one)}
      <dt>Type</dt>
      <dd>{getItemType(it)}</dd>
      <dt>Rarity</dt>
      <dd style:color={getRarityInk(it.rarity)}>{it.rarity}</dd>
      {#if it.attunement}<dt>Attunement</dt><dd>Required{it.attuned_by ? ` ${it.attuned_by}` : ""}</dd>{/if}
      {#if it.consumable}<dt>Consumable</dt><dd>Used up when used</dd>{/if}
      {#if it.properties.use}
        <dt>When used</dt>
        <dd>{rules?.items?.uses?.find((choice) => choice.id === it.properties.use?.effect)?.title ?? it.properties.use.effect} {it.properties.use.roll}</dd>
      {/if}
      {#if it.properties.damage}
        <dt>Damage</dt>
        <dd>{getDamageLine(it.properties.damage, rules)}{it.properties.magic ? `, +${it.properties.magic} magic` : ''}</dd>
      {/if}
      {#if it.properties.versatile}<dt>Two hands</dt><dd>{getDamageLine(it.properties.versatile, rules)}</dd>{/if}
      {#if it.properties.range}<dt>Range</dt><dd>{it.properties.range.normal}/{it.properties.range.max} ft</dd>{/if}
      {#if it.properties.weapon}
        <dt>Weapon</dt>
        <dd>{rules?.items?.weaponCategories?.find((choice) => choice.id === it.properties.weapon)?.title ?? it.properties.weapon}</dd>
      {/if}
      {#if getTagLine(one, rules)}<dt>Properties</dt><dd>{getTagLine(one, rules)}</dd>{/if}
      {#if it.properties.ac}
        <dt>Armor class</dt>
        <dd>{it.properties.ac.base}{it.properties.ac.bonus ? ` + ${it.properties.ac.bonus}` : ''}</dd>
        {#if it.properties.armor}
          <dt>Armor</dt>
          <dd>{rules?.items?.armorCategories?.find((choice) => choice.id === it.properties.armor)?.title ?? it.properties.armor}</dd>
        {/if}
        <dt>Dexterity</dt>
        <dd>{getDexLine(it.properties.ac)}</dd>
      {/if}
      {#if it.properties.strength}<dt>Strength</dt><dd>{it.properties.strength} or slowed</dd>{/if}
      {#if it.properties.stealth}<dt>Stealth</dt><dd>Disadvantage while worn</dd>{/if}
      {#if it.weight}<dt>Weight</dt><dd>{it.weight} lb</dd>{/if}
      {#if it.value}<dt>Worth</dt><dd>{it.value} gp</dd>{/if}
    {/snippet}

    {#snippet form(one)}
      {@const rules = getRules(one)}
      {@const stats = rules?.items?.categories?.find((choice) => choice.id === one.category)?.stats}
      <dt><label for="item-category">Type</label></dt>
      <dd>
        <select id="item-category" bind:value={one.category}>
          {#each rules?.items?.categories ?? [] as choice (choice.id)}
            <option value={choice.id}>{choice.title}</option>
          {/each}
        </select>
      </dd>
      {#if stats === 'weapon'}
        <dt><label for="item-weapon">Weapon</label></dt>
        <dd>
          <select id="item-weapon" bind:value={() => held(one).weapon ?? '', (value) => put(one, { weapon: value || undefined })}>
            <option value="">No category</option>
            {#each rules?.items?.weaponCategories ?? [] as choice (choice.id)}
              <option value={choice.id}>{choice.title}</option>
            {/each}
          </select>
        </dd>
        <dt><label for="item-damage-amount">Damage</label></dt>
        <dd class="item-dice">
          <input id="item-damage-amount" type="number" min="1" aria-label="Dice" bind:value={() => getDice(one, 'damage').amount, (value) => putDice(one, 'damage', { amount: Number(value) || 1 })} />
          <select aria-label="Die" bind:value={() => getDice(one, 'damage').dice, (value) => putDice(one, 'damage', { dice: Number(value) })}>
            {#each FORMULA_DICE as die (die)}<option value={die}>d{die}</option>{/each}
          </select>
          <select aria-label="Damage type" bind:value={() => getDice(one, 'damage').type, (value) => putDice(one, 'damage', { type: value })}>
            {#each rules?.damageTypes ?? [] as choice (choice.id)}<option value={choice.id}>{choice.title}</option>{/each}
          </select>
        </dd>
        <dt>Properties</dt>
        <dd class="item-chips">
          {#each rules?.items?.weaponProperties ?? [] as choice (choice.id)}
            <Chip on={one.tags.includes(choice.id)} onclick={() => toggleTag(one, choice.id)}>{choice.title}</Chip>
          {/each}
        </dd>
        <dt><label for="item-versatile-amount">Two hands</label></dt>
        <dd class="item-dice">
          <input id="item-versatile-amount" type="number" min="0" aria-label="Dice held in two hands" placeholder="none" bind:value={() => held(one).versatile?.amount ?? 0, (value) => (Number(value) > 0 ? putDice(one, 'versatile', { amount: Number(value) }) : put(one, { versatile: undefined }))} />
          {#if held(one).versatile}
            <select aria-label="Die held in two hands" bind:value={() => getDice(one, 'versatile').dice, (value) => putDice(one, 'versatile', { dice: Number(value) })}>
              {#each FORMULA_DICE as die (die)}<option value={die}>d{die}</option>{/each}
            </select>
          {/if}
        </dd>
        <dt><label for="item-range">Range</label></dt>
        <dd class="item-dice">
          <input id="item-range" type="number" min="0" aria-label="Normal range in feet" placeholder="melee" bind:value={() => held(one).range?.normal ?? 0, (value) => putRange(one, Number(value) || 0, held(one).range?.max ?? 0)} />
          <input type="number" min="0" aria-label="Long range in feet" bind:value={() => held(one).range?.max ?? 0, (value) => putRange(one, held(one).range?.normal ?? 0, Number(value) || 0)} />
        </dd>
        <dt><label for="item-magic">Magic bonus</label></dt>
        <dd>
          <input id="item-magic" type="number" min="0" bind:value={() => held(one).magic ?? 0, (value) => put(one, { magic: Number(value) || undefined })} />
        </dd>
      {/if}
      {#if stats === 'armor'}
        <dt><label for="item-armor">Armor</label></dt>
        <dd>
          <select id="item-armor" bind:value={() => held(one).armor ?? '', (value) => putArmor(one, value)}>
            {#each rules?.items?.armorCategories ?? [] as choice (choice.id)}
              <option value={choice.id}>{choice.title}</option>
            {/each}
          </select>
        </dd>
        <dt><label for="item-ac">Armor class</label></dt>
        <dd>
          <input id="item-ac" type="number" min="0" bind:value={() => getAc(one).base, (value) => putAc(one, { base: Number(value) || 0 })} />
        </dd>
        <dt><label for="item-ac-bonus">Magic bonus</label></dt>
        <dd>
          <input id="item-ac-bonus" type="number" min="0" bind:value={() => getAc(one).bonus, (value) => putAc(one, { bonus: Number(value) || 0 })} />
        </dd>
        <dt><label for="item-strength">Strength needed</label></dt>
        <dd>
          <input id="item-strength" type="number" min="0" bind:value={() => held(one).strength ?? 0, (value) => put(one, { strength: Number(value) || undefined })} />
        </dd>
        <dt><label for="item-stealth">Stealth</label></dt>
        <dd>
          <select id="item-stealth" bind:value={() => Boolean(held(one).stealth), (value) => put(one, { stealth: value || undefined })}>
            <option value={false}>No penalty</option>
            <option value={true}>Disadvantage</option>
          </select>
        </dd>
      {/if}
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
      <dt><label for="item-consumable">Consumable</label></dt>
      <dd>
        <select id="item-consumable" bind:value={one.consumable}>
          <option value={false}>No</option>
          <option value={true}>Yes</option>
        </select>
      </dd>
      {#if one.consumable}
        <dt><label for="item-use-roll">When used</label></dt>
        <dd class="item-dice">
          <input id="item-use-roll" type="text" placeholder="2d4 + 2" aria-label="What it rolls" bind:value={() => held(one).use?.roll ?? '', (value) => put(one, { use: value.trim() ? { roll: value, effect: held(one).use?.effect ?? rules?.items?.uses?.[0]?.id ?? '' } : undefined })} />
          {#if held(one).use}
            <select aria-label="What the roll does" bind:value={() => held(one).use?.effect ?? '', (value) => put(one, { use: { roll: held(one).use?.roll ?? '', effect: value } })}>
              {#each rules?.items?.uses ?? [] as choice (choice.id)}<option value={choice.id}>{choice.title}</option>{/each}
            </select>
          {/if}
        </dd>
      {/if}
      <dt><label for="item-weight">Weight</label></dt>
      <dd>
        <input id="item-weight" type="number" min="0" step="any" bind:value={one.weight} />
      </dd>
      <dt><label for="item-value">Worth in gold</label></dt>
      <dd>
        <input id="item-value" type="number" min="0" step="any" bind:value={one.value} />
      </dd>
      <dt><label for="item-notes">Notes</label></dt>
      <dd>
        <input id="item-notes" type="text" placeholder="Damage, Poison, Combat" bind:value={one.notes} />
      </dd>
      <dt><label for="item-system">Rules</label></dt>
      <dd>
        <select id="item-system" bind:value={one.system}>
          {#each systems as choice (choice.id)}
            <option value={choice.id}>{choice.title}</option>
          {/each}
        </select>
      </dd>
    {/snippet}

    {#snippet tail(one, writing)}
      <ItemDetails one={one as unknown as Item} {writing} />
    {/snippet}
  </ResourceShell>
{/if}

<style>
  .item-dice,
  .item-chips {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2);
  }

  .item-line {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2);
    margin: 0;
    font-style: italic;
    color: var(--ink-dim);
  }
</style>
