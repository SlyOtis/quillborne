<script lang="ts">
  import type { Snippet } from 'svelte'
  import Glyph, { type GlyphName } from './Glyph.svelte'

  const {
    on = false,
    still = false,
    glyph,
    onclick,
    children
  }: {
    /** Lights the chip to mark it as picked. */
    on?: boolean
    /** Draws the chip as a plain mark that cannot be pressed. */
    still?: boolean
    /** The glyph drawn at the start of the chip. */
    glyph?: GlyphName
    /** Runs when the chip is pressed. */
    onclick?: (event: MouseEvent) => void
    /** The word the chip carries. */
    children?: Snippet
  } = $props()
</script>

{#if still}
  <span class="dnd-chip dnd-chip-still">
    {#if glyph}<span class="dnd-chip-glyph"><Glyph name={glyph} size="sm" /></span>{/if}
    {@render children?.()}
  </span>
{:else}
  <button type="button" class="dnd-chip" class:dnd-chip-on={on} aria-pressed={on} {onclick}>
    {#if glyph}<span class="dnd-chip-glyph"><Glyph name={glyph} size="sm" /></span>{/if}
    {@render children?.()}
  </button>
{/if}

<style>
  .dnd-chip {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    min-width: 0;
    padding: var(--space-0) var(--space-2);
    border: var(--border-hair) solid color-mix(in srgb, var(--metal-dim) 80%, transparent);
    border-radius: var(--radius-sm);
    background: var(--ground-deep);
    font-family: var(--font-display);
    font-size: var(--text-xs);
    letter-spacing: var(--tracking-wide);
    white-space: nowrap;
    color: var(--ink-dim);
    cursor: pointer;
    transition: color 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease;
  }

  .dnd-chip-glyph {
    display: flex;
    flex: none;
    color: var(--metal);
  }

  .dnd-chip:hover {
    border-color: var(--metal);
    color: var(--metal-bright);
  }

  .dnd-chip:active {
    filter: brightness(0.85);
  }

  .dnd-chip-on {
    border-color: var(--metal);
    color: var(--metal-bright);
    box-shadow: inset 0 0 8px var(--ember-glow), 0 0 12px var(--ember-glow);
  }

  .dnd-chip-still,
  .dnd-chip-still:hover {
    border-color: color-mix(in srgb, var(--metal-dim) 80%, transparent);
    cursor: default;
    color: var(--metal);
  }

  .dnd-chip:focus-visible {
    outline: none;
    box-shadow: var(--focus-ring);
  }
</style>
