<script lang="ts">
  import { onMount } from 'svelte'
  import { navigate } from 'sly-svelte-location-router'
  import { getAssets, getAssetTab, getCampaigns, postFile, postResource, putResource } from '$lib/api'
  import type { MediaAsset, MediaKind, Mention, Reference } from '$lib/blocks'
  import { getAll, getChildren, getRoots, getTrail, type Resource } from '$lib/resources'
  import { currentCampaignId, userCampaigns } from '$lib/stores/campaign.store'
  import { user } from '$lib/stores/auth.store'
  import { postNotice } from '$lib/stores/ui.store'
  import Shell from '$components/ui/Shell.svelte'
  import Sidebar from '$components/ui/Sidebar.svelte'
  import Tree, { type TreeRow } from '$components/ui/Tree.svelte'
  import Row from '$components/ui/Row.svelte'
  import Card from '$components/ui/Card.svelte'
  import IconBtn from '$components/ui/IconBtn.svelte'
  import Button from '$components/ui/Button.svelte'
  import Glyph from '$components/ui/Glyph.svelte'
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

  let pages = $state<Resource[]>([])
  let openId = $state('')
  let hunt = $state('')
  let picked = $state<string[]>([])
  let view = $state<View>('grid')
  let order = $state<Order>('title')
  let descending = $state(false)
  let byTag = $state(false)
  let mode = $state<Mode>('read')
  let navOpen = $state(false)
  let loading = $state(true)
  let saving = $state(false)
  let media = $state<{ kind: MediaKind; current?: string; resolve: (asset: MediaAsset | null) => void } | null>(null)
  let timer: ReturnType<typeof setTimeout> | undefined
  let loadedFor = ''

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
    return { id: row.id, title: row.title, mark: kids.length > 0 ? String(kids.length) : undefined, kids }
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
    picked = picked.includes(tag) ? picked.filter((one) => one !== tag) : [...picked, tag]
  }

  function show(id: string) {
    openId = id
    mode = 'read'
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
      if (!pages.some((one) => one.id === openId)) show('')
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
    clearTimeout(timer)
    timer = setTimeout(() => void save(held), SAVE_DELAY)
  }

  async function save(held: Resource) {
    saving = true
    try {
      await putResource(held.id, { content: held.content })
    } catch (reason) {
      postNotice(reason instanceof Error ? reason.message : String(reason))
    } finally {
      saving = false
    }
  }

  async function postPage() {
    if (!owner) return
    try {
      const id = await postResource(owner, 'entries', { title: 'Untitled', content: '', parent_id: open?.id ?? null })
      loadedFor = ''
      await getPages()
      show(id)
      mode = 'edit'
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
      picked = [reference.label]
      show('')
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
    return () => clearTimeout(timer)
  })
