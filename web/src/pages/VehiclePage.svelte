<script lang="ts">
  import { onMount, setContext } from 'svelte'
  import { navigate, resolvedRoute } from 'sly-svelte-location-router'
  import { getTheme, setTheme } from '$lib/dialogs/theme'
  import { campaignService, characterService, userService, vehicleService } from '$lib/firestore.service'
  import type { Campaign, CharacterDocument, Vehicle, VehicleFields } from '$lib/firestore.types'
  import {
    getContext as getVehicleContext,
    getCrewman,
    getCrewResolved,
    getLayout,
    getMergedVehicleSystem,
    getMissing,
    getTopSpeed,
    getFacing,
    getVehicleStats,
    getVehicleSystem
  } from '$lib/rules/vehicle'
  import type { ComponentState, Crewman, CrewPerk, OverlayKey, VehicleSystem } from '$lib/rules/vehicle.types'
  import type { ResolvedCharacter } from '$lib/rules/spec.types'
  import { user } from '$lib/stores/auth.store'
  import { anyDialogOpen, uiStore } from '$lib/stores/ui.store'
  import Button from '$components/ui/Button.svelte'
  import Field from '$components/ui/Field.svelte'
  import Fold from '$components/ui/Fold.svelte'
  import Ornament from '$components/ui/Ornament.svelte'
  import Shell from '$components/ui/Shell.svelte'
  import Stat from '$components/ui/Stat.svelte'
  import Stops from '$components/ui/Stops.svelte'
  import MenuPanel from '$components/MenuPanel.svelte'
  import Chat from '$chat/Chat.svelte'
  import ComponentPanel from '$components/vehicle/ComponentPanel.svelte'
  import DeckActions from '$components/vehicle/DeckActions.svelte'
  import DeckSheet from '$components/vehicle/DeckSheet.svelte'
  import VehicleCrew from '$components/vehicle/VehicleCrew.svelte'
  import VehicleDesign from '$components/vehicle/VehicleDesign.svelte'
  import VehicleHistory from '$components/vehicle/VehicleHistory.svelte'
  import VehicleMap from '$components/vehicle/VehicleMap.svelte'
  import VehiclePapers from '$components/vehicle/VehiclePapers.svelte'
  import VehicleRulings from '$components/vehicle/VehicleRulings.svelte'

  setContext('dialogState', {
    get isAnyDialogOpen() {
      return $anyDialogOpen
    },
    setDialogState: uiStore.setDialogState
  })

  const STOPS = [
    { id: 'deck', label: 'Deck' },
    { id: 'design', label: 'Design' },
    { id: 'crew', label: 'Crew' },
    { id: 'history', label: 'History' },
    { id: 'rules', label: 'Rules' },
    { id: 'papers', label: 'Papers' }
  ] as const

  const OVERLAYS: Record<OverlayKey, string> = {
    arcs: 'Firing arcs',
    movement: 'Movement',
    locations: 'Slots',
    conditions: 'Conditions',
    navalGrid: 'Naval grid',
    boardingGrid: 'Boarding grid'
  }

  const OVERLAY_KEY = 'dnd_vehicle_overlays'

  const NOBODY = 'nobody'

  const steps = $derived($resolvedRoute.path.split('/').filter(Boolean))
  const vehicleId = $derived(steps[1] === 'vehicles' ? (steps[2] ?? '') : '')
  const stop = $derived(STOPS.find((entry) => entry.id === steps[3])?.id ?? 'deck')

  let vehicle = $state<Vehicle | null>(null)
  let base = $state<VehicleSystem | null>(null)
  let campaign = $state<Campaign | null>(null)
  let mine = $state<CharacterDocument[]>([])
  let table = $state<CharacterDocument[]>([])
  let seats = $state<Record<string, CharacterDocument>>({})
  let names = $state<Record<string, string>>({})
  let aboard = $state('')
  let sheetsRead = $state(false)
  let overlaysOpen = $state(false)
  let resolved = $state<ResolvedCharacter | null>(null)
  let selected = $state<string | null>(null)
  let loading = $state(true)
  let error = $state<string | null>(null)
  let overlays = $state<Record<OverlayKey, boolean>>({
    arcs: false,
    movement: false,
    locations: false,
    conditions: false,
    navalGrid: false,
    boardingGrid: false
  })

  onMount(() => {
    setTheme(getTheme())
    try {
      const held = JSON.parse(localStorage.getItem(OVERLAY_KEY) ?? '{}') as Partial<Record<OverlayKey, boolean>>
      for (const key of Object.keys(overlays) as OverlayKey[]) if (typeof held[key] === 'boolean') overlays[key] = held[key]
    } catch {
      localStorage.removeItem(OVERLAY_KEY)
    }
  })

  $effect(() => {
    localStorage.setItem(OVERLAY_KEY, JSON.stringify(overlays))
  })

  $effect(() => {
    const id = vehicleId
    if (!id) return
    loading = true
    error = null
    const live = vehicleService.subscribeToVehicle(id, (loaded) => {
      vehicle = loaded
      loading = false
    })
    return () => live()
  })

  $effect(() => {
    const id = vehicle?.system
    if (!id || base?.id === id) return
    getVehicleSystem(id)
      .then((loaded) => (base = loaded))
      .catch((reason) => (error = reason instanceof Error ? reason.message : String(reason)))
  })

  $effect(() => {
    const id = vehicle?.campaign_id ?? null
    if (!id) {
      campaign = null
      table = []
      return
    }
    if (campaign?.id === id) return
    void Promise.all([campaignService.getCampaign(id), campaignService.getCampaignCharacters(id).catch(() => [])]).then(([record, sheets]) => {
      campaign = record
      table = sheets
    })
  })

  $effect(() => {
    if (!$user) return
    void characterService
      .getUserCharacters()
      .then((sheets) => (mine = sheets))
      .finally(() => (sheetsRead = true))
  })

  const crewKey = $derived(JSON.stringify(vehicle?.crew.map((entry) => entry.character_id) ?? []))

  $effect(() => {
    const ids = JSON.parse(crewKey) as string[]
    void Promise.all(ids.map((id) => characterService.getCharacter(id).catch(() => null))).then((sheets) => {
      seats = Object.fromEntries(sheets.filter((sheet): sheet is CharacterDocument => sheet !== null).map((sheet) => [sheet.id, sheet]))
    })
  })

  const peopleKey = $derived(JSON.stringify([...new Set([...(vehicle?.history.map((entry) => entry.user_id) ?? []), ...(vehicle?.requests.map((entry) => entry.user_id) ?? [])])]))

  $effect(() => {
    const ids = JSON.parse(peopleKey) as string[]
    if (ids.length === 0) return
    void userService.getProfiles(ids).then((profiles) => {
      names = Object.fromEntries(profiles.map((profile) => [profile.uid, profile.display_name || profile.email]))
    })
  })

  const me = $derived($user?.uid ?? '')
  const steward = $derived(Boolean(vehicle && me && (vehicle.owner_id === me || campaign?.dm_id === me)))
  const crew = $derived(Boolean(vehicle?.crew.some((entry) => entry.user_id === me)))
  const keeps = $derived(steward || crew)
  const system = $derived(base && vehicle ? getMergedVehicleSystem(base, vehicle.overlay) : null)
  const layout = $derived(system && vehicle ? (getLayout(system, vehicle.layout) ?? null) : null)
  const ctx = $derived(
    system && layout && vehicle ? getVehicleContext(system, layout, vehicle.components, vehicle.stats, vehicle.states, vehicle.rulings) : null
  )
  const missing = $derived(system && vehicle ? getMissing(system, vehicle.components) : [])
  const problem = $derived(
    !vehicle
      ? null
      : !vehicle.system
        ? 'This vessel names no vehicle system, so it has no deck to draw.'
        : system && !layout
          ? `The deck layout “${vehicle.layout || 'none'}” is not part of ${system.title}, so there is no deck to draw.`
          : null
  )
  const stats = $derived(ctx ? getVehicleStats(ctx) : [])
  const movement = $derived(ctx ? { topSpeed: getTopSpeed(ctx).value, facing: getFacing(ctx).value } : null)
  const chosen = $derived(ctx?.components.find((entry) => entry.id === selected) ?? null)
  const hull = $derived(ctx?.components.find((entry) => entry.def.category === 'hull') ?? null)

  const sailors = $derived([...mine, ...table.filter((entry) => !mine.some((own) => own.id === entry.id))])
  const choices = $derived(
    [...mine].sort((a, b) => {
      const crewed = (doc: CharacterDocument) => Number(Boolean(vehicle?.crew.some((entry) => entry.character_id === doc.id)))
      const seated = (doc: CharacterDocument) => Number(Boolean(vehicle?.campaign_id && doc.campaign_id === vehicle.campaign_id))
      const trained = (doc: CharacterDocument) => Number(Boolean(vehicle && doc.character?.crew?.[vehicle.system]))
      const played = (doc: CharacterDocument) => Date.parse(String(doc.metadata.last_played_at ?? '')) || 0
      return crewed(b) - crewed(a) || seated(b) - seated(a) || trained(b) - trained(a) || played(b) - played(a)
    })
  )

  $effect(() => {
    if (!vehicleId || !sheetsRead) return
    if (aboard === NOBODY || choices.some((entry) => entry.id === aboard)) return
    const held = localStorage.getItem(`dnd_vehicle_aboard_${vehicleId}`)
    aboard = held === NOBODY ? NOBODY : (choices.find((entry) => entry.id === held)?.id ?? choices[0]?.id ?? NOBODY)
  })

  const sheet = $derived(choices.find((entry) => entry.id === aboard) ?? null)

  $effect(() => {
    const character = sheet?.character
    if (!character) {
      resolved = null
      return
    }
    let live = true
    void getCrewResolved(character).then((value) => live && (resolved = value))
    return () => {
      live = false
    }
  })

  const crewman = $derived<Crewman | null>(sheet && system ? getCrewman(sheet.id, sheet.character, resolved, system.id) : null)

  function choose(id: string) {
    aboard = id
    localStorage.setItem(`dnd_vehicle_aboard_${vehicleId}`, id)
  }

  function open(next: string) {
    navigate(`/main/vehicles/${vehicleId}${next === 'deck' ? '' : `/${next}`}`)
  }

  async function save(fields: VehicleFields) {
    if (!vehicle) return
    vehicle = await vehicleService.putVehicle(vehicle.id, fields)
  }

  function putState(id: string, state: ComponentState) {
    if (!vehicle) return
    const states = { ...vehicle.states, [id]: state }
    vehicle = { ...vehicle, states }
    save({ states }).catch((reason) => (error = reason instanceof Error ? reason.message : String(reason)))
  }

  async function putPerks(level: number, perks: CrewPerk[]) {
    if (!sheet || !system) return
    const character = { ...sheet.character, crew: { ...(sheet.character.crew ?? {}), [system.id]: { level, perks } } }
    await characterService.updateCharacter(sheet.id, character)
    mine = mine.map((entry) => (entry.id === sheet.id ? { ...entry, character } : entry))
  }

  function rule(id: string, option: string) {
    if (!vehicle) return
    save({ rulings: { ...vehicle.rulings, [id]: option } }).catch((reason) => (error = reason instanceof Error ? reason.message : String(reason)))
  }

  const toneOf = (tone: string | undefined) => (tone === 'bad' ? 'bane' : tone === 'good' ? 'verdigris' : tone === 'warn' ? 'ember' : 'metal')
  const back = $derived(vehicle?.campaign_id ? `/main/campaign/${vehicle.campaign_id}/vehicles` : '/main/vehicles')
