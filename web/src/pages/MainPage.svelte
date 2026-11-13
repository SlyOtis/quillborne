<script lang="ts">
  import { getCampaigns, getCharacters } from '$lib/api'
  import type { Campaign, Character } from '$lib/api/types'
  import { getTheme, setTheme } from "$lib/dialogs/theme";
  import { onMount, setContext, onDestroy } from "svelte";
  import { getCharacterStore } from "$lib/engine";
  import type { CharacterContext } from "$lib/types";
  import { sidebarStore } from "$lib/navigation";
  import { uiStore, anyDialogOpen, postNotice } from "$lib/stores/ui.store";
  import { getRecentFirst, userCharacters } from "$lib/stores/character.store";
  import { userCampaigns } from "$lib/stores/campaign.store";
  import { user, userProfile, userDetails } from "$lib/stores/auth.store";
  import { getAll, type Resource } from "$lib/resources";
  import { navigate } from "sly-svelte-location-router";
  import CharactersPanel from "./main/CharactersPanel.svelte";
  import CampaignsPanel from "./main/CampaignsPanel.svelte";
  import { KINDS, TONES } from "./main/LorePanel.svelte";
  import Card from "$components/ui/Card.svelte";
  import ResourceCard from "$components/campaign/ResourceCard.svelte";
  import Portrait from "$components/ui/Portrait.svelte";
  import Button from "$components/ui/Button.svelte";
  import Shell from "$components/ui/Shell.svelte";
  import Sigil from "$components/ui/Sigil.svelte";
  import Glyph from "$components/ui/Glyph.svelte";

  const {unsubscribe, ...chStore} = getCharacterStore('local')
  const unsubscribeSidebar = sidebarStore.subscribe(() => {});

  setContext<CharacterContext>('character', chStore);
  setContext('sidebar', sidebarStore)
  setContext('dialogState', {
    get isAnyDialogOpen() {
      return $anyDialogOpen;
    },
    setDialogState: uiStore.setDialogState
  });

  let loading = $state(true);
  let lore = $state<Record<string, Resource[]>>({});

  const name = $derived($userDetails?.display_name || $userProfile?.display_name || 'Adventurer');
  const items = $derived([...(lore.items ?? []), ...(lore.weapons ?? []), ...(lore.armor ?? [])]);
  const written = $derived(KINDS.reduce((sum, kind) => sum + (lore[kind]?.length ?? 0), 0));
  const newestCampaign = $derived($userCampaigns[0] ?? null);
  const newestCharacter = $derived(getRecentFirst($userCharacters, $userProfile?.preferences?.recent_characters ?? [])[0] ?? null);
  const heroCampaign = $derived($userCampaigns.find((one) => one.id === newestCharacter?.campaign_id) ?? null);
  const newestLore = $derived(
    KINDS.flatMap((kind) => (lore[kind] ?? []).map((one) => ({ kind, one })))
      .sort((a, b) => (b.one.created_at ?? '').localeCompare(a.one.created_at ?? ''))[0] ?? null
  );

  onMount(async () => {
    setTheme(getTheme());

    try {
      const [characters, campaigns] = await Promise.all([
        getCharacters(),
        getCampaigns()
      ]);
      userCharacters.set(characters);
      userCampaigns.set(campaigns);
    } catch (err) {
      postNotice(err instanceof Error ? err.message : 'The archive did not answer');
    } finally {
      loading = false;
    }

    const userId = $user?.user_id ?? '';
    try {
      const rolls = await Promise.all(KINDS.map((kind) => getAll({ at: 'user', id: userId }, kind)));
      lore = Object.fromEntries(KINDS.map((kind, index) => [kind, rolls[index]]));
    } catch (err) {
      postNotice(err instanceof Error ? err.message : 'The archive did not answer');
    }
  });

  onDestroy(() => {
    unsubscribe();
    unsubscribeSidebar();
  });

  function createCharacter() {
    navigate('/main/create/character');
  }

  function createCampaign() {
    navigate('/main/create/campaign');
  }
</script>

