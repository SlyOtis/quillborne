<script lang="ts">
  import {getContext} from "svelte";
  import type {Readable} from "svelte/store";
  import type {CharacterContext} from "$lib/types";
  import type {RulesState} from "$lib/rules/store";
  import type {CharacterSpell, Damage} from "$lib/character.types";
  import {deleteSpell, postCast, postSpell, putSpell, putSpellcasting} from "$lib/engine";
  import AdditionalSlots from "./AdditionalSlots.svelte";
  import Button from "$components/ui/Button.svelte";
  import Field from "$components/ui/Field.svelte";
  import Fold from "$components/ui/Fold.svelte";
  import Glyph from "$components/ui/Glyph.svelte";
  import IconBtn from "$components/ui/IconBtn.svelte";
  import Sigil from "$components/ui/Sigil.svelte";

  const {info, spells} = getContext<CharacterContext>('character')
  const rules = getContext<Readable<RulesState>>('rules')

  const LEVELS = [1, 2, 3, 4, 5, 6, 7, 8, 9]

  type Draft = {
    id: string
    title: string
    level: number
    school: string
    description: string
    prepared: boolean
    resolve: 'none' | 'attack' | 'save'
    save: string
    damage: Damage
  }

  const blankDamage = (): Damage => ({amount: 0, dice: 6, type: '', bonus: 0})

  const blank = (): Draft => ({
    id: '',
    title: '',
    level: 0,
    school: '',
    description: '',
    prepared: true,
    resolve: 'none',
    save: '',
    damage: blankDamage()
  })

  let draft = $state<Draft | null>(null)
  let slotsOpen = $state(false)
  let note = $state('')

  const attributes = $derived($rules.system?.attributes ?? [])
  const saveDc = $derived($rules.resolved?.scope['derived.spellSaveDc'])
  const attack = $derived($rules.resolved?.scope['derived.spellAttack'] ?? 0)
  const spellcasting = $derived($info.spells ?? {modifier: '', slots: {}})

  const groups = $derived(
    [0, ...LEVELS]
      .map(level => ({level, entries: ($spells ?? []).filter(spell => (spell.level ?? 0) === level)}))
      .filter(group => group.entries.length)
  )

  const getSlotLevel = (spell: CharacterSpell) =>
    LEVELS.find(level => level >= spell.level && (spellcasting.slots?.[level] ?? 0) > (spellcasting.expended?.[level] ?? 0))

  const renderDamage = (damage: Damage) =>
    `${damage.amount}d${damage.dice}${damage.bonus ? ` + ${damage.bonus}` : ''}${damage.type ? ` ${damage.type}` : ''}`

  function putModifier(event: Event) {
    putSpellcasting({...spellcasting, modifier: (event.target as HTMLSelectElement).value})
  }

  function putSlotMax(level: number, event: Event) {
    const max = Math.max(0, parseInt((event.target as HTMLInputElement).value) || 0)
    const expended = {...spellcasting.expended, [level]: Math.min(max, spellcasting.expended?.[level] ?? 0)}
    putSpellcasting({...spellcasting, slots: {...spellcasting.slots, [level]: max}, expended})
  }

  function openSpell(spell: CharacterSpell) {
    draft = {
      id: spell.id,
      title: spell.title,
      level: spell.level ?? 0,
      school: spell.school ?? '',
      description: spell.description ?? '',
      prepared: spell.prepared,
      resolve: spell.attack ? 'attack' : spell.save ? 'save' : 'none',
      save: spell.save ?? '',
      damage: {...(spell.damage?.[0] ?? blankDamage())}
    }
  }

  function saveDraft() {
    if (!draft || !draft.title.trim()) return
    const spell: CharacterSpell = {
      id: draft.id || crypto.randomUUID(),
      title: draft.title.trim(),
      level: Math.max(0, Math.min(9, Number(draft.level) || 0)),
      school: draft.school.trim(),
      description: draft.description.trim(),
      prepared: draft.prepared,
      attack: draft.resolve === 'attack',
      save: draft.resolve === 'save' ? draft.save : '',
      damage: draft.damage.amount > 0 ? [{...draft.damage, amount: Number(draft.damage.amount), dice: Number(draft.damage.dice), bonus: Number(draft.damage.bonus) || 0}] : []
    }
    if (draft.id) putSpell(spell)
    else postSpell(spell)
    draft = null
  }

  async function cast(spell: CharacterSpell) {
    const level = spell.level > 0 ? getSlotLevel(spell) : 0
    if (level === undefined) {
      note = `No slot of level ${spell.level} or higher is left for ${spell.title}.`
      return
    }
    note = ''
    await postCast(spell, level, attack)
  }
</script>

