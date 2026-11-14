<script lang="ts" module>
  export type Pick = {
    id: string
    mark: string
    name: string
    /** The word written on the chip before the name. Falls back to the mark. */
    word?: string
    /** Which rim the chip carries. */
    tone?: 'group' | 'person' | 'thing'
  }
</script>

<script lang="ts">
  import Glyph from './Glyph.svelte'
  const {
    id,
    label,
    note,
    picked,
    options,
    onchange,
    free,
    more,
    onmore,
    moreWord = 'Add',
    placeholder = 'Type a name',
    disabled = false
  }: {
    /** Id of the text host the label points at. */
    id: string
    /** Written above the well. */
    label: string
    /** Guidance written under the label. */
    note?: string
    /** The chips in the well. */
    picked: Pick[]
    /** Everything the dropdown may offer; the picker filters it by the typed text. */
    options: Pick[]
    /** Runs with the new chips whenever one is added or removed. */
    onchange: (picked: Pick[]) => void
    /** When set, Enter or a comma on typed text that matches nothing makes a chip with this mark. */
    free?: string
    /** Says whether the typed text earns the extra row at the foot of the dropdown. */
    more?: (query: string) => boolean
    /** Runs when the extra row is chosen. */
    onmore?: (query: string) => void
    /** The word before the typed text on the extra row. */
    moreWord?: string
    /** The hint in an empty well. */
    placeholder?: string
    disabled?: boolean
  } = $props()

  let query = $state('')
  let open = $state(false)
  let at = $state(0)
  let host = $state<HTMLInputElement>()

  const asked = $derived(query.trim().toLowerCase())
  const found = $derived(
    options.filter(
      (entry) =>
        !picked.some((tag) => tag.mark === entry.mark && tag.id === entry.id) &&
        (!asked || entry.name.toLowerCase().includes(asked))
    )
  )
  const extra = $derived(Boolean(asked && more?.(asked)))
  const count = $derived(found.length + (extra ? 1 : 0))

  function take(tag: Pick) {
    onchange([...picked, tag])
    query = ''
    at = 0
  }

  function drop(tag: Pick) {
    onchange(picked.filter((entry) => !(entry.mark === tag.mark && entry.id === tag.id)))
  }

  function mint() {
    const name = query.trim().replace(/,+$/, '').trim()
    if (!free || !name) return
    const same = found.find((entry) => entry.name.toLowerCase() === name.toLowerCase())
    if (same) take(same)
    else if (!picked.some((entry) => entry.mark === free && entry.name.toLowerCase() === name.toLowerCase())) take({ id: name, mark: free, name })
    else query = ''
  }

  function step(event: KeyboardEvent) {
    if (event.key === 'ArrowDown' && count > 0) {
      event.preventDefault()
      open = true
      at = (at + 1) % count
    } else if (event.key === 'ArrowUp' && count > 0) {
      event.preventDefault()
      at = (at - 1 + count) % count
    } else if (event.key === 'Enter' || (event.key === ',' && free)) {
      event.preventDefault()
      if (at < found.length && found.length > 0 && (event.key === 'Enter' || !asked)) take(found[at])
      else if (extra && at === found.length) onmore?.(asked)
      else mint()
    } else if (event.key === 'Escape') {
      open = false
    } else if (event.key === 'Backspace' && query === '' && picked.length > 0) {
      onchange(picked.slice(0, -1))
    }
  }
</script>

