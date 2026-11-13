<script lang="ts">
  import Glyph from "$components/ui/Glyph.svelte";
  import { navigate } from "sly-svelte-location-router";
  import { getRecentFirst, userCharacters } from "$lib/stores/character.store";
  import { userProfile } from "$lib/stores/auth.store";
  import Card from "$components/ui/Card.svelte";

  let {
    loading = false,
    search = '',
    open = $bindable(false)
  }: {
    loading?: boolean
    search?: string
    open?: boolean
  } = $props();

  let shown = $derived(getRecentFirst($userCharacters, $userProfile?.preferences?.recent_characters ?? []).filter((entry) =>
    entry.metadata.name.toLowerCase().includes(search.toLowerCase()) ||
    entry.metadata.class.toLowerCase().includes(search.toLowerCase()) ||
    entry.metadata.race.toLowerCase().includes(search.toLowerCase())
  ));

  const folded = $derived(shown.length > 6);

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
  <div class="roll-fold" class:roll-fold-closed={folded && !open}>
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
  </div>
  {#if folded}
    <button type="button" class="roll-more" aria-expanded={open} onclick={() => (open = !open)}>
      <span class="dnd-label roll-more-word">{open ? 'Fold the roll' : `See all ${shown.length}`}</span>
      <span class="roll-more-glyph"><Glyph name={open ? 'fold' : 'unfold'} size="sm" /></span>
    </button>
  {/if}
{/if}

<style>
  .roll-fold {
    --roll-seat: 11.4rem;
    --roll-row: calc(var(--roll-seat) * 1.9);
    --roll-bleed: var(--space-6);
    position: relative;
    margin: calc(var(--roll-bleed) * -1) calc(var(--roll-bleed) * -1) 0;
    padding: var(--roll-bleed) var(--roll-bleed) 0;
    max-block-size: calc(var(--roll-row) * 60);
    overflow: hidden;
    transition: max-block-size 600ms cubic-bezier(0.16, 1, 0.3, 1);
  }

  .roll-fold-closed {
    max-block-size: calc(var(--roll-row) * 3 + var(--space-6) * 2 + var(--roll-bleed));
  }

  .roll-fold-closed {
    -webkit-mask-image: linear-gradient(180deg, var(--ground-deep) calc(100% - var(--roll-row) * 0.8), transparent 100%);
    mask-image: linear-gradient(180deg, var(--ground-deep) calc(100% - var(--roll-row) * 0.8), transparent 100%);
  }

  .roll-more {
    display: flex;
    align-items: center;
    justify-content: center;
    inline-size: 100%;
    margin-block-start: calc(var(--roll-bleed) * -1);
    padding: var(--space-2) 0;
    border: none;
    background: none;
    color: var(--metal);
    cursor: pointer;
  }

  .roll-more:hover .roll-more-word,
  .roll-more:focus-visible .roll-more-word {
    color: var(--metal-bright);
  }

  .roll-more:focus-visible {
    outline: none;
    box-shadow: var(--focus-ring);
  }

  .roll-more-word {
    margin: 0;
  }

  .roll-more-glyph {
    display: flex;
    color: var(--metal);
  }

  .roll-more {
    gap: var(--space-2);
  }

  .roll-grid {
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
