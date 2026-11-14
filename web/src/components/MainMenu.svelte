<script lang="ts">
  import { getCampaign, getMonsters, isNpc, putProfilePreferences } from '$lib/api'
  import type { Campaign, Monster, Owner } from '$lib/api/types'
  import type { Snippet } from 'svelte'
  import { navigate, currentRoute, resolvedRoute } from 'sly-svelte-location-router'
  import { getAll, getChildren, getRoots, isResourceKind, RESOURCES, type Resource, type ResourceKind } from '$lib/resources'
  import { user, userDetails, userProfile } from '$lib/stores/auth.store'
  import { userCampaigns } from '$lib/stores/campaign.store'
  import { currentCharacterId, userCharacters } from '$lib/stores/character.store'
  import Fold from '$components/ui/Fold.svelte'
  import Tree, { type TreeRow } from '$components/ui/Tree.svelte'
  import IconBtn from '$components/ui/IconBtn.svelte'
  import Glyph, { type GlyphName } from '$components/ui/Glyph.svelte'
  import SearchInput from '$components/ui/SearchInput.svelte'
  import Button from '$components/ui/Button.svelte'
  import { actionBlocks, getAction, shortcuts } from '$lib/actions'
  import { postNotice, uiStore } from '$lib/stores/ui.store'

  let campaign = $state<Campaign | null>(null)
  let loading = $state(false)
  let error = $state<string | null>(null)
  const arrived = new URLSearchParams(location.search)
  let open = $state(arrived.get('folds')?.split(',').filter(Boolean) ?? ['characters', 'campaigns'])
  let reached = $state('')
  let hunt = $state('')
  let monsters = $state<Monster[]>([])

  type Tab = 'table' | 'scribe'
  const TABS: { value: Tab; label: string }[] = [
    { value: 'table', label: 'Table' },
    { value: 'scribe', label: 'Scribe' }
  ]
  const TAB_KEY = 'quillborne.menu.tab'
  const isTab = (held: string | null): held is Tab => TABS.some((one) => one.value === held)

  function readTab(): Tab {
    const named = arrived.get('menu')
    if (isTab(named)) return named
    try {
      const held = sessionStorage.getItem(TAB_KEY)
      return isTab(held) ? held : 'table'
    } catch {
      return 'table'
    }
  }

  let tab = $state<Tab>(readTab())

  function putQuery(changes: Record<string, string | null>) {
    const next = new URLSearchParams($resolvedRoute.search ?? '')
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value)
      else next.delete(key)
    }
    const search = next.toString()
    navigate(`${$resolvedRoute.path}${search ? `?${search}` : ''}`)
  }

  function pickTab(next: string) {
    if (!isTab(next)) return
    tab = next
    try {
      sessionStorage.setItem(TAB_KEY, next)
    } catch {}
    putQuery({ menu: next })
  }

  function stepTab(event: KeyboardEvent) {
    const by = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0
    if (!by) return
    event.preventDefault()
    const at = TABS.findIndex((one) => one.value === tab)
    const next = TABS[(at + by + TABS.length) % TABS.length].value
    pickTab(next)
    document.getElementById(`menu-tab-${next}`)?.focus()
  }

  const steps = $derived($resolvedRoute.path.split('/').filter(Boolean).slice(1))
  const asked = $derived(steps[0] === 'campaign' ? steps[2] ?? '' : steps[0] ?? '')

  const here = $derived(
    steps[0] === 'character' ? 'characters' : steps[0] === 'monsters' ? 'monsters' : isResourceKind(asked) ? asked : 'campaigns'
  )

  const openId = $derived(steps[0] === 'campaign' ? steps[3] ?? '' : steps[1] ?? '')

  const scribeOpen = $derived(steps[0] === 'scribe' ? steps[1] ?? '' : '')

  $effect(() => {
    if (here === reached) return
    reached = here
    if (!open.includes(here)) open = [...open, here]
  })

  const campaignId = $derived(
    $currentRoute.path.startsWith('/main/campaign/')
      ? $currentRoute.params.id ?? ''
      : $userCampaigns[0]?.id ?? ''
  )

  const owner = $derived<Owner | null>(campaignId ? { at: 'campaign', id: campaignId } : $user ? { at: 'user', id: $user.user_id } : null)

  const GEAR: ResourceKind[] = ['items', 'weapons', 'armor']
  let kinds = $state<Record<string, ResourceKind>>({})

  let more = $state<Record<string, Resource[]>>({})

  const mine = $derived($userCharacters.filter((entry) => entry.owner_id === $user?.user_id && !isNpc(entry) && entry.campaign_id === campaignId))
  const activeId = $derived($userProfile?.preferences?.active_characters?.[campaignId])
  const current = $derived(
    $userCharacters.find((one) => one.id === ($currentCharacterId ?? activeId ?? $userProfile?.preferences?.recent_characters?.[0])) ?? null
  )
  const ownMonsters = $derived(monsters.filter((entry) => entry.owner_id === $user?.user_id))
  const monsterPath = $derived(steps[0] === 'monsters' ? $resolvedRoute.path : '')
  const searchKey = navigator.userAgent.includes('Mac') ? 'Cmd K' : 'Ctrl K'
  const name = $derived($userDetails?.display_name || $userProfile?.display_name || 'Adventurer')
  const initial = $derived(name.charAt(0).toUpperCase())

  $effect(() => {
    const id = campaignId
    const at = owner
    let live = true

    if (!at) {
      campaign = null
      error = null
      loading = false
      return
    }

    loading = true
    error = null

    void (async () => {
      try {
        const [record, entries, ...gear] = await Promise.all([
          id ? getCampaign(id) : Promise.resolve(null),
          getAll(at, 'entries'),
          ...(id ? GEAR.map((roll) => getAll(at, roll)) : [])
        ])
        if (!live) return
        campaign = record
        kinds = Object.fromEntries(GEAR.flatMap((kind, index) => (gear[index] ?? []).map((row) => [row.id, kind])))
        more = { entries, items: gear.flat() }
      } catch (reason) {
        if (!live) return
        error = reason instanceof Error ? reason.message : String(reason)
      } finally {
        if (live) loading = false
      }
    })()

    return () => {
      live = false
    }
  })

  $effect(() => {
    void monsterPath
    if (!$user) return
    let live = true
    getMonsters()
      .then((found) => live && (monsters = found))
      .catch((reason) => live && (error = reason instanceof Error ? reason.message : String(reason)))
    return () => {
      live = false
    }
  })

  function toggle(id: string) {
    open = open.includes(id) ? open.filter((held) => held !== id) : [...open, id]
    putQuery({ folds: open.join(',') || null })
  }

  function openCampaign(where = '') {
    if (campaign) navigate(`/main/campaign/${campaign.id}${where}`)
  }

  function twigs(rows: Resource[], kind: ResourceKind, glyph?: GlyphName): TreeRow[] {
    const limb = (row: Resource): TreeRow => ({
      id: row.id,
      title: row.title,
      mark: RESOURCES[kind].mark(row),
      glyph,
      kids: getChildren(rows, row.id).map(limb)
    })
    return getRoots(rows).map(limb)
  }

  const pages = $derived<TreeRow[]>(twigs(more.entries ?? [], 'entries', 'scroll'))

  function openResource(kind: ResourceKind, id: string) {
    openCampaign(`/${kinds[id] ?? kind}/${id}`)
  }

  function openPage(id: string) {
    navigate(`/main/scribe/${id}`)
  }

  function openCharacter(characterId: string) {
    navigate(`/main/character/${characterId}`)
  }

  function sheetOf(entry: (typeof $userCharacters)[number]): TreeRow {
    return {
      id: entry.id,
      title: entry.metadata.name,
      mark: `Lv ${entry.metadata.level} ${entry.metadata.race} ${entry.metadata.class}`,
      glyph: 'character',
      kids: []
    }
  }

  async function pickCharacter(characterId: string) {
    const held = $userProfile?.preferences
    if (held && campaignId) {
      const active_characters = { ...(held.active_characters ?? {}), [campaignId]: characterId }
      userProfile.update((profile) => (profile ? { ...profile, preferences: { ...profile.preferences, active_characters } } : profile))
      try {
        await putProfilePreferences({ ...held, active_characters })
      } catch (reason) {
        postNotice(reason instanceof Error ? reason.message : String(reason))
      }
    }
    openCharacter(characterId)
  }
