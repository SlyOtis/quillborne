<script lang="ts" module>
  export type Crumb = {
    id: string
    title: string
  }
</script>

<script lang="ts">
  import { tick, type Snippet } from 'svelte'

  const {
    title = '',
    count,
    description = '',
    crumbs = [],
    oncrumb,
    heading,
    actions,
    center,
    tools,
    view,
    bottom,
    banner
  }: {
    /** The name of the page, written as the hero heading unless `heading` is given. */
    title?: string
    /** A figure written beside the heading. */
    count?: string | number
    /** A line under the centre that says what the page holds; it folds away as the head collapses. */
    description?: string
    /** The way back, each a step the reader may press; the open page is the heading and never a crumb. */
    crumbs?: Crumb[]
    /** Runs with the id of the crumb pressed. Without it the crumbs are plain words. */
    oncrumb?: (id: string) => void
    /** Replaces the heading, for a title that is written in place. */
    heading?: Snippet
    /** The page's actions at the end of the title row, each once. */
    actions?: Snippet
    /** The centre under the title: the page's search. */
    center?: Snippet
    /** Controls at the start of the content row. */
    tools?: Snippet
    /** The view toggle and its options at the end of the content row. */
    view?: Snippet
    /** The strip along the bottom edge: the page tabs, which survive the collapse. */
    bottom?: Snippet
    /** The picture painted across the band behind the title, under the band's veil; it folds with the head. */
    banner?: Snippet
  } = $props()

  const COLLAPSE_AT = 36
  const EXPAND_AT = 10
  const SETTLE = 400
  const DURATION_SLOW = 350
  const DURATION_FAST = 120
  const SPEED_SLOW = 1
  const SPEED_FAST = 4
  const SPEED_WINDOW = 100
  const SPEED_SAMPLES = 4
  const FRAME = 1000 / 60

  const named = $derived(crumbs.filter((one) => one.title.trim()))

  let headerEl = $state<HTMLElement>()
  let lineEl = $state<HTMLElement>()
  let bottomEl = $state<HTMLElement>()
  let scroller = $state<HTMLElement | null>(null)
  let collapsed = $state(false)
  let duration = $state<string>()
  let transitioning = false
  let settle = 0
  const samples: { y: number; t: number }[] = []

  const sample = (y: number, t: number) => {
    const last = samples[samples.length - 1]
    if (last && t - last.t > SPEED_WINDOW) samples.splice(0, samples.length, { y: last.y, t: t - FRAME })
    samples.push({ y, t })
    if (samples.length > SPEED_SAMPLES) samples.shift()
  }

  const speed = () => {
    const first = samples[0]
    const last = samples[samples.length - 1]
    if (!first || !last || last.t <= first.t) return 0
    return Math.abs(last.y - first.y) / (last.t - first.t)
  }

  const headerDuration = (rate: number) => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return '0s'
    const share = Math.min(1, Math.max(0, (rate - SPEED_SLOW) / (SPEED_FAST - SPEED_SLOW)))
    return `${Math.round(DURATION_SLOW - (DURATION_SLOW - DURATION_FAST) * share) / 1000}s`
  }

  const scrollerOf = (el: HTMLElement) => {
    let node = el.parentElement
    while (node && !/auto|scroll/.test(getComputedStyle(node).overflowY)) node = node.parentElement
    return node
  }

  const gained = () => {
    if (!headerEl || !lineEl) return 0
    const pad = parseFloat(getComputedStyle(headerEl).getPropertyValue('--space-2'))
    return headerEl.offsetHeight - lineEl.offsetHeight - (bottomEl?.offsetHeight ?? 0) - pad * 2
  }

  const canCollapse = (scroller: HTMLElement, top: number) => {
    if (top <= EXPAND_AT || top < COLLAPSE_AT) return false
    return scroller.scrollHeight - scroller.clientHeight - gained() > EXPAND_AT
  }

  const follow = (top: number) => {
    if (!scroller) return
    if (!collapsed) {
      if (canCollapse(scroller, top)) setCollapsed(true)
    } else if (top <= EXPAND_AT) setCollapsed(false)
  }

  const setCollapsed = (next: boolean) => {
    transitioning = true
    duration = headerDuration(speed())
    collapsed = next
    window.clearTimeout(settle)
    settle = window.setTimeout(() => {
      transitioning = false
      if (scroller) follow(scroller.scrollTop)
    }, SETTLE)
  }

  const onScroll = (event: Event) => {
    if (!scroller) return
    const top = scroller.scrollTop
    sample(top, event.timeStamp)
    if (!transitioning) follow(top)
  }

  $effect(() => {
    if (!headerEl) return
    const found = scrollerOf(headerEl)
    if (!found) return
    scroller = found
    sample(found.scrollTop, performance.now())
    found.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      found.removeEventListener('scroll', onScroll)
      window.clearTimeout(settle)
      scroller = null
    }
  })

  $effect(() => {
    void [title, heading, crumbs, center, description, tools, view, bottom]
    void tick().then(() => {
      if (!scroller) return
      window.clearTimeout(settle)
      transitioning = false
      follow(scroller.scrollTop)
    })
  })
