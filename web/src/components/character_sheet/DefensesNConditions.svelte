<script lang="ts">
  import {getContext} from "svelte";
  import type {Readable} from "svelte/store";
  import type {CharacterContext} from "$lib/types";
  import type {RulesState} from "$lib/rules/store";
  import {deleteCondition, deleteDefence, putCondition, putDefence} from "$lib/engine";
  import Field from "$components/ui/Field.svelte";
  import IconBtn from "$components/ui/IconBtn.svelte";
  import Glyph from "$components/ui/Glyph.svelte";

  const {info} = getContext<CharacterContext>('character')
  const rules = getContext<Readable<RulesState>>('rules')

  const conditionList = $derived($rules.system?.conditions ?? [])
  const damageTypes = $derived($rules.system?.damageTypes ?? [])
  const defenceKinds = $derived($rules.system?.defences ?? [])

  let conditionId = $state('')
  let kindId = $state('')
  let damageId = $state('')

  const getLevels = (title: string) =>
    conditionList.find(entry => entry.title.toLowerCase() === title.toLowerCase())?.levels ?? 0

  function addCondition() {
    const spec = conditionList.find(entry => entry.id === conditionId)
    if (!spec) return
    putCondition({title: spec.title, effects: spec.description ? [spec.description] : [], level: spec.levels ? 1 : null})
    conditionId = ''
  }

  function stepLevel(title: string, level: number) {
    if (level < 1) {
      deleteCondition(title)
      return
    }
    putCondition({title, level: Math.min(getLevels(title), level)})
  }

  function addDefence() {
    const kind = defenceKinds.find(entry => entry.id === kindId)
    const damage = damageTypes.find(entry => entry.id === damageId)
    if (!kind || !damage) return
    putDefence({title: `${damage.title} ${kind.title.toLowerCase()}`, effects: [`${kind.title} to ${damage.title.toLowerCase()} damage`]})
    damageId = ''
  }
</script>

<div class="root dnd-panel dnd-keyline">
    <div class="box defences">
        <span class="title">Defences</span>
        {#each $info.defences ?? [] as defence (defence.title)}
            <span class="chip">
                <span>{defence.title}</span>
                <IconBtn title="Remove {defence.title}" onclick={() => deleteDefence(defence.title)}>
                    <Glyph name="remove" size="sm" />
                </IconBtn>
            </span>
        {:else}
            <span class="none">None</span>
        {/each}
    </div>
    <div class="adder">
        <Field label="Defence" id="defence-kind" inline>
            <select id="defence-kind" bind:value={kindId} onchange={addDefence}>
                <option value="">Kind</option>
                {#each defenceKinds as kind (kind.id)}
                    <option value={kind.id}>{kind.title}</option>
                {/each}
            </select>
        </Field>
        <Field label="Damage" id="defence-damage" inline>
            <select id="defence-damage" bind:value={damageId} onchange={addDefence}>
                <option value="">Type</option>
                {#each damageTypes as damage (damage.id)}
                    <option value={damage.id}>{damage.title}</option>
                {/each}
            </select>
        </Field>
    </div>
    <div class="divider"></div>
    <div class="box conditions">
        <span class="title">Conditions</span>
        {#each $info.conditions ?? [] as condition (condition.title)}
            <span class="chip" title={condition.effects?.join(' ')}>
                <span>{condition.title}{condition.level ? ` ${condition.level}` : ''}</span>
                {#if getLevels(condition.title) > 1}
                    <IconBtn title="Lower {condition.title}" onclick={() => stepLevel(condition.title, (condition.level ?? 1) - 1)}>
                        <Glyph name="minus" size="sm" />
                    </IconBtn>
                    <IconBtn
                        title="Raise {condition.title}"
                        disabled={(condition.level ?? 1) >= getLevels(condition.title)}
                        onclick={() => stepLevel(condition.title, (condition.level ?? 1) + 1)}
                    >
                        <Glyph name="add" size="sm" />
                    </IconBtn>
                {/if}
                <IconBtn title="Remove {condition.title}" onclick={() => deleteCondition(condition.title)}>
                    <Glyph name="remove" size="sm" />
                </IconBtn>
            </span>
        {:else}
            <span class="none">None</span>
        {/each}
    </div>
    <div class="adder">
        <Field label="Condition" id="condition-pick" inline>
            <select id="condition-pick" bind:value={conditionId} onchange={addCondition}>
                <option value="">Choose</option>
                {#each conditionList as condition (condition.id)}
                    <option value={condition.id}>{condition.title}</option>
                {/each}
            </select>
        </Field>
    </div>
    <span class="dnd-caption">Defences and conditions</span>
</div>

<style>
    .root {
        position: relative;
        display: flex;
        flex-direction: column;
        align-items: stretch;
        min-width: 0;
        gap: var(--space-2);
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
        text-shadow: 0 1px 0 #000;
    }

    .none {
        font-size: var(--text-xs);
        font-style: italic;
        white-space: nowrap;
        color: var(--ink-faint);
    }

    .adder {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(min(100%, 12rem), 1fr));
        align-items: center;
        gap: var(--space-2);
        min-width: 0;
        padding-inline: var(--space-3);
    }

    .adder :global(select) {
        padding-block: var(--space-1);
    }

    .root > .dnd-caption {
        margin: auto var(--space-1) var(--space-1);
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

    .divider {
        position: relative;
        flex: none;
        height: var(--border-hair);
        min-height: var(--border-hair);
        margin-block: var(--space-1);
        background: linear-gradient(90deg, transparent, var(--metal-dim) 15%, var(--metal) 50%, var(--metal-dim) 85%, transparent);
        box-shadow: 0 1px 0 #000;
    }
</style>
