<script lang="ts">
  import Glyph from "$components/ui/Glyph.svelte";
  import { navigate } from "sly-svelte-location-router";
  import { userCampaigns } from "$lib/stores/campaign.store";
  import Card from "$components/ui/Card.svelte";

  let { loading = false, search = '' } = $props();

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
  <div class="camps-band">
    {#each shown as entry (entry.id)}
      <Card
        title={entry.name}
        sub={entry.description}
        tone="verdigris"
        badge={entry.is_active ? 'live' : undefined}
        onclick={() => openCampaign(entry.id)}
      >
        <span>Players {entry.player_ids.length}</span>
        <span>Characters {entry.character_ids.length}</span>
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
</style>
