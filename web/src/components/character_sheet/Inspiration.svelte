<script lang="ts">
  import {getContext} from "svelte";
  import type {CharacterContext} from "$lib/types";
  import Ornament from "$components/ui/Ornament.svelte";

  const {info} = getContext<CharacterContext>('character')

  const spark = $derived(Number($info.inspiration))

  function toggle() {
    const wasInspired = $info.inspiration;

    info.update(state => ({
      ...state,
      inspiration: !state.inspiration
    }))

    window.dispatchEvent(new CustomEvent('playButtonClick'));

    if (!wasInspired) {
      window.dispatchEvent(new CustomEvent('playInspiration'));
      window.dispatchEvent(new CustomEvent('showFunnyText', {
        detail: { text: 'MEGA INSPIRED!!!', category: 'inspiration' }
      }));
    }
  }
</script>

<button
  type="button"
  class="spark"
  class:spark-lit={spark > 0}
  style="--spark: {spark}"
  aria-pressed={spark > 0}
  title={spark > 0 ? 'Inspired. Press to spend it' : 'Not inspired. Press to grant inspiration'}
  onclick={toggle}
>
  <span class="spark-rays" aria-hidden="true"></span>
  <span class="spark-halo" aria-hidden="true"></span>
  <span class="spark-shield">
    <span class="spark-figure">{spark}</span>
  </span>
  <span class="spark-word">Inspiration</span>
</button>

<style>
  .spark {
    --spark-size: var(--space-7);
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-0);
    padding: var(--space-1) var(--space-3) 0;
    border: none;
    background: none;
    color: var(--metal);
    cursor: pointer;
    isolation: isolate;
  }

  .spark-rays,
  .spark-halo {
    position: absolute;
    inset-block-start: calc(var(--space-1) + var(--spark-size) / 2);
    inset-inline-start: 50%;
    z-index: -1;
    inline-size: calc(var(--spark-size) * 2.4);
    aspect-ratio: 1;
    border-radius: var(--radius-pill);
    translate: -50% -50%;
    pointer-events: none;
    opacity: min(1, var(--spark));
    transition: opacity 400ms ease;
  }

  .spark-rays {
    background: repeating-conic-gradient(from 0deg, color-mix(in srgb, var(--ember-core) 55%, transparent) 0deg calc(3deg + 2deg * var(--spark)), transparent calc(3deg + 2deg * var(--spark)) calc(30deg / max(1, var(--spark))));
    -webkit-mask-image: radial-gradient(circle, var(--keyline) 25%, transparent 70%);
    mask-image: radial-gradient(circle, var(--keyline) 25%, transparent 70%);
    animation: spark-turn calc(28s / max(1, var(--spark))) linear infinite;
  }

  .spark-halo {
    background: radial-gradient(circle, color-mix(in srgb, var(--ember-glow) 70%, transparent) 0%, color-mix(in srgb, var(--ember-glow) 25%, transparent) 35%, transparent 65%);
    animation: spark-breathe 2.6s ease-in-out infinite alternate;
  }

  .spark-shield {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    inline-size: var(--spark-size);
    aspect-ratio: 100 / 120;
    background:
      var(--texture-noise),
      radial-gradient(circle at 50% 30%, var(--ground-lift) 0%, var(--ground-deep) 85%);
    -webkit-mask: var(--mask-shield) center / 100% 100% no-repeat;
    mask: var(--mask-shield) center / 100% 100% no-repeat;
    transition: filter 300ms ease;
  }

  .spark-shield::before {
    content: '';
    position: absolute;
    inset: 0;
    background: linear-gradient(180deg, var(--metal-bright) 0%, var(--metal) 50%, var(--metal-dim) 100%);
    -webkit-mask:
      var(--mask-shield) center / 100% 100% no-repeat,
      var(--mask-shield) center / calc(100% - 2 * var(--space-0)) calc(100% - 2 * var(--space-0)) no-repeat;
    mask:
      var(--mask-shield) center / 100% 100% no-repeat,
      var(--mask-shield) center / calc(100% - 2 * var(--space-0)) calc(100% - 2 * var(--space-0)) no-repeat;
    -webkit-mask-composite: xor;
    mask-composite: exclude;
  }

  .spark-figure {
    position: relative;
    font-family: var(--font-figures);
    font-size: var(--text-lg);
    font-weight: 700;
    line-height: 1;
    color: var(--metal);
    text-shadow: 0 1px 0 var(--shadow-ink);
    transition: color 300ms ease, text-shadow 300ms ease;
  }

  .spark-lit .spark-figure {
    color: var(--ember-core);
    text-shadow: 0 1px 0 var(--shadow-ink), 0 0 0.6rem var(--ember-glow);
  }

  .spark-lit .spark-shield {
    filter: drop-shadow(0 0 0.4rem var(--ember-glow));
  }

  .spark-word {
    font-family: var(--font-display);
    font-size: calc(var(--text-xs) * 0.85);
    font-weight: 700;
    letter-spacing: var(--tracking-caps);
    text-transform: uppercase;
    text-shadow: 0 1px 0 var(--shadow-ink);
  }

  .spark:hover .spark-shield {
    filter: drop-shadow(0 0 0.4rem var(--ember-glow)) brightness(1.1);
  }

  .spark:active .spark-shield {
    filter: brightness(0.85);
  }

  .spark:focus-visible {
    outline: none;
    border-radius: var(--radius-sm);
    box-shadow: var(--focus-ring);
  }

  @keyframes spark-turn {
    to {
      rotate: 360deg;
    }
  }

  @keyframes spark-breathe {
    from {
      scale: 0.9;
    }
    to {
      scale: 1.08;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .spark-rays,
    .spark-halo {
      animation: none;
    }
  }
</style>
