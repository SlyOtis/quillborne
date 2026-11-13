<script lang="ts">
  import { getCampaign, getCampaignCharacters, getCampaignCharactersStream, getCampaignMaps, getCampaignMapsStream, getProfiles, isNpc, NPC_TAG, postCharacter } from '$lib/api'
  import type { Campaign, CampaignMap, Character, Encounter, MapMarkerKind } from '$lib/api/types'
  import { onDestroy, onMount, setContext } from 'svelte'
  import { navigate, resolvedRoute } from 'sly-svelte-location-router'
  import { getTheme, setTheme } from '$lib/dialogs/theme'
  import { getAll, isResourceKind, type Place, type Resource } from '$lib/resources'
  import { getDocument, getDocumentText } from '$lib/blocks'
  import { getAbilities, getEmptyCharacter } from '$lib/engine'
  import { getSystemStack } from '$lib/rules/system'
  import { user } from '$lib/stores/auth.store'
  import { anyDialogOpen, postNotice, uiStore } from '$lib/stores/ui.store'
  import Button from '$components/ui/Button.svelte'
  import Card from '$components/ui/Card.svelte'
  import Fold from '$components/ui/Fold.svelte'
  import CampaignBar from '$components/campaign/CampaignBar.svelte'
  import CampaignEncounter from '$components/campaign/CampaignEncounter.svelte'
  import CampaignMaps from '$components/campaign/CampaignMaps.svelte'
  import CampaignMembers from '$components/campaign/CampaignMembers.svelte'
  import Glyph from '$components/ui/Glyph.svelte'
  import IconBtn from '$components/ui/IconBtn.svelte'
  import Panel from '$components/ui/Panel.svelte'
  import Section from '$components/ui/Section.svelte'
  import BaseDialog from '$components/BaseDialog.svelte'
  import Shell from '$components/ui/Shell.svelte'

  const { route }: { route?: { params?: Record<string, string> } } = $props()

  setContext('dialogState', {
    get isAnyDialogOpen() {
      return $anyDialogOpen
    },
    setDialogState: uiStore.setDialogState
  })

  const TABS = [
    { id: 'overview', label: 'Overview' },
    { id: 'party', label: 'Party' },
    { id: 'npcs', label: 'NPCs' },
    { id: 'maps', label: 'Maps' },
    { id: 'encounter', label: 'Encounter' },
    { id: 'members', label: 'Members' }
  ] as const

  let campaign = $state<Campaign | null>(null)
  let characters = $state<Character[]>([])
  let maps = $state<CampaignMap[]>([])
  let places = $state<Place[]>([])
  let entries = $state<Resource[]>([])
  let owners = $state<Record<string, string>>({})
  let loading = $state(true)
  let error = $state<string | null>(null)
  const asked = $derived(new URLSearchParams($resolvedRoute.search))
  let tab = $state<(typeof TABS)[number]['id']>('overview')
  let mapId = $state<string | null>(null)

  $effect(() => {
    const wanted = asked.get('tab')
    tab = TABS.find((entry) => entry.id === wanted)?.id ?? 'overview'
    mapId = asked.get('map')
  })
  let placing = $state<MapMarkerKind | null>(null)
  let editing = $state<string | null>(null)

  const campaignId = $derived(route?.params?.id ?? '')
  const isDm = $derived(Boolean(campaign && $user && campaign.dm_id === $user.user_id))

  const seated = $derived(characters.filter((entry) => !isNpc(entry)))
  const npcs = $derived(characters.filter(isNpc))
  const pins = $derived(maps.reduce((sum, entry) => sum + entry.markers.length, 0))
  const revealed = $derived(maps.filter((entry) => entry.is_visible).length)
  const party = $derived(
    [...seated].sort((a, b) => Number(b.owner_id === $user?.user_id) - Number(a.owner_id === $user?.user_id))
  )
  const yours = $derived(seated.filter((entry) => entry.owner_id === $user?.user_id).length)
  const lore = $derived(
    [...entries].sort((a, b) => String(b.created_at ?? '').localeCompare(String(a.created_at ?? ''))).slice(0, 6)
  )
  let tocOpen = $state(true)
  let chartsOpen = $state(false)

  const visibleMaps = $derived(isDm ? maps : maps.filter((entry) => entry.is_visible))

  const tocRoots = $derived(
    visibleMaps.filter((entry) => !entry.parent_map_id || !visibleMaps.some((one) => one.id === entry.parent_map_id))
  )

  function openRoll(where: string) {
    if (where === 'vehicles') {
      navigate(`/main/campaign/${campaignId}/vehicles`)
      return
    }
    if (isResourceKind(where)) {
      navigate(`/main/campaign/${campaignId}/${where}`)
      return
    }
    if (TABS.some((entry) => entry.id === where)) {
      tab = where as (typeof TABS)[number]['id']
    }
  }

  async function addNpc() {
    try {
      const empty = getEmptyCharacter()
      const system = await getSystemStack(empty.systems)
      const sheet = {
        ...empty,
        info: { ...empty.info, name: 'New NPC' },
        abilities: getAbilities(Object.fromEntries(system.attributes.map((spec) => [spec.id, spec.default])))
      }
      const id = await postCharacter(sheet, { tags: [NPC_TAG] }, campaignId)
      navigate(`/main/character/${id}`)
    } catch (reason) {
      postNotice(reason instanceof Error ? reason.message : String(reason))
    }
  }

  function childrenOf(parentId: string) {
    return visibleMaps.filter((entry) => entry.parent_map_id === parentId)
  }

  let stopMaps: (() => void) | null = null
  let stopCharacters: (() => void) | null = null

  onMount(async () => {
    setTheme(getTheme())

    if (!campaignId) {
      error = 'No campaign was named in the address.'
      loading = false
      return
    }

    try {
      campaign = await getCampaign(campaignId)
      if (!campaign) {
        error = 'That campaign does not exist, or you are not part of it.'
        return
      }
      await reload()
    } catch (reason) {
      error = reason instanceof Error ? reason.message : String(reason)
    } finally {
      loading = false
    }

    stopMaps = getCampaignMapsStream(campaignId, (loaded) => {
      maps = loaded.sort((a, b) => a.title.localeCompare(b.title))
    })
    stopCharacters = getCampaignCharactersStream(campaignId, (loaded) => {
      characters = loaded
    })
  })

  onDestroy(() => {
    stopMaps?.()
    stopCharacters?.()
  })

  async function reload() {
    const [held, board, world, written, seen] = await Promise.all([
      getCampaignCharacters(campaignId),
      getCampaignMaps(campaignId),
      getAll({ at: 'campaign', id: campaignId }, 'places') as Promise<Place[]>,
      getAll({ at: 'campaign', id: campaignId }, 'entries'),
      getProfiles(campaign ? [campaign.dm_id, ...campaign.player_ids] : [])
    ])

    characters = held
    maps = board
    places = world
    entries = written
    owners = Object.fromEntries(seen.map((one) => [one.user_id, one.display_name || one.email]))
  }
