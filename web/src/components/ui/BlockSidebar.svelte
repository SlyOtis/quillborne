<script lang="ts">
  import { BLOCK_COMMANDS, type Command } from './BlockEditor.svelte'
  import Glyph from './Glyph.svelte'
  import IconBtn from './IconBtn.svelte'

  const {
    commands = BLOCK_COMMANDS,
    onadd,
    ondrag,
    onclose
  }: {
    /** The blocks on offer, drawn under their group names. */
    commands?: Command[]
    /** Runs with the command when an item is pressed without travelling. */
    onadd?: (command: Command) => void
    /** Runs with the command once a press travels, so the host may begin a drag. */
    ondrag?: (command: Command) => void
    /** Runs when the collapse action is pressed. */
    onclose?: () => void
  } = $props()

  const THRESHOLD = 4

  const groups = $derived(
    [...new Set(commands.map((command) => command.group))].map((group) => ({
      group,
      commands: commands.filter((command) => command.group === group)
    }))
  )

  let start: { x: number; y: number; command: Command } | null = null
  let moved = false

  function press(event: PointerEvent, command: Command) {
    start = { x: event.clientX, y: event.clientY, command }
    moved = false
    document.addEventListener('pointermove', travel)
    document.addEventListener('pointerup', lift, { once: true })
  }

  function travel(event: PointerEvent) {
    if (!start || moved) return
    if (Math.hypot(event.clientX - start.x, event.clientY - start.y) <= THRESHOLD) return
    moved = true
    ondrag?.(start.command)
  }

  function lift() {
    document.removeEventListener('pointermove', travel)
    start = null
  }

  function choose(command: Command) {
    if (moved) {
      moved = false
      return
    }
    onadd?.(command)
  }
</script>

<div class="dnd-blocks">
  <header class="dnd-blocks-head">
    <span class="dnd-label dnd-blocks-name">Blocks</span>
    <IconBtn title="Collapse" onclick={() => onclose?.()}>
      <Glyph name="forward" size="sm" />
    </IconBtn>
  </header>

  <div class="dnd-blocks-groups">
    {#each groups as held (held.group)}
      <section class="dnd-blocks-group">
        <h3 class="dnd-label dnd-blocks-group-name">{held.group}</h3>
        {#each held.commands as command (command.title)}
          <button
            type="button"
            class="dnd-blocks-item"
            onpointerdown={(event) => press(event, command)}
            onclick={() => choose(command)}
          >
            <span class="dnd-blocks-item-mark">
              {#if command.icon}<Glyph name={command.icon} size="sm" />{:else}{command.mark}{/if}
            </span>
            <span class="dnd-blocks-item-text">
              <span class="dnd-blocks-item-title">{command.title}</span>
              {#if command.description}
                <span class="dnd-blocks-item-desc">{command.description}</span>
              {/if}
            </span>
          </button>
        {/each}
      </section>
    {/each}
  </div>
</div>

<style>
  .dnd-blocks {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-width: 0;
    overflow: hidden;
    border-inline-start: none;
    background: var(--texture-noise), linear-gradient(180deg, var(--ground-raised) 0%, var(--ground-deep) 100%);
    box-shadow: inset 1px 0 0 var(--keyline), inset 2px 0 0 var(--metal), inset 3px 0 0 var(--keyline), inset 0 0 16px 2px var(--shade-hard);
  }

  .dnd-blocks-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-2) var(--space-2) var(--space-4);
    border-bottom: none;
    background:
      linear-gradient(180deg, color-mix(in srgb, var(--stone-light) 20%, transparent) 0%, color-mix(in srgb, var(--shadow-ink) 45%, transparent) 60%, color-mix(in srgb, var(--shadow-ink) 65%, transparent) 100%),
      var(--texture-noise),
      var(--stone);
    box-shadow: var(--bevel-up), inset 0 -1px 0 var(--keyline), 0 1px 0 var(--metal-dim), 0 2px 0 var(--metal), 0 3px 0 var(--keyline), 0 5px 8px var(--shade);
    position: relative;
    z-index: 1;
    margin-inline-start: 0.1875rem;
  }

  .dnd-blocks-name {
    color: var(--metal-bright);
    text-shadow: 0 1px 0 var(--shadow-ink);
  }

  .dnd-blocks-groups {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    flex: 1;
    min-height: 0;
    padding: var(--space-2);
    overflow-y: auto;
    scrollbar-width: thin;
  }

  .dnd-blocks-group {
    display: flex;
    flex-direction: column;
    gap: var(--space-0);
  }

  .dnd-blocks-group-name {
    margin: 0 0 var(--space-1);
    padding-inline: var(--space-2);
    color: var(--metal);
    text-shadow: 0 1px 0 var(--shadow-ink);
  }

  .dnd-blocks-item {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    width: 100%;
    padding: var(--space-1) var(--space-2);
    border: none;
    border-radius: var(--radius-sm);
    background: none;
    text-align: start;
    color: var(--ink-dim);
    cursor: grab;
    touch-action: none;
    transition: background 0.1s ease, color 0.1s ease;
  }

  .dnd-blocks-item:hover {
    background: linear-gradient(90deg, color-mix(in srgb, var(--ember) 14%, transparent) 0%, transparent 90%);
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--metal-dim) 70%, transparent);
    color: var(--metal-bright);
  }

  .dnd-blocks-item:active {
    cursor: grabbing;
    filter: brightness(0.85);
  }

  .dnd-blocks-item:focus-visible {
    outline: none;
    box-shadow: var(--focus-ring);
  }

  .dnd-blocks-item-mark {
    display: flex;
    flex: none;
    align-items: center;
    justify-content: center;
    width: var(--space-5);
    font-family: var(--font-figures);
    font-size: var(--text-xs);
    color: var(--metal);
    text-shadow: 0 1px 0 var(--shadow-ink);
  }

  .dnd-blocks-item-text {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }

  .dnd-blocks-item-title {
    font-size: var(--text-sm);
    color: inherit;
  }

  .dnd-blocks-item-desc {
    font-size: var(--text-xs);
    color: var(--ink-faint);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>
