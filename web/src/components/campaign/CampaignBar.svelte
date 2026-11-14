<script lang="ts" module>
  export type BarStop = { id: string; label: string }

  export const SECTIONS: { id: string; label: string; under: BarStop[] }[] = [
    { id: 'overview', label: 'Overview', under: [] },
    {
      id: 'story',
      label: 'Story',
      under: [
        { id: 'sessions', label: 'Sessions' },
        { id: 'entries', label: 'Lore' }
      ]
    },
    {
      id: 'people',
      label: 'Party',
      under: [
        { id: 'party', label: 'Characters' },
        { id: 'npcs', label: 'NPCs' },
        { id: 'members', label: 'Players' }
      ]
    },
    {
      id: 'world',
      label: 'World',
      under: [
        { id: 'maps', label: 'Maps' },
        { id: 'places', label: 'Places' },
        { id: 'vehicles', label: 'Vehicles' }
      ]
    },
    {
      id: 'gear',
      label: 'Gear',
      under: [
        { id: 'items', label: 'Items' },
        { id: 'weapons', label: 'Weapons' },
        { id: 'armor', label: 'Armor' }
      ]
    },
    {
      id: 'table',
      label: 'Table',
      under: [{ id: 'encounter', label: 'Encounter' }]
    }
  ]

  /** Names the section a stop belongs to, so a page opened straight from a link shows the right one. */
  export function getSection(stop: string): string {
    return SECTIONS.find((entry) => entry.under.some((one) => one.id === stop))?.id ?? 'overview'
  }
</script>

<script lang="ts">
  import type { Snippet } from 'svelte'

  const {
    stop,
    onopen,
    tail
  }: {
    /** The sub navigation entry the page is showing. */
    stop: string
    /** Runs with the stop the reader picked. */
    onopen: (stop: string) => void
    /** Controls placed at the end of the bar. */
    tail?: Snippet
  } = $props()

  const section = $derived(getSection(stop))
  const under = $derived(SECTIONS.find((entry) => entry.id === section)?.under ?? [])
</script>

{#if under.length > 0}
<nav class="camp-bar" aria-label="Campaign">
  {#each under as entry (entry.id)}
    <button
      type="button"
      class="camp-jump"
      class:camp-jump-on={entry.id === stop}
      aria-current={entry.id === stop ? 'page' : undefined}
      onclick={() => onopen(entry.id)}
    >
      {entry.label}
    </button>
  {/each}

  <span class="camp-bar-run"></span>

  {#if tail}{@render tail()}{/if}
</nav>
{/if}

<style>
  .camp-bar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2);
    width: 100%;
    min-height: var(--space-7);
    min-width: 0;
    padding-block: var(--space-2);
    padding-inline: var(--space-3);
    background:
      linear-gradient(180deg, color-mix(in srgb, var(--stone-light) 20%, transparent), color-mix(in srgb, var(--shadow-ink) 45%, transparent) 60%, color-mix(in srgb, var(--shadow-ink) 65%, transparent)),
      var(--texture-noise),
      var(--stone);
    border: none;
    box-shadow: var(--bevel-up), inset 0 -1px 0 var(--keyline), 0 1px 0 var(--metal-dim), 0 2px 0 var(--metal), 0 3px 0 var(--keyline), 0 5px 8px var(--shade);
  }

  .camp-jump {
    flex: none;
    padding: var(--space-1) var(--space-3);
    border: none;
    border-radius: var(--radius-sm);
    background: var(--texture-noise), linear-gradient(180deg, var(--ground-raised) 0%, var(--ground-deep) 100%);
    box-shadow: var(--bevel-down), inset 0 0 0 1px var(--metal-dim);
    font-family: var(--font-display);
    font-size: var(--text-xs);
    letter-spacing: var(--tracking-caps);
    text-transform: uppercase;
    font-weight: 700;
    color: var(--metal);
    text-shadow: 0 1px 0 var(--shadow-ink);
    cursor: pointer;
    transition: color 0.15s ease, text-shadow 0.15s ease, box-shadow 0.15s ease;
  }

  .camp-jump:hover {
    color: var(--metal-bright);
    text-shadow: var(--glow-text);
    box-shadow: var(--bevel-down), inset 0 0 0 1px var(--metal);
  }

  .camp-jump:active {
    filter: brightness(0.85);
  }

  .camp-jump-on {
    background:
      radial-gradient(ellipse 80% 120% at 50% 110%, var(--ember-glow) 0%, transparent 70%),
      var(--texture-noise),
      linear-gradient(180deg, var(--ground-lift) 0%, var(--ground-raised) 100%);
    color: var(--metal-bright);
    text-shadow: var(--glow-text);
    box-shadow: var(--rim-thin), 0 0 12px var(--ember-glow);
  }

  .camp-jump:focus-visible {
    outline: none;
    box-shadow: var(--focus-ring);
  }

  .camp-bar-run {
    flex: 1;
    min-width: 0;
    height: var(--border-hair);
    background: linear-gradient(90deg, var(--metal), var(--metal-dim) 40%, transparent);
    box-shadow: 0 1px 0 var(--shadow-ink);
  }
</style>
