<script lang="ts">
  import { getCampaign, getCampaignCharacters, getCampaignCharactersStream, getCampaignMaps, getCampaignMapsStream } from '$lib/api'
  import type { Campaign, CampaignMap, Encounter, MapMarkerKind, Party } from '$lib/api/types'
  import type * as api from '$lib/api/types'
  import { onDestroy, onMount, setContext } from 'svelte'
  import { unfold } from '$lib/unfold'
  import { navigate, resolvedRoute } from 'sly-svelte-location-router'
  import { getTheme, setTheme } from '$lib/dialogs/theme'
  import { getAll, isResourceKind, type Character, type Place, type Quest, type Session } from '$lib/resources'
  import { user } from '$lib/stores/auth.store'
  import { anyDialogOpen, uiStore } from '$lib/stores/ui.store'
  import Button from '$components/ui/Button.svelte'
  import Card from '$components/ui/Card.svelte'
  import Fold from '$components/ui/Fold.svelte'
  import CampaignBar, { SECTIONS, getSection } from '$components/campaign/CampaignBar.svelte'
  import CampaignEncounter from '$components/campaign/CampaignEncounter.svelte'
  import CampaignMaps from '$components/campaign/CampaignMaps.svelte'
  import CampaignMembers from '$components/campaign/CampaignMembers.svelte'
  import ResourceCard from '$components/campaign/ResourceCard.svelte'
  import Glyph from '$components/ui/Glyph.svelte'
  import IconBtn from '$components/ui/IconBtn.svelte'
  import Ornament from '$components/ui/Ornament.svelte'
  import Panel from '$components/ui/Panel.svelte'
  import BaseDialog from '$components/BaseDialog.svelte'
  import Shell from '$components/ui/Shell.svelte'
  import Stops from '$components/ui/Stops.svelte'
  import MenuPanel from '$components/MenuPanel.svelte'
  import Chat from '$chat/Chat.svelte'

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
    { id: 'maps', label: 'Maps' },
    { id: 'encounter', label: 'Encounter' },
    { id: 'members', label: 'Members' }
  ] as const

  const ROLLS = ['characters', 'items', 'places', 'entries'] as const

  let campaign = $state<Campaign | null>(null)
  let characters = $state<api.Character[]>([])
  let maps = $state<CampaignMap[]>([])
  let sessions = $state<Session[]>([])
  let quests = $state<Quest[]>([])
  let npcs = $state<Character[]>([])
  let places = $state<Place[]>([])
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

  const averageLevel = $derived(
    characters.length === 0
      ? 0
      : Math.round(characters.reduce((sum, entry) => sum + entry.metadata.level, 0) / characters.length)
  )
  const pins = $derived(maps.reduce((sum, entry) => sum + entry.markers.length, 0))
  const revealed = $derived(maps.filter((entry) => entry.is_visible).length)
  const latest = $derived(sessions[0] ?? null)
  const openQuests = $derived(quests.filter((quest) => quest.state === 'active'))

  const entries = $derived(
    npcs.length +
      places.length +
      quests.length +
      sessions.length
  )

  const CAP = 5

  let introOpen = $state(true)
  let more = $state<Record<string, boolean>>({ quests: false, characters: false, places: false })

  function cut<T>(rows: T[], id: string): T[] {
    return more[id] ? rows : rows.slice(0, CAP)
  }
  let tocOpen = $state(true)
  let chartsOpen = $state(false)

  const feed = $derived(
    [
      ...sessions.map((entry) => ({
        at: entry.created_at,
        tone: 'metal' as const,
        word: `Session ${entry.number}, ${entry.title}`,
        where: `/main/campaign/${campaignId}/sessions/${entry.id}`
      })),
      ...npcs.map((entry) => ({
        at: entry.created_at,
        tone: 'ember' as const,
        word: `Met ${entry.title}`,
        where: `/main/campaign/${campaignId}/characters/${entry.id}`
      })),
      ...places.map((entry) => ({
        at: entry.created_at,
        tone: 'verdigris' as const,
        word: `Found ${entry.title}`,
        where: `/main/campaign/${campaignId}/places/${entry.id}`
      })),
      ...quests.map((entry) => ({
        at: entry.created_at,
        tone: 'metal' as const,
        word: `${entry.state === 'active' ? 'Took up' : 'Closed'} ${entry.title}`,
        where: `/main/campaign/${campaignId}/quests/${entry.id}`
      })),
      ...maps.map((entry) => ({
        at: entry.created_at,
        tone: 'verdigris' as const,
        word: `Charted ${entry.title}`,
        where: `/main/campaign/${campaignId}/maps/${entry.id}`
      }))
    ]
      .sort((a, b) => (Date.parse(b.at ?? '') || 0) - (Date.parse(a.at ?? '') || 0))
      .map((entry, index) => ({
        id: `${index}-${entry.word}`,
        tone: entry.tone,
        word: entry.word,
        where: entry.where,
        when: entry.at ? new Date(entry.at).toLocaleDateString() : ''
      }))
  )

  const visibleMaps = $derived(isDm ? maps : maps.filter((entry) => entry.is_visible))

  const tocRoots = $derived(
    visibleMaps.filter((entry) => !entry.parent_map_id || !visibleMaps.some((one) => one.id === entry.parent_map_id))
  )

  function openSection(id: string) {
    const section = SECTIONS.find((entry) => entry.id === id)
    openRoll(section?.under[0]?.id ?? id)
  }

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
    const [party, board, log, tasks, cast, world] = await Promise.all([
      getCampaignCharacters(campaignId),
      getCampaignMaps(campaignId),
      getAll({ at: 'campaign', id: campaignId }, 'sessions') as Promise<Session[]>,
      getAll({ at: 'campaign', id: campaignId }, 'quests') as Promise<Quest[]>,
      getAll({ at: 'campaign', id: campaignId }, 'characters') as Promise<Character[]>,
      getAll({ at: 'campaign', id: campaignId }, 'places') as Promise<Place[]>
    ])

    characters = party
    maps = board
    sessions = log
    quests = tasks
    npcs = cast
    places = world
  }
