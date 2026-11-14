<script lang="ts">
  import { onMount } from 'svelte'
  import Glyph, { type GlyphName } from './Glyph.svelte'
  import IconBtn from './IconBtn.svelte'
  import Chip from './Chip.svelte'

  let {
    value = $bindable(''),
    tags = $bindable([]),
    options = [],
    placeholder = 'Search...',
    label = placeholder,
    variant = 'well',
    disabled = false,
    glyph = 'search',
    autofocus = false,
    onsearch,
    ontags
  }: {
    /** Current query text, bindable; the input is fully controlled by it. */
    value?: string
    /** The hash tags held inside the field before the text, bindable; a `#` typed in the text offers `options` to add one. */
    tags?: string[]
    /** The tags a `#` typed in the field offers. */
    options?: string[]
    /** Placeholder text for the empty field. */
    placeholder?: string
    /** The accessible name of the field. */
    label?: string
    /** `well` is the rimmed rounded field; `band` runs edge to edge, square, on a solid ground with one hairline below. */
    variant?: 'well' | 'band'
    /** Disables the native input and dims it. */
    disabled?: boolean
    /** The glyph drawn at the start of the field. */
    glyph?: GlyphName
    /** Focuses the input on mount. */
    autofocus?: boolean
    /** Fires with the query text on every keystroke and on clear. */
    onsearch?: (value: string) => void
    /** Fires with the tags whenever one is added or removed. */
    ontags?: (tags: string[]) => void
  } = $props()

  const ESCAPE_PAIR_MS = 400
  const menuId = $props.id()

  let lastEscape = 0
  let inputEl = $state<HTMLInputElement>()
  let at = $state(0)

  const token = $derived.by(() => {
    const cut = value.lastIndexOf('#')
    if (cut < 0 || /\s/.test(value.slice(cut))) return null
    return value.slice(cut + 1).toLowerCase()
  })
  const offered = $derived(token === null ? [] : options.filter((one) => !tags.includes(one) && one.toLowerCase().includes(token)))
  const pick = $derived(Math.min(at, Math.max(0, offered.length - 1)))

  function emit(next: string) {
    value = next
    onsearch?.(next)
  }

  function putTags(next: string[]) {
    tags = next
    ontags?.(next)
  }

  function addTag(tag: string) {
    putTags([...tags, tag])
    emit(value.slice(0, value.lastIndexOf('#')).trimEnd())
    inputEl?.focus()
  }

  function removeTag(tag: string) {
    putTags(tags.filter((one) => one !== tag))
  }

  function onInput(event: Event) {
    lastEscape = 0
    at = 0
    emit((event.currentTarget as HTMLInputElement).value)
  }

  function clear() {
    emit('')
    if (tags.length > 0) putTags([])
    inputEl?.focus()
  }

  function onKeydown(event: KeyboardEvent) {
    if (event.key === 'Backspace' && !value && tags.length > 0) {
      event.preventDefault()
      removeTag(tags[tags.length - 1])
      return
    }
    if (offered.length > 0 && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
      event.preventDefault()
      at = (pick + (event.key === 'ArrowDown' ? 1 : offered.length - 1)) % offered.length
      return
    }
    if (offered.length > 0 && event.key === 'Enter') {
      event.preventDefault()
      addTag(offered[pick])
      return
    }
    if (event.key !== 'Escape' || event.repeat) return
    const now = Date.now()
    const paired = now - lastEscape <= ESCAPE_PAIR_MS
    lastEscape = paired ? 0 : now
    if (!paired || (!value && tags.length === 0)) return
    event.preventDefault()
    clear()
  }

  export function focus() {
    inputEl?.focus()
  }

  onMount(() => {
    if (!autofocus || !inputEl) return
    inputEl.focus()
    inputEl.setSelectionRange(value.length, value.length)
  })
</script>

