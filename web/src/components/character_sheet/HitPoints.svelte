<script lang="ts">
  import {getContext} from "svelte";
  import type {Readable} from "svelte/store";
  import type {CharacterContext} from "$lib/types";
  import type {RulesState} from "$lib/rules/store";
  import {ChangeActions} from "$lib/changelog";
  import {
    postLongRest,
    postShortRest,
    putDamage,
    putHealing,
    putTemporaryHitPoints,
    rollDeathSave,
    updateCharacterWithChangeLog
  } from "$lib/engine";
  import Orb from "$components/ui/Orb.svelte";
  import Button from "$components/ui/Button.svelte";
  import Ornament from "$components/ui/Ornament.svelte";

  const {info} = getContext<CharacterContext>('character')
  const rules = getContext<Readable<RulesState>>('rules')

  let amount = $state(1)
  let dice = $state(1)
  let resting = $state(false)

  const hp = $derived($info.hp)
  const scope = $derived($rules.resolved?.scope)
  const hitDice = $derived($rules.resolved?.pools.find(pool => pool.id === 'hitDice'))
  const saves = $derived(hp.deathSaves ?? {successes: 0, failures: 0})
  const successes = $derived(scope?.['derived.deathSaveSuccesses'] ?? 0)
  const failures = $derived(scope?.['derived.deathSaveFailures'] ?? 0)

  function putMax(event: Event) {
    const max = Math.max(1, parseInt((event.target as HTMLInputElement).value) || 1)
    updateCharacterWithChangeLog(
      'info',
      current => ({...current, hp: {...current.hp, max, current: Math.min(current.hp.current, max)}}),
      ChangeActions.HP_CHANGE,
      `Set maximum HP to ${max}`
    )
  }

  function damage() {
    putDamage(amount)
    window.dispatchEvent(new CustomEvent('playSwordHit'))
  }

  function heal() {
    putHealing(amount)
    window.dispatchEvent(new CustomEvent('playHealSpell'))
  }

  async function shortRest() {
    if (!$rules.resolved) return
    resting = true
    await postShortRest(dice, $rules.resolved).finally(() => (resting = false))
  }

  function longRest() {
    if (!$rules.resolved) return
    postLongRest($rules.resolved)
  }

  async function deathSave() {
    if (!scope) return
    await rollDeathSave(scope)
  }
</script>