</script>

<nav class="dnd-menu" class:dnd-sidebar-solid={tab === 'scribe'} aria-label="Campaign navigator">
  <div class="dnd-menu-rail">
    <div class="dnd-menu-tabs" role="tablist" aria-label="Navigator">
      {#each TABS as one (one.value)}
        <button
          type="button"
          role="tab"
          class="dnd-menu-tab"
          class:dnd-menu-tab-on={tab === one.value}
          id="menu-tab-{one.value}"
          aria-selected={tab === one.value}
          aria-controls="menu-panel-{one.value}"
          tabindex={tab === one.value ? 0 : -1}
          onclick={() => pickTab(one.value)}
          onkeydown={stepTab}
        >
          {one.label}
        </button>
      {/each}
    </div>
    <span class="dnd-menu-rail-acts">
      <IconBtn title="Open scribe" active={steps[0] === 'scribe'} onclick={() => navigate('/main/scribe')}>
        <Glyph name="edit" size="sm" />
      </IconBtn>
    </span>
  </div>

  <div class="dnd-scroll dnd-menu-body" role="tabpanel" id="menu-panel-{tab}" aria-labelledby="menu-tab-{tab}">
    {#if error}
      <p class="dnd-menu-note" role="alert">{error}</p>
    {/if}

    {#if tab === 'table'}
      {#if current}
        <div class="dnd-menu-tree dnd-menu-current">
          <Tree rows={[sheetOf(current)]} on={steps[0] === 'character' ? (steps[1] ?? '') : ''} onopen={openCharacter} />
        </div>
      {/if}
      {@render section('campaigns', 'Campaigns', $userCampaigns.length, tables)}
      {@render section('monsters', 'Monsters', ownMonsters.length, bestiary)}
      {#if mine.length > 1}
        {@render section('characters', 'Characters', mine.length, roster)}
      {/if}
      {@render roll('items')}
    {:else}
      <SearchInput bind:value={hunt} placeholder="Search the pages..." variant="band" />
      <div class="dnd-menu-pages">
        {#if loading}
          <div class="dnd-loading"><span class="dnd-spinner"></span></div>
        {:else}
          <div class="dnd-scroll dnd-menu-pages-tree">
            <Tree rows={pages} on={scribeOpen} search={hunt} onopen={openPage} />
          </div>
        {/if}
      </div>
    {/if}
  </div>

  <footer class="dnd-menu-foot" aria-label="Actions">
    {#each $shortcuts as pin (pin.action)}
      {@const action = getAction(pin.action)}
      {#if action}
        <span class="dnd-menu-foot-cell">
          <IconBtn
            title={$actionBlocks[action.id] ? `${action.title}: ${$actionBlocks[action.id]}` : pin.key ? `${action.title} (${pin.key})` : action.title}
            disabled={Boolean($actionBlocks[action.id])}
            onclick={action.run}
          >
            <Glyph name={action.glyph} size="sm" />
          </IconBtn>
          <span class="dnd-menu-foot-word">{action.title}</span>
        </span>
      {/if}
    {/each}
    <span class="dnd-menu-foot-cell">
      <IconBtn title="Pin an action" tone="ink" onclick={() => uiStore.openSearchDialog()}>
        <Glyph name="add" size="sm" />
      </IconBtn>
      <span class="dnd-menu-foot-word">Pin</span>
    </span>
  </footer>

  <div class="dnd-menu-user">
    <a class="dnd-menu-user-link" href="/main/user" title="Your profile">
      <span class="dnd-menu-user-initial">{initial}</span>
      <span class="dnd-menu-user-lines">
        <span class="dnd-menu-user-name">{name}</span>
        <span class="dnd-menu-user-mail">{$user?.email ?? ''}</span>
      </span>
    </a>
    <button type="button" class="dnd-menu-search" title="Search {searchKey}" onclick={uiStore.toggleSearchDialog}>
      <Glyph name="search" size="sm" />
      <kbd class="dnd-menu-search-key">{searchKey}</kbd>
    </button>
    <span class="dnd-menu-user-bell"><Glyph name="bell" size="sm" /></span>
  </div>
</nav>

{#snippet section(id: string, title: string, count: number, body: Snippet)}
  <Fold {title} {count} variant="row" open={open.includes(id)} ontoggle={() => toggle(id)}>
    {@render body()}
  </Fold>
{/snippet}

{#snippet roll(kind: ResourceKind)}
  <Fold
    title={RESOURCES[kind].many}
    count={(more[kind] ?? []).length}
    variant="row"
    open={open.includes(kind)}
    ontoggle={() => toggle(kind)}
  >
    {#if (more[kind] ?? []).length > 0}
      <div class="dnd-scroll dnd-menu-tree">
        <Tree rows={twigs(more[kind], kind)} on={openId} onopen={(id) => openResource(kind, id)} />
      </div>
    {/if}
  </Fold>
{/snippet}

{#snippet roster()}
  <div class="dnd-scroll dnd-menu-tree">
    <Tree rows={mine.map(sheetOf)} on={current?.id ?? ''} onopen={pickCharacter} />
  </div>
{/snippet}

{#snippet bestiary()}
  {#if ownMonsters.length === 0}
    <p class="dnd-menu-empty">You have made no monster yet.</p>
  {:else}
    <div class="dnd-scroll dnd-menu-tree">
      <Tree
        rows={ownMonsters.map((entry) => ({ id: entry.id, title: entry.name, mark: entry.is_public ? 'Shared' : 'Homebrew', kids: [] }))}
        on={steps[0] === 'monsters' ? (steps[1] ?? '') : ''}
        onopen={(id) => navigate(`/main/monsters/${id}`)}
      />
    </div>
  {/if}
  <Button variant="ghost" size="sm" fill onclick={() => navigate('/main/monsters')}>Open the bestiary</Button>
{/snippet}

{#snippet tables()}
  {#if $userCampaigns.length > 0}
    <div class="dnd-scroll dnd-menu-tree">
      <Tree
        rows={$userCampaigns.map((entry) => ({ id: entry.id, title: entry.name, mark: entry.dm_id === $user?.user_id ? 'DM' : '', kids: [] }))}
        on={steps[0] === 'campaign' ? (steps[1] ?? '') : ''}
        onopen={(id) => navigate(`/main/campaign/${id}`)}
      />
    </div>
  {/if}
{/snippet}

<style>
  .dnd-menu {
    --menu-row: 2.6rem;
    --menu-rows: 5;
    --menu-pad: var(--space-4);
    --menu-line: var(--metal-dim);
    --menu-surface: var(--ground-raised);
    --menu-surface-sunk: var(--ground-deep);
    --menu-surface-solid: var(--ground);
    --menu-text: var(--ink);
    --menu-text-muted: var(--ink-dim);
    --menu-text-faint: var(--ink-faint);
    --menu-accent: var(--metal-bright);
    --menu-accent-dim: var(--metal);
    --menu-hair: var(--border-hair) solid color-mix(in srgb, var(--metal-dim) 80%, transparent);

    display: grid;
    grid-template-rows: auto minmax(0, 1fr) auto auto;
    height: 100%;
    min-width: 0;
    overflow: hidden;
    color: var(--menu-text);
  }

  .dnd-menu-rail {
    position: relative;
    z-index: 2;
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: stretch;
    min-width: 0;
    background: var(--menu-surface-sunk);
    border-bottom: var(--menu-hair);
  }

  .dnd-menu-tabs {
    display: grid;
    grid-auto-flow: column;
    grid-auto-columns: minmax(0, 1fr);
    min-width: 0;
  }

  .dnd-menu-tab {
    min-width: 0;
    padding: var(--space-2) var(--menu-pad);
    border: none;
    background: transparent;
    font-family: var(--font-display);
    font-size: var(--text-xs);
    font-weight: 700;
    letter-spacing: var(--tracking-caps);
    text-transform: uppercase;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    color: var(--menu-accent-dim);
    cursor: pointer;
    transition: background-color 250ms ease-in-out, color 0.2s ease;
  }

  .dnd-menu-tab:hover {
    color: var(--menu-accent);
  }

  .dnd-menu-tab-on {
    background: var(--menu-surface-solid);
  }

  .dnd-menu-tab:focus-visible {
    outline: none;
    box-shadow: inset 0 0 0 2px var(--menu-accent);
  }

  .dnd-menu-rail-acts {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    padding-inline: var(--space-2);
  }

  .dnd-menu-rail :global(.dnd-iconbtn[title]:hover::after),
  .dnd-menu-rail :global(.dnd-iconbtn[title]:focus-visible::after) {
    top: calc(100% + var(--space-1));
    bottom: auto;
  }

  .dnd-menu-body {
    display: flex;
    flex-direction: column;
    min-width: 0;
    min-height: 0;
  }

  .dnd-menu-tree {
    max-height: calc(var(--menu-row) * var(--menu-rows));
    overflow-y: auto;
  }

  .dnd-menu-current {
    padding: var(--space-2) var(--menu-pad);
    border-bottom: var(--menu-hair);
  }

  .dnd-menu-pages {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: var(--space-3);
    min-height: 0;
    padding: var(--space-3) var(--menu-pad);
  }

  .dnd-menu-pages-tree {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
  }

  .dnd-menu-note {
    margin: var(--space-2) var(--menu-pad);
    padding: var(--space-3);
    background: var(--texture-noise), linear-gradient(180deg, var(--menu-surface-sunk) 0%, var(--menu-surface) 100%);
    border-radius: var(--radius-sm);
    box-shadow: var(--rim-thin), inset 0 0 12px 2px var(--shade-hard);
    color: var(--menu-text-muted);
    font-size: var(--text-sm);
    line-height: 1.45;
  }

  .dnd-menu-foot {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-start;
    align-items: center;
    gap: var(--space-2);
    min-width: 0;
    padding: var(--space-1) var(--space-2);
    border-top: var(--menu-hair);
  }

  .dnd-menu-search {
    position: relative;
    display: flex;
    flex: none;
    align-items: center;
    padding: var(--space-1);
    border: none;
    border-radius: var(--radius-sm);
    background: none;
    color: var(--menu-text-muted);
    cursor: pointer;
  }

  .dnd-menu-search:hover,
  .dnd-menu-search:focus-visible {
    color: var(--menu-accent);
  }

  .dnd-menu-search:focus-visible {
    outline: none;
    box-shadow: var(--focus-ring);
  }

  .dnd-menu-search-key {
    position: absolute;
    inset-block-start: 100%;
    inset-inline-start: 50%;
    transform: translateX(-50%);
    padding: 0 var(--space-1);
    border: var(--border-hair) solid var(--menu-line);
    border-radius: var(--radius-sm);
    font-family: var(--font-figures);
    font-size: calc(var(--text-xs) * 0.8);
    line-height: 1.4;
    white-space: nowrap;
    pointer-events: none;
    font-weight: 400;
    color: var(--menu-text-muted);
  }

  .dnd-menu-user {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    min-width: 0;
    padding: var(--space-2) var(--menu-pad);
    border-top: var(--menu-hair);
    background: var(--menu-surface-sunk);
    color: var(--menu-text);
  }

  .dnd-menu-user-link {
    display: flex;
    flex: 1;
    align-items: center;
    gap: var(--space-3);
    min-width: 0;
    border-radius: var(--radius-sm);
    color: inherit;
    text-decoration: none;
  }

  .dnd-menu-user-link:hover .dnd-menu-user-name,
  .dnd-menu-user-link:focus-visible .dnd-menu-user-name {
    color: var(--menu-accent);
  }

  .dnd-menu-user-link:focus-visible {
    outline: none;
    box-shadow: var(--focus-ring);
  }

  .dnd-menu-user-initial {
    display: flex;
    flex: none;
    align-items: center;
    justify-content: center;
    inline-size: var(--space-6);
    block-size: var(--space-6);
    border: var(--border-hair) solid var(--menu-line);
    border-radius: var(--radius-sm);
    font-family: var(--font-display);
    font-weight: 700;
    color: var(--menu-accent);
  }

  .dnd-menu-user-bell {
    display: flex;
    flex: none;
    padding: var(--space-1);
    color: var(--menu-text-muted);
  }

  .dnd-menu-user-lines {
    display: flex;
    flex: 1;
    flex-direction: column;
    min-width: 0;
  }

  .dnd-menu-user-name,
  .dnd-menu-user-mail {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .dnd-menu-user-name {
    font-family: var(--font-display);
    font-size: var(--text-sm);
    font-weight: 600;
  }

  .dnd-menu-user-mail {
    font-size: var(--text-xs);
    color: var(--menu-text-muted);
  }

  .dnd-menu-foot-cell {
    position: relative;
    display: flex;
    align-items: center;
    gap: var(--space-1);
    min-width: 0;
    padding-inline: var(--space-1);
  }

  .dnd-menu-foot-word {
    max-inline-size: calc(var(--menu-row) * 2);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-family: var(--font-display);
    font-size: calc(var(--text-xs) * 0.85);
    letter-spacing: var(--tracking-wide);
    color: var(--menu-text-muted);
  }

  .dnd-menu-foot-cell + .dnd-menu-foot-cell::before {
    content: '';
    position: absolute;
    inset-inline-start: calc((var(--space-2) + var(--border-hair)) / -2);
    top: 50%;
    width: var(--border-hair);
    height: var(--size-split);
    transform: translateY(-50%);
    background: linear-gradient(180deg, transparent, var(--metal-dim) 30%, var(--metal-dim) 70%, transparent);
    box-shadow: 1px 0 0 color-mix(in srgb, #000 70%, transparent);
    pointer-events: none;
  }
</style>
