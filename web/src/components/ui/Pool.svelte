<script lang="ts">
  import IconBtn from './IconBtn.svelte'
  import Ornament from './Ornament.svelte'
  import Stat from './Stat.svelte'

  const {
    title,
    note,
    max,
    current,
    view = 'plate',
    onput
  }: {
    /** The name of the pool. */
    title: string
    /** When it is regained, written under the name. */
    note?: string
    /** How many points the pool holds when full. */
    max: number
    /** How many points are left in it. */
    current: number
    /** The design the pool is drawn in: a plate carrying the figure, or a row of pips spent one by one. */
    view?: 'plate' | 'pips'
    /** Runs with the new count when a pip is pressed; without it the pips only show. */
    onput?: (current: number) => void
  } = $props()

  const pips = $derived(Array.from({ length: Math.max(0, max) }, (_, index) => index))

  function press(index: number) {
    onput?.(Math.max(0, Math.min(max, index < current ? index : index + 1)))
  }
</script>

{#if view === 'pips'}
  <div class="dnd-pool dnd-pool-pips">
    <header class="dnd-pool-head">
      <span class="dnd-pool-title">
        <span class="dnd-label">{title}</span>
        {#if note}<span class="dnd-pool-note">{note}</span>{/if}
      </span>
      <span class="dnd-pool-count">{current}<span class="dnd-pool-slash">/</span>{max}</span>
    </header>

    <div class="dnd-pool-row">
      {#each pips as index (index)}
        {#if onput}
          <IconBtn tone="ember" active={index < current} title={`Toggle ${title} point ${index + 1}`} onclick={() => press(index)}>
            <Ornament name="quatrefoil" size="xs" tone={index >= current ? 'ink' : 'ember'} />
          </IconBtn>
        {:else}
          <Ornament name="quatrefoil" size="xs" tone={index >= current ? 'ink' : 'ember'} />
        {/if}
      {/each}
    </div>
  </div>
{:else}
  <div class="dnd-pool dnd-pool-plate">
    <Stat label={title} value={current} sub="of {max}" title={note} />
  </div>
{/if}

<style>
  .dnd-pool {
    position: relative;
    display: flex;
    flex-direction: column;
    min-width: 0;
  }

  .dnd-pool-pips {
    justify-content: space-between;
    gap: var(--space-3);
    padding: var(--space-1) var(--space-2);
  }

  .dnd-pool-head {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: var(--space-3);
    padding-bottom: var(--space-2);
    border-bottom: var(--border-hair) solid color-mix(in srgb, var(--metal-dim) 70%, transparent);
  }

  .dnd-pool-title {
    display: flex;
    flex-direction: column;
    gap: var(--space-0);
    min-width: 0;
  }

  .dnd-pool-note {
    font-size: var(--text-xs);
    font-style: italic;
    color: var(--ink-faint);
  }

  .dnd-pool-count {
    font-family: var(--font-figures);
    font-size: var(--text-lg);
    font-weight: 700;
    font-variant-numeric: lining-nums tabular-nums;
    color: var(--metal-bright);
    text-shadow: 0 1px 0 var(--shadow-ink), 0 0 0.6rem var(--ember-glow);
  }

  .dnd-pool-slash {
    color: var(--ink-faint);
    padding: 0 var(--space-0);
  }

  .dnd-pool-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: flex-start;
    gap: var(--space-2);
    min-width: 0;
  }
</style>
