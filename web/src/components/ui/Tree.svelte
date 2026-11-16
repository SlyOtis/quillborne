<script lang="ts" module>
  import type { GlyphName } from './Glyph.svelte'

  export type TreeRow = {
    id: string
    title: string
    /** Secondary text written after the name. */
    mark?: string
    /** The mark drawn before the name; a row with kids draws the folder, the rest the file. */
    glyph?: GlyphName
    /** Draws the name and its mark struck through, a row about to be taken away. */
    struck?: boolean
    kids?: TreeRow[]
    [key: string]: unknown
  }

  export type TreeColumn = {
    /** Row field the column reads, and what a sort is keyed on; the first column is the tree column and reads the title. */
    key: string
    /** Header text. */
    label: string
    /** Grid track of the column, such as `minmax(6em, 1fr)` or `max-content`. */
    width?: string
    /** Makes the header pressable to sort by this column. */
    sortable?: boolean
  }

  export type TreeSort = { key: string; asc: boolean }
</script>

<script lang="ts">
  import type { Snippet } from 'svelte'
  import Glyph from './Glyph.svelte'
  import IconBtn from './IconBtn.svelte'

  const {
    rows,
    on = '',
    search = '',
    columns = [],
    manualSort = false,
    sortKey: sortKeyGiven = null,
    sortDir: sortDirGiven = 'asc',
    onopen,
    ontoggle,
    onsort,
    cell
  }: {
    /** The rows drawn, each carrying its own kids under it. */
    rows: TreeRow[]
    /** The row being read, drawn as the current one; its ancestors open so it shows. */
    on?: string
    /** Case insensitive substring filter on row titles; a match is drawn flat, wherever it sits in the tree. */
    search?: string
    /** The columns after the tree column, each with a header; none draws the tree alone with no header. */
    columns?: TreeColumn[]
    /** Hands sorting to the caller: siblings keep the given order and a header press only runs onsort. */
    manualSort?: boolean
    /** The sorted column while the caller sorts. */
    sortKey?: string | null
    /** The direction while the caller sorts. */
    sortDir?: 'asc' | 'desc'
    /** Runs with the id of the row the reader pressed. */
    onopen: (id: string) => void
    /** Runs with the id of a row the reader unfolded or folded. */
    ontoggle?: (id: string) => void
    /** Runs when a sortable header is pressed. */
    onsort?: (sort: TreeSort) => void
    /** Draws the cell of a column after the tree column in place of the row's raw field. */
    cell?: Snippet<[key: string, row: TreeRow]>
  } = $props()

  let open = $state(new Set<string>())
  let ownKey = $state<string | null>(null)
  let ownAsc = $state(true)

  const wanted = $derived(search.trim().toLowerCase())
  const sortKey = $derived(manualSort ? sortKeyGiven : ownKey)
  const ascending = $derived(manualSort ? sortDirGiven === 'asc' : ownAsc)
  const template = $derived(
    columns.length > 0 ? columns.map((column, at) => column.width ?? (at === 0 ? 'minmax(0, 1fr)' : 'max-content')).join(' ') : 'minmax(0, 1fr)'
  )
  const shown = $derived(order(wanted ? flatten(rows) : rows))

  $effect(() => {
    const trail = trailOf(rows, on)
    if (trail.length === 0) return
    open = new Set([...open, ...trail])
  })

  function flatten(held: TreeRow[]): TreeRow[] {
    return held.flatMap((row) => [...(row.title.toLowerCase().includes(wanted) ? [{ ...row, kids: [] }] : []), ...flatten(row.kids ?? [])])
  }

  function trailOf(held: TreeRow[], id: string, above: string[] = []): string[] {
    if (!id) return []
    for (const row of held) {
      if (row.id === id) return above
      const found = trailOf(row.kids ?? [], id, [...above, row.id])
      if (found.length > 0 || (row.kids ?? []).some((kid) => kid.id === id)) return found.length > 0 ? found : [...above, row.id]
    }
    return []
  }

  function valueOf(row: TreeRow, key: string): string {
    if (key === columns[0]?.key || !columns.length) return row.title
    const value = row[key]
    return value == null ? '' : String(value)
  }

  function order(held: TreeRow[]): TreeRow[] {
    const branches = held.filter((row) => (row.kids ?? []).length > 0)
    const leaves = held.filter((row) => (row.kids ?? []).length === 0)
    if (sortKey && !manualSort) {
      const key = sortKey
      const by = (a: TreeRow, b: TreeRow) => valueOf(a, key).localeCompare(valueOf(b, key)) * (ascending ? 1 : -1)
      branches.sort(by)
      leaves.sort(by)
    }
    return [...branches, ...leaves]
  }

  function toggle(id: string) {
    const next = new Set(open)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    open = next
    ontoggle?.(id)
  }

  function press(row: TreeRow, expandable: boolean) {
    if (expandable && !open.has(row.id)) toggle(row.id)
    onopen(row.id)
  }

  function sortBy(column: TreeColumn) {
    if (!column.sortable) return
    const asc = sortKey === column.key ? !ascending : true
    onsort?.({ key: column.key, asc })
    if (manualSort) return
    ownKey = column.key
    ownAsc = asc
  }

  function glyphOf(row: TreeRow, expandable: boolean, expanded: boolean): GlyphName {
    if (row.glyph) return row.glyph
    if (expandable) return expanded ? 'folderopen' : 'folder'
    return 'file'
  }
