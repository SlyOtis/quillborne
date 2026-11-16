<script lang="ts" module>
  import { getContext, setContext } from 'svelte'
  import type { Campaign, Owner } from '$lib/api/types'
  import type { Mention, Reference } from '$lib/blocks'
  import type { Resource } from '$lib/resources'
  import type { TreeRow } from '$components/ui/Tree.svelte'
  import type { TableColumn } from '$components/ui/Table.svelte'
  import type { FileGroupBy } from '$components/ui/FileExplorer.svelte'

  export type View = 'grid' | 'tree' | 'list'
  export type Mode = 'edit' | 'read'

  export type Scribe = {
    table: { pages: Resource[]; loading: boolean; saving: boolean }
    readonly campaign: Campaign | null
    readonly owner: Owner | null
    readonly open: Resource | null
    readonly mode: Mode
    readonly view: View
    readonly shown: Resource[]
    readonly roots: Resource[]
    readonly rows: TreeRow[]
    readonly columns: TableColumn[]
    readonly groupBy: FileGroupBy
    show: (id: string, mode?: Mode) => void
    postPage: (parentId?: string | null) => Promise<void>
    putPage: (held: Resource) => void
    countKids: (one: Resource) => number
    parentOf: (one: Resource) => Resource | null
    written: (one: Resource) => string
    loreOf: (one: Resource) => string
    seek: (mark: '@' | '#', query: string) => Promise<Mention[]>
    follow: (reference: Reference) => void
  }

  const KEY = Symbol('scribe')

  export function getScribe(): Scribe {
    return getContext<Scribe>(KEY)
  }

  let held: { key: string; pages: Resource[] } = { key: '', pages: [] }
</script>

