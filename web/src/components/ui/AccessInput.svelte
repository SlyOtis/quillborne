<script lang="ts" module>
  import { ACCESS_DENY, ACCESS_EXECUTE, ACCESS_MEMBER, ACCESS_OWNER, ACCESS_READ, ACCESS_WRITE } from '$lib/api/generated_auth'
  import type { GlyphName } from './Glyph.svelte'

  export type AccessOption = 'read' | 'execute' | 'write' | 'owner' | 'member' | 'deny'
  export type AccessText = { label: string; description: string }
  export type AccessLabels = Record<AccessOption | 'grant', AccessText> & { none?: AccessText }
  export type AccessVariant = 'tags' | 'text'

  type Verb = 'read' | 'execute' | 'write' | 'owner'
  type Segment = { value: string; label: string; description: string; glyph: GlyphName; tone: 'metal' | 'bane' }

  const WORDS: Required<AccessLabels> = {
    grant: { label: 'Grant', description: 'Gives the access chosen below' },
    deny: { label: 'Deny', description: 'Takes the access chosen below away from what other claims give' },
    read: { label: 'Read', description: 'View only' },
    execute: { label: 'Execute', description: 'Use and view' },
    write: { label: 'Write', description: 'Modify and use' },
    owner: { label: 'Owner', description: 'Full control' },
    member: { label: 'Member', description: 'Counts as a member' },
    none: { label: 'None', description: 'No access' }
  }

  const VERBS: { verb: Verb; bit: number; glyph: GlyphName }[] = [
    { verb: 'read', bit: ACCESS_READ, glyph: 'reveal' },
    { verb: 'execute', bit: ACCESS_EXECUTE, glyph: 'play' },
    { verb: 'write', bit: ACCESS_WRITE, glyph: 'edit' },
    { verb: 'owner', bit: ACCESS_OWNER, glyph: 'gem' }
  ]

  const STRENGTH: Verb[] = ['owner', 'write', 'execute', 'read']

  const EXPANDS: Record<Verb, Verb[]> = {
    owner: ['owner', 'write', 'execute', 'read'],
    write: ['write', 'execute', 'read'],
    execute: ['execute', 'read'],
    read: ['read']
  }

  const WRITTEN: { bit: number; key: Verb | 'deny' }[] = [
    { bit: ACCESS_OWNER, key: 'owner' },
    { bit: ACCESS_WRITE, key: 'write' },
    { bit: ACCESS_READ, key: 'read' },
    { bit: ACCESS_EXECUTE, key: 'execute' },
    { bit: ACCESS_DENY, key: 'deny' }
  ]

  function bitOf(verb: Verb): number {
    return VERBS.find((entry) => entry.verb === verb)?.bit ?? 0
  }
</script>

