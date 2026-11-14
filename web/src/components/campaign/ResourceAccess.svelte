<script lang="ts">
  import { getCampaigns, getProfileEmail, getProfiles } from '$lib/api'
  import { ACCESS_READ } from '$lib/api/generated_auth'
  import type { Campaign, Owner, Profile } from '$lib/api/types'
  import { user, userProfile } from '$lib/stores/auth.store'
  import { getAll, putOne, RESOURCES, type Resource, type ResourceKind } from '$lib/resources'
  import AccessDialog, { type AccessClaim, type AccessGrant, type AccessPerson } from '$components/AccessDialog.svelte'
  import Picker, { type Pick } from '$components/ui/Picker.svelte'

  let {
    isOpen = $bindable(false),
    owner,
    campaign,
    kind,
    one = $bindable(),
    onChange
  }: {
    /** Whether the dialog is showing. */
    isOpen: boolean
    /** Who the resource belongs to. */
    owner: Owner
    /** The campaign it sits in, when it sits in one. */
    campaign?: Campaign | null
    /** Which roll the resource sits on. */
    kind: ResourceKind
    /** The resource the grant is about. */
    one: Resource
    /** Runs after the grant is written so the page can read the change back. */
    onChange?: () => void
  } = $props()

  let loading = $state(true)
  let busy = $state(false)
  let error = $state<string | null>(null)

  let campaigns = $state<Campaign[]>([])
  let profiles = $state<Profile[]>([])
  let held = $state<{ kind: ResourceKind; one: Resource }[]>([])
  let what = $state<Pick[]>([])

  const shape = $derived(RESOURCES[kind])

  const claims = $derived<AccessClaim[]>(
    campaigns.map((entry) => ({
      id: entry.id,
      label: entry.name,
      glyph: 'campaign',
      word: 'campaign',
      meta: 'The dungeon master and every seated player',
      access: one.share_campaigns.includes(entry.id) ? ACCESS_READ : undefined,
      holders: [entry.dm_id, ...entry.player_ids].map((id) => person(id))
    }))
  )

  const people = $derived<AccessPerson[]>(
    profiles
      .filter((entry) => entry.user_id !== $user?.user_id)
      .map((entry) => person(entry.user_id))
      .sort((a, b) => a.name.localeCompare(b.name))
  )

  const shelf = $derived<Pick[]>(
    held.map((entry) => ({
      id: entry.one.id,
      mark: entry.kind,
      name: entry.one.title,
      word: RESOURCES[entry.kind].word,
      tone: 'thing' as const
    }))
  )

  const pending = $derived(what.some((tag) => tag.id !== one.id))

  function person(id: string, found = profiles.find((entry) => entry.user_id === id)): AccessPerson {
    const runs = campaigns.find((entry) => entry.dm_id === id)
    const seated = campaigns.find((entry) => entry.player_ids.includes(id))
    const role = runs ? `Dungeon master, ${runs.name}` : seated ? `Player, ${seated.name}` : $userProfile?.friends.includes(id) ? 'Friend' : undefined
    return {
      id,
      name: found ? found.display_name || found.email : 'Someone',
      email: found?.email,
      image: found?.photo_url || null,
      role
    }
  }

  $effect(() => {
    if (!isOpen) return

    void (async () => {
      loading = true
      error = null
      try {
        const kinds = Object.keys(RESOURCES) as ResourceKind[]
        const [foundCampaigns, ...rolls] = await Promise.all([
          getCampaigns(),
          ...kinds.map((entry) => getAll(owner, entry).catch(() => [] as Resource[]))
        ])
        campaigns = foundCampaigns
        held = kinds.flatMap((entry, index) =>
          rolls[index].filter((found) => found.owner_id === $user?.user_id).map((found) => ({ kind: entry, one: found }))
        )

        const uids = new Set<string>([
          ...one.share_users,
          ...($userProfile?.friends ?? []),
          ...foundCampaigns.flatMap((entry) => [entry.dm_id, ...entry.player_ids])
        ])
        profiles = await getProfiles([...uids])
        what = [{ id: one.id, mark: kind, name: one.title, word: shape.word, tone: 'thing' }]
      } catch (reason) {
        error = reason instanceof Error ? reason.message : String(reason)
      } finally {
        loading = false
      }
    })()
  })

  async function mail(address: string): Promise<AccessPerson | null> {
    error = null
    try {
      const found = await getProfileEmail(address)
      if (!found) {
        error = 'Nobody signs in with that address.'
        return null
      }
      return person(found.user_id, found)
    } catch (reason) {
      error = reason instanceof Error ? reason.message : String(reason)
      return null
    }
  }

  async function save(grant: AccessGrant) {
    if (what.length === 0) {
      error = `Pick at least one ${shape.word} to write onto.`
      return
    }
    busy = true
    error = null
    try {
      const fields = {
        share_campaigns: grant.claims,
        share_users: grant.people
      }

      for (const tag of what) {
        const found = tag.id === one.id ? { kind, one } : held.find((entry) => entry.one.id === tag.id)
        if (!found) continue
        const merged = { ...found.one, ...fields }
        await putOne(owner, found.kind, found.one.id, merged)
        if (found.one.id === one.id) one = merged
      }
      onChange?.()
      isOpen = false
    } catch (reason) {
      error = reason instanceof Error ? reason.message : String(reason)
    } finally {
      busy = false
    }
  }
</script>

<AccessDialog
  bind:isOpen
  title="Access"
  description="You own this {shape.word}. Name the tables and the people who read it."
  {claims}
  selectedClaims={one.share_campaigns}
  {people}
  selected={one.share_users}
  accessOptions={['read']}
  getPerson={mail}
  {pending}
  claimsLabel="Tables"
  claimsDescription="A campaign's table is its dungeon master and every seated player. Each table named here reads this {shape.word}."
  claimPlaceholder="Type a campaign"
  claimsEmptyMessage="You sit at no table"
  holdersLabel="at the table"
  peopleLabel="Readers"
  peopleDescription="A person named here reads this {shape.word}. An address adds someone you have not met."
  searchPlaceholder="Type a name"
  emptyMessage="Nobody to show"
  confirmLabel="Save"
  {loading}
  {busy}
  {error}
  onconfirm={save}
>
  <Picker
    id="access-what"
    label="What they get"
    note="This {shape.word} and anything else of yours."
    picked={what}
    options={shelf}
    onchange={(next) => (what = next)}
    disabled={busy}
  />
</AccessDialog>
