<script lang="ts">
  import type { Snippet } from 'svelte'

  const {
    variant = 'primary',
    size = 'md',
    type = 'button',
    disabled = false,
    fill = false,
    loading = false,
    title,
    onclick,
    children
  }: {
    /** Picks the tone of the button against the active theme. Plain is the words alone, with no frame. */
    variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'plain'
    /** Sets the height and the label size of the button. */
    size?: 'sm' | 'md' | 'lg'
    /** Native button type. Submit inside a form, button everywhere else. */
    type?: 'button' | 'submit' | 'reset'
    /** Blocks interaction and dims the button. */
    disabled?: boolean
    /** Stretches the button to the width of its container. */
    fill?: boolean
    /** Shows a spinner in place of the label and blocks interaction. */
    loading?: boolean
    /** Native tooltip text. */
    title?: string
    /** Runs when the button is pressed. */
    onclick?: (event: MouseEvent) => void
    /** The label content. */
    children?: Snippet
  } = $props()
</script>

<button
  {type}
  {title}
  class="dnd-button dnd-button-{variant} dnd-button-{size}"
  class:dnd-button-fill={fill}
  class:dnd-button-loading={loading}
  disabled={disabled || loading}
  {onclick}
>
  <span class="dnd-button-frame"></span>
  <span class="dnd-button-face"></span>
  <span class="dnd-button-sheen"></span>
  <span class="dnd-button-inner">
    {#if loading}
      <span class="dnd-button-spinner" aria-hidden="true"></span>
    {/if}
    {@render children?.()}
  </span>
</button>

<style>
  .dnd-button {
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: none;
    padding: 0;
    border: none;
    background: none;
    cursor: pointer;
    isolation: isolate;
    --button-h: 2.4rem;
    --button-pad: var(--space-5);
    --button-text: var(--text-sm);
    --button-light: var(--ember-glow);
    --button-cut: var(--radius-md);
    --button-edge: 0.16rem;
    --button-rim: linear-gradient(180deg, var(--metal-bright) 0%, var(--metal) 38%, var(--metal-dim) 70%, var(--metal) 100%);
    --button-stone: var(--stone);
    --button-tint: transparent;
    --button-ink: var(--metal);
    --button-shape: inset(0 round var(--button-cut));
    min-height: var(--button-h);
    filter: drop-shadow(0 2px 3px var(--shade-hard));
    transition: filter 0.18s ease;
  }

  .dnd-button-sm {
    --button-h: 1.8rem;
    --button-pad: var(--space-4);
    --button-text: var(--text-xs);
    --button-cut: var(--radius-sm);
    --button-edge: 0.12rem;
  }

  .dnd-button-md {
    --button-h: 2.4rem;
    --button-pad: var(--space-5);
    --button-text: var(--text-sm);
    --button-cut: var(--radius-md);
    --button-edge: 0.16rem;
  }

  .dnd-button-lg {
    --button-h: 3.2rem;
    --button-pad: var(--space-6);
    --button-text: var(--text-md);
    --button-cut: var(--radius-lg);
    --button-edge: 0.18rem;
  }

  .dnd-button-fill {
    width: 100%;
  }

  .dnd-button-frame {
    position: absolute;
    inset: 0;
    z-index: 0;
    background: var(--button-rim);
    clip-path: var(--button-shape);
    pointer-events: none;
  }

  .dnd-button-face {
    position: absolute;
    inset: var(--button-edge);
    z-index: 1;
    background:
      linear-gradient(180deg, color-mix(in srgb, var(--stone-light) 18%, transparent) 0%, color-mix(in srgb, #000 42%, transparent) 38%, color-mix(in srgb, #000 72%, transparent) 100%),
      linear-gradient(var(--button-tint), var(--button-tint)),
      var(--texture-stone),
      var(--button-stone);
    clip-path: var(--button-shape);
    box-shadow:
      inset 0 1px 0 var(--sheen-strong),
      inset 0 -2px 0 var(--shade-hard),
      inset 0 0 0 1px var(--keyline);
    pointer-events: none;
    transition: filter 0.18s ease;
  }

  .dnd-button-sheen {
    position: absolute;
    inset: var(--button-edge);
    z-index: 2;
    background: radial-gradient(ellipse 70% 120% at 50% 110%, var(--button-light) 0%, transparent 70%);
    clip-path: var(--button-shape);
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.18s ease;
  }

  .dnd-button-inner {
    position: relative;
    z-index: 3;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-2);
    padding: 0 var(--button-pad);
    min-height: var(--button-h);
    font-family: var(--font-display);
    font-size: var(--button-text);
    font-weight: 700;
    letter-spacing: var(--tracking-caps);
    text-transform: uppercase;
    line-height: 1.1;
    color: var(--button-ink);
    text-shadow: 0 1px 0 #000, 0 0 2px #000;
    transition: color 0.18s ease, text-shadow 0.18s ease;
  }

  .dnd-button:hover:not(:disabled) {
    filter: drop-shadow(0 2px 3px var(--shade-hard)) brightness(1.08);
  }

  .dnd-button:hover:not(:disabled) .dnd-button-sheen {
    opacity: 1;
  }

  .dnd-button:hover:not(:disabled) .dnd-button-inner {
    color: var(--metal-bright);
    text-shadow: var(--glow-text);
  }

  .dnd-button:active:not(:disabled) .dnd-button-face {
    box-shadow:
      inset 0 3px 5px var(--shade-hard),
      inset 0 -1px 0 var(--sheen-soft),
      inset 0 0 0 1px var(--keyline);
    filter: brightness(0.82);
  }

  .dnd-button:active:not(:disabled) .dnd-button-inner {
    transform: translateY(1px);
  }

  .dnd-button:focus-visible {
    outline: none;
    box-shadow: none;
    filter: drop-shadow(0 0 0.15rem var(--metal-bright)) drop-shadow(0 0 0.5rem var(--ember-glow));
  }

  .dnd-button:disabled {
    cursor: not-allowed;
    opacity: 0.5;
    filter: grayscale(0.85);
  }

  .dnd-button-primary {
    --button-rim: linear-gradient(180deg, var(--ember-core) 0%, var(--metal-bright) 22%, var(--metal) 55%, var(--metal-dim) 100%);
    --button-tint: color-mix(in srgb, var(--ember) 16%, transparent);
    --button-ink: var(--metal-bright);
  }

  .dnd-button-primary .dnd-button-sheen {
    opacity: 0.45;
  }

  .dnd-button-secondary {
    --button-light: color-mix(in srgb, var(--metal) 40%, transparent);
  }

  .dnd-button-ghost {
    --button-light: color-mix(in srgb, var(--metal) 30%, transparent);
    --button-rim: linear-gradient(180deg, var(--metal-dim) 0%, color-mix(in srgb, var(--metal-dim) 50%, #000) 100%);
    --button-stone: var(--ground-raised);
    --button-ink: var(--metal);
  }

  .dnd-button-ghost .dnd-button-face {
    background:
      linear-gradient(180deg, color-mix(in srgb, var(--ground-lift) 70%, transparent) 0%, color-mix(in srgb, var(--ground-deep) 90%, transparent) 100%),
      var(--texture-noise),
      var(--button-stone);
  }

  .dnd-button-ghost:hover:not(:disabled) {
    --button-rim: linear-gradient(180deg, var(--metal) 0%, var(--metal-dim) 100%);
  }

  .dnd-button-plain,
  .dnd-button-plain:hover:not(:disabled) {
    filter: none;
  }

  .dnd-button-plain .dnd-button-frame,
  .dnd-button-plain .dnd-button-face,
  .dnd-button-plain .dnd-button-sheen {
    display: none;
  }

  .dnd-button-danger {
    --button-light: color-mix(in srgb, var(--state-bad) 55%, transparent);
    --button-rim: linear-gradient(180deg, color-mix(in srgb, var(--state-bad) 60%, var(--metal-bright)) 0%, color-mix(in srgb, var(--state-bad) 70%, #000) 60%, color-mix(in srgb, var(--state-bad) 40%, #000) 100%);
    --button-tint: color-mix(in srgb, var(--state-bad) 30%, transparent);
    --button-ink: color-mix(in srgb, var(--state-bad) 30%, var(--ink));
  }

  .dnd-button-danger:hover:not(:disabled) .dnd-button-inner {
    color: var(--ink);
    text-shadow: 0 0 8px var(--state-bad), 0 1px 1px #000;
  }

  .dnd-button-spinner {
    width: 1em;
    height: 1em;
    border: 2px solid currentColor;
    border-top-color: transparent;
    border-radius: var(--radius-pill);
    animation: dnd-button-spin 0.7s linear infinite;
  }

  @keyframes dnd-button-spin {
    to {
      transform: rotate(360deg);
    }
  }
</style>
