<script lang="ts">
  import { isDeadFile } from '$lib/api'
  import StoredImage from './StoredImage.svelte'

  const {
    src,
    alt,
    frame = 'arch',
    size = 'md',
    initial
  }: {
    /** The picture to show. A hosted address, a file: record or a local: reference. */
    src?: string
    /** Alternative text for the picture. */
    alt: string
    /** Picks which traced surround the picture sits in. */
    frame?: PortraitFrame
    /** Sets the height of the portrait. */
    size?: 'sm' | 'md' | 'lg' | 'fill'
    /** The letter drawn when there is no picture. */
    initial?: string
  } = $props()

  const shape = $derived(SHAPES[frame])
  const picture = $derived(src && !isDeadFile(src) ? src : '')
</script>

<script lang="ts" module>
  export type PortraitFrame = 'arch' | 'lancet' | 'ogee' | 'trefoil' | 'shield' | 'round' | 'cusped' | 'gable' | 'quatrefoil' | 'reliquary'

  /** Every frame the player may choose, in the order a picker should show them. */
  export const PORTRAIT_FRAMES: { id: PortraitFrame; title: string }[] = [
    { id: 'arch', title: 'Arch' },
    { id: 'lancet', title: 'Lancet' },
    { id: 'ogee', title: 'Ogee' },
    { id: 'trefoil', title: 'Trefoil' },
    { id: 'shield', title: 'Shield' },
    { id: 'round', title: 'Round' },
    { id: 'cusped', title: 'Cusped' },
    { id: 'gable', title: 'Gable' },
    { id: 'quatrefoil', title: 'Quatrefoil' },
    { id: 'reliquary', title: 'Reliquary' }
  ]

  export const SHAPES: Record<PortraitFrame, string> = {
    arch: 'M4 136V50C4 25 25 4 50 4s46 21 46 46v86Z',
    lancet: 'M4 136V46C4 22 24 4 50 4s46 18 46 42v90Z',
    ogee: 'M4 136V54c0-14 12-20 20-28C34 16 40 4 50 4s16 12 26 22c8 8 20 14 20 28v82Z',
    trefoil: 'M4 136V56c0-11 7-19 17-21 1-17 12-31 29-31s28 14 29 31c10 2 17 10 17 21v80Z',
    shield: 'M4 4h92v74c0 28-22 43-46 54C26 121 4 106 4 78Z',
    round: 'M50 4c26 0 46 20 46 46v40c0 26-20 46-46 46S4 116 4 90V50C4 24 24 4 50 4Z',
    cusped:
      'M4 136V62c0-7 6-9 10-12 5-4 5-11 10-15 5-4 11-3 15-7 5-5 5-24 11-24s6 19 11 24c4 4 10 3 15 7 5 4 5 11 10 15 4 3 10 5 10 12v74Z',
    gable: 'M4 136V56h8V44h9V33h10L50 4l19 29h10v11h9v12h8v80Z',
    quatrefoil:
      'M50 4c10 0 18 8 18 18 10 0 18 8 18 18v10c6 2 10 8 10 15s-4 13-10 15v38c0 10-8 18-18 18H32c-10 0-18-8-18-18V80C8 78 4 72 4 65s4-13 10-15V40c0-10 8-18 18-18 0-10 8-18 18-18Z',
    reliquary: 'M50 4 76 20h12v12l8 9v71c0 13-10 24-23 24H31C18 136 8 125 8 112V41l8-9V20h12Z'
  }
</script>