</script>

{#snippet seat(entry: Character)}
  {@const mine = entry.owner_id === $user?.user_id}
  <Card
    title={entry.metadata.name}
    sub="{mine ? 'Yours, ' : ''}{entry.metadata.race} {entry.metadata.class}"
    image={entry.character?.info?.imageUrl}
    badge="Lv {entry.metadata.level}"
    tone={mine ? 'ember' : 'metal'}
    onclick={() => navigate(`/main/character/${entry.id}`)}
  />
{/snippet}

{#snippet tile(entry: Character)}
  {@const mine = entry.owner_id === $user?.user_id}
  <Card
    layout="tile"
    frame={mine ? 'heavy' : 'thin'}
    title={entry.metadata.name}
    sub="Level {entry.metadata.level} {entry.metadata.race} {entry.metadata.class}"
    image={entry.character?.info?.imageUrl}
    badge={String(entry.metadata.level)}
    tone={mine ? 'ember' : 'metal'}
    onclick={() => navigate(`/main/character/${entry.id}`)}
  >
    {#if !mine}<span class="camp-owner">{owners[entry.owner_id] ?? 'Another player'}</span>{/if}
    <span>HP {entry.character?.info?.hp?.current ?? 0}/{entry.character?.info?.hp?.max ?? 0}</span>
    <span>AC {entry.character?.info?.ac ?? 10}</span>
  </Card>
{/snippet}

{#snippet create()}
  <div class="camp-acts">
    <Button variant="secondary" size="sm" onclick={() => navigate(`/main/create/character?campaign=${campaignId}`)}>New character</Button>
    <Button variant="secondary" size="sm" onclick={addNpc}>New NPC</Button>
  </div>
{/snippet}

{#snippet branch(entry: CampaignMap)}
  {@const kin = childrenOf(entry.id)}
  <button
    type="button"
    class="camp-toc-row"
    class:camp-toc-row-on={mapId === entry.id}
    onclick={() => (mapId = entry.id)}
  >
    <span class="camp-toc-row-name">{entry.title}</span>
    <span class="camp-toc-row-meta">{entry.markers.length} pins</span>
  </button>

  {#if kin.length > 0}
    <div class="camp-toc-nest">
      {#each kin as child (child.id)}
        {@render branch(child)}
      {/each}
    </div>
  {/if}
{/snippet}

<Shell
  drawers
  title={campaign?.name ?? 'Campaign'}
  back={() => navigate('/main')}
  width={tab === 'maps' ? 'full' : 'wide'}
  flush={tab === 'maps'}
>
  {#snippet band()}
    <CampaignBar stop={tab} onopen={openRoll}>
      {#snippet tail()}
        {#if tab === 'maps'}
          <Button variant="secondary" size="sm" onclick={() => (chartsOpen = true)}>Charts</Button>
        {/if}
      {/snippet}
    </CampaignBar>
  {/snippet}

  {#if loading}
    <div class="dnd-loading"><span class="dnd-spinner"></span></div>
  {:else if error}
    <div class="camp-alarm" role="alert">
      <p class="camp-alarm-text">{error}</p>
      <Button variant="secondary" size="sm" onclick={() => navigate('/main')}>Back to the table</Button>
    </div>
  {:else if campaign}
    {#if tab === 'overview'}
      <div class="camp-grid">
        <Section title="Party" note="{seated.length} at the table, {yours} yours" count={party.length}>
          {#snippet actions()}
            <IconBtn title="Forge a new character" onclick={() => navigate(`/main/create/character?campaign=${campaignId}`)}><Glyph name="character" size="sm" /></IconBtn>
          {/snippet}
          {#if party.length === 0}
            <p class="camp-note">No character sits at the table yet.</p>
          {:else}
            <div class="camp-tiles">
              {#each party as entry (entry.id)}
                {@render tile(entry)}
              {/each}
            </div>
          {/if}
        </Section>

        <Section title="NPCs" note="{npcs.length} met" count={npcs.length}>
          {#snippet actions()}
            <IconBtn title="Add an NPC" onclick={addNpc}><Glyph name="add" size="sm" /></IconBtn>
          {/snippet}
          {#if npcs.length === 0}
            <p class="camp-note">Nobody has been met yet.</p>
          {:else}
            <div class="camp-tiles">
              {#each npcs as npc (npc.id)}
                {@render tile(npc)}
              {/each}
            </div>
          {/if}
        </Section>

        <Section title="Lore" note={lore.length === 0 ? 'Nothing written yet' : 'The latest entries'} count={lore.length}>
          {#snippet actions()}
            <IconBtn title="Write lore" onclick={() => openRoll('entries')}><Glyph name="edit" size="sm" /></IconBtn>
          {/snippet}
          {#if lore.length > 0}
            <div class="camp-lore">
              {#each lore as entry (entry.id)}
                <Card
                  layout="square"
                  title={entry.title}
                  sub={getDocumentText(getDocument(entry.content))}
                  tags={entry.tags}
                  image={entry.image}
                  tone="metal"
                  onclick={() => navigate(`/main/campaign/${campaignId}/entries/${entry.id}`)}
                />
              {/each}
            </div>
          {/if}
        </Section>
      </div>
    {:else if tab === 'party'}
      <Panel title="Party">
        {#if party.length === 0}
          <p class="camp-note">No character sits at the table yet. Bring one from Players.</p>
        {:else}
          <div class="camp-tiles">
            {#each party as entry (entry.id)}
              {@render tile(entry)}
            {/each}
          </div>
        {/if}
        {@render create()}
      </Panel>
    {:else if tab === 'npcs'}
      <Panel title="NPCs">
        {#snippet actions()}
          <Button variant="secondary" size="sm" onclick={addNpc}>Add an NPC</Button>
        {/snippet}
        {#if npcs.length === 0}
          <p class="camp-note">Nobody has been met yet.</p>
        {:else}
          <div class="camp-party">
            {#each npcs as entry (entry.id)}
              {@render seat(entry)}
            {/each}
          </div>
        {/if}
      </Panel>
    {:else if tab === 'encounter'}
      <CampaignEncounter {campaign} characters={seated} {npcs} />
    {:else if tab === 'members'}
      <CampaignMembers bind:campaign characters={seated} onchange={reload} />
    {:else}
      <div class="camp-canvas">
        <CampaignMaps
          mode="canvas"
          {campaignId}
          {isDm}
          locations={places}
          {npcs}
          {maps}
          bind:selectedId={mapId}
          bind:placing
          bind:editing
        />
      </div>
    {/if}

    {#if chartsOpen}
      <BaseDialog bind:isOpen={chartsOpen} title="Charts" width="420px" zIndex={9999}>
        <div class="camp-charts">
          <Fold title="Maps" count={visibleMaps.length} open={tocOpen} ontoggle={() => (tocOpen = !tocOpen)}>
            {#if visibleMaps.length === 0}
              <p class="camp-note">No map has been charted.</p>
            {:else}
              {#each tocRoots as root (root.id)}
                {@render branch(root)}
              {/each}
            {/if}
          </Fold>

          <CampaignMaps
            mode="tools"
            {campaignId}
            {isDm}
            locations={places}
            {npcs}
            {maps}
            bind:selectedId={mapId}
            bind:placing
            bind:editing
          />
        </div>
      </BaseDialog>
    {/if}

  {/if}
</Shell>

<style>
  .camp-grid {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    align-content: start;
    row-gap: var(--space-6);
    min-width: 0;
  }

  .camp-lore {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(min(18rem, 100%), 1fr));
    gap: var(--space-4);
    min-width: 0;
  }

  .camp-acts {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-3);
  }

  .camp-tiles {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-4);
    min-width: 0;
  }

  .camp-owner {
    flex-basis: 100%;
    font-family: var(--font-body);
    font-style: italic;
    color: var(--ink);
  }

  .camp-charts {
    display: grid;
    gap: var(--space-4);
    padding: var(--space-5) var(--space-6) var(--space-6);
  }

  .camp-canvas {
    display: flex;
    flex: 1;
    min-width: 0;
    min-height: 0;
  }

  .camp-toc-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-2) var(--space-3);
    background: var(--texture-noise), linear-gradient(180deg, var(--ground-raised), var(--ground-deep));
    border: none;
    border-radius: var(--radius-sm);
    box-shadow: var(--rim-thin), inset 0 0 1rem 0.125rem var(--shade-hard);
    color: var(--ink);
    font-family: var(--font-body);
    font-size: var(--text-sm);
    text-align: start;
    cursor: pointer;
    transition: box-shadow 0.15s ease, filter 0.15s ease, color 0.15s ease;
  }

  .camp-toc-row:hover {
    color: var(--metal-bright);
    filter: brightness(1.06);
    box-shadow: var(--rim-thin), inset 0 0 1rem 0.125rem var(--shade-hard), 0 0 0.75rem color-mix(in srgb, var(--metal) 35%, transparent);
  }

  .camp-toc-row:active {
    filter: brightness(0.85);
  }

  .camp-toc-row-on {
    color: var(--metal-bright);
    background:
      radial-gradient(ellipse 60% 120% at 0% 50%, var(--ember-glow) 0%, transparent 70%),
      var(--texture-noise),
      linear-gradient(180deg, var(--ground-lift), var(--ground-deep));
    box-shadow: var(--rim), inset 0 0 1rem 0.125rem var(--shade-hard), 0 0 0.875rem var(--ember-glow);
  }

  .camp-toc-row:focus-visible {
    outline: none;
    box-shadow: var(--focus-ring);
  }

  .camp-toc-nest {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    padding-inline-start: var(--space-4);
    border-inline-start: var(--border-hair) solid var(--metal-dim);
    margin-inline-start: var(--space-3);
  }

  .camp-toc-row-name {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .camp-toc-row-meta {
    font-family: var(--font-figures);
    font-size: var(--text-xs);
    color: var(--ink-faint);
  }

  .camp-party {
    --camp-face: calc(var(--space-8) * 4);
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(var(--camp-face), 100%), 1fr));
    gap: var(--space-3);
    min-width: 0;
  }

  .camp-note {
    margin: 0;
    font-size: var(--text-sm);
    color: var(--ink-dim);
  }

  .camp-alarm {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-4);
    border: var(--border-hair) solid var(--state-bad);
    border-radius: var(--radius-sm);
    background: var(--texture-noise), linear-gradient(180deg, color-mix(in srgb, var(--state-bad) 14%, var(--ground-raised)), var(--ground-deep));
    box-shadow: var(--bevel-down);
  }

  .camp-alarm-text {
    flex: 1;
    min-width: 0;
    margin: 0;
    font-size: var(--text-sm);
    color: var(--ink);
  }
</style>
