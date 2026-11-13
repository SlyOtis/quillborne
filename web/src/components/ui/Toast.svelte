<script lang="ts">
  import { deleteNotice, notices } from '$lib/stores/ui.store'
  import Button from './Button.svelte'
  import Ornament from './Ornament.svelte'
</script>

{#if $notices.length}
  <div class="dnd-toasts">
    {#each $notices as notice (notice.id)}
      <div class="dnd-toast" role="alert">
        <span class="dnd-toast-mark"><Ornament name="skull" size="sm" tone="ember" /></span>
        <p class="dnd-toast-text">{notice.text}</p>
        <Button variant="ghost" size="sm" onclick={() => deleteNotice(notice.id)}>Dismiss</Button>
      </div>
    {/each}
  </div>
{/if}

<style>
  .dnd-toasts {
    position: fixed;
    inset-inline-end: var(--space-5);
    inset-block-end: var(--space-5);
    z-index: 1000;
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    width: min(28rem, calc(100vw - var(--space-5) * 2));
  }

  .dnd-toast {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-3) var(--space-4);
    border: var(--border-hair) solid color-mix(in srgb, var(--state-bad) 55%, transparent);
    border-radius: var(--radius-sm);
    background:
      linear-gradient(180deg, color-mix(in srgb, var(--state-bad) 22%, transparent), color-mix(in srgb, var(--state-bad) 6%, transparent)),
      var(--texture-noise),
      var(--ground-deep);
    box-shadow: var(--bevel-down), var(--shadow-lg);
  }

  .dnd-toast-mark {
    display: flex;
    flex: none;
  }

  .dnd-toast-text {
    flex: 1;
    min-width: 0;
    margin: 0;
    font-size: var(--text-sm);
    color: var(--ink);
    overflow-wrap: anywhere;
  }
</style>
