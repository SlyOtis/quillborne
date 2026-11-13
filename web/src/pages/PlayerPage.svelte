<script lang="ts">
  import { getCharacters, getProfile } from '$lib/api'
  import type { Character, Profile } from '$lib/api/types'
  import { navigate } from 'sly-svelte-location-router'
  import { user } from '$lib/stores/auth.store'
  import { userCampaigns } from '$lib/stores/campaign.store'
  import Card from '$components/ui/Card.svelte'
  import Portrait from '$components/ui/Portrait.svelte'
  import Section from '$components/ui/Section.svelte'
  import Shell from '$components/ui/Shell.svelte'

  const { route }: { route?: { params?: Record<string, string> } } = $props()

  const playerId = $derived(route?.params?.id ?? '')
  let profile = $state<Profile | null>(null)
  let characters = $state<Character[]>([])
  let loading = $state(true)

  const name = $derived(profile?.display_name || profile?.email || 'A player')
  const shared = $derived($userCampaigns.filter((one) => one.dm_id === playerId || one.player_ids.includes(playerId)))

  $effect(() => {
    const id = playerId
    if (!id) return
    loading = true
    void Promise.all([getProfile(id), getCharacters(id)])
      .then(([held, roll]) => {
        profile = held
        characters = roll
      })
      .catch(() => {
        profile = null
        characters = []
      })
      .finally(() => {
        loading = false
      })
  })
</script>

<Shell drawers title={name} width="wide">
  <div class="player-grid">
    <section class="player-hero" aria-label="Player">
      <div class="player-hero-word">
        <p class="dnd-label player-hero-eyebrow">Player</p>
        <h1 class="dnd-heading player-hero-name">{name}</h1>
        <p class="player-hero-note">{characters.length} characters, {shared.length} campaigns.</p>
      </div>
      <div class="player-hero-face">
        <Portrait src={profile?.photo_url} alt={name} frame="shield" size="fill" initial={name.charAt(0)} />
      </div>
    </section>

    <Section title="Characters" note="{characters.length} on the roll" count={characters.length}>
      {#if loading}
        <div class="dnd-loading"><span class="dnd-spinner"></span></div>
      {:else if characters.length === 0}
        <p class="player-note">No character of theirs is open to you.</p>
      {:else}
        <div class="player-tiles">
          {#each characters as entry (entry.id)}
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
              <span>HP {entry.character?.info?.hp?.current ?? 0}/{entry.character?.info?.hp?.max ?? 0}</span>
              <span>AC {entry.character?.info?.ac ?? 10}</span>
            </Card>
          {/each}
        </div>
      {/if}
    </Section>
  </div>
</Shell>

<style>
  .player-grid {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    row-gap: var(--space-6);
    min-width: 0;
  }

  .player-hero {
    --player-face: calc(var(--space-8) * 4);
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: end;
    gap: var(--space-5);
    min-width: 0;
  }

  .player-hero-word {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    min-width: 0;
  }

  .player-hero-eyebrow {
    margin: 0;
    color: var(--metal);
    text-shadow: 0 0.0625rem 0 var(--ground-deep), 0 0 0.5rem var(--ember-glow);
  }

  .player-hero-name {
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

  .player-hero-note {
    margin: 0;
    font-family: var(--font-body);
    font-size: var(--text-sm);
    font-style: italic;
    color: var(--ink-dim);
  }

  .player-hero-face {
    display: flex;
    align-items: center;
    justify-content: end;
    min-width: 0;
    block-size: var(--player-face);
    margin-block-end: var(--space-5);
  }

  .player-tiles {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-4);
    min-width: 0;
  }

  .player-note {
    margin: 0;
    font-size: var(--text-sm);
    color: var(--ink-dim);
  }
</style>
