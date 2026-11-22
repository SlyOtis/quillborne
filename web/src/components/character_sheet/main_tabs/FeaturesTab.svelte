<script lang="ts">
  import {getContext} from "svelte";
  import type {Readable} from "svelte/store";
  import type {CharacterContext} from "$lib/types";
  import type {RulesState} from "$lib/rules/store";
  import {getSkillId} from "$lib/rules/sheet";
  import Marked from "$components/Marked.svelte";
  import Special from "../Special.svelte";

  const {feats, special, senses} = getContext<CharacterContext>('character')
  const rules = getContext<Readable<RulesState>>('rules')

  let orderFeats = $derived([...$feats].sort((a, b) => a.level - b.level));

  const ranged = $derived(($rules.resolved?.senses ?? [])
    .filter((sense) => sense.unit && sense.value > 0)
    .map((sense) => ({...sense, condition: $senses.find((one) => getSkillId(one.title) === sense.id)?.condition})))
</script>

<div class="root">
    <div class="scroll">
        {#if $special.max > 0}
            <Special/>
        {/if}
        <ul>
            {#each ranged as sense (sense.id)}
                <li class="feat">
                    <h4>{sense.title} - <i>{sense.value} {sense.unit}</i></h4>
                    {#if sense.condition}<Marked content={sense.condition} />{/if}
                </li>
            {/each}
            {#each orderFeats as feat}
                <li class="feat">
                    <h4>{feat.title} - <i>lvl {feat.level}</i></h4>
                    <span class="source">{feat.source}</span>
                    <Marked content={feat.description} />
                </li>
            {/each}
        </ul>
    </div>
</div>

<style>
    .root {
        position: relative;
        width: 100%;
        height: 100%;
        max-height: 100%;
        display: flex;
        justify-content: start;
        align-items: start;
        flex-direction: column;
        color: var(--ink);
        overflow: hidden;
    }

    .scroll {
        position: relative;
        width: 100%;
        height: 100%;
        max-height: 100%;
        overflow-x: hidden;
        overflow-y: auto;
        flex: 1;
        min-height: 0;
        display: flex;
        flex-direction: column;
        gap: var(--space-3);
    }

    ul, li {
        position: relative;
        list-style: none;
        padding: 0;
        margin: 0;
        width: 100%;
        height: auto;
    }

    ul {
        padding: var(--space-1) var(--space-2);
    }

    li {
        margin-bottom: var(--space-2);
    }

    li:not(:last-child) {
        padding-bottom: var(--space-2);
        margin-bottom: var(--space-2);
    }

    li:not(:last-child)::after {
        content: '';
        position: absolute;
        right: 10%;
        bottom: 0;
        left: 10%;
        height: var(--border-hair);
        background: linear-gradient(90deg, transparent, var(--metal-dim) 20%, var(--metal) 50%, var(--metal-dim) 80%, transparent);
        box-shadow: 0 1px 0 var(--shadow-ink);
    }

    h4 {
        margin: 0;
        font-family: var(--font-display);
        font-size: var(--text-md);
        font-weight: 700;
        color: var(--metal-bright);
        text-shadow: 0 1px 0 var(--shadow-ink), 0 0 0.6rem var(--ember-glow);
    }

    h4 i {
        font-family: var(--font-figures);
        font-size: var(--text-sm);
        font-style: normal;
        color: var(--metal);
    }

    .source {
        display: block;
        font-family: var(--font-display);
        font-size: var(--text-xs);
        font-weight: 600;
        letter-spacing: var(--tracking-caps);
        text-transform: uppercase;
        color: var(--ink-faint);
        margin-bottom: var(--space-1);
    }

</style>
