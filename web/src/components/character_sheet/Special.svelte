<script lang="ts">
  import type {CharacterContext} from "$lib/types";
  import {getContext} from "svelte";
  import Ornament from "$components/ui/Ornament.svelte";
  import IconBtn from "$components/ui/IconBtn.svelte";

  const {special} = getContext<CharacterContext>('character')

  function togglePoint(index: number) {
    special.update(curr => {
      const newCurrent = index < curr.current ? index : index + 1;
      return {
        ...curr,
        current: Math.max(0, Math.min(curr.max, newCurrent))
      };
    });
  }
</script>

<div class="pool">
  <header class="pool-head">
    <span class="pool-title">
      <span class="dnd-label">{$special.name}</span>
      <span class="pool-regain">{$special.regain}</span>
    </span>
    <span class="pool-count">{$special.current}<span class="pool-slash">/</span>{$special.max}</span>
  </header>

  <div class="pool-pips">
    {#each Array.from({ length: $special.max }, (_, i) => i) as index (index)}
      <IconBtn
        tone="ember"
        active={index < $special.current}
        title={`Toggle ${$special.name} point ${index + 1}`}
        onclick={() => togglePoint(index)}
      >
        <Ornament name="quatrefoil" size="xs" tone={index >= $special.current ? 'ink' : 'ember'} />
      </IconBtn>
    {/each}
  </div>
</div>

<style>
  .pool {
    position: relative;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    gap: var(--space-3);
    padding: var(--space-1) var(--space-2);
    min-width: 0;
  }

  .pool-head {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: var(--space-3);
    padding-bottom: var(--space-2);
    border-bottom: var(--border-hair) solid color-mix(in srgb, var(--metal-dim) 70%, transparent);
  }

  .pool-title {
    display: flex;
    flex-direction: column;
    gap: var(--space-0);
    min-width: 0;
  }

  .pool-regain {
    font-size: var(--text-xs);
    font-style: italic;
    color: var(--ink-faint);
  }

  .pool-count {
    font-family: var(--font-figures);
    font-size: var(--text-lg);
    font-weight: 700;
    font-variant-numeric: lining-nums tabular-nums;
    color: var(--metal-bright);
    text-shadow: 0 1px 0 #000, 0 0 0.6rem var(--ember-glow);
  }

  .pool-slash {
    color: var(--ink-faint);
    padding: 0 var(--space-0);
  }

  .pool-pips {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: flex-start;
    gap: var(--space-2);
    min-width: 0;
  }

</style>