</script>

<Shell title={vehicle?.name ?? 'Vehicle'} width="full" back={() => navigate(back)}>
  {#snippet menu()}
    <MenuPanel />
  {/snippet}

  {#snippet chat()}
    <Chat />
  {/snippet}

  {#snippet nav()}
    <Stops stops={STOPS} {stop} onopen={open} />
  {/snippet}

  {#if loading}
    <div class="dnd-loading"><span class="dnd-spinner"></span></div>
  {:else if !vehicle}
    <div class="ves-void">
      <p class="dnd-empty">That vehicle does not exist, or you do not sail with it.</p>
      <Button variant="secondary" size="sm" onclick={() => navigate('/main/vehicles')}>Back to the dock</Button>
    </div>
  {:else if problem || (error && !system)}
    <div class="ves-void">
      <p class="ves-alarm" role="alert">{problem ?? error}</p>
      <Button variant="secondary" size="sm" onclick={() => navigate(back)}>Back to the dock</Button>
    </div>
  {:else if !system || !layout || !ctx}
    <div class="dnd-loading"><span class="dnd-spinner"></span></div>
  {:else}
    <div class="ves">
      {#if stop === 'deck'}
        <header class="ves-line">
          <h1 class="dnd-heading ves-title">{vehicle.name}</h1>
          <p class="dnd-label ves-eyebrow">{campaign ? campaign.name : 'Your own'} · {system.kind} · {system.title}</p>
        </header>
      {:else}
        <header class="ves-crown">
          <p class="dnd-label ves-eyebrow">{campaign ? campaign.name : 'Your own'} · {system.kind} · {system.title}</p>
          <h1 class="dnd-heading dnd-heading-hero ves-name">{vehicle.name}</h1>
          <span class="ves-rule"><Ornament name="divider" tone="metal" /></span>
        </header>
      {/if}

      {#if error}
        <p class="ves-alarm" role="alert">{error}</p>
      {/if}
      {#if missing.length}
        <p class="ves-alarm" role="alert">{missing.length} installed component{missing.length === 1 ? ' is' : 's are'} not in the catalogue: {missing.map((entry) => entry.component).join(', ')}.</p>
      {/if}

      {#if stop === 'deck'}
        <section class="ves-stats" aria-label="Vessel statistics">
          {#each stats as line (line.key)}
            <Stat
              label={line.label}
              value={line.value}
              sub={line.pendingRuling ? 'ruling pending' : undefined}
              tone={toneOf(line.tone)}
              title={line.detail ?? line.label}
              onclick={hull && (line.key === 'hull' || line.key === 'condition') ? () => (selected = hull.id) : undefined}
            />
          {/each}
        </section>

        <div class="ves-deck">
          <aside class="ves-sheet dnd-inset" aria-label="Aboard">
            <div class="ves-who">
              <Field
                id="ves-aboard"
                label="Aboard as"
                help={crewman
                  ? `${system.crew.level} ${crewman.crewLevel} · PB +${crewman.proficiency} · ${crewman.perks.reduce((sum, entry) => sum + entry.count, 0)} perks`
                  : 'To hit and DCs name the ability; pick a character to fill in the numbers.'}
              >
                <select id="ves-aboard" value={aboard} onchange={(event) => choose(event.currentTarget.value)}>
                  <option value={NOBODY}>No character</option>
                  {#each choices as entry (entry.id)}
                    <option value={entry.id}>{entry.metadata.name}</option>
                  {/each}
                </select>
              </Field>
            </div>
            <DeckSheet {ctx} {crewman} {selected} onselect={(id) => (selected = id)} onperks={() => open('crew')} />
          </aside>
          <div class="ves-map">
            <VehicleMap {ctx} {selected} {overlays} onselect={(id) => (selected = id)} {movement} />
          </div>
          <aside class="ves-side dnd-inset" aria-label="The chosen component">
            <div class="ves-aboard">
              <Fold title="Overlays" count={Object.values(overlays).filter(Boolean).length || undefined} variant="row" open={overlaysOpen} ontoggle={() => (overlaysOpen = !overlaysOpen)}>
                <div class="ves-overlays">
                  {#each system.overlays as key (key)}
                    <label class="ves-toggle">
                      <input type="checkbox" bind:checked={overlays[key]} />
                      <span>{OVERLAYS[key]}</span>
                    </label>
                  {/each}
                </div>
              </Fold>
            </div>
            {#if chosen}
              <ComponentPanel {ctx} component={chosen} {crewman} editable={keeps} onstate={putState}>
                {#snippet actions()}
                  {#if keeps}
                    <Button variant="ghost" size="sm" onclick={() => open('design')}>Design</Button>
                  {/if}
                {/snippet}
              </ComponentPanel>
            {:else}
              <DeckActions {ctx} {crewman} onselect={(id) => (selected = id)} />
            {/if}
          </aside>
        </div>
      {:else if stop === 'design'}
        <VehicleDesign {vehicle} {system} {layout} {steward} {crew} {me} onsave={save} />
      {:else if stop === 'crew'}
        <VehicleCrew {vehicle} {system} rulings={vehicle.rulings} {steward} {me} characters={sailors} {seats} {crewman} onsave={save} onperks={putPerks} />
      {:else if stop === 'history'}
        <VehicleHistory {vehicle} {system} {steward} {names} onsave={save} />
      {:else if stop === 'rules'}
        <VehicleRulings {system} rulings={vehicle.rulings} editable={steward} onrule={rule} />
      {:else if stop === 'papers'}
        <VehiclePapers {vehicle} {system} {steward} onsave={save} />
      {/if}
    </div>
  {/if}
</Shell>

<style>
  .ves {
    display: grid;
    gap: var(--space-4);
    min-width: 0;
    max-width: var(--size-page-max);
    margin-inline: auto;
    inline-size: 100%;
  }

  .ves-line {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: var(--space-2) var(--space-4);
    min-width: 0;
  }

  .ves-title {
    margin: 0;
    font-size: var(--text-xl);
  }

  .ves-crown {
    display: grid;
    gap: var(--space-2);
    min-width: 0;
  }

  .ves-eyebrow {
    margin: 0;
    color: var(--metal);
  }

  .ves-name {
    margin: 0;
    overflow-wrap: anywhere;
  }

  .ves-rule {
    display: block;
    width: min(21.25rem, 70%);
  }

  .ves-void {
    display: grid;
    justify-items: center;
    gap: var(--space-4);
  }

  .ves-alarm {
    margin: 0;
    padding: var(--space-3);
    border: var(--border-hair) solid var(--state-bad);
    border-radius: var(--radius-sm);
    background: var(--texture-noise), linear-gradient(180deg, color-mix(in srgb, var(--state-bad) 14%, var(--ground-raised)), var(--ground-deep));
    box-shadow: var(--bevel-down);
    font-size: var(--text-sm);
    color: var(--ink);
  }

  .ves-stats {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(8rem, 100%), 1fr));
    gap: var(--space-2);
  }


  .ves-aboard {
    display: grid;
    gap: var(--space-2);
    padding-block-end: var(--space-3);
    border-block-end: var(--border-hair) solid color-mix(in srgb, var(--metal-dim) 50%, transparent);
  }

  .ves-overlays {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--space-2);
    padding-block: var(--space-2);
  }


  .ves-toggle {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    font-size: var(--text-sm);
    color: var(--ink-dim);
    cursor: pointer;
  }

  .ves-deck {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 2.2fr) minmax(0, 1.1fr);
    gap: var(--space-4);
    min-width: 0;
  }

  .ves-map {
    block-size: max(22rem, calc(100dvh - var(--size-bar) - 17rem));
    min-width: 0;
  }

  .ves-sheet {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    max-block-size: max(22rem, calc(100dvh - var(--size-bar) - 17rem));
    padding: var(--space-3);
    overflow-y: auto;
  }

  .ves-who {
    display: grid;
    gap: var(--space-2);
  }

  .ves-side {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    max-block-size: max(22rem, calc(100dvh - var(--size-bar) - 17rem));
    padding: var(--space-4);
    overflow-y: auto;
  }

  @container page (max-width: 1200px) {
    .ves-deck {
      grid-template-columns: minmax(0, 1fr) minmax(0, 2fr);
    }

    .ves-side {
      grid-column: 1 / -1;
      max-block-size: none;
    }
  }

  @container page (max-width: 760px) {
    .ves-deck {
      grid-template-columns: minmax(0, 1fr);
    }

    .ves-map {
      order: -1;
      block-size: clamp(20rem, 60vh, 40rem);
    }

    .ves-sheet {
      max-block-size: none;
    }
  }
</style>
