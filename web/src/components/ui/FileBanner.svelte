<script lang="ts">
  import type { Snippet } from 'svelte'

  const {
    name,
    size,
    type,
    children
  }: {
    /** File name written in the banner, cut with an ellipsis when it overflows. */
    name: string
    /** Preformatted size written on the line under the name. */
    size?: string
    /** Readable type written on the line under the name. */
    type?: string
    /** The compact controls at the trailing end of the row. */
    children?: Snippet
  } = $props()
</script>

<div class="dnd-filebanner">
  <div class="dnd-filebanner-meta">
    <span class="dnd-filebanner-name">{name}</span>
    {#if size || type}
      <span class="dnd-filebanner-sub">{[type, size].filter(Boolean).join(' · ')}</span>
    {/if}
  </div>
  <div class="dnd-filebanner-actions">{@render children?.()}</div>
</div>

<style>
  .dnd-filebanner {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    min-width: 0;
    padding: var(--space-2) var(--space-3);
    background: var(--texture-noise), linear-gradient(180deg, var(--ground-raised) 0%, var(--ground-deep) 100%);
    box-shadow: inset 0 calc(var(--border-hair) * -1) 0 var(--metal-dim);
  }

  .dnd-filebanner-meta {
    display: flex;
    flex: 1;
    flex-direction: column;
    min-width: 0;
  }

  .dnd-filebanner-name {
    overflow: hidden;
    font-family: var(--font-display);
    font-size: var(--text-sm);
    font-weight: 600;
    color: var(--metal-bright);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .dnd-filebanner-sub {
    font-size: var(--text-xs);
    color: var(--ink-faint);
  }

  .dnd-filebanner-actions {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
  }
</style>
