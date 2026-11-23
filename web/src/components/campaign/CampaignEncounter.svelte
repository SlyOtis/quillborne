<script lang="ts">
  import { deleteCampaignEncounter, getCampaignEncountersStream, getMonsters, postCampaignEncounter, postMonster, putCampaignEncounter } from '$lib/api'
  import type { Campaign, Encounter, EncounterCombatant, Monster } from '$lib/api/types'
  import type * as api from '$lib/api/types'
  import { rollDice, rollDie } from '$lib/engine'
  import {
    getBestiaryCombatants,
    getBestiaryMissing,
    getChallenge,
    getCombatantNames,
    getDifficulty,
    getEntryName,
    getFeatureKey,
    getMonsterBlock,
    getMonsterFields,
    getMonsterSources,
    getMonsterStats,
    getMonsterSystems,
    getRechargeKeys,
    getRolledHitPoints,
    getTurnSpent,
    LEGENDARY
  } from '$lib/rules/monster'
  import type { MonsterSource, MonsterStats, MonsterSystem } from '$lib/rules/monster.types'
  import { user } from '$lib/stores/auth.store'
  import MonsterBlock from '$components/monster/MonsterBlock.svelte'
  import BaseDialog from '$components/BaseDialog.svelte'
  import Button from '$components/ui/Button.svelte'
  import Chip from '$components/ui/Chip.svelte'
  import Field from '$components/ui/Field.svelte'
  import Glyph from '$components/ui/Glyph.svelte'
  import IconBtn from '$components/ui/IconBtn.svelte'
  import Panel from '$components/ui/Panel.svelte'
  import Picker, { type Pick as Choice } from '$components/ui/Picker.svelte'
  import Pool from '$components/ui/Pool.svelte'
  import Row from '$components/ui/Row.svelte'
  import SearchInput from '$components/ui/SearchInput.svelte'

  type Beast = Pick<Monster, 'name' | 'system' | 'size' | 'type' | 'alignment' | 'challenge' | 'description' | 'image'> & { stats: MonsterStats }

  type Offer = { id: string; beast: Beast; mark: string; row: boolean }

  const {
    campaign,
    characters,
    npcs
  }: {
    /** The campaign the encounters are run in. */
    campaign: Campaign
    /** The character sheets brought to the campaign, offered as combatants. */
    characters: api.Character[]
    /** The campaign's characters tagged as NPCs, offered as combatants. */
    npcs: api.Character[]
  } = $props()

  let encounters = $state<Encounter[]>([])
  let systems = $state<MonsterSystem[]>([])
  let sources = $state<MonsterSource[]>([])
  let rows = $state<Monster[]>([])
  let chosen = $state('')
  let title = $state('')
  let seat = $state('')
  let npc = $state('')
  let other = $state('')
  let health = $state(10)
  let bonus = $state(0)
  let busy = $state(false)
  let error = $state<string | null>(null)
  let noted = $state('')
  let adding = $state(false)
  let hunt = $state('')
  let offered = $state('')
  let count = $state(1)
  let mode = $state('average')

  const isDm = $derived(Boolean($user && campaign.dm_id === $user.user_id))
  const encounter = $derived(
    encounters.find((entry) => entry.id === chosen) ?? encounters.find((entry) => entry.is_active) ?? encounters[0] ?? null
  )
  const combatants = $derived(encounter ? order(encounter.combatants) : [])
  const turn = $derived(encounter && combatants.length > 0 ? encounter.turn % combatants.length : -1)
  const system = $derived(systems[0] ?? null)
  const conditions = $derived<Choice[]>((system?.conditions ?? []).map((one) => ({ id: one.id, mark: 'condition', word: '', name: one.name, tone: 'thing' })))

  const offers = $derived<Offer[]>([
    ...sources.flatMap((source) => {
      const held = systems.find((one) => one.id === source.system)
      if (!held) return []
      return source.monsters.map((entry) => ({
        id: entry.slug,
        beast: { ...entry, system: source.system, image: '', stats: getMonsterStats(held, entry.stats) },
        mark: source.title,
        row: false
      }))
    }),
    ...rows.flatMap((monster) => {
      const held = systems.find((one) => one.id === monster.system)
      if (!held) return []
      return [
        {
          id: monster.id,
          beast: { ...monster, stats: getMonsterStats(held, monster.stats) },
          mark: monster.owner_id === campaign.id ? campaign.name : held.labels.homebrew,
          row: true
        }
      ]
    })
  ])
  const found = $derived(offers.filter((one) => one.beast.name.toLowerCase().includes(hunt.trim().toLowerCase())))
  const offer = $derived(offers.find((one) => one.id === offered) ?? null)
  const many = $derived(Math.max(1, Math.floor(count)))

  const fought = $derived(
    combatants.flatMap((entry) => {
      const beast = getBeast(entry)
      return beast ? [{ entry, beast }] : []
    })
  )
  const current = $derived(turn >= 0 && encounter?.is_active ? (fought.find((one) => one.entry.id === combatants[turn]?.id) ?? null) : null)
  const party = $derived.by(() => {
    const joined = combatants.flatMap((entry) => characters.filter((one) => entry.kind === 'character' && one.id === entry.character_id))
    return (joined.length ? joined : characters).map((one) => one.metadata.level)
  })
  const difficulty = $derived(
    system ? getDifficulty(system, party, fought.reduce((sum, one) => sum + (getChallenge(system, one.beast.challenge)?.xp ?? 0), 0)) : null
  )
  const band = $derived(
    difficulty?.difficulty ? (difficulty.budgets.find((one) => one.id === difficulty.difficulty?.id) ?? difficulty.budgets.at(-1) ?? null) : null
  )

  $effect(() => {
    const stop = getCampaignEncountersStream(campaign.id, (found) => {
      encounters = found.sort((a, b) => (Date.parse(b.created_at ?? '') || 0) - (Date.parse(a.created_at ?? '') || 0))
    })
    return stop
  })

  $effect(() => {
    const running = isDm
    let live = true
    Promise.all([getMonsterSystems(), getMonsterSources(), running ? getMonsters() : Promise.resolve([] as Monster[])])
      .then(([loadedSystems, loadedSources, loadedRows]) => {
        if (!live) return
        systems = loadedSystems
        sources = loadedSources
        rows = loadedRows
      })
      .catch((reason) => live && (error = reason instanceof Error ? reason.message : String(reason)))
    return () => {
      live = false
    }
  })

  function getBeast(entry: EncounterCombatant): Beast | null {
    if (entry.kind !== 'monster') return null
    if (entry.monster_id) return offers.find((one) => one.row && one.id === entry.monster_id)?.beast ?? null
    return offers.find((one) => !one.row && one.id === entry.monster_slug)?.beast ?? null
  }

  function getSystem(beast: Beast): MonsterSystem | null {
    return systems.find((one) => one.id === beast.system) ?? null
  }

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

  function put(changes: Partial<Encounter>) {
    const held = encounter
    if (!held) return
    void write(() => putCampaignEncounter(campaign.id, held.id, changes))
  }

  function create() {
    const named = title.trim()
    if (!named) return
    void write(async () => {
      const id = await postCampaignEncounter(campaign.id, {
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
    const name = found?.metadata.name ?? other.trim()
    if (!name) return
    join({
      name,
      kind: 'npc',
      ...(found ? { character_id: found.id } : {}),
      modifier: bonus,
      hit_points: health,
      max_hit_points: health,
      is_hit_points_known: false
    })
    npc = ''
    other = ''
  }

  function joinMonsters() {
    const held = encounter
    const picked = offer
    const rules = picked && getSystem(picked.beast)
    if (!held || !picked || !rules) return
    const amount = many
    void write(async () => {
      const block = getMonsterBlock(rules, picked.beast)
      const dice = picked.beast.stats.hit_dice
      const thrown = mode === 'rolled' ? (await rollDice([{ die: block.hitDie, amount: dice * amount }]))[0] : []
      const names = getCombatantNames(picked.beast.name, amount, held.combatants.map((one) => one.name))
      const joined = names.map((name, at): EncounterCombatant => {
        const hp = thrown.length ? getRolledHitPoints(rules, block, thrown.slice(at * dice, (at + 1) * dice).reduce((sum, one) => sum + one, 0)) : block.hitPoints
        return {
          id: crypto.randomUUID(),
          name,
          kind: 'monster',
          ...(picked.row ? { monster_id: picked.id } : { monster_slug: picked.id }),
          armor_class: picked.beast.stats.ac,
          modifier: block.initiative,
          initiative: 0,
          hit_points: hp,
          max_hit_points: hp,
          conditions: [],
          is_hit_points_known: false
        }
      })
      await putCampaignEncounter(campaign.id, held.id, { combatants: order([...held.combatants, ...joined]) })
      adding = false
      offered = ''
      count = 1
    })
  }

  function roll() {
    const held = encounter
    if (!held || held.combatants.length === 0) return
    void write(async () => {
      const result = await rollDie(20, held.combatants.length)
      const rolled = held.combatants.map((entry, index) => ({ ...entry, initiative: (result.rolls[index] ?? 0) + entry.modifier }))
      await putCampaignEncounter(campaign.id, held.id, { combatants: order(rolled), turn: 0, round: 1, is_active: true })
    })
  }

  function step() {
    const held = encounter
    if (!held || combatants.length === 0) return
    const next = turn + 1 >= combatants.length ? 0 : turn + 1
    const changes: Partial<Encounter> = next === 0 ? { turn: 0, round: held.round + 1 } : { turn: next }
    const coming = combatants[next]
    const beast = getBeast(coming)
    const rules = beast && getSystem(beast)
    if (!beast || !rules || !coming.spent) {
      put(changes)
      return
    }
    const spent = coming.spent
    void write(async () => {
      const keys = getRechargeKeys(beast.stats, spent)
      const thrown = keys.length ? (await rollDie(rules.rechargeDie, keys.length)).rolls : []
      const fresh = getTurnSpent(rules, beast.stats, spent, Object.fromEntries(keys.map((key, at) => [key, thrown[at] ?? 0])))
      noted = keys
        .map((key, at) => `${coming.name}'s ${key.slice(key.indexOf('.') + 1)} ${fresh[key] ? 'stays spent' : 'recharges'} on a ${thrown[at]}.`)
        .join(' ')
      await putCampaignEncounter(campaign.id, held.id, {
        ...changes,
        combatants: combatants.map((entry) => (entry.id === coming.id ? { ...entry, spent: fresh } : entry))
      })
    })
  }

  function change(id: string, fields: Partial<EncounterCombatant>) {
    if (!encounter) return
    put({ combatants: order(combatants.map((entry) => (entry.id === id ? { ...entry, ...fields } : entry))) })
  }

  function heal(entry: EncounterCombatant, value: number) {
    change(entry.id, { hit_points: Math.max(0, Math.min(entry.max_hit_points, value)) })
  }

  function spend(entry: EncounterCombatant, key: string, used: number) {
    const spent = { ...(entry.spent ?? {}), [key]: used }
    change(entry.id, { spent: Object.fromEntries(Object.entries(spent).filter(([, value]) => value > 0)) })
  }

  function remove(id: string) {
    if (!encounter) return
    const at = combatants.findIndex((entry) => entry.id === id)
    const left = combatants.filter((entry) => entry.id !== id)
    const moved = at < turn ? turn - 1 : turn
    put({ combatants: left, turn: left.length === 0 || moved >= left.length ? 0 : moved })
  }

  async function shelve(held: Encounter, picked: { entry: EncounterCombatant; beast: Beast }[], changes: Partial<Encounter> = {}) {
    const names = Object.fromEntries(picked.map((one) => [one.entry.id, one.beast.name]))
    const kept = await getMonsters(campaign.id)
    const made = await Promise.all(
      getBestiaryMissing(Object.values(names), kept).flatMap((name) => {
        const beast = picked.find((one) => one.beast.name === name)?.beast
        return beast ? [postMonster({ ...getMonsterFields(beast.system, beast), owner_id: campaign.id })] : []
      })
    )
    await putCampaignEncounter(campaign.id, held.id, { ...changes, combatants: getBestiaryCombatants(held.combatants, names, [...kept, ...made]) })
    rows = [...rows.filter((one) => !made.some((copy) => copy.id === one.id)), ...made]
    noted = made.length
      ? `${made.map((one) => one.name).join(', ')} written into the bestiary of ${campaign.name}.`
      : picked.length
        ? `The bestiary of ${campaign.name} already holds them.`
        : ''
  }

  function end() {
    const held = encounter
    if (!held) return
    void write(() => shelve(held, fought, { is_active: false }))
  }

  function bestow(entry: EncounterCombatant) {
    const held = encounter
    const beast = getBeast(entry)
    if (!held || !beast) return
    void write(() => shelve(held, fought.filter((one) => one.beast.name === beast.name)))
  }

  function drop() {
    const held = encounter
    if (!held) return
    void write(async () => {
      await deleteCampaignEncounter(campaign.id, held.id)
      chosen = ''
    })
  }
</script>

{#snippet trackers(entry: EncounterCombatant, beast: Beast)}
  {@const rules = getSystem(beast)}
  {#if rules}
    {#each rules.features as kind (kind.id)}
      {#each beast.stats.features[kind.id] ?? [] as feature, place (place)}
        {@const key = getFeatureKey(kind.id, feature)}
        {@const used = entry.spent?.[key] ?? 0}
        {#if feature.recharge}
          <Pool
            title={feature.name}
            note="{rules.labels.recharge} {feature.recharge < rules.rechargeDie ? `${feature.recharge}\u2013${rules.rechargeDie}` : feature.recharge}"
            max={1}
            current={1 - Math.min(1, used)}
            view="pips"
            onput={(left) => spend(entry, key, 1 - left)}
          />
        {:else if feature.uses}
          <Pool
            title={feature.name}
            note="{feature.uses}{rules.labels.perDay}"
            max={feature.uses}
            current={Math.max(0, feature.uses - used)}
            view="pips"
            onput={(left) => spend(entry, key, (feature.uses ?? 0) - left)}
          />
        {/if}
      {/each}
    {/each}
    {#if beast.stats.legendary_uses}
      {@const uses = beast.stats.legendary_uses}
      <Pool
        title={rules.labels.legendaryUses}
        max={uses}
        current={Math.max(0, uses - (entry.spent?.[LEGENDARY] ?? 0))}
        view="pips"
        onput={(left) => spend(entry, LEGENDARY, uses - left)}
      />
    {/if}
  {/if}
{/snippet}

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
          {#if isDm && system && difficulty?.difficulty && band}
            <span class="fray-difficulty">
              {system.labels.difficulty} {difficulty.difficulty.name}, {difficulty.xp.toLocaleString('en-US')} of {band.value.toLocaleString('en-US')} {system.labels.experience}
            </span>
          {/if}
        </p>

        {#if combatants.length === 0}
          <p class="fray-note">Nobody has joined the fight yet.</p>
        {:else}
          <ol class="fray-order">
            {#each combatants as entry, index (entry.id)}
              {@const beast = getBeast(entry)}
              <li class="fray-row" class:fray-row-on={index === turn && encounter.is_active} aria-current={index === turn && encounter.is_active ? 'step' : undefined}>
                <span class="fray-initiative">{entry.initiative}</span>
                <span class="fray-who">
                  <span class="fray-name">{entry.name}</span>
                  {#if isDm && entry.armor_class !== undefined && system}
                    <span class="fray-armor">{system.labels.armorClass} {entry.armor_class}</span>
                  {/if}
                </span>
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
                  <span class="fray-row-acts">
                    {#if beast}
                      <IconBtn title="Add {beast.name} to the bestiary" disabled={busy} onclick={() => bestow(entry)}>
                        <Glyph name="book" size="md" />
                      </IconBtn>
                    {/if}
                    <Button variant="ghost" size="sm" disabled={busy} onclick={() => remove(entry.id)}>Remove</Button>
                  </span>
                  <div class="fray-row-more">
                    <Picker
                      id="fray-conditions-{entry.id}"
                      label="Conditions"
                      picked={conditions.filter((one) => entry.conditions.includes(one.id))}
                      options={conditions}
                      placeholder="Pick a condition"
                      disabled={busy}
                      onchange={(picked) => change(entry.id, { conditions: picked.map((one) => one.id) })}
                    />
                    {#if beast}
                      {@render trackers(entry, beast)}
                    {/if}
                  </div>
                {:else}
                  <span class="fray-health">
                    {entry.is_hit_points_known ? `${entry.hit_points}/${entry.max_hit_points}` : 'Hidden'}
                  </span>
                  {#if entry.conditions.length && system}
                    <p class="fray-row-more fray-conditions">
                      {#each entry.conditions as one (one)}<Chip still>{getEntryName(system.conditions, one)}</Chip>{/each}
                    </p>
                  {/if}
                {/if}
              </li>
            {/each}
          </ol>
        {/if}

        {#if isDm && current}
          {@const rules = getSystem(current.beast)}
          {#if rules}
            <MonsterBlock system={rules} monster={{ ...current.beast, name: current.entry.name }} layout="compact" rolls />
          {/if}
        {/if}

        {#if isDm}
          <p class="fray-note" role="status">{noted}</p>
          <div class="fray-acts">
            <Button variant="secondary" size="sm" disabled={busy || combatants.length === 0} onclick={roll}>Roll initiative</Button>
            <Button variant="primary" size="sm" disabled={busy || combatants.length === 0 || !encounter.is_active} onclick={step}>Next turn</Button>
            <Button variant="ghost" size="sm" disabled={busy} onclick={() => (encounter?.is_active ? end() : put({ is_active: true }))}>
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

          <div class="fray-line">
            <p class="fray-note">A monster from the bestiary, as many as the fight holds.</p>
            <Button variant="secondary" size="sm" disabled={busy || !system} onclick={() => (adding = true)}>Add monster</Button>
          </div>

          <div class="fray-grid">
            <Field id="fray-npc" label="An NPC of the campaign">
              <select id="fray-npc" bind:value={npc} disabled={busy}>
                <option value="">Choose one, or name someone below</option>
                {#each npcs as entry (entry.id)}
                  <option value={entry.id}>{entry.metadata.name}</option>
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

<BaseDialog bind:isOpen={adding} title="Add monsters to {encounter?.title ?? 'the fight'}" width="min(56rem, 94vw)" maxHeight="88vh">
  <div class="fray-picker">
    <SearchInput bind:value={hunt} placeholder="Search the bestiary..." label="Search the bestiary" autofocus />
    <span class="fray-count">{found.length} of {offers.length}</span>
    <div class="fray-list">
      {#each found as one (one.id)}
        {@const rules = getSystem(one.beast)}
        <Row
          title={one.beast.name}
          sub={rules
            ? `${rules.labels.challenge} ${getChallenge(rules, one.beast.challenge)?.name ?? ''}, ${getEntryName(rules.sizes, one.beast.size)} ${getEntryName(rules.types, one.beast.type)}`
            : ''}
          mark={one.mark}
          image={one.beast.image || undefined}
          on={one.id === offered}
          onclick={() => (offered = one.id)}
        />
      {:else}
        <span class="fray-note">No monster in the bestiary answers to that.</span>
      {/each}
    </div>
    <div class="fray-grid">
      <Field id="fray-count" label="How many">
        <input id="fray-count" type="number" min="1" max="20" bind:value={count} disabled={busy} />
      </Field>
      <Field id="fray-rolled" label="Hit points">
        <select id="fray-rolled" bind:value={mode} disabled={busy}>
          <option value="average">Average</option>
          <option value="rolled">Rolled with the hit dice</option>
        </select>
      </Field>
    </div>
    <div class="fray-acts">
      <Button variant="ghost" size="sm" onclick={() => (adding = false)}>Cancel</Button>
      <Button variant="primary" size="sm" loading={busy} disabled={!offer} onclick={joinMonsters}>
        {offer ? (many > 1 ? `Add ${offer.beast.name} \u00d7 ${many}` : `Add ${offer.beast.name}`) : 'Choose a monster'}
      </Button>
    </div>
  </div>
</BaseDialog>

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
    text-shadow: 0 1px 0 var(--shadow-ink), 0 0 8px var(--ember-glow);
  }

  .fray-who {
    display: flex;
    flex-direction: column;
    gap: var(--space-0);
    align-self: center;
    min-width: 0;
  }

  .fray-armor {
    font-family: var(--font-figures);
    font-size: var(--text-xs);
    letter-spacing: var(--tracking-wide);
    color: var(--ink-faint);
  }

  .fray-row-acts {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  .fray-row-more {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-start;
    gap: var(--space-3);
    grid-column: 1 / -1;
    min-width: 0;
    margin: 0;
  }

  .fray-conditions {
    gap: var(--space-1);
  }

  .fray-difficulty {
    color: var(--metal);
  }

  .fray-picker {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    padding: var(--space-4) var(--space-5) var(--space-5);
  }

  .fray-count {
    font-family: var(--font-figures);
    font-size: var(--text-xs);
    color: var(--ink-faint);
  }

  .fray-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    max-height: min(32rem, 52vh);
    overflow-y: auto;
    padding: var(--space-1);
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
