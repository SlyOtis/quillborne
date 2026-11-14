<script lang="ts">
  import { getCampaigns, getCampaignVehiclesStream, getVehicles, postVehicle } from '$lib/api'
  import type { Campaign, Vehicle } from '$lib/api/types'
  import { onMount, setContext } from 'svelte'
  import { navigate, resolvedRoute } from 'sly-svelte-location-router'
  import { getTheme, setTheme } from '$lib/dialogs/theme'
  import {
    getContext as getVehicleContext,
    getLayout,
    getMergedVehicleSystem,
    getPackageIssues,
    getPerkLevel,
    getRepeatLabel,
    getTemplateBuild,
    getVehicleStats,
    getVehicleSystems,
    type VehiclePackage
  } from '$lib/rules/vehicle'
  import type { VehicleSystem } from '$lib/rules/vehicle.types'
  import { user } from '$lib/stores/auth.store'
  import { anyDialogOpen, uiStore } from '$lib/stores/ui.store'
  import BaseDialog from '$components/BaseDialog.svelte'
  import Button from '$components/ui/Button.svelte'
  import Card from '$components/ui/Card.svelte'
  import Field from '$components/ui/Field.svelte'
  import Fold from '$components/ui/Fold.svelte'
  import Ornament from '$components/ui/Ornament.svelte'
  import Shell from '$components/ui/Shell.svelte'
  import Stops from '$components/ui/Stops.svelte'
  import CampaignBar, { SECTIONS, getSection } from '$components/campaign/CampaignBar.svelte'
  import { isResourceKind } from '$lib/resources'
  import ComponentBrowser from '$components/vehicle/ComponentBrowser.svelte'
  import VehicleRulings from '$components/vehicle/VehicleRulings.svelte'

  const { dock }: { dock?: { campaignId: string; base: string } } = $props()
  const vessels = $derived(dock?.base ?? '/main/vehicles')

  setContext('dialogState', {
    get isAnyDialogOpen() {
      return $anyDialogOpen
    },
    setDialogState: uiStore.setDialogState
  })

  const STOPS = [
    { id: 'vessels', label: 'Vessels' },
    { id: 'components', label: 'Components' },
    { id: 'perks', label: 'Perks' },
    { id: 'rulings', label: 'Rulings' }
  ]

  const steps = $derived($resolvedRoute.path.split('/').filter(Boolean))
  const campaignId = $derived(dock?.campaignId ?? (steps[1] === 'campaign' ? (steps[2] ?? '') : ''))

  let stop = $state('vessels')
  let vehicles = $state<Vehicle[]>([])
  let systems = $state<VehicleSystem[]>([])
  let campaigns = $state<Campaign[]>([])
  let loading = $state(true)
  let busy = $state(false)
  let error = $state<string | null>(null)
  let building = $state(false)
  let name = $state('')
  let plan = $state('')
  let harbour = $state('')
  let systemOn = $state('')
  let openTrees = $state<string[]>([])
  let file = $state<HTMLInputElement | null>(null)

  onMount(() => setTheme(getTheme()))

  $effect(() => {
    if (!$user) return
    void Promise.all([getVehicleSystems(), getCampaigns()])
      .then(([loadedSystems, loadedCampaigns]) => {
        systems = loadedSystems
        campaigns = loadedCampaigns
        systemOn ||= loadedSystems[0]?.id ?? ''
      })
      .catch((reason) => (error = reason instanceof Error ? reason.message : String(reason)))
  })

  $effect(() => {
    const id = campaignId
    if (!$user) return
    loading = true
    if (id) {
      const live = getCampaignVehiclesStream(id, (loaded) => {
        vehicles = loaded
        loading = false
      })
      return () => live()
    }
    getVehicles()
      .then((loaded) => (vehicles = loaded))
      .catch((reason) => (error = reason instanceof Error ? reason.message : String(reason)))
      .finally(() => (loading = false))
  })

  const campaign = $derived(campaigns.find((entry) => entry.id === campaignId) ?? null)
  const system = $derived(systems.find((entry) => entry.id === systemOn) ?? systems[0] ?? null)
  const plans = $derived(
    systems.flatMap((entry) => [
      ...entry.templates.map((template) => ({ id: `${entry.id}:template:${template.key}`, label: `${template.name} (${entry.title})`, system: entry, template, layout: template.layout })),
      ...entry.layouts.map((layout) => ({ id: `${entry.id}:keel:${layout.key}`, label: `A bare keel on ${layout.name} (${entry.title})`, system: entry, template: null, layout: layout.key }))
    ])
  )
  const groups = $derived.by(() => {
    const out: { id: string; title: string; vehicles: Vehicle[] }[] = []
    const own = vehicles.filter((entry) => !entry.campaign_id)
    if (!campaignId && own.length) out.push({ id: 'own', title: 'Your own', vehicles: own })
    const ids = [...new Set(vehicles.map((entry) => entry.campaign_id).filter((id): id is string => Boolean(id)))]
    for (const id of ids) {
      out.push({
        id,
        title: campaigns.find((entry) => entry.id === id)?.name ?? 'A campaign',
        vehicles: vehicles.filter((entry) => entry.campaign_id === id)
      })
    }
    return out
  })
  const browseCtx = $derived(system && system.layouts[0] ? getVehicleContext(system, system.layouts[0], [], {}, {}, {}) : null)

  function summary(entry: Vehicle): string {
    const held = systems.find((candidate) => candidate.id === entry.system)
    if (!held) return entry.system
    const merged = getMergedVehicleSystem(held, entry.overlay)
    const layout = getLayout(merged, entry.layout)
    const template = merged.templates.find((candidate) => candidate.key === entry.template)
    const hull = layout
      ? getVehicleStats(getVehicleContext(merged, layout, entry.components, entry.stats, entry.states, entry.rulings)).find((line) => line.key === 'hull')
      : undefined
    return [template?.name ?? 'Bare keel', hull ? `Hull ${hull.value}` : null].filter(Boolean).join(' · ')
  }

  function startBuild() {
    name = ''
    plan = plans[0]?.id ?? ''
    harbour = campaignId
    building = true
  }

  async function build() {
    const chosen = plans.find((entry) => entry.id === plan)
    if (!chosen || !name.trim()) return
    busy = true
    error = null
    try {
      const made = await postVehicle({
        name: name.trim(),
        campaign_id: harbour || null,
        system: chosen.system.id,
        template: chosen.template?.key ?? '',
        template_version: chosen.template?.version ?? 0,
        layout: chosen.layout,
        components: chosen.template ? getTemplateBuild(chosen.system, chosen.template, () => crypto.randomUUID()) : [],
        stats: chosen.template?.stats ?? {}
      })
      building = false
      navigate(`${vessels}/${made.id}`)
    } catch (reason) {
      error = reason instanceof Error ? reason.message : String(reason)
    } finally {
      busy = false
    }
  }

  async function importFile(event: Event) {
    const input = event.currentTarget as HTMLInputElement
    const picked = input.files?.[0]
    input.value = ''
    if (!picked) return
    busy = true
    error = null
    try {
      const pkg = JSON.parse(await picked.text()) as VehiclePackage
      const issues = getPackageIssues(pkg, systems)
      if (issues.length) {
        error = issues.join(' ')
        return
      }
      const made = await postVehicle({
        name: pkg.name,
        campaign_id: campaignId || null,
        system: pkg.system,
        template: pkg.template,
        template_version: pkg.template_version,
        layout: pkg.layout,
        components: pkg.components.map((row) => ({ ...row, id: crypto.randomUUID() })),
        stats: pkg.stats,
        rulings: pkg.rulings,
        overlay: pkg.overlay
      })
      navigate(`${vessels}/${made.id}`)
    } catch (reason) {
      error = reason instanceof SyntaxError ? 'That file is not JSON.' : reason instanceof Error ? reason.message : String(reason)
    } finally {
      busy = false
    }
  }

  function openStop(where: string) {
    if (where === 'vehicles') return
    if (isResourceKind(where)) {
      navigate(`/main/campaign/${campaignId}/${where}`)
      return
    }
    navigate(where === 'overview' ? `/main/campaign/${campaignId}` : `/main/campaign/${campaignId}?tab=${where}`)
  }

  function openSection(id: string) {
    openStop(SECTIONS.find((entry) => entry.id === id)?.under[0]?.id ?? id)
  }

  function toggleTree(key: string) {
    openTrees = openTrees.includes(key) ? openTrees.filter((entry) => entry !== key) : [...openTrees, key]
  }
