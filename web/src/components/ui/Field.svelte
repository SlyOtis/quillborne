<script lang="ts">
  import type { Snippet } from 'svelte'

  const {
    label,
    help,
    error,
    valid = false,
    required = false,
    inline = false,
    id,
    children,
    action
  }: {
    /** Text shown above the control. */
    label: string
    /** Sets the label beside the control when the row has room, above it when it does not. */
    inline?: boolean
    /** Guidance shown under the control when there is no error. */
    help?: string
    /** Replaces the help line and marks the field as invalid. */
    error?: string
    /** Marks the field as accepted and lights the rim green. */
    valid?: boolean
    /** Adds the required marker after the label. */
    required?: boolean
    /** Id of the control this label points at. */
    id: string
    /** The control itself. */
    children?: Snippet
    /** A button set beside the control, on its row. */
    action?: Snippet
  } = $props()
</script>

<div
  class="dnd-field"
  class:dnd-field-inline={inline}
  class:dnd-field-invalid={Boolean(error)}
  class:dnd-field-valid={valid && !error}
>
  <label class="dnd-field-label" for={id}>
    {label}
    {#if required}<span class="dnd-field-required" aria-hidden="true">*</span>{/if}
  </label>

  <div class="dnd-field-row">
    <div class="dnd-field-well">
      {@render children?.()}
      <span class="dnd-field-mark" aria-hidden="true"></span>
    </div>
    {#if action}
      {@render action()}
    {/if}
  </div>

  {#if error}
    <p class="dnd-field-message dnd-field-error">{error}</p>
  {:else if help}
    <p class="dnd-field-message">{help}</p>
  {/if}
</div>

<style>
  .dnd-field {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    --field-rim: var(--metal-dim);
    --field-brace: var(--metal);
    --field-light: transparent;
    --field-line: color-mix(in srgb, var(--metal-edge) 55%, transparent);
    --field-cusp: 0.7rem;
  }

  .dnd-field-inline {
    flex-direction: row;
    flex-wrap: wrap;
    align-items: center;
  }

  .dnd-field-inline > .dnd-field-label {
    flex: none;
  }

  .dnd-field-inline > .dnd-field-row {
    flex: 1 1 8rem;
  }

  .dnd-field-inline > .dnd-field-message {
    flex-basis: 100%;
  }

  .dnd-field-label {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    font-family: var(--font-display);
    font-size: var(--text-xs);
    font-weight: 700;
    letter-spacing: var(--tracking-caps);
    text-transform: uppercase;
    color: var(--metal);
    text-shadow: 0 1px 0 var(--shadow-ink);
  }

  .dnd-field-label::before {
    content: '';
    flex: none;
    width: 0.34rem;
    height: 0.34rem;
    transform: rotate(45deg);
    border: var(--border-hair) solid var(--metal-dim);
    background: linear-gradient(135deg, var(--metal-bright), var(--metal-dim));
    box-shadow: 0 0 0 1px var(--keyline);
  }

  .dnd-field-required {
    color: var(--state-bad);
    margin-inline-start: var(--space-1);
  }

  .dnd-field-row {
    display: flex;
    align-items: stretch;
    gap: var(--space-2);
    min-width: 0;
  }

  .dnd-field-well {
    position: relative;
    display: flex;
    flex: 1;
    min-width: 0;
  }

  .dnd-field-well::before,
  .dnd-field-well::after {
    content: '';
    position: absolute;
    width: var(--field-cusp);
    height: var(--field-cusp);
    border: var(--border-hair) solid var(--field-brace);
    pointer-events: none;
    transition: border-color 0.15s ease;
  }

  .dnd-field-well::before {
    top: 0;
    left: 0;
    border-right: none;
    border-bottom: none;
    border-top-left-radius: var(--radius-md);
  }

  .dnd-field-well::after {
    right: 0;
    bottom: 0;
    border-left: none;
    border-top: none;
    border-bottom-right-radius: var(--radius-md);
  }

  .dnd-field-well:focus-within::before,
  .dnd-field-well:focus-within::after {
    border-color: var(--metal-bright);
  }

  .dnd-field-mark {
    position: absolute;
    top: 50%;
    right: var(--space-3);
    width: 0.56rem;
    height: 0.56rem;
    transform: translateY(-50%) rotate(45deg);
    border: var(--border-hair) solid var(--field-light);
    background: color-mix(in srgb, var(--field-light) 35%, transparent);
    box-shadow: 0 0 8px var(--field-light);
    pointer-events: none;
    transition: border-color 0.15s ease, background 0.15s ease;
  }

  .dnd-field-message {
    margin: 0;
    font-size: var(--text-xs);
    color: var(--ink-faint);
  }

  .dnd-field-error {
    color: var(--state-bad);
  }

  .dnd-field-valid {
    --field-rim: var(--state-good);
    --field-light: var(--state-good);
    --field-brace: var(--state-good);
    --field-line: color-mix(in srgb, var(--state-good) 45%, transparent);
  }

  .dnd-field-invalid {
    --field-rim: var(--state-bad);
    --field-light: var(--state-bad);
    --field-brace: var(--state-bad);
    --field-line: color-mix(in srgb, var(--state-bad) 45%, transparent);
  }

  .dnd-field :global(input),
  .dnd-field :global(textarea),
  .dnd-field :global(select) {
    width: 100%;
    padding: var(--space-3) var(--space-4);
    background: var(--texture-noise), linear-gradient(180deg, var(--ground-deep) 0%, var(--ground) 100%);
    border: var(--border-hair) solid var(--field-rim);
    border-radius: var(--radius-md);
    box-shadow:
      var(--bevel-down),
      inset 0 0 0 var(--border-hair) var(--keyline),
      inset 0 0 0 calc(var(--border-hair) * 2) var(--field-line),
      inset 0 3px 8px var(--shade-hard);
    color: var(--ink);
    font-family: var(--font-body);
    font-size: var(--text-sm);
    letter-spacing: var(--tracking-wide);
    transition: border-color 0.15s ease, box-shadow 0.15s ease;
  }

  .dnd-field :global(textarea) {
    resize: vertical;
    min-height: 6rem;
  }

  .dnd-field :global(input::placeholder),
  .dnd-field :global(textarea::placeholder) {
    color: var(--ink-faint);
  }

  .dnd-field :global(input:hover),
  .dnd-field :global(textarea:hover),
  .dnd-field :global(select:hover) {
    border-color: var(--metal);
  }

  .dnd-field :global(input:focus),
  .dnd-field :global(textarea:focus),
  .dnd-field :global(select:focus) {
    outline: none;
    border-color: var(--metal-bright);
    box-shadow:
      var(--bevel-down),
      inset 0 0 0 var(--border-hair) var(--keyline),
      inset 0 0 0 calc(var(--border-hair) * 2) var(--metal),
      inset 0 3px 8px var(--shade-hard),
      var(--glow-metal);
  }
</style>
