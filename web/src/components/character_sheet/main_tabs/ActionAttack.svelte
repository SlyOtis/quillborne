<script lang="ts">

  import type {Damage} from "$lib/character.types";
  import {rollAttack, rollDamage, rollAttackWithAmmo, rollDamageWithAmmo} from "$lib/engine";
  import {getContext} from "svelte";
  import type {Readable} from "svelte/store";
  import type {CharacterContext} from "$lib/types";
  import type {RulesState} from "$lib/rules/store";
  import type {Attack} from "$lib/rules/sheet";
  import Button from "$components/ui/Button.svelte";

  let {attack}: {
    /** The attack the row rolls, built from a weapon or read from a stored action. */
    attack: Attack
  } = $props()

  const {inventory} = getContext<CharacterContext>('character')
  const rules = getContext<Readable<RulesState>>('rules')

  let ammunition = $derived(attack.spends ? $inventory.find(item => item.type === attack.spends && item.equipped && item.quantity > 0) ?? null : null)
  let spent = $derived(($rules.system?.items?.categories?.find(one => one.id === attack.spends)?.title ?? attack.spends).toLowerCase())

  let buttonsDisabled = $derived(Boolean(attack.spends) && !ammunition)

  let properties = $derived(attack.properties.length ? attack.properties.join(', ') : 'None')

  const renderDamage = (dmg: Damage) => {
    const die = `${dmg.amount}d${dmg.dice}`
    if (dmg.bonus > 0) return `${die} + ${dmg.bonus}`
    if (dmg.bonus < 0) return `${die} - ${-dmg.bonus}`
    return die
  }

  async function rollToHit() {
    window.dispatchEvent(new CustomEvent('playButtonClick'))
    if (ammunition) {
      await rollAttackWithAmmo(attack.name, attack.hit, ammunition.id)
    } else {
      await rollAttack(attack.name, attack.hit)
    }
  }

  async function rollAttackDamage(damage: Damage | undefined) {
    if (!damage) return
    window.dispatchEvent(new CustomEvent('playButtonClick'))
    if (ammunition) {
      await rollDamageWithAmmo(attack.name, damage.dice, damage.amount, damage.bonus, ammunition.id)
    } else {
      await rollDamage(attack.name, damage.dice, damage.amount, damage.bonus)
    }
  }

</script>

<li>
    <div class="title">
        <h4 title={attack.name}>{attack.name}</h4>
        <span class="sub">{attack.reach === 'ranged' ? 'Ranged Attack' : attack.reach === 'thrown' ? 'Melee or Thrown' : 'Melee Attack'}</span>
    </div>
    <div class="range">
        {#if attack.reach === 'thrown'}
            <span><b>{attack.melee}ft.</b> or</span>
        {/if}
        {#if attack.range && attack.reach !== 'melee'}
            <span><b>{attack.range.normal}</b> ({attack.range.max})</span>
        {:else}
            <span><b>{attack.melee}ft.</b> reach</span>
        {/if}
    </div>
    <div class="hit" class:attack-dry={buttonsDisabled}>
        <Button
            variant="secondary"
            size="sm"
            fill
            disabled={buttonsDisabled}
            title={buttonsDisabled ? `No ${spent} left` : `Roll ${attack.name} to hit${ammunition ? `, spending one of ${ammunition.title}` : ''}`}
            onclick={rollToHit}
        >
            {attack.hit < 0 ? attack.hit : `+${attack.hit}`}
        </Button>
    </div>
    <div class="attack" class:attack-dry={buttonsDisabled}>
        <Button
            variant="secondary"
            size="sm"
            fill
            disabled={buttonsDisabled || !attack.damage[0]}
            title={buttonsDisabled ? `No ${spent} left` : `Roll ${attack.name} damage${attack.versatile ? ' one-handed' : ''}`}
            onclick={() => rollAttackDamage(attack.damage[0])}
        >
            {attack.damage[0] ? renderDamage(attack.damage[0]) : 'No damage'}
        </Button>
        {#if attack.versatile}
            <Button
                variant="secondary"
                size="sm"
                fill
                title="Roll {attack.name} damage two-handed"
                label="Roll {attack.name} damage two-handed"
                onclick={() => rollAttackDamage(attack.versatile)}
            >
                {renderDamage(attack.versatile)}
            </Button>
        {/if}
    </div>
    <div class="properties">
        <span title={properties}>{properties}</span>
    </div>
</li>

<style>
    li {
        display: contents;
        width: 100%;
        list-style: none;
        margin: 0;
        padding: 0;
    }

    li > div {
        align-self: stretch;
        display: flex;
        flex-direction: column;
        justify-content: center;
        padding: var(--space-1);
        border-radius: var(--radius-sm);
        transition: background-color 0.15s ease;
    }

    li:hover > div {
        background-color: color-mix(in srgb, var(--ember) 9%, transparent);
    }

    li:hover h4 {
        color: var(--metal-bright);
        text-shadow: var(--glow-text);
    }

    .title {
        position: relative;
        min-width: 0;
        overflow: hidden;
    }

    h4 {
        position: relative;
        margin: 0;
        padding: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-family: var(--font-display);
        font-size: var(--text-sm);
        font-weight: 700;
        color: var(--metal-bright);
        text-shadow: 0 1px 0 var(--shadow-ink);
    }

    .sub {
        font-size: var(--text-xs);
        font-style: italic;
        white-space: nowrap;
        color: var(--ink-dim);
    }

    .range {
        white-space: nowrap;
        font-size: var(--text-xs);
        color: var(--ink-dim);
    }

    .range b {
        font-family: var(--font-figures);
        font-size: var(--text-sm);
        color: var(--ink);
    }

    .properties {
        position: relative;
        min-width: 0;
        overflow: hidden;
        font-size: var(--text-xs);
        font-style: italic;
        color: var(--ink-faint);
    }

    .properties > span {
        display: block;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .attack-dry :global(.dnd-button) {
        box-shadow: inset 0 0 0 var(--border-width) var(--state-bad), 0 0 0.4rem color-mix(in srgb, var(--state-bad) 50%, transparent);
        border-radius: var(--radius-sm);
    }

    .hit, .attack {
        position: relative;
        display: flex;
        flex-direction: column;
        align-items: stretch;
        gap: var(--space-1);
    }
</style>
