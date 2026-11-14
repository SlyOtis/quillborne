<script lang="ts">
  import type {RulesState} from "$lib/rules/store";
  import SavingThrow from './SavingThrow.svelte'
  import {getContext} from "svelte";
  import type {Readable} from "svelte/store";

  const rules = getContext<Readable<RulesState>>('rules')

  const saves = $derived.by(() => {
    const resolved = $rules.resolved
    if (!resolved) return []
    return resolved.saves.map((save) => ({
      id: save.id,
      title: save.title,
      short: resolved.attributes.find((entry) => entry.id === save.attribute)?.short ?? save.title,
      modifier: save.value,
      proficient: save.multiplier > 0
    }))
  })
</script>

<div class="root dnd-panel dnd-keyline">
    <div class="saves">
        {#each saves as save (save.id)}
            <SavingThrow title={save.title} short={save.short} modifier={save.modifier} proficient={save.proficient}/>
        {/each}
    </div>
    <span class="dnd-caption">Saving Throws</span>
</div>

<style>
    .root {
        position: relative;
        gap: var(--space-2);
        display: flex;
        align-items: stretch;
        flex-direction: column;
        width: auto;
        height: auto;
        padding: var(--space-3);
        background: var(--texture-noise), linear-gradient(180deg, var(--ground-raised), var(--ground-deep));
        box-shadow: var(--rim-thin), inset 0 0 16px 2px var(--shade-hard), var(--shadow-md);
    }

    .saves {
        position: relative;
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(min(100%, 6.5rem), 1fr));
        gap: var(--space-2);
        width: auto;
        height: auto;
    }

    .root > .dnd-caption {
        margin: auto calc(var(--space-1) - var(--space-3)) calc(var(--space-1) - var(--space-3));
        padding: var(--space-1) var(--space-3);
        border-radius: 0 0 calc(var(--radius-lg) - var(--space-1)) calc(var(--radius-lg) - var(--space-1));
        background:
            linear-gradient(180deg, color-mix(in srgb, var(--stone-light) 20%, transparent) 0%, color-mix(in srgb, var(--shadow-ink) 45%, transparent) 60%, color-mix(in srgb, var(--shadow-ink) 65%, transparent) 100%),
            var(--texture-noise),
            var(--stone);
        box-shadow: var(--bevel-up), inset 0 1px 0 var(--metal-dim), inset 0 2px 0 var(--keyline);
        color: var(--metal-bright);
        text-shadow: 0 1px 0 var(--shadow-ink);
    }
</style>
