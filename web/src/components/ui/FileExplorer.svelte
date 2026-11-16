<script lang="ts" module>
  import type { GlyphName } from './Glyph.svelte'

  export interface FileItem {
    /** Unique key used for selection, presence and rename tracking. */
    id: string
    /** The name written under the tile, and what the name grouping reads. */
    name: string
    /** Whether the item is a folder, which takes a drop, or a file. */
    kind: 'folder' | 'file'
    /** The type mark drawn when the mime type says nothing. */
    glyph?: GlyphName
    /** Preformatted size label of the file. */
    size?: string
    /** Download address, whose presence adds Download to the menu. */
    url?: string
    /** Picture drawn over the mark when set. */
    thumbnailUrl?: string | null
    /** Mime type consulted first when picking the mark. */
    mimeType?: string
    /** When it was last written, which the modified grouping buckets. */
    updatedAt?: string
    /** Tag labels, three revealed as chips on hover with an overflow chip. */
    tags?: string[]
    /** Marks a root, which drops Move from its menu since a root has nowhere to go. */
    root?: boolean
    /** Marks the item as reserved, drawing the lock in the tile corner. */
    reserved?: boolean
    /** Marks the item as the index of its folder, drawing the sitemap mark on the tile. */
    index?: boolean
  }

  export interface FileMoveTarget {
    /** Identity of the destination folder. */
    id: string
    /** Name shown in the destination list. */
    label: string
    /** Path of the destination shown under the name. */
    path?: string
  }

  export interface FileOption {
    /** The words on the row. */
    title: string
    /** The mark before the words. */
    glyph?: GlyphName
    /** Writes the row in the destructive tone. */
    bane?: boolean
    /** Draws the trailing chevron of a row that opens a list beside it. */
    submenu?: boolean
    /** Runs when the row is picked. */
    run: () => void
  }

  export type FileGroupBy = 'none' | 'kind' | 'type' | 'modified' | 'name' | 'tag'
</script>

