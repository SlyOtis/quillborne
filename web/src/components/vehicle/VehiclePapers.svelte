<script lang="ts">
  import { deleteVehicle, postVehicle } from '$lib/api'
  import type { Vehicle, VehicleFields } from '$lib/api/types'
  import { navigate } from 'sly-svelte-location-router'
  import { getDef, getTemplateDrift, getVehiclePackage } from '$lib/rules/vehicle'
  import type { ComponentDef, Customisation, InstalledComponent, VehicleSystem } from '$lib/rules/vehicle.types'
  import BaseDialog from '$components/BaseDialog.svelte'
  import Button from '$components/ui/Button.svelte'
  import Field from '$components/ui/Field.svelte'

  const {
    vehicle,
    system,
    steward = false,
    onsave
  }: {
    /** The vessel whose papers are read and changed. */
    vehicle: Vehicle
    /** The vehicle system with the vessel's homebrew merged in. */
    system: VehicleSystem
    /** The builder or the campaign DM, who may change the papers. */
    steward?: boolean
    /** Writes the given vessel fields. */
    onsave: (fields: VehicleFields) => Promise<void>
  } = $props()

  const LEVELS: { id: Customisation; label: string; help: string }[] = [
    { id: 'locked', label: 'Locked', help: 'The crew tracks hit points and asks the DM for every change to the design.' },
    { id: 'approved', label: 'Approved components', help: 'The crew installs and swaps what the DM approved for players, and asks for the rest.' },
    { id: 'full', label: 'Full customisation', help: 'The crew changes the design freely.' }
  ]

  let name = $state('')
  let named = $state('')
  let busy = $state(false)
  let error = $state<string | null>(null)
  let scuttling = $state(false)
  let taking = $state<string[]>([])
  let forgeBase = $state('')
  let forge = $state({ name: '', size: '', ac: 0, dt: 0, hp: 0, it: 0, con: 0, description: '', open: true })

  $effect(() => {
    if (vehicle.name === named) return
    named = vehicle.name
    name = vehicle.name
  })

  const template = $derived(system.templates.find((entry) => entry.key === vehicle.template) ?? null)
  const drift = $derived(template ? getTemplateDrift(system, template, vehicle.components) : [])
  const homebrew = $derived(vehicle.overlay.components ?? [])
  const base = $derived(getDef(system, forgeBase) ?? null)

  $effect(() => {
    if (!base) return
    forge = {
      name: `${base.name} (homebrew)`,
      size: base.size ?? '',
      ac: base.stats.ac,
      dt: base.stats.dt,
      hp: base.stats.hp,
      it: base.stats.it,
      con: base.stats.con,
      description: base.description ?? '',
      open: base.playerAvailable
    }
  })

  async function write(fields: VehicleFields, after?: () => void) {
    busy = true
    error = null
    try {
      await onsave(fields)
      after?.()
    } catch (reason) {
      error = reason instanceof Error ? reason.message : String(reason)
    } finally {
      busy = false
    }
  }

  function rename() {
    if (!name.trim() || name.trim() === vehicle.name) return
    void write({ name: name.trim() })
  }

  function takeTemplate() {
    if (!template) return
    let next: InstalledComponent[] = vehicle.components.map((row) => ({ ...row }))
    for (const row of drift.filter((entry) => taking.includes(entry.slot))) {
      const fresh: InstalledComponent = {
        id: crypto.randomUUID(),
        slot: row.slot,
        component: row.wanted.component,
        label: row.wanted.label,
        x: null,
        y: null,
        rotation: null,
        override: row.wanted.override,
        overrideReason: row.wanted.overrideReason
      }
      next = row.held ? next.map((entry) => (entry.id === row.held?.id ? fresh : entry)) : [...next, fresh]
    }
    void write(
      { components: next, revision: vehicle.revision, note: `Took ${taking.length} slot${taking.length === 1 ? '' : 's'} from ${template.name} v${template.version}`, template_version: template.version },
      () => (taking = [])
    )
  }

  function forgeIt() {
    if (!base || !forge.name.trim()) return
    const slug = forge.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
    const made: ComponentDef = {
      ...base,
      key: `homebrew-${slug}-${crypto.randomUUID().slice(0, 6)}`,
      name: forge.name.trim(),
      size: forge.size || base.size,
      tier: base.tier,
      stats: { ...base.stats, ac: forge.ac, dt: forge.dt, hp: forge.hp, it: forge.it, con: forge.con },
      description: forge.description.trim() || null,
      source: null,
      playerAvailable: forge.open,
      homebrew: true
    }
    void write({ overlay: { components: [...homebrew, made] } }, () => (forgeBase = ''))
  }

  function unforge(key: string) {
    void write({ overlay: { components: homebrew.filter((entry) => entry.key !== key) } })
  }

  function exportIt() {
    const pkg = getVehiclePackage(vehicle)
    const blob = new Blob([JSON.stringify(pkg, null, 2)], { type: 'application/json' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = `${vehicle.name.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'vehicle'}.json`
    link.click()
    URL.revokeObjectURL(link.href)
  }

  async function duplicate() {
    busy = true
    error = null
    try {
      const made = await postVehicle({
        name: `${vehicle.name} (copy)`,
        campaign_id: vehicle.campaign_id,
        system: vehicle.system,
        template: vehicle.template,
        template_version: vehicle.template_version,
        layout: vehicle.layout,
        components: vehicle.components.map((row) => ({ ...row, id: crypto.randomUUID() })),
        stats: vehicle.stats,
        rulings: vehicle.rulings,
        overlay: vehicle.overlay,
        customisation: vehicle.customisation
      })
      navigate(`/main/vehicles/${made.id}`)
    } catch (reason) {
      error = reason instanceof Error ? reason.message : String(reason)
    } finally {
      busy = false
    }
  }

  async function scuttle() {
    busy = true
    error = null
    try {
      await deleteVehicle(vehicle.id)
      scuttling = false
      navigate(vehicle.campaign_id ? `/main/campaign/${vehicle.campaign_id}/vehicles` : '/main/vehicles')
    } catch (reason) {
      error = reason instanceof Error ? reason.message : String(reason)
    } finally {
      busy = false
    }
  }
</script>

<div class="vp">
  {#if error}
    <p class="vp-bad" role="alert">{error}</p>
  {/if}

  <section class="vp-part" aria-label="Name and customisation">
    <h2 class="dnd-label vp-head">The vessel</h2>
    <Field id="vp-name" label="What she is called">
      <input id="vp-name" type="text" maxlength="120" bind:value={name} disabled={!steward || busy} onkeydown={(event) => event.key === 'Enter' && rename()} />
      {#snippet action()}
        <Button variant="secondary" size="sm" disabled={!steward || busy || !name.trim() || name.trim() === vehicle.name} onclick={rename}>Rename</Button>
      {/snippet}
    </Field>
    <Field id="vp-level" label="What the crew may change" help={LEVELS.find((entry) => entry.id === vehicle.customisation)?.help}>
      <select id="vp-level" value={vehicle.customisation} disabled={!steward || busy} onchange={(event) => void write({ customisation: event.currentTarget.value as Customisation })}>
        {#each LEVELS as level (level.id)}
          <option value={level.id}>{level.label}</option>
        {/each}
      </select>
    </Field>
    <dl class="dnd-facts">
      <dt>System</dt>
      <dd>{system.title} {system.version}</dd>
      <dt>Built from</dt>
      <dd>{template ? `${template.name} v${vehicle.template_version}` : 'A bare keel'}</dd>
      <dt>Revision</dt>
      <dd>{vehicle.revision}</dd>
    </dl>
    <div class="vp-acts">
      <Button variant="secondary" size="sm" onclick={exportIt}>Export</Button>
      <Button variant="secondary" size="sm" loading={busy} onclick={duplicate}>Duplicate</Button>
      {#if steward}
        <Button variant="danger" size="sm" disabled={busy} onclick={() => (scuttling = true)}>Scuttle</Button>
      {/if}
    </div>
  </section>

  {#if template}
    <section class="vp-part" aria-label="Template">
      <h2 class="dnd-label vp-head">{template.name}, version {template.version}</h2>
      {#if template.version !== vehicle.template_version}
        <p class="vp-warn">The template moved to version {template.version} since this vessel was built from version {vehicle.template_version}.</p>
      {/if}
      {#if drift.length === 0}
        <p class="vp-quiet">Every slot carries what the template does.</p>
      {:else}
        <p class="vp-quiet">These slots differ from the template. Tick the ones to take from it; the rest stay as the crew made them.</p>
        <ul class="vp-drift">
          {#each drift as row (row.slot)}
            <li>
              <label class="vp-take">
                <input
                  type="checkbox"
                  disabled={!steward}
                  checked={taking.includes(row.slot)}
                  onchange={(event) => (taking = event.currentTarget.checked ? [...taking, row.slot] : taking.filter((entry) => entry !== row.slot))}
                />
                <span><strong>{row.slot}</strong> {row.heldName ?? 'Empty'} → {row.wantedName}</span>
              </label>
            </li>
          {/each}
        </ul>
        {#if steward}
          <Button variant="primary" size="sm" loading={busy} disabled={taking.length === 0} onclick={takeTemplate}>Take from the template</Button>
        {/if}
      {/if}
    </section>
  {/if}

  <section class="vp-part" aria-label="Homebrew">
    <h2 class="dnd-label vp-head">Homebrew</h2>
    <p class="vp-quiet">Components this vessel alone carries, on top of the {system.title} catalogue.</p>
    {#if homebrew.length}
      <ul class="vp-drift">
        {#each homebrew as entry (entry.key)}
          <li class="vp-brew">
            <span><strong>{entry.name}</strong> · {entry.category} · AC {entry.stats.ac} · HP {entry.stats.hp}</span>
            {#if steward}
              <Button
                variant="ghost"
                size="sm"
                disabled={busy || vehicle.components.some((row) => row.component === entry.key)}
                title={vehicle.components.some((row) => row.component === entry.key) ? 'Installed: remove it from the deck first' : `Remove ${entry.name}`}
                onclick={() => unforge(entry.key)}>Remove</Button
              >
            {/if}
          </li>
        {/each}
      </ul>
    {/if}
    {#if steward}
      <Field id="vp-base" label="Forge one, starting from">
        <select id="vp-base" bind:value={forgeBase} disabled={busy}>
          <option value="">Choose a component</option>
          {#each system.categories as category (category.key)}
            <optgroup label={category.name}>
              {#each system.components.filter((entry) => entry.category === category.key) as entry (entry.key)}
                <option value={entry.key}>{entry.name}</option>
              {/each}
            </optgroup>
          {/each}
        </select>
      </Field>
      {#if base}
        <div class="vp-forge">
          <Field id="vp-forge-name" label="Name">
            <input id="vp-forge-name" type="text" maxlength="80" bind:value={forge.name} />
          </Field>
          <Field id="vp-forge-size" label="Size">
            <select id="vp-forge-size" bind:value={forge.size}>
              {#each system.sizes as size (size)}
                <option value={size}>{size}</option>
              {/each}
            </select>
          </Field>
          {#each ['ac', 'dt', 'hp', 'it', 'con'] as key (key)}
            <Field id="vp-forge-{key}" label={key.toUpperCase()}>
              <input id="vp-forge-{key}" type="number" bind:value={forge[key as 'ac' | 'dt' | 'hp' | 'it' | 'con']} />
            </Field>
          {/each}
          <div class="vp-wide">
            <Field id="vp-forge-text" label="Description">
              <textarea id="vp-forge-text" rows="2" bind:value={forge.description}></textarea>
            </Field>
          </div>
          <label class="vp-take vp-wide">
            <input type="checkbox" bind:checked={forge.open} />
            <span>Approved for players</span>
          </label>
          <div class="vp-acts vp-wide">
            <Button variant="primary" size="sm" loading={busy} disabled={!forge.name.trim()} onclick={forgeIt}>Forge</Button>
          </div>
        </div>
      {/if}
    {/if}
  </section>
</div>

{#if scuttling}
  <BaseDialog bind:isOpen={scuttling} title="Scuttle {vehicle.name}" zIndex={9999}>
    <div class="vp-drop">
      <p class="vp-quiet">The vessel goes for good, with its history. The crew keep their sheets and their perks.</p>
      <div class="vp-acts">
        <Button variant="ghost" disabled={busy} onclick={() => (scuttling = false)}>Keep her</Button>
        <Button variant="danger" loading={busy} onclick={scuttle}>Scuttle</Button>
      </div>
    </div>
  </BaseDialog>
{/if}

<style>
  .vp {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(24rem, 100%), 1fr));
    align-items: start;
    gap: var(--space-6);
    min-width: 0;
  }

  .vp-part {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    min-width: 0;
  }

  .vp-head {
    margin: 0;
    color: var(--metal-bright);
  }

  .vp-acts {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: var(--space-3);
  }

  .vp-quiet {
    margin: 0;
    font-size: var(--text-sm);
    color: var(--ink-dim);
  }

  .vp-warn {
    margin: 0;
    font-size: var(--text-sm);
    color: var(--state-warn);
  }

  .vp-bad {
    grid-column: 1 / -1;
    margin: 0;
    padding: var(--space-3);
    border: var(--border-hair) solid var(--state-bad);
    border-radius: var(--radius-sm);
    font-size: var(--text-sm);
  }

  .vp-drift {
    display: grid;
    gap: var(--space-2);
    margin: 0;
    padding: 0;
    list-style: none;
    font-size: var(--text-sm);
  }

  .vp-take {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    font-size: var(--text-sm);
    cursor: pointer;
  }

  .vp-brew {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
  }

  .vp-forge {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(min(7rem, 100%), 1fr));
    gap: var(--space-3);
  }

  .vp-wide {
    grid-column: 1 / -1;
  }

  .vp-drop {
    display: grid;
    gap: var(--space-4);
    padding: var(--space-5) var(--space-6) var(--space-6);
  }
</style>
