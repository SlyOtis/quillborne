<script lang="ts">
  import {getContext} from "svelte";
  import type {Readable} from "svelte/store";
  import type {CharacterContext} from "$lib/types";
  import type {ActionType, CharacterAction} from "$lib/character.types";
  import type {RulesState} from "$lib/rules/store";
  import {getStoredAttack, getWeaponAttacks, type Attack} from "$lib/rules/sheet";
  import ActionAttack from "./ActionAttack.svelte";
  import ActionSpecial from "./ActionSpecial.svelte";

  const {actions, inventory, proficients} = getContext<CharacterContext>('character')
  const rules = getContext<Readable<RulesState>>('rules')

  const weapons = $derived($rules.resolved ? getWeaponAttacks($inventory, $proficients, $rules.resolved) : [])

  const groupActions = (type: ActionType): { attack: Attack[], special: CharacterAction[] } => {
    const held = $actions.filter(a => a.type === type)
    const system = $rules.system
    const stored = system ? held.filter(a => a.layout === 'Attack').flatMap(a => getStoredAttack(a, $inventory, system) ?? []) : []
    return {
      attack: [...(type === 'Action' ? weapons : []), ...stored],
      special: held.filter(a => a.layout !== 'Attack')
    }
  }

  let primary = $derived(groupActions('Action'))
  let bonus = $derived(groupActions('Bonus'))
  let reaction = $derived(groupActions('Reaction'))
  let other = $derived(groupActions('Other'))

</script>

<div class="root">
    <div class="actions">
        {#if primary.attack.length || primary.special.length}
            <div class="divider">
                <span>Actions</span>
            </div>
        {/if}
        {#if primary.attack.length}
            <ul class="attack">
                <li class="attack-header">
                    <span>Name</span>
                    <span>Range</span>
                    <span>Hit/Dc</span>
                    <span>Damage</span>
                    <span>Properties</span>
                </li>
                {#each primary.attack as attack}
                    <ActionAttack {attack}/>
                {/each}
            </ul>
        {/if}
        {#if primary.special.length}
            <ul class="special">
                {#each primary.special as action}
                    <ActionSpecial {action}/>
                {/each}
            </ul>
        {/if}
        {#if bonus.attack.length || bonus.special.length}
            <div class="divider">
                <span>Bonus Actions</span>
            </div>
        {/if}
        {#if bonus.attack.length}
            <ul class="attack">
                <li class="attack-header">
                    <span>Name</span>
                    <span>Range</span>
                    <span>Hit/Dc</span>
                    <span>Damage</span>
                    <span>Properties</span>
                </li>
                {#each bonus.attack as attack}
                    <ActionAttack {attack}/>
                {/each}
            </ul>
        {/if}
        {#if bonus.special.length}
            <ul class="special">
                {#each bonus.special as action}
                    <ActionSpecial {action}/>
                {/each}
            </ul>
        {/if}
        {#if bonus.attack.length || bonus.special.length}
            <div class="divider">
                <span>Reactions</span>
            </div>
        {/if}
        {#if reaction.attack.length}
            <ul class="attack">
                <li class="attack-header">
                    <span>Name</span>
                    <span>Range</span>
                    <span>Hit/Dc</span>
                    <span>Damage</span>
                    <span>Properties</span>
                </li>
                {#each reaction.attack as attack}
                    <ActionAttack {attack}/>
                {/each}
            </ul>
        {/if}
        {#if bonus.special.length}
            <ul class="special">
                {#each reaction.special as action}
                    <ActionSpecial {action}/>
                {/each}
            </ul>
        {/if}
        {#if other.attack.length || other.special.length}
            <div class="divider">
                <span>Other</span>
            </div>
        {/if}
        {#if other.attack.length}
            <ul class="attack">
                <li class="attack-header">
                    <span>Name</span>
                    <span>Range</span>
                    <span>Hit/Dc</span>
                    <span>Damage</span>
                    <span>Properties</span>
                </li>
                {#each other.attack as attack}
                    <ActionAttack {attack}/>
                {/each}
            </ul>
        {/if}
        {#if other.special.length}
            <ul class="special">
                {#each other.special as action}
                    <ActionSpecial {action}/>
                {/each}
            </ul>
        {/if}
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
        overflow: hidden;
    }

    .actions {
        position: relative;
        width: 100%;
        height: auto;
        flex: 1;
        min-height: 0;
        display: flex;
        justify-content: start;
        align-items: start;
        flex-direction: column;
        overflow-y: auto;
    }

    .divider {
        position: relative;
        width: 100%;
        height: auto;
        padding: var(--space-1) var(--space-3);
        background:
            linear-gradient(180deg, color-mix(in srgb, var(--stone-light) 20%, transparent) 0%, color-mix(in srgb, var(--shadow-ink) 45%, transparent) 60%, color-mix(in srgb, var(--shadow-ink) 65%, transparent) 100%),
            var(--texture-noise),
            var(--stone);
        border-radius: var(--radius-sm);
        box-shadow: var(--bevel-up), inset 0 0 0 1px var(--metal-dim), inset 0 -1px 0 1px var(--keyline), 0 2px 4px var(--shade);
        font-family: var(--font-display);
        font-size: var(--text-xs);
        font-weight: 700;
        letter-spacing: var(--tracking-caps);
        text-transform: uppercase;
        color: var(--metal-bright);
        text-shadow: 0 1px 0 var(--shadow-ink);
    }

    .divider:not(:first-of-type) {
        margin-top: var(--space-4);
    }

    ul {
        position: relative;
        width: 100%;
        height: auto;
        margin: 0;
        padding: 0 var(--space-3);
        list-style: none;
    }

    .attack {
        position: relative;
        display: grid;
        grid-template-columns: 2fr auto auto auto 2fr;
        grid-column-gap: var(--space-4);
        grid-row-gap: var(--space-2);
        grid-auto-rows: auto;

        align-items: center;
        justify-content: start;
    }

    .attack-header {
        display: contents;
        height: auto;
    }

    .attack-header span {
        padding-bottom: var(--space-1);
        border-bottom: var(--border-hair) solid var(--metal-dim);
        font-family: var(--font-display);
        font-size: var(--text-xs);
        font-weight: 700;
        letter-spacing: var(--tracking-caps);
        text-transform: uppercase;
        white-space: nowrap;
        color: var(--metal);
        text-shadow: 0 1px 0 var(--shadow-ink);
    }

    .special {
        position: relative;
        display: flex;
        justify-content: start;
        align-items: start;
        flex-direction: column;
    }

    .attack, .special {
        padding-top: var(--space-4);
    }
</style>
