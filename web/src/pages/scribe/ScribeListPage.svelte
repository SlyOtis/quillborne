<script lang="ts">
  import { navigate } from 'sly-svelte-location-router'
  import { getAssetTab, getMediaUrl, getObjectAssets, getSize } from '$lib/api'
  import type { ObjectAsset } from '$lib/api/types'
  import { getTrail, putOne, type Resource } from '$lib/resources'
  import { postNotice } from '$lib/stores/ui.store'
  import Chip from '$components/ui/Chip.svelte'
  import FileExplorer, { type FileItem, type FileMoveTarget, type FileOption } from '$components/ui/FileExplorer.svelte'
  import Glyph from '$components/ui/Glyph.svelte'
  import IconBtn from '$components/ui/IconBtn.svelte'
  import Table, { type TableRow } from '$components/ui/Table.svelte'
  import Tree, { type TreeRow } from '$components/ui/Tree.svelte'
  import { getScribe } from '../ScribePage.svelte'

  const scribe = getScribe()

  let held = $state(new Map<string, ObjectAsset[]>())
  let preview = $state<FileItem | null>(null)
  const asked = new Set<string>()

  const targets = $derived<FileMoveTarget[]>([
    { id: '', label: 'Scribe' },
    ...scribe.table.pages.map((one) => ({
      id: one.id,
      label: one.title,
      path: getTrail(scribe.table.pages, one.id).slice(0, -1).map((step) => step.title).join(' / ') || undefined
    }))
  ])

  const items = $derived<FileItem[]>([
    ...(scribe.inside ? [{ id: '', name: 'Scribe', kind: 'folder', root: true } satisfies FileItem] : []),
    ...scribe.roots.map(tileOf),
    ...scribe.roots.flatMap((one) => (held.get(one.id) ?? []).flatMap((link) => (link.asset ? [fileOf(link.asset)] : [])))
  ])

  const lines = $derived<TableRow[]>(
    scribe.shown.map((one) => ({
      id: one.id,
      title: one.title,
      tags: one.tags,
      under: scribe.parentOf(one)?.title ?? '',
      written: scribe.written(one)
    }))
  )

  $effect(() => {
    for (const one of scribe.roots) {
      if (asked.has(one.id)) continue
      asked.add(one.id)
      void getAttachments(one.id)
    }
  })

  async function getAttachments(id: string) {
    try {
      const links = (await getObjectAssets('resource', id)) ?? []
      held = new Map(held).set(id, links)
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
      type: 'Page',
      glyph: 'scroll',
      size: kids > 0 ? `${kids} sub pages` : undefined,
      updatedAt: one.created_at ?? undefined,
      tags: one.tags
    }
  }

  function fileOf(asset: NonNullable<ObjectAsset['asset']>): FileItem {
    const url = getMediaUrl(asset.id)
    return {
      id: asset.id,
      name: asset.name,
      kind: 'file',
      url,
      mimeType: asset.mime_type,
      thumbnailUrl: asset.mime_type.startsWith('image/') ? url : null,
      size: asset.size_bytes ? getSize(asset.size_bytes) : undefined,
      updatedAt: asset.updated_at,
      tags: (asset.tags ?? []).map((tag) => tag.name)
    }
  }

  function pageOf(item: { id: string }): Resource | null {
    return scribe.table.pages.find((one) => one.id === item.id) ?? null
  }

  function wordsOf(row: TreeRow | TableRow): string[] {
    return Array.isArray(row.tags) ? row.tags.map(String) : []
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

  function open(item: FileItem) {
    if (item.id === '') return scribe.enter('')
    const one = pageOf(item)
    if (one) {
      if (scribe.countKids(one) > 0) scribe.enter(one.id)
      else scribe.show(one.id)
      return
    }
    if (item.url) preview = item
  }

  function rename(item: FileItem, title: string) {
    const one = pageOf(item)
    if (one) void write({ ...one, title })
  }

  function move(item: FileItem, targetId: string | null) {
    const one = pageOf(item)
    if (!one || targetId === null || targetId === one.id || targetId === one.parent_id) return
    if (getTrail(scribe.table.pages, targetId).some((step) => step.id === one.id)) return
    void write({ ...one, parent_id: targetId })
  }

  function options(item: FileItem, defaults: FileOption[]): FileOption[] {
    const one = pageOf(item)
    if (!one) return defaults.filter((option) => option.title !== 'Rename' && !option.submenu)
    return [
      ...defaults,
      ...(item.kind === 'folder' ? [{ title: 'Open page', glyph: 'scroll', run: () => scribe.show(one.id) } satisfies FileOption] : []),
      { title: 'Share', glyph: 'share', run: () => scribe.share(one) },
      { title: 'Open in lore', glyph: 'forward', run: () => navigate(scribe.loreOf(one)) }
    ]
  }
</script>

{#snippet tags(words: string[])}
  {#if words.length > 0}
    <span class="scribe-tags" title={words.join(', ')}>
      {#each words.slice(0, 3) as word (word)}<Chip still>#{word}</Chip>{/each}
      {#if words.length > 3}<Chip still>+{words.length - 3}</Chip>{/if}
    </span>
  {/if}
{/snippet}

{#snippet cell(key: string, row: TreeRow | TableRow)}
  {#if key === 'tags'}
    {@render tags(wordsOf(row))}
  {:else}
    {String(row[key] ?? '')}
  {/if}
{/snippet}

{#snippet acts(row: TableRow)}
  {@const one = pageOf(row)}
  {#if one}
    <IconBtn title="Open in lore" onclick={(event) => { event.stopPropagation(); navigate(scribe.loreOf(one)) }}>
      <Glyph name="forward" size="sm" />
    </IconBtn>
  {/if}
{/snippet}

<section class="scribe-main" aria-label="Pages">
  {#if scribe.table.loading}
    <div class="dnd-loading"><span class="dnd-spinner"></span></div>
  {:else if scribe.table.pages.length === 0 && scribe.view !== 'grid'}
    <p class="scribe-empty">No page written yet. Press New page to begin.</p>
  {:else if scribe.shown.length === 0 && scribe.table.pages.length > 0}
    <p class="scribe-empty">No page matches.</p>
  {:else if scribe.view === 'grid'}
    <FileExplorer
      {items}
      groupBy={scribe.groupBy}
      showAdd
      addLabel="New page"
      showTags={items.some((one) => (one.tags ?? []).length > 0)}
      moveTargets={targets}
      moveLabel="Move under"
      moveSearchPlaceholder="Search the pages..."
      itemOptions={options}
      {preview}
      onadd={() => scribe.postPage(scribe.inside?.id ?? null)}
      onopen={open}
      onpreview={(item) => (preview = item)}
      ondownload={(item) => getAssetTab(item.id)}
      onrename={rename}
      onmove={move}
    />
  {:else if scribe.view === 'tree'}
    <Tree rows={scribe.rows} columns={scribe.columns} on="" onopen={(id) => scribe.show(id)} {cell} />
  {:else}
    <Table columns={scribe.columns} rows={lines} onrow={(row) => scribe.show(row.id)} {cell} actions={acts} />
  {/if}
</section>

<style>
  .scribe-main {
    display: flex;
    flex-direction: column;
    gap: var(--space-5);
    min-width: 0;
  }

  .scribe-tags {
    display: flex;
    flex-wrap: nowrap;
    align-items: center;
    gap: var(--space-1);
    min-width: 0;
    max-width: 100%;
    overflow: hidden;
  }

  .scribe-empty {
    margin: 0;
    padding: var(--space-4) 0;
    font-style: italic;
    color: var(--ink-faint);
  }
</style>
