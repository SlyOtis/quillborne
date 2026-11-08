<script lang="ts">
  import type { Character, Vehicle, VehicleCrewman, VehicleFields } from '$lib/api/types'
  import { navigate } from 'sly-svelte-location-router'
  import type { Crewman, CrewPerk, Rulings, VehicleSystem } from '$lib/rules/vehicle.types'
  import Button from '$components/ui/Button.svelte'
  import Card from '$components/ui/Card.svelte'
  import Field from '$components/ui/Field.svelte'
  import CrewPerks from './CrewPerks.svelte'

  const {
    vehicle,
    system,
    rulings,
    steward = false,
    me,
    characters,
    seats,
    crewman,
    onsave,
    onperks
  }: {
    /** The vessel whose crew is read and changed. */
    vehicle: Vehicle
    /** The vehicle system that names the roles and the perks. */
    system: VehicleSystem
    /** The table's rulings, which move some perk limits. */
    rulings: Rulings
    /** The builder or the campaign DM, who may seat anyone and set every role. */
    steward?: boolean
    /** The signed in player. */
    me: string
    /** Every sheet the reader can see that could sail: their own and, for a steward, the campaign's. */
    characters: Character[]
    /** The sheets of the crew the reader can read, by character id. */
    seats: Record<string, Character>
    /** The reader's own character as crew, when they chose one. */
    crewman: Crewman | null
    /** Writes the given vessel fields. */
    onsave: (fields: VehicleFields) => Promise<void>
    /** Writes the reader's crew level and perks to their character. */
    onperks: (level: number, perks: CrewPerk[]) => Promise<void>
  } = $props()

  let bring = $state('')
  let role = $state('')
  let busy = $state(false)
  let error = $state<string | null>(null)

  const roles = $derived(system.crew.roles)
  const free = $derived(
    characters.filter((entry) => !vehicle.crew.some((seat) => seat.character_id === entry.id))
  )

  async function write(crew: VehicleCrewman[]) {
    busy = true
    error = null
    try {
      await onsave({ crew })
    } catch (reason) {
      error = reason instanceof Error ? reason.message : String(reason)
    } finally {
      busy = false
    }
  }

  function seat() {
    const sheet = characters.find((entry) => entry.id === bring)
    if (!sheet) return
    void write([...vehicle.crew, { character_id: sheet.id, user_id: sheet.owner_id, role: role || roles[roles.length - 1] || 'Crew' }]).then(() => {
      bring = ''
      role = ''
    })
  }

  function setRole(id: string, next: string) {
    void write(vehicle.crew.map((entry) => (entry.character_id === id ? { ...entry, role: next } : entry)))
  }

  function unseat(id: string) {
    void write(vehicle.crew.filter((entry) => entry.character_id !== id))
  }
</script>

<div class="vcrew">
  <section class="vcrew-part" aria-label="Crew">
    <header class="vcrew-divide">
      <h2 class="dnd-label vcrew-name">Crew</h2>
      <span class="vcrew-note">{vehicle.crew.length} aboard</span>
      <span class="vcrew-run"></span>
    </header>

    {#if error}
      <p class="vcrew-bad" role="alert">{error}</p>
    {/if}

    {#if vehicle.crew.length === 0}
      <p class="vcrew-quiet">Nobody has signed the ship’s articles yet.</p>
    {:else}
      <ul class="vcrew-list">
        {#each vehicle.crew as entry (entry.character_id)}
          {@const sheet = seats[entry.character_id]}
          <li class="vcrew-seat">
            <Card
              title={sheet?.metadata.name ?? 'A hidden sheet'}
              sub={sheet ? `${sheet.metadata.race} ${sheet.metadata.class}` : 'Kept private by its player'}
              image={sheet?.character?.info?.imageUrl}
              badge={entry.role}
              tone={entry.user_id === me ? 'ember' : 'metal'}
              onclick={sheet ? () => navigate(`/main/character/${sheet.id}`) : undefined}
            />
            {#if steward}
              <div class="vcrew-acts">
                <Field id="role-{entry.character_id}" label="Role">
                    <select id="role-{entry.character_id}" value={entry.role} disabled={busy} onchange={(event) => setRole(entry.character_id, event.currentTarget.value)}>
                      {#each roles as option (option)}
                        <option value={option}>{option}</option>
                      {/each}
                    </select>
                </Field>
                <Button variant="ghost" size="sm" disabled={busy} onclick={() => unseat(entry.character_id)}>Put ashore</Button>
              </div>
            {/if}
          </li>
        {/each}
      </ul>
    {/if}

    {#if steward && free.length > 0}
      <div class="vcrew-bring">
        <Field id="crew-bring" label="Sign on a character">
          <select id="crew-bring" bind:value={bring} disabled={busy}>
            <option value="">Choose a sheet</option>
            {#each free as entry (entry.id)}
              <option value={entry.id}>{entry.metadata.name}{entry.owner_id !== me ? ' (a player’s)' : ''}</option>
            {/each}
          </select>
        </Field>
        <Field id="crew-role" label="Role">
          <select id="crew-role" bind:value={role} disabled={busy}>
            <option value="">Crew</option>
            {#each roles as option (option)}
              <option value={option}>{option}</option>
            {/each}
          </select>
        </Field>
        <Button variant="secondary" size="sm" disabled={busy || !bring} onclick={seat}>Sign on</Button>
      </div>
    {/if}
  </section>

  <section class="vcrew-part" aria-label={system.crew.perks}>
    <header class="vcrew-divide">
      <h2 class="dnd-label vcrew-name">{system.crew.perks}</h2>
      {#if crewman}<span class="vcrew-note">{crewman.name}</span>{/if}
      <span class="vcrew-run"></span>
    </header>
    {#if crewman}
      <CrewPerks {system} {crewman} {rulings} editable={characters.some((entry) => entry.id === crewman.id && entry.owner_id === me)} onsave={onperks} />
    {:else}
      <p class="vcrew-quiet">Choose the character you sail as on the deck, and their {system.crew.level} and perks appear here.</p>
    {/if}
  </section>
</div>

<style>
  .vcrew {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: var(--space-6);
    min-width: 0;
  }

  .vcrew-part {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    min-width: 0;
  }

  .vcrew-divide {
    display: flex;
    align-items: center;
    gap: var(--space-3);
  }

  .vcrew-name {
    margin: 0;
    color: var(--metal-bright);
  }

  .vcrew-note {
    font-family: var(--font-figures);
    font-size: var(--text-xs);
    color: var(--ink-faint);
  }

  .vcrew-run {
    flex: 1;
    height: var(--border-hair);
    background: linear-gradient(90deg, var(--metal), var(--metal-dim) 40%, transparent);
  }

  .vcrew-list {
    display: grid;
    gap: var(--space-3);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .vcrew-seat {
    display: grid;
    gap: var(--space-2);
  }

  .vcrew-acts,
  .vcrew-bring {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-end;
    gap: var(--space-3);
  }

  .vcrew-quiet {
    margin: 0;
    font-size: var(--text-sm);
    font-style: italic;
    color: var(--ink-faint);
  }

  .vcrew-bad {
    margin: 0;
    font-size: var(--text-sm);
    color: var(--state-bad);
  }

  @container page (max-width: 1200px) {
    .vcrew {
      grid-template-columns: minmax(0, 1fr);
    }
  }
</style>
