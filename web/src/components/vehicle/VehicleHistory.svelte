<script lang="ts">
  import type { Vehicle, VehicleFields, VehicleRevision } from '$lib/api/types'
  import { getDef } from '$lib/rules/vehicle'
  import type { InstalledComponent, VehicleSystem } from '$lib/rules/vehicle.types'
  import Button from '$components/ui/Button.svelte'

  const {
    vehicle,
    system,
    names,
    onsave
  }: {
    /** The vessel whose revisions are read. */
    vehicle: Vehicle
    /** The vehicle system the component names come from. */
    system: VehicleSystem
    /** Player names by user id. */
    names: Record<string, string>
    /** Writes the given vessel fields. */
    onsave: (fields: VehicleFields) => Promise<void>
  } = $props()

  let busy = $state(false)
  let error = $state<string | null>(null)

  const revisions = $derived([...vehicle.history].sort((a, b) => b.revision - a.revision))

  const nameOf = (row: InstalledComponent) => row.label ?? getDef(system, row.component)?.name ?? row.component

  function getChanges(revision: VehicleRevision): string[] {
    const earlier = vehicle.history.filter((entry) => entry.revision < revision.revision).sort((a, b) => b.revision - a.revision)[0]
    if (!earlier) return [`Built with ${revision.components.length} components`]
    const out: string[] = []
    for (const was of earlier.components) {
      const now = revision.components.find((row) => row.id === was.id)
      if (!now) {
        const swap = revision.components.find((row) => row.slot === was.slot && !earlier.components.some((old) => old.id === row.id))
        out.push(swap ? `${was.slot}: ${nameOf(was)} → ${nameOf(swap)}` : `${was.slot ?? 'Unslotted'}: removed ${nameOf(was)}`)
      } else if (now.x !== was.x || now.y !== was.y || now.rotation !== was.rotation || now.slot !== was.slot) {
        out.push(`${now.slot}: placement changed`)
      } else if ((now.label ?? null) !== (was.label ?? null)) {
        out.push(`${now.slot}: label “${now.label ?? ''}”`)
      }
    }
    for (const row of revision.components) {
      const known = earlier.components.some((old) => old.id === row.id)
      const swapped = earlier.components.some((old) => old.slot === row.slot && !revision.components.some((now) => now.id === old.id))
      if (!known && !swapped) out.push(`${row.slot ?? 'Unslotted'}: added ${nameOf(row)}`)
    }
    return out.length ? out : ['No change to the components']
  }

  async function restore(revision: VehicleRevision) {
    busy = true
    error = null
    try {
      await onsave({ components: revision.components, revision: vehicle.revision, note: `Restored revision ${revision.revision}` })
    } catch (reason) {
      error = reason instanceof Error ? reason.message : String(reason)
    } finally {
      busy = false
    }
  }
</script>

<section class="vh" aria-label="History">
  {#if error}
    <p class="vh-bad" role="alert">{error}</p>
  {/if}
  <ol class="vh-list">
    {#each revisions as revision (revision.revision)}
      <li class="vh-entry">
        <div class="vh-line">
          <span class="vh-number">Revision {revision.revision}</span>
          <span class="vh-meta">{new Date(revision.at).toLocaleString()} · {names[revision.user_id] ?? 'A player'}</span>
          {#if revision.revision === vehicle.revision}
            <span class="vh-now">Current</span>
          {:else}
            <Button variant="ghost" size="sm" loading={busy} onclick={() => restore(revision)}>Restore</Button>
          {/if}
        </div>
        <p class="vh-note">{revision.note}</p>
        <ul class="vh-changes">
          {#each getChanges(revision) as change, index (index)}
            <li>{change}</li>
          {/each}
        </ul>
      </li>
    {/each}
  </ol>
</section>

<style>
  .vh {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    max-width: 70ch;
  }

  .vh-list {
    display: grid;
    gap: var(--space-3);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .vh-entry {
    display: grid;
    gap: var(--space-2);
    padding: var(--space-3) var(--space-4);
    border-radius: var(--radius-sm);
    background: var(--texture-noise), linear-gradient(180deg, var(--ground-raised), var(--ground-deep));
    box-shadow: var(--rim-thin), inset 0 0 16px 2px var(--shade-hard);
  }

  .vh-line {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-3);
    min-block-size: var(--space-5);
  }

  .vh-number {
    font-family: var(--font-display);
    letter-spacing: var(--tracking-wide);
    color: var(--metal-bright);
  }

  .vh-meta {
    flex: 1;
    font-size: var(--text-xs);
    color: var(--ink-faint);
  }

  .vh-now {
    font-family: var(--font-display);
    font-size: var(--text-xs);
    letter-spacing: var(--tracking-caps);
    text-transform: uppercase;
    color: var(--ember-core);
  }

  .vh-note {
    margin: 0;
    color: var(--ink);
  }

  .vh-changes {
    display: grid;
    gap: var(--space-1);
    margin: 0;
    padding-inline-start: var(--space-4);
    font-size: var(--text-sm);
    color: var(--ink-dim);
  }

  .vh-bad {
    margin: 0;
    font-size: var(--text-sm);
    color: var(--state-bad);
  }
</style>
