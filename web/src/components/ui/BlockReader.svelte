<script lang="ts">
  import { getFileUrl } from '$lib/api'
  import {
    getColumns,
    getDocument,
    getHeadingNumbers,
    getInline,
    getMeeting,
    getSafeHtml,
    getSlug,
    isAddress,
    type Block,
    type BlockDocument,
    type Inline,
    type Mention,
    type MentionSearch,
    type Reference
  } from '$lib/blocks'
  import BlockReader from './BlockReader.svelte'
  import Glyph, { getMimeGlyph } from './Glyph.svelte'
  import StoredImage from './StoredImage.svelte'

  const {
    value,
    onopen,
    onvote,
    onsearch,
    onasset,
    openAsset,
    headingNumbering = false,
    mine = ''
  }: {
    /** The document to draw, as the model or as markdown. */
    value: string | BlockDocument | null | undefined
    /** Runs when a written reference or a page block is pressed. */
    onopen?: (reference: Reference) => void
    /** Runs with where the block sits and the choice when a poll is answered. */
    onvote?: (index: number, choice: string) => void
    /** Resolves a written reference, so a hovered mention shows what it names. */
    onsearch?: MentionSearch
    /** Runs with the address when a picture or a file is pressed. */
    onasset?: (address: string) => void
    /** Opens the asset a file block holds. */
    openAsset?: (assetId: string) => void
    /** Prefixes every heading with its outline number. */
    headingNumbering?: boolean
    /** The reader's own user id, so their own answer is marked. */
    mine?: string
  } = $props()

  const document = $derived(getDocument(value))
  const numbers = $derived(headingNumbering ? getHeadingNumbers(document.blocks) : {})
  const headings = $derived(document.blocks.filter((block) => block.kind === 'heading'))
  const sides = $derived(
    document.blocks.flatMap((block) => (block.kind === 'toc' && block.options.placement && block.options.placement !== 'inline' ? [block.options.placement] : []))
  )

  let cards = $state<Record<string, Mention | null>>({})
  let shown = $state<string | null>(null)

  function runs(text: string): Inline {
    return getInline(text)
  }

  function paragraphs(text: string): string[] {
    return text.split('\n\n')
  }

  async function hover(mark: '@' | '#', label: string) {
    const key = `${mark}${label.toLowerCase()}`
    shown = key
    if (key in cards || !onsearch) return
    cards[key] = null
    const found = await onsearch(mark, label)
    cards[key] = found.find((one) => one.label.toLowerCase() === label.toLowerCase()) ?? found[0] ?? null
  }

  function leading(block: Block): string | null {
    const held = block.options.own ? block.options.leading : undefined
    return held ? { tight: '1.25', normal: '1.6', relaxed: '1.8', loose: '2' }[held] : null
  }

  function face(block: Block): string | null {
    return block.options.own && block.options.font ? `var(${block.options.font})` : null
  }

  function sizing(block: Block): string | null {
    return block.options.own && block.options.size ? `var(--text-${block.options.size})` : null
  }

  function wrapping(block: Block): string | null {
    return block.options.wrap === 'nowrap' ? 'nowrap' : null
  }

  function balancing(block: Block): string | null {
    return block.options.wrap === 'balance' ? 'balance' : null
  }

  function address(block: Block): string {
    if (block.kind === 'bookmark' || block.kind === 'file') return block.options.url ?? ''
    if (block.kind === 'embed' || block.kind === 'map') return block.text.trim()
    if (block.kind === 'page') return block.options.page ?? ''
    return block.options.src ?? ''
  }

  function nameOf(block: Block): string {
    return block.text || block.options.alt || address(block) || block.kind
  }

  async function diagram(text: string): Promise<string> {
    const { default: mermaid } = await import('mermaid')
    mermaid.initialize({ startOnLoad: false, theme: 'dark' })
    const { svg } = await mermaid.render(`dnd-read-diagram-${Math.random().toString(36).slice(2, 8)}`, text)
    return svg
  }

  const VIEWED: Block['kind'][] = ['image', 'audio', 'video', 'pdf', 'embed', 'map', 'bookmark', 'page']
  const EMPTIED: Block['kind'][] = ['image', 'audio', 'video', 'pdf', 'embed', 'map', 'bookmark', 'file']
</script>

