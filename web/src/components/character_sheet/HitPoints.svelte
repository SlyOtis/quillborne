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
  import Button from "$components/ui/Button.svelte";
  import Ornament from "$components/ui/Ornament.svelte";

  const {info} = getContext<CharacterContext>('character')
  const rules = getContext<Readable<RulesState>>('rules')

  let amount = $state(1)
  let dice = $state(1)
  let resting = $state(false)

  const hp = $derived($info.hp)
  const percent = $derived(hp.max > 0 ? Math.max(0, Math.min(100, (hp.current / hp.max) * 100)) : 0)
  const BUBBLES = [
    {at: 12, size: 0.35, wait: 0, time: 6.5},
    {at: 31, size: 0.2, wait: 2.1, time: 5.2},
    {at: 48, size: 0.45, wait: 0.8, time: 7.4},
    {at: 63, size: 0.25, wait: 3.4, time: 5.8},
    {at: 79, size: 0.3, wait: 1.6, time: 6.9},
    {at: 91, size: 0.18, wait: 4.2, time: 5.5}
  ]
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

  function putCurrent(event: Event) {
    const current = Math.max(0, Math.min(hp.max, parseInt((event.target as HTMLInputElement).value) || 0))
    updateCharacterWithChangeLog(
      'info',
      state => ({...state, hp: {...state.hp, current}}),
      ChangeActions.HP_CHANGE,
      `Set current HP to ${current}`
    )
  }

  function putTemp(event: Event) {
    putTemporaryHitPoints(Math.max(0, parseInt((event.target as HTMLInputElement).value) || 0))
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

<div class="vitals" style="--vitals-fill: {percent}%">
  <span class="vitals-potion" aria-hidden="true">
    <span class="vitals-wave vitals-wave-back"></span>
    <span class="vitals-wave vitals-wave-mid"></span>
    <span class="vitals-wave vitals-wave-front"></span>
    {#each BUBBLES as bubble (bubble.at)}
      <span class="vitals-bubble" style="--bubble-at: {bubble.at}%; --bubble-size: {bubble.size}; --bubble-wait: {bubble.wait}s; --bubble-time: {bubble.time}s"></span>
    {/each}
  </span>

  <div class="vitals-body">
    <span class="dnd-label">Hit Points</span>

    <div class="vitals-fields">
      <label class="vitals-field">
        <span>Current</span>
        <input class="dnd-num" type="number" value={hp.current} onchange={putCurrent} min="0" max={hp.max} />
      </label>

      <label class="vitals-field">
        <span>Max</span>
        <input class="dnd-num" type="number" value={hp.max} onchange={putMax} min="1" />
      </label>

      <label class="vitals-field">
        <span>Temp</span>
        <input class="dnd-num" type="number" value={hp.temporary} onchange={putTemp} min="0" />
      </label>

      <span class="vitals-field">
        <span>Hit dice</span>
        <span class="dnd-num vitals-figure">{hitDice?.remaining ?? '--'}/{hitDice?.max ?? '--'} d{$info.class?.hitDice?.die || 8}</span>
      </span>
    </div>

    <div class="vitals-acts">
      <span class="vitals-step" role="group" aria-label="Damage and healing">
        <button type="button" class="vitals-act vitals-act-bane" title="Take {amount} damage, temporary hit points first" onclick={damage}>Damage</button>
        <input class="dnd-num vitals-amount" type="number" min="1" bind:value={amount} aria-label="Hit point amount" />
        <button type="button" class="vitals-act vitals-act-life" title="Heal {amount}, up to the maximum" onclick={heal}>Heal</button>
      </span>
      <span class="vitals-step" role="group" aria-label="Rest">
        <input class="dnd-num vitals-amount" type="number" min="0" max={hitDice?.remaining ?? 0} bind:value={dice} aria-label="Hit dice to spend" />
        <button type="button" class="vitals-act" title="Short rest, spending {dice} hit dice" disabled={resting || !$rules.resolved} onclick={shortRest}>Short rest</button>
        <button type="button" class="vitals-act" title="Long rest" disabled={!$rules.resolved} onclick={longRest}>Long rest</button>
      </span>
    </div>

    {#if hp.current === 0}
      <span class="vitals-divider" aria-hidden="true"></span>
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
    --vitals-liquid: var(--state-bad);
    position: relative;
    isolation: isolate;
    display: flex;
    align-items: center;
    gap: var(--space-3);
    min-width: 0;
    padding: var(--space-2) var(--space-3);
    overflow: hidden;
    background: var(--texture-noise), linear-gradient(180deg, var(--ground-raised) 0%, var(--ground-deep) 100%);
    border: none;
    border-radius: var(--radius-lg);
    box-shadow: var(--rim), inset 0 0 16px 2px var(--shade-hard), var(--shadow-md);
  }

  .vitals-potion {
    position: absolute;
    inset: 0;
    z-index: 0;
    overflow: hidden;
    pointer-events: none;
  }

  .vitals-wave {
    position: absolute;
    inset-inline: -50%;
    inset-block-start: calc(100% - var(--vitals-fill));
    block-size: 100%;
    border-radius: 45% 45% 0 0 / 12% 12% 0 0;
    transform-origin: center bottom;
    transition: inset-block-start 600ms cubic-bezier(0.16, 1, 0.3, 1);
    animation: vitals-wave var(--wave-time) ease-in-out infinite alternate;
  }

  .vitals-wave-back {
    --wave-time: 7s;
    background: color-mix(in srgb, var(--vitals-liquid) 6%, transparent);
    translate: 0 calc(var(--space-3) * -1);
  }

  .vitals-wave-mid {
    --wave-time: 5.5s;
    background: color-mix(in srgb, var(--vitals-liquid) 8%, transparent);
    translate: 0 calc(var(--space-1) * -1);
    animation-direction: alternate-reverse;
  }

  .vitals-wave-front {
    --wave-time: 4.2s;
    background: linear-gradient(180deg, color-mix(in srgb, var(--vitals-liquid) 55%, var(--ember-core)) 0%, color-mix(in srgb, var(--vitals-liquid) 22%, transparent) 10%, color-mix(in srgb, var(--vitals-liquid) 10%, transparent) 100%);
    box-shadow: 0 0 var(--space-5) color-mix(in srgb, var(--vitals-liquid) 35%, transparent);
  }

  .vitals-bubble {
    position: absolute;
    inset-inline-start: var(--bubble-at);
    inset-block-end: 0;
    inline-size: calc(var(--space-4) * var(--bubble-size));
    block-size: calc(var(--space-4) * var(--bubble-size));
    border-radius: var(--radius-pill);
    border: var(--border-hair) solid color-mix(in srgb, var(--ember-core) 55%, transparent);
    background: color-mix(in srgb, var(--ember-core) 18%, transparent);
    opacity: 0;
    animation: vitals-bubble var(--bubble-time) linear var(--bubble-wait) infinite;
  }

  @keyframes vitals-wave {
    from {
      transform: translateX(-6%) rotate(-0.6deg);
    }
    to {
      transform: translateX(6%) rotate(0.6deg);
    }
  }

  @keyframes vitals-bubble {
    0% {
      opacity: 0;
      transform: translateY(0) scale(0.6);
    }
    10% {
      opacity: 0.8;
    }
    90% {
      opacity: 0.4;
    }
    100% {
      opacity: 0;
      transform: translateY(calc(var(--vitals-fill) * -1 - var(--space-2))) scale(1.1);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .vitals-wave,
    .vitals-bubble {
      animation: none;
    }
  }

  .vitals-body {
    position: relative;
    z-index: 1;
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    flex: 1;
    min-width: 0;
  }

  .vitals-fields {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
    min-width: 0;
  }

  .vitals-field > .dnd-num {
    inline-size: calc(4ch + var(--space-4));
    padding-block: var(--space-1);
  }

  .vitals-field > .vitals-figure {
    padding-inline: var(--space-2);
  }

  .vitals-field {
    display: flex;
    min-width: 0;
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
    justify-content: center;
    letter-spacing: 0;
    text-transform: none;
    white-space: nowrap;
  }

  .vitals-acts,
  .vitals-death {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
    min-width: 0;
  }

  .vitals-step {
    display: flex;
    align-items: stretch;
    gap: 0;
    padding: var(--space-0);
    border-radius: var(--radius-sm);
    background: var(--texture-noise), var(--ground-deep);
    box-shadow: var(--rim-thin), var(--bevel-down);
  }

  .vitals-amount {
    flex: none;
    width: calc(3ch + var(--space-4));
    padding-block: var(--space-1);
    border: none;
    border-radius: 0;
    background: none;
    box-shadow: inset var(--border-hair) 0 0 var(--keyline), inset calc(var(--border-hair) * -1) 0 0 var(--keyline);
  }

  .vitals-act {
    --act-light: var(--metal);
    flex: 1;
    min-width: calc(var(--space-8) + var(--space-2));
    padding: var(--space-1) var(--space-3);
    border: none;
    border-radius: 0;
    background:
      radial-gradient(ellipse 90% 130% at 50% 110%, color-mix(in srgb, var(--act-light) 28%, transparent) 0%, transparent 70%),
      linear-gradient(180deg, color-mix(in srgb, var(--stone-light) 16%, transparent) 0%, color-mix(in srgb, #000 50%, transparent) 60%, color-mix(in srgb, #000 70%, transparent) 100%),
      var(--texture-noise),
      var(--stone-dark);
    box-shadow: var(--bevel-up), inset 0 0 0 1px var(--keyline);
    color: var(--ink);
    font-family: var(--font-display);
    font-size: var(--text-xs);
    font-weight: 700;
    letter-spacing: var(--tracking-caps);
    text-transform: uppercase;
    text-shadow: 0 1px 0 #000;
    white-space: nowrap;
    cursor: pointer;
    transition: color 0.15s ease, filter 0.15s ease;
  }

  .vitals-act:first-child {
    border-radius: var(--radius-sm) 0 0 var(--radius-sm);
  }

  .vitals-act:last-child {
    border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
  }

  .vitals-act-bane {
    --act-light: var(--state-bad);
  }

  .vitals-act-life {
    --act-light: var(--state-good);
  }

  .vitals-act:hover:not(:disabled) {
    color: var(--metal-bright);
    text-shadow: 0 0 8px var(--act-light), 0 1px 0 #000;
    filter: brightness(1.1);
  }

  .vitals-act:active:not(:disabled) {
    filter: brightness(0.85);
  }

  .vitals-act:focus-visible {
    outline: none;
    box-shadow: var(--focus-ring);
    z-index: 1;
  }

  .vitals-act:disabled {
    opacity: 0.5;
    cursor: default;
  }

  .vitals-divider {
    display: block;
    block-size: var(--border-hair);
    margin-block: var(--space-1);
    background: linear-gradient(90deg, transparent, var(--metal-dim) 15%, var(--metal) 50%, var(--metal-dim) 85%, transparent);
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
