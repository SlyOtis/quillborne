<script lang="ts">
  import type { Song } from '$lib/api/types'
  import Fold from '$components/ui/Fold.svelte'
  import FrameBtn from '$components/ui/FrameBtn.svelte'
  import Glyph from '$components/ui/Glyph.svelte'
  import IconBtn from '$components/ui/IconBtn.svelte'
  import {
    cycleRepeat,
    dequeueSong,
    enqueueSong,
    getClock,
    library,
    moveSong,
    playing,
    playNext,
    playPrev,
    playSong,
    progress,
    queue,
    repeat,
    seekSong,
    shuffle,
    toggleShuffle,
    toggleSong,
    track
  } from '$lib/music'

  const { campaignId, search = '', onimport }: {
    /** The campaign whose playlist is shown. */
    campaignId: string
    /** The text the song list is filtered on. */
    search?: string
    /** Runs with the files dropped on the list so the host can open the import. */
    onimport?: (files: File[]) => void
  } = $props()

  let dragging = $state(false)
  let queueOpen = $state(true)
  let songsOpen = $state(true)

  const found = $derived(
    $library.filter((one) => one.title.toLowerCase().includes(search.trim().toLowerCase()))
  )

  function drop(event: DragEvent) {
    event.preventDefault()
    dragging = false
    const files = Array.from(event.dataTransfer?.files ?? [])
    if (files.length > 0) onimport?.(files)
  }

  function press(song: Song) {
    if ($track?.id === song.id) toggleSong()
    else void playSong(song)
  }
</script>

<div
  class="dnd-playlist"
  class:dnd-playlist-live={dragging}
  role="region"
  aria-label="Song drop zone"
  ondragover={(event) => {
    event.preventDefault()
    dragging = true
  }}
  ondragleave={() => (dragging = false)}
  ondrop={drop}
