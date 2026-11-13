<script lang="ts">
  import { onMount } from 'svelte'
  import Glyph, { type GlyphName } from './Glyph.svelte'
  import IconBtn from './IconBtn.svelte'

  let {
    value = $bindable(''),
    placeholder = 'Search...',
    label = placeholder,
    disabled = false,
    glyph = 'search',
    autofocus = false,
    onsearch
  }: {
    /** Current query text, bindable; the input is fully controlled by it. */
    value?: string
    /** Placeholder text for the empty field. */
    placeholder?: string
    /** The accessible name of the field. */
    label?: string
    /** Disables the native input and dims it. */
    disabled?: boolean
    /** The glyph drawn at the start of the field. */
    glyph?: GlyphName
    /** Focuses the input on mount. */
    autofocus?: boolean
    /** Fires with the query text on every keystroke and on clear. */
    onsearch?: (value: string) => void
  } = $props()

  const ESCAPE_PAIR_MS = 400

  let lastEscape = 0
  let inputEl = $state<HTMLInputElement>()

  function emit(next: string) {
    value = next
    onsearch?.(next)
  }

  function onInput(event: Event) {
    lastEscape = 0
    emit((event.currentTarget as HTMLInputElement).value)
  }

  function clear() {
    emit('')
    inputEl?.focus()
  }

  function onKeydown(event: KeyboardEvent) {
    if (event.key !== 'Escape' || event.repeat) return
    const now = Date.now()
    const paired = now - lastEscape <= ESCAPE_PAIR_MS
    lastEscape = paired ? 0 : now
    if (!paired || !value) return
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

<div class="dnd-searchinput" class:dnd-searchinput-off={disabled}>
  <span class="dnd-searchinput-glyph"><Glyph name={glyph} size="sm" /></span>
  <input
    bind:this={inputEl}
    class="dnd-searchinput-field"
    type="text"
    {value}
    {placeholder}
    aria-label={label}
    {disabled}
    oninput={onInput}
    onkeydown={onKeydown}
  />
  {#if value}
    <IconBtn title="Clear" tone="ink" {disabled} onclick={clear}>
      <Glyph name="close" size="sm" />
    </IconBtn>
  {/if}
</div>

<style>
  .dnd-searchinput {
    position: relative;
    display: flex;
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