<div class="dnd-picker">
  <label class="dnd-label dnd-picker-name" for={id}>{label}</label>
  {#if note}
    <p class="dnd-picker-note">{note}</p>
  {/if}

  <div class="dnd-picker-well" role="presentation" onclick={() => host?.focus()}>
    {#each picked as tag (tag.mark + tag.id)}
      <span class="dnd-picker-tag" class:dnd-picker-tag-group={tag.tone === 'group'} class:dnd-picker-tag-person={tag.tone === 'person'} class:dnd-picker-tag-thing={tag.tone === 'thing'}>
        <span class="dnd-picker-mark">{tag.word ?? tag.mark}</span>
        {tag.name}
        <button type="button" class="dnd-picker-drop" title="Remove" {disabled} onclick={() => drop(tag)}><Glyph name="close" size="sm" /></button>
      </span>
    {/each}
    <input
      {id}
      class="dnd-picker-host"
      type="text"
      autocomplete="off"
      placeholder={picked.length === 0 ? placeholder : ''}
      {disabled}
      bind:this={host}
      bind:value={query}
      onfocus={() => (open = true)}
      onblur={() => {
        open = false
        if (free) mint()
      }}
      oninput={() => {
        open = true
        at = 0
      }}
      onkeydown={step}
    />
  </div>

  {#if open && count > 0}
    <ul class="dnd-picker-menu" role="listbox">
      {#each found as entry, index (entry.mark + entry.id)}
        <li>
          <button
            type="button"
            class="dnd-picker-pick"
            class:dnd-picker-pick-on={index === at}
            role="option"
            aria-selected={index === at}
            onmousedown={(event) => event.preventDefault()}
            onclick={() => take(entry)}
          >
            <span class="dnd-picker-mark">{entry.word ?? entry.mark}</span>
            {entry.name}
          </button>
        </li>
      {/each}
      {#if extra}
        <li>
          <button
            type="button"
            class="dnd-picker-pick dnd-picker-pick-more"
            class:dnd-picker-pick-on={at === found.length}
            role="option"
            aria-selected={at === found.length}
            onmousedown={(event) => event.preventDefault()}
            onclick={() => onmore?.(asked)}
          >
            <span class="dnd-picker-mark">{moreWord.toLowerCase()}</span>
            {moreWord} {asked}
          </button>
        </li>
      {/if}
    </ul>
  {/if}
</div>

<style>
  .dnd-picker {
    position: relative;
    display: grid;
    gap: var(--space-2);
    min-width: 0;
  }

  .dnd-picker-name {
    margin: 0;
    color: var(--metal-bright);
    text-shadow: 0 1px 0 var(--shadow-ink);
  }

  .dnd-picker-note {
    margin: 0;
    font-size: var(--text-xs);
    color: var(--ink-faint);
  }

  .dnd-picker-well {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-1);
    min-height: var(--space-7);
    padding: var(--space-1) var(--space-2);
    border: var(--border-hair) solid var(--metal-dim);
    border-radius: var(--radius-sm);
    background: var(--texture-noise), linear-gradient(180deg, var(--ground-deep) 0%, var(--ground) 100%);
    box-shadow: var(--bevel-down), inset 0 3px 8px var(--shade-hard);
    cursor: text;
    transition: border-color 0.15s ease, box-shadow 0.15s ease;
  }

  .dnd-picker-well:hover {
    border-color: var(--metal);
  }

  .dnd-picker-well:focus-within {
    border-color: var(--metal-bright);
    box-shadow: var(--bevel-down), inset 0 3px 8px var(--shade-hard), var(--glow-metal);
  }

  .dnd-picker-tag {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    --tag-rim: var(--metal-dim);
    padding: 0 var(--space-1) 0 var(--space-2);
    border: var(--border-hair) solid var(--tag-rim);
    border-radius: var(--radius-sm);
    background:
      linear-gradient(180deg, color-mix(in srgb, var(--stone-light) 18%, transparent) 0%, color-mix(in srgb, var(--shadow-ink) 50%, transparent) 60%, color-mix(in srgb, var(--shadow-ink) 68%, transparent) 100%),
      var(--texture-noise),
      var(--stone);
    box-shadow: var(--bevel-up), 0 0 0 1px var(--keyline);
    font-size: var(--text-xs);
    color: var(--ink);
    text-shadow: 0 1px 0 var(--shadow-ink);
    white-space: nowrap;
  }

  .dnd-picker-tag-group {
    --tag-rim: var(--metal);
  }

  .dnd-picker-tag-person {
    --tag-rim: var(--verdigris);
  }

  .dnd-picker-tag-thing {
    --tag-rim: var(--ember);
  }

  .dnd-picker-mark {
    font-family: var(--font-display);
    font-size: var(--text-xs);
    letter-spacing: var(--tracking-wide);
    color: var(--metal);
  }

  .dnd-picker-drop {
    padding: 0 var(--space-1);
    border: none;
    background: none;
    font-size: var(--text-sm);
    line-height: 1;
    color: var(--ink-faint);
    cursor: pointer;
    transition: color 0.15s ease, text-shadow 0.15s ease;
  }

  .dnd-picker-drop:hover {
    color: var(--state-bad);
    text-shadow: 0 0 6px var(--state-bad);
  }

  .dnd-picker-host {
    flex: 1;
    min-width: calc(var(--space-8) * 1.5);
    padding: var(--space-1) 0;
    border: none;
    background: none;
    font: inherit;
    font-size: var(--text-sm);
    color: var(--ink);
  }

  .dnd-picker-host:focus-visible {
    outline: none;
    box-shadow: none;
  }

  .dnd-picker-host::placeholder {
    color: var(--ink-faint);
    font-style: italic;
  }

  .dnd-picker-menu {
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
    z-index: 2;
    display: flex;
    flex-direction: column;
    gap: var(--space-0);
    max-height: calc(var(--space-8) * 4);
    margin: var(--space-1) 0 0;
    padding: var(--space-2);
    list-style: none;
    overflow-y: auto;
    background: var(--texture-noise), linear-gradient(180deg, var(--ground-raised) 0%, var(--ground-deep) 100%);
    border: none;
    border-radius: var(--radius-sm);
    box-shadow: var(--rim-thin), inset 0 0 16px 2px var(--shade-hard), var(--shadow-lg);
  }

  .dnd-picker-pick {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    width: 100%;
    padding: var(--space-1) var(--space-2);
    border: none;
    border-radius: var(--radius-sm);
    background: none;
    box-shadow: inset 0 0 0 1px transparent;
    transition: background 0.12s ease, box-shadow 0.12s ease, color 0.12s ease;
    font-family: var(--font-body);
    font-size: var(--text-sm);
    text-align: start;
    color: var(--ink);
    cursor: pointer;
  }

  .dnd-picker-pick:hover {
    background: linear-gradient(90deg, color-mix(in srgb, var(--ember) 12%, transparent) 0%, transparent 90%);
    color: var(--metal-bright);
  }

  .dnd-picker-pick-on {
    background:
      linear-gradient(90deg, color-mix(in srgb, var(--ember) 20%, transparent) 0%, color-mix(in srgb, var(--ember) 6%, transparent) 100%),
      var(--ground-deep);
    box-shadow: inset 0 0 0 1px var(--metal), inset 0 0 10px var(--ember-glow);
    color: var(--metal-bright);
    text-shadow: 0 1px 0 var(--shadow-ink), 0 0 6px var(--ember-glow);
  }

  .dnd-picker-pick-more {
    margin-top: var(--space-1);
    border-top: var(--border-hair) solid var(--metal-dim);
    border-radius: 0;
    color: var(--ember-core);
  }
</style>