<script lang="ts">
  import Glyph from './Glyph.svelte'

  let {
    value = $bindable(ACCESS_READ),
    options = ['read', 'execute', 'write', 'owner', 'member', 'deny'],
    labels = {},
    layout = 'stack',
    disabled = false,
    readonly = false,
    variant = 'tags',
    separator = ', ',
    onchange
  }: {
    /** The claimius access mask: owner 1, write 2, read 4, execute 8, deny 16, member 32. */
    value?: number | null
    /** The choices offered, in the order read, execute, write, owner; member adds the member toggle and deny the grant or deny switch. */
    options?: AccessOption[]
    /** Text and description for each choice, merged over the English defaults. */
    labels?: Partial<AccessLabels>
    /** Stack puts the glyph, the label and the description in a column; inline lays each segment out as one row and drops the descriptions. */
    layout?: 'stack' | 'inline'
    /** Dims the selector and blocks every segment. */
    disabled?: boolean
    /** Renders the mask instead of the selector, as variant draws it. */
    readonly?: boolean
    /** Tags draws the readonly mask as chips; text writes the label of each set bit joined by separator. */
    variant?: AccessVariant
    /** Text placed between two labels in the text variant. */
    separator?: string
    /** Runs with the new mask whenever a segment changes it. */
    onchange?: (value: number) => void
  } = $props()

  const text = $derived<Required<AccessLabels>>({ ...WORDS, ...labels })
  const mask = $derived(value ?? 0)
  const denying = $derived((mask & ACCESS_DENY) !== 0)
  const member = $derived((mask & ACCESS_MEMBER) !== 0)
  const held = $derived(STRENGTH.filter((verb) => (mask & bitOf(verb)) !== 0))
  const verb = $derived<Verb>(held[0] ?? 'read')

  const offered = $derived(VERBS.filter((entry) => options.includes(entry.verb)))
  const offersMember = $derived(options.includes('member'))
  const offersDeny = $derived(options.includes('deny'))

  function segment(key: AccessOption | 'grant', glyph: GlyphName, tone: 'metal' | 'bane' = 'metal'): Segment {
    return { value: key, label: text[key].label, description: text[key].description, glyph, tone }
  }

  const modes = $derived([segment('grant', 'key'), segment('deny', 'conceal', 'bane')])
  const verbs = $derived(offered.map((entry) => segment(entry.verb, entry.glyph, denying ? 'bane' : 'metal')))
  const members = $derived([segment('member', 'group')])

  function grantMask(next: Verb, withMember: boolean): number {
    return EXPANDS[next].reduce((sum, part) => sum | bitOf(part), withMember ? ACCESS_MEMBER : 0)
  }

  function denyMask(parts: Verb[]): number {
    return parts.reduce((sum, part) => sum | bitOf(part), ACCESS_DENY)
  }

  function set(next: number) {
    value = next
    onchange?.(next)
  }

  function setMode(values: string[]) {
    const next = values[0]
    if (next === 'deny' && !denying) set(denyMask(held))
    if (next === 'grant' && denying) set(grantMask(verb, false))
  }

  function setVerb(values: string[]) {
    const next = values[0] as Verb | undefined
    if (next) set(grantMask(next, member))
  }

  function setDenied(values: string[]) {
    set(denyMask(STRENGTH.filter((part) => values.includes(part))))
  }

  function setMember(values: string[]) {
    set(grantMask(verb, values.includes('member')))
  }

  const deniedText = $derived(held.slice().reverse().map((part) => text[part].label).join(', '))
  const written = $derived.by(() => {
    const active = WRITTEN.filter(({ bit }) => (mask & bit) !== 0).map(({ key }) => text[key].label)
    return active.length ? active.join(separator) : text.none.label
  })
  const strongest = $derived(VERBS.find((entry) => entry.verb === held[0]) ?? null)
</script>

