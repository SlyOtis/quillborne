<script lang="ts">
  import { getProfile } from '$lib/api'
  import { getGrantLines, getItemTargets, type Item } from '$lib/resources'
  import { getSystem } from '$lib/rules/system'
  import type { RuleSystem } from '$lib/rules/spec.types'
  import { user } from '$lib/stores/auth.store'
  import Glyph from '$components/ui/Glyph.svelte'
  import IconBtn from '$components/ui/IconBtn.svelte'

  const {
    one,
    writing = false
  }: {
    /** The item the page is about; its grants are changed in place while writing. */
    one: Item
    /** Draws the grants as rows to change instead of lines to read. */
    writing?: boolean
  } = $props()

  let system = $state<RuleSystem | null>(null)
  let maker = $state('')

  $effect(() => {
    const id = one.system
    let live = true
    getSystem(id)
      .then((found) => live && (system = found))
      .catch(() => live && (system = null))
    return () => {
      live = false
    }
  })

  $effect(() => {
    const ownerId = one.owner_id
    maker = ''
    if (one.source === 'general' || !ownerId || ownerId === $user?.user_id) return
    let live = true
    getProfile(ownerId).then((found) => live && (maker = found?.display_name ?? ''))
    return () => {
      live = false
    }
  })

  const lines = $derived(system ? getGrantLines(one.grants, system) : [])
  const targets = $derived(system ? getItemTargets(system) : [])
  const ranged = $derived(system?.senses.filter((sense) => sense.unit) ?? [])
  const origin = $derived(
    one.source === 'general'
      ? `General${one.book ? `, ${one.book}` : ''}`
      : `Homebrew by ${one.owner_id === $user?.user_id ? 'you' : maker || 'another player'}`
  )

  function first(list: { id: string }[] | undefined): string {
    return list?.[0]?.id ?? ''
  }
</script>

