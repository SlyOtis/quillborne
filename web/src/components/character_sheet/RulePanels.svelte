<script lang="ts">
  import { getContext } from 'svelte'
  import type { Readable } from 'svelte/store'
  import type { RulesState } from '$lib/rules/store'
  import type { PanelField, ResolvedCharacter } from '$lib/rules/spec.types'

  const {
    skip = []
  }: {
    /** Panel ids the bespoke sheet layout already renders. */
    skip?: string[]
  } = $props()

  const rules = getContext<Readable<RulesState>>('rules')

  const panels = $derived($rules.resolved?.panels.filter((panel) => !skip.includes(panel.id)) ?? [])

  function getEntry(resolved: ResolvedCharacter, field: PanelField) {
    if (field.source === 'attribute') {
      const entry = resolved.attributes.find((candidate) => candidate.id === field.id)
      return entry && { title: entry.title, value: entry.value, note: String(entry.score) }
    }
    if (field.source === 'skill') {
      const entry = resolved.skills.find((candidate) => candidate.id === field.id)
      return entry && { title: entry.title, value: entry.value, note: entry.tier }
    }
    if (field.source === 'save') {
      const entry = resolved.saves.find((candidate) => candidate.id === field.id)
      return entry && { title: entry.title, value: entry.value, note: entry.tier }
    }
    if (field.source === 'sense') {
      const entry = resolved.senses.find((candidate) => candidate.id === field.id)
      return entry && { title: entry.title, value: entry.value, note: entry.unit }
    }
    if (field.source === 'pool') {
      const entry = resolved.pools.find((candidate) => candidate.id === field.id)
      return entry && { title: entry.title, value: entry.remaining, note: `of ${entry.max}` }
    }
    const entry = resolved.derived.find((candidate) => candidate.id === field.id)
    return entry && { title: entry.title, value: entry.value, note: entry.unit }
  }
</script>

{#if $rules.error}
  <div class="dnd-rule-panels-error">{$rules.error}</div>
{:else if $rules.resolved}
  {#each panels as panel (panel.id)}
    <section class="dnd-rule-panel dnd-panel dnd-keyline">
      <div class="dnd-rule-panel-body dnd-rule-panel-{panel.layout}">
        {#each panel.fields as field (field.source + field.id)}
          {@const entry = getEntry($rules.resolved, field)}
          {#if entry}
            <div class="dnd-rule-panel-entry dnd-panel dnd-keyline">
              <span class="dnd-rule-panel-value">{entry.value}</span>
              {#if entry.note}<span class="dnd-rule-panel-note">{entry.note}</span>{/if}
              <span class="dnd-rule-panel-label">{entry.title}</span>
            </div>
          {/if}
        {/each}
      </div>
      <h3 class="dnd-rule-panel-title">{panel.title}</h3>
    </section>
  {/each}
{/if}

<style>
  .dnd-rule-panel {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    padding: var(--space-3);
    background: var(--texture-noise), linear-gradient(180deg, var(--ground-raised), var(--ground-deep));
    box-shadow: var(--rim-thin), inset 0 0 16px 2px var(--shade-hard), var(--shadow-md);
  }

  .dnd-rule-panel-title {
    margin: auto calc(var(--space-1) - var(--space-3)) calc(var(--space-1) - var(--space-3));
    padding: var(--space-1) var(--space-3);
    background:
      linear-gradient(180deg, color-mix(in srgb, var(--stone-light) 20%, transparent) 0%, color-mix(in srgb, #000 45%, transparent) 60%, color-mix(in srgb, #000 65%, transparent) 100%),
      var(--texture-noise),
      var(--stone);
    box-shadow: var(--bevel-up), inset 0 1px 0 var(--metal-dim), inset 0 2px 0 var(--keyline);
    font-family: var(--font-display);
    font-size: var(--text-xs);
    font-weight: 700;
    letter-spacing: var(--tracking-caps);
    text-transform: uppercase;
    text-align: center;
    color: var(--metal-bright);
    text-shadow: 0 1px 0 #000;
  }

  .dnd-rule-panel-body {
    display: grid;
    gap: var(--space-2);
  }

  .dnd-rule-panel-grid {
    grid-template-columns: repeat(auto-fit, minmax(var(--space-8), 1fr));
  }

  .dnd-rule-panel-row {
    grid-auto-flow: column;
    grid-auto-columns: minmax(var(--space-8), 1fr);
  }

  .dnd-rule-panel-list {
    grid-template-columns: 1fr;
  }

  .dnd-rule-panel-entry {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--space-1);
    padding: var(--space-2);
    background: var(--texture-noise), linear-gradient(180deg, var(--ground-deep) 0%, var(--ground) 100%);
    border: var(--border-hair) solid color-mix(in srgb, var(--metal-dim) 60%, transparent);
    border-radius: var(--radius-sm);
    box-shadow: var(--bevel-down);
  }

  .dnd-rule-panel-value {
    font-family: var(--font-figures);
    font-size: var(--text-lg);
    font-weight: 700;
    font-variant-numeric: lining-nums tabular-nums;
    color: var(--metal-bright);
    text-shadow: 0 1px 0 #000;
  }

  .dnd-rule-panel-label {
    font-family: var(--font-display);
    font-size: var(--text-xs);
    letter-spacing: var(--tracking-wide);
    color: var(--ink);
    text-align: center;
  }

  .dnd-rule-panel-note {
    font-size: var(--text-xs);
    font-style: italic;
    color: var(--ink-dim);
  }

  .dnd-rule-panels-error {
    padding: var(--space-3);
    border: var(--border-hair) solid color-mix(in srgb, var(--state-bad) 55%, transparent);
    border-radius: var(--radius-sm);
    background: linear-gradient(color-mix(in srgb, var(--state-bad) 20%, transparent), color-mix(in srgb, var(--state-bad) 20%, transparent)), var(--texture-noise), var(--ground-deep);
    box-shadow: var(--bevel-down);
    color: var(--ink);
    font-size: var(--text-sm);
  }
</style>