>
  <div class="dnd-scroll dnd-playlist-body">
    {#if !campaignId}
      <p class="dnd-playlist-empty">No campaign is in scope.</p>
    {:else}
      <Fold title="Queue" count={$queue.length} variant="row" open={queueOpen} ontoggle={() => (queueOpen = !queueOpen)}>
        {#if $queue.length === 0}
          <p class="dnd-playlist-empty">Nothing is queued.</p>
        {:else}
          <ol class="dnd-playlist-rows">
            {#each $queue as song, index (index)}
              <li class="dnd-playlist-row">
                <span class="dnd-playlist-name">{song.title}</span>
                <span class="dnd-playlist-time">{getClock(song.duration)}</span>
                <span class="dnd-playlist-acts">
                  <IconBtn title="Move up" disabled={index === 0} onclick={() => moveSong(index, -1)}>
                    <Glyph name="unfold" size="sm" />
                  </IconBtn>
                  <IconBtn title="Move down" disabled={index === $queue.length - 1} onclick={() => moveSong(index, 1)}>
                    <Glyph name="fold" size="sm" />
                  </IconBtn>
                  <IconBtn title="Remove from the queue" tone="ink" onclick={() => dequeueSong(index)}>
                    <Glyph name="close" size="sm" />
                  </IconBtn>
                </span>
              </li>
            {/each}
          </ol>
        {/if}
      </Fold>

      <Fold title="Songs" count={found.length} variant="row" open={songsOpen} ontoggle={() => (songsOpen = !songsOpen)}>
        {#if $library.length === 0}
          <p class="dnd-playlist-empty">Nothing has been uploaded. Drop songs here.</p>
        {:else if found.length === 0}
          <p class="dnd-playlist-empty">No song answers to that.</p>
        {:else}
          <ol class="dnd-playlist-rows">
            {#each found as song (song.id)}
              <li class="dnd-playlist-row" class:dnd-playlist-row-on={$track?.id === song.id}>
                <span class="dnd-playlist-acts">
                  <IconBtn
                    title={$track?.id === song.id && $playing ? 'Pause' : 'Play'}
                    tone={$track?.id === song.id ? 'ember' : 'metal'}
                    active={$track?.id === song.id}
                    onclick={() => press(song)}
                  >
                    <Glyph name={$track?.id === song.id && $playing ? 'pause' : 'play'} size="sm" />
                  </IconBtn>
                </span>
                <span class="dnd-playlist-name">{song.title}</span>
                <span class="dnd-playlist-time">{getClock(song.duration)}</span>
                <span class="dnd-playlist-acts">
                  <IconBtn title="Add to the queue" onclick={() => enqueueSong(song)}>
                    <Glyph name="add" size="sm" />
                  </IconBtn>
                </span>
              </li>
            {/each}
          </ol>
        {/if}
      </Fold>
    {/if}
  </div>

  <div class="dnd-playlist-player" aria-label="Now playing">
    <span class="dnd-playlist-name dnd-playlist-player-name" class:dnd-playlist-player-idle={!$track}>
      {$track?.title ?? 'Nothing is playing.'}
    </span>
    <input
      class="dnd-playlist-seek"
      type="range"
      min="0"
      max={$progress.length || 0}
      step="0.5"
      value={$progress.at}
      disabled={!$track}
      aria-label="Seek"
      oninput={(event) => seekSong(Number(event.currentTarget.value))}
    />
    <span class="dnd-playlist-player-row">
      <span class="dnd-playlist-time">{getClock($progress.at)}</span>
      <span class="dnd-playlist-acts dnd-playlist-player-acts">
        <IconBtn title={$shuffle ? 'Shuffle on' : 'Shuffle off'} active={$shuffle} onclick={toggleShuffle}>
          <Glyph name="shuffle" size="sm" />
        </IconBtn>
        <FrameBtn title="Previous" size="sm" disabled={!$track} onclick={() => void playPrev()}>
          <Glyph name="prev" size="md" />
        </FrameBtn>
        <FrameBtn
          title={$playing ? 'Pause' : 'Play'}
          tone="ember"
          disabled={!$track && $queue.length === 0}
          onclick={toggleSong}
        >
          <Glyph name={$playing ? 'pause' : 'play'} size="md" />
        </FrameBtn>
        <FrameBtn title="Next" size="sm" disabled={$queue.length === 0 && $repeat !== 'all'} onclick={() => void playNext()}>
          <Glyph name="next" size="md" />
        </FrameBtn>
        <IconBtn
          title={$repeat === 'one' ? 'Repeat one' : $repeat === 'all' ? 'Repeat all' : 'Repeat off'}
          active={$repeat !== 'off'}
          onclick={cycleRepeat}
        >
          <Glyph name={$repeat === 'one' ? 'repeatone' : 'repeat'} size="sm" />
        </IconBtn>
      </span>
      <span class="dnd-playlist-time">{getClock($progress.length)}</span>
    </span>
  </div>
</div>

<style>
  .dnd-playlist {
    --playlist-pad: var(--space-4);
    --playlist-row: var(--space-7);
    display: flex;
    flex: 1;
    flex-direction: column;
    min-height: 0;
    border: var(--border-width) dashed transparent;
    transition: border-color 0.15s ease;
  }

  .dnd-playlist-live {
    border-color: var(--metal-bright);
    box-shadow: inset 0 0 30px -10px var(--ember-glow);
  }

  .dnd-playlist-body {
    display: flex;
    flex: 1;
    flex-direction: column;
    min-height: 0;
  }

  .dnd-playlist-empty {
    margin: 0;
    color: var(--ink-faint);
    font-size: var(--text-sm);
    font-style: italic;
  }

  .dnd-playlist-rows {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .dnd-playlist-row {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    min-height: var(--playlist-row);
    padding: 0 var(--space-2);
    border: none;
    border-radius: var(--radius-sm);
    transition: box-shadow 0.15s ease, background 0.15s ease;
  }

  .dnd-playlist-row:hover {
    background: radial-gradient(ellipse 60% 140% at 0% 50%, color-mix(in srgb, var(--ember-glow) 35%, transparent) 0%, transparent 70%);
    box-shadow: inset 0 -1px 0 color-mix(in srgb, var(--metal-dim) 60%, transparent);
  }

  .dnd-playlist-row-on {
    box-shadow: var(--rim-thin), var(--bevel-up);
    background:
      radial-gradient(ellipse 60% 140% at 0% 50%, var(--ember-glow) 0%, transparent 70%),
      linear-gradient(180deg, color-mix(in srgb, var(--stone-light) 14%, transparent) 0%, color-mix(in srgb, #000 55%, transparent) 60%, color-mix(in srgb, #000 70%, transparent) 100%),
      var(--texture-noise),
      var(--stone-dark);
  }

  .dnd-playlist-name {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: var(--text-sm);
    color: var(--ink);
  }

  .dnd-playlist-row-on .dnd-playlist-name {
    color: var(--metal-bright);
    text-shadow: var(--glow-text);
  }

  .dnd-playlist-time {
    flex: none;
    font-family: var(--font-figures);
    font-variant-numeric: tabular-nums;
    font-size: var(--text-xs);
    color: var(--ink-faint);
  }

  .dnd-playlist-acts {
    display: flex;
    flex: none;
    height: var(--space-6);
  }

  .dnd-playlist-player {
    display: flex;
    flex: none;
    flex-direction: column;
    gap: var(--space-2);
    padding: var(--space-3) var(--playlist-pad) var(--playlist-pad);
    border-top: none;
    background:
      linear-gradient(180deg, color-mix(in srgb, var(--stone-light) 18%, transparent) 0%, color-mix(in srgb, #000 45%, transparent) 60%, color-mix(in srgb, #000 65%, transparent) 100%),
      var(--texture-noise),
      var(--stone);
    box-shadow: var(--bevel-up), inset 0 1px 0 var(--keyline), inset 0 2px 0 var(--metal), inset 0 3px 0 var(--keyline), 0 -4px 10px var(--shade);
  }

  .dnd-playlist-player-name {
    flex: none;
    font-family: var(--font-display);
    font-weight: 700;
    letter-spacing: var(--tracking-wide);
    color: var(--metal-bright);
    text-shadow: 0 1px 0 #000, 0 0 10px var(--ember-glow);
  }

  .dnd-playlist-player-idle {
    font-family: inherit;
    font-weight: normal;
    font-style: italic;
    letter-spacing: normal;
    color: var(--ink-dim);
    text-shadow: 0 1px 0 #000;
  }

  .dnd-playlist-seek {
    width: 100%;
    height: var(--space-2);
    margin: 0;
    accent-color: var(--metal);
    filter: drop-shadow(0 1px 0 #000);
    cursor: pointer;
  }

  .dnd-playlist-seek:disabled {
    cursor: default;
    opacity: 0.5;
  }

  .dnd-playlist-player-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
  }

  .dnd-playlist-player-acts {
    align-items: center;
    height: auto;
    gap: var(--space-2);
  }
</style>
