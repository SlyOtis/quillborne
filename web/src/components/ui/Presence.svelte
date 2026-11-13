<script lang="ts">
  import StoredImage from './StoredImage.svelte'

  const {
    users,
    max = 5
  }: {
    /** The people drawn as overlapping discs, in order. */
    users: PresenceUser[]
    /** How many discs are drawn; the rest collapse into a count. */
    max?: number
  } = $props()

  const shown = $derived(users.slice(0, Math.min(users.length, max)))
  const rest = $derived(Math.max(0, users.length - shown.length))

  function getInitials(name: string): string {
    const parts = name.trim().split(/\s+/)
    const first = parts[0] ?? ''
    if (parts.length === 1) return first.slice(0, 2).toUpperCase()
    const last = parts[parts.length - 1] ?? ''
    return `${first.charAt(0)}${last.charAt(0)}`.toUpperCase()
  }
</script>

<script lang="ts" module>
  export interface PresenceUser {
    /** Unique key of the person. */
    id: string
    /** The name read on hover and cut to initials when there is no picture. */
    name: string
    /** The picture, when the person has one. */
    image?: string
    /** Marks the reader's own disc with the ember ring and names it as theirs. */
    self?: boolean
  }
</script>

<span class="dnd-presence">
  {#each shown as user (user.id)}
    <span class="dnd-presence-item" class:dnd-presence-item-self={user.self} title={user.self ? `${user.name} (you)` : user.name}>
      {#if user.image}
        <StoredImage src={user.image} alt="" />
      {:else}
        <span class="dnd-presence-initials">{getInitials(user.name)}</span>
      {/if}
    </span>
  {/each}
  {#if rest > 0}
    <span class="dnd-presence-item dnd-presence-overflow">+{rest}</span>
  {/if}
</span>

<style>
  .dnd-presence {
    display: inline-flex;
    align-items: center;
    isolation: isolate;
  }

  .dnd-presence-item {
    --presence-ring: var(--metal-dim);
    position: relative;
    display: inline-flex;
    flex: none;
    align-items: center;
    justify-content: center;
    inline-size: var(--space-5);
    block-size: var(--space-5);
    border-radius: var(--radius-pill);
    overflow: hidden;
    background: radial-gradient(circle at 38% 26%, var(--ground-lift) 0%, var(--ground-deep) 84%);
    box-shadow:
      0 0 0 var(--border-hair) var(--keyline),
      0 0 0 calc(var(--border-hair) * 2) var(--presence-ring),
      var(--shadow-sm);
    font-family: var(--font-display);
    font-size: calc(var(--text-xs) * 0.8);
    font-weight: 700;
    letter-spacing: var(--tracking-wide);
    color: var(--metal);
    user-select: none;
  }

  .dnd-presence-item ~ .dnd-presence-item {
    margin-inline-start: calc(var(--space-2) * -1);
  }

  .dnd-presence-item-self {
    --presence-ring: var(--ember);
    z-index: 1;
    color: var(--ember-core);
  }

  .dnd-presence-overflow {
    z-index: 2;
    color: var(--ink);
  }

  .dnd-presence-item :global(img) {
    inline-size: 100%;
    block-size: 100%;
    object-fit: cover;
  }
</style>
