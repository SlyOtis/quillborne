<script lang="ts">
  import { deleteTagObject, getAssets, getAssetTab, getMonster, getObjectTags, postFile, postMonster, postTag, postTagObject, putMonster } from '$lib/api'
  import { OBJECT_TYPE_MONSTER, type Monster, type Tag } from '$lib/api/types'
  import type { MediaAsset, MediaKind } from '$lib/blocks'
  import { getTheme, setTheme } from '$lib/dialogs/theme'
  import { getEntryName, getHitDice, getMonsterBlock, getMonsterStats, getMonsterSystem, getMonsterSystems, getNewMonster } from '$lib/rules/monster'
  import type { MonsterEntry, MonsterStats, MonsterSystem } from '$lib/rules/monster.types'
  import { user } from '$lib/stores/auth.store'
  import { anyDialogOpen, uiStore } from '$lib/stores/ui.store'
  import { onMount, setContext } from 'svelte'
  import { navigate, resolvedRoute } from 'sly-svelte-location-router'
  import MediaDialog from '$components/MediaDialog.svelte'
  import MonsterBlock from '$components/monster/MonsterBlock.svelte'
  import BlockEditor from '$components/ui/BlockEditor.svelte'
  import Button from '$components/ui/Button.svelte'
  import Field from '$components/ui/Field.svelte'
  import Glyph from '$components/ui/Glyph.svelte'
  import IconBtn from '$components/ui/IconBtn.svelte'
  import Picker, { type Pick as Chip } from '$components/ui/Picker.svelte'
  import Portrait from '$components/ui/Portrait.svelte'
  import Section from '$components/ui/Section.svelte'
  import Shell from '$components/ui/Shell.svelte'

  setContext('dialogState', {
    get isAnyDialogOpen() {
      return $anyDialogOpen
    },
    setDialogState: uiStore.setDialogState
  })

  type ListKey = 'languages' | 'resistances' | 'immunities' | 'vulnerabilities' | 'condition_immunities' | 'habitats'

  type Draft = Pick<Monster, 'name' | 'system' | 'size' | 'type' | 'alignment' | 'challenge' | 'description' | 'image' | 'is_public'> & {
    stats: MonsterStats
    tags: Chip[]
  }

  const steps = $derived($resolvedRoute.path.split('/').filter(Boolean))
  const asked = $derived(steps[0] === 'main' && steps[1] === 'monsters' ? (steps[2] ?? '') : '')
  const me = $derived($user?.user_id ?? '')

  let monster = $state<Monster | null>(null)
  let system = $state<MonsterSystem | null>(null)
  let tags = $state<Tag[]>([])
  let draft = $state<Draft | null>(null)
  let missing = $state('')
  let error = $state<string | null>(null)
  let busy = $state(false)
  let tried = $state(false)
  let picking = $state(false)
  let media = $state<{ kind: MediaKind; current?: string; resolve: (asset: MediaAsset | null) => void } | null>(null)

  onMount(() => setTheme(getTheme()))

  $effect(() => {
    const id = asked
    const reader = me
    if (!id || !reader) return
    let live = true
    error = null
    missing = ''
    tried = false
    busy = false
    void (async () => {
      try {
        if (id === 'new') {
          const [[held], all] = await Promise.all([getMonsterSystems(), getObjectTags(OBJECT_TYPE_MONSTER)])
          if (!live) return
          monster = null
          system = held
          tags = all
          draft = { ...getNewMonster(held), description: '', image: '', is_public: false, tags: [] }
          return
        }
        const found = await getMonster(id)
        if (!live) return
        if (!found) {
          missing = 'That monster does not exist, or it is someone else\'s homebrew.'
          return
        }
        if (found.owner_id !== reader) {
          navigate(`/main/monsters/${found.id}`)
          return
        }
        const [held, all] = await Promise.all([getMonsterSystem(found.system), getObjectTags(OBJECT_TYPE_MONSTER)])
        if (!live) return
        monster = found
        system = held
        tags = all
        draft = {
          name: found.name,
          system: found.system,
          size: found.size,
          type: found.type,
          alignment: found.alignment,
          challenge: found.challenge,
          description: found.description,
          image: found.image,
          is_public: found.is_public,
          stats: getMonsterStats(held, found.stats),
          tags: all.filter((tag) => tag.object_ids?.includes(found.id)).map((tag) => ({ id: tag.id, mark: '#', name: tag.name }))
        }
      } catch (reason) {
        if (live) error = reason instanceof Error ? reason.message : String(reason)
      }
    })()
    return () => {
      live = false
    }
  })

  const block = $derived(system && draft ? getMonsterBlock(system, draft) : null)
  const unnamed = $derived(tried && !draft?.name.trim())
  const tagOptions = $derived(tags.map((tag) => ({ id: tag.id, mark: '#', name: tag.name })))
  const defences = $derived<{ key: ListKey; label: string; entries: MonsterEntry[]; free?: boolean }[]>(
    system
      ? [
          { key: 'resistances', label: system.labels.resistances, entries: system.damageTypes },
          { key: 'immunities', label: system.labels.immunities, entries: system.damageTypes },
          { key: 'vulnerabilities', label: system.labels.vulnerabilities, entries: system.damageTypes },
          { key: 'condition_immunities', label: system.labels.conditionImmunities, entries: system.conditions },
          { key: 'languages', label: system.labels.languages, entries: system.languages, free: true }
        ]
      : []
  )

  function getPicks(entries: MonsterEntry[], ids: string[], mark: string): Chip[] {
    return ids.map((id) => ({ id, mark, word: '', name: getEntryName(entries, id) }))
  }

  function toggle(list: string[], id: string): string[] {
    return list.includes(id) ? list.filter((one) => one !== id) : [...list, id]
  }

  async function putTags(id: string, wanted: Chip[]) {
    const ids = await Promise.all(wanted.map(async (pick) => tags.find((tag) => tag.id === pick.id)?.id ?? (await postTag(pick.name)).id))
    const had = tags.filter((tag) => tag.object_ids?.includes(id)).map((tag) => tag.id)
    await Promise.all([
      ...ids.filter((tagId) => !had.includes(tagId)).map((tagId) => postTagObject(tagId, OBJECT_TYPE_MONSTER, id)),
      ...had.filter((tagId) => !ids.includes(tagId)).map((tagId) => deleteTagObject(tagId, OBJECT_TYPE_MONSTER, id))
    ])
  }

  async function save() {
    if (!draft) return
    tried = true
    if (!draft.name.trim()) return
    const { tags: wanted, ...fields } = $state.snapshot(draft)
    busy = true
    error = null
    try {
      const saved = monster ? await putMonster(monster.id, fields) : await postMonster(fields)
      await putTags(saved.id, wanted)
      navigate(`/main/monsters/${saved.id}`)
    } catch (reason) {
      error = reason instanceof Error ? reason.message : String(reason)
      busy = false
    }
  }

  function cancel() {
    navigate(monster ? `/main/monsters/${monster.id}` : '/main/monsters')
  }

  function putPortrait(asset: MediaAsset | null) {
    picking = false
    if (asset && draft) draft.image = asset.url
  }

  function getMedia(kind: MediaKind, current?: string): Promise<MediaAsset | null> {
    return new Promise((resolve) => (media = { kind, current, resolve }))
  }

  function postMedia(file: File): Promise<MediaAsset> {
    return postFile(file, { kind: 'user' })
  }
