<script lang="ts">
  import { getFileUrl, isDeadFile, isStoredFile } from '$lib/api'
  import { onDestroy } from 'svelte'

  const {
    src,
    alt,
    draggable
  }: {
    /** A hosted address, a file: record or a local: reference. A blob: address is dead and draws the missing mark. */
    src: string
    /** Alternative text for the image. */
    alt: string
    /** Passed straight to the img element. */
    draggable?: boolean
  } = $props()

  let resolved = $state('')
  let looked = $state(false)
  let objectUrl = ''

  function release() {
    if (objectUrl) URL.revokeObjectURL(objectUrl)
    objectUrl = ''
  }

  $effect(() => {
    const address = src
    let stale = false

    looked = false

    if (!isStoredFile(address)) {
      release()
      resolved = isDeadFile(address) ? '' : address
      return
    }

    getFileUrl(address)
      .catch(() => '')
      .then((url) => {
        if (stale) {
          if (url) URL.revokeObjectURL(url)
          return
        }
        release()
        objectUrl = url
        resolved = url
      })

    return () => {
      stale = true
    }
  })

  async function relook() {
    if (looked || !isStoredFile(src)) {
      resolved = ''
      return
    }

    looked = true
    release()
    resolved = await getFileUrl(src).catch(() => '')
  }

  onDestroy(release)
</script>

{#if resolved}
  <img src={resolved} {alt} draggable={draggable} onerror={relook} />
{:else}
  <span class="dnd-stored-image-missing" aria-label="{alt}, not on this device"></span>
{/if}

<style>
  .dnd-stored-image-missing {
    display: block;
    width: 100%;
    height: 100%;
    background:
      radial-gradient(ellipse at 50% 40%, transparent 30%, color-mix(in srgb, var(--shadow-ink) 60%, transparent) 100%),
      linear-gradient(180deg, color-mix(in srgb, var(--stone-light) 12%, transparent), color-mix(in srgb, var(--shadow-ink) 55%, transparent)),
      var(--texture-noise),
      var(--stone-dark);
    box-shadow: inset 0 0 0 1px var(--keyline);
  }
</style>