<section class="dnd-item-details" aria-label="What it grants">
  {#if writing && system}
    <h2 class="dnd-label dnd-item-details-title">Grants</h2>
    <dl class="dnd-facts">
      <dt>Scores</dt>
      <dd class="dnd-item-details-rows">
        {#each one.grants.attributes as attribute, index (index)}
          <span class="dnd-item-details-row">
            <select aria-label="Score" bind:value={attribute.id}>
              {#each system.attributes as choice (choice.id)}<option value={choice.id}>{choice.title}</option>{/each}
            </select>
            <select aria-label="How it changes" bind:value={attribute.mode}>
              <option value="set">Becomes</option>
              <option value="bonus">Adds</option>
            </select>
            <input type="number" aria-label="Value" bind:value={attribute.value} />
            {#if attribute.mode === 'bonus'}
              <input type="number" aria-label="At most" placeholder="At most" bind:value={attribute.max} />
            {/if}
            <IconBtn title="Remove the score" onclick={() => (one.grants.attributes = one.grants.attributes.filter((_, at) => at !== index))}>
              <Glyph name="remove" size="sm" />
            </IconBtn>
          </span>
        {/each}
        <IconBtn title="Add a score" onclick={() => (one.grants.attributes = [...one.grants.attributes, { id: first(system?.attributes), mode: 'bonus', value: 1 }])}>
          <Glyph name="add" size="sm" />
        </IconBtn>
      </dd>

      <dt>Bonuses</dt>
      <dd class="dnd-item-details-rows">
        {#each one.grants.bonuses as bonus, index (index)}
          <span class="dnd-item-details-row">
            <select aria-label="Bonus to" bind:value={bonus.id}>
              {#each system.bonuses ?? [] as choice (choice.id)}<option value={choice.id}>{choice.title}</option>{/each}
            </select>
            <input type="number" aria-label="Bonus" bind:value={bonus.value} />
            <IconBtn title="Remove the bonus" onclick={() => (one.grants.bonuses = one.grants.bonuses.filter((_, at) => at !== index))}>
              <Glyph name="remove" size="sm" />
            </IconBtn>
          </span>
        {/each}
        <IconBtn title="Add a bonus" onclick={() => (one.grants.bonuses = [...one.grants.bonuses, { id: first(system?.bonuses), value: 1 }])}>
          <Glyph name="add" size="sm" />
        </IconBtn>
      </dd>

      <dt>Proficiencies</dt>
      <dd class="dnd-item-details-rows">
        {#each one.grants.proficiencies as proficiency, index (index)}
          <span class="dnd-item-details-row">
            <select aria-label="Proficient in" bind:value={proficiency.id}>
              {#each targets as choice (choice.id)}<option value={choice.id}>{choice.title}</option>{/each}
              <option value="">By name</option>
            </select>
            {#if !proficiency.id}
              <input type="text" aria-label="Name" placeholder="longbow" bind:value={proficiency.name} />
            {/if}
            <select aria-label="Tier" bind:value={proficiency.tier}>
              {#each system.proficiencyTiers as choice (choice.id)}<option value={choice.id}>{choice.title}</option>{/each}
            </select>
            <IconBtn title="Remove the proficiency" onclick={() => (one.grants.proficiencies = one.grants.proficiencies.filter((_, at) => at !== index))}>
              <Glyph name="remove" size="sm" />
            </IconBtn>
          </span>
        {/each}
        <IconBtn
          title="Add a proficiency"
          onclick={() => (one.grants.proficiencies = [...one.grants.proficiencies, { id: first(targets), name: '', tier: system?.proficiencyTiers.find((tier) => tier.multiplier === 1)?.id ?? '' }])}
        >
          <Glyph name="add" size="sm" />
        </IconBtn>
      </dd>

      <dt>Advantages</dt>
      <dd class="dnd-item-details-rows">
        {#each one.grants.advantages as advantage, index (index)}
          <span class="dnd-item-details-row">
            <select aria-label="Advantage on" bind:value={advantage.id}>
              {#each targets as choice (choice.id)}<option value={choice.id}>{choice.title}</option>{/each}
              <option value="">By name</option>
            </select>
            {#if !advantage.id}
              <input type="text" aria-label="Name" placeholder="initiative" bind:value={advantage.name} />
            {/if}
            <input type="text" aria-label="When" placeholder="when moving silently" bind:value={advantage.note} />
            <IconBtn title="Remove the advantage" onclick={() => (one.grants.advantages = one.grants.advantages.filter((_, at) => at !== index))}>
              <Glyph name="remove" size="sm" />
            </IconBtn>
          </span>
        {/each}
        <IconBtn title="Add an advantage" onclick={() => (one.grants.advantages = [...one.grants.advantages, { id: first(targets), name: '', note: '' }])}>
          <Glyph name="add" size="sm" />
        </IconBtn>
      </dd>

      <dt>Defences</dt>
      <dd class="dnd-item-details-rows">
        {#each one.grants.defences as defence, index (index)}
          <span class="dnd-item-details-row">
            <select aria-label="Defence" bind:value={defence.id}>
              {#each system.defences ?? [] as choice (choice.id)}<option value={choice.id}>{choice.title}</option>{/each}
            </select>
            <select aria-label="Against" bind:value={defence.damage}>
              {#each system.damageTypes ?? [] as choice (choice.id)}<option value={choice.id}>{choice.title}</option>{/each}
            </select>
            <IconBtn title="Remove the defence" onclick={() => (one.grants.defences = one.grants.defences.filter((_, at) => at !== index))}>
              <Glyph name="remove" size="sm" />
            </IconBtn>
          </span>
        {/each}
        <IconBtn
          title="Add a defence"
          onclick={() => (one.grants.defences = [...one.grants.defences, { id: first(system?.defences), damage: first(system?.damageTypes) }])}
        >
          <Glyph name="add" size="sm" />
        </IconBtn>
      </dd>

      <dt>Senses</dt>
      <dd class="dnd-item-details-rows">
        {#each one.grants.senses as sense, index (index)}
          <span class="dnd-item-details-row">
            <select aria-label="Sense" bind:value={sense.id}>
              {#each ranged as choice (choice.id)}<option value={choice.id}>{choice.title}</option>{/each}
            </select>
            <input type="number" min="0" aria-label="Range" bind:value={sense.value} />
            <IconBtn title="Remove the sense" onclick={() => (one.grants.senses = one.grants.senses.filter((_, at) => at !== index))}>
              <Glyph name="remove" size="sm" />
            </IconBtn>
          </span>
        {/each}
        <IconBtn title="Add a sense" onclick={() => (one.grants.senses = [...one.grants.senses, { id: first(ranged), value: 60 }])}>
          <Glyph name="add" size="sm" />
        </IconBtn>
      </dd>

      <dt>Speeds</dt>
      <dd class="dnd-item-details-rows">
        {#each one.grants.speeds as speed, index (index)}
          <span class="dnd-item-details-row">
            <select aria-label="Speed" bind:value={speed.id}>
              {#each system.speeds ?? [] as choice (choice.id)}<option value={choice.id}>{choice.title}</option>{/each}
            </select>
            <input type="number" min="0" aria-label="Speed" bind:value={speed.value} />
            <IconBtn title="Remove the speed" onclick={() => (one.grants.speeds = one.grants.speeds.filter((_, at) => at !== index))}>
              <Glyph name="remove" size="sm" />
            </IconBtn>
          </span>
        {/each}
        <IconBtn title="Add a speed" onclick={() => (one.grants.speeds = [...one.grants.speeds, { id: first(system?.speeds), value: 30 }])}>
          <Glyph name="add" size="sm" />
        </IconBtn>
      </dd>

      <dt>On a hit</dt>
      <dd class="dnd-item-details-rows">
        {#each one.grants.damage as damage, index (index)}
          <span class="dnd-item-details-row">
            <input type="text" aria-label="Dice" placeholder="1d6" bind:value={damage.dice} />
            <select aria-label="Damage type" bind:value={damage.damage}>
              <option value="">The attack's own</option>
              {#each system.damageTypes ?? [] as choice (choice.id)}<option value={choice.id}>{choice.title}</option>{/each}
            </select>
            <input type="text" aria-label="When" placeholder="per charge spent" bind:value={damage.note} />
            <IconBtn title="Remove the damage" onclick={() => (one.grants.damage = one.grants.damage.filter((_, at) => at !== index))}>
              <Glyph name="remove" size="sm" />
            </IconBtn>
          </span>
        {/each}
        <IconBtn title="Add damage on a hit" onclick={() => (one.grants.damage = [...one.grants.damage, { dice: '1d6', damage: first(system?.damageTypes), note: '' }])}>
          <Glyph name="add" size="sm" />
        </IconBtn>
      </dd>

      <dt>Spells</dt>
      <dd class="dnd-item-details-rows">
        {#each one.grants.spells as spell, index (index)}
          <span class="dnd-item-details-row">
            <input type="text" aria-label="Spell" placeholder="Web" bind:value={spell.name} />
            <input type="number" min="0" aria-label="Level" placeholder="Level" bind:value={spell.level} />
            <input type="number" min="0" aria-label="Charges a casting spends" placeholder="Charges" bind:value={spell.charges} />
            <input type="number" min="0" aria-label="Save DC" placeholder="Save DC" bind:value={spell.dc} />
            <input type="number" aria-label="Attack bonus" placeholder="To hit" bind:value={spell.attack} />
            <input type="text" aria-label="Note" placeholder="Note" bind:value={spell.note} />
            <IconBtn title="Remove the spell" onclick={() => (one.grants.spells = one.grants.spells.filter((_, at) => at !== index))}>
              <Glyph name="remove" size="sm" />
            </IconBtn>
          </span>
        {/each}
        <IconBtn title="Add a spell" onclick={() => (one.grants.spells = [...one.grants.spells, { name: '', level: 1, charges: 1, note: '' }])}>
          <Glyph name="add" size="sm" />
        </IconBtn>
      </dd>

      <dt>Properties</dt>
      <dd class="dnd-item-details-rows">
        {#each one.grants.features as feature, index (index)}
          <span class="dnd-item-details-row">
            <input type="text" aria-label="Property" placeholder="Name" bind:value={feature.name} />
            <input type="text" aria-label="What it does" placeholder="What it does" bind:value={feature.text} />
            <IconBtn title="Remove the property" onclick={() => (one.grants.features = one.grants.features.filter((_, at) => at !== index))}>
              <Glyph name="remove" size="sm" />
            </IconBtn>
          </span>
        {/each}
        <IconBtn title="Add a property" onclick={() => (one.grants.features = [...one.grants.features, { name: '', text: '' }])}>
          <Glyph name="add" size="sm" />
        </IconBtn>
      </dd>

      <dt><label for="item-charges">Charges</label></dt>
      <dd class="dnd-item-details-row">
        <input id="item-charges" type="number" min="0" bind:value={one.grants.charges.max} />
        {#if one.grants.charges.max > 0}
          <input type="text" aria-label="Regains" placeholder="1d6 + 4" bind:value={one.grants.charges.regain} />
          <select aria-label="Regains at" bind:value={one.grants.charges.at}>
            {#each system.recharges ?? [] as choice (choice.id)}<option value={choice.id}>{choice.title}</option>{/each}
          </select>
          <input type="text" aria-label="On the last charge" placeholder="On the last charge" bind:value={one.grants.charges.last} />
        {/if}
      </dd>
    </dl>
  {:else if !writing}
    {#if lines.length > 0}
      <h2 class="dnd-label dnd-item-details-title">Grants</h2>
      <dl class="dnd-facts">
        {#each lines as line, index (index)}
          <dt>{line.label}</dt>
          <dd>{line.value}</dd>
        {/each}
      </dl>
    {/if}
    {#if one.notes}
      <p class="dnd-item-details-note"><span class="dnd-label">Notes</span> {one.notes}</p>
    {/if}
    <p class="dnd-item-details-origin">{origin}</p>
  {/if}
</section>

<style>
  .dnd-item-details {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    min-width: 0;
  }

  .dnd-item-details-title {
    margin: 0;
    color: var(--metal-bright);
  }

  .dnd-item-details-rows {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--space-2);
    min-width: 0;
  }

  .dnd-item-details-row {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    width: 100%;
    min-width: 0;
  }

  .dnd-item-details-row input,
  .dnd-item-details-row select {
    flex: 1 1 0;
  }

  .dnd-item-details-note,
  .dnd-item-details-origin {
    margin: 0;
    font-size: var(--text-sm);
    color: var(--ink-dim);
  }

  .dnd-item-details-origin {
    font-style: italic;
    color: var(--ink-faint);
  }
</style>
