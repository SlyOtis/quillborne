<script lang="ts">
  import { deleteCampaign, deleteCampaignCharacter, deleteCampaignPlayer, getCampaign, getCharacters, getProfiles, postCampaignCharacter, postCampaignPlayer, putCampaign } from '$lib/api'
  import type { Campaign, CampaignSettings, Character, Profile } from '$lib/api/types'
  import { navigate } from 'sly-svelte-location-router'
  import { deleteResources } from '$lib/resources'
  import { user } from '$lib/stores/auth.store'
  import { userCampaigns } from '$lib/stores/campaign.store'
  import BaseDialog from '$components/BaseDialog.svelte'
  import Button from '$components/ui/Button.svelte'
  import Card from '$components/ui/Card.svelte'
  import Field from '$components/ui/Field.svelte'
  import Panel from '$components/ui/Panel.svelte'

  let {
    campaign = $bindable(),
    characters,
    onchange
  }: {
    /** The campaign the table is gathered around, rewritten as it is saved. */
    campaign: Campaign
    /** The character sheets brought to the campaign. */
    characters: Character[]
    /** Runs after the roll of characters changed so the page reads it back. */
    onchange: () => Promise<void>
  } = $props()

  const EXPERIENCE: CampaignSettings['experience_mode'][] = ['milestone', 'individual', 'shared']

  let players = $state<Profile[]>([])
  let mine = $state<Character[]>([])
  let invite = $state('')
  let bring = $state('')
  let name = $state('')
  let description = $state('')
  let settings = $state<CampaignSettings>({
    allow_character_editing: true,
    share_character_sheets: true,
    private_notes: true,
    experience_mode: 'milestone'
  })
  let busy = $state(false)
  let error = $state<string | null>(null)
  let dropOpen = $state(false)
  let read = $state('')

  const isDm = $derived(Boolean($user && campaign.dm_id === $user.user_id))
  const free = $derived(mine.filter((entry) => !entry.campaign_id))
  const changed = $derived(
    name.trim() !== campaign.name ||
      description.trim() !== campaign.description ||
      JSON.stringify(settings) !== JSON.stringify(campaign.settings)
  )

  $effect(() => {
    const now = `${campaign.id}/${campaign.player_ids.join()}`
    if (now === read) return
    read = now
    name = campaign.name
    description = campaign.description
    settings = { ...campaign.settings }
    void fill()
  })

  async function fill() {
    const [profiles, roll] = await Promise.all([
      getProfiles([campaign.dm_id, ...campaign.player_ids]),
      getCharacters()
    ])
    players = profiles
    mine = roll
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

  async function reread() {
    const found = await getCampaign(campaign.id)
    if (found) campaign = found
    userCampaigns.update((all) => all.map((entry) => (entry.id === campaign.id ? campaign : entry)))
  }

  function save() {
    const fields = { name: name.trim(), description: description.trim(), settings: { ...settings } }
    void write(async () => {
      await putCampaign(campaign.id, fields)
      await reread()
    })
  }

  function archive() {
    const is_active = !campaign.is_active
    void write(async () => {
      await putCampaign(campaign.id, { is_active })
      await reread()
    })
  }

  function addPlayer() {
    const wanted = invite.trim()
    if (!wanted) return
    void write(async () => {
      await postCampaignPlayer(campaign.id, wanted)
      invite = ''
      await reread()
    })
  }

  function dropPlayer(userId: string) {
    void write(async () => {
      await deleteCampaignPlayer(campaign.id, userId)
      await reread()
      await onchange()
    })
  }

  function bringCharacter() {
    const id = bring
    if (!id) return
    void write(async () => {
      await postCampaignCharacter(campaign.id, id)
      bring = ''
      await reread()
      await fill()
      await onchange()
    })
  }

  function dropCharacter(id: string) {
    void write(async () => {
      await deleteCampaignCharacter(campaign.id, id)
      await reread()
      await fill()
      await onchange()
    })
  }

  function dropCampaign() {
    const userId = $user?.user_id
    if (!userId) return
    const id = campaign.id
    void write(async () => {
      await deleteResources({ at: 'campaign', id }, userId)
      await deleteCampaign(id)
      userCampaigns.update((all) => all.filter((entry) => entry.id !== id))
      dropOpen = false
      navigate('/main')
    })
  }
</script>

<div class="table">
  {#if error}
    <p class="table-alarm" role="alert">{error}</p>
  {/if}

  <Panel title="At the table">
    <div class="table-body">
      <div class="table-cards">
        {#each players as player (player.user_id)}
          <Card
            title={player.display_name || player.email}
            sub={player.user_id === campaign.dm_id ? 'Dungeon master' : 'Player'}
            image={player.photo_url}
            tone={player.user_id === campaign.dm_id ? 'verdigris' : 'metal'}
          />
        {/each}
      </div>

      {#if isDm}
        <ul class="table-list">
          {#each players.filter((entry) => entry.user_id !== campaign.dm_id) as player (player.user_id)}
            <li class="table-row">
              <span class="table-row-name">{player.display_name || player.email}</span>
              <Button variant="ghost" size="sm" disabled={busy} onclick={() => dropPlayer(player.user_id)}>Remove</Button>
            </li>
          {/each}
        </ul>

        <div class="table-line">
          <Field id="campaign-invite" label="Seat a player by email">
            <input
              id="campaign-invite"
              type="email"
              placeholder="them@example.com"
              bind:value={invite}
              disabled={busy}
            />
          </Field>
          <Button variant="secondary" size="sm" disabled={busy || !invite.trim()} onclick={addPlayer}>Seat</Button>
        </div>
      {/if}
    </div>
  </Panel>

  <Panel title="Characters brought">
    <div class="table-body">
      {#if characters.length === 0}
        <p class="table-note">No character has been brought to the campaign.</p>
      {:else}
        <ul class="table-list">
          {#each characters as entry (entry.id)}
            <li class="table-row">
              <span class="table-row-name">{entry.metadata.name}, level {entry.metadata.level} {entry.metadata.class}</span>
              {#if isDm || entry.owner_id === $user?.user_id}
                <Button variant="ghost" size="sm" disabled={busy} onclick={() => dropCharacter(entry.id)}>Take out</Button>
              {/if}
            </li>
          {/each}
        </ul>
      {/if}

      {#if free.length > 0}
        <div class="table-line">
          <Field id="campaign-bring" label="Bring a character" help="One of yours that is not in a campaign yet.">
            <select id="campaign-bring" bind:value={bring} disabled={busy}>
              <option value="">Choose one of yours</option>
              {#each free as entry (entry.id)}
                <option value={entry.id}>{entry.metadata.name}</option>
              {/each}
            </select>
          </Field>
          <Button variant="secondary" size="sm" disabled={busy || !bring} onclick={bringCharacter}>Bring</Button>
        </div>
      {/if}
    </div>
  </Panel>

  {#if isDm}
    <Panel title="Settings">
      <div class="table-body">
        <Field id="campaign-name" label="Name">
          <input id="campaign-name" type="text" bind:value={name} disabled={busy} />
        </Field>

        <Field id="campaign-description" label="Description">
          <textarea id="campaign-description" rows="4" bind:value={description} disabled={busy}></textarea>
        </Field>

        <div class="table-grid">
          <Field id="campaign-editing" label="Players edit their sheets">
            <select id="campaign-editing" bind:value={settings.allow_character_editing} disabled={busy}>
              <option value={true}>Yes</option>
              <option value={false}>No</option>
            </select>
          </Field>

          <Field id="campaign-sheets" label="Sheets are shared at the table">
            <select id="campaign-sheets" bind:value={settings.share_character_sheets} disabled={busy}>
              <option value={true}>Yes</option>
              <option value={false}>No</option>
            </select>
          </Field>

          <Field id="campaign-notes" label="Players keep private notes">
            <select id="campaign-notes" bind:value={settings.private_notes} disabled={busy}>
              <option value={true}>Yes</option>
              <option value={false}>No</option>
            </select>
          </Field>

          <Field id="campaign-experience" label="Experience">
            <select id="campaign-experience" bind:value={settings.experience_mode} disabled={busy}>
              {#each EXPERIENCE as mode (mode)}
                <option value={mode}>{mode}</option>
              {/each}
            </select>
          </Field>
        </div>

        <div class="table-acts">
          <Button variant="secondary" size="sm" disabled={busy} onclick={archive}>
            {campaign.is_active ? 'Archive' : 'Bring back'}
          </Button>
          <Button variant="danger" size="sm" disabled={busy} onclick={() => (dropOpen = true)}>Delete</Button>
          <Button variant="primary" size="sm" disabled={busy || !changed || !name.trim()} onclick={save}>Save</Button>
        </div>
      </div>
    </Panel>
  {/if}
</div>

{#if dropOpen}
  <BaseDialog bind:isOpen={dropOpen} title="Delete {campaign.name}" zIndex={9999}>
    <div class="table-drop">
      <p class="table-note">
        The campaign goes for good, with its maps, its encounters and everything you wrote in it. Every character
        sheet stays with its player.
      </p>
      <div class="table-acts">
        <Button variant="ghost" disabled={busy} onclick={() => (dropOpen = false)}>Keep it</Button>
        <Button variant="danger" loading={busy} onclick={dropCampaign}>Delete</Button>
      </div>
    </div>
  </BaseDialog>
{/if}

<style>
  .table {
    display: grid;
    gap: var(--space-5);
    min-width: 0;
  }

  .table-body {
    display: grid;
    gap: var(--space-4);
    min-width: 0;
  }

  .table-cards {
    --table-card: calc(var(--space-8) * 2.5);
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(min(var(--table-card), 100%), 1fr));
    gap: var(--space-3);
    min-width: 0;
  }

  .table-grid {
    --table-field: calc(var(--space-8) * 4);
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(var(--table-field), 100%), 1fr));
    gap: var(--space-3);
  }

  .table-line {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-end;
    gap: var(--space-3);
  }

  .table-acts {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: var(--space-3);
  }

  .table-list {
    display: grid;
    gap: var(--space-2);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .table-row {
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

  .table-row:hover {
    filter: brightness(1.06);
    box-shadow: var(--rim-thin), inset 0 0 16px 2px var(--shade-hard), 0 0 12px color-mix(in srgb, var(--metal) 35%, transparent);
  }

  .table-row-name {
    min-width: 0;
    font-size: var(--text-sm);
    color: var(--ink);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .table-note {
    margin: 0;
    font-size: var(--text-sm);
    color: var(--ink-dim);
  }

  .table-drop {
    display: grid;
    gap: var(--space-4);
    padding: var(--space-5) var(--space-6) var(--space-6);
  }

  .table-alarm {
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
