<script lang="ts">
  import { getAssets, getAssetTab, getCampaign, getCampaignCharacters, getCharacters, postFile, putAttachments, type UploadScope } from '$lib/api'
  import type { Campaign, Owner } from '$lib/api/types'
  import { onMount, setContext, type Snippet } from 'svelte'
  import { navigate, resolvedRoute } from 'sly-svelte-location-router'
  import { getTheme, setTheme } from '$lib/dialogs/theme'
  import { user } from '$lib/stores/auth.store'
  import { anyDialogOpen, uiStore } from '$lib/stores/ui.store'
  import {
    deleteOne,
    getAll,
    getBlank,
    getChildren,
    getRoots,
    getTrail,
    postOne,
    putOne,
    RESOURCES,
    type Resource,
    type ResourceKind
  } from '$lib/resources'
  import { joinDoc, type Session } from '$lib/collab'
  import { getDocument, getDocumentMarkdown, type MediaAsset, type MediaKind, type Mention, type Reference } from '$lib/blocks'
  import ResourceAccess from '$components/campaign/ResourceAccess.svelte'
  import BaseDialog from '$components/BaseDialog.svelte'
  import FrameDialog from '$components/FrameDialog.svelte'
  import GalleryDialog from '$components/GalleryDialog.svelte'
  import MediaDialog from '$components/MediaDialog.svelte'
  import Portrait from '$components/ui/Portrait.svelte'
  import { SHAPES, type PortraitFrame } from '$components/ui/Portrait.svelte'
  import { unfold } from '$lib/unfold'
  import BlockEditor from '$components/ui/BlockEditor.svelte'
  import BlockSidebar from '$components/ui/BlockSidebar.svelte'
  import Sidebar from '$components/ui/Sidebar.svelte'
  import BlockReader from '$components/ui/BlockReader.svelte'
  import Button from '$components/ui/Button.svelte'
  import Glyph from '$components/ui/Glyph.svelte'
  import IconBtn from '$components/ui/IconBtn.svelte'
  import Ornament from '$components/ui/Ornament.svelte'
  import Shell from '$components/ui/Shell.svelte'
  import Tree, { type TreeRow } from '$components/ui/Tree.svelte'
  import StoredImage from '$components/ui/StoredImage.svelte'

  const {
    kind,
    facts,
    form,
    bar
  }: {
    /** Which resource the page it scaffolds is for. */
    kind: ResourceKind
    /** The type's own facts, drawn while reading. */
    facts?: Snippet<[Record<string, unknown> & Resource]>
    /** The type's own fields, drawn while writing. */
    form?: Snippet<[Record<string, unknown> & Resource]>
    /** The type's own screen actions, placed on the bar. */
    bar?: Snippet<[Record<string, unknown> & Resource, Owner]>
  } = $props()

  setContext('dialogState', {
    get isAnyDialogOpen() {
      return $anyDialogOpen
    },
    setDialogState: uiStore.setDialogState
  })

  const steps = $derived($resolvedRoute.path.split('/').filter(Boolean).slice(1))
  const campaignId = $derived(steps[0] === 'campaign' ? steps[1] ?? '' : '')
  const shape = $derived(RESOURCES[kind])
  const owner = $derived<Owner>(
    campaignId ? { at: 'campaign', id: campaignId } : { at: 'user', id: $user?.user_id ?? '' }
  )
  const under = $derived(campaignId ? `/main/campaign/${campaignId}/${kind}` : `/main/${kind}`)
  const scope = $derived<UploadScope>(campaignId ? { kind: 'campaignFile', campaignId } : { kind: 'user' })
  const recordId = $derived((campaignId ? steps[3] : steps[1]) ?? 'create')
  const fresh = $derived(recordId === 'create')

  let campaign = $state<Campaign | null>(null)
  let all = $state<Resource[]>([])
  let one = $state<Record<string, unknown> & Resource>(blank())

  let tabsOpen = $state(true)
  let asideOpen = $state(false)
  let loading = $state(true)
  let busy = $state(false)
  let error = $state<string | null>(null)
  let word = $state<string | null>(null)
  let picker = $state<HTMLInputElement>()
  let accessOpen = $state(false)
  let dropOpen = $state(false)
  let frameOpen = $state(false)
  let galleryOpen = $state(false)
  let blocksOpen = $state(false)
  let editor = $state<ReturnType<typeof BlockEditor>>()
  let galleryAt = $state(0)
  let media = $state<{ kind: MediaKind; current?: string; resolve: (asset: MediaAsset | null) => void } | null>(null)
  let frame = $state('')
  let bandHeight = $state(0)
  let tagLine = $state('')

  const traced = $derived(one.frame in SHAPES ? (one.frame as PortraitFrame) : null)

  const canWrite = $derived(
    fresh || !one.owner_id ? Boolean($user) : Boolean($user && one.owner_id === $user.user_id)
  )
  let editing = $state(false)
  const writing = $derived(editing || fresh)

  let past = $state<string[]>([])
  let ahead = $state<string[]>([])
  let began = $state('')
  let held = $state('')
  let stepping = $state(false)

  const shot = $derived(
    JSON.stringify({ ...one, created_at: null, id: null }) + `|${tagLine}`
  )
  const changed = $derived(shot !== began)

  $effect(() => {
    const now = shot
    if (!writing) return
    if (now === held) return

    if (stepping) {
      stepping = false
      held = now
      return
    }

    past = [...past, held]
    ahead = []
    held = now
  })
  const named = $derived(one.title.trim().length > 0)
  const kids = $derived(getChildren(all, recordId))
  const trail = $derived(fresh ? [] : getTrail(all, recordId))
  const twigs = $derived(getRoots(all).map(limb))
  const names = $derived(all.map((entry) => ({ id: entry.id, label: entry.title.replace(/\s+/g, ''), icon: entry.image || undefined })))
  const words = $derived([...new Set(all.flatMap((entry) => entry.tags))].sort().map((tag) => ({ id: tag, label: tag })))

  /** What the at and hash popups offer, out of the roll that is already loaded. */
  async function seek(mark: '@' | '#', query: string): Promise<Mention[]> {
    const wanted = query.toLowerCase()
    return (mark === '@' ? names : words).filter((one) => one.label.toLowerCase().includes(wanted))
  }

  /**
   * A written reference is resolved against what the roll actually holds: an at
   * name opens the resource it names, a hash word opens the roll narrowed to it.
   * A name nothing answers to is left alone rather than opening the wrong page.
   */
  async function follow(reference: Reference) {
    if (reference.id && reference.mark === '@') {
      navigate(`${under}/${reference.id}`)
      return
    }

    if (reference.mark === '#') {
      navigate(`${under}?tag=${encodeURIComponent(reference.label)}`)
      return
    }

    const wanted = reference.label.toLowerCase()
    const matches = (entry: Resource) => entry.title.replace(/\s+/g, '').toLowerCase() === wanted

    const here = all.find(matches)
    if (here) {
      navigate(`${under}/${here.id}`)
      return
    }

    // A name is written without saying which roll it sits on, so every roll is
    // asked until one answers. The address it opens is that roll's, not this one's.
    const base = campaignId ? `/main/campaign/${campaignId}` : '/main'
    for (const roll of Object.keys(RESOURCES) as ResourceKind[]) {
      if (roll === kind) continue
      const found = (await getAll(owner, roll).catch(() => [])).find(matches)
      if (found) {
        navigate(`${base}/${roll}/${found.id}`)
        return
      }
    }

    const sheets = await (campaignId ? getCampaignCharacters(campaignId) : getCharacters()).catch(() => [])
    const sheet = sheets.find((entry) => entry.metadata.name.replace(/\s+/g, '').toLowerCase() === wanted)
    if (sheet) {
      navigate(`/main/character/${sheet.id}`)
      return
    }

    word = `Nothing on any roll is called ${reference.label}.`
  }

  function limb(entry: Resource): TreeRow {
    return {
      id: entry.id,
      title: entry.title,
      mark: shape.mark(entry),
      kids: getChildren(all, entry.id).map(limb)
    }
  }

  function blank(): Record<string, unknown> & Resource {
    return { ...getBlank(kind, $user?.user_id ?? ''), share_campaigns: owner.at === 'campaign' ? [owner.id] : [] }
  }

  onMount(() => setTheme(getTheme()))

  let read = $state('')

  $effect(() => {
    if (!owner.id) return

    const now = `${owner.at}/${owner.id}/${kind}`
    if (now === read) return
    read = now

    void (async () => {
      try {
        campaign = campaignId ? await getCampaign(campaignId) : null
        await reload()
      } catch (reason) {
        error = reason instanceof Error ? reason.message : String(reason)
      } finally {
        loading = false
      }
    })()
  })

  async function reload() {
    all = await getAll(owner, kind)
  }

  let drawn = $state('')

  $effect(() => {
    if (loading) return

    const found = all.find((entry) => entry.id === recordId)
    const now = `${recordId}/${all.length}/${found ? 'held' : 'void'}`
    if (now === drawn) return
    drawn = now

    if (fresh) {
      one = blank()
      tagLine = ''
      return
    }

    if (!found) return
    one = found as Record<string, unknown> & Resource
    tagLine = found.tags.join(', ')
  })

  let session = $state<Session | null>(null)
  let syncing = false

  function openWriting() {
    began = shot
    held = shot
    past = []
    ahead = []
    editing = true
    if (!fresh) joinShared()
  }

  function joinShared() {
    const held = joinDoc(owner, shape.part, recordId, one.content)
    session = held

    held.content.observe(() => {
      if (syncing) return
      const written = held.content.toString()
      if (written === one.content) return
      stepping = true
      one.content = written
    })
  }

  /** Hands a local edit to the shared document as the smallest change that explains it. */
  function share(written: string) {
    const shared = session?.content
    if (!shared || written === shared.toString()) return

    syncing = true
    shared.doc?.transact(() => {
      shared.delete(0, shared.length)
      shared.insert(0, written)
    }, 'self')
    syncing = false
  }

  async function leaveShared() {
    const held = session
    session = null
    await held?.leave()
  }

  function wear(snapshot: string) {
    if (!snapshot) return
    const [body, tags] = snapshot.split('|')
    const held = JSON.parse(body) as Record<string, unknown>
    stepping = true
    one = { ...one, ...held, id: one.id, created_at: one.created_at }
    tagLine = tags ?? ''
  }

  function stepBack() {
    if (past.length === 0) return
    const last = past[past.length - 1]
    past = past.slice(0, -1)
    ahead = [shot, ...ahead]
    wear(last)
  }

  function stepForward() {
    if (ahead.length === 0) return
    const next = ahead[0]
    ahead = ahead.slice(1)
    past = [...past, shot]
    wear(next)
  }

  function revert() {
    past = []
    ahead = []
    wear(began)
  }

  /** Stores a file the editor made, through the one uploader the app keeps. */
  async function postMedia(file: File) {
    error = null
    try {
      return await postFile(file, scope)
    } catch (reason) {
      error = reason instanceof Error ? reason.message : String(reason)
      throw reason
    }
  }

  function getMedia(kind: MediaKind, current?: string): Promise<MediaAsset | null> {
    return new Promise((resolve) => (media = { kind, current, resolve }))
  }

  /** A poll is answered in place, and the answer is written with the resource. */
  async function vote(index: number, choice: string) {
    const userId = $user?.user_id
    if (!userId) return

    // A block id is made fresh on every parse, so where it sits is what identifies it.
    const document = getDocument(one.content)
    const block = document.blocks[index]
    if (!block || block.kind !== 'poll') return

    const votes = { ...(block.options.votes ?? {}) }
    if (votes[userId] === choice) delete votes[userId]
    else votes[userId] = choice
    block.options = { ...block.options, votes }

    const written = getDocumentMarkdown(document)
    one.content = written
    await putOne(owner, kind, recordId, { ...one, content: written })
  }

  function openGallery(address: string) {
    galleryAt = Math.max(0, one.images.indexOf(address))
    galleryOpen = true
  }

  async function keepMain(address: string) {
    one.image = address
    if (writing) return
    busy = true
    error = null
    try {
      await putOne(owner, kind, recordId, one)
      await reload()
    } catch (reason) {
      error = reason instanceof Error ? reason.message : String(reason)
    } finally {
      busy = false
    }
  }

  function openFrame() {
    frame = one.frame
    frameOpen = true
  }

  $effect(() => {
    if (frameOpen || frame === one.frame) return
    one.frame = frame
    if (!writing) void keepFrame()
  })

  async function keepFrame() {
    busy = true
    error = null
    try {
      await putOne(owner, kind, recordId, one)
      await reload()
    } catch (reason) {
      error = reason instanceof Error ? reason.message : String(reason)
    } finally {
      busy = false
    }
  }

  async function addImage(event: Event) {
    const input = event.currentTarget as HTMLInputElement
    const file = input.files?.[0]
    input.value = ''
    if (!file) return

    busy = true
    error = null
    try {
      const { url: address } = await postFile(file, campaignId ? { kind: 'campaignMap', campaignId } : { kind: 'user' })
      one.images = [...one.images, address]
      if (!one.image) one.image = address
      if (!writing) {
        await putOne(owner, kind, recordId, one)
        await reload()
      }
    } catch (reason) {
      error = reason instanceof Error ? reason.message : String(reason)
    } finally {
      busy = false
    }
  }

  async function save() {
    busy = true
    error = null
    word = null
    one.tags = tagLine.split(',').map((one) => one.trim()).filter(Boolean)
    one.facts = one.facts
      .map((fact) => ({ label: fact.label.trim(), value: fact.value.trim() }))
      .filter((fact) => fact.label || fact.value)

    try {
      if (fresh) {
        const id = await postOne(owner, kind, one)
        await putAttachments(id, one.content)
        await reload()
        navigate(`${under}/${id}`)
      } else {
        await putOne(owner, kind, recordId, one)
        await putAttachments(recordId, one.content)
        await reload()
        editing = false
        past = []
        ahead = []
        began = shot
        await leaveShared()
      }
    } catch (reason) {
      error = reason instanceof Error ? reason.message : String(reason)
    } finally {
      busy = false
    }
  }

  async function drop() {
    busy = true
    error = null
    try {
      await leaveShared()
      await deleteOne(owner, kind, one)
      dropOpen = false
      navigate(under)
    } catch (reason) {
      error = reason instanceof Error ? reason.message : String(reason)
      dropOpen = false
    } finally {
      busy = false
    }
  }

  async function addPage(title: string) {
    const id = await postOne(owner, kind, { ...blank(), title, parent_id: recordId })
    await reload()
    asideOpen = true
    return id
  }
