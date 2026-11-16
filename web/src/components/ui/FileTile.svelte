<script lang="ts">
  import { tick } from 'svelte'
  import Chip from './Chip.svelte'
  import Glyph, { type GlyphName } from './Glyph.svelte'
  import IconBtn from './IconBtn.svelte'
  import Presence, { type PresenceUser } from './Presence.svelte'
  import StoredImage from './StoredImage.svelte'
  import type { FileItem } from './FileExplorer.svelte'

  const {
    item,
    glyph,
    selected = false,
    selectable = false,
    touch = false,
    showTags = false,
    presence = [],
    renaming = false,
    dragging = false,
    dropTarget = false,
    thumbSrc = '',
    thumbLoaded = false,
    thumbFailed = false,
    onopen,
    onpick,
    onmore,
    onenter,
    onleave,
    ondragstart,
    ondragover,
    ondragleave,
    ondrop,
    ondragend,
    onthumbload,
    onthumberror,
    onrename,
    onrenamecancel
  }: {
    /** The file or folder the tile stands for. */
    item: FileItem
    /** The type mark drawn when there is no picture, or while it loads. */
    glyph: GlyphName
    /** Keeps the tick lit and the outline on. */
    selected?: boolean
    /** Draws the tick over the mark on hover. */
    selectable?: boolean
    /** Drops the tick, since a touch screen has no hover, and opens the menu on a long press. */
    touch?: boolean
    /** Reveals the tags as chips on hover. */
    showTags?: boolean
    /** The people at this item, stacked on the mark's corner. */
    presence?: PresenceUser[]
    /** Swaps the name for the rename field. */
    renaming?: boolean
    /** Fades the tile while it is being dragged. */
    dragging?: boolean
    /** Lights a folder that will take the drop. */
    dropTarget?: boolean
    /** The address the picture is drawn from, with its reload mark when there is one. */
    thumbSrc?: string
    /** Says the picture has drawn, so the mark under it goes. */
    thumbLoaded?: boolean
    /** Says the picture failed, so the mark stays and the warning shows. */
    thumbFailed?: boolean
    /** Runs when the tile is pressed. */
    onopen?: (event: MouseEvent) => void
    /** Runs when the tick is pressed. */
    onpick?: (event: MouseEvent) => void
    /** Runs when the more button, a right click or a long press asks for the menu. */
    onmore?: (event: MouseEvent) => void
    /** Runs when the pointer lands on the tile. */
    onenter?: (event: MouseEvent) => void
    /** Runs when the pointer leaves the tile. */
    onleave?: () => void
    /** Runs when a drag starts from the tile. */
    ondragstart?: (event: DragEvent) => void
    /** Runs while something is dragged over the tile. */
    ondragover?: (event: DragEvent) => void
    /** Runs when a drag leaves the tile. */
    ondragleave?: () => void
    /** Runs when something is dropped on the tile. */
    ondrop?: (event: DragEvent) => void
    /** Runs when a drag from the tile ends. */
    ondragend?: () => void
    /** Runs once the picture has drawn. */
    onthumbload?: () => void
    /** Runs when the picture cannot be drawn. */
    onthumberror?: () => void
    /** Runs with the new name once the field commits a change. */
    onrename?: (name: string) => void
    /** Runs when the field closes without a change. */
    onrenamecancel?: () => void
  } = $props()

  const HOLD_MS = 500

  let draft = $state('')
  let field = $state<HTMLInputElement>()
  let holding: ReturnType<typeof setTimeout> | null = null
  let held = false

  const folder = $derived(item.kind === 'folder')
  const shownTags = $derived((item.tags ?? []).slice(0, 3))
  const moreTags = $derived((item.tags ?? []).length - shownTags.length)

  $effect(() => {
    if (!renaming) return
    draft = item.name
    void tick().then(() => {
      field?.focus()
      field?.select()
    })
  })

  function commit() {
    const name = draft.trim()
    if (name && name !== item.name) onrename?.(name)
    else onrenamecancel?.()
  }

  function clearHold() {
    if (!holding) return
    clearTimeout(holding)
    holding = null
  }

  function onPointerDown(event: PointerEvent) {
    if (event.pointerType === 'mouse') return
    clearHold()
    held = false
    holding = setTimeout(() => {
      holding = null
      held = true
      onmore?.(event as unknown as MouseEvent)
    }, HOLD_MS)
  }

  function onPress(event: MouseEvent) {
    clearHold()
    if (renaming) return
    if (held) {
      held = false
      return
    }
    onopen?.(event)
  }

  function onKey(event: KeyboardEvent) {
    if (event.key === 'Enter') {
      event.preventDefault()
      commit()
    } else if (event.key === 'Escape') {
      event.preventDefault()
      onrenamecancel?.()
    }
  }
