<script lang="ts" module>
  export type DropdownOption = {
    value: string
    label: string
    /** Keeps the option as it is: it cannot be picked or dropped. */
    disabled?: boolean
  }
</script>

<script lang="ts">
  import { onMount } from 'svelte'
  import Glyph, { type GlyphName } from './Glyph.svelte'

  const {
    label,
    value = '',
    values,
    options,
    glyph,
    disabled = false,
    onchange,
    onpick
  }: {
    /** Reads as the accessible name and the native tooltip, and as the word on the button when several values are picked. */
    label: string
    /** Value of the chosen option. */
    value?: string
    /** Values of the chosen options; given, the dropdown picks several and opens a panel of checks. */
    values?: string[]
    /** The options offered, in order. */
    options: DropdownOption[]
    /** The mark drawn before the chosen option's label. */
    glyph?: GlyphName
    /** Blocks the pick and dims the control. */
    disabled?: boolean
    /** Runs with the value of the option the reader picked. */
    onchange?: (value: string) => void
    /** Runs with the values picked once a check is turned. */
    onpick?: (values: string[]) => void
  } = $props()

  let open = $state(false)
  let root = $state<HTMLElement>()
  let spot = $state({ top: 0, right: 0 })

  const many = $derived(values !== undefined)

  function turn(option: DropdownOption) {
    if (option.disabled) return
    const held = values ?? []
    onpick?.(held.includes(option.value) ? held.filter((one) => one !== option.value) : [...held, option.value])
  }

  function show() {
    if (open) {
      open = false
      return
    }
    const box = root?.getBoundingClientRect()
    spot = { top: (box?.bottom ?? 0) + 4, right: window.innerWidth - (box?.right ?? 0) }
    open = true
  }

  function onDocumentDown(event: PointerEvent) {
    if (!open) return
    if (root?.contains(event.target as Node)) return
    open = false
  }

  function onKey(event: KeyboardEvent) {
    if (event.key === 'Escape') open = false
  }

  onMount(() => {
    document.addEventListener('pointerdown', onDocumentDown)
    return () => document.removeEventListener('pointerdown', onDocumentDown)
  })
</script>

<svelte:window onkeydown={onKey} />

<span bind:this={root} class="dnd-dropdown" class:dnd-dropdown-disabled={disabled} class:dnd-dropdown-many={many}>
  {#if glyph}<span class="dnd-dropdown-glyph"><Glyph name={glyph} size="sm" /></span>{/if}
  {#if many}
    <button type="button" class="dnd-dropdown-pick" aria-label={label} title={label} aria-expanded={open} {disabled} onclick={show}>
      {label}
    </button>
  {:else}
    <select class="dnd-dropdown-pick" aria-label={label} title={label} {value} {disabled} onchange={(event) => onchange?.(event.currentTarget.value)}>
      {#each options as option (option.value)}
        <option value={option.value} selected={option.value === value} disabled={option.disabled}>{option.label}</option>
      {/each}
    </select>
  {/if}
  <span class="dnd-dropdown-chevron"><Glyph name="chevrondown" size="sm" /></span>
  {#if many && open}
    <div class="dnd-dropdown-panel" role="group" aria-label={label} style:top="{spot.top}px" style:right="{spot.right}px">
      {#each options as option (option.value)}
        <label class="dnd-dropdown-row" class:dnd-dropdown-row-held={option.disabled}>
          <input type="checkbox" checked={(values ?? []).includes(option.value)} disabled={option.disabled} onchange={() => turn(option)} />
          <span class="dnd-dropdown-row-label">{option.label}</span>
        </label>
      {/each}
    </div>
  {/if}
</span>

<style>
  .dnd-dropdown {
    position: relative;
    display: inline-flex;
    flex: none;
    align-items: center;
    gap: var(--space-1);
    min-width: 0;
    padding: 0 var(--space-1);
    border-radius: var(--radius-pill);
    color: var(--metal);
    transition: color 0.15s ease, background 0.15s ease;
  }

  .dnd-dropdown:hover {
    color: var(--metal-bright);
    background: color-mix(in srgb, var(--metal) 16%, transparent);
  }

  .dnd-dropdown-glyph,
  .dnd-dropdown-chevron {
    display: flex;
    flex: none;
    pointer-events: none;
  }

  .dnd-dropdown-pick {
    min-width: 0;
    padding: var(--space-1) 0;
    border: none;
    background: none;
    color: inherit;
    font-family: var(--font-display);
    font-size: var(--text-xs);
    font-weight: 700;
    letter-spacing: var(--tracking-caps);
    text-transform: uppercase;
    text-shadow: 0 1px 0 var(--shadow-ink);
    white-space: nowrap;
    cursor: pointer;
    appearance: none;
  }

  .dnd-dropdown-pick:focus-visible {
    outline: none;
  }

  .dnd-dropdown:has(.dnd-dropdown-pick:focus-visible) {
    box-shadow: var(--focus-ring);
  }

  .dnd-dropdown-pick option {
    background: var(--ground-deep);
    color: var(--ink);
    font-family: var(--font-body);
    text-transform: none;
    letter-spacing: normal;
  }

  .dnd-dropdown-panel {
    position: fixed;
    z-index: 30;
    display: grid;
    min-width: max-content;
    padding: var(--space-2);
    border-radius: var(--radius-sm);
    background: var(--texture-noise), linear-gradient(180deg, var(--ground-raised) 0%, var(--ground-deep) 100%);
    box-shadow: var(--rim-thin), inset 0 0 16px 2px var(--shade-hard), var(--shadow-lg);
    text-shadow: none;
  }

  .dnd-dropdown-row {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-1) var(--space-2);
    border-radius: var(--radius-sm);
    font-family: var(--font-body);
    font-size: var(--text-sm);
    color: var(--ink);
    cursor: pointer;
  }

  .dnd-dropdown-row:hover {
    background: linear-gradient(90deg, color-mix(in srgb, var(--ember) 14%, transparent) 0%, transparent 90%);
    color: var(--metal-bright);
  }

  .dnd-dropdown-row-held {
    color: var(--ink-faint);
    cursor: default;
  }

  .dnd-dropdown-row input {
    margin: 0;
  }

  .dnd-dropdown-row-label {
    white-space: nowrap;
  }

  .dnd-dropdown-disabled {
    opacity: 0.4;
    pointer-events: none;
  }
</style>
