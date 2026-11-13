<script lang="ts">
  const {
    name,
    size = 'md',
    tone = 'metal',
    flip = false,
    rotate = 0
  }: {
    /** Picks which vector is drawn. */
    name:
      | 'corner'
      | 'crest'
      | 'rosette'
      | 'divider'
      | 'vine'
      | 'skull'
      | 'chain'
      | 'rune'
      | 'dragon'
      | 'arch'
      | 'lancet'
      | 'tracery'
      | 'quatrefoil'
      | 'finial'
      | 'cusp'
      | 'forge'
      | 'portrait'
    /** Scales the vector against the type scale. */
    size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl'
    /** Colours the vector against the active theme. */
    tone?: 'metal' | 'verdigris' | 'ember' | 'ink'
    /** Mirrors the vector horizontally. */
    flip?: boolean
    /** Turns the vector by whole degrees. */
    rotate?: number
  } = $props()

  const boxes: Record<string, string> = {
    corner: '0 0 120 120',
    crest: '0 0 180 96',
    rosette: '0 0 64 64',
    divider: '0 0 260 28',
    vine: '0 0 260 44',
    skull: '0 0 64 64',
    chain: '0 0 260 24',
    rune: '0 0 48 48',
    dragon: '0 0 128 176',
    arch: '0 0 160 200',
    lancet: '0 0 120 168',
    tracery: '0 0 96 96',
    quatrefoil: '0 0 64 64',
    finial: '0 0 32 72',
    cusp: '0 0 72 72',
    forge: '0 0 160 96',
    portrait: '0 0 64 64'
  }

  const box = $derived(boxes[name])
  const spin = $derived(`rotate(${rotate}deg)${flip ? ' scaleX(-1)' : ''}`)
</script>

<svg
  class="dnd-ornament dnd-ornament-{name} dnd-ornament-{size} dnd-ornament-{tone}"
  viewBox={box}
  style="transform: {spin}"
  fill="none"
  aria-hidden="true"
  focusable="false"
