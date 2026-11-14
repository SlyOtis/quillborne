<script lang="ts">
  import type { Snippet } from 'svelte'

  const {
    side = 'start',
    open = false,
    run = '400px',
    edge = 'rule',
    children
  }: {
    /** Which edge the drawer slides in from. */
    side?: 'start' | 'end'
    /** Whether the drawer is showing. */
    open?: boolean
    /** The width the content is laid out at, whatever the drawer is squeezed to. */
    run?: string
    /** Whether the drawer draws its own gilded rule on the inner edge, or leaves it to what it sits beside. */
    edge?: 'rule' | 'none'
    /** What the drawer holds. Content carrying `dnd-sidebar-solid` fades the starfield out to the solid ground. */
    children?: Snippet
  } = $props()
</script>

<aside
  class="dnd-sidebar dnd-sidebar-{side} dnd-sidebar-edge-{edge}"
  class:dnd-sidebar-open={open}
  style:--sidebar-run={run}
  aria-hidden={!open}
>
  <span class="dnd-sidebar-sky" aria-hidden="true"></span>
  <div class="dnd-sidebar-inner">{@render children?.()}</div>
</aside>

<style>
  .dnd-sidebar {
    --sidebar-edge: 0px;
    position: relative;
    overflow: hidden;
    z-index: 10;
    background: var(--ground);
    transform: translateX(var(--translate-x, 0));
    transition: transform 250ms ease-in-out;
  }

  .dnd-sidebar-sky {
    position: absolute;
    inset: 0;
    z-index: -1;
    background:
      radial-gradient(ellipse 140% 45% at var(--glow-at) 0%, color-mix(in srgb, var(--verdigris) 18%, transparent) 0%, transparent 70%),
      radial-gradient(ellipse 140% 40% at var(--glow-at) 100%, color-mix(in srgb, var(--verdigris) 12%, transparent) 0%, transparent 70%),
      var(--texture-stars),
      var(--texture-noise),
      linear-gradient(180deg, var(--ground-raised) 0%, var(--ground-deep) 100%);
    pointer-events: none;
    transition: opacity 250ms ease-in-out;
  }

  .dnd-sidebar:has(:global(.dnd-sidebar-solid)) > .dnd-sidebar-sky {
    opacity: 0;
  }

  .dnd-sidebar-edge-rule {
    --sidebar-edge: var(--space-2);
  }

  .dnd-sidebar-edge-rule::before,
  .dnd-sidebar-edge-rule::after {
    content: '';
    position: absolute;
    inset-block: 0;
    pointer-events: none;
  }

  .dnd-sidebar-edge-rule::before {
    inline-size: var(--sidebar-edge);
    background:
      linear-gradient(180deg, transparent, var(--metal) 12% 88%, transparent) var(--rule-at) 0 / var(--border-hair) 100% no-repeat,
      linear-gradient(180deg, transparent, var(--metal-dim) 20% 80%, transparent) var(--rule-in) 0 / var(--border-hair) 100% no-repeat;
  }

  .dnd-sidebar-edge-rule::after {
    inset-block: calc(50% - var(--space-1) * 0.75);
    inline-size: calc(var(--space-1) * 1.5);
    block-size: calc(var(--space-1) * 1.5);
    background: linear-gradient(135deg, var(--metal-bright), var(--metal) 50%, var(--metal-dim));
    box-shadow: var(--glow-metal);
    transform: rotate(45deg);
  }

  .dnd-sidebar-inner {
    position: absolute;
    inset-block: 0;
    width: min(calc(var(--sidebar-run) - var(--sidebar-edge)), calc(100vw - var(--sidebar-edge)));
  }

  .dnd-sidebar-start {
    --glow-at: 0%;
    --rule-at: 100%;
    --rule-in: 0%;
    --translate-x: calc(-100% - 2px);
  }

  .dnd-sidebar-start::before {
    inset-inline-end: 0;
  }

  .dnd-sidebar-start::after {
    inset-inline-end: calc(var(--sidebar-edge) / 2 - var(--space-1) * 0.75);
  }

  .dnd-sidebar-start > .dnd-sidebar-inner {
    inset-inline-end: var(--sidebar-edge);
  }

  .dnd-sidebar-end {
    --glow-at: 100%;
    --rule-at: 0%;
    --rule-in: 100%;
    --translate-x: calc(100% + 2px);
  }

  .dnd-sidebar-end::before {
    inset-inline-start: 0;
  }

  .dnd-sidebar-end::after {
    inset-inline-start: calc(var(--sidebar-edge) / 2 - var(--space-1) * 0.75);
  }

  .dnd-sidebar-end > .dnd-sidebar-inner {
    inset-inline-start: var(--sidebar-edge);
  }

  .dnd-sidebar-open {
    --translate-x: 0;
    transform: none;
  }
</style>
