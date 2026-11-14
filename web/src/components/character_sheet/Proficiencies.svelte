<script lang="ts">
  import type {CharacterContext} from "$lib/types";
  import {getContext} from "svelte";

  const {proficients} = getContext<CharacterContext>('character')

</script>

<div class="root dnd-panel dnd-keyline">
    <div class="proficients">
        {#each $proficients as proficiency}
            <span class="title">
                {proficiency.title}
            </span>
            <span class="proficiency">{proficiency.value.join(', ')}</span>
        {/each}
    </div>
    <span class="dnd-caption">Proficients</span>
</div>

<style>
    .root {
        position: relative;
        gap: var(--space-3);
        display: flex;
        height: 100%;
        width: auto;
        min-height: 100%;
        justify-content: flex-start;
        align-items: center;
        flex-direction: column;
        padding: var(--space-3);
        background: var(--texture-noise), linear-gradient(180deg, var(--ground-raised), var(--ground-deep));
        box-shadow: var(--rim-thin), inset 0 0 16px 2px var(--shade-hard), var(--shadow-md);
    }

    .proficients {
        position: relative;
        display: flex;
        justify-content: center;
        align-items: flex-start;
        flex-direction: column;
        gap: var(--space-1);
        width: 100%;
        height: 100%;
        min-width: 0;
    }

    .title {
        position: relative;
        font-family: var(--font-display);
        font-size: var(--text-xs);
        font-weight: 700;
        letter-spacing: var(--tracking-caps);
        text-transform: uppercase;
        color: var(--metal);
        text-shadow: 0 1px 0 #000;
    }

    .proficiency {
        min-width: 0;
        padding-bottom: var(--space-2);
        font-size: var(--text-sm);
        color: var(--ink);
        overflow-wrap: anywhere;
    }

    .root > .dnd-caption {
        align-self: stretch;
        margin: auto calc(var(--space-1) - var(--space-3)) calc(var(--space-1) - var(--space-3));
        padding: var(--space-1) var(--space-3);
        border-radius: 0 0 calc(var(--radius-lg) - var(--space-1)) calc(var(--radius-lg) - var(--space-1));
        background:
            linear-gradient(180deg, color-mix(in srgb, var(--stone-light) 20%, transparent) 0%, color-mix(in srgb, #000 45%, transparent) 60%, color-mix(in srgb, #000 65%, transparent) 100%),
            var(--texture-noise),
            var(--stone);
        box-shadow: var(--bevel-up), inset 0 1px 0 var(--metal-dim), inset 0 2px 0 var(--keyline);
        color: var(--metal-bright);
        text-shadow: 0 1px 0 #000;
    }
</style>
