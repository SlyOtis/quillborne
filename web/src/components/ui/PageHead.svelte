<script lang="ts" module>
  export type Crumb = {
    id: string
    title: string
  }
</script>

<script lang="ts">
  import type { Snippet } from 'svelte'

  const {
    title = '',
    count,
    description = '',
    crumbs = [],
    oncrumb,
    heading,
    actions,
    center,
    tools,
    view,
    bottom
  }: {
    /** The name of the page, written as the hero heading unless `heading` is given. */
    title?: string
    /** A figure written beside the heading. */
    count?: string | number
    /** A line under the centre that says what the page holds. */
    description?: string
    /** The way back, each a step the reader may press; the open page is the heading and never a crumb. */
    crumbs?: Crumb[]
    /** Runs with the id of the crumb pressed. Without it the crumbs are plain words. */
    oncrumb?: (id: string) => void
    /** Replaces the heading, for a title that is written in place. */
    heading?: Snippet
    /** The page's actions at the end of the title row, each once. */
    actions?: Snippet
    /** The centre under the title: the page's search. */
    center?: Snippet
    /** Controls at the start of the content row. */
    tools?: Snippet
    /** The view toggle and its options at the end of the content row. */
    view?: Snippet
    /** The strip along the bottom edge: the page tabs. */
    bottom?: Snippet
  } = $props()

  const named = $derived(crumbs.filter((one) => one.title.trim()))
</script>

<header class="dnd-band dnd-pagehead" class:dnd-pagehead-tabbed={Boolean(bottom)}>
  <div class="dnd-band-line dnd-pagehead-line">
    <div class="dnd-pagehead-title">
      {#if heading}
        {@render heading()}
      {:else}
        <h1 class="dnd-heading dnd-heading-hero dnd-pagehead-name">{title}</h1>
      {/if}
      {#if count !== undefined}
        <span class="dnd-pagehead-count">{count}</span>
      {/if}
    </div>
    {#if actions}
      <span class="dnd-band-acts">{@render actions()}</span>
    {/if}
  </div>

  {#if named.length > 0}
    <nav class="dnd-label dnd-pagehead-crumbs" aria-label="Where this sits">
      {#each named as step, index (step.id)}
        {#if index > 0}<span class="dnd-pagehead-crumb-mark" aria-hidden="true">/</span>{/if}
        {#if oncrumb}
          <button type="button" class="dnd-pagehead-crumb dnd-pagehead-crumb-step" onclick={() => oncrumb(step.id)}>{step.title}</button>
        {:else}
          <span class="dnd-pagehead-crumb">{step.title}</span>
        {/if}
      {/each}
    </nav>
  {/if}

  {#if center}
    <div class="dnd-pagehead-center">{@render center()}</div>
  {/if}

  {#if description}
    <p class="dnd-pagehead-lede">{description}</p>
  {/if}

  {#if tools || view}
    <div class="dnd-pagehead-row">
      {#if tools}
        <div class="dnd-pagehead-tools">{@render tools()}</div>
      {/if}
      {#if view}
        <div class="dnd-pagehead-view">{@render view()}</div>
      {/if}
    </div>
  {/if}

  {#if bottom}
    <div class="dnd-pagehead-bottom">{@render bottom()}</div>
  {/if}
</header>

<style>
  .dnd-pagehead {
    --pagehead-pad: var(--space-6);
    display: grid;
    gap: var(--space-3);
  }

  .dnd-pagehead-tabbed {
    padding-block-end: 0;
  }

  .dnd-pagehead-line {
    align-items: flex-start;
  }

  .dnd-pagehead-title {
    display: flex;
    flex: 1;
    flex-wrap: wrap;
    align-items: baseline;
    gap: var(--space-1) var(--space-3);
    min-width: 0;
  }

  .dnd-pagehead-name {
    margin: 0;
    min-width: 0;
    overflow-wrap: anywhere;
  }

  .dnd-pagehead-count {
    flex: none;
    font-family: var(--font-figures);
    font-size: var(--text-sm);
    letter-spacing: var(--tracking-wide);
    color: var(--ink-faint);
  }

  .dnd-pagehead-crumbs {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-1) var(--space-2);
    min-width: 0;
    margin: 0;
  }

  .dnd-pagehead-crumb {
    max-inline-size: 100%;
    padding: 0;
    border: none;
    background: none;
    font: inherit;
    letter-spacing: inherit;
    text-transform: inherit;
    color: var(--metal);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .dnd-pagehead-crumb-step {
    cursor: pointer;
  }

  .dnd-pagehead-crumb-step:hover {
    color: var(--metal-bright);
  }

  .dnd-pagehead-crumb-step:focus-visible {
    outline: none;
    box-shadow: var(--focus-ring);
  }

  .dnd-pagehead-crumb-mark {
    color: var(--ink-faint);
  }

  .dnd-pagehead-center {
    display: flex;
    min-width: 0;
  }

  .dnd-pagehead-center > :global(*) {
    flex: 0 1 calc(var(--space-8) * 5);
    min-width: 0;
  }

  .dnd-pagehead-lede {
    margin: 0;
    font-size: var(--text-sm);
    color: var(--ink-dim);
  }

  .dnd-pagehead-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    min-width: 0;
  }

  .dnd-pagehead-tools {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-3);
    min-width: 0;
  }

  .dnd-pagehead-view {
    display: flex;
    align-items: center;
    min-width: 0;
    margin-inline-start: auto;
  }

  .dnd-pagehead-bottom {
    min-width: 0;
    margin-inline: calc(var(--pagehead-pad) * -1);
    padding-inline: var(--pagehead-pad);
  }
</style>
