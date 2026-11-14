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
    /** Word after the count of a claim's holders. */
    holdersLabel?: string
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
    /** Draws the loading line in place of the sections. */
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
  let opened = $state<Record<string, boolean>>({})
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
    opened = {}
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

{#snippet limb(claim: AccessClaim, depth: number)}
  {@const kids = kidsOf(claim.id)}
  {@const holders = claim.holders ?? []}
  {@const nested = kids.length + holders.length > 0}
  {@const open = nested && Boolean(opened[claim.id])}
  {@const picked = pickedClaims.includes(claim.id)}
  {@const struck = revokedClaims.includes(claim.id)}

  <li class="access-twig">
    <div class="access-row" class:access-row-on={picked} class:access-row-struck={struck} style:--access-depth={depth}>
      {#if nested}
        <button
          type="button"
          class="access-caret"
          class:access-caret-open={open}
          aria-expanded={open}
          aria-label={open ? `Fold ${claim.label}` : `Unfold ${claim.label}`}
          onclick={() => (opened = { ...opened, [claim.id]: !open })}
        ></button>
      {:else}
        <span></span>
      {/if}

      <button type="button" class="access-name" disabled={claim.readonly || busy} aria-pressed={claim.readonly ? undefined : picked} onclick={() => pickClaim(claim)}>
        <span class="access-tile"><Glyph name={claim.glyph ?? 'key'} size="sm" /></span>
        <span class="access-words">
          <span class="access-title">{claim.label}</span>
          {#if claim.meta}<span class="access-meta">{claim.meta}</span>{/if}
        </span>
        {#if isNew(claim)}<span class="access-new">{newLabel}</span>{/if}
      </button>

      <span class="access-cell">
        {#if isHeld(claim) || isNew(claim)}
          <AccessInput value={accessOf(claim)} readonly labels={accessLabels} />
        {/if}
      </span>
      {#if hasVia}<span class="access-cell access-via">{claim.via ?? ''}</span>{/if}
      <span class="access-cell access-holders">{holders.length ? `${holders.length} ${holdersLabel.toLowerCase()}` : ''}</span>
      <span class="access-cell access-picked">
        {#if picked}<Ornament name="quatrefoil" size="xs" tone="ember" />{/if}
      </span>
      <span class="access-cell access-acts">
        {#if canEdit(claim)}
          <IconBtn title={changeAccessLabel} active={editingClaim === claim.id} disabled={busy || struck} onclick={() => (editingClaim = editingClaim === claim.id ? '' : claim.id)}>
            <Glyph name="edit" size="sm" />
          </IconBtn>
          <IconBtn title={struck ? keepLabel : removeClaimLabel} tone={struck ? 'metal' : 'ember'} disabled={busy} onclick={() => revokeClaim(claim)}>
            <Glyph name={struck ? 'revert' : 'remove'} size="sm" />
          </IconBtn>
        {/if}
      </span>
    </div>

    {#if nested}
      <div class="access-nest" use:unfold={open}>
        <ul class="access-limbs">
          {#each kids as kid (kid.id)}
            {@render limb(kid, depth + 1)}
          {/each}
          {#each holders as holder (holder.id)}
            {@const gone = isGone(claim, holder)}
            <li class="access-twig">
              <div class="access-row access-row-holder" class:access-row-struck={gone} style:--access-depth={depth + 1}>
                <span></span>
                <span class="access-name access-name-still">
                  {@render tile(holder)}
                  <span class="access-words">
                    <span class="access-title">{holder.name}</span>
                    {#if holder.email}<span class="access-meta">{holder.email}</span>{/if}
                  </span>
                </span>
                <span class="access-cell"></span>
                {#if hasVia}<span class="access-cell"></span>{/if}
                <span class="access-cell"></span>
                <span class="access-cell"></span>
                <span class="access-cell access-acts">
                  {#if isHeld(claim) && claim.editable}
                    <IconBtn title={gone ? keepLabel : removeHolderLabel} tone={gone ? 'metal' : 'ember'} disabled={busy || struck} onclick={() => revokeHolder(claim, holder)}>
                      <Glyph name={gone ? 'revert' : 'remove'} size="sm" />
                    </IconBtn>
                  {/if}
                </span>
              </div>
            </li>
          {/each}
        </ul>
      </div>
    {/if}
  </li>
{/snippet}

<BaseDialog bind:isOpen {title} width="42rem" zIndex={9999}>
  <div class="access">
    {#if error}
      <p class="access-alarm" role="alert">{error}</p>
    {/if}

    {#if loading}
      <div class="dnd-loading"><span class="dnd-spinner"></span></div>
    {:else}
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
          <div class="access-list dnd-scroll" class:access-list-via={hasVia}>
            {#if roots.length === 0}
              <p class="access-empty">{claimsEmptyMessage}</p>
            {:else}
              <ul class="access-limbs">
                {#each roots as claim (claim.id)}
                  {@render limb(claim, 0)}
                {/each}
              </ul>
            {/if}
          </div>
          {#if editing}
            <div class="access-edit">
              <div class="access-edit-head">
                <span class="dnd-label">{changeAccessLabel}: {editing.label}</span>
                <IconBtn title={collapseLabel} onclick={() => (editingClaim = '')}><Glyph name="fold" size="sm" /></IconBtn>
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
            {#if everyone.length === 0}
              <p class="access-empty">{emptyMessage}</p>
            {:else}
              <div class="access-table">
                <div class="access-table-head">
                  <span></span>
                  <span>{nameLabel}</span>
                  <span>{emailLabel}</span>
                  <span>{roleLabel}</span>
                  <span></span>
                </div>
                {#each everyone as person (person.id)}
                  {@const picked = peopleIds.has(person.id)}
                  <button type="button" class="access-table-row" class:access-row-on={picked} aria-pressed={picked} disabled={busy} onclick={() => togglePerson(person)}>
                    {@render tile(person)}
                    <span class="access-title">{person.name}</span>
                    <span class="access-meta">{person.email ?? ''}</span>
                    <span class="access-meta">{person.role ?? ''}</span>
                    <span class="access-picked">
                      {#if picked}<Ornament name="quatrefoil" size="xs" tone="ember" />{/if}
                    </span>
                  </button>
                {/each}
              </div>
            {/if}
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
        <Button variant="primary" disabled={busy || !ready} loading={busy} onclick={() => onconfirm?.(grant)}>{confirmLabel}</Button>
      </footer>
    {/if}
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
    --access-indent: var(--space-4);
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

  .access-limbs {
    display: grid;
    gap: var(--space-0);
    margin: 0;
    padding: 0;
    min-width: 0;
    list-style: none;
  }

  .access-twig {
    min-width: 0;
  }

  .access-row {
    display: grid;
    grid-template-columns: var(--space-4) minmax(0, 1fr) max-content max-content var(--space-5) max-content;
    align-items: center;
    gap: var(--space-2);
    min-height: var(--space-7);
    padding-inline-start: calc(var(--access-depth) * var(--access-indent));
    border-radius: var(--radius-sm);
    box-shadow: inset 0 0 0 1px transparent;
    transition: background 0.12s ease, box-shadow 0.12s ease;
  }

  .access-list-via .access-row {
    grid-template-columns: var(--space-4) minmax(0, 1fr) max-content max-content max-content var(--space-5) max-content;
  }

  .access-row:hover {
    background: linear-gradient(90deg, color-mix(in srgb, var(--ember) 12%, transparent) 0%, transparent 90%);
  }

  .access-row-on {
    background:
      linear-gradient(90deg, color-mix(in srgb, var(--ember) 20%, transparent) 0%, color-mix(in srgb, var(--ember) 6%, transparent) 100%),
      var(--ground-deep);
    box-shadow: inset 0 0 0 1px var(--metal), inset 0 0 10px var(--ember-glow);
  }

  .access-row-struck .access-title,
  .access-row-struck .access-meta {
    text-decoration: line-through;
    opacity: 0.5;
  }

  .access-caret {
    justify-self: center;
    width: 0;
    height: 0;
    padding: 0;
    border: none;
    border-top: var(--space-1) solid transparent;
    border-bottom: var(--space-1) solid transparent;
    border-inline-start: var(--space-1) solid var(--metal);
    background: none;
    filter: drop-shadow(0 1px 0 var(--shadow-ink));
    cursor: pointer;
    transition: transform 0.15s ease, border-color 0.15s ease;
  }

  .access-caret:hover,
  .access-caret-open {
    border-inline-start-color: var(--metal-bright);
  }

  .access-caret-open {
    transform: rotate(90deg);
  }

  .access-caret:focus-visible {
    outline: none;
    box-shadow: var(--focus-ring);
  }

  .access-name {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    min-width: 0;
    padding: var(--space-1) 0;
    border: none;
    background: none;
    font: inherit;
    text-align: start;
    color: var(--ink);
    cursor: pointer;
  }

  .access-name:disabled {
    cursor: default;
  }

  .access-name-still {
    cursor: default;
  }

  .access-name:focus-visible {
    outline: none;
    box-shadow: var(--focus-ring);
    border-radius: var(--radius-sm);
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

  .access-words {
    display: grid;
    min-width: 0;
  }

  .access-title {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: var(--text-sm);
    color: var(--ink);
  }

  .access-meta {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: var(--text-xs);
    color: var(--ink-faint);
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
    justify-content: flex-end;
    min-width: 0;
    font-size: var(--text-xs);
    color: var(--ink-faint);
  }

  .access-holders,
  .access-via {
    font-family: var(--font-display);
    letter-spacing: var(--tracking-wide);
    white-space: nowrap;
  }

  .access-picked {
    justify-content: center;
  }

  .access-acts {
    gap: var(--space-0);
  }

  .access-nest {
    display: grid;
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

  .access-table {
    display: grid;
    gap: var(--space-0);
  }

  .access-table-head,
  .access-table-row {
    display: grid;
    grid-template-columns: var(--space-6) minmax(0, 2fr) minmax(0, 2fr) minmax(0, 1fr) var(--space-5);
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-1) var(--space-2);
  }

  .access-table-head {
    font-family: var(--font-display);
    font-size: var(--text-xs);
    letter-spacing: var(--tracking-caps);
    text-transform: uppercase;
    color: var(--metal-dim);
    text-shadow: 0 1px 0 var(--shadow-ink);
  }

  .access-table-row {
    width: 100%;
    min-height: var(--space-7);
    border: none;
    border-radius: var(--radius-sm);
    background: none;
    box-shadow: inset 0 0 0 1px transparent;
    font: inherit;
    text-align: start;
    cursor: pointer;
    transition: background 0.12s ease, box-shadow 0.12s ease;
  }

  .access-table-row:hover {
    background: linear-gradient(90deg, color-mix(in srgb, var(--ember) 12%, transparent) 0%, transparent 90%);
  }

  .access-table-row:focus-visible {
    outline: none;
    box-shadow: var(--focus-ring);
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
