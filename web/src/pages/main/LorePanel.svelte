<script lang="ts">
  import { navigate } from 'sly-svelte-location-router'
  import { user } from '$lib/stores/auth.store'
  import { getAll, RESOURCES, type Resource, type ResourceKind } from '$lib/resources'
  import IconBtn from '$components/ui/IconBtn.svelte'
  import Glyph from '$components/ui/Glyph.svelte'
  import ResourceCard from '$components/campaign/ResourceCard.svelte'

  const KINDS: ResourceKind[] = [
    'entries',
    'npcs',
    'places',
    'maps',
    'sessions',
    'items',
    'weapons',
    'armor'
  ]

  const TONES: Record<ResourceKind, 'metal' | 'ember' | 'verdigris'> = {
    entries: 'metal',
    npcs: 'ember',
    places: 'verdigris',
    maps: 'verdigris',
    sessions: 'metal',
    items: 'metal',
    weapons: 'metal',
    armor: 'metal'
  }

  let held = $state<Record<string, Resource[]>>({})
  let loading = $state(true)
  let error = $state<string | null>(null)
  let read = $state('')

  const written = $derived(KINDS.reduce((sum, kind) => sum + (held[kind]?.length ?? 0), 0))
  const filled = $derived(KINDS.filter((kind) => (held[kind]?.length ?? 0) > 0))

  $effect(() => {
    const userId = $user?.user_id ?? ''
    if (!userId || userId === read) return
    read = userId

    void (async () => {
      loading = true
      error = null
      try {
        const rolls = await Promise.all(KINDS.map((kind) => getAll({ at: 'user', id: userId }, kind)))
        held = Object.fromEntries(KINDS.map((kind, index) => [kind, rolls[index]]))
      } catch (reason) {
        error = reason instanceof Error ? reason.message : String(reason)
      } finally {
        loading = false
      }
    })()
  })
</script>

{#if loading}
  <div class="dnd-loading"><span class="dnd-spinner"></span></div>
{:else if error}
  <p class="lore-alarm" role="alert">{error}</p>
{:else if written === 0}
  <div class="dnd-empty">
    <span class="dnd-empty-mark"><Glyph name="scroll" size="lg" /></span>
    <span>You have written nothing of your own yet</span>
  </div>
{:else}
  <div class="lore-list">
    {#each filled as kind (kind)}
      <section class="lore-kind" aria-label={RESOURCES[kind].many}>
        <h3 class="lore-divide">
          <span class="dnd-label lore-divide-name">{RESOURCES[kind].many}</span>
          <span class="lore-divide-run"></span>
          <span class="lore-divide-count">{held[kind].length}</span>
          <IconBtn title="Open {RESOURCES[kind].many}" onclick={() => navigate(`/main/${kind}`)}>
            <Glyph name="forward" size="sm" />
          </IconBtn>
        </h3>

        {#each held[kind] as one (one.id)}
          <ResourceCard under="/main/{kind}" {kind} {one} tone={TONES[kind]} />
        {/each}
      </section>
    {/each}
  </div>
{/if}

<style>
  .lore-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-5);
    min-width: 0;
  }

  .lore-kind {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    min-width: 0;
  }

  .lore-divide {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    height: var(--space-6);
    margin: 0;
    padding-bottom: var(--space-1);
  }

  .lore-divide-name {
    flex: none;
    color: var(--metal);
    text-shadow: 0 1px 0 #000, 0 0 8px var(--ember-glow);
  }

  .lore-divide-run {
    flex: 1;
    min-width: 0;
    height: var(--border-hair);
    background: linear-gradient(90deg, var(--metal), var(--metal-dim) 40%, transparent);
    box-shadow: 0 1px 0 #000;
    opacity: 0.8;
  }

  .lore-divide-count {
    flex: none;
    font-family: var(--font-figures);
    font-size: var(--text-xs);
    font-variant-numeric: lining-nums tabular-nums;
    color: var(--ink-dim);
  }

  .lore-alarm {
    margin: 0;
    padding: var(--space-3);
    border: var(--border-hair) solid var(--state-bad);
    border-radius: var(--radius-sm);
    background: linear-gradient(180deg, color-mix(in srgb, var(--state-bad) 16%, transparent), transparent), var(--texture-noise), var(--ground-deep);
    box-shadow: var(--bevel-down);
    font-size: var(--text-sm);
    color: var(--ink);
  }
</style>
