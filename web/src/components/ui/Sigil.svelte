<script lang="ts">
  import type { Snippet } from 'svelte'

  const {
    tone = 'metal',
    size = 'md',
    frame = 'quatrefoil',
    count,
    active = false,
    disabled = false,
    title,
    onclick,
    children
  }: {
    /** Colours the ring and the light behind the glyph. */
    tone?: 'metal' | 'ember' | 'verdigris' | 'arcane' | 'bane'
    /** Sets the diameter of the sigil. */
    size?: 'sm' | 'md' | 'lg'
    /** Picks which traced surround the glyph sits in. */
    frame?: SigilFrame
    /** Draws a charge count in the lower right of the ring. */
    count?: number
    /** Lights the ring to mark the sigil as chosen. */
    active?: boolean
    /** Blocks interaction and dims the sigil. */
    disabled?: boolean
    /** Reads as the accessible name and the native tooltip. */
    title: string
    /** Runs when the sigil is pressed. */
    onclick?: (event: MouseEvent) => void
    /** The glyph inside the ring. */
    children?: Snippet
  } = $props()
</script>

<script lang="ts" module>
  export type SigilFrame = 'quatrefoil' | 'ring' | 'cusped' | 'lobed' | 'star' | 'plate'

  const TRACES: Record<SigilFrame, string> = {
    quatrefoil:
      'M28 28A22 22 0 0 1 46.18 6.33L50 1l3.82 5.33A22 22 0 0 1 72 28 22 22 0 0 1 93.67 46.18L99 50l-5.33 3.82A22 22 0 0 1 72 72 22 22 0 0 1 53.82 93.67L50 99l-3.82-5.33A22 22 0 0 1 28 72 22 22 0 0 1 6.33 53.82L1 50l5.33-3.82A22 22 0 0 1 28 28Z',
    ring: 'M50 0 58 6.7A44 44 0 0 1 58 93.3L50 100 42 93.3A44 44 0 0 1 42 6.7L50 0Z',
    cusped:
      'M50 2 68 18h14v14l16 18-16 18v14H68L50 98 32 82H18V68L2 50l16-18V18h14L50 2Z',
    lobed:
      'M79 38a13 13 0 0 1 0 24 13 13 0 0 1-17 17 13 13 0 0 1-24 0 13 13 0 0 1-17-17 13 13 0 0 1 0-24 13 13 0 0 1 17-17 13 13 0 0 1 24 0 13 13 0 0 1 17 17Z',
    star:
      'M50 2 61 22l22-8-8 22 20 11-20 11 8 22-22-8-11 20-11-20-22 8 8-22L5 47l20-11-8-22 22 8L50 2Z',
    plate: 'M20 6h60a18 18 0 0 1 18 18v52a18 18 0 0 1-18 18H20A18 18 0 0 1 2 76V24A18 18 0 0 1 20 6Z'
  }
</script>

<button
  type="button"
  class="dnd-sigil dnd-sigil-{tone} dnd-sigil-{size}"
  class:dnd-sigil-active={active}
  aria-pressed={active || undefined}
  aria-label={title}
  {title}
  {disabled}
  {onclick}
