<script lang="ts">
  import { getParties } from '$lib/api'
  import type { Party } from '$lib/api/types'
  import Glyph from '$components/ui/Glyph.svelte'
  import { navigate } from 'sly-svelte-location-router'
  import Card from '$components/ui/Card.svelte'

  const { search = '' }: {
    /** Narrows the parties to those whose name or note carries it. */
    search?: string
  } = $props()

  let parties = $state<Party[]>([])
  let loading = $state(true)

  const shown = $derived(
    parties.filter(
      (entry) =>
        entry.name.toLowerCase().includes(search.toLowerCase()) ||
        entry.description.toLowerCase().includes(search.toLowerCase())
    )
  )

  $effect(() => {
    void (async () => {
      parties = await getParties().catch(() => [])
      loading = false
    })()
  })
</script>

{#if loading}
  <div class="dnd-loading"><span class="dnd-spinner"></span></div>
{:else if shown.length === 0}
  <div class="dnd-empty">
    <span class="dnd-empty-mark"><Glyph name="weapon" size="lg" /></span>
    <span>No party has been gathered</span>
  </div>
{:else}
  <div class="bands-band">
    {#each shown as entry (entry.id)}
      <Card
        title={entry.name}
        sub={entry.description}
        image={entry.image_url}
        tone="ember"
        onclick={() => navigate(`/main/party/${entry.id}`)}
      >
        <span>Members {entry.member_ids.length}</span>
        <span>Heroes {entry.character_ids.length}</span>
      </Card>
    {/each}
  </div>
{/if}

<style>
  .bands-band {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    min-width: 0;
  }
</style>
