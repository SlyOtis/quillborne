<script lang="ts">
  import { deleteMonster, getAssetTab, getMonster, getObjectTags, putMonster } from '$lib/api'
  import { OBJECT_TYPE_MONSTER, type Monster, type Tag } from '$lib/api/types'
  import { getTheme, setTheme } from '$lib/dialogs/theme'
  import { getMonsterBlock, getMonsterSystem } from '$lib/rules/monster'
  import type { MonsterSystem } from '$lib/rules/monster.types'
  import { user } from '$lib/stores/auth.store'
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
  let system = $state<MonsterSystem | null>(null)
  let tags = $state<Tag[]>([])
  let missing = $state('')
  let error = $state<string | null>(null)
  let busy = $state(false)
  let deleting = $state(false)

  onMount(() => setTheme(getTheme()))

  $effect(() => {
    const id = asked
    if (!id || !me) return
    let live = true
    error = null
    void (async () => {
      try {
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

  const owned = $derived(Boolean(monster && monster.owner_id === me))
  const held = $derived(monster ? tags.filter((tag) => tag.object_ids?.includes(monster?.id ?? '')) : [])
  const habitats = $derived(system && monster ? getMonsterBlock(system, monster).habitats : [])
  const lore = $derived(monster?.description.trim() ?? '')
  const beside = $derived(Boolean(monster?.image || held.length || habitats.length))

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

<Shell drawers title={monster?.name ?? 'Monster'} width="wide">
  {#if missing}
    <p class="beast-alarm" role="alert">{missing}</p>
  {:else if !monster || !system}
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
            {owned ? (monster.is_public ? 'Yours, shared with every player' : 'Homebrew, yours alone') : 'From the bestiary'}
          </p>
        </span>
        {#if owned}
          <span class="dnd-band-acts">
            <IconBtn
              title={monster.is_public ? 'Keep it to yourself' : 'Share it with every player'}
              active={monster.is_public}
              disabled={busy}
              onclick={share}
            >
              <Glyph name={monster.is_public ? 'reveal' : 'conceal'} size="md" />
            </IconBtn>
            <IconBtn title="Edit this monster" disabled={busy} onclick={() => navigate(`/main/monsters/${monster?.id}/build`)}>
              <Glyph name="edit" size="md" />
            </IconBtn>
            <IconBtn title="Delete this monster" disabled={busy} onclick={() => (deleting = true)}>
              <Glyph name="remove" size="md" />
            </IconBtn>
          </span>
        {/if}
      </div>
    </header>

    {#if error}
      <p class="beast-alarm" role="alert">{error}</p>
    {/if}

    <div class="beast-sheet" class:beast-sheet-beside={beside}>
      <MonsterBlock {system} {monster} />

      {#if beside}
        <aside class="beast-side" aria-label="Portrait, habitat and tags">
          {#if monster.image}
            <Portrait src={monster.image} alt={monster.name} size="lg" />
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

    {#if lore}
      <Section title="Lore">
        <BlockReader value={monster.description} openAsset={getAssetTab} />
      </Section>
    {:else if owned}
      <p class="beast-note">No lore is written for this monster yet. Edit it to tell the table where it lairs and what it wants.</p>
    {/if}
  {/if}
</Shell>

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