>
  <svg class="dnd-sigil-trace" viewBox="0 0 100 100" aria-hidden="true" focusable="false">
    <path d={TRACES[frame]} class="dnd-sigil-fill" />
    <path d={TRACES[frame]} class="dnd-sigil-rim" />
    <path d={TRACES[frame]} class="dnd-sigil-key" />
  </svg>
  <span class="dnd-sigil-glyph">{@render children?.()}</span>
  {#if count !== undefined}
    <span class="dnd-sigil-count">{count}</span>
  {/if}
</button>

<style>
  .dnd-sigil {
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: none;
    padding: 0;
    border: none;
    background: none;
    cursor: pointer;
    --sigil-d: 3.3rem;
    --sigil-light: var(--metal);
    width: var(--sigil-d);
    height: var(--sigil-d);
  }

  .dnd-sigil-sm {
    --sigil-d: 2.25rem;
  }

  .dnd-sigil-md {
    --sigil-d: 3.3rem;
  }

  .dnd-sigil-lg {
    --sigil-d: 4.6rem;
  }

  .dnd-sigil-metal {
    --sigil-light: var(--metal);
  }

  .dnd-sigil-ember {
    --sigil-light: var(--ember);
  }

  .dnd-sigil-verdigris {
    --sigil-light: var(--verdigris);
  }

  .dnd-sigil-arcane {
    --sigil-light: var(--metal-bright);
  }

  .dnd-sigil-bane {
    --sigil-light: var(--state-bad);
  }

  .dnd-sigil-trace {
    position: absolute;
    inset: 0;
    z-index: 1;
    width: 100%;
    height: 100%;
    overflow: visible;
    pointer-events: none;
    filter: drop-shadow(0 -1px 0 var(--metal-edge)) drop-shadow(0 2px 3px var(--shade));
    transition: transform 0.15s ease, filter 0.15s ease;
  }

  .dnd-sigil-fill {
    fill: var(--ground-deep);
  }

  .dnd-sigil-rim {
    fill: none;
    stroke: var(--metal);
    stroke-width: var(--border-hair);
    vector-effect: non-scaling-stroke;
    stroke-linejoin: round;
  }

  .dnd-sigil-key {
    fill: none;
    stroke: var(--metal-dim);
    stroke-opacity: 0.55;
    stroke-width: var(--border-hair);
    vector-effect: non-scaling-stroke;
    transform: scale(0.82);
    transform-origin: center;
  }

  .dnd-sigil:hover:not(:disabled) .dnd-sigil-rim {
    stroke: var(--metal-bright);
  }

  .dnd-sigil-active .dnd-sigil-fill {
    fill: color-mix(in srgb, var(--sigil-light) 30%, var(--ground-deep));
  }

  .dnd-sigil-active .dnd-sigil-rim {
    stroke: var(--metal-bright);
  }

  .dnd-sigil-glyph {
    position: relative;
    z-index: 2;
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: var(--font-display);
    font-size: calc(var(--sigil-d) * 0.42);
    line-height: 1;
    color: var(--sigil-light);
    text-shadow: 0 1px 0 var(--shadow-ink), 0 0 8px color-mix(in srgb, var(--sigil-light) 60%, transparent);
    transition: color 0.18s ease, text-shadow 0.18s ease, transform 0.15s ease;
  }

  .dnd-sigil-count {
    position: absolute;
    right: -2px;
    bottom: -2px;
    z-index: 3;
    min-width: 1.1rem;
    padding: 0 var(--space-1);
    border-radius: var(--radius-sm);
    background: linear-gradient(180deg, var(--ground) 0%, var(--ground-deep) 100%);
    border: var(--border-hair) solid var(--metal);
    box-shadow: inset 0 0 0 var(--border-hair) var(--ground-deep), var(--shadow-sm);
    font-family: var(--font-figures);
    font-size: var(--text-xs);
    line-height: 1.4;
    color: var(--metal-bright);
  }

  .dnd-sigil:hover:not(:disabled) .dnd-sigil-trace {
    filter: drop-shadow(0 -1px 0 var(--metal-edge)) drop-shadow(0 2px 3px var(--shade)) drop-shadow(0 0 8px var(--ember-glow));
  }

  .dnd-sigil:hover:not(:disabled) .dnd-sigil-glyph {
    color: var(--metal-bright);
    text-shadow: var(--glow-text);
  }

  .dnd-sigil:active:not(:disabled) .dnd-sigil-trace,
  .dnd-sigil:active:not(:disabled) .dnd-sigil-glyph {
    transform: scale(0.94);
    filter: brightness(0.85);
  }

  .dnd-sigil:disabled {
    cursor: not-allowed;
  }

  .dnd-sigil:disabled .dnd-sigil-trace,
  .dnd-sigil:disabled .dnd-sigil-glyph,
  .dnd-sigil:disabled .dnd-sigil-count {
    opacity: 0.4;
    filter: grayscale(0.7);
  }

  .dnd-sigil:focus-visible {
    outline: none;
    border-radius: var(--radius-pill);
    box-shadow: var(--focus-ring);
  }
</style>
