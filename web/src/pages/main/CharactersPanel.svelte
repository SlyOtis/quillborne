<script lang="ts">
  import Glyph from "$components/ui/Glyph.svelte";
  import { navigate } from "sly-svelte-location-router";
  import { getRecentFirst, userCharacters } from "$lib/stores/character.store";
  import { userProfile } from "$lib/stores/auth.store";
  import Card from "$components/ui/Card.svelte";

  let {
    loading = false,
    search = ''
  }: {
    loading?: boolean
    search?: string
  } = $props();

  let shown = $derived(getRecentFirst($userCharacters, $userProfile?.preferences?.recent_characters ?? []).filter((entry) =>
    entry.metadata.name.toLowerCase().includes(search.toLowerCase()) ||
    entry.metadata.class.toLowerCase().includes(search.toLowerCase()) ||
    entry.metadata.race.toLowerCase().includes(search.toLowerCase())
  ));

  function openCharacter(characterId: string) {
    navigate(`/main/character/${characterId}`);
  }
</script>

{#if loading}
  <div class="dnd-loading"><span class="dnd-spinner"></span></div>
{:else if shown.length === 0}
  <div class="dnd-empty">
    <span class="dnd-empty-mark"><Glyph name="character" size="lg" /></span>
    <span>No character carries your name yet</span>
  </div>
{:else}
  <div class="roll-grid">
    {#each shown as entry (entry.id)}
      <Card
        layout="tile"
        title={entry.metadata.name}
        sub={entry.metadata.class}
        image={entry.character.info?.imageUrl}
        badge={entry.metadata.status === 'draft' ? 'Draft' : `Lv ${entry.metadata.level}`}
        tone="ember"
        onclick={() => openCharacter(entry.id)}
      >
        <span class="roll-kin">{entry.metadata.race}</span>
        {#if entry.metadata.status === 'draft'}
          <span class="roll-draft">Not finished</span>
        {:else}
          <span>HP {entry.character.info?.hp?.current ?? 0}/{entry.character.info?.hp?.max ?? 0}</span>
          <span>AC {entry.character.info?.ac ?? 10}</span>
        {/if}
      </Card>
    {/each}
  </div>
{/if}

<style>
  .roll-grid {
    --roll-seat: 11.4rem;
    --roll-row: calc(var(--roll-seat) * 1.9);
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(var(--roll-seat), 100%), 1fr));
    gap: var(--space-6);
    min-width: 0;
  }

  .roll-grid :global(.dnd-card-tile) {
    width: 100%;
    min-block-size: var(--roll-row);
  }

  .roll-kin {
    flex: 1 0 100%;
    font-family: var(--font-body);
    font-size: var(--text-sm);
    color: var(--ink);
  }

  .roll-draft {
    display: flex;
    flex: 1 0 100%;
    align-items: center;
    justify-content: center;
    min-block-size: var(--space-7);
    font-family: var(--font-display);
    letter-spacing: var(--tracking-caps);
    text-transform: uppercase;
    color: var(--state-warn);
  }
</style>
