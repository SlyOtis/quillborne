<script lang="ts">
  import { onMount } from 'svelte'
  import { navigate, resolvedRoute } from 'sly-svelte-location-router'
  import { getAssets, getAssetTab, getCampaigns, postFile, postResource, putResource } from '$lib/api'
  import type { MediaAsset, MediaKind, Mention, Reference } from '$lib/blocks'
  import { getAll, getChildren, getRoots, getTrail, type Resource } from '$lib/resources'
  import { currentCampaignId, userCampaigns } from '$lib/stores/campaign.store'
  import { user } from '$lib/stores/auth.store'
  import { postNotice } from '$lib/stores/ui.store'
  import Shell from '$components/ui/Shell.svelte'
  import Tree, { type TreeRow } from '$components/ui/Tree.svelte'
  import Row from '$components/ui/Row.svelte'
  import Card from '$components/ui/Card.svelte'
  import Chip from '$components/ui/Chip.svelte'
  import IconBtn from '$components/ui/IconBtn.svelte'
  import Button from '$components/ui/Button.svelte'
  import Glyph from '$components/ui/Glyph.svelte'
  import PageTab, { type PageTabItem } from '$components/ui/PageTab.svelte'
  import SearchInput from '$components/ui/SearchInput.svelte'
  import ToggleGroup from '$components/ui/ToggleGroup.svelte'
  import BlockEditor from '$components/ui/BlockEditor.svelte'
  import BlockReader from '$components/ui/BlockReader.svelte'
  import MediaDialog from '$components/MediaDialog.svelte'

  const SAVE_DELAY = 600

  type View = 'grid' | 'tree' | 'list'
  type Order = 'title' | 'written'
  type Mode = 'edit' | 'read'
  type Shelf = { title: string; kids: Resource[] }

  let ready = $state(false)
  const campaign = $derived($userCampaigns.find((one) => one.id === $currentCampaignId) ?? $userCampaigns[0] ?? null)
  const owner = $derived(
    !ready ? null : campaign ? { at: 'campaign' as const, id: campaign.id } : $user ? { at: 'user' as const, id: $user.user_id } : null
  )

  const query = $derived(new URLSearchParams($resolvedRoute.search ?? ''))
  const openId = $derived(query.get('page') ?? '')
  const view = $derived<View>(query.get('view') === 'tree' || query.get('view') === 'list' ? (query.get('view') as View) : 'grid')
  const order = $derived<Order>(query.get('order') === 'written' ? 'written' : 'title')
  const descending = $derived(query.get('desc') === '1')
  const byTag = $derived(query.get('by') === 'tag')
  const picked = $derived((query.get('tags') ?? '').split(',').filter(Boolean))
  const mode = $derived<Mode>(query.get('mode') === 'edit' ? 'edit' : 'read')

  let pages = $state<Resource[]>([])
  let hunt = $state(new URLSearchParams($resolvedRoute.search ?? '').get('q') ?? '')
  let loading = $state(true)
  let saving = $state(false)
  let media = $state<{ kind: MediaKind; current?: string; resolve: (asset: MediaAsset | null) => void } | null>(null)
  let timer: ReturnType<typeof setTimeout> | undefined
  let huntTimer: ReturnType<typeof setTimeout> | undefined
  let pending: Resource | null = null
  let loadedFor = ''

  function put(changes: Record<string, string | null>) {
    const next = new URLSearchParams($resolvedRoute.search ?? '')
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value)
      else next.delete(key)
    }
    const search = next.toString()
    navigate(`/main/scribe${search ? `?${search}` : ''}`)
  }

  function seekPages(text: string) {
    hunt = text
    clearTimeout(huntTimer)
    huntTimer = setTimeout(() => {
      if (text !== (query.get('q') ?? '')) put({ q: text || null })
    }, SAVE_DELAY)
  }

  const open = $derived(pages.find((one) => one.id === openId) ?? null)
  const trail = $derived(open ? getTrail(pages, open.id) : [])
  const wanted = $derived(hunt.trim().toLowerCase())
  const sifting = $derived(Boolean(wanted) || picked.length > 0)
  const allTags = $derived([...new Set(pages.flatMap((one) => one.tags))].sort())
  const shown = $derived(sort(pages.filter(keep)))
  const roots = $derived(sifting ? shown : sort(getRoots(pages)))
  const rows = $derived(roots.map(limb))
  const tiles = $derived(shelve(roots))
  const lines = $derived(shelve(shown))

  const strip = $derived.by(() => {
    if (!open) return null
    const kids = sort(getChildren(pages, open.id))
    if (kids.length > 0) return { main: open, kids }
    const above = parentOf(open)
    return above ? { main: above, kids: sort(getChildren(pages, above.id)) } : null
  })
  const tabs = $derived<PageTabItem[]>(strip ? [{ id: strip.main.id, label: 'Main' }, ...strip.kids.map((one) => ({ id: one.id, label: one.title }))] : [])

  function keep(one: Resource): boolean {
    return one.title.toLowerCase().includes(wanted) && picked.every((tag) => one.tags.includes(tag))
  }

  function sort(held: Resource[]): Resource[] {
    return [...held].sort((a, b) => {
      const value =
        order === 'title'
          ? a.title.localeCompare(b.title)
          : String(a.created_at ?? '').localeCompare(String(b.created_at ?? ''))
      return descending ? -value : value
    })
  }

  function shelve(held: Resource[]): Shelf[] {
    if (!byTag) return [{ title: '', kids: held }]
    const tagged = allTags.map((tag) => ({ title: `#${tag}`, kids: held.filter((one) => one.tags.includes(tag)) }))
    const loose = { title: 'Untagged', kids: held.filter((one) => one.tags.length === 0) }
    return [...tagged, loose].filter((shelf) => shelf.kids.length > 0)
  }

  function limb(row: Resource): TreeRow {
    const kids = sifting ? [] : sort(getChildren(pages, row.id)).map(limb)
    return { id: row.id, title: row.title, mark: kids.length > 0 ? String(kids.length) : undefined, glyph: 'scroll', kids }
  }

  function countKids(one: Resource): number {
    return getChildren(pages, one.id).length
  }

  function parentOf(one: Resource): Resource | null {
    return pages.find((other) => other.id === one.parent_id) ?? null
  }

  function written(one: Resource): string {
    return one.created_at ? one.created_at.slice(0, 10) : ''
  }

  function toggleTag(tag: string) {
    const next = picked.includes(tag) ? picked.filter((one) => one !== tag) : [...picked, tag]
    put({ tags: next.join(',') || null })
  }

  function show(id: string, next: Mode = 'read') {
    if (id === openId && next === mode) return
    put({ page: id || null, mode: next === 'edit' ? 'edit' : null })
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
    loading = true
    try {
      pages = await getAll(owner, 'entries')
      if (openId && !pages.some((one) => one.id === openId)) show('')
    } catch (reason) {
      postNotice(reason instanceof Error ? reason.message : String(reason))
    } finally {
      loading = false
    }
  }

  $effect(() => {
    void getPages()
  })

  function write(content: string) {
    if (!open || open.content === content) return
    const held = { ...open, content }
    pages = pages.map((one) => (one.id === held.id ? held : one))
    pending = held
    clearTimeout(timer)
    timer = setTimeout(() => void save(held), SAVE_DELAY)
  }

  async function save(held: Resource) {
    if (pending === held) pending = null
    saving = true
    try {
      await putResource(held.id, { content: held.content })
    } catch (reason) {
      postNotice(reason instanceof Error ? reason.message : String(reason))
    } finally {
      saving = false
    }
  }

  async function postPage(parentId: string | null = open?.id ?? null) {
    if (!owner) return
    try {
      const id = await postResource(owner, 'entries', { title: 'Untitled', content: '', parent_id: parentId })
      loadedFor = ''
      await getPages()
      show(id, 'edit')
    } catch (reason) {
      postNotice(reason instanceof Error ? reason.message : String(reason))
    }
  }

  function putTitle(event: Event) {
    const title = (event.currentTarget as HTMLInputElement).value.trim()
    if (!open || !title || open.title === title) return
    const held = { ...open, title }
    pages = pages.map((one) => (one.id === held.id ? held : one))
    void putResource(held.id, { title }).catch((reason) => postNotice(reason instanceof Error ? reason.message : String(reason)))
  }

  function loreOf(one: Resource): string {
    return `${campaign ? `/main/campaign/${campaign.id}` : '/main'}/entries/${one.id}`
  }

  function openPage() {
    if (open) navigate(loreOf(open))
  }

  function follow(reference: Reference) {
    if (reference.mark === '#') {
      put({ page: null, mode: null, tags: reference.label })
      return
    }
    if (reference.id) {
      show(reference.id)
      return
    }
    const named = reference.label.toLowerCase()
    const here = pages.find((one) => one.title.replace(/\s+/g, '').toLowerCase() === named)
    if (here) show(here.id)
  }

  async function seek(mark: '@' | '#', query: string): Promise<Mention[]> {
    const named = query.toLowerCase()
    if (mark === '#') return allTags.filter((tag) => tag.toLowerCase().includes(named)).map((tag) => ({ id: tag, label: tag }))
    return pages.filter((one) => one.title.toLowerCase().includes(named)).map((one) => ({ id: one.id, label: one.title.replace(/\s+/g, '') }))
  }

  function getMedia(kind: MediaKind, current?: string): Promise<MediaAsset | null> {
    return new Promise((resolve) => (media = { kind, current, resolve }))
  }

  function postMedia(file: File): Promise<MediaAsset> {
    return postFile(file, { kind: 'user' })
  }

  onMount(() => {
    void getTable()
    return () => {
      clearTimeout(timer)
      clearTimeout(huntTimer)
      if (pending) void save(pending)
    }
  })
