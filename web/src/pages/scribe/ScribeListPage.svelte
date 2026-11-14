<script lang="ts">
  import { navigate } from 'sly-svelte-location-router'
  import Tree from '$components/ui/Tree.svelte'
  import Row from '$components/ui/Row.svelte'
  import Card from '$components/ui/Card.svelte'
  import Chip from '$components/ui/Chip.svelte'
  import { getScribe, type Shelf } from '../ScribePage.svelte'

  const scribe = getScribe()
</script>

{#snippet divide(shelf: Shelf)}
  {#if shelf.title}
    <header class="scribe-divide">
      <h2 class="dnd-label scribe-divide-name">{shelf.title}</h2>
      <span class="scribe-divide-note">{shelf.kids.length}</span>
      <span class="scribe-divide-run"></span>
    </header>
  {/if}
{/snippet}

<section class="scribe-main" aria-label="Pages">
  {#if scribe.table.loading}
    <div class="dnd-loading"><span class="dnd-spinner"></span></div>
  {:else if scribe.table.pages.length === 0}
    <p class="scribe-empty">No page written yet. Press New page to begin.</p>
  {:else if scribe.shown.length === 0}
    <p class="scribe-empty">No page matches.</p>
  {:else if scribe.view === 'grid'}
    {#each scribe.tiles as shelf (shelf.title)}
      <section class="scribe-shelf" aria-label={shelf.title || 'Pages'}>
        {@render divide(shelf)}
        <div class="scribe-grid">
          {#each shelf.kids as one (one.id)}
            {@const kids = scribe.countKids(one)}
            <Card
              title={one.title}
              sub={one.description || (kids > 0 ? `${kids} sub pages` : undefined)}
              image={one.image || undefined}
              badge={kids > 0 && one.description ? String(kids) : undefined}
              layout="tile"
              onclick={() => scribe.show(one.id)}
            >
              {#each one.tags as tag (tag)}<span>#{tag}</span>{/each}
            </Card>
          {/each}
        </div>
      </section>
    {/each}
  {:else if scribe.view === 'tree'}
    <Tree rows={scribe.rows} on="" onopen={(id) => scribe.show(id)} />
  {:else}
    {#each scribe.lines as shelf (shelf.title)}
      <section class="scribe-shelf" aria-label={shelf.title || 'Pages'}>
        {@render divide(shelf)}
        <div class="scribe-list">
          {#each shelf.kids as one (one.id)}
            {@const above = scribe.parentOf(one)}
            {@const kids = scribe.countKids(one)}
            <Row
              title={one.title}
              sub={one.description || undefined}
              mark={kids > 0 ? `${kids} sub pages` : undefined}
              image={one.image || undefined}
              onclick={() => scribe.show(one.id)}
              onopen={() => navigate(scribe.loreOf(one))}
            >
              {#each one.tags as tag (tag)}<Chip still glyph="tag">#{tag}</Chip>{/each}
              {#if above}<span>Under {above.title}</span>{/if}
              {#if scribe.written(one)}<span>{scribe.written(one)}</span>{/if}
            </Row>
          {/each}
        </div>
      </section>
    {/each}
  {/if}
</section>

<style>
  .scribe-main {
    display: flex;
    flex-direction: column;
    gap: var(--space-5);
    min-width: 0;
  }

  .scribe-shelf {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    min-width: 0;
  }

  .scribe-divide {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    min-width: 0;
  }

  .scribe-divide-name {
    margin: 0;
    color: var(--metal);
  }

  .scribe-divide-note {
    font-family: var(--font-figures);
    font-size: var(--text-xs);
    color: var(--ink-faint);
  }

  .scribe-divide-run {
    flex: 1;
    min-width: 0;
    block-size: var(--border-hair);
    background: linear-gradient(90deg, var(--metal-dim), transparent);
  }

  .scribe-grid {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-4);
    min-width: 0;
  }

  .scribe-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    min-width: 0;
  }

  .scribe-empty {
    margin: 0;
    padding: var(--space-4) 0;
    font-style: italic;
    color: var(--ink-faint);
  }
</style>
