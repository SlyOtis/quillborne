<script lang="ts">
  import { getMonsters, getObjectTags } from '$lib/api'
  import { OBJECT_TYPE_MONSTER, type Monster, type Tag } from '$lib/api/types'
  import { getTheme, setTheme } from '$lib/dialogs/theme'
  import { getEmptyFilter, getMonsterBlock, getMonsterStats, getMonsterSystems, isMonsterShown } from '$lib/rules/monster'
  import type { MonsterBlock as Block, MonsterChoice, MonsterEntry, MonsterFilter, MonsterStats, MonsterSystem } from '$lib/rules/monster.types'
  import { user } from '$lib/stores/auth.store'
  import { onMount } from 'svelte'
  import { navigate } from 'sly-svelte-location-router'
  import MonsterBlock from '$components/monster/MonsterBlock.svelte'
  import Button from '$components/ui/Button.svelte'
  import Chip from '$components/ui/Chip.svelte'
  import Dropdown, { type DropdownOption } from '$components/ui/Dropdown.svelte'
  import Field from '$components/ui/Field.svelte'
  import FileExplorer, { type FileGroupBy, type FileItem, type FileOption } from '$components/ui/FileExplorer.svelte'
  import Glyph, { type GlyphName } from '$components/ui/Glyph.svelte'
  import IconBtn from '$components/ui/IconBtn.svelte'
  import Ornament from '$components/ui/Ornament.svelte'
  import PageHead from '$components/ui/PageHead.svelte'
  import SearchInput from '$components/ui/SearchInput.svelte'
  import Shell from '$components/ui/Shell.svelte'
  import StoredImage from '$components/ui/StoredImage.svelte'
  import Table, { type TableColumn, type TableRow } from '$components/ui/Table.svelte'
  import ToggleGroup from '$components/ui/ToggleGroup.svelte'
  import Tree, { type TreeRow } from '$components/ui/Tree.svelte'

  type Column = 'challenge' | 'name' | 'type' | 'size' | 'alignment' | 'habitat' | 'tags'

  type View = 'grid' | 'tree' | 'list'

  type Facet =
    | 'size'
    | 'habitat'
    | 'alignment'
    | 'sense'
    | 'save'
    | 'skill'
    | 'resistance'
    | 'immunity'
    | 'conditionImmunity'
    | 'vulnerability'
    | 'language'
    | 'movement'
    | 'tag'
    | 'subtype'

  type Line = {
    monster: Monster
    system: MonsterSystem
    stats: MonsterStats
    block: Block
    tags: Tag[]
    glyph: GlyphName
    homebrew: boolean
  }

  const COLUMNS: { id: Column; label: string; width: string }[] = [
    { id: 'name', label: 'Name', width: 'minmax(10em, 3fr)' },
    { id: 'challenge', label: 'CR', width: 'minmax(3em, 0.6fr)' },
    { id: 'type', label: 'Type', width: 'minmax(6em, 1.4fr)' },
    { id: 'size', label: 'Size', width: 'minmax(5em, 0.8fr)' },
    { id: 'alignment', label: 'Alignment', width: 'minmax(6em, 1.1fr)' },
    { id: 'habitat', label: 'Habitat', width: 'minmax(6em, 1.1fr)' },
    { id: 'tags', label: 'Tags', width: 'minmax(6em, 1.4fr)' }
  ]

  const LIST_COLUMNS: TableColumn[] = [
    ...COLUMNS.map((one) => ({ key: one.id, label: one.label, width: one.width, sortable: true })),
    { key: 'actions', label: '' }
  ]
  const TREE_COLUMNS: TableColumn[] = LIST_COLUMNS.filter((one) => one.key !== 'type' && one.key !== 'actions')
  const ORDERS: DropdownOption[] = COLUMNS.map((one) => ({ value: one.id, label: one.label }))

  let systems = $state<MonsterSystem[]>([])
  let monsters = $state<Monster[]>([])
  let tags = $state<Tag[]>([])
  let loading = $state(true)
  let error = $state<string | null>(null)
  let filter = $state<MonsterFilter>(getEmptyFilter())
  let advanced = $state(false)
  let inspected = $state<string[]>([])
  let sort = $state<{ by: Column; down: boolean }>({ by: 'name', down: false })
  let view = $state<View>('grid')
  let groupBy = $state<FileGroupBy>('none')
  let hidden = $state<string[]>([])

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

  const held = $derived(new Map(shown.map((line) => [line.monster.id, line])))

  const columns = $derived((view === 'tree' ? TREE_COLUMNS : LIST_COLUMNS).filter((one) => one.key === 'name' || !hidden.includes(one.key)))
  const columnOptions = $derived<DropdownOption[]>(
    (view === 'tree' ? TREE_COLUMNS : LIST_COLUMNS)
      .filter((one) => one.key !== 'actions')
      .map((one) => ({ value: one.key, label: one.label, disabled: one.key === 'name' }))
  )
  const groupings = $derived<DropdownOption[]>([
    { value: 'none', label: 'No grouping' },
    { value: 'modified', label: 'Modified' },
    { value: 'name', label: 'Name' },
    ...(usedTags.length > 0 ? [{ value: 'tag', label: 'Tag' }] : [])
  ])

  const items = $derived<FileItem[]>(
    shown.map((line) => ({
      id: line.monster.id,
      name: line.monster.name,
      kind: 'file',
      type: line.block.type,
      glyph: line.glyph,
      thumbnailUrl: line.monster.image || null,
      updatedAt: line.monster.updated_at,
      tags: line.tags.map((tag) => tag.name)
    }))
  )

  const rows = $derived<TreeRow[]>([
    ...systems.flatMap((one) =>
      one.types.flatMap((type) => {
        const kids = shown.filter((line) => line.system.id === one.id && line.monster.type === type.id)
        if (kids.length === 0) return []
        return [
          {
            id: `${one.id}/${type.id}`,
            title: type.name,
            glyph: (type.glyph ?? one.typeGlyph) as GlyphName,
            mark: String(kids.length),
            kids: kids.map(getLeaf)
          }
        ]
      })
    ),
    ...shown.filter((line) => !line.system.types.some((type) => type.id === line.monster.type)).map(getLeaf)
  ])

  const listed = $derived<TableRow[]>(shown.map((line) => ({ id: line.monster.id })))

  const challenges = $derived<MonsterEntry[]>((system?.challenges ?? []).map((one) => ({ id: String(one.value), name: one.name })))

  const basics = $derived<{ key: Facet; label: string; entries: MonsterEntry[] }[]>(
    system
      ? [
          { key: 'size', label: 'Size', entries: system.sizes },
          { key: 'habitat', label: 'Habitat', entries: system.habitats }
        ]
      : []
  )

  const facets = $derived<{ key: Facet; label: string; entries: MonsterEntry[] }[]>(
    system
      ? [
          { key: 'alignment', label: 'Alignment', entries: system.alignments },
          { key: 'sense', label: 'Senses', entries: system.senses },
          { key: 'save', label: 'Save proficiency', entries: system.abilities },
          { key: 'skill', label: 'Skill proficiency', entries: system.skills },
          { key: 'resistance', label: 'Resistance', entries: system.damageTypes },
          { key: 'immunity', label: 'Damage immunity', entries: system.damageTypes },
          { key: 'conditionImmunity', label: 'Condition immunity', entries: system.conditions },
          { key: 'vulnerability', label: 'Vulnerability', entries: system.damageTypes },
          { key: 'language', label: 'Languages', entries: system.languages },
          { key: 'movement', label: 'Movement type', entries: system.movements },
          { key: 'tag', label: 'Monster tags', entries: usedTags },
          { key: 'subtype', label: 'Monster sub-types', entries: subtypes.map((one) => ({ id: one, name: one })) }
        ]
      : []
  )

  function getLeaf(line: Line): TreeRow {
    return { id: line.monster.id, title: line.monster.name, glyph: line.glyph }
  }

  function getOptions(label: string, entries: MonsterEntry[]): DropdownOption[] {
    return [{ value: '', label }, ...entries.map((one) => ({ value: one.id, label: one.name }))]
  }

  function getMenu(_item: FileItem, defaults: FileOption[]): FileOption[] {
    return defaults.filter((option) => option.title !== 'Rename' && option.title !== 'Move')
  }

  function sortBy(by: Column) {
    sort = { by, down: sort.by === by ? !sort.down : by === 'challenge' }
  }

  function reset() {
    filter = getEmptyFilter()
  }

  function inspect(id: string) {
    inspected = inspected.includes(id) ? inspected.filter((one) => one !== id) : [...inspected, id]
  }

  function show(id: string) {
    if (held.has(id)) navigate(`/main/monsters/${id}`)
  }
