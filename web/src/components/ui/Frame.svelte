<script lang="ts">
  import type { Snippet } from 'svelte'
  import Ornament from './Ornament.svelte'
  import Flame from './Flame.svelte'

  const {
    variant = 'cathedral',
    crest = false,
    torches = false,
    fill = false,
    pad = 'md',
    title,
    children
  }: {
    /** Picks the material and the ornament set drawn around the content. */
    variant?: 'cathedral' | 'dragon' | 'iron' | 'timber' | 'hairline'
    /** Draws the heraldic crest on the top and bottom edge. */
    crest?: boolean
    /** Lights a torch in the upper left and upper right corner. */
    torches?: boolean
    /** Stretches the frame to the full width and height of its container. */
    fill?: boolean
    /** Sets the room between the ornament and the content. */
    pad?: 'none' | 'sm' | 'md' | 'lg'
    /** Reads as the accessible name of the framed region. */
    title?: string
    /** The framed content. */
    children?: Snippet
  } = $props()

  const cornerTone = $derived(variant === 'iron' ? 'ink' : 'metal')
  const cornerName = $derived(variant === 'dragon' ? 'corner' : 'cusp')
  const cornerSize = $derived(variant === 'hairline' ? 'sm' : 'md')
</script>

<section
  class="dnd-frame dnd-frame-{variant} dnd-frame-pad-{pad}"
  class:dnd-frame-fill={fill}
  aria-label={title}
