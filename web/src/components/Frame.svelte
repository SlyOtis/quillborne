<script lang="ts">
  import { setContext, tick, type Snippet } from 'svelte'
  import { navigate, resolvedRoute } from 'sly-svelte-location-router'
  import { getCampaigns, getCharacters, getProfiles } from '$lib/api'
  import type { Profile } from '$lib/api/types'
import { user, userProfile } from '$lib/stores/auth.store'
import { currentCampaignId, userCampaigns } from '$lib/stores/campaign.store'
import { currentCharacterId, userCharacters } from '$lib/stores/character.store'
  import { anyDialogOpen, uiStore, menuOpen, menuView, chatOpen, shell } from '$lib/stores/ui.store'
  import { getClock, playNext, playPrev, playing, progress, seekSong, toggleSong, track } from '$lib/music'
  import Aura from '$components/ui/Aura.svelte'
  import Crest from '$components/ui/Crest.svelte'
    import Flame from '$components/ui/Flame.svelte'
  import Glass from '$components/ui/Glass.svelte'
  import Sigil from '$components/ui/Sigil.svelte'
  import Sidebar from '$components/ui/Sidebar.svelte'
  import Glyph from '$components/ui/Glyph.svelte'
  import IconBtn from '$components/ui/IconBtn.svelte'
  import Presence, { type PresenceUser } from '$components/ui/Presence.svelte'
  import StoredImage from '$components/ui/StoredImage.svelte'