<script lang="ts">
  import { onMount } from 'svelte'
  import { navigate, resolvedRoute, Router, type Routes } from 'sly-svelte-location-router'
  import { getCampaigns } from '$lib/api'
  import { getAll, getChildren, getRoots, getTrail, postOne, putOne } from '$lib/resources'
  import { currentCampaignId, userCampaigns } from '$lib/stores/campaign.store'
  import { user } from '$lib/stores/auth.store'
  import { postNotice } from '$lib/stores/ui.store'
  import Shell from '$components/ui/Shell.svelte'
  import PageHead, { type Crumb } from '$components/ui/PageHead.svelte'
  import PageTab, { type PageTabItem } from '$components/ui/PageTab.svelte'
  import IconBtn from '$components/ui/IconBtn.svelte'
  import Glyph from '$components/ui/Glyph.svelte'
  import SearchInput from '$components/ui/SearchInput.svelte'
  import ToggleGroup from '$components/ui/ToggleGroup.svelte'
  import Dropdown, { type DropdownOption } from '$components/ui/Dropdown.svelte'

  const SAVE_DELAY = 600
  const HOME = '/main/scribe'
  const CRUMB_SCRIBE = 'scribe'
  const GROUPS: FileGroupBy[] = ['kind', 'type', 'modified', 'name', 'tag']
  const ORDERS: DropdownOption[] = [
    { value: 'title', label: 'Name' },
    { value: 'written', label: 'Written' }
  ]
  const TREE_COLUMNS: TableColumn[] = [
    { key: 'title', label: 'Title', width: 'minmax(10em, 4fr)', sortable: true },
    { key: 'tags', label: 'Tags', width: 'minmax(6em, 2fr)', kind: 'tags' },
    { key: 'written', label: 'Written', width: 'minmax(6em, 1fr)', sortable: true }
  ]
  const LIST_COLUMNS: TableColumn[] = [
    { key: 'title', label: 'Title', width: 'minmax(10em, 4fr)', sortable: true },
    { key: 'tags', label: 'Tags', width: 'minmax(6em, 2fr)', kind: 'tags', sortable: true },
    { key: 'under', label: 'Under', width: 'minmax(6em, 2fr)', sortable: true },
    { key: 'written', label: 'Written', width: 'minmax(6em, 1fr)', sortable: true },
    { key: 'actions', label: '' }
  ]

  const routes: Routes = {
    '/': { name: 'scribe-pages', component: () => import('./scribe/ScribeListPage.svelte') },
    '/:page': { name: 'scribe-page', component: () => import('./scribe/ScribeEntryPage.svelte') },
    '/:page/edit': { name: 'scribe-page-edit', component: () => import('./scribe/ScribeEntryPage.svelte') }
  }

  let ready = $state(false)
  const campaign = $derived($userCampaigns.find((one) => one.id === $currentCampaignId) ?? $userCampaigns[0] ?? null)
  const owner = $derived<Owner | null>(
    !ready ? null : campaign ? { at: 'campaign', id: campaign.id } : $user ? { at: 'user', id: $user.user_id } : null
  )

  const steps = $derived($resolvedRoute.path.split('/').filter(Boolean).slice(2))
  const openId = $derived(steps[0] ?? '')
  const mode = $derived<Mode>(steps[1] === 'edit' ? 'edit' : 'read')
  const query = $derived(new URLSearchParams($resolvedRoute.search ?? ''))
  const view = $derived<View>(query.get('view') === 'tree' || query.get('view') === 'list' ? (query.get('view') as View) : 'grid')
  const order = $derived(query.get('order') === 'written' ? 'written' : 'title')
  const descending = $derived(query.get('desc') === '1')
  const groupBy = $derived<FileGroupBy>(GROUPS.find((one) => one === query.get('by')) ?? 'none')
  const hidden = $derived((query.get('hide') ?? '').split(',').filter(Boolean))
  const columns = $derived((view === 'tree' ? TREE_COLUMNS : LIST_COLUMNS).filter((column) => column.key === 'title' || !hidden.includes(column.key)))
  const columnOptions = $derived<DropdownOption[]>(
    (view === 'tree' ? TREE_COLUMNS : LIST_COLUMNS).filter((column) => column.key !== 'actions').map((column) => ({ value: column.key, label: column.label, disabled: column.key === 'title' }))
  )
  const picked = $derived((query.get('tags') ?? '').split(',').filter(Boolean))

  const table = $state<Scribe['table']>({ pages: held.pages, loading: held.key === '', saving: false })
  let hunt = $state(new URLSearchParams($resolvedRoute.search ?? '').get('q') ?? '')
  let huntTimer: ReturnType<typeof setTimeout> | undefined
  let loadedFor = ''

  function put(changes: Record<string, string | null>) {
    const next = new URLSearchParams($resolvedRoute.search ?? '')
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value)
      else next.delete(key)
    }
    const search = next.toString()
    navigate(`${$resolvedRoute.path}${search ? `?${search}` : ''}`)
  }

  function show(id: string, next: Mode = 'read') {
    const path = id ? `${HOME}/${id}${next === 'edit' ? '/edit' : ''}` : HOME
    if (path === $resolvedRoute.path) return
    navigate(`${path}${$resolvedRoute.search ?? ''}`)
  }

  function seekPages(text: string) {
    hunt = text
    clearTimeout(huntTimer)
    huntTimer = setTimeout(() => {
      if (text !== (query.get('q') ?? '')) put({ q: text || null })
    }, SAVE_DELAY)
  }

  const open = $derived(table.pages.find((one) => one.id === openId) ?? null)
  const trail = $derived(open ? getTrail(table.pages, open.id).filter((step) => step.id !== open.id) : [])
  const wanted = $derived(hunt.trim().toLowerCase())
  const sifting = $derived(Boolean(wanted) || picked.length > 0)
  const allTags = $derived([...new Set(table.pages.flatMap((one) => one.tags))].sort())
  const groupings = $derived<DropdownOption[]>([
    { value: 'none', label: 'No grouping' },
    { value: 'kind', label: 'Kind' },
    { value: 'type', label: 'Type' },
    { value: 'modified', label: 'Modified' },
    { value: 'name', label: 'Name' },
    ...(allTags.length > 0 ? [{ value: 'tag', label: 'Tag' }] : [])
  ])
  const shown = $derived(sort(table.pages.filter(keep)))
  const roots = $derived(sifting ? shown : sort(getRoots(table.pages)))
  const rows = $derived(roots.map(limb))

  const crumbs = $derived<Crumb[]>([
    { id: '', title: campaign ? campaign.name : 'Your own' },
    ...(open ? [{ id: CRUMB_SCRIBE, title: 'Scribe' }, ...trail.map((step) => ({ id: step.id, title: step.title }))] : [])
  ])

  const strip = $derived.by(() => {
    if (!open) return null
    const kids = sort(getChildren(table.pages, open.id))
    if (kids.length > 0) return { main: open, kids }
    const above = parentOf(open)
    return above ? { main: above, kids: sort(getChildren(table.pages, above.id)) } : null
  })
  const tabs = $derived<PageTabItem[]>(
    strip ? [{ id: strip.main.id, label: 'Main' }, ...strip.kids.map((one) => ({ id: one.id, label: one.title }))] : []
  )

  function keep(one: Resource): boolean {
    return one.title.toLowerCase().includes(wanted) && picked.every((tag) => one.tags.includes(tag))
  }

  function sort(pages: Resource[]): Resource[] {
    return [...pages].sort((a, b) => {
      const value =
        order === 'title'
          ? a.title.localeCompare(b.title)
          : String(a.created_at ?? '').localeCompare(String(b.created_at ?? ''))
      return descending ? -value : value
    })
  }

  function limb(row: Resource): TreeRow {
    const kids = sifting ? [] : sort(getChildren(table.pages, row.id)).map(limb)
    return {
      id: row.id,
      title: row.title,
      mark: kids.length > 0 ? String(kids.length) : undefined,
      glyph: 'scroll',
      kids,
      tags: row.tags,
      under: parentOf(row)?.title ?? '',
      written: written(row)
    }
  }

  function countKids(one: Resource): number {
    return getChildren(table.pages, one.id).length
  }

  function parentOf(one: Resource): Resource | null {
    return table.pages.find((other) => other.id === one.parent_id) ?? null
  }

  function written(one: Resource): string {
    return one.created_at ? one.created_at.slice(0, 10) : ''
  }

  function loreOf(one: Resource): string {
    return `${campaign ? `/main/campaign/${campaign.id}` : '/main'}/entries/${one.id}`
  }

  function putPage(next: Resource) {
    table.pages = table.pages.map((one) => (one.id === next.id ? next : one))
    held = { ...held, pages: table.pages }
  }

  function openCrumb(id: string) {
    if (id === '') {
      navigate(campaign ? `/main/campaign/${campaign.id}` : '/main')
      return
    }
    show(id === CRUMB_SCRIBE ? '' : id)
  }

  async function getTable() {
    try {
      if ($userCampaigns.length === 0) userCampaigns.set(await getCampaigns())
    } catch (reason) {
      postNotice(reason instanceof Error ? reason.message : String(reason))
    } finally {
      ready = true
    }
  }

  async function getPages() {
    if (!owner) return
    const key = `${owner.at}/${owner.id}`
    if (key === loadedFor) return
    loadedFor = key
    if (held.key === key) {
      table.pages = held.pages
      table.loading = false
    } else {
      table.loading = true
    }
    try {
      const pages = await getAll(owner, 'entries')
      held = { key, pages }
      table.pages = pages
      if (openId && !pages.some((one) => one.id === openId)) show('')
    } catch (reason) {
      postNotice(reason instanceof Error ? reason.message : String(reason))
    } finally {
      table.loading = false
    }
  }

  $effect(() => {
    void getPages()
  })

  async function postPage(parentId: string | null = open?.id ?? null) {
    if (!owner) return
    try {
      const id = await postOne(owner, 'entries', { title: 'Untitled', content: '', parent_id: parentId })
      loadedFor = ''
      await getPages()
      show(id, 'edit')
    } catch (reason) {
      postNotice(reason instanceof Error ? reason.message : String(reason))
    }
  }

  function putTitle(event: Event) {
    const title = (event.currentTarget as HTMLInputElement).value.trim()
    if (!open || !owner || !title || open.title === title) return
    const next = { ...open, title }
    putPage(next)
    void putOne(owner, 'entries', open.id, next).catch((reason) => postNotice(reason instanceof Error ? reason.message : String(reason)))
  }

  function follow(reference: Reference) {
    if (reference.mark === '#') {
      const next = new URLSearchParams($resolvedRoute.search ?? '')
      next.set('tags', reference.label)
      navigate(`${HOME}?${next.toString()}`)
      return
    }
    if (reference.id) {
      show(reference.id)
      return
    }
    const named = reference.label.toLowerCase()
    const here = table.pages.find((one) => one.title.replace(/\s+/g, '').toLowerCase() === named)
    if (here) show(here.id)
  }

  async function seek(mark: '@' | '#', text: string): Promise<Mention[]> {
    const named = text.toLowerCase()
    if (mark === '#') return allTags.filter((tag) => tag.toLowerCase().includes(named)).map((tag) => ({ id: tag, label: tag }))
    return table.pages
      .filter((one) => one.title.toLowerCase().includes(named))
      .map((one) => ({ id: one.id, label: one.title.replace(/\s+/g, '') }))
  }

  setContext<Scribe>(KEY, {
    table,
    get campaign() {
      return campaign
    },
    get owner() {
      return owner
    },
    get open() {
      return open
    },
    get mode() {
      return mode
    },
    get view() {
      return view
    },
    get shown() {
      return shown
    },
    get roots() {
      return roots
    },
    get rows() {
      return rows
    },
    get columns() {
      return columns
    },
    get groupBy() {
      return groupBy
    },
    show,
    postPage,
    putPage,
    countKids,
    parentOf,
    written,
    loreOf,
    seek,
    follow
  })

  onMount(() => {
    void getTable()
    return () => clearTimeout(huntTimer)
  })
