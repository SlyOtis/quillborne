<script lang="ts">
  import type { Snippet } from 'svelte'
  import { getRarityInk, type Rarity } from '$lib/resources'
  import Glyph from './Glyph.svelte'
  import IconBtn from './IconBtn.svelte'
  import StoredImage from './StoredImage.svelte'

  const {
    title,
    sub,
    mark,
    image,
    tone = 'metal',
    rarity,
    on = false,
    onclick,
    onopen,
    children
  }: {
    /** The name written at the head of the row. */
    title: string
    /** A quieter line beside the name. */
    sub?: string
    /** Short word set at the end of the row. */
    mark?: string
    /** A picture drawn square at the start of the row. */
    image?: string
    /** Colours the keyline against the active theme. */
    tone?: 'metal' | 'ember' | 'verdigris'
    /** Writes the name in the tone of its rarity. */
    rarity?: Rarity
    /** Marks the row as the one being read. */
    on?: boolean
    /** Runs when the row is pressed. */
    onclick?: (event: MouseEvent) => void
    /** Draws an Open action at the end of the row and runs when it is pressed. */
    onopen?: () => void
    /** The columns written between the name and the mark. */
    children?: Snippet
  } = $props()
</script>

<div
  class="dnd-row dnd-row-{tone}"
  class:dnd-row-on={on}
  aria-current={on ? 'page' : undefined}
  style:--row-ink={rarity ? getRarityInk(rarity) : undefined}
>
  <button type="button" class="dnd-row-press" {onclick}>
    <span class="dnd-row-keyline" aria-hidden="true"></span>

    {#if image}
      <span class="dnd-row-face"><StoredImage src={image} alt="" /></span>
    {/if}

    <span class="dnd-row-head">
      <span class="dnd-row-title">{title}</span>
      {#if sub}<span class="dnd-row-sub">{sub}</span>{/if}
      {#if children}
        <span class="dnd-row-cols">{@render children()}</span>
      {/if}
    </span>

    {#if mark}
      <span class="dnd-row-mark">{mark}</span>
    {/if}
  </button>

  {#if onopen}
    <span class="dnd-row-acts">
      <IconBtn title="Open" onclick={onopen}>
        <Glyph name="forward" size="sm" />
      </IconBtn>
    </span>
  {/if}
</div>

<style>
  .dnd-row {
    --row-light: var(--metal);
    display: flex;
    align-items: stretch;
    width: 100%;
    min-width: 0;
    border: none;
    border-radius: var(--radius-sm);
    background:
      radial-gradient(ellipse 70% 120% at 0% 50%, color-mix(in srgb, var(--row-light) 6%, transparent) 0%, transparent 70%),
      var(--texture-noise),
      linear-gradient(180deg, var(--ground-raised) 0%, var(--ground-deep) 100%);
    box-shadow:
      inset 0 0 0 1px var(--keyline),
      inset 0 0 0 2px var(--metal-dim),
      inset 0 0 0 3px var(--keyline),
      inset 0 0 14px 2px var(--shade-hard);
    transition: box-shadow 0.15s ease, filter 0.15s ease;
  }

  .dnd-row-ember {
    --row-light: var(--ember);
  }

  .dnd-row-verdigris {
    --row-light: var(--verdigris);
  }

  .dnd-row:hover {
    box-shadow:
      inset 0 0 0 1px var(--keyline),
      inset 0 0 0 2px var(--metal),
      inset 0 0 0 3px var(--keyline),
      inset 0 0 14px 2px var(--shade-hard),
      inset 0 0 22px color-mix(in srgb, var(--row-light) 22%, transparent);
    filter: brightness(1.06);
  }

  .dnd-row:hover .dnd-row-title {
    text-shadow: var(--glow-text);
  }

  .dnd-row:active {
    filter: brightness(0.88);
  }

  .dnd-row-on,
  .dnd-row-on:hover {
    box-shadow:
      var(--rim),
      inset 0 0 14px 2px var(--shade-hard),
      inset 0 0 24px var(--ember-glow),
      0 0 10px var(--ember-glow);
  }

  .dnd-row-on .dnd-row-title {
    text-shadow: var(--glow-text);
  }

  .dnd-row-press {
    display: flex;
    align-items: center;
    gap: var(--space-4);
    flex: 1;
    min-width: 0;
    padding: var(--space-3) var(--space-4);
    border: none;
    background: none;
    text-align: start;
    color: inherit;
    cursor: pointer;
  }

  .dnd-row-press:focus-visible {
    outline: none;
    box-shadow: var(--focus-ring);
    border-radius: var(--radius-sm);
  }

  .dnd-row-keyline {
    flex: none;
    width: var(--border-heavy);
    height: var(--space-5);
    border-radius: var(--radius-sm);
    background: linear-gradient(180deg, var(--metal-bright), var(--row-light) 50%, var(--metal-dim));
    box-shadow: 0 0 0 1px var(--keyline), 0 0 6px color-mix(in srgb, var(--row-light) 45%, transparent);
    opacity: 0.85;
  }

  .dnd-row-face {
    display: block;
    flex: none;
    width: var(--space-7);
    height: var(--space-7);
    overflow: hidden;
    border: var(--border-hair) solid var(--metal);
    box-shadow: 0 0 0 1px var(--keyline), inset 0 0 6px var(--shade-hard);
    border-radius: var(--radius-sm);
    background: var(--ground-deep);
  }

  .dnd-row-face :global(img) {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .dnd-row-head {
    display: flex;
    flex: 1;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--space-1);
    min-width: 0;
  }

  .dnd-row-title {
    max-width: 100%;
    font-family: var(--font-display);
    font-size: var(--text-md);
    color: var(--row-ink, var(--metal-bright));
    text-shadow: 0 1px 0 #000;
    transition: text-shadow 0.15s ease;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .dnd-row-sub {
    max-width: 100%;
    font-size: var(--text-xs);
    color: var(--ink-dim);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .dnd-row-cols {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-1) var(--space-4);
    max-width: 100%;
    font-family: var(--font-figures);
    font-size: var(--text-xs);
    color: var(--ink-faint);
  }

  .dnd-row-mark {
    flex: none;
    padding: 1px var(--space-2);
    border: var(--border-hair) solid var(--metal-dim);
    border-radius: var(--radius-sm);
    background: var(--texture-noise), var(--ground-deep);
    box-shadow: var(--bevel-down);
    font-family: var(--font-figures);
    letter-spacing: var(--tracking-wide);
    font-size: var(--text-xs);
    color: var(--metal);
  }

  .dnd-row-acts {
    display: flex;
    flex: none;
    align-self: center;
    align-items: center;
    height: var(--space-7);
    padding-inline-end: var(--space-3);
    border-inline-start: var(--border-hair) solid var(--metal-dim);
    padding-inline-start: var(--space-2);
  }
</style>
