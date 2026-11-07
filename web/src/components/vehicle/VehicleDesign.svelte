<script lang="ts">
  import {
    getCompatibility,
    getComponentSummary,
    getContext,
    getDef,
    getVehicleIssues,
    getVehicleStats
  } from '$lib/rules/vehicle'
  import type { ComponentDef, InstalledComponent, Issue, Layout, OverlayKey, VehicleSystem } from '$lib/rules/vehicle.types'
  import type { Vehicle, VehicleFields } from '$lib/firestore.types'
  import BaseDialog from '$components/BaseDialog.svelte'
  import Button from '$components/ui/Button.svelte'
  import Field from '$components/ui/Field.svelte'
  import IconBtn from '$components/ui/IconBtn.svelte'
  import Glyph from '$components/ui/Glyph.svelte'
  import ComponentBrowser from './ComponentBrowser.svelte'
  import VehicleMap from './VehicleMap.svelte'

  const {
    vehicle,
    system,
    layout,
    onsave
  }: {
    /** The vessel as the api last answered it. */
    vehicle: Vehicle
    /** The vehicle system with the vessel's homebrew merged in. */
    system: VehicleSystem
    /** The deck layout the slots come from. */
    layout: Layout
    /** Writes the given fields and answers once the api has. */
    onsave: (fields: VehicleFields) => Promise<void>
  } = $props()

  const clone = (rows: InstalledComponent[]) => rows.map((row) => ({ ...row }))

  let base = $state(0)
  let draft = $state<InstalledComponent[]>([])
  let steps = $state<InstalledComponent[][]>([])
  let selected = $state<string | null>(null)
  let slotOn = $state<string | null>(null)
  let note = $state('')
  let busy = $state(false)
  let error = $state<string | null>(null)
  let browsing = $state<{ slot: string | null; replacing: string | null } | null>(null)
  let overlays = $state<Record<OverlayKey, boolean>>({
    arcs: true,
    movement: false,
    locations: true,
    conditions: false,
    navalGrid: false,
    boardingGrid: false
  })

  $effect(() => {
    if (vehicle.revision === base) return
    if (base !== 0 && changes.length > 0) return
    base = vehicle.revision
    draft = clone(vehicle.components)
    steps = []
  })

  const ctx = $derived(getContext(system, layout, draft, vehicle.stats, vehicle.states, vehicle.rulings))
  const savedCtx = $derived(getContext(system, layout, vehicle.components, vehicle.stats, vehicle.states, vehicle.rulings))
  const before = $derived(getVehicleStats(savedCtx))
  const after = $derived(getVehicleStats(ctx))
  const chosen = $derived(ctx.components.find((entry) => entry.id === selected) ?? null)
  const slot = $derived(layout.slots.find((entry) => entry.code === (chosen?.slot ?? slotOn)) ?? null)
  const saved = $derived(new Map(vehicle.components.map((entry) => [entry.id, entry])))

  const moved = (row: InstalledComponent) => {
    const was = saved.get(row.id)
    return !!was && (was.slot !== row.slot || was.x !== row.x || was.y !== row.y || was.rotation !== row.rotation)
  }

  const nameOf = (key: string) => getDef(system, key)?.name ?? key

  const changes = $derived.by(() => {
    const rows: { kind: string; text: string }[] = []
    const paired = new Set<string>()
    for (const was of vehicle.components) {
      if (draft.some((row) => row.id === was.id)) continue
      const swap = draft.find((row) => !saved.has(row.id) && !paired.has(row.id) && was.slot && row.slot === was.slot)
      if (swap) {
        paired.add(swap.id)
        rows.push({ kind: 'replaced', text: `${was.slot}: ${nameOf(was.component)} → ${nameOf(swap.component)}` })
      } else {
        rows.push({ kind: 'removed', text: `${was.slot ?? 'Unslotted'}: removed ${nameOf(was.component)}` })
      }
    }
    for (const row of draft) {
      if (!saved.has(row.id) && !paired.has(row.id)) rows.push({ kind: 'added', text: `${row.slot ?? 'Unslotted'}: added ${nameOf(row.component)}` })
      if (moved(row)) rows.push({ kind: 'moved', text: `${row.slot}: placement changed` })
      const was = saved.get(row.id)
      if (was && (was.label ?? null) !== (row.label ?? null)) rows.push({ kind: 'relabelled', text: `${row.slot}: label “${row.label ?? ''}”` })
    }
    return rows
  })

  const issues = $derived.by<Issue[]>(() => {
    const out: Issue[] = []
    for (const row of ctx.components) {
      if (saved.has(row.id) && !moved(row)) continue
      const at = layout.slots.find((entry) => entry.code === row.slot) ?? null
      for (const issue of getCompatibility(system, at, row.def, ctx.components, row.id)) {
        out.push(row.override && issue.severity === 'error' ? { ...issue, severity: 'warning', message: `DM override: ${issue.message}` } : issue)
      }
    }
    for (const issue of getVehicleIssues(ctx.components)) out.push({ ...issue, severity: 'warning' })
    return out
  })

  const blocking = $derived(issues.filter((issue) => issue.severity === 'error'))

  const canSave = $derived(changes.length > 0 && blocking.length === 0)

  function commit(next: InstalledComponent[]) {
    steps = [...steps.slice(-49), clone(draft)]
    draft = next
  }

  function undo() {
    const last = steps.at(-1)
    if (!last) return
    steps = steps.slice(0, -1)
    draft = last
  }

  function revert() {
    commit(clone(vehicle.components))
  }

  function patch(id: string, values: Partial<InstalledComponent>) {
    commit(draft.map((row) => (row.id === id ? { ...row, ...values } : row)))
  }

  function pickSlot(code: string) {
    const held = draft.find((row) => row.slot === code)
    selected = held?.id ?? null
    slotOn = held ? null : code
  }

  function install(def: ComponentDef, override: string | null) {
    if (!browsing) return
    const replacing = draft.find((row) => row.id === browsing?.replacing)
    const fresh: InstalledComponent = {
      id: crypto.randomUUID(),
      slot: browsing.slot ?? replacing?.slot ?? null,
      component: def.key,
      label: replacing?.label ?? null,
      x: replacing?.x ?? null,
      y: replacing?.y ?? null,
      rotation: replacing?.rotation ?? null,
      override: override !== null,
      overrideReason: override
    }
    commit(replacing ? draft.map((row) => (row.id === replacing.id ? fresh : row)) : [...draft, fresh])
    selected = fresh.id
    slotOn = null
    browsing = null
  }

  function remove(id: string) {
    commit(draft.filter((row) => row.id !== id))
    selected = null
  }

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

  function save() {
    void write({ components: draft, revision: base, note: note.trim() || undefined }, () => {
      note = ''
      steps = []
      base = 0
    })
  }

  const browsingSlot = $derived(
    browsing ? (layout.slots.find((entry) => entry.code === (browsing?.slot ?? draft.find((row) => row.id === browsing?.replacing)?.slot)) ?? null) : null
  )
  const browsingCurrent = $derived(browsing?.replacing ? (ctx.components.find((row) => row.id === browsing?.replacing)?.def ?? null) : null)

