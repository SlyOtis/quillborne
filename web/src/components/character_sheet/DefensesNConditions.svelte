<script lang="ts">
  import {getContext} from "svelte";
  import type {Readable} from "svelte/store";
  import type {CharacterContext} from "$lib/types";
  import type {RulesState} from "$lib/rules/store";
  import {getAppliedItems} from "$lib/rules/sheet";
  import Glyph from "$components/ui/Glyph.svelte";

  const {info, inventory} = getContext<CharacterContext>('character')
  const rules = getContext<Readable<RulesState>>('rules')

  const damageTypes = $derived($rules.system?.damageTypes ?? [])
  const defenceKinds = $derived($rules.system?.defences ?? [])

  const getDefenceTitle = (kindId: string, damageId: string) => {
    const kind = defenceKinds.find(entry => entry.id === kindId)?.title ?? kindId
    const damage = damageTypes.find(entry => entry.id === damageId)?.title ?? damageId
    return `${damage} ${kind.toLowerCase()}`
  }

  const worn = $derived.by(() => {
    if (!$rules.system) return []
    const held = new Set(($info.defences ?? []).map(entry => entry.title.toLowerCase()))
    return getAppliedItems($inventory, $rules.system)
      .flatMap(item => item.grants.defences.map(one => ({title: getDefenceTitle(one.id, one.damage), from: item.title})))
      .filter(one => !held.has(one.title.toLowerCase()))
  })
</script>

<div class="root dnd-panel dnd-keyline">
    <div class="box">
        <span class="title">Defences</span>
        {#each $info.defences ?? [] as defence (defence.title)}
            <span class="chip"><span>{defence.title}</span></span>
        {/each}
        {#each worn as defence (defence.title + defence.from)}
            <span class="chip" title="From {defence.from}">
                <span>{defence.title}</span>
                <Glyph name="shield" size="sm" />
            </span>
        {/each}
        {#if ($info.defences ?? []).length === 0 && worn.length === 0}
            <span class="none">None</span>
        {/if}
    </div>
    <div class="box">
        <span class="title">Conditions</span>
        {#each $info.conditions ?? [] as condition (condition.title)}
            <span class="chip" title={condition.effects?.join(' ')}>
                <span>{condition.title}</span>
                {#if condition.level}<span class="level">{condition.level}</span>{/if}
            </span>
        {:else}
            <span class="none">None</span>
        {/each}
    </div>
    <span class="dnd-caption">Defences and conditions</span>
</div>

<style>
    .root {
        position: relative;
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(min(100%, 9rem), 1fr));
        align-items: start;
        min-width: 0;
        gap: var(--space-3);
        padding: 0;
        z-index: 1;
        color: var(--ink);
        background: var(--texture-noise), linear-gradient(180deg, var(--ground-raised), var(--ground-deep));
        box-shadow: var(--rim-thin), inset 0 0 16px 2px var(--shade-hard), var(--shadow-md);
    }

    .box {
        position: relative;
        display: flex;
        flex-wrap: wrap;
        justify-content: start;
        align-items: center;
        flex-direction: row;
        gap: var(--space-1) var(--space-2);
        min-width: 0;
        padding-inline: var(--space-3);
    }

    .title {
        flex: 1 0 100%;
        margin-inline: calc(var(--space-3) * -1);
        padding: var(--space-1) var(--space-3);
        border-block-end: var(--border-hair) solid var(--metal-dim);
        font-family: var(--font-display);
        font-size: var(--text-xs);
        font-weight: 700;
        letter-spacing: var(--tracking-caps);
        text-transform: uppercase;
        color: var(--metal-bright);
    }

    .chip {
        display: inline-flex;
        align-items: center;
        gap: var(--space-0);
        min-width: 0;
        max-width: 100%;
        padding: 0;
    }

    .chip > span {
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        font-family: var(--font-display);
        font-size: var(--text-xs);
        letter-spacing: var(--tracking-wide);
        white-space: nowrap;
        color: var(--ink);
        text-shadow: 0 1px 0 var(--shadow-ink);
    }

    .none {
        font-size: var(--text-xs);
        font-style: italic;
        white-space: nowrap;
        color: var(--ink-faint);
    }

    .chip > .level {
        font-family: var(--font-figures);
        font-size: var(--text-xs);
        font-weight: 700;
        font-variant-numeric: lining-nums tabular-nums;
        color: var(--metal-bright);
    }

    .root > .dnd-caption {
        grid-column: 1 / -1;
        margin: auto var(--space-1) var(--space-1);
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
