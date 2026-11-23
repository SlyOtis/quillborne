<script lang="ts" module>
  type Kept = {
    key: string
    systems: import('$lib/rules/monster.types').MonsterSystem[]
    monsters: import('$lib/api/types').Monster[]
    tags: import('$lib/api/types').Tag[]
    sources: import('$lib/rules/monster.types').MonsterSource[]
    campaigns: import('$lib/api/types').Campaign[]
  }

  let kept: Kept = { key: '', systems: [], monsters: [], tags: [], sources: [], campaigns: [] }
</script>

<script lang="ts">
  import { getCampaigns, getMonsters, getObjectTags } from '$lib/api'
  import { OBJECT_TYPE_MONSTER, type Campaign, type Monster, type Tag } from '$lib/api/types'
  import { getTheme, setTheme } from '$lib/dialogs/theme'
  import { getEmptyFilter, getMonsterBlock, getMonsterOrigins, getMonsterSources, getMonsterStats, getMonsterSystems, HOMEBREW, isMonsterShown, MINE } from '$lib/rules/monster'
  import type { MonsterBlock as Block, MonsterEntry, MonsterFilter, MonsterSource, MonsterStats, MonsterSystem } from '$lib/rules/monster.types'
  import { user } from '$lib/stores/auth.store'
  import { onDestroy, onMount } from 'svelte'
  import { get } from 'svelte/store'
  import { navigate, resolvedRoute } from 'sly-svelte-location-router'
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
    | 'source'

  const FACETS: Facet[] = [
    'size',
    'habitat',
    'alignment',
    'sense',
    'save',
    'skill',
    'resistance',
    'immunity',
    'conditionImmunity',
    'vulnerability',
    'language',
    'movement',
    'tag',
    'subtype',
    'source'
  ]

  type Line = {
    id: string
    monster: Pick<Monster, 'name' | 'size' | 'type' | 'alignment' | 'challenge' | 'stats' | 'image' | 'updated_at'>
    system: MonsterSystem
    stats: MonsterStats
    block: Block
    tags: Tag[]
    glyph: GlyphName
    origins: string[]
    under: string
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

  const GROUPS: FileGroupBy[] = ['modified', 'name', 'tag']
  const HOME = '/main/monsters'
  const SAVE_DELAY = 600

  let systems = $state<MonsterSystem[]>(kept.systems)
  let monsters = $state<Monster[]>(kept.monsters)
  let tags = $state<Tag[]>(kept.tags)
  let sources = $state<MonsterSource[]>(kept.sources)
  let campaigns = $state<Campaign[]>(kept.campaigns)
  let loading = $state(kept.key === '')
  let error = $state<string | null>(null)
  let hunt = $state(new URLSearchParams($resolvedRoute.search ?? '').get('q') ?? '')
  let huntTimer: ReturnType<typeof setTimeout> | undefined

  onMount(() => setTheme(getTheme()))

  onDestroy(() => {
    clearTimeout(huntTimer)
    if (get(resolvedRoute).path !== HOME) kept = { key: '', systems: [], monsters: [], tags: [], sources: [], campaigns: [] }
  })

  $effect(() => {
    if (!$user) return
    const key = $user.user_id
    if (kept.key === key) return
    let live = true
    loading = true
    Promise.all([getMonsterSystems(), getMonsters(), getObjectTags(OBJECT_TYPE_MONSTER), getMonsterSources(), getCampaigns()])
      .then(([loadedSystems, loadedMonsters, loadedTags, loadedSources, loadedCampaigns]) => {
        if (!live) return
        kept = { key, systems: loadedSystems, monsters: loadedMonsters, tags: loadedTags, sources: loadedSources, campaigns: loadedCampaigns }
        systems = loadedSystems
        monsters = loadedMonsters
        tags = loadedTags
        sources = loadedSources
        campaigns = loadedCampaigns
      })
      .catch((reason) => live && (error = reason instanceof Error ? reason.message : String(reason)))
      .finally(() => live && (loading = false))
    return () => {
      live = false
    }
  })

  const system = $derived(systems[0] ?? null)

  const query = $derived(new URLSearchParams($resolvedRoute.search ?? ''))
  const view = $derived<View>(query.get('view') === 'tree' || query.get('view') === 'list' ? (query.get('view') as View) : 'grid')
  const sort = $derived<{ by: Column; down: boolean }>({
    by: COLUMNS.find((one) => one.id === query.get('order'))?.id ?? 'name',
    down: query.get('desc') === '1'
  })
  const groupBy = $derived<FileGroupBy>(GROUPS.find((one) => one === query.get('by')) ?? 'none')
  const hidden = $derived((query.get('hide') ?? '').split(',').filter(Boolean))
  const advanced = $derived(query.get('advanced') === '1')
  const inspected = $derived((query.get('inspect') ?? '').split(',').filter(Boolean))

  const filter = $derived<MonsterFilter>({
    ...getEmptyFilter(),
    ...Object.fromEntries(FACETS.map((key) => [key, query.get(key) ?? ''])),
    name: hunt,
    type: query.get('type') ?? '',
    challengeMin: getFigure('challengeMin'),
    challengeMax: getFigure('challengeMax'),
    acMin: getFigure('acMin'),
    acMax: getFigure('acMax'),
    hpMin: getFigure('hpMin'),
    hpMax: getFigure('hpMax'),
    flags: Object.fromEntries(
      (system?.flags ?? []).flatMap((flag) => {
        const choice = query.get(`flag.${flag.id}`)
        return choice === 'yes' || choice === 'no' ? [[flag.id, choice]] : []
      })
    )
  })

  function getFigure(key: string): number | null {
    const held = query.get(key)
    return held === null || held === '' || Number.isNaN(Number(held)) ? null : Number(held)
  }

  function put(changes: Record<string, string | null>) {
    const next = new URLSearchParams($resolvedRoute.search ?? '')
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value)
      else next.delete(key)
    }
    const search = next.toString()
    navigate(`${HOME}${search ? `?${search}` : ''}`)
  }

  function seek(text: string) {
    hunt = text
    clearTimeout(huntTimer)
    huntTimer = setTimeout(() => {
      if (text !== (query.get('q') ?? '')) put({ q: text || null })
    }, SAVE_DELAY)
  }

  const campaignIds = $derived(campaigns.map((one) => one.id))

  const lines = $derived<Line[]>([
    ...sources.flatMap((source) => {
      const held = systems.find((one) => one.id === source.system)
      if (!held) return []
      return source.monsters.map((entry) => {
        const monster = { ...entry, stats: getMonsterStats(held, entry.stats), image: '', updated_at: '' }
        return {
          id: entry.slug,
          monster,
          system: held,
          stats: monster.stats,
          block: getMonsterBlock(held, monster),
          tags: [],
          glyph: (held.types.find((one) => one.id === entry.type)?.glyph ?? held.typeGlyph) as GlyphName,
          origins: [source.id],
          under: source.title,
          homebrew: false
        }
      })
    }),
    ...monsters.flatMap((monster) => {
      const held = systems.find((one) => one.id === monster.system)
      if (!held) return []
      const origins = getMonsterOrigins(monster, $user?.user_id ?? '', campaignIds)
      const homebrew = monster.user_id === $user?.user_id && !monster.is_public && origins.includes(HOMEBREW)
      return [
        {
          id: monster.id,
          monster,
          system: held,
          stats: getMonsterStats(held, monster.stats),
          block: getMonsterBlock(held, monster),
          tags: tags.filter((tag) => tag.object_ids?.includes(monster.id)),
          glyph: (held.types.find((one) => one.id === monster.type)?.glyph ?? held.typeGlyph) as GlyphName,
          origins,
          under: homebrew ? held.labels.homebrew : (campaigns.find((one) => one.id === monster.owner_id)?.name ?? held.title),
          homebrew
        }
      ]
    })
  ])

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
      .filter((line) => isMonsterShown(line.monster, line.stats, line.block, line.tags.map((tag) => tag.id), line.origins, filter))
      .sort((a, b) => {
        const left = getKey(a, sort.by)
        const right = getKey(b, sort.by)
        const order = typeof left === 'number' && typeof right === 'number' ? left - right : String(left).localeCompare(String(right))
        return (sort.down ? -order : order) || a.monster.name.localeCompare(b.monster.name)
      })
  )

  const narrowed = $derived(JSON.stringify(filter) !== JSON.stringify(getEmptyFilter()))

  const held = $derived(new Map(shown.map((line) => [line.id, line])))

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
      id: line.id,
      name: line.monster.name,
      kind: 'file',
      type: line.block.type,
      glyph: line.glyph,
      thumbnailUrl: line.monster.image || null,
      updatedAt: line.monster.updated_at || undefined,
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

  const listed = $derived<TableRow[]>(shown.map((line) => ({ id: line.id })))

  const challenges = $derived<MonsterEntry[]>((system?.challenges ?? []).map((one) => ({ id: String(one.value), name: one.name })))

  const basics = $derived<{ key: Facet; label: string; entries: MonsterEntry[] }[]>(
    system
      ? [
          { key: 'size', label: 'Size', entries: system.sizes },
          { key: 'habitat', label: 'Habitat', entries: system.habitats },
          {
            key: 'source',
            label: system.labels.source,
            entries: [
              ...sources.map((one) => ({ id: one.id, name: one.title })),
              { id: HOMEBREW, name: system.labels.homebrew },
              { id: MINE, name: system.labels.mine },
              ...campaigns.map((one) => ({ id: one.id, name: one.name }))
            ]
          }
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
    return { id: line.id, title: line.monster.name, glyph: line.glyph }
  }

  function getOptions(label: string, entries: MonsterEntry[]): DropdownOption[] {
    return [{ value: '', label }, ...entries.map((one) => ({ value: one.id, label: one.name }))]
  }

  function getMenu(_item: FileItem, defaults: FileOption[]): FileOption[] {
    return defaults.filter((option) => option.title !== 'Rename' && option.title !== 'Move')
  }

  function sortBy(by: Column) {
    const down = sort.by === by ? !sort.down : by === 'challenge'
    put({ order: by === 'name' ? null : by, desc: down ? '1' : null })
  }

  function reset() {
    clearTimeout(huntTimer)
    hunt = ''
    put(
      Object.fromEntries(
        ['q', 'type', 'challengeMin', 'challengeMax', 'acMin', 'acMax', 'hpMin', 'hpMax', ...FACETS, ...(system?.flags ?? []).map((flag) => `flag.${flag.id}`)].map(
          (key) => [key, null]
        )
      )
    )
  }

  function inspect(id: string) {
    put({ inspect: (inspected.includes(id) ? inspected.filter((one) => one !== id) : [...inspected, id]).join(',') || null })
  }

  function show(id: string) {
    if (held.has(id)) navigate(`${HOME}/${id}`)
  }
</script>

{#snippet actions()}
  <IconBtn title="New monster" disabled={!system} onclick={() => navigate(`${HOME}/new`)}>
    <Glyph name="add" size="md" />
  </IconBtn>
{/snippet}

{#snippet center()}
  <SearchInput value={hunt} label="Monster name" placeholder="Search the bestiary..." autofocus={Boolean(hunt)} onsearch={seek} />
{/snippet}

{#snippet tools()}
  {#if system}
    <div class="lair-kinds" role="group" aria-label="Monster types">
      <IconBtn title="All monsters" active={!filter.type} onclick={() => put({ type: null })}>
        <Glyph name="blocks" size="md" />
      </IconBtn>
      {#each system.types as type (type.id)}
        <IconBtn
          title={type.name}
          active={filter.type === type.id}
          count={counts[type.id] || undefined}
          onclick={() => put({ type: filter.type === type.id ? null : type.id })}
        >
          <Glyph name={(type.glyph ?? system.typeGlyph) as GlyphName} size="md" />
        </IconBtn>
      {/each}
    </div>
    <Dropdown
      label="Challenge min"
      value={filter.challengeMin === null ? '' : String(filter.challengeMin)}
      options={getOptions('Challenge min', challenges)}
      onchange={(next) => put({ challengeMin: next || null })}
    />
    <Dropdown
      label="Challenge max"
      value={filter.challengeMax === null ? '' : String(filter.challengeMax)}
      options={getOptions('Challenge max', challenges)}
      onchange={(next) => put({ challengeMax: next || null })}
    />
    {#each basics as facet (facet.key)}
      <Dropdown label={facet.label} value={filter[facet.key]} options={getOptions(facet.label, facet.entries)} onchange={(next) => put({ [facet.key]: next || null })} />
    {/each}
    <IconBtn title={advanced ? 'Hide advanced filters' : 'Show advanced filters'} active={advanced} expanded={advanced} onclick={() => put({ advanced: advanced ? null : '1' })}>
      <Glyph name="slidersh" size="md" />
    </IconBtn>
    <IconBtn title="Reset all filters" disabled={!narrowed} onclick={reset}>
      <Glyph name="revert" size="md" />
    </IconBtn>
    {#if advanced}
      {#each facets as facet (facet.key)}
        <Dropdown label={facet.label} value={filter[facet.key]} options={getOptions(facet.label, facet.entries)} onchange={(next) => put({ [facet.key]: next || null })} />
      {/each}
      {#each system.flags as flag (flag.id)}
        <Dropdown
          label={flag.name}
          value={filter.flags[flag.id] ?? ''}
          options={getOptions(flag.name, [
            { id: 'yes', name: 'Yes' },
            { id: 'no', name: 'No' }
          ])}
          onchange={(next) => put({ [`flag.${flag.id}`]: next || null })}
        />
      {/each}
      <Field id="lair-ac-min" label="Armor class" inline>
        <input id="lair-ac-min" class="lair-range" type="number" min="0" placeholder="Min" value={filter.acMin} onchange={(event) => put({ acMin: event.currentTarget.value || null })} />
        <input class="lair-range" type="number" min="0" placeholder="Max" aria-label="Armor class, highest" value={filter.acMax} onchange={(event) => put({ acMax: event.currentTarget.value || null })} />
      </Field>
      <Field id="lair-hp-min" label="Average hit points" inline>
        <input id="lair-hp-min" class="lair-range" type="number" min="0" placeholder="Min" value={filter.hpMin} onchange={(event) => put({ hpMin: event.currentTarget.value || null })} />
        <input class="lair-range" type="number" min="0" placeholder="Max" aria-label="Average hit points, highest" value={filter.hpMax} onchange={(event) => put({ hpMax: event.currentTarget.value || null })} />
      </Field>
    {/if}
  {/if}
{/snippet}

{#snippet views()}
  <ToggleGroup label="View">
    {#snippet actions()}
      {#if view === 'grid'}
        <Dropdown label="Sort" glyph="sort" value={sort.by} options={ORDERS} onchange={(next) => sortBy(next as Column)} />
        <IconBtn title={sort.down ? 'Descending' : 'Ascending'} onclick={() => put({ desc: sort.down ? null : '1' })}>
          <Glyph name={sort.down ? 'sortnumericdown' : 'sortnumericup'} size="sm" />
        </IconBtn>
        <Dropdown label="Group by" glyph="group" value={groupBy} options={groupings} onchange={(next) => put({ by: next === 'none' ? null : next })} />
      {:else}
        <Dropdown
          label="Columns"
          glyph="table"
          values={columns.map((column) => column.key)}
          options={columnOptions}
          onpick={(picked) => put({ hide: columnOptions.map((option) => option.value).filter((key) => !picked.includes(key)).join(',') || null })}
        />
      {/if}
    {/snippet}
    <IconBtn title="Files" active={view === 'grid'} onclick={() => put({ view: null })}>
      <Glyph name="file" size="md" />
    </IconBtn>
    <IconBtn title="Tree" active={view === 'tree'} onclick={() => put({ view: 'tree' })}>
      <Glyph name="tree" size="md" />
    </IconBtn>
    <IconBtn title="List" active={view === 'list'} onclick={() => put({ view: 'list' })}>
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
          <a class="lair-title" href="{HOME}/{line.id}">{line.monster.name}</a>
          <span class="lair-under" class:lair-under-lit={line.homebrew}>{line.under}</span>
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

{#snippet expanded(row: TableRow)}
  {@const line = held.get(row.id)}
  {#if line}
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
        onadd={() => navigate(`${HOME}/new`)}
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
        onrow={(row, event) => !(event.target as HTMLElement).closest('a') && show(row.id)}
        {cell}
        actions={acts}
        expandedRowKeys={new Set(inspected)}
        rowExpanded={expanded}
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
    text-decoration: none;
    text-shadow: 0 1px 0 var(--shadow-ink);
    overflow-wrap: anywhere;
  }

  .lair-title:focus-visible {
    outline: none;
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