</script>

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
  {#if one.tags.length > 0}
    <span class="scribe-tags">
      {#each one.tags as tag (tag)}<span class="scribe-tag">#{tag}</span>{/each}
    </span>
  {/if}
{/snippet}

<Shell drawers title="Scribe" width="full" back={() => navigate('/main')}>
  <div class="scribe">
    <header class="dnd-band scribe-band">
      <div class="dnd-band-line">
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

        <span class="dnd-band-acts">
          {#if saving}<span class="dnd-spinner scribe-saving"></span>{/if}
          <IconBtn title={open ? `New page under ${open.title}` : 'New page'} onclick={postPage}>
            <Glyph name="add" size="md" />
          </IconBtn>
          {#if open}
            <IconBtn title="Open in the lore" onclick={openPage}>
              <Glyph name="forward" size="md" />
            </IconBtn>
          {/if}
        </span>
      </div>

      <div class="scribe-bar" role="group" aria-label={open ? 'How the page is shown' : 'Filter the pages'}>
        <IconBtn title={navOpen ? 'Close the pages' : 'Open the pages'} active={navOpen} onclick={() => (navOpen = !navOpen)}>
          <Glyph name="split" size="md" />
        </IconBtn>

        {#if open}
          <span class="scribe-views" role="group" aria-label="Mode">
            <IconBtn title="Edit" active={mode === 'edit'} onclick={() => (mode = 'edit')}>
              <Glyph name="edit" size="md" />
            </IconBtn>
            <IconBtn title="Read" active={mode === 'read'} onclick={() => (mode = 'read')}>
              <Glyph name="reveal" size="md" />
            </IconBtn>
          </span>
        {:else}
          <input type="text" class="dnd-search scribe-hunt" placeholder="Search the pages..." aria-label="Search the pages" bind:value={hunt} />

          {#if allTags.length > 0}
            <span class="scribe-bar-tags">
              {#each allTags as tag (tag)}
                <button
                  type="button"
                  class="scribe-chip"
                  class:scribe-chip-on={picked.includes(tag)}
                  aria-pressed={picked.includes(tag)}
                  onclick={() => toggleTag(tag)}
                >
                  #{tag}
                </button>
              {/each}
            </span>
          {/if}

          {#if picked.length > 0}
            <Button variant="ghost" size="sm" onclick={() => (picked = [])}>Clear</Button>
          {/if}

          <span class="scribe-views" role="group" aria-label="View">
            <IconBtn title="Grid" active={view === 'grid'} onclick={() => (view = 'grid')}>
              <Glyph name="blocks" size="md" />
            </IconBtn>
            <IconBtn title="Tree" active={view === 'tree'} onclick={() => (view = 'tree')}>
              <Glyph name="lines" size="md" />
            </IconBtn>
            <IconBtn title="List" active={view === 'list'} onclick={() => (view = 'list')}>
              <Glyph name="menu" size="md" />
            </IconBtn>

            <span class="scribe-views-acts" role="group" aria-label="Sort and group">
              <button type="button" class="scribe-chip" class:scribe-chip-on={order === 'title'} aria-pressed={order === 'title'} onclick={() => (order = 'title')}>
                Title
              </button>
              <button type="button" class="scribe-chip" class:scribe-chip-on={order === 'written'} aria-pressed={order === 'written'} onclick={() => (order = 'written')}>
                Written
              </button>
              <IconBtn title={descending ? 'Descending' : 'Ascending'} onclick={() => (descending = !descending)}>
                <Glyph name={descending ? 'fold' : 'unfold'} size="sm" />
              </IconBtn>
              {#if allTags.length > 0}
                <button type="button" class="scribe-chip" class:scribe-chip-on={byTag} aria-pressed={byTag} onclick={() => (byTag = !byTag)}>
                  By tag
                </button>
              {/if}
            </span>
          </span>
        {/if}
      </div>
    </header>

    <div class="scribe-desk" class:scribe-desk-nav={navOpen}>
      <Sidebar side="start" open={navOpen} run="calc(var(--space-8) * 3)">
        <nav class="scribe-files" aria-label="Pages">
          <header class="scribe-divide">
            <h2 class="dnd-label scribe-divide-name">Pages</h2>
            <span class="scribe-divide-note">{pages.length}</span>
            <span class="scribe-divide-run"></span>
          </header>
          {#if loading}
            <div class="dnd-loading"><span class="dnd-spinner"></span></div>
          {:else if rows.length === 0}
            <p class="scribe-empty">No page written yet.</p>
          {:else}
            <div class="dnd-scroll scribe-tree">
              <Tree {rows} on={openId} onopen={show} />
            </div>
          {/if}
        </nav>
      </Sidebar>

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
  .scribe {
    display: grid;
    gap: var(--space-5);
    min-width: 0;
  }

  .scribe-head {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    min-width: 0;
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
    margin-top: var(--space-3);
    min-width: 0;
  }

  .scribe-hunt {
    flex: 0 1 var(--scribe-hunt);
    --scribe-hunt: calc(var(--space-8) * 3);
    width: auto;
    min-width: 0;
  }

  .scribe-bar-tags {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
    min-width: 0;
  }

  .scribe-views {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-1);
    margin-inline-start: auto;
    min-width: 0;
  }

  .scribe-views-acts {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2);
    margin-inline-start: var(--space-3);
    padding-inline-start: var(--space-3);
    border-inline-start: var(--border-hair) solid var(--metal-dim);
    min-width: 0;
  }

  .scribe-chip {
    padding: var(--space-0) var(--space-3);
    border: none;
    border-radius: var(--radius-sm);
    background: var(--texture-noise), linear-gradient(180deg, var(--ground-lift) 0%, var(--ground-deep) 100%);
    box-shadow: var(--rim-thin);
    font-family: var(--font-display);
    font-size: var(--text-xs);
    letter-spacing: var(--tracking-wide);
    color: var(--ink-dim);
    text-shadow: 0 var(--border-hair) 0 var(--keyline);
    cursor: pointer;
    transition: color 0.15s ease, text-shadow 0.15s ease, box-shadow 0.15s ease;
  }

  .scribe-chip:hover {
    color: var(--metal-bright);
    text-shadow: var(--glow-text);
  }

  .scribe-chip:active {
    filter: brightness(0.85);
  }

  .scribe-chip-on {
    color: var(--metal-bright);
    box-shadow: var(--rim-thin), inset 0 0 var(--space-2) var(--ember-glow), 0 0 var(--space-3) var(--ember-glow);
  }

  .scribe-chip:focus-visible {
    outline: none;
    box-shadow: var(--focus-ring);
  }

  .scribe-desk {
    --scribe-nav: 0;
    display: grid;
    grid-template-columns: var(--scribe-nav) minmax(0, 1fr);
    gap: var(--space-5);
    min-width: 0;
    min-block-size: calc(var(--space-8) * 4);
    transition: grid-template-columns 250ms ease-in-out;
  }

  .scribe-desk-nav {
    --scribe-nav: calc(var(--space-8) * 3);
  }

  .scribe-files {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    block-size: 100%;
    min-width: 0;
    padding: var(--space-4) var(--space-3);
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

  .scribe-tree {
    flex: 1;
    min-width: 0;
    min-block-size: 0;
    overflow-y: auto;
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

  .scribe-tags {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
  }

  .scribe-tag {
    font-family: var(--font-display);
    letter-spacing: var(--tracking-wide);
    color: var(--metal);
    text-shadow: 0 var(--border-hair) 0 var(--keyline);
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
