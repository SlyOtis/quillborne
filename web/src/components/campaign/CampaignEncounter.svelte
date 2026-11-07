<script lang="ts">
  import { campaignService } from '$lib/firestore.service'
  import type { Campaign, CampaignEncounter, CharacterDocument, EncounterCombatant } from '$lib/firestore.types'
  import { rollDie } from '$lib/engine'
  import type { Npc } from '$lib/resources'
  import { user } from '$lib/stores/auth.store'
  import Button from '$components/ui/Button.svelte'
  import Field from '$components/ui/Field.svelte'
  import Panel from '$components/ui/Panel.svelte'

  const {
    campaign,
    characters,
    npcs
  }: {
    /** The campaign the encounters are run in. */
    campaign: Campaign
    /** The character sheets brought to the campaign, offered as combatants. */
    characters: CharacterDocument[]
    /** The characters written into the campaign, offered as combatants. */
    npcs: Npc[]
  } = $props()

  let encounters = $state<CampaignEncounter[]>([])
  let chosen = $state('')
  let title = $state('')
  let seat = $state('')
  let npc = $state('')
  let other = $state('')
  let health = $state(10)
  let bonus = $state(0)
  let busy = $state(false)
  let error = $state<string | null>(null)

  const isDm = $derived(Boolean($user && campaign.dm_id === $user.uid))
  const encounter = $derived(
    encounters.find((entry) => entry.id === chosen) ?? encounters.find((entry) => entry.is_active) ?? encounters[0] ?? null
  )
  const combatants = $derived(encounter ? order(encounter.combatants) : [])
  const turn = $derived(encounter && combatants.length > 0 ? encounter.turn % combatants.length : -1)

  $effect(() => {
    const stop = campaignService.postEncountersListener(campaign.id, (found) => {
      encounters = found.sort((a, b) => (Date.parse(b.created_at ?? '') || 0) - (Date.parse(a.created_at ?? '') || 0))
    })
    return stop
  })

  function order(list: EncounterCombatant[]): EncounterCombatant[] {
    return [...list].sort((a, b) => b.initiative - a.initiative || b.modifier - a.modifier || a.name.localeCompare(b.name))
  }

  async function write(task: () => Promise<void>) {
    busy = true
    error = null
    try {
      await task()
    } catch (reason) {
      error = reason instanceof Error ? reason.message : String(reason)
    } finally {
      busy = false
    }
  }

  function put(changes: Partial<CampaignEncounter>) {
    const held = encounter
    if (!held) return
    void write(() => campaignService.putEncounter(campaign.id, held.id, changes))
  }

  function create() {
    const named = title.trim()
    if (!named) return
    void write(async () => {
      const id = await campaignService.postEncounter(campaign.id, {
        title: named,
        is_active: true,
        share_campaigns: [campaign.id]
      })
      chosen = id
      title = ''
    })
  }

  function join(combatant: Omit<EncounterCombatant, 'id' | 'initiative' | 'conditions'>) {
    if (!encounter) return
    const next = order([
      ...encounter.combatants,
      { ...combatant, id: crypto.randomUUID(), initiative: 0, conditions: [] }
    ])
    put({ combatants: next })
  }

  function joinCharacter() {
    const found = characters.find((entry) => entry.id === seat)
    if (!found) return
    const info = found.character.info
    join({
      name: found.metadata.name,
      kind: 'character',
      character_id: found.id,
      modifier: info.initiative ?? 0,
      hit_points: info.hp?.current ?? 0,
      max_hit_points: info.hp?.max ?? 0,
      is_hit_points_known: true
    })
    seat = ''
  }

  function joinNpc() {
    const found = npcs.find((entry) => entry.id === npc)
    const name = found?.title ?? other.trim()
    if (!name) return
    join({
      name,
      kind: 'npc',
      ...(found ? { npc_id: found.id } : {}),
      modifier: bonus,
      hit_points: health,
      max_hit_points: health,
      is_hit_points_known: false
    })
    npc = ''
    other = ''
  }

  function roll() {
    const held = encounter
    if (!held || held.combatants.length === 0) return
    void write(async () => {
      const result = await rollDie(20, held.combatants.length)
      const rolled = held.combatants.map((entry, index) => ({ ...entry, initiative: (result.rolls[index] ?? 0) + entry.modifier }))
      await campaignService.putEncounter(campaign.id, held.id, { combatants: order(rolled), turn: 0, round: 1, is_active: true })
    })
  }

  function step() {
    if (!encounter || combatants.length === 0) return
    const next = turn + 1
    put(next >= combatants.length ? { turn: 0, round: encounter.round + 1 } : { turn: next })
  }

  function change(id: string, fields: Partial<EncounterCombatant>) {
    if (!encounter) return
    put({ combatants: order(combatants.map((entry) => (entry.id === id ? { ...entry, ...fields } : entry))) })
  }

  function heal(entry: EncounterCombatant, value: number) {
    change(entry.id, { hit_points: Math.max(0, Math.min(entry.max_hit_points, value)) })
  }

  function remove(id: string) {
    if (!encounter) return
    const at = combatants.findIndex((entry) => entry.id === id)
    const left = combatants.filter((entry) => entry.id !== id)
    const moved = at < turn ? turn - 1 : turn
    put({ combatants: left, turn: left.length === 0 || moved >= left.length ? 0 : moved })
  }

  function drop() {
    const held = encounter
    if (!held) return
    void write(async () => {
      await campaignService.deleteEncounter(campaign.id, held.id)
      chosen = ''
    })
  }