</script>

<div
  class="dnd-filetile"
  class:dnd-filetile-selected={selected}
  class:dnd-filetile-folder={folder}
  class:dnd-filetile-dragging={dragging}
  class:dnd-filetile-drop={dropTarget}
  role="listitem"
  draggable={!renaming && !item.root}
  onpointerdown={onPointerDown}
  onpointerup={clearHold}
  onpointercancel={clearHold}
  onpointermove={clearHold}
  oncontextmenu={(event) => {
    event.preventDefault()
    onmore?.(event)
  }}
  onmouseenter={onenter}
  onmouseleave={onleave}
  {ondragstart}
  {ondragover}
  {ondragleave}
  {ondrop}
  {ondragend}
>
  <button type="button" class="dnd-filetile-press" aria-label={item.name} onclick={onPress}>
    <span class="dnd-filetile-area">
      {#if item.thumbnailUrl && !thumbFailed}
        <span class="dnd-filetile-thumb" class:dnd-filetile-thumb-drawn={thumbLoaded}>
          <StoredImage src={thumbSrc} alt="" onload={onthumbload} onerror={onthumberror} />
        </span>
      {/if}
      {#if !item.thumbnailUrl || !thumbLoaded}
        <span class="dnd-filetile-glyph"><Glyph name={glyph} size="lg" /></span>
      {/if}
      {#if item.thumbnailUrl && !thumbLoaded && !thumbFailed}
        <span class="dnd-filetile-wait" aria-hidden="true"></span>
      {/if}
      {#if item.index}
        <span class="dnd-filetile-index" title="Index"><Glyph name="sitemap" size="sm" /></span>
      {/if}
    </span>
    {#if !renaming}
      <span class="dnd-filetile-name">{item.name}</span>
    {/if}
  </button>

  {#if renaming}
    <input
      bind:this={field}
      bind:value={draft}
      class="dnd-filetile-rename"
      type="text"
      aria-label="Rename {item.name}"
      onclick={(event) => event.stopPropagation()}
      onkeydown={onKey}
      onblur={commit}
    />
  {/if}

  {#if selectable && !touch}
    <button
      type="button"
      class="dnd-filetile-tick"
      class:dnd-filetile-tick-on={selected}
      aria-pressed={selected}
      title={selected ? 'Deselect' : 'Select'}
      onclick={(event) => {
        event.stopPropagation()
        onpick?.(event)
      }}
    >
      <Glyph name="check" size="sm" />
    </button>
  {/if}

  {#if presence.length > 0}
    <span class="dnd-filetile-presence"><Presence users={presence} max={3} /></span>
  {/if}

  {#if thumbFailed}
    <span class="dnd-filetile-alert" title="The picture did not load"><Glyph name="trianglealert" size="sm" /></span>
  {/if}
  {#if item.reserved}
    <span class="dnd-filetile-reserved" class:dnd-filetile-reserved-shifted={thumbFailed} title="Reserved"><Glyph name="lock" size="sm" /></span>
  {/if}

  <span class="dnd-filetile-more">
    <IconBtn
      title="More"
      onclick={(event) => {
        event.stopPropagation()
        onmore?.(event)
      }}
    >
      <Glyph name="morevert" size="sm" />
    </IconBtn>
  </span>

  {#if showTags && shownTags.length > 0}
    <span class="dnd-filetile-tags">
      {#each shownTags as tag (tag)}<Chip still>#{tag}</Chip>{/each}
      {#if moreTags > 0}<Chip still>+{moreTags}</Chip>{/if}
    </span>
  {/if}
</div>

<style>
  .dnd-filetile {
    --filetile-light: var(--metal);
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5em;
    min-width: 0;
    padding: 1em 0.6667em;
    border-radius: var(--radius-md);
    transition: background 0.15s ease, box-shadow 0.15s ease, opacity 0.15s ease;
  }

  .dnd-filetile-dragging {
    opacity: 0.4;
  }

  .dnd-filetile-drop {
    background: color-mix(in srgb, var(--filetile-light) 12%, transparent);
    box-shadow: inset 0 0 0 var(--border-hair) var(--filetile-light), 0 0 12px color-mix(in srgb, var(--filetile-light) 35%, transparent);
  }

  .dnd-filetile-press {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5em;
    width: 100%;
    min-width: 0;
    padding: 0;
    border: none;
    background: none;
    color: inherit;
    font: inherit;
    cursor: pointer;
  }

  .dnd-filetile-press:focus-visible {
    outline: none;
  }

  .dnd-filetile-press:focus-visible .dnd-filetile-area {
    box-shadow: var(--focus-ring);
  }

  .dnd-filetile-area {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    width: calc(var(--fileexplorer-cell) * 8 / 15);
    aspect-ratio: 1;
    border-radius: var(--radius-md);
    background: radial-gradient(circle at 38% 26%, var(--ground-lift) 0%, var(--ground-deep) 84%);
    box-shadow: inset 0 0 0 var(--border-hair) var(--keyline), inset 0 0 14px var(--shade-hard), var(--shadow-sm);
    color: var(--filetile-light);
    transition: box-shadow 0.15s ease;
  }

  .dnd-filetile:hover .dnd-filetile-area,
  .dnd-filetile-selected .dnd-filetile-area {
    box-shadow:
      inset 0 0 0 var(--border-hair) var(--keyline),
      inset 0 0 14px var(--shade-hard),
      0 0 0 var(--border-hair) var(--keyline),
      0 0 0 calc(var(--border-hair) * 2) var(--filetile-light),
      0 0 16px color-mix(in srgb, var(--filetile-light) 40%, transparent);
  }

  .dnd-filetile-selected .dnd-filetile-area {
    box-shadow:
      inset 0 0 0 var(--border-hair) var(--keyline),
      inset 0 0 14px var(--shade-hard),
      0 0 0 var(--border-hair) var(--keyline),
      0 0 0 calc(var(--border-hair) * 2) var(--metal-bright),
      0 0 14px var(--ember-glow);
  }

  .dnd-filetile-glyph {
    display: flex;
    width: 68.75%;
    height: 68.75%;
    filter: drop-shadow(0 0 6px color-mix(in srgb, var(--filetile-light) 45%, transparent));
  }

  .dnd-filetile-folder .dnd-filetile-glyph {
    width: 75%;
    height: 75%;
  }

  .dnd-filetile-glyph :global(svg) {
    width: 100%;
    height: 100%;
  }

  .dnd-filetile-thumb {
    position: absolute;
    inset: 0;
    z-index: 0;
    display: block;
    overflow: hidden;
    border-radius: inherit;
    opacity: 0;
    transition: opacity 0.2s ease;
    pointer-events: none;
  }

  .dnd-filetile-thumb-drawn {
    opacity: 1;
  }

  .dnd-filetile-thumb :global(img) {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .dnd-filetile-wait {
    position: absolute;
    right: 0.4em;
    bottom: 0.4em;
    width: 1em;
    height: 1em;
    border: var(--border-hair) solid var(--metal-dim);
    border-top-color: var(--metal-bright);
    border-radius: var(--radius-pill);
    animation: dnd-spin 0.9s linear infinite;
  }

  .dnd-filetile-index {
    position: absolute;
    top: -0.5em;
    right: -0.5em;
    z-index: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 1.5em;
    height: 1.5em;
    border-radius: var(--radius-pill);
    background: var(--ground-deep);
    box-shadow: 0 0 0 var(--border-hair) var(--metal-dim);
    color: var(--filetile-light);
  }

  .dnd-filetile-tick {
    position: absolute;
    top: calc(1em - 0.5em);
    left: calc(50% - var(--fileexplorer-cell) * 4 / 15 - 0.5em);
    z-index: 2;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 1.5em;
    height: 1.5em;
    padding: 0;
    border: var(--border-hair) solid var(--metal-dim);
    border-radius: var(--radius-pill);
    background: var(--ground-deep);
    color: transparent;
    cursor: pointer;
    opacity: 0;
    transition: opacity 0.1s ease, border-color 0.1s ease, background 0.1s ease, color 0.1s ease;
  }

  .dnd-filetile:hover .dnd-filetile-tick,
  .dnd-filetile-tick:focus-visible {
    opacity: 1;
  }

  .dnd-filetile-tick:hover {
    border-color: var(--metal);
    color: var(--ink-faint);
  }

  .dnd-filetile-tick-on {
    border-color: var(--metal-bright);
    background: var(--metal);
    color: var(--ground-deep);
    opacity: 1;
  }

  .dnd-filetile-tick:focus-visible {
    outline: none;
    box-shadow: var(--focus-ring);
  }

  .dnd-filetile-presence {
    position: absolute;
    right: calc(50% - var(--fileexplorer-cell) * 4 / 15 - 0.3333em);
    top: calc(1em + var(--fileexplorer-cell) * 8 / 15 - 0.75em);
    z-index: 2;
    display: flex;
  }

  .dnd-filetile-alert,
  .dnd-filetile-reserved {
    position: absolute;
    top: 0.3333em;
    left: 0.3333em;
    z-index: 2;
    display: flex;
    color: var(--ink-faint);
  }

  .dnd-filetile-alert {
    color: var(--state-bad);
  }

  .dnd-filetile-reserved-shifted {
    left: 2em;
  }

  .dnd-filetile-more {
    position: absolute;
    top: 0.3333em;
    right: 0.3333em;
    z-index: 2;
    opacity: 0;
    transition: opacity 0.1s ease;
  }

  .dnd-filetile:hover .dnd-filetile-more,
  .dnd-filetile-more:focus-within {
    opacity: 1;
  }

  .dnd-filetile-name {
    display: -webkit-box;
    max-width: 100%;
    overflow: hidden;
    font-family: var(--font-display);
    font-size: var(--text-sm);
    font-weight: 600;
    line-height: 1.3;
    text-align: center;
    color: var(--metal-bright);
    text-shadow: 0 1px 0 var(--keyline);
    overflow-wrap: anywhere;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
  }

  .dnd-filetile-rename {
    width: 100%;
    min-width: 0;
    padding: 0.1667em 0.3333em;
    border: var(--border-hair) solid var(--metal);
    border-radius: var(--radius-sm);
    background: var(--ground-deep);
    color: var(--ink);
    font-family: var(--font-display);
    font-size: var(--text-sm);
    font-weight: 600;
    line-height: 1.3;
    text-align: center;
    outline: none;
    user-select: text;
  }

  .dnd-filetile-rename:focus-visible {
    box-shadow: var(--focus-ring);
  }

  .dnd-filetile-tags {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: center;
    gap: 0.3333em;
    max-width: 100%;
    opacity: 0;
    transition: opacity 0.1s ease;
  }

  .dnd-filetile:hover .dnd-filetile-tags,
  .dnd-filetile-selected .dnd-filetile-tags {
    opacity: 1;
  }

  @media (hover: none) {
    .dnd-filetile-more,
    .dnd-filetile-tags {
      opacity: 1;
    }
  }
</style>