</script>

{#snippet actions()}
  <IconBtn title="New monster" disabled={!system} onclick={() => navigate('/main/monsters/new')}>
    <Glyph name="add" size="md" />
  </IconBtn>
{/snippet}

{#snippet center()}
  <SearchInput value={filter.name} label="Monster name" placeholder="Search the bestiary..." onsearch={(next) => (filter.name = next)} />
{/snippet}

{#snippet tools()}
  {#if system}
    <div class="lair-kinds" role="group" aria-label="Monster types">
      <IconBtn title="All monsters" active={!filter.type} onclick={() => (filter.type = '')}>
        <Glyph name="blocks" size="md" />
      </IconBtn>
      {#each system.types as type (type.id)}
        <IconBtn
          title={type.name}
          active={filter.type === type.id}
          count={counts[type.id] || undefined}
          onclick={() => (filter.type = filter.type === type.id ? '' : type.id)}
        >
          <Glyph name={(type.glyph ?? system.typeGlyph) as GlyphName} size="md" />
        </IconBtn>
      {/each}
    </div>
    <Dropdown
      label="Challenge min"
      value={filter.challengeMin === null ? '' : String(filter.challengeMin)}
      options={getOptions('Challenge min', challenges)}
      onchange={(next) => (filter.challengeMin = next === '' ? null : Number(next))}
    />
    <Dropdown
      label="Challenge max"
      value={filter.challengeMax === null ? '' : String(filter.challengeMax)}
      options={getOptions('Challenge max', challenges)}
      onchange={(next) => (filter.challengeMax = next === '' ? null : Number(next))}
    />
    {#each basics as facet (facet.key)}
      <Dropdown label={facet.label} value={filter[facet.key]} options={getOptions(facet.label, facet.entries)} onchange={(next) => (filter[facet.key] = next)} />
    {/each}
    <IconBtn title={advanced ? 'Hide advanced filters' : 'Show advanced filters'} active={advanced} expanded={advanced} onclick={() => (advanced = !advanced)}>
      <Glyph name="slidersh" size="md" />
    </IconBtn>
    <IconBtn title="Reset all filters" disabled={!narrowed} onclick={reset}>
      <Glyph name="revert" size="md" />
    </IconBtn>
    {#if advanced}
      {#each facets as facet (facet.key)}
        <Dropdown label={facet.label} value={filter[facet.key]} options={getOptions(facet.label, facet.entries)} onchange={(next) => (filter[facet.key] = next)} />
      {/each}
      {#each system.flags as flag (flag.id)}
        <Dropdown
          label={flag.name}
          value={filter.flags[flag.id] ?? ''}
          options={getOptions(flag.name, [
            { id: 'yes', name: 'Yes' },
            { id: 'no', name: 'No' }
          ])}
          onchange={(next) => (filter.flags = { ...filter.flags, [flag.id]: next as MonsterChoice | '' })}
        />
      {/each}
      <Field id="lair-ac-min" label="Armor class" inline>
        <input id="lair-ac-min" class="lair-range" type="number" min="0" placeholder="Min" bind:value={filter.acMin} />
        <input class="lair-range" type="number" min="0" placeholder="Max" aria-label="Armor class, highest" bind:value={filter.acMax} />
      </Field>
      <Field id="lair-hp-min" label="Average hit points" inline>
        <input id="lair-hp-min" class="lair-range" type="number" min="0" placeholder="Min" bind:value={filter.hpMin} />
        <input class="lair-range" type="number" min="0" placeholder="Max" aria-label="Average hit points, highest" bind:value={filter.hpMax} />
      </Field>
    {/if}
  {/if}
{/snippet}

{#snippet views()}
  <ToggleGroup label="View">
    {#snippet actions()}
      {#if view === 'grid'}
        <Dropdown label="Sort" glyph="sort" value={sort.by} options={ORDERS} onchange={(next) => sortBy(next as Column)} />
        <IconBtn title={sort.down ? 'Descending' : 'Ascending'} onclick={() => (sort = { ...sort, down: !sort.down })}>
          <Glyph name={sort.down ? 'sortnumericdown' : 'sortnumericup'} size="sm" />
        </IconBtn>
        <Dropdown label="Group by" glyph="group" value={groupBy} options={groupings} onchange={(next) => (groupBy = next as FileGroupBy)} />
      {:else}
        <Dropdown
          label="Columns"
          glyph="table"
          values={columns.map((column) => column.key)}
          options={columnOptions}
          onpick={(picked) => (hidden = columnOptions.map((option) => option.value).filter((key) => !picked.includes(key)))}
        />
      {/if}
    {/snippet}
    <IconBtn title="Files" active={view === 'grid'} onclick={() => (view = 'grid')}>
      <Glyph name="file" size="md" />
    </IconBtn>
    <IconBtn title="Tree" active={view === 'tree'} onclick={() => (view = 'tree')}>
      <Glyph name="tree" size="md" />
    </IconBtn>
    <IconBtn title="List" active={view === 'list'} onclick={() => (view = 'list')}>
      <Glyph name="list" size="md" />
    </IconBtn>
  </ToggleGroup>
{/snippet}

{#snippet cell(key: string, row: TreeRow | TableRow)}
  {@const line = held.get(row.id)}
  {#if line}
    {#if key === 'name'}
      <span class="lair-named">
        <span class="lair-face">
          {#if line.monster.image}
            <StoredImage src={line.monster.image} alt="" />
          {:else}
            <Glyph name={line.glyph} />
          {/if}
        </span>
        <span class="lair-stack">
          <span class="lair-title">{line.monster.name}</span>
          <span class="lair-under" class:lair-under-lit={line.homebrew}>{line.homebrew ? 'Homebrew' : line.system.title}</span>
        </span>
      </span>
    {:else if key === 'challenge'}
      <span class="lair-cr">{line.block.challenge?.name ?? ''}</span>
    {:else if key === 'type'}
      <span class="lair-stack">
        <span class="lair-type">{line.block.type}</span>
        {#if line.stats.subtypes.length}<span class="lair-under">({line.stats.subtypes.join(', ')})</span>{/if}
      </span>
    {:else if key === 'size'}
      {line.block.size}
    {:else if key === 'alignment'}
      {line.block.alignment}
    {:else if key === 'habitat'}
      <span title={line.block.habitats.join(', ')}>{line.block.habitats[0] ?? ''}{line.block.habitats.length > 1 ? ' (...)' : ''}</span>
    {:else if key === 'tags'}
      <span class="lair-tags">
        {#each line.tags as tag (tag.id)}<Chip still>#{tag.name}</Chip>{/each}
      </span>
    {/if}
  {/if}
{/snippet}

{#snippet acts(row: TableRow)}
  {@const line = held.get(row.id)}
  {#if line}
    {@const open = inspected.includes(row.id)}
    <IconBtn
      title={open ? `Close ${line.monster.name}` : `Inspect ${line.monster.name}`}
      active={open}
      expanded={open}
      onclick={(event) => {
        event.stopPropagation()
        inspect(row.id)
      }}
    >
      <Glyph name={open ? 'minus' : 'add'} size="md" />
    </IconBtn>
  {/if}
{/snippet}

{#snippet detail(row: TableRow)}
  {@const line = held.get(row.id)}
  {#if line && inspected.includes(row.id)}
    <MonsterBlock system={line.system} monster={line.monster} />
  {/if}
{/snippet}

<Shell drawers title="Monsters" width="full">
  {#snippet band()}
    <PageHead
      title="Monsters"
      count={`${shown.length} of ${lines.length}`}
      description="The bestiary and your homebrew"
      {actions}
      {center}
      tools={system ? tools : undefined}
      view={views}
    />
  {/snippet}

  {#if error}
    <p class="lair-alarm" role="alert">{error}</p>
  {/if}

  <section class="lair-roll" aria-label="Monsters">
    {#if loading}
      <div class="dnd-loading" role="status" aria-label="Rousing the bestiary"><span class="dnd-spinner"></span></div>
    {:else if lines.length === 0}
      <div class="dnd-empty">
        <span class="dnd-empty-mark"><Ornament name="skull" size="sm" tone="metal" /></span>
        <p class="lair-note">No monster stirs here yet. Make one: it stays your own homebrew until you share it.</p>
      </div>
    {:else if shown.length === 0}
      <div class="dnd-empty">
        <p class="lair-note">Nothing in the bestiary answers to these filters.</p>
        <Button variant="ghost" size="sm" onclick={reset}>Reset all filters</Button>
      </div>
    {:else if view === 'grid'}
      <FileExplorer
        {items}
        {groupBy}
        showAdd={Boolean(system)}
        addLabel="New monster"
        showTags={items.some((one) => (one.tags ?? []).length > 0)}
        itemOptions={getMenu}
        onadd={() => navigate('/main/monsters/new')}
        onopen={(item) => show(item.id)}
      />
    {:else if view === 'tree'}
      <Tree
        {rows}
        {columns}
        manualSort
        sortKey={sort.by}
        sortDir={sort.down ? 'desc' : 'asc'}
        onsort={(next) => sortBy(next.key as Column)}
        onopen={show}
        {cell}
      />
    {:else}
      <Table
        {columns}
        rows={listed}
        manualSort
        sortKey={sort.by}
        sortDir={sort.down ? 'desc' : 'asc'}
        onsort={(next) => sortBy(next.key as Column)}
        onrow={(row) => show(row.id)}
        {cell}
        actions={acts}
        {detail}
      />
    {/if}
  </section>
</Shell>

<style>
  .lair-kinds {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-1);
    min-width: 0;
  }

  .lair-range + .lair-range {
    margin-inline-start: var(--space-2);
  }

  .lair-note {
    margin: 0;
  }

  .lair-roll {
    --lair-face-size: calc(var(--space-7) - var(--space-1));
    display: grid;
    gap: var(--space-5);
    min-width: 0;
  }

  .lair-named {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    min-width: 0;
    padding-block: var(--space-1);
  }

  .lair-stack {
    display: flex;
    flex-direction: column;
    gap: var(--space-0);
    min-width: 0;
  }

  .lair-tags {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-1);
    min-width: 0;
  }

  .lair-title {
    font-family: var(--font-display);
    font-size: var(--text-md);
    font-weight: 700;
    letter-spacing: var(--tracking-wide);
    color: var(--ink);
    text-shadow: 0 1px 0 var(--shadow-ink);
    overflow-wrap: anywhere;
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

  .lair-face {
    display: flex;
    flex: none;
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
</style>
