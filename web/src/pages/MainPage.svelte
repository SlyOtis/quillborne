<script lang="ts">
  import { getCampaigns, getCharacters, getProfiles } from '$lib/api'
  import type { Profile } from '$lib/api/types'
  import { getTheme, setTheme } from "$lib/dialogs/theme";
  import { onMount, setContext, onDestroy } from "svelte";
  import { getCharacterStore } from "$lib/engine";
  import type { CharacterContext } from "$lib/types";
  import { sidebarStore } from "$lib/navigation";
  import { uiStore, anyDialogOpen, postNotice } from "$lib/stores/ui.store";
  import { getRecentFirst, userCharacters } from "$lib/stores/character.store";
  import { userCampaigns } from "$lib/stores/campaign.store";
  import { userProfile, userDetails } from "$lib/stores/auth.store";
  import { navigate } from "sly-svelte-location-router";
  import CharactersPanel from "./main/CharactersPanel.svelte";
  import CampaignsPanel from "./main/CampaignsPanel.svelte";
  import Portrait from "$components/ui/Portrait.svelte";
  import Section from "$components/ui/Section.svelte";
  import Sigil from "$components/ui/Sigil.svelte";
  import Shell from "$components/ui/Shell.svelte";
  import Glyph from "$components/ui/Glyph.svelte";
  import IconBtn from "$components/ui/IconBtn.svelte";

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
  let campaignSearch = $state('');
  let characterSearch = $state('');
  let profiles = $state<Record<string, Profile>>({});

  const name = $derived($userDetails?.display_name || $userProfile?.display_name || 'Adventurer');
  const newestCharacter = $derived(getRecentFirst($userCharacters, $userProfile?.preferences?.recent_characters ?? [])[0] ?? null);
  const heroCampaign = $derived($userCampaigns.find((one) => one.id === newestCharacter?.campaign_id) ?? null);

  onMount(async () => {
    setTheme(getTheme());

    try {
      const [characters, campaigns] = await Promise.all([
        getCharacters(),
        getCampaigns()
      ]);
      userCharacters.set(characters);
      userCampaigns.set(campaigns);
      const holders = await getProfiles(campaigns.flatMap((one) => [one.dm_id, ...one.player_ids]));
      profiles = Object.fromEntries(holders.map((one) => [one.user_id, one]));
    } catch (err) {
      postNotice(err instanceof Error ? err.message : 'The archive did not answer');
    } finally {
      loading = false;
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
          {$userCharacters.length} characters, {$userCampaigns.length} campaigns.
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
      <div class="hall-hero-acts">
        <Sigil title="Forge a character" size="sm" onclick={createCharacter}><Glyph name="character" size="sm" /></Sigil>
        <Sigil title="Raise a campaign" size="sm" onclick={createCampaign}><Glyph name="campaign" size="sm" /></Sigil>
      </div>
    </section>

    <Section title="Campaigns" note="{$userCampaigns.length} under way" count={$userCampaigns.length}>
      {#snippet actions()}
        <IconBtn title="Raise a new campaign" onclick={createCampaign}><Glyph name="campaign" size="sm" /></IconBtn>
      {/snippet}
      <CampaignsPanel {loading} search={campaignSearch} {profiles} />
    </Section>

    <Section title="Characters" note="{$userCharacters.length} on the roll" count={$userCharacters.length}>
      {#snippet actions()}
        <IconBtn title="Forge a new character" onclick={createCharacter}><Glyph name="character" size="sm" /></IconBtn>
      {/snippet}
      <CharactersPanel {loading} search={characterSearch} />
    </Section>
  </div>
</Shell>

<style>
  .hall-hero {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    grid-template-areas:
      'word face'
      'acts acts';
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
    block-size: calc(var(--space-8) * 4);
    margin-block-end: var(--space-5);
  }

  .hall-hero-portrait {
    position: relative;
    z-index: 1;
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
    min-block-size: calc(var(--space-8) * 2);
    max-block-size: 100%;
    justify-content: center;
    overflow: hidden;
    margin-inline-end: calc(var(--space-8) * -1.5);
    padding: var(--space-4) calc(var(--space-8) * 1.5 + var(--space-5)) var(--space-4) calc(var(--flag-tail) + var(--space-4));
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
    font-size: var(--text-xs);
    letter-spacing: var(--tracking-caps);
    color: var(--metal-dim);
  }

  .hall-hero-flag-name {
    font-family: var(--font-display);
    font-size: var(--text-lg);
    font-weight: 700;
    letter-spacing: var(--tracking-wide);
    text-shadow: 0 0.0625rem 0 var(--ground-deep), 0 0 0.5rem var(--ember-glow);
    color: var(--metal-bright);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .hall-hero-flag-note {
    font-family: var(--font-display);
    font-size: var(--text-xs);
    font-weight: 700;
    letter-spacing: var(--tracking-caps);
    text-transform: uppercase;
    color: var(--ink);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .hall-hero-flag-lede {
    font-family: var(--font-body);
    font-size: var(--text-xs);
    font-style: italic;
    color: var(--ink-dim);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
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
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
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
    row-gap: var(--space-6);
    min-width: 0;
  }
</style>
