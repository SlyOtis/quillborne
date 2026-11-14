<script lang="ts">
  import ResourceRoll from '$components/campaign/ResourceRoll.svelte'
  import { navigate } from 'sly-svelte-location-router'
  import Row from '$components/ui/Row.svelte'
  import { RESOURCES, type Weapon } from '$lib/resources'
</script>

<ResourceRoll kind="weapons">
  {#snippet row(one, under, peek)}
    {@const it = one as unknown as Weapon}
    <Row
      title={one.title}
      sub={one.description}
      mark={RESOURCES.weapons.mark(one) || undefined}
      tone="metal"
      image={one.image}
      onclick={() => peek(one)}
      onopen={() => navigate(`${under}/${one.id}`)}
    >
      {#if one.tags.length > 0}
        <span class="roll-tags">
          {#each one.tags as tag (tag)}<span class="roll-tag">#{tag}</span>{/each}
        </span>
      {/if}
      <span>{it.damage} {it.damage_kind}</span>
      <span>{it.rarity}</span>
      {#if it.reach}<span>{it.reach} ft</span>{/if}
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
