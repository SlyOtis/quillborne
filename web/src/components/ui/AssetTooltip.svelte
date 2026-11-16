<script lang="ts">
  const {
    name,
    type,
    format,
    size,
    visibility,
    updated,
    created,
    tags
  }: {
    /** Asset name written bold at the top of the card. */
    name: string
    /** Value of the Type row, left out when absent. */
    type?: string
    /** Value of the Format row, left out when absent. */
    format?: string
    /** Preformatted value of the Size row, left out when absent. */
    size?: string
    /** Value of the Visibility row, left out when absent. */
    visibility?: string
    /** Preformatted value of the Updated row, left out when absent. */
    updated?: string
    /** Preformatted value of the Created row, left out when absent. */
    created?: string
    /** Tag words written as pills under the rows. */
    tags?: string[]
  } = $props()

  const rows = $derived(
    [
      ['Type', type],
      ['Format', format],
      ['Size', size],
      ['Visibility', visibility],
      ['Updated', updated],
      ['Created', created]
    ].filter((row): row is [string, string] => Boolean(row[1]))
  )
</script>

<div class="dnd-assettooltip" role="tooltip">
  <div class="dnd-assettooltip-name">{name}</div>
  {#if rows.length > 0}
    <dl class="dnd-assettooltip-meta">
      {#each rows as [term, value] (term)}
        <div class="dnd-assettooltip-row">
          <dt>{term}</dt>
          <dd>{value}</dd>
        </div>
      {/each}
    </dl>
  {/if}
  {#if tags && tags.length > 0}
    <div class="dnd-assettooltip-tags">
      {#each tags as tag (tag)}<span class="dnd-assettooltip-tag">#{tag}</span>{/each}
    </div>
  {/if}
</div>

<style>
  .dnd-assettooltip {
    width: max-content;
    max-width: 29em;
    padding: var(--space-2) var(--space-3);
    border: var(--border-hair) solid var(--metal-dim);
    border-radius: var(--radius-sm);
    background: color-mix(in srgb, var(--shadow-ink) 88%, transparent);
    box-shadow: var(--shadow-md);
    font-family: var(--font-body);
    font-size: var(--text-xs);
    line-height: 1.4;
    color: var(--ink);
  }

  .dnd-assettooltip-name {
    margin-bottom: var(--space-1);
    font-family: var(--font-display);
    font-size: var(--text-sm);
    font-weight: 700;
    color: var(--metal-bright);
    overflow-wrap: anywhere;
  }

  .dnd-assettooltip-meta {
    display: flex;
    flex-direction: column;
    gap: var(--space-0);
    margin: 0;
  }

  .dnd-assettooltip-row {
    display: flex;
    gap: var(--space-3);
  }

  .dnd-assettooltip-row dt {
    flex: 0 0 5.8em;
    color: var(--ink-faint);
  }

  .dnd-assettooltip-row dd {
    min-width: 0;
    margin: 0;
    overflow-wrap: anywhere;
  }

  .dnd-assettooltip-tags {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-1);
    margin-top: var(--space-2);
  }

  .dnd-assettooltip-tag {
    font-family: var(--font-display);
    font-weight: 600;
    letter-spacing: var(--tracking-wide);
    color: var(--verdigris);
  }
</style>
