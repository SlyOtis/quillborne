<script lang="ts">
  import Glyph from './Glyph.svelte'
  import IconBtn from './IconBtn.svelte'

  const {
    stops,
    stop,
    onopen
  }: {
    /** Every place the bar can send the reader. */
    stops: readonly { id: string; label: string }[]
    /** The one the page is showing. */
    stop: string
    /** Runs with the stop the reader picked. */
    onopen: (stop: string) => void
  } = $props()

  let box = $state<HTMLElement>()
  let ghost = $state<HTMLElement>()
  let room = $state(0)
  let needed = $state(0)
  let open = $state(false)

  const tight = $derived(room > 0 && needed > room)
  const here = $derived(stops.find((entry) => entry.id === stop))

  function measure() {
    room = box?.clientWidth ?? 0
    needed = ghost?.scrollWidth ?? 0
  }

  $effect(() => {
    stops
    measure()
    document.fonts.ready.then(measure)
  })

  function pick(id: string) {
    open = false
    onopen(id)
  }

  function shut(event: KeyboardEvent) {
    if (event.key === 'Escape') open = false
  }
</script>

<svelte:window onkeydown={shut} onresize={measure} />

<div class="dnd-stops" bind:this={box}>
  <div class="dnd-stops-ghost" aria-hidden="true" bind:this={ghost}>
    {#each stops as entry (entry.id)}
      <span class="dnd-stops-stop">{entry.label}</span>
    {/each}
  </div>

  {#if tight}
    <IconBtn title="Sections" active={open} onclick={() => (open = !open)}>
      <Glyph name="menu" size="sm" />
    </IconBtn>
    <span class="dnd-stops-here">{here?.label ?? ''}</span>

    {#if open}
      <div class="dnd-stops-drop">
        {#each stops as entry (entry.id)}
          <button
            type="button"
            class="dnd-stops-stop dnd-stops-pick"
            class:dnd-stops-stop-on={entry.id === stop}
            aria-current={entry.id === stop ? 'page' : undefined}
            onclick={() => pick(entry.id)}
          >
            {entry.label}
          </button>
        {/each}
      </div>
    {/if}
  {:else}
    {#each stops as entry (entry.id)}
      <button
        type="button"
        class="dnd-stops-stop"
        class:dnd-stops-stop-on={entry.id === stop}
        aria-current={entry.id === stop ? 'page' : undefined}
        onclick={() => onopen(entry.id)}
      >
        {entry.label}
      </button>
    {/each}
  {/if}
</div>

<style>
  .dnd-stops {
    position: relative;
    display: flex;
    align-items: center;
    gap: var(--space-2);
    width: 100%;
    min-width: 0;
    height: 100%;
  }

  .dnd-stops-ghost {
    position: absolute;
    top: 0;
    left: 0;
    display: flex;
    gap: var(--space-2);
    visibility: hidden;
    pointer-events: none;
    white-space: nowrap;
  }

  .dnd-stops-stop {
    flex: none;
    padding: var(--space-1) var(--space-3);
    border: var(--border-hair) solid transparent;
    border-radius: var(--radius-sm);
    background: none;
    color: var(--metal);
    font-family: var(--font-display);
    font-size: var(--text-xs);
    font-weight: 700;
    letter-spacing: var(--tracking-caps);
    text-transform: uppercase;
    text-shadow: 0 1px 0 var(--shadow-ink);
    white-space: nowrap;
    cursor: pointer;
    transition: color 0.15s ease, text-shadow 0.15s ease, box-shadow 0.15s ease;
  }

  .dnd-stops-stop:hover {
    color: var(--metal-bright);
    text-shadow: var(--glow-text);
  }

  .dnd-stops-stop:active {
    filter: brightness(0.85);
  }

  .dnd-stops-stop-on {
    border-color: transparent;
    background:
      radial-gradient(ellipse 80% 90% at 50% 100%, var(--ember-glow) 0%, transparent 75%),
      linear-gradient(180deg, color-mix(in srgb, var(--stone-light) 20%, transparent) 0%, color-mix(in srgb, var(--shadow-ink) 45%, transparent) 60%, color-mix(in srgb, var(--shadow-ink) 65%, transparent) 100%),
      var(--texture-noise),
      var(--stone);
    box-shadow: var(--bevel-up), inset 0 0 0 1px var(--keyline), inset 0 0 0 2px var(--metal), inset 0 0 0 3px var(--keyline);
    color: var(--metal-bright);
    text-shadow: var(--glow-text);
  }

  .dnd-stops-stop:focus-visible {
    outline: none;
    box-shadow: var(--focus-ring);
  }

  .dnd-stops-here {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-family: var(--font-display);
    font-size: var(--text-xs);
    letter-spacing: var(--tracking-caps);
    text-transform: uppercase;
    color: var(--metal-bright);
    text-shadow: 0 1px 0 var(--shadow-ink), 0 0 6px var(--ember-glow);
  }

  .dnd-stops-drop {
    position: absolute;
    top: 100%;
    left: 0;
    z-index: 30;
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    min-width: calc(var(--space-8) * 2);
    padding: var(--space-2);
    background:
      var(--texture-noise),
      linear-gradient(180deg, var(--ground-raised) 0%, var(--ground-deep) 100%);
    border: none;
    border-radius: var(--radius-sm);
    box-shadow: var(--rim-thin), inset 0 0 16px 2px var(--shade-hard), var(--shadow-md);
  }

  .dnd-stops-pick {
    text-align: start;
  }
</style>