<div class="dnd-searchinput dnd-searchinput-{variant}" class:dnd-searchinput-off={disabled} class:dnd-searchinput-tagged={tags.length > 0}>
  <span class="dnd-searchinput-glyph"><Glyph name={glyph} size="sm" /></span>
  {#each tags as tag (tag)}
    <Chip glyph="tag" on onclick={() => removeTag(tag)}>#{tag}</Chip>
  {/each}
  <input
    bind:this={inputEl}
    class="dnd-searchinput-field"
    type="text"
    role="combobox"
    aria-autocomplete="list"
    aria-expanded={offered.length > 0}
    aria-controls={menuId}
    {value}
    placeholder={tags.length > 0 ? '' : placeholder}
    aria-label={label}
    {disabled}
    oninput={onInput}
    onkeydown={onKeydown}
  />
  {#if value || tags.length > 0}
    <IconBtn title="Clear" tone="ink" {disabled} onclick={clear}>
      <Glyph name="close" size="sm" />
    </IconBtn>
  {/if}
  {#if offered.length > 0}
    <ul class="dnd-searchinput-menu" id={menuId} role="listbox" aria-label="Tags">
      {#each offered as one, index (one)}
        <li>
          <button
            type="button"
            class="dnd-searchinput-option"
            class:dnd-searchinput-option-on={index === pick}
            role="option"
            aria-selected={index === pick}
            onmousedown={(event) => event.preventDefault()}
            onclick={() => addTag(one)}
          >
            <Glyph name="tag" size="sm" />
            #{one}
          </button>
        </li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  .dnd-searchinput {
    position: relative;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-1);
    width: 100%;
    min-width: 0;
    padding: 0 var(--space-2);
    background: var(--texture-noise), linear-gradient(180deg, var(--ground-deep) 0%, var(--ground) 100%);
    border: var(--border-hair) solid color-mix(in srgb, var(--metal) 55%, var(--metal-dim));
    border-radius: var(--radius-md);
    box-shadow: var(--bevel-down);
    color: var(--ink);
    transition: border-color 0.2s cubic-bezier(0.32, 0.72, 0, 1), box-shadow 0.2s cubic-bezier(0.32, 0.72, 0, 1);
  }

  .dnd-searchinput:hover:not(:focus-within):not(.dnd-searchinput-off) {
    border-color: var(--metal);
  }

  .dnd-searchinput:focus-within {
    border-color: var(--metal);
    box-shadow: var(--bevel-down), var(--glow-metal);
  }

  .dnd-searchinput-tagged {
    padding-block: var(--space-1);
  }

  .dnd-searchinput-band {
    padding: 0 var(--space-4);
    background: var(--ground-deep);
    border: none;
    border-bottom: var(--border-hair) solid color-mix(in srgb, var(--metal-dim) 80%, transparent);
    border-radius: 0;
    box-shadow: none;
  }

  .dnd-searchinput-band:focus-within {
    border-color: var(--metal);
    box-shadow: none;
  }

  .dnd-searchinput-menu {
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
    border-radius: var(--radius-sm);
    box-shadow: var(--rim-thin), var(--shadow-md);
  }

  .dnd-searchinput-option {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    width: 100%;
    padding: var(--space-1) var(--space-2);
    border: none;
    border-radius: var(--radius-sm);
    background: none;
    font-family: var(--font-display);
    font-size: var(--text-xs);
    letter-spacing: var(--tracking-wide);
    text-align: start;
    color: var(--ink-dim);
    cursor: pointer;
  }

  .dnd-searchinput-option > :global(svg) {
    flex: none;
    color: var(--metal);
  }

  .dnd-searchinput-option:hover,
  .dnd-searchinput-option-on {
    background: color-mix(in srgb, var(--metal) 16%, transparent);
    color: var(--metal-bright);
  }

  .dnd-searchinput-off {
    opacity: 0.55;
    box-shadow: none;
    cursor: not-allowed;
  }

  .dnd-searchinput-glyph {
    display: flex;
    flex: none;
    color: var(--ink-faint);
    pointer-events: none;
  }

  .dnd-searchinput-field {
    flex: 1 1 4em;
    min-width: 0;
    padding: var(--space-2) 0;
    border: none;
    border-radius: 0;
    background: transparent;
    box-shadow: none;
    font-family: var(--font-body);
    font-size: var(--text-xs);
    line-height: 1.4;
    color: inherit;
    caret-color: var(--metal);
  }

  .dnd-searchinput-field::placeholder {
    color: var(--ink-faint);
  }

  .dnd-searchinput-field:focus {
    outline: none;
    box-shadow: none;
  }

  .dnd-searchinput-field:disabled {
    cursor: not-allowed;
  }

  @media (prefers-reduced-motion: reduce) {
    .dnd-searchinput {
      transition: none;
    }
  }
</style>
