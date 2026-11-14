<script lang="ts">
  import { getAssetTab, getCampaign } from '$lib/api'
  import type { Campaign, Owner } from '$lib/api/types'
  import { onMount, setContext, type Snippet } from 'svelte'
  import { navigate, resolvedRoute } from 'sly-svelte-location-router'
  import { getTheme, setTheme } from '$lib/dialogs/theme'
  import { user } from '$lib/stores/auth.store'
  import { anyDialogOpen, uiStore } from '$lib/stores/ui.store'
  import {
    deleteOne,
    getAll,
    isResourceKind,
    postOne,
    putOne,
    RESOURCES,
    type Resource,
    type ResourceKind
  } from '$lib/resources'
  import { SECTIONS, getSection } from '$components/campaign/CampaignBar.svelte'
  import BlockReader from '$components/ui/BlockReader.svelte'
  import Button from '$components/ui/Button.svelte'
  import Chip from '$components/ui/Chip.svelte'
  import Glyph from '$components/ui/Glyph.svelte'
  import IconBtn from '$components/ui/IconBtn.svelte'
  import PageHead from '$components/ui/PageHead.svelte'
  import SearchInput from '$components/ui/SearchInput.svelte'
  import Shell from '$components/ui/Shell.svelte'
  import Stops from '$components/ui/Stops.svelte'
  import StoredImage from '$components/ui/StoredImage.svelte'

  const {
    kind,
    row,
    tools,
    order,
    keep
  }: {
    /** Which resource the roll is for. */
    kind: ResourceKind
    /** How this type draws one of its own on the roll. Handed the resource, the address under it and the peek. */
    row?: Snippet<[Resource, string, (one: Resource) => void]>
    /** The type's own controls, drawn in the bar before the tags. */
    tools?: Snippet
    /** How this type orders its own. Falls back to the title. */
    order?: (a: Resource, b: Resource) => number
    /** What this type filters its own by, on top of the search and the tags. */
    keep?: (one: Resource) => boolean
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

  let campaign = $state<Campaign | null>(null)
  let rows = $state<Resource[]>([])
  let groups = $state<Resource[]>([])
  let loading = $state(true)
  let error = $state<string | null>(null)
  let hunt = $state('')

  const canArrange = $derived(Boolean(campaign && $user && campaign.dm_id === $user.user_id))

  let picked = $state<string[]>([])
  let took = $state('')

  let arranging = $state(false)
  let naming = $state(false)
  let groupName = $state('')
  let renaming = $state<string | null>(null)
  let hauled = $state<string | null>(null)
  let over = $state<string | null>(null)
  let shut = $state<Record<string, boolean>>({})
  let busy = $state(false)

  let peeked = $state<Resource | null>(null)

  $effect(() => {
    const asked = new URLSearchParams($resolvedRoute.search).get('tag') ?? ''
    if (asked === took) return
    took = asked
    picked = asked ? [asked] : []
  })

  const allTags = $derived([...new Set(rows.flatMap((row) => row.tags))].sort())

  function sift(held: Resource[]): Resource[] {
    return held
      .filter((row) => row.title.toLowerCase().includes(hunt.trim().toLowerCase()))
      .filter((row) => picked.length === 0 || picked.every((tag) => row.tags.includes(tag)))
      .filter((row) => !keep || keep(row))
      .sort(order ?? ((a, b) => a.title.localeCompare(b.title)))
  }

  const shown = $derived(sift(rows))

  const limbs = $derived(
    groups
      .slice()
      .sort((a, b) => a.title.localeCompare(b.title))
      .map((group) => ({ group, kids: shown.filter((one) => one.group_id === group.id) }))
      .filter((limb) => arranging || limb.kids.length > 0)
  )
  const loose = $derived(shown.filter((one) => !groups.some((group) => group.id === one.group_id)))

  onMount(() => setTheme(getTheme()))

  let read = $state('')

  $effect(() => {
    if (!owner.id) return
    const now = `${owner.at}/${owner.id}/${kind}`
    if (now === read) return
    read = now
    void reload()
  })

  function openStop(stop: string) {
    if (stop === 'vehicles') {
      navigate(campaignId ? `/main/campaign/${campaignId}/vehicles` : '/main/vehicles')
      return
    }
    if (isResourceKind(stop)) {
      navigate(campaignId ? `/main/campaign/${campaignId}/${stop}` : `/main/${stop}`)
      return
    }
    navigate(stop === 'overview' ? `/main/campaign/${campaignId}` : `/main/campaign/${campaignId}?tab=${stop}`)
  }

  async function reload() {
    loading = true
    try {
      campaign = campaignId ? await getCampaign(campaignId) : null
      ;[rows, groups] = await Promise.all([getAll(owner, kind), getAll(owner, kind, true)])
      if (peeked) peeked = rows.find((one) => one.id === peeked?.id) ?? null
    } catch (reason) {
      error = reason instanceof Error ? reason.message : String(reason)
    } finally {
      loading = false
    }
  }

  function peek(one: Resource) {
    peeked = peeked?.id === one.id ? null : one
  }

  async function write(task: () => Promise<void>) {
    busy = true
    error = null
    try {
      await task()
      await reload()
    } catch (reason) {
      error = reason instanceof Error ? reason.message : String(reason)
    } finally {
      busy = false
    }
  }

  function addGroup() {
    const title = groupName.trim()
    if (!title) return
    naming = false
    groupName = ''
    void write(async () => {
      const held = {
        title,
        description: '',
        tags: [],
        images: [],
        image: '',
        frame: '',
        content: '',
        parent_id: '',
        group: true,
        group_id: '',
        owner_id: $user?.user_id ?? '',
        share_campaigns: campaignId ? [campaignId] : [],
        share_users: []
      }
      await postOne(owner, kind, held)
    })
  }

  function rename(group: Resource, title: string) {
    renaming = null
    const next = title.trim()
    if (!next || next === group.title) return
    void write(() => putOne(owner, kind, group.id, { ...group, title: next }))
  }

  function dropGroup(group: Resource) {
    void write(async () => {
      const kids = rows.filter((one) => one.group_id === group.id)
      for (const kid of kids) await putOne(owner, kind, kid.id, { ...kid, group_id: '' })
      await deleteOne(owner, kind, group)
    })
  }

  function lift(event: DragEvent, one: Resource) {
    hauled = one.id
    event.dataTransfer?.setData('text/plain', one.id)
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move'
  }

  function hover(event: DragEvent, groupId: string) {
    if (!hauled) return
    event.preventDefault()
    over = groupId
  }

  function land(event: DragEvent, groupId: string) {
    event.preventDefault()
    const id = hauled
    hauled = null
    over = null
    const one = rows.find((entry) => entry.id === id)
    if (!one || one.group_id === groupId) return
    void write(() => putOne(owner, kind, one.id, { ...one, group_id: groupId }))
  }

  function settle() {
    hauled = null
    over = null
  }
</script>

{#snippet leaf(one: Resource)}
  <div
    class="roll-leaf"
    class:roll-leaf-hauled={hauled === one.id}
    role="listitem"
    draggable={arranging}
    ondragstart={(event) => lift(event, one)}
    ondragend={settle}
  >
    {@render row?.(one, under, peek)}
  </div>
{/snippet}

<Shell drawers title={shape.many} width="full" back={() => navigate(campaignId ? `/main/campaign/${campaignId}` : "/main")}>
  {#snippet nav()}
    <Stops
      stops={SECTIONS.find((one) => one.id === getSection(kind))?.under ?? []}
      stop={kind}
      onopen={openStop}
    />
  {/snippet}

  <PageHead
    title={shape.many}
    count="{shown.length} of {rows.length}{groups.length > 0 ? `, in ${groups.length} groups` : ''}"
    crumbs={[{ id: '', title: campaign ? campaign.name : 'Your own' }]}
    {tools}
  >
    {#snippet actions()}
      {#if arranging}
        <IconBtn title="New group" disabled={busy} onclick={() => (naming = true)}>
          <Glyph name="group" size="md" />
        </IconBtn>
        <IconBtn title="Done arranging" tone="verdigris" active onclick={() => (arranging = false)}>
          <Glyph name="save" size="md" />
        </IconBtn>
      {:else}
        <IconBtn title="Add {shape.word}" onclick={() => navigate(`${under}/create`)}>
          <Glyph name="add" size="md" />
        </IconBtn>
        {#if canArrange}
          <IconBtn title="Arrange into groups" onclick={() => (arranging = true)}>
            <Glyph name="edit" size="md" />
          </IconBtn>
        {/if}
      {/if}
    {/snippet}
    {#snippet center()}
      <SearchInput bind:value={hunt} bind:tags={picked} options={allTags} placeholder="Search the {shape.words}..." label="Search {shape.many}" />
    {/snippet}
  </PageHead>

  <div class="roll-hold" class:roll-hold-peeking={Boolean(peeked)}>
    <div class="roll-tree" class:roll-tree-arranging={arranging}>
      {#if error}
        <p class="roll-alarm" role="alert">{error}</p>
      {/if}

      {#if naming}
        <form
          class="roll-group-name"
          onsubmit={(event) => {
            event.preventDefault()
            addGroup()
          }}
        >
          <input class="dnd-search" placeholder="Name the group" aria-label="Group name" bind:value={groupName} />
          <Button variant="primary" size="sm" disabled={!groupName.trim()}>Make it</Button>
          <Button variant="ghost" size="sm" onclick={() => (naming = false)}>Cancel</Button>
        </form>
      {/if}

      {#if loading}
        <div class="dnd-loading"><span class="dnd-spinner"></span></div>
      {:else if shown.length === 0 && limbs.length === 0}
        <p class="roll-note">Nothing here yet.</p>
      {:else}
        {@render tree()}
      {/if}
    </div>

    {#if peeked}
      <aside class="roll-peek" aria-label={peeked.title}>
        <header class="roll-peek-divide">
          <h2 class="dnd-label roll-peek-name">{shape.one}</h2>
          <span class="roll-peek-note">{shape.mark(peeked)}</span>
          <span class="roll-peek-run"></span>
          <IconBtn title="Open" onclick={() => navigate(`${under}/${peeked?.id}`)}>
            <Glyph name="forward" size="sm" />
          </IconBtn>
          <IconBtn title="Close" onclick={() => (peeked = null)}>
            <Glyph name="close" size="sm" />
          </IconBtn>
        </header>

        {#if peeked.image}
          <span class="roll-peek-face"><StoredImage src={peeked.image} alt={peeked.title} /></span>
        {/if}

        <h3 class="dnd-heading roll-peek-title">{peeked.title}</h3>
        {#if peeked.description}
          <p class="roll-peek-lede">{peeked.description}</p>
        {/if}

        {#if peeked.tags.length > 0}
          <div class="roll-peek-tags">
            {#each peeked.tags as tag (tag)}<Chip still glyph="tag">#{tag}</Chip>{/each}
          </div>
        {/if}

        <div class="roll-peek-body">
          <BlockReader value={peeked.content} openAsset={getAssetTab} />
        </div>
      </aside>
    {/if}
  </div>
</Shell>

{#snippet tree()}
        {#each limbs as limb (limb.group.id)}
          {@const open = !shut[limb.group.id]}
          <section
            class="roll-group"
            class:roll-group-over={over === limb.group.id}
            role="group"
            ondragover={(event) => hover(event, limb.group.id)}
            ondragleave={() => (over = null)}
            ondrop={(event) => land(event, limb.group.id)}
          >
            <header class="roll-group-band">
              {#if renaming === limb.group.id}
                <input
                  class="dnd-search roll-group-host"
                  value={limb.group.title}
                  aria-label="Group name"
                  onblur={(event) => rename(limb.group, event.currentTarget.value)}
                  onkeydown={(event) => {
                    if (event.key === 'Enter') event.currentTarget.blur()
                    if (event.key === 'Escape') renaming = null
                  }}
                />
              {:else}
                <h2 class="dnd-label roll-group-title">{limb.group.title}</h2>
              {/if}
              <span class="roll-group-count">{limb.kids.length}</span>
              <span class="roll-group-run"></span>

              {#if arranging}
                <IconBtn title="Rename the group" disabled={busy} onclick={() => (renaming = limb.group.id)}>
                  <Glyph name="edit" size="sm" />
                </IconBtn>
                <IconBtn title="Dissolve the group" tone="ember" disabled={busy} onclick={() => dropGroup(limb.group)}>
                  <Glyph name="remove" size="sm" />
                </IconBtn>
              {/if}
              <button
                type="button"
                class="roll-group-caret"
                class:roll-group-caret-open={open}
                aria-expanded={open}
                aria-label={open ? `Fold ${limb.group.title}` : `Unfold ${limb.group.title}`}
                onclick={() => (shut = { ...shut, [limb.group.id]: open })}
              ></button>
            </header>

            <div class="roll-group-body" class:roll-group-body-open={open} inert={!open}>
              <div class="roll-list">
                {#each limb.kids as one (one.id)}
                  {@render leaf(one)}
                {/each}
                {#if arranging && limb.kids.length === 0}
                  <p class="roll-note">Drop {shape.words} here.</p>
                {/if}
              </div>
            </div>
          </section>
        {/each}

        <div
          class="roll-list roll-loose"
          class:roll-group-over={over === ''}
          role="presentation"
          ondragover={(event) => hover(event, '')}
          ondragleave={() => (over = null)}
          ondrop={(event) => land(event, '')}
        >
          {#if limbs.length > 0 && loose.length > 0}
            <header class="roll-group-band">
              <h2 class="dnd-label roll-group-title">Ungrouped</h2>
              <span class="roll-group-count">{loose.length}</span>
              <span class="roll-group-run"></span>
            </header>
          {/if}
          {#each loose as one (one.id)}
            {@render leaf(one)}
          {/each}
          {#if arranging && limbs.length > 0 && loose.length === 0}
            <p class="roll-note">Drop here to take one out of its group.</p>
          {/if}
        </div>
{/snippet}

<style>
  .roll-hold {
    --roll-side: calc(var(--space-8) * 3);
    --roll-side-share: 30%;
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    align-items: start;
    gap: var(--space-6);
    min-width: 0;
  }

  .roll-hold-peeking {
    grid-template-columns: minmax(0, 1fr) minmax(min(var(--roll-side), 100%), var(--roll-side-share));
  }

  .roll-tree {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    min-width: 0;
  }

  .roll-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    min-width: 0;
  }

  .roll-loose {
    padding: var(--space-2);
    margin: calc(-1 * var(--space-2));
    border: var(--border-hair) solid transparent;
    border-radius: var(--radius-sm);
  }

  .roll-leaf {
    min-width: 0;
  }

  .roll-tree-arranging .roll-leaf {
    cursor: grab;
  }

  .roll-leaf-hauled {
    opacity: 0.4;
  }

  .roll-group {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    padding: var(--space-2);
    margin: calc(-1 * var(--space-2));
    border: var(--border-hair) solid transparent;
    border-radius: var(--radius-md);
    min-width: 0;
  }

  .roll-group-over {
    border-color: var(--metal);
    background: color-mix(in srgb, var(--ember) 8%, transparent);
    box-shadow: 0 0 14px var(--ember-glow);
  }

  .roll-group-band {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    min-height: var(--space-7);
    min-width: 0;
  }

  .roll-group-caret {
    --roll-caret: 0.32rem;
    flex: none;
    width: 0;
    height: 0;
    padding: 0;
    border: none;
    border-left: var(--roll-caret) solid transparent;
    border-right: var(--roll-caret) solid transparent;
    border-top: calc(var(--roll-caret) * 1.6) solid var(--metal);
    background: none;
    cursor: pointer;
    transform: rotate(-90deg);
    transition: transform 0.15s ease;
  }

  .roll-group-caret-open {
    transform: rotate(0);
  }

  .roll-group-title,
  .roll-peek-name {
    margin: 0;
    color: var(--metal-bright);
  }

  .roll-group-host {
    flex: 0 1 calc(var(--space-8) * 3);
    width: auto;
  }

  .roll-group-count,
  .roll-peek-note {
    font-family: var(--font-figures);
    font-size: var(--text-xs);
    color: var(--ink-faint);
  }

  .roll-group-run,
  .roll-peek-run {
    flex: 1;
    min-width: 0;
    height: var(--border-hair);
    background: linear-gradient(90deg, var(--metal), var(--metal-dim) 40%, transparent);
    box-shadow: 0 1px 0 var(--shadow-ink);
  }

  .roll-group-body {
    display: grid;
    grid-template-rows: 0fr;
    padding-inline-start: var(--space-4);
    transition: grid-template-rows 0.22s cubic-bezier(0.4, 0, 0.2, 1);
  }

  .roll-group-body-open {
    grid-template-rows: 1fr;
  }

  .roll-group-body > * {
    min-height: 0;
    overflow: hidden;
  }

  .roll-group-name {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    min-width: 0;
  }

  .roll-group-name .dnd-search {
    flex: 0 1 calc(var(--space-8) * 3);
    width: auto;
  }

  .roll-peek {
    position: sticky;
    top: var(--space-4);
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    min-width: 0;
    padding: var(--space-5);
    border: none;
    border-radius: var(--radius-lg);
    background: var(--texture-noise), linear-gradient(180deg, var(--ground-raised), var(--ground-deep));
    box-shadow: var(--rim), inset 0 0 16px 2px var(--shade-hard), var(--shadow-md);
  }

  .roll-peek-divide {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    min-width: 0;
  }

  .roll-peek-face {
    display: block;
    width: 100%;
    aspect-ratio: 3 / 2;
    overflow: hidden;
    border: none;
    border-radius: var(--radius-sm);
    box-shadow: var(--rim-thin), var(--shadow-sm);
  }

  .roll-peek-face :global(img) {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .roll-peek-title {
    margin: 0;
  }

  .roll-peek-lede {
    margin: 0;
    color: var(--ink-dim);
  }

  .roll-peek-tags {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
  }

  .roll-peek-body {
    min-width: 0;
  }

  .roll-note {
    margin: 0;
    font-size: var(--text-sm);
    font-style: italic;
    color: var(--ink-faint);
  }

  .roll-alarm {
    margin: 0;
    padding: var(--space-3);
    border: var(--border-hair) solid var(--state-bad);
    border-radius: var(--radius-sm);
    background: var(--texture-noise), linear-gradient(180deg, color-mix(in srgb, var(--state-bad) 14%, var(--ground-raised)), var(--ground-deep));
    box-shadow: var(--bevel-down);
    font-size: var(--text-sm);
    color: var(--ink);
  }

  @container (max-width: 50rem) {
    .roll-hold-peeking {
      grid-template-columns: minmax(0, 1fr);
    }

    .roll-peek {
      position: static;
    }
  }
</style>
