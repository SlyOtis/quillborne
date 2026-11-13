<script lang="ts">
  import Glyph from "$components/ui/Glyph.svelte";
  import { navigate } from "sly-svelte-location-router";
  import { userCampaigns } from "$lib/stores/campaign.store";
  import { user } from "$lib/stores/auth.store";
  import type { Campaign, Profile } from "$lib/api/types";
  import Card from "$components/ui/Card.svelte";

  let {
    loading = false,
    search = '',
    profiles = {} as Record<string, Profile>
  }: {
    loading?: boolean
    search?: string
    profiles?: Record<string, Profile>
  } = $props();

  let shown = $derived($userCampaigns.filter((entry) =>
    entry.name.toLowerCase().includes(search.toLowerCase()) ||
    entry.description.toLowerCase().includes(search.toLowerCase())
  ));

  function getMembers(campaign: Campaign) {
    return [campaign.dm_id, ...campaign.player_ids.filter((id) => id !== campaign.dm_id)].map((id) => {
      const profile = profiles[id];
      return {
        id,
        name: profile?.display_name || profile?.email || 'A player',
        image: profile?.photo_url || undefined,
        self: id === $user?.user_id
      };
    });
  }

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
        sub="Campaign started {new Date(entry.created_at).toLocaleDateString()}"
        tone="verdigris"
        layout="face"
        members={getMembers(entry)}
        onclick={() => openCampaign(entry.id)}
      >
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

  .camps-role {
    color: var(--ink);
  }
</style>