>
  <div class="dnd-frame-edge"></div>
  <div class="dnd-frame-gap"></div>
  <div class="dnd-frame-keyline"></div>
  <div class="dnd-frame-ground"></div>

  {#if variant !== 'timber'}
    <span class="dnd-frame-corner dnd-frame-corner-tl">
      {#if variant === 'iron'}
        <Ornament name="skull" size="md" tone={cornerTone} />
      {:else}
        <Ornament name={cornerName} size={cornerSize} tone={cornerTone} />
      {/if}
    </span>
    <span class="dnd-frame-corner dnd-frame-corner-tr">
      {#if variant === 'iron'}
        <Ornament name="skull" size="md" tone={cornerTone} />
      {:else}
        <Ornament name={cornerName} size={cornerSize} tone={cornerTone} flip />
      {/if}
    </span>
    <span class="dnd-frame-corner dnd-frame-corner-bl">
      {#if variant === 'iron'}
        <Ornament name="skull" size="md" tone={cornerTone} />
      {:else}
        <Ornament name={cornerName} size={cornerSize} tone={cornerTone} rotate={-90} />
      {/if}
    </span>
    <span class="dnd-frame-corner dnd-frame-corner-br">
      {#if variant === 'iron'}
        <Ornament name="skull" size="md" tone={cornerTone} />
      {:else}
        <Ornament name={cornerName} size={cornerSize} tone={cornerTone} rotate={180} />
      {/if}
    </span>
  {/if}

  {#if variant === 'cathedral'}
    <span class="dnd-frame-rose">
      <Ornament name="tracery" size="xl" tone="metal" />
    </span>
    <span class="dnd-frame-lancet dnd-frame-lancet-left">
      <Ornament name="lancet" size="lg" tone="metal" />
    </span>
    <span class="dnd-frame-lancet dnd-frame-lancet-right">
      <Ornament name="lancet" size="lg" tone="metal" />
    </span>
  {/if}

  {#if variant === 'dragon'}
    <span class="dnd-frame-dragon dnd-frame-dragon-left">
      <Ornament name="dragon" size="xl" tone="verdigris" />
    </span>
    <span class="dnd-frame-dragon dnd-frame-dragon-right">
      <Ornament name="dragon" size="xl" tone="verdigris" flip />
    </span>
  {/if}

  {#if variant === 'iron'}
    <span class="dnd-frame-chain">
      <Ornament name="chain" tone="ink" />
    </span>
  {/if}

  {#if variant === 'timber'}
    <span class="dnd-frame-beam dnd-frame-beam-top"></span>
    <span class="dnd-frame-beam dnd-frame-beam-bottom"></span>
  {/if}

  {#if crest}
    <span class="dnd-frame-crest dnd-frame-crest-top">
      <Ornament name="crest" size="lg" tone="metal" />
    </span>
    <span class="dnd-frame-crest dnd-frame-crest-bottom">
      <Ornament name="rosette" size="md" tone="metal" />
    </span>
  {/if}

  {#if torches}
    <span class="dnd-frame-torch dnd-frame-torch-left">
      <Flame size="md" intensity="steady" sconce />
    </span>
    <span class="dnd-frame-torch dnd-frame-torch-right">
      <Flame size="md" intensity="calm" sconce />
    </span>
  {/if}

  <div class="dnd-frame-body">
    {@render children?.()}
  </div>
</section>

<style>
  .dnd-frame {
    --frame-cusp: var(--cusp);
    --frame-dip: var(--dip);
    --frame-edge: 0.25rem;
    --frame-gap: clamp(0.4rem, 0.3rem + 0.3vw, 0.6rem);
    --frame-line: var(--border-width);
    --frame-cut: polygon(
      var(--frame-cusp) 0,
      calc(100% - var(--frame-cusp)) 0,
      calc(100% - var(--frame-dip)) var(--frame-dip),
      100% var(--frame-cusp),
      100% 100%,
      0 100%,
      0 var(--frame-cusp),
      var(--frame-dip) var(--frame-dip)
    );
    position: relative;
    isolation: isolate;
    border-radius: var(--radius-xl);
  }

  .dnd-frame-fill {
    width: 100%;
    height: 100%;
  }

  .dnd-frame-edge,
  .dnd-frame-gap,
  .dnd-frame-keyline,
  .dnd-frame-ground {
    position: absolute;
    z-index: 0;
    border-radius: inherit;
    clip-path: var(--frame-cut);
    pointer-events: none;
  }

  .dnd-frame-edge {
    inset: 0;
    background: linear-gradient(180deg, var(--metal-bright) 0%, var(--metal) 22%, var(--metal-dim) 55%, var(--metal) 82%, var(--metal-dim) 100%);
    box-shadow: inset 0 0 0 1px var(--keyline);
    filter: var(--drop-frame);
  }

  .dnd-frame-gap {
    inset: var(--frame-edge);
    background:
      linear-gradient(180deg, color-mix(in srgb, var(--stone-light) 20%, transparent) 0%, color-mix(in srgb, var(--shadow-ink) 40%, transparent) 55%, color-mix(in srgb, var(--shadow-ink) 62%, transparent) 100%),
      var(--texture-stone),
      var(--stone);
    box-shadow: inset 0 0 0 1px var(--keyline), var(--bevel-up);
  }

  .dnd-frame-keyline {
    inset: calc(var(--frame-edge) + var(--frame-gap));
    background: linear-gradient(180deg, var(--metal-bright) 0%, var(--metal) 40%, var(--metal-dim) 100%);
    box-shadow: 0 0 0.4rem var(--shade-hard);
  }

  .dnd-frame-ground {
    inset: calc(var(--frame-edge) + var(--frame-gap) + var(--frame-line));
    background:
      var(--texture-noise),
      linear-gradient(180deg, var(--ground-raised) 0%, var(--ground) 55%, var(--ground-deep) 100%);
    box-shadow: inset 0 0 0 1px var(--keyline), inset 0 0 1.5rem 0.3rem var(--shade-hard), var(--shadow-hearth);
  }

  .dnd-frame-rose {
    position: absolute;
    top: var(--space-4);
    left: 50%;
    z-index: 0;
    transform: translateX(-50%);
    opacity: 0.12;
    pointer-events: none;
  }

  .dnd-frame-lancet {
    position: absolute;
    bottom: var(--space-4);
    z-index: 0;
    opacity: 0.1;
    pointer-events: none;
  }

  .dnd-frame-lancet-left {
    left: var(--space-5);
  }

  .dnd-frame-lancet-right {
    right: var(--space-5);
  }

  .dnd-frame-body {
    position: relative;
    z-index: 3;
    height: 100%;
  }

  .dnd-frame-pad-none .dnd-frame-body {
    padding: 0;
  }

  .dnd-frame-pad-sm .dnd-frame-body {
    padding: var(--space-4);
  }

  .dnd-frame-pad-md .dnd-frame-body {
    padding: var(--space-6);
  }

  .dnd-frame-pad-lg .dnd-frame-body {
    padding: var(--space-8);
  }

  .dnd-frame-corner {
    position: absolute;
    z-index: 2;
    display: block;
    pointer-events: none;
  }

  .dnd-frame-corner-tl {
    top: calc(var(--corner-lift) * -1);
    left: calc(var(--corner-lift) * -1);
  }

  .dnd-frame-corner-tr {
    top: calc(var(--corner-lift) * -1);
    right: calc(var(--corner-lift) * -1);
  }

  .dnd-frame-corner-bl {
    bottom: calc(var(--corner-lift) * -1);
    left: calc(var(--corner-lift) * -1);
  }

  .dnd-frame-corner-br {
    bottom: calc(var(--corner-lift) * -1);
    right: calc(var(--corner-lift) * -1);
  }

  .dnd-frame-crest {
    position: absolute;
    left: 50%;
    z-index: 4;
    transform: translateX(-50%);
    pointer-events: none;
    filter: var(--drop-crest);
  }

  .dnd-frame-crest-top {
    top: 0;
    transform: translate(-50%, -55%);
  }

  .dnd-frame-crest-bottom {
    bottom: 0;
    transform: translate(-50%, 45%);
  }

  .dnd-frame-torch {
    position: absolute;
    top: var(--space-6);
    z-index: 4;
    pointer-events: none;
  }

  .dnd-frame-torch-left {
    left: var(--space-5);
  }

  .dnd-frame-torch-right {
    right: var(--space-5);
  }

  .dnd-frame-dragon {
    position: absolute;
    top: 12%;
    z-index: 2;
    opacity: 0.85;
    pointer-events: none;
    filter: var(--drop-haze);
  }

  .dnd-frame-dragon-left {
    left: calc(var(--reach) * -1);
  }

  .dnd-frame-dragon-right {
    right: calc(var(--reach) * -1);
  }

  .dnd-frame-chain {
    position: absolute;
    top: var(--space-1);
    left: 12%;
    right: 12%;
    z-index: 2;
    opacity: 0.5;
    pointer-events: none;
  }

  .dnd-frame-cathedral .dnd-frame-ground {
    background:
      var(--texture-motes),
      radial-gradient(ellipse 80% 45% at 50% 0%, color-mix(in srgb, var(--ember) 14%, transparent) 0%, transparent 70%),
      var(--texture-noise),
      linear-gradient(180deg, var(--ground-raised) 0%, var(--ground-deep) 100%);
  }

  .dnd-frame-dragon .dnd-frame-ground {
    background:
      var(--texture-noise),
      radial-gradient(ellipse at 50% 40%, var(--ground-raised) 0%, var(--ground-deep) 78%);
  }

  .dnd-frame-dragon .dnd-frame-edge {
    background: linear-gradient(180deg, var(--metal-bright) 0%, var(--metal) 45%, var(--metal-dim) 100%);
  }

  .dnd-frame-dragon .dnd-frame-keyline {
    background: linear-gradient(180deg, var(--ember-core) 0%, var(--metal-bright) 30%, var(--metal) 100%);
  }

  .dnd-frame-iron,
  .dnd-frame-timber {
    --frame-cut: none;
  }

  .dnd-frame-iron .dnd-frame-ground {
    background:
      var(--texture-noise),
      linear-gradient(180deg, var(--ground-lift) 0%, var(--ground) 60%, var(--ground-deep) 100%);
    background-blend-mode: overlay, normal;
  }

  .dnd-frame-iron {
    --frame-edge: var(--border-heavy);
    --frame-gap: var(--border-width);
  }

  .dnd-frame-iron .dnd-frame-edge {
    background: linear-gradient(180deg, var(--stone-light) 0%, var(--stone) 40%, var(--stone-dark) 100%);
  }

  .dnd-frame-iron .dnd-frame-keyline {
    background: var(--metal-dim);
  }

  .dnd-frame-timber .dnd-frame-ground {
    background:
      var(--texture-noise),
      repeating-linear-gradient(
        90deg,
          var(--ground-raised) 0,
        var(--ground-raised) var(--plank),
        var(--ground) var(--plank),
        var(--ground) var(--plank-gap)
      );
    background-blend-mode: soft-light, normal;
  }

  .dnd-frame-timber {
    --frame-gap: var(--beam);
  }

  .dnd-frame-timber .dnd-frame-edge {
    background: linear-gradient(180deg, var(--wood) 0%, var(--wood-dark) 100%);
  }

  .dnd-frame-timber .dnd-frame-gap {
    background: var(--texture-grain), linear-gradient(180deg, var(--wood) 0%, var(--wood-dark) 100%);
  }

  .dnd-frame-timber .dnd-frame-keyline {
    background: var(--metal-dim);
  }

  .dnd-frame-beam {
    position: absolute;
    left: 0;
    right: 0;
    height: var(--beam);
    z-index: 2;
    background: var(--texture-grain), linear-gradient(180deg, var(--wood), var(--wood-dark));
    box-shadow: var(--shadow-lip), inset 0 -1px 0 var(--metal-dim), var(--shadow-sm);
    pointer-events: none;
  }

  .dnd-frame-beam-top {
    top: 0;
    border-radius: var(--radius-xl) var(--radius-xl) 0 0;
  }

  .dnd-frame-beam-bottom {
    bottom: 0;
    border-radius: 0 0 var(--radius-xl) var(--radius-xl);
  }

  .dnd-frame-hairline {
    --frame-cusp: var(--cusp-xs);
    --frame-dip: var(--dip-xs);
    --frame-edge: var(--border-hair);
    --frame-gap: var(--border-width);
    --frame-line: var(--border-hair);
  }

  .dnd-frame-hairline .dnd-frame-edge {
    background: var(--metal-dim);
    box-shadow: none;
    filter: var(--drop-relief);
  }

  .dnd-frame-hairline .dnd-frame-gap {
    background: var(--ground-deep);
    box-shadow: none;
  }

  .dnd-frame-hairline .dnd-frame-ground {
    background: linear-gradient(180deg, var(--ground) 0%, var(--ground-deep) 100%);
    box-shadow: none;
  }

  @media (max-width: 760px) {
    .dnd-frame-dragon,
    .dnd-frame-lancet,
    .dnd-frame-torch {
      display: none;
    }

    .dnd-frame-pad-lg .dnd-frame-body {
      padding: var(--space-5);
    }
  }
</style>
