<script lang="ts">
  import type { Snippet } from 'svelte'

  const {
    title,
    count,
    open = false,
    variant = 'band',
    ontoggle,
    children
  }: {
    /** The name written across the band. */
    title: string
    /** A figure written at the end of the band. */
    count?: string | number
    /** Draws the body when it is set. */
    open?: boolean
    /** `band` is the cut plate, `row` a flush line in a list. */
    variant?: 'band' | 'row'
    /** Runs when the band is pressed. */
    ontoggle?: () => void
    /** What the fold holds. */
    children?: Snippet
  } = $props()
</script>

<section class="dnd-fold dnd-fold-{variant}" class:dnd-fold-open={open}>
  <button type="button" class="dnd-fold-head" aria-expanded={open} onclick={ontoggle}>
    <span class="dnd-fold-caret" aria-hidden="true"></span>
    <span class="dnd-fold-title">{title}</span>
    {#if count !== undefined}
      <span class="dnd-fold-count">{count}</span>
    {/if}
  </button>

  <div class="dnd-fold-body" inert={!open}>
    <div class="dnd-fold-inner">{@render children?.()}</div>
  </div>
</section>

<style>
  .dnd-fold {
    --fold-row: 2.6rem;
    --fold-cusp: 0.56rem;
    --fold-caret: 0.32rem;
    display: grid;
    gap: var(--space-2);
    min-width: 0;
  }

  .dnd-fold-head {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: var(--space-2);
    width: 100%;
    min-height: var(--fold-row);
    padding: 0 var(--space-3);
    background:
      linear-gradient(180deg, color-mix(in srgb, var(--stone-light) 20%, transparent) 0%, color-mix(in srgb, var(--shadow-ink) 45%, transparent) 60%, color-mix(in srgb, var(--shadow-ink) 65%, transparent) 100%),
      var(--texture-noise),
      var(--ground-raised);
    border: none;
    box-shadow: var(--bevel-up), inset 0 0 0 1px var(--metal-dim), inset 0 -1px 0 1px var(--keyline);
    clip-path: polygon(
      var(--fold-cusp) 0,
      calc(100% - var(--fold-cusp)) 0,
      100% 50%,
      calc(100% - var(--fold-cusp)) 100%,
      var(--fold-cusp) 100%,
      0 50%
    );
    color: var(--metal-bright);
    font-family: var(--font-display);
    font-size: var(--text-xs);
    font-weight: 700;
    letter-spacing: var(--tracking-caps);
    text-transform: uppercase;
    text-align: start;
    cursor: pointer;
    text-shadow: 0 1px 0 var(--shadow-ink);
    transition: filter 0.15s ease, text-shadow 0.15s ease;
  }

  .dnd-fold-head:hover {
    filter: brightness(1.12) drop-shadow(0 0 8px var(--ember-glow));
    text-shadow: var(--glow-text);
  }

  .dnd-fold-head:active {
    filter: brightness(0.85);
  }

  .dnd-fold-head:focus-visible {
    outline: none;
    box-shadow: var(--focus-ring);
  }

  .dnd-fold-open .dnd-fold-head {
    box-shadow: var(--bevel-up), inset 0 0 0 1px var(--metal), inset 0 -1px 0 1px var(--keyline), inset 0 0 16px var(--ember-glow);
  }

  .dnd-fold-caret {
    width: 0;
    height: 0;
    border-top: var(--fold-caret) solid transparent;
    border-bottom: var(--fold-caret) solid transparent;
    border-inline-start: var(--fold-caret) solid var(--metal);
    filter: drop-shadow(0 1px 0 var(--shadow-ink));
    transition: transform 0.15s ease, border-color 0.15s ease, filter 0.15s ease;
  }

  .dnd-fold-open .dnd-fold-caret {
    transform: rotate(90deg);
    border-inline-start-color: var(--metal-bright);
    filter: drop-shadow(0 0 4px var(--ember-glow));
  }

  .dnd-fold-head:hover .dnd-fold-caret {
    border-inline-start-color: var(--metal-bright);
  }

  .dnd-fold-title {
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }

  .dnd-fold-count {
    color: var(--ink-dim);
    font-family: var(--font-figures);
    font-size: var(--text-xs);
    font-weight: 400;
    letter-spacing: var(--tracking-wide);
  }

  .dnd-fold-body {
    display: grid;
    grid-template-rows: 0fr;
    min-width: 0;
    transition: grid-template-rows 0.22s cubic-bezier(0.4, 0, 0.2, 1);
  }

  .dnd-fold-open .dnd-fold-body {
    grid-template-rows: 1fr;
  }

  .dnd-fold-inner {
    display: grid;
    gap: var(--space-2);
    min-width: 0;
    min-height: 0;
    overflow: hidden;
  }

  .dnd-fold-open .dnd-fold-inner {
    padding-block: var(--space-1);
  }

  .dnd-fold-row {
    gap: 0;
    border-bottom: var(--border-hair) solid color-mix(in srgb, var(--metal-dim) 80%, transparent);
  }

  .dnd-fold-row .dnd-fold-head {
    padding: 0 var(--space-4);
    background: none;
    box-shadow: none;
    clip-path: none;
  }

  .dnd-fold-row .dnd-fold-head:hover {
    filter: none;
    text-shadow: var(--glow-text);
  }

  .dnd-fold-row.dnd-fold-open .dnd-fold-head {
    box-shadow: none;
  }

  .dnd-fold-row .dnd-fold-inner {
    padding-inline: var(--space-4);
  }

  .dnd-fold-row.dnd-fold-open .dnd-fold-inner {
    padding-block: 0 var(--space-3);
  }
</style>
