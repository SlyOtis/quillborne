<script lang="ts">
  import ResourceRoll from '$components/campaign/ResourceRoll.svelte'
  import { navigate } from 'sly-svelte-location-router'
  import Row from '$components/ui/Row.svelte'
  import { RESOURCES, type Chart } from '$lib/resources'
</script>

<ResourceRoll kind="maps">
  {#snippet row(one, under, peek)}
    {@const it = one as unknown as Chart}
    <Row
      title={one.title}
      sub={one.description}
      mark={RESOURCES.maps.mark(one) || undefined}
      tone="verdigris"
      image={one.image}
      onclick={() => peek(one)}
      onopen={() => navigate(`${under}/${one.id}`)}
    >
      {#if one.tags.length > 0}
        <span class="roll-tags">
          {#each one.tags as tag (tag)}<span class="roll-tag">#{tag}</span>{/each}
        </span>
      {/if}
      <span>Chart</span>
    </Row>
  {/snippet}
</ResourceRoll>

<style>
  .roll-tags {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
  }

  .roll-tag {
    font-family: var(--font-display);
    letter-spacing: var(--tracking-wide);
    color: var(--metal);
    text-shadow: 0 1px 0 var(--shadow-ink);
  }
</style>
