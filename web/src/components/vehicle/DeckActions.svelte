<script lang="ts">
  import { rollAttack } from '$lib/engine'
  import { rollFormula } from '$lib/chat'
  import { getAttacks, getFacing, getPerkSummary, getShipSteps, getTopSpeed } from '$lib/rules/vehicle'
  import type { Crewman, VehicleContext } from '$lib/rules/vehicle.types'
  import Button from '$components/ui/Button.svelte'

  const {
    ctx,
    crewman,
    onselect
  }: {
    /** The vessel whose actions are listed. */
    ctx: VehicleContext
    /** The character the reader sails as, whose numbers and perk actions fill the list. */
    crewman: Crewman | null
    /** Runs with a component the reader wants to read in full. */
    onselect?: (id: string) => void
  } = $props()

  const phase = $derived(getShipSteps(ctx, crewman))
  const attacks = $derived(getAttacks(ctx, crewman))
  const speed = $derived(getTopSpeed(ctx))
  const facing = $derived(getFacing(ctx))
</script>

<div class="da">
  <p class="da-rule">{ctx.system.shipPhase.rule}</p>

  {#each phase.steps as { step, working, blocked, perks } (step.key)}
    {@const armed = attacks.filter((entry) => entry.component.def.category === step.needs)}
    <section class="da-step" class:da-step-off={Boolean(blocked)} aria-label={step.name}>
      <h3 class="dnd-label da-head">{step.name}</h3>
      <p class="da-note">{step.text}</p>
      {#if blocked}
        <p class="da-blocked">{blocked}</p>
      {/if}

      {#if step.key === 'helm'}
        <p class="da-facts">Top Speed <strong>{speed.value} ft</strong> · Changes of Facing <strong>{facing.value ?? '—'}</strong></p>
      {/if}

      {#if step.actions.length}
        <ul class="da-actions">
          {#each step.actions as action (action.name)}
            <li><strong>{action.name}.</strong> {action.text}</li>
          {/each}
        </ul>
      {/if}

      {#each armed as { component, cond, modes } (component.id)}
        <div class="da-weapon" class:da-weapon-off={cond === 'broken'}>
          <button type="button" class="da-name" title="Read {component.label ?? component.def.name} in full" onclick={() => onselect?.(component.id)}>
            <span>{component.label ?? component.def.name}</span>
            <small class="da-cond-{cond}">{component.slot ?? ''}{cond !== 'functional' ? ` · ${cond}` : ''}</small>
          </button>
          {#each modes as mode (mode.key)}
            <div class="da-mode">
              <span class="da-mode-name">{mode.name}</span>
              <span class="da-mode-hit">{mode.unavailable ? '—' : (mode.toHit ?? '')}</span>
              <span class="da-mode-damage">{mode.damageShort}{mode.ranges.some((range) => range.value !== '—') ? ` · ${mode.ranges.map((range) => range.value).join('/')} ft` : ''}</span>
              {#if !mode.unavailable}
                <span class="da-mode-acts">
                  {#if mode.bonus != null}
                    <Button variant="ghost" size="sm" title="Roll {mode.name} to hit" onclick={() => void rollAttack(`${component.label ?? component.def.name} ${mode.name}`, mode.bonus ?? 0)}>Hit</Button>
                  {/if}
                  {#if mode.damageDice}
                    <Button variant="ghost" size="sm" title="Roll {mode.name} damage" onclick={() => void rollFormula(mode.damageDice ?? '')}>Dmg</Button>
                  {/if}
                </span>
              {/if}
            </div>
          {/each}
        </div>
      {/each}

      {#if step.needs && step.needs !== 'artillery' && armed.length === 0 && working.length}
        <p class="da-facts">
          {#each working as component, index (component.id)}
            {index ? ', ' : ''}<button type="button" class="da-link" onclick={() => onselect?.(component.id)}>{component.label ?? component.def.name}</button>
          {/each}
        </p>
      {/if}

      {#each perks as { perk, count } (perk.id)}
        <div class="da-perk">
          <p class="da-perk-line"><span class="da-perk-name">{perk.name}{count > 1 ? ` ×${count}` : ''}</span><small>{perk.actionType}</small></p>
          <p class="da-text">{getPerkSummary(perk, count, crewman)}</p>
        </div>
      {/each}
    </section>
  {/each}

  {#if phase.others.length}
    <section class="da-step" aria-label="Reactions and other perk actions">
      <h3 class="dnd-label da-head">Reactions and other actions</h3>
      {#each phase.others as { perk, count } (perk.id)}
        <div class="da-perk">
          <p class="da-perk-line"><span class="da-perk-name">{perk.name}{count > 1 ? ` ×${count}` : ''}</span><small>{perk.actionType}</small></p>
          <p class="da-text">{getPerkSummary(perk, count, crewman)}</p>
        </div>
      {/each}
    </section>
  {/if}
</div>

<style>
  .da {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    min-width: 0;
  }

  .da-rule,
  .da-note {
    margin: 0;
    font-size: var(--text-xs);
    color: var(--ink-faint);
  }

  .da-step {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    padding-block-end: var(--space-3);
    border-block-end: var(--border-hair) solid color-mix(in srgb, var(--metal-dim) 50%, transparent);
  }

  .da-step-off {
    opacity: 0.7;
  }

  .da-head {
    margin: 0;
    color: var(--metal-bright);
  }

  .da-blocked {
    margin: 0;
    font-size: var(--text-sm);
    color: var(--state-bad);
  }

  .da-facts {
    margin: 0;
    font-size: var(--text-sm);
    color: var(--ink-dim);
  }

  .da-facts strong {
    font-family: var(--font-figures);
    color: var(--ink);
  }

  .da-actions {
    display: grid;
    gap: var(--space-1);
    margin: 0;
    padding: 0;
    list-style: none;
    font-size: var(--text-sm);
    color: var(--ink-dim);
  }

  .da-actions strong {
    font-family: var(--font-display);
    font-weight: 700;
    letter-spacing: var(--tracking-wide);
    color: var(--ink);
  }

  .da-weapon,
  .da-perk {
    display: grid;
    gap: var(--space-1);
    padding: var(--space-2);
    border-radius: var(--radius-sm);
    background: var(--texture-noise), linear-gradient(180deg, var(--ground-raised), var(--ground-deep));
    box-shadow: var(--rim-thin);
  }

  .da-weapon-off {
    opacity: 0.55;
  }

  .da-name,
  .da-link {
    padding: 0;
    border: none;
    background: none;
    font-family: var(--font-display);
    letter-spacing: var(--tracking-wide);
    color: var(--metal-bright);
    text-align: start;
    cursor: pointer;
  }

  .da-name {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--space-2);
  }

  .da-name:hover,
  .da-name:focus-visible,
  .da-link:hover,
  .da-link:focus-visible {
    outline: none;
    text-shadow: var(--glow-text);
  }

  .da-name small,
  .da-perk-line small {
    font-family: var(--font-body);
    font-size: var(--text-xs);
    letter-spacing: normal;
    color: var(--ink-faint);
  }

  .da-mode {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: 0 var(--space-2);
    font-size: var(--text-sm);
  }

  .da-mode-name {
    color: var(--ink);
  }

  .da-mode-hit {
    font-family: var(--font-figures);
    font-weight: 700;
    color: var(--ink);
    text-align: end;
  }

  .da-mode-damage {
    font-size: var(--text-xs);
    color: var(--ember-core);
  }

  .da-mode-acts {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-1);
    block-size: var(--space-5);
  }

  .da-cond-impaired {
    color: var(--state-warn);
  }

  .da-cond-broken {
    color: var(--state-bad);
  }

  .da-perk-line {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--space-2);
    margin: 0;
  }

  .da-perk-name {
    font-family: var(--font-display);
    letter-spacing: var(--tracking-wide);
    color: var(--metal-bright);
  }

  .da-text {
    margin: 0;
    font-size: var(--text-sm);
    color: var(--ink-dim);
  }
</style>
