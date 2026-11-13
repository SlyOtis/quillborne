<script lang="ts">
  import { getCampaign, getCampaignCharacters, getCampaignVehiclesStream } from '$lib/api'
  import type { Campaign, Character, Vehicle } from '$lib/api/types'
  import type { Snippet } from 'svelte'
  import { navigate, currentRoute, resolvedRoute } from 'sly-svelte-location-router'
  import { getAll, getChildren, getRoots, isResourceKind, RESOURCES, type Npc, type Place, type Resource, type ResourceKind } from '$lib/resources'
  import { user, userDetails, userProfile } from '$lib/stores/auth.store'
  import { userCampaigns } from '$lib/stores/campaign.store'
  import Fold from '$components/ui/Fold.svelte'
  import Tree, { type TreeRow } from '$components/ui/Tree.svelte'
  import IconBtn from '$components/ui/IconBtn.svelte'
  import Glyph from '$components/ui/Glyph.svelte'
  import ShortcutDialog from '$components/ShortcutDialog.svelte'
  import { actionBlocks, getAction, shortcuts } from '$lib/actions'
  import { uiStore } from '$lib/stores/ui.store'

  let addOpen = $state(false)
  let campaign = $state<Campaign | null>(null)
  let characters = $state<Character[]>([])
  let npcs = $state<Npc[]>([])
  let places = $state<Place[]>([])
  let vehicles = $state<Vehicle[]>([])
  let loading = $state(false)
  let error = $state<string | null>(null)
  let open = $state(['party'])
  let reached = $state('')

  const steps = $derived($resolvedRoute.path.split('/').filter(Boolean).slice(1))
  const asked = $derived(steps[0] === 'campaign' ? steps[2] ?? '' : steps[0] ?? '')

  const here = $derived(isResourceKind(asked) ? asked : 'campaign')

  const openId = $derived(steps[0] === 'campaign' ? steps[3] ?? '' : steps[1] ?? '')

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

  const ROLLS: ResourceKind[] = ['entries', 'items']
  const GEAR: ResourceKind[] = ['items', 'weapons', 'armor']
  let kinds = $state<Record<string, ResourceKind>>({})

  let more = $state<Record<string, Resource[]>>({})

  const isDm = $derived(Boolean(campaign && $user && campaign.dm_id === $user.user_id))
  const searchKey = navigator.userAgent.includes('Mac') ? 'Cmd K' : 'Ctrl K'
  const name = $derived($userDetails?.display_name || $userProfile?.display_name || 'Adventurer')
  const initial = $derived(name.charAt(0).toUpperCase())
  const party = $derived(
    [...characters].sort((a, b) => Number(b.owner_id === $user?.user_id) - Number(a.owner_id === $user?.user_id))
  )
  const lore = $derived(npcs.length + places.length)

  $effect(() => {
    const id = campaignId
    let live = true

    if (!id) {
      campaign = null
      characters = []
      npcs = []
      places = []
      vehicles = []
      error = null
      loading = false
      return
    }

    loading = true
    const releaseVehicles = getCampaignVehiclesStream(id, (entries) => {
      if (live) vehicles = entries
    })
    error = null

    void (async () => {
      try {
        const [record, seated, cast, sites] = await Promise.all([
          getCampaign(id),
          getCampaignCharacters(id),
          getAll({ at: 'campaign', id }, 'npcs') as Promise<Npc[]>,
          getAll({ at: 'campaign', id }, 'places') as Promise<Place[]>
        ])
        if (!live) return
        campaign = record
        characters = seated
        npcs = cast
        places = sites

        const [entries, ...gear] = await Promise.all(['entries' as ResourceKind, ...GEAR].map((roll) => getAll({ at: 'campaign', id }, roll)))
        if (!live) return
        kinds = Object.fromEntries(GEAR.flatMap((kind, index) => gear[index].map((row) => [row.id, kind])))
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
      releaseVehicles()
    }
  })

  function toggle(id: string) {
    open = open.includes(id) ? open.filter((held) => held !== id) : [...open, id]
  }

  function openCampaign(where = '') {
    if (campaign) navigate(`/main/campaign/${campaign.id}${where}`)
  }

  function twigs(rows: Resource[], kind: ResourceKind): TreeRow[] {
    const limb = (row: Resource): TreeRow => ({
      id: row.id,
      title: row.title,
      mark: RESOURCES[kind].mark(row),
      kids: getChildren(rows, row.id).map(limb)
    })
    return getRoots(rows).map(limb)
  }

  function openResource(kind: ResourceKind, id: string) {
    openCampaign(`/${kinds[id] ?? kind}/${id}`)
  }

  function openCharacter(characterId: string) {
    navigate(`/main/character/${characterId}`)
  }
</script>

<nav class="dnd-menu" aria-label="Campaign navigator">
  <div class="dnd-scroll dnd-menu-body">
    {#if error}
      <p class="dnd-menu-note" role="alert">{error}</p>
    {/if}

    {@render section('party', 'Party', characters.length, roster)}
    {@render section('npcs', 'NPCs', npcs.length, people)}
    {@render section('places', 'Places', places.length, sites)}
    {@render section('vehicles', 'Vehicles', vehicles.length, fleet)}
    {#each ROLLS as roll (roll)}
      <Fold
        title={RESOURCES[roll].many}
        count={(more[roll] ?? []).length}
        variant="row"
        open={open.includes(roll)}
        ontoggle={() => toggle(roll)}
      >
        {#if (more[roll] ?? []).length === 0}
          <p class="dnd-menu-empty">Nothing on this roll.</p>
        {:else}
          <div class="dnd-scroll dnd-menu-tree">
            <Tree rows={twigs(more[roll], roll)} on={openId} onopen={(id) => openResource(roll, id)} />
          </div>
        {/if}
      </Fold>
    {/each}
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
        </span>
      {/if}
    {/each}
    <span class="dnd-menu-foot-cell">
      <IconBtn title="Pin an action" tone="ink" onclick={() => (addOpen = true)}>
        <Glyph name="add" size="sm" />
      </IconBtn>
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

{#if addOpen}
  <ShortcutDialog bind:isOpen={addOpen} />
{/if}

{#snippet section(id: string, title: string, count: number, body: Snippet)}
  <Fold {title} {count} variant="row" open={open.includes(id)} ontoggle={() => toggle(id)}>
    {@render body()}
  </Fold>
{/snippet}

{#snippet roster()}
  {#if party.length === 0}
    <p class="dnd-menu-empty">No character sits at the table yet.</p>
  {:else}
    <div class="dnd-scroll dnd-menu-tree">
      <Tree
        rows={party.map((entry) => ({ id: entry.id, title: entry.metadata.name, mark: `${entry.owner_id === $user?.user_id ? 'Yours, ' : ''}Lv ${entry.metadata.level} ${entry.metadata.race} ${entry.metadata.class}`, kids: [] }))}
        on={steps[0] === 'character' ? (steps[1] ?? '') : ''}
        onopen={openCharacter}
      />
    </div>
  {/if}
{/snippet}

{#snippet fleet()}
  {#if vehicles.length === 0}
    <p class="dnd-menu-empty">No vessel sails with this table.</p>
  {:else}
    <div class="dnd-scroll dnd-menu-tree">
      <Tree
        rows={vehicles.map((entry) => ({ id: entry.id, title: entry.name, mark: `${entry.crew.length} crew`, kids: [] }))}
        on={steps[0] === 'vehicles' ? (steps[1] ?? '') : ''}
        onopen={(id) => navigate(`/main/vehicles/${id}`)}
      />
    </div>
  {/if}
  {#if campaign}
    <button type="button" class="dnd-menu-link" onclick={() => openCampaign('/vehicles')}>The campaign’s dock</button>
  {/if}
{/snippet}

{#snippet people()}
  {#if npcs.length === 0}
    <p class="dnd-menu-empty">No NPC has been written down.</p>
  {:else}
    <div class="dnd-scroll dnd-menu-tree">
      <Tree rows={twigs(npcs, 'npcs')} on={openId} onopen={(id) => openResource('npcs', id)} />
    </div>
  {/if}
{/snippet}

{#snippet sites()}
  {#if !campaign}
    <p class="dnd-menu-empty">No campaign is in scope.</p>
  {:else}
    {#if places.length === 0}
      <p class="dnd-menu-empty">No place has been revealed.</p>
    {:else}
      <div class="dnd-scroll dnd-menu-tree">
        <Tree rows={twigs(places, 'places')} on={openId} onopen={(id) => openResource('places', id)} />
      </div>
    {/if}
  {/if}
{/snippet}

<style>
  .dnd-menu {
    --menu-row: 2.6rem;
    --menu-rows: 5;
    --menu-gap: var(--space-3);
    --menu-pad: var(--space-4);
    --menu-line: var(--metal-dim);
    --menu-line-strong: var(--metal);
    --menu-surface: var(--ground-raised);
    --menu-surface-lift: var(--ground-lift);
    --menu-surface-sunk: var(--ground-deep);
    --menu-text: var(--ink);
    --menu-text-muted: var(--ink-dim);
    --menu-text-faint: var(--ink-faint);
    --menu-accent: var(--metal-bright);
    --menu-radius: var(--radius-sm);
    --menu-stone:
      linear-gradient(180deg, color-mix(in srgb, var(--stone-light) 20%, transparent) 0%, color-mix(in srgb, #000 45%, transparent) 60%, color-mix(in srgb, #000 65%, transparent) 100%),
      var(--texture-noise),
      var(--stone);

    display: grid;
    grid-template-rows: minmax(0, 1fr) auto auto;
    height: 100%;
    gap: var(--menu-gap);
    padding: var(--menu-pad);
    overflow: hidden;
    color: var(--menu-text);
  }

  .dnd-menu-body {
    display: flex;
    flex-direction: column;
    min-height: 0;
    margin-inline: calc(var(--menu-pad) * -1);
  }

  .dnd-menu-link {
    margin: var(--space-2) 0 0;
    padding: 0;
    border: none;
    background: none;
    font-family: var(--font-display);
    font-size: var(--text-xs);
    letter-spacing: var(--tracking-caps);
    text-transform: uppercase;
    color: var(--metal);
    cursor: pointer;
  }

  .dnd-menu-link:hover,
  .dnd-menu-link:focus-visible {
    color: var(--metal-bright);
    text-shadow: var(--glow-text);
  }


  .dnd-menu-tree {
    max-height: calc(var(--menu-row) * var(--menu-rows));
    overflow-y: auto;
  }

  .dnd-menu-empty {
    margin: 0;
    color: var(--menu-text-faint);
    font-size: var(--text-sm);
    font-style: italic;
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
    display: grid;
    grid-template-columns: repeat(auto-fill, var(--menu-row));
    justify-content: center;
    gap: var(--space-2);
    margin: 0 calc(var(--menu-pad) * -1) 0;
    padding: var(--space-3) var(--menu-pad);
    background: var(--menu-stone);
    box-shadow: var(--bevel-up), inset 0 1px 0 var(--keyline), inset 0 2px 0 var(--metal), inset 0 3px 0 var(--keyline), 0 -4px 10px var(--shade);
  }

  .dnd-menu-search {
    display: flex;
    flex: none;
    align-items: center;
    gap: var(--space-1);
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
    padding: var(--space-0) var(--space-2);
    border: var(--border-hair) solid var(--menu-line);
    border-radius: var(--radius-sm);
    font-family: var(--font-figures);
    font-size: var(--text-xs);
    font-weight: 400;
    color: var(--menu-text-muted);
  }

  .dnd-menu-user {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    min-width: 0;
    margin: calc(var(--menu-gap) * -1) calc(var(--menu-pad) * -1) calc(var(--menu-pad) * -1);
    padding: var(--space-2) var(--menu-pad);
    border-top: var(--border-hair) solid var(--menu-line);
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
    height: var(--menu-row);
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
