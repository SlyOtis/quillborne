<script lang="ts">
  import Ornament from './Ornament.svelte'

  const {
    value,
    max = 100,
    tone = 'life',
    label,
    rune = false,
    segments = 0,
    size = 'md',
    showValue = false
  }: {
    /** The filled amount, clamped between zero and max. */
    value: number
    /** The amount that fills the whole track. */
    max?: number
    /** Colours the fill against the active theme. */
    tone?: 'life' | 'mana' | 'stamina' | 'ember' | 'metal'
    /** Text written across the track. */
    label?: string
    /** Draws the rune medallion at the head of the track. */
    rune?: boolean
    /** Cuts the track into this many notches. Zero draws a smooth fill. */
    segments?: number
    /** Sets the height of the track. */
    size?: 'sm' | 'md' | 'lg'
    /** Writes the value over the max at the tail of the track. */
    showValue?: boolean
  } = $props()

  const span = $derived(max > 0 ? max : 1)
  const clamped = $derived(Math.max(0, Math.min(value, span)))
  const percent = $derived((clamped / span) * 100)
</script>

<div class="dnd-meter dnd-meter-{tone} dnd-meter-{size}">
  {#if rune}
    <span class="dnd-meter-rune">
      <Ornament name="rune" size="sm" tone="metal" />
    </span>
  {/if}

  <div
    class="dnd-meter-track"
    role="meter"
    aria-valuenow={clamped}
    aria-valuemin="0"
    aria-valuemax={span}
    aria-label={label ?? 'meter'}
  >
    <span class="dnd-meter-fill" style="clip-path: inset(0 {100 - percent}% 0 0)"></span>
    <span class="dnd-meter-sheen" style="clip-path: inset(0 {100 - percent}% 0 0)"></span>
    {#if segments > 0}
      <span class="dnd-meter-notches" style="--notch: {100 / segments}%"></span>
    {/if}
    {#if label}
      <span class="dnd-meter-label">{label}</span>
    {/if}
    {#if showValue}
      <span class="dnd-meter-value">{clamped}<span class="dnd-meter-slash">/</span>{span}</span>
    {/if}
  </div>

  <span class="dnd-meter-cap dnd-meter-cap-start"></span>
  <span class="dnd-meter-cap dnd-meter-cap-end"></span>
</div>

<style>
  .dnd-meter {
    position: relative;
    display: flex;
    align-items: center;
    gap: var(--space-2);
    --meter-h: 1.25rem;
    --meter-fill: var(--state-bad);
    --meter-fill-bright: var(--ember-core);
  }

  .dnd-meter-sm {
    --meter-h: 0.8rem;
  }

  .dnd-meter-md {
    --meter-h: 1.25rem;
  }

  .dnd-meter-lg {
    --meter-h: 1.875rem;
  }

  .dnd-meter-life {
    --meter-fill: var(--state-bad);
  }

  .dnd-meter-mana {
    --meter-fill: var(--verdigris);
  }

  .dnd-meter-stamina {
    --meter-fill: var(--state-good);
  }

  .dnd-meter-ember {
    --meter-fill: var(--ember);
  }

  .dnd-meter-metal {
    --meter-fill: var(--metal);
  }

  .dnd-meter-rune {
    flex: none;
    filter: drop-shadow(0 0 6px var(--ember-glow));
  }

  .dnd-meter-track {
    position: relative;
    flex: 1;
    height: var(--meter-h);
    min-width: 0;
    overflow: hidden;
    border-radius: var(--radius-sm);
    background: var(--texture-noise), linear-gradient(180deg, var(--shadow-ink) 0%, var(--ground-deep) 60%, var(--ground) 100%);
    box-shadow: var(--bevel-down);
  }

  .dnd-meter-track::after {
    content: '';
    position: absolute;
    inset: 0;
    z-index: 1;
    border-radius: inherit;
    box-shadow:
      inset 0 0 0 1px var(--keyline),
      inset 0 0 0 2px var(--metal),
      inset 0 0 0 3px var(--keyline),
      inset 0 3px 4px -1px var(--shade-hard);
    pointer-events: none;
  }

  .dnd-meter-fill {
    position: absolute;
    inset: 0;
    background:
      linear-gradient(180deg, var(--meter-fill) 0%, color-mix(in srgb, var(--meter-fill-bright) 55%, var(--meter-fill)) 26%, var(--meter-fill) 48%, color-mix(in srgb, var(--meter-fill) 70%, var(--shadow-ink)) 78%, color-mix(in srgb, var(--meter-fill) 45%, var(--shadow-ink)) 100%);
    filter: saturate(1.15);
    box-shadow: inset -1px 0 0 color-mix(in srgb, var(--meter-fill-bright) 60%, transparent), 0 0 10px color-mix(in srgb, var(--meter-fill) 60%, transparent);
    transition: clip-path 320ms cubic-bezier(0.16, 1, 0.3, 1);
  }

  .dnd-meter-sheen {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 50%;
    background: linear-gradient(180deg, transparent 0%, transparent 22%, var(--sheen-strong) 34%, var(--sheen) 60%, transparent 100%);
    transition: clip-path 320ms cubic-bezier(0.16, 1, 0.3, 1);
    pointer-events: none;
  }

  .dnd-meter-notches {
    position: absolute;
    inset: 0;
    background: repeating-linear-gradient(
      90deg,
      transparent 0,
      transparent calc(var(--notch) - 2px),
      var(--ground-deep) calc(var(--notch) - 2px),
      var(--ground-deep) var(--notch)
    );
    pointer-events: none;
  }

  .dnd-meter-label {
    position: absolute;
    inset: 0;
    z-index: 2;
    display: flex;
    align-items: center;
    padding-inline-start: var(--space-3);
    font-family: var(--font-display);
    font-size: var(--text-xs);
    font-weight: 600;
    letter-spacing: var(--tracking-caps);
    text-transform: uppercase;
    color: var(--ink);
    text-shadow: 0 1px 0 var(--shadow-ink), 0 0 3px var(--shadow-ink);
    pointer-events: none;
  }

  .dnd-meter-value {
    position: absolute;
    inset: 0;
    z-index: 2;
    display: flex;
    align-items: center;
    justify-content: flex-end;
    padding-inline-end: var(--space-3);
    font-family: var(--font-figures);
    font-size: var(--text-xs);
    font-weight: 700;
    line-height: 1;
    color: var(--ink);
    text-shadow: 0 1px 0 var(--shadow-ink), 0 0 3px var(--shadow-ink), 0 0 6px var(--shadow-ink);
    pointer-events: none;
  }

  .dnd-meter-slash {
    color: var(--ink-faint);
    padding: 0 0.12rem;
  }

  .dnd-meter-cap {
    position: absolute;
    top: 50%;
    z-index: 2;
    width: 0.56rem;
    height: 0.56rem;
    transform: translateY(-50%) rotate(45deg);
    background: linear-gradient(135deg, var(--metal-bright), var(--metal) 45%, var(--metal-dim));
    box-shadow: 0 0 0 1px var(--keyline), 0 1px 2px var(--shade-hard);
    pointer-events: none;
  }

  .dnd-meter-cap-start {
    left: -0.28rem;
  }

  .dnd-meter-cap-end {
    right: -0.28rem;
  }

  .dnd-meter-rune ~ .dnd-meter-cap-start {
    display: none;
  }
</style>
