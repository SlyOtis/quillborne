<script lang="ts">
  const {
    label,
    value,
    score,
    sub,
    tone = 'metal',
    lit = false,
    title,
    onclick
  }: {
    /** The caps line written above the plate. */
    label: string
    /** The figure shown on the face of the plate. */
    value: string | number
    /** A second figure shown in the cap under the plate. */
    score?: string | number
    /** A small line written under the figure. */
    sub?: string
    /** Colours the plate against the active theme. */
    tone?: 'metal' | 'ember' | 'verdigris' | 'bane'
    /** Lights the plate to mark it as spent or charged. */
    lit?: boolean
    /** Native tooltip text and the accessible name when the plate is pressable. */
    title?: string
    /** Makes the plate pressable and runs when it is pressed. */
    onclick?: (event: MouseEvent) => void
  } = $props()
</script>

<div class="dnd-stat dnd-stat-{tone}" class:dnd-stat-lit={lit}>
  <span class="dnd-stat-label"><span class="dnd-stat-name">{label}</span></span>

  {#if onclick}
    <button type="button" class="dnd-stat-face" aria-label={title ?? label} title={title ?? label} {onclick}>
      <span class="dnd-stat-plate"></span>
      <span class="dnd-stat-sheen"></span>
      <span class="dnd-stat-value">{value}</span>
      {#if sub}<span class="dnd-stat-sub">{sub}</span>{/if}
    </button>
  {:else}
    <span class="dnd-stat-face dnd-stat-face-still" {title}>
      <span class="dnd-stat-plate"></span>
      <span class="dnd-stat-sheen"></span>
      <span class="dnd-stat-value">{value}</span>
      {#if sub}<span class="dnd-stat-sub">{sub}</span>{/if}
    </span>
  {/if}

  {#if score !== undefined}
    <span class="dnd-stat-score">{score}</span>
  {/if}
</div>

<style>
  .dnd-stat {
    position: relative;
    container-type: inline-size;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--space-1);
    min-width: 0;
    padding: var(--space-3) var(--space-2) calc(var(--space-5) + var(--space-3));
    --stat-light: var(--metal);
    --stat-brace: var(--metal);
    --stat-rim: var(--metal);
    --stat-cusp: 0.6rem;
    --stat-shape: inset(0 round 50% 50% var(--radius-md) var(--radius-md) / var(--radius-xl) var(--radius-xl) var(--radius-md) var(--radius-md));
    background:
      radial-gradient(ellipse 90% 55% at 50% 0%, color-mix(in srgb, var(--ember) 8%, transparent) 0%, transparent 70%),
      var(--texture-noise),
      linear-gradient(180deg, var(--ground-raised) 0%, var(--ground-deep) 100%);
    border: none;
    border-radius: 50% 50% var(--radius-lg) var(--radius-lg) / var(--radius-xl) var(--radius-xl) var(--radius-lg) var(--radius-lg);
    box-shadow: var(--rim-thin), inset 0 0 16px 2px var(--shade-hard), var(--shadow-sm);
  }

  .dnd-stat::before,
  .dnd-stat::after {
    content: '';
    position: absolute;
    width: var(--stat-cusp);
    height: var(--stat-cusp);
    border: var(--border-width) solid var(--stat-brace);
    opacity: 0.95;
    filter: drop-shadow(0 1px 0 var(--shadow-ink));
    pointer-events: none;
  }

  .dnd-stat::before {
    bottom: -1px;
    left: -1px;
    border-right: none;
    border-top: none;
    border-bottom-left-radius: var(--radius-lg);
  }

  .dnd-stat::after {
    right: -1px;
    bottom: -1px;
    border-left: none;
    border-top: none;
    border-bottom-right-radius: var(--radius-lg);
  }

  .dnd-stat-ember {
    --stat-light: var(--ember);
  }

  .dnd-stat-verdigris {
    --stat-light: var(--verdigris);
  }

  .dnd-stat-bane {
    --stat-light: var(--state-bad);
  }

  .dnd-stat-label {
    position: absolute;
    inset-block-end: var(--space-4);
    inset-inline: var(--space-2);
    display: flex;
    white-space: nowrap;
    align-items: center;
    justify-content: center;
    gap: var(--space-2);
    max-width: 100%;
    font-family: var(--font-display);
    font-size: min(var(--text-xs), 9.5cqi);
    font-weight: 700;
    letter-spacing: min(var(--tracking-caps), 1.2cqi);
    text-transform: uppercase;
    color: var(--metal);
    text-align: center;
    line-height: 1.2;
    text-shadow: 0 1px 0 var(--shadow-ink);
  }

  .dnd-stat-name {
    flex: 0 1 auto;
    min-width: min-content;

  }

  .dnd-stat-face {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0;
    min-width: calc(var(--space-7) + var(--space-2));
    min-height: var(--space-7);
    padding: var(--space-1) var(--space-3);
    border: none;
    background: linear-gradient(180deg, var(--metal-bright) 0%, var(--stat-rim) 30%, var(--metal-dim) 75%, var(--stat-rim) 100%);
    color: var(--ink);
    clip-path: var(--stat-shape);
    transition: filter 0.15s ease, transform 0.12s ease;
  }

  .dnd-stat-plate {
    position: absolute;
    inset: var(--border-width);
    z-index: 0;
    background:
      linear-gradient(180deg, color-mix(in srgb, var(--shadow-ink) 35%, transparent) 0%, color-mix(in srgb, var(--shadow-ink) 70%, transparent) 100%),
      var(--texture-noise),
      var(--ground-raised);
    clip-path: var(--stat-shape);
    box-shadow: inset 0 2px 4px var(--shade-hard), inset 0 0 0 1px var(--keyline);
    pointer-events: none;
  }

  button.dnd-stat-face {
    cursor: pointer;
  }

  button.dnd-stat-face:hover {
    filter: brightness(1.12) drop-shadow(0 0 8px var(--ember-glow));
  }

  button.dnd-stat-face:hover .dnd-stat-value {
    color: var(--metal-bright);
    text-shadow: var(--glow-text);
  }

  button.dnd-stat-face:active {
    filter: brightness(0.85);
  }

  button.dnd-stat-face:active .dnd-stat-value {
    transform: translateY(1px);
  }

  button.dnd-stat-face:focus-visible {
    outline: none;
    --stat-rim: var(--metal-bright);
    filter: drop-shadow(0 0 8px var(--metal));
  }

  button.dnd-stat-face:focus-visible .dnd-stat-plate {
    box-shadow: inset 0 0 0 var(--border-width) var(--metal-bright);
  }

  .dnd-stat-value {
    position: relative;
    z-index: 2;
    font-family: var(--font-figures);
    font-size: var(--text-lg);
    font-weight: 700;
    font-variant-numeric: lining-nums tabular-nums;
    line-height: 1.1;
    color: var(--ink);
    text-shadow: 0 1px 0 var(--shadow-ink), 0 0 3px var(--shadow-ink);
    transition: color 0.18s ease, text-shadow 0.18s ease;
  }

  .dnd-stat-sub {
    position: relative;
    z-index: 2;
    margin-block-start: calc(var(--space-1) * -1);
    font-family: var(--font-display);
    font-size: var(--text-xs);
    line-height: 1;
    color: var(--ink-dim);
    text-shadow: 0 1px 0 var(--shadow-ink);
  }

  .dnd-stat-sheen {
    position: absolute;
    top: var(--border-width);
    right: var(--border-width);
    left: var(--border-width);
    z-index: 1;
    height: 34%;
    background: linear-gradient(180deg, var(--sheen-soft) 0%, transparent 100%);
    pointer-events: none;
  }

  .dnd-stat-score {
    position: absolute;
    z-index: 2;
    bottom: calc(var(--space-3) * -1);
    left: 50%;
    transform: translateX(-50%);
    min-width: var(--space-7);
    padding: 0 var(--space-2);
    background: var(--texture-noise), linear-gradient(180deg, var(--ground-lift), var(--ground-deep));
    border: none;
    border-radius: var(--radius-sm);
    font-family: var(--font-figures);
    font-size: var(--text-sm);
    font-weight: 700;
    letter-spacing: var(--tracking-wide);
    text-align: center;
    color: var(--metal-bright);
    box-shadow: var(--rim-thin), var(--shadow-sm);
  }

  .dnd-stat-lit {
    --stat-brace: var(--stat-light);
    --stat-rim: var(--stat-light);
    border-color: var(--stat-light);
    box-shadow: var(--shadow-sm), 0 0 18px color-mix(in srgb, var(--stat-light) 45%, transparent);
    animation: dnd-stat-glow 2.6s ease-in-out infinite alternate;
  }

  .dnd-stat-lit .dnd-stat-value {
    color: var(--stat-light);
    text-shadow: 0 0 12px var(--stat-light);
  }

  @keyframes dnd-stat-glow {
    from {
      box-shadow: var(--shadow-sm), 0 0 12px color-mix(in srgb, var(--stat-light) 30%, transparent);
    }
    to {
      box-shadow: var(--shadow-sm), 0 0 26px color-mix(in srgb, var(--stat-light) 60%, transparent);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .dnd-stat-lit {
      animation: none;
    }
  }
</style>
