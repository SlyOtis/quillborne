<script lang="ts" module>
  import type { GlyphName } from '$components/ui/Glyph.svelte'

  export type AccessPerson = {
    /** Identity carried for a chosen person. */
    id: string
    /** Full name written in the name column. */
    name: string
    /** Address written in the second column. */
    email?: string
    /** Standing written in the third column. */
    role?: string
    /** Portrait drawn in the tile. */
    image?: string | null
  }

  export type AccessClaim = {
    /** Identity carried for a chosen claim. */
    id: string
    /** Name written on the chip and in the tree. */
    label: string
    /** Glyph drawn on its tile in the tree. */
    glyph?: GlyphName
    /** The word written on its chip before the name, as Picker writes it. */
    word?: string
    /** What the claim gives, written under the name. */
    meta?: string
    /** Parent claim in the tree; a claim whose parent is missing is a root. */
    parentId?: string | null
    /** Claimius access mask the claim gives on the object; set on a claim the object holds, absent on one it does not. */
    access?: number
    /** How the claim reaches the object, such as direct or inherited. */
    via?: string
    /** People holding the claim, listed as its child rows. */
    holders?: AccessPerson[]
    /** Offers change access and the removals on this claim and its holders. */
    editable?: boolean
    /** Lists the claim with its access and holders but never picks it. */
    readonly?: boolean
  }

  export type AccessChange = {
    /** Claim whose access on the object is set. */
    claim: string
    /** Claimius access mask the claim gets on the object. */
    access: number
  }

  export type AccessRevoke = {
    /** Claim taken off the object, or the claim a person is taken off. */
    claim: string
    /** Holder taken off the claim; absent when the claim leaves the object. */
    person?: string
  }

  export type AccessGrant = {
    /** Claims the people are given. */
    claims: string[]
    /** People the claims land on. */
    people: string[]
    /** Access each claim gets on the object, for every held claim whose access changed and every picked claim it did not hold. */
    access: AccessChange[]
    /** Claims taken off the object, and people taken off a held claim. */
    revoked: AccessRevoke[]
  }
</script>

