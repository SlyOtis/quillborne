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
  , rollDie, writeRollLog} from "$lib/engine";
  import IconBtn from "$components/ui/IconBtn.svelte";
  import Glyph from "$components/ui/Glyph.svelte";
  import Ornament from "$components/ui/Ornament.svelte";

  const {info} = getContext<CharacterContext>('character')
  const rules = getContext<Readable<RulesState>>('rules')

  let amount = $state(1)
  let dice = $state(1)
  let resting = $state(false)

  const hp = $derived($info.hp)
  const percent = $derived(hp.max > 0 ? Math.max(0, Math.min(100, (hp.current / hp.max) * 100)) : 0)
  const BUBBLES = [
    {at: 8, size: 0.4, wait: 0, time: 7.5, sway: 1},
    {at: 19, size: 0.22, wait: 2.6, time: 5.4, sway: -1},
    {at: 33, size: 0.5, wait: 1.1, time: 8.6, sway: 1},
    {at: 46, size: 0.3, wait: 3.9, time: 6.2, sway: -1},
    {at: 58, size: 0.18, wait: 0.7, time: 5, sway: 1},
    {at: 71, size: 0.36, wait: 2.2, time: 7.1, sway: -1},
    {at: 84, size: 0.26, wait: 4.4, time: 6.6, sway: 1},
    {at: 93, size: 0.44, wait: 1.8, time: 8.1, sway: -1}
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

  async function rollHitDice() {
    const die = $info.class?.hitDice?.die || 8
    const count = Math.max(1, Math.floor(dice))
    const res = await rollDie(die, count)
    writeRollLog('roll', `Rolled ${count} hit dice`, `${count}d${die}`, res.sum, res.sum, res.rolls.join(','))
  }

  function putDice(event: Event) {
    const left = Math.max(0, Math.min(Number((event.currentTarget as HTMLInputElement).value) || 0, hitDice?.max ?? 0))
    info.update((state) => ({ ...state, hp: { ...state.hp, hitDiceSpent: (hitDice?.max ?? 0) - left } }))
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
  <span class="dnd-label vitals-title">Hit Points</span>
  <span class="vitals-potion" aria-hidden="true">
    <span class="vitals-wave vitals-wave-back"></span>
    <span class="vitals-wave vitals-wave-mid"></span>
    <span class="vitals-wave vitals-wave-front"></span>
    {#each BUBBLES as bubble (bubble.at)}
      <span class="vitals-bubble" style="--bubble-at: {bubble.at}%; --bubble-size: {bubble.size}; --bubble-wait: {bubble.wait}s; --bubble-time: {bubble.time}s; --bubble-sway: {bubble.sway}"></span>
    {/each}
  </span>

  <div class="vitals-body">
    <div class="vitals-fields">
      <span class="vitals-field vitals-field-large">
        <span>HP</span>
        <span class="vitals-pair">
          <input class="dnd-num vitals-inline" type="number" value={hp.current} onchange={putCurrent} min="0" max={hp.max} aria-label="Current hit points" title="Current hit points" />
          <span class="vitals-slash" aria-hidden="true">/</span>
          <input class="dnd-num vitals-inline" type="number" value={hp.max} onchange={putMax} min="1" aria-label="Maximum hit points" title="Maximum hit points" />
        </span>
      </span>

      <label class="vitals-field">
        <span>Temp</span>
        <input class="dnd-num vitals-inline" type="number" value={hp.temporary} onchange={putTemp} min="0" title="Temporary hit points" />
      </label>

      <span class="vitals-step vitals-step-tall" role="group" aria-label="Damage and healing">
        <IconBtn title="Heal {amount}, up to the maximum" tone="verdigris" onclick={heal}><Glyph name="add" size="sm" /></IconBtn>
        <span class="vitals-cell" title="How many hit points the damage or healing is">
          <input class="dnd-num vitals-amount" type="number" min="1" bind:value={amount} aria-label="Hit point amount" />
        </span>
        <IconBtn title="Take {amount} damage, temporary hit points first" tone="ember" onclick={damage}><Glyph name="minus" size="sm" /></IconBtn>
      </span>

      <span class="vitals-field vitals-field-dice">
        <span>Hit dice</span>
        <span class="vitals-pair">
          <input class="dnd-num vitals-inline" type="number" value={hitDice?.remaining ?? 0} onchange={putDice} min="0" max={hitDice?.max ?? 0} aria-label="Hit dice left" title="Hit dice left to spend" />
          <span class="vitals-slash" aria-hidden="true">/</span>
          <span class="dnd-num vitals-inline vitals-figure">{hitDice?.max ?? '--'} d{$info.class?.hitDice?.die || 8}</span>
        </span>
      </span>
    </div>

    <div class="vitals-acts">
      <span class="vitals-step" role="group" aria-label="Rest">
        <span class="vitals-cell" title="How many hit dice to roll or spend">
          <input class="dnd-num vitals-amount" type="number" min="0" max={hitDice?.remaining ?? 0} bind:value={dice} aria-label="Hit dice to roll or spend" />
        </span>
        <IconBtn title="Roll {dice} hit dice" disabled={!$rules.resolved} onclick={rollHitDice}><Glyph name="dice" size="sm" /></IconBtn>
        <IconBtn title="Short rest, spending {dice} hit dice" disabled={resting || !$rules.resolved} onclick={shortRest}><Glyph name="shortrest" size="sm" /></IconBtn>
        <IconBtn title="Long rest" disabled={!$rules.resolved} onclick={longRest}><Glyph name="longrest" size="sm" /></IconBtn>
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
        <span class="vitals-roll">
          <IconBtn title="Roll a death save" disabled={!scope || saves.successes >= successes || saves.failures >= failures} onclick={deathSave}><Glyph name="dice" size="md" /></IconBtn>
        </span>
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
    flex-direction: column;
    align-items: stretch;
    gap: var(--space-2);
    inline-size: clamp(17rem, 36%, 24rem);
    min-width: 0;
    padding: var(--space-4) var(--space-3) var(--space-2);
    overflow: visible;
    background: var(--texture-noise), linear-gradient(180deg, var(--ground-raised) 0%, var(--ground-deep) 100%);
    border: none;
    border-radius: var(--radius-lg);
    box-shadow: var(--rim), inset 0 0 16px 2px var(--shade-hard), var(--shadow-md);
  }

  .vitals-potion {
    position: absolute;
    inset: var(--space-1);
    z-index: 0;
    overflow: hidden;
    border-radius: calc(var(--radius-lg) - var(--space-1));
    pointer-events: none;
  }

  .vitals-wave {
    --wave-crest: var(--space-3);
    position: absolute;
    inset-inline: 0;
    inset-block-start: calc(100% - var(--vitals-fill) + var(--wave-lift) - var(--wave-crest));
    block-size: calc(100% + var(--wave-crest));
    background: linear-gradient(180deg, var(--wave-ink) 0%, var(--wave-ink) 55%, color-mix(in srgb, var(--wave-ink) 70%, var(--vitals-liquid) 30%) 100%);
    -webkit-mask:
      var(--mask-wave) var(--wave-phase) 0 / var(--wave-span) var(--wave-crest) repeat-x,
      linear-gradient(var(--keyline), var(--keyline)) 0 var(--wave-crest) / 100% 100% no-repeat;
    mask:
      var(--mask-wave) var(--wave-phase) 0 / var(--wave-span) var(--wave-crest) repeat-x,
      linear-gradient(var(--keyline), var(--keyline)) 0 var(--wave-crest) / 100% 100% no-repeat;
    transition: inset-block-start 600ms cubic-bezier(0.16, 1, 0.3, 1);
    animation: vitals-wave var(--wave-time) linear infinite, vitals-bob var(--bob-time) ease-in-out infinite alternate;
  }

  .vitals-wave-back {
    --wave-time: 12s;
    --bob-time: 4.2s;
    --wave-phase: 0;
    --wave-lift: calc(var(--space-2) * -1);
    --wave-span: 46%;
    --wave-ink: color-mix(in srgb, var(--vitals-liquid) 10%, transparent);
  }

  .vitals-wave-mid {
    --wave-time: 8s;
    --bob-time: 3.4s;
    --wave-phase: 33%;
    --wave-lift: calc(var(--space-1) * -1);
    --wave-span: 38%;
    --wave-ink: color-mix(in srgb, var(--vitals-liquid) 14%, transparent);
    animation-direction: reverse;
  }

  .vitals-wave-front {
    --wave-time: 6s;
    --bob-time: 2.7s;
    --wave-phase: 66%;
    --wave-lift: 0px;
    --wave-span: 30%;
    --wave-ink: color-mix(in srgb, var(--vitals-liquid) 22%, transparent);
  }

  .vitals-bubble {
    position: absolute;
    inset-inline-start: var(--bubble-at);
    inset-block-end: 0;
    inline-size: calc(var(--space-4) * var(--bubble-size));
    block-size: calc(var(--space-4) * var(--bubble-size));
    border-radius: var(--radius-pill);
    background: radial-gradient(circle at 35% 30%, color-mix(in srgb, var(--ember-core) 70%, transparent) 0%, color-mix(in srgb, var(--ember-core) 15%, transparent) 45%, transparent 70%);
    box-shadow: inset 0 0 0 var(--border-hair) color-mix(in srgb, var(--ember-core) 45%, transparent);
    opacity: 0;
    animation: vitals-bubble var(--bubble-time) ease-in var(--bubble-wait) infinite;
  }

  @keyframes vitals-wave {
    to {
      -webkit-mask-position: calc(var(--wave-phase) + var(--wave-span)) 0, 0 var(--wave-crest);
      mask-position: calc(var(--wave-phase) + var(--wave-span)) 0, 0 var(--wave-crest);
    }
  }

  @keyframes vitals-bob {
    from {
      transform: translateY(calc(var(--space-0) * -1));
    }
    to {
      transform: translateY(var(--space-0));
    }
  }

  @keyframes vitals-bubble {
    0% {
      opacity: 0;
      inset-block-end: 0;
      transform: translateX(0) scale(0.5);
    }
    12% {
      opacity: 0.9;
    }
    50% {
      transform: translateX(calc(var(--bubble-sway) * var(--space-2))) scale(0.9);
    }
    88% {
      opacity: 0.5;
    }
    100% {
      opacity: 0;
      inset-block-end: calc(var(--vitals-fill) + var(--space-3));
      transform: translateX(calc(var(--bubble-sway) * var(--space-1) * -1)) scale(1.15);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .vitals-wave,
    .vitals-bubble {
      animation: none;
    }
  }

  .vitals-title {
    position: absolute;
    inset-block-start: 0;
    inset-inline-start: var(--space-4);
    z-index: 2;
    margin: 0;
    padding: var(--space-0) var(--space-2);
    translate: 0 -50%;
    white-space: nowrap;
    border: var(--border-hair) solid var(--metal-dim);
    border-radius: var(--radius-sm);
    background: var(--texture-noise), var(--ground-deep);
    box-shadow: 0 var(--space-0) var(--space-1) var(--shade-hard);
  }

  .vitals-body {
    position: relative;
    z-index: 1;
    display: flex;
    flex-direction: column;
    justify-content: flex-start;
    gap: var(--space-1);
    flex: 1;
    min-width: 0;
  }

  .vitals-fields {
    display: flex;
    flex-wrap: wrap;
    align-items: end;
    gap: 0 var(--space-4);
    min-width: 0;
  }

  .vitals-field > .dnd-num {
    inline-size: calc(4ch + var(--space-4));
    padding-block: var(--space-1);
  }

  .vitals-field .vitals-inline {
    inline-size: calc(3ch + var(--space-3));
    padding: 0 var(--space-1);
    border-color: transparent;
    background: none;
    box-shadow: none;
    font-size: var(--text-lg);
    text-align: center;
    line-height: 1;
    color: var(--metal-bright);
    text-shadow: 0 1px 0 #000, 0 0 0.6rem var(--ember-glow);
  }

  .vitals-field .vitals-inline:focus {
    border-color: var(--metal-bright);
    background: var(--texture-noise), var(--ground-deep);
    box-shadow: var(--glow-metal);
  }

  .vitals-field-large {
    align-self: end;
  }

  .vitals-pair {
    display: inline-flex;
    align-items: baseline;
    gap: var(--space-0);
  }

  .vitals-slash {
    font-family: var(--font-figures);
    font-size: var(--text-lg);
    color: var(--metal-dim);
  }

  .vitals-field-large .vitals-inline {
    font-size: var(--text-2xl);
  }

  .vitals-field-dice {
    text-align: end;
  }

  .vitals-field-dice .vitals-figure {
    justify-content: flex-end;
  }

  .vitals-field .vitals-figure {
    display: inline-flex;
    align-items: center;
    inline-size: auto;
    block-size: auto;
    white-space: nowrap;
  }

  .vitals-field {
    display: flex;
    min-width: 0;
    flex-direction: column;
    align-items: center;
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
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    grid-template-rows: auto auto;
    align-items: center;
    gap: var(--space-0) var(--space-2);
    min-width: 0;
  }

  .vitals-roll {
    grid-row: 1 / span 2;
    grid-column: 2;
    display: flex;
    align-items: center;
  }

  .vitals-roll > :global(.dnd-iconbtn) {
    inline-size: var(--space-6);
    block-size: var(--space-6);
  }

  .vitals-step {
    --step-h: var(--space-5);
    flex: none;
    inline-size: max-content;
    display: grid;
    grid-auto-flow: column;
    grid-auto-columns: auto;
    align-items: stretch;
    block-size: var(--step-h);
    border: var(--border-hair) solid var(--metal-dim);
    border-radius: var(--radius-sm);
    background: var(--texture-noise), var(--ground-deep);
    box-shadow: var(--bevel-down);
    overflow: hidden;
  }

  .vitals-step > :global(.dnd-iconbtn) {
    block-size: var(--step-h);
    inline-size: var(--step-h);
    padding: var(--space-1);
    border-radius: 0;
  }

  .vitals-amount {
    inline-size: var(--step-h);
    block-size: var(--step-h);
    padding: 0;
    border: none;
    border-inline: var(--border-hair) solid var(--metal-dim);
    border-radius: 0;
    background: none;
    box-shadow: none;
  }

  .vitals-step > .vitals-cell:first-child > .vitals-amount {
    border-inline-start: none;
  }

  .vitals-cell {
    display: flex;
  }

  .vitals-step-tall {
    grid-auto-flow: row;
    align-self: center;
    inline-size: var(--step-h);
    block-size: auto;
  }

  .vitals-step-tall .vitals-amount {
    border-inline: none;
    border-block: var(--border-hair) solid var(--metal-dim);
  }

  .vitals-field-dice {
    margin-inline-start: auto;
  }

  .vitals-field-dice .vitals-figure {
    font-size: var(--text-md);
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