<div class="dnd-read" class:dnd-read-legended={sides.length > 0} class:dnd-read-legended-left={sides.includes('left')} class:dnd-read-legended-right={sides.includes('right')}>
  {#each document.blocks as block, index (block.id)}
    {@const depth = Math.min(Math.max(block.options.depth ?? 0, 0), 5)}
    {#if !EMPTIED.includes(block.kind) || address(block)}
      {#if VIEWED.includes(block.kind) && block.options.view && block.options.view !== 'full'}
        {#if block.options.view === 'link'}
          <p class="dnd-read-line">
            <a class="dnd-read-link" href={address(block)} target="_blank" rel="noreferrer noopener">{nameOf(block)}</a>
          </p>
        {:else if block.options.view === 'icon'}
          <p class="dnd-read-line dnd-read-iconrow">
            <Glyph name={block.kind === 'image' ? 'picture' : block.kind === 'audio' ? 'sound' : 'sources'} size="sm" />
            <a class="dnd-read-link" href={address(block)} target="_blank" rel="noreferrer noopener">{nameOf(block)}</a>
          </p>
        {/if}
      {:else if block.kind === 'divider'}
        <hr class="dnd-read-rule" />
      {:else if block.kind === 'image'}
        <figure class="dnd-read-figure" style:text-align={block.options.align ?? null}>
          {#if onasset}
            <button type="button" class="dnd-read-asset" onclick={() => onasset(block.options.src ?? '')} aria-label={block.options.alt || 'Open the picture'}>
              <StoredImage src={block.options.src ?? ''} alt={block.options.alt ?? ''} />
            </button>
          {:else}
            <StoredImage src={block.options.src ?? ''} alt={block.options.alt ?? ''} />
          {/if}
          {#if block.options.alt}<figcaption>{block.options.alt}</figcaption>{/if}
        </figure>
      {:else if block.kind === 'code'}
        <div class="dnd-read-code">
          <span class="dnd-read-band dnd-label">{block.options.language || 'Code'}</span>
          <pre><code>{block.text}</code></pre>
        </div>
      {:else if block.kind === 'mermaid'}
        <div class="dnd-read-diagram">
          {#await diagram(block.text)}
            <span class="dnd-read-band dnd-label">Drawing the diagram</span>
          {:then svg}
            {@html svg}
          {:catch}
            <pre class="dnd-read-diagram-source">{block.text}</pre>
          {/await}
        </div>
      {:else if block.kind === 'html'}
        <div class="dnd-read-html">{@html getSafeHtml(block.text)}</div>
      {:else if block.kind === 'toc' && block.options.placement && block.options.placement !== 'inline'}
        <div class="dnd-read-legend dnd-read-legend-{block.options.placement}">
          <nav class="dnd-read-toc dnd-read-legend-list" class:dnd-read-toc-bare={block.options.bare} aria-label="Contents">
            {#if block.options.showTitle !== false}<span class="dnd-label dnd-read-toc-name dnd-read-legend-text">Contents</span>{/if}
            {#each headings as head (head.id)}
              <a class="dnd-read-toc-link dnd-read-legend-link dnd-read-toc-link-{Math.min(head.options.level ?? 1, 4)}" href="#{getSlug(head.text)}">
                <span class="dnd-read-legend-mark dnd-read-legend-mark-{Math.min(head.options.level ?? 1, 4)}" aria-hidden="true"></span>
                <span class="dnd-read-legend-text">
                  {#if headingNumbering}<span class="dnd-read-number">{numbers[head.id]}</span>{/if}
                  {head.text}
                </span>
              </a>
            {/each}
          </nav>
        </div>
      {:else if block.kind === 'toc'}
        <nav class="dnd-read-toc" class:dnd-read-toc-bare={block.options.bare} aria-label="Contents">
          {#if block.options.showTitle !== false}<span class="dnd-label dnd-read-toc-name">Contents</span>{/if}
          {#each headings as head (head.id)}
            <a class="dnd-read-toc-link dnd-read-toc-link-{Math.min(head.options.level ?? 1, 4)}" href="#{getSlug(head.text)}">
              {#if headingNumbering}<span class="dnd-read-number">{numbers[head.id]}</span>{/if}
              {head.text}
            </a>
          {/each}
        </nav>
      {:else if block.kind === 'columns'}
        <div class="dnd-read-columns">
          {#each getColumns(block.text) as column, place (place)}
            <div class="dnd-read-column">
              <BlockReader value={column} {onopen} {onsearch} {onasset} {openAsset} {headingNumbering} {mine} />
            </div>
          {/each}
        </div>
      {:else if block.kind === 'heading'}
        <p
          id={getSlug(block.text)}
          class="dnd-heading dnd-read-head dnd-read-head-{block.options.level ?? 1}"
          style:text-align={block.options.align ?? null}
          style:font-family={face(block)}
          style:font-size={sizing(block)}
          style:line-height={leading(block)}
        >
          {#if headingNumbering}<span class="dnd-read-number">{numbers[block.id]}</span>{/if}
          {@render line(block.text)}
        </p>
      {:else if block.kind === 'quote'}
        <blockquote class="dnd-read-quote" style:text-align={block.options.align ?? null} style:font-family={face(block)} style:font-size={sizing(block)} style:line-height={leading(block)}>
          {#each paragraphs(block.text) as paragraph, place (place)}
            <p class="dnd-read-quote-line">{@render line(paragraph)}</p>
          {/each}
        </blockquote>
      {:else if block.kind === 'callout'}
        <aside class="dnd-read-callout" style:text-align={block.options.align ?? null} style:font-family={face(block)} style:font-size={sizing(block)} style:line-height={leading(block)}>
          <span class="dnd-read-callout-sign" aria-hidden="true">!</span>
          <span class="dnd-read-callout-body">
            {#each paragraphs(block.text) as paragraph, place (place)}
              <span class="dnd-read-callout-line">{@render line(paragraph)}</span>
            {/each}
          </span>
        </aside>
      {:else if block.kind === 'meeting'}
        {@const meeting = getMeeting(block.text)}
        <aside class="dnd-read-callout dnd-read-meeting">
          <span class="dnd-read-sign dnd-read-sign-meeting" aria-hidden="true"></span>
          <span class="dnd-read-callout-body">
            <span class="dnd-read-meeting-row"><span class="dnd-label">Date</span>{meeting.date}</span>
            <span class="dnd-read-meeting-row"><span class="dnd-label">Attendees</span>{@render line(meeting.attendees)}</span>
            <span class="dnd-read-meeting-notes">{@render line(meeting.notes)}</span>
          </span>
        </aside>
      {:else if block.kind === 'todo'}
        <p class="dnd-read-task dnd-read-item-{depth}" class:dnd-read-task-done={block.options.done} style:--dnd-depth={depth} style:font-family={face(block)} style:font-size={sizing(block)} style:line-height={leading(block)}>
          <span class="dnd-read-tick" aria-hidden="true"></span>
          <span class="dnd-read-task-text">{@render line(block.text)}</span>
        </p>
      {:else if block.kind === 'toggle'}
        <details class="dnd-read-toggle" open={block.options.open} style:font-family={face(block)} style:font-size={sizing(block)} style:line-height={leading(block)}>
          <summary class="dnd-read-toggle-band">
            <span class="dnd-read-sign dnd-read-sign-toggle" aria-hidden="true"></span>
            {@render line(block.text.split('\n')[0])}
          </summary>
          <div class="dnd-read-toggle-body">
            <BlockReader value={block.text.split('\n').slice(1).join('\n')} {onopen} {onsearch} {onasset} {openAsset} {headingNumbering} {mine} />
          </div>
        </details>
      {:else if block.kind === 'table'}
        <table
          class="dnd-read-table"
          class:dnd-read-narrow={block.options.width === 'narrow'}
          style:margin-inline={block.options.align === 'center' ? 'auto' : block.options.align === 'end' ? 'auto 0' : null}
        >
          <tbody>
            {#each block.text.split('\n').filter(Boolean) as row, index (index)}
              <tr>
                {#each row.split('|') as cell, column (column)}
                  {#if index === 0}
                    <th scope="col">{cell.trim()}</th>
                  {:else}
                    <td>{cell.trim()}</td>
                  {/if}
                {/each}
              </tr>
            {/each}
          </tbody>
        </table>
      {:else if block.kind === 'poll'}
        {@const lines = block.text.split('\n').filter(Boolean)}
        {@const votes = Object.values(block.options.votes ?? {})}
        <section class="dnd-read-poll" aria-label="Poll">
          <p class="dnd-read-poll-ask">
            <span class="dnd-read-sign dnd-read-sign-poll" aria-hidden="true"></span>
            {lines[0] ?? ''}
          </p>
          {#each lines.slice(1) as choice (choice)}
            {@const count = votes.filter((one) => one === choice.trim()).length}
            {@const share = votes.length > 0 ? Math.round((count / votes.length) * 100) : 0}
            <button
              type="button"
              class="dnd-read-poll-pick"
              class:dnd-read-poll-pick-on={mine && block.options.votes?.[mine] === choice.trim()}
              aria-pressed={Boolean(mine && block.options.votes?.[mine] === choice.trim())}
              onclick={() => onvote?.(index, choice.trim())}
            >
              <span class="dnd-read-poll-fill" style:width="{share}%"></span>
              <span class="dnd-read-poll-name">{choice.trim()}</span>
              <span class="dnd-read-poll-count">{count}</span>
            </button>
          {/each}
        </section>
      {:else if block.kind === 'audio'}
        <figure class="dnd-read-sound">
          {#await getFileUrl(block.options.src ?? '') then url}
            {#if url}
              <!-- svelte-ignore a11y_media_has_caption -->
              <audio controls src={url}></audio>
            {/if}
          {/await}
          {#if block.text}<figcaption>{block.text}</figcaption>{/if}
        </figure>
      {:else if block.kind === 'video'}
        <figure class="dnd-read-sound dnd-read-video">
          {#await getFileUrl(block.options.src ?? '') then url}
            {#if url}
              <!-- svelte-ignore a11y_media_has_caption -->
              <video controls src={url}></video>
            {/if}
          {/await}
          {#if block.text}<figcaption>{block.text}</figcaption>{/if}
        </figure>
      {:else if block.kind === 'pdf'}
        <figure class="dnd-read-sound dnd-read-pdf">
          {#await getFileUrl(block.options.src ?? '') then url}
            {#if url}
              <object data={url} type="application/pdf" title={block.text || 'Document'}>
                <a class="dnd-read-link" href={url} target="_blank" rel="noreferrer noopener">{block.text || url}</a>
              </object>
            {/if}
          {/await}
          {#if onasset}
            <button type="button" class="dnd-read-link dnd-read-open" onclick={() => onasset(block.options.src ?? '')}>{block.text || 'Open the document'}</button>
          {:else if block.text}<figcaption>{block.text}</figcaption>{/if}
        </figure>
      {:else if block.kind === 'embed'}
        <div class="dnd-read-frame">
          <iframe src={block.text.trim()} title="Embedded page" loading="lazy" referrerpolicy="no-referrer"></iframe>
        </div>
      {:else if block.kind === 'map'}
        {#if isAddress(block.text)}
          <div class="dnd-read-frame">
            <iframe src={block.text.trim()} title="Map" loading="lazy" referrerpolicy="no-referrer"></iframe>
          </div>
        {:else}
          <figure class="dnd-read-figure">
            <StoredImage src={block.text.trim()} alt="Map" />
          </figure>
        {/if}
      {:else if block.kind === 'page'}
        <button
          type="button"
          class="dnd-read-mark dnd-read-page"
          onclick={() => onopen?.({ mark: '@', label: block.text, id: block.options.page })}
        >
          <span class="dnd-read-sign dnd-read-sign-page" aria-hidden="true"></span>
          <span class="dnd-read-mark-name">{block.text || 'Untitled page'}</span>
        </button>
      {:else if block.kind === 'file'}
        {#if block.options.assetId}
          <button type="button" class="dnd-read-mark dnd-read-file" onclick={() => openAsset?.(block.options.assetId ?? '')}>
            <span class="dnd-read-sign" aria-hidden="true"><Glyph name={getMimeGlyph(block.options.mimeType ?? '')} size="sm" /></span>
            <span class="dnd-read-mark-name">{block.options.name || 'File'}</span>
          </button>
        {:else}
          <a class="dnd-read-mark dnd-read-file" href={block.options.url ?? ''} target="_blank" rel="noreferrer noopener">
            <span class="dnd-read-sign" aria-hidden="true"><Glyph name={getMimeGlyph(block.options.mimeType ?? '')} size="sm" /></span>
            <span class="dnd-read-mark-name">{block.options.name || 'File'}</span>
          </a>
        {/if}
      {:else if block.kind === 'bookmark'}
        <a class="dnd-read-mark" href={block.options.url ?? ''} target="_blank" rel="noreferrer noopener">
          {#if block.options.image}
            <span class="dnd-read-mark-picture"><StoredImage src={block.options.image} alt="" /></span>
          {:else}
            <span class="dnd-read-sign dnd-read-sign-bookmark" aria-hidden="true"></span>
          {/if}
          <span class="dnd-read-mark-text">
            <span class="dnd-read-mark-name">{block.text || block.options.url}</span>
            {#if block.options.description}<span class="dnd-read-mark-note">{block.options.description}</span>{/if}
            <span class="dnd-read-mark-where">{block.options.url}</span>
          </span>
        </a>
      {:else if block.kind === 'bullet'}
        <p class="dnd-read-item dnd-read-item-bullet dnd-read-item-{depth}" style:--dnd-depth={depth} style:font-family={face(block)} style:font-size={sizing(block)} style:line-height={leading(block)}>{@render line(block.text)}</p>
      {:else if block.kind === 'number'}
        <p class="dnd-read-item dnd-read-item-number dnd-read-item-{depth}" style:--dnd-depth={depth} style:font-family={face(block)} style:font-size={sizing(block)} style:line-height={leading(block)}>{@render line(block.text)}</p>
      {:else}
        <p
          class="dnd-read-line"
          class:dnd-read-narrow={block.options.width === 'narrow'}
          style:text-align={block.options.align ?? null}
          style:line-height={leading(block)}
          style:white-space={wrapping(block)}
          style:text-wrap={balancing(block)}
          style:font-family={face(block)}
          style:font-size={sizing(block)}
        >
          {@render line(block.text)}
        </p>
      {/if}
    {/if}
  {/each}
</div>

{#snippet marked(text: string, marks: { bold?: boolean; italic?: boolean; code?: boolean; strike?: boolean; link?: string } | undefined)}
  {#if marks?.link}
    <a class="dnd-read-link" href={marks.link} target="_blank" rel="noreferrer noopener">{@render marked(text, { ...marks, link: undefined })}</a>
  {:else if marks?.strike}
    <s>{@render marked(text, { ...marks, strike: false })}</s>
  {:else if marks?.italic}
    <em>{@render marked(text, { ...marks, italic: false })}</em>
  {:else if marks?.bold}
    <strong>{@render marked(text, { ...marks, bold: false })}</strong>
  {:else if marks?.code}
    <code class="dnd-read-code-span">{text}</code>
  {:else}{text}{/if}
{/snippet}

{#snippet line(text: string)}
  {#each runs(text) as run, index (index)}
    {#if 'ref' in run && run.ref === 'break'}
      <br />
    {:else if 'ref' in run}
      {@const key = `${run.mark}${run.label.toLowerCase()}`}
      <span class="dnd-read-hold">
        <button
          type="button"
          class="dnd-read-ref dnd-read-ref-{run.mark === '@' ? 'who' : 'tag'}"
          onclick={() => onopen?.({ mark: run.mark, label: run.label, id: run.id ?? cards[key]?.id })}
          onpointerenter={() => hover(run.mark, run.label)}
          onpointerleave={() => (shown = null)}
          onfocus={() => hover(run.mark, run.label)}
          onblur={() => (shown = null)}
        >
          {run.mark}{run.label}
        </button>
        {#if shown === key && onsearch}
          {@const card = cards[key]}
          <span class="dnd-read-card" role="tooltip">
            {#if card?.icon}
              <span class="dnd-read-card-icon"><StoredImage src={card.icon} alt="" /></span>
            {/if}
            <span class="dnd-read-card-name">{card?.label ?? run.label}</span>
            {#if card === null}<span class="dnd-read-card-note">Looking</span>{/if}
          </span>
        {/if}
      </span>
    {:else}
      {@render marked(run.text, run.marks)}
    {/if}
  {/each}
{/snippet}

<style>
  .dnd-read {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    min-width: 0;
    color: var(--ink);
    counter-reset: dnd-read-count-0 dnd-read-count-1 dnd-read-count-2 dnd-read-count-3;
  }

  .dnd-read > :not(.dnd-read-item):not(.dnd-read-task) {
    counter-reset: dnd-read-count-0;
  }

  .dnd-read-line,
  .dnd-read-item {
    margin: 0;
    line-height: 1.6;
  }

  .dnd-read-narrow {
    max-width: 65ch;
  }

  .dnd-read-head {
    margin: var(--space-3) 0 0;
    color: var(--metal-bright);
    text-shadow: 0 1px 0 var(--keyline), 0 0 10px color-mix(in srgb, var(--ember-glow) 50%, transparent);
  }

  .dnd-read-head-1 {
    margin-block-start: var(--space-4);
    font-size: var(--text-2xl);
  }

  .dnd-read-head-2 {
    font-size: var(--text-xl);
  }

  .dnd-read-head-3 {
    font-size: var(--text-lg);
  }

  .dnd-read-head-4,
  .dnd-read-head-5,
  .dnd-read-head-6 {
    font-size: var(--text-md);
  }

  .dnd-read-number {
    margin-inline-end: var(--space-2);
    font-family: var(--font-figures);
    font-size: 0.7em;
    color: var(--metal);
  }

  .dnd-read-item,
  .dnd-read-task {
    --dnd-depth: 0;
    padding-inline-start: calc(var(--space-5) * (1 + var(--dnd-depth)));
    position: relative;
  }

  .dnd-read-item::before {
    position: absolute;
    inset-inline-start: calc(var(--space-5) * var(--dnd-depth));
    width: var(--space-4);
    text-align: end;
    color: var(--metal);
  }

  .dnd-read-item-bullet::before {
    content: '•';
  }

  .dnd-read-item-1.dnd-read-item-bullet::before {
    content: '◦';
  }

  .dnd-read-item-2.dnd-read-item-bullet::before,
  .dnd-read-item-3.dnd-read-item-bullet::before,
  .dnd-read-item-4.dnd-read-item-bullet::before,
  .dnd-read-item-5.dnd-read-item-bullet::before {
    content: '▪';
  }

  .dnd-read-item-number::before {
    font-family: var(--font-figures);
    font-size: var(--text-xs);
  }

  .dnd-read-item-0 {
    counter-reset: dnd-read-count-1;
  }

  .dnd-read-item-1 {
    counter-reset: dnd-read-count-2;
  }

  .dnd-read-item-2 {
    counter-reset: dnd-read-count-3;
  }

  .dnd-read-item-number.dnd-read-item-0::before {
    content: counter(dnd-read-count-0) '.';
    counter-increment: dnd-read-count-0;
  }

  .dnd-read-item-number.dnd-read-item-1::before {
    content: counter(dnd-read-count-1, lower-alpha) '.';
    counter-increment: dnd-read-count-1;
  }

  .dnd-read-item-number.dnd-read-item-2::before {
    content: counter(dnd-read-count-2, lower-roman) '.';
    counter-increment: dnd-read-count-2;
  }

  .dnd-read-item-number.dnd-read-item-3::before,
  .dnd-read-item-number.dnd-read-item-4::before,
  .dnd-read-item-number.dnd-read-item-5::before {
    content: counter(dnd-read-count-3) '.';
    counter-increment: dnd-read-count-3;
  }

  .dnd-read-sign {
    flex: none;
    display: flex;
    align-items: center;
    justify-content: center;
    width: var(--space-5);
    height: var(--space-5);
    border: var(--border-hair) solid var(--metal);
    border-radius: var(--radius-pill);
    background: radial-gradient(circle at 38% 30%, var(--stone-light) 0%, var(--stone) 45%, var(--stone-dark) 100%);
    box-shadow: 0 0 0 1px var(--keyline), inset 0 1px 0 var(--sheen), inset 0 -1px 2px var(--shade-hard);
    text-shadow: 0 1px 0 var(--keyline);
    font-family: var(--font-display);
    font-size: var(--text-xs);
    font-style: normal;
    font-weight: 600;
    line-height: 1;
    color: var(--metal);
  }

  .dnd-read-sign-meeting::before {
    content: '◷';
  }

  .dnd-read-sign-poll::before {
    content: '?';
  }

  .dnd-read-sign-bookmark::before {
    content: '↗';
  }

  .dnd-read-sign-page::before {
    content: '¶';
  }

  .dnd-read-sign-toggle {
    width: var(--space-4);
    border: none;
    background: none;
    box-shadow: none;
    font-family: var(--font-body);
    color: var(--ink-dim);
  }

  .dnd-read-sign-toggle::before {
    content: '▶';
    transition: transform 0.15s ease;
  }

  .dnd-read-toggle[open] .dnd-read-sign-toggle::before {
    transform: rotate(90deg);
  }

  .dnd-read-quote {
    display: flex;
    flex-direction: column;
    gap: var(--space-0);
    margin: 0;
    padding: var(--space-1) var(--space-3);
    border-radius: var(--radius-sm);
    background: color-mix(in srgb, var(--metal) 10%, transparent);
    color: var(--ink-dim);
  }

  .dnd-read-quote-line {
    margin: 0;
    line-height: 1.6;
  }

  .dnd-read-code-span {
    padding: 0 var(--space-1);
    border-radius: var(--radius-sm);
    background: var(--ground-deep);
    box-shadow: 0 0 0 1px var(--keyline);
    font-family: var(--font-mono);
    font-size: 0.9em;
  }

  .dnd-read-toc-bare {
    padding: 0;
    border: none;
    background: none;
    box-shadow: none;
  }

  .dnd-read-task {
    display: flex;
    align-items: flex-start;
    gap: var(--space-2);
    margin: 0;
    line-height: 1.6;
    padding-inline-start: calc(var(--space-5) * var(--dnd-depth));
  }

  .dnd-read-task-done {
    color: var(--ink-faint);
  }

  .dnd-read-task-done .dnd-read-task-text {
    text-decoration: line-through;
  }

  .dnd-read-tick {
    flex: none;
    display: flex;
    align-items: center;
    height: 1.6em;
  }

  .dnd-read-tick::before {
    content: '';
    display: flex;
    align-items: center;
    justify-content: center;
    width: var(--space-4);
    height: var(--space-4);
    border: var(--border-hair) solid var(--metal-dim);
    border-radius: var(--radius-sm);
    background: var(--ground-deep);
    font-size: var(--text-xs);
    line-height: 1;
    color: var(--ground-deep);
  }

  .dnd-read-task-done .dnd-read-tick::before {
    border-color: var(--metal);
    background: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath d='M5 12.5 10 17.5 19 6.5' fill='none' stroke='%230b0703' stroke-width='3' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E") center / 80% no-repeat, var(--metal);
  }

  .dnd-read-toggle-band {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    list-style: none;
    font-family: var(--font-display);
    color: var(--metal-bright);
    cursor: pointer;
  }

  .dnd-read-toggle-band::-webkit-details-marker {
    display: none;
  }

  .dnd-read-toggle-body {
    padding: var(--space-1) 0 var(--space-1) calc(var(--space-4) + var(--space-2));
  }

  .dnd-read-table {
    width: 100%;
    table-layout: fixed;
    border-collapse: collapse;
    border: var(--border-hair) solid var(--metal-dim);
    font-size: var(--text-xs);
  }

  .dnd-read-table.dnd-read-narrow {
    width: auto;
    min-width: 50%;
  }

  .dnd-read-table th,
  .dnd-read-table td {
    padding: var(--space-1) var(--space-2);
    border: var(--border-hair) solid var(--metal-dim);
    text-align: start;
    vertical-align: top;
  }

  .dnd-read-table th {
    border-bottom: var(--border-width) solid var(--metal);
    background:
      linear-gradient(180deg, color-mix(in srgb, var(--stone-light) 20%, transparent) 0%, color-mix(in srgb, var(--keyline) 45%, transparent) 60%, color-mix(in srgb, var(--keyline) 65%, transparent) 100%),
      var(--texture-noise),
      var(--stone);
    box-shadow: var(--bevel-up);
    font-family: var(--font-display);
    color: var(--metal-bright);
    text-shadow: 0 1px 0 var(--keyline);
  }

  .dnd-read-table tr:nth-child(odd) > td {
    background: var(--ground-veil);
  }

  .dnd-read-poll {
    display: grid;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-3);
    border: none;
    border-radius: var(--radius-sm);
    background: var(--texture-noise), linear-gradient(180deg, var(--ground-raised) 0%, var(--ground-deep) 100%);
    box-shadow: var(--rim-thin), inset 0 0 16px 2px var(--shade-hard);
  }

  .dnd-read-poll-ask {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    margin: 0;
    font-family: var(--font-display);
    color: var(--metal-bright);
  }

  .dnd-read-poll-pick {
    position: relative;
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: center;
    gap: var(--space-3);
    overflow: hidden;
    padding: var(--space-2) var(--space-3);
    border: var(--border-hair) solid var(--metal-dim);
    border-radius: var(--radius-sm);
    background: none;
    text-align: start;
    color: var(--ink);
    cursor: pointer;
  }

  .dnd-read-poll-pick-on {
    border-color: var(--metal-bright);
    box-shadow: inset 0 0 10px var(--ember-glow);
  }

  .dnd-read-poll-fill {
    position: absolute;
    inset-inline-start: 0;
    top: 0;
    bottom: 0;
    background: color-mix(in srgb, var(--metal) 22%, transparent);
  }

  .dnd-read-poll-name,
  .dnd-read-poll-count {
    position: relative;
  }

  .dnd-read-poll-count {
    font-family: var(--font-figures);
    font-size: var(--text-xs);
    color: var(--ink-faint);
  }

  .dnd-read-sound {
    margin: 0;
    display: grid;
    gap: var(--space-1);
    padding: var(--space-2) var(--space-3);
    border: none;
    border-radius: var(--radius-sm);
    background: var(--texture-noise), linear-gradient(180deg, var(--ground-raised) 0%, var(--ground-deep) 100%);
    box-shadow: var(--rim-thin), inset 0 0 16px 2px var(--shade-hard);
  }

  .dnd-read-sound audio,
  .dnd-read-sound video,
  .dnd-read-sound object {
    width: 100%;
  }

  .dnd-read-video video {
    border-radius: var(--radius-md);
    background: var(--ground-deep);
  }

  .dnd-read-pdf object {
    height: calc(var(--space-8) * 6);
    border-radius: var(--radius-md);
    background: var(--ground-deep);
  }

  .dnd-read-sound figcaption {
    font-size: var(--text-sm);
    color: var(--ink);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .dnd-read-frame {
    overflow: hidden;
    border: var(--border-width) solid var(--metal-dim);
    border-radius: var(--radius-sm);
    background: var(--ground-deep);
    box-shadow: 0 0 0 1px var(--keyline), var(--shadow-sm);
  }

  .dnd-read-frame iframe {
    display: block;
    width: 100%;
    height: calc(var(--space-8) * 5);
    border: none;
  }

  .dnd-read-mark {
    display: flex;
    align-items: flex-start;
    gap: var(--space-2);
    width: 100%;
    padding: var(--space-2) var(--space-3);
    border: none;
    border-radius: var(--radius-sm);
    background: var(--texture-noise), linear-gradient(180deg, var(--ground-raised) 0%, var(--ground-deep) 100%);
    box-shadow: var(--rim-thin), inset 0 0 14px 2px var(--shade-hard);
    transition: box-shadow 0.15s ease, filter 0.15s ease;
    font: inherit;
    text-align: start;
    text-decoration: none;
    color: var(--ink);
    cursor: pointer;
    transition: border-color 0.15s ease, box-shadow 0.15s ease;
  }

  .dnd-read-mark:hover {
    box-shadow: var(--rim), inset 0 0 14px 2px var(--shade-hard), 0 0 12px var(--ember-glow);
    filter: brightness(1.06);
  }

  .dnd-read-page,
  .dnd-read-file {
    align-items: center;
  }

  .dnd-read-mark-picture {
    flex: none;
    width: calc(var(--space-8) + var(--space-5));
    overflow: hidden;
    border-radius: var(--radius-md);
  }

  .dnd-read-mark-picture :global(img) {
    display: block;
    width: 100%;
  }

  .dnd-read-mark-text {
    display: grid;
    gap: var(--space-1);
    min-width: 0;
  }

  .dnd-read-mark-name {
    font-family: var(--font-display);
    color: var(--metal-bright);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .dnd-read-mark-note {
    font-size: var(--text-sm);
    color: var(--ink-dim);
  }

  .dnd-read-mark-where {
    font-family: var(--font-mono);
    font-size: var(--text-xs);
    color: var(--ink-faint);
    overflow-wrap: anywhere;
  }

  .dnd-read-callout {
    display: flex;
    align-items: flex-start;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-3);
    border: none;
    border-radius: var(--radius-sm);
    background: color-mix(in srgb, var(--ember) 10%, transparent);
  }

  .dnd-read-callout-sign {
    flex: none;
    display: flex;
    align-items: center;
    justify-content: center;
    width: var(--space-4);
    line-height: 1.6;
    font-family: var(--font-display);
    font-weight: 700;
    color: var(--ember);
  }

  .dnd-read-callout-line {
    display: block;
  }

  .dnd-read-callout-body {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: var(--space-0);
    min-width: 0;
    line-height: 1.6;
  }

  .dnd-read-meeting .dnd-read-callout-body {
    display: grid;
    gap: var(--space-1);
  }

  .dnd-read-meeting-row {
    display: flex;
    align-items: baseline;
    gap: var(--space-2);
  }

  .dnd-read-meeting-notes {
    white-space: pre-wrap;
  }

  .dnd-read-code,
  .dnd-read-diagram {
    display: grid;
    overflow: hidden;
    border: none;
    border-radius: var(--radius-sm);
    background: var(--texture-noise), linear-gradient(180deg, var(--ground-deep) 0%, var(--keyline) 100%);
    box-shadow: var(--rim-thin), var(--bevel-down), inset 0 0 18px 2px var(--shade-hard);
  }

  .dnd-read-diagram {
    padding: var(--space-3);
    justify-items: center;
    overflow-x: auto;
  }

  .dnd-read-diagram :global(svg) {
    max-width: 100%;
    height: auto;
  }

  .dnd-read-diagram-source {
    margin: 0;
    font-family: var(--font-mono);
    font-size: var(--text-xs);
    color: var(--state-bad);
  }

  .dnd-read-html {
    min-width: 0;
    overflow-x: auto;
    line-height: 1.6;
  }

  .dnd-read-band {
    padding: var(--space-1) var(--space-3);
    margin: 0.1875rem 0.1875rem 0;
    border-bottom: none;
    background:
      linear-gradient(180deg, color-mix(in srgb, var(--stone-light) 20%, transparent) 0%, color-mix(in srgb, var(--keyline) 45%, transparent) 60%, color-mix(in srgb, var(--keyline) 65%, transparent) 100%),
      var(--texture-noise),
      var(--stone);
    box-shadow: var(--bevel-up), 0 1px 0 var(--metal-dim), 0 2px 0 var(--keyline);
    color: var(--metal);
    text-shadow: 0 1px 0 var(--keyline);
  }

  .dnd-read-code pre {
    margin: 0;
    padding: var(--space-3);
    overflow-x: auto;
    font-family: var(--font-mono);
    font-size: var(--text-xs);
    line-height: 1.6;
    color: var(--ink);
  }

  .dnd-read-toc {
    display: grid;
    gap: var(--space-1);
    padding: var(--space-2) var(--space-3);
    border: none;
    border-radius: var(--radius-sm);
    background: var(--texture-noise), linear-gradient(180deg, var(--ground-raised) 0%, var(--ground-deep) 100%);
    box-shadow: var(--rim-thin), inset 0 0 16px 2px var(--shade-hard);
  }

  .dnd-read-toc-name {
    color: var(--metal);
    text-shadow: 0 1px 0 var(--keyline);
  }

  .dnd-read-toc-link {
    color: var(--ink);
    text-decoration: none;
  }

  .dnd-read-toc-link:hover {
    color: var(--metal-bright);
    text-shadow: var(--glow-text);
  }

  .dnd-read-toc-link-2 {
    padding-inline-start: var(--space-4);
  }

  .dnd-read-toc-link-3 {
    padding-inline-start: var(--space-6);
  }

  .dnd-read-toc-link-4 {
    padding-inline-start: var(--space-7);
  }

  .dnd-read-legended {
    position: relative;
    container-type: inline-size;
  }

  .dnd-read-legended > * {
    --dnd-legend: clamp(calc(var(--space-8) * 2.5), 22cqi, calc(var(--space-8) * 4));
  }

  .dnd-read-legended-left > :not(.dnd-read-legend) {
    margin-inline-start: calc(var(--dnd-legend) + var(--space-4));
  }

  .dnd-read-legended-right > :not(.dnd-read-legend) {
    margin-inline-end: calc(var(--dnd-legend) + var(--space-4));
  }

  .dnd-read-legend {
    position: absolute;
    inset-block: 0;
    z-index: 1;
    width: var(--dnd-legend);
  }

  .dnd-read-legend-left {
    inset-inline-start: 0;
  }

  .dnd-read-legend-right {
    inset-inline-end: 0;
  }

  .dnd-read-legend-list {
    position: sticky;
    top: var(--space-4);
    max-height: calc(100dvh - var(--space-4) * 2);
    overflow-y: auto;
  }

  .dnd-read-legend-link {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  .dnd-read-legend-mark {
    display: none;
    flex: none;
    height: var(--border-width);
    width: var(--space-5);
    border-radius: var(--radius-pill);
    background: var(--metal-dim);
  }

  .dnd-read-legend-mark-2 {
    width: var(--space-4);
  }

  .dnd-read-legend-mark-3 {
    width: var(--space-3);
  }

  .dnd-read-legend-mark-4 {
    width: var(--space-2);
  }

  @container (max-width: 52rem) {
    .dnd-read-legended > * {
      --dnd-legend: var(--space-7);
    }

    .dnd-read-legend-link {
      padding-inline-start: 0;
    }

    .dnd-read-legend-mark {
      display: block;
    }

    .dnd-read-legend-text {
      display: none;
    }

    .dnd-read-legend:hover,
    .dnd-read-legend:focus-within {
      width: clamp(calc(var(--space-8) * 2.5), 40%, calc(var(--space-8) * 4));
    }

    .dnd-read-legend:hover .dnd-read-legend-mark,
    .dnd-read-legend:focus-within .dnd-read-legend-mark {
      display: none;
    }

    .dnd-read-legend:hover .dnd-read-legend-text,
    .dnd-read-legend:focus-within .dnd-read-legend-text {
      display: inline;
    }

    .dnd-read-legend:hover .dnd-read-toc-link-2,
    .dnd-read-legend:focus-within .dnd-read-toc-link-2 {
      padding-inline-start: var(--space-4);
    }

    .dnd-read-legend:hover .dnd-read-toc-link-3,
    .dnd-read-legend:focus-within .dnd-read-toc-link-3 {
      padding-inline-start: var(--space-6);
    }

    .dnd-read-legend:hover .dnd-read-toc-link-4,
    .dnd-read-legend:focus-within .dnd-read-toc-link-4 {
      padding-inline-start: var(--space-7);
    }
  }

  .dnd-read-columns {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(calc(var(--space-8) * 3), 1fr));
    gap: var(--space-4);
  }

  .dnd-read-column {
    min-width: 0;
  }

  .dnd-read-rule {
    width: 100%;
    height: var(--border-width);
    margin: var(--space-4) 0;
    border: none;
    background: linear-gradient(90deg, transparent, var(--metal-dim) 15%, var(--metal) 50%, var(--metal-dim) 85%, transparent);
    box-shadow: 0 1px 0 var(--keyline);
  }

  .dnd-read-figure {
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }

  .dnd-read-asset {
    display: block;
    width: 100%;
    padding: 0;
    border: none;
    background: none;
    cursor: zoom-in;
  }

  .dnd-read-figure :global(img) {
    display: block;
    width: 100%;
    border: var(--border-width) solid var(--metal-dim);
    border-radius: var(--radius-sm);
    box-shadow: 0 0 0 1px var(--keyline), var(--shadow-sm);
  }

  .dnd-read-figure figcaption {
    font-size: var(--text-xs);
    font-style: italic;
    color: var(--ink-faint);
  }

  .dnd-read-iconrow {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    color: var(--metal);
  }

  .dnd-read-link,
  .dnd-read-open {
    padding: 0;
    border: none;
    background: none;
    font: inherit;
    color: var(--metal-bright);
    text-decoration: underline;
    cursor: pointer;
  }

  .dnd-read-hold {
    position: relative;
    display: inline-block;
  }

  .dnd-read-ref {
    padding: 0 var(--space-1);
    border: none;
    border-radius: var(--radius-sm);
    background: none;
    font: inherit;
    cursor: pointer;
  }

  .dnd-read-ref-who {
    color: var(--ember);
  }

  .dnd-read-ref-tag {
    color: var(--verdigris);
  }

  .dnd-read-ref:hover {
    background: color-mix(in srgb, var(--metal) 20%, transparent);
  }

  .dnd-read-ref:focus-visible {
    outline: none;
    box-shadow: var(--focus-ring);
  }

  .dnd-read-card {
    position: absolute;
    top: 100%;
    inset-inline-start: 0;
    z-index: 5;
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-1) var(--space-2);
    border: none;
    border-radius: var(--radius-sm);
    background: var(--texture-noise), linear-gradient(180deg, var(--ground-raised) 0%, var(--ground-deep) 100%);
    box-shadow: var(--rim-thin), inset 0 0 12px 2px var(--shade-hard), var(--shadow-lg);
    white-space: nowrap;
    font-size: var(--text-sm);
    color: var(--ink);
    pointer-events: none;
  }

  .dnd-read-card-icon {
    flex: none;
    width: var(--space-5);
    height: var(--space-5);
    overflow: hidden;
    border-radius: var(--radius-pill);
  }

  .dnd-read-card-icon :global(img) {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .dnd-read-card-name {
    font-family: var(--font-display);
    color: var(--metal-bright);
  }

  .dnd-read-card-note {
    font-size: var(--text-xs);
    font-style: italic;
    color: var(--ink-faint);
  }
</style>
