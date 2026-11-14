<script lang="ts">
  import { getMonsters, getObjectTags } from '$lib/api'
  import { OBJECT_TYPE_MONSTER, type Monster, type Tag } from '$lib/api/types'
  import { getTheme, setTheme } from '$lib/dialogs/theme'
  import { getEmptyFilter, getMonsterBlock, getMonsterStats, getMonsterSystems, isMonsterShown } from '$lib/rules/monster'
  import type { MonsterBlock as Block, MonsterChoice, MonsterFilter, MonsterStats, MonsterSystem } from '$lib/rules/monster.types'
  import { user } from '$lib/stores/auth.store'
  import { onMount } from 'svelte'
  import { navigate } from 'sly-svelte-location-router'
  import MonsterBlock from '$components/monster/MonsterBlock.svelte'
  import Button from '$components/ui/Button.svelte'
  import Chip from '$components/ui/Chip.svelte'
  import Field from '$components/ui/Field.svelte'
  import FrameBtn from '$components/ui/FrameBtn.svelte'
  import Glyph, { type GlyphName } from '$components/ui/Glyph.svelte'
  import IconBtn from '$components/ui/IconBtn.svelte'
  import Ornament from '$components/ui/Ornament.svelte'
  import Shell from '$components/ui/Shell.svelte'
  import StoredImage from '$components/ui/StoredImage.svelte'

  type Column = 'challenge' | 'name' | 'type' | 'size' | 'alignment' | 'habitat' | 'tags'

  type Line = {
    monster: Monster
    system: MonsterSystem
    stats: MonsterStats
    block: Block
    tags: Tag[]
    glyph: GlyphName
    homebrew: boolean
  }

  const COLUMNS: { id: Column; label: string }[] = [
    { id: 'challenge', label: 'CR' },
    { id: 'name', label: 'Name' },
    { id: 'type', label: 'Type' },
    { id: 'size', label: 'Size' },
    { id: 'alignment', label: 'Alignment' },
    { id: 'habitat', label: 'Habitat' },
    { id: 'tags', label: 'Tags' }
  ]

  const SHOWN_TYPES = 7

  let systems = $state<MonsterSystem[]>([])
  let monsters = $state<Monster[]>([])
  let tags = $state<Tag[]>([])
  let loading = $state(true)
  let error = $state<string | null>(null)
  let filter = $state<MonsterFilter>(getEmptyFilter())
  let advanced = $state(false)
  let moreTypes = $state(false)
  let inspected = $state<string[]>([])
  let sort = $state<{ by: Column; down: boolean }>({ by: 'name', down: false })

  onMount(() => setTheme(getTheme()))

  $effect(() => {
    if (!$user) return
    let live = true
    loading = true
    Promise.all([getMonsterSystems(), getMonsters(), getObjectTags(OBJECT_TYPE_MONSTER)])
      .then(([loadedSystems, loadedMonsters, loadedTags]) => {
        if (!live) return
        systems = loadedSystems
        monsters = loadedMonsters
        tags = loadedTags
      })
      .catch((reason) => live && (error = reason instanceof Error ? reason.message : String(reason)))
      .finally(() => live && (loading = false))
    return () => {
      live = false
    }
  })

  const system = $derived(systems[0] ?? null)

  const lines = $derived<Line[]>(
    monsters.flatMap((monster) => {
      const held = systems.find((one) => one.id === monster.system)
      if (!held) return []
      return [
        {
          monster,
          system: held,
          stats: getMonsterStats(held, monster.stats),
          block: getMonsterBlock(held, monster),
          tags: tags.filter((tag) => tag.object_ids?.includes(monster.id)),
          glyph: (held.types.find((one) => one.id === monster.type)?.glyph ?? held.typeGlyph) as GlyphName,
          homebrew: monster.owner_id === $user?.user_id && !monster.is_public
        }
      ]
    })
  )

  const counts = $derived(
    lines.reduce<Record<string, number>>((all, line) => ({ ...all, [line.monster.type]: (all[line.monster.type] ?? 0) + 1 }), {})
  )

  const subtypes = $derived([...new Set(lines.flatMap((line) => line.stats.subtypes))].sort((a, b) => a.localeCompare(b)))
  const usedTags = $derived(tags.filter((tag) => lines.some((line) => line.tags.includes(tag))))

  const types = $derived.by(() => {
    if (!system) return []
    const hidden = system.types.slice(SHOWN_TYPES)
    return moreTypes || hidden.some((one) => one.id === filter.type) ? system.types : system.types.slice(0, SHOWN_TYPES)
  })

  function getKey(line: Line, by: Column): string | number {
    if (by === 'challenge') return line.monster.challenge
    if (by === 'type') return line.block.type
    if (by === 'size') return line.system.sizes.findIndex((one) => one.id === line.monster.size)
    if (by === 'alignment') return line.block.alignment
    if (by === 'habitat') return line.block.habitats.join(', ')
    if (by === 'tags') return line.tags.map((tag) => tag.name).join(', ')
    return line.monster.name
  }

  const shown = $derived(
    lines
      .filter((line) => isMonsterShown(line.monster, line.stats, line.block, line.tags.map((tag) => tag.id), filter))
      .sort((a, b) => {
        const left = getKey(a, sort.by)
        const right = getKey(b, sort.by)
        const order = typeof left === 'number' && typeof right === 'number' ? left - right : String(left).localeCompare(String(right))
        return (sort.down ? -order : order) || a.monster.name.localeCompare(b.monster.name)
      })
  )

  const narrowed = $derived(JSON.stringify(filter) !== JSON.stringify(getEmptyFilter()))

  function sortBy(by: Column) {
    sort = { by, down: sort.by === by ? !sort.down : by === 'challenge' }
  }

  function reset() {
    filter = getEmptyFilter()
  }

  function inspect(id: string) {
    inspected = inspected.includes(id) ? inspected.filter((one) => one !== id) : [...inspected, id]
  }
