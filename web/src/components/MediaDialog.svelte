<script lang="ts">
  import { getSize } from '$lib/api'
  import type { MediaAsset, MediaKind } from '$lib/blocks'
  import BaseDialog from '$components/BaseDialog.svelte'
  import Button from '$components/ui/Button.svelte'
  import Card from '$components/ui/Card.svelte'
  import Field from '$components/ui/Field.svelte'
  import Glyph, { getMimeGlyph } from '$components/ui/Glyph.svelte'

  const {
    kind,
    current = '',
    getAssets,
    uploadFile,
    onclose
  }: {
    /** Which kind of media is asked for, which narrows both tabs to it. */
    kind: MediaKind
    /** The address the block holds now, picked once the pick tab lists it. */
    current?: string
    /** Lists what the pick tab offers for the words searched, each folder before what it holds. */
    getAssets: (query: string, kind: MediaKind) => Promise<MediaAsset[]>
    /** Stores the file the upload tab holds and hands back the asset it became. */
    uploadFile: (file: File, kind: MediaKind) => Promise<MediaAsset>
    /** Runs with what was chosen, or with null when the dialog closes without it. */
    onclose: (asset: MediaAsset | null) => void
  } = $props()

  type Tab = 'pick' | 'upload'
  type Shelf = { folder: MediaAsset | null; assets: MediaAsset[] }

  const FOLDER = 'inode/directory'

  const NAMES: Record<MediaKind, { one: string; many: string }> = {
    image: { one: 'an image', many: 'images' },
    video: { one: 'a video', many: 'videos' },
    audio: { one: 'a sound', many: 'sounds' },
    pdf: { one: 'a PDF', many: 'PDFs' },
    file: { one: 'a file', many: 'files' }
  }

  const ACCEPTS: Record<MediaKind, string> = {
    image: 'image/*',
    video: 'video/*',
    audio: 'audio/*',
    pdf: 'application/pdf',
    file: '*/*'
  }

  const TABS: { id: Tab; title: string }[] = [
    { id: 'pick', title: 'Pick' },
    { id: 'upload', title: 'Upload' }
  ]

  let tab = $state<Tab>('pick')
  let query = $state('')
  let found = $state<MediaAsset[]>([])
  let loading = $state(true)
  let picked = $state<MediaAsset | null>(null)
  let held = $state<File | null>(null)
  let uploading = $state(false)
  let dragging = $state(false)
  let error = $state<string | null>(null)
  let input = $state<HTMLInputElement>()
  let timer: ReturnType<typeof setTimeout> | undefined
  let asked = 0

  const names = $derived(NAMES[kind])

  const shelves = $derived(
    found.reduce<Shelf[]>((all, asset) => {
      if (asset.mimeType === FOLDER) all.push({ folder: asset, assets: [] })
      else if (all.length === 0) all.push({ folder: null, assets: [asset] })
      else all[all.length - 1].assets.push(asset)
      return all
    }, [])
  )

  $effect(() => {
    const words = query
    const wait = timer === undefined ? 0 : 300
    timer = setTimeout(() => void seek(words), wait)
    return () => clearTimeout(timer)
  })

  async function seek(words: string) {
    const turn = ++asked
    loading = true
    error = null
    try {
      const listed = await getAssets(words, kind)
      if (turn !== asked) return
      found = listed
      picked ??= listed.find((asset) => asset.mimeType !== FOLDER && asset.url === current) ?? null
    } catch (reason) {
      if (turn !== asked) return
      found = []
      error = reason instanceof Error ? reason.message : String(reason)
    } finally {
      if (turn === asked) loading = false
    }
  }

  function step(event: KeyboardEvent) {
    const by = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0
    if (!by) return
    event.preventDefault()
    const at = TABS.findIndex((one) => one.id === tab)
    tab = TABS[(at + by + TABS.length) % TABS.length].id
    document.getElementById(`dnd-media-tab-${tab}`)?.focus()
  }

  function isFitting(file: File): boolean {
    if (kind === 'file') return true
    if (kind === 'pdf') return file.type === 'application/pdf'
    return file.type.startsWith(`${kind}/`)
  }

  function hold(file: File | undefined) {
    if (!file) return
    if (!isFitting(file)) {
      error = `${file.name} is not ${names.one}.`
      return
    }
    error = null
    held = file
  }

  function choose(event: Event) {
    const target = event.currentTarget as HTMLInputElement
    hold(target.files?.[0])
    target.value = ''
  }

  function drop(event: DragEvent) {
    event.preventDefault()
    dragging = false
    hold(event.dataTransfer?.files?.[0])
  }

  async function send() {
    if (!held) return
    uploading = true
    error = null
    try {
      onclose(await uploadFile(held, kind))
    } catch (reason) {
      error = reason instanceof Error ? reason.message : String(reason)
    } finally {
      uploading = false
    }
  }