<div class="root">
    <div class="head">
        <Field label="Spellcasting ability" id="spell-ability">
            <select id="spell-ability" value={spellcasting.modifier} onchange={putModifier}>
                <option value="">None</option>
                {#each attributes as attribute (attribute.id)}
                    <option value={attribute.id}>{attribute.title}</option>
                {/each}
            </select>
        </Field>
        <span class="figure"><span class="dnd-label">Save DC</span><b>{saveDc ?? '--'}</b></span>
        <span class="figure"><span class="dnd-label">Attack</span><b>{attack >= 0 ? '+' : ''}{attack}</b></span>
        <Button variant="secondary" size="sm" title="Add a spell" onclick={() => (draft = blank())}>Add spell</Button>
    </div>

    <div class="slots">
        {#each LEVELS as level (level)}
            <AdditionalSlots {level} />
        {/each}
        <AdditionalSlots />
    </div>

    <Fold title="Slots per level" variant="row" open={slotsOpen} ontoggle={() => (slotsOpen = !slotsOpen)}>
        <div class="maxima">
            {#each LEVELS as level (level)}
                <Field label="Level {level}" id="slot-max-{level}">
                    <input
                        id="slot-max-{level}"
                        type="number"
                        min="0"
                        value={spellcasting.slots?.[level] ?? 0}
                        onchange={event => putSlotMax(level, event)}
                    />
                </Field>
            {/each}
        </div>
    </Fold>

    {#if draft}
        <form class="draft" onsubmit={event => { event.preventDefault(); saveDraft() }}>
            <Field label="Name" id="spell-title" required>
                <input id="spell-title" bind:value={draft.title} />
            </Field>
            <Field label="Level" id="spell-level" help="0 is a cantrip">
                <input id="spell-level" type="number" min="0" max="9" bind:value={draft.level} />
            </Field>
            <Field label="School" id="spell-school">
                <input id="spell-school" bind:value={draft.school} />
            </Field>
            <Field label="Resolves by" id="spell-resolve">
                <select id="spell-resolve" bind:value={draft.resolve}>
                    <option value="none">Nothing</option>
                    <option value="attack">Spell attack</option>
                    <option value="save">Saving throw</option>
                </select>
            </Field>
            {#if draft.resolve === 'save'}
                <Field label="Save" id="spell-save">
                    <select id="spell-save" bind:value={draft.save}>
                        {#each attributes as attribute (attribute.id)}
                            <option value={attribute.id}>{attribute.title}</option>
                        {/each}
                    </select>
                </Field>
            {/if}
            <Field label="Damage dice" id="spell-dice-amount">
                <input id="spell-dice-amount" type="number" min="0" bind:value={draft.damage.amount} />
            </Field>
            <Field label="Die" id="spell-die">
                <select id="spell-die" bind:value={draft.damage.dice}>
                    {#each [4, 6, 8, 10, 12, 20] as die (die)}
                        <option value={die}>d{die}</option>
                    {/each}
                </select>
            </Field>
            <Field label="Bonus" id="spell-bonus">
                <input id="spell-bonus" type="number" bind:value={draft.damage.bonus} />
            </Field>
            <Field label="Damage type" id="spell-damage-type">
                <select id="spell-damage-type" bind:value={draft.damage.type}>
                    <option value="">None</option>
                    {#each $rules.system?.damageTypes ?? [] as damage (damage.id)}
                        <option value={damage.id}>{damage.title}</option>
                    {/each}
                </select>
            </Field>
            <Field label="Description" id="spell-description">
                <textarea id="spell-description" rows="3" bind:value={draft.description}></textarea>
            </Field>
            <span class="draft-acts">
                <Button type="submit" size="sm" disabled={!draft.title.trim()}>Save spell</Button>
                <Button variant="ghost" size="sm" onclick={() => (draft = null)}>Cancel</Button>
            </span>
        </form>
    {/if}

    {#if note}
        <span class="note" role="status">{note}</span>
    {/if}

    <div class="list">
        {#each groups as group (group.level)}
            <div class="divider"><span>{group.level === 0 ? 'Cantrips' : `Level ${group.level}`}</span></div>
            <ul>
                {#each group.entries as spell (spell.id)}
                    <li class="spell">
                        <Sigil
                            frame="ring"
                            size="sm"
                            tone="arcane"
                            active={spell.prepared}
                            title="{spell.prepared ? 'Unprepare' : 'Prepare'} {spell.title}"
                            onclick={() => putSpell({...spell, prepared: !spell.prepared})}
                        >
                            <Glyph name="sources" size="sm" />
                        </Sigil>
                        <span class="spell-name" title={spell.description}>
                            <b>{spell.title}</b>
                            <span class="spell-sub">
                                {spell.school}{spell.attack ? ` · attack ${attack >= 0 ? '+' : ''}${attack}` : ''}{spell.save ? ` · ${spell.save.toUpperCase()} save DC ${saveDc ?? '--'}` : ''}{spell.damage?.[0] ? ` · ${renderDamage(spell.damage[0])}` : ''}
                            </span>
                        </span>
                        <Button
                            variant="secondary"
                            size="sm"
                            title="Cast {spell.title}"
                            disabled={spell.level > 0 && getSlotLevel(spell) === undefined}
                            onclick={() => cast(spell)}
                        >
                            Cast
                        </Button>
                        <IconBtn title="Edit {spell.title}" onclick={() => openSpell(spell)}>
                            <Glyph name="edit" size="sm" />
                        </IconBtn>
                        <IconBtn title="Remove {spell.title}" onclick={() => deleteSpell(spell.id)}>
                            <Glyph name="remove" size="sm" />
                        </IconBtn>
                    </li>
                {/each}
            </ul>
        {:else}
            <span class="note">No spells yet.</span>
        {/each}
    </div>
</div>

<style>
    .root {
        position: relative;
        width: 100%;
        display: flex;
        flex-direction: column;
        gap: var(--space-3);
        min-width: 0;
        padding: 0 var(--space-3);
    }

    .head {
        display: flex;
        flex-wrap: wrap;
        align-items: flex-end;
        gap: var(--space-3);
        min-width: 0;
    }

    .figure {
        display: flex;
        flex-direction: column;
        gap: var(--space-0);
        min-width: 4.5rem;
        padding: var(--space-1) var(--space-3);
        background: var(--texture-noise), linear-gradient(180deg, var(--ground-deep) 0%, var(--ground) 100%);
        border: var(--border-hair) solid color-mix(in srgb, var(--metal-dim) 60%, transparent);
        border-radius: var(--radius-sm);
        box-shadow: var(--bevel-down);
    }

    .figure b {
        font-family: var(--font-figures);
        font-size: var(--text-lg);
        font-variant-numeric: lining-nums tabular-nums;
        line-height: 1.1;
        color: var(--metal-bright);
        text-shadow: 0 1px 0 var(--shadow-ink), 0 0 0.6rem var(--ember-glow);
    }

    .slots {
        display: flex;
        flex-direction: column;
        gap: var(--space-2);
        min-width: 0;
    }

    .maxima {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(5rem, 1fr));
        gap: var(--space-2);
        padding-block: var(--space-2);
    }

    .draft {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(9rem, 1fr));
        gap: var(--space-2);
        align-items: end;
        min-width: 0;
    }

    .draft-acts {
        display: flex;
        gap: var(--space-2);
        grid-column: 1 / -1;
    }

    .note {
        font-size: var(--text-xs);
        font-style: italic;
        color: var(--ink-dim);
    }

    .list {
        display: flex;
        flex-direction: column;
        min-width: 0;
    }

    .divider {
        margin-top: var(--space-2);
        padding: var(--space-1) var(--space-3);
        background:
            linear-gradient(180deg, color-mix(in srgb, var(--stone-light) 20%, transparent) 0%, color-mix(in srgb, var(--shadow-ink) 45%, transparent) 60%, color-mix(in srgb, var(--shadow-ink) 65%, transparent) 100%),
            var(--texture-noise),
            var(--stone);
        border-radius: var(--radius-sm);
        box-shadow: var(--bevel-up), inset 0 0 0 1px var(--metal-dim), inset 0 -1px 0 1px var(--keyline), 0 2px 4px var(--shade);
        font-family: var(--font-display);
        font-size: var(--text-xs);
        font-weight: 700;
        letter-spacing: var(--tracking-caps);
        text-transform: uppercase;
        color: var(--metal-bright);
        text-shadow: 0 1px 0 var(--shadow-ink);
    }

    ul {
        margin: 0;
        padding: var(--space-2) 0;
        list-style: none;
        display: flex;
        flex-direction: column;
        gap: var(--space-2);
    }

    .spell {
        display: flex;
        align-items: center;
        gap: var(--space-2);
        min-width: 0;
        padding: var(--space-1) var(--space-2);
        border-radius: var(--radius-sm);
        box-shadow: inset 0 -1px 0 color-mix(in srgb, var(--metal-dim) 45%, transparent);
        transition: background-color 0.15s ease, box-shadow 0.15s ease;
    }

    .spell:hover {
        background-color: color-mix(in srgb, var(--ember) 8%, transparent);
        box-shadow: inset 0 0 0 1px var(--metal-dim), inset 0 0 1rem -0.4rem var(--ember-glow);
    }

    .spell:hover b {
        color: var(--metal-bright);
        text-shadow: var(--glow-text);
    }

    .spell b {
        font-family: var(--font-display);
        font-size: var(--text-sm);
        color: var(--ink);
        text-shadow: 0 1px 0 var(--shadow-ink);
        transition: color 0.15s ease, text-shadow 0.15s ease;
    }

    .spell-name {
        display: flex;
        flex: 1;
        flex-direction: column;
        min-width: 0;
    }

    .spell-name > * {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .spell-sub {
        font-size: var(--text-xs);
        color: var(--ink-dim);
    }
</style>
