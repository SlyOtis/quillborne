<script lang="ts" module>
  export type TableColumn = {
    /** Row field the column reads, and what a sort is keyed on; `actions` is the trailing strip of row actions. */
    key: string
    /** Header text. */
    label: string
    /** Grid track of the column, such as `minmax(6em, 1fr)` or `max-content`. */
    width?: string
    /** Makes the header pressable to sort by this column. */
    sortable?: boolean
    /** How the cell draws its value: `tags` draws an array of words as chips, three then a count. */
    kind?: 'tags'
  }

  export type TableRow = {
    id: string
    [key: string]: unknown
  }

  export type TableSort = { key: string; asc: boolean }
</script>

<script lang="ts">
  import type { Snippet } from 'svelte'
  import Chip from './Chip.svelte'
  import Glyph from './Glyph.svelte'

  const {
    columns,
    rows,
    selectedIds = new Set<string>(),
    loading = false,
    emptyMessage = 'Nothing to list.',
    manualSort = false,
    sortKey: sortKeyGiven = null,
    sortDir: sortDirGiven = 'asc',
    onrow,
    onsort,
    cell,
    actions,
    detail
  }: {
    /** The columns, in order; one keyed `actions` holds the row actions. */
    columns: TableColumn[]
    /** The rows drawn. */
    rows: TableRow[]
    /** Ids drawn with the selected ground, owned by the caller. */
    selectedIds?: Set<string>
    /** Draws placeholder rows shaped like the columns while there are no rows yet. */
    loading?: boolean
    /** Written when there are no rows and nothing loads. */
    emptyMessage?: string
    /** Hands sorting to the caller: rows keep the given order and a header press only runs onsort. */
    manualSort?: boolean
    /** The sorted column while the caller sorts. */
    sortKey?: string | null
    /** The direction while the caller sorts. */
    sortDir?: 'asc' | 'desc'
    /** Runs with the row the reader pressed; given, every row is in the tab order. */
    onrow?: (row: TableRow, event: MouseEvent | KeyboardEvent) => void
    /** Runs when a sortable header is pressed. */
    onsort?: (sort: TableSort) => void
    /** Draws a cell in place of the row's raw field. */
    cell?: Snippet<[key: string, row: TableRow]>
    /** Draws the row actions, each an IconBtn, in the `actions` column. */
    actions?: Snippet<[row: TableRow]>
    /** Draws under its row, across every column, what the caller writes for that row; nothing written draws nothing. */
    detail?: Snippet<[row: TableRow]>
  } = $props()

  const SKELETONS = Array.from({ length: 6 }, (_, at) => at)

  let ownKey = $state<string | null>(null)
  let ownAsc = $state(true)

  const sortKey = $derived(manualSort ? sortKeyGiven : ownKey)
  const ascending = $derived(manualSort ? sortDirGiven === 'asc' : ownAsc)
  const template = $derived(columns.map((column) => column.width ?? (column.key === 'actions' ? 'max-content' : 'minmax(0, 1fr)')).join(' '))
  const shown = $derived.by(() => {
    if (!sortKey || manualSort) return rows
    const key = sortKey
    return [...rows].sort((a, b) => compare(a[key], b[key]) * (ascending ? 1 : -1))
  })

  function compare(a: unknown, b: unknown): number {
    if (Array.isArray(a) && Array.isArray(b)) return a.length - b.length
    if (typeof a === 'number' && typeof b === 'number') return a - b
    return String(a ?? '').localeCompare(String(b ?? ''))
  }

  function sortBy(column: TableColumn) {
    if (!column.sortable) return
    const asc = sortKey === column.key ? !ascending : true
    onsort?.({ key: column.key, asc })
    if (manualSort) return
    ownKey = column.key
    ownAsc = asc
  }

  function wordsOf(value: unknown): string[] {
    return Array.isArray(value) ? value.map(String).filter(Boolean) : []
  }

  function textOf(value: unknown): string {
    return value == null ? '' : String(value)
  }

  function onKey(row: TableRow, event: KeyboardEvent) {
    if (event.key !== 'Enter' || event.target !== event.currentTarget) return
    event.preventDefault()
    onrow?.(row, event)
  }
</script>