</script>

<BaseDialog
  isOpen={true}
  onClose={() => onclose(null)}
  title="Pick or upload {names.one}"
  width="clamp(20rem, 64vw, 52rem)"
  zIndex={9999}
  closeOnBackdropClick={!uploading}
  closeOnEscape={!uploading}
>
  <div class="dnd-media">
    <div class="dnd-media-tabs" role="tablist" aria-label="Pick or upload">
      {#each TABS as one (one.id)}
        <button
          type="button"
          class="dnd-media-tab"
          class:dnd-media-tab-on={tab === one.id}
          role="tab"
          id="dnd-media-tab-{one.id}"
          aria-selected={tab === one.id}
          aria-controls="dnd-media-panel-{one.id}"
          tabindex={tab === one.id ? 0 : -1}
          disabled={uploading}
          onclick={() => (tab = one.id)}
          onkeydown={step}
        >
          {one.title}
        </button>
      {/each}
    </div>

    {#if tab === 'pick'}
      <div class="dnd-media-panel" role="tabpanel" id="dnd-media-panel-pick" aria-labelledby="dnd-media-tab-pick">
        <Field id="dnd-media-search" label="Search" help="Words match the name, and a #word narrows to a tag.">
          <input id="dnd-media-search" type="search" placeholder="A name, or #tag" bind:value={query} />
        </Field>

        <div class="dnd-media-shelves dnd-scroll">
          {#if loading && found.length === 0}
            <div class="dnd-loading"><span class="dnd-spinner"></span></div>
          {:else if shelves.length === 0}
            <p class="dnd-empty">{query.trim() ? `No ${names.many} match ${query.trim()}.` : `No ${names.many} to pick yet. Upload one.`}</p>
          {:else}
            {#each shelves as shelf, index (shelf.folder?.id ?? `loose-${index}`)}
              <div class="dnd-media-shelf">
                {#if shelf.folder}
                  <h3 class="dnd-label dnd-media-shelf-name">{shelf.folder.name}</h3>
                {/if}
                <div class="dnd-media-grid">
                  {#each shelf.assets as asset (asset.id)}
                    <Card
                      title={asset.name}
                      sub={asset.mimeType}
                      image={asset.mimeType.startsWith('image/') ? asset.url : undefined}
                      on={picked?.id === asset.id}
                      onclick={() => (picked = asset)}
                    />
                  {/each}
                </div>
              </div>
            {/each}
          {/if}
        </div>
      </div>
    {:else}
      <div class="dnd-media-panel" role="tabpanel" id="dnd-media-panel-upload" aria-labelledby="dnd-media-tab-upload">
        <div
          class="dnd-media-drop"
          class:dnd-media-drop-live={dragging}
          role="region"
          aria-label="Drop zone for {names.one}"
          ondragover={(event) => {
            event.preventDefault()
            dragging = true
          }}
          ondragleave={() => (dragging = false)}
          ondrop={drop}
        >
          {#if held}
            <span class="dnd-media-held">
              <span class="dnd-media-held-mark" aria-hidden="true">
                {#if uploading}
                  <span class="dnd-spinner"></span>
                {:else}
                  <Glyph name={getMimeGlyph(held.type)} size="lg" />
                {/if}
              </span>
              <span class="dnd-media-held-text">
                <span class="dnd-media-held-name">{held.name}</span>
                <span class="dnd-media-held-note">{getSize(held.size)}, {uploading ? 'uploading' : 'ready to upload'}</span>
              </span>
            </span>
          {:else}
            <h3 class="dnd-media-drop-title">Drop {names.one} here</h3>
          {/if}
          <Button variant="secondary" disabled={uploading} onclick={() => input?.click()}>
            {held ? 'Choose another' : 'Choose a file'}
          </Button>
          <input
            bind:this={input}
            class="dnd-media-pick"
            type="file"
            accept={ACCEPTS[kind]}
            aria-label="Choose {names.one}"
            onchange={choose}
          />
        </div>
      </div>
    {/if}

    {#if error}
      <p class="dnd-media-alarm" role="alert">{error}</p>
    {/if}

    <footer class="dnd-media-foot">
      <Button variant="ghost" disabled={uploading} onclick={() => onclose(null)}>Cancel</Button>
      {#if tab === 'pick'}
        <Button variant="primary" disabled={!picked} onclick={() => onclose(picked)}>Use it</Button>
      {:else}
        <Button variant="primary" loading={uploading} disabled={!held} onclick={send}>Upload it</Button>
      {/if}
    </footer>
  </div>
</BaseDialog>

<style>
  .dnd-media {
    display: grid;
    gap: var(--space-4);
    padding: var(--space-5) var(--space-6) var(--space-6);
  }

  .dnd-media-tabs {
    display: flex;
    gap: var(--space-1);
    padding: var(--space-1);
    border-radius: var(--radius-sm);
    background: var(--texture-noise), var(--ground-deep);
    box-shadow: var(--bevel-down), inset 0 0 0 1px var(--keyline);
  }

  .dnd-media-tab {
    flex: 1 1 0;
    min-width: 0;
    padding: var(--space-2) var(--space-3);
    border: none;
    border-radius: var(--radius-sm);
    background: none;
    font-family: var(--font-display);
    font-size: var(--text-xs);
    font-weight: 700;
    letter-spacing: var(--tracking-caps);
    text-transform: uppercase;
    color: var(--metal);
    cursor: pointer;
    transition: color 0.15s ease, box-shadow 0.15s ease;
  }

  .dnd-media-tab:hover:not(:disabled) {
    color: var(--metal-bright);
  }

  .dnd-media-tab-on {
    background:
      linear-gradient(180deg, color-mix(in srgb, var(--stone-light) 22%, transparent) 0%, transparent 70%),
      var(--texture-noise),
      var(--stone);
    box-shadow: var(--rim-thin), var(--bevel-up);
    color: var(--metal-bright);
    text-shadow: var(--glow-text);
  }

  .dnd-media-tab:focus-visible {
    outline: none;
    box-shadow: var(--focus-ring);
  }

  .dnd-media-tab:disabled {
    cursor: default;
    opacity: 0.6;
  }

  .dnd-media-panel {
    display: grid;
    gap: var(--space-4);
    min-width: 0;
  }

  .dnd-media-shelves {
    display: grid;
    gap: var(--space-4);
    max-height: min(28rem, 50vh);
    min-height: calc(var(--space-8) * 2);
    padding-inline-end: var(--space-1);
  }

  .dnd-media-shelf {
    display: grid;
    gap: var(--space-2);
  }

  .dnd-media-shelf-name {
    margin: 0;
    color: var(--metal);
  }

  .dnd-media-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(min(100%, calc(var(--space-8) * 3.5)), 1fr));
    gap: var(--space-3);
  }

  .dnd-media-drop {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-6) var(--space-5);
    border: var(--border-hair) dashed var(--metal-dim);
    border-radius: var(--radius-sm);
    background: var(--texture-noise), linear-gradient(180deg, var(--ground-deep) 0%, var(--ground) 100%);
    box-shadow: var(--bevel-down), inset 0 0 22px 4px var(--shade-hard);
    transition: border-color 0.15s ease, box-shadow 0.15s ease;
  }

  .dnd-media-drop-live,
  .dnd-media-drop:focus-within {
    border-color: var(--metal-bright);
    border-style: solid;
    box-shadow: var(--bevel-down), inset 0 0 22px 4px var(--shade-hard), var(--glow-metal);
  }

  .dnd-media-drop-title {
    margin: 0;
    text-align: center;
    font-family: var(--font-display);
    font-size: var(--text-md);
    font-weight: 700;
    letter-spacing: var(--tracking-caps);
    text-transform: uppercase;
    color: var(--metal);
  }

  .dnd-media-pick {
    display: none;
  }

  .dnd-media-held {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    min-width: 0;
    max-width: 100%;
  }

  .dnd-media-held-mark {
    flex: none;
    display: flex;
    color: var(--metal);
  }

  .dnd-media-held-text {
    display: grid;
    gap: var(--space-0);
    min-width: 0;
  }

  .dnd-media-held-name {
    font-family: var(--font-display);
    color: var(--metal-bright);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .dnd-media-held-note {
    font-size: var(--text-xs);
    color: var(--ink-faint);
  }

  .dnd-media-alarm {
    margin: 0;
    padding: var(--space-3);
    border: var(--border-hair) solid var(--state-bad);
    border-radius: var(--radius-sm);
    background: var(--texture-noise), linear-gradient(180deg, color-mix(in srgb, var(--state-bad) 14%, var(--ground-raised)), var(--ground-deep));
    box-shadow: var(--bevel-down);
    font-size: var(--text-sm);
    color: var(--ink);
  }

  .dnd-media-foot {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-3);
    padding-top: var(--space-4);
    border-top: var(--border-hair) solid var(--metal-dim);
  }
</style>
