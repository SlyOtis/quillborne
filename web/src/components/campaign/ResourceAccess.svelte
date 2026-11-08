<script lang="ts">
  import { getCampaigns, getProfileEmail, getProfiles } from '$lib/api'
  import type { Campaign, Owner } from '$lib/api/types'
  import { user, userProfile } from '$lib/stores/auth.store'
  import { getAll, putOne, RESOURCES, type Resource, type ResourceKind } from '$lib/resources'
  import BaseDialog from '$components/BaseDialog.svelte'
  import Button from '$components/ui/Button.svelte'
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
  let busy = $state<string | null>(null)
  let error = $state<string | null>(null)

  let campaigns = $state<Campaign[]>([])
  let people = $state<Pick[]>([])
  let held = $state<{ kind: ResourceKind; one: Resource }[]>([])

  let who = $state<Pick[]>([])
  let what = $state<Pick[]>([])

  const shape = $derived(RESOURCES[kind])

  const reach = $derived<Pick[]>([
    ...campaigns.map((entry) => ({ id: entry.id, mark: 'campaign', name: entry.name, tone: 'group' as const })),
    ...people
  ])

  const shelf = $derived<Pick[]>(
    held.map((entry) => ({
      id: entry.one.id,
      mark: entry.kind,
      name: entry.one.title,
      word: RESOURCES[entry.kind].word,
      tone: 'thing' as const
    }))
  )

  const changed = $derived(
    what.some((tag) => tag.id !== one.id) ||
      ids(who, 'campaign').join() !== one.share_campaigns.join() ||
      ids(who, 'person').join() !== one.share_users.join()
  )

  function ids(tags: Pick[], mark: string): string[] {
    return tags.filter((tag) => tag.mark === mark).map((tag) => tag.id)
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
        uids.delete($user?.user_id ?? '')
        const profiles = await getProfiles([...uids])
        people = profiles
          .map((entry) => ({ id: entry.user_id, mark: 'person', name: entry.display_name || entry.email, tone: 'person' as const }))
          .sort((a, b) => a.name.localeCompare(b.name))

        who = [
          ...one.share_campaigns.map((id) => ({ id, mark: 'campaign', name: foundCampaigns.find((entry) => entry.id === id)?.name ?? 'A campaign', tone: 'group' as const })),
          ...one.share_users.map((id) => people.find((entry) => entry.id === id) ?? { id, mark: 'person', name: 'Someone', tone: 'person' as const })
        ]
        what = [{ id: one.id, mark: kind, name: one.title, word: shape.word, tone: 'thing' }]
      } catch (reason) {
        error = reason instanceof Error ? reason.message : String(reason)
      } finally {
        loading = false
      }
    })()
  })

  async function mail(address: string) {
    busy = 'mail'
    error = null
    try {
      const found = await getProfileEmail(address)
      if (!found) {
        error = 'Nobody signs in with that address.'
        return
      }
      const tag = { id: found.user_id, mark: 'person', name: found.display_name || found.email, tone: 'person' as const }
      if (!people.some((entry) => entry.id === tag.id)) people = [...people, tag]
      if (!who.some((entry) => entry.id === tag.id)) who = [...who, tag]
    } catch (reason) {
      error = reason instanceof Error ? reason.message : String(reason)
    } finally {
      busy = null
    }
  }

  async function save() {
    busy = 'save'
    error = null
    try {
      const fields = {
        share_campaigns: ids(who, 'campaign'),
        share_users: ids(who, 'person')
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
      busy = null
    }
  }
</script>

<BaseDialog bind:isOpen title="Access" width="560px" zIndex={9999}>
  <div class="grant">
    {#if error}
      <p class="grant-alarm" role="alert">{error}</p>
    {/if}

    {#if loading}
      <div class="dnd-loading"><span class="dnd-spinner"></span></div>
    {:else}
      <p class="grant-lede">You own this {shape.word}. Name who reads it, and what they get.</p>

      <section class="grant-part">
        <Picker
          id="grant-who"
          label="Who reads it"
          note="A campaign, which is everyone at its table, or a person. An address adds someone you have not met."
          picked={who}
          options={reach}
          onchange={(next) => (who = next)}
          more={(asked) => asked.includes('@') && !reach.some((entry) => entry.name.toLowerCase() === asked)}
          onmore={mail}
          disabled={busy !== null}
        />
      </section>

      <section class="grant-part">
        <Picker
          id="grant-what"
          label="What they get"
          note="This {shape.word} and anything else of yours."
          picked={what}
          options={shelf}
          onchange={(next) => (what = next)}
          disabled={busy !== null}
        />
      </section>

      <footer class="grant-foot">
        <Button variant="ghost" disabled={busy !== null} onclick={() => (isOpen = false)}>Cancel</Button>
        <Button variant="primary" disabled={busy !== null || !changed || what.length === 0} onclick={save}>
          Save
        </Button>
      </footer>
    {/if}
  </div>
</BaseDialog>

<style>
  .grant {
    display: grid;
    gap: var(--space-4);
    padding: var(--space-5) var(--space-6) var(--space-6);
  }

  .grant-lede {
    margin: 0;
    font-size: var(--text-sm);
    color: var(--ink-dim);
  }

  .grant-part {
    padding-top: var(--space-4);
    border-top: var(--border-hair) solid var(--metal-dim);
    box-shadow: inset 0 1px 0 var(--keyline);
  }

  .grant-foot {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-3);
    padding-top: var(--space-4);
    border-top: var(--border-hair) solid var(--metal-dim);
  }

  .grant-alarm {
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
