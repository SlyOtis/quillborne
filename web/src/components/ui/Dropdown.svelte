<script lang="ts" module>
  export type DropdownOption = {
    value: string
    label: string
  }
</script>

<script lang="ts">
  import Glyph, { type GlyphName } from './Glyph.svelte'

  const {
    label,
    value,
    options,
    glyph,
    disabled = false,
    onchange
  }: {
    /** Reads as the accessible name and the native tooltip. */
    label: string
    /** Value of the chosen option. */
    value: string
    /** The options offered, in order. */
    options: DropdownOption[]
    /** The mark drawn before the chosen option's label. */
    glyph?: GlyphName
    /** Blocks the pick and dims the control. */
    disabled?: boolean
    /** Runs with the value of the option the reader picked. */
    onchange?: (value: string) => void
  } = $props()
</script>

<span class="dnd-dropdown" class:dnd-dropdown-disabled={disabled}>
  {#if glyph}<span class="dnd-dropdown-glyph"><Glyph name={glyph} size="sm" /></span>{/if}
  <select class="dnd-dropdown-pick" aria-label={label} title={label} {value} {disabled} onchange={(event) => onchange?.(event.currentTarget.value)}>
    {#each options as option (option.value)}
      <option value={option.value} selected={option.value === value}>{option.label}</option>
    {/each}
  </select>
  <span class="dnd-dropdown-chevron"><Glyph name="chevrondown" size="sm" /></span>
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

  .dnd-dropdown-disabled {
    opacity: 0.4;
    pointer-events: none;
  }
</style>
