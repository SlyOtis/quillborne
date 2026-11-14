<script lang="ts">
  const {
    value,
    max = 100,
    tone = 'life',
    label,
    size = 'md',
    showValue = true
  }: {
    /** The filled amount, clamped between zero and max. */
    value: number
    /** The amount that fills the whole orb. */
    max?: number
    /** Colours the liquid against the active theme. */
    tone?: 'life' | 'mana' | 'ember' | 'metal'
    /** Reads as the accessible name of the orb. */
    label?: string
    /** Sets the diameter of the orb. */
    size?: 'sm' | 'md' | 'lg'
    /** Writes the value in the middle of the orb. */
    showValue?: boolean
  } = $props()

  const span = $derived(max > 0 ? max : 1)
  const clamped = $derived(Math.max(0, Math.min(value, span)))
  const percent = $derived((clamped / span) * 100)
</script>

<div
  class="dnd-orb dnd-orb-{tone} dnd-orb-{size}"
  role="meter"
  aria-valuenow={clamped}
  aria-valuemin="0"
  aria-valuemax={span}
  aria-label={label ?? 'orb'}
>
  <span class="dnd-orb-well">
    <span class="dnd-orb-liquid" style="clip-path: inset({100 - percent}% 0 0 0)">
      <span class="dnd-orb-wave" style="top: calc({100 - percent}% - 0.375rem)"></span>
    </span>
    <span class="dnd-orb-gloss"></span>
  </span>

  <svg class="dnd-orb-rim" viewBox="0 0 100 100" fill="none" focusable="false" aria-hidden="true">
    <circle cx="50" cy="50" r="49.3" stroke="var(--keyline)" stroke-width="1.4" />
    <circle cx="50" cy="50" r="46.4" stroke="url(#dnd-grad-metal)" stroke-width="5.6" />
    <circle cx="50" cy="50" r="47.6" stroke="var(--metal-bright)" stroke-width="0.6" stroke-opacity="0.7" />
    <circle cx="50" cy="50" r="43.3" stroke="var(--keyline)" stroke-width="1.2" />
    <circle cx="50" cy="50" r="42" stroke="var(--metal-dim)" stroke-width="1.4" />
    <path d="M50 3 44 12h12L50 3Z" fill="var(--metal-bright)" />
    <path d="M50 97 44 88h12l-6 9Z" fill="var(--metal-bright)" />
    <circle cx="9" cy="50" r="3.4" fill="var(--metal)" />
    <circle cx="91" cy="50" r="3.4" fill="var(--metal)" />
  </svg>

  {#if showValue}
    <span class="dnd-orb-value">{clamped}</span>
  {/if}
</div>

<style>
  .dnd-orb {
    position: relative;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: none;
    --orb-d: 5.25rem;
    --orb-liquid: var(--state-bad);
    width: var(--orb-d);
    height: var(--orb-d);
    filter: drop-shadow(0 0.35rem 0.8rem var(--shade-hard));
  }

  .dnd-orb-sm {
    --orb-d: 3.25rem;
  }

  .dnd-orb-md {
    --orb-d: 5.25rem;
  }

  .dnd-orb-lg {
    --orb-d: 8.25rem;
  }

  .dnd-orb-life {
    --orb-liquid: var(--state-bad);
  }

  .dnd-orb-mana {
    --orb-liquid: var(--verdigris);
  }

  .dnd-orb-ember {
    --orb-liquid: var(--ember);
  }

  .dnd-orb-metal {
    --orb-liquid: var(--metal);
  }

  .dnd-orb-well {
    position: absolute;
    inset: 8%;
    border-radius: var(--radius-pill);
    overflow: hidden;
    background:
      radial-gradient(circle at 50% 50%, transparent 55%, color-mix(in srgb, var(--shadow-ink) 70%, transparent) 100%),
      radial-gradient(circle at 34% 26%, var(--ground-lift) 0%, var(--ground-deep) 70%, var(--shadow-ink) 100%);
    box-shadow: inset 0 0 0 1px var(--keyline), inset 0 0.25rem 0.75rem var(--shade-hard);
  }

  .dnd-orb-liquid {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    background:
      radial-gradient(ellipse 60% 50% at 50% 100%, color-mix(in srgb, var(--orb-liquid) 80%, var(--ember-core)) 0%, transparent 70%),
      linear-gradient(180deg, color-mix(in srgb, var(--orb-liquid) 85%, white) 0%, var(--orb-liquid) 18%, color-mix(in srgb, var(--orb-liquid) 45%, black) 100%);
    box-shadow: 0 0 1.25rem var(--orb-liquid);
    top: 0;
    transition: clip-path 400ms cubic-bezier(0.16, 1, 0.3, 1);
  }

  .dnd-orb-wave {
    position: absolute;
    transition: top 400ms cubic-bezier(0.16, 1, 0.3, 1);
    left: -50%;
    width: 200%;
    height: 0.75rem;
    border-radius: var(--radius-pill);
    background: color-mix(in srgb, var(--orb-liquid) 70%, white);
    opacity: 0.7;
    animation: dnd-orb-wave 4.5s ease-in-out infinite alternate;
  }

  .dnd-orb-gloss {
    position: absolute;
    inset: 0;
    border-radius: var(--radius-pill);
    background:
      radial-gradient(ellipse 46% 30% at 38% 20%, color-mix(in srgb, white 55%, transparent) 0%, var(--sheen) 45%, transparent 100%),
      radial-gradient(ellipse 30% 14% at 60% 88%, var(--sheen) 0%, transparent 100%),
      radial-gradient(circle at 50% 50%, transparent 62%, color-mix(in srgb, var(--metal-edge) 40%, transparent) 70%, transparent 76%);
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--metal-edge) 60%, transparent);
    pointer-events: none;
  }

  .dnd-orb-rim {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
  }

  .dnd-orb-value {
    position: relative;
    z-index: 1;
    font-family: var(--font-figures);
    font-size: calc(var(--orb-d) * 0.26);
    font-weight: 700;
    color: var(--ink);
    text-shadow: 0 1px 0 var(--shadow-ink), 0 0 4px var(--shadow-ink), 0 0 10px var(--shade-hard);
  }

  @keyframes dnd-orb-wave {
    from {
      transform: translateX(-12%) rotate(-1.2deg);
    }
    to {
      transform: translateX(12%) rotate(1.2deg);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .dnd-orb-wave {
      animation: none;
    }
  }
</style>