</script>

<div class="vd">
  <div class="vd-bar">
    <p class="dnd-label vd-level">Anyone at the table may change this vessel</p>
    {#if changes.length}
      <span class="vd-count">{changes.length} unsaved change{changes.length === 1 ? '' : 's'}</span>
    {/if}
    <span class="vd-run"></span>
    <Button variant="ghost" size="sm" disabled={!steps.length} onclick={undo}>Undo</Button>
    <Button variant="ghost" size="sm" disabled={!changes.length} onclick={revert}>Revert all</Button>
  </div>

  {#if error}
    <p class="vd-alarm" role="alert">{error}</p>
  {/if}

  <div class="vd-grid">
    <aside class="vd-slots dnd-inset" aria-label="Deck layout slots">
      <p class="dnd-label">{layout.name}</p>
      <ul class="vd-slot-list">
        {#each layout.slots as entry (entry.code)}
          {@const held = ctx.components.find((row) => row.slot === entry.code)}
          <li>
            <button
              type="button"
              class="vd-slot"
              class:vd-slot-on={held ? held.id === selected : entry.code === slotOn}
              onclick={() => pickSlot(entry.code)}
            >
              <span class="vd-slot-code">{entry.code}</span>
              <span class="vd-slot-body">
                <span class="vd-slot-name" class:vd-slot-empty={!held}>{held ? (held.label ?? held.def.name) : 'Empty'}</span>
                <span class="vd-slot-sub">{entry.acceptedTypes.join(', ')} · max {entry.maxSize ?? '—'}{held?.override ? ' · override' : ''}</span>
              </span>
            </button>
          </li>
        {/each}
      </ul>
    </aside>

    <section class="vd-board" aria-label="Deck">
      <div class="vd-map">
        <VehicleMap
          {ctx}
          {selected}
          {overlays}
          onselect={(id) => {
            selected = id
            if (id) slotOn = null
          }}
          empty
          focus={false}
          onslot={pickSlot}
          marks={slot ? { [slot.code]: 'current' } : {}}
          draggable
          onmove={(id, x, y) => patch(id, { x, y })}
        />
      </div>
      <div class="vd-toggles">
        {#each [['arcs', 'Arcs'], ['locations', 'Slots'], ['boardingGrid', 'Boarding grid'], ['navalGrid', 'Naval grid']] as [key, label] (key)}
          <label class="vd-toggle">
            <input type="checkbox" bind:checked={overlays[key as OverlayKey]} />
            <span>{label}</span>
          </label>
        {/each}
        <span class="vd-hint">Drag a component to move it; it snaps to half a foot.</span>
      </div>
      <table class="vd-table" aria-label="Saved against draft">
        <thead>
          <tr><th>Statistic</th><th>Saved</th><th>Draft</th></tr>
        </thead>
        <tbody>
          {#each after as line (line.key)}
            {@const was = before.find((entry) => entry.key === line.key)}
            {@const delta = line.numeric != null && was?.numeric != null ? line.numeric - was.numeric : null}
            <tr>
              <td>{line.label}</td>
              <td class="vd-dim">{was?.value ?? '—'}</td>
              <td class:vd-up={delta != null && delta > 0} class:vd-down={delta != null && delta < 0}>{line.value}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </section>

    <aside class="vd-side">
      <section class="vd-card dnd-inset" aria-label="Selection">
        {#if chosen}
          <h3 class="dnd-heading vd-title">{chosen.label ?? chosen.def.name}</h3>
          <p class="vd-sub">{chosen.def.name}{slot ? ` · Slot ${slot.code}` : ''}</p>
          <dl class="vd-chips">
            {#each getComponentSummary(system, chosen.def, vehicle.rulings).slice(0, 6) as chip (chip.label)}
              <div class="vd-chip"><dt>{chip.label}</dt><dd>{chip.value}</dd></div>
            {/each}
          </dl>
          {#if chosen.override && chosen.overrideReason}
            <p class="vd-warn">{chosen.overrideReason}</p>
          {/if}
          <div class="vd-acts">
            <Button variant="primary" size="sm" onclick={() => (browsing = { slot: chosen.slot, replacing: chosen.id })}>Change component</Button>
            <Button variant="danger" size="sm" onclick={() => remove(chosen.id)}>Remove</Button>
          </div>
          <Field id="vd-label" label="Label">
            <input
              id="vd-label"
              type="text"
              maxlength="80"
              value={chosen.label ?? ''}
              onchange={(event) => patch(chosen.id, { label: event.currentTarget.value.trim() || null })}
            />
          </Field>
            <div class="vd-rotate">
              <span class="dnd-label">Rotation {chosen.rotation ?? slot?.rotation ?? 0}°</span>
              <IconBtn title="Rotate left" onclick={() => patch(chosen.id, { rotation: ((chosen.rotation ?? slot?.rotation ?? 0) + 315) % 360 })}>
                <Glyph name="back" size="sm" />
              </IconBtn>
              <IconBtn title="Rotate right" onclick={() => patch(chosen.id, { rotation: ((chosen.rotation ?? slot?.rotation ?? 0) + 45) % 360 })}>
                <Glyph name="forward" size="sm" />
              </IconBtn>
              {#if chosen.x != null || chosen.rotation != null}
                <Button variant="ghost" size="sm" onclick={() => patch(chosen.id, { x: null, y: null, rotation: null })}>Reset</Button>
              {/if}
            </div>
          {#if chosen.def.category === 'hull'}
            <p class="vd-sub">A hull is installed or removed only in a dry dock (p. 15).</p>
          {/if}
        {:else if slot}
          <h3 class="dnd-heading vd-title">Slot {slot.code}</h3>
          <p class="vd-sub">{slot.label}: {slot.acceptedTypes.join(', ')} up to {slot.maxSize ?? 'any size'}.</p>
          {#if slot.notes}<p class="vd-sub">{slot.notes}</p>{/if}
          <Button variant="primary" size="sm" onclick={() => (browsing = { slot: slot.code, replacing: null })}>Add component</Button>
        {:else}
          <p class="dnd-empty">Choose a component or an empty slot on the deck or in the list.</p>
        {/if}
      </section>

      <section class="vd-card dnd-inset" aria-label="Review and save">
        <h3 class="dnd-label vd-head">Review and save</h3>
        {#if changes.length}
          <ul class="vd-changes">
            {#each changes as row, index (index)}
              <li><span class="vd-kind vd-kind-{row.kind}">{row.kind}</span> {row.text}</li>
            {/each}
          </ul>
        {:else}
          <p class="vd-sub">No unsaved changes.</p>
        {/if}
        {#each issues as issue, index (index)}
          <p class={issue.severity === 'error' ? 'vd-bad' : 'vd-warn'}>{issue.message}</p>
        {/each}
        <Field id="vd-note" label="What changed">
          <input id="vd-note" type="text" maxlength="200" placeholder="Upgraded the port battery" bind:value={note} />
        </Field>
        <div class="vd-acts">
          <Button variant="primary" size="sm" loading={busy} disabled={!canSave} onclick={save}>Save the design</Button>
        </div>
        {#if blocking.length}
          <p class="vd-bad">Resolve the compatibility errors before saving.</p>
        {/if}
      </section>
    </aside>
  </div>
</div>

{#if browsing}
  <BaseDialog
    isOpen={true}
    onClose={() => (browsing = null)}
    title={browsingCurrent ? `Change ${browsingCurrent.name}` : `Add to ${browsingSlot?.code ?? 'the deck'}`}
    width="min(72rem, 94vw)"
    maxHeight="88vh"
    zIndex={9000}
  >
    <div class="vd-browse">
      <ComponentBrowser
        {ctx}
        slot={browsingSlot}
        current={browsingCurrent}
        replacing={browsing.replacing}
        onpick={install}
      />
    </div>
  </BaseDialog>
{/if}

<style>
  .vd {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    min-width: 0;
  }

  .vd-bar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-3);
  }

  .vd-level {
    margin: 0;
    color: var(--metal-bright);
  }

  .vd-count {
    font-size: var(--text-xs);
    color: var(--ember-core);
  }

  .vd-run {
    flex: 1;
  }

  .vd-alarm {
    margin: 0;
    padding: var(--space-3);
    border: var(--border-hair) solid var(--state-bad);
    border-radius: var(--radius-sm);
    font-size: var(--text-sm);
    color: var(--ink);
  }

  .vd-grid {
    display: grid;
    grid-template-columns: minmax(0, 0.8fr) minmax(0, 2.2fr) minmax(0, 1.2fr);
    gap: var(--space-4);
    min-width: 0;
  }

  .vd-slots {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    padding: var(--space-3);
    min-width: 0;
  }

  .vd-slot-list {
    display: grid;
    gap: var(--space-1);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .vd-slot {
    display: flex;
    align-items: flex-start;
    gap: var(--space-2);
    inline-size: 100%;
    padding: var(--space-2);
    border: none;
    border-radius: var(--radius-sm);
    background: none;
    color: var(--ink);
    font: inherit;
    text-align: start;
    cursor: pointer;
  }

  .vd-slot:hover {
    background: var(--ground-raised);
  }

  .vd-slot:focus-visible {
    outline: none;
    box-shadow: var(--focus-ring);
  }

  .vd-slot-on {
    background: var(--ground-lift);
    box-shadow: var(--rim-thin);
  }

  .vd-slot-code {
    flex: none;
    inline-size: 4.5ch;
    font-family: var(--font-mono);
    font-size: var(--text-xs);
    color: var(--metal);
  }

  .vd-slot-body {
    display: grid;
    min-width: 0;
  }

  .vd-slot-name {
    font-size: var(--text-sm);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .vd-slot-empty {
    font-style: italic;
    color: var(--ink-faint);
  }

  .vd-slot-sub {
    font-size: var(--text-xs);
    color: var(--ink-faint);
  }

  .vd-board {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    min-width: 0;
  }

  .vd-map {
    block-size: clamp(22rem, 58vh, 48rem);
  }

  .vd-toggles {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2) var(--space-4);
    font-size: var(--text-sm);
  }

  .vd-toggle {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    color: var(--ink-dim);
    cursor: pointer;
  }

  .vd-hint {
    font-size: var(--text-xs);
    color: var(--ink-faint);
  }

  .vd-table {
    inline-size: 100%;
    border-collapse: collapse;
    font-size: var(--text-sm);
  }

  .vd-table th {
    font-family: var(--font-display);
    font-size: var(--text-xs);
    letter-spacing: var(--tracking-caps);
    text-transform: uppercase;
    text-align: start;
    color: var(--metal);
  }

  .vd-table td {
    padding: var(--space-1) var(--space-2) var(--space-1) 0;
    border-top: var(--border-hair) solid color-mix(in srgb, var(--metal-dim) 40%, transparent);
    font-variant-numeric: tabular-nums;
  }

  .vd-dim {
    color: var(--ink-faint);
  }

  .vd-up {
    color: var(--state-good);
  }

  .vd-down {
    color: var(--state-bad);
  }

  .vd-side {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    min-width: 0;
  }

  .vd-card {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    padding: var(--space-4);
  }

  .vd-title {
    margin: 0;
    font-size: var(--text-lg);
  }

  .vd-head {
    margin: 0;
    color: var(--metal-bright);
  }

  .vd-sub {
    margin: 0;
    font-size: var(--text-xs);
    color: var(--ink-dim);
  }

  .vd-text {
    margin: 0;
    font-size: var(--text-sm);
  }

  .vd-chips {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: var(--space-1);
    margin: 0;
  }

  .vd-chip {
    display: grid;
    justify-items: center;
    padding: var(--space-1);
    border-radius: var(--radius-sm);
    background: var(--ground-deep);
  }

  .vd-chip dt {
    font-family: var(--font-display);
    font-size: var(--text-xs);
    letter-spacing: var(--tracking-caps);
    color: var(--metal);
  }

  .vd-chip dd {
    margin: 0;
    font-family: var(--font-figures);
    font-size: var(--text-sm);
  }

  .vd-acts {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
    block-size: auto;
  }

  .vd-rotate {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    block-size: var(--space-6);
  }

  .vd-changes {
    display: grid;
    gap: var(--space-1);
    margin: 0;
    padding: 0;
    list-style: none;
    font-size: var(--text-sm);
  }

  .vd-kind {
    font-family: var(--font-display);
    font-size: var(--text-xs);
    letter-spacing: var(--tracking-caps);
    text-transform: uppercase;
    color: var(--verdigris);
  }

  .vd-kind-added {
    color: var(--state-good);
  }

  .vd-kind-removed {
    color: var(--state-bad);
  }

  .vd-warn {
    margin: 0;
    font-size: var(--text-xs);
    color: var(--state-warn);
  }

  .vd-bad {
    margin: 0;
    font-size: var(--text-xs);
    color: var(--state-bad);
  }

  .vd-request {
    display: grid;
    gap: var(--space-2);
    padding-block: var(--space-2);
    border-top: var(--border-hair) solid color-mix(in srgb, var(--metal-dim) 40%, transparent);
  }

  .vd-browse {
    padding: var(--space-4) var(--space-5) var(--space-5);
  }

  @container page (max-width: 1200px) {
    .vd-grid {
      grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    }

    .vd-board {
      grid-column: 1 / -1;
      order: -1;
    }
  }

  @container page (max-width: 760px) {
    .vd-grid {
      grid-template-columns: minmax(0, 1fr);
    }
  }
</style>
