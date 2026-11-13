<script lang="ts">
  const {
    lit = false
  }: {
    /** Brightens the ember halo behind the shield, the mark of the menu standing open. */
    lit?: boolean
  } = $props()

  const id = $props.id()
</script>

<svg class="dnd-crest" class:dnd-crest-lit={lit} viewBox="84 0 72 112" aria-hidden="true" focusable="false">
  <defs>
    <linearGradient id="{id}-gild" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" class="dnd-crest-gild-bright" />
      <stop offset="0.55" class="dnd-crest-gild-metal" />
      <stop offset="1" class="dnd-crest-gild-dim" />
    </linearGradient>
    <linearGradient id="{id}-field" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" class="dnd-crest-field-top" />
      <stop offset="1" class="dnd-crest-field-foot" />
    </linearGradient>
    <radialGradient id="{id}-glow">
      <stop offset="0" class="dnd-crest-glow-core" />
      <stop offset="1" class="dnd-crest-glow-edge" />
    </radialGradient>
    <clipPath id="{id}-shield">
      <path d="M95 17C106 12 114 15 120 19 126 15 134 12 145 17V50C145 68 130 79 120 89 110 79 95 68 95 50Z" />
    </clipPath>
  </defs>
  <ellipse class="dnd-crest-glow" cx="120" cy="52" rx="40" ry="40" fill="url(#{id}-glow)" />
  <path class="dnd-crest-bead" d="M120 4l3 8h-6z" />
  <path
    class="dnd-crest-shield"
    d="M90 12C90 12 106 6 120 14 134 6 150 12 150 12V50C150 72 132 84 120 96 108 84 90 72 90 50Z"
    fill="url(#{id}-field)"
    stroke="url(#{id}-gild)"
  />
  <image class="dnd-crest-mark" href="/favicon.svg" x="78" y="9" width="84" height="84" clip-path="url(#{id}-shield)" />
  <path class="dnd-crest-keyline" d="M95 17C106 12 114 15 120 19 126 15 134 12 145 17V50C145 68 130 79 120 89 110 79 95 68 95 50Z" />
  <path class="dnd-crest-point" d="M120 96V103M116 99.5l4 8 4-8" />
</svg>

<style>
  .dnd-crest {
    display: block;
    block-size: 100%;
    inline-size: auto;
    aspect-ratio: 72 / 112;
    overflow: visible;
    pointer-events: none;
  }

  .dnd-crest-gild-bright {
    stop-color: var(--metal-bright);
  }

  .dnd-crest-gild-metal {
    stop-color: var(--metal);
  }

  .dnd-crest-gild-dim {
    stop-color: var(--metal-dim);
  }

  .dnd-crest-field-top {
    stop-color: var(--ground-lift);
  }

  .dnd-crest-field-foot {
    stop-color: var(--ground-deep);
  }

  .dnd-crest-glow-core {
    stop-color: var(--ember);
    stop-opacity: 0.2;
  }

  .dnd-crest-lit .dnd-crest-glow-core {
    stop-opacity: 0.6;
  }

  .dnd-crest-glow-edge {
    stop-color: var(--ember);
    stop-opacity: 0;
  }

  .dnd-crest-keyline,
  .dnd-crest-point {
    fill: none;
    stroke-width: var(--border-hair);
    vector-effect: non-scaling-stroke;
  }

  .dnd-crest-point {
    stroke: var(--metal);
  }

  .dnd-crest-keyline {
    stroke: var(--metal-dim);
  }

  .dnd-crest-bead {
    fill: var(--metal);
  }

  .dnd-crest-shield {
    stroke-width: 1.4;
    filter: drop-shadow(0 0.15rem 0.3rem var(--shade));
  }
</style>