<div class="dnd-table" role="table" style:--table-columns={template}>
  <div class="dnd-table-head" role="row">
    {#each columns as column (column.key)}
      {#if column.sortable}
        <button
          type="button"
          class="dnd-table-th dnd-table-th-sortable"
          class:dnd-table-th-on={sortKey === column.key}
          role="columnheader"
          aria-sort={sortKey === column.key ? (ascending ? 'ascending' : 'descending') : 'none'}
          onclick={() => sortBy(column)}
        >
          <span class="dnd-table-th-label">{column.label}</span>
          <span class="dnd-table-th-sort" aria-hidden="true">
            <Glyph name={sortKey === column.key && !ascending ? 'chevrondown' : 'chevronup'} size="sm" />
          </span>
        </button>
      {:else}
        <div class="dnd-table-th" class:dnd-table-th-blank={!column.label} role="columnheader">
          <span class="dnd-table-th-label">{column.label}</span>
        </div>
      {/if}
    {/each}
  </div>

  <div class="dnd-table-body" role="rowgroup" aria-busy={loading || undefined}>
    {#if loading && rows.length === 0}
      {#each SKELETONS as at (at)}
        <div class="dnd-table-row dnd-table-row-skeleton" role="row" aria-hidden="true">
          {#each columns as column (column.key)}
            <div class="dnd-table-td" role="cell"><span class="dnd-table-bone"></span></div>
          {/each}
        </div>
      {/each}
    {:else if rows.length === 0}
      <p class="dnd-table-empty">{emptyMessage}</p>
    {:else}
      {#each shown as row (row.id)}
        <!-- svelte-ignore a11y_no_noninteractive_element_interactions, a11y_no_noninteractive_tabindex -->
        <div
          class="dnd-table-row"
          class:dnd-table-row-selected={selectedIds.has(row.id)}
          class:dnd-table-row-press={Boolean(onrow)}
          role="row"
          aria-selected={selectedIds.has(row.id) || undefined}
          tabindex={onrow ? 0 : undefined}
          onclick={(event) => onrow?.(row, event)}
          onkeydown={(event) => onKey(row, event)}
        >
          {#each columns as column, at (column.key)}
            <div
              class="dnd-table-td"
              class:dnd-table-td-lead={at === 0}
              class:dnd-table-td-actions={column.key === 'actions'}
              role="cell"
              data-label={column.label}
            >
              {#if column.key === 'actions'}
                <span class="dnd-table-actions">{@render actions?.(row)}</span>
              {:else if cell}
                {@render cell(column.key, row)}
              {:else if column.kind === 'tags'}
                {@const words = wordsOf(row[column.key])}
                {#if words.length > 0}
                  <span class="dnd-table-tags" title={words.join(', ')}>
                    {#each words.slice(0, 3) as word (word)}<Chip still>#{word}</Chip>{/each}
                    {#if words.length > 3}<Chip still>+{words.length - 3}</Chip>{/if}
                  </span>
                {/if}
              {:else if textOf(row[column.key])}
                <span class="dnd-table-text">{textOf(row[column.key])}</span>
              {/if}
            </div>
          {/each}
        </div>
        {#if detail}
          <div class="dnd-table-detail" role="row">
            <div class="dnd-table-detail-cell" role="cell">{@render detail(row)}</div>
          </div>
        {/if}
      {/each}
    {/if}
  </div>
</div>

<style>
  .dnd-table {
    display: grid;
    min-width: 0;
    width: 100%;
    max-width: 100%;
    container-type: inline-size;
    font-size: var(--text-sm);
    color: var(--ink);
  }

  .dnd-table-head,
  .dnd-table-row {
    display: grid;
    grid-template-columns: var(--table-columns);
    align-items: center;
    column-gap: var(--space-3);
    min-width: 0;
    padding: 0 var(--space-2);
  }

  .dnd-table-head {
    position: sticky;
    top: 0;
    z-index: 1;
    background: var(--ground);
    border-bottom: var(--border-hair) solid var(--metal-dim);
  }

  .dnd-table-th {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    min-width: 0;
    padding: var(--space-2) 0;
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

  .dnd-table-th-sortable {
    cursor: pointer;
  }

  .dnd-table-th-sortable:hover {
    color: var(--metal-bright);
  }

  .dnd-table-th-sort {
    display: flex;
    opacity: 0;
    transition: opacity 0.15s ease;
  }

  .dnd-table-th-sortable:hover .dnd-table-th-sort,
  .dnd-table-th-on .dnd-table-th-sort {
    opacity: 1;
  }

  .dnd-table-th:focus-visible {
    outline: none;
    box-shadow: var(--focus-ring);
  }

  .dnd-table-th-label {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .dnd-table-body {
    display: grid;
    min-width: 0;
  }

  .dnd-table-row {
    min-height: 2.25rem;
    border-bottom: var(--border-hair) solid color-mix(in srgb, var(--metal-dim) 40%, transparent);
    transition: background 0.15s ease, box-shadow 0.15s ease;
  }

  .dnd-table-row-press {
    cursor: pointer;
  }

  .dnd-table-row-press:hover {
    background: linear-gradient(90deg, color-mix(in srgb, var(--ember) 12%, transparent) 0%, transparent 85%);
  }

  .dnd-table-row-press:hover .dnd-table-td-lead {
    color: var(--metal-bright);
    text-shadow: var(--glow-text);
  }

  .dnd-table-row-selected {
    background:
      linear-gradient(90deg, color-mix(in srgb, var(--ember) 22%, transparent) 0%, color-mix(in srgb, var(--ember) 6%, transparent) 70%, transparent 100%),
      var(--texture-noise),
      var(--ground-deep);
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--metal-dim) 70%, transparent), inset 0 0 0.75rem var(--ember-glow);
  }

  .dnd-table-row:focus-visible {
    outline: none;
    box-shadow: var(--focus-ring);
  }

  .dnd-table-td {
    display: flex;
    align-items: center;
    min-width: 0;
    padding: var(--space-1) 0;
    font-family: var(--font-body);
    color: var(--ink-dim);
  }

  .dnd-table-td-lead {
    font-family: var(--font-display);
    font-weight: 600;
    color: var(--ink);
  }

  .dnd-table-td-actions {
    justify-content: flex-end;
  }

  .dnd-table-detail {
    min-width: 0;
    padding: var(--space-2) var(--space-2) var(--space-3);
    border-bottom: var(--border-hair) solid color-mix(in srgb, var(--metal-dim) 40%, transparent);
  }

  .dnd-table-detail:has(> .dnd-table-detail-cell:empty) {
    display: none;
  }

  .dnd-table-detail-cell {
    min-width: 0;
  }

  .dnd-table-text {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .dnd-table-tags {
    display: flex;
    flex-wrap: nowrap;
    align-items: center;
    gap: var(--space-1);
    min-width: 0;
    max-width: 100%;
    overflow: hidden;
  }

  .dnd-table-actions {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
  }

  .dnd-table-bone {
    display: block;
    width: 70%;
    height: 0.75em;
    border-radius: var(--radius-sm);
    background: linear-gradient(90deg, var(--ground-raised) 0%, var(--ground-lift) 50%, var(--ground-raised) 100%) 0 0 / 200% 100%;
    animation: dnd-table-shimmer 1.4s ease-in-out infinite;
  }

  .dnd-table-row-skeleton:nth-child(even) .dnd-table-bone {
    width: 50%;
  }

  @keyframes dnd-table-shimmer {
    to {
      background-position: -200% 0;
    }
  }

  .dnd-table-empty {
    margin: 0;
    padding: var(--space-4) var(--space-2);
    font-style: italic;
    color: var(--ink-faint);
  }

  @container (max-width: 40em) {
    .dnd-table-head {
      display: none;
    }

    .dnd-table-row {
      grid-template-columns: minmax(0, 1fr) max-content;
      grid-auto-flow: row dense;
      row-gap: var(--space-0);
      padding: var(--space-2);
    }

    .dnd-table-td {
      grid-column: 1;
    }

    .dnd-table-td-lead {
      font-size: var(--text-md);
    }

    .dnd-table-td-actions {
      grid-column: 2;
      grid-row: 1;
    }

    .dnd-table-td:not(.dnd-table-td-lead):not(.dnd-table-td-actions)::before {
      content: attr(data-label);
      flex: none;
      margin-inline-end: var(--space-2);
      font-family: var(--font-display);
      font-size: var(--text-xs);
      letter-spacing: var(--tracking-caps);
      text-transform: uppercase;
      color: var(--ink-faint);
    }

    .dnd-table-td:not(.dnd-table-td-lead):not(.dnd-table-td-actions):not(:has(*)) {
      display: none;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .dnd-table-bone {
      animation: none;
    }
  }
</style>