<script lang="ts">
  import type { Snippet } from 'svelte'
  import { ACCESS_READ } from '$lib/api/generated_auth'
  import { unfold } from '$lib/unfold'
  import BaseDialog from '$components/BaseDialog.svelte'
  import AccessInput, { type AccessLabels, type AccessOption } from '$components/ui/AccessInput.svelte'
  import Button from '$components/ui/Button.svelte'
  import Glyph from '$components/ui/Glyph.svelte'
  import IconBtn from '$components/ui/IconBtn.svelte'
  import Ornament from '$components/ui/Ornament.svelte'
  import Picker, { type Pick } from '$components/ui/Picker.svelte'
  import StoredImage from '$components/ui/StoredImage.svelte'
  import Table, { type TableColumn, type TableRow } from '$components/ui/Table.svelte'
  import Tree, { type TreeColumn, type TreeRow } from '$components/ui/Tree.svelte'

  let {
    isOpen = $bindable(false),
    claims = [],
    selectedClaims = [],
    people = [],
    selected = [],
    access = ACCESS_READ,
    accessOptions = ['read', 'execute', 'write', 'owner', 'member', 'deny'],
    accessLabels = {},
    getPerson,
    pending = false,
    title = 'Access',
    description = 'Share through claims that decide who reads it.',
    holdersLabel = 'Holders',
    accessLabel = 'Access',
    viaLabel = 'Via',
    newLabel = 'New',
    changeAccessLabel = 'Change access',
    removeClaimLabel = 'Take the claim off this object',
    removeHolderLabel = 'Take the person off the claim',
    keepLabel = 'Keep',
    claimsLabel = 'Claim',
    claimsDescription = 'What the people get.',
    claimPlaceholder = 'Type a claim',
    claimsEmptyMessage = 'No claims to show',
    peopleLabel = 'Person',
    peopleDescription = 'Who gets the claims.',
    searchPlaceholder = 'Type a name',
    emptyMessage = 'No people to show',
    addressLabel = 'Add',
    expandLabel = 'Show the full list',
    collapseLabel = 'Hide the full list',
    nameLabel = 'Name',
    emailLabel = 'Email',
    roleLabel = 'Role',
    confirmLabel = 'Give access',
    cancelLabel = 'Cancel',
    loading = false,
    busy = false,
    error = null,
    onconfirm,
    children
  }: {
    /** Whether the dialog is showing. */
    isOpen: boolean
    /** Claims the dialog lists and picks from, as chips and in the one claims tree, each with its access on the object and its holders when the object holds it. */
    claims?: AccessClaim[]
    /** Claims chosen when the dialog opens. */
    selectedClaims?: string[]
    /** People the people field offers and its table lists. */
    people?: AccessPerson[]
    /** People chosen when the dialog opens. */
    selected?: string[]
    /** Claimius access mask a newly picked claim starts on. */
    access?: number
    /** Choices the access selector offers. */
    accessOptions?: AccessOption[]
    /** Text and descriptions of the access selector, merged over its English defaults. */
    accessLabels?: Partial<AccessLabels>
    /** Resolves an address typed in the people field that matches nobody listed; the person it answers joins the list and is picked. */
    getPerson?: (address: string) => Promise<AccessPerson | null>
    /** Set when the host's own section holds a change, so the confirming button is ready. */
    pending?: boolean
    /** Dialog heading. */
    title?: string
    /** Sentence under the heading saying what the dialog does. */
    description?: string
    /** Header of the holders column. */
    holdersLabel?: string
    /** Header of the access column. */
    accessLabel?: string
    /** Header of the via column. */
    viaLabel?: string
    /** Tag on a picked claim the object does not hold yet. */
    newLabel?: string
    /** Tooltip of the button editing a claim's access on the object. */
    changeAccessLabel?: string
    /** Tooltip of the button taking a claim off the object. */
    removeClaimLabel?: string
    /** Tooltip of the button taking a holder off a claim. */
    removeHolderLabel?: string
    /** Tooltip of the button undoing a removal. */
    keepLabel?: string
    /** Heading over the claims field. */
    claimsLabel?: string
    /** Line under the claims heading. */
    claimsDescription?: string
    /** Hint in the empty claims field. */
    claimPlaceholder?: string
    /** Text shown when there is no claim to list. */
    claimsEmptyMessage?: string
    /** Heading over the people field. */
    peopleLabel?: string
    /** Line under the people heading. */
    peopleDescription?: string
    /** Hint in the empty people field. */
    searchPlaceholder?: string
    /** Text shown when the people table holds no rows. */
    emptyMessage?: string
    /** Word before a typed address on the row that resolves it. */
    addressLabel?: string
    /** Tooltip of a collapsed list toggle. */
    expandLabel?: string
    /** Tooltip of an expanded list toggle. */
    collapseLabel?: string
    /** Header of the name column. */
    nameLabel?: string
    /** Header of the email column. */
    emailLabel?: string
    /** Header of the role column. */
    roleLabel?: string
    /** Label of the confirming button. */
    confirmLabel?: string
    /** Label of the dismissing button. */
    cancelLabel?: string
    /** Draws the loading line in the claims list and the people table in place of their rows. */
    loading?: boolean
    /** Blocks both buttons while the host writes the grant. */
    busy?: boolean
    /** The host's error, written at the head. */
    error?: string | null
    /** Runs with the grant when the confirming button is pressed; the host writes it and closes. */
    onconfirm?: (grant: AccessGrant) => void
    /** The host's own section, drawn after the people. */
    children?: Snippet
  } = $props()

  let pickedClaims = $state<string[]>([])
  let pickedPeople = $state<AccessPerson[]>([])
  let known = $state<AccessPerson[]>([])
  let accessEdits = $state<Record<string, number>>({})
  let revokedClaims = $state<string[]>([])
  let revokedHolders = $state<AccessRevoke[]>([])
  let editingClaim = $state('')
  let claimsOpen = $state(false)
  let peopleOpen = $state(false)
  let claimQuery = $state('')
  let peopleQuery = $state('')
  let looking = $state(false)

  $effect(() => {
    if (!isOpen) return
    pickedClaims = selectedClaims.filter((id) => claims.some((claim) => claim.id === id && !claim.readonly))
    pickedPeople = people.filter((person) => selected.includes(person.id))
    known = []
    accessEdits = {}
    revokedClaims = []
    revokedHolders = []
    editingClaim = ''
    claimQuery = ''
    peopleQuery = ''
  })

  const everyone = $derived([...people, ...known])
  const pickable = $derived(selectedClaims.filter((id) => claims.some((claim) => claim.id === id && !claim.readonly)))
  const hasVia = $derived(claims.some((claim) => Boolean(claim.via)))
  const roots = $derived(claims.filter((claim) => !claim.parentId || !claims.some((other) => other.id === claim.parentId)))

  const claimChips = $derived<Pick[]>(
    pickedClaims
      .map((id) => claims.find((claim) => claim.id === id))
      .filter((claim): claim is AccessClaim => Boolean(claim))
      .map((claim) => ({ id: claim.id, mark: 'claim', name: claim.label, word: claim.word, tone: 'group' as const }))
  )
  const claimOptions = $derived<Pick[]>(
    claims.filter((claim) => !claim.readonly).map((claim) => ({ id: claim.id, mark: 'claim', name: claim.label, word: claim.word, tone: 'group' as const }))
  )
  const peopleChips = $derived<Pick[]>(pickedPeople.map((person) => ({ id: person.id, mark: 'person', name: person.name, tone: 'person' as const })))
  const peopleOptions = $derived<Pick[]>(everyone.map((person) => ({ id: person.id, mark: 'person', name: person.name, tone: 'person' as const })))
  const peopleIds = $derived(new Set(pickedPeople.map((person) => person.id)))

  const accessChanges = $derived<AccessChange[]>(
    claims
      .filter((claim) => !revokedClaims.includes(claim.id))
      .filter((claim) => (isHeld(claim) ? accessOf(claim) !== claim.access : pickedClaims.includes(claim.id)))
      .map((claim) => ({ claim: claim.id, access: accessOf(claim) }))
  )
  const revokes = $derived<AccessRevoke[]>([
    ...revokedClaims.map((claim) => ({ claim })),
    ...revokedHolders.filter((entry) => !revokedClaims.includes(entry.claim))
  ])
  const grant = $derived<AccessGrant>({
    claims: [...pickedClaims],
    people: pickedPeople.map((person) => person.id),
    access: accessChanges,
    revoked: revokes
  })
  const ready = $derived(
    pending ||
      accessChanges.length > 0 ||
      revokes.length > 0 ||
      !same(pickedClaims, pickable) ||
      !same(pickedPeople.map((person) => person.id), selected)
  )
  const editing = $derived(claims.find((claim) => claim.id === editingClaim) ?? null)

  const limbs = $derived<TreeRow[]>(roots.map(limbOf))
  const claimColumns = $derived<TreeColumn[]>([
    { key: 'name', label: claimsLabel, width: 'minmax(8em, 5fr)' },
    { key: 'access', label: accessLabel, width: 'minmax(4em, 3fr)' },
    ...(hasVia ? [{ key: 'via', label: viaLabel, width: 'minmax(4em, 1fr)' }] : []),
    { key: 'holders', label: holdersLabel, width: 'minmax(4em, 2fr)' },
    { key: 'picked', label: '', width: 'var(--space-5)' },
    { key: 'actions', label: '', width: 'calc(var(--space-6) * 2)' }
  ])
  const peopleColumns = $derived<TableColumn[]>([
    { key: 'avatar', label: '', width: 'var(--space-6)' },
    { key: 'name', label: nameLabel, width: 'minmax(4em, 2fr)', sortable: true },
    { key: 'email', label: emailLabel, width: 'minmax(4em, 2fr)' },
    { key: 'role', label: roleLabel, width: 'minmax(4em, 2fr)' },
    { key: 'picked', label: '', width: 'var(--space-5)' }
  ])
  const peopleRows = $derived<TableRow[]>(
    everyone
      .filter((person) => [person.name, person.email ?? '', person.role ?? ''].some((text) => text.toLowerCase().includes(peopleQuery.trim().toLowerCase())))
      .map((person) => ({ ...person }))
  )

  function limbOf(claim: AccessClaim): TreeRow {
    return {
      id: claim.id,
      title: claim.label,
      mark: claim.meta,
      glyph: claim.glyph ?? 'key',
      struck: revokedClaims.includes(claim.id),
      claim,
      kids: [
        ...kidsOf(claim.id).map(limbOf),
        ...(claim.holders ?? []).map((holder) => ({
          id: `${claim.id}:${holder.id}`,
          title: holder.name,
          mark: holder.email,
          glyph: 'user' as const,
          struck: isGone(claim, holder),
          claim,
          holder
        }))
      ]
    }
  }

  function claimOf(row: TreeRow): AccessClaim {
    return row.claim as AccessClaim
  }

  function holderOf(row: TreeRow): AccessPerson | null {
    return (row.holder as AccessPerson | undefined) ?? null
  }

  function pressClaim(id: string) {
    const claim = claims.find((entry) => entry.id === id)
    if (claim && !busy) pickClaim(claim)
  }

  function pressPerson(row: TableRow) {
    const person = everyone.find((entry) => entry.id === row.id)
    if (person && !busy) togglePerson(person)
  }

  function same(a: string[], b: string[]): boolean {
    return a.length === b.length && a.every((id) => b.includes(id))
  }

  function kidsOf(id: string): AccessClaim[] {
    return claims.filter((claim) => claim.parentId === id)
  }

  function isHeld(claim: AccessClaim): boolean {
    return claim.access !== undefined
  }

  function isNew(claim: AccessClaim): boolean {
    return !isHeld(claim) && pickedClaims.includes(claim.id)
  }

  function accessOf(claim: AccessClaim): number {
    return accessEdits[claim.id] ?? claim.access ?? access
  }

  function canEdit(claim: AccessClaim): boolean {
    return isNew(claim) || (isHeld(claim) && Boolean(claim.editable))
  }

  function isGone(claim: AccessClaim, holder: AccessPerson): boolean {
    return revokedClaims.includes(claim.id) || revokedHolders.some((entry) => entry.claim === claim.id && entry.person === holder.id)
  }

  function setClaims(next: Pick[]) {
    pickedClaims = next.map((tag) => tag.id)
    if (editing && !canEdit(editing)) editingClaim = ''
  }

  function pickClaim(claim: AccessClaim) {
    if (claim.readonly) return
    if (pickedClaims.includes(claim.id)) {
      pickedClaims = pickedClaims.filter((id) => id !== claim.id)
      if (editingClaim === claim.id) editingClaim = ''
    } else {
      pickedClaims = [...pickedClaims, claim.id]
    }
  }

  function revokeClaim(claim: AccessClaim) {
    if (!isHeld(claim)) {
      pickClaim(claim)
      return
    }
    revokedClaims = revokedClaims.includes(claim.id) ? revokedClaims.filter((id) => id !== claim.id) : [...revokedClaims, claim.id]
    if (editingClaim === claim.id) editingClaim = ''
  }

  function revokeHolder(claim: AccessClaim, holder: AccessPerson) {
    const held = revokedHolders.some((entry) => entry.claim === claim.id && entry.person === holder.id)
    revokedHolders = held
      ? revokedHolders.filter((entry) => !(entry.claim === claim.id && entry.person === holder.id))
      : [...revokedHolders, { claim: claim.id, person: holder.id }]
  }

  function setPeople(next: Pick[]) {
    pickedPeople = next.map((tag) => everyone.find((person) => person.id === tag.id) ?? { id: tag.id, name: tag.name })
  }

  function togglePerson(person: AccessPerson) {
    pickedPeople = peopleIds.has(person.id) ? pickedPeople.filter((entry) => entry.id !== person.id) : [...pickedPeople, person]
  }

  function unlisted(asked: string): boolean {
    return (
      Boolean(getPerson) &&
      asked.includes('@') &&
      !everyone.some((person) => person.name.toLowerCase() === asked || person.email?.toLowerCase() === asked)
    )
  }

  async function address(asked: string) {
    if (!getPerson) return
    looking = true
    try {
      const found = await getPerson(asked)
      if (!found) return
      if (!everyone.some((person) => person.id === found.id)) known = [...known, found]
      if (!peopleIds.has(found.id)) pickedPeople = [...pickedPeople, found]
    } finally {
      looking = false
    }
  }