</script>

<div class="fray">
  {#if error}
    <p class="fray-alarm" role="alert">{error}</p>
  {/if}

  {#if isDm}
    <Panel title="Encounters">
      <div class="fray-body">
        {#if encounters.length > 0}
          <Field id="fray-chosen" label="Encounter">
            <select id="fray-chosen" value={encounter?.id ?? ''} onchange={(event) => (chosen = event.currentTarget.value)}>
              {#each encounters as entry (entry.id)}
                <option value={entry.id}>{entry.title}{entry.is_active ? ', running' : ''}</option>
              {/each}
            </select>
          </Field>
        {/if}

        <div class="fray-line">
          <Field id="fray-title" label="Set a new encounter">
            <input id="fray-title" type="text" placeholder="Ambush on the old road" bind:value={title} disabled={busy} />
          </Field>
          <Button variant="secondary" size="sm" disabled={busy || !title.trim()} onclick={create}>Set</Button>
        </div>
      </div>
    </Panel>
  {/if}

  {#if !encounter}
    <p class="fray-note">No encounter has been set.</p>
  {:else}
    <Panel title={encounter.title}>
      <div class="fray-body">
        <p class="fray-state">
          <span>Round {encounter.round}</span>
          <span>{combatants.length} in it</span>
          <span>{encounter.is_active ? 'Running' : 'Ended'}</span>
        </p>

        {#if combatants.length === 0}
          <p class="fray-note">Nobody has joined the fight yet.</p>
        {:else}
          <ol class="fray-order">
            {#each combatants as entry, index (entry.id)}
              <li class="fray-row" class:fray-row-on={index === turn && encounter.is_active} aria-current={index === turn && encounter.is_active ? 'step' : undefined}>
                <span class="fray-initiative">{entry.initiative}</span>
                <span class="fray-name">{entry.name}</span>
                {#if isDm}
                  <Field id="fray-hp-{entry.id}" label="Hit points of {entry.max_hit_points}">
                    <input
                      id="fray-hp-{entry.id}"
                      type="number"
                      value={entry.hit_points}
                      disabled={busy}
                      onchange={(event) => heal(entry, Number(event.currentTarget.value))}
                    />
                  </Field>
                  <Field id="fray-init-{entry.id}" label="Initiative">
                    <input
                      id="fray-init-{entry.id}"
                      type="number"
                      value={entry.initiative}
                      disabled={busy}
                      onchange={(event) => change(entry.id, { initiative: Number(event.currentTarget.value) })}
                    />
                  </Field>
                  <Button variant="ghost" size="sm" disabled={busy} onclick={() => remove(entry.id)}>Remove</Button>
                {:else}
                  <span class="fray-health">
                    {entry.is_hit_points_known ? `${entry.hit_points}/${entry.max_hit_points}` : 'Hidden'}
                  </span>
                {/if}
              </li>
            {/each}
          </ol>
        {/if}

        {#if isDm}
          <div class="fray-acts">
            <Button variant="secondary" size="sm" disabled={busy || combatants.length === 0} onclick={roll}>Roll initiative</Button>
            <Button variant="primary" size="sm" disabled={busy || combatants.length === 0 || !encounter.is_active} onclick={step}>Next turn</Button>
            <Button variant="ghost" size="sm" disabled={busy} onclick={() => put({ is_active: !encounter?.is_active })}>
              {encounter.is_active ? 'End encounter' : 'Run again'}
            </Button>
            <Button variant="danger" size="sm" disabled={busy} onclick={drop}>Delete</Button>
          </div>
        {/if}
      </div>
    </Panel>

    {#if isDm}
      <Panel title="Join the fight">
        <div class="fray-body">
          <div class="fray-line">
            <Field id="fray-seat" label="A character of the party">
              <select id="fray-seat" bind:value={seat} disabled={busy}>
                <option value="">Choose a character</option>
                {#each characters as entry (entry.id)}
                  <option value={entry.id}>{entry.metadata.name}</option>
                {/each}
              </select>
            </Field>
            <Button variant="secondary" size="sm" disabled={busy || !seat} onclick={joinCharacter}>Add</Button>
          </div>

          <div class="fray-grid">
            <Field id="fray-npc" label="An NPC of the campaign">
              <select id="fray-npc" bind:value={npc} disabled={busy}>
                <option value="">Choose one, or name someone below</option>
                {#each npcs as entry (entry.id)}
                  <option value={entry.id}>{entry.title}</option>
                {/each}
              </select>
            </Field>
            <Field id="fray-other" label="Or someone unnamed">
              <input id="fray-other" type="text" placeholder="Goblin" bind:value={other} disabled={busy || Boolean(npc)} />
            </Field>
            <Field id="fray-health" label="Hit points">
              <input id="fray-health" type="number" min="1" bind:value={health} disabled={busy} />
            </Field>
            <Field id="fray-bonus" label="Initiative bonus">
              <input id="fray-bonus" type="number" bind:value={bonus} disabled={busy} />
            </Field>
          </div>
          <div class="fray-acts">
            <Button variant="secondary" size="sm" disabled={busy || (!npc && !other.trim())} onclick={joinNpc}>Add</Button>
          </div>
        </div>
      </Panel>
    {/if}
  {/if}
</div>

<style>
  .fray {
    display: grid;
    gap: var(--space-5);
    min-width: 0;
  }

  .fray-body {
    display: grid;
    gap: var(--space-4);
    min-width: 0;
  }

  .fray-line {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-end;
    gap: var(--space-3);
  }

  .fray-grid {
    --fray-field: calc(var(--space-8) * 3);
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(var(--fray-field), 100%), 1fr));
    gap: var(--space-3);
  }

  .fray-acts {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: var(--space-3);
  }

  .fray-state {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-4);
    margin: 0;
    font-family: var(--font-figures);
    letter-spacing: var(--tracking-wide);
    font-size: var(--text-xs);
    color: var(--ink-faint);
  }

  .fray-order {
    display: grid;
    gap: var(--space-2);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .fray-row {
    display: grid;
    grid-template-columns: minmax(0, 0.15fr) minmax(0, 1fr) repeat(3, auto);
    align-items: end;
    gap: var(--space-3);
    padding: var(--space-3) var(--space-4);
    border: none;
    border-radius: var(--radius-sm);
    background: var(--texture-noise), linear-gradient(180deg, var(--ground-raised), var(--ground-deep));
    box-shadow: var(--rim-thin), inset 0 0 16px 2px var(--shade-hard);
    transition: box-shadow 0.18s ease, filter 0.18s ease;
  }

  .fray-row:hover {
    filter: brightness(1.06);
    box-shadow: var(--rim-thin), inset 0 0 16px 2px var(--shade-hard), 0 0 12px color-mix(in srgb, var(--metal) 35%, transparent);
  }

  .fray-row-on {
    background:
      radial-gradient(ellipse 60% 120% at 0% 50%, var(--ember-glow) 0%, transparent 70%),
      var(--texture-noise),
      linear-gradient(180deg, var(--ground-lift), var(--ground-deep));
    box-shadow: var(--rim), inset 0 0 16px 2px var(--shade-hard), 0 0 14px var(--ember-glow);
  }

  .fray-initiative {
    align-self: center;
    font-family: var(--font-figures);
    font-size: var(--text-lg);
    font-weight: 700;
    font-variant-numeric: lining-nums tabular-nums;
    color: var(--metal-bright);
    text-shadow: 0 1px 0 #000, 0 0 8px var(--ember-glow);
  }

  .fray-name {
    min-width: 0;
    align-self: center;
    font-family: var(--font-display);
    font-size: var(--text-sm);
    letter-spacing: var(--tracking-wide);
    color: var(--ink);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .fray-health {
    align-self: center;
    font-family: var(--font-figures);
    font-variant-numeric: lining-nums tabular-nums;
    font-size: var(--text-sm);
    color: var(--ink-dim);
  }

  .fray-note {
    margin: 0;
    font-size: var(--text-sm);
    color: var(--ink-dim);
  }

  .fray-alarm {
    margin: 0;
    padding: var(--space-3);
    border: var(--border-hair) solid var(--state-bad);
    border-radius: var(--radius-sm);
    background: var(--texture-noise), linear-gradient(180deg, color-mix(in srgb, var(--state-bad) 14%, var(--ground-raised)), var(--ground-deep));
    box-shadow: var(--bevel-down);
    font-size: var(--text-sm);
    color: var(--ink);
  }
  @media (max-width: 40rem) {
    .fray-row {
      grid-template-columns: auto minmax(0, 1fr);
    }
  }
</style>
