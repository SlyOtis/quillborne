<script lang="ts">
  import { onMount } from 'svelte'
  import { navigate } from 'sly-svelte-location-router'
  import { getAssets, getAssetTab, postFile, postResource, putResource } from '$lib/api'
  import type { MediaAsset, MediaKind, Mention } from '$lib/blocks'
  import { getAll, getChildren, getRoots, type Resource } from '$lib/resources'
  import { currentCampaignId, userCampaigns } from '$lib/stores/campaign.store'
  import { user } from '$lib/stores/auth.store'
  import { postNotice } from '$lib/stores/ui.store'
  import Shell from '$components/ui/Shell.svelte'
  import Tree, { type TreeRow } from '$components/ui/Tree.svelte'
  import IconBtn from '$components/ui/IconBtn.svelte'
  import Glyph from '$components/ui/Glyph.svelte'
  import BlockEditor from '$components/ui/BlockEditor.svelte'
  import MediaDialog from '$components/MediaDialog.svelte'

  const SAVE_DELAY = 600

  const campaign = $derived($userCampaigns.find((one) => one.id === $currentCampaignId) ?? $userCampaigns[0] ?? null)
  const owner = $derived(campaign ? { at: 'campaign' as const, id: campaign.id } : $user ? { at: 'user' as const, id: $user.user_id } : null)

  let pages = $state<Resource[]>([])
  let openId = $state('')
  let hunt = $state('')
  let loading = $state(true)
  let saving = $state(false)
  let media = $state<{ kind: MediaKind; current?: string; resolve: (asset: MediaAsset | null) => void } | null>(null)
  let timer: ReturnType<typeof setTimeout> | undefined
  let loadedFor = ''

  const open = $derived(pages.find((one) => one.id === openId) ?? null)
  const wanted = $derived(hunt.trim().toLowerCase())
  const shown = $derived(wanted ? pages.filter((one) => one.title.toLowerCase().includes(wanted)) : pages)
  const rows = $derived((wanted ? shown : getRoots(pages)).map(limb))

  function limb(row: Resource): TreeRow {
    return { id: row.id, title: row.title, kids: wanted ? [] : getChildren(pages, row.id).map(limb) }
  }

  async function getPages() {
    if (!owner) return
    const key = `${owner.at}/${owner.id}`
    if (key === loadedFor) return
    loadedFor = key
    loading = true
    try {
      pages = await getAll(owner, 'entries')
      if (!pages.some((one) => one.id === openId)) openId = pages[0]?.id ?? ''
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
    const written = { ...open, content }
    pages = pages.map((one) => (one.id === written.id ? written : one))
    clearTimeout(timer)
    timer = setTimeout(() => void keep(written), SAVE_DELAY)
  }

  async function keep(written: Resource) {
    saving = true
    try {
      await putResource(written.id, { content: written.content })
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
      openId = id
    } catch (reason) {
      postNotice(reason instanceof Error ? reason.message : String(reason))
    }
  }

  function putTitle(event: Event) {
    const title = (event.currentTarget as HTMLInputElement).value.trim()
    if (!open || !title || open.title === title) return
    const written = { ...open, title }
    pages = pages.map((one) => (one.id === written.id ? written : one))
    void putResource(written.id, { title }).catch((reason) => postNotice(reason instanceof Error ? reason.message : String(reason)))
  }

  function openPage() {
    if (!open) return
    navigate(`${campaign ? `/main/campaign/${campaign.id}` : '/main'}/entries/${open.id}`)
  }

  async function seek(mark: '@' | '#', query: string): Promise<Mention[]> {
    if (mark === '#') return []
    const wanted = query.toLowerCase()
    return pages.filter((one) => one.title.toLowerCase().includes(wanted)).map((one) => ({ id: one.id, label: one.title.replace(/\s+/g, '') }))
  }

  function getMedia(kind: MediaKind, current?: string): Promise<MediaAsset | null> {
    return new Promise((resolve) => (media = { kind, current, resolve }))
  }

  function postMedia(file: File): Promise<MediaAsset> {
    return postFile(file, { kind: 'user' })
  }

  onMount(() => () => clearTimeout(timer))
</script>

<Shell drawers title="Scribe" width="full" back={() => navigate('/main')}>
  <div class="scribe">
    <header class="dnd-band">
      <div class="dnd-band-line">
        <p class="dnd-label scribe-eyebrow">{campaign ? campaign.name : 'Your own'}</p>
        <span class="dnd-band-acts">
          <IconBtn title={open ? `New page under ${open.title}` : 'New page'} onclick={postPage}><Glyph name="add" size="md" /></IconBtn>
        </span>
      </div>
      <div class="scribe-crown">
        <h1 class="dnd-heading dnd-heading-hero scribe-name">Scribe</h1>
        <p class="scribe-lede">{pages.length} pages of lore</p>
      </div>
      <div class="scribe-bar" role="group" aria-label="Filter the pages">
        <input type="text" class="dnd-search scribe-hunt" placeholder="Search the pages..." aria-label="Search the pages" bind:value={hunt} />
      </div>
    </header>

    <div class="scribe-desk">
      <aside class="scribe-files" aria-label="Pages">
        <header class="scribe-divide">
          <h2 class="dnd-label scribe-divide-name">Lore</h2>
          <span class="scribe-divide-run"></span>
        </header>
        {#if loading}
          <div class="dnd-loading"><span class="dnd-spinner"></span></div>
        {:else if rows.length === 0}
          <p class="scribe-empty">No page written yet.</p>
        {:else}
          <div class="dnd-scroll scribe-tree">
            <Tree {rows} on={openId} onopen={(id) => (openId = id)} />
          </div>
        {/if}
      </aside>

      <section class="scribe-sheet" aria-label="Page">
        {#if open}
          <header class="scribe-divide">
            <input class="scribe-title" type="text" value={open.title} aria-label="Page title" onchange={putTitle} />
            <span class="scribe-divide-run"></span>
            {#if saving}<span class="dnd-spinner scribe-saving"></span>{/if}
            <IconBtn title="Open in the lore" onclick={openPage}><Glyph name="forward" size="sm" /></IconBtn>
          </header>
          {#key open.id}
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
          {/key}
        {:else}
          <p class="scribe-empty">Pick a page, or write a new one.</p>
        {/if}
      </section>
    </div>
  </div>
</Shell>

{#if media}
  <MediaDialog
    kind={media.kind}
    current={media.current}
    getAssets={(query, wanted) => getAssets(query, wanted, { kind: 'user' })}
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

  .scribe-eyebrow {
    margin: 0;
    color: var(--metal);
  }

  .scribe-crown {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    margin-top: var(--space-4);
    min-width: 0;
  }

  .scribe-name {
    margin: 0;
    min-width: 0;
  }

  .scribe-lede {
    margin: 0;
    font-family: var(--font-figures);
    letter-spacing: var(--tracking-wide);
    font-size: var(--text-xs);
    color: var(--ink-faint);
  }

  .scribe-bar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-3);
    margin-top: var(--space-4);
    min-width: 0;
  }

  .scribe-hunt {
    flex: 0 1 calc(var(--space-8) * 3);
    width: auto;
    min-width: 0;
  }

  .scribe-desk {
    display: grid;
    grid-template-columns: minmax(12rem, 1fr) minmax(0, 3fr);
    gap: var(--space-5);
    min-width: 0;
  }

  .scribe-files,
  .scribe-sheet {
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

  .scribe-divide-run {
    flex: 1;
    block-size: var(--border-hair);
    background: linear-gradient(90deg, var(--metal-dim), transparent);
  }

  .scribe-title {
    flex: 0 1 auto;
    min-width: 0;
    inline-size: clamp(8rem, 40%, 24rem);
    padding: var(--space-1) 0;
    border: none;
    border-radius: 0;
    background: transparent;
    box-shadow: none;
    font-family: var(--font-display);
    font-size: var(--text-xl);
    font-weight: 700;
    letter-spacing: var(--tracking-wide);
    color: var(--metal-bright);
    text-shadow: 0 1px 0 var(--keyline), 0 0 0.6rem var(--ember-glow);
  }

  .scribe-title:focus {
    outline: none;
    box-shadow: inset 0 calc(var(--border-hair) * -1) 0 var(--metal);
  }

  .scribe-saving {
    flex: none;
  }

  .scribe-tree {
    max-block-size: 70vh;
    overflow-y: auto;
  }

  .scribe-write {
    min-width: 0;
  }

  .scribe-empty {
    margin: 0;
    padding: var(--space-4) 0;
    font-style: italic;
    color: var(--ink-faint);
  }

  @container page (max-width: 760px) {
    .scribe-desk {
      grid-template-columns: minmax(0, 1fr);
    }
  }
</style>
