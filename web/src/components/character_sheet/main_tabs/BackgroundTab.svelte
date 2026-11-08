<script lang="ts">
  import { getAssets, getAssetTab, postFile } from '$lib/api'
  import {getContext} from "svelte";
  import type {CharacterContext} from "$lib/types";
  import type {MediaAsset, MediaKind, Mention} from "$lib/blocks";
  import BlockEditor from "$components/ui/BlockEditor.svelte";
  import BlockReader from "$components/ui/BlockReader.svelte";
  import MediaDialog from "$components/MediaDialog.svelte";

  const {background} = getContext<CharacterContext>('character')

  let writing = $state(false)
  let media = $state<{kind: MediaKind, current?: string, resolve: (asset: MediaAsset | null) => void} | null>(null)

  const story = $derived($background.description ?? '')

  function write(next: string) {
    background.update((state) => ({...state, description: next}))
  }

  async function seek(mark: '@' | '#', query: string): Promise<Mention[]> {
    if (mark === '#') return []
    const wanted = query.toLowerCase()
    return ($background.additional ?? [])
      .filter((one) => one.title.toLowerCase().includes(wanted))
      .map((one) => ({id: one.title, label: one.title.replace(/\s+/g, '')}))
  }

  function getMedia(kind: MediaKind, current?: string): Promise<MediaAsset | null> {
    return new Promise((resolve) => (media = {kind, current, resolve}))
  }

  function postMedia(file: File): Promise<MediaAsset> {
    return postFile(file, {kind: 'user'})
  }
</script>

<div class="root">
    <div class="scroll">
        <ul>
            <li>
                <h4>{$background.title}</h4>
                {#if $background?.subTitle}
                    <span class="sub-title">{$background.subTitle}</span>
                {/if}
                <div class="story">
                    <button
                        type="button"
                        class="story-turn"
                        aria-pressed={writing}
                        onclick={() => (writing = !writing)}
                    >
                        {writing ? 'Read it' : 'Write it'}
                    </button>

                    {#if writing}
                        <BlockEditor
                            value={story}
                            placeholder="Write their story, or press slash for a block"
                            onchange={write}
                            onsearch={seek}
                            requestMedia={getMedia}
                            uploadFile={postMedia}
                            openAsset={getAssetTab}
                        />
                    {:else}
                        <BlockReader value={story} onsearch={seek} openAsset={getAssetTab} />
                    {/if}

                    {#if media}
                        <MediaDialog
                            kind={media.kind}
                            current={media.current}
                            getAssets={(query, wanted) => getAssets(query, wanted, {kind: 'user'})}
                            uploadFile={postMedia}
                            onclose={(asset) => {
                                media?.resolve(asset)
                                media = null
                            }}
                        />
                    {/if}
                </div>
                {#if $background?.additional?.length}
                    <ul class="additional">
                        {#each $background?.additional as additional}
                            <li>
                                <h5>{additional.title}</h5>
                                <span>{additional.type}</span>
                                {#if additional.description}
                                    <p>{additional.description}</p>
                                {/if}
                            </li>
                        {/each}
                    </ul>
                {/if}
            </li>
        </ul>
    </div>
</div>

<style>
    .story {
        display: flex;
        flex-direction: column;
        gap: var(--space-3);
        min-width: 0;
    }

    .story-turn {
        align-self: flex-start;
        padding: var(--space-1) var(--space-4);
        border: none;
        border-radius: var(--radius-sm);
        background:
            linear-gradient(180deg, color-mix(in srgb, var(--stone-light) 20%, transparent) 0%, color-mix(in srgb, #000 45%, transparent) 60%, color-mix(in srgb, #000 65%, transparent) 100%),
            var(--texture-noise),
            var(--stone);
        box-shadow: var(--rim-thin), var(--bevel-up), var(--shadow-sm);
        font-family: var(--font-display);
        font-size: var(--text-xs);
        font-weight: 700;
        letter-spacing: var(--tracking-caps);
        text-transform: uppercase;
        color: var(--metal);
        text-shadow: 0 1px 0 #000;
        cursor: pointer;
        transition: color 0.18s ease, text-shadow 0.18s ease, filter 0.18s ease;
    }

    .story-turn:hover {
        color: var(--metal-bright);
        text-shadow: var(--glow-text);
        filter: brightness(1.1);
    }

    .story-turn:active {
        filter: brightness(0.85);
        box-shadow: var(--rim-thin), var(--bevel-down);
    }

    .story-turn[aria-pressed='true'] {
        color: var(--metal-bright);
        box-shadow: var(--rim-thin), var(--bevel-down), 0 0 0.7rem var(--ember-glow);
    }

    .root {
        position: relative;
        width: 100%;
        height: 100%;
        max-height: 100%;
        display: flex;
        justify-content: start;
        align-items: start;
        flex-direction: column;
        overflow: hidden;
    }

    .scroll {
        position: relative;
        width: 100%;
        flex: 1;
        min-height: 0;
        overflow: hidden;
        overflow-y: auto;
    }

    ul, li {
        position: relative;
        list-style: none;
        padding: 0;
        margin: 0;
        width: 100%;
        height: auto;
    }

    ul {
        padding: var(--space-2) var(--space-3);
    }

    li {
        margin-bottom: var(--space-3);
    }

    h4, p, h5 {
        padding: 0;
        margin: 0;
    }

    h4 {
        font-family: var(--font-display);
        font-size: var(--text-lg);
        font-weight: 700;
        color: var(--metal-bright);
        text-shadow: 0 1px 0 #000, 0 0 0.6rem var(--ember-glow);
    }

    h5 {
        font-family: var(--font-display);
        font-size: var(--text-sm);
        font-weight: 700;
        letter-spacing: var(--tracking-wide);
        color: var(--metal);
        text-shadow: 0 1px 0 #000;
    }

    .sub-title {
        display: block;
        font-size: var(--text-sm);
        font-style: italic;
        color: var(--ink-dim);
        margin-bottom: var(--space-2);
    }

    .additional {
        margin-top: var(--space-4);
        padding: var(--space-3);
        background: var(--texture-noise), linear-gradient(180deg, var(--ground-deep) 0%, var(--ground) 100%);
        border: var(--border-hair) solid color-mix(in srgb, var(--metal-dim) 60%, transparent);
        border-radius: var(--radius-sm);
        box-shadow: var(--bevel-down);
    }

    .additional span {
        font-size: var(--text-xs);
        font-style: italic;
        color: var(--ink-faint);
    }

</style>
