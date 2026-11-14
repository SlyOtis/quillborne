<script lang="ts">
  import { untrack } from 'svelte'
  import BaseDialog from '$components/BaseDialog.svelte'
  import Button from '$components/ui/Button.svelte'
  import Glyph from '$components/ui/Glyph.svelte'
  import IconBtn from '$components/ui/IconBtn.svelte'
  import { postSong } from '$lib/music'

  type Lot = {
    file: File
    state: 'held' | 'busy' | 'done' | 'bad'
    note: string | null
  }

  let {
    isOpen = $bindable(false),
    campaignId,
    files = []
  }: {
    /** Whether the dialog is showing. */
    isOpen: boolean
    /** The campaign the songs land in. */
    campaignId: string
    /** Files handed in before the dialog opened, from a drop on the playlist. */
    files?: File[]
  } = $props()

  let lots = $state<Lot[]>(untrack(() => files.map((file) => ({ file, state: 'held', note: null }))))
  let busy = $state(false)
  let dragging = $state(false)
  let picker = $state<HTMLInputElement>()

  const left = $derived(lots.filter((lot) => lot.state !== 'done').length)

  function add(more: FileList | null) {
    if (!more) return
    for (const file of Array.from(more)) {
      if (lots.some((lot) => lot.file.name === file.name && lot.file.size === file.size)) continue
      lots.push({ file, state: 'held', note: null })
    }
  }

  function pickFiles(event: Event) {
    const input = event.currentTarget as HTMLInputElement
    add(input.files)
    input.value = ''
  }

  function drop(event: DragEvent) {
    event.preventDefault()
    dragging = false
    add(event.dataTransfer?.files ?? null)
  }

  function getSize(bytes: number) {
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  }

  async function send() {
    busy = true
    for (const lot of lots) {
      if (lot.state === 'done') continue
      lot.state = 'busy'
      lot.note = null
      try {
        await postSong(campaignId, lot.file)
        lot.state = 'done'
      } catch (reason) {
        lot.state = 'bad'
        lot.note = reason instanceof Error ? reason.message : String(reason)
      }
    }
    busy = false
    if (lots.every((lot) => lot.state === 'done')) isOpen = false
  }
</script>

