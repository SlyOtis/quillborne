<script lang="ts">
  import { rollAttack } from '$lib/engine'
  import { rollFormula } from '$lib/chat'
  import { getAttacks, getPerkSummary } from '$lib/rules/vehicle'
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
    /** Runs with a weapon the reader wants to read in full. */
    onselect?: (id: string) => void
  } = $props()

  const attacks = $derived(getAttacks(ctx, crewman))
  const actions = $derived(
    (crewman?.perks ?? []).flatMap((entry) => {
      const perk = ctx.system.perks.find((candidate) => candidate.id === entry.id)
      return perk && !perk.actionType.startsWith('Passive') ? [{ perk, count: entry.count }] : []
    })
  )
</script>

<div class="da">
  <section class="da-part" aria-label="Attacks">
    <h3 class="dnd-label da-head">Attacks</h3>
    {#each attacks as { component, cond, modes } (component.id)}
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
    {:else}
      <p class="da-quiet">No weapon is installed.</p>
    {/each}
  </section>

  <section class="da-part" aria-label="Perk actions">
    <h3 class="dnd-label da-head">Perk actions</h3>
    {#each actions as { perk, count } (perk.id)}
      <div class="da-action">
        <p class="da-action-line"><span class="da-action-name">{perk.name}{count > 1 ? ` ×${count}` : ''}</span><small>{perk.actionType}</small></p>
        <p class="da-text">{getPerkSummary(perk, count, crewman)}</p>
      </div>
    {:else}
      <p class="da-quiet">{crewman ? 'No perk gives an action.' : 'Choose who you sail as to see their perk actions.'}</p>
    {/each}
  </section>
</div>

<style>
  .da {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    min-width: 0;
  }

  .da-part {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .da-head {
    margin: 0;
    color: var(--metal-bright);
  }

  .da-weapon,
  .da-action {
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

  .da-name {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--space-2);
    padding: 0;
    border: none;
    background: none;
    font-family: var(--font-display);
    letter-spacing: var(--tracking-wide);
    color: var(--metal-bright);
    text-align: start;
    cursor: pointer;
  }

  .da-name:hover,
  .da-name:focus-visible {
    outline: none;
    text-shadow: var(--glow-text);
  }

  .da-name small,
  .da-action-line small {
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

  .da-action-line {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--space-2);
    margin: 0;
  }

  .da-action-name {
    font-family: var(--font-display);
    letter-spacing: var(--tracking-wide);
    color: var(--metal-bright);
  }

  .da-text {
    margin: 0;
    font-size: var(--text-sm);
    color: var(--ink-dim);
  }

  .da-quiet {
    margin: 0;
    font-size: var(--text-sm);
    font-style: italic;
    color: var(--ink-faint);
  }
</style>