<Shell drawers title="Hearth" width="full">
  <div class="hall-grid">
    <section class="hall-hero" aria-label="Hearth">
      <div class="hall-hero-word">
        <p class="dnd-label hall-hero-eyebrow">The hearth is lit</p>
        <h1 class="dnd-heading hall-hero-name">{name}</h1>
        <p class="hall-hero-note">
          {$userCharacters.length} characters, {$userCampaigns.length} campaigns, {written} pages.
        </p>
      </div>
      {#if newestCharacter}
        <div class="hall-hero-face">
          {#if heroCampaign}
            <a class="hall-hero-flag" href="/main/campaign/{heroCampaign.id}">
              <span class="dnd-label hall-hero-flag-word">Campaign</span>
              <span class="hall-hero-flag-name">{heroCampaign.name}</span>
              <span class="hall-hero-flag-note">Players {heroCampaign.player_ids.length} </span>
              <span class="hall-hero-flag-note">Characters {heroCampaign.character_ids.length}</span>
              {#if heroCampaign.description}
                <span class="hall-hero-flag-lede">{heroCampaign.description}</span>
              {/if}
            </a>
          {/if}
          <button type="button" class="hall-hero-portrait" title="Open {newestCharacter.metadata.name}" onclick={() => navigate(`/main/character/${newestCharacter.id}`)}>
            <Portrait src={newestCharacter.character.info?.imageUrl} alt={newestCharacter.metadata.name} frame="shield" size="fill" initial={newestCharacter.metadata.name.charAt(0)} />
          </button>
        </div>
      {/if}
      <div class="hall-hero-latest">
        <p class="dnd-label hall-hero-last-label">Latest</p>
        <div class="hall-hero-last">
          {#if newestCampaign}
            <Card title={newestCampaign.name} sub={newestCampaign.description} tone="verdigris" badge={newestCampaign.is_active ? 'live' : undefined} onclick={() => navigate(`/main/campaign/${newestCampaign.id}`)}>
              <span>Players {newestCampaign.player_ids.length}</span>
              <span>Characters {newestCampaign.character_ids.length}</span>
            </Card>
          {/if}
          {#if newestCharacter}
            <Card title={newestCharacter.metadata.name} sub="Level {newestCharacter.metadata.level} {newestCharacter.metadata.race} {newestCharacter.metadata.class}" image={newestCharacter.character.info?.imageUrl} tone="ember" onclick={() => navigate(`/main/character/${newestCharacter.id}`)}>
              <span>HP {newestCharacter.character.info?.hp?.current ?? 0}/{newestCharacter.character.info?.hp?.max ?? 0}</span>
              <span>AC {newestCharacter.character.info?.ac ?? 10}</span>
            </Card>
          {/if}
          {#if newestLore}
            <ResourceCard under="/main/{newestLore.kind}" kind={newestLore.kind} one={newestLore.one} tone={TONES[newestLore.kind]} />
          {/if}
        </div>
      </div>
      <div class="hall-hero-acts">
        <Button variant="primary" size="md" onclick={createCharacter}>Forge a Character</Button>
        <Button variant="secondary" size="md" onclick={createCampaign}>Raise a Campaign</Button>
      </div>
    </section>

    <section class="hall-plot hall-plot-camps" aria-label="Campaigns">
      <header class="hall-divide">
        <h2 class="dnd-label hall-divide-name">Campaigns</h2>
        <span class="hall-divide-note">{$userCampaigns.length} under way</span>
        <span class="hall-divide-run"></span>
        <Sigil title="Raise a new campaign" tone="verdigris" size="sm" onclick={createCampaign} frame="plate"><Glyph name="campaign" size="sm" /></Sigil>
      </header>
      <CampaignsPanel {loading} />
    </section>

    <section class="hall-plot hall-plot-roll" aria-label="Characters">
      <header class="hall-divide">
        <h2 class="dnd-label hall-divide-name">Characters</h2>
        <span class="hall-divide-note">{$userCharacters.length} on the roll</span>
        <span class="hall-divide-run"></span>
        <Sigil title="Forge a new character" tone="ember" size="sm" onclick={createCharacter} frame="star"><Glyph name="character" size="sm" /></Sigil>
      </header>
      <CharactersPanel {loading} />
    </section>

    <section class="hall-plot hall-plot-items" aria-label="Items">
      <header class="hall-divide">
        <h2 class="dnd-label hall-divide-name">Items</h2>
        <span class="hall-divide-note">{items.length} in the pack</span>
        <span class="hall-divide-run"></span>
      </header>
      {#if items.length === 0}
        <div class="dnd-empty">
          <span class="dnd-empty-mark"><Glyph name="gear" size="lg" /></span>
          <span>No item is written down yet</span>
        </div>
      {:else}
        <div class="dnd-stack">
          {#each items as one (one.id)}
            <ResourceCard under="/main/items" kind="items" {one} tone="metal" />
          {/each}
        </div>
      {/if}
    </section>

  </div>
</Shell>

<style>
  .hall-hero {
    grid-area: hero;
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    grid-template-areas:
      'word face'
      'acts acts'
      'latest latest';
    align-items: end;
    gap: var(--space-5);
    min-width: 0;
  }

  .hall-hero-face {
    grid-area: face;
    display: flex;
    align-items: center;
    justify-content: end;
    min-width: 0;
    block-size: calc(var(--space-8) * 3);
  }

  .hall-hero-portrait {
    display: flex;
    flex: none;
    block-size: 100%;
    padding: 0;
    border: none;
    border-radius: var(--radius-sm);
    background: none;
    cursor: pointer;
  }

  .hall-hero-portrait:focus-visible,
  .hall-hero-flag:focus-visible {
    outline: none;
    box-shadow: var(--focus-ring);
  }

  .hall-hero-flag {
    --flag-tail: var(--space-5);
    position: relative;
    z-index: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    max-width: calc(var(--space-8) * 5);
    min-width: 0;
    margin-inline-end: calc(var(--space-4) * -1);
    padding: var(--space-3) calc(var(--space-6) + var(--space-3)) var(--space-3) calc(var(--flag-tail) + var(--space-4));
    color: var(--ink);
    text-decoration: none;
    text-align: end;
    clip-path: polygon(0 0, 100% 0, 100% 100%, 0 100%, var(--flag-tail) 50%);
    background:
      linear-gradient(var(--metal), var(--metal)) 0 0 / 100% var(--border-hair) no-repeat,
      linear-gradient(var(--metal), var(--metal)) 0 100% / 100% var(--border-hair) no-repeat,
      var(--texture-noise),
      linear-gradient(180deg, var(--ground-deep) 0%, var(--ground) 100%);
  }

  .hall-hero-flag-word {
    margin: 0;
    color: var(--metal);
  }

  .hall-hero-flag-name {
    font-family: var(--font-display);
    font-size: var(--text-md);
    font-weight: 700;
    color: var(--metal-bright);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .hall-hero-flag-note {
    font-family: var(--font-display);
    font-size: var(--text-xs);
    letter-spacing: var(--tracking-caps);
    text-transform: uppercase;
    color: var(--ink-dim);
  }

  .hall-hero-flag-lede {
    font-family: var(--font-body);
    font-size: var(--text-xs);
    font-style: italic;
    color: var(--ink-dim);
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .hall-hero-latest {
    grid-area: latest;
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    min-width: 0;
  }

  .hall-hero-last {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(calc(var(--space-8) * 3), 100%), 1fr));
    gap: var(--space-3);
    min-width: 0;
  }

  .hall-hero-last-label {
    margin: 0;
    color: var(--metal);
  }

  .hall-hero-word {
    grid-area: word;
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    min-width: 0;
  }

  .hall-hero-eyebrow {
    margin: 0;
    color: var(--metal);
    text-shadow: 0 0.0625rem 0 var(--ground-deep), 0 0 0.5rem var(--ember-glow);
  }

  .hall-hero-name {
    font-size: calc(var(--text-3xl) * 1.25);
    font-weight: 700;
    letter-spacing: var(--tracking-caps);
    color: var(--metal-bright);
    text-shadow: 0 0.125rem 0 var(--ground-deep), 0 0 0.125rem var(--ground-deep), 0 0 1rem var(--ember-glow), 0 0 2.5rem color-mix(in srgb, var(--ember-glow) 60%, transparent);
    overflow-wrap: anywhere;
  }

  .hall-hero-note {
    margin: 0;
    font-family: var(--font-body);
    font-size: var(--text-sm);
    font-style: italic;
    color: var(--ink-dim);
  }

  .hall-hero-acts {
    grid-area: acts;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-3);
    min-width: 0;
  }

  .hall-hero-acts::before,
  .hall-hero-acts::after {
    content: '';
    height: var(--border-hair);
    background: color-mix(in srgb, var(--metal) 45%, transparent);
  }

  .hall-hero-acts::before {
    flex: 1 1 var(--space-8);
  }

  .hall-hero-acts::after {
    flex: 0 0 var(--space-6);
  }

  .hall-grid {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: auto auto auto minmax(0, 1fr);
    grid-template-areas:
      'hero'
      'camps'
      'roll'
      'items';
    column-gap: var(--space-6);
    row-gap: var(--space-6);
    min-width: 0;
  }

  .hall-plot {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    min-width: 0;
  }

  .hall-plot-camps {
    grid-area: camps;
  }

  .hall-plot-roll {
    grid-area: roll;
  }

  .hall-plot-items {
    grid-area: items;
  }

  .hall-divide {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-3);
    min-width: 0;
    padding-block: 0.5em;
    border-bottom: var(--border-hair) solid color-mix(in srgb, var(--metal) 55%, transparent);
  }

  .hall-divide-name {
    margin: 0;
    font-size: var(--text-sm);
    font-weight: 700;
    color: var(--metal-bright);
    text-shadow: 0 0.0625rem 0 var(--ground-deep), 0 0 0.5rem var(--ember-glow);
  }

  .hall-divide-note {
    font-family: var(--font-body);
    font-size: var(--text-xs);
    font-style: italic;
    color: var(--ink);
    text-shadow: 0 0.0625rem 0 var(--ground-deep);
  }

  .hall-divide-run {
    flex: 1;
    min-width: 0;
  }
</style>
