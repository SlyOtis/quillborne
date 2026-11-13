<script lang="ts">
    import type {RulesState} from "$lib/rules/store";
    import {rollSkill} from "$lib/engine";
    import {getContext} from "svelte";
    import type {Readable} from "svelte/store";
    import Button from "$components/ui/Button.svelte";

    const rules = getContext<Readable<RulesState>>('rules')

    const resolved = $derived.by(() => {
        const state = $rules.resolved
        if (!state) return []
        return state.skills.map((skill) => ({
            id: skill.id,
            name: skill.title,
            ability: state.attributes.find((entry) => entry.id === skill.attribute)?.short ?? skill.attribute,
            modifier: skill.value,
            proficiency: skill.multiplier
        }))
    })

    async function rollSkillCheck(event: MouseEvent, name: string, modifier: number, proficiency: number) {
        event.preventDefault();
        event.stopPropagation();

        const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
        window.dispatchEvent(new CustomEvent('playButtonClick'));

        await rollSkill(name, modifier, proficiency, rect.left + rect.width / 2, rect.top + rect.height / 2);
    }

</script>

<div class="root dnd-panel dnd-keyline">
    <div class="skills">
        <span class="head">Prof</span>
        <span class="head">Mod</span>
        <span class="head name">Skill</span>
        <span class="head">Bonus</span>
        {#each resolved as skill (skill.id)}
            <span class="pip" class:pip-lit={skill.proficiency > 0}></span>
            <span>{skill.ability}</span>
            <span class="name">{skill.name}</span>
            <Button
                variant={skill.proficiency > 0 ? 'secondary' : 'ghost'}
                size="sm"
                title="Roll {skill.name}"
                onclick={event => rollSkillCheck(event, skill.name, skill.modifier, skill.proficiency)}
            >
                {skill.modifier < 0 ? '' : '+'}{skill.modifier}
            </Button>
        {/each}
    </div>
    <span class="dnd-caption">Skills</span>
</div>

<style>
    .root {
        position: relative;
        display: flex;
        flex-direction: column;
        justify-content: flex-start;
        align-items: stretch;
        gap: var(--space-3);
        padding: var(--space-3);
        background: var(--texture-noise), linear-gradient(180deg, var(--ground-raised), var(--ground-deep));
        box-shadow: var(--rim-thin), inset 0 0 16px 2px var(--shade-hard), var(--shadow-md);
    }

    .skills {
        position: relative;
        display: grid;
        grid-template-columns: auto auto minmax(0, 1fr) var(--space-6);
        align-items: center;
        gap: var(--space-0) var(--space-2);
        font-size: var(--text-xs);
        width: 100%;
        align-content: start;
    }

    .root > :global(.dnd-caption) {
        align-self: stretch;
        margin: auto calc(var(--space-1) - var(--space-3)) calc(var(--space-1) - var(--space-3));
        padding: var(--space-1) var(--space-3);
        background:
            linear-gradient(180deg, color-mix(in srgb, var(--stone-light) 20%, transparent) 0%, color-mix(in srgb, #000 45%, transparent) 60%, color-mix(in srgb, #000 65%, transparent) 100%),
            var(--texture-noise),
            var(--stone);
        box-shadow: var(--bevel-up), inset 0 1px 0 var(--metal-dim), inset 0 2px 0 var(--keyline);
        color: var(--metal-bright);
        text-shadow: 0 1px 0 #000;
    }

    span {
        display: flex;
        justify-content: center;
        align-items: center;
        align-self: stretch;
        font-family: var(--font-display);
        letter-spacing: var(--tracking-wide);
        color: var(--ink-dim);
        border-radius: var(--radius-sm);
        transition: background-color 0.15s ease, color 0.15s ease, text-shadow 0.15s ease, box-shadow 0.15s ease;
    }

    .skills > :global(.dnd-button) {
        inline-size: var(--space-6);
        block-size: var(--space-6);
        aspect-ratio: 1;
        justify-self: center;
        --button-text: var(--text-md);
        --button-pad: 0;
        font-variant-numeric: lining-nums tabular-nums;
    }

    .head {
        padding-bottom: var(--space-1);
        border-bottom: var(--border-hair) solid var(--metal-dim);
        border-radius: 0;
        font-weight: 700;
        letter-spacing: var(--tracking-caps);
        text-transform: uppercase;
        color: var(--metal);
        text-shadow: 0 1px 0 #000;
    }

    .pip {
        align-self: center;
        justify-self: center;
        width: 0.55rem;
        height: 0.55rem;
        background: var(--texture-noise), var(--ground-deep);
        border: var(--border-hair) solid var(--metal-dim);
        border-radius: 0;
        box-shadow: var(--bevel-down);
        transform: rotate(45deg);
    }

    .pip-lit {
        background: linear-gradient(135deg, var(--ember-core) 0%, var(--metal-bright) 30%, var(--metal) 60%, var(--metal-dim) 100%);
        border-color: var(--keyline);
        box-shadow: inset 0 1px 0 var(--sheen-strong), 0 0 0.4rem var(--ember-glow);
    }

    .name {
        justify-content: start;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        padding-inline: var(--space-1);
        font-family: var(--font-body);
        font-size: var(--text-sm);
        letter-spacing: 0;
        color: var(--ink);
    }

    .pip:is(:hover, :has(+ :hover), :has(+ * + :hover), :has(+ * + * + :hover)) + span,
    .pip:is(:hover, :has(+ :hover), :has(+ * + :hover), :has(+ * + * + :hover)) + span + .name {
        background: linear-gradient(90deg, color-mix(in srgb, var(--ember) 14%, transparent), color-mix(in srgb, var(--ember) 4%, transparent));
        box-shadow: inset 0 -1px 0 var(--metal-dim);
        color: var(--metal-bright);
        text-shadow: var(--glow-text);
    }

    .pip-lit:is(:hover, :has(+ :hover), :has(+ * + :hover), :has(+ * + * + :hover)),
    .pip:is(:hover, :has(+ :hover), :has(+ * + :hover), :has(+ * + * + :hover)) {
        border-color: var(--metal-bright);
    }

    .root > .dnd-caption {
        margin: 0 calc(var(--space-1) - var(--space-3)) calc(var(--space-1) - var(--space-3));
        padding: var(--space-1) var(--space-3);
        background:
            linear-gradient(180deg, color-mix(in srgb, var(--stone-light) 20%, transparent) 0%, color-mix(in srgb, #000 45%, transparent) 60%, color-mix(in srgb, #000 65%, transparent) 100%),
            var(--texture-noise),
            var(--stone);
        border-radius: 0 0 var(--radius-md) var(--radius-md);
        box-shadow: var(--bevel-up), inset 0 1px 0 var(--metal-dim), inset 0 2px 0 var(--keyline);
        color: var(--metal-bright);
        letter-spacing: var(--tracking-caps);
        text-shadow: 0 1px 0 #000;
    }
</style>