>
  {#if name === 'corner'}
    <path d="M3 118V22C3 11 11 3 22 3h96" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" />
    <path d="M13 118V28C13 19 19 13 28 13h90" stroke="currentColor" stroke-width="1" opacity="0.55" />
    <path
      d="M13 74c0-30 22-52 52-52"
      stroke="currentColor"
      stroke-width="1.6"
      opacity="0.7"
      stroke-linecap="round"
    />
    <path
      d="M26 28c19 0 30 10 30 25 0 12-9 20-19 18-8-2-11-10-6-15 5-5 13-1 12 6"
      stroke="currentColor"
      stroke-width="2.2"
      stroke-linecap="round"
    />
    <path
      d="M56 53c17-3 30-16 36-38"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
    />
    <path
      d="M70 44c9 3 17 0 21-9-9-4-17-1-21 9Z"
      fill="currentColor"
      opacity="0.85"
    />
    <path
      d="M28 92c14 2 24-4 27-18-14-3-24 4-27 18Z"
      class="dnd-ornament-accent"
      opacity="0.9"
    />
    <path
      d="M18 108c9 1 15-3 17-11-9-2-15 2-17 11Z"
      class="dnd-ornament-accent"
      opacity="0.6"
    />
    <circle cx="22" cy="22" r="5" stroke="currentColor" stroke-width="2" />
    <circle cx="22" cy="22" r="1.8" fill="currentColor" />
    <path d="M3 118h10M118 3v10" stroke="currentColor" stroke-width="3" stroke-linecap="round" />
  {:else if name === 'crest'}
    <path
      d="M90 6 78 20h24L90 6Z"
      fill="currentColor"
    />
    <path
      d="M90 18c-10 0-18 6-18 16 0 14 10 24 18 34 8-10 18-20 18-34 0-10-8-16-18-16Z"
      fill="url(#dnd-grad-metal)"
      stroke="currentColor"
      stroke-width="1.6"
    />
    <path d="M90 30v22M82 40h16" stroke="var(--ground-deep)" stroke-width="2.4" stroke-linecap="round" />
    <path
      d="M72 34C52 30 34 38 18 58c18 4 32 0 42-10"
      stroke="currentColor"
      stroke-width="2.2"
      stroke-linecap="round"
    />
    <path
      d="M108 34c20-4 38 4 54 24-18 4-32 0-42-10"
      stroke="currentColor"
      stroke-width="2.2"
      stroke-linecap="round"
    />
    <path
      d="M60 48c-14 6-26 4-38-6 14-8 28-6 38 6Z"
      class="dnd-ornament-accent"
    />
    <path
      d="M120 48c14 6 26 4 38-6-14-8-28-6-38 6Z"
      class="dnd-ornament-accent"
    />
    <path
      d="M46 70c12 10 26 15 44 16 18-1 32-6 44-16"
      stroke="currentColor"
      stroke-width="1.4"
      opacity="0.6"
      stroke-linecap="round"
    />
    <circle cx="90" cy="86" r="4" fill="currentColor" />
    <path d="M74 86h-10M106 86h10" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />
  {:else if name === 'rosette'}
    <g stroke="currentColor" stroke-width="1.8">
      <circle cx="32" cy="32" r="26" opacity="0.5" />
      <circle cx="32" cy="32" r="19" />
      <circle cx="32" cy="32" r="6" fill="currentColor" />
    </g>
    <g class="dnd-ornament-accent">
      <path d="M32 6c5 9 5 17 0 26-5-9-5-17 0-26Z" />
      <path d="M32 58c-5-9-5-17 0-26 5 9 5 17 0 26Z" />
      <path d="M6 32c9-5 17-5 26 0-9 5-17 5-26 0Z" />
      <path d="M58 32c-9 5-17 5-26 0 9-5 17-5 26 0Z" />
    </g>
    <g stroke="currentColor" stroke-width="1.4" opacity="0.75">
      <path d="M14 14 24 24M50 14 40 24M14 50l10-10M50 50 40 40" />
    </g>
  {:else if name === 'divider'}
    <path d="M4 14h96M160 14h96" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" />
    <path d="M20 14h72M168 14h72" stroke="currentColor" stroke-width="3" opacity="0.35" stroke-linecap="round" />
    <path
      d="M100 14c8-8 16-8 22 0-6 8-14 8-22 0ZM160 14c-8-8-16-8-22 0 6 8 14 8 22 0Z"
      fill="currentColor"
      opacity="0.8"
    />
    <path d="M130 4 140 14 130 24 120 14 130 4Z" fill="url(#dnd-grad-metal)" stroke="currentColor" stroke-width="1.4" />
    <circle cx="130" cy="14" r="2.6" class="dnd-ornament-accent-fill" />
    <circle cx="8" cy="14" r="3" fill="currentColor" />
    <circle cx="252" cy="14" r="3" fill="currentColor" />
  {:else if name === 'vine'}
    <path
      d="M2 22C40 22 48 6 84 6s44 32 82 32 52-22 90-22"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
    />
    <path
      d="M46 16c10-8 22-8 32 2-12 8-24 6-32-2Z"
      class="dnd-ornament-accent"
    />
    <path
      d="M124 28c12-6 24-2 30 10-14 4-25-1-30-10Z"
      class="dnd-ornament-accent"
    />
    <path
      d="M196 24c10-9 22-10 33-2-11 9-24 10-33 2Z"
      class="dnd-ornament-accent"
    />
    <path
      d="M84 6c-6-6-4-14 4-16 4 8 2 14-4 16Z"
      fill="currentColor"
      opacity="0.7"
    />
    <path
      d="M166 38c6 6 4 14-4 16-4-8-2-14 4-16Z"
      fill="currentColor"
      opacity="0.7"
    />
  {:else if name === 'skull'}
    <path
      d="M32 4C17 4 6 15 6 30c0 9 4 15 8 19 2 2 2 5 2 8 0 2 2 3 4 3h24c2 0 4-1 4-3 0-3 0-6 2-8 4-4 8-10 8-19C58 15 47 4 32 4Z"
      fill="url(#dnd-grad-stone)"
      stroke="currentColor"
      stroke-width="1.8"
    />
    <ellipse cx="22" cy="29" rx="7" ry="8" fill="var(--ground-deep)" />
    <ellipse cx="42" cy="29" rx="7" ry="8" fill="var(--ground-deep)" />
    <circle cx="22" cy="30" r="2" class="dnd-ornament-accent-fill" />
    <circle cx="42" cy="30" r="2" class="dnd-ornament-accent-fill" />
    <path d="M32 36l-4 8h8l-4-8Z" fill="var(--ground-deep)" />
    <path d="M22 50v8M32 50v9M42 50v8" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
  {:else if name === 'chain'}
    <g stroke="currentColor" stroke-width="2" fill="none">
      <ellipse cx="16" cy="12" rx="12" ry="7" />
      <ellipse cx="40" cy="12" rx="12" ry="7" />
      <ellipse cx="64" cy="12" rx="12" ry="7" />
      <ellipse cx="88" cy="12" rx="12" ry="7" />
      <ellipse cx="112" cy="12" rx="12" ry="7" />
      <ellipse cx="136" cy="12" rx="12" ry="7" />
      <ellipse cx="160" cy="12" rx="12" ry="7" />
      <ellipse cx="184" cy="12" rx="12" ry="7" />
      <ellipse cx="208" cy="12" rx="12" ry="7" />
      <ellipse cx="232" cy="12" rx="12" ry="7" />
    </g>
  {:else if name === 'rune'}
    <circle cx="24" cy="24" r="21" stroke="currentColor" stroke-width="2" />
    <circle cx="24" cy="24" r="16" stroke="currentColor" stroke-width="0.9" opacity="0.5" />
    <path
      d="M24 10v28M24 16l9-6M24 24l9-6M24 24l-9 6M24 32l-9 6"
      stroke="currentColor"
      stroke-width="2.4"
      stroke-linecap="round"
      class="dnd-ornament-accent-stroke"
    />
    <path d="M24 1v5M24 42v5M1 24h5M42 24h5" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
  {:else if name === 'dragon'}
    <path
      d="M100 12c-22-6-46 4-58 24-10 17-8 36 4 50 10 12 12 24 6 36-4 8-12 14-22 16 20 6 40-2 50-20 8-14 6-30-4-42-8-10-10-20-4-30 6-11 18-16 30-14"
      stroke="currentColor"
      stroke-width="3"
      stroke-linecap="round"
    />
    <path
      d="M100 12c14 2 22 12 22 26 0 12-8 20-20 20-8 0-14-4-16-12"
      stroke="currentColor"
      stroke-width="3"
      stroke-linecap="round"
    />
    <path
      d="M104 22c8 0 12 6 10 14-2 6-8 8-14 6"
      stroke="currentColor"
      stroke-width="2"
      opacity="0.7"
    />
    <circle cx="112" cy="30" r="3.4" class="dnd-ornament-accent-fill" />
    <path
      d="M86 58c-14 6-22 20-20 36 12-6 20-18 20-36Z"
      class="dnd-ornament-accent"
    />
    <path
      d="M62 108c-14 4-22 16-22 32 12-6 20-18 22-32Z"
      class="dnd-ornament-accent"
    />
    <path d="M92 6l10 8-14 4 4-12Z" fill="currentColor" />
    <path d="M76 20c-8-4-16-2-22 6 8 4 17 2 22-6Z" fill="currentColor" opacity="0.8" />
  {:else if name === 'arch'}
    <path
      d="M12 198V78C12 36 42 6 80 6s68 30 68 72v120"
      stroke="currentColor"
      stroke-width="2.6"
    />
    <path
      d="M24 198V80c0-34 24-60 56-60s56 26 56 60v118"
      stroke="currentColor"
      stroke-width="1"
      opacity="0.55"
    />
    <path
      d="M80 20c-18 0-32 16-32 38v140h64V58c0-22-14-38-32-38Z"
      fill="url(#dnd-grad-verdigris)"
      opacity="0.35"
    />
    <path d="M80 20v178M48 74h64M48 122h64M48 170h64" stroke="currentColor" stroke-width="1.2" opacity="0.65" />
    <path d="M80 6 70 20h20L80 6Z" fill="currentColor" />
    <circle cx="80" cy="52" r="7" stroke="currentColor" stroke-width="1.6" />
    <circle cx="80" cy="52" r="2.6" class="dnd-ornament-accent-fill" />

  {:else if name === 'lancet'}
    <path
      d="M6 166V60C6 30 28 6 60 6s54 24 54 54v106"
      stroke="currentColor"
      stroke-width="3"
      stroke-linejoin="round"
    />
    <path
      d="M14 166V62C14 36 34 15 60 15s46 21 46 47v104"
      stroke="currentColor"
      stroke-width="1.1"
      opacity="0.5"
    />
    <path d="M60 6 60 -6" stroke="currentColor" stroke-width="3" stroke-linecap="round" />
    <path d="M60 22c9 10 9 22 0 32-9-10-9-22 0-32Z" class="dnd-ornament-accent" opacity="0.9" />
    <path d="M32 54c0-15 12-27 28-27" stroke="currentColor" stroke-width="1.4" opacity="0.65" stroke-linecap="round" />
    <path d="M88 54c0-15-12-27-28-27" stroke="currentColor" stroke-width="1.4" opacity="0.65" stroke-linecap="round" />
    <path d="M6 166h108" stroke="currentColor" stroke-width="3" stroke-linecap="round" />

  {:else if name === 'tracery'}
    <circle cx="48" cy="48" r="44" stroke="currentColor" stroke-width="2.4" />
    <circle cx="48" cy="48" r="35" stroke="currentColor" stroke-width="1" opacity="0.5" />
    <path
      d="M48 13c12 0 22 10 22 22S60 57 48 57 26 47 26 35s10-22 22-22Z"
      stroke="currentColor"
      stroke-width="1.6"
      opacity="0.75"
    />
    <path
      d="M48 39c12 0 22 10 22 22s-10 22-22 22-22-10-22-22 10-22 22-22Z"
      stroke="currentColor"
      stroke-width="1.6"
      opacity="0.75"
    />
    <path
      d="M31 48c0-12 8-20 17-20s17 8 17 20-8 20-17 20-17-8-17-20Z"
      class="dnd-ornament-accent"
      opacity="0.55"
    />
    <circle cx="48" cy="48" r="7" fill="currentColor" opacity="0.9" />
    <path d="M48 4v10M48 82v10M4 48h10M82 48h10" stroke="currentColor" stroke-width="2" stroke-linecap="round" />

  {:else if name === 'quatrefoil'}
    <path
      d="M32 4c7 0 13 6 13 13v2h2c7 0 13 6 13 13s-6 13-13 13h-2v2c0 7-6 13-13 13s-13-6-13-13v-2h-2C10 45 4 39 4 32s6-13 13-13h2v-2c0-7 6-13 13-13Z"
      stroke="currentColor"
      stroke-width="2.2"
      stroke-linejoin="round"
    />
    <circle cx="32" cy="32" r="6" class="dnd-ornament-accent" opacity="0.9" />

  {:else if name === 'finial'}
    <path d="M16 2 26 26 16 70 6 26 16 2Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round" />
    <path d="M16 14 21 27 16 52 11 27 16 14Z" class="dnd-ornament-accent" opacity="0.8" />
    <path d="M6 26h20" stroke="currentColor" stroke-width="1.6" opacity="0.7" />

  {:else if name === 'cusp'}
    <path
      d="M4 68V26C4 14 14 4 26 4h42"
      stroke="currentColor"
      stroke-width="2.6"
      stroke-linecap="round"
    />
    <path d="M4 44c0-12 4-22 12-30" stroke="currentColor" stroke-width="1.2" opacity="0.55" />
    <path
      d="M18 30c8-8 18-12 30-12-2 11-8 18-18 21-8 2-14-3-12-9Z"
      class="dnd-ornament-accent"
      opacity="0.85"
    />
    <path d="M26 4c0 10-8 18-18 20" stroke="currentColor" stroke-width="1.4" opacity="0.6" stroke-linecap="round" />

  {:else if name === 'forge'}
    <path
      d="M34 70C22 64 12 66 4 76c10 4 20 2 30-6Z"
      class="dnd-ornament-accent"
      opacity="0.85"
    />
    <path
      d="M126 70c12-6 22-4 30 6-10 4-20 2-30-6Z"
      class="dnd-ornament-accent"
      opacity="0.85"
    />
    <path d="M58 20 82 50" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" />
    <path
      d="M61 7l7 8-17 14-6-8Z"
      fill="url(#dnd-grad-metal)"
      stroke="currentColor"
      stroke-width="1.6"
      stroke-linejoin="round"
    />
    <path d="M120 6C110 14 98 30 84 50" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
    <path
      d="M120 6c-13-3-24 3-30 16 11 3 22-3 30-16Z"
      class="dnd-ornament-accent"
    />
    <path
      d="M106 20c-8 0-14 6-16 14 8-1 13-6 16-14Z"
      class="dnd-ornament-accent"
      opacity="0.7"
    />
    <path
      d="M38 52h82c7 0 13 3 17 8l-7 6h-28v6H58v-6H46c-5 0-8-3-8-7Z"
      fill="url(#dnd-grad-metal)"
      stroke="currentColor"
      stroke-width="1.6"
      stroke-linejoin="round"
    />
    <path d="M70 58h10" stroke="var(--ground-deep)" stroke-width="2" stroke-linecap="round" />
    <path d="M64 72l-6 8h44l-6-8" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" />
    <path
      d="M50 80h60v6H50Z"
      fill="url(#dnd-grad-metal)"
      stroke="currentColor"
      stroke-width="1.6"
      stroke-linejoin="round"
    />
    <path
      d="M96 44v-7M89 46l-4-5M103 46l4-5"
      stroke-width="1.6"
      stroke-linecap="round"
      class="dnd-ornament-accent-stroke"
    />
    <circle cx="80" cy="92" r="3.5" fill="currentColor" />
    <path d="M70 92H56M90 92h14" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" />

  {:else if name === 'portrait'}
    <path
      d="M10 60V28C10 15 20 6 32 6s22 9 22 22v32"
      stroke="currentColor"
      stroke-width="2.2"
      stroke-linejoin="round"
    />
    <path d="M16 60V30c0-10 7-18 16-18s16 8 16 18v30" stroke="currentColor" stroke-width="1" opacity="0.5" />
    <circle cx="32" cy="29" r="7" stroke="currentColor" stroke-width="1.8" />
    <path d="M18 57c0-9 6-15 14-15s14 6 14 15" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
    <circle cx="32" cy="6" r="2.2" class="dnd-ornament-accent-fill" />
    <path d="M6 60h52" stroke="currentColor" stroke-width="2" stroke-linecap="round" />

  {/if}
</svg>

<style>
  .dnd-ornament {
    display: block;
    flex: none;
    overflow: visible;
    pointer-events: none;
  }

  .dnd-ornament-metal {
    color: var(--metal);
    filter: drop-shadow(0 1px 0 #000) drop-shadow(0 0 0.2rem color-mix(in srgb, var(--ember-glow) 50%, transparent));
  }

  .dnd-ornament-verdigris {
    color: var(--verdigris);
  }

  .dnd-ornament-ember {
    color: var(--ember);
  }

  .dnd-ornament-ink {
    color: var(--ink-dim);
    filter: drop-shadow(0 1px 0 #000);
  }

  .dnd-ornament-accent {
    fill: var(--metal-bright);
  }

  .dnd-ornament-accent-fill {
    fill: var(--ember);
  }

  .dnd-ornament-accent-stroke {
    stroke: var(--ember);
  }

  .dnd-ornament-ember .dnd-ornament-accent,
  .dnd-ornament-ember .dnd-ornament-accent-fill {
    fill: var(--metal);
  }

  .dnd-ornament-xs {
    width: auto;
    height: 16px;
  }

  .dnd-ornament-sm {
    width: auto;
    height: 28px;
  }

  .dnd-ornament-md {
    width: auto;
    height: 48px;
  }

  .dnd-ornament-lg {
    width: auto;
    height: 88px;
  }

  .dnd-ornament-xl {
    width: auto;
    height: 150px;
  }

  .dnd-ornament-divider,
  .dnd-ornament-chain,
  .dnd-ornament-vine {
    width: 100%;
    height: auto;
  }
</style>
