<script lang="ts">
  import { onMount } from 'svelte'
  import { getAssets, getAssetTab, postFile } from '$lib/api'
  import type { MediaAsset, MediaKind } from '$lib/blocks'
  import { putOne, type Resource } from '$lib/resources'
  import { user } from '$lib/stores/auth.store'
  import { postNotice } from '$lib/stores/ui.store'
  import BlockEditor from '$components/ui/BlockEditor.svelte'
  import BlockReader from '$components/ui/BlockReader.svelte'
  import MediaDialog from '$components/MediaDialog.svelte'
  import { getScribe } from '../ScribePage.svelte'

  const SAVE_DELAY = 600

  const scribe = getScribe()

  let media = $state<{ kind: MediaKind; current?: string; resolve: (asset: MediaAsset | null) => void } | null>(null)
  let timer: ReturnType<typeof setTimeout> | undefined
  let pending: Resource | null = null

  function write(content: string) {
    const open = scribe.open
    if (!open || open.content === content) return
    const held = { ...open, content }
    scribe.putPage(held)
    pending = held
    clearTimeout(timer)
    timer = setTimeout(() => void save(held), SAVE_DELAY)
  }

  async function save(held: Resource) {
    if (pending === held) pending = null
    const owner = scribe.owner
    if (!owner) return
    scribe.table.saving = true
    try {
      await putOne(owner, 'entries', held.id, { ...held })
    } catch (reason) {
      postNotice(reason instanceof Error ? reason.message : String(reason))
    } finally {
      scribe.table.saving = false
    }
  }

  function getMedia(kind: MediaKind, current?: string): Promise<MediaAsset | null> {
    return new Promise((resolve) => (media = { kind, current, resolve }))
  }

  function postMedia(file: File): Promise<MediaAsset> {
    return postFile(file, { kind: 'user' })
  }

  onMount(() => () => {
    clearTimeout(timer)
    if (pending) void save(pending)
  })
</script>

<section class="scribe-page" aria-label="Page">
  {#if scribe.table.loading}
    <div class="dnd-loading"><span class="dnd-spinner"></span></div>
  {:else if scribe.open}
    {#key scribe.open.id}
      {#if scribe.mode === 'edit'}
        <BlockEditor
          value={scribe.open.content}
          placeholder="Write, or press slash for a block"
          onchange={write}
          onsearch={scribe.seek}
          requestMedia={getMedia}
          uploadFile={postMedia}
          openAsset={getAssetTab}
        />
      {:else}
        <BlockReader value={scribe.open.content} onopen={scribe.follow} onsearch={scribe.seek} openAsset={getAssetTab} mine={$user?.user_id ?? ''} />
      {/if}
    {/key}
  {/if}
</section>

{#if media}
  <MediaDialog
    kind={media.kind}
    current={media.current}
    getAssets={(query, kind) => getAssets(query, kind, { kind: 'user' })}
    uploadFile={postMedia}
    onclose={(asset) => {
      media?.resolve(asset)
      media = null
    }}
  />
{/if}

<style>
  .scribe-page {
    min-width: 0;
    padding: var(--space-3) var(--space-6) var(--space-6);
  }
</style>