</script>

{#snippet acts()}
  <Button variant="ghost" size="sm" disabled={busy} onclick={cancel}>Cancel</Button>
  <Button variant="primary" size="sm" loading={busy} onclick={save}>Save</Button>
{/snippet}

<Shell drawers title={monster ? `Building ${monster.name}` : 'New monster'} width="full">
  {#if missing}
    <p class="forge-alarm" role="alert">{missing}</p>
  {:else if !draft || !system || !block}
    {#if error}
      <p class="forge-alarm" role="alert">{error}</p>
    {:else}
      <div class="dnd-loading" role="status" aria-label="Laying out the builder"><span class="dnd-spinner"></span></div>
    {/if}
  {:else}
    <header class="dnd-band forge-band">
      <div class="dnd-band-line">
        <p class="dnd-label forge-eyebrow">
          {monster ? 'The monster builder' : 'A new monster, your own homebrew until you share it'}
        </p>
        <span class="dnd-band-acts">{@render acts()}</span>
      </div>
    </header>

    {#if error}
      <p class="forge-alarm" role="alert">{error}</p>
    {/if}

    <div class="forge">
      <div class="forge-form">
        <Section title="Who it is">
          <div class="forge-group">
            <Field id="forge-name" label="Name" required error={unnamed ? 'Give the monster a name.' : undefined}>
              <input id="forge-name" type="text" maxlength="120" bind:value={draft.name} />
            </Field>
            <div class="forge-fields">
              <Field id="forge-size" label="Size">
                <select id="forge-size" bind:value={draft.size}>
                  {#each system.sizes as one (one.id)}<option value={one.id}>{one.name}</option>{/each}
                </select>
              </Field>
              <Field id="forge-type" label="Type">
                <select id="forge-type" bind:value={draft.type}>
                  {#each system.types as one (one.id)}<option value={one.id}>{one.name}</option>{/each}
                </select>
              </Field>
              <Field id="forge-alignment" label="Alignment">
                <select id="forge-alignment" bind:value={draft.alignment}>
                  {#each system.alignments as one (one.id)}<option value={one.id}>{one.name}</option>{/each}
                </select>
              </Field>
              <Field id="forge-challenge" label="Challenge">
                <select id="forge-challenge" bind:value={draft.challenge}>
                  {#each system.challenges as one (one.value)}
                    <option value={one.value}>{one.name} ({system.labels.experience} {one.xp.toLocaleString('en-US')})</option>
                  {/each}
                </select>
              </Field>
            </div>
            <Picker
              id="forge-subtypes"
              label="Sub-types"
              picked={getPicks([], draft.stats.subtypes, 'kind')}
              options={[]}
              free="kind"
              placeholder="Type a sub-type and press Enter"
              onchange={(picked) => draft && (draft.stats.subtypes = picked.map((one) => one.name))}
            />
          </div>
        </Section>

        <Section title="Armor and hit points">
          <div class="forge-fields">
            <Field id="forge-ac" label="Armor class">
              <input id="forge-ac" type="number" min="0" bind:value={draft.stats.ac} />
            </Field>
            <Field id="forge-ac-note" label="Armor">
              <input id="forge-ac-note" type="text" placeholder="Natural armor" bind:value={draft.stats.ac_note} />
            </Field>
            <Field
              id="forge-dice"
              label="Hit dice"
              help="{getHitDice(draft.stats.hit_dice, block)}, {block.hitPoints} {system.labels.hitPoints} on average"
            >
              <input id="forge-dice" type="number" min="1" bind:value={draft.stats.hit_dice} />
            </Field>
            <Field id="forge-initiative" label={system.labels.initiative}>
              <select id="forge-initiative" bind:value={draft.stats.initiative}>
                {#each system.tiers as one (one.value)}<option value={one.value}>{one.name}</option>{/each}
              </select>
            </Field>
          </div>
        </Section>

        <Section title="Abilities and saves">
          <div class="forge-fields forge-scores">
            {#each system.abilities as ability (ability.id)}
              <div class="forge-score">
                <Field id="forge-score-{ability.id}" label={ability.name}>
                  <input id="forge-score-{ability.id}" type="number" min="1" max="30" bind:value={draft.stats.abilities[ability.id]} />
                </Field>
                <label class="forge-check">
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
        </Section>

        <Section title="Movement and senses" note="In {system.distance}, left empty when it has none">
          <div class="forge-fields">
            {#each system.movements as one (one.id)}
              <Field id="forge-speed-{one.id}" label={one.name}>
                <input id="forge-speed-{one.id}" type="number" min="0" step="5" bind:value={draft.stats.speeds[one.id]} />
              </Field>
            {/each}
            {#each system.senses as one (one.id)}
              <Field id="forge-sense-{one.id}" label={one.name}>
                <input id="forge-sense-{one.id}" type="number" min="0" step="5" bind:value={draft.stats.senses[one.id]} />
              </Field>
            {/each}
          </div>
        </Section>

        <Section title={system.labels.skills}>
          <div class="forge-fields">
            {#each system.skills as skill (skill.id)}
              <Field id="forge-skill-{skill.id}" label={skill.name}>
                <select
                  id="forge-skill-{skill.id}"
                  value={draft.stats.skills[skill.id] ?? 0}
                  onchange={(event) => draft && (draft.stats.skills[skill.id] = Number(event.currentTarget.value))}
                >
                  {#each system.tiers as one (one.value)}<option value={one.value}>{one.name}</option>{/each}
                </select>
              </Field>
            {/each}
          </div>
        </Section>

        <Section title="Defences and tongues">
          <div class="forge-pickers">
            {#each defences as list (list.key)}
              <Picker
                id="forge-{list.key}"
                label={list.label}
                picked={getPicks(list.entries, draft.stats[list.key], list.key)}
                options={getPicks(list.entries, list.entries.map((one) => one.id), list.key)}
                free={list.free ? list.key : undefined}
                onchange={(picked) => draft && (draft.stats[list.key] = picked.map((one) => one.id))}
              />
            {/each}
          </div>
        </Section>

        {#each system.features as kind (kind.id)}
          <Section title={kind.name}>
            {#snippet actions()}
              <Button
                variant="ghost"
                size="sm"
                onclick={() => draft && (draft.stats.features[kind.id] = [...(draft.stats.features[kind.id] ?? []), { name: '', text: '' }])}
              >
                Add {kind.one.toLowerCase()}
              </Button>
            {/snippet}
            <div class="forge-group">
              {#each draft.stats.features[kind.id] as feature, index (index)}
                <div class="forge-feat">
                  <Field id="forge-{kind.id}-{index}-name" label="{kind.one} name">
                    <input id="forge-{kind.id}-{index}-name" type="text" bind:value={feature.name} />
                  </Field>
                  <Field id="forge-{kind.id}-{index}-text" label="What it does">
                    <textarea id="forge-{kind.id}-{index}-text" rows="3" bind:value={feature.text}></textarea>
                  </Field>
                  <IconBtn
                    title="Remove this {kind.one.toLowerCase()}"
                    onclick={() => draft && (draft.stats.features[kind.id] = draft.stats.features[kind.id].filter((_, at) => at !== index))}
                  >
                    <Glyph name="remove" size="sm" />
                  </IconBtn>
                </div>
              {:else}
                <p class="forge-note">No {kind.name.toLowerCase()} yet.</p>
              {/each}
            </div>
          </Section>
        {/each}

        <Section title="Haunts, tags and flags">
          <div class="forge-group">
            <div class="forge-pickers">
              <Picker
                id="forge-habitats"
                label={system.labels.habitats}
                picked={getPicks(system.habitats, draft.stats.habitats, 'habitats')}
                options={getPicks(system.habitats, system.habitats.map((one) => one.id), 'habitats')}
                onchange={(picked) => draft && (draft.stats.habitats = picked.map((one) => one.id))}
              />
              <Picker
                id="forge-tags"
                label="Monster tags"
                note="Shared tags, like NPC or Angel, that the search filters by."
                picked={draft.tags}
                options={tagOptions}
                free="#"
                onchange={(picked) => draft && (draft.tags = picked)}
              />
            </div>
            <div class="forge-checks" role="group" aria-label="Flags">
              {#each system.flags as flag (flag.id)}
                <label class="forge-check">
                  <input
                    type="checkbox"
                    checked={draft.stats.flags.includes(flag.id)}
                    onchange={() => draft && (draft.stats.flags = toggle(draft.stats.flags, flag.id))}
                  />
                  <span>{flag.name}</span>
                </label>
              {/each}
            </div>
          </div>
        </Section>

        <Section title="Portrait and sharing">
          <div class="forge-group">
            <div class="forge-face">
              {#if draft.image}
                <Portrait src={draft.image} alt={draft.name} size="md" />
              {/if}
              <span class="forge-face-acts">
                <Button variant="secondary" size="sm" onclick={() => (picking = true)}>
                  {draft.image ? 'Change the portrait' : 'Choose a portrait'}
                </Button>
                {#if draft.image}
                  <IconBtn title="Remove the portrait" onclick={() => draft && (draft.image = '')}>
                    <Glyph name="remove" size="sm" />
                  </IconBtn>
                {/if}
              </span>
            </div>
            <label class="forge-check">
              <input type="checkbox" bind:checked={draft.is_public} />
              <span>Share it with every player</span>
            </label>
          </div>
        </Section>

        <Section title="Lore" note="The content and background the table reads below the stat block">
          <BlockEditor
            bind:value={draft.description}
            placeholder="Write what the table knows of it, or press slash for a heading, a rule or a table"
            requestMedia={getMedia}
            uploadFile={postMedia}
            openAsset={getAssetTab}
          />
        </Section>

        <footer class="forge-foot">{@render acts()}</footer>
      </div>

      <aside class="forge-preview dnd-scroll" aria-label="Preview">
        <MonsterBlock {system} monster={draft} />
      </aside>
    </div>
  {/if}
</Shell>

{#if picking}
  <MediaDialog
    kind="image"
    current={draft?.image}
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

<style>
  .forge-band {
    padding-block: var(--space-4);
  }

  .forge-eyebrow {
    margin: 0;
    min-width: 0;
    color: var(--metal);
  }

  .forge-alarm {
    margin: 0;
    padding: var(--space-3) var(--space-4);
    border: var(--border-hair) solid color-mix(in srgb, var(--state-bad) 55%, transparent);
    border-radius: var(--radius-sm);
    background: linear-gradient(color-mix(in srgb, var(--state-bad) 18%, transparent), color-mix(in srgb, var(--state-bad) 18%, transparent)), var(--texture-noise), var(--ground-deep);
    box-shadow: var(--bevel-down);
    font-size: var(--text-sm);
    color: var(--ink);
  }

  .forge {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 34rem);
    align-items: start;
    gap: var(--space-6);
    min-width: 0;
  }

  .forge-form {
    display: grid;
    gap: var(--space-6);
    min-width: 0;
  }

  .forge-group {
    display: grid;
    gap: var(--space-4);
    min-width: 0;
  }

  .forge-fields {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(min(calc(var(--space-8) * 2.5), 100%), 1fr));
    gap: var(--space-3) var(--space-4);
    min-width: 0;
  }

  .forge-scores {
    grid-template-columns: repeat(auto-fill, minmax(min(calc(var(--space-8) * 1.75), 100%), 1fr));
  }

  .forge-score {
    display: grid;
    gap: var(--space-2);
    min-width: 0;
  }

  .forge-pickers {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(min(calc(var(--space-8) * 4), 100%), 1fr));
    gap: var(--space-4);
    min-width: 0;
  }

  .forge-checks {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-4);
  }

  .forge-check {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    font-size: var(--text-sm);
    color: var(--ink-dim);
    cursor: pointer;
  }

  .forge-check input {
    accent-color: var(--metal);
  }

  .forge-feat {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 2fr) auto;
    align-items: start;
    gap: var(--space-3);
    min-width: 0;
  }

  .forge-note {
    margin: 0;
    font-size: var(--text-sm);
    font-style: italic;
    color: var(--ink-faint);
  }

  .forge-face {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-4);
  }

  .forge-face-acts {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  .forge-foot {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-3);
  }

  .forge-preview {
    position: sticky;
    top: var(--space-4);
    max-height: calc(100dvh - var(--size-bar) - var(--space-6));
    min-width: 0;
    padding: var(--space-1);
  }

  @container page (max-width: 1100px) {
    .forge {
      grid-template-columns: minmax(0, 1fr);
    }

    .forge-preview {
      position: static;
      max-height: none;
    }
  }

  @container page (max-width: 640px) {
    .forge-feat {
      grid-template-columns: minmax(0, 1fr) auto;
    }

    .forge-feat > :global(.dnd-field:nth-child(2)) {
      grid-column: 1 / -1;
      grid-row: 2;
    }
  }
</style>
