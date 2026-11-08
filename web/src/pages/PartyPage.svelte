<script lang="ts">
  import { deleteParty, deletePartyCharacter, getCharacter, getCharacters, getParty, getPartyStream, getProfileEmail, getProfiles, postPartyCharacter, putParty } from '$lib/api'
  import type { Character, Party, Profile } from '$lib/api/types'
  import { onMount, setContext } from 'svelte'
  import { navigate } from 'sly-svelte-location-router'
  import { getTheme, setTheme } from '$lib/dialogs/theme'
  import { user } from '$lib/stores/auth.store'
  import { anyDialogOpen, uiStore } from '$lib/stores/ui.store'
  import BaseDialog from '$components/BaseDialog.svelte'
  import Button from '$components/ui/Button.svelte'
  import Card from '$components/ui/Card.svelte'
  import Field from '$components/ui/Field.svelte'
  import Ornament from '$components/ui/Ornament.svelte'
  import Shell from '$components/ui/Shell.svelte'
  import MenuPanel from '$components/MenuPanel.svelte'
  import Chat from '$chat/Chat.svelte'

  setContext('dialogState', {
    get isAnyDialogOpen() {
      return $anyDialogOpen
    },
    setDialogState: uiStore.setDialogState
  })

  const { route }: { route?: { params?: Record<string, string> } } = $props()

  const partyId = $derived(route?.params?.id ?? '')

  let party = $state<Party | null>(null)
  let members = $state<Profile[]>([])
  let heroes = $state<Character[]>([])
  let loading = $state(true)
  let busy = $state(false)
  let error = $state<string | null>(null)
  let invite = $state('')
  let mine = $state<Character[]>([])
  let bring = $state('')
  let name = $state('')
  let description = $state('')
  let dropOpen = $state(false)

  const owns = $derived(Boolean(party && $user && party.owner_id === $user.user_id))
  const free = $derived(mine.filter((entry) => !party?.character_ids.includes(entry.id)))
  const renamed = $derived(
    Boolean(party && name.trim() && (name.trim() !== party.name || description.trim() !== party.description))
  )

  onMount(() => setTheme(getTheme()))

  let read = $state('')

  $effect(() => {
    if (!partyId || partyId === read) return
    read = partyId

    void (async () => {
      try {
        party = await getParty(partyId)
        name = party?.name ?? ''
        description = party?.description ?? ''
        if (party) await fill()
      } catch (reason) {
        error = reason instanceof Error ? reason.message : String(reason)
      } finally {
        loading = false
      }
    })()
  })

  $effect(() => {
    if (!partyId) return
    const live = getPartyStream(partyId, (loaded) => {
      party = loaded
      if (party) void fill()
    })
    return () => live()
  })

  async function fill() {
    if (!party) return
    const [profiles, roll, brought] = await Promise.all([
      getProfiles(party.member_ids),
      getCharacters(),
      Promise.all(party.character_ids.map((id) => getCharacter(id)))
    ])
    members = profiles
    mine = roll
    heroes = brought.filter((entry): entry is Character => entry !== null)
  }

  async function write(task: () => Promise<void>) {
    busy = true
    error = null
    try {
      await task()
    } catch (reason) {
      error = reason instanceof Error ? reason.message : String(reason)
    } finally {
      busy = false
    }
  }

  function rename() {
    if (!party || !renamed) return
    const fields = { name: name.trim(), description: description.trim() }
    void write(async () => {
      await putParty(party!.id, fields)
      party = { ...party!, ...fields }
    })
  }

  function bringHero() {
    if (!party || !bring) return
    const id = bring
    void write(async () => {
      await postPartyCharacter(party!.id, id)
      party = { ...party!, character_ids: [...party!.character_ids, id] }
      bring = ''
      await fill()
    })
  }

  function dropHero(id: string) {
    if (!party) return
    void write(async () => {
      await deletePartyCharacter(party!.id, id)
      party = { ...party!, character_ids: party!.character_ids.filter((entry) => entry !== id) }
      await fill()
    })
  }

  function dropParty() {
    if (!party) return
    const id = party.id
    void write(async () => {
      await deleteParty(id)
      dropOpen = false
      navigate('/main')
    })
  }

  async function addMember() {
    const wanted = invite.trim()
    if (!wanted || !party) return

    busy = true
    error = null
    try {
      const found = await getProfileEmail(wanted)
      if (!found) {
        error = 'Nobody signs in with that address.'
        return
      }
      if (party.member_ids.includes(found.user_id)) {
        error = 'They are already in the party.'
        return
      }

      const member_ids = [...party.member_ids, found.user_id]
      await putParty(party.id, { member_ids })
      party = { ...party, member_ids }
      invite = ''
      await fill()
    } catch (reason) {
      error = reason instanceof Error ? reason.message : String(reason)
    } finally {
      busy = false
    }
  }

  async function dropMember(userId: string) {
    if (!party) return

    busy = true
    error = null
    try {
      const member_ids = party.member_ids.filter((entry) => entry !== userId)
      const character_ids = party.character_ids.filter(
        (id) => !heroes.some((hero) => hero.id === id && hero.owner_id === userId)
      )
      await putParty(party.id, { member_ids, character_ids })
      party = { ...party, member_ids, character_ids }
      await fill()
    } catch (reason) {
      error = reason instanceof Error ? reason.message : String(reason)
    } finally {
      busy = false
    }
  }