import Toast from '$components/ui/Toast.svelte'
  import MenuPanel from '$components/MenuPanel.svelte'
  import Chat from '$chat/Chat.svelte'

  const { children }: { children?: Snippet } = $props()

  setContext('dialogState', {
    get isAnyDialogOpen() {
      return $anyDialogOpen
    },
    setDialogState: uiStore.setDialogState
  })

  const character = $derived($userCharacters.find((one) => one.id === ($currentCharacterId ?? $userProfile?.preferences?.active_characters?.[$currentCampaignId ?? $userCampaigns[0]?.id ?? ''] ?? $userProfile?.preferences?.recent_characters?.[0])) ?? null)
  const campaign = $derived($userCampaigns.find((one) => one.id === ($currentCampaignId ?? character?.campaign_id)) ?? null)
  const onSheet = $derived(Boolean(character) && $resolvedRoute.path === `/main/character/${character?.id}`)
  const seats = $derived(campaign ? [campaign.dm_id, ...campaign.player_ids.filter((id) => id !== campaign.dm_id)] : [])
  let profiles = $state<Record<string, Profile>>({})
  const members = $derived<PresenceUser[]>(
    seats.map((id) => ({
      id,
      name: profiles[id]?.display_name || profiles[id]?.email || 'A player',
      image: profiles[id]?.photo_url || undefined,
      self: id === $user?.user_id
    }))
  )
  let canBack = $state(true)
  let canForward = $state(true)
  let toolsOpen = $state(false)
  let stackEl = $state<HTMLElement | null>(null)
  let shellEl = $state<HTMLElement | null>(null)
  let dropLeft = $state(0)

  $effect(() => {
    $resolvedRoute.path
    toolsOpen = false
  })

  $effect(() => {
    const ids = seats
    if (ids.length === 0) return
    void getProfiles(ids)
      .then((held) => {
        profiles = Object.fromEntries(held.map((one) => [one.user_id, one]))
      })
      .catch(() => {})
  })

  $effect(() => {
    if (!('navigation' in window)) return
    const read = () => {
      canBack = navigation.canGoBack
      canForward = navigation.canGoForward
    }
    read()
    navigation.addEventListener('currententrychange', read)
    return () => navigation.removeEventListener('currententrychange', read)
  })

  function openCharacter() {
    if (!character) {
      navigate('/main/create/character')
      return
    }
    if (onSheet && $shell.tools) {
      dropLeft = stackEl && shellEl ? stackEl.getBoundingClientRect().left - shellEl.getBoundingClientRect().left : 0
      toolsOpen = !toolsOpen
      return
    }
    navigate(`/main/character/${character.id}`)
  }
  let loadedFor = ''

  $effect(() => {
    const userId = $user?.user_id ?? ''
    if (!userId || userId === loadedFor) return
    loadedFor = userId
    if ($userCampaigns.length === 0) void getCampaigns().then((held) => userCampaigns.set(held)).catch(() => {})
    if ($userCharacters.length === 0) void getCharacters().then((held) => userCharacters.set(held)).catch(() => {})
  })

  let scroller = $state<HTMLDivElement | null>(null)
  let path = ''

  $effect(() => {
    const next = $resolvedRoute.path
    if (next === path) return
    path = next
    if (location.hash) return
    void tick().then(() => scroller?.scrollTo({ top: 0 }))
  })

  function reach() {
    const mark = location.hash.slice(1)
    if (!mark) return
    requestAnimationFrame(() => {
      document.getElementById(mark)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }

  $effect(() => {
    reach()
  })

  function closeTools(event: PointerEvent) {
    if (!toolsOpen) return
    const target = event.target as Element | null
    if (target?.closest('.dnd-shell-drop') || target?.closest('.dnd-shell-chip-round')) return
    toolsOpen = false
  }

  function stepDrawers(event: KeyboardEvent) {
    if (!event.shiftKey || !(event.metaKey || event.ctrlKey) || !$shell.drawers) return

    if (event.key.toLowerCase() === 'c') {
      event.preventDefault()
      uiStore.toggleChat()
      return
    }

    if (event.key.toLowerCase() !== 's') return

    event.preventDefault()
    uiStore.toggleMenu()
  }
</script>

<svelte:window onkeydown={stepDrawers} onhashchange={reach} onpointerdown={closeTools} />

<main
  class="dnd-shell"
  bind:this={shellEl}
  class:dnd-shell-menu-open={$shell.drawers && $menuOpen}
  class:dnd-shell-chat-open={$shell.drawers && $chatOpen}
>
  <header class="dnd-shell-bar">
    <span class="dnd-shell-handle dnd-shell-handle-start">
      {#if $shell.drawers}
        <Sigil title="Toggle the menu" size="sm" active={$menuOpen} onclick={uiStore.toggleMenu}>
          <Glyph name="menu" size="sm" />
        </Sigil>
      {/if}
      <Sigil title="Back" size="sm" disabled={!canBack} onclick={() => history.back()}>
        <Glyph name="back" size="sm" />
      </Sigil>
      <Sigil title="Forward" size="sm" disabled={!canForward} onclick={() => history.forward()}>
        <Glyph name="forward" size="sm" />
      </Sigil>
    </span>

    <button type="button" class="dnd-shell-handle" title="Home" onclick={() => navigate('/main')}>
      <Crest lit={$resolvedRoute.path === '/main'} />
    </button>

    {#if $shell.nav}
      <nav class="dnd-shell-nav" aria-label="Page">{@render $shell.nav()}</nav>
    {/if}

    <span class="dnd-shell-run" aria-hidden="true"></span>

    {#if campaign}
      <Presence users={members} onclick={(one) => navigate(`/main/player/${one.id}`)} />
    {/if}

    <span class="dnd-shell-stack" bind:this={stackEl}>
      <button type="button" class="dnd-shell-chip dnd-shell-chip-round" title={character ? (onSheet ? "Open the sheet's tools" : `Open ${character.metadata.name}`) : 'Forge a character'} aria-expanded={onSheet ? toolsOpen : undefined} onclick={openCharacter}>
        <span class="dnd-shell-chip-plate"></span>
        <span class="dnd-shell-chip-face">
          {#if character?.character?.info?.imageUrl}
            <StoredImage src={character.character.info.imageUrl} alt="" />
          {:else if character}
            <span class="dnd-shell-chip-initial">{character.metadata.name.charAt(0).toUpperCase()}</span>
          {:else}
            <span class="dnd-shell-chip-initial"><Glyph name="character" size="sm" /></span>
          {/if}
        </span>
        <span class="dnd-shell-chip-lines">
          <span class="dnd-shell-chip-name">{character?.metadata.name ?? 'No character chosen'}</span>
          <span class="dnd-shell-chip-mail">{character ? `Level ${character.metadata.level} ${character.metadata.race} ${character.metadata.class}` : 'Character'}</span>
        </span>
      </button>
      <button type="button" class="dnd-shell-chip" title={campaign ? `Open ${campaign.name}` : 'Raise a campaign'} onclick={() => navigate(campaign ? `/main/campaign/${campaign.id}` : '/main/create/campaign')}>
        <span class="dnd-shell-chip-plate"></span>
        <span class="dnd-shell-chip-face">
          {#if campaign}
            <span class="dnd-shell-chip-initial">{campaign.name.charAt(0).toUpperCase()}</span>
          {:else}
            <span class="dnd-shell-chip-initial"><Glyph name="campaign" size="sm" /></span>
          {/if}
        </span>
        <span class="dnd-shell-chip-lines">
          <span class="dnd-shell-chip-name">{campaign?.name ?? 'No campaign'}</span>
          <span class="dnd-shell-chip-mail">Campaign</span>
        </span>
      </button>

    </span>

    {#if $shell.drawers}
      <span class="dnd-shell-handle">
        <Sigil title="Toggle the chat" size="sm" active={$chatOpen} onclick={uiStore.toggleChat}>
          <Glyph name="chat" size="sm" />
        </Sigil>
      </span>
    {/if}
  </header>

  {#if toolsOpen && $shell.tools}
    <div class="dnd-shell-drop" role="group" aria-label="The sheet's tools" style:--drop-left="{dropLeft}px">{@render $shell.tools()}</div>
  {/if}

  {#if $track}
    <div class="dnd-shell-player" aria-label="Now playing">
      <span class="dnd-shell-player-acts">
        <IconBtn title="Previous" onclick={() => void playPrev()}>
          <Glyph name="prev" size="sm" />
        </IconBtn>
        <IconBtn title={$playing ? 'Pause' : 'Play'} tone="ember" onclick={toggleSong}>
          <Glyph name={$playing ? 'pause' : 'play'} size="sm" />
        </IconBtn>
        <IconBtn title="Next" onclick={() => void playNext()}>
          <Glyph name="next" size="sm" />
        </IconBtn>
      </span>
      <span class="dnd-shell-player-lines">
        <span class="dnd-shell-player-name">{$track.title}</span>
        <input
          class="dnd-shell-player-seek"
          type="range"
          min="0"
          max={$progress.length || 0}
          step="0.5"
          value={$progress.at}
          aria-label="Seek"
          oninput={(event) => seekSong(Number(event.currentTarget.value))}
        />
        <span class="dnd-shell-player-time">{getClock($progress.at)} / {getClock($progress.length)}</span>
      </span>
      {#if $shell.drawers}
        <span class="dnd-shell-player-acts">
          <IconBtn title="Open the playlist" active={$menuOpen && $menuView === 'music'} onclick={uiStore.openMusic}>
            <Glyph name="music" size="sm" />
          </IconBtn>
        </span>
      {/if}
    </div>
  {/if}

  <Sidebar side="start" open={$shell.drawers && $menuOpen} run="var(--size-menu-max)" edge="none"><MenuPanel /></Sidebar>
  <span class="dnd-shell-stud dnd-shell-stud-start" aria-hidden="true"></span>

  <div class="dnd-shell-content">
    {#if $shell.backdrop}
      <span class="dnd-shell-ground" aria-hidden="true">{@render $shell.backdrop()}</span>
    {/if}

    <div class="dnd-scroll dnd-shell-scroll" class:dnd-shell-scroll-flush={$shell.flush} bind:this={scroller}>
      {#if !$shell.backdrop}
        <span class="dnd-shell-veil" aria-hidden="true">
          <span class="dnd-shell-window"><Glass size="xl" /></span>
          <span class="dnd-shell-lantern dnd-shell-lantern-start"><Flame size="sm" intensity="steady" sconce hung /></span>
          <span class="dnd-shell-lantern dnd-shell-lantern-end"><Flame size="sm" intensity="calm" sconce hung /></span>
          <Aura variant="veil" tone="ember" />
          <Aura variant="motes" tone="ember" density="normal" />
        </span>
      {/if}

      {#if $shell.crown}
        <div class="dnd-shell-crown">{@render $shell.crown()}</div>
      {/if}

      {#if $shell.band}
        <div class="dnd-shell-band">{@render $shell.band()}</div>
      {/if}

      <div class="dnd-shell-hold dnd-shell-hold-{$shell.width}" class:dnd-shell-hold-flush={$shell.flush}>
        {@render children?.()}
      </div>
    </div>
  </div>

  <Sidebar side="end" open={$shell.drawers && $chatOpen} run="var(--size-chat-max)" edge="none"><Chat /></Sidebar>
  <span class="dnd-shell-stud dnd-shell-stud-end" aria-hidden="true"></span>
  <Toast />
</main>

<style>
  .dnd-shell {
    position: relative;
    width: 100%;
    height: 100%;
    display: grid;
    grid-template-columns: var(--shell-menu) 1fr var(--shell-chat);
    grid-template-rows: var(--size-bar) 1fr;
    grid-template-areas:
      'topbar topbar topbar'
      'menu content chat';
    overflow: hidden;
    transition: grid-template-columns 250ms ease-in-out;
    background:
      var(--texture-stars),
      var(--texture-noise),
      linear-gradient(180deg, var(--ground-raised) 0%, var(--ground-deep) 100%);
    --shell-menu: 0px;
    --shell-chat: 0px;
    --size-menu-max: 400px;
    --size-chat-max: 400px;
  }

  .dnd-shell-menu-open {
    --shell-menu: var(--size-menu-max);
  }

  .dnd-shell-chat-open {
    --shell-chat: var(--size-chat-max);
  }

  .dnd-shell-bar {
    position: relative;
    grid-area: topbar;
    display: flex;
    align-items: center;
    gap: var(--space-3);
    height: var(--size-bar);
    padding: 0 var(--space-5);
    background: linear-gradient(180deg, var(--ground-deep) 0%, var(--ground) 70%, var(--ground-raised) 100%);
    z-index: 20;
  }

  .dnd-shell-bar::before {
    content: '';
    position: absolute;
    inset-block-end: 0;
    inset-inline: 0;
    block-size: calc(var(--size-bar) * 0.09);
    pointer-events: none;
    background:
      linear-gradient(90deg, transparent 2%, var(--metal-dim) 2% 98%, transparent 98%) 0 0 / 100% var(--border-hair) no-repeat,
      linear-gradient(90deg, var(--metal-dim), var(--metal) 8% 92%, var(--metal-dim)) 0 100% / 100% var(--border-hair) no-repeat;
  }

  .dnd-shell-handle > :global(.dnd-crest) {
    block-size: calc(var(--size-bar) * 0.92);
  }

  .dnd-shell-player {
    --player-seek: calc(var(--space-8) * 2);
    --player-name: calc(var(--space-8) * 2.5);
    grid-area: topbar;
    justify-self: end;
    align-self: center;
    z-index: 21;
    display: flex;
    align-items: center;
    gap: var(--space-3);
    height: calc(var(--size-bar) - var(--space-4));
    margin-inline-end: calc(50% + var(--size-bar) * 0.75);
    padding: 0 var(--space-3);
    background: none;
  }

  .dnd-shell-player-acts {
    display: flex;
    flex: none;
    align-items: center;
    height: var(--space-6);
  }

  .dnd-shell-player-lines {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    grid-template-areas:
      'name time'
      'seek seek';
    align-items: center;
    column-gap: var(--space-3);
    min-width: 0;
  }

  .dnd-shell-player-name {
    grid-area: name;
    max-width: var(--player-name);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-family: var(--font-display);
    font-size: var(--text-xs);
    font-weight: 600;
    letter-spacing: var(--tracking-wide);
    color: var(--metal-bright);
  }

  .dnd-shell-player-time {
    grid-area: time;
    font-family: var(--font-figures);
    font-size: var(--text-xs);
    color: var(--ink-faint);
    white-space: nowrap;
  }

  .dnd-shell-player-seek {
    grid-area: seek;
    width: 100%;
    min-width: var(--player-seek);
    height: var(--space-2);
    margin: 0;
    accent-color: var(--metal);
    cursor: pointer;
  }

  .dnd-shell-drop {
    --drop-tail: var(--space-5);
    position: absolute;
    inset-block-start: var(--size-bar);
    inset-inline-start: var(--drop-left);
    z-index: 19;
    transform-origin: top center;
    animation: drop-roll 220ms cubic-bezier(0.16, 1, 0.3, 1);
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: 0;
    min-inline-size: calc(var(--space-8) * 3);
    padding: var(--space-2) var(--space-2) calc(var(--drop-tail) + var(--space-2));
    background:
      linear-gradient(var(--metal), var(--metal)) 0 100% / 100% var(--border-hair) no-repeat,
      linear-gradient(90deg, var(--metal-dim), var(--metal) 50%, var(--metal-dim)) 0 0 / 100% var(--border-hair) no-repeat,
      var(--texture-weave),
      var(--texture-noise),
      radial-gradient(ellipse 80% 40% at 50% 0%, color-mix(in srgb, var(--ember-glow) 25%, transparent) 0%, transparent 70%),
      linear-gradient(180deg, color-mix(in srgb, var(--state-bad) 38%, var(--ground)) 0%, color-mix(in srgb, var(--state-bad) 26%, var(--ground-deep)) 100%);
    border-inline: var(--border-hair) solid var(--metal);
    clip-path: polygon(0 0, 100% 0, 100% calc(100% - var(--drop-tail)), 50% 100%, 0 calc(100% - var(--drop-tail)));
    filter: drop-shadow(0 var(--space-4) var(--space-5) var(--shade-hard)) drop-shadow(0 var(--space-2) var(--space-3) var(--shade-hard)) drop-shadow(0 0 var(--space-1) var(--shade-hard));
  }

  @keyframes drop-roll {
    from {
      scale: 1 0;
      opacity: 0.6;
    }
    to {
      scale: 1 1;
      opacity: 1;
    }
  }

  .dnd-shell-drop > :global(*) {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    padding-block: var(--space-1);
  }

  .dnd-shell-tools {
    display: flex;
    flex: 0 1 auto;
    min-width: 0;
    align-items: center;
    gap: var(--space-2);
    overflow-x: auto;
    overflow-y: hidden;
    scrollbar-width: none;
  }

  .dnd-shell-tools::-webkit-scrollbar {
    display: none;
  }

  .dnd-shell-handle {
    display: flex;
    flex: none;
    align-items: center;
    gap: var(--space-2);
    padding: 0;
    border: none;
    border-radius: var(--radius-sm);
    background: none;
    color: inherit;
  }

  .dnd-shell-handle-start > :global(.dnd-sigil-active) {
    animation: dnd-lit 5.5s ease-in-out infinite alternate;
  }

  .dnd-shell-handle-start > :global(.dnd-sigil-active .dnd-sigil-trace) {
    animation: dnd-spin 9s linear infinite;
  }

  button.dnd-shell-handle {
    cursor: pointer;
  }

  button.dnd-shell-handle:focus-visible {
    outline: none;
    box-shadow: var(--focus-ring);
  }

  .dnd-shell-nav {
    display: flex;
    flex: 20 1 0;
    min-width: 0;
    height: 100%;
    align-items: center;
    gap: var(--space-2);
    padding-inline-start: var(--space-4);
    background: linear-gradient(180deg, transparent 25%, var(--metal-dim) 50%, transparent 75%) 0 0 / var(--border-hair) 100% no-repeat;
  }

  .dnd-shell-run {
    flex: 1 1 0;
    min-width: var(--space-4);
  }

  .dnd-shell-stack {
    display: flex;
    flex: none;
    align-items: center;
    min-width: 0;
  }

  .dnd-shell-stack > .dnd-shell-chip {
    position: relative;
  }

  .dnd-shell-stack > .dnd-shell-chip-round {
    z-index: 0;
    margin-inline-end: calc((var(--chip-tail) + var(--space-4)) * -1);
    padding-inline-end: calc(var(--chip-tail) + var(--space-6));
    scale: 0.95;
    transform-origin: center right;
  }

  .dnd-shell-stack > .dnd-shell-chip:last-child {
    z-index: 1;
    filter: drop-shadow(calc(var(--space-1) * -1) 0 var(--space-2) var(--shade-hard));
  }

  .dnd-shell-stack > .dnd-shell-chip-round::before,
  .dnd-shell-stack > .dnd-shell-chip-round > .dnd-shell-chip-plate {
    clip-path: inset(0 round var(--radius-md) 0 0 var(--radius-md));
  }

  .dnd-shell-chip {
    --chip-tail: 0.9em;
    --chip-quatrefoil: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Cpath d='M28 28A22 22 0 0 1 46.18 6.33L50 1l3.82 5.33A22 22 0 0 1 72 28 22 22 0 0 1 93.67 46.18L99 50l-5.33 3.82A22 22 0 0 1 72 72 22 22 0 0 1 53.82 93.67L50 99l-3.82-5.33A22 22 0 0 1 28 72 22 22 0 0 1 6.33 53.82L1 50l5.33-3.82A22 22 0 0 1 28 28Z'/%3E%3C/svg%3E");
    position: relative;
    isolation: isolate;
    display: flex;
    flex: none;
    align-items: center;
    gap: var(--space-2);
    max-width: var(--size-chip-max);
    padding: var(--space-1) calc(var(--chip-tail) + var(--space-3)) var(--space-1) 0;
    background: none;
    border: none;
    cursor: pointer;
    text-align: start;
    transition: filter 0.15s ease;
  }

  .dnd-shell-chip::before,
  .dnd-shell-chip-plate {
    content: '';
    position: absolute;
    z-index: -1;
    clip-path: polygon(0 0, 100% 0, calc(100% - var(--chip-tail)) 50%, 100% 100%, 0 100%);
    pointer-events: none;
  }

  .dnd-shell-chip::before {
    inset: 0 0 0 calc(var(--size-face) / 2);
    background: linear-gradient(180deg, var(--metal-bright) 0%, var(--metal) 55%, var(--metal-dim) 100%);
  }

  .dnd-shell-chip-plate {
    inset: var(--border-hair) var(--border-hair) var(--border-hair) calc(var(--size-face) / 2 + var(--border-hair));
    background:
      linear-gradient(var(--metal-dim), var(--metal-dim)) 0 0.22em / calc(100% - var(--chip-tail)) var(--border-hair) no-repeat,
      linear-gradient(var(--metal-dim), var(--metal-dim)) 0 calc(100% - 0.22em) / calc(100% - var(--chip-tail)) var(--border-hair) no-repeat,
      linear-gradient(180deg, var(--ground-deep) 0%, var(--ground) 100%);
  }

  .dnd-shell-chip:hover {
    filter: drop-shadow(0 0 0.35rem var(--ember-glow));
  }

  .dnd-shell-chip:hover .dnd-shell-chip-name {
    color: var(--metal-bright);
  }

  .dnd-shell-chip:focus-visible {
    outline: none;
    border-radius: var(--radius-sm);
    box-shadow: var(--focus-ring);
  }

  .dnd-shell-chip-face {
    position: relative;
    display: flex;
    flex: none;
    align-items: center;
    justify-content: center;
    width: var(--size-face);
    height: var(--size-face);
    background: linear-gradient(180deg, var(--metal-bright) 0%, var(--metal) 55%, var(--metal-dim) 100%);
    -webkit-mask: var(--chip-quatrefoil) center / 100% 100% no-repeat;
    mask: var(--chip-quatrefoil) center / 100% 100% no-repeat;
  }

  .dnd-shell-chip-face::before,
  .dnd-shell-chip-face :global(img) {
    -webkit-mask: var(--chip-quatrefoil) center / calc(100% - 2 * var(--border-hair)) calc(100% - 2 * var(--border-hair)) no-repeat;
    mask: var(--chip-quatrefoil) center / calc(100% - 2 * var(--border-hair)) calc(100% - 2 * var(--border-hair)) no-repeat;
  }

  .dnd-shell-chip-face::before {
    content: '';
    position: absolute;
    inset: 0;
    background: radial-gradient(circle at 50% 40%, var(--ground-lift) 0%, var(--ground-deep) 80%);
  }

  .dnd-shell-chip-face :global(img) {
    position: relative;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .dnd-shell-chip-initial {
    position: relative;
    font-family: var(--font-display);
    font-size: var(--text-md);
    font-weight: 700;
    line-height: 1;
    color: var(--metal-bright);
  }

  .dnd-shell-chip-lines {
    display: flex;
    flex-direction: column;
    min-width: 0;
    line-height: 1.15;
  }

  .dnd-shell-chip-name {
    font-family: var(--font-display);
    font-size: var(--text-sm);
    font-weight: 600;
    letter-spacing: var(--tracking-wide);
    color: var(--ink);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .dnd-shell-chip-mail {
    font-family: var(--font-body);
    font-size: var(--text-xs);
    font-style: italic;
    color: var(--ink-faint);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .dnd-shell-content {
    grid-area: content;
    position: relative;
    display: flex;
    flex-direction: column;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
    z-index: 11;
    container: shell / inline-size;
    background:
      var(--texture-noise),
      var(--backdrop);
    transition: box-shadow 250ms ease-in-out;
  }

  .dnd-shell-content::before,
  .dnd-shell-content::after {
    content: '';
    position: absolute;
    z-index: 5;
    border: var(--border-hair) solid transparent;
    pointer-events: none;
    transition: border-color 250ms ease-in-out;
  }

  .dnd-shell-content::after {
    inset: 0;
  }

  .dnd-shell-content::before {
    inset: var(--space-1);
  }

  .dnd-shell-menu-open > .dnd-shell-content,
  .dnd-shell-chat-open > .dnd-shell-content {
    box-shadow: 0 0 var(--space-6) var(--shade-hard);
  }

  .dnd-shell-menu-open > .dnd-shell-content::after {
    border-inline-start-color: var(--metal);
  }

  .dnd-shell-menu-open > .dnd-shell-content::before {
    border-inline-start-color: var(--metal-dim);
  }

  .dnd-shell-chat-open > .dnd-shell-content::after {
    border-inline-end-color: var(--metal);
  }

  .dnd-shell-chat-open > .dnd-shell-content::before {
    border-inline-end-color: var(--metal-dim);
  }

  .dnd-shell-stud {
    grid-area: content;
    align-self: center;
    z-index: 12;
    inline-size: var(--space-3);
    block-size: var(--space-3);
    background:
      linear-gradient(135deg, var(--metal-bright), var(--metal) 50%, var(--metal-dim)) center / 45% 45% no-repeat,
      var(--ground-deep);
    border: var(--border-hair) solid var(--metal);
    box-shadow: var(--glow-metal);
    opacity: 0;
    pointer-events: none;
    transition: opacity 250ms ease-in-out;
  }

  .dnd-shell-stud-start {
    justify-self: start;
    transform: translateX(-50%) rotate(45deg);
  }

  .dnd-shell-stud-end {
    justify-self: end;
    transform: translateX(50%) rotate(45deg);
  }

  .dnd-shell-menu-open > .dnd-shell-stud-start,
  .dnd-shell-chat-open > .dnd-shell-stud-end {
    opacity: 1;
  }

  .dnd-shell-ground {
    position: absolute;
    inset: 0;
    z-index: 0;
    overflow: hidden;
    pointer-events: none;
  }

  .dnd-shell-veil {
    position: absolute;
    inset-block-start: 0;
    inset-inline: 0;
    block-size: 100%;
    z-index: -1;
    overflow: hidden;
    pointer-events: none;
    -webkit-mask-image: linear-gradient(180deg, black 60%, transparent 100%);
    mask-image: linear-gradient(180deg, black 60%, transparent 100%);
    background:
      var(--texture-motes),
      radial-gradient(ellipse 22% 38% at 6% 22%, color-mix(in srgb, var(--ember) 24%, transparent) 0%, transparent 70%),
      radial-gradient(ellipse 22% 38% at 94% 22%, color-mix(in srgb, var(--ember) 24%, transparent) 0%, transparent 70%),
      radial-gradient(ellipse 45% 55% at 50% 45%, color-mix(in srgb, var(--ember-glow) 30%, transparent) 0%, transparent 75%),
      radial-gradient(ellipse 90% 70% at 50% 50%, transparent 55%, color-mix(in srgb, var(--ground-deep) 85%, transparent) 100%);
  }

  .dnd-shell-window {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%) scale(1.35);
    opacity: 0.12;
    filter: sepia(0.6) saturate(0.7);
  }

  .dnd-shell-lantern {
    position: absolute;
    top: 14%;
    opacity: 0.4;
  }

  .dnd-shell-lantern-start {
    left: clamp(var(--space-1), 1.5cqi, var(--space-5));
  }

  .dnd-shell-lantern-end {
    right: clamp(var(--space-1), 1.5cqi, var(--space-5));
  }

  .dnd-shell-crown {
    position: relative;
    width: 100%;
    padding: var(--space-6) var(--space-6) var(--space-4);
  }

  .dnd-shell-band {
    position: sticky;
    top: 0;
    z-index: 3;
    width: 100%;
  }

  .dnd-shell-scroll {
    position: relative;
    z-index: 2;
    flex: 1;
    min-height: 0;
    overflow-x: hidden;
    overscroll-behavior-x: none;
  }

  .dnd-shell-hold {
    container: page / inline-size;
    display: flex;
    flex-direction: column;
    gap: var(--space-5);
    min-width: 0;
    padding: clamp(var(--space-4), 3cqi, var(--space-6)) clamp(var(--space-3), 3cqi, var(--space-6)) var(--space-8);
    max-width: min(100%, var(--size-page-max));
    margin: 0 auto;
  }

  .dnd-shell-hold > :global(*) {
    animation: dnd-shell-arrive 180ms ease-out both;
  }

  @keyframes dnd-shell-arrive {
    from {
      opacity: 0;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .dnd-shell-hold > :global(*),
    .dnd-shell-handle-start > :global(.dnd-sigil-active),
    .dnd-shell-handle-start > :global(.dnd-sigil-active .dnd-sigil-trace) {
      animation: none;
    }
  }

  .dnd-shell-scroll-flush {
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .dnd-shell-hold-flush {
    flex: 1;
    min-height: 0;
    max-width: none;
    margin: 0;
    gap: 0;
    padding: 0;
  }

  .dnd-shell-hold-narrow {
    max-width: 1040px;
  }

  .dnd-shell-hold-wide {
    max-width: 1200px;
  }

  .dnd-shell > :global(.dnd-sidebar-start) {
    grid-area: menu;
  }

  .dnd-shell > :global(.dnd-sidebar-end) {
    grid-area: chat;
  }

  .dnd-shell-bar .dnd-shell-chip[title]:hover::after,
  .dnd-shell-bar .dnd-shell-chip[title]:focus-visible::after,
  .dnd-shell-bar :global(.dnd-sigil[title]:hover::after),
  .dnd-shell-bar :global(.dnd-sigil[title]:focus-visible::after) {
    top: calc(100% + var(--space-1));
    bottom: auto;
  }

  @media (max-width: 1100px) {
    .dnd-shell-chip-lines,
    .dnd-shell-chip::before,
    .dnd-shell-chip-plate {
      display: none;
    }

    .dnd-shell-chip {
      padding: 0;
    }
  }

  @container shell (max-width: 47.5rem) {
    .dnd-shell-lantern {
      display: none;
    }
  }

  @media (max-width: 860px) {
    .dnd-shell-player-lines {
      display: none;
    }

    .dnd-shell-player {
      justify-self: center;
      margin-inline-end: 0;
    }

    .dnd-shell-nav {
      padding-inline-start: 0;
      background: none;
    }

    .dnd-shell-scroll {
      padding: var(--space-4) var(--space-4) var(--space-7);
    }
  }

  @media (max-width: 560px) {
    .dnd-shell-bar {
      gap: var(--space-2);
      padding: 0 var(--space-3);
    }

    .dnd-shell-run {
      display: none;
    }
  }
</style>
