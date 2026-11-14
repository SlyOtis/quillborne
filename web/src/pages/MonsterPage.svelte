<script lang="ts">
  import {
    deleteMonster,
    deleteTagObject,
    getAssets,
    getAssetTab,
    getMonster,
    getObjectTags,
    postFile,
    postTag,
    postTagObject,
    putMonster
  } from '$lib/api'
  import { OBJECT_TYPE_MONSTER, type Monster, type MonsterFields, type Tag } from '$lib/api/types'
  import type { MediaAsset, MediaKind } from '$lib/blocks'
  import { getTheme, setTheme } from '$lib/dialogs/theme'
  import { getEntryName, getMonsterBlock, getMonsterStats, getMonsterSystem, getSigned } from '$lib/rules/monster'
  import type { MonsterEntry, MonsterStats, MonsterSystem } from '$lib/rules/monster.types'
  import { user } from '$lib/stores/auth.store'
  import { anyDialogOpen, uiStore } from '$lib/stores/ui.store'
  import { onMount, setContext } from 'svelte'
  import { navigate, resolvedRoute } from 'sly-svelte-location-router'
  import BaseDialog from '$components/BaseDialog.svelte'
  import MediaDialog from '$components/MediaDialog.svelte'
  import BlockEditor from '$components/ui/BlockEditor.svelte'
  import BlockReader from '$components/ui/BlockReader.svelte'
  import Button from '$components/ui/Button.svelte'
  import Field from '$components/ui/Field.svelte'
  import Glyph from '$components/ui/Glyph.svelte'
  import IconBtn from '$components/ui/IconBtn.svelte'
  import Ornament from '$components/ui/Ornament.svelte'
  import Picker, { type Pick as Chip } from '$components/ui/Picker.svelte'
  import Shell from '$components/ui/Shell.svelte'
  import Stat from '$components/ui/Stat.svelte'
  import StoredImage from '$components/ui/StoredImage.svelte'

  setContext('dialogState', {
    get isAnyDialogOpen() {
      return $anyDialogOpen
    },
    setDialogState: uiStore.setDialogState
  })

  type ListKey = 'languages' | 'resistances' | 'immunities' | 'vulnerabilities' | 'condition_immunities' | 'habitats'

  type Draft = Pick<Monster, 'name' | 'size' | 'type' | 'alignment' | 'challenge' | 'description'> & {
    stats: MonsterStats
    tags: Chip[]
  }

  const steps = $derived($resolvedRoute.path.split('/').filter(Boolean))
  const asked = $derived(steps[0] === 'main' && steps[1] === 'monsters' ? (steps[2] ?? '') : '')

  let monster = $state<Monster | null>(null)
  let system = $state<MonsterSystem | null>(null)
  let tags = $state<Tag[]>([])
  let missing = $state('')
  let error = $state<string | null>(null)
  let busy = $state(false)
  let draft = $state<Draft | null>(null)
  let picking = $state(false)
  let deleting = $state(false)
  let media = $state<{ kind: MediaKind; current?: string; resolve: (asset: MediaAsset | null) => void } | null>(null)

  onMount(() => setTheme(getTheme()))

  $effect(() => {
    const id = asked
    if (!id || !$user) return
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
        draft = null
      } catch (reason) {
        if (live) error = reason instanceof Error ? reason.message : String(reason)
      }
    })()
    return () => {
      live = false
    }
  })

  const owned = $derived(Boolean(monster && monster.owner_id === $user?.user_id))
  const writing = $derived(draft !== null)
  const shown = $derived(draft ?? monster)
  const stats = $derived(system && shown ? getMonsterStats(system, shown.stats) : null)
  const block = $derived(system && shown ? getMonsterBlock(system, shown) : null)
  const held = $derived(monster ? tags.filter((tag) => tag.object_ids?.includes(monster?.id ?? '')) : [])
  const tagOptions = $derived(tags.map((tag) => ({ id: tag.id, mark: '#', name: tag.name })))
  const features = $derived(system && stats ? system.features.filter((kind) => (stats.features[kind.id] ?? []).length > 0) : [])
  const lists = $derived<{ key: ListKey; label: string; entries: MonsterEntry[]; free?: boolean }[]>(
    system
      ? [
          { key: 'languages', label: 'Languages', entries: system.languages, free: true },
          { key: 'resistances', label: 'Resistances', entries: system.damageTypes },
          { key: 'immunities', label: 'Damage immunities', entries: system.damageTypes },
          { key: 'vulnerabilities', label: 'Vulnerabilities', entries: system.damageTypes },
          { key: 'condition_immunities', label: 'Condition immunities', entries: system.conditions },
          { key: 'habitats', label: 'Habitats', entries: system.habitats }
        ]
      : []
  )

  const hitDice = $derived(
    block && stats ? `${stats.hit_dice}d${block.hitDie} ${block.hitBonus < 0 ? '-' : '+'} ${Math.abs(block.hitBonus)}` : ''
  )

  const facts = $derived.by(() => {
    if (!system || !block || !stats) return []
    const distance = system.distance
    const joined = (names: string[]) => names.join(', ')
    return [
      { label: 'Armor', text: stats.ac_note },
      { label: 'Hit dice', text: hitDice },
      { label: 'Speed', text: joined(block.speeds.map((one) => `${one.name} ${one.value} ${distance}`)) },
      { label: 'Skills', text: joined(block.skills.map((one) => `${one.name} ${getSigned(one.value)}`)) },
      {
        label: 'Senses',
        text: joined([...block.senses.map((one) => `${one.name} ${one.value} ${distance}`), `Passive Perception ${block.passivePerception}`])
      },
      { label: 'Languages', text: joined(block.languages) || 'None' },
      { label: 'Resistances', text: joined(block.resistances) },
      { label: 'Damage immunities', text: joined(block.immunities) },
      { label: 'Vulnerabilities', text: joined(block.vulnerabilities) },
      { label: 'Condition immunities', text: joined(block.conditionImmunities) },
      { label: 'Habitat', text: joined(block.habitats) }
    ].filter((one) => one.text)
  })

  function getPicks(entries: MonsterEntry[], ids: string[], mark: string): Chip[] {
    return ids.map((id) => ({ id, mark, word: '', name: getEntryName(entries, id) }))
  }

  function startWriting() {
    if (!monster || !system) return
    draft = {
      name: monster.name,
      size: monster.size,
      type: monster.type,
      alignment: monster.alignment,
      challenge: monster.challenge,
      description: monster.description,
      stats: getMonsterStats(system, $state.snapshot(monster.stats)),
      tags: held.map((tag) => ({ id: tag.id, mark: '#', name: tag.name }))
    }
  }

  async function putTags(id: string, wanted: Chip[]) {
    const ids = await Promise.all(
      wanted.map(async (pick) => tags.find((tag) => tag.id === pick.id)?.id ?? (await postTag(pick.name)).id)
    )
    const had = held.map((tag) => tag.id)
    await Promise.all([
      ...ids.filter((tagId) => !had.includes(tagId)).map((tagId) => postTagObject(tagId, OBJECT_TYPE_MONSTER, id)),
      ...had.filter((tagId) => !ids.includes(tagId)).map((tagId) => deleteTagObject(tagId, OBJECT_TYPE_MONSTER, id))
    ])
    tags = await getObjectTags(OBJECT_TYPE_MONSTER)
  }

  async function write(fields: MonsterFields) {
    if (!monster) return
    busy = true
    error = null
    try {
      monster = await putMonster(monster.id, fields)
    } catch (reason) {
      error = reason instanceof Error ? reason.message : String(reason)
    } finally {
      busy = false
    }
  }

  async function save() {
    if (!monster || !draft) return
    const { tags: wanted, ...fields } = $state.snapshot(draft)
    busy = true
    error = null
    try {
      monster = await putMonster(monster.id, fields)
      await putTags(monster.id, wanted)
      draft = null
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

  function putPortrait(asset: MediaAsset | null) {
    picking = false
    if (asset) void write({ image: asset.url })
  }

  function toggle(list: string[], id: string): string[] {
    return list.includes(id) ? list.filter((one) => one !== id) : [...list, id]
  }

  function getMedia(kind: MediaKind, current?: string): Promise<MediaAsset | null> {
    return new Promise((resolve) => (media = { kind, current, resolve }))
  }

  function postMedia(file: File): Promise<MediaAsset> {
    return postFile(file, { kind: 'user' })
  }
</script>

<Shell drawers title={monster?.name ?? 'Monster'} width="wide">
  {#if missing}
    <p class="beast-alarm" role="alert">{missing}</p>
  {:else if !monster || !system || !block || !stats || !shown}
    {#if error}
      <p class="beast-alarm" role="alert">{error}</p>
    {:else}
      <div class="dnd-loading" role="status" aria-label="Summoning the monster"><span class="dnd-spinner"></span></div>
    {/if}
  {:else}
    <header class="dnd-band">
      <div class="dnd-band-line">
        <p class="dnd-label beast-eyebrow">
          {owned ? (monster.is_public ? 'Yours, shared with every player' : 'Homebrew, yours alone') : 'From the bestiary'}
        </p>
        <span class="dnd-band-acts">
          {#if writing}
            <Button variant="ghost" size="sm" disabled={busy} onclick={() => (draft = null)}>Cancel</Button>
            <Button variant="primary" size="sm" loading={busy} onclick={save}>Save</Button>
          {:else if owned}
            <IconBtn
              title={monster.is_public ? 'Keep it to yourself' : 'Share it with every player'}
              active={monster.is_public}
              disabled={busy}
              onclick={() => write({ is_public: !monster?.is_public })}
            >
              <Glyph name={monster.is_public ? 'reveal' : 'conceal'} size="md" />
            </IconBtn>
            <IconBtn title="Edit this monster" disabled={busy} onclick={startWriting}>
              <Glyph name="edit" size="md" />
            </IconBtn>
            <IconBtn title="Delete this monster" disabled={busy} onclick={() => (deleting = true)}>
              <Glyph name="remove" size="md" />
            </IconBtn>
          {/if}
        </span>
      </div>

      <div class="beast-crown">
        {#if draft}
          <Field id="beast-name" label="Name" required>
            <input id="beast-name" type="text" maxlength="120" bind:value={draft.name} />
          </Field>
        {:else}
          <h1 class="dnd-heading dnd-heading-hero beast-name">{monster.name}</h1>
        {/if}
        <p class="beast-kin">
          {block.size} {block.type}{stats.subtypes.length ? ` (${stats.subtypes.join(', ')})` : ''}, {block.alignment}
        </p>
        <span class="beast-rule"><Ornament name="divider" tone="metal" /></span>
      </div>
    </header>

    {#if error}
      <p class="beast-alarm" role="alert">{error}</p>
    {/if}

    {#if !owned}
      <p class="beast-reading" role="status">A monster from the bestiary. You can read it, but only its maker can change it.</p>
    {/if}

    <div class="beast-sheet">
      <div class="beast-block">
        <div class="beast-plates">
          <Stat label="Armor class" value={stats.ac} />
          <Stat label="Hit points" value={block.hitPoints} sub="average" />
          <Stat label="Initiative" value={getSigned(block.initiative)} score={block.initiativeScore} />
          <Stat label="Challenge" value={block.challenge?.name ?? ''} sub="XP {(block.challenge?.xp ?? 0).toLocaleString('en-US')}" />
          <Stat label="Proficiency" value={getSigned(block.prof)} sub="bonus" />
        </div>

        <div class="beast-plates beast-abilities">
          {#each block.abilities as ability (ability.id)}
            <Stat
              label={ability.name}
              value={getSigned(ability.mod)}
              score={ability.score}
              sub="Save {getSigned(ability.save)}"
              tone="ember"
              lit={ability.proficient}
            />
          {/each}
        </div>

        {#if draft}
          <section class="beast-write" aria-label="Identity">
            <h2 class="dnd-label beast-divide-name">Who it is</h2>
            <div class="beast-fields">
              <Field id="beast-size" label="Size">
                <select id="beast-size" bind:value={draft.size}>
                  {#each system.sizes as one (one.id)}<option value={one.id}>{one.name}</option>{/each}
                </select>
              </Field>
              <Field id="beast-type" label="Type">
                <select id="beast-type" bind:value={draft.type}>
                  {#each system.types as one (one.id)}<option value={one.id}>{one.name}</option>{/each}
                </select>
              </Field>
              <Field id="beast-alignment" label="Alignment">
                <select id="beast-alignment" bind:value={draft.alignment}>
                  {#each system.alignments as one (one.id)}<option value={one.id}>{one.name}</option>{/each}
                </select>
              </Field>
              <Field id="beast-challenge" label="Challenge">
                <select id="beast-challenge" bind:value={draft.challenge}>
                  {#each system.challenges as one (one.value)}<option value={one.value}>{one.name} (XP {one.xp.toLocaleString('en-US')})</option>{/each}
                </select>
              </Field>
              <Field id="beast-ac" label="Armor class">
                <input id="beast-ac" type="number" min="0" bind:value={draft.stats.ac} />
              </Field>
              <Field id="beast-ac-note" label="Armor">
                <input id="beast-ac-note" type="text" placeholder="Natural armor" bind:value={draft.stats.ac_note} />
              </Field>
              <Field id="beast-dice" label="Hit dice" help="{stats.hit_dice}d{block.hitDie}, {block.hitPoints} hit points on average">
                <input id="beast-dice" type="number" min="1" bind:value={draft.stats.hit_dice} />
              </Field>
              <Field id="beast-initiative" label="Initiative">
                <select id="beast-initiative" bind:value={draft.stats.initiative}>
                  {#each system.tiers as one (one.value)}<option value={one.value}>{one.name}</option>{/each}
                </select>
              </Field>
            </div>
            <Picker
              id="beast-subtypes"
              label="Sub-types"
              picked={getPicks([], draft.stats.subtypes, 'kind')}
              options={[]}
              free="kind"
              placeholder="Type a sub-type and press Enter"
              onchange={(picked) => draft && (draft.stats.subtypes = picked.map((one) => one.name))}
            />
          </section>

          <section class="beast-write" aria-label="Abilities">
            <h2 class="dnd-label beast-divide-name">Abilities and saves</h2>
            <div class="beast-fields">
              {#each system.abilities as ability (ability.id)}
                <div class="beast-score">
                  <Field id="beast-score-{ability.id}" label={ability.name}>
                    <input id="beast-score-{ability.id}" type="number" min="1" max="30" bind:value={draft.stats.abilities[ability.id]} />
                  </Field>
                  <label class="beast-check">
                    <input
                      type="checkbox"
                      checked={draft.stats.saves.includes(ability.id)}
                      onchange={() => draft && (draft.stats.saves = toggle(draft.stats.saves, ability.id))}
                    />
                    <span>Save proficiency</span>
                  </label>
                </div>
              {/each}
            </div>
          </section>

          <section class="beast-write" aria-label="Movement and senses">
            <h2 class="dnd-label beast-divide-name">Movement and senses</h2>
            <div class="beast-fields">
              {#each system.movements as one (one.id)}
                <Field id="beast-speed-{one.id}" label="{one.name} ({system.distance})">
                  <input id="beast-speed-{one.id}" type="number" min="0" step="5" bind:value={draft.stats.speeds[one.id]} />
                </Field>
              {/each}
              {#each system.senses as one (one.id)}
                <Field id="beast-sense-{one.id}" label="{one.name} ({system.distance})">
                  <input id="beast-sense-{one.id}" type="number" min="0" step="5" bind:value={draft.stats.senses[one.id]} />
                </Field>
              {/each}
            </div>
          </section>

          <section class="beast-write" aria-label="Skills">
            <h2 class="dnd-label beast-divide-name">Skills</h2>
            <div class="beast-fields">
              {#each system.skills as skill (skill.id)}
                <Field id="beast-skill-{skill.id}" label={skill.name}>
                  <select
                    id="beast-skill-{skill.id}"
                    value={draft.stats.skills[skill.id] ?? 0}
                    onchange={(event) => draft && (draft.stats.skills[skill.id] = Number(event.currentTarget.value))}
                  >
                    {#each system.tiers as one (one.value)}<option value={one.value}>{one.name}</option>{/each}
                  </select>
                </Field>
              {/each}
            </div>
          </section>

          <section class="beast-write" aria-label="Defences, languages and habitats">
            <h2 class="dnd-label beast-divide-name">Defences, tongues and haunts</h2>
            <div class="beast-pickers">
              {#each lists as list (list.key)}
                <Picker
                  id="beast-{list.key}"
                  label={list.label}
                  picked={getPicks(list.entries, draft.stats[list.key], list.key)}
                  options={getPicks(list.entries, list.entries.map((one) => one.id), list.key)}
                  free={list.free ? list.key : undefined}
                  onchange={(picked) => draft && (draft.stats[list.key] = picked.map((one) => one.id))}
                />
              {/each}
              <Picker
                id="beast-tags"
                label="Monster tags"
                note="Shared tags, like NPC or Angel, that the bestiary filters by."
                picked={draft.tags}
                options={tagOptions}
                free="#"
                onchange={(picked) => draft && (draft.tags = picked)}
              />
            </div>
            <div class="beast-checks">
              {#each system.flags as flag (flag.id)}
                <label class="beast-check">
                  <input
                    type="checkbox"
                    checked={draft.stats.flags.includes(flag.id)}
                    onchange={() => draft && (draft.stats.flags = toggle(draft.stats.flags, flag.id))}
                  />
                  <span>{flag.name}</span>
                </label>
              {/each}
            </div>
          </section>

          {#each system.features as kind (kind.id)}
            <section class="beast-write" aria-label={kind.name}>
              <header class="beast-divide">
                <h2 class="dnd-label beast-divide-name">{kind.name}</h2>
                <span class="beast-divide-run"></span>
                <Button
                  variant="ghost"
                  size="sm"
                  onclick={() => draft && (draft.stats.features[kind.id] = [...(draft.stats.features[kind.id] ?? []), { name: '', text: '' }])}
                >
                  Add {kind.one.toLowerCase()}
                </Button>
              </header>
              {#each draft.stats.features[kind.id] as feature, index}
                <div class="beast-feat-write">
                  <Field id="beast-{kind.id}-{index}-name" label="{kind.one} name">
                    <input id="beast-{kind.id}-{index}-name" type="text" bind:value={feature.name} />
                  </Field>
                  <Field id="beast-{kind.id}-{index}-text" label="What it does">
                    <textarea id="beast-{kind.id}-{index}-text" rows="3" bind:value={feature.text}></textarea>
                  </Field>
                  <IconBtn
                    title="Remove this {kind.one.toLowerCase()}"
                    onclick={() => draft && (draft.stats.features[kind.id] = draft.stats.features[kind.id].filter((_, at) => at !== index))}
                  >
                    <Glyph name="remove" size="sm" />
                  </IconBtn>
                </div>
              {/each}
            </section>
          {/each}
        {:else}
          {#if facts.length}
            <dl class="dnd-facts beast-facts">
              {#each facts as fact (fact.label)}
                <dt>{fact.label}</dt>
                <dd>{fact.text}</dd>
              {/each}
            </dl>
          {/if}

          {#each features as kind (kind.id)}
            <section class="beast-part" aria-label={kind.name}>
              <header class="beast-divide">
                <h2 class="dnd-label beast-divide-name">{kind.name}</h2>
                <span class="beast-divide-run"></span>
              </header>
              {#each stats.features[kind.id] as feature}
                <p class="beast-feat"><span class="beast-feat-name">{feature.name}.</span> {feature.text}</p>
              {/each}
            </section>
          {/each}
        {/if}
      </div>

      <aside class="beast-side" aria-label="Portrait">
        {#if owned || monster.image}
        <button
          type="button"
          class="beast-face"
          disabled={!owned || busy}
          title={owned ? 'Choose the portrait' : monster.name}
          onclick={() => (picking = true)}
        >
          {#if monster.image}
            <StoredImage src={monster.image} alt={monster.name} />
          {:else}
            <span class="beast-face-empty">
              <span class="dnd-empty-mark"><Ornament name="portrait" size="sm" tone="metal" /></span>
              {#if owned}<span class="dnd-label">Choose a portrait</span>{/if}
            </span>
          {/if}
        </button>
        {/if}

        {#if !writing && (held.length || block.flags.length)}
          <div class="beast-chips">
            {#each block.flags as flag (flag)}<span class="beast-chip beast-chip-lit">{flag}</span>{/each}
            {#each held as tag (tag.id)}<span class="beast-chip">#{tag.name}</span>{/each}
          </div>
        {/if}
      </aside>
    </div>

    <section class="beast-lore" aria-label="Lore">
      <header class="beast-divide">
        <h2 class="dnd-label beast-divide-name">Lore</h2>
        <span class="beast-divide-run"></span>
      </header>
      {#if draft}
        <BlockEditor
          bind:value={draft.description}
          placeholder="Write what the table knows of it, or press slash for a block"
          requestMedia={getMedia}
          uploadFile={postMedia}
          openAsset={getAssetTab}
        />
      {:else if monster.description.trim()}
        <BlockReader value={monster.description} openAsset={getAssetTab} />
      {:else}
        <p class="beast-note">No lore is written for this monster yet.</p>
      {/if}
    </section>
  {/if}
</Shell>

{#if picking}
  <MediaDialog
    kind="image"
    current={monster?.image}
    getAssets={(query, wanted) => getAssets(query, wanted, { kind: 'user' })}
    uploadFile={postMedia}
    onclose={putPortrait}
  />
{/if}

{#if media}
  <MediaDialog
    kind={media.kind}
    current={media.current}
    getAssets={(query, wanted) => getAssets(query, wanted, { kind: 'user' })}
    uploadFile={postMedia}
    onclose={(asset) => {
      media?.resolve(asset)
      media = null
    }}
  />
{/if}

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
  .beast-eyebrow {
    margin: 0;
    color: var(--metal);
  }

  .beast-crown {
    display: grid;
    gap: var(--space-2);
    margin-top: var(--space-4);
    min-width: 0;
  }

  .beast-name {
    margin: 0;
    min-width: 0;
    overflow-wrap: break-word;
  }

  .beast-kin {
    margin: 0;
    font-family: var(--font-display);
    font-size: var(--text-md);
    font-style: italic;
    letter-spacing: var(--tracking-wide);
    color: var(--ink-dim);
    text-shadow: 0 1px 0 var(--shadow-ink);
  }

  .beast-rule {
    display: block;
    width: min(21.25rem, 70%);
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

  .beast-reading {
    margin: 0;
    padding: var(--space-3) var(--space-4);
    border-radius: var(--radius-sm);
    background: var(--texture-noise), var(--ground-deep);
    box-shadow: var(--bevel-down);
    font-size: var(--text-sm);
    color: var(--ink-dim);
  }

  .beast-sheet {
    --beast-side: calc(var(--space-8) * 4);
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, var(--beast-side));
    align-items: start;
    gap: var(--space-6);
    margin-top: var(--space-5);
    min-width: 0;
  }

  .beast-block {
    display: grid;
    gap: var(--space-5);
    min-width: 0;
  }

  .beast-plates {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(6.5rem, 100%), 1fr));
    align-items: stretch;
    gap: var(--space-2);
    min-width: 0;
  }

  .beast-abilities {
    grid-template-columns: repeat(auto-fit, minmax(min(5.5rem, 100%), 1fr));
  }

  .beast-facts {
    padding: var(--space-4) var(--space-5);
    border-radius: var(--radius-lg);
    background: var(--texture-noise), linear-gradient(180deg, var(--ground-raised), var(--ground-deep));
    box-shadow: var(--rim-thin), inset 0 0 16px 2px var(--shade-hard);
  }

  .beast-part,
  .beast-write,
  .beast-lore {
    display: grid;
    gap: var(--space-3);
    min-width: 0;
  }

  .beast-lore {
    margin-top: var(--space-6);
  }

  .beast-divide {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-3);
    min-width: 0;
  }

  .beast-divide-name {
    margin: 0;
    color: var(--metal-bright);
    text-shadow: 0 1px 0 var(--shadow-ink), 0 0 10px var(--ember-glow);
  }

  .beast-divide-run {
    flex: 1;
    min-width: 0;
    height: var(--border-hair);
    background: linear-gradient(90deg, var(--metal), var(--metal-dim) 40%, transparent);
    box-shadow: 0 1px 0 var(--shadow-ink);
  }

  .beast-feat {
    margin: 0;
    font-size: var(--text-md);
    line-height: 1.55;
    color: var(--ink);
    white-space: pre-line;
  }

  .beast-feat-name {
    font-family: var(--font-display);
    font-weight: 700;
    font-style: italic;
    letter-spacing: var(--tracking-wide);
    color: var(--metal-bright);
    text-shadow: 0 1px 0 var(--shadow-ink);
  }

  .beast-fields {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(min(calc(var(--space-8) * 2.5), 100%), 1fr));
    gap: var(--space-3) var(--space-4);
    min-width: 0;
  }

  .beast-pickers {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(min(calc(var(--space-8) * 4), 100%), 1fr));
    gap: var(--space-4);
    min-width: 0;
  }

  .beast-score {
    display: grid;
    gap: var(--space-2);
    min-width: 0;
  }

  .beast-checks {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-4);
  }

  .beast-check {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    font-size: var(--text-sm);
    color: var(--ink-dim);
    cursor: pointer;
  }

  .beast-check input {
    accent-color: var(--metal);
  }

  .beast-feat-write {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 2fr) auto;
    align-items: start;
    gap: var(--space-3);
    min-width: 0;
  }

  .beast-side {
    position: sticky;
    top: var(--space-4);
    display: grid;
    gap: var(--space-4);
    min-width: 0;
  }

  .beast-face {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    aspect-ratio: 3 / 4;
    width: 100%;
    padding: 0;
    overflow: hidden;
    border: none;
    border-radius: 50% 50% var(--radius-lg) var(--radius-lg) / var(--radius-xl) var(--radius-xl) var(--radius-lg) var(--radius-lg);
    background:
      radial-gradient(ellipse 80% 60% at 50% 0%, color-mix(in srgb, var(--ember) 10%, transparent) 0%, transparent 70%),
      var(--texture-noise),
      linear-gradient(180deg, var(--ground-raised) 0%, var(--ground-deep) 100%);
    box-shadow: var(--rim), inset 0 0 26px -6px var(--shade-hard), var(--shadow-md);
    cursor: pointer;
    transition: filter 0.18s ease;
  }

  .beast-face:disabled {
    cursor: default;
  }

  .beast-face:not(:disabled):hover {
    filter: drop-shadow(0 0 0.6rem var(--ember-glow)) brightness(1.06);
  }

  .beast-face:not(:disabled):active {
    filter: brightness(0.85);
  }

  .beast-face:focus-visible {
    outline: none;
    box-shadow: var(--rim), var(--focus-ring);
  }

  .beast-face :global(img) {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .beast-face-empty {
    display: grid;
    justify-items: center;
    gap: var(--space-3);
  }

  .beast-chips {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
  }

  .beast-chip {
    padding: var(--space-0) var(--space-3);
    border-radius: var(--radius-sm);
    background: var(--texture-noise), linear-gradient(180deg, var(--ground-lift) 0%, var(--ground-deep) 100%);
    box-shadow: var(--rim-thin);
    font-family: var(--font-display);
    font-size: var(--text-xs);
    letter-spacing: var(--tracking-wide);
    color: var(--metal);
    text-shadow: 0 1px 0 var(--shadow-ink);
  }

  .beast-chip-lit {
    color: var(--metal-bright);
    box-shadow: var(--rim-thin), inset 0 0 8px var(--ember-glow), 0 0 12px var(--ember-glow);
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
    .beast-sheet {
      grid-template-columns: minmax(0, 1fr);
    }

    .beast-side {
      position: static;
      justify-self: center;
      width: min(100%, var(--beast-side));
    }

    .beast-feat-write {
      grid-template-columns: minmax(0, 1fr) auto;
    }

    .beast-feat-write > :global(.dnd-field:nth-child(2)) {
      grid-column: 1 / -1;
      grid-row: 2;
    }
  }
</style>