<div class="vitals">
  <Orb value={hp.current} max={hp.max} tone="life" size="sm" label="Hit points" />

  <div class="vitals-body">
    <span class="dnd-label">Hit Points</span>

    <div class="vitals-fields">
      <span class="vitals-field">
        <span>Current</span>
        <span class="vitals-figure">{hp.current}</span>
      </span>

      <label class="vitals-field">
        <span>Max</span>
        <input class="dnd-num" type="number" value={hp.max} onchange={putMax} min="1" />
      </label>

      <span class="vitals-field">
        <span>Temp</span>
        <span class="vitals-figure">{hp.temporary || '--'}</span>
      </span>

      <span class="vitals-field">
        <span>Hit dice</span>
        <span class="vitals-figure">{hitDice?.remaining ?? '--'}/{hitDice?.max ?? '--'} d{$info.class?.hitDice?.die || 8}</span>
      </span>
    </div>

    <div class="vitals-acts">
      <input class="dnd-num vitals-amount" type="number" min="1" bind:value={amount} aria-label="Hit point amount" />
      <Button variant="danger" size="sm" title="Take {amount} damage, temporary hit points first" onclick={damage}>Damage</Button>
      <Button variant="secondary" size="sm" title="Heal {amount}, up to the maximum" onclick={heal}>Heal</Button>
      <Button variant="ghost" size="sm" title="Set {amount} temporary hit points" onclick={() => putTemporaryHitPoints(amount)}>Temp</Button>
      <span class="vitals-rest">
        <input class="dnd-num vitals-amount" type="number" min="0" max={hitDice?.remaining ?? 0} bind:value={dice} aria-label="Hit dice to spend" />
        <Button variant="secondary" size="sm" title="Short rest, spending {dice} hit dice" loading={resting} disabled={!$rules.resolved} onclick={shortRest}>Short rest</Button>
        <Button variant="secondary" size="sm" title="Long rest" disabled={!$rules.resolved} onclick={longRest}>Long rest</Button>
      </span>
    </div>

    {#if hp.current === 0}
      <div class="vitals-death" role="group" aria-label="Death saves">
        <span class="vitals-tally" role="img" aria-label="{saves.successes} of {successes} successes">
          <span class="vitals-word">Saved</span>
          {#each Array.from({length: successes}, (_, i) => i) as index (index)}
            <Ornament name="quatrefoil" size="xs" tone={index < saves.successes ? 'verdigris' : 'ink'} />
          {/each}
        </span>
        <span class="vitals-tally" role="img" aria-label="{saves.failures} of {failures} failures">
          <span class="vitals-word">Failed</span>
          {#each Array.from({length: failures}, (_, i) => i) as index (index)}
            <Ornament name="quatrefoil" size="xs" tone={index < saves.failures ? 'ember' : 'ink'} />
          {/each}
        </span>
        <Button
          variant="secondary"
          size="sm"
          title="Roll a death save"
          disabled={!scope || saves.successes >= successes || saves.failures >= failures}
          onclick={deathSave}
        >
          Death save
        </Button>
      </div>
    {/if}
  </div>
</div>

<style>
  .vitals {
    position: relative;
    display: flex;
    align-items: center;
    gap: var(--space-3);
    min-width: 0;
    padding: var(--space-3) var(--space-4);
    background:
      radial-gradient(ellipse 60% 70% at 0% 50%, color-mix(in srgb, var(--state-bad) 10%, transparent) 0%, transparent 70%),
      var(--texture-noise),
      linear-gradient(180deg, var(--ground-raised) 0%, var(--ground-deep) 100%);
    border: none;
    border-radius: var(--radius-lg);
    box-shadow: var(--rim), inset 0 0 16px 2px var(--shade-hard), var(--shadow-md);
  }

  .vitals-body {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    flex: 1;
    min-width: 0;
  }

  .vitals-fields {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
    min-width: 0;
  }

  .vitals-field {
    display: flex;
    flex: 1 1 4.5rem;
    min-width: min-content;
    flex-direction: column;
    gap: var(--space-0);
    font-family: var(--font-display);
    font-size: var(--text-xs);
    font-weight: 600;
    letter-spacing: var(--tracking-caps);
    text-transform: uppercase;
    color: var(--metal);
    text-shadow: 0 1px 0 #000;
  }

  .vitals-figure {
    display: flex;
    align-items: center;
    min-height: 2.4rem;
    padding: 0 var(--space-2);
    background: var(--texture-noise), linear-gradient(180deg, var(--ground-deep) 0%, var(--ground) 100%);
    border: var(--border-hair) solid color-mix(in srgb, var(--metal-dim) 60%, transparent);
    border-radius: var(--radius-sm);
    box-shadow: var(--bevel-down);
    font-family: var(--font-figures);
    font-size: var(--text-sm);
    font-weight: 700;
    font-variant-numeric: lining-nums tabular-nums;
    letter-spacing: 0;
    text-transform: none;
    color: var(--ink);
    white-space: nowrap;
  }

  .vitals-acts,
  .vitals-death {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2);
    min-width: 0;
  }

  .vitals-amount {
    flex: none;
    width: calc(3ch + var(--space-4));
  }

  .vitals-rest {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    margin-inline-start: auto;
  }

  .vitals-tally {
    display: inline-flex;
    align-items: center;
    gap: var(--space-0);
  }

  .vitals-word {
    font-family: var(--font-display);
    font-size: var(--text-xs);
    letter-spacing: var(--tracking-caps);
    text-transform: uppercase;
    color: var(--metal);
    text-shadow: 0 1px 0 #000;
  }

  @container page (max-width: 480px) {
    .vitals {
      flex-wrap: wrap;
      justify-content: center;
    }

    .vitals-body {
      flex-basis: 100%;
    }
  }
</style>
