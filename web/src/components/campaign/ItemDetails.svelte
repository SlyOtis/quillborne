<script lang="ts">
  import { getProfile } from '$lib/api'
  import { getGrantLines, getItemTargets, type Item } from '$lib/resources'
  import { getSystem } from '$lib/rules/system'
  import type { RuleSystem } from '$lib/rules/spec.types'
  import { user } from '$lib/stores/auth.store'
  import Button from '$components/ui/Button.svelte'
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
    const ownerId = one.user_id
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
      : `Homebrew by ${one.user_id === $user?.user_id ? 'you' : maker || 'another player'}`
  )

  function first(list: { id: string }[] | undefined): string {
    return list?.[0]?.id ?? ''
  }
</script>

<section class="dnd-item-details" aria-label="What it grants">
  {#if writing && system}
    <h2 class="dnd-label dnd-item-details-title">Grants</h2>
    <dl class="dnd-facts dnd-item-details-form">
      <dt>Scores</dt>
      <dd class="dnd-item-details-kind">
        {#if one.grants.attributes.length > 0}
          <div class="dnd-item-details-table dnd-item-details-scores">
            <span class="dnd-item-details-heads" aria-hidden="true">
              <span>Score</span>
              <span>How</span>
              <span>Value</span>
              {#if one.grants.attributes.some((attribute) => attribute.mode === 'bonus')}<span>At most</span>{/if}
            </span>
            {#each one.grants.attributes as attribute, index (index)}
              <span class="dnd-item-details-entry">
                <label class="dnd-item-details-cell dnd-item-details-lead">
                  <span class="dnd-item-details-caption">Score</span>
                  <select bind:value={attribute.id}>
                    {#each system.attributes as choice (choice.id)}<option value={choice.id}>{choice.title}</option>{/each}
                  </select>
                </label>
                <label class="dnd-item-details-cell">
                  <span class="dnd-item-details-caption">How</span>
                  <select bind:value={attribute.mode}>
                    <option value="set">Becomes</option>
                    <option value="bonus">Adds</option>
                  </select>
                </label>
                <label class="dnd-item-details-cell">
                  <span class="dnd-item-details-caption">Value</span>
                  <input type="number" bind:value={attribute.value} />
                </label>
                {#if attribute.mode === 'bonus'}
                  <label class="dnd-item-details-cell">
                    <span class="dnd-item-details-caption">At most</span>
                    <input type="number" bind:value={attribute.max} />
                  </label>
                {:else}
                  <span class="dnd-item-details-cell"></span>
                {/if}
                <IconBtn title="Remove the score" onclick={() => (one.grants.attributes = one.grants.attributes.filter((_, at) => at !== index))}>
                  <Glyph name="remove" size="sm" />
                </IconBtn>
              </span>
            {/each}
          </div>
        {/if}
        <Button variant="plain" size="sm" onclick={() => (one.grants.attributes = [...one.grants.attributes, { id: first(system?.attributes), mode: 'bonus', value: 1 }])}>
          <Glyph name="add" size="sm" />Add a score
        </Button>
      </dd>

      <dt>Bonuses</dt>
      <dd class="dnd-item-details-kind">
        {#each one.grants.bonuses as bonus, index (index)}
          <span class="dnd-item-details-line">
            <select aria-label="Bonus to" bind:value={bonus.id}>
              {#each system.bonuses ?? [] as choice (choice.id)}<option value={choice.id}>{choice.title}</option>{/each}
            </select>
            <input type="number" aria-label="Bonus" bind:value={bonus.value} />
            <IconBtn title="Remove the bonus" onclick={() => (one.grants.bonuses = one.grants.bonuses.filter((_, at) => at !== index))}>
              <Glyph name="remove" size="sm" />
            </IconBtn>
          </span>
        {/each}
        <Button variant="plain" size="sm" onclick={() => (one.grants.bonuses = [...one.grants.bonuses, { id: first(system?.bonuses), value: 1 }])}>
          <Glyph name="add" size="sm" />Add a bonus
        </Button>
      </dd>

      <dt>Proficiencies</dt>
      <dd class="dnd-item-details-kind">
        {#each one.grants.proficiencies as proficiency, index (index)}
          <span class="dnd-item-details-line">
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
        <Button
          variant="plain"
          size="sm"
          onclick={() => (one.grants.proficiencies = [...one.grants.proficiencies, { id: first(targets), name: '', tier: system?.proficiencyTiers.find((tier) => tier.multiplier === 1)?.id ?? '' }])}
        >
          <Glyph name="add" size="sm" />Add a proficiency
        </Button>
      </dd>

      <dt>Advantages</dt>
      <dd class="dnd-item-details-kind">
        {#each one.grants.advantages as advantage, index (index)}
          <span class="dnd-item-details-line">
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
        <Button variant="plain" size="sm" onclick={() => (one.grants.advantages = [...one.grants.advantages, { id: first(targets), name: '', note: '' }])}>
          <Glyph name="add" size="sm" />Add an advantage
        </Button>
      </dd>

      <dt>Defences</dt>
      <dd class="dnd-item-details-kind">
        {#each one.grants.defences as defence, index (index)}
          <span class="dnd-item-details-line">
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
        <Button variant="plain" size="sm" onclick={() => (one.grants.defences = [...one.grants.defences, { id: first(system?.defences), damage: first(system?.damageTypes) }])}>
          <Glyph name="add" size="sm" />Add a defence
        </Button>
      </dd>

      <dt>Senses</dt>
      <dd class="dnd-item-details-kind">
        {#each one.grants.senses as sense, index (index)}
          <span class="dnd-item-details-line">
            <select aria-label="Sense" bind:value={sense.id}>
              {#each ranged as choice (choice.id)}<option value={choice.id}>{choice.title}</option>{/each}
            </select>
            <input type="number" min="0" aria-label="Range" bind:value={sense.value} />
            <IconBtn title="Remove the sense" onclick={() => (one.grants.senses = one.grants.senses.filter((_, at) => at !== index))}>
              <Glyph name="remove" size="sm" />
            </IconBtn>
          </span>
        {/each}
        <Button variant="plain" size="sm" onclick={() => (one.grants.senses = [...one.grants.senses, { id: first(ranged), value: 60 }])}>
          <Glyph name="add" size="sm" />Add a sense
        </Button>
      </dd>

      <dt>Speeds</dt>
      <dd class="dnd-item-details-kind">
        {#each one.grants.speeds as speed, index (index)}
          <span class="dnd-item-details-line">
            <select aria-label="Speed" bind:value={speed.id}>
              {#each system.speeds ?? [] as choice (choice.id)}<option value={choice.id}>{choice.title}</option>{/each}
            </select>
            <input type="number" min="0" aria-label="Speed" bind:value={speed.value} />
            <IconBtn title="Remove the speed" onclick={() => (one.grants.speeds = one.grants.speeds.filter((_, at) => at !== index))}>
              <Glyph name="remove" size="sm" />
            </IconBtn>
          </span>
        {/each}
        <Button variant="plain" size="sm" onclick={() => (one.grants.speeds = [...one.grants.speeds, { id: first(system?.speeds), value: 30 }])}>
          <Glyph name="add" size="sm" />Add a speed
        </Button>
      </dd>

      <dt>On a hit</dt>
      <dd class="dnd-item-details-kind">
        {#each one.grants.damage as damage, index (index)}
          <span class="dnd-item-details-line">
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
        <Button variant="plain" size="sm" onclick={() => (one.grants.damage = [...one.grants.damage, { dice: '1d6', damage: first(system?.damageTypes), note: '' }])}>
          <Glyph name="add" size="sm" />Add damage on a hit
        </Button>
      </dd>

      <dt>Spells</dt>
      <dd class="dnd-item-details-kind">
        {#if one.grants.spells.length > 0}
          <div class="dnd-item-details-table dnd-item-details-spells">
            <span class="dnd-item-details-heads" aria-hidden="true">
              <span>Spell</span>
              <span>Level</span>
              <span>Charges</span>
              <span>Save DC</span>
              <span>To hit</span>
              <span>Note</span>
            </span>
            {#each one.grants.spells as spell, index (index)}
              <span class="dnd-item-details-entry">
                <label class="dnd-item-details-cell dnd-item-details-lead">
                  <span class="dnd-item-details-caption">Spell</span>
                  <input type="text" placeholder="Web" bind:value={spell.name} />
                </label>
                <label class="dnd-item-details-cell">
                  <span class="dnd-item-details-caption">Level</span>
                  <input type="number" min="0" bind:value={spell.level} />
                </label>
                <label class="dnd-item-details-cell">
                  <span class="dnd-item-details-caption">Charges</span>
                  <input type="number" min="0" bind:value={spell.charges} />
                </label>
                <label class="dnd-item-details-cell">
                  <span class="dnd-item-details-caption">Save DC</span>
                  <input type="number" min="0" bind:value={spell.dc} />
                </label>
                <label class="dnd-item-details-cell">
                  <span class="dnd-item-details-caption">To hit</span>
                  <input type="number" bind:value={spell.attack} />
                </label>
                <label class="dnd-item-details-cell dnd-item-details-tail">
                  <span class="dnd-item-details-caption">Note</span>
                  <input type="text" bind:value={spell.note} />
                </label>
                <IconBtn title="Remove the spell" onclick={() => (one.grants.spells = one.grants.spells.filter((_, at) => at !== index))}>
                  <Glyph name="remove" size="sm" />
                </IconBtn>
              </span>
            {/each}
          </div>
        {/if}
        <Button variant="plain" size="sm" onclick={() => (one.grants.spells = [...one.grants.spells, { name: '', level: 1, charges: 1, note: '' }])}>
          <Glyph name="add" size="sm" />Add a spell
        </Button>
      </dd>

      <dt>Properties</dt>
      <dd class="dnd-item-details-kind">
        {#each one.grants.features as feature, index (index)}
          <span class="dnd-item-details-line">
            <input type="text" aria-label="Property" placeholder="Name" bind:value={feature.name} />
            <input type="text" aria-label="What it does" placeholder="What it does" bind:value={feature.text} />
            <IconBtn title="Remove the property" onclick={() => (one.grants.features = one.grants.features.filter((_, at) => at !== index))}>
              <Glyph name="remove" size="sm" />
            </IconBtn>
          </span>
        {/each}
        <Button variant="plain" size="sm" onclick={() => (one.grants.features = [...one.grants.features, { name: '', text: '' }])}>
          <Glyph name="add" size="sm" />Add a property
        </Button>
      </dd>

      <dt>Charges</dt>
      <dd class="dnd-item-details-kind">
        <div class="dnd-item-details-table dnd-item-details-charges">
          <span class="dnd-item-details-heads" aria-hidden="true">
            <span>Holds</span>
            {#if one.grants.charges.max > 0}
              <span>Regains</span>
              <span>At</span>
              <span>On the last charge</span>
            {/if}
          </span>
          <span class="dnd-item-details-entry">
            <label class="dnd-item-details-cell">
              <span class="dnd-item-details-caption">Holds</span>
              <input type="number" min="0" bind:value={one.grants.charges.max} />
            </label>
            {#if one.grants.charges.max > 0}
              <label class="dnd-item-details-cell">
                <span class="dnd-item-details-caption">Regains</span>
                <input type="text" placeholder="1d6 + 4" bind:value={one.grants.charges.regain} />
              </label>
              <label class="dnd-item-details-cell">
                <span class="dnd-item-details-caption">At</span>
                <select bind:value={one.grants.charges.at}>
                  {#each system.recharges ?? [] as choice (choice.id)}<option value={choice.id}>{choice.title}</option>{/each}
                </select>
              </label>
              <label class="dnd-item-details-cell dnd-item-details-lead">
                <span class="dnd-item-details-caption">On the last charge</span>
                <input type="text" bind:value={one.grants.charges.last} />
              </label>
            {/if}
          </span>
        </div>
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
    container: grants / inline-size;
  }

  .dnd-item-details-title {
    margin: 0;
    color: var(--metal-bright);
  }

  .dnd-item-details-form {
    align-items: baseline;
    row-gap: var(--space-4);
  }

  .dnd-item-details-kind {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--space-2);
    min-width: 0;
  }

  .dnd-item-details-line {
    display: flex;
    align-self: stretch;
    align-items: end;
    gap: var(--space-3);
    min-width: 0;
  }

  .dnd-item-details-line > input,
  .dnd-item-details-line > select {
    flex: 3 1 0;
  }

  .dnd-item-details-line > input[type='number'] {
    flex: 1 1 0;
  }

  .dnd-item-details-table {
    display: grid;
    align-self: stretch;
    gap: var(--space-2) var(--space-3);
    min-width: 0;
    container: grants-table / inline-size;
  }

  .dnd-item-details-scores {
    grid-template-columns: minmax(0, 3fr) repeat(3, minmax(min-content, 1fr)) auto;
  }

  .dnd-item-details-spells {
    grid-template-columns: minmax(0, 3fr) repeat(4, minmax(min-content, 1fr)) minmax(0, 4fr) auto;
  }

  .dnd-item-details-charges {
    grid-template-columns: minmax(min-content, 1fr) minmax(0, 2fr) minmax(0, 2fr) minmax(0, 5fr);
  }

  .dnd-item-details-heads,
  .dnd-item-details-entry {
    display: grid;
    grid-column: 1 / -1;
    grid-template-columns: subgrid;
    align-items: end;
    min-width: 0;
  }

  .dnd-item-details-heads,
  .dnd-item-details-caption {
    font-family: var(--font-display);
    font-size: var(--text-xs);
    letter-spacing: var(--tracking-caps);
    text-transform: uppercase;
    white-space: nowrap;
    color: var(--ink-faint);
    text-shadow: 0 1px 0 var(--shadow-ink);
  }

  .dnd-item-details-cell {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    min-width: 0;
  }

  .dnd-item-details-caption {
    position: absolute;
    inline-size: 1px;
    block-size: 1px;
    overflow: hidden;
    clip-path: inset(50%);
  }

  @container grants-table (width < 36rem) {
    .dnd-item-details-heads {
      display: none;
    }

    .dnd-item-details-entry {
      display: flex;
      flex-wrap: wrap;
      gap: var(--space-2) var(--space-3);
    }

    .dnd-item-details-entry + .dnd-item-details-entry {
      margin-block-start: var(--space-3);
    }

    .dnd-item-details-cell {
      flex: 1 1 0;
      min-width: min-content;
    }

    .dnd-item-details-lead {
      flex-basis: 100%;
    }

    .dnd-item-details-tail {
      flex-basis: 60%;
    }

    .dnd-item-details-caption {
      position: static;
      inline-size: auto;
      block-size: auto;
      overflow: visible;
      clip-path: none;
    }
  }

  @container grants (width < 34rem) {
    .dnd-item-details-form {
      grid-template-columns: minmax(0, 1fr);
      row-gap: var(--space-2);
    }

    .dnd-item-details-form dd + dt {
      margin-block-start: var(--space-3);
    }
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
