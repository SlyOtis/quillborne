<script lang="ts">
  import type {CharacterContext} from "$lib/types";
  import type {RulesState} from "$lib/rules/store";
  import {getAppliedItems, getSaveNotes} from "$lib/rules/sheet";
  import SavingThrow from './SavingThrow.svelte'
  import Glyph from "$components/ui/Glyph.svelte";
  import {getContext} from "svelte";
  import type {Readable} from "svelte/store";

  const {inventory} = getContext<CharacterContext>('character')
  const rules = getContext<Readable<RulesState>>('rules')

  const notes = $derived($rules.system ? getSaveNotes(getAppliedItems($inventory, $rules.system), $rules.system) : [])

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
    <div class="saves" style:grid-template-rows="repeat({Math.ceil(saves.length / 2)}, auto)">
        {#each saves as save (save.id)}
            <SavingThrow title={save.title} short={save.short} modifier={save.modifier} proficient={save.proficient}/>
        {/each}
    </div>
    {#if notes.length > 0}
        <ul class="notes">
            {#each notes as note, at (at)}
                <li class="note">
                    {#if note.kind === 'advantage'}
                        <Glyph name="arrowup" size="sm" />
                        <span>{note.title} saves {note.note}</span>
                    {:else}
                        <Glyph name="plus" size="sm" />
                        <span>{note.value < 0 ? note.value : `+${note.value}`} {note.title}</span>
                    {/if}
                </li>
            {/each}
        </ul>
    {/if}
    <span class="dnd-caption">Saving Throws</span>
</div>

<style>
    .root {
        position: relative;
        gap: var(--space-3);
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
        grid-template-columns: repeat(2, minmax(0, 1fr));
        grid-auto-flow: column;
        gap: var(--space-3);
        width: auto;
        height: auto;
    }

    .notes {
        display: flex;
        flex-direction: column;
        gap: var(--space-1);
        margin: 0;
        padding: 0;
        list-style: none;
    }

    .note {
        display: flex;
        align-items: center;
        gap: var(--space-2);
        min-width: 0;
        color: var(--metal);
    }

    .note > span {
        min-width: 0;
        font-family: var(--font-body);
        font-size: var(--text-sm);
        color: var(--ink);
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
