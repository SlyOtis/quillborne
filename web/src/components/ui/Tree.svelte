<script lang="ts" module>
  export type TreeRow = {
    id: string
    title: string
    mark?: string
    kids?: TreeRow[]
  }
</script>

<script lang="ts">
  const {
    rows,
    on = '',
    onopen
  }: {
    /** The rows drawn, each carrying its own kids. */
    rows: TreeRow[]
    /** The row being read, drawn as the current one. */
    on?: string
    /** Runs with the id of the row the reader picked. */
    onopen: (id: string) => void
  } = $props()

  let shut = $state<Record<string, boolean>>({})
</script>

{#snippet limb(row: TreeRow)}
  {@const kids = row.kids ?? []}
  {@const open = kids.length > 0 && !shut[row.id]}

  <li class="dnd-tree-twig">
    <div class="dnd-tree-row" class:dnd-tree-row-on={row.id === on}>
      {#if kids.length > 0}
        <button
          type="button"
          class="dnd-tree-caret"
          class:dnd-tree-caret-open={open}
          aria-expanded={open}
          aria-label={open ? `Fold ${row.title}` : `Unfold ${row.title}`}
          onclick={() => (shut = { ...shut, [row.id]: open })}
        ></button>
      {/if}

      <button type="button" class="dnd-tree-name" onclick={() => onopen(row.id)}>
        <span class="dnd-tree-title">{row.title}</span>
        {#if row.mark}
          <span class="dnd-tree-mark">{row.mark}</span>
        {/if}
      </button>
    </div>

    <div class="dnd-tree-fold" class:dnd-tree-fold-open={open} inert={!open}>
      <ul class="dnd-tree-nest">
        {#each kids as kid (kid.id)}
          {@render limb(kid)}
        {/each}
      </ul>
    </div>
  </li>
{/snippet}

<ul class="dnd-tree">
  {#each rows as row (row.id)}
    {@render limb(row)}
  {/each}
</ul>

<style>
  .dnd-tree {
    --tree-row: 1.55rem;
    --tree-caret: 0.26rem;
    --tree-indent: var(--space-4);
    display: grid;
    margin: 0;
    padding: 0;
    min-width: 0;
    list-style: none;
  }

  .dnd-tree-twig {
    min-width: 0;
  }

  .dnd-tree-row {
    display: grid;
    grid-template-columns: var(--space-4) minmax(0, 1fr) auto;
    align-items: center;
    gap: var(--space-1);
    min-height: var(--tree-row);
    border-radius: var(--radius-sm);
  }

  .dnd-tree-row:hover {
    background: linear-gradient(90deg, color-mix(in srgb, var(--ember) 12%, transparent) 0%, transparent 85%);
  }

  .dnd-tree-row-on {
    background:
      linear-gradient(90deg, color-mix(in srgb, var(--ember) 22%, transparent) 0%, color-mix(in srgb, var(--ember) 6%, transparent) 70%, transparent 100%),
      var(--texture-noise),
      var(--ground-deep);
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--metal-dim) 70%, transparent), inset 0 0 0.75rem var(--ember-glow);
  }

  .dnd-tree-caret {
    justify-self: center;
    width: 0;
    height: 0;
    padding: 0;
    border: none;
    border-top: var(--tree-caret) solid transparent;
    border-bottom: var(--tree-caret) solid transparent;
    border-inline-start: var(--tree-caret) solid var(--metal);
    background: none;
    filter: drop-shadow(0 1px 0 #000);
    cursor: pointer;
    transition: transform 0.15s ease, border-color 0.15s ease;
  }

  .dnd-tree-caret:hover {
    border-inline-start-color: var(--metal-bright);
  }

  .dnd-tree-caret-open {
    transform: rotate(90deg);
    border-inline-start-color: var(--metal-bright);
  }

  .dnd-tree-caret:focus-visible {
    outline: none;
    box-shadow: var(--focus-ring);
  }

  .dnd-tree-name {
    grid-column: 2 / -1;
    display: grid;
    grid-template-columns: subgrid;
    align-items: center;
    min-width: 0;
    min-height: var(--tree-row);
    padding: 0;
    padding-inline-end: var(--space-2);
    border: none;
    border-radius: var(--radius-sm);
    background: none;
    font-family: var(--font-body);
    font-size: var(--text-sm);
    text-align: start;
    color: var(--ink-dim);
    cursor: pointer;
    transition: color 0.15s ease, text-shadow 0.15s ease;
  }

  .dnd-tree-name:first-child {
    grid-column: 1 / -1;
  }

  .dnd-tree-name:first-child .dnd-tree-title {
    grid-column: 2;
  }

  .dnd-tree-title {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .dnd-tree-row:hover .dnd-tree-name {
    color: var(--metal-bright);
    text-shadow: var(--glow-text);
  }

  .dnd-tree-row-on .dnd-tree-name {
    color: var(--metal-bright);
    text-shadow: 0 1px 0 #000, 0 0 6px var(--ember-glow);
  }

  .dnd-tree-name:focus-visible {
    outline: none;
    box-shadow: var(--focus-ring);
  }

  .dnd-tree-mark {
    font-family: var(--font-figures);
    font-size: var(--text-xs);
    color: var(--ink-faint);
    text-shadow: none;
  }

  .dnd-tree-fold {
    display: grid;
    grid-template-rows: 0fr;
    transition: grid-template-rows 0.22s cubic-bezier(0.4, 0, 0.2, 1);
  }

  .dnd-tree-fold-open {
    grid-template-rows: 1fr;
  }

  .dnd-tree-nest {
    display: grid;
    min-height: 0;
    overflow: hidden;
    margin: 0;
    padding: 0;
    padding-inline-start: var(--tree-indent);
    list-style: none;
    border-inline-start: var(--border-hair) solid color-mix(in srgb, var(--metal-dim) 70%, transparent);
    margin-inline-start: var(--space-2);
  }
</style>