{#snippet group(segments: Segment[], chosen: string[], mode: 'single' | 'multiple', part: string, pick: (values: string[]) => void)}
  <div class="dnd-accessinput-group dnd-accessinput-{part}" role="group">
    {#each segments as entry (entry.value)}
      {@const on = chosen.includes(entry.value)}
      <button
        type="button"
        class="dnd-accessinput-segment dnd-accessinput-{entry.tone}"
        class:dnd-accessinput-on={on}
        aria-pressed={on}
        {disabled}
        onclick={() => pick(mode === 'single' ? [entry.value] : on ? chosen.filter((value) => value !== entry.value) : [...chosen, entry.value])}
      >
        {#if mode === 'multiple'}
          <span class="dnd-accessinput-check" aria-hidden="true"></span>
        {/if}
        <Glyph name={entry.glyph} size="sm" />
        <span class="dnd-accessinput-label">{entry.label}</span>
        {#if layout === 'stack'}
          <span class="dnd-accessinput-description">{entry.description}</span>
        {/if}
      </button>
    {/each}
  </div>
{/snippet}

<div
  class="dnd-accessinput dnd-accessinput-{layout}"
  class:dnd-accessinput-readonly={readonly}
  class:dnd-accessinput-deny={denying}
  class:dnd-accessinput-with-member={offersMember && !denying}
  class:dnd-accessinput-disabled={disabled}
>
  {#if readonly && variant === 'text'}
    <span class="dnd-accessinput-written" class:dnd-accessinput-written-deny={denying} class:dnd-accessinput-written-none={!mask}>{written}</span>
  {:else if readonly}
    <span class="dnd-accessinput-tags">
      {#if denying}
        <span class="dnd-accessinput-tag dnd-accessinput-tag-deny"><Glyph name="conceal" size="sm" />{deniedText ? `${text.deny.label}: ${deniedText}` : text.deny.label}</span>
      {:else if strongest}
        <span class="dnd-accessinput-tag dnd-accessinput-tag-{strongest.verb}"><Glyph name={strongest.glyph} size="sm" />{text[strongest.verb].label}</span>
      {/if}
      {#if member}
        <span class="dnd-accessinput-tag dnd-accessinput-tag-member"><Glyph name="group" size="sm" />{text.member.label}</span>
      {/if}
    </span>
  {:else}
    {#if offersDeny}
      {@render group(modes, [denying ? 'deny' : 'grant'], 'single', 'mode', setMode)}
    {/if}
    <div class="dnd-accessinput-row">
      {#if denying}
        {@render group(verbs, held, 'multiple', 'verbs', setDenied)}
      {:else}
        {@render group(verbs, [verb], 'single', 'verbs', setVerb)}
        {#if offersMember}
          {@render group(members, member ? ['member'] : [], 'multiple', 'member', setMember)}
        {/if}
      {/if}
    </div>
  {/if}
</div>

<style>
  .dnd-accessinput {
    display: grid;
    gap: var(--space-2);
    min-width: 0;
    container: accessinput / inline-size;
  }

  .dnd-accessinput-readonly {
    display: inline-flex;
    container: none;
  }

  .dnd-accessinput-disabled {
    opacity: 0.5;
  }

  .dnd-accessinput-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: var(--space-2);
    min-width: 0;
  }

  .dnd-accessinput-with-member .dnd-accessinput-row {
    grid-template-columns: minmax(0, 4fr) minmax(0, 1fr);
  }

  @container accessinput (width < 28rem) {
    .dnd-accessinput-with-member .dnd-accessinput-row {
      grid-template-columns: minmax(0, 1fr);
    }
  }

  .dnd-accessinput-group {
    display: grid;
    grid-auto-flow: column;
    grid-auto-columns: 1fr;
    gap: var(--space-0);
    padding: var(--space-0);
    border: var(--border-hair) solid var(--metal-dim);
    border-radius: var(--radius-sm);
    background: var(--texture-noise), linear-gradient(180deg, var(--ground-deep) 0%, var(--ground) 100%);
    box-shadow: var(--bevel-down), inset 0 3px 8px var(--shade-hard), 0 0 0 1px var(--keyline);
  }

  .dnd-accessinput-segment {
    display: grid;
    justify-items: center;
    align-content: center;
    gap: var(--space-0);
    min-width: 0;
    padding: var(--space-2);
    border: none;
    border-radius: var(--radius-sm);
    background: none;
    box-shadow: inset 0 0 0 1px transparent;
    color: var(--ink-dim);
    cursor: pointer;
    transition: background 0.15s ease, box-shadow 0.15s ease, color 0.15s ease;
  }

  .dnd-accessinput-inline .dnd-accessinput-segment {
    grid-auto-flow: column;
    justify-content: center;
    gap: var(--space-2);
    padding: var(--space-1) var(--space-2);
  }

  .dnd-accessinput-segment:hover:not(:disabled):not(.dnd-accessinput-on) {
    background: linear-gradient(180deg, color-mix(in srgb, var(--ember) 10%, transparent), transparent);
    color: var(--metal-bright);
  }

  .dnd-accessinput-segment:disabled {
    cursor: not-allowed;
  }

  .dnd-accessinput-segment:focus-visible {
    outline: none;
    box-shadow: var(--focus-ring);
  }

  .dnd-accessinput-on {
    background:
      linear-gradient(180deg, color-mix(in srgb, var(--ember) 20%, transparent) 0%, color-mix(in srgb, var(--ember) 6%, transparent) 100%),
      var(--texture-noise),
      var(--ground-deep);
    box-shadow: inset 0 0 0 1px var(--metal), inset 0 0 10px var(--ember-glow);
    color: var(--metal-bright);
    text-shadow: var(--glow-text);
  }

  .dnd-accessinput-bane.dnd-accessinput-on {
    background:
      linear-gradient(180deg, color-mix(in srgb, var(--state-bad) 24%, transparent) 0%, color-mix(in srgb, var(--state-bad) 8%, transparent) 100%),
      var(--texture-noise),
      var(--ground-deep);
    box-shadow: inset 0 0 0 1px var(--state-bad), inset 0 0 10px color-mix(in srgb, var(--state-bad) 45%, transparent);
    color: var(--ink);
    text-shadow: 0 1px 0 #000, 0 0 6px color-mix(in srgb, var(--state-bad) 60%, transparent);
  }

  .dnd-accessinput-label {
    font-family: var(--font-display);
    font-size: var(--text-xs);
    font-weight: 700;
    letter-spacing: var(--tracking-caps);
    text-transform: uppercase;
    line-height: 1.3;
  }

  .dnd-accessinput-description {
    font-size: var(--text-xs);
    line-height: 1.3;
    color: var(--ink-faint);
    text-align: center;
    text-shadow: none;
  }

  .dnd-accessinput-on .dnd-accessinput-description {
    color: var(--ink-dim);
  }

  .dnd-accessinput-check {
    width: var(--space-2);
    height: var(--space-2);
    margin-bottom: var(--space-0);
    transform: rotate(45deg);
    border: var(--border-hair) solid var(--metal-dim);
    background: var(--ground-deep);
    box-shadow: 0 0 0 1px var(--keyline);
    transition: background 0.15s ease, border-color 0.15s ease;
  }

  .dnd-accessinput-inline .dnd-accessinput-check {
    margin-bottom: 0;
  }

  .dnd-accessinput-on .dnd-accessinput-check {
    border-color: var(--metal-bright);
    background: linear-gradient(135deg, var(--metal-bright), var(--metal-dim));
  }

  .dnd-accessinput-bane.dnd-accessinput-on .dnd-accessinput-check {
    border-color: var(--state-bad);
    background: linear-gradient(135deg, var(--ink), var(--state-bad));
  }

  .dnd-accessinput-tags {
    display: inline-flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-1);
    min-width: 0;
  }

  .dnd-accessinput-tag {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    --tag-rim: var(--metal-dim);
    padding: 0 var(--space-2) 0 var(--space-1);
    border: var(--border-hair) solid var(--tag-rim);
    border-radius: var(--radius-sm);
    background:
      linear-gradient(180deg, color-mix(in srgb, var(--stone-light) 18%, transparent) 0%, color-mix(in srgb, #000 50%, transparent) 60%, color-mix(in srgb, #000 68%, transparent) 100%),
      var(--texture-noise),
      var(--stone);
    box-shadow: var(--bevel-up), 0 0 0 1px var(--keyline);
    font-family: var(--font-display);
    font-size: var(--text-xs);
    letter-spacing: var(--tracking-wide);
    color: var(--ink);
    text-shadow: 0 1px 0 #000;
    white-space: nowrap;
  }

  .dnd-accessinput-tag-read {
    --tag-rim: var(--metal);
  }

  .dnd-accessinput-tag-execute {
    --tag-rim: var(--state-good);
  }

  .dnd-accessinput-tag-write {
    --tag-rim: var(--verdigris);
  }

  .dnd-accessinput-tag-owner {
    --tag-rim: var(--ember);
  }

  .dnd-accessinput-tag-member {
    --tag-rim: var(--metal-bright);
  }

  .dnd-accessinput-tag-deny {
    --tag-rim: var(--state-bad);
  }

  .dnd-accessinput-written {
    color: var(--ink);
  }

  .dnd-accessinput-written-deny {
    color: var(--state-bad);
  }

  .dnd-accessinput-written-none {
    color: var(--ink-faint);
  }
</style>
