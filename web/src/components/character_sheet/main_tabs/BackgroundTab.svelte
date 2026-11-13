<script lang="ts">
  import { getAssets, getAssetTab, postFile } from '$lib/api'
  import {getContext} from "svelte";
  import type {CharacterContext} from "$lib/types";
  import type {MediaAsset, MediaKind, Mention} from "$lib/blocks";
  import BlockEditor from "$components/ui/BlockEditor.svelte";
  import MediaDialog from "$components/MediaDialog.svelte";
  import IconBtn from "$components/ui/IconBtn.svelte";
  import Glyph from "$components/ui/Glyph.svelte";
  import { navigate } from "sly-svelte-location-router";

  const {background} = getContext<CharacterContext>('character')

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
                <div class="title-line">
                    <h4>{$background.title}</h4>
                    <IconBtn title="Edit as scribe" onclick={() => navigate('/main/scribe')}><Glyph name="edit" size="sm" /></IconBtn>
                </div>
                {#if $background?.subTitle}
                    <span class="sub-title">{$background.subTitle}</span>
                {/if}
                <div class="story">
                    <BlockEditor
                        value={story}
                        placeholder="Write their story, or press slash for a block"
                        onchange={write}
                        onsearch={seek}
                        requestMedia={getMedia}
                        uploadFile={postMedia}
                        openAsset={getAssetTab}
                    />

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
    .title-line {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--space-3);
    }

    .story {
        display: flex;
        flex-direction: column;
        gap: var(--space-3);
        min-width: 0;
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
