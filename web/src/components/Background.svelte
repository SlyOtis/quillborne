<script lang="ts">
  import {getContext} from "svelte";
  import type {CharacterContext} from "../lib/types";
  import {decryptMediaUrl} from "../lib/engine.js";

  const characterContext = getContext<CharacterContext>('character')
  const info = characterContext?.info

  let bckSource = $state({type: 'unknown', url: ''})

  $effect.pre(() => {
    if (info && $info.backgroundUrl) {
      decryptMediaUrl($info.backgroundUrl).then(res => {
        bckSource = res
      })
    }
  })

</script>

<div class="root">
    <div class="inner">
        {#if bckSource.type === 'video'}
            <iframe
                    title="Video background"
                    src={bckSource.url}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowfullscreen>
            </iframe>
        {:else if bckSource.type === 'image'}
            <img src={bckSource.url} alt="Background"/>
        {/if}
    </div>
</div>

<style>
    .root {
        position: absolute;
        top: 0;
        right: 0;
        bottom: 0;
        left: 0;
        z-index: 0;
        background: var(--backdrop, var(--ground-deep));

        user-select: none;
        pointer-events: none;
        pointer-events: none;
    }

    .inner {
        position: relative;
        width: 100%;
        height: 100%;
        display: flex;
        justify-content: center;
        align-items: center;
    }

    .inner:after {
        content: '';
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: radial-gradient(ellipse 70% 50% at 50% 0%, color-mix(in srgb, var(--ember) 14%, transparent) 0%, transparent 70%), linear-gradient(180deg, color-mix(in srgb, var(--shadow-ink) 55%, transparent) 0%, color-mix(in srgb, var(--shadow-ink) 82%, transparent) 100%);
        opacity: 1;
    }

    iframe, img {
        position: absolute;
        top: 0;
        width: 100%;
        height: 100%;
        border: none;
        outline: none;
        object-fit: cover;
        user-select: none;
        pointer-events: none;
    }

    iframe {
        left: 50%;
        height: 100vh;
        min-width: 177.77vh;
        transform: translateX(-50%);
        border: none;
    }
</style>