</script>

{#snippet backdrop()}
  <span class="scribe-ground"></span>
{/snippet}

{#snippet divide(shelf: Shelf)}
  {#if shelf.title}
    <header class="scribe-divide">
      <h2 class="dnd-label scribe-divide-name">{shelf.title}</h2>
      <span class="scribe-divide-note">{shelf.kids.length}</span>
      <span class="scribe-divide-run"></span>
    </header>
  {/if}
{/snippet}

{#snippet tags(one: Resource)}
  {#each one.tags as tag (tag)}<Chip still>#{tag}</Chip>{/each}
{/snippet}

<Shell drawers title="Scribe" width="full" {backdrop}>
  <div class="scribe">
    <header class="scribe-band">
      <div class="scribe-line">
        <div class="scribe-head">
          <p class="dnd-label scribe-eyebrow">
            <span>{campaign ? campaign.name : 'Your own'}</span>
            <span class="scribe-step-mark"> / </span>
            {#if open}
              <button type="button" class="scribe-step" onclick={() => show('')}>Scribe</button>
              {#each trail as step (step.id)}
                <span class="scribe-step-mark"> / </span>
                {#if step.id === open.id}
                  <span>{step.title}</span>
                {:else}
                  <button type="button" class="scribe-step" onclick={() => show(step.id)}>{step.title}</button>
                {/if}
              {/each}
            {:else}
              <span>Scribe</span>
            {/if}
          </p>
          {#if open}
            <input class="scribe-title" type="text" value={open.title} aria-label="Page title" onchange={putTitle} />
          {:else}
            <h1 class="dnd-heading scribe-name">Scribe</h1>
          {/if}
        </div>

        <span class="scribe-acts">
          {#if saving}<span class="dnd-spinner scribe-saving"></span>{/if}
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
          {#if open}
            <IconBtn title="Open in the lore" onclick={openPage}>
              <Glyph name="forward" size="md" />
            </IconBtn>
          {/if}
        </span>
      </div>

      {#if open && strip}
        <PageTab {tabs} value={open.id} addLabel="New page under {strip.main.title}" onchange={show} onadd={() => postPage(strip?.main.id ?? null)} />
      {:else if !open}
        <div class="scribe-bar" role="group" aria-label="Filter the pages">
          <SearchInput value={hunt} placeholder="Search the pages..." autofocus={Boolean(hunt)} onsearch={seekPages} />

          {#if allTags.length > 0}
            <span class="scribe-bar-tags">
              {#each allTags as tag (tag)}
                <Chip on={picked.includes(tag)} onclick={() => toggleTag(tag)}>#{tag}</Chip>
              {/each}
            </span>
          {/if}

          {#if picked.length > 0}
            <Button variant="ghost" size="sm" onclick={() => put({ tags: null })}>Clear</Button>
          {/if}

          <span class="scribe-views">
            <ToggleGroup label="View" side="end">
              {#snippet actions()}
                <Chip on={order === 'title'} onclick={() => put({ order: null })}>Title</Chip>
                <Chip on={order === 'written'} onclick={() => put({ order: 'written' })}>Written</Chip>
                <IconBtn title={descending ? 'Descending' : 'Ascending'} onclick={() => put({ desc: descending ? null : '1' })}>
                  <Glyph name={descending ? 'fold' : 'unfold'} size="sm" />
                </IconBtn>
                {#if allTags.length > 0}
                  <Chip on={byTag} onclick={() => put({ by: byTag ? null : 'tag' })}>By tag</Chip>
                {/if}
              {/snippet}
              <IconBtn title="Grid" active={view === 'grid'} onclick={() => put({ view: null })}>
                <Glyph name="blocks" size="md" />
              </IconBtn>
              <IconBtn title="Tree" active={view === 'tree'} onclick={() => put({ view: 'tree' })}>
                <Glyph name="lines" size="md" />
              </IconBtn>
              <IconBtn title="List" active={view === 'list'} onclick={() => put({ view: 'list' })}>
                <Glyph name="menu" size="md" />
              </IconBtn>
            </ToggleGroup>
          </span>
        </div>
      {/if}
    </header>

    <section class="scribe-main" aria-label={open ? 'Page' : 'Pages'}>
      {#if loading}
        <div class="dnd-loading"><span class="dnd-spinner"></span></div>
      {:else if open}
        {#key open.id}
          {#if mode === 'edit'}
            <div class="scribe-write">
              <BlockEditor
                value={open.content}
                placeholder="Write, or press slash for a block"
                onchange={write}
                onsearch={seek}
                requestMedia={getMedia}
                uploadFile={postMedia}
                openAsset={getAssetTab}
              />
            </div>
          {:else}
            <div class="scribe-read">
              <BlockReader value={open.content} onopen={follow} onsearch={seek} openAsset={getAssetTab} mine={$user?.user_id ?? ''} />
            </div>
          {/if}
        {/key}
      {:else if pages.length === 0}
        <p class="scribe-empty">No page written yet. Press New page to begin.</p>
      {:else if shown.length === 0}
        <p class="scribe-empty">No page matches.</p>
      {:else if view === 'grid'}
        {#each tiles as shelf (shelf.title)}
          <section class="scribe-shelf" aria-label={shelf.title || 'Pages'}>
            {@render divide(shelf)}
            <div class="scribe-grid">
              {#each shelf.kids as one (one.id)}
                {@const kids = countKids(one)}
                <Card
                  title={one.title}
                  sub={one.description || (kids > 0 ? `${kids} sub pages` : undefined)}
                  image={one.image || undefined}
                  badge={kids > 0 && one.description ? String(kids) : undefined}
                  layout="tile"
                  onclick={() => show(one.id)}
                >
                  {#each one.tags as tag (tag)}<span>#{tag}</span>{/each}
                </Card>
              {/each}
            </div>
          </section>
        {/each}
      {:else if view === 'tree'}
        <Tree {rows} on={openId} onopen={show} />
      {:else}
        {#each lines as shelf (shelf.title)}
          <section class="scribe-shelf" aria-label={shelf.title || 'Pages'}>
            {@render divide(shelf)}
            <div class="scribe-list">
              {#each shelf.kids as one (one.id)}
                {@const above = parentOf(one)}
                {@const kids = countKids(one)}
                <Row
                  title={one.title}
                  sub={one.description || undefined}
                  mark={kids > 0 ? `${kids} sub pages` : undefined}
                  image={one.image || undefined}
                  onclick={() => show(one.id)}
                  onopen={() => navigate(loreOf(one))}
                >
                  {@render tags(one)}
                  {#if above}<span>Under {above.title}</span>{/if}
                  {#if written(one)}<span>{written(one)}</span>{/if}
                </Row>
              {/each}
            </div>
          </section>
        {/each}
      {/if}
    </section>
  </div>
</Shell>

{#if media}
  <MediaDialog
    kind={media.kind}
    current={media.current}
    getAssets={(query, kind) => getAssets(query, kind, { kind: 'user' })}
    uploadFile={postMedia}
    onclose={(asset) => {
      media?.resolve(asset)
      media = null
    }}
  />
{/if}

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

  .scribe-band {
    display: grid;
    gap: var(--space-3);
    min-width: 0;
    padding-block-end: var(--space-3);
    border-bottom: var(--border-hair) solid color-mix(in srgb, var(--metal-dim) 80%, transparent);
  }

  .scribe-line {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: var(--space-4);
    min-width: 0;
  }

  .scribe-head {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: var(--space-1);
    min-width: 0;
  }

  .scribe-acts {
    display: flex;
    flex: none;
    align-items: center;
    gap: var(--space-2);
  }

  .scribe-eyebrow {
    margin: 0;
    color: var(--metal);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .scribe-step {
    padding: 0;
    border: none;
    background: none;
    font: inherit;
    color: var(--metal);
    cursor: pointer;
  }

  .scribe-step:hover {
    color: var(--metal-bright);
  }

  .scribe-step:focus-visible {
    outline: none;
    box-shadow: var(--focus-ring);
  }

  .scribe-step-mark {
    color: var(--ink-faint);
  }

  .scribe-name {
    margin: 0;
    min-width: 0;
  }

  .scribe-title {
    min-width: 0;
    inline-size: clamp(8rem, 40%, 24rem);
    padding: 0;
    border: none;
    border-radius: 0;
    background: transparent;
    box-shadow: none;
    font-family: var(--font-display);
    font-size: var(--text-xl);
    font-weight: 600;
    letter-spacing: var(--tracking-wide);
    color: var(--metal-bright);
    text-shadow: 0 var(--border-hair) 0 var(--keyline), 0 0 var(--space-2) color-mix(in srgb, var(--ember-glow) 50%, transparent);
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

  .scribe-bar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-3);
    min-width: 0;
  }

  .scribe-bar > :global(.dnd-searchinput) {
    flex: 0 1 calc(var(--space-8) * 3);
    width: auto;
  }

  .scribe-bar-tags {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
    min-width: 0;
  }

  .scribe-views {
    display: flex;
    align-items: center;
    margin-inline-start: auto;
    min-width: 0;
  }

  .scribe-main {
    display: flex;
    flex-direction: column;
    gap: var(--space-5);
    min-width: 0;
  }

  .scribe-shelf {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    min-width: 0;
  }

  .scribe-divide {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    min-width: 0;
  }

  .scribe-divide-name {
    margin: 0;
    color: var(--metal);
  }

  .scribe-divide-note {
    font-family: var(--font-figures);
    font-size: var(--text-xs);
    color: var(--ink-faint);
  }

  .scribe-divide-run {
    flex: 1;
    min-width: 0;
    block-size: var(--border-hair);
    background: linear-gradient(90deg, var(--metal-dim), transparent);
  }

  .scribe-grid {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-4);
    min-width: 0;
  }

  .scribe-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    min-width: 0;
  }

  .scribe-write,
  .scribe-read {
    min-width: 0;
  }

  .scribe-empty {
    margin: 0;
    padding: var(--space-4) 0;
    font-style: italic;
    color: var(--ink-faint);
  }
</style>