</script>

<Shell drawers title="Monsters" width="full">
  <header class="dnd-band">
    <div class="dnd-band-line">
      <p class="dnd-label lair-eyebrow">The bestiary and your homebrew</p>
      <span class="dnd-band-acts">
        <Button variant="primary" size="sm" disabled={!system} onclick={() => navigate('/main/monsters/new')}>New monster</Button>
      </span>
    </div>

    <div class="lair-crown">
      <h1 class="dnd-heading dnd-heading-hero lair-name">Monsters</h1>
      <p class="lair-lede">{shown.length} of {lines.length}</p>
    </div>

    {#if system}
      <div class="lair-kinds" role="group" aria-label="Monster types">
        <span class="lair-kind">
          <FrameBtn title="All monsters" active={!filter.type} onclick={() => (filter.type = '')}>
            <Glyph name="blocks" />
          </FrameBtn>
          <span class="lair-kind-word">All monsters</span>
        </span>
        {#each types as type (type.id)}
          <span class="lair-kind">
            <FrameBtn
              title={type.name}
              active={filter.type === type.id}
              count={counts[type.id] || undefined}
              onclick={() => (filter.type = filter.type === type.id ? '' : type.id)}
            >
              <Glyph name={(type.glyph ?? system.typeGlyph) as GlyphName} />
            </FrameBtn>
            <span class="lair-kind-word">{type.name}</span>
          </span>
        {/each}
        {#if system.types.length > SHOWN_TYPES}
          <span class="lair-kind">
            <FrameBtn title={moreTypes ? 'Show fewer types' : 'Show more types'} onclick={() => (moreTypes = !moreTypes)}>
              <Glyph name="more" />
            </FrameBtn>
            <span class="lair-kind-word">{moreTypes ? 'Show fewer' : 'Show more'}</span>
          </span>
        {/if}
      </div>

      <div class="lair-filters" role="group" aria-label="Filter the monsters">
        <Field id="lair-name" label="Monster name">
          <input id="lair-name" type="search" placeholder="Search the bestiary..." bind:value={filter.name} />
        </Field>
        <Field id="lair-challenge-min" label="Challenge range">
          <select id="lair-challenge-min" class="lair-range" bind:value={filter.challengeMin}>
            <option value={null}>Min</option>
            {#each system.challenges as one (one.value)}<option value={one.value}>{one.name}</option>{/each}
          </select>
          <select class="lair-range" aria-label="Challenge range, highest" bind:value={filter.challengeMax}>
            <option value={null}>Max</option>
            {#each system.challenges as one (one.value)}<option value={one.value}>{one.name}</option>{/each}
          </select>
        </Field>
        <Field id="lair-size" label="Size">
          <select id="lair-size" bind:value={filter.size}>
            <option value="">Any</option>
            {#each system.sizes as one (one.id)}<option value={one.id}>{one.name}</option>{/each}
          </select>
        </Field>
        <Field id="lair-habitat" label="Habitat">
          <select id="lair-habitat" bind:value={filter.habitat}>
            <option value="">Any</option>
            {#each system.habitats as one (one.id)}<option value={one.id}>{one.name}</option>{/each}
          </select>
        </Field>
      </div>

      {#if advanced}
        <div class="lair-filters lair-advanced" id="lair-advanced" role="group" aria-label="Advanced filters">
          <Field id="lair-alignment" label="Alignment">
            <select id="lair-alignment" bind:value={filter.alignment}>
              <option value="">Any</option>
              {#each system.alignments as one (one.id)}<option value={one.id}>{one.name}</option>{/each}
            </select>
          </Field>
          <Field id="lair-ac-min" label="Armor class">
            <input id="lair-ac-min" class="lair-range" type="number" min="0" placeholder="Min" bind:value={filter.acMin} />
            <input class="lair-range" type="number" min="0" placeholder="Max" aria-label="Armor class, highest" bind:value={filter.acMax} />
          </Field>
          <Field id="lair-hp-min" label="Average hit points">
            <input id="lair-hp-min" class="lair-range" type="number" min="0" placeholder="Min" bind:value={filter.hpMin} />
            <input class="lair-range" type="number" min="0" placeholder="Max" aria-label="Average hit points, highest" bind:value={filter.hpMax} />
          </Field>
          <Field id="lair-sense" label="Senses">
            <select id="lair-sense" bind:value={filter.sense}>
              <option value="">Any</option>
              {#each system.senses as one (one.id)}<option value={one.id}>{one.name}</option>{/each}
            </select>
          </Field>
          <Field id="lair-save" label="Save proficiency">
            <select id="lair-save" bind:value={filter.save}>
              <option value="">Any</option>
              {#each system.abilities as one (one.id)}<option value={one.id}>{one.name}</option>{/each}
            </select>
          </Field>
          <Field id="lair-skill" label="Skill proficiency">
            <select id="lair-skill" bind:value={filter.skill}>
              <option value="">Any</option>
              {#each system.skills as one (one.id)}<option value={one.id}>{one.name}</option>{/each}
            </select>
          </Field>
          {#each system.flags as flag (flag.id)}
            <Field id="lair-flag-{flag.id}" label={flag.name}>
              <select
                id="lair-flag-{flag.id}"
                value={filter.flags[flag.id] ?? ''}
                onchange={(event) => (filter.flags = { ...filter.flags, [flag.id]: event.currentTarget.value as MonsterChoice | '' })}
              >
                <option value="">Any</option>
                <option value="yes">Yes</option>
                <option value="no">No</option>
              </select>
            </Field>
          {/each}
          <Field id="lair-resistance" label="Resistance">
            <select id="lair-resistance" bind:value={filter.resistance}>
              <option value="">Any</option>
              {#each system.damageTypes as one (one.id)}<option value={one.id}>{one.name}</option>{/each}
            </select>
          </Field>
          <Field id="lair-immunity" label="Damage immunity">
            <select id="lair-immunity" bind:value={filter.immunity}>
              <option value="">Any</option>
              {#each system.damageTypes as one (one.id)}<option value={one.id}>{one.name}</option>{/each}
            </select>
          </Field>
          <Field id="lair-condition" label="Condition immunity">
            <select id="lair-condition" bind:value={filter.conditionImmunity}>
              <option value="">Any</option>
              {#each system.conditions as one (one.id)}<option value={one.id}>{one.name}</option>{/each}
            </select>
          </Field>
          <Field id="lair-vulnerability" label="Vulnerability">
            <select id="lair-vulnerability" bind:value={filter.vulnerability}>
              <option value="">Any</option>
              {#each system.damageTypes as one (one.id)}<option value={one.id}>{one.name}</option>{/each}
            </select>
          </Field>
          <Field id="lair-language" label="Languages">
            <select id="lair-language" bind:value={filter.language}>
              <option value="">Any</option>
              {#each system.languages as one (one.id)}<option value={one.id}>{one.name}</option>{/each}
            </select>
          </Field>
          <Field id="lair-movement" label="Movement type">
            <select id="lair-movement" bind:value={filter.movement}>
              <option value="">Any</option>
              {#each system.movements as one (one.id)}<option value={one.id}>{one.name}</option>{/each}
            </select>
          </Field>
          <Field id="lair-tag" label="Monster tags">
            <select id="lair-tag" bind:value={filter.tag}>
              <option value="">Any</option>
              {#each usedTags as one (one.id)}<option value={one.id}>{one.name}</option>{/each}
            </select>
          </Field>
          <Field id="lair-subtype" label="Monster sub-types">
            <select id="lair-subtype" bind:value={filter.subtype}>
              <option value="">Any</option>
              {#each subtypes as one (one)}<option value={one}>{one}</option>{/each}
            </select>
          </Field>
        </div>
      {/if}

      <div class="lair-acts">
        <Button variant="ghost" size="sm" disabled={!narrowed} onclick={reset}>Reset all filters</Button>
      </div>
    {/if}
  </header>

  {#if system}
    <span class="lair-tab">
      <Button variant="plain" size="sm" onclick={() => (advanced = !advanced)}>
        {advanced ? 'Hide advanced filters' : 'Show advanced filters'}
      </Button>
    </span>
  {/if}

  {#if error}
    <p class="lair-alarm" role="alert">{error}</p>
  {/if}

  {#if loading}
    <div class="dnd-loading" role="status" aria-label="Rousing the bestiary"><span class="dnd-spinner"></span></div>
  {:else if lines.length === 0}
    <div class="dnd-empty">
      <span class="dnd-empty-mark"><Ornament name="skull" size="sm" tone="metal" /></span>
      <p class="lair-note">No monster stirs here yet. Make one: it stays your own homebrew until you share it.</p>
    </div>
  {:else}
    <section class="lair-roll" aria-label="Monsters">
      <div class="lair-head">
        <span class="lair-col-face" aria-hidden="true"></span>
        {#each COLUMNS as column (column.id)}
          <button
            type="button"
            class="lair-sort lair-col-{column.id}"
            class:lair-sort-on={sort.by === column.id}
            aria-pressed={sort.by === column.id}
            title="Sort by {column.label}"
            onclick={() => sortBy(column.id)}
          >
            <span>{column.label}</span>
            <span class="lair-caret" class:lair-caret-down={sort.by === column.id && sort.down} aria-hidden="true"></span>
          </button>
        {/each}
        <span class="lair-col-more" aria-hidden="true"></span>
      </div>

      {#if shown.length === 0}
        <div class="dnd-empty">
          <p class="lair-note">Nothing in the bestiary answers to these filters.</p>
          <Button variant="ghost" size="sm" onclick={reset}>Reset all filters</Button>
        </div>
      {:else}
        <ul class="lair-lines">
          {#each shown as line (line.monster.id)}
            {@const open = inspected.includes(line.monster.id)}
            <li class="lair-line" class:lair-line-open={open}>
              <div class="lair-row">
                <span class="lair-cell lair-col-face">
                  <span class="lair-face">
                    {#if line.monster.image}
                      <StoredImage src={line.monster.image} alt="" />
                    {:else}
                      <Glyph name={line.glyph} />
                    {/if}
                  </span>
                </span>
                <span class="lair-cell lair-col-challenge"><span class="lair-cr">{line.block.challenge?.name ?? ''}</span></span>
                <span class="lair-cell lair-col-name">
                  <a class="lair-title" href="/main/monsters/{line.monster.id}">{line.monster.name}</a>
                  <span class="lair-under" class:lair-under-lit={line.homebrew}>{line.homebrew ? 'Homebrew' : line.system.title}</span>
                </span>
                <span class="lair-cell lair-col-type">
                  <span class="lair-type">{line.block.type}</span>
                  {#if line.stats.subtypes.length}<span class="lair-under">({line.stats.subtypes.join(', ')})</span>{/if}
                </span>
                <span class="lair-cell lair-col-size">{line.block.size}</span>
                <span class="lair-cell lair-col-alignment">{line.block.alignment}</span>
                <span class="lair-cell lair-col-habitat" title={line.block.habitats.join(', ')}>
                  {line.block.habitats[0] ?? ''}{line.block.habitats.length > 1 ? ' (...)' : ''}
                </span>
                <span class="lair-cell lair-col-tags">
                  {#each line.tags as tag (tag.id)}<Chip still>#{tag.name}</Chip>{/each}
                </span>
                <span class="lair-cell lair-col-more">
                  <IconBtn
                    title={open ? `Close ${line.monster.name}` : `Inspect ${line.monster.name}`}
                    active={open}
                    expanded={open}
                    onclick={() => inspect(line.monster.id)}
                  >
                    <Glyph name={open ? 'minus' : 'add'} size="md" />
                  </IconBtn>
                </span>
              </div>
              {#if open}
                <div class="lair-inspect">
                  <MonsterBlock system={line.system} monster={line.monster} />
                </div>
              {/if}
            </li>
          {/each}
        </ul>
      {/if}
    </section>
  {/if}
</Shell>

<style>
  .lair-eyebrow {
    margin: 0;
    color: var(--metal);
  }

  .lair-crown {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    margin-top: var(--space-4);
    min-width: 0;
  }

  .lair-name {
    margin: 0;
    min-width: 0;
  }

  .lair-lede {
    margin: 0;
    font-family: var(--font-figures);
    letter-spacing: var(--tracking-wide);
    font-size: var(--text-xs);
    color: var(--ink-faint);
  }

  .lair-kinds {
    --lair-kind: calc(var(--space-8) + var(--space-5));
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(min(var(--lair-kind), 100%), 1fr));
    align-items: start;
    gap: var(--space-4) var(--space-2);
    margin-top: var(--space-5);
    min-width: 0;
  }

  .lair-kind {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-2);
    min-width: 0;
  }

  .lair-kind-word {
    max-inline-size: 100%;
    overflow-wrap: anywhere;
    font-family: var(--font-display);
    font-size: calc(var(--text-xs) * 0.9);
    font-weight: 700;
    letter-spacing: var(--tracking-caps);
    text-transform: uppercase;
    text-align: center;
    color: var(--metal);
    text-shadow: 0 1px 0 var(--shadow-ink);
  }

  .lair-filters {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(calc(var(--space-8) * 3), 100%), 1fr));
    gap: var(--space-3) var(--space-4);
    margin-top: var(--space-5);
    min-width: 0;
  }

  .lair-range + .lair-range {
    margin-inline-start: var(--space-2);
  }

  .lair-advanced {
    padding: var(--space-4) var(--space-5) var(--space-5);
    border-radius: var(--radius-lg);
    background: var(--texture-noise), linear-gradient(180deg, color-mix(in srgb, var(--ground-raised) 70%, transparent), color-mix(in srgb, var(--ground-deep) 85%, transparent));
    box-shadow: var(--rim-thin), inset 0 0 16px 2px var(--shade-hard);
  }

  .lair-acts {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-3);
    margin-top: var(--space-4);
  }

  .lair-tab {
    display: flex;
    width: fit-content;
    margin: calc(var(--space-5) * -1) auto 0;
    padding: var(--space-1) var(--space-4);
    border-radius: 0 0 var(--radius-md) var(--radius-md);
    background:
      linear-gradient(180deg, color-mix(in srgb, var(--shadow-ink) 82%, transparent) 0%, color-mix(in srgb, var(--shadow-ink) 70%, transparent) 100%),
      var(--texture-noise),
      var(--ground-deep);
    box-shadow: var(--rim-thin), 0 5px 8px var(--shade);
  }

  .lair-alarm {
    margin: 0;
    padding: var(--space-3) var(--space-4);
    border: var(--border-hair) solid color-mix(in srgb, var(--state-bad) 55%, transparent);
    border-radius: var(--radius-sm);
    background: linear-gradient(color-mix(in srgb, var(--state-bad) 18%, transparent), color-mix(in srgb, var(--state-bad) 18%, transparent)), var(--texture-noise), var(--ground-deep);
    box-shadow: var(--bevel-down);
    font-size: var(--text-sm);
    color: var(--ink);
  }

  .lair-note {
    margin: 0;
  }

  .lair-roll {
    --lair-columns: var(--lair-face-size) minmax(0, 0.5fr) minmax(0, 2.2fr) minmax(0, 1.4fr) minmax(0, 0.8fr) minmax(0, 1.1fr) minmax(0, 1.1fr) minmax(0, 1.4fr) var(--lair-more-size);
    --lair-face-size: calc(var(--space-7) - var(--space-1));
    --lair-more-size: var(--space-6);
    container-type: inline-size;
    display: grid;
    gap: var(--space-2);
    min-width: 0;
  }

  .lair-row {
    position: relative;
  }

  .lair-head,
  .lair-row {
    display: grid;
    grid-template-columns: var(--lair-columns);
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-2) var(--space-3);
  }

  .lair-head {
    padding-block: 0;
  }

  .lair-sort {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    min-width: 0;
    padding: var(--space-2) 0;
    border: none;
    background: none;
    font-family: var(--font-display);
    font-size: var(--text-xs);
    font-weight: 700;
    letter-spacing: var(--tracking-caps);
    text-transform: uppercase;
    text-align: start;
    color: var(--metal);
    text-shadow: 0 1px 0 var(--shadow-ink);
    cursor: pointer;
    transition: color 0.15s ease, text-shadow 0.15s ease;
  }

  .lair-sort:hover,
  .lair-sort-on {
    color: var(--metal-bright);
    text-shadow: var(--glow-text);
  }

  .lair-sort:focus-visible {
    outline: none;
    box-shadow: var(--focus-ring);
  }

  .lair-caret {
    --lair-caret: 0.3rem;
    flex: none;
    width: 0;
    height: 0;
    border-left: var(--lair-caret) solid transparent;
    border-right: var(--lair-caret) solid transparent;
    border-bottom: calc(var(--lair-caret) * 1.4) solid currentColor;
    opacity: 0.35;
    transition: transform 0.15s ease, opacity 0.15s ease;
  }

  .lair-sort:hover .lair-caret,
  .lair-sort-on .lair-caret {
    opacity: 1;
  }

  .lair-caret-down {
    transform: rotate(180deg);
  }

  .lair-lines {
    display: grid;
    gap: var(--space-2);
    margin: 0;
    padding: 0;
    list-style: none;
    min-width: 0;
  }

  .lair-line {
    min-width: 0;
    border-radius: var(--radius-md);
    background:
      radial-gradient(ellipse 60% 120% at 0% 50%, color-mix(in srgb, var(--ember) 5%, transparent) 0%, transparent 70%),
      var(--texture-noise),
      linear-gradient(180deg, var(--ground-raised) 0%, var(--ground-deep) 100%);
    box-shadow: var(--rim-thin), var(--shadow-sm);
    color: var(--ink);
    font-family: var(--font-body);
    font-size: var(--text-sm);
    transition: box-shadow 0.18s ease;
  }

  .lair-line:has(.lair-row:hover),
  .lair-line-open {
    box-shadow: var(--rim-thin), inset 0 0 18px -6px var(--ember-glow), var(--shadow-sm);
  }

  .lair-cell {
    display: flex;
    flex-direction: column;
    gap: var(--space-0);
    min-width: 0;
    overflow-wrap: anywhere;
    color: var(--ink-dim);
  }

  .lair-col-tags {
    flex-direction: row;
    flex-wrap: wrap;
    gap: var(--space-1);
  }

  .lair-col-more {
    position: relative;
    align-items: center;
  }

  .lair-face {
    display: flex;
    align-items: center;
    justify-content: center;
    width: var(--lair-face-size);
    aspect-ratio: 1;
    overflow: hidden;
    border-radius: 50% 50% var(--radius-sm) var(--radius-sm) / var(--radius-md) var(--radius-md) var(--radius-sm) var(--radius-sm);
    background:
      radial-gradient(ellipse 80% 60% at 50% 0%, color-mix(in srgb, var(--ember) 10%, transparent) 0%, transparent 70%),
      var(--texture-noise),
      linear-gradient(180deg, var(--ground-lift) 0%, var(--ground-deep) 100%);
    box-shadow: var(--rim-thin), inset 0 0 10px -2px var(--shade-hard);
    color: var(--metal);
  }

  .lair-face :global(img) {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .lair-cr {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    align-self: flex-start;
    min-inline-size: calc(var(--space-6) + var(--space-1));
    padding: var(--space-1) var(--space-2);
    border-radius: 50% 50% var(--radius-sm) var(--radius-sm) / var(--radius-md) var(--radius-md) var(--radius-sm) var(--radius-sm);
    background: var(--texture-noise), linear-gradient(180deg, var(--stone) 0%, var(--stone-dark) 100%);
    box-shadow: var(--rim-thin), var(--bevel-up);
    font-family: var(--font-figures);
    font-size: var(--text-sm);
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    color: var(--metal-bright);
    text-shadow: 0 1px 0 var(--shadow-ink);
  }

  .lair-title {
    align-self: flex-start;
    border-radius: var(--radius-sm);
    font-family: var(--font-display);
    font-size: var(--text-md);
    font-weight: 700;
    letter-spacing: var(--tracking-wide);
    text-decoration: none;
    color: var(--ink);
    text-shadow: 0 1px 0 var(--shadow-ink);
    transition: color 0.15s ease, text-shadow 0.15s ease;
  }

  .lair-title::after {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: var(--radius-md);
  }

  .lair-row:hover .lair-title {
    color: var(--metal-bright);
    text-shadow: var(--glow-text);
  }

  .lair-title:focus-visible {
    outline: none;
  }

  .lair-title:focus-visible::after {
    box-shadow: var(--focus-ring);
  }

  .lair-type {
    color: var(--ink);
  }

  .lair-under {
    font-size: var(--text-xs);
    font-style: italic;
    color: var(--ink-faint);
  }

  .lair-under-lit {
    font-family: var(--font-display);
    font-style: normal;
    letter-spacing: var(--tracking-caps);
    text-transform: uppercase;
    color: var(--ember);
  }

  .lair-inspect {
    padding: 0 var(--space-3) var(--space-3);
  }

  @container (max-width: 56rem) {
    .lair-roll .lair-col-alignment,
    .lair-roll .lair-col-habitat {
      display: none;
    }

    .lair-head,
    .lair-row {
      grid-template-columns: var(--lair-face-size) minmax(0, 0.6fr) minmax(0, 2fr) minmax(0, 1.4fr) minmax(0, 0.9fr) minmax(0, 1.2fr) var(--lair-more-size);
    }
  }

  @container (max-width: 36rem) {
    .lair-roll .lair-col-size,
    .lair-roll .lair-col-tags {
      display: none;
    }

    .lair-head,
    .lair-row {
      grid-template-columns: var(--lair-face-size) minmax(0, 0.7fr) minmax(0, 2fr) minmax(0, 1.4fr) var(--lair-more-size);
    }
  }
</style>