</script>

<Shell title={party?.name ?? 'Party'} width="wide" back={() => navigate('/main')}>
  {#snippet menu()}
    <MenuPanel />
  {/snippet}

  {#snippet chat()}
    <Chat />
  {/snippet}

  {#if loading}
    <div class="dnd-loading"><span class="dnd-spinner"></span></div>
  {:else if !party}
    <p class="band-note">That party does not exist, or you are not in it.</p>
  {:else}
    <div class="band">
      {#if error}
        <p class="band-alarm" role="alert">{error}</p>
      {/if}

      <header class="band-crown">
        <p class="dnd-label band-eyebrow">Party</p>
        <h1 class="dnd-heading dnd-heading-hero band-name">{party.name}</h1>
        {#if party.description}
          <p class="band-lede">{party.description}</p>
        {/if}
        <span class="band-rule"><Ornament name="divider" tone="metal" /></span>
      </header>

      <section class="band-part" aria-label="Members">
        <header class="band-divide">
          <h2 class="dnd-label band-divide-name">Members</h2>
          <span class="band-divide-note">{members.length} at the table</span>
          <span class="band-divide-run"></span>
        </header>

        <div class="band-grid">
          {#each members as member (member.user_id)}
            <Card
              title={member.display_name || member.email}
              sub={member.user_id === party.owner_id ? 'Gathered the party' : 'Member'}
              image={member.photo_url}
              tone={member.user_id === party.owner_id ? 'ember' : 'metal'}
            />
          {/each}
        </div>

        {#if owns}
          <div class="band-invite">
            <Field id="party-invite" label="Add by email">
              <input
                id="party-invite"
                type="email"
                placeholder="them@example.com"
                bind:value={invite}
                disabled={busy}
              />
            </Field>
            <Button variant="secondary" size="sm" disabled={busy || !invite.trim()} onclick={addMember}>
              Add
            </Button>
          </div>

          <ul class="band-list">
            {#each members.filter((entry) => entry.user_id !== party?.owner_id) as member (member.user_id)}
              <li class="band-row">
                <span class="band-row-name">{member.display_name || member.email}</span>
                <Button variant="ghost" size="sm" disabled={busy} onclick={() => dropMember(member.user_id)}>
                  Remove
                </Button>
              </li>
            {/each}
          </ul>
        {/if}
      </section>

      <section class="band-part" aria-label="Heroes">
        <header class="band-divide">
          <h2 class="dnd-label band-divide-name">Heroes</h2>
          <span class="band-divide-note">{heroes.length} on the roll</span>
          <span class="band-divide-run"></span>
        </header>

        {#if heroes.length === 0}
          <p class="band-note">No sheet has been brought to this party yet.</p>
        {:else}
          <div class="band-grid">
            {#each heroes as hero (hero.id)}
              <Card
                title={hero.metadata.name}
                sub="{hero.metadata.race} {hero.metadata.class}"
                image={hero.character?.info?.imageUrl}
                badge="Lv {hero.metadata.level}"
                tone="ember"
                onclick={() => navigate(`/main/character/${hero.id}`)}
              />
            {/each}
          </div>

          <ul class="band-list">
            {#each heroes.filter((entry) => owns || entry.owner_id === $user?.user_id) as hero (hero.id)}
              <li class="band-row">
                <span class="band-row-name">{hero.metadata.name}</span>
                <Button variant="ghost" size="sm" disabled={busy} onclick={() => dropHero(hero.id)}>Take out</Button>
              </li>
            {/each}
          </ul>
        {/if}

        {#if party.character_ids.length > heroes.length}
          <p class="band-note">{party.character_ids.length - heroes.length} more on the roll, kept private by their players.</p>
        {/if}

        {#if free.length > 0}
          <div class="band-invite">
            <Field id="party-bring" label="Bring a character">
              <select id="party-bring" bind:value={bring} disabled={busy}>
                <option value="">Choose one of yours</option>
                {#each free as entry (entry.id)}
                  <option value={entry.id}>{entry.metadata.name}</option>
                {/each}
              </select>
            </Field>
            <Button variant="secondary" size="sm" disabled={busy || !bring} onclick={bringHero}>Bring</Button>
          </div>
        {/if}
      </section>

      {#if owns}
        <section class="band-part" aria-label="Settings">
          <header class="band-divide">
            <h2 class="dnd-label band-divide-name">Settings</h2>
            <span class="band-divide-run"></span>
          </header>

          <Field id="party-name" label="What they are called">
            <input id="party-name" type="text" bind:value={name} disabled={busy} />
          </Field>

          <Field id="party-note" label="What they are about">
            <textarea id="party-note" rows="3" bind:value={description} disabled={busy}></textarea>
          </Field>

          <div class="band-acts">
            <Button variant="primary" size="sm" disabled={busy || !renamed} onclick={rename}>Save</Button>
            <Button variant="danger" size="sm" disabled={busy} onclick={() => (dropOpen = true)}>Disband the party</Button>
          </div>
        </section>
      {/if}
    </div>

    {#if dropOpen}
      <BaseDialog bind:isOpen={dropOpen} title="Disband {party.name}" zIndex={9999}>
        <div class="band-drop">
          <p class="band-lede">The party goes for good. Every sheet stays with its player, and what was shared with the party is no longer read through it.</p>
          <div class="band-acts">
            <Button variant="ghost" disabled={busy} onclick={() => (dropOpen = false)}>Keep them</Button>
            <Button variant="danger" loading={busy} onclick={dropParty}>Disband</Button>
          </div>
        </div>
      </BaseDialog>
    {/if}
  {/if}
</Shell>

<style>
  .band {
    display: grid;
    gap: var(--space-6);
    min-width: 0;
  }

  .band-crown {
    display: grid;
    gap: var(--space-2);
    min-width: 0;
  }

  .band-eyebrow {
    margin: 0;
    color: var(--metal);
  }

  .band-name {
    margin: 0;
  }

  .band-lede {
    margin: 0;
    max-width: 70ch;
    color: var(--ink-dim);
  }

  .band-rule {
    display: block;
    width: min(21.25rem, 70%);
  }

  .band-part {
    display: grid;
    gap: var(--space-4);
    min-width: 0;
  }

  .band-divide {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-3);
    min-width: 0;
  }

  .band-divide-name {
    margin: 0;
    color: var(--metal-bright);
    text-shadow: 0 1px 0 #000, 0 0 10px var(--ember-glow);
  }

  .band-divide-note {
    font-family: var(--font-figures);
    letter-spacing: var(--tracking-wide);
    font-size: var(--text-xs);
    color: var(--ink-faint);
  }

  .band-divide-run {
    flex: 1;
    min-width: 0;
    height: var(--border-hair);
    background: linear-gradient(90deg, var(--metal), var(--metal-dim) 40%, transparent);
    box-shadow: 0 1px 0 #000;
  }

  .band-grid {
    --band-card: calc(var(--space-8) * 2.5);
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(min(var(--band-card), 100%), 1fr));
    gap: var(--space-4);
    min-width: 0;
  }

  .band-invite {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-end;
    gap: var(--space-3);
  }

  .band-list {
    display: grid;
    gap: var(--space-2);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .band-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    padding: var(--space-2) var(--space-3) var(--space-2) var(--space-4);
    border: none;
    border-radius: var(--radius-sm);
    background: var(--texture-noise), linear-gradient(180deg, var(--ground-raised), var(--ground-deep));
    box-shadow: var(--rim-thin), inset 0 0 16px 2px var(--shade-hard);
    transition: box-shadow 0.18s ease, filter 0.18s ease;
  }

  .band-row:hover {
    filter: brightness(1.06);
    box-shadow: var(--rim-thin), inset 0 0 16px 2px var(--shade-hard), 0 0 12px color-mix(in srgb, var(--metal) 35%, transparent);
  }

  .band-row-name {
    min-width: 0;
    font-size: var(--text-sm);
    color: var(--ink);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .band-acts {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: var(--space-3);
  }

  .band-drop {
    display: grid;
    gap: var(--space-4);
    padding: var(--space-5) var(--space-6) var(--space-6);
  }

  .band-note {
    margin: 0;
    font-size: var(--text-sm);
    font-style: italic;
    color: var(--ink-faint);
  }

  .band-alarm {
    margin: 0;
    padding: var(--space-3);
    border: var(--border-hair) solid var(--state-bad);
    border-radius: var(--radius-sm);
    background: var(--texture-noise), linear-gradient(180deg, color-mix(in srgb, var(--state-bad) 14%, var(--ground-raised)), var(--ground-deep));
    box-shadow: var(--bevel-down);
    font-size: var(--text-sm);
    color: var(--ink);
  }
</style>
