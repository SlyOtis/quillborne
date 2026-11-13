<script lang="ts">
  import type { Snippet } from 'svelte'

  const {
    title,
    tone = 'metal',
    active = false,
    disabled = false,
    onclick,
    onpointerdown,
    children
  }: {
    /** Reads as the accessible name and the native tooltip. */
    title: string
    /** Colours the glyph. */
    tone?: 'metal' | 'ember' | 'verdigris' | 'ink'
    /** Lights the glyph to mark it as chosen. */
    active?: boolean
    /** Blocks the press and dims the glyph. */
    disabled?: boolean
    /** Runs when the button is pressed. */
    onclick?: (event: MouseEvent) => void
    /** Runs when the pointer lands, for a control that drags. */
    onpointerdown?: (event: PointerEvent) => void
    /** The glyph the button carries and nothing else. */
    children?: Snippet
  } = $props()
</script>

<button
  type="button"
  class="dnd-iconbtn dnd-iconbtn-{tone}"
  class:dnd-iconbtn-on={active}
  aria-pressed={active || undefined}
  aria-label={title}
  {title}
  {disabled}
  {onclick}
  {onpointerdown}
>
  {@render children?.()}
</button>

<style>
  .dnd-iconbtn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: none;
    inline-size: 1.75em;
    block-size: 1.75em;
    padding: 0.3em;
    border: none;
    border-radius: var(--radius-pill);
    background: none;
    color: var(--icon-tone);
    cursor: pointer;
    --icon-tone: var(--metal);
    transition: color 0.15s ease, box-shadow 0.15s ease, filter 0.15s ease;
  }

  .dnd-iconbtn-metal {
    --icon-tone: var(--metal);
  }

  .dnd-iconbtn-ember {
    --icon-tone: var(--ember);
  }

  .dnd-iconbtn-verdigris {
    --icon-tone: var(--verdigris);
  }

  .dnd-iconbtn-ink {
    --icon-tone: var(--ink-dim);
  }

  .dnd-iconbtn > :global(svg) {
    display: block;
    inline-size: 100%;
    block-size: 100%;
    margin: 0;
  }

  .dnd-iconbtn:hover:not(:disabled) {
    color: var(--metal-bright);
    background: color-mix(in srgb, var(--metal) 16%, transparent);
  }

  .dnd-iconbtn:active:not(:disabled) {
    box-shadow:
      inset 0 0 0 1px var(--keyline),
      inset 0 0 0 2px var(--metal-dim),
      inset 0 0 0 3px var(--keyline),
      inset 0 3px 5px var(--shade-hard);
    filter: brightness(0.85);
  }

  .dnd-iconbtn-on {
    color: var(--metal-bright);
    box-shadow:
      inset 0 0 0 1px var(--keyline),
      inset 0 0 0 2px var(--metal-bright),
      inset 0 0 0 3px var(--keyline),
      inset 0 0 12px var(--ember-glow),
      0 0 8px var(--ember-glow);
  }

  .dnd-iconbtn:disabled {
    cursor: not-allowed;
    opacity: 0.4;
    filter: grayscale(0.85);
  }

  .dnd-iconbtn:focus-visible {
    outline: none;
    box-shadow: var(--focus-ring);
  }
</style>
