<script lang="ts">
  import { onMount } from 'svelte'
  import { navigate } from 'sly-svelte-location-router'
  import { getTheme, setTheme } from '$lib/dialogs/theme'
  import { getCatalogEntry, getCatalogFacts, type CatalogEntry, type CatalogKind } from '$lib/catalog'
  import Button from '$components/ui/Button.svelte'
  import Ornament from '$components/ui/Ornament.svelte'
  import Panel from '$components/ui/Panel.svelte'
  import Portrait from '$components/ui/Portrait.svelte'
  import Shell from '$components/ui/Shell.svelte'

  const { route }: { route?: { params?: Record<string, string> } } = $props()

  let entry = $state<CatalogEntry | null>(null)
  let loading = $state(true)
  let error = $state<string | null>(null)

  const kind = $derived((route?.params?.kind ?? 'classes') as CatalogKind)
  const one = $derived(kind === 'classes' ? 'class' : 'race')

  const traits = $derived(
    ((entry?.features ?? entry?.traits ?? []) as { id: string; name: string; description: string; level?: number }[])
  )

  const levels = $derived(
    [...new Set(traits.map((trait) => trait.level ?? 0))].sort((first, second) => first - second)
  )

  onMount(async () => {
    setTheme(getTheme())

    const id = route?.params?.id
    if (!id) {
      error = 'Nothing was named in the address.'
      loading = false
      return
    }

    try {
      entry = await getCatalogEntry(kind, id)
    } catch (reason) {
      error = reason instanceof Error ? reason.message : String(reason)
    } finally {
      loading = false
    }
  })
</script>