</script>

{#snippet acts()}
  {@render bar?.(one, owner)}
{/snippet}

<Shell
  drawers
  title={fresh ? `New ${shape.one}` : one.title || shape.one}
  width="full"
  back={() => navigate(under)}
  tools={bar && !fresh ? acts : undefined}
>
  {#if loading}
    <div class="dnd-loading"><span class="dnd-spinner"></span></div>
  {:else}
    <header class="dnd-band">
      <div class="page-band-grid" class:page-band-grid-bare={!one.image && one.images.length === 0} style:--page-face="{bandHeight}px">
        {#if one.image || one.images.length > 0}
        <div class="page-side">
          {#if one.image}
            <button type="button" class="page-face" class:page-face-traced={Boolean(traced)} title="Open the pictures" onclick={() => openGallery(one.image)}>
              {#if traced}
                <Portrait src={one.image} alt={one.title} frame={traced} size="fill" />
              {:else}
                <StoredImage src={one.image} alt={one.title} />
              {/if}
            </button>
          {/if}

          {#if one.images.length > 0}
            <div class="page-gallery-fold" use:unfold={tabsOpen}>
              <div class="page-gallery" aria-label="Pictures">
                {#each one.images as address, index (address)}
                  <button
                    type="button"
                    class="page-shot"
                    class:page-shot-on={one.image === address}
                    title={one.image === address ? 'The main picture' : `Picture ${index + 1}`}
                    onclick={() => openGallery(address)}
                  >
                    <StoredImage src={address} alt="" />
                  </button>
                {/each}
              </div>
            </div>
          {/if}
        </div>
        {/if}

        <div class="page-band-main" bind:clientHeight={bandHeight}>
      <div class="dnd-band-line">
        <p class="dnd-label page-eyebrow">
          {#each trail as step, index (step.id)}
            <button type="button" class="page-step" onclick={() => navigate(`${under}/${step.id}`)}>
              {step.title}
            </button>{#if index < trail.length - 1}<span class="page-step-mark"> / </span>{/if}
          {/each}
          {#if fresh}New {shape.word}{/if}
        </p>

        {#if writing}
          <span class="dnd-band-acts">
            <IconBtn title="Back" disabled={past.length === 0} onclick={stepBack}>
              <Glyph name="back" size="md" />
            </IconBtn>
            <IconBtn title="Forward" disabled={ahead.length === 0} onclick={stepForward}>
              <Glyph name="forward" size="md" />
            </IconBtn>
            <IconBtn title="Revert" disabled={!changed} onclick={revert}>
              <Glyph name="revert" size="md" />
            </IconBtn>
            <IconBtn title="Save" tone="verdigris" disabled={busy || !named} onclick={save}>
              <Glyph name="save" size="md" />
            </IconBtn>
            {#if fresh}
              <IconBtn title={busy ? 'Uploading' : 'Add a picture'} disabled={busy} onclick={() => picker?.click()}>
                <Glyph name="picture" size="md" />
              </IconBtn>
            {/if}
          </span>
        {:else}
          <span class="dnd-band-acts">
            <IconBtn title={busy ? 'Uploading' : 'Add a picture'} disabled={!canWrite || busy} onclick={() => picker?.click()}>
              <Glyph name="picture" size="md" />
            </IconBtn>
            <IconBtn
              title={canWrite ? 'Edit' : 'Only the owner may edit this'}
              disabled={!canWrite}
              onclick={openWriting}
            >
              <Glyph name="edit" size="md" />
            </IconBtn>
            <IconBtn title="Access" disabled={!canWrite} onclick={() => (accessOpen = true)}>
              <Glyph name="key" size="md" />
            </IconBtn>
            <IconBtn title="Choose the frame" disabled={!canWrite || !one.image} onclick={openFrame}>
              <Glyph name="gear" size="md" />
            </IconBtn>
            <IconBtn title={canWrite ? `Delete this ${shape.word}` : 'Only the owner may delete this'} disabled={!canWrite || busy} onclick={() => (dropOpen = true)}>
              <Glyph name="remove" size="md" />
            </IconBtn>
            <IconBtn title={tabsOpen ? 'Fold the head' : 'Unfold the head'} active={!tabsOpen} onclick={() => (tabsOpen = !tabsOpen)}>
              <Glyph name={tabsOpen ? 'fold' : 'unfold'} size="md" />
            </IconBtn>
          </span>
        {/if}
        <input
          bind:this={picker}
          class="page-pick"
          type="file"
          accept="image/*"
          aria-label="Add a picture"
          onchange={addImage}
        />
      </div>

        <div class="page-crown">
          <div class="page-title">
            {#if writing}
              <input
                class="dnd-heading dnd-heading-hero page-name page-title-host"
                placeholder="Name it"
                aria-label="Title"
                bind:value={one.title}
              />
            {:else}
              <h1 class="dnd-heading dnd-heading-hero page-name">{one.title}</h1>
            {/if}
          </div>

          {#if writing}
            <input
              class="page-lede-host"
              placeholder="A line that says what this is"
              aria-label="Description"
              bind:value={one.description}
            />
          {:else if one.description}
            <p class="page-lede">{one.description}</p>
          {/if}
        </div>

        <div class="page-head" use:unfold={tabsOpen}>
          {#if error}<p class="page-alarm" role="alert">{error}</p>{/if}
          {#if word}<p class="page-word">{word}</p>{/if}

          <section class="page-part" aria-label="What it is">
            {#if writing}
              <dl class="dnd-facts">
                {@render form?.(one)}
                <dt><label for="field-tags">Tags</label></dt>
                <dd>
                  <input id="field-tags" type="text" placeholder="Comma, separated" bind:value={tagLine} />
                </dd>
                {#each one.facts as fact, index (index)}
                  <dt>
                    <input class="page-fact-label" type="text" size="8" placeholder="Label" aria-label="Label" bind:value={fact.label} />
                  </dt>
                  <dd class="page-fact-line">
                    <input type="text" aria-label={fact.label || 'Value'} bind:value={fact.value} />
                    <IconBtn title="Remove the label" onclick={() => (one.facts = one.facts.filter((_, at) => at !== index))}>
                      <Glyph name="remove" size="sm" />
                    </IconBtn>
                  </dd>
                {/each}
              </dl>
              <IconBtn title="Add a label" onclick={() => (one.facts = [...one.facts, { label: '', value: '' }])}>
                <Glyph name="add" size="sm" />
              </IconBtn>
            {:else}
              <dl class="dnd-facts">
                {@render facts?.(one)}
                {#each one.facts as fact (fact)}
                  {#if fact.label}
                    <dt>{fact.label}</dt>
                    <dd>{fact.value}</dd>
                  {/if}
                {/each}
              </dl>

              {#if one.tags.length > 0}
                <div class="page-tags">
                  {#each one.tags as tag (tag)}<button type="button" class="page-tag" title="Search for #{tag}" onclick={() => uiStore.openSearchDialog(tag)}>#{tag}</button>{/each}
                </div>
              {/if}
            {/if}
          </section>
        </div>
        </div>
      </div>
    </header>

    <section class="page-body" aria-label="Content">
      {#if kids.length > 0}
        <header class="page-divide">
          <span class="page-divide-run"></span>
          <IconBtn title={asideOpen ? 'Hide the pages' : 'Show the pages'} active={asideOpen} onclick={() => (asideOpen = !asideOpen)}>
            <Glyph name="sources" size="sm" />
          </IconBtn>
        </header>
      {/if}

      {#if kids.length > 0}
        <div class="page-kids" use:unfold={asideOpen}>
          {#each kids as kid (kid.id)}
            <button type="button" class="page-kid" onclick={() => navigate(`${under}/${kid.id}`)}>
              {kid.title}
            </button>
          {/each}
        </div>
      {/if}

      {#if writing}
        <div class="page-write" class:page-write-blocks={blocksOpen}>
        <BlockEditor
          bind:this={editor}
          bind:value={one.content}
          onchange={share}
          requestMedia={getMedia}
          uploadFile={postMedia}
          openAsset={getAssetTab}
          onsearch={seek}
          onpage={addPage}
          placeholder="Write, or press slash for a block"
        />
        <Sidebar side="end" open={blocksOpen} run="calc(var(--space-8) * 3)">
          <BlockSidebar
            onadd={(command) => editor?.addBlock(command.kind, command.options)}
            ondrag={(command) => editor?.startExternalDrag(command.kind, command.options)}
            onclose={() => (blocksOpen = false)}
          />
        </Sidebar>
        </div>
      {:else}
        <BlockReader value={one.content} onopen={follow} onvote={vote} onsearch={seek} openAsset={getAssetTab} mine={$user?.user_id ?? ''} />
      {/if}
    </section>

    {#if fresh}
      <div class="page-acts-row">
        <Button variant="primary" loading={busy} disabled={!named} onclick={save}>
          Create the {shape.word}
        </Button>
        <Button variant="ghost" onclick={() => navigate(under)}>Cancel</Button>
      </div>
    {/if}

    {#if galleryOpen}
      <GalleryDialog
        bind:isOpen={galleryOpen}
        bind:at={galleryAt}
        images={one.images}
        main={one.image}
        alt={one.title}
        {canWrite}
        onmain={keepMain}
      />
    {/if}

    {#if frameOpen}
      <FrameDialog bind:isOpen={frameOpen} bind:frame src={one.image} alt={one.title} />
    {/if}

    {#if media}
      <MediaDialog
        kind={media.kind}
        current={media.current}
        getAssets={(query, wanted) => getAssets(query, wanted, scope)}
        uploadFile={postMedia}
        onclose={(asset) => {
          media?.resolve(asset)
          media = null
        }}
      />
    {/if}

    {#if dropOpen}
      <BaseDialog bind:isOpen={dropOpen} title="Delete {shape.word}" zIndex={9999}>
        <div class="page-drop">
          <p class="page-drop-lede">{one.title} goes for good, with its pictures and every edit written into it. Its sub pages stay on the roll.</p>
          <div class="page-drop-acts">
            <Button variant="ghost" disabled={busy} onclick={() => (dropOpen = false)}>Keep it</Button>
            <Button variant="danger" loading={busy} onclick={drop}>Delete</Button>
          </div>
        </div>
      </BaseDialog>
    {/if}

    {#if accessOpen}
      <ResourceAccess
        bind:isOpen={accessOpen}
        {owner}
        {campaign}
        {kind}
        bind:one
        onChange={reload}
      />
    {/if}
  {/if}
</Shell>

<style>
  .page-band-grid {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    align-items: start;
    gap: var(--space-6);
    min-width: 0;
  }

  .page-band-grid-bare {
    grid-template-columns: minmax(0, 1fr);
  }

  .page-side {
    display: grid;
    gap: var(--space-3);
    width: var(--page-face);
    max-width: 100%;
    min-width: 0;
  }

  .page-band-main {
    display: grid;
    gap: var(--space-4);
    min-width: 0;
  }

  .page-face {
    display: block;
    width: var(--page-face);
    height: var(--page-face);
    max-width: 100%;
    padding: 0;
    overflow: hidden;
    border: none;
    border-radius: var(--radius-lg);
    background: var(--texture-noise), linear-gradient(180deg, var(--ground-raised), var(--ground-deep));
    box-shadow: var(--rim), inset 0 0 16px 2px var(--shade-hard), var(--shadow-sm);
    cursor: zoom-in;
    transition: box-shadow 0.18s ease, filter 0.18s ease;
  }

  .page-face:hover {
    filter: brightness(1.06);
    box-shadow: var(--rim), inset 0 0 16px 2px var(--shade-hard), var(--shadow-md), 0 0 14px var(--ember-glow);
  }

  .page-face-traced {
    width: auto;
    aspect-ratio: 100 / 140;
    overflow: visible;
    border: none;
    border-radius: 0;
    background: none;
  }

  .page-face :global(img) {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .page-gallery-fold {
    display: grid;
  }

  .page-gallery {
    --page-shot: var(--space-7);
    display: flex;
    gap: var(--space-3);
    padding: var(--space-3);
    border: var(--border-hair) solid var(--metal-dim);
    border-radius: var(--radius-sm);
    background: var(--texture-noise), linear-gradient(180deg, var(--ground-deep), var(--ground));
    box-shadow: var(--bevel-down);
    overflow-x: auto;
    scroll-snap-type: x mandatory;
    scrollbar-width: thin;
  }

  .page-shot {
    flex: none;
    width: var(--page-shot);
    height: var(--page-shot);
    padding: 0;
    overflow: hidden;
    border: none;
    border-radius: var(--radius-sm);
    background: var(--ground-deep);
    box-shadow: var(--rim-thin), var(--shadow-sm);
    scroll-snap-align: start;
    cursor: zoom-in;
    opacity: 0.8;
    transition: opacity 0.15s ease, box-shadow 0.15s ease, filter 0.15s ease;
  }

  .page-shot:hover {
    opacity: 1;
    filter: brightness(1.08);
    box-shadow: var(--rim-thin), 0 0 12px var(--ember-glow);
  }
  @container (max-width: 40rem) {
    .page-band-grid {
      grid-template-columns: minmax(0, 1fr);
    }

    .page-side {
      order: 1;
      width: 100%;
    }

    .page-face {
      width: 100%;
      height: auto;
      aspect-ratio: 3 / 2;
    }
  }
  .page-crown {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    min-width: 0;
  }

  .page-eyebrow {
    margin: 0;
    color: var(--metal);
  }

  .page-step {
    padding: 0;
    border: none;
    background: none;
    font: inherit;
    color: var(--metal);
    cursor: pointer;
  }

  .page-step:hover {
    color: var(--metal-bright);
  }

  .page-step-mark {
    color: var(--ink-faint);
  }

  .page-title {
    display: flex;
    align-items: center;
    gap: var(--space-6);
    min-width: 0;
  }

  .page-name {
    margin: 0;
    min-width: 0;
  }

  .page-title-host {
    flex: 1;
    min-width: 0;
    padding: 0;
    border: none;
    border-radius: 0;
    background: none;
    color: var(--metal-bright);
    -webkit-text-fill-color: var(--metal-bright);
    filter: none;
    caret-color: var(--metal);
  }

  .page-title-host:focus-visible,
  .page-lede-host:focus-visible {
    outline: none;
    box-shadow: none;
  }

  .page-lede {
    margin: 0;
    max-width: 70ch;
    color: var(--ink-dim);
  }

  .page-lede-host {
    width: 100%;
    max-width: 70ch;
    padding: 0;
    border: none;
    border-radius: 0;
    background: none;
    font: inherit;
    color: var(--ink-dim);
    caret-color: var(--metal);
  }

  .page-head {
    --page-part: calc(var(--space-8) * 3);
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(var(--page-part), 100%), 1fr));
    align-items: start;
    gap: var(--space-5);
    min-width: 0;
  }

  .page-part {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--space-3);
    min-width: 0;
  }

  .page-shot-on {
    opacity: 1;
    box-shadow: var(--rim), 0 0 14px var(--ember-glow);
  }

  .page-shot :global(img) {
    display: block;
    width: 100%;
    aspect-ratio: 1;
    object-fit: cover;
  }

  .page-pick {
    display: none;
  }

  .page-fact-label {
    width: auto;
    color: var(--ink-dim);
  }

  .page-fact-line {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    height: var(--space-5);
  }

  .page-fact-line input {
    flex: 1;
  }

  .page-tags {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
  }

  .page-tag {
    padding: var(--space-0) var(--space-2);
    border: none;
    border-radius: var(--radius-sm);
    background: var(--texture-noise), linear-gradient(180deg, var(--ground-lift) 0%, var(--ground-deep) 100%);
    box-shadow: var(--rim-thin);
    font-family: var(--font-display);
    font-size: var(--text-xs);
    letter-spacing: var(--tracking-wide);
    color: var(--metal);
    text-shadow: 0 1px 0 #000;
    cursor: pointer;
    transition: color 0.15s ease, text-shadow 0.15s ease, box-shadow 0.15s ease;
  }

  .page-tag:hover {
    color: var(--metal-bright);
    text-shadow: var(--glow-text);
    box-shadow: var(--rim-thin), 0 0 10px var(--ember-glow);
  }

  .page-tag:active {
    filter: brightness(0.85);
  }

  .page-write {
    --page-blocks: 0px;
    display: grid;
    grid-template-columns: minmax(0, 1fr) var(--page-blocks);
    align-items: stretch;
    min-width: 0;
    transition: grid-template-columns 250ms ease-in-out;
  }

  .page-write-blocks {
    --page-blocks: calc(var(--space-8) * 3);
  }

  .page-body {
    display: flex;
    flex-direction: column;
    flex: 1;
    gap: var(--space-3);
    min-width: 0;
    min-height: 0;
  }

  .page-divide {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    height: var(--space-6);
    min-width: 0;
  }

  .page-divide-run {
    flex: 1;
    min-width: 0;
    height: var(--border-hair);
    background: linear-gradient(90deg, var(--metal), var(--metal-dim) 40%, transparent);
    box-shadow: 0 1px 0 #000;
  }

  .page-kids {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
  }

  .page-kid {
    padding: var(--space-1) var(--space-3);
    border: none;
    border-radius: var(--radius-sm);
    background:
      linear-gradient(180deg, color-mix(in srgb, var(--stone-light) 20%, transparent), color-mix(in srgb, #000 45%, transparent) 60%, color-mix(in srgb, #000 65%, transparent)),
      var(--texture-noise),
      var(--stone);
    box-shadow: var(--bevel-up), inset 0 0 0 1px var(--metal-dim);
    text-shadow: 0 1px 0 #000;
    transition: color 0.15s ease, text-shadow 0.15s ease, box-shadow 0.15s ease;
    font-family: var(--font-display);
    font-size: var(--text-xs);
    letter-spacing: var(--tracking-caps);
    text-transform: uppercase;
    color: var(--metal);
    cursor: pointer;
  }

  .page-kid:hover {
    color: var(--metal-bright);
    text-shadow: var(--glow-text);
    box-shadow: var(--bevel-up), inset 0 0 0 1px var(--metal);
  }

  .page-kid:active {
    filter: brightness(0.85);
    box-shadow: var(--bevel-down), inset 0 0 0 1px var(--metal-dim);
  }

  .page-acts-row {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-3);
  }

  .page-word {
    margin: 0;
    font-size: var(--text-sm);
    color: var(--ember-core);
    text-shadow: 0 0 8px var(--ember-glow), 0 1px 0 #000;
  }

  .page-drop {
    display: grid;
    gap: var(--space-4);
    padding: var(--space-5) var(--space-6) var(--space-6);
  }

  .page-drop-lede {
    margin: 0;
    font-size: var(--text-sm);
    color: var(--ink-dim);
  }

  .page-drop-acts {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-3);
  }

  .page-alarm {
    margin: 0;
    padding: var(--space-3);
    border: var(--border-hair) solid var(--state-bad);
    border-radius: var(--radius-sm);
    background: var(--texture-noise), linear-gradient(180deg, color-mix(in srgb, var(--state-bad) 14%, var(--ground-raised)), var(--ground-deep));
    box-shadow: var(--bevel-down);
    font-size: var(--text-sm);
    color: var(--ink);
  }
</style>
