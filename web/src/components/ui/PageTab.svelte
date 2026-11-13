<script lang="ts" module>
  import type { GlyphName } from './Glyph.svelte'

  export type PageTabItem = {
    id: string
    label: string
    glyph?: GlyphName
  }
</script>

<script lang="ts">
  import { onMount, tick } from 'svelte'
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
  let overflowing = $state(false)
  let atStart = $state(true)
  let atEnd = $state(false)

  const active = $derived(value ?? tabs[0]?.id ?? null)

  function measure() {
    const list = listEl
    if (!list) return
    overflowing = list.scrollWidth > list.clientWidth + 1
    atStart = list.scrollLeft <= 1
    atEnd = list.scrollLeft + list.clientWidth >= list.scrollWidth - 1
  }

  function scrollBy(direction: number) {
    const list = listEl
    if (!list) return
    list.scrollBy({ left: direction * list.clientWidth * 0.7, behavior: 'smooth' })
  }

  $effect(() => {
    void tabs.length
    void tick().then(measure)
  })

  onMount(() => {
    if (!listEl) return
    const observer = new ResizeObserver(() => measure())
    observer.observe(listEl)
    return () => observer.disconnect()
  })
</script>

<div class="dnd-pagetab">
  {#if overflowing}
    <IconBtn title="Earlier pages" disabled={atStart} onclick={() => scrollBy(-1)}>
      <Glyph name="prev" size="sm" />
    </IconBtn>
  {/if}

  <div bind:this={listEl} class="dnd-pagetab-list" role="tablist" onscroll={measure}>
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

  {#if overflowing}
    <IconBtn title="Later pages" disabled={atEnd} onclick={() => scrollBy(1)}>
      <Glyph name="next" size="sm" />
    </IconBtn>
  {/if}

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
    border-bottom: var(--border-hair) solid color-mix(in srgb, var(--metal-dim) 80%, transparent);
  }

  .dnd-pagetab-list {
    display: flex;
    align-items: stretch;
    gap: var(--space-1);
    flex: 1 1 auto;
    min-width: 0;
    overflow-x: auto;
    scrollbar-width: none;
  }

  .dnd-pagetab-list::-webkit-scrollbar {
    display: none;
  }

  .dnd-pagetab-item {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    flex: 0 0 auto;
    min-width: 0;
    margin-block-end: calc(var(--border-hair) * -1);
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
    text-shadow: 0 1px 0 #000;
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