<Shell title={entry?.name ?? one}>
  {#if loading}
    <div class="dnd-loading"><span class="dnd-spinner"></span></div>
  {:else if error || !entry}
    <div class="source-alarm" role="alert">
      <p class="source-alarm-text">{error ?? 'That is not on the shelf.'}</p>
      <Button variant="secondary" size="sm" onclick={() => navigate('/main')}>Back to the table</Button>
    </div>
  {:else}
    <header class="source-crown">
      {#if entry.image}
        <Portrait src={String(entry.image)} alt={entry.name} frame="lancet" size="lg" />
      {:else}
        <span class="source-crest">
          <span class="source-plate dnd-shield"></span>
          <Ornament name="crest" size="md" tone="metal" />
        </span>
      {/if}
      <p class="dnd-label source-eyebrow">{one}</p>
      <h1 class="dnd-heading dnd-heading-hero source-name">{entry.name}</h1>
      <span class="source-rule"><Ornament name="divider" tone="metal" /></span>
      <p class="source-lede">{entry.description}</p>

      <dl class="source-facts">
        {#each getCatalogFacts(kind, entry) as fact (fact.key)}
          <div class="source-fact">
            <dt>{fact.key}</dt>
            <dd>{fact.value}</dd>
          </div>
        {/each}
      </dl>
    </header>

    {#if (entry.full as string[] | undefined)?.length}
      <Panel title="About the {one}">
        {#each entry.full as string[] as paragraph, index (index)}
          <p class="source-prose">{paragraph}</p>
        {/each}
      </Panel>
    {/if}

    {#if traits.length === 0}
      <Panel title={kind === 'classes' ? 'Features' : 'Traits'}>
        <p class="source-note">
          Nothing is written down for this {one} yet. Upload a source for it on the {one} step and the reading fills
          this page.
        </p>
      </Panel>
    {:else if kind === 'classes'}
      {#each levels as level (level)}
        <Panel title={level ? `Level ${level}` : 'Always'}>
          <ul class="source-list">
            {#each traits.filter((trait) => (trait.level ?? 0) === level) as trait (trait.id)}
              <li class="source-trait">
                <p class="source-trait-name">{trait.name}</p>
                <p class="source-trait-note">{trait.description}</p>
              </li>
            {/each}
          </ul>
        </Panel>
      {/each}
    {:else}
      <Panel title="Traits">
        <ul class="source-list">
          {#each traits as trait (trait.id)}
            <li class="source-trait">
              <p class="source-trait-name">{trait.name}</p>
              <p class="source-trait-note">{trait.description}</p>
            </li>
          {/each}
        </ul>
      </Panel>
    {/if}
  {/if}
</Shell>

<style>
  .source-crown {
    --source-rule-run: calc(var(--space-8) * 6);
    --source-rule-share: 70%;
    --source-crest-lift: drop-shadow(0 var(--space-1) var(--space-3) var(--shade-hard));
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-2);
    min-width: 0;
    text-align: center;
  }

  .source-crest {
    position: relative;
    isolation: isolate;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: var(--space-3) var(--space-6) var(--space-5);
    filter: var(--source-crest-lift);
  }

  .source-plate {
    position: absolute;
    inset: 0;
    z-index: -1;
    background:
      linear-gradient(180deg, color-mix(in srgb, var(--stone-light) 20%, transparent) 0%, color-mix(in srgb, var(--ground-deep) 45%, transparent) 60%, color-mix(in srgb, var(--ground-deep) 65%, transparent) 100%),
      var(--texture-noise),
      var(--stone);
    box-shadow: var(--rim-thin), var(--bevel-up);
  }

  .source-eyebrow {
    margin: 0;
    color: var(--metal);
  }

  .source-name {
    font-size: var(--text-2xl);
    color: var(--metal-bright);
    text-shadow: 0 0.125rem 0 var(--ground-deep), 0 0 0.875rem var(--ember-glow), 0 0 2rem color-mix(in srgb, var(--ember-glow) 55%, transparent);
    overflow-wrap: anywhere;
  }

  .source-rule {
    display: block;
    width: min(var(--source-rule-run), var(--source-rule-share));
  }

  .source-lede {
    max-width: 72ch;
    margin: 0;
    color: var(--ink);
    overflow-wrap: anywhere;
  }

  .source-facts {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: var(--space-5);
    margin: var(--space-4) 0 0;
  }

  .source-fact {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    align-items: center;
    padding: var(--space-2) var(--space-4);
    border-radius: var(--radius-sm);
    background: var(--texture-noise), linear-gradient(180deg, var(--ground-raised) 0%, var(--ground-deep) 100%);
    box-shadow: var(--rim-thin), inset 0 0 0.75rem 0.125rem var(--shade-hard);
  }

  .source-fact dt {
    font-family: var(--font-display);
    font-size: var(--text-xs);
    letter-spacing: var(--tracking-caps);
    text-transform: uppercase;
    color: var(--metal);
    text-shadow: 0 0.0625rem 0 var(--ground-deep);
  }

  .source-fact dd {
    margin: 0;
    font-family: var(--font-figures);
    font-size: var(--text-lg);
    font-weight: 700;
    font-variant-numeric: lining-nums tabular-nums;
    color: var(--metal-bright);
    text-shadow: 0 0.0625rem 0 var(--ground-deep), 0 0 0.5rem var(--ember-glow);
  }

  .source-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .source-trait {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    padding-bottom: var(--space-4);
    border-bottom: none;
    box-shadow: 0 0.0625rem 0 var(--ground-deep), 0 0.125rem 0 color-mix(in srgb, var(--metal-dim) 70%, transparent);
  }

  .source-trait:last-child {
    padding-bottom: 0;
    box-shadow: none;
  }

  .source-trait-name {
    margin: 0;
    font-family: var(--font-display);
    font-size: var(--text-md);
    letter-spacing: var(--tracking-wide);
    color: var(--metal-bright);
    text-shadow: 0 0.0625rem 0 var(--ground-deep);
  }

  .source-trait-note {
    margin: 0;
    max-width: 78ch;
    font-size: var(--text-sm);
    color: var(--ink-dim);
    overflow-wrap: anywhere;
  }

  .source-prose {
    max-width: 78ch;
    margin: 0;
    font-size: var(--text-md);
    line-height: 1.7;
    color: var(--ink);
    overflow-wrap: anywhere;
  }

  .source-note {
    margin: 0;
    font-size: var(--text-sm);
    color: var(--ink-dim);
  }

  .source-alarm {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-4);
    border: var(--border-hair) solid color-mix(in srgb, var(--state-bad) 55%, transparent);
    border-radius: var(--radius-sm);
    background: linear-gradient(180deg, color-mix(in srgb, var(--state-bad) 18%, transparent), transparent), var(--texture-noise), var(--ground-deep);
    box-shadow: var(--bevel-down);
  }

  .source-alarm-text {
    flex: 1;
    min-width: 0;
    margin: 0;
    font-size: var(--text-sm);
    color: var(--ink);
  }
</style>
