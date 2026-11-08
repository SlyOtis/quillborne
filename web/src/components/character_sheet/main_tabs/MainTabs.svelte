<script lang="ts">
  import {onDestroy, untrack, type Snippet} from "svelte";
  import {writable} from "svelte/store";

  let {
    initialTab,
    ...tabs
  }: {
    inventoryTab: Snippet,
    actionsTab: Snippet,
    spellsTab: Snippet,
    featsTab: Snippet,
    backgroundTab: Snippet,
    initialTab: string,
  } = $props();

  type Tabs = keyof typeof tabs

  const selectedTab = writable((localStorage.getItem('selectedTab') || untrack(() => initialTab)) as Tabs);

  const unsubscribe = selectedTab.subscribe(state => {
    localStorage.setItem('selectedTab', state)
  })

  onDestroy(() => unsubscribe())

  const tabList: { id: Tabs, title: string }[] = [
    {id: 'actionsTab', title: 'Actions'},
    {id: 'spellsTab', title: 'Spells'},
    {id: 'inventoryTab', title: 'Inventory'},
    {id: 'featsTab', title: 'Features'},
    {id: 'backgroundTab', title: 'Background'}
  ]

  function selectTab(e: Event, tab: Tabs) {
    e.stopPropagation()
    e.preventDefault()
    selectedTab.set(tab)
  }

  function stepTab(e: KeyboardEvent) {
    const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0
    if (!step) return
    e.preventDefault()
    const at = tabList.findIndex(tab => tab.id === $selectedTab)
    const next = tabList[(at + step + tabList.length) % tabList.length].id
    selectedTab.set(next)
    document.getElementById(`tab-${next}`)?.focus()
  }
</script>

<div class="root">
    <div class="rail" role="tablist" aria-label="Character sheet">
        {#each tabList as tab (tab.id)}
            <button
                type="button"
                class="tab"
                class:tab-on={$selectedTab === tab.id}
                role="tab"
                id="tab-{tab.id}"
                aria-selected={$selectedTab === tab.id}
                aria-controls="panel-{tab.id}"
                tabindex={$selectedTab === tab.id ? 0 : -1}
                onclick={e => selectTab(e, tab.id)}
                onkeydown={stepTab}
            >
                {tab.title}
            </button>
        {/each}
    </div>
    <div
        class="content dnd-panel dnd-keyline"
        role="tabpanel"
        id="panel-{$selectedTab}"
        aria-labelledby="tab-{$selectedTab}"
    >
        {@render tabs[$selectedTab]()}
    </div>
</div>

<style>
    .root {
        position: relative;
        display: flex;
        flex-direction: column;
        min-width: 0;
        min-height: 0;
        height: 100%;
        flex: 1;
    }

    .rail {
        position: relative;
        z-index: 2;
        display: flex;
        align-items: flex-end;
        gap: var(--space-1);
        padding: var(--space-1) var(--space-2) 0;
        margin-bottom: calc(var(--border-heavy) * -1);
        background:
            linear-gradient(180deg, color-mix(in srgb, #000 20%, transparent) 0%, color-mix(in srgb, #000 55%, transparent) 100%),
            var(--texture-grain),
            var(--wood);
        border-radius: var(--radius-sm) var(--radius-sm) 0 0;
        box-shadow: inset 0 1px 0 var(--sheen), inset 0 0 0 1px var(--keyline);
    }

    .tab {
        position: relative;
        flex: 1 1 0;
        min-width: 0;
        padding: var(--space-2) var(--space-3);
        border: none;
        border-radius: var(--radius-sm) var(--radius-sm) 0 0;
        background:
            linear-gradient(180deg, color-mix(in srgb, var(--ember-core) 10%, transparent) 0%, color-mix(in srgb, #000 30%, transparent) 55%, color-mix(in srgb, #000 55%, transparent) 100%),
            var(--texture-grain),
            var(--wood);
        box-shadow:
            inset 0 0 0 1px var(--keyline),
            inset 0 0 0 2px var(--metal-dim),
            inset 0 3px 0 0 var(--sheen),
            inset 0 -0.5rem 0.6rem -0.3rem var(--shade-hard);
        font-family: var(--font-display);
        font-size: var(--text-xs);
        font-weight: 700;
        letter-spacing: var(--tracking-caps);
        text-transform: uppercase;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        color: var(--metal);
        text-shadow: 0 1px 0 #000, 0 0 2px #000;
        cursor: pointer;
        transition: color 0.18s ease, text-shadow 0.18s ease, filter 0.18s ease, box-shadow 0.18s ease;
    }

    .tab:hover:not(.tab-on) {
        filter: brightness(1);
        color: var(--metal-bright);
        text-shadow: var(--glow-text);
        box-shadow:
            inset 0 0 0 1px var(--keyline),
            inset 0 0 0 2px var(--metal),
            inset 0 3px 0 0 var(--sheen),
            inset 0 -0.5rem 0.6rem -0.3rem var(--shade-hard);
    }

    .tab:active:not(.tab-on) {
        filter: brightness(0.7);
    }

    .tab-on {
        z-index: 1;
        padding-block: var(--space-3) var(--space-2);
        background:
            radial-gradient(ellipse 80% 90% at 50% 110%, var(--ember-glow) 0%, transparent 70%),
            linear-gradient(180deg, color-mix(in srgb, var(--stone-light) 26%, transparent) 0%, color-mix(in srgb, #000 30%, transparent) 55%, var(--ground-raised) 100%),
            var(--texture-noise),
            var(--stone);
        box-shadow:
            inset 0 1px 0 var(--keyline),
            inset 1px 0 0 var(--keyline),
            inset -1px 0 0 var(--keyline),
            inset 0 2px 0 var(--metal-bright),
            inset 2px 0 0 var(--metal),
            inset -2px 0 0 var(--metal),
            inset 0 3px 0 var(--metal-dim),
            0 0 0.9rem var(--ember-glow);
        color: var(--metal-bright);
        text-shadow: var(--glow-text);
        filter: none;
    }

    .tab-on::after {
        content: '';
        position: absolute;
        right: var(--border-width);
        bottom: 0;
        left: var(--border-width);
        height: var(--border-heavy);
        background: var(--ground-raised);
    }

    .tab:focus-visible {
        outline: none;
        box-shadow: var(--focus-ring);
    }

    .content {
        position: relative;
        z-index: 1;
        display: flex;
        flex: 1;
        justify-content: stretch;
        align-items: stretch;
        width: 100%;
        min-height: 0;
        padding: var(--space-4) var(--space-3);
        background: var(--texture-noise), linear-gradient(180deg, var(--ground-raised), var(--ground-deep));
        border-radius: 0 0 var(--radius-sm) var(--radius-sm);
        box-shadow: var(--rim-thin), inset 0 0 16px 2px var(--shade-hard), var(--shadow-md);
        overflow-y: auto;
        overflow-x: hidden;
    }
</style>
