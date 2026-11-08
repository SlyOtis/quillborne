<script lang="ts">
  import type { Snippet } from 'svelte'
  import { navigate, currentRoute, resolvedRoute } from 'sly-svelte-location-router'
  import { campaignService, userService, vehicleService } from '$lib/firestore.service'
  import type {
    Campaign,
    CampaignEncounter,
    CampaignMap,
    CharacterDocument,
    EncounterCombatant,
    Vehicle
  } from '$lib/firestore.types'
  import { getAll, getChildren, getRoots, isResourceKind, RESOURCES, type Npc, type Place, type Resource, type ResourceKind } from '$lib/resources'
  import { user } from '$lib/stores/auth.store'
  import { userCampaigns } from '$lib/stores/campaign.store'
  import Card from '$components/ui/Card.svelte'
  import Fold from '$components/ui/Fold.svelte'
  import Tree, { type TreeRow } from '$components/ui/Tree.svelte'
  import IconBtn from '$components/ui/IconBtn.svelte'
  import Glyph from '$components/ui/Glyph.svelte'
  import ShortcutDialog from '$components/ShortcutDialog.svelte'
  import { actionBlocks, getAction, shortcuts } from '$lib/actions'

  let addOpen = $state(false)
  let campaign = $state<Campaign | null>(null)
  let characters = $state<CharacterDocument[]>([])
  let npcs = $state<Npc[]>([])
  let places = $state<Place[]>([])
  let maps = $state<CampaignMap[]>([])
  let encounters = $state<CampaignEncounter[]>([])
  let vehicles = $state<Vehicle[]>([])
  let players = $state<{ id: string; name: string }[]>([])
  let loading = $state(false)
  let error = $state<string | null>(null)
  let open = $state(['campaign', 'party'])
  let reached = $state('')

  const steps = $derived($resolvedRoute.path.split('/').filter(Boolean).slice(1))
  const asked = $derived(steps[0] === 'campaign' ? steps[2] ?? '' : steps[0] ?? '')

  const here = $derived(
    isResourceKind(asked)
      ? asked
      : ($resolvedRoute.search ?? '').includes('tab=maps')
        ? 'maps'
        : 'campaign'
  )

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

  const ROLLS: ResourceKind[] = ['sessions', 'entries', 'items', 'weapons', 'armor']

  let more = $state<Record<string, Resource[]>>({})

  const isDm = $derived(Boolean(campaign && $user && campaign.dm_id === $user.uid))
  const party = $derived(
    [...characters].sort((a, b) => Number(b.owner_id === $user?.uid) - Number(a.owner_id === $user?.uid))
  )
  const lore = $derived(npcs.length + places.length)
  const knownEncounters = $derived(
    [...encounters].sort((a, b) => (Date.parse(b.created_at ?? '') || 0) - (Date.parse(a.created_at ?? '') || 0))
  )
  const encounter = $derived(knownEncounters.find((entry) => entry.is_active) ?? knownEncounters[0] ?? null)
  const combatants = $derived(encounter ? [...encounter.combatants].sort((a, b) => b.initiative - a.initiative) : [])
  const turn = $derived(encounter && combatants.length > 0 ? encounter.turn % combatants.length : -1)

  $effect(() => {
    const id = campaignId
    let live = true

    if (!id) {
      campaign = null
      characters = []
      npcs = []
      places = []
      maps = []
      encounters = []
      vehicles = []
      players = []
      error = null
      loading = false
      return
    }

    loading = true
    const release = campaignService.postEncountersListener(id, (entries) => {
      if (live) encounters = entries
    })
    const releaseVehicles = vehicleService.postVehiclesListener(id, (entries) => {
      if (live) vehicles = entries
    })
    error = null

    void (async () => {
      try {
        const [record, seated, cast, sites, charts] = await Promise.all([
          campaignService.getCampaign(id),
          campaignService.getCampaignCharacters(id),
          getAll({ at: 'campaigns', id }, 'npcs') as Promise<Npc[]>,
          getAll({ at: 'campaigns', id }, 'places') as Promise<Place[]>,
          campaignService.getMaps(id)
        ])
        if (!live) return
        campaign = record
        characters = seated
        npcs = cast
        places = sites
        maps = charts

        const held = await Promise.all(ROLLS.map((roll) => getAll({ at: 'campaigns', id }, roll)))
        if (!live) return
        more = Object.fromEntries(ROLLS.map((roll, index) => [roll, held[index]]))
        players = await Promise.all(
          record?.player_ids.map(async (uid) => ({
            id: uid,
            name: (await userService.getProfile(uid).catch(() => null))?.display_name || 'Unnamed player'
          })) ?? []
        )
      } catch (reason) {
        if (!live) return
        error = reason instanceof Error ? reason.message : String(reason)
      } finally {
        if (live) loading = false
      }
    })()

    return () => {
      live = false
      release()
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
    openCampaign(`/${kind}/${id}`)
  }

  function openCharacter(characterId: string) {
    navigate(`/main/character/${characterId}`)
  }

  function openCombatant(combatant: EncounterCombatant) {
    if (combatant.character_id) openCharacter(combatant.character_id)
    else openCampaign()
  }

  function hitPoints(combatant: EncounterCombatant) {
    return isDm || combatant.is_hit_points_known ? `${combatant.hit_points}/${combatant.max_hit_points}` : 'Hidden'
  }
</script>

<nav class="dnd-menu" aria-label="Campaign navigator">
  <header class="dnd-menu-head">
    {#if campaign}
      <button type="button" class="dnd-menu-name" onclick={() => openCampaign()}>{campaign.name}</button>
    {:else}
      <p class="dnd-menu-name dnd-menu-name-void">No campaign in scope</p>
    {/if}
  </header>

  <div class="dnd-scroll dnd-menu-body">
    {#if error}
      <p class="dnd-menu-note" role="alert">{error}</p>
    {/if}

    {@render section('campaign', 'Campaign details', players.length, details)}
    {@render section('party', 'Party', characters.length, roster)}
    {@render section('players', 'Players', players.length, table)}
    {@render section('npcs', 'NPCs', npcs.length, people)}
    {@render section('places', 'Places', places.length, sites)}
    {@render section('maps', 'Maps', maps.length, charts)}
    {@render section('encounters', 'Encounters', knownEncounters.length, frays)}
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
</nav>

{#if addOpen}
  <ShortcutDialog bind:isOpen={addOpen} />
{/if}

{#snippet section(id: string, title: string, count: number, body: Snippet)}
  <Fold {title} {count} variant="row" open={open.includes(id)} ontoggle={() => toggle(id)}>
    {@render body()}
  </Fold>
{/snippet}

{#snippet details()}
  {#if !campaign}
    <p class="dnd-menu-empty">No campaign is in scope.</p>
  {:else}
    <dl class="dnd-menu-facts">
      <div class="dnd-menu-fact">
        <dt>Players</dt>
        <dd>{campaign.player_ids.length}</dd>
      </div>
      <div class="dnd-menu-fact">
        <dt>Characters</dt>
        <dd>{characters.length}</dd>
      </div>
      <div class="dnd-menu-fact">
        <dt>Encounters</dt>
        <dd>{knownEncounters.length}</dd>
      </div>
    </dl>

    {#if campaign.description}
      <p class="dnd-menu-lede">{campaign.description}</p>
    {/if}

  {/if}
{/snippet}

{#snippet roster()}
  {#if party.length === 0}
    <p class="dnd-menu-empty">No character sits at the table yet.</p>
  {:else}
    <div class="dnd-scroll dnd-menu-cards">
      {#each party as entry (entry.id)}
        {@const mine = entry.owner_id === $user?.uid}
        <Card
          title={entry.metadata.name}
          sub="{mine ? 'Yours, ' : ''}{entry.metadata.race} {entry.metadata.class}"
          image={entry.character?.info?.imageUrl}
          badge="Lv {entry.metadata.level}"
          tone={mine ? 'ember' : 'metal'}
          on={steps[0] === 'character' && steps[1] === entry.id}
          onclick={() => openCharacter(entry.id)}
        />
      {/each}
    </div>
  {/if}
{/snippet}

{#snippet table()}
  {#if players.length === 0}
    <p class="dnd-menu-empty">Nobody has taken a seat.</p>
  {:else}
    <div class="dnd-scroll dnd-menu-cards">
      {#each players as player (player.id)}
        <Card
          title={player.name}
          sub={campaign?.dm_id === player.id ? 'Dungeon Master' : 'Player'}
          badge={campaign?.dm_id === player.id
            ? 'DM'
            : `${characters.filter((entry) => entry.owner_id === player.id).length} characters`}
          onclick={() => openCampaign('?tab=party')}
        />
      {/each}
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

{#snippet charts()}
  {#if maps.length === 0}
    <p class="dnd-menu-empty">No map has been drawn.</p>
  {:else}
    <div class="dnd-scroll dnd-menu-cards">
      {#each maps as chart (chart.id)}
        <Card
          title={chart.title}
          sub="{chart.layers.length} layers"
          image={chart.image_url}
          badge={chart.is_visible ? `${chart.markers.length} pins` : 'Hidden'}
          tone="verdigris"
          onclick={() => openCampaign(`?tab=maps&map=${chart.id}`)}
        />
      {/each}
    </div>
  {/if}
{/snippet}

{#snippet frays()}
  {#if knownEncounters.length === 0}
    <p class="dnd-menu-empty">No encounter has been set.</p>
  {:else}
    <div class="dnd-scroll dnd-menu-cards">
      {#each knownEncounters as fray (fray.id)}
        <Card
          title={fray.title}
          sub="{fray.combatants.length} in it"
          badge={fray.is_active ? `Round ${fray.round}` : undefined}
          tone="ember"
          onclick={() => openCampaign()}
        />
      {/each}
    </div>
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
    grid-template-rows: auto minmax(0, 1fr) auto;
    height: 100%;
    gap: var(--menu-gap);
    padding: var(--menu-pad);
    overflow: hidden;
    color: var(--menu-text);
  }

  .dnd-menu-head {
    display: grid;
    margin: calc(var(--menu-pad) * -1) calc(var(--menu-pad) * -1) 0;
    padding: var(--space-3) var(--menu-pad);
    background: var(--menu-stone);
    box-shadow: var(--bevel-up), inset 0 -1px 0 var(--keyline), 0 1px 0 var(--metal-dim), 0 2px 0 var(--metal), 0 3px 0 var(--keyline), 0 5px 8px var(--shade);
  }

  .dnd-menu-name {
    display: block;
    width: 100%;
    margin: 0;
    padding: 0;
    border: none;
    background: none;
    color: var(--metal);
    font-family: var(--font-display);
    font-size: var(--text-md);
    font-weight: 700;
    letter-spacing: var(--tracking-caps);
    text-transform: uppercase;
    line-height: 1.2;
    text-align: start;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    text-shadow: 0 1px 0 #000, 0 0 2px #000;
    cursor: pointer;
    transition: color 0.18s ease, text-shadow 0.18s ease;
  }

  .dnd-menu-name:hover {
    color: var(--metal-bright);
    text-shadow: var(--glow-text);
  }

  .dnd-menu-name:active {
    filter: brightness(0.85);
  }

  .dnd-menu-name:focus-visible {
    outline: none;
    color: var(--metal-bright);
    text-shadow: var(--glow-text);
  }

  .dnd-menu-name-void {
    color: var(--menu-text-faint);
    cursor: default;
  }

  .dnd-menu-name-void:hover {
    color: var(--menu-text-faint);
    text-shadow: 0 1px 0 #000;
  }

  .dnd-menu-body {
    display: flex;
    flex-direction: column;
    min-height: 0;
    margin-inline: calc(var(--menu-pad) * -1);
  }

  .dnd-menu-facts {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: var(--space-2);
    margin: 0;
  }

  .dnd-menu-fact {
    display: grid;
    justify-items: center;
    gap: var(--space-1);
    padding: var(--space-2) var(--space-1);
    background: var(--texture-noise), linear-gradient(180deg, var(--menu-surface-sunk) 0%, var(--ground) 100%);
    border-radius: var(--radius-sm);
    box-shadow: var(--rim-thin), var(--bevel-down);
  }

  .dnd-menu-fact dt {
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--metal);
    font-family: var(--font-display);
    font-size: var(--text-xs);
    letter-spacing: var(--tracking-caps);
    text-transform: uppercase;
    text-shadow: 0 1px 0 #000;
  }

  .dnd-menu-fact dd {
    margin: 0;
    color: var(--menu-accent);
    font-family: var(--font-figures);
    font-size: var(--text-lg);
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    line-height: 1;
    text-shadow: 0 1px 0 #000, 0 0 8px var(--ember-glow);
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

  .dnd-menu-lede {
    margin: 0;
    color: var(--menu-text-muted);
    font-size: var(--text-sm);
    line-height: 1.45;
  }


  .dnd-menu-cards {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    max-height: calc(var(--menu-row) * var(--menu-rows));
    overflow-y: auto;
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
    margin: 0 calc(var(--menu-pad) * -1) calc(var(--menu-pad) * -1);
    padding: var(--space-3) var(--menu-pad) var(--menu-pad);
    background: var(--menu-stone);
    box-shadow: var(--bevel-up), inset 0 1px 0 var(--keyline), inset 0 2px 0 var(--metal), inset 0 3px 0 var(--keyline), 0 -4px 10px var(--shade);
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
