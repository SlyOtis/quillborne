<script lang="ts">
  import {getContext} from "svelte";
  import type {CharacterContext} from "$lib/types";
  import {putSlots} from "$lib/engine";
  import Sigil from "$components/ui/Sigil.svelte";
  import Ornament from "$components/ui/Ornament.svelte";

  let {level}: {
    /** The spell slot level drawn; without one the character's own slot pool is drawn. */
    level?: number
  } = $props()

  const {info} = getContext<CharacterContext>('character')

  const title = $derived(level === undefined ? $info.slots?.title ?? 'Slots' : `Level ${level}`)
  const max = $derived(level === undefined ? $info.slots?.amount ?? 0 : $info.spells?.slots?.[level] ?? 0)
  const spent = $derived(level === undefined ? $info.slots?.expended ?? 0 : $info.spells?.expended?.[level] ?? 0)
  const left = $derived(Math.max(0, max - spent))

  function togglePip(index: number) {
    const next = index < left ? index : index + 1
    putSlots(max - next, level)
  }
</script>

{#if max > 0}
    <div class="dnd-slots">
        <span class="dnd-slots-title">{title}</span>
        <span class="dnd-slots-pips">
            {#each Array.from({length: max}, (_, i) => i) as index (index)}
                <Sigil
                    frame="ring"
                    size="sm"
                    tone="arcane"
                    active={index < left}
                    title="{index < left ? 'Spend' : 'Restore'} {title} slot {index + 1}"
                    onclick={() => togglePip(index)}
                >
                    <Ornament name="quatrefoil" size="xs" tone={index < left ? 'ember' : 'ink'} />
                </Sigil>
            {/each}
        </span>
        <span class="dnd-slots-count">{left}/{max}</span>
    </div>
{/if}

<style>
    .dnd-slots {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: var(--space-2);
        min-width: 0;
    }

    .dnd-slots-title {
        font-family: var(--font-display);
        font-size: var(--text-xs);
        font-weight: 700;
        letter-spacing: var(--tracking-caps);
        text-transform: uppercase;
        color: var(--metal);
        text-shadow: 0 1px 0 var(--shadow-ink);
        white-space: nowrap;
    }

    .dnd-slots-pips {
        display: flex;
        flex-wrap: wrap;
        gap: var(--space-1);
        min-width: 0;
    }

    .dnd-slots-count {
        font-family: var(--font-figures);
        font-size: var(--text-sm);
        font-weight: 700;
        font-variant-numeric: lining-nums tabular-nums;
        color: var(--metal-bright);
        text-shadow: 0 1px 0 var(--shadow-ink);
    }
</style>
