<script lang="ts">
  import {Marked, Renderer, type TokenizerExtension, type TokenizerThis} from "marked";
  import {onMount} from "svelte";
  import {Octokit} from "@octokit/rest";
  import {markedEmoji} from "marked-emoji";
  import {markedXhtml} from "marked-xhtml";
  import {gfmHeadingId} from "marked-gfm-heading-id";

  export let content: string | undefined = undefined

  let html: any = undefined
  let loading = true

  const removeOutermostTags = (html: string) => {
    const regex = /^(?:\s*)<([a-z][a-z0-9]*)[^>]*>([\s\S]*)<\/\1>(?:\s*)$/i;
    const match = regex.exec(html);
    if (match) {
      return match[2];
    }
    return html;
  };

  onMount(async () => {
    if (!content) {
      html = undefined
      loading = false
      return
    }


    const renderer = new Renderer()

    const regex = /^<([a-z][a-z0-9]*)[^>]*>([\s\S]*)<\/\1>$/i;
    renderer.link = ({href, title, tokens}) => {
      const htmlContent = marked.parser(tokens)
      return `<a href="${href}" class="marked-link" ${title ? `title="${title}"` : ''}>${removeOutermostTags(htmlContent)}</a>`
    };

    renderer.blockquote = ({tokens}) => {
      const text = marked.parser(tokens)
      return `<blockquote class="marked-callout">${text}</blockquote>`
    };

    renderer.image = ({href, title, text}) => {
      return `<img src="${href}" alt="${text}" class="marked-image" ${title ? `title="${title}"` : ''}>`
    };

    const marked = new Marked({
      async: true,
      gfm: true,
      breaks: false,
      pedantic: false,
      renderer
    })

    const octokit = new Octokit();
    const {data: emojis} = await octokit.rest.emojis.get();
    const emojiOptions = {
      emojis,
      renderer: (token: any) => `<img alt="${token.name}" src="${token.emoji}" class="marked-emoji-img">`
    };
    marked.use(markedEmoji(emojiOptions));

    marked.use(markedXhtml());

    const headingsOptions = {
      prefix: "_nim-io-",
    };

    marked.use(gfmHeadingId(headingsOptions));

    html = await marked.parse(content);
    loading = false
  })

</script>

<div class="marked-root">
    {#if loading}
        <span>Loading</span>
    {:else}
        {#if html}
            {@html html}
        {:else}
            <span>No Content</span>
        {/if}
    {/if}
</div>

<style>
    .marked-root {
        position: relative;
        width: 100%;
        height: 100%;
    }

    :global(.marked-link) {
        display: inline-block;
        width: max-content;
        color: var(--metal);
        text-decoration: underline;
        text-decoration-color: var(--metal-dim);
        text-underline-offset: 0.15em;
    }

    :global(.marked-link:hover) {
        color: var(--metal-bright);
        text-shadow: var(--glow-text);
    }

    :global(em) {
        display: inline-block;
    }

    :global(.marked-callout) {
        display: inline-block;
        border-block: var(--border-hair) solid var(--metal-dim);
        background: linear-gradient(180deg, var(--sheen-soft), transparent);
        padding: var(--space-2) var(--space-5);
        margin: 0;
    }

    :global(.marked-root h1) {
        font-size: var(--text-lg);
    }

    :global(.marked-root h2) {
        font-size: var(--text-md);
    }

    :global(.marked-root h3) {
        font-size: var(--text-sm);
    }

    :global(.marked-root h4) {
        font-size: var(--text-xs);
    }

</style>
