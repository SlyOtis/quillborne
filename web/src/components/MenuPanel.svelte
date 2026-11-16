<script lang="ts">
  import type { SoundBoard } from '$lib/character.types'
  import { uiStore, menuView, soundBoard } from '$lib/stores/ui.store'
  import { currentCampaignId, userCampaigns } from '$lib/stores/campaign.store'
  import { openLibrary } from '$lib/music'
  import Glyph from '$components/ui/Glyph.svelte'
  import IconBtn from '$components/ui/IconBtn.svelte'
  import SearchInput from '$components/ui/SearchInput.svelte'
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
    <header class="dnd-menupanel-rail">
      {@render back()}
      <IconBtn title="Import songs" disabled={!scope} onclick={() => openImport()}>
        <Glyph name="upload" size="sm" />
      </IconBtn>
    </header>
    <SearchInput bind:value={search} placeholder="Search the songs..." label="Search songs" variant="band" />
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
  <IconBtn title="Back to the navigator" onclick={uiStore.openMenu}>
    <Glyph name="back" size="sm" />
  </IconBtn>
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
    --menu-surface-sunk: var(--ground-deep);
    --menu-hair: var(--border-hair) solid color-mix(in srgb, var(--metal-dim) 80%, transparent);

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
      linear-gradient(180deg, color-mix(in srgb, var(--stone-light) 20%, transparent) 0%, color-mix(in srgb, var(--shadow-ink) 45%, transparent) 60%, color-mix(in srgb, var(--shadow-ink) 65%, transparent) 100%),
      var(--texture-noise),
      var(--stone);
    box-shadow: var(--bevel-up), inset 0 -1px 0 var(--keyline), 0 1px 0 var(--metal-dim), 0 2px 0 var(--metal), 0 3px 0 var(--keyline), 0 5px 8px var(--shade);
  }

  .dnd-menupanel-rail {
    position: relative;
    z-index: 2;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-1);
    min-height: var(--menu-row);
    padding-inline: var(--space-2);
    background: var(--menu-surface-sunk);
    border-bottom: var(--menu-hair);
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
