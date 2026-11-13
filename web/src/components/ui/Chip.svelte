<script lang="ts">
  import type { Snippet } from 'svelte'
  import { getRarityInk, type Rarity } from '$lib/resources'

  const {
    on = false,
    still = false,
    rarity,
    onclick,
    children
  }: {
    /** Lights the chip to mark it as picked. */
    on?: boolean
    /** Draws the chip as a plain mark that cannot be pressed. */
    still?: boolean
    /** Writes the word in the tone of its rarity. */
    rarity?: Rarity
    /** Runs when the chip is pressed. */
    onclick?: (event: MouseEvent) => void
    /** The word the chip carries. */
    children?: Snippet
  } = $props()
</script>

{#if still}
  <span
    class="dnd-chip dnd-chip-still"
    class:dnd-chip-rarity={Boolean(rarity)}
    style:--chip-ink={rarity ? getRarityInk(rarity) : undefined}
  >
    {@render children?.()}
  </span>
{:else}
  <button
    type="button"
    class="dnd-chip"
    class:dnd-chip-on={on}
    class:dnd-chip-rarity={Boolean(rarity)}
    style:--chip-ink={rarity ? getRarityInk(rarity) : undefined}
    aria-pressed={on}
    {onclick}
  >
    {@render children?.()}
  </button>
{/if}

<style>
  .dnd-chip {
    padding: var(--space-0) var(--space-3);
    border: none;
    border-radius: var(--radius-sm);
    background: var(--texture-noise), linear-gradient(180deg, var(--ground-lift) 0%, var(--ground-deep) 100%);
    box-shadow: var(--rim-thin);
    font-family: var(--font-display);
    font-size: var(--text-xs);
    letter-spacing: var(--tracking-wide);
    white-space: nowrap;
    color: var(--ink-dim);
    text-shadow: 0 1px 0 #000;
    cursor: pointer;
    transition: color 0.15s ease, text-shadow 0.15s ease, box-shadow 0.15s ease;
  }

  .dnd-chip:hover {
    color: var(--metal-bright);
    text-shadow: var(--glow-text);
  }

  .dnd-chip:active {
    filter: brightness(0.85);
  }

  .dnd-chip-on {
    color: var(--metal-bright);
    box-shadow: var(--rim-thin), inset 0 0 8px var(--ember-glow), 0 0 12px var(--ember-glow);
  }

  .dnd-chip-still,
  .dnd-chip-still:hover {
    cursor: default;
    color: var(--metal);
    text-shadow: 0 1px 0 #000;
  }

  .dnd-chip-rarity {
    color: color-mix(in srgb, var(--chip-ink) 65%, var(--ink-faint));
  }

  .dnd-chip-rarity:hover,
  .dnd-chip-rarity.dnd-chip-on,
  .dnd-chip-rarity.dnd-chip-still {
    color: var(--chip-ink);
  }

  .dnd-chip-rarity.dnd-chip-on {
    box-shadow: var(--rim-thin), inset 0 0 8px color-mix(in srgb, var(--chip-ink) 45%, transparent), 0 0 12px color-mix(in srgb, var(--chip-ink) 45%, transparent);
  }

  .dnd-chip:focus-visible {
    outline: none;
    box-shadow: var(--focus-ring);
  }
</style>
