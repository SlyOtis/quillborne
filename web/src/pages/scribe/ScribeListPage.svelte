<script lang="ts">
  import { navigate } from 'sly-svelte-location-router'
  import { getMediaUrl, getObjectAssets } from '$lib/api'
  import { getTrail, putOne, type Resource } from '$lib/resources'
  import { postNotice } from '$lib/stores/ui.store'
  import Tree from '$components/ui/Tree.svelte'
  import Row from '$components/ui/Row.svelte'
  import Chip from '$components/ui/Chip.svelte'
  import FileExplorer, { type FileItem, type FileMoveTarget, type FileOption } from '$components/ui/FileExplorer.svelte'
  import { getScribe, type Shelf } from '../ScribePage.svelte'

  const scribe = getScribe()

  let pictures = $state(new Map<string, string>())
  const asked = new Set<string>()

  const targets = $derived<FileMoveTarget[]>(
    scribe.table.pages.map((one) => ({
      id: one.id,
      label: one.title,
      path: getTrail(scribe.table.pages, one.id).slice(0, -1).map((step) => step.title).join(' / ') || undefined
    }))
  )

  $effect(() => {
    for (const shelf of scribe.tiles) {
      for (const one of shelf.kids) {
        if (asked.has(one.id)) continue
        asked.add(one.id)
        void getPicture(one.id)
      }
    }
  })

  async function getPicture(id: string) {
    try {
      const held = (await getObjectAssets('resource', id)) ?? []
      const picture = held.find((link) => link.asset?.mime_type.startsWith('image/'))
      if (picture) pictures = new Map(pictures).set(id, getMediaUrl(picture.asset_id))
    } catch (reason) {
      postNotice(reason instanceof Error ? reason.message : String(reason))
    }
  }

  function tileOf(one: Resource): FileItem {
    const kids = scribe.countKids(one)
    return {
      id: one.id,
      name: one.title,
      kind: kids > 0 ? 'folder' : 'file',
      glyph: 'scroll',
      size: kids > 0 ? `${kids} sub pages` : undefined,
      thumbnailUrl: pictures.get(one.id) ?? null,
      updatedAt: one.created_at ?? undefined,
      tags: one.tags
    }
  }

  function pageOf(item: FileItem): Resource | null {
    return scribe.table.pages.find((one) => one.id === item.id) ?? null
  }

  async function write(next: Resource) {
    const owner = scribe.owner
    if (!owner) return
    scribe.putPage(next)
    scribe.table.saving = true
    try {
      await putOne(owner, 'entries', next.id, { ...next })
    } catch (reason) {
      postNotice(reason instanceof Error ? reason.message : String(reason))
    } finally {
      scribe.table.saving = false
    }
  }

  function rename(item: FileItem, title: string) {
    const one = pageOf(item)
    if (one) void write({ ...one, title })
  }

  function move(item: FileItem, targetId: string | null) {
    const one = pageOf(item)
    if (!one || targetId === null || targetId === one.id) return
    if (getTrail(scribe.table.pages, targetId).some((step) => step.id === one.id)) return
    void write({ ...one, parent_id: targetId })
  }

  function options(item: FileItem, defaults: FileOption[]): FileOption[] {
    const one = pageOf(item)
    if (!one) return defaults
    return [...defaults, { title: 'Open in lore', glyph: 'forward', run: () => navigate(scribe.loreOf(one)) }]
  }
</script>

{#snippet divide(shelf: Shelf)}
  {#if shelf.title}
    <header class="scribe-divide">
      <h2 class="dnd-label scribe-divide-name">{shelf.title}</h2>
      <span class="scribe-divide-note">{shelf.kids.length}</span>
      <span class="scribe-divide-run"></span>
    </header>
  {/if}
{/snippet}

<section class="scribe-main" aria-label="Pages">
  {#if scribe.table.loading}
    <div class="dnd-loading"><span class="dnd-spinner"></span></div>
  {:else if scribe.table.pages.length === 0}
    <p class="scribe-empty">No page written yet. Press New page to begin.</p>
  {:else if scribe.shown.length === 0}
    <p class="scribe-empty">No page matches.</p>
  {:else if scribe.view === 'grid'}
    {#each scribe.tiles as shelf (shelf.title)}
      <section class="scribe-shelf" aria-label={shelf.title || 'Pages'}>
        {@render divide(shelf)}
        <FileExplorer
          items={shelf.kids.map(tileOf)}
          showTags={shelf.kids.some((one) => one.tags.length > 0)}
          moveTargets={targets}
          moveLabel="Move under"
          moveSearchPlaceholder="Search the pages..."
          itemOptions={options}
          onopen={(item) => scribe.show(item.id)}
          onrename={rename}
          onmove={move}
        />
      </section>
    {/each}
  {:else if scribe.view === 'tree'}
    <Tree rows={scribe.rows} on="" onopen={(id) => scribe.show(id)} />
  {:else}
    {#each scribe.lines as shelf (shelf.title)}
      <section class="scribe-shelf" aria-label={shelf.title || 'Pages'}>
        {@render divide(shelf)}
        <div class="scribe-list">
          {#each shelf.kids as one (one.id)}
            {@const above = scribe.parentOf(one)}
            {@const kids = scribe.countKids(one)}
            <Row
              title={one.title}
              sub={one.description || undefined}
              mark={kids > 0 ? `${kids} sub pages` : undefined}
              image={one.image || undefined}
              onclick={() => scribe.show(one.id)}
              onopen={() => navigate(scribe.loreOf(one))}
            >
              {#each one.tags as tag (tag)}<Chip still glyph="tag">#{tag}</Chip>{/each}
              {#if above}<span>Under {above.title}</span>{/if}
              {#if scribe.written(one)}<span>{scribe.written(one)}</span>{/if}
            </Row>
          {/each}
        </div>
      </section>
    {/each}
  {/if}
</section>

<style>
  .scribe-main {
    display: flex;
    flex-direction: column;
    gap: var(--space-5);
    min-width: 0;
  }

  .scribe-shelf {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    min-width: 0;
  }

  .scribe-divide {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    min-width: 0;
  }

  .scribe-divide-name {
    margin: 0;
    color: var(--metal);
  }

  .scribe-divide-note {
    font-family: var(--font-figures);
    font-size: var(--text-xs);
    color: var(--ink-faint);
  }

  .scribe-divide-run {
    flex: 1;
    min-width: 0;
    block-size: var(--border-hair);
    background: linear-gradient(90deg, var(--metal-dim), transparent);
  }

  .scribe-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    min-width: 0;
  }

  .scribe-empty {
    margin: 0;
    padding: var(--space-4) 0;
    font-style: italic;
    color: var(--ink-faint);
  }
</style>