</script>

<header
  bind:this={headerEl}
  class="dnd-band dnd-pagehead"
  class:dnd-pagehead-tabbed={Boolean(bottom)}
  class:dnd-pagehead-collapsed={collapsed}
  class:dnd-pagehead-banner={Boolean(banner)}
  style:--pagehead-duration={duration}
>
  {#if banner}
    <div class="dnd-pagehead-banner-clip" aria-hidden="true">{@render banner()}</div>
  {/if}

  <div bind:this={lineEl} class="dnd-band-line dnd-pagehead-line">
    <div class="dnd-pagehead-title">
      {#if heading}
        {@render heading()}
      {:else}
        <h1 class="dnd-heading dnd-heading-hero dnd-pagehead-name">{title}</h1>
      {/if}
      {#if count !== undefined}
        <span class="dnd-pagehead-count">{count}</span>
      {/if}
    </div>
    {#if actions}
      <span class="dnd-band-acts">{@render actions()}</span>
    {/if}
  </div>

  {#if named.length > 0}
    <div class="dnd-pagehead-fold">
      <nav class="dnd-label dnd-pagehead-crumbs" aria-label="Where this sits">
        {#each named as step, index (step.id)}
          {#if index > 0}<span class="dnd-pagehead-crumb-mark" aria-hidden="true">/</span>{/if}
          {#if oncrumb}
            <button type="button" class="dnd-pagehead-crumb dnd-pagehead-crumb-step" onclick={() => oncrumb(step.id)}>{step.title}</button>
          {:else}
            <span class="dnd-pagehead-crumb">{step.title}</span>
          {/if}
        {/each}
      </nav>
    </div>
  {/if}

  {#if center}
    <div class="dnd-pagehead-fold">
      <div class="dnd-pagehead-center">{@render center()}</div>
    </div>
  {/if}

  {#if description}
    <div class="dnd-pagehead-fold">
      <p class="dnd-pagehead-lede">{description}</p>
    </div>
  {/if}

  {#if tools || view}
    <div class="dnd-pagehead-fold">
      <div class="dnd-pagehead-row">
        {#if tools}
          <div class="dnd-pagehead-tools">{@render tools()}</div>
        {/if}
        {#if view}
          <div class="dnd-pagehead-view">{@render view()}</div>
        {/if}
      </div>
    </div>
  {/if}

  {#if bottom}
    <div bind:this={bottomEl} class="dnd-pagehead-bottom">{@render bottom()}</div>
  {/if}
</header>

<style>
  .dnd-pagehead {
    --pagehead-pad: var(--space-6);
    --pagehead-hold: calc(var(--shell-hold-pad) + max(0px, (100% - var(--shell-hold-max)) / 2));
    --pagehead-ease: cubic-bezier(0.4, 0, 0.2, 1);
    display: grid;
    align-content: center;
    gap: var(--space-3);
    margin: 0;
    padding: var(--pagehead-pad) 0;
    transition:
      padding var(--pagehead-duration, 0.35s) var(--pagehead-ease),
      row-gap var(--pagehead-duration, 0.35s) var(--pagehead-ease);
  }

  .dnd-pagehead-banner {
    position: relative;
    isolation: isolate;
  }

  .dnd-pagehead-banner-clip {
    position: absolute;
    inset: 0;
    z-index: -1;
    overflow: hidden;
    border-radius: inherit;
    pointer-events: none;
    user-select: none;
  }

  .dnd-pagehead-banner-clip::after {
    content: "";
    position: absolute;
    inset: 0;
    background: var(--band-veil);
  }

  .dnd-pagehead-banner-clip > :global(*) {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
  }

  .dnd-pagehead-banner-clip :global(img) {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .dnd-pagehead-banner .dnd-pagehead-crumbs,
  .dnd-pagehead-banner .dnd-pagehead-count,
  .dnd-pagehead-banner .dnd-pagehead-lede {
    text-shadow: 0 1px 0 var(--shadow-ink), 0 0 var(--space-3) var(--shadow-ink);
  }

  .dnd-pagehead-banner .dnd-pagehead-lede {
    color: var(--ink);
  }

  .dnd-pagehead-line,
  .dnd-pagehead-fold,
  .dnd-pagehead-bottom {
    padding-inline: var(--pagehead-hold);
  }

  .dnd-pagehead-tabbed {
    padding-block-end: 0;
  }

  .dnd-pagehead-collapsed {
    padding-block: var(--space-2);
    row-gap: 0;
  }

  .dnd-pagehead-collapsed.dnd-pagehead-tabbed {
    padding-block-end: 0;
  }

  .dnd-pagehead-line {
    align-items: center;
  }

  .dnd-pagehead-title {
    display: flex;
    flex: 1;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-1) var(--space-3);
    min-width: 0;
  }

  .dnd-pagehead-name {
    margin: 0;
    min-width: 0;
    overflow-wrap: anywhere;
  }

  .dnd-pagehead-name,
  .dnd-pagehead-title > :global(.dnd-heading-hero) {
    transition: font-size var(--pagehead-duration, 0.35s) var(--pagehead-ease);
  }

  .dnd-pagehead-collapsed .dnd-pagehead-name,
  .dnd-pagehead-collapsed .dnd-pagehead-title > :global(.dnd-heading-hero) {
    font-size: var(--text-xl);
  }

  .dnd-pagehead-count {
    flex: none;
    font-family: var(--font-figures);
    font-size: var(--text-sm);
    letter-spacing: var(--tracking-wide);
    color: var(--ink-faint);
  }

  .dnd-pagehead-fold {
    display: grid;
    grid-template-rows: 1fr;
    min-width: 0;
    opacity: 1;
    transition:
      grid-template-rows var(--pagehead-duration, 0.35s) var(--pagehead-ease),
      opacity var(--pagehead-duration, 0.35s) var(--pagehead-ease);
  }

  .dnd-pagehead-fold > * {
    min-height: 0;
    overflow: clip;
  }

  .dnd-pagehead-collapsed .dnd-pagehead-fold {
    grid-template-rows: 0fr;
    opacity: 0;
    overflow: clip;
    pointer-events: none;
  }

  .dnd-pagehead-crumbs {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-1) var(--space-2);
    min-width: 0;
    margin: 0;
  }

  .dnd-pagehead-crumb {
    max-inline-size: 100%;
    padding: 0;
    border: none;
    background: none;
    font: inherit;
    letter-spacing: inherit;
    text-transform: inherit;
    color: var(--metal);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .dnd-pagehead-crumb-step {
    cursor: pointer;
  }

  .dnd-pagehead-crumb-step:hover {
    color: var(--metal-bright);
  }

  .dnd-pagehead-crumb-step:focus-visible {
    outline: none;
    box-shadow: var(--focus-ring);
  }

  .dnd-pagehead-crumb-mark {
    color: var(--ink-faint);
  }

  .dnd-pagehead-center {
    display: flex;
    min-width: 0;
  }

  .dnd-pagehead-center > :global(*) {
    flex: 0 1 calc(var(--space-8) * 5);
    min-width: 0;
  }

  .dnd-pagehead-lede {
    margin: 0;
    font-size: var(--text-sm);
    color: var(--ink-dim);
  }

  .dnd-pagehead-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    min-width: 0;
  }

  .dnd-pagehead-tools {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-3);
    min-width: 0;
  }

  .dnd-pagehead-view {
    display: flex;
    align-items: center;
    min-width: 0;
    margin-inline-start: auto;
  }

  .dnd-pagehead-bottom {
    min-width: 0;
  }
</style>
