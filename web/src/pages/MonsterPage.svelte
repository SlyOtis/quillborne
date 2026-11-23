<script lang="ts">
  import { deleteMonster, getAssetTab, getCampaignId, getCampaigns, getMonster, getMonsters, getObjectTags, postMonster, putMonster } from '$lib/api'
  import { OBJECT_TYPE_MONSTER, type Campaign, type Monster, type Tag } from '$lib/api/types'
  import { getTheme, setTheme } from '$lib/dialogs/theme'
  import { getBestiaryMissing, getMonsterBlock, getMonsterFields, getMonsterSources, getMonsterStats, getMonsterSystem } from '$lib/rules/monster'
  import type { MonsterSource, MonsterSourceEntry, MonsterSystem } from '$lib/rules/monster.types'
  import { user, userProfile } from '$lib/stores/auth.store'
  import { anyDialogOpen, uiStore } from '$lib/stores/ui.store'
  import { onMount, setContext } from 'svelte'
  import { navigate, resolvedRoute } from 'sly-svelte-location-router'
  import BaseDialog from '$components/BaseDialog.svelte'
  import MonsterBlock from '$components/monster/MonsterBlock.svelte'
  import BlockReader from '$components/ui/BlockReader.svelte'
  import Button from '$components/ui/Button.svelte'
  import Chip from '$components/ui/Chip.svelte'
  import Glyph from '$components/ui/Glyph.svelte'
  import IconBtn from '$components/ui/IconBtn.svelte'
  import Portrait from '$components/ui/Portrait.svelte'
  import Row from '$components/ui/Row.svelte'
  import Section from '$components/ui/Section.svelte'
  import Shell from '$components/ui/Shell.svelte'

  setContext('dialogState', {
    get isAnyDialogOpen() {
      return $anyDialogOpen
    },
    setDialogState: uiStore.setDialogState
  })

  const steps = $derived($resolvedRoute.path.split('/').filter(Boolean))
  const asked = $derived(steps[0] === 'main' && steps[1] === 'monsters' ? (steps[2] ?? '') : '')
  const me = $derived($user?.user_id ?? '')

  let monster = $state<Monster | null>(null)
  let source = $state<MonsterSource | null>(null)
  let entry = $state<MonsterSourceEntry | null>(null)
  let system = $state<MonsterSystem | null>(null)
  let tags = $state<Tag[]>([])
  let ruled = $state<Campaign[]>([])
  let holding = $state<Record<string, boolean>>({})
  let missing = $state('')
  let error = $state<string | null>(null)
  let added = $state('')
  let busy = $state(false)
  let deleting = $state(false)
  let choosing = $state(false)

  onMount(() => setTheme(getTheme()))

  $effect(() => {
    const id = asked
    if (!id || !me) return
    let live = true
    error = null
    added = ''
    void (async () => {
      try {
        const [shipped, campaigns] = await Promise.all([getMonsterSources(), getCampaigns()])
        if (!live) return
        ruled = campaigns.filter((one) => one.dm_id === me)
        const book = shipped.find((one) => one.monsters.some((held) => held.slug === id))
        if (book) {
          system = await getMonsterSystem(book.system)
          if (!live) return
          monster = null
          tags = []
          source = book
          entry = book.monsters.find((held) => held.slug === id) ?? null
          missing = ''
          return
        }
        const found = await getMonster(id)
        if (!live) return
        if (!found) {
          monster = null
          missing = 'That monster does not exist, or it is someone else\'s homebrew.'
          return
        }
        const [held, all] = await Promise.all([getMonsterSystem(found.system), getObjectTags(OBJECT_TYPE_MONSTER)])
        if (!live) return
        system = held
        tags = all
        source = null
        entry = null
        monster = found
        missing = ''
      } catch (reason) {
        if (live) error = reason instanceof Error ? reason.message : String(reason)
      }
    })()
    return () => {
      live = false
    }
  })

  const read = $derived(
    monster ?? (entry && source && system ? { ...entry, system: source.system, stats: getMonsterStats(system, entry.stats), image: '' } : null)
  )
  const owned = $derived(Boolean(monster && monster.user_id === me))
  const held = $derived(monster ? tags.filter((tag) => tag.object_ids?.includes(monster?.id ?? '')) : [])
  const habitats = $derived(system && read ? getMonsterBlock(system, read).habitats : [])
  const lore = $derived(read?.description.trim() ?? '')
  const beside = $derived(Boolean(read?.image || held.length || habitats.length))

  async function copy() {
    if (!read) return
    busy = true
    error = null
    try {
      const made = await postMonster({ ...getMonsterFields(read.system, read), is_public: false })
      navigate(`/main/monsters/${made.id}/build`)
    } catch (reason) {
      error = reason instanceof Error ? reason.message : String(reason)
      busy = false
    }
  }

  async function shelve() {
    if (!read) return
    busy = true
    error = null
    try {
      const kept = await Promise.all(ruled.map(async (one) => [one.id, getBestiaryMissing([read.name], await getMonsters(one.id)).length === 0] as const))
      holding = Object.fromEntries(kept)
      if (ruled.length === 1) await bind(ruled[0])
      else choosing = true
    } catch (reason) {
      error = reason instanceof Error ? reason.message : String(reason)
    } finally {
      busy = false
    }
  }

  async function bind(campaign: Campaign) {
    if (!read) return
    if (holding[campaign.id]) {
      added = `The bestiary of ${campaign.name} already holds ${read.name}.`
      return
    }
    busy = true
    error = null
    try {
      await postMonster({ ...getMonsterFields(read.system, read), owner_id: campaign.id })
      holding = { ...holding, [campaign.id]: true }
      added = `${read.name} is written into the bestiary of ${campaign.name}.`
    } catch (reason) {
      error = reason instanceof Error ? reason.message : String(reason)
    } finally {
      busy = false
    }
  }

  async function share() {
    if (!monster) return
    busy = true
    error = null
    try {
      monster = await putMonster(monster.id, { is_public: !monster.is_public })
    } catch (reason) {
      error = reason instanceof Error ? reason.message : String(reason)
    } finally {
      busy = false
    }
  }

  async function remove() {
    if (!monster) return
    busy = true
    try {
      await deleteMonster(monster.id)
      deleting = false
      navigate('/main/monsters')
    } catch (reason) {
      error = reason instanceof Error ? reason.message : String(reason)
      busy = false
    }
  }
