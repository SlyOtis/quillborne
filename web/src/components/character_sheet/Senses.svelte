<script lang="ts">
  import type {CharacterContext} from "$lib/types";
  import type {RulesState} from "$lib/rules/store";
  import {getSkillId} from "$lib/rules/sheet";
  import {rollPassive} from "$lib/engine";
  import {getContext} from "svelte";
  import type {Readable} from "svelte/store";
  import Button from "$components/ui/Button.svelte";

  const {senses} = getContext<CharacterContext>('character')
  const rules = getContext<Readable<RulesState>>('rules')

  const resolved = $derived.by(() =>
    $senses.map((sense) => {
      const derivedSense = $rules.resolved?.senses.find((entry) => entry.id === getSkillId(sense.title))
      if (!derivedSense) return sense
      return {...sense, score: derivedSense.value}
    })
  )

  async function rollSense(event: MouseEvent, title: string, score: number | string) {
    event.preventDefault()
    event.stopPropagation()
    window.dispatchEvent(new CustomEvent('playButtonClick'))
    await rollPassive(title, Number(score))
  }
</script>


<div class="root dnd-panel dnd-keyline">
    <div class="senses">
        {#each resolved as sense}
            <div class="sense dnd-panel dnd-keyline">
                <Button
                    variant="secondary"
                    size="sm"
                    title="Roll {sense.title}"
                    onclick={event => rollSense(event, sense.title, sense.score)}
                >
                    {sense.score}
                </Button>
                <span class="title">{sense.title}</span>
            </div>
        {/each}
    </div>
    <span class="dnd-caption">Senses</span>
</div>

<style>
    .root {
        position: relative;
        gap: var(--space-3);
        display: flex;
        justify-content: flex-start;
        align-items: center;
        flex-direction: column;
        width: auto;
        height: auto;
        padding: var(--space-3);
        background: var(--texture-noise), linear-gradient(180deg, var(--ground-raised), var(--ground-deep));
        box-shadow: var(--rim-thin), inset 0 0 16px 2px var(--shade-hard), var(--shadow-md);
    }

    .senses {
        position: relative;
        display: flex;
        align-items: center;
        flex-direction: column;
        gap: var(--space-2);
        width: 100%;
        height: auto;
    }

    .sense {
        position: relative;
        display: flex;
        align-items: center;
        flex-direction: row;
        gap: var(--space-3);
        width: 100%;
        height: auto;
        padding: var(--space-1);
        background: var(--texture-noise), linear-gradient(180deg, var(--ground-deep) 0%, var(--ground) 100%);
        border: var(--border-hair) solid color-mix(in srgb, var(--metal-dim) 60%, transparent);
        border-radius: var(--radius-sm);
        box-shadow: var(--bevel-down);
        transition: border-color 0.15s ease;
    }

    .sense:hover {
        border-color: var(--metal-dim);
    }

    .sense:hover .title {
        color: var(--metal-bright);
        text-shadow: var(--glow-text);
    }

    .title {
        position: relative;
        min-width: 0;
        font-family: var(--font-display);
        font-size: var(--text-sm);
        letter-spacing: var(--tracking-wide);
        color: var(--ink);
        text-shadow: 0 1px 0 #000;
        transition: color 0.15s ease, text-shadow 0.15s ease;
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
