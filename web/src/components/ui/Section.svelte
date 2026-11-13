<script lang="ts">
  import type { Snippet } from 'svelte'
  import Button from './Button.svelte'
  import Glyph from './Glyph.svelte'
  import IconBtn from './IconBtn.svelte'
  import { unfold } from '$lib/unfold'

  const {
    title,
    note,
    count = 0,
    actions,
    children
  }: {
    /** The name written on the divide. */
    title: string
    /** A short line written beside the name. */
    note?: string
    /** How many things the body lists. Anything there can be folded to a short peek under a fade, with the words to show it again under it. */
    count?: number
    /** Controls placed at the tail of the divide, after the fold. */
    actions?: Snippet
    /** What the section holds. */
    children: Snippet
  } = $props()

  let open = $state(true)
</script>

<section class="dnd-section" aria-label={title}>
  <header class="dnd-section-divide">
    <h2 class="dnd-label dnd-section-title">{title}</h2>
    {#if note}<span class="dnd-section-note">{note}</span>{/if}
    <span class="dnd-section-run"></span>
    {#if count > 0}
      <IconBtn title="{open ? 'Collapse' : 'Expand'} {title}" onclick={() => (open = !open)}><Glyph name={open ? 'fold' : 'unfold'} size="sm" /></IconBtn>
    {/if}
    {@render actions?.()}
  </header>

  <div class="dnd-section-fold" class:dnd-section-shut={!open} use:unfold={open}>
    {@render children()}
  </div>

  {#if !open}
    <Button variant="plain" size="sm" fill onclick={() => (open = true)}>Show the {title}</Button>
  {/if}
</section>

<style>
  .dnd-section {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    min-width: 0;
  }

  .dnd-section-divide {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-3);
    min-width: 0;
    padding-block: 0.5em;
    border-bottom: var(--border-hair) solid color-mix(in srgb, var(--metal) 55%, transparent);
  }

  .dnd-section-title {
    margin: 0;
    font-size: var(--text-sm);
    font-weight: 700;
    color: var(--metal-bright);
    text-shadow: 0 0.0625rem 0 var(--ground-deep), 0 0 0.5rem var(--ember-glow);
  }

  .dnd-section-note {
    font-family: var(--font-body);
    font-size: var(--text-xs);
    font-style: italic;
    color: var(--ink);
    text-shadow: 0 0.0625rem 0 var(--ground-deep);
  }

  .dnd-section-run {
    flex: 1;
    min-width: 0;
  }

  .dnd-section-fold {
    --section-bleed: var(--space-4);
    --unfold-rest: calc(var(--section-bleed) + var(--space-8) * 1.75);
    --unfold-time: 0.48s;
    min-width: 0;
    margin: calc(var(--section-bleed) * -1);
    padding: var(--section-bleed);
  }

  .dnd-section-shut {
    -webkit-mask-image: linear-gradient(180deg, var(--ground-deep) calc(100% - var(--space-8) * 1.5), transparent 100%);
    mask-image: linear-gradient(180deg, var(--ground-deep) calc(100% - var(--space-8) * 1.5), transparent 100%);
  }
</style>