</script>

{#snippet limb(row: TreeRow, depth: number, guides: boolean[])}
  {@const kids = order(row.kids ?? [])}
  {@const expandable = kids.length > 0}
  {@const expanded = expandable && open.has(row.id)}

  <li class="dnd-tree-twig">
    <div class="dnd-tree-row" class:dnd-tree-row-on={row.id === on} role="row" aria-current={row.id === on ? 'page' : undefined}>
      <div class="dnd-tree-node" role="cell">
        {#each guides as through, level (level)}
          <span class="dnd-tree-guide" class:dnd-tree-guide-through={through} class:dnd-tree-guide-elbow={level === depth - 1}></span>
        {/each}
        <span class="dnd-tree-toggle" class:dnd-tree-toggle-open={expanded}>
          {#if expandable}
            <span class="dnd-tree-chevron" class:dnd-tree-chevron-closed={!expanded}>
              <IconBtn title={expanded ? `Fold ${row.title}` : `Unfold ${row.title}`} expanded={expanded} onclick={() => toggle(row.id)}>
                <Glyph name="chevrondown" size="sm" />
              </IconBtn>
            </span>
          {:else}
            <span class="dnd-tree-spacer"></span>
          {/if}
        </span>
        <button type="button" class="dnd-tree-stem" class:dnd-tree-stem-struck={row.struck} onclick={() => press(row, expandable)}>
          <span class="dnd-tree-glyph"><Glyph name={glyphOf(row, expandable, expanded)} size="sm" /></span>
          <span class="dnd-tree-text">{row.title}</span>
          {#if row.mark}<span class="dnd-tree-meta">{row.mark}</span>{/if}
        </button>
      </div>
      {#each columns.slice(1) as column (column.key)}
        <div class="dnd-tree-cell" role="cell">
          {#if cell}{@render cell(column.key, row)}{:else}{valueOf(row, column.key)}{/if}
        </div>
      {/each}
    </div>

    {#if expandable}
      <div class="dnd-tree-fold" class:dnd-tree-fold-open={expanded} inert={!expanded}>
        <ul class="dnd-tree-nest">
          {#each kids as kid, at (kid.id)}
            {@render limb(kid, depth + 1, [...guides, at < kids.length - 1])}
          {/each}
        </ul>
      </div>
    {/if}
  </li>
{/snippet}

<div class="dnd-tree" class:dnd-tree-columned={columns.length > 0} role="table" style:--tree-columns={template}>
  {#if columns.length > 0}
    <div class="dnd-tree-head" role="row">
      {#each columns as column (column.key)}
        {#if column.sortable}
          <button
            type="button"
            class="dnd-tree-th dnd-tree-th-sortable"
            class:dnd-tree-th-on={sortKey === column.key}
            role="columnheader"
            aria-sort={sortKey === column.key ? (ascending ? 'ascending' : 'descending') : 'none'}
            onclick={() => sortBy(column)}
          >
            <span class="dnd-tree-th-label">{column.label}</span>
            <span class="dnd-tree-th-sort" aria-hidden="true">
              <Glyph name={sortKey === column.key && !ascending ? 'chevrondown' : 'chevronup'} size="sm" />
            </span>
          </button>
        {:else}
          <div class="dnd-tree-th" role="columnheader"><span class="dnd-tree-th-label">{column.label}</span></div>
        {/if}
      {/each}
    </div>
  {/if}
  <ul class="dnd-tree-body" role="rowgroup">
    {#each shown as row (row.id)}
      {@render limb(row, 0, [])}
    {/each}
  </ul>
</div>

<style>
  .dnd-tree {
    --tree-row: 1.75rem;
    --tree-step: 1.25em;
    --tree-line: color-mix(in srgb, var(--metal-dim) 80%, transparent);
    display: grid;
    min-width: 0;
    font-size: var(--text-sm);
  }

  .dnd-tree-head,
  .dnd-tree-row {
    display: grid;
    grid-template-columns: var(--tree-columns);
    align-items: center;
    column-gap: var(--space-3);
    min-width: 0;
  }

  .dnd-tree-head {
    padding: 0 var(--space-2);
    border-bottom: var(--border-hair) solid var(--metal-dim);
  }

  .dnd-tree-th {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    min-width: 0;
    padding: var(--space-1) 0;
    border: none;
    background: none;
    font-family: var(--font-display);
    font-size: var(--text-xs);
    font-weight: 600;
    letter-spacing: var(--tracking-caps);
    text-transform: uppercase;
    text-align: start;
    color: var(--metal);
    text-shadow: 0 1px 0 var(--shadow-ink);
  }

  .dnd-tree-th-sortable {
    cursor: pointer;
  }

  .dnd-tree-th-sortable:hover {
    color: var(--metal-bright);
  }

  .dnd-tree-th-sort {
    display: flex;
    opacity: 0;
    transition: opacity 0.15s ease;
  }

  .dnd-tree-th-sortable:hover .dnd-tree-th-sort,
  .dnd-tree-th-on .dnd-tree-th-sort {
    opacity: 1;
  }

  .dnd-tree-th:focus-visible {
    outline: none;
    box-shadow: var(--focus-ring);
  }

  .dnd-tree-th-label {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .dnd-tree-body,
  .dnd-tree-nest {
    display: grid;
    margin: 0;
    padding: 0;
    min-width: 0;
    list-style: none;
  }

  .dnd-tree-twig {
    min-width: 0;
  }

  .dnd-tree-columned .dnd-tree-row {
    padding: 0 var(--space-2);
    border-bottom: var(--border-hair) solid color-mix(in srgb, var(--metal-dim) 40%, transparent);
  }

  .dnd-tree-row {
    min-height: var(--tree-row);
    border-radius: var(--radius-sm);
    transition: background 0.15s ease, box-shadow 0.15s ease;
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

  .dnd-tree-node {
    display: flex;
    align-items: stretch;
    min-width: 0;
    min-height: var(--tree-row);
  }

  .dnd-tree-guide {
    position: relative;
    flex: none;
    width: var(--tree-step);
  }

  .dnd-tree-guide-through::before,
  .dnd-tree-guide-elbow::before {
    content: '';
    position: absolute;
    top: 0;
    bottom: 50%;
    left: calc(var(--tree-step) / 2);
    width: var(--border-hair);
    background: var(--tree-line);
  }

  .dnd-tree-guide-through::before {
    bottom: 0;
  }

  .dnd-tree-guide-elbow::after {
    content: '';
    position: absolute;
    top: 50%;
    left: calc(var(--tree-step) / 2);
    right: 0;
    height: var(--border-hair);
    background: var(--tree-line);
  }

  .dnd-tree-toggle {
    position: relative;
    display: flex;
    flex: none;
    align-items: center;
    justify-content: center;
    width: var(--tree-step);
    margin-inline-end: var(--space-1);
  }

  .dnd-tree-toggle-open::after {
    content: '';
    position: absolute;
    top: calc(50% + 0.6em);
    bottom: 0;
    left: calc(var(--tree-step) / 2);
    width: var(--border-hair);
    background: var(--tree-line);
  }

  .dnd-tree-chevron {
    display: flex;
    font-size: 0.8em;
    transition: transform 0.2s ease;
  }

  .dnd-tree-chevron-closed {
    transform: rotate(-90deg);
  }

  .dnd-tree-spacer {
    width: var(--tree-step);
  }

  .dnd-tree-stem {
    display: flex;
    flex: 1;
    align-items: center;
    gap: var(--space-2);
    min-width: 0;
    padding: 0;
    padding-inline-end: var(--space-2);
    border: none;
    border-radius: var(--radius-sm);
    background: none;
    font-family: var(--font-body);
    font-size: inherit;
    text-align: start;
    color: var(--ink-dim);
    cursor: pointer;
    transition: color 0.15s ease, text-shadow 0.15s ease;
  }

  .dnd-tree-glyph {
    display: flex;
    flex: none;
    color: var(--metal);
  }

  .dnd-tree-text {
    flex: 0 1 auto;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .dnd-tree-row:hover .dnd-tree-stem {
    color: var(--metal-bright);
    text-shadow: var(--glow-text);
  }

  .dnd-tree-row-on .dnd-tree-stem {
    color: var(--metal-bright);
    text-shadow: 0 1px 0 var(--shadow-ink), 0 0 6px var(--ember-glow);
  }

  .dnd-tree-stem:focus-visible {
    outline: none;
    box-shadow: var(--focus-ring);
  }

  .dnd-tree-meta {
    flex: 0 9999 auto;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-family: var(--font-figures);
    font-size: var(--text-xs);
    color: var(--ink-faint);
    text-shadow: none;
  }

  .dnd-tree-stem-struck {
    text-decoration: line-through;
    opacity: 0.5;
  }

  .dnd-tree-cell {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: var(--text-xs);
    color: var(--ink-dim);
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
    min-height: 0;
    overflow: hidden;
  }

  @media (prefers-reduced-motion: reduce) {
    .dnd-tree-fold,
    .dnd-tree-chevron {
      transition: none;
    }
  }
</style>
