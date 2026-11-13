<script lang="ts">
  import Glyph from "$components/ui/Glyph.svelte";
  import { navigate } from "sly-svelte-location-router";
  import { userCampaigns } from "$lib/stores/campaign.store";
  import { user } from "$lib/stores/auth.store";
  import Card from "$components/ui/Card.svelte";
  import { unfold } from "$lib/unfold";

  let { loading = false, search = '', open = true }: { loading?: boolean; search?: string; open?: boolean } = $props();

  let shown = $derived($userCampaigns.filter((entry) =>
    entry.name.toLowerCase().includes(search.toLowerCase()) ||
    entry.description.toLowerCase().includes(search.toLowerCase())
  ));

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
  <div class="camps-band" use:unfold={open}>
    {#each shown as entry (entry.id)}
      <Card
        title={entry.name}
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
{/if}

<style>
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
