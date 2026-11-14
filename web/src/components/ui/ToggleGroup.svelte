<script lang="ts">
  import type { Snippet } from 'svelte'

  const {
    label,
    side = 'start',
    actions,
    children
  }: {
    /** The accessible name of the group. */
    label: string
    /** Side the actions strip attaches to; `start` keeps the toggles at the end of the group. */
    side?: 'start' | 'end'
    /** The controls fused to the toggles on `side`, `IconBtn`s drawn in the group's own design. */
    actions?: Snippet
    /** The toggles, each an `IconBtn` carrying its own `active` state. */
    children?: Snippet
  } = $props()
</script>

<div class="dnd-togglegroup dnd-togglegroup-{side}" role="group" aria-label={label}>
  {#if actions}
    <div class="dnd-togglegroup-acts">{@render actions()}</div>
  {/if}
  {#if children}
    <div class="dnd-togglegroup-toggle">{@render children()}</div>
  {/if}
</div>

<style>
  .dnd-togglegroup {
    --togglegroup-radius: var(--radius-sm);
    --togglegroup-line: color-mix(in srgb, var(--metal) 55%, var(--metal-dim));
    display: flex;
    align-items: stretch;
    min-width: 0;
  }

  .dnd-togglegroup-acts {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    min-width: 0;
    padding: 0 var(--space-1);
    background: var(--texture-noise), linear-gradient(180deg, var(--ground-deep) 0%, var(--ground) 100%);
    border: var(--border-hair) solid var(--togglegroup-line);
    border-radius: var(--togglegroup-radius);
    box-shadow: var(--bevel-down);
    color: var(--ink);
  }

  .dnd-togglegroup-toggle {
    position: relative;
    z-index: 1;
    display: flex;
    flex: none;
    overflow: hidden;
    border: var(--border-hair) solid var(--togglegroup-line);
    border-radius: var(--togglegroup-radius);
    background: var(--texture-noise), linear-gradient(180deg, var(--ground-deep) 0%, var(--ground) 100%);
    box-shadow: var(--bevel-down);
  }

  .dnd-togglegroup-acts:has(+ .dnd-togglegroup-toggle) {
    border-inline-end: none;
    border-start-end-radius: 0;
    border-end-end-radius: 0;
    padding-inline-end: calc(var(--togglegroup-radius) + var(--space-1));
    margin-inline-end: calc(var(--togglegroup-radius) * -1);
  }

  .dnd-togglegroup-end .dnd-togglegroup-acts {
    order: 1;
  }

  .dnd-togglegroup-end .dnd-togglegroup-acts:has(+ .dnd-togglegroup-toggle) {
    border-inline-end: var(--border-hair) solid var(--togglegroup-line);
    border-inline-start: none;
    border-radius: var(--togglegroup-radius);
    border-start-start-radius: 0;
    border-end-start-radius: 0;
    padding-inline: calc(var(--togglegroup-radius) + var(--space-1)) var(--space-1);
    margin-inline: calc(var(--togglegroup-radius) * -1) 0;
  }

  .dnd-togglegroup-toggle > :global(.dnd-iconbtn),
  .dnd-togglegroup-acts > :global(.dnd-iconbtn) {
    inline-size: auto;
    block-size: auto;
    padding: var(--space-1) var(--space-2);
    border-radius: 0;
  }

  .dnd-togglegroup-acts > :global(.dnd-iconbtn) {
    border-radius: calc(var(--togglegroup-radius) - var(--border-hair));
  }

  .dnd-togglegroup-toggle > :global(.dnd-iconbtn + .dnd-iconbtn) {
    border-inline-start: var(--border-hair) solid color-mix(in srgb, var(--metal-dim) 60%, transparent);
  }

  .dnd-togglegroup-toggle > :global(.dnd-iconbtn > svg),
  .dnd-togglegroup-acts > :global(.dnd-iconbtn > svg) {
    inline-size: 1em;
    block-size: 1em;
  }

  .dnd-togglegroup-toggle > :global(.dnd-iconbtn.dnd-iconbtn-on),
  .dnd-togglegroup-acts > :global(.dnd-iconbtn.dnd-iconbtn-on) {
    background: color-mix(in srgb, var(--metal) 18%, transparent);
    color: var(--metal-bright);
    box-shadow: none;
    text-shadow: var(--glow-text);
  }

  .dnd-togglegroup-toggle > :global(.dnd-iconbtn:focus-visible),
  .dnd-togglegroup-acts > :global(.dnd-iconbtn:focus-visible) {
    box-shadow: inset 0 0 0 2px var(--metal-bright);
  }
</style>