</script>

{#snippet fold(id: string, total: number)}
  {#if total > CAP}
    <IconBtn
      title={more[id] ? `Show ${CAP} of ${total}` : `Show all ${total}`}
      active={more[id]}
      onclick={() => (more = { ...more, [id]: !more[id] })}
    >
      <Glyph name={more[id] ? 'fold' : 'unfold'} size="sm" />
    </IconBtn>
  {/if}
{/snippet}

{#snippet rest(id: string, total: number)}
  {#if total > CAP && !more[id]}
    <Button variant="ghost" size="sm" fill onclick={() => (more = { ...more, [id]: true })}>
      Show {total - CAP} more
    </Button>
  {/if}
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
  title={campaign?.name ?? 'Campaign'}
  back={() => navigate('/main')}
  width={tab === 'maps' ? 'full' : 'wide'}
  flush={tab === 'maps'}
>
  {#snippet menu()}
    <MenuPanel />
  {/snippet}

  {#snippet chat()}
    <Chat />
  {/snippet}

  {#snippet nav()}
    <Stops stops={SECTIONS} stop={getSection(tab)} onopen={openSection} />
  {/snippet}

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
        <section class="camp-plot camp-plot-roll" aria-label="Party">
          <header class="camp-divide">
            <h2 class="dnd-label camp-divide-name">Party</h2>
            <span class="camp-divide-note">{characters.length} on the roll, average level {averageLevel}</span>
            <span class="camp-divide-run"></span>
          </header>
          {#if characters.length === 0}
            <p class="camp-note">Nobody has joined the party yet.</p>
          {:else}
            <div class="camp-cards">
              {#each characters as entry (entry.id)}
                <Card
                  title={entry.metadata.name}
                  sub="{entry.metadata.race} {entry.metadata.class}"
                  image={entry.character?.info?.imageUrl}
                  badge="Lv {entry.metadata.level}"
                  onclick={() => navigate(`/main/character/${entry.id}`)}
                />
              {/each}
            </div>
          {/if}
        </section>

        <section class="camp-plot camp-plot-intro" aria-label="Introduction">
          <header class="camp-divide">
            <h2 class="dnd-label camp-divide-name">Introduction</h2>
            <span class="camp-divide-note">{latest ? `${sessions.length} sessions played` : 'not begun'}</span>
            <span class="camp-divide-run"></span>
            <button
              type="button"
              class="camp-fold"
              aria-expanded={introOpen}
              aria-label={introOpen ? 'Fold the introduction' : 'Unfold the introduction'}
              title={introOpen ? 'Fold the introduction' : 'Unfold the introduction'}
              onclick={() => (introOpen = !introOpen)}
            >
              <Glyph name={introOpen ? 'fold' : 'unfold'} size="sm" />
            </button>
          </header>
          <p class="camp-lede" class:camp-lede-folded={!introOpen}>{campaign.description}</p>
          {#if latest}
            <div class="camp-latest" use:unfold={introOpen}>
              <p class="camp-lead">{latest.number}. {latest.title}</p>
              <p class="camp-summary">{latest.description || 'Nothing was written down.'}</p>
            </div>
          {/if}
        </section>

        <section class="camp-plot camp-plot-quests" aria-label="Quests">
          <header class="camp-divide">
            <h2 class="dnd-label camp-divide-name">Quests</h2>
            <span class="camp-divide-note">{openQuests.length} open</span>
            <span class="camp-divide-run"></span>
            {@render fold('quests', openQuests.length)}
          </header>
          {#if openQuests.length === 0}
            <p class="camp-note">No quest stands open.</p>
          {:else}
            <div class="camp-list">
              {#each cut(openQuests, 'quests') as quest (quest.id)}
                <ResourceCard under="/main/campaign/{campaignId}/quests" kind="quests" one={quest} />
              {/each}
              {@render rest('quests', openQuests.length)}
            </div>
          {/if}
        </section>

        <section class="camp-plot camp-plot-characters" aria-label="Characters">
          <header class="camp-divide">
            <h2 class="dnd-label camp-divide-name">Characters</h2>
            <span class="camp-divide-note">{npcs.length} of {npcs.length} met</span>
            <span class="camp-divide-run"></span>
            {@render fold('characters', npcs.length)}
          </header>
          {#if npcs.length === 0}
            <p class="camp-note">Nobody has been met yet.</p>
          {:else}
            <div class="camp-list">
              {#each cut(npcs, 'characters') as npc (npc.id)}
                <ResourceCard under="/main/campaign/{campaignId}/characters" kind="characters" one={npc} tone="ember" />
              {/each}
              {@render rest('characters', npcs.length)}
            </div>
          {/if}
        </section>

        <section class="camp-plot camp-plot-places" aria-label="Places">
          <header class="camp-divide">
            <h2 class="dnd-label camp-divide-name">Places</h2>
            <span class="camp-divide-note">{places.length} places, {maps.length} maps</span>
            <span class="camp-divide-run"></span>
            {@render fold('places', places.length)}
          </header>
          {#if places.length === 0 && maps.length === 0}
            <p class="camp-note">Nothing has been charted yet.</p>
          {:else}
            <div class="camp-list">
              {#each cut(places, 'places') as place (place.id)}
                <ResourceCard under="/main/campaign/{campaignId}/places" kind="places" one={place} tone="verdigris" />
              {/each}
              {@render rest('places', places.length)}
            </div>
          {/if}
        </section>

        <aside class="camp-plot camp-plot-feed" aria-label="What has happened">
          <header class="camp-divide">
            <h2 class="dnd-label camp-divide-name">What happened</h2>
            <span class="camp-divide-note">{feed.length} entries</span>
            <span class="camp-divide-run"></span>
          </header>
          {#if feed.length === 0}
            <p class="camp-note">Nothing has happened yet.</p>
          {:else}
            <ol class="camp-feed">
              {#each feed as entry (entry.id)}
                <li>
                  <button type="button" class="camp-feed-line" onclick={() => navigate(entry.where)}>
                    <span class="camp-feed-mark" aria-hidden="true"><Ornament name="quatrefoil" size="xs" tone={entry.tone} /></span>
                    <span class="camp-feed-word">{entry.word}</span>
                    <span class="camp-feed-when">{entry.when}</span>
                  </button>
                </li>
              {/each}
            </ol>
          {/if}
        </aside>
      </div>
    {:else if tab === 'party'}
      <Panel title="Party">
        {#if characters.length === 0}
          <p class="camp-note">No character has joined this campaign yet.</p>
        {:else}
          <div class="camp-party">
            {#each characters as entry (entry.id)}
              <Card
                title={entry.metadata.name}
                sub="{entry.metadata.race} {entry.metadata.class}"
                image={entry.character?.info?.imageUrl}
                badge="Lv {entry.metadata.level}"
                onclick={() => navigate(`/main/character/${entry.id}`)}
              />
            {/each}
          </div>
        {/if}
      </Panel>
    {:else if tab === 'encounter'}
      <CampaignEncounter {campaign} {characters} {npcs} />
    {:else if tab === 'members'}
      <CampaignMembers bind:campaign {characters} onchange={reload} />
    {:else}
      <div class="camp-canvas">
        <CampaignMaps
          mode="canvas"
          {campaignId}
          {isDm}
          locations={places}
          {npcs}
          {quests}
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
            {quests}
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
  .camp-lede {
    max-width: 70ch;
    margin: 0;
    color: var(--ink);
  }

  .camp-lede-folded {
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .camp-grid {
    display: grid;
    --camp-side: calc(var(--space-8) * 3);
    --camp-side-share: 24%;
    grid-template-columns: minmax(0, 1fr) minmax(min(var(--camp-side), 100%), var(--camp-side-share));
    grid-template-areas:
      'roll feed'
      'intro feed'
      'quests feed'
      'characters feed'
      'places feed';
    align-content: start;
    column-gap: var(--space-6);
    row-gap: var(--space-6);
    min-width: 0;
  }

  .camp-plot {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    min-width: 0;
  }

  .camp-plot-roll {
    grid-area: roll;
  }

  .camp-plot-intro {
    grid-area: intro;
  }

  .camp-plot-quests {
    grid-area: quests;
  }

  .camp-plot-characters {
    grid-area: characters;
  }

  .camp-plot-places {
    grid-area: places;
  }

  .camp-plot-feed {
    grid-area: feed;
    align-self: stretch;
    padding: var(--space-4) var(--space-4) var(--space-5);
    border-radius: var(--radius-lg);
    background:
      radial-gradient(ellipse 90% 30% at 50% 0%, color-mix(in srgb, var(--ember) 7%, transparent) 0%, transparent 70%),
      var(--texture-noise),
      linear-gradient(180deg, var(--ground-raised), var(--ground-deep));
    box-shadow: var(--rim), inset 0 0 1rem 0.125rem var(--shade-hard), var(--shadow-md);
  }

  .camp-divide {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-3);
    min-width: 0;
  }

  .camp-plot-feed .camp-divide {
    position: sticky;
    top: 0;
    z-index: 1;
    margin: calc(-1 * var(--space-4)) calc(-1 * var(--space-4)) 0;
    padding: var(--space-3) var(--space-4);
    background:
      linear-gradient(180deg, color-mix(in srgb, var(--stone-light) 20%, transparent), color-mix(in srgb, var(--ground-deep) 45%, transparent) 60%, color-mix(in srgb, var(--ground-deep) 65%, transparent)),
      var(--texture-noise),
      var(--stone);
    box-shadow: var(--rim-thin), var(--bevel-up), 0 0.1875rem 0.375rem var(--shade);
  }

  .camp-divide-name {
    margin: 0;
    font-family: var(--font-display);
    font-size: var(--text-sm);
    font-weight: 700;
    letter-spacing: var(--tracking-caps);
    text-transform: uppercase;
    color: var(--metal-bright);
    text-shadow: 0 0.0625rem 0 var(--ground-deep), 0 0 0.625rem var(--ember-glow);
  }

  .camp-divide-note {
    font-family: var(--font-figures);
    letter-spacing: var(--tracking-wide);
    font-size: var(--text-xs);
    color: var(--ink-faint);
  }

  .camp-divide-run {
    flex: 1;
    min-width: 0;
    height: var(--border-hair);
    background: linear-gradient(90deg, var(--metal), var(--metal-dim) 40%, transparent);
    box-shadow: 0 0.0625rem 0 var(--ground-deep);
  }

  .camp-fold {
    display: flex;
    align-items: center;
    justify-content: center;
    flex: none;
    width: var(--space-6);
    height: var(--space-6);
    padding: 0;
    border: none;
    background: none;
    color: var(--metal);
    cursor: pointer;
    transition: color 0.15s ease, filter 0.15s ease;
  }

  .camp-fold:hover {
    color: var(--metal-bright);
    filter: drop-shadow(0 0 0.375rem var(--ember-glow));
  }

  .camp-fold:active {
    filter: brightness(0.85);
  }

  .camp-fold:focus-visible {
    outline: none;
    box-shadow: var(--focus-ring);
  }

  .camp-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    min-width: 0;
  }

  .camp-cards {
    display: grid;
    --camp-card: calc(var(--space-8) * 2.5);
    grid-template-columns: repeat(auto-fill, minmax(min(var(--camp-card), 100%), 1fr));
    gap: var(--space-4);
    min-width: 0;
  }

  .camp-feed {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .camp-feed-line {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: baseline;
    gap: var(--space-2);
    width: 100%;
    padding: var(--space-1) var(--space-2);
    border: none;
    border-radius: var(--radius-sm);
    background: none;
    font-size: var(--text-xs);
    text-align: start;
    cursor: pointer;
    transition: background 0.15s ease, box-shadow 0.15s ease;
  }

  .camp-feed-line:hover {
    background: linear-gradient(90deg, color-mix(in srgb, var(--ember) 14%, transparent), transparent);
    box-shadow: inset 0 0 0 0.0625rem color-mix(in srgb, var(--metal-dim) 70%, transparent);
  }

  .camp-feed-line:hover .camp-feed-word {
    color: var(--metal-bright);
    text-shadow: var(--glow-text);
  }

  .camp-feed-line:active {
    filter: brightness(0.85);
  }

  .camp-feed-line:focus-visible {
    outline: none;
    box-shadow: var(--focus-ring);
  }

  .camp-feed-mark {
    color: var(--metal);
  }

  .camp-feed-word {
    min-width: 0;
    color: var(--ink);
  }

  .camp-feed-when {
    font-family: var(--font-figures);
    font-variant-numeric: lining-nums tabular-nums;
    color: var(--ink-faint);
  }

  @container page (max-width: 900px) {
    .camp-grid {
      grid-template-columns: minmax(0, 1fr);
      grid-template-areas:
        'roll'
        'intro'
        'feed'
        'quests'
        'characters'
        'places';
    }

    .camp-plot-feed {
      align-self: start;
    }
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

  .camp-lead {
    margin: 0;
    font-family: var(--font-display);
    font-size: var(--text-sm);
    color: var(--metal);
    text-shadow: 0 0.0625rem 0 var(--ground-deep);
  }

  .camp-latest {
    display: grid;
    gap: var(--space-2);
  }

  .camp-summary {
    margin: 0;
    font-size: var(--text-sm);
    color: var(--ink);
    display: -webkit-box;
    -webkit-line-clamp: 3;
    line-clamp: 3;
    -webkit-box-orient: vertical;
    overflow: hidden;
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