<span class="dnd-portrait dnd-portrait-{size}" class:dnd-portrait-arched={frame === 'arch'}>
  <svg class="dnd-portrait-art" viewBox="0 0 100 140" preserveAspectRatio="none" aria-hidden="true" focusable="false">
    <defs>
      <clipPath id="dnd-portrait-{frame}" clipPathUnits="objectBoundingBox">
        <path d={shape} transform="scale(0.01, 0.0071428)" />
      </clipPath>
    </defs>
  </svg>

  <span class="dnd-portrait-glass" style={frame === 'arch' ? undefined : `clip-path: url(#dnd-portrait-)`}>
    {#if picture}
      <StoredImage src={picture} {alt} />
    {:else}
      <span class="dnd-portrait-initial">{initial ?? alt.charAt(0).toUpperCase()}</span>
    {/if}
    {#if frame === 'arch'}
      <span class="dnd-portrait-ring"></span>
    {/if}
  </span>

  {#if frame !== 'arch'}
  <svg class="dnd-portrait-trace" viewBox="0 0 100 140" preserveAspectRatio="none" aria-hidden="true" focusable="false">
    <path d={shape} class="dnd-portrait-edge" />
    <path d={shape} class="dnd-portrait-rim" />
    <path d={shape} class="dnd-portrait-key" />
  </svg>
  {/if}
</span>

<style>
  .dnd-portrait {
    position: relative;
    display: inline-block;
    flex: none;
    aspect-ratio: 100 / 140;
    height: var(--portrait-h);
    --portrait-h: 6rem;
  }

  .dnd-portrait-sm {
    --portrait-h: 4.25rem;
  }

  .dnd-portrait-md {
    --portrait-h: 6rem;
  }

  .dnd-portrait-lg {
    --portrait-h: 10.5rem;
  }

  .dnd-portrait-fill {
    --portrait-h: 100%;
  }

  .dnd-portrait-art {
    position: absolute;
    width: 0;
    height: 0;
  }

  .dnd-portrait-glass {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    background:
      radial-gradient(circle at 50% 45%, transparent 55%, color-mix(in srgb, #000 55%, transparent) 100%),
      var(--texture-noise),
      radial-gradient(circle at 38% 26%, var(--ground-lift) 0%, var(--ground-deep) 84%);
  }

  .dnd-portrait-arched {
    aspect-ratio: 3 / 4;
  }

  .dnd-portrait-arched .dnd-portrait-glass {
    -webkit-mask: var(--mask-arch) center / 100% 100% no-repeat;
    mask: var(--mask-arch) center / 100% 100% no-repeat;
  }

  .dnd-portrait-arched .dnd-portrait-glass::after {
    background: linear-gradient(180deg, transparent 45%, var(--ground-deep) 100%);
    opacity: 0.85;
  }

  .dnd-portrait-ring {
    position: absolute;
    inset: 0;
    box-shadow:
      inset 0 0 0 1px var(--keyline),
      inset 0 0 0 2px var(--metal-dim),
      inset 0 0 0 3px var(--metal),
      inset 0 0 0 4px var(--metal-bright),
      inset 0 0 0 5px var(--keyline),
      inset 0 0 14px var(--shade-hard);
    pointer-events: none;
  }

  .dnd-portrait-glass::after {
    content: '';
    position: absolute;
    inset: 0;
    background: radial-gradient(ellipse 80% 70% at 50% 45%, transparent 60%, color-mix(in srgb, #000 55%, transparent) 100%);
    pointer-events: none;
  }

  .dnd-portrait-glass :global(img) {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .dnd-portrait-initial {
    font-family: var(--font-display);
    font-size: calc(var(--portrait-h) * 0.34);
    font-weight: 700;
    color: var(--metal);
    text-shadow: 0 1px 0 #000, 0 0 0.6rem var(--ember-glow);
  }

  .dnd-portrait-trace {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    overflow: visible;
    pointer-events: none;
  }

  .dnd-portrait-edge {
    fill: none;
    stroke: var(--keyline);
    stroke-width: 6;
    vector-effect: non-scaling-stroke;
    filter: drop-shadow(0 0.15rem 0.3rem var(--shade-hard));
  }

  .dnd-portrait-rim {
    fill: none;
    stroke: url(#dnd-grad-metal);
    stroke-width: 4;
    vector-effect: non-scaling-stroke;
    filter: drop-shadow(0 0 0.3rem var(--ember-glow));
  }

  .dnd-portrait-key {
    fill: none;
    stroke: var(--metal-bright);
    stroke-opacity: 0.55;
    stroke-width: 1;
    vector-effect: non-scaling-stroke;
    transform: scale(0.93);
    transform-origin: center;
  }
</style>