<script lang="ts">
  import { onMount, tick } from 'svelte'
  import FileTile from './FileTile.svelte'
  import Glyph, { getMimeGlyph } from './Glyph.svelte'
  import type { PresenceUser } from './Presence.svelte'

  type Bucket = { key: string; label: string; order: number }
  type FileGroup = Bucket & { items: FileItem[] }
  type Menu = { item: FileItem; top: number; left: number; options: FileOption[] }

  const {
    items,
    loading = false,
    showTags = false,
    showAdd = false,
    addLabel = 'Add',
    addGlyph = 'add',
    selectedIds = new Set<string>(),
    groupBy = 'none',
    presence = {},
    itemOptions,
    moveTargets = [],
    moveLabel = 'Move',
    moveSearchPlaceholder = 'Search folders',
    selectable = false,
    selectLabel = 'Select',
    deselectLabel = 'Deselect',
    onadd,
    onopen,
    onselect,
    onselectend,
    onhover,
    onhoverend,
    ondownload,
    onrename,
    onmove
  }: {
    /** The files and folders drawn as tiles. */
    items: FileItem[]
    /** Draws placeholder tiles until the first items arrive. */
    loading?: boolean
    /** Reveals the item tags as chips while the tile is hovered. */
    showTags?: boolean
    /** Draws the add tile first in the grid, which runs onadd and is never an item. */
    showAdd?: boolean
    /** Label under the mark of the add tile. */
    addLabel?: string
    /** Mark of the add tile. */
    addGlyph?: GlyphName
    /** Ids drawn with the selection outline, owned by the caller. */
    selectedIds?: Set<string>
    /** Splits the grid into labelled groups by kind, type, modified bucket, first letter or tag. */
    groupBy?: FileGroupBy
    /** The people at each item by id, stacked on its tile. */
    presence?: Record<string, PresenceUser[]>
    /** Reshapes the menu of an item from the rows the explorer built. */
    itemOptions?: (item: FileItem, defaults: FileOption[]) => FileOption[]
    /** Folders the Move row lists beside itself; empty leaves Move running onmove with no target for the caller to resolve. */
    moveTargets?: FileMoveTarget[]
    /** Words of the Move row. */
    moveLabel?: string
    /** Placeholder of the destination search field. */
    moveSearchPlaceholder?: string
    /** Turns the selection surface on, the tick over each mark and the pick row in the menu. */
    selectable?: boolean
    /** Words of the pick row for an unselected item. */
    selectLabel?: string
    /** Words of the pick row for a selected item. */
    deselectLabel?: string
    /** Runs when the add tile is pressed. */
    onadd?: () => void
    /** Runs with the item pressed, a folder to walk into or a file to read. */
    onopen?: (item: FileItem) => void
    /** Runs with the item picked and the click behind it, absent when the pick came from the menu. */
    onselect?: (item: FileItem, event?: MouseEvent) => void
    /** Runs when Escape or a press on the ground asks to end the selection. */
    onselectend?: () => void
    /** Runs when the pointer lands on a tile. */
    onhover?: (item: FileItem, event: MouseEvent) => void
    /** Runs when the pointer leaves a tile or the explorer. */
    onhoverend?: () => void
    /** Runs when Download is picked for an item with an address. */
    ondownload?: (item: FileItem) => void
    /** Runs with the item and its new name once the field commits a change. */
    onrename?: (item: FileItem, name: string) => void
    /** Runs with the item and the folder it goes to, from the menu or a drop; null when the caller resolves it. */
    onmove?: (item: FileItem, targetId: string | null) => void
  } = $props()

  const DAY = 86400000
  const SKELETONS = Array.from({ length: 12 }, (_, at) => at)

  let root = $state<HTMLElement>()
  let panel = $state<HTMLElement>()
  let touch = $state(false)
  let thumbLoaded = $state(new Set<string>())
  let thumbFailed = $state(new Set<string>())
  let thumbVersions = $state(new Map<string, number>())
  let renamingId = $state<string | null>(null)
  let draggingId = $state<string | null>(null)
  let dropTargetId = $state<string | null>(null)
  let menu = $state<Menu | null>(null)
  let sub = $state(false)
  let hunt = $state('')

  const picking = $derived(selectable && !touch && selectedIds.size > 0)
  const groups = $derived.by<FileGroup[] | null>(() => {
    if (groupBy === 'none') return null
    const map = new Map<string, FileGroup>()
    for (const item of items) {
      const buckets = groupBy === 'tag' ? tagBuckets(item) : [bucketOf(item)]
      for (const bucket of buckets) {
        const held = map.get(bucket.key) ?? { ...bucket, items: [] }
        held.items.push(item)
        map.set(bucket.key, held)
      }
    }
    return [...map.values()].sort((a, b) => a.order - b.order || a.label.localeCompare(b.label))
  })
  const loose = $derived(groups ? [] : items)
  const targets = $derived(menu ? moveTargets.filter((target) => target.id !== menu!.item.id) : [])
  const sought = $derived.by(() => {
    const wanted = hunt.trim().toLowerCase()
    return wanted ? targets.filter((target) => `${target.label} ${target.path ?? ''}`.toLowerCase().includes(wanted)) : targets
  })

  function isSelected(id: string): boolean {
    return selectedIds.has(id)
  }

  function glyphOf(item: FileItem) {
    if (item.kind === 'folder') return 'folder'
    return item.glyph ?? getMimeGlyph(item.mimeType ?? '')
  }

  function typeBucket(item: FileItem): Bucket {
    if (item.kind === 'folder') return { key: 'folder', label: 'Folders', order: 0 }
    switch (getMimeGlyph(item.mimeType ?? '')) {
      case 'picture':
        return { key: 'image', label: 'Images', order: 1 }
      case 'play':
        return { key: 'video', label: 'Videos', order: 2 }
      case 'sound':
        return { key: 'audio', label: 'Audio', order: 3 }
      case 'scroll':
        return { key: 'doc', label: 'Documents', order: 4 }
      default:
        return { key: 'other', label: 'Other', order: 5 }
    }
  }

  function modifiedBucket(item: FileItem): Bucket {
    if (!item.updatedAt) return { key: 'nodate', label: 'No date', order: 5 }
    const at = new Date(item.updatedAt).getTime()
    if (Number.isNaN(at)) return { key: 'nodate', label: 'No date', order: 5 }
    const now = new Date()
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
    if (at >= today) return { key: 'today', label: 'Today', order: 0 }
    if (at >= today - 7 * DAY) return { key: 'week', label: 'This week', order: 1 }
    if (at >= today - 30 * DAY) return { key: 'month', label: 'This month', order: 2 }
    return { key: 'earlier', label: 'Earlier', order: 3 }
  }

  function nameBucket(item: FileItem): Bucket {
    const first = (item.name.trim()[0] ?? '#').toUpperCase()
    const letter = first >= 'A' && first <= 'Z'
    return { key: letter ? first : '#', label: letter ? first : '#', order: letter ? first.charCodeAt(0) : 999 }
  }

  function bucketOf(item: FileItem): Bucket {
    if (groupBy === 'kind') {
      return item.kind === 'folder' ? { key: 'folder', label: 'Folders', order: 0 } : { key: 'file', label: 'Files', order: 1 }
    }
    if (groupBy === 'type') return typeBucket(item)
    if (groupBy === 'modified') return modifiedBucket(item)
    return nameBucket(item)
  }

  function tagBuckets(item: FileItem): Bucket[] {
    const tags = item.tags ?? []
    if (tags.length === 0) return [{ key: 'untagged', label: 'No tags', order: 1 }]
    return tags.map((tag) => ({ key: `tag:${tag}`, label: tag, order: 0 }))
  }

  function thumbSrc(item: FileItem): string {
    const url = item.thumbnailUrl ?? ''
    const version = thumbVersions.get(item.id)
    if (!version) return url
    return `${url}${url.includes('?') ? '&' : '?'}reload=${version}`
  }

  function onThumbLoad(item: FileItem) {
    thumbLoaded = new Set([...thumbLoaded, item.id])
    thumbFailed = new Set([...thumbFailed].filter((id) => id !== item.id))
  }

  function onThumbError(item: FileItem) {
    thumbLoaded = new Set([...thumbLoaded].filter((id) => id !== item.id))
    thumbFailed = new Set([...thumbFailed, item.id])
  }

  function reloadThumb(item: FileItem) {
    thumbLoaded = new Set([...thumbLoaded].filter((id) => id !== item.id))
    thumbFailed = new Set([...thumbFailed].filter((id) => id !== item.id))
    thumbVersions = new Map(thumbVersions).set(item.id, (thumbVersions.get(item.id) ?? 0) + 1)
  }

  function pick(item: FileItem, event?: MouseEvent) {
    onselect?.(item, event)
  }

  function open(item: FileItem, event: MouseEvent) {
    if (picking) return pick(item, event)
    onopen?.(item)
  }

  function onGround(event: MouseEvent) {
    if (!picking) return
    const target = event.target as HTMLElement | null
    if (target?.closest('.dnd-filetile, .dnd-fileexplorer-add, .dnd-fileexplorer-menu')) return
    onselectend?.()
  }

  function onKey(event: KeyboardEvent) {
    if (event.key !== 'Escape') return
    if (menu) {
      closeMenu()
      return
    }
    if (picking) onselectend?.()
  }

  function resetDrag() {
    draggingId = null
    dropTargetId = null
  }

  function onDragStart(event: DragEvent, item: FileItem) {
    draggingId = item.id
    if (!event.dataTransfer) return
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', item.id)
  }

  function dropAllowed(item: FileItem): boolean {
    return Boolean(draggingId) && item.kind === 'folder' && item.id !== draggingId
  }

  function onDragOver(event: DragEvent, item: FileItem) {
    if (!dropAllowed(item)) return
    event.preventDefault()
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'
    dropTargetId = item.id
  }

  function onDragLeave(item: FileItem) {
    if (dropTargetId === item.id) dropTargetId = null
  }

  function onDrop(event: DragEvent, item: FileItem) {
    if (!dropAllowed(item)) return resetDrag()
    event.preventDefault()
    const source = items.find((one) => one.id === draggingId)
    resetDrag()
    if (!source) return
    onmove?.(source, item.id)
  }

  function onEnter(event: MouseEvent, item: FileItem) {
    if (renamingId) return
    onhover?.(item, event)
  }

  function startRename(item: FileItem) {
    renamingId = item.id
    onhoverend?.()
  }

  function commitRename(item: FileItem, name: string) {
    if (renamingId !== item.id) return
    renamingId = null
    onrename?.(item, name)
  }

  function moveOption(item: FileItem): FileOption | null {
    if (item.root) return null
    return {
      title: moveLabel,
      glyph: 'folderopen',
      submenu: moveTargets.some((target) => target.id !== item.id),
      run: () => onmove?.(item, null)
    }
  }

  function menuOptions(item: FileItem, move: FileOption | null): FileOption[] {
    const defaults: FileOption[] = [{ title: 'Open', glyph: item.kind === 'folder' ? 'folderopen' : 'eye', run: () => onopen?.(item) }]
    if (selectable) {
      defaults.push({ title: isSelected(item.id) ? deselectLabel : selectLabel, glyph: 'check', run: () => pick(item) })
    }
    if (item.kind === 'file' && item.url) {
      defaults.push({ title: 'Download', glyph: 'download', run: () => ondownload?.(item) })
    }
    if (item.thumbnailUrl && thumbFailed.has(item.id)) {
      defaults.push({ title: 'Reload thumbnail', glyph: 'refresh', run: () => reloadThumb(item) })
    }
    defaults.push({ title: 'Rename', glyph: 'pencil', run: () => startRename(item) })
    if (move) defaults.push(move)
    return itemOptions ? itemOptions(item, defaults) : defaults
  }

  function openMenu(event: MouseEvent, item: FileItem) {
    if (!root) return
    const move = moveOption(item)
    const options = menuOptions(item, move)
    if (options.length === 0) return
    const frame = root.getBoundingClientRect()
    const anchor = (event.currentTarget as HTMLElement | null)?.closest('.dnd-iconbtn')?.getBoundingClientRect()
    const top = (anchor ? anchor.bottom : event.clientY) - frame.top + root.scrollTop + 4
    const left = (anchor ? anchor.right : event.clientX) - frame.left + root.scrollLeft
    sub = false
    hunt = ''
    menu = { item, top, left, options }
    void tick().then(() => {
      if (!menu || !panel || !root) return
      menu.left = Math.max(0, Math.min(left - panel.offsetWidth, root.clientWidth - panel.offsetWidth))
      panel.focus({ preventScroll: true })
    })
  }

  function closeMenu() {
    menu = null
    sub = false
    hunt = ''
  }

  function run(option: FileOption) {
    if (menu && option.submenu) {
      sub = true
      void tick().then(() => panel?.querySelector<HTMLInputElement>('.dnd-fileexplorer-menu-input')?.focus({ preventScroll: true }))
      return
    }
    closeMenu()
    option.run()
  }

  function moveTo(target: FileMoveTarget) {
    const item = menu?.item
    closeMenu()
    if (item) onmove?.(item, target.id)
  }

  function onDocumentDown(event: PointerEvent) {
    if (!menu) return
    const target = event.target as HTMLElement | null
    if (target?.closest('.dnd-fileexplorer-menu')) return
    closeMenu()
  }

  onMount(() => {
    const coarse = window.matchMedia('(hover: none)')
    const read = () => (touch = coarse.matches)
    read()
    coarse.addEventListener('change', read)
    document.addEventListener('pointerdown', onDocumentDown)
    return () => {
      coarse.removeEventListener('change', read)
      document.removeEventListener('pointerdown', onDocumentDown)
    }
  })