<BaseDialog bind:isOpen title="Import songs" width="560px" zIndex={9999} closeOnBackdropClick={!busy} closeOnEscape={!busy}>
  <div class="dnd-songimport">
    <div
      class="dnd-songimport-drop"
      class:dnd-songimport-drop-live={dragging}
      role="region"
      aria-label="Song drop zone"
      ondragover={(event) => {
        event.preventDefault()
        dragging = true
      }}
      ondragleave={() => (dragging = false)}
      ondrop={drop}
    >
      <h3 class="dnd-songimport-drop-title">Drop audio files here</h3>
      <Button variant="secondary" size="sm" disabled={busy} onclick={() => picker?.click()}>Choose files</Button>
      <input
        bind:this={picker}
        class="dnd-songimport-pick"
        type="file"
        accept="audio/*"
        multiple
        aria-label="Choose songs"
        onchange={pickFiles}
      />
    </div>

    {#if lots.length === 0}
      <p class="dnd-songimport-empty">Nothing is picked yet.</p>
    {:else}
      <ol class="dnd-songimport-rows">
        {#each lots as lot, index (lot.file.name + lot.file.size)}
          <li class="dnd-songimport-row" class:dnd-songimport-row-bad={lot.state === 'bad'}>
            <span class="dnd-songimport-mark">
              {#if lot.state === 'busy'}
                <span class="dnd-spinner"></span>
              {:else if lot.state === 'done'}
                <Glyph name="save" size="sm" />
              {:else if lot.state === 'bad'}
                <Glyph name="close" size="sm" />
              {:else}
                <Glyph name="music" size="sm" />
              {/if}
            </span>
            <span class="dnd-songimport-name">
              {lot.file.name}
              {#if lot.note}
                <span class="dnd-songimport-note">{lot.note}</span>
              {/if}
            </span>
            <span class="dnd-songimport-size">{getSize(lot.file.size)}</span>
            <span class="dnd-songimport-acts">
              <IconBtn title="Remove" tone="ink" disabled={busy || lot.state === 'done'} onclick={() => lots.splice(index, 1)}>
                <Glyph name="close" size="sm" />
              </IconBtn>
            </span>
          </li>
        {/each}
      </ol>
    {/if}

    <footer class="dnd-songimport-foot">
      <Button variant="ghost" disabled={busy} onclick={() => (isOpen = false)}>Cancel</Button>
      <Button variant="primary" loading={busy} disabled={!campaignId || left === 0} onclick={send}>
        Import {left} {left === 1 ? 'song' : 'songs'}
      </Button>
    </footer>
  </div>
</BaseDialog>

<style>
  .dnd-songimport {
    display: grid;
    gap: var(--space-4);
    padding: var(--space-5) var(--space-6) var(--space-6);
  }

  .dnd-songimport-drop {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-5);
    background:
      var(--texture-noise),
      linear-gradient(180deg, var(--ground-deep) 0%, var(--ground) 100%);
    border: var(--border-hair) dashed var(--metal-dim);
    border-radius: var(--radius-sm);
    box-shadow: var(--bevel-down), inset 0 0 22px 4px var(--shade-hard);
    transition: border-color 0.15s ease, box-shadow 0.15s ease;
  }

  .dnd-songimport-drop-live,
  .dnd-songimport-drop:focus-within {
    border-color: var(--metal-bright);
    border-style: solid;
    box-shadow: var(--bevel-down), inset 0 0 22px 4px var(--shade-hard), inset 0 0 30px -10px var(--ember-glow), var(--glow-metal);
  }

  .dnd-songimport-drop-title {
    margin: 0;
    text-align: center;
    font-family: var(--font-display);
    font-size: var(--text-md);
    font-weight: 700;
    letter-spacing: var(--tracking-caps);
    text-transform: uppercase;
    color: var(--metal);
    text-shadow: 0 1px 0 var(--shadow-ink);
  }

  .dnd-songimport-pick {
    display: none;
  }

  .dnd-songimport-empty {
    margin: 0;
    color: var(--ink-faint);
    font-size: var(--text-sm);
    font-style: italic;
  }

  .dnd-songimport-rows {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    max-height: 40vh;
    margin: 0;
    padding: var(--space-1);
    background: var(--texture-noise), linear-gradient(180deg, var(--ground-deep) 0%, var(--ground) 100%);
    border-radius: var(--radius-sm);
    box-shadow: var(--rim-thin), var(--bevel-down);
    overflow-y: auto;
    list-style: none;
  }

  .dnd-songimport-row {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    min-height: var(--space-7);
    padding: 0 var(--space-2);
    border: var(--border-hair) solid transparent;
    border-bottom-color: color-mix(in srgb, var(--metal-dim) 40%, transparent);
    border-radius: var(--radius-sm);
  }

  .dnd-songimport-row-bad {
    border-color: color-mix(in srgb, var(--state-bad) 55%, transparent);
    background: linear-gradient(180deg, color-mix(in srgb, var(--state-bad) 14%, transparent), transparent);
  }

  .dnd-songimport-mark {
    display: flex;
    flex: none;
    align-items: center;
    justify-content: center;
    width: var(--space-6);
    height: var(--space-6);
    color: var(--metal);
  }

  .dnd-songimport-name {
    display: flex;
    flex: 1;
    flex-direction: column;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: var(--text-sm);
    color: var(--ink);
  }

  .dnd-songimport-note {
    overflow: hidden;
    text-overflow: ellipsis;
    font-size: var(--text-xs);
    color: var(--ink-dim);
  }

  .dnd-songimport-size {
    flex: none;
    font-family: var(--font-figures);
    font-variant-numeric: tabular-nums;
    font-size: var(--text-xs);
    color: var(--ink-faint);
  }

  .dnd-songimport-acts {
    display: flex;
    flex: none;
    height: var(--space-6);
  }

  .dnd-songimport-foot {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-3);
    padding-top: var(--space-4);
    border-top: var(--border-hair) solid var(--metal-dim);
    box-shadow: inset 0 1px 0 var(--keyline);
  }
</style>