</script>

{#snippet tile(person: AccessPerson)}
  <span class="access-tile access-tile-round">
    {#if person.image}
      <StoredImage src={person.image} alt={person.name} />
    {:else}
      {person.name.charAt(0).toUpperCase()}
    {/if}
  </span>
{/snippet}

{#snippet claimCell(key: string, row: TreeRow)}
  {@const claim = claimOf(row)}
  {@const holder = holderOf(row)}
  {@const struck = revokedClaims.includes(claim.id)}
  {#if key === 'access'}
    {#if !holder && (isHeld(claim) || isNew(claim))}
      <span class="access-cell" class:access-cell-struck={struck}>
        {#if isNew(claim)}<span class="access-new">{newLabel}</span>{/if}
        <AccessInput value={accessOf(claim)} readonly labels={accessLabels} />
      </span>
    {/if}
  {:else if key === 'via'}
    {holder ? '' : (claim.via ?? '')}
  {:else if key === 'holders'}
    {holder || !claim.holders?.length ? '' : claim.holders.length}
  {:else if key === 'picked'}
    <span class="access-cell access-picked">
      {#if !holder && pickedClaims.includes(claim.id)}<Ornament name="quatrefoil" size="xs" tone="ember" />{/if}
    </span>
  {:else if key === 'actions'}
    <span class="access-cell access-acts">
      {#if holder}
        {#if isHeld(claim) && claim.editable}
          {@const gone = isGone(claim, holder)}
          <IconBtn title={gone ? keepLabel : removeHolderLabel} tone={gone ? 'metal' : 'ember'} disabled={busy || struck} onclick={() => revokeHolder(claim, holder)}>
            <Glyph name={gone ? 'revert' : 'remove'} size="sm" />
          </IconBtn>
        {/if}
      {:else if canEdit(claim)}
        <IconBtn title={changeAccessLabel} active={editingClaim === claim.id} disabled={busy || struck} onclick={() => (editingClaim = editingClaim === claim.id ? '' : claim.id)}>
          <Glyph name="edit" size="sm" />
        </IconBtn>
        <IconBtn title={struck ? keepLabel : removeClaimLabel} tone={struck ? 'metal' : 'ember'} disabled={busy} onclick={() => revokeClaim(claim)}>
          <Glyph name={struck ? 'revert' : 'remove'} size="sm" />
        </IconBtn>
      {/if}
    </span>
  {/if}
{/snippet}

{#snippet personCell(key: string, row: TableRow)}
  {#if key === 'avatar'}
    {@render tile({ id: row.id, name: String(row.name ?? ''), image: row.image ? String(row.image) : null })}
  {:else if key === 'picked'}
    <span class="access-cell access-picked">
      {#if peopleIds.has(row.id)}<Ornament name="quatrefoil" size="xs" tone="ember" />{/if}
    </span>
  {:else}
    <span class="access-text" title={String(row[key] ?? '')}>{String(row[key] ?? '')}</span>
  {/if}
{/snippet}

<BaseDialog bind:isOpen {title} width="42rem" zIndex={9999}>
  <div class="access">
    {#if error}
      <p class="access-alarm" role="alert">{error}</p>
    {/if}

    <p class="access-lede">{description}</p>

    <section class="access-part">
      <div class="access-head">
        <Picker
          id="access-claims"
          label={claimsLabel}
          note={claimsDescription}
          picked={claimChips}
          options={claimOptions}
          onchange={setClaims}
          onquery={(asked) => (claimQuery = asked)}
          placeholder={claimPlaceholder}
          disabled={busy}
        />
        <span class="access-tools">
          {#if pickedClaims.length}<span class="access-count">{pickedClaims.length}</span>{/if}
          <IconBtn title={claimsOpen ? collapseLabel : expandLabel} active={claimsOpen} onclick={() => (claimsOpen = !claimsOpen)}>
            <Glyph name={claimsOpen ? 'fold' : 'unfold'} size="sm" />
          </IconBtn>
        </span>
      </div>

      <div class="access-fold" use:unfold={claimsOpen}>
        <div class="access-list dnd-scroll">
          {#if loading}
            <div class="dnd-loading"><span class="dnd-spinner"></span></div>
          {:else if roots.length === 0}
            <p class="access-empty">{claimsEmptyMessage}</p>
          {:else}
            <Tree rows={limbs} columns={claimColumns} search={claimQuery} onopen={pressClaim} cell={claimCell} />
          {/if}
        </div>
        {#if editing}
          <div class="access-edit">
            <div class="access-edit-head">
              <span class="dnd-label">{changeAccessLabel}: {editing.label}</span>
              <IconBtn title={collapseLabel} onclick={() => (editingClaim = '')}><Glyph name="check" size="sm" /></IconBtn>
            </div>
            <AccessInput
              value={accessOf(editing)}
              options={accessOptions}
              labels={accessLabels}
              layout="inline"
              disabled={busy}
              onchange={(next) => (accessEdits = { ...accessEdits, [editing.id]: next })}
            />
          </div>
        {/if}
      </div>
    </section>

    <section class="access-part">
      <div class="access-head">
        <Picker
          id="access-people"
          label={peopleLabel}
          note={peopleDescription}
          picked={peopleChips}
          options={peopleOptions}
          onchange={setPeople}
          onquery={(asked) => (peopleQuery = asked)}
          more={unlisted}
          onmore={address}
          moreWord={addressLabel}
          placeholder={searchPlaceholder}
          disabled={busy || looking}
        />
        <span class="access-tools">
          {#if pickedPeople.length}<span class="access-count">{pickedPeople.length}</span>{/if}
          <IconBtn title={peopleOpen ? collapseLabel : expandLabel} active={peopleOpen} onclick={() => (peopleOpen = !peopleOpen)}>
            <Glyph name={peopleOpen ? 'fold' : 'unfold'} size="sm" />
          </IconBtn>
        </span>
      </div>

      <div class="access-fold" use:unfold={peopleOpen}>
        <div class="access-list dnd-scroll">
          <Table columns={peopleColumns} rows={peopleRows} selectedIds={peopleIds} {loading} {emptyMessage} onrow={pressPerson} cell={personCell} />
        </div>
      </div>
    </section>

    {#if children}
      <section class="access-part">
        {@render children()}
      </section>
    {/if}

    <footer class="access-foot">
      <Button variant="ghost" disabled={busy} onclick={() => (isOpen = false)}>{cancelLabel}</Button>
      <Button variant="primary" disabled={busy || loading || !ready} loading={busy} onclick={() => onconfirm?.(grant)}>{confirmLabel}</Button>
    </footer>
  </div>
</BaseDialog>

<style>
  .access {
    display: grid;
    gap: var(--space-4);
    padding: var(--space-5) var(--space-6) var(--space-6);
  }

  .access-lede {
    margin: 0;
    font-size: var(--text-sm);
    color: var(--ink-dim);
  }

  .access-part {
    display: grid;
    gap: var(--space-3);
    padding-top: var(--space-4);
    border-top: var(--border-hair) solid var(--metal-dim);
    box-shadow: inset 0 1px 0 var(--keyline);
  }

  .access-head {
    display: grid;
    grid-template-columns: minmax(0, 1fr) max-content;
    align-items: start;
    gap: var(--space-3);
  }

  .access-tools {
    display: flex;
    align-items: center;
    gap: var(--space-1);
  }

  .access-count {
    display: inline-grid;
    place-items: center;
    min-width: var(--space-5);
    padding: 0 var(--space-2);
    border-radius: var(--radius-pill);
    background:
      linear-gradient(180deg, color-mix(in srgb, var(--ember) 18%, transparent), transparent),
      var(--texture-noise),
      var(--ground-deep);
    box-shadow: inset 0 0 0 1px var(--metal-dim), 0 0 0 1px var(--keyline);
    font-family: var(--font-figures);
    font-size: var(--text-xs);
    font-weight: 700;
    color: var(--metal-bright);
    text-shadow: 0 1px 0 var(--shadow-ink);
  }

  .access-fold {
    display: grid;
    gap: var(--space-3);
  }

  .access-list {
    max-height: calc(var(--space-8) * 4);
    padding: var(--space-2);
    border: var(--border-hair) solid var(--metal-dim);
    border-radius: var(--radius-sm);
    background: var(--texture-noise), linear-gradient(180deg, var(--ground-deep) 0%, var(--ground) 100%);
    box-shadow: var(--bevel-down), inset 0 3px 8px var(--shade-hard);
    overflow-y: auto;
  }

  .access-empty {
    margin: 0;
    padding: var(--space-3);
    font-size: var(--text-sm);
    font-style: italic;
    color: var(--ink-faint);
    text-align: center;
  }

  .access-tile {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex: none;
    width: var(--space-6);
    height: var(--space-6);
    overflow: hidden;
    border-radius: var(--radius-sm);
    background:
      linear-gradient(180deg, color-mix(in srgb, var(--stone-light) 20%, transparent), color-mix(in srgb, var(--shadow-ink) 45%, transparent)),
      var(--texture-noise),
      var(--stone);
    box-shadow: var(--bevel-up), 0 0 0 1px var(--keyline), inset 0 0 0 1px var(--metal-dim);
    font-family: var(--font-display);
    font-size: var(--text-sm);
    font-weight: 700;
    color: var(--metal);
    text-shadow: 0 1px 0 var(--shadow-ink);
  }

  .access-tile-round {
    border-radius: var(--radius-pill);
  }

  .access-tile :global(img) {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .access-new {
    flex: none;
    padding: 0 var(--space-2);
    border-radius: var(--radius-sm);
    background: color-mix(in srgb, var(--ember) 16%, transparent);
    box-shadow: inset 0 0 0 1px var(--metal-dim);
    font-family: var(--font-display);
    font-size: var(--text-xs);
    letter-spacing: var(--tracking-wide);
    text-transform: uppercase;
    color: var(--ember-core);
  }

  .access-cell {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    min-width: 0;
  }

  .access-cell-struck {
    text-decoration: line-through;
    opacity: 0.5;
  }

  .access-text {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .access-picked {
    justify-content: center;
  }

  .access-acts {
    justify-content: flex-end;
    gap: var(--space-0);
    height: var(--space-6);
  }

  .access-edit {
    display: grid;
    gap: var(--space-2);
  }

  .access-edit-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
  }

  .access-foot {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-3);
    padding-top: var(--space-4);
    border-top: var(--border-hair) solid var(--metal-dim);
  }

  .access-alarm {
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
