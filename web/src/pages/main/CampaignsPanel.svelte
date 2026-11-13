<script lang="ts">
  import Glyph from "$components/ui/Glyph.svelte";
  import { navigate } from "sly-svelte-location-router";
  import { userCampaigns } from "$lib/stores/campaign.store";
  import { user } from "$lib/stores/auth.store";
  import Card from "$components/ui/Card.svelte";
  import { getCampaignPicture } from '$lib/api';

  let { loading = false, search = '', open = $bindable(false) }: { loading?: boolean; search?: string; open?: boolean } = $props();

  let shown = $derived($userCampaigns.filter((entry) =>
    entry.name.toLowerCase().includes(search.toLowerCase()) ||
    entry.description.toLowerCase().includes(search.toLowerCase())
  ));

  const folded = $derived(shown.length > 6);

  let pictures = $state<Record<string, string>>({});

  $effect(() => {
    const held = $userCampaigns;
    Promise.all(held.map(async (entry) => [entry.id, await getCampaignPicture(entry.id)] as const)).then((pairs) => {
      pictures = Object.fromEntries(pairs);
    });
  });

  function openCampaign(campaignId: string) {
    navigate(`/main/campaign/${campaignId}`);
  }
</script>

{#if loading}
  <div class="dnd-loading"><span class="dnd-spinner"></span></div>
{:else if shown.length === 0}
  <div class="dnd-empty">
    <span class="dnd-empty-mark"><Glyph name="campaign" size="lg" /></span>
    <span>No chronicle has been opened</span>
  </div>
{:else}
  <div class="camps-fold" class:camps-fold-closed={folded && !open}>
  <div class="camps-band">
    {#each shown as entry (entry.id)}
      <Card
        title={entry.name}
        image={pictures[entry.id]}
        sub="Campaign started {new Date(entry.created_at).toLocaleDateString()}"
        tone="verdigris"
        layout="face"
        onclick={() => openCampaign(entry.id)}
      >
        <span class="camps-count">
          <span class="camps-figure">{entry.player_ids.length}</span>
          <span class="dnd-label">{entry.player_ids.length === 1 ? 'Player' : 'Players'}</span>
        </span>
        <span class="dnd-label camps-role">Role: {entry.dm_id === $user?.user_id ? 'Dungeon master' : 'Player'}</span>
      </Card>
    {/each}
  </div>
  </div>
  {#if folded}
    <button type="button" class="camps-more" aria-expanded={open} onclick={() => (open = !open)}>
      <span class="dnd-label camps-more-word">{open ? 'Fold the chronicles' : `See all ${shown.length}`}</span>
      <span class="camps-more-glyph"><Glyph name={open ? 'fold' : 'unfold'} size="sm" /></span>
    </button>
  {/if}
{/if}

<style>
  .camps-fold {
    --camps-row: calc(var(--space-8) * 1.8);
    position: relative;
    max-block-size: calc(var(--camps-row) * 60);
    overflow: hidden;
    transition: max-block-size 600ms cubic-bezier(0.16, 1, 0.3, 1);
  }

  .camps-fold-closed {
    max-block-size: calc(var(--camps-row) * 3 + var(--space-3) * 2);
  }

  .camps-fold-closed {
    -webkit-mask-image: linear-gradient(180deg, var(--ground-deep) calc(100% - var(--camps-row) * 0.8), transparent 100%);
    mask-image: linear-gradient(180deg, var(--ground-deep) calc(100% - var(--camps-row) * 0.8), transparent 100%);
  }

  .camps-more {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-2);
    inline-size: 100%;
    padding: var(--space-2) 0;
    border: none;
    background: none;
    color: var(--metal);
    cursor: pointer;
  }

  .camps-more:hover .camps-more-word,
  .camps-more:focus-visible .camps-more-word {
    color: var(--metal-bright);
  }

  .camps-more-glyph {
    display: flex;
    color: var(--metal);
  }

  .camps-more:focus-visible {
    outline: none;
    box-shadow: var(--focus-ring);
  }

  .camps-more-word {
    margin: 0;
  }

  .camps-band {
    --camps-seat: calc(var(--space-8) * 4);
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(var(--camps-seat), 100%), 1fr));
    gap: var(--space-3);
    min-width: 0;
  }

  .camps-count {
    display: flex;
    flex-direction: column;
    align-items: center;
  }

  .camps-figure {
    font-family: var(--font-figures);
    font-size: var(--text-2xl);
    font-weight: 700;
    line-height: 1;
    font-variant-numeric: lining-nums tabular-nums;
    color: var(--metal-bright);
  }

  .camps-role {
    color: var(--ink);
  }
</style>
