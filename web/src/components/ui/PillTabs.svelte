<script lang="ts" module>
  import type { GlyphName } from './Glyph.svelte'

  export type PillTab = {
    value: string
    label: string
    glyph?: GlyphName
  }
</script>

<script lang="ts">
  import Glyph from './Glyph.svelte'

  let {
    value = $bindable(),
    options,
    even = false,
    name = '',
    onchange
  }: {
    /** Value of the active option. */
    value: string
    /** Tab options rendered as pill buttons. */
    options: PillTab[]
    /** Stretches the track to full width with every tab taking an equal share. */
    even?: boolean
    /** Names the tabs and the panels they control, `<name>-tab-<value>` and `<name>-panel-<value>`. */
    name?: string
    /** Runs with the value of the tab the reader picked. */
    onchange?: (value: string) => void
  } = $props()

  let root = $state<HTMLElement>()

  function pick(next: string) {
    value = next
    onchange?.(next)
  }

  function step(event: KeyboardEvent) {
    const by = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0
    if (!by) return
    event.preventDefault()
    const at = options.findIndex((one) => one.value === value)
    const next = options[(at + by + options.length) % options.length].value
    pick(next)
    root?.querySelector<HTMLElement>(`[data-value="${next}"]`)?.focus()
  }
</script>

<div bind:this={root} class="dnd-pilltabs" class:dnd-pilltabs-even={even} role="tablist">
  <span class="dnd-pilltabs-indicator" aria-hidden="true"></span>
  {#each options as one (one.value)}
    <button
      type="button"
      role="tab"
      class="dnd-pilltabs-tab"
      class:dnd-pilltabs-tab-on={value === one.value}
      id={name ? `${name}-tab-${one.value}` : undefined}
      aria-selected={value === one.value}
      aria-controls={name ? `${name}-panel-${one.value}` : undefined}
      tabindex={value === one.value ? 0 : -1}
      data-value={one.value}
      onclick={() => pick(one.value)}
      onkeydown={step}
    >
      {#if one.glyph}<Glyph name={one.glyph} size="sm" />{/if}
      {one.label}
    </button>
  {/each}
</div>

<style>
  .dnd-pilltabs {
    --pilltabs-radius: var(--radius-sm);
    --pilltabs-face:
      radial-gradient(ellipse 80% 90% at 50% 110%, var(--ember-glow) 0%, transparent 70%),
      linear-gradient(180deg, color-mix(in srgb, var(--stone-light) 26%, transparent) 0%, color-mix(in srgb, #000 30%, transparent) 100%),
      var(--texture-noise),
      var(--stone);
    --pilltabs-ring: inset 0 0 0 1px var(--keyline), inset 0 0 0 2px var(--metal), inset 0 3px 0 2px var(--sheen);
    position: relative;
    isolation: isolate;
    display: inline-grid;
    grid-auto-flow: column;
    flex: none;
    min-width: 0;
    padding: 0;
    border-radius: var(--pilltabs-radius);
    background: var(--texture-noise), linear-gradient(180deg, var(--ground-deep) 0%, var(--ground) 100%);
    box-shadow: var(--rim-thin), var(--bevel-down);
  }

  .dnd-pilltabs-tab-on {
    anchor-name: --pilltabs-on;
  }

  .dnd-pilltabs-indicator {
    position: absolute;
    position-anchor: --pilltabs-on;
    inset-block: anchor(top) anchor(bottom);
    inset-inline: anchor(left) anchor(right);
    z-index: 0;
    border-radius: calc(var(--pilltabs-radius) - var(--border-hair));
    background: var(--pilltabs-face);
    box-shadow: var(--pilltabs-ring);
    pointer-events: none;
    transition: inset 0.28s cubic-bezier(0.32, 0.72, 0, 1);
  }

  @supports not (anchor-name: --pilltabs-on) {
    .dnd-pilltabs-indicator {
      display: none;
    }

    .dnd-pilltabs-tab-on {
      background: var(--pilltabs-face);
      box-shadow: var(--pilltabs-ring);
    }
  }

  .dnd-pilltabs-tab {
    position: relative;
    z-index: 1;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--space-1);
    min-width: 0;
    padding: var(--space-1) var(--space-3);
    border: none;
    border-radius: calc(var(--pilltabs-radius) - var(--border-hair));
    background: transparent;
    font-family: var(--font-display);
    font-size: var(--text-xs);
    font-weight: 700;
    letter-spacing: var(--tracking-caps);
    text-transform: uppercase;
    white-space: nowrap;
    color: var(--metal);
    text-shadow: 0 1px 0 #000;
    cursor: pointer;
    transition: color 0.2s ease, text-shadow 0.2s ease;
  }

  .dnd-pilltabs-tab > :global(svg) {
    flex: none;
  }

  .dnd-pilltabs-tab:hover:not(.dnd-pilltabs-tab-on) {
    color: var(--metal-bright);
  }

  .dnd-pilltabs-tab-on {
    color: var(--metal-bright);
    text-shadow: var(--glow-text);
  }

  .dnd-pilltabs-tab:focus-visible {
    outline: none;
    box-shadow: var(--focus-ring);
  }

  .dnd-pilltabs-even {
    display: grid;
    grid-auto-columns: 1fr;
    width: 100%;
  }

  @media (prefers-reduced-motion: reduce) {
    .dnd-pilltabs-indicator,
    .dnd-pilltabs-tab {
      transition: none;
    }
  }
</style>
