<script lang="ts">
  import { getCompatibility, getComparison, getComponentSummary, getContext, getInstalled, getVehicleStats } from '$lib/rules/vehicle'
  import type { ComponentDef, InstalledComponent, Rulings, Slot, StatDiff, VehicleContext } from '$lib/rules/vehicle.types'
  import Button from '$components/ui/Button.svelte'
  import Field from '$components/ui/Field.svelte'

  const {
    ctx,
    slot = null,
    current = null,
    replacing = null,
    onpick
  }: {
    /** The vessel as it is drafted, which the candidates are checked against. */
    ctx: VehicleContext
    /** The slot a component goes into, or null to browse the whole catalogue. */
    slot?: Slot | null
    /** The definition being replaced, when one is. */
    current?: ComponentDef | null
    /** The installed component being replaced, excluded from the occupancy check. */
    replacing?: string | null
    /** Runs with the chosen definition, and the override reason when it is installed over an error. */
    onpick?: (def: ComponentDef, override: string | null) => void
  } = $props()

  const TIERS = ['Basic', 'Superior', 'Masterwork']

  let search = $state('')
  let category = $state('')
  let loose = $state(false)
  let chosen = $state<string | null>(null)
  let reason = $state('')

  const shown = $derived(category || (slot ? 'fit' : 'all'))
  const system = $derived(ctx.system)
  const rulings = $derived<Rulings>(ctx.rulings)
  const categoryName = (key: string) => system.categories.find((entry) => entry.key === key)?.name ?? key

  const rows = $derived(
    system.components
      .filter((def) => !def.retired && def.key !== current?.key)
      .map((def) => {
        const issues = slot ? getCompatibility(system, slot, def, ctx.components, replacing) : []
        return { def, issues, fits: !issues.some((issue) => issue.severity === 'error') }
      })
      .filter((row) => {
        const words = `${row.def.name} ${row.def.family ?? ''} ${categoryName(row.def.category)}`.toLowerCase()
        if (search && !words.includes(search.toLowerCase())) return false
        if (shown === 'fit') return slot ? [row.def.category, ...row.def.slotTypes].some((type) => slot.acceptedTypes.includes(type)) : true
        return shown === 'all' || row.def.category === shown
      })
      .filter((row) => !slot || loose || row.fits)
      .sort(
        (a, b) =>
          Number(b.fits) - Number(a.fits) ||
          categoryName(a.def.category).localeCompare(categoryName(b.def.category)) ||
          (a.def.family ?? '').localeCompare(b.def.family ?? '') ||
          TIERS.indexOf(a.def.tier ?? '') - TIERS.indexOf(b.def.tier ?? '')
      )
  )

  const candidate = $derived(rows.find((row) => row.def.key === chosen) ?? null)
  const diff = $derived<StatDiff[]>(
    candidate ? getComparison(system, current, candidate.def, rulings).filter((row) => row.direction !== 'same' || row.before !== '—') : []
  )
  const after = $derived.by(() => {
    if (!candidate || !slot) return null
    const base = getInstalled(ctx.components)
    const fresh: InstalledComponent = {
      id: replacing ?? 'candidate',
      slot: slot.code,
      component: candidate.def.key,
      label: null,
      x: null,
      y: null,
      rotation: null,
      override: false,
      overrideReason: null
    }
    const next = replacing ? base.map((entry) => (entry.id === replacing ? { ...fresh, label: entry.label } : entry)) : [...base, fresh]
    const before = getVehicleStats(ctx)
    return getVehicleStats(getContext(system, ctx.layout, next, ctx.stats, ctx.states, rulings)).map((line) => ({
      line,
      before: before.find((entry) => entry.key === line.key)
    }))
  })

  function pick() {
    if (!candidate) return
    const override = candidate.fits ? null : reason.trim() || 'Installed despite compatibility issues.'
    onpick?.(candidate.def, override)
  }

  const arrow = (direction: StatDiff['direction']) => (direction === 'better' ? '▲' : direction === 'worse' ? '▼' : direction === 'changed' ? '◆' : '')

</script>