</script>

{#if dock}
  {@render body()}
{:else}
<Shell drawers title={campaign ? `${campaign.name} · Vehicles` : 'The Dock'} width="wide">
  {#snippet nav()}
    {#if campaignId}
      <Stops stops={SECTIONS} stop={getSection('vehicles')} onopen={openSection} />
    {:else}
      <Stops stops={STOPS} {stop} onopen={(next) => (stop = next)} />
    {/if}
  {/snippet}

  {#snippet band()}
    {#if campaignId}
      <CampaignBar stop="vehicles" onopen={openStop} />
    {/if}
  {/snippet}

  {@render body()}
</Shell>
{/if}

{#snippet body()}
  <div class="dock">
    <header class="dock-crown">
      <p class="dnd-label dock-eyebrow">{campaign ? campaign.name : 'Every vessel you sail with'}</p>
      <h1 class="dnd-heading dnd-heading-hero dock-name">{STOPS.find((entry) => entry.id === stop)?.label ?? 'Vessels'}</h1>
      <span class="dock-rule"><Ornament name="divider" tone="metal" /></span>
      {#if campaignId}
        <div class="dock-tabs">
          <Stops stops={STOPS} {stop} onopen={(next) => (stop = next)} />
        </div>
      {/if}
    </header>

    {#if error}
      <p class="dock-alarm" role="alert">{error}</p>
    {/if}

    {#if stop === 'vessels'}
      <div class="dock-acts">
        <Button variant="primary" size="md" disabled={plans.length === 0} onclick={startBuild}>Build a vessel</Button>
        <Button variant="secondary" size="md" loading={busy} onclick={() => file?.click()}>Import a vessel</Button>
        <input bind:this={file} class="dock-file" type="file" accept="application/json,.json" aria-label="Vessel file" tabindex="-1" onchange={importFile} />
      </div>

      {#if loading}
        <div class="dnd-loading"><span class="dnd-spinner"></span></div>
      {:else if vehicles.length === 0}
        <p class="dnd-empty">No vessel is moored here yet. Build one from a template, or lay a bare keel.</p>
      {:else}
        {#each groups as group (group.id)}
          <section class="dock-part" aria-label={group.title}>
            <header class="dock-divide">
              <h2 class="dnd-label dock-divide-name">{group.title}</h2>
              <span class="dock-divide-note">{group.vehicles.length} moored</span>
              <span class="dock-divide-run"></span>
            </header>
            <div class="dock-grid">
              {#each group.vehicles as entry (entry.id)}
                <Card
                  title={entry.name}
                  sub={summary(entry)}
                  badge={entry.crew.length ? `${entry.crew.length} crew` : undefined}
                  tone={entry.owner_id === $user?.user_id ? 'ember' : 'verdigris'}
                  onclick={() => navigate(`${vessels}/${entry.id}`)}
                />
              {/each}
            </div>
          </section>
        {/each}
      {/if}
    {:else if stop === 'components' && system && browseCtx}
      {#if systems.length > 1}
        <Field id="dock-system" label="Vehicle system">
          <select id="dock-system" bind:value={systemOn}>
            {#each systems as entry (entry.id)}
              <option value={entry.id}>{entry.title}</option>
            {/each}
          </select>
        </Field>
      {/if}
      <ComponentBrowser ctx={browseCtx} />
    {:else if stop === 'perks' && system}
      {#each system.perkTrees as tree (tree.key)}
        {@const perks = system.perks.filter((perk) => perk.tree === tree.key)}
        <Fold title={tree.name} count={perks.length} open={openTrees.includes(tree.key)} ontoggle={() => toggleTree(tree.key)}>
          <p class="dock-note">{tree.blurb} {tree.abilities}.</p>
          <ul class="dock-perks">
            {#each perks as perk (perk.id)}
              <li class="dock-perk">
                <div class="dock-perk-line">
                  <span class="dock-perk-name">{perk.name}</span>
                  <span class="dock-perk-meta">{system.crew.level} {getPerkLevel(system, perk, {})} · {getRepeatLabel(perk)} · {perk.actionType}</span>
                </div>
                <p class="dock-text">{perk.description}</p>
                {#if perk.additional}<p class="dock-note">{perk.additional}</p>{/if}
                {#if perk.prerequisiteText}<p class="dock-note">Needs {perk.prerequisiteText}</p>{/if}
              </li>
            {/each}
          </ul>
        </Fold>
      {/each}
    {:else if stop === 'rulings' && system}
      <VehicleRulings {system} rulings={{}} />
    {/if}
  </div>
{/snippet}

{#if building}
  <BaseDialog bind:isOpen={building} title="Build a vessel" zIndex={9999}>
    <div class="dock-build">
      <Field id="build-name" label="What she is called" required>
        <input id="build-name" type="text" maxlength="120" placeholder="The Gull’s Revenge" bind:value={name} disabled={busy} />
      </Field>
      <Field id="build-plan" label="Built from">
        <select id="build-plan" bind:value={plan} disabled={busy}>
          {#each plans as entry (entry.id)}
            <option value={entry.id}>{entry.label}</option>
          {/each}
        </select>
      </Field>
      <Field id="build-harbour" label="Sails in" help="A campaign’s vessel belongs to its whole table: everyone seated there can change it.">
        <select id="build-harbour" bind:value={harbour} disabled={busy}>
          <option value="">Your own waters</option>
          {#each campaigns as entry (entry.id)}
            <option value={entry.id}>{entry.name}</option>
          {/each}
        </select>
      </Field>
      <div class="dock-acts dock-acts-end">
        <Button variant="ghost" disabled={busy} onclick={() => (building = false)}>Not yet</Button>
        <Button variant="primary" loading={busy} disabled={!name.trim() || !plan} onclick={build}>Build</Button>
      </div>
    </div>
  </BaseDialog>
{/if}

<style>
  .dock {
    display: grid;
    gap: var(--space-5);
    min-width: 0;
  }

  .dock-crown {
    display: grid;
    gap: var(--space-2);
  }

  .dock-eyebrow {
    margin: 0;
    color: var(--metal);
  }

  .dock-name {
    margin: 0;
  }

  .dock-rule {
    display: block;
    width: min(21.25rem, 70%);
  }

  .dock-tabs {
    display: flex;
    min-width: 0;
    block-size: var(--space-6);
  }

  .dock-alarm {
    margin: 0;
    padding: var(--space-3);
    border: var(--border-hair) solid var(--state-bad);
    border-radius: var(--radius-sm);
    background: var(--texture-noise), linear-gradient(180deg, color-mix(in srgb, var(--state-bad) 14%, var(--ground-raised)), var(--ground-deep));
    font-size: var(--text-sm);
    color: var(--ink);
  }

  .dock-acts {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-4);
  }

  .dock-acts-end {
    justify-content: flex-end;
  }

  .dock-file {
    display: none;
  }

  .dock-part {
    display: grid;
    gap: var(--space-4);
  }

  .dock-divide {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-3);
  }

  .dock-divide-name {
    margin: 0;
    color: var(--metal-bright);
  }

  .dock-divide-note {
    font-family: var(--font-figures);
    font-size: var(--text-xs);
    letter-spacing: var(--tracking-wide);
    color: var(--ink-faint);
  }

  .dock-divide-run {
    flex: 1;
    min-width: 0;
    height: var(--border-hair);
    background: linear-gradient(90deg, var(--metal), var(--metal-dim) 40%, transparent);
  }

  .dock-grid {
    --dock-card: calc(var(--space-8) * 3);
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(min(var(--dock-card), 100%), 1fr));
    gap: var(--space-4);
  }

  .dock-perks {
    display: grid;
    gap: var(--space-2);
    margin: 0;
    padding: var(--space-2) 0;
    list-style: none;
  }

  .dock-perk {
    display: grid;
    gap: var(--space-1);
    padding: var(--space-2) var(--space-3);
    border-radius: var(--radius-sm);
    background: var(--texture-noise), linear-gradient(180deg, var(--ground-raised), var(--ground-deep));
    box-shadow: var(--rim-thin);
  }

  .dock-perk-line {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: var(--space-3);
  }

  .dock-perk-name {
    font-family: var(--font-display);
    letter-spacing: var(--tracking-wide);
    color: var(--metal-bright);
  }

  .dock-perk-meta {
    font-size: var(--text-xs);
    color: var(--ink-faint);
    text-align: end;
  }

  .dock-text {
    margin: 0;
    font-size: var(--text-sm);
  }

  .dock-note {
    margin: 0;
    font-size: var(--text-sm);
    font-style: italic;
    color: var(--ink-faint);
  }

  .dock-build {
    display: grid;
    gap: var(--space-4);
    padding: var(--space-5) var(--space-6) var(--space-6);
  }
</style>
