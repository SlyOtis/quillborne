<script lang="ts">
  import type { SoundBoard } from '$lib/character.types'
  import { uiStore, menuView, soundBoard } from '$lib/stores/ui.store'
  import { currentCampaignId, userCampaigns } from '$lib/stores/campaign.store'
  import { openLibrary } from '$lib/music'
  import Button from '$components/ui/Button.svelte'
  import Glyph from '$components/ui/Glyph.svelte'
  import IconBtn from '$components/ui/IconBtn.svelte'
  import MainMenu from '$components/MainMenu.svelte'
  import SoundBoardComponent from '$components/soundboard/SoundBoard.svelte'
  import Playlist from '$components/music/Playlist.svelte'
  import SongImportDialog from '$components/music/SongImportDialog.svelte'

  const soundBoardStore = $derived($soundBoard)

  let search = $state('')
  let importOpen = $state(false)
  let dropped = $state<File[]>([])

  function openImport(files: File[] = []) {
    dropped = files
    importOpen = true
  }

  const scope = $derived($currentCampaignId || $userCampaigns[0]?.id || '')

  $effect(() => {
    openLibrary(scope)
  })

  function handleSoundBoardChange(soundBoard: SoundBoard) {
    soundBoardStore?.set(soundBoard)
  }
</script>

<div class="dnd-menupanel">
  {#if $menuView === 'soundboard' && soundBoardStore}
    {@render head()}
    <div class="dnd-scroll dnd-menupanel-body">
      <SoundBoardComponent soundBoard={$soundBoardStore ?? null} onSoundBoardChange={handleSoundBoardChange} />
    </div>
  {:else if $menuView === 'music'}
    <header class="dnd-menupanel-head dnd-menupanel-head-flush">
      {@render back()}
      <input
        type="text"
        class="dnd-search dnd-menupanel-search"
        placeholder="Search the songs..."
        aria-label="Search songs"
        bind:value={search}
      />
      <IconBtn title="Import songs" disabled={!scope} onclick={() => openImport()}>
        <Glyph name="upload" size="sm" />
      </IconBtn>
    </header>
    <div class="dnd-menupanel-body dnd-menupanel-body-flush">
      <Playlist campaignId={scope} {search} onimport={openImport} />
    </div>
    {#if importOpen}
      <SongImportDialog bind:isOpen={importOpen} campaignId={scope} files={dropped} />
    {/if}
  {:else}
    <MainMenu />
  {/if}
</div>

{#snippet back()}
  <Button variant="ghost" size="sm" title="Back to the navigator" onclick={uiStore.openMenu}>
    <Glyph name="back" size="sm" />
    Navigator
  </Button>
{/snippet}

{#snippet head()}
  <header class="dnd-menupanel-head">
    {@render back()}
  </header>
{/snippet}

<style>
  .dnd-menupanel {
    --menu-pad: var(--space-4);
    --menu-row: 2.6rem;
    --menu-line: var(--metal-dim);
    --menu-line-strong: var(--metal);
    --menu-surface: var(--ground-raised);
    --menu-surface-lift: var(--ground-lift);
    --menu-accent: var(--metal-bright);
    --menu-radius: var(--radius-sm);

    display: flex;
    flex-direction: column;
    width: 100%;
    height: 100%;
    overflow: hidden;
  }

  .dnd-menupanel-head {
    position: relative;
    z-index: 1;
    padding: var(--menu-pad);
    background:
      linear-gradient(180deg, color-mix(in srgb, var(--stone-light) 20%, transparent) 0%, color-mix(in srgb, #000 45%, transparent) 60%, color-mix(in srgb, #000 65%, transparent) 100%),
      var(--texture-noise),
      var(--stone);
    box-shadow: var(--bevel-up), inset 0 -1px 0 var(--keyline), 0 1px 0 var(--metal-dim), 0 2px 0 var(--metal), 0 3px 0 var(--keyline), 0 5px 8px var(--shade);
  }

  .dnd-menupanel-head-flush {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    height: var(--menu-row);
    padding: 0 var(--space-2) 0 0;
  }

  .dnd-menupanel-search {
    flex: 1;
    width: auto;
    min-width: 0;
  }

  .dnd-menupanel-body {
    flex: 1;
    min-height: 0;
    padding: var(--menu-pad);
  }

  .dnd-menupanel-body-flush {
    display: flex;
    flex-direction: column;
    padding: 0;
  }
</style>