</script>

{#snippet tile(item: FileItem)}
  <FileTile
    {item}
    glyph={glyphOf(item)}
    selected={isSelected(item.id)}
    {selectable}
    {touch}
    {showTags}
    presence={presence[item.id] ?? []}
    renaming={renamingId === item.id}
    dragging={draggingId === item.id}
    dropTarget={dropTargetId === item.id}
    thumbSrc={thumbSrc(item)}
    thumbLoaded={thumbLoaded.has(item.id)}
    thumbFailed={thumbFailed.has(item.id)}
    onopen={(event) => open(item, event)}
    onpick={(event) => pick(item, event)}
    onmore={(event) => openMenu(event, item)}
    onenter={(event) => onEnter(event, item)}
    onleave={onhoverend}
    ondragstart={(event) => onDragStart(event, item)}
    ondragover={(event) => onDragOver(event, item)}
    ondragleave={() => onDragLeave(item)}
    ondrop={(event) => onDrop(event, item)}
    ondragend={resetDrag}
    onthumbload={() => onThumbLoad(item)}
    onthumberror={() => onThumbError(item)}
    onrename={(name) => commitRename(item, name)}
    onrenamecancel={() => (renamingId = null)}
  />
{/snippet}

<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_static_element_interactions -->
<div
  bind:this={root}
  class="dnd-fileexplorer"
  tabindex="-1"
  onclick={onGround}
  onkeydown={onKey}
  onmouseleave={onhoverend}
  ondragend={resetDrag}
>
  {#if loading}
    <div class="dnd-fileexplorer-grid" aria-busy="true">
      {#each SKELETONS as at (at)}
        <div class="dnd-fileexplorer-skeleton" aria-hidden="true">
          <span class="dnd-fileexplorer-skeleton-area"></span>
          <span class="dnd-fileexplorer-skeleton-label"></span>
        </div>
      {/each}
    </div>
  {:else}
    {#if showAdd || !groups}
      <div class="dnd-fileexplorer-grid" class:dnd-fileexplorer-grid-add={showAdd && groups} role="list">
        {#if showAdd}
          <button type="button" class="dnd-fileexplorer-add" onclick={onadd}>
            <span class="dnd-fileexplorer-add-area"><Glyph name={addGlyph} size="lg" /></span>
            <span class="dnd-fileexplorer-add-label">{addLabel}</span>
          </button>
        {/if}
        {#each loose as item (item.id)}
          {@render tile(item)}
        {/each}
      </div>
    {/if}
    {#if groups}
      {#each groups as group (group.key)}
        <section class="dnd-fileexplorer-group" aria-label={group.label}>
          <header class="dnd-fileexplorer-group-head">
            <h3 class="dnd-label dnd-fileexplorer-group-name">{group.label}</h3>
            <span class="dnd-fileexplorer-group-count">{group.items.length}</span>
            <span class="dnd-fileexplorer-group-run"></span>
          </header>
          <div class="dnd-fileexplorer-grid dnd-fileexplorer-grid-grouped" role="list">
            {#each group.items as item (item.id)}
              {@render tile(item)}
            {/each}
          </div>
        </section>
      {/each}
    {/if}
  {/if}

  {#if menu}
    <div bind:this={panel} class="dnd-fileexplorer-menu" style:top="{menu.top}px" style:left="{menu.left}px" role="menu" tabindex="-1">
      <div class="dnd-fileexplorer-menu-track" class:dnd-fileexplorer-menu-sub={sub}>
        <div class="dnd-fileexplorer-menu-panel">
          {#each menu.options as option (option.title)}
            <button type="button" class="dnd-fileexplorer-menu-row" class:dnd-fileexplorer-menu-row-bane={option.bane} role="menuitem" onclick={() => run(option)}>
              <span class="dnd-fileexplorer-menu-glyph" aria-hidden="true">{#if option.glyph}<Glyph name={option.glyph} size="sm" />{/if}</span>
              <span class="dnd-fileexplorer-menu-title">{option.title}</span>
              {#if option.submenu}<span class="dnd-fileexplorer-menu-trail"><Glyph name="chevronright" size="sm" /></span>{/if}
            </button>
          {/each}
        </div>
        <div class="dnd-fileexplorer-menu-panel">
          <input class="dnd-search dnd-fileexplorer-menu-input" type="text" placeholder={moveSearchPlaceholder} aria-label={moveSearchPlaceholder} bind:value={hunt} />
          {#each sought as target (target.id)}
            <button type="button" class="dnd-fileexplorer-menu-row" role="menuitem" onclick={() => moveTo(target)}>
              <span class="dnd-fileexplorer-menu-glyph" aria-hidden="true"><Glyph name="folder" size="sm" /></span>
              <span class="dnd-fileexplorer-menu-text">
                <span class="dnd-fileexplorer-menu-title">{target.label}</span>
                {#if target.path}<span class="dnd-fileexplorer-menu-note">{target.path}</span>{/if}
              </span>
            </button>
          {:else}
            <p class="dnd-fileexplorer-menu-empty">No folder matches.</p>
          {/each}
        </div>
      </div>
    </div>
  {/if}
</div>

<style>
  .dnd-fileexplorer {
    --fileexplorer-cell: 10em;
    position: relative;
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    min-width: 0;
    font-size: 0.75em;
    color: var(--ink);
    user-select: none;
    outline: none;
  }

  .dnd-fileexplorer-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(var(--fileexplorer-cell), 1fr));
    gap: 0.6667em;
  }

  .dnd-fileexplorer-group {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    min-width: 0;
  }

  .dnd-fileexplorer-group-head {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    min-width: 0;
  }

  .dnd-fileexplorer-group-name {
    margin: 0;
  }

  .dnd-fileexplorer-group-count {
    font-family: var(--font-figures);
    font-size: var(--text-xs);
    color: var(--ink-faint);
  }

  .dnd-fileexplorer-group-run {
    flex: 1;
    min-width: 0;
    block-size: var(--border-hair);
    background: linear-gradient(90deg, var(--metal-dim), transparent);
  }

  .dnd-fileexplorer-skeleton {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.4167em;
    padding: 1em 0.6667em;
  }

  .dnd-fileexplorer-skeleton-area,
  .dnd-fileexplorer-skeleton-label {
    display: block;
    background: linear-gradient(90deg, var(--ground-raised) 0%, var(--ground-lift) 50%, var(--ground-raised) 100%) 0 0 / 200% 100%;
    animation: dnd-fileexplorer-shimmer 1.4s ease-in-out infinite;
  }

  .dnd-fileexplorer-skeleton-area {
    width: calc(var(--fileexplorer-cell) * 8 / 15);
    aspect-ratio: 1;
    border-radius: var(--radius-md);
  }

  .dnd-fileexplorer-skeleton-label {
    width: 70%;
    height: 0.6667em;
    border-radius: var(--radius-sm);
  }

  .dnd-fileexplorer-skeleton:nth-child(even) .dnd-fileexplorer-skeleton-label {
    width: 50%;
  }

  @keyframes dnd-fileexplorer-shimmer {
    to {
      background-position: -200% 0;
    }
  }

  .dnd-fileexplorer-add {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5em;
    min-width: 0;
    padding: 1em 0.6667em;
    border: none;
    border-radius: var(--radius-md);
    background: none;
    color: inherit;
    font: inherit;
    cursor: pointer;
  }

  .dnd-fileexplorer-add-area {
    display: flex;
    align-items: center;
    justify-content: center;
    width: calc(var(--fileexplorer-cell) * 8 / 15);
    aspect-ratio: 1;
    border: calc(var(--border-hair) * 2) dashed var(--metal-dim);
    border-radius: var(--radius-md);
    color: var(--metal-dim);
    transition: border-color 0.15s ease, color 0.15s ease;
  }

  .dnd-fileexplorer-add-area :global(svg) {
    width: 37.5%;
    height: 37.5%;
  }

  .dnd-fileexplorer-add:hover .dnd-fileexplorer-add-area {
    border-color: var(--metal);
    color: var(--metal-bright);
  }

  .dnd-fileexplorer-add-label {
    display: -webkit-box;
    max-width: 100%;
    overflow: hidden;
    font-family: var(--font-display);
    font-size: var(--text-sm);
    font-weight: 600;
    line-height: 1.3;
    text-align: center;
    color: var(--metal);
    overflow-wrap: anywhere;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
  }

  .dnd-fileexplorer-add:focus-visible {
    outline: none;
  }

  .dnd-fileexplorer-add:focus-visible .dnd-fileexplorer-add-area {
    box-shadow: var(--focus-ring);
  }

  .dnd-fileexplorer-menu {
    position: absolute;
    z-index: 30;
    width: calc(var(--space-8) * 4);
    overflow: hidden;
    border-radius: var(--radius-sm);
    background: var(--texture-noise), linear-gradient(180deg, var(--ground-raised) 0%, var(--ground-deep) 100%);
    box-shadow: var(--rim-thin), inset 0 0 16px 2px var(--shade-hard), var(--shadow-lg);
    font-size: var(--text-md);
    outline: none;
    user-select: text;
  }

  .dnd-fileexplorer-menu-track {
    display: flex;
    align-items: flex-start;
    width: 200%;
    transition: transform 0.25s ease;
  }

  .dnd-fileexplorer-menu-sub {
    transform: translateX(-50%);
  }

  .dnd-fileexplorer-menu-panel {
    flex: 0 0 50%;
    width: 50%;
    max-height: calc(var(--space-8) * 5);
    overflow-y: auto;
    padding: var(--space-2);
    scrollbar-width: thin;
  }

  .dnd-fileexplorer-menu-track:not(.dnd-fileexplorer-menu-sub) > .dnd-fileexplorer-menu-panel:last-child,
  .dnd-fileexplorer-menu-sub > .dnd-fileexplorer-menu-panel:first-child {
    max-height: 0;
    overflow: hidden;
  }

  .dnd-fileexplorer-menu-row {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    width: 100%;
    padding: var(--space-1) var(--space-2);
    border: none;
    border-radius: var(--radius-sm);
    background: none;
    color: var(--ink);
    font-family: var(--font-body);
    font-size: var(--text-sm);
    text-align: start;
    cursor: pointer;
  }

  .dnd-fileexplorer-menu-row:hover {
    background: linear-gradient(90deg, color-mix(in srgb, var(--ember) 14%, transparent) 0%, transparent 90%);
    color: var(--metal-bright);
  }

  .dnd-fileexplorer-menu-row-bane {
    color: var(--state-bad);
  }

  .dnd-fileexplorer-menu-row:focus-visible {
    outline: none;
    box-shadow: var(--focus-ring);
  }

  .dnd-fileexplorer-menu-glyph {
    flex: none;
    display: flex;
    align-items: center;
    justify-content: center;
    width: var(--space-5);
    color: var(--metal);
  }

  .dnd-fileexplorer-menu-text {
    flex: 1 1 0;
    display: grid;
    min-width: 0;
  }

  .dnd-fileexplorer-menu-title {
    flex: 1 1 0;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .dnd-fileexplorer-menu-note {
    overflow: hidden;
    font-size: var(--text-xs);
    color: var(--ink-faint);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .dnd-fileexplorer-menu-trail {
    flex: none;
    display: flex;
    color: var(--ink-faint);
  }

  .dnd-fileexplorer-menu-input {
    width: 100%;
    margin-bottom: var(--space-1);
  }

  .dnd-fileexplorer-menu-empty {
    margin: 0;
    padding: var(--space-2);
    font-size: var(--text-xs);
    font-style: italic;
    color: var(--ink-faint);
  }

  @media (prefers-reduced-motion: reduce) {
    .dnd-fileexplorer-menu-track,
    .dnd-fileexplorer-skeleton-area,
    .dnd-fileexplorer-skeleton-label {
      transition: none;
      animation: none;
    }
  }
</style>
