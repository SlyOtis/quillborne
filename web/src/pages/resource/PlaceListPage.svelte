<script lang="ts">
  import { navigate } from 'sly-svelte-location-router'
  import type { Place, Resource } from '$lib/resources'
  import ResourceRoll from '$components/campaign/ResourceRoll.svelte'
  import Row from '$components/ui/Row.svelte'

  type Order = 'title' | 'tag' | 'area' | 'map'

  const ORDERS: { id: Order; label: string }[] = [
    { id: 'title', label: 'By name' },
    { id: 'tag', label: 'By tag' },
    { id: 'area', label: 'By area' },
    { id: 'map', label: 'By map' }
  ]

  const AREAS = [
    'region', 'city', 'town', 'village', 'keep', 'tower', 'dungeon', 'cave', 'ruin', 'temple', 'inn'
  ]

  let sort = $state<Order>('title')
  let area = $state('')

  const keep = (one: Resource) => !area || (one as Place).category === area

  const firstTag = (one: Resource) => [...one.tags].sort()[0] ?? ''

  function order(a: Resource, b: Resource) {
    const one = a as Place
    const two = b as Place

    if (sort === 'tag') {
      const held = firstTag(a).localeCompare(firstTag(b))
      if (held !== 0) return firstTag(a) === '' ? 1 : firstTag(b) === '' ? -1 : held
    }

    if (sort === 'area') {
      const held = (one.category ?? '').localeCompare(two.category ?? '')
      if (held !== 0) return held
    }

    if (sort === 'map') {
      const held = (one.map_id ?? '').localeCompare(two.map_id ?? '')
      if (held !== 0) return one.map_id ? (two.map_id ? held : -1) : 1
    }

    return a.title.localeCompare(b.title)
  }
</script>

<ResourceRoll kind="places" {order} {keep}>
  {#snippet tools()}
    <select class="roll-order" aria-label="Order the places" bind:value={sort}>
      {#each ORDERS as one (one.id)}
        <option value={one.id}>{one.label}</option>
      {/each}
    </select>

    <select class="roll-order" aria-label="Filter by kind" bind:value={area}>
      <option value="">Every kind</option>
      {#each AREAS as one (one)}
        <option value={one}>{one}</option>
      {/each}
    </select>
  {/snippet}

  {#snippet row(one, under, peek)}
    {@const it = one as unknown as Place}
    <Row
      title={one.title}
      sub={one.description}
      mark={it.category}
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
      <span>{it.map_id ? `Map ${it.map_id.slice(0, 6)}` : 'Uncharted'}</span>
    </Row>
  {/snippet}
</ResourceRoll>

<style>
  .roll-order {
    flex: none;
    width: auto;
  }

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
