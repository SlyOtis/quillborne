<script lang="ts">
  import type { Snippet } from 'svelte'
  import Glyph from './Glyph.svelte'
  import IconBtn from './IconBtn.svelte'

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
    /** How many things the body lists. Past six the body folds to its first rows under a fade, with a button that shows them all. */
    count?: number
    /** Controls placed at the tail of the divide, after the fold. */
    actions?: Snippet
    /** What the section holds. */
    children: Snippet
  } = $props()

  let open = $state(false)
  const folded = $derived(count > 6)
  const word = $derived(open ? 'Fold' : `See all ${count}`)
</script>

<section class="dnd-section" aria-label={title}>
  <header class="dnd-section-divide">
    <h2 class="dnd-label dnd-section-title">{title}</h2>
    {#if note}<span class="dnd-section-note">{note}</span>{/if}
    <span class="dnd-section-run"></span>
    {#if folded}
      <IconBtn title={word} active={open} onclick={() => (open = !open)}><Glyph name={open ? 'fold' : 'unfold'} size="sm" /></IconBtn>
    {/if}
    {@render actions?.()}
  </header>

  <div class="dnd-section-fold" class:dnd-section-folded={folded} class:dnd-section-closed={folded && !open}>
    {@render children()}
  </div>

  {#if folded}
    <button type="button" class="dnd-section-more" aria-expanded={open} onclick={() => (open = !open)}>
      <span class="dnd-label dnd-section-more-word">{word}</span>
      <span class="dnd-section-more-glyph"><Glyph name={open ? 'fold' : 'unfold'} size="sm" /></span>
    </button>
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
    --section-peek: calc(var(--space-8) * 5.75);
    --section-bleed: var(--space-4);
    min-width: 0;
  }

  .dnd-section-folded {
    position: relative;
    margin: calc(var(--section-bleed) * -1);
    padding: var(--section-bleed);
    max-block-size: calc(var(--section-peek) * 12);
    overflow: hidden;
    transition: max-block-size 600ms cubic-bezier(0.16, 1, 0.3, 1);
  }

  .dnd-section-closed {
    max-block-size: var(--section-peek);
    -webkit-mask-image: linear-gradient(180deg, var(--ground-deep) calc(100% - var(--space-8)), transparent 100%);
    mask-image: linear-gradient(180deg, var(--ground-deep) calc(100% - var(--space-8)), transparent 100%);
  }

  .dnd-section-more {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-2);
    inline-size: 100%;
    padding: var(--space-2) 0;
    border: none;
    background: none;
    color: var(--metal);
    cursor: pointer;
  }

  .dnd-section-more:hover .dnd-section-more-word,
  .dnd-section-more:focus-visible .dnd-section-more-word {
    color: var(--metal-bright);
  }

  .dnd-section-more:focus-visible {
    outline: none;
    box-shadow: var(--focus-ring);
  }

  .dnd-section-more-word {
    margin: 0;
  }

  .dnd-section-more-glyph {
    display: flex;
    color: var(--metal);
  }
</style>
