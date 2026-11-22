<script lang="ts">
  import { getMonsters } from '$lib/api'
  import type { Monster } from '$lib/api/types'
  import { getChallenge, getEntryName, getMonsterSystems } from '$lib/rules/monster'
  import type { MonsterSystem } from '$lib/rules/monster.types'
  import { currentCampaignId } from '$lib/stores/campaign.store'
  import { navigate } from 'sly-svelte-location-router'
  import Card from '$components/ui/Card.svelte'
  import Ornament from '$components/ui/Ornament.svelte'

  const SLOTS = ['skull', 'dragon', 'rune', 'tracery', 'quatrefoil', 'dragon', 'skull', 'quatrefoil', 'rune', 'tracery'] as const

  let monsters = $state<Monster[]>([])
  let systems = $state<MonsterSystem[]>([])
  let loading = $state(false)
  let error = $state<string | null>(null)

  $effect(() => {
    const campaignId = $currentCampaignId
    monsters = []
    error = null
    if (!campaignId) return
    let live = true
    loading = true
    Promise.all([getMonsters(campaignId), getMonsterSystems()])
      .then(([found, held]) => {
        if (!live) return
        systems = held
        monsters = found.sort((a, b) => a.name.localeCompare(b.name))
      })
      .catch((reason) => live && (error = reason instanceof Error ? reason.message : String(reason)))
      .finally(() => live && (loading = false))
    return () => {
      live = false
    }
  })

  function getSub(monster: Monster): string {
    const system = systems.find((one) => one.id === monster.system)
    if (!system) return ''
    return `${system.labels.challenge} ${getChallenge(system, monster.challenge)?.name ?? ''}, ${getEntryName(system.sizes, monster.size)} ${getEntryName(system.types, monster.type)}`
  }
</script>

<div class="root">
  <header class="head">
    <span class="crest dnd-arch"><Ornament name="dragon" size="md" tone="ember" /></span>
    <h4 class="dnd-heading title">Bestiary</h4>
    <p class="lede">Every creature this character faces is written here, page by page, as the campaign goes on.</p>
    <span class="rule"><Ornament name="divider" tone="metal" /></span>
  </header>

  {#if error}
    <p class="foot" role="alert">{error}</p>
  {:else if loading}
    <div class="dnd-loading" role="status" aria-label="Opening the bestiary"><span class="dnd-spinner"></span></div>
  {:else if monsters.length}
    <div class="pages">
      {#each monsters as monster (monster.id)}
        <Card layout="tile" title={monster.name} sub={getSub(monster)} image={monster.image || undefined} tone="verdigris" onclick={() => navigate(`/main/monsters/${monster.id}`)} />
      {/each}
    </div>
  {:else}
    <ul class="slots" aria-label="Unwritten pages">
      {#each SLOTS as mark, index (index)}
        <li class="slot">
          <span class="slot-face"><Ornament name={mark} size="sm" tone="metal" /></span>
          <span class="slot-word">Unwritten</span>
        </li>
      {/each}
    </ul>

    <p class="foot">No creature has crossed this character's path yet.</p>
  {/if}
</div>

<style>
  .root {
    display: flex;
    flex: 1;
    flex-direction: column;
    align-items: center;
    gap: var(--space-5);
    min-width: 0;
    padding: var(--space-4) var(--space-3) var(--space-5);
  }

  .head {
    display: grid;
    justify-items: center;
    gap: var(--space-2);
    max-width: 36rem;
    text-align: center;
  }

  .crest {
    display: flex;
    align-items: center;
    justify-content: center;
    width: calc(var(--space-8) + var(--space-2));
    aspect-ratio: 4 / 5;
    padding: var(--space-2);
    background:
      radial-gradient(ellipse 80% 70% at 50% 30%, color-mix(in srgb, var(--ember) 14%, transparent) 0%, transparent 70%),
      var(--texture-noise),
      linear-gradient(180deg, var(--ground-raised), var(--ground-deep));
    filter: drop-shadow(0 0.25rem 0.5rem var(--shade-hard));
  }

  .title {
    margin: 0;
    letter-spacing: var(--tracking-caps);
  }

  .lede {
    margin: 0;
    font-size: var(--text-sm);
    font-style: italic;
    color: var(--ink-dim);
    text-shadow: 0 1px 0 var(--shadow-ink);
  }

  .rule {
    display: block;
    width: min(16rem, 70%);
  }

  .slots {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(min(calc(var(--space-8) + var(--space-5)), 100%), 1fr));
    gap: var(--space-3);
    width: 100%;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .pages {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(min(calc(var(--space-8) * 2.5), 100%), 1fr));
    gap: var(--space-5);
    width: 100%;
    min-width: 0;
  }

  .pages :global(.dnd-card-tile) {
    width: 100%;
  }

  .slot {
    display: grid;
    justify-items: center;
    gap: var(--space-2);
    padding: var(--space-4) var(--space-2) var(--space-3);
    border-radius: 50% 50% var(--radius-md) var(--radius-md) / var(--radius-xl) var(--radius-xl) var(--radius-md) var(--radius-md);
    background: var(--texture-noise), linear-gradient(180deg, color-mix(in srgb, var(--ground-raised) 60%, transparent), var(--ground-deep));
    box-shadow: var(--rim-thin), inset 0 0 18px 2px var(--shade-hard);
  }

  .slot-face {
    display: flex;
    align-items: center;
    justify-content: center;
    width: var(--space-7);
    aspect-ratio: 1;
    opacity: 0.28;
    filter: grayscale(0.6);
  }

  .slot-word {
    font-family: var(--font-display);
    font-size: calc(var(--text-xs) * 0.85);
    font-weight: 700;
    letter-spacing: var(--tracking-caps);
    text-transform: uppercase;
    color: var(--metal-dim);
    text-shadow: 0 1px 0 var(--shadow-ink);
  }

  .foot {
    margin: 0;
    font-size: var(--text-xs);
    font-style: italic;
    color: var(--ink-faint);
  }
</style>