</script>

<Shell drawers title={read?.name ?? 'Monster'} width="wide">
  {#if missing}
    <p class="beast-alarm" role="alert">{missing}</p>
  {:else if !read || !system}
    {#if error}
      <p class="beast-alarm" role="alert">{error}</p>
    {:else}
      <div class="dnd-loading" role="status" aria-label="Summoning the monster"><span class="dnd-spinner"></span></div>
    {/if}
  {:else}
    <header class="dnd-band beast-band">
      <div class="dnd-band-line">
        <span class="beast-lead">
          <IconBtn title="Back to the monsters" onclick={() => navigate('/main/monsters')}>
            <Glyph name="back" size="md" />
          </IconBtn>
          <p class="dnd-label beast-eyebrow">
            {owned && monster ? (monster.is_public ? 'Yours, shared with every player' : 'Homebrew, yours alone') : (source?.title ?? 'From the bestiary')}
          </p>
        </span>
        <span class="dnd-band-acts">
          {#if !owned}
            <IconBtn title="Copy {read.name} to your homebrew" disabled={busy} onclick={copy}>
              <Glyph name="copy" size="md" />
            </IconBtn>
          {/if}
          {#if ruled.length}
            <IconBtn title="Add {read.name} to the bestiary" disabled={busy} onclick={shelve}>
              <Glyph name="book" size="md" />
            </IconBtn>
          {/if}
          {#if owned && monster}
            {#if !getCampaignId(monster, $userProfile)}
              <IconBtn
                title={monster.is_public ? 'Keep it to yourself' : 'Share it with every player'}
                active={monster.is_public}
                disabled={busy}
                onclick={share}
              >
                <Glyph name={monster.is_public ? 'reveal' : 'conceal'} size="md" />
              </IconBtn>
            {/if}
            <IconBtn title="Edit this monster" disabled={busy} onclick={() => navigate(`/main/monsters/${monster?.id}/build`)}>
              <Glyph name="edit" size="md" />
            </IconBtn>
            <IconBtn title="Delete this monster" disabled={busy} onclick={() => (deleting = true)}>
              <Glyph name="remove" size="md" />
            </IconBtn>
          {/if}
        </span>
      </div>
    </header>

    {#if error}
      <p class="beast-alarm" role="alert">{error}</p>
    {/if}
    {#if added && !choosing}
      <p class="beast-note" role="status">{added}</p>
    {/if}

    <div class="beast-sheet" class:beast-sheet-beside={beside}>
      <MonsterBlock {system} monster={read} />

      {#if beside}
        <aside class="beast-side" aria-label="Portrait, habitat and tags">
          {#if read.image}
            <Portrait src={read.image} alt={read.name} size="lg" />
          {/if}
          {#if habitats.length || held.length}
            <div class="beast-marks">
              {#if habitats.length}
                <p class="beast-haunt"><b>{system.labels.habitats}</b> {habitats.join(', ')}</p>
              {/if}
              {#if held.length}
                <p class="beast-chips">
                  {#each held as tag (tag.id)}<Chip still>#{tag.name}</Chip>{/each}
                </p>
              {/if}
            </div>
          {/if}
        </aside>
      {/if}
    </div>

    {#if source}
      <p class="beast-note">{source.attribution} {source.license}</p>
    {/if}

    {#if lore}
      <Section title="Lore">
        <BlockReader value={read.description} openAsset={getAssetTab} />
      </Section>
    {:else if owned}
      <p class="beast-note">No lore is written for this monster yet. Edit it to tell the table where it lairs and what it wants.</p>
    {/if}
  {/if}
</Shell>

<BaseDialog isOpen={choosing} onClose={() => (choosing = false)} title="Add {read?.name ?? 'this monster'} to a bestiary" width="32rem">
  <div class="beast-doom">
    {#each ruled as campaign (campaign.id)}
      <Row title={campaign.name} mark={holding[campaign.id] ? 'In it' : 'Add'} on={holding[campaign.id]} onclick={() => bind(campaign)} />
    {/each}
    <p class="beast-note" role="status">{added}</p>
    <div class="beast-doom-acts">
      <Button variant="secondary" size="sm" onclick={() => (choosing = false)}>Done</Button>
    </div>
  </div>
</BaseDialog>

<BaseDialog isOpen={deleting} onClose={() => (deleting = false)} title="Delete {monster?.name ?? 'this monster'}?" width="32rem">
  <div class="beast-doom">
    <p class="beast-note">The monster leaves the bestiary for good, for everyone who could read it.</p>
    <div class="beast-doom-acts">
      <Button variant="ghost" onclick={() => (deleting = false)}>Keep</Button>
      <Button variant="danger" loading={busy} onclick={remove}>Delete</Button>
    </div>
  </div>
</BaseDialog>

<style>
  .beast-band {
    padding-block: var(--space-4);
  }

  .beast-lead {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    min-width: 0;
  }

  .beast-eyebrow {
    margin: 0;
    min-width: 0;
    color: var(--metal);
  }

  .beast-alarm {
    margin: 0;
    padding: var(--space-3) var(--space-4);
    border: var(--border-hair) solid color-mix(in srgb, var(--state-bad) 55%, transparent);
    border-radius: var(--radius-sm);
    background: linear-gradient(color-mix(in srgb, var(--state-bad) 18%, transparent), color-mix(in srgb, var(--state-bad) 18%, transparent)), var(--texture-noise), var(--ground-deep);
    box-shadow: var(--bevel-down);
    font-size: var(--text-sm);
    color: var(--ink);
  }

  .beast-sheet {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    align-items: start;
    gap: var(--space-5);
    min-width: 0;
  }

  .beast-sheet-beside {
    grid-template-columns: minmax(0, 1fr) minmax(0, calc(var(--space-8) * 3));
  }

  .beast-side {
    position: sticky;
    top: var(--space-4);
    display: grid;
    justify-items: center;
    gap: var(--space-4);
    min-width: 0;
  }

  .beast-marks {
    display: grid;
    gap: var(--space-3);
    justify-self: stretch;
    min-width: 0;
  }

  .beast-haunt {
    margin: 0;
    font-size: var(--text-sm);
    color: var(--ink);
  }

  .beast-haunt b {
    font-family: var(--font-display);
    font-weight: 700;
    letter-spacing: var(--tracking-wide);
    color: var(--metal);
    text-shadow: 0 1px 0 var(--shadow-ink);
  }

  .beast-chips {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-1);
    margin: 0;
  }

  .beast-note {
    margin: 0;
    font-size: var(--text-sm);
    font-style: italic;
    color: var(--ink-faint);
  }

  .beast-doom {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    padding: var(--space-5);
  }

  .beast-doom-acts {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-3);
  }

  @container page (max-width: 860px) {
    .beast-sheet-beside {
      grid-template-columns: minmax(0, 1fr);
    }

    .beast-side {
      position: static;
      grid-row: 1;
      grid-template-columns: auto minmax(0, 1fr);
      align-items: center;
      justify-items: start;
    }
  }
</style>
