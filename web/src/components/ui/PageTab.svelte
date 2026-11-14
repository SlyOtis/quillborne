<script lang="ts" module>
  import type { GlyphName } from './Glyph.svelte'

  export type PageTabItem = {
    id: string
    label: string
    glyph?: GlyphName
  }
</script>

<script lang="ts">
  import Glyph from './Glyph.svelte'
  import IconBtn from './IconBtn.svelte'

  const {
    value = null,
    tabs,
    glyph = 'scroll',
    addLabel = '',
    onchange,
    onadd
  }: {
    /** Id of the tab currently open; the first tab reads as open without one. */
    value?: string | null
    /** Tabs rendered across the strip, in order. */
    tabs: PageTabItem[]
    /** Glyph used for a tab that carries none of its own. */
    glyph?: GlyphName
    /** Tooltip of the trailing add button; its presence adds the button. */
    addLabel?: string
    /** Runs with the id of the tab the reader picked. */
    onchange?: (id: string) => void
    /** Runs when the add button is pressed. */
    onadd?: () => void
  } = $props()

  let listEl = $state<HTMLElement>()

  const active = $derived(value ?? tabs[0]?.id ?? null)

  function scrollBy(direction: number) {
    const list = listEl
    if (!list) return
    list.scrollBy({ left: direction * list.clientWidth * 0.7, behavior: 'smooth' })
  }
</script>

<div class="dnd-pagetab">
  <div bind:this={listEl} class="dnd-pagetab-list">
    <span class="dnd-pagetab-arrow dnd-pagetab-arrow-start">
      <IconBtn title="Earlier pages" onclick={() => scrollBy(-1)}>
        <Glyph name="prev" size="sm" />
      </IconBtn>
    </span>

    <div class="dnd-pagetab-tabs" role="tablist">
      {#each tabs as tab (tab.id)}
        <button
          type="button"
          role="tab"
          aria-selected={tab.id === active}
          class="dnd-pagetab-item"
          class:dnd-pagetab-item-on={tab.id === active}
          onclick={() => onchange?.(tab.id)}
        >
          <span class="dnd-pagetab-glyph"><Glyph name={tab.glyph ?? glyph} size="sm" /></span>
          <span class="dnd-pagetab-label">{tab.label}</span>
        </button>
      {/each}
    </div>

    <span class="dnd-pagetab-arrow dnd-pagetab-arrow-end">
      <IconBtn title="Later pages" onclick={() => scrollBy(1)}>
        <Glyph name="next" size="sm" />
      </IconBtn>
    </span>
  </div>

  {#if addLabel}
    <IconBtn title={addLabel} onclick={onadd}>
      <Glyph name="add" size="sm" />
    </IconBtn>
  {/if}
</div>

<style>
  .dnd-pagetab {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    width: 100%;
    min-width: 0;
  }

  .dnd-pagetab-list {
    container-type: scroll-state;
    display: flex;
    align-items: stretch;
    flex: 1 1 auto;
    min-width: 0;
    overflow-x: auto;
    scrollbar-width: none;
  }

  .dnd-pagetab-list::-webkit-scrollbar {
    display: none;
  }

  .dnd-pagetab-tabs {
    display: flex;
    align-items: stretch;
    gap: var(--space-1);
    flex: 1 0 auto;
  }

  .dnd-pagetab-arrow {
    position: sticky;
    z-index: 1;
    display: none;
    flex: none;
    align-items: center;
    background: var(--ground);
  }

  .dnd-pagetab-arrow-start {
    inset-inline-start: 0;
  }

  .dnd-pagetab-arrow-end {
    inset-inline-end: 0;
  }

  @container scroll-state(scrollable: inline-start) {
    .dnd-pagetab-arrow-start {
      display: flex;
    }
  }

  @container scroll-state(scrollable: inline-end) {
    .dnd-pagetab-arrow-end {
      display: flex;
    }
  }

  .dnd-pagetab-item {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    flex: 0 0 auto;
    min-width: 0;
    padding: var(--space-2) var(--space-3);
    border: none;
    border-bottom: calc(var(--border-hair) * 2) solid transparent;
    background: transparent;
    font-family: var(--font-display);
    font-size: var(--text-xs);
    font-weight: 600;
    letter-spacing: var(--tracking-wide);
    text-transform: uppercase;
    white-space: nowrap;
    color: var(--ink-dim);
    text-shadow: 0 1px 0 var(--shadow-ink);
    cursor: pointer;
    transition: color 0.15s ease, border-color 0.15s ease, text-shadow 0.15s ease;
  }

  .dnd-pagetab-item:hover {
    color: var(--metal-bright);
  }

  .dnd-pagetab-item-on {
    color: var(--metal-bright);
    border-bottom-color: var(--metal);
    text-shadow: var(--glow-text);
  }

  .dnd-pagetab-item:focus {
    outline: none;
  }

  .dnd-pagetab-item:focus-visible {
    background: color-mix(in srgb, var(--metal) 12%, transparent);
    border-radius: var(--radius-sm) var(--radius-sm) 0 0;
  }

  .dnd-pagetab-glyph {
    display: flex;
    flex: none;
    color: var(--metal);
    opacity: 0.75;
  }

  .dnd-pagetab-item-on .dnd-pagetab-glyph {
    opacity: 1;
  }

  .dnd-pagetab-label {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
  }
</style>