</script>

{#snippet backdrop()}
  <span class="scribe-ground"></span>
{/snippet}

{#snippet heading()}
  {#if open}
    <input class="dnd-heading dnd-heading-hero scribe-title" type="text" value={open.title} placeholder="Name it" aria-label="Page title" onchange={putTitle} />
  {/if}
{/snippet}

{#snippet actions()}
  {#if table.saving}<span class="dnd-spinner scribe-saving"></span>{/if}
  {#if open}
    <ToggleGroup label="Mode">
      <IconBtn title="Edit" active={mode === 'edit'} onclick={() => show(open.id, 'edit')}>
        <Glyph name="edit" size="md" />
      </IconBtn>
      <IconBtn title="Read" active={mode === 'read'} onclick={() => show(open.id, 'read')}>
        <Glyph name="reveal" size="md" />
      </IconBtn>
    </ToggleGroup>
  {/if}
  <IconBtn title={open ? `New page under ${open.title}` : 'New page'} onclick={() => postPage()}>
    <Glyph name="add" size="md" />
  </IconBtn>
{/snippet}

{#snippet center()}
  <SearchInput
    value={hunt}
    tags={picked}
    options={allTags}
    placeholder="Search the pages..."
    autofocus={Boolean(hunt)}
    onsearch={seekPages}
    ontags={(next) => put({ tags: next.join(',') || null })}
  />
{/snippet}

{#snippet views()}
  <ToggleGroup label="View">
    {#snippet actions()}
      {#if view === 'grid'}
        <Dropdown label="Sort" glyph="sort" value={order} options={ORDERS} onchange={(next) => put({ order: next === 'title' ? null : next })} />
        <IconBtn title={descending ? 'Descending' : 'Ascending'} onclick={() => put({ desc: descending ? null : '1' })}>
          <Glyph name={descending ? 'sortnumericdown' : 'sortnumericup'} size="sm" />
        </IconBtn>
        <Dropdown label="Group by" glyph="group" value={groupBy} options={groupings} onchange={(next) => put({ by: next === 'none' ? null : next })} />
      {/if}
      {#if view !== 'grid'}
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

{#snippet bottom()}
  {#if strip}
    <PageTab {tabs} value={openId} addLabel="New page under {strip.main.title}" onchange={show} onadd={() => postPage(strip?.main.id ?? null)} />
  {/if}
{/snippet}

<Shell drawers title="Scribe" width="full" {backdrop}>
  {#snippet band()}
    <PageHead
      title="Scribe"
      count={open ? undefined : shown.length}
      {crumbs}
      oncrumb={openCrumb}
      heading={open ? heading : undefined}
      {actions}
      center={open ? undefined : center}
      view={open ? undefined : views}
      bottom={open && strip ? bottom : undefined}
    />
  {/snippet}

  <div class="scribe">
    <Router {routes} fallback={() => import('./NotFoundPage.svelte')}>
      <div class="dnd-loading"><span class="dnd-spinner"></span></div>
    </Router>
  </div>
</Shell>

<style>
  .scribe-ground {
    position: absolute;
    inset: 0;
    background: var(--ground);
  }

  .scribe {
    display: grid;
    gap: var(--space-5);
    min-width: 0;
  }

  .scribe-title {
    min-width: 0;
    inline-size: 100%;
    padding: 0;
    border: none;
    border-radius: 0;
    background: transparent;
    box-shadow: none;
  }

  .scribe-title:focus {
    outline: none;
    box-shadow: inset 0 calc(var(--border-hair) * -1) 0 var(--metal);
  }

  .scribe-saving {
    flex: none;
    width: var(--space-5);
    height: var(--space-5);
  }
</style>
