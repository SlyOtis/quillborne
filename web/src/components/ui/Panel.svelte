<script lang="ts">
  import type { Snippet } from 'svelte'
  import Ornament from './Ornament.svelte'

  const {
    title,
    variant = 'stone',
    corners = true,
    pad = 'md',
    span = 'one',
    actions,
    children
  }: {
    /** The name written on the header plate. */
    title: string
    /** Picks the material of the panel against the active theme. */
    variant?: 'stone' | 'void' | 'parchment'
    /** Draws the filigree corners on the top edge. */
    corners?: boolean
    /** Sets the room inside the scrolling body. */
    pad?: 'none' | 'sm' | 'md'
    /** How many columns the panel takes when it sits in a grid. */
    span?: 'one' | 'two'
    /** Controls placed at the tail of the header. */
    actions?: Snippet
    /** The scrolling body of the panel. */
    children?: Snippet
  } = $props()
</script>

<section class="dnd-panel dnd-panel-{variant} dnd-panelbox dnd-panelbox-pad-{pad} dnd-panelbox-span-{span}" aria-label={title}>
  <span class="dnd-panelbox-keyline"></span>

  {#if corners}
    <span class="dnd-panelbox-corner dnd-panelbox-corner-start">
      <Ornament name="cusp" size="xs" tone="metal" />
    </span>
    <span class="dnd-panelbox-corner dnd-panelbox-corner-end">
      <Ornament name="cusp" size="xs" tone="metal" flip />
    </span>
    <span class="dnd-panelbox-corner dnd-panelbox-corner-start dnd-panelbox-corner-low">
      <Ornament name="cusp" size="xs" tone="metal" rotate={-90} />
    </span>
    <span class="dnd-panelbox-corner dnd-panelbox-corner-end dnd-panelbox-corner-low">
      <Ornament name="cusp" size="xs" tone="metal" rotate={180} />
    </span>
  {/if}

  <header class="dnd-panelbox-head">
    <h2 class="dnd-heading dnd-panelbox-title">{title}</h2>
    {#if actions}
      <div class="dnd-panelbox-actions">{@render actions()}</div>
    {/if}
  </header>

  <div class="dnd-scroll dnd-panelbox-body">
    {@render children?.()}
  </div>
</section>

<style>
  .dnd-panelbox-span-two {
    grid-column: span 2;
  }

  .dnd-panelbox {
    --panel-cusp: var(--cusp-sm);
    --panel-dip: var(--dip-sm);
    --panel-keyline: var(--space-3);
    position: relative;
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: auto minmax(0, 1fr);
    height: 100%;
    min-height: 0;
    overflow: hidden;
    border: none;
    border-radius: var(--radius-xl);
    box-shadow: var(--shadow-inset);
    filter: var(--drop-panel);
  }

  .dnd-panelbox-keyline {
    position: absolute;
    inset: var(--panel-keyline);
    z-index: -1;
    border: var(--border-hair) solid color-mix(in srgb, var(--metal-dim) 60%, transparent);
    box-shadow: var(--shadow-hearth-soft);
    border-radius: var(--radius-lg);
    pointer-events: none;
  }

  .dnd-panelbox-corner {
    position: absolute;
    top: var(--panel-keyline);
    z-index: 2;
    opacity: 0.8;
    pointer-events: none;
  }

  .dnd-panelbox-corner-start {
    left: var(--panel-keyline);
  }

  .dnd-panelbox-corner-end {
    right: var(--panel-keyline);
  }

  .dnd-panelbox-corner-low {
    top: auto;
    bottom: var(--panel-keyline);
  }

  .dnd-panelbox-head {
    position: relative;
    isolation: isolate;
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    justify-content: space-between;
    gap: var(--space-2) var(--space-3);
    margin: var(--panel-keyline) var(--panel-keyline) 0;
    padding: var(--space-2) var(--space-4) var(--space-3);
    background:
      radial-gradient(ellipse 60% 140% at 50% 0%, color-mix(in srgb, var(--ember) 8%, transparent) 0%, transparent 70%);
    border-bottom: none;
    border-radius: var(--radius-lg) var(--radius-lg) 0 0;
    box-shadow: 0 1px 0 color-mix(in srgb, var(--metal) 45%, transparent);
  }


  .dnd-panelbox-title {
    min-width: 0;
    font-size: var(--text-lg);
    letter-spacing: var(--tracking-caps);
    text-transform: uppercase;
    padding-inline-start: var(--space-5);
  }

  .dnd-panelbox-actions {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  .dnd-panelbox-body {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    min-height: 0;
  }

  .dnd-panelbox-pad-none .dnd-panelbox-body {
    padding: 0;
  }

  .dnd-panelbox-pad-sm .dnd-panelbox-body {
    padding: var(--space-3);
  }

  .dnd-panelbox-pad-md .dnd-panelbox-body {
    padding: var(--space-5) var(--space-6);
  }
</style>