<div class="cb">
  <div class="cb-list">
    <div class="cb-filters">
      <Field id="cb-search" label="Search">
        <input id="cb-search" type="search" placeholder="Cannon, mast, hull…" bind:value={search} />
      </Field>
      <Field id="cb-category" label="Category">
        <select id="cb-category" value={shown} onchange={(event) => (category = event.currentTarget.value)}>
          {#if slot}<option value="fit">Fits this slot</option>{/if}
          <option value="all">All categories</option>
          {#each system.categories as entry (entry.key)}
            <option value={entry.key}>{entry.name}</option>
          {/each}
        </select>
      </Field>
      {#if slot}
        <label class="cb-loose">
          <input type="checkbox" bind:checked={loose} />
          <span>Show what does not fit</span>
        </label>
      {/if}
    </div>

    <ul class="dnd-scroll cb-rows" aria-label="Components">
      {#each rows as row (row.def.key)}
        <li>
          <button type="button" class="cb-row" class:cb-row-on={chosen === row.def.key} class:cb-row-off={!row.fits} onclick={() => (chosen = row.def.key)}>
            <span class="cb-row-head">
              <span class="cb-row-name">{row.def.name}</span>
              {#if slot}
                <span class="cb-mark" class:cb-mark-bad={!row.fits}>{row.fits ? 'Fits' : 'Does not fit'}</span>
              {:else if row.def.homebrew}
                <span class="cb-mark cb-mark-warn">Homebrew</span>
              {/if}
            </span>
            <span class="cb-row-sub">{categoryName(row.def.category)} · {row.def.tier ?? 'no tier'} · {row.def.size ?? '—'}</span>
            <span class="cb-chips">
              {#each getComponentSummary(system, row.def, rulings).slice(0, 7) as chip (chip.label)}
                <span class="cb-chip"><small>{chip.label}</small> {chip.value}</span>
              {/each}
            </span>
            {#if !row.fits}
              <span class="cb-why">{row.issues.filter((issue) => issue.severity === 'error').map((issue) => issue.message).join(' ')}</span>
            {/if}
          </button>
        </li>
      {:else}
        <li class="dnd-empty">Nothing matches. Try all categories{slot ? ' or show what does not fit' : ''}.</li>
      {/each}
    </ul>
  </div>

  <aside class="cb-side dnd-inset" aria-label="The chosen component">
    {#if candidate}
      <p class="dnd-label">{current ? `Replacing ${current.name}` : 'Chosen'}</p>
      <h3 class="dnd-heading cb-side-title">{candidate.def.name}</h3>
      {#if candidate.def.description}
        <p class="cb-text">{candidate.def.description}</p>
      {/if}
      <table class="cb-table">
        <thead>
          <tr><th>Stat</th><th>{current ? 'Now' : ''}</th><th>Chosen</th></tr>
        </thead>
        <tbody>
          {#each diff as row (row.label)}
            <tr>
              <td>{row.label}</td>
              <td class="cb-dim">{row.before}</td>
              <td class="cb-dir-{row.direction}">{row.after} <small>{arrow(row.direction)}</small></td>
            </tr>
          {/each}
        </tbody>
      </table>
      {#if after}
        <p class="dnd-label">The vessel after</p>
        <dl class="dnd-facts cb-after">
          {#each after as { line, before } (line.key)}
            <dt>{line.label}</dt>
            <dd>
              {line.value}{#if before && before.value !== line.value}<span class="cb-dim"> (was {before.value})</span>{/if}
            </dd>
          {/each}
        </dl>
      {/if}
      {#if onpick}
        {#if !candidate.fits}
          <Field id="cb-reason" label="Why it goes in anyway" help="It does not fit this slot; the reason is kept on the component.">
            <input id="cb-reason" type="text" bind:value={reason} placeholder="Stat block size exceeds the slot" />
          </Field>
        {/if}
        <Button variant="primary" fill onclick={pick}>
          {candidate.fits ? (current ? 'Swap it in' : 'Install') : 'Install as override'}
        </Button>
      {/if}
    {:else}
      <p class="dnd-empty">Choose a component to compare it{current ? ` with ${current.name}` : ''}.</p>
    {/if}
  </aside>
</div>

<style>
  .cb {
    display: grid;
    grid-template-columns: minmax(0, 1.6fr) minmax(0, 1fr);
    gap: var(--space-4);
    min-height: 0;
  }

  .cb-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    min-width: 0;
    min-height: 0;
  }

  .cb-filters {
    display: grid;
    grid-template-columns: minmax(0, 2fr) minmax(0, 1fr);
    align-items: end;
    gap: var(--space-3);
  }

  .cb-loose {
    grid-column: 1 / -1;
    display: flex;
    align-items: center;
    gap: var(--space-2);
    font-size: var(--text-sm);
    color: var(--ink-dim);
    cursor: pointer;
  }

  .cb-rows {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(min(16rem, 100%), 1fr));
    align-content: start;
    gap: var(--space-2);
    max-height: 60vh;
    margin: 0;
    padding: 0 var(--space-1) 0 0;
    list-style: none;
    overflow-y: auto;
  }

  .cb-row {
    display: grid;
    gap: var(--space-1);
    inline-size: 100%;
    block-size: 100%;
    padding: var(--space-3);
    border: none;
    border-radius: var(--radius-md);
    background: var(--texture-noise), linear-gradient(180deg, var(--ground-raised), var(--ground-deep));
    box-shadow: var(--rim-thin), inset 0 0 16px 2px var(--shade-hard);
    color: var(--ink);
    font: inherit;
    text-align: start;
    cursor: pointer;
    transition: filter 0.18s ease, box-shadow 0.18s ease;
  }

  .cb-row:hover {
    filter: brightness(1.08);
  }

  .cb-row:focus-visible {
    outline: none;
    box-shadow: var(--focus-ring);
  }

  .cb-row-on {
    box-shadow: var(--rim-thin), inset 0 0 22px -6px var(--ember-glow), 0 0 12px var(--ember-glow);
  }

  .cb-row-off {
    opacity: 0.7;
  }

  .cb-row-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: var(--space-2);
  }

  .cb-row-name {
    font-family: var(--font-display);
    letter-spacing: var(--tracking-wide);
    color: var(--metal-bright);
  }

  .cb-row-sub {
    font-size: var(--text-xs);
    color: var(--ink-faint);
  }

  .cb-mark {
    flex: none;
    font-family: var(--font-display);
    font-size: var(--text-xs);
    letter-spacing: var(--tracking-caps);
    text-transform: uppercase;
    color: var(--state-good);
  }

  .cb-mark-bad {
    color: var(--state-bad);
  }

  .cb-mark-warn {
    color: var(--state-warn);
  }

  .cb-chips {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-1);
  }

  .cb-chip {
    padding: 0 var(--space-1);
    border-radius: var(--radius-sm);
    background: var(--ground-deep);
    font-family: var(--font-figures);
    font-size: var(--text-xs);
    color: var(--ink-dim);
  }

  .cb-chip small {
    color: var(--metal);
  }

  .cb-why {
    margin: 0;
    font-size: var(--text-xs);
    color: var(--state-bad);
  }

  .cb-side {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    min-width: 0;
    padding: var(--space-4);
  }

  .cb-side-title {
    margin: 0;
    font-size: var(--text-lg);
  }

  .cb-text {
    margin: 0;
    font-size: var(--text-sm);
    color: var(--ink-dim);
  }

  .cb-table {
    inline-size: 100%;
    border-collapse: collapse;
    font-size: var(--text-sm);
  }

  .cb-table th {
    font-family: var(--font-display);
    font-size: var(--text-xs);
    font-weight: 700;
    letter-spacing: var(--tracking-caps);
    text-transform: uppercase;
    text-align: start;
    color: var(--metal);
  }

  .cb-table td {
    padding: var(--space-1) var(--space-2) var(--space-1) 0;
    border-top: var(--border-hair) solid color-mix(in srgb, var(--metal-dim) 40%, transparent);
    font-variant-numeric: tabular-nums;
  }

  .cb-dim {
    color: var(--ink-faint);
  }

  .cb-dir-better {
    color: var(--state-good);
  }

  .cb-dir-worse {
    color: var(--state-bad);
  }

  .cb-dir-changed {
    color: var(--verdigris);
  }

  .cb-after {
    font-size: var(--text-sm);
  }

  @container page (max-width: 760px) {
    .cb {
      grid-template-columns: minmax(0, 1fr);
    }
  }
</style>
