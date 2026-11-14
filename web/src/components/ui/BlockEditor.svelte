<script module lang="ts">
  import { getFileUrl } from '$lib/api'
  import type { BlockKind, BlockOptions } from '$lib/blocks'
  import type { GlyphName } from './Glyph.svelte'

  export type Command = {
    kind: BlockKind
    title: string
    group: string
    description: string
    keywords: string[]
    icon?: GlyphName
    mark?: string
    options?: BlockOptions
  }

  export const BLOCK_COMMANDS: Command[] = [
    { kind: 'paragraph', title: 'Text', group: 'Text', mark: 'Aa', description: 'Plain paragraph', keywords: ['paragraph', 'text'] },
    { kind: 'heading', title: 'Heading 1', group: 'Text', mark: 'H1', description: 'Large section heading', keywords: ['h1', 'title'], options: { level: 1 } },
    { kind: 'heading', title: 'Heading 2', group: 'Text', mark: 'H2', description: 'Medium section heading', keywords: ['h2'], options: { level: 2 } },
    { kind: 'heading', title: 'Heading 3', group: 'Text', mark: 'H3', description: 'Small section heading', keywords: ['h3'], options: { level: 3 } },
    { kind: 'heading', title: 'Heading 4', group: 'Text', mark: 'H4', description: 'Subsection heading', keywords: ['h4'], options: { level: 4 } },
    { kind: 'bullet', title: 'Bulleted list', group: 'List', mark: '•', description: 'Simple bullet list', keywords: ['ul', 'unordered', 'bullet'] },
    { kind: 'number', title: 'Numbered list', group: 'List', mark: '1.', description: 'Ordered list', keywords: ['ol', 'ordered', 'number'] },
    { kind: 'todo', title: 'Task list', group: 'List', mark: '☐', description: 'Checkbox list', keywords: ['todo', 'checkbox', 'task'] },
    { kind: 'quote', title: 'Quote', group: 'Block', mark: '❝', description: 'Block quote', keywords: ['blockquote'] },
    { kind: 'code', title: 'Code block', group: 'Block', mark: '</>', description: 'Code with syntax', keywords: ['code', 'snippet'] },
    { kind: 'mermaid', title: 'Mermaid diagram', group: 'Block', mark: '⟁', description: 'Diagram from text', keywords: ['diagram', 'mermaid', 'flowchart'] },
    { kind: 'html', title: 'HTML', group: 'Block', mark: '<>', description: 'Raw markup, drawn when read', keywords: ['html', 'markup'] },
    { kind: 'divider', title: 'Divider', group: 'Block', mark: '—', description: 'Horizontal rule', keywords: ['hr', 'rule', 'separator'] },
    { kind: 'table', title: 'Table', group: 'Block', mark: '⊞', description: 'A row per line, cells split on pipes', keywords: ['grid', 'table'] },
    { kind: 'columns', title: 'Columns', group: 'Block', mark: '▥', description: 'Side by side columns', keywords: ['column', 'grid'] },
    { kind: 'toggle', title: 'Toggle', group: 'Block', icon: 'unfold', description: 'Collapsible block', keywords: ['collapse', 'accordion'] },
    { kind: 'callout', title: 'Callout', group: 'Block', mark: '!', description: 'Highlighted note', keywords: ['note', 'info', 'warning'] },
    { kind: 'meeting', title: 'Meeting notes', group: 'Block', mark: '◷', description: 'Date, attendees and notes', keywords: ['meeting', 'notes', 'session', 'minutes'] },
    { kind: 'poll', title: 'Poll', group: 'Block', mark: '?', description: 'A question the table votes on', keywords: ['vote', 'poll', 'question'] },
    { kind: 'image', title: 'Image', group: 'Media', icon: 'picture', description: 'Embed an image', keywords: ['picture', 'photo'] },
    { kind: 'video', title: 'Video', group: 'Media', mark: '▶', description: 'Embed a video', keywords: ['video', 'movie'] },
    { kind: 'pdf', title: 'PDF', group: 'Media', mark: 'P', description: 'Embed a PDF', keywords: ['pdf', 'document'] },
    { kind: 'file', title: 'File', group: 'Media', icon: 'sources', description: 'Attach a file', keywords: ['file', 'attachment', 'upload'] },
    { kind: 'bookmark', title: 'Link', group: 'Media', mark: '↗', description: 'Link preview card', keywords: ['link', 'bookmark', 'url'] },
    { kind: 'embed', title: 'Embed', group: 'Media', mark: '⧉', description: 'Embed an iframe', keywords: ['iframe', 'embed'] },
    { kind: 'map', title: 'Map', group: 'Media', mark: '⌖', description: 'A map from an address, or a stored picture', keywords: ['map', 'location', 'place', 'address'] },
    { kind: 'toc', title: 'Table of contents', group: 'Page', mark: '≡', description: 'Document outline', keywords: ['toc', 'outline', 'contents'] },
    { kind: 'toc', title: 'Legend', group: 'Page', mark: '⊟', description: 'Heading legend on the side of the page', keywords: ['legend', 'toc', 'outline', 'side'], options: { placement: 'right' } },
    { kind: 'page', title: 'Page', group: 'Page', icon: 'add', description: 'Link or create a sub page', keywords: ['page', 'subpage', 'document', 'child'] }
  ]
</script>

<script lang="ts">
  import {
    deleteNode,
    getBlocksFromMarkdown,
    getDocument,
    getDocumentHtml,
    getDocumentMarkdown,
    getHeadingNumbers,
    getInline,
    getInlineLength,
    getInlineMarkdown,
    getInlineText,
    getLocation,
    getLook,
    getMarkedInline,
    getMergedInline,
    getNode,
    getPath,
    getRangeIds,
    getSiblingIds,
    getSlicedInline,
    getSplitInline,
    getTextIds,
    getTree,
    getTreeBlocks,
    isHoldingKind,
    isListKind,
    isRawKind,
    isTextKind,
    putNode,
    type Block,
    type BlockAlign,
    type BlockFont,
    type BlockLeading,
    type BlockNode,
    type BlockPlacement,
    type BlockSize,
    type BlockTree,
    type BlockView,
    type BlockWidth,
    type BlockWrap,
    type Inline,
    type LinkPreview,
    type Marks,
    type MediaAsset,
    type MediaKind,
    type Mention,
    type MentionSearch,
    type NodeKind,
    type Reference,
    type Run
  } from '$lib/blocks'
  import { tick, untrack } from 'svelte'
  import BlockReader from './BlockReader.svelte'
  import Glyph, { getMimeGlyph } from './Glyph.svelte'
  import IconBtn from './IconBtn.svelte'
  import StoredImage from './StoredImage.svelte'

  let {
    value = $bindable(''),
    editable = true,
    placeholder = 'Write, or press slash for a block',
    commands = BLOCK_COMMANDS,
    headingNumbering = false,
    onsearch,
    onchange,
    onpage,
    onpages,
    requestMedia,
    uploadFile,
    openAsset,
    onasset,
    onpreview,
    onopen,
    onvote,
    mine = ''
  }: {
    /** The document being written, held as markdown. */
    value?: string
    /** Writes the blocks when set, draws them through the reader when not. */
    editable?: boolean
    /** The hint on an empty paragraph. */
    placeholder?: string
    /** The slash list, narrowed from the built in one when a host wants fewer. */
    commands?: Command[]
    /** Prefixes every heading with its outline number. */
    headingNumbering?: boolean
    /** Resolves what the at and hash popups offer. */
    onsearch?: MentionSearch
    /** Runs with the written markdown whenever a block changes. */
    onchange?: (value: string) => void
    /** Makes a sub page and hands back its id, so a page block links to it. */
    onpage?: (title: string) => Promise<string | undefined> | string | undefined
    /** Finds the pages a page block may link to instead of making one. */
    onpages?: (query: string) => Promise<Mention[]>
    /** Opens the pick or upload dialog for a media block and hands back what was chosen, or null when it closes without one. */
    requestMedia?: (kind: MediaKind, current?: string) => Promise<MediaAsset | null>
    /** Stores a recording the editor made and hands back the asset it became. */
    uploadFile?: (file: File, kind: MediaKind) => Promise<MediaAsset>
    /** Opens the asset a file block holds. */
    openAsset?: (assetId: string) => void
    /** Runs with the address when a picture or a file is pressed while reading. */
    onasset?: (address: string) => void
    /** Looks a link up, so a bookmark can fill its card. */
    onpreview?: (url: string) => Promise<LinkPreview>
    /** Runs when a reference or a page block is pressed while reading, or a page block is opened from its menu. */
    onopen?: (reference: Reference) => void
    /** Runs with where the block sits and the choice when a poll is answered while reading. */
    onvote?: (index: number, choice: string) => void
    /** The reader's own user id, so their own poll answer is marked while reading. */
    mine?: string
  } = $props()

  type Selection = { kind: 'text'; id: string; anchor: number; head: number } | { kind: 'blocks'; ids: string[] }
  type Choice = { title: string; description?: string; active?: boolean; run: () => void }
  type Field = { value: string; placeholder?: string; action?: string; apply: (value: string) => void | Promise<void> }
  type Option = {
    title: string
    description?: string
    glyph?: GlyphName
    shared?: boolean
    bane?: boolean
    run?: () => void
    choices?: Choice[]
    field?: Field
  }
  type Target = { parentId: string | null; refId: string | null; before: boolean }
  type Made = { node: BlockNode; created: BlockNode[] }
  type Pop = { id: string; from: number; to: number; query: string; top: number; left: number }
  type PickedKind = Exclude<MediaKind, 'audio'>

  const THRESHOLD = 4
  const COALESCE_MS = 400
  const MARK_KEYS: Record<string, keyof Marks> = { b: 'bold', i: 'italic', e: 'code' }
  const RULES: { re: RegExp; mark: keyof Marks }[] = [
    { re: /\*\*([^*]+)\*\*$/, mark: 'bold' },
    { re: /__([^_]+)__$/, mark: 'bold' },
    { re: /(?<![*])\*([^*\s][^*]*)\*$/, mark: 'italic' },
    { re: /(?<![_])_([^_\s][^_]*)_$/, mark: 'italic' },
    { re: /~~([^~]+)~~$/, mark: 'strike' },
    { re: /`([^`]+)`$/, mark: 'code' }
  ]
  const LINK_RULE = /\[([^\]]+)\]\(([^)]+)\)$/

  const FONTS: { id: BlockFont; title: string }[] = [
    { id: '--font-body', title: 'Body' },
    { id: '--font-display', title: 'Display' },
    { id: '--font-mono', title: 'Mono' }
  ]
  const SIZES: { id: BlockSize; title: string }[] = [
    { id: 'sm', title: 'Small' },
    { id: 'md', title: 'Medium' },
    { id: 'lg', title: 'Large' },
    { id: 'xl', title: 'Extra large' }
  ]
  const LEADINGS: { id: BlockLeading; title: string }[] = [
    { id: 'tight', title: 'Tight' },
    { id: 'normal', title: 'Normal' },
    { id: 'relaxed', title: 'Relaxed' },
    { id: 'loose', title: 'Loose' }
  ]
  const ALIGNS: { id: BlockAlign; title: string }[] = [
    { id: 'start', title: 'Left' },
    { id: 'center', title: 'Centre' },
    { id: 'end', title: 'Right' },
    { id: 'justify', title: 'Justify' }
  ]
  const WIDTHS: { id: BlockWidth; title: string }[] = [
    { id: 'full', title: 'Full' },
    { id: 'narrow', title: 'Reading column' }
  ]
  const WRAPS: { id: BlockWrap; title: string }[] = [
    { id: 'wrap', title: 'Wrap' },
    { id: 'balance', title: 'Balance' },
    { id: 'nowrap', title: 'No wrap' }
  ]
  const VIEWS: { id: BlockView; title: string }[] = [
    { id: 'full', title: 'Full' },
    { id: 'link', title: 'Link' },
    { id: 'icon', title: 'Icon and name' },
    { id: 'hidden', title: 'Hidden' }
  ]
  const PLACEMENTS: { id: BlockPlacement; title: string; description: string }[] = [
    { id: 'inline', title: 'In the flow', description: 'In the flow of the page' },
    { id: 'left', title: 'Legend left', description: 'Legend on the left side of the page' },
    { id: 'right', title: 'Legend right', description: 'Legend on the right side of the page' }
  ]
  const LEADING_VALUES: Record<BlockLeading, string> = { tight: '1.25', normal: '1.6', relaxed: '1.8', loose: '2' }
  const ALIGNED: NodeKind[] = ['paragraph', 'heading', 'quote', 'callout', 'table', 'image', 'video', 'item']
  const MEDIA_NAMES: Partial<Record<NodeKind, string>> = {
    image: 'image',
    video: 'video',
    pdf: 'PDF',
    bookmark: 'link',
    embed: 'embed',
    map: 'map',
    file: 'file'
  }
  const VIEWED: NodeKind[] = ['video', 'pdf', 'file', 'bookmark', 'embed', 'page']
  const PICKED: NodeKind[] = ['image', 'video', 'pdf', 'file']
  const UPLOADED: NodeKind[] = ['image', 'video', 'pdf', 'file']
  const LINED: NodeKind[] = ['embed', 'map']

  let tree = $state<BlockTree>(getTree(getDocument(value).blocks))
  let selection = $state<Selection | null>(null)
  let hovered = $state<string | null>(null)
  let handleAt = $state({ top: 0, left: 0 })
  let menu = $state<{ ids: string[]; top: number; left: number } | null>(null)
  let sub = $state<Option | null>(null)
  let cursor = $state(0)
  let draft = $state('')
  let slash = $state<Pop | null>(null)
  let mention = $state<(Pop & { mark: '@' | '#' }) | null>(null)
  let picks = $state<Mention[]>([])
  let seeking = $state(false)
  let chosen = $state(0)
  let pageSearch = $state<{ id: string; query: string; picks: Mention[]; seeking: boolean; chosen: number } | null>(null)
  let drag = $state<{ id: string | null; made: Made | null; on: boolean; x: number; y: number; ghost: string; target: Target | null } | null>(null)
  let frame = $state<HTMLElement>()
  let surface = $state<HTMLElement>()
  let panel = $state<HTMLElement>()

  let hosts: Record<string, HTMLElement> = {}
  let painted: Record<string, string> = {}
  const skip = new Set<string>()
  let published = value
  let past: { tree: BlockTree; selection: Selection | null }[] = []
  let future: { tree: BlockTree; selection: Selection | null }[] = []
  let lastAt = 0
  let coalescing = false
  let pressing = false
  let anchorId: string | null = null
  let handlePress: { x: number; y: number; id: string } | null = null
  let handleMoved = false
  let sought = 0
  let searchedPages = 0

  const flat = $derived(getTreeBlocks(tree))
  const numbers = $derived(headingNumbering ? getHeadingNumbers(flat) : {})
  const picked = $derived(selection?.kind === 'blocks' ? selection.ids : [])
  const headings = $derived.by(() => {
    const found: { id: string; level: number; text: string }[] = []
    const walk = (ids: string[]) => {
      for (const id of ids) {
        const held = tree.nodes[id]
        if (!held) continue
        if (held.kind === 'heading') found.push({ id, level: Math.min(Math.max(held.options.level ?? 1, 1), 6), text: getInlineText(held.inline ?? []) || 'Untitled' })
        walk(held.children ?? [])
      }
    }
    walk(tree.root)
    const counted = getHeadingNumbers(found.map((one) => ({ id: one.id, kind: 'heading' as BlockKind, text: '', options: { level: one.level } })))
    return found.map((one) => ({ ...one, number: counted[one.id] }))
  })
  const legends = $derived(tree.root.map((id) => tree.nodes[id]).filter((held) => held?.kind === 'toc' && held.options.placement && held.options.placement !== 'inline'))
  const empty = $derived(
    tree.root.every((id) => {
      const held = tree.nodes[id]
      return !!held && held.kind === 'paragraph' && getInlineLength(held.inline ?? []) === 0
    })
  )
  const offered = $derived.by(() => {
    if (!slash) return []
    const query = slash.query.toLowerCase()
    return commands.filter(
      (command) =>
        (command.kind !== 'page' || onpage || onpages) &&
        (command.title.toLowerCase().includes(query) || command.keywords.some((word) => word.includes(query)))
    )
  })
  const options = $derived(menu ? getOptions(menu.ids) : [])

  $effect(() => {
    const next = value
    untrack(() => {
      if (next === published) return
      published = next
      tree = getTree(getDocument(next).blocks)
      selection = null
      past = []
      future = []
    })
  })

  $effect(() => {
    for (const held of Object.values(tree.nodes)) {
      if (!held.inline) continue
      const html = getHostHtml(held)
      untrack(() => paint(held.id, html))
    }
  })

  $effect(() => {
    const on = mention
    if (!on || !onsearch) {
      picks = []
      seeking = false
      return
    }
    const turn = ++sought
    seeking = true
    onsearch(on.mark, on.query).then((found) => {
      if (turn !== sought) return
      picks = found
      seeking = false
      chosen = 0
    })
  })

  $effect(() => {
    const on = pageSearch
    if (!on || !onpages || !on.seeking) return
    const turn = ++searchedPages
    onpages(on.query).then((found) => {
      if (turn !== searchedPages || !pageSearch || pageSearch.id !== on.id) return
      pageSearch = { ...pageSearch, picks: found, seeking: false, chosen: -1 }
    })
  })

  $effect(() => {
    if (!editable) return
    document.addEventListener('selectionchange', onSelectionChange)
    document.addEventListener('pointerup', onPointerUp)
    return () => {
      document.removeEventListener('selectionchange', onSelectionChange)
      document.removeEventListener('pointerup', onPointerUp)
    }
  })

  $effect(() => {
    if (menu && panel) untrack(() => panel?.focus())
  })

  export function getMarkdown(): string {
    return getDocumentMarkdown({ blocks: $state.snapshot(flat) })
  }

  export function getHTML(): string {
    return getDocumentHtml({ blocks: $state.snapshot(flat) }, headingNumbering)
  }

  export function getBlocks(): Block[] {
    return $state.snapshot(flat)
  }

  export function addBlock(kind: BlockKind, options: BlockOptions = {}) {
    const current = selection?.kind === 'text' ? selection.id : null
    if (current) {
      run(current, kind, options)
      return
    }
    const made = getMade(kind, options)
    dispatch(() => {
      for (const one of made.created) tree.nodes[one.id] = one
      putNode(tree, made.node, null, tree.root.length)
      return focusOf(made.node)
    })
  }

  export function startExternalDrag(kind: BlockKind, options: BlockOptions = {}) {
    const made = getMade(kind, options)
    const label = commands.find((command) => command.kind === kind && JSON.stringify(command.options ?? {}) === JSON.stringify(options))?.title ?? kind
    menu = null
    drag = { id: null, made, on: true, x: 0, y: 0, ghost: `<span class="dnd-write-ghost-chip">${escape(label)}</span>`, target: null }
    document.addEventListener('pointermove', onDragMove)
    document.addEventListener('pointerup', onDragEnd)
    document.addEventListener('pointercancel', onDragCancel)
  }

  function escape(text: string): string {
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  }

  function publish() {
    const markdown = getDocumentMarkdown({ blocks: getTreeBlocks(tree) })
    published = markdown
    value = markdown
    onchange?.(markdown)
  }

  function record(coalesce: boolean) {
    const now = Date.now()
    const entry = { tree: $state.snapshot(tree) as BlockTree, selection: $state.snapshot(selection) as Selection | null }
    const mergeable = coalesce && coalescing && now - lastAt < COALESCE_MS
    coalescing = coalesce
    lastAt = now
    future = []
    if (mergeable) return
    past.push(entry)
    if (past.length > 200) past.shift()
  }

  function dispatch(change: () => Selection | null | undefined | void, coalesce = false) {
    record(coalesce)
    const next = change()
    publish()
    if (next === undefined) return
    selection = next
    if (next?.kind === 'text') void place(next)
    if (next?.kind === 'blocks') {
      window.getSelection()?.removeAllRanges()
      surface?.focus({ preventScroll: true })
    }
  }

  async function place(next: Selection & { kind: 'text' }) {
    await tick()
    const element = hosts[next.id]
    if (!element) return
    element.focus({ preventScroll: true })
    setRange(element, next.anchor, next.head)
  }

  function restore(from: typeof past, to: typeof future) {
    const entry = from.pop()
    if (!entry) return
    to.push({ tree: $state.snapshot(tree) as BlockTree, selection: $state.snapshot(selection) as Selection | null })
    coalescing = false
    tree = entry.tree
    selection = entry.selection
    publish()
    if (entry.selection?.kind === 'text') void place(entry.selection)
  }

  function caret(id: string, offset: number): Selection {
    return { kind: 'text', id, anchor: offset, head: offset }
  }

  function inlineOf(id: string): Inline {
    return tree.nodes[id]?.inline ?? []
  }

  function setInline(id: string, inline: Inline) {
    const held = tree.nodes[id]
    if (held) held.inline = getMergedInline(inline)
  }

  function parentOf(id: string): BlockNode | null {
    const at = getLocation(tree, id)
    return at?.parentId ? (tree.nodes[at.parentId] ?? null) : null
  }

  function itemOf(id: string): BlockNode | null {
    const parent = parentOf(id)
    return parent?.kind === 'item' ? parent : null
  }

  function focusOf(made: BlockNode): Selection {
    let current = made
    for (let step = 0; step < 8 && !current.inline && current.children?.length; step += 1) {
      const first = tree.nodes[current.children[0]]
      if (!first) break
      current = first
    }
    return current.inline ? caret(current.id, 0) : { kind: 'blocks', ids: [made.id] }
  }

  function getHostHtml(held: BlockNode): string {
    const inline = held.inline ?? []
    const raw = isRawKind(held.kind) || held.kind === 'toggle'
    let html = ''
    inline.forEach((run, index) => {
      if ('ref' in run) {
        if (run.ref === 'break') html += '<br>'
        else {
          html += `<span class="dnd-write-pill dnd-write-pill-${run.mark === '@' ? 'who' : 'tag'}" data-mention="" data-mark="${run.mark}" data-label="${escape(run.label)}"${run.id ? ` data-id="${escape(run.id)}"` : ''} contenteditable="false">${run.mark}${escape(run.label)}</span>`
        }
        return
      }
      const before = inline[index - 1]
      const after = inline[index + 1]
      let text = run.text
      if (!before || ('ref' in before && before.ref === 'break')) text = text.replace(/^ +/, (hit) => ' '.repeat(hit.length))
      if (!after || ('ref' in after && after.ref === 'break')) text = text.replace(/ +$/, (hit) => ' '.repeat(hit.length))
      let piece = escape(text).replace(/ {2}/g, '  ')
      const marks = raw ? {} : (run.marks ?? {})
      if (marks.code) piece = `<code>${piece}</code>`
      if (marks.bold) piece = `<strong>${piece}</strong>`
      if (marks.italic) piece = `<em>${piece}</em>`
      if (marks.strike) piece = `<s>${piece}</s>`
      if (marks.link) piece = `<a href="${escape(marks.link)}">${piece}</a>`
      html += piece
    })
    if (!html || html.endsWith('<br>')) html += '<br data-filler="">'
    return html
  }

  function paint(id: string, html: string) {
    const element = hosts[id]
    if (!element) return
    if (skip.has(id)) {
      skip.delete(id)
      painted[id] = html
      return
    }
    if (painted[id] === html) return
    element.innerHTML = html
    painted[id] = html
  }

  function host(id: string) {
    return (element: HTMLElement) => {
      hosts[id] = element
      const held = untrack(() => tree.nodes[id])
      if (held) paint(id, getHostHtml(held))
      return () => {
        delete hosts[id]
        delete painted[id]
      }
    }
  }

  function getHostInline(element: HTMLElement, raw: boolean): Inline {
    const out: Inline = []
    const walk = (current: Node, marks: Marks) => {
      if (current.nodeType === 3) {
        const text = (current.textContent ?? '').replace(/ /g, ' ')
        if (text) out.push(Object.keys(marks).length > 0 ? { text, marks: { ...marks } } : { text })
        return
      }
      if (!(current instanceof HTMLElement)) return
      if (current.hasAttribute('data-mention')) {
        const held: Run = { ref: 'mention', mark: (current.dataset.mark as '@' | '#') ?? '@', label: current.dataset.label ?? '' }
        if (current.dataset.id) held.id = current.dataset.id
        out.push(held)
        return
      }
      if (current.tagName === 'BR') {
        if (!current.hasAttribute('data-filler')) out.push({ ref: 'break' })
        return
      }
      const next: Marks = raw ? {} : { ...marks }
      if (!raw) {
        if (current.tagName === 'STRONG' || current.tagName === 'B') next.bold = true
        if (current.tagName === 'EM' || current.tagName === 'I') next.italic = true
        if (current.tagName === 'CODE') next.code = true
        if (current.tagName === 'S' || current.tagName === 'DEL' || current.tagName === 'STRIKE') next.strike = true
        if (current.tagName === 'A' && current.getAttribute('href')) next.link = current.getAttribute('href') ?? ''
      }
      if ((current.tagName === 'DIV' || current.tagName === 'P') && out.length > 0) out.push({ ref: 'break' })
      current.childNodes.forEach((child) => walk(child, next))
    }
    element.childNodes.forEach((child) => walk(child, {}))
    return getMergedInline(out)
  }

  function sizeOf(current: Node): number {
    let total = 0
    current.childNodes.forEach((child) => {
      if (child.nodeType === 3) total += child.textContent?.length ?? 0
      else if (child instanceof HTMLElement) {
        if (child.tagName === 'BR') total += child.hasAttribute('data-filler') ? 0 : 1
        else if (child.hasAttribute('data-mention')) total += 1
        else total += sizeOf(child)
      }
    })
    return total
  }

  function offsetAt(element: HTMLElement, container: Node, offset: number): number {
    const range = document.createRange()
    range.selectNodeContents(element)
    range.setEnd(container, offset)
    return sizeOf(range.cloneContents())
  }

  function hostOf(current: Node | null): HTMLElement | null {
    if (!current) return null
    const element = current instanceof Element ? current : current.parentElement
    const found = element?.closest<HTMLElement>('[data-host]') ?? null
    return found && surface?.contains(found) ? found : null
  }

  function caretHost(): HTMLElement | null {
    const sel = window.getSelection()
    if (!sel?.anchorNode || !sel.focusNode) return null
    const found = hostOf(sel.anchorNode)
    return found && hostOf(sel.focusNode) === found ? found : null
  }

  function caretOffset(element: HTMLElement): number | null {
    const sel = window.getSelection()
    if (!sel || sel.rangeCount === 0) return null
    const range = sel.getRangeAt(0)
    if (!element.contains(range.endContainer)) return null
    return offsetAt(element, range.endContainer, range.endOffset)
  }

  function rangeIn(element: HTMLElement): { from: number; to: number } | null {
    const sel = window.getSelection()
    if (!sel || sel.rangeCount === 0) return null
    const range = sel.getRangeAt(0)
    if (!element.contains(range.startContainer) || !element.contains(range.endContainer)) return null
    const from = offsetAt(element, range.startContainer, range.startOffset)
    const to = offsetAt(element, range.endContainer, range.endOffset)
    return { from: Math.min(from, to), to: Math.max(from, to) }
  }

  function textBefore(id: string, offset: number): string {
    let out = ''
    let at = 0
    for (const run of inlineOf(id)) {
      if (at >= offset) break
      if ('ref' in run) {
        out += run.ref === 'break' ? '\n' : '@'
        at += 1
        continue
      }
      out += run.text.slice(0, Math.max(0, offset - at))
      at += run.text.length
    }
    return out
  }

  function locateOffset(element: HTMLElement, offset: number): { node: Node; offset: number } {
    let remaining = offset
    const walk = (current: Node): { node: Node; offset: number } | null => {
      for (const child of Array.from(current.childNodes)) {
        if (child.nodeType === 3) {
          const length = child.textContent?.length ?? 0
          if (remaining <= length) return { node: child, offset: remaining }
          remaining -= length
        } else if (child instanceof HTMLElement) {
          if (child.tagName === 'BR' || child.hasAttribute('data-mention')) {
            if (remaining === 0) return { node: current, offset: Array.prototype.indexOf.call(current.childNodes, child) }
            if (!child.hasAttribute('data-filler')) remaining -= 1
          } else {
            const found = walk(child)
            if (found) return found
          }
        }
      }
      return null
    }
    if (offset <= 0) return { node: element, offset: 0 }
    return walk(element) ?? { node: element, offset: Math.max(0, element.childNodes.length - (element.lastElementChild?.hasAttribute('data-filler') ? 1 : 0)) }
  }

  function setRange(element: HTMLElement, from: number, to: number) {
    const start = locateOffset(element, from)
    const end = locateOffset(element, to)
    const range = document.createRange()
    range.setStart(start.node, start.offset)
    range.setEnd(end.node, end.offset)
    const sel = window.getSelection()
    if (!sel) return
    sel.removeAllRanges()
    sel.addRange(range)
  }

  function caretAtEdge(element: HTMLElement, by: -1 | 1): boolean {
    const sel = window.getSelection()
    if (!sel?.focusNode) return false
    const range = document.createRange()
    range.setStart(sel.focusNode, sel.focusOffset)
    range.collapse(true)
    const rect = range.getBoundingClientRect()
    const box = element.getBoundingClientRect()
    const line = parseFloat(getComputedStyle(element).lineHeight) || rect.height || 20
    if (rect.height === 0) return by === 1 || (caretOffset(element) ?? 0) === 0
    return by === -1 ? rect.top - box.top < line * 0.75 : box.bottom - rect.bottom < line * 0.75
  }

  function caretRect(): DOMRect | null {
    const sel = window.getSelection()
    if (!sel || sel.rangeCount === 0) return null
    const rect = sel.getRangeAt(0).getBoundingClientRect()
    if (rect.width === 0 && rect.height === 0) {
      const found = caretHost()
      return found ? found.getBoundingClientRect() : null
    }
    return rect
  }

  function inFrame(rect: DOMRect): { top: number; left: number } {
    const box = frame?.getBoundingClientRect() ?? new DOMRect()
    return { top: rect.bottom - box.top, left: rect.left - box.left }
  }

  function onSelectionChange() {
    if (selection?.kind === 'blocks') {
      if (document.activeElement === surface && window.getSelection()?.rangeCount) window.getSelection()?.removeAllRanges()
      return
    }
    const element = caretHost()
    const id = element?.dataset.host
    if (!element || !id) return
    const sel = window.getSelection()
    if (!sel?.anchorNode || !sel.focusNode) return
    selection = {
      kind: 'text',
      id,
      anchor: offsetAt(element, sel.anchorNode, sel.anchorOffset),
      head: offsetAt(element, sel.focusNode, sel.focusOffset)
    }
  }

  function blockIdAt(x: number, y: number): string | null {
    const hit = document.elementFromPoint(x, y)
    if (hit && surface?.contains(hit)) {
      const found = hit.closest<HTMLElement>('[data-block]')
      if (found) return found.dataset.block ?? null
    }
    if (!surface) return null
    let nearest: HTMLElement | null = null
    let distance = Infinity
    for (const element of surface.querySelectorAll<HTMLElement>('[data-block]')) {
      const box = element.getBoundingClientRect()
      if (x > box.right + 1 || x < box.left - 48) continue
      const gap = y < box.top ? box.top - y : y > box.bottom ? y - box.bottom : 0
      if (gap < distance) {
        distance = gap
        nearest = element
      }
    }
    return nearest?.dataset.block ?? null
  }

  function blockEl(id: string): HTMLElement | null {
    return surface?.querySelector<HTMLElement>(`[data-block="${id}"]`) ?? null
  }

  function handleTargetOf(id: string): string {
    let current = id
    for (let step = 0; step < 32; step += 1) {
      const at = getLocation(tree, current)
      if (!at || at.parentId === null) return current
      const parentKind = tree.nodes[at.parentId]?.kind
      if (parentKind === 'column' || parentKind === 'bullet' || parentKind === 'number' || parentKind === 'todo') return current
      current = at.parentId
    }
    return current
  }

  function placeHandle(id: string) {
    const element = blockEl(id)
    if (!element || !frame) return
    const box = element.getBoundingClientRect()
    const frameBox = frame.getBoundingClientRect()
    const style = getComputedStyle(element)
    const padTop = parseFloat(style.paddingTop) || 0
    const padBottom = parseFloat(style.paddingBottom) || 0
    const fontSize = parseFloat(style.fontSize) || 16
    const line = parseFloat(style.lineHeight) || fontSize * 1.4
    const contentHeight = box.height - padTop - padBottom
    const centre = contentHeight <= line * 1.4 ? box.top + box.height / 2 : box.top + padTop + line / 2
    handleAt = { top: centre - frameBox.top, left: box.left - frameBox.left }
  }

  function onSurfaceMove(event: PointerEvent) {
    if (menu || drag?.on) return
    if (pressing && anchorId && (event.buttons & 1) !== 0) {
      const over = blockIdAt(event.clientX, event.clientY)
      if (over && over !== anchorId) {
        const ids = getRangeIds(tree, anchorId, over)
        if (ids.length > 0) selectBlocks(ids)
      } else if (over === anchorId && selection?.kind === 'blocks') {
        selection = null
      }
      return
    }
    const id = blockIdAt(event.clientX, event.clientY)
    const target = id ? handleTargetOf(id) : null
    if (target !== hovered) {
      hovered = target
      if (target) placeHandle(target)
    }
  }

  function onSurfaceLeave(event: PointerEvent) {
    const to = event.relatedTarget as HTMLElement | null
    if (to?.closest('.dnd-write-handle') || menu) return
    hovered = null
  }

  function onSurfaceDown(event: PointerEvent) {
    if (event.button !== 0) return
    const target = event.target as HTMLElement | null
    if (target?.closest('.dnd-write-handle, .dnd-write-menu, .dnd-write-pop, button, input')) return
    pressing = true
    anchorId = blockIdAt(event.clientX, event.clientY)
    if (!anchorId) return
    const held = tree.nodes[anchorId]
    if (held && !held.inline && !isHoldingKind(held.kind)) {
      event.preventDefault()
      selectBlocks([anchorId])
      return
    }
    if (selection?.kind === 'blocks') selection = null
  }

  function onPointerUp() {
    pressing = false
  }

  function sameIds(one: string[], two: string[]): boolean {
    return one.length === two.length && one.every((id, index) => two[index] === id)
  }

  function onHandleDown(event: PointerEvent) {
    if (event.button !== 0 || !hovered) return
    handleMoved = false
    if (menu) return
    event.preventDefault()
    handlePress = { x: event.clientX, y: event.clientY, id: hovered }
    document.addEventListener('pointermove', onHandleMove)
    document.addEventListener('pointerup', onHandleUp)
  }

  function onHandleMove(event: PointerEvent) {
    if (!handlePress) return
    if (Math.hypot(event.clientX - handlePress.x, event.clientY - handlePress.y) < THRESHOLD) return
    const id = handlePress.id
    handleMoved = true
    onHandleUp()
    drag = { id, made: null, on: true, x: event.clientX, y: event.clientY, ghost: ghostOf(blockEl(id)), target: null }
    document.addEventListener('pointermove', onDragMove)
    document.addEventListener('pointerup', onDragEnd)
    document.addEventListener('pointercancel', onDragCancel)
    onDragMove(event)
  }

  function onHandleUp() {
    document.removeEventListener('pointermove', onHandleMove)
    document.removeEventListener('pointerup', onHandleUp)
    handlePress = null
  }

  function onHandleClick() {
    if (handleMoved) {
      handleMoved = false
      return
    }
    if (menu) {
      closeMenu()
      return
    }
    const id = hovered
    if (!id) return
    const ids = selection?.kind === 'blocks' && selection.ids.includes(id) ? selection.ids : [id]
    sub = null
    cursor = 0
    menu = { ids, top: handleAt.top, left: handleAt.left }
  }

  function closeMenu() {
    menu = null
    sub = null
  }

  function ghostOf(element: HTMLElement | null): string {
    if (!element) return ''
    const copy = element.cloneNode(true) as HTMLElement
    copy.querySelectorAll('[contenteditable]').forEach((one) => one.removeAttribute('contenteditable'))
    copy.querySelectorAll('[data-block]').forEach((one) => one.removeAttribute('data-block'))
    copy.removeAttribute('data-block')
    return copy.outerHTML
  }

  function accepts(parentId: string | null, kind: NodeKind): boolean {
    const parentKind = parentId ? tree.nodes[parentId]?.kind : null
    if (!parentKind) return kind !== 'item' && kind !== 'column'
    if (isListKind(parentKind)) return kind === 'item' || kind === 'paragraph'
    if (parentKind === 'columns') return kind !== 'item'
    if (parentKind === 'item') return kind === 'paragraph' || isListKind(kind)
    if (parentKind === 'column' || parentKind === 'toggle' || parentKind === 'quote' || parentKind === 'callout') return kind !== 'item' && kind !== 'column'
    return false
  }

  function containersUnder(x: number, y: number, kinds: (kind: NodeKind) => boolean): { id: string; element: HTMLElement; depth: number }[] {
    const out: { id: string; element: HTMLElement; depth: number }[] = []
    if (!surface) return out
    for (const element of surface.querySelectorAll<HTMLElement>('[data-block]')) {
      const id = element.dataset.block ?? ''
      const held = tree.nodes[id]
      if (!held || !isHoldingKind(held.kind) || !kinds(held.kind)) continue
      const box = element.getBoundingClientRect()
      if (x < box.left - 4 || x > box.right + 4 || y < box.top || y > box.bottom) continue
      out.push({ id, element, depth: (getPath(tree, id) ?? []).length })
    }
    return out.sort((one, two) => two.depth - one.depth)
  }

  function targetIn(parentId: string | null, x: number, y: number, dragKind: NodeKind, dragId: string | null): Target | null {
    if (!accepts(parentId, dragKind)) return null
    const horizontal = parentId !== null && tree.nodes[parentId]?.kind === 'columns'
    const candidates = getSiblingIds(tree, parentId)
      .filter((id) => id !== dragId && !(dragId && getPath(tree, id)?.includes(dragId)))
      .map((id) => ({ id, element: blockEl(id) }))
      .filter((one): one is { id: string; element: HTMLElement } => !!one.element)
    if (candidates.length === 0) return { parentId, refId: null, before: true }
    const coord = horizontal ? x : y
    let chosenOne = candidates[candidates.length - 1]
    let after = true
    for (const candidate of candidates) {
      const box = candidate.element.getBoundingClientRect()
      const start = horizontal ? box.left : box.top
      const end = horizontal ? box.right : box.bottom
      if (coord < start) {
        chosenOne = candidate
        after = false
        break
      }
      if (coord <= end) {
        chosenOne = candidate
        after = coord >= (start + end) / 2
        break
      }
    }
    return { parentId, refId: chosenOne.id, before: !after }
  }

  function targetAt(x: number, y: number): Target | null {
    if (!drag || !surface) return null
    const dragged = drag.id ? tree.nodes[drag.id] : drag.made?.node
    if (!dragged) return null
    if (dragged.kind === 'item') {
      const top = getPath(tree, dragged.id)?.[0] ?? dragged.id
      for (const container of containersUnder(x, y, isListKind)) {
        if (!getPath(tree, container.id)?.includes(top)) continue
        const found = targetIn(container.id, x, y, 'item', dragged.id)
        if (found) return found
      }
      const at = getLocation(tree, dragged.id)
      return at?.parentId ? targetIn(at.parentId, x, y, 'item', dragged.id) : null
    }
    for (const container of containersUnder(x, y, (kind) => kind === 'column' || kind === 'toggle' || kind === 'quote' || kind === 'callout' || isListKind(kind))) {
      const found = targetIn(container.id, x, y, dragged.kind, drag.id)
      if (found) return found
    }
    return targetIn(null, x, y, dragged.kind, drag.id)
  }

  function onDragMove(event: PointerEvent) {
    if (!drag) return
    drag.x = event.clientX
    drag.y = event.clientY
    drag.target = targetAt(event.clientX, event.clientY)
  }

  function onDragCancel() {
    document.removeEventListener('pointermove', onDragMove)
    document.removeEventListener('pointerup', onDragEnd)
    document.removeEventListener('pointercancel', onDragCancel)
    drag = null
  }

  function onDragEnd() {
    const held = drag
    onDragCancel()
    if (!held?.target) return
    const target = held.target
    if (held.made) {
      const made = held.made
      dispatch(() => {
        for (const one of made.created) tree.nodes[one.id] = one
        tree.nodes[made.node.id] = made.node
        putAt(adapt(made.node, target.parentId), target)
        return focusOf(made.node)
      })
      return
    }
    if (held.id) {
      const id = held.id
      dispatch(() => {
        const dragged = tree.nodes[id]
        if (!dragged || target.refId === id) return
        const at = getLocation(tree, id)
        putAt(adapt(dragged, target.parentId), target)
        if (at?.parentId) tidy(at.parentId)
        return null
      })
    }
  }

  function putAt(held: BlockNode, target: Target) {
    if (target.refId) {
      const at = getLocation(tree, target.refId)
      if (!at) return
      putNode(tree, held, at.parentId, at.index + (target.before ? 0 : 1))
      return
    }
    putNode(tree, held, target.parentId, 0)
  }

  function adapt(held: BlockNode, parentId: string | null): BlockNode {
    const parentKind = parentId ? tree.nodes[parentId]?.kind : null
    if (parentKind && isListKind(parentKind)) {
      if (held.kind === 'item') return held
      unlink(held.id)
      const item = getNode('item', null, [held.id])
      tree.nodes[item.id] = item
      return item
    }
    if (parentKind === 'columns') {
      if (held.kind === 'column') return held
      unlink(held.id)
      const column = getNode('column', null, [held.id])
      tree.nodes[column.id] = column
      return column
    }
    if (held.kind === 'item') {
      const first = tree.nodes[held.children?.[0] ?? '']
      if (first) {
        unlink(first.id)
        deleteNode(tree, held.id)
        return first
      }
    }
    return held
  }

  function unlink(id: string) {
    const at = getLocation(tree, id)
    if (!at) return
    getSiblingIds(tree, at.parentId).splice(at.index, 1)
  }

  function tidy(parentId: string) {
    const parent = tree.nodes[parentId]
    if (!parent?.children || parent.children.length > 0) return
    if (isListKind(parent.kind) || parent.kind === 'item') {
      const at = getLocation(tree, parentId)
      deleteNode(tree, parentId)
      if (at?.parentId) tidy(at.parentId)
    }
  }

  function look(held: BlockNode): { font: string | null; size: string | null; leading: string | null } {
    if (!held.options.own) return { font: null, size: null, leading: null }
    return {
      font: held.options.font ? `var(${held.options.font})` : null,
      size: held.options.size ? `var(--text-${held.options.size})` : null,
      leading: held.options.leading ? LEADING_VALUES[held.options.leading] : null
    }
  }

  function getMade(kind: BlockKind, options: BlockOptions = {}): Made {
    if (isListKind(kind)) {
      const paragraph = getNode('paragraph', [])
      const item = getNode('item', null, [paragraph.id])
      return { node: getNode(kind, null, [item.id], options), created: [paragraph, item] }
    }
    if (kind === 'quote' || kind === 'callout') {
      const paragraph = getNode('paragraph', [])
      return { node: getNode(kind, null, [paragraph.id], options), created: [paragraph] }
    }
    if (kind === 'toggle') {
      const paragraph = getNode('paragraph', [])
      return { node: getNode('toggle', [], [paragraph.id], { open: true, ...options }), created: [paragraph] }
    }
    if (kind === 'columns') {
      const first = getNode('paragraph', [])
      const second = getNode('paragraph', [])
      const left = getNode('column', null, [first.id])
      const right = getNode('column', null, [second.id])
      return { node: getNode('columns', null, [left.id, right.id], options), created: [first, second, left, right] }
    }
    if (kind === 'meeting') return { node: getNode('meeting', getInline('Date: \nAttendees: \nNotes: '), null, options), created: [] }
    return { node: getNode(kind, isTextKind(kind) ? [] : null, null, options), created: [] }
  }

  function placeBlock(id: string, made: Made): Selection | null {
    const current = tree.nodes[id]
    const at = getLocation(tree, id)
    if (!current || !at) return null
    for (const one of made.created) tree.nodes[one.id] = one
    const isEmpty = current.kind === 'paragraph' && getInlineLength(current.inline ?? []) === 0
    if (isEmpty) {
      putNode(tree, made.node, at.parentId, at.index)
      deleteNode(tree, id)
    } else {
      putNode(tree, made.node, at.parentId, at.index + 1)
    }
    if (!isHoldingKind(made.node.kind) && !made.node.inline) {
      const after = getLocation(tree, made.node.id)
      const trailing = getNode('paragraph', [])
      if (after) putNode(tree, trailing, after.parentId, after.index + 1)
      return caret(trailing.id, 0)
    }
    return focusOf(made.node)
  }

  function turnInto(id: string, kind: BlockKind, options: BlockOptions = {}): Selection | null {
    const held = tree.nodes[id]
    if (!held) return null
    if (itemOf(id) && kind !== 'paragraph') return null
    const inline = held.inline ?? []
    held.kind = kind
    held.options = { ...options }
    held.inline = isRawKind(kind) ? getMergedInline(inline.map((run) => ('text' in run ? { text: run.text } : run))) : inline
    return caret(id, 0)
  }

  function wrapInList(id: string, kind: BlockKind): Selection | null {
    const held = tree.nodes[id]
    const at = getLocation(tree, id)
    if (!held || !at) return null
    const item = itemOf(id)
    if (item) {
      const list = parentOf(item.id)
      if (list) list.kind = kind
      return caret(id, 0)
    }
    const paragraph = getNode('paragraph', held.inline ?? [], null, {})
    const made = getNode('item', null, [paragraph.id], {})
    const list = getNode(kind, null, [made.id], {})
    tree.nodes[paragraph.id] = paragraph
    tree.nodes[made.id] = made
    putNode(tree, list, at.parentId, at.index)
    deleteNode(tree, id)
    return caret(paragraph.id, 0)
  }

  function run(id: string, kind: BlockKind, options: BlockOptions = {}) {
    if (kind === 'page') {
      dispatch(() => {
        const next = placeBlock(id, getMade('page', options))
        const made = tree.nodes[next?.kind === 'text' ? next.id : '']
        if (made?.kind === 'page') pageSearch = { id: made.id, query: '', picks: [], seeking: !!onpages, chosen: -1 }
        return next
      })
      return
    }
    if (isTextKind(kind) && !isHoldingKind(kind) && !PICKED.includes(kind) && !LINED.includes(kind) && kind !== 'bookmark') {
      if (kind === 'meeting' && tree.nodes[id]?.kind === 'paragraph' && getInlineLength(inlineOf(id)) === 0) {
        dispatch(() => placeBlock(id, getMade(kind, options)))
        return
      }
      dispatch(() => turnInto(id, kind, options))
      return
    }
    if (isListKind(kind)) {
      dispatch(() => wrapInList(id, kind))
      return
    }
    if (PICKED.includes(kind) && requestMedia) {
      void placeMedia(id, kind as PickedKind, options)
      return
    }
    dispatch(() => placeBlock(id, getMade(kind, options)))
  }

  async function placeMedia(id: string, kind: PickedKind, options: BlockOptions) {
    const asset = await requestMedia?.(kind)
    if (asset === null) return
    if (!tree.nodes[id]) return
    dispatch(() => placeBlock(id, getMade(kind, { ...options, ...(asset ? getSource(kind, asset) : {}) })))
  }

  function getSource(kind: NodeKind, asset: MediaAsset): BlockOptions {
    return kind === 'file' ? { assetId: asset.id, name: asset.name, url: asset.url, mimeType: asset.mimeType } : { src: asset.url }
  }

  function splice(id: string, from: number, to: number, runs: Inline): Selection {
    const [head, tail] = getSplitInline(inlineOf(id), to)
    const [left] = getSplitInline(head, from)
    setInline(id, [...left, ...runs, ...tail])
    return caret(id, from + getInlineLength(runs))
  }

  function splitAt(id: string, offset: number): Selection | null {
    const held = tree.nodes[id]
    const at = getLocation(tree, id)
    if (!held || !at) return null
    const [left, right] = getSplitInline(held.inline ?? [], offset)
    const kind: NodeKind = held.kind === 'heading' ? 'paragraph' : held.kind
    const made = getNode(kind, right, null, held.kind === 'heading' ? {} : { ...held.options })
    setInline(id, left)
    putNode(tree, made, at.parentId, at.index + 1)
    return caret(made.id, 0)
  }

  function enterInList(id: string, offset: number): Selection | null {
    const item = itemOf(id)
    const itemAt = item ? getLocation(tree, item.id) : null
    if (!item || !itemAt) return null
    if (getInlineLength(inlineOf(id)) === 0) return outdent(id)
    const [left, right] = getSplitInline(inlineOf(id), offset)
    setInline(id, left)
    const paragraph = getNode('paragraph', right)
    const made = getNode('item', null, [paragraph.id], {})
    tree.nodes[paragraph.id] = paragraph
    putNode(tree, made, itemAt.parentId, itemAt.index + 1)
    return caret(paragraph.id, 0)
  }

  function indent(id: string, offset: number): Selection | null {
    const item = itemOf(id)
    const itemAt = item ? getLocation(tree, item.id) : null
    if (!item || !itemAt || !itemAt.parentId || itemAt.index === 0) return null
    const list = tree.nodes[itemAt.parentId]
    const previous = tree.nodes[getSiblingIds(tree, itemAt.parentId)[itemAt.index - 1]]
    if (!list || !previous) return null
    const nested = (previous.children ?? []).map((one) => tree.nodes[one]).find((one) => one?.kind === list.kind)
    if (nested) {
      putNode(tree, item, nested.id, (nested.children ?? []).length)
    } else {
      const made = getNode(list.kind, null, [], {})
      tree.nodes[made.id] = made
      unlink(item.id)
      putNode(tree, made, previous.id, (previous.children ?? []).length)
      made.children?.push(item.id)
    }
    return caret(id, offset)
  }

  function outdent(id: string, offset = 0): Selection | null {
    const item = itemOf(id)
    const itemAt = item ? getLocation(tree, item.id) : null
    if (!item || !itemAt || !itemAt.parentId) return null
    const list = tree.nodes[itemAt.parentId]
    const listAt = getLocation(tree, itemAt.parentId)
    if (!list || !listAt) return null
    const holder = listAt.parentId ? tree.nodes[listAt.parentId] : null
    if (holder?.kind === 'item') {
      const holderAt = getLocation(tree, holder.id)
      putNode(tree, item, holderAt?.parentId ?? null, (holderAt?.index ?? 0) + 1)
      if ((list.children ?? []).length === 0) deleteNode(tree, list.id)
      return caret(id, offset)
    }
    const following = (list.children ?? []).slice(itemAt.index + 1)
    const kids = [...(item.children ?? [])]
    let index = listAt.index + 1
    for (const kid of kids) {
      const held = tree.nodes[kid]
      if (!held) continue
      putNode(tree, held, listAt.parentId, index)
      index += 1
    }
    deleteNode(tree, item.id)
    if (following.length > 0) {
      const rest = getNode(list.kind, null, [], { ...list.options })
      tree.nodes[rest.id] = rest
      for (const one of following) {
        const held = tree.nodes[one]
        if (held) putNode(tree, held, rest.id, (rest.children ?? []).length)
      }
      putNode(tree, rest, listAt.parentId, index)
    }
    if ((list.children ?? []).length === 0) deleteNode(tree, list.id)
    return caret(id, offset)
  }

  function removeListItem(id: string): Selection | null {
    const item = itemOf(id)
    const itemAt = item ? getLocation(tree, item.id) : null
    if (!item || !itemAt) return null
    if (itemAt.index > 0) {
      const previous = tree.nodes[getSiblingIds(tree, itemAt.parentId)[itemAt.index - 1]]
      const texts = previous ? getTextIds(tree, [previous.id]) : []
      const last = texts[texts.length - 1]
      deleteNode(tree, item.id)
      return last ? caret(last, getInlineLength(inlineOf(last))) : null
    }
    return outdent(id)
  }

  function mergeWithPrevious(id: string): Selection | null {
    const at = getLocation(tree, id)
    const held = tree.nodes[id]
    if (!at || !held || at.index === 0) return null
    const previous = tree.nodes[getSiblingIds(tree, at.parentId)[at.index - 1]]
    if (!previous) return null
    if (!previous.inline || isHoldingKind(previous.kind)) {
      const texts = getTextIds(tree, [previous.id])
      const last = texts[texts.length - 1]
      if (getInlineLength(held.inline ?? []) > 0) return last ? caret(last, getInlineLength(inlineOf(last))) : null
      deleteNode(tree, id)
      return last ? caret(last, getInlineLength(inlineOf(last))) : { kind: 'blocks', ids: [previous.id] }
    }
    const join = getInlineLength(previous.inline)
    setInline(previous.id, [...previous.inline, ...(held.inline ?? [])])
    deleteNode(tree, id)
    return caret(previous.id, join)
  }

  function adjacentText(id: string, by: -1 | 1): string | null {
    const texts = getTextIds(tree).filter((one) => hosts[one])
    const index = texts.indexOf(id)
    return index < 0 ? null : (texts[index + by] ?? null)
  }

  function onHostInput(id: string, raw: boolean, event: Event) {
    const element = event.currentTarget as HTMLElement
    skip.add(id)
    dispatch(() => {
      setInline(id, getHostInline(element, raw))
    }, true)
    const offset = caretOffset(element)
    if (offset === null || raw) {
      slash = null
      mention = null
      return
    }
    const hit = /(^|\s)([/@#])(\S*)$/.exec(textBefore(id, offset))
    if (!hit) {
      slash = null
      mention = null
      return
    }
    const rect = caretRect()
    const at = rect ? inFrame(rect) : { top: 0, left: 0 }
    const pop = { id, from: offset - hit[3].length - 1, to: offset, query: hit[3], ...at }
    if (hit[2] === '/') {
      slash = pop
      mention = null
    } else {
      mention = { ...pop, mark: hit[2] as '@' | '#' }
      slash = null
    }
    chosen = 0
  }

  function onHostBeforeInput(id: string, event: InputEvent) {
    const held = tree.nodes[id]
    const element = event.currentTarget as HTMLElement
    if (!held || event.isComposing) return
    const raw = isRawKind(held.kind) || held.kind === 'toggle'
    const offset = caretOffset(element) ?? 0

    if (event.inputType === 'insertText' && event.data && !raw) {
      if ('*_~`)'.includes(event.data)) {
        const before = textBefore(id, offset) + event.data
        if (event.data === ')') {
          const hit = LINK_RULE.exec(before)
          const start = hit ? offset - (hit[0].length - 1) : -1
          if (hit && start >= 0) {
            event.preventDefault()
            dispatch(() => splice(id, start, offset, [{ text: hit[1], marks: { link: hit[2] } }]))
            return
          }
        } else {
          for (const rule of RULES) {
            const hit = rule.re.exec(before)
            if (!hit) continue
            const start = offset - (hit[0].length - 1)
            if (start < 0) continue
            event.preventDefault()
            dispatch(() => splice(id, start, offset, [{ text: hit[1], marks: { [rule.mark]: true } }]))
            return
          }
        }
      }
      if (event.data === ' ') {
        const inline = inlineOf(id)
        const last = inline[inline.length - 1]
        if (offset > 0 && offset === getInlineLength(inline) && last && 'text' in last && last.marks) {
          event.preventDefault()
          dispatch(() => splice(id, offset, offset, [{ text: ' ' }]))
          return
        }
        if (held.kind === 'paragraph') {
          const before = textBefore(id, offset)
          const heading = /^(#{1,4})$/.exec(before)
          if (heading) {
            event.preventDefault()
            const level = heading[1].length
            dispatch(() => {
              setInline(id, [])
              return turnInto(id, 'heading', { level })
            })
            return
          }
          const list = /^([-*]|\d+\.|\[[ xX]?\])$/.exec(before)
          if (list) {
            event.preventDefault()
            const token = list[1]
            const kind: BlockKind = /^\d/.test(token) ? 'number' : token.startsWith('[') ? 'todo' : 'bullet'
            dispatch(() => {
              setInline(id, [])
              const next = wrapInList(id, kind)
              if (kind === 'todo' && /x/i.test(token) && next?.kind === 'text') {
                const item = itemOf(next.id)
                if (item) item.options.done = true
              }
              return next
            })
            return
          }
          if (before === '>' && !parentOf(id)) {
            event.preventDefault()
            dispatch(() => {
              const at = getLocation(tree, id)
              if (!at) return null
              const made = getMade('quote')
              for (const one of made.created) tree.nodes[one.id] = one
              putNode(tree, made.node, at.parentId, at.index)
              deleteNode(tree, id)
              return caret(made.created[0].id, 0)
            })
            return
          }
        }
      }
    }

    if (event.inputType === 'insertParagraph') {
      event.preventDefault()
      onEnter(id, offset)
      return
    }

    if (event.inputType === 'insertLineBreak') {
      event.preventDefault()
      if (LINED.includes(held.kind)) return
      dispatch(() => splice(id, offset, offset, [{ ref: 'break' }]))
      return
    }

    if (event.inputType === 'deleteContentBackward') {
      const range = rangeIn(element)
      if (range && range.from !== range.to) return
      if (offset > 0) {
        let at = 0
        for (const run of inlineOf(id)) {
          const length = 'ref' in run ? 1 : run.text.length
          if (at + length === offset && 'ref' in run && run.ref === 'mention') {
            event.preventDefault()
            const start = at
            const text = `${run.mark}${run.label}`
            dispatch(() => splice(id, start, offset, [{ text }]))
            return
          }
          at += length
          if (at >= offset) break
        }
        return
      }
      event.preventDefault()
      if (held.kind !== 'paragraph' && held.kind !== 'heading') {
        if (itemOf(id)) return
        dispatch(() => mergeWithPrevious(id))
        return
      }
      if (getInlineLength(held.inline ?? []) === 0 && itemOf(id)) {
        dispatch(() => removeListItem(id))
        return
      }
      if (held.kind === 'heading' && !itemOf(id)) {
        dispatch(() => turnInto(id, 'paragraph'))
        return
      }
      dispatch(() => mergeWithPrevious(id))
    }
  }

  function onEnter(id: string, offset: number) {
    const held = tree.nodes[id]
    if (!held) return
    if (isRawKind(held.kind) && !LINED.includes(held.kind)) {
      dispatch(() => splice(id, offset, offset, [{ ref: 'break' }]))
      return
    }
    if (held.kind === 'toggle') {
      const first = held.children?.[0]
      if (first && tree.nodes[first]?.inline) {
        selection = caret(first, 0)
        void place(selection as Selection & { kind: 'text' })
      }
      return
    }
    if (held.kind !== 'paragraph' && held.kind !== 'heading') {
      dispatch(() => {
        const at = getLocation(tree, id)
        if (!at) return null
        const made = getNode('paragraph', [])
        putNode(tree, made, at.parentId, at.index + 1)
        return caret(made.id, 0)
      })
      return
    }
    if (itemOf(id)) {
      dispatch(() => enterInList(id, offset))
      return
    }
    dispatch(() => splitAt(id, offset))
  }

  function onHostKeydown(id: string, event: KeyboardEvent) {
    const held = tree.nodes[id]
    const element = event.currentTarget as HTMLElement
    if (!held) return
    const open: (Command | Mention)[] = slash?.id === id ? offered : mention?.id === id ? picks : []
    if ((slash?.id === id || mention?.id === id) && (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'Enter' || event.key === 'Escape')) {
      event.preventDefault()
      event.stopPropagation()
      if (event.key === 'Escape') {
        slash = null
        mention = null
        return
      }
      if (open.length === 0) return
      if (event.key === 'Enter') {
        const pick = open[chosen % open.length]
        if ('label' in pick) takeMention(pick)
        else takeCommand(pick)
        return
      }
      chosen = (chosen + (event.key === 'ArrowDown' ? 1 : -1) + open.length) % open.length
      void tick().then(() => frame?.querySelector('.dnd-write-pick-lit')?.scrollIntoView({ block: 'nearest' }))
      return
    }
    if (event.key === 'Enter' && event.shiftKey) {
      event.preventDefault()
      if (LINED.includes(held.kind)) return
      const offset = caretOffset(element) ?? 0
      dispatch(() => splice(id, offset, offset, [{ ref: 'break' }]))
      return
    }
    if (event.key === 'Tab' && itemOf(id)) {
      event.preventDefault()
      const offset = caretOffset(element) ?? 0
      dispatch(() => (event.shiftKey ? outdent(id, offset) : indent(id, offset)))
      return
    }
    if ((event.key === 'ArrowUp' || event.key === 'ArrowDown') && !event.shiftKey && !event.metaKey && !event.ctrlKey && !event.altKey) {
      const sel = window.getSelection()
      if (!sel || !sel.isCollapsed) return
      const by = event.key === 'ArrowUp' ? -1 : 1
      if (!caretAtEdge(element, by)) return
      const next = adjacentText(id, by)
      if (!next) return
      event.preventDefault()
      selection = caret(next, by === -1 ? getInlineLength(inlineOf(next)) : 0)
      void place(selection as Selection & { kind: 'text' })
    }
  }

  function onHostClick(event: MouseEvent) {
    if (!(event.metaKey || event.ctrlKey)) return
    const anchor = (event.target as HTMLElement | null)?.closest('a')
    const href = anchor?.getAttribute('href')
    if (!href) return
    event.preventDefault()
    window.open(href, '_blank', 'noopener')
  }

  function onSurfaceKeydown(event: KeyboardEvent) {
    if (event.defaultPrevented) return
    const mod = event.metaKey || event.ctrlKey
    const key = event.key.toLowerCase()
    if (event.key === 'Escape') {
      slash = null
      mention = null
      if (selection?.kind === 'blocks') selection = null
      return
    }
    if (event.shiftKey && !mod && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
      if (extendVertically(event.key === 'ArrowUp' ? -1 : 1)) event.preventDefault()
      return
    }
    if (event.shiftKey && !mod && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
      if (extendHorizontally(event.key === 'ArrowLeft' ? -1 : 1)) event.preventDefault()
      return
    }
    if (!mod && !event.shiftKey && !event.altKey && event.key.startsWith('Arrow')) {
      if (collapse(event.key === 'ArrowUp' || event.key === 'ArrowLeft' ? -1 : 1)) event.preventDefault()
      return
    }
    if (!mod && (event.key === 'Backspace' || event.key === 'Delete')) {
      if (deleteSelected()) event.preventDefault()
      return
    }
    if (!mod) return
    if (key === 'a' && !event.shiftKey && !event.altKey) {
      event.preventDefault()
      const next = outwards()
      if (!next) return
      selection = next
      if (next.kind === 'text') void place(next)
      else {
        window.getSelection()?.removeAllRanges()
        surface?.focus({ preventScroll: true })
      }
      return
    }
    if (key === 'z' && !event.shiftKey) {
      event.preventDefault()
      restore(past, future)
      return
    }
    if ((key === 'z' && event.shiftKey) || key === 'y') {
      event.preventDefault()
      restore(future, past)
      return
    }
    if (event.shiftKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
      event.preventDefault()
      const id = selection?.kind === 'text' ? selection.id : selection?.kind === 'blocks' ? selection.ids[0] : null
      if (!id) return
      const movable = itemOf(id)?.id ?? id
      const at = getLocation(tree, movable)
      if (!at) return
      const siblings = getSiblingIds(tree, at.parentId)
      const to = at.index + (event.key === 'ArrowUp' ? -1 : 1)
      if (to < 0 || to >= siblings.length) return
      const held = selection
      dispatch(() => {
        const moving = tree.nodes[movable]
        if (moving) putNode(tree, moving, at.parentId, to)
        return held
      })
      return
    }
    const mark: keyof Marks | undefined = key === 's' && event.shiftKey ? 'strike' : MARK_KEYS[key]
    if (!mark || selection?.kind !== 'text') return
    const element = hosts[selection.id]
    const range = element ? rangeIn(element) : null
    const id = selection.id
    if (!range || range.from === range.to || isRawKind(tree.nodes[id]?.kind ?? 'code')) return
    event.preventDefault()
    dispatch(() => {
      setInline(id, getMarkedInline(inlineOf(id), range.from, range.to, mark))
      return { kind: 'text', id, anchor: range.from, head: range.to }
    })
  }

  function outwards(): Selection | null {
    if (!selection) return tree.root.length > 0 ? { kind: 'blocks', ids: [...tree.root] } : null
    if (selection.kind === 'blocks') {
      if (selection.ids.length === 0) return { kind: 'blocks', ids: [...tree.root] }
      if (sameIds(selection.ids, tree.root)) return null
      const at = getLocation(tree, selection.ids[0])
      if (at?.parentId) return { kind: 'blocks', ids: [at.parentId] }
      return { kind: 'blocks', ids: [...tree.root] }
    }
    const inline = inlineOf(selection.id)
    const length = getInlineLength(inline)
    const from = Math.min(selection.anchor, selection.head)
    const to = Math.max(selection.anchor, selection.head)
    if (from === to) {
      let at = 0
      for (const run of inline) {
        const size = 'ref' in run ? 1 : run.text.length
        if (from < at + size || (from === at + size && at + size === length)) {
          if (size > 0) return { kind: 'text', id: selection.id, anchor: at, head: at + size }
          break
        }
        at += size
      }
    }
    if (length > 0 && !(from === 0 && to === length)) return { kind: 'text', id: selection.id, anchor: 0, head: length }
    return { kind: 'blocks', ids: [selection.id] }
  }

  function extend(by: -1 | 1): boolean {
    if (selection?.kind === 'blocks' && selection.ids.length > 0) {
      const head = by === 1 ? selection.ids[selection.ids.length - 1] : selection.ids[0]
      const tail = by === 1 ? selection.ids[0] : selection.ids[selection.ids.length - 1]
      const next = getAdjacent(head, by)
      if (!next) return false
      const from = anchorId && selection.ids.includes(anchorId) ? anchorId : tail
      const ids = getRangeIds(tree, from, next)
      if (ids.length === 0) return false
      selectBlocks(ids)
      return true
    }
    const from = selection?.kind === 'text' ? selection.id : null
    if (!from) return false
    const next = getAdjacent(from, by)
    if (!next) return false
    const ids = getRangeIds(tree, from, next)
    if (ids.length === 0) return false
    anchorId = from
    selectBlocks(ids)
    return true
  }

  function getAdjacent(id: string, by: -1 | 1): string | null {
    let current = id
    for (let step = 0; step < 32; step += 1) {
      const at = getLocation(tree, current)
      if (!at) return null
      const next = getSiblingIds(tree, at.parentId)[at.index + by]
      if (next) return next
      if (at.parentId === null) return null
      current = at.parentId
    }
    return null
  }

  function selectBlocks(ids: string[]) {
    window.getSelection()?.removeAllRanges()
    if (selection?.kind === 'blocks' && sameIds(selection.ids, ids)) return
    selection = { kind: 'blocks', ids }
    surface?.focus({ preventScroll: true })
  }

  function extendVertically(by: -1 | 1): boolean {
    if (selection?.kind === 'blocks') return extend(by)
    const element = caretHost()
    if (!element || !caretAtEdge(element, by)) return false
    return extend(by)
  }

  function extendHorizontally(by: -1 | 1): boolean {
    if (selection?.kind === 'blocks') return extend(by)
    const element = caretHost()
    const id = element?.dataset.host
    if (!element || !id) return false
    const offset = caretOffset(element)
    if (offset === null) return false
    if (by === -1 ? offset !== 0 : offset !== getInlineLength(inlineOf(id))) return false
    return extend(by)
  }

  function collapse(by: -1 | 1): boolean {
    if (selection?.kind !== 'blocks' || selection.ids.length === 0) return false
    const edge = by === -1 ? selection.ids[0] : selection.ids[selection.ids.length - 1]
    anchorId = null
    const texts = getTextIds(tree, [edge])
    const target = by === -1 ? texts[0] : texts[texts.length - 1]
    if (!target) {
      if (selection.ids.length === 1) return false
      selectBlocks([edge])
      return true
    }
    selection = caret(target, by === -1 ? 0 : getInlineLength(inlineOf(target)))
    void place(selection as Selection & { kind: 'text' })
    return true
  }

  function deleteSelected(): boolean {
    if (selection?.kind !== 'blocks' || selection.ids.length === 0) return false
    const ids = [...selection.ids]
    dispatch(() => {
      const at = getLocation(tree, ids[0])
      for (const id of ids) deleteNode(tree, id)
      const parentKind = at?.parentId ? tree.nodes[at.parentId]?.kind : null
      if (parentKind && isListKind(parentKind) && at?.parentId) {
        if ((tree.nodes[at.parentId]?.children ?? []).length > 0) return null
        const listAt = getLocation(tree, at.parentId)
        deleteNode(tree, at.parentId)
        const made = getNode('paragraph', [])
        putNode(tree, made, listAt?.parentId ?? null, listAt?.index ?? 0)
        return caret(made.id, 0)
      }
      const made = getNode('paragraph', [])
      putNode(tree, made, at?.parentId ?? null, at?.index ?? 0)
      return caret(made.id, 0)
    })
    return true
  }

  function onCopy(event: ClipboardEvent) {
    const markdown = copied()
    if (markdown === null) return
    event.clipboardData?.setData('text/plain', markdown)
    event.preventDefault()
  }

  function onCut(event: ClipboardEvent) {
    if (selection?.kind !== 'blocks') return
    onCopy(event)
    deleteSelected()
  }

  function copied(): string | null {
    if (selection?.kind === 'blocks') return markdownOf(selection.ids)
    if (selection?.kind !== 'text') return null
    const element = hosts[selection.id]
    const range = element ? rangeIn(element) : null
    if (!range || range.from === range.to) return null
    const inline = inlineOf(selection.id)
    if (range.from === 0 && range.to === getInlineLength(inline)) return markdownOf([handleTargetOf(selection.id)])
    return getInlineMarkdown(getSlicedInline(inline, range.from, range.to))
  }

  function markdownOf(ids: string[]): string {
    const first = tree.nodes[ids[0]]
    if (first?.kind === 'item') {
      const list = parentOf(first.id)
      const copy: BlockTree = { root: ['copy'], nodes: { ...($state.snapshot(tree) as BlockTree).nodes, copy: getNode(list?.kind ?? 'bullet', null, ids, {}, 'copy') } }
      return getDocumentMarkdown({ blocks: getTreeBlocks(copy) })
    }
    return getDocumentMarkdown({ blocks: getTreeBlocks(tree, ids) })
  }

  function looksLikeMarkdown(text: string): boolean {
    const trimmed = text.trim()
    if (!trimmed) return false
    if (trimmed.includes('\n')) return true
    return /^(#{1,6}\s|[-*]\s|\d+\.\s|>\s|`{3}|\||!\[|\[(toc|video|pdf|page))/.test(trimmed)
  }

  function onPaste(event: ClipboardEvent) {
    const text = event.clipboardData?.getData('text/plain') ?? ''
    if (!text) return
    event.preventDefault()
    const current = selection?.kind === 'text' ? selection : null
    if (!looksLikeMarkdown(text) || (current && isRawKind(tree.nodes[current.id]?.kind ?? 'paragraph'))) {
      if (!current) return
      const id = current.id
      const element = hosts[id]
      const range = element ? rangeIn(element) : null
      const from = range?.from ?? Math.min(current.anchor, current.head)
      const to = range?.to ?? Math.max(current.anchor, current.head)
      const raw = isRawKind(tree.nodes[id]?.kind ?? 'paragraph')
      const runs: Inline = raw
        ? text.split('\n').flatMap((line, index): Inline => (index === 0 ? [{ text: line }] : [{ ref: 'break' }, { text: line }]))
        : getInline(text.replace(/\n/g, ' '))
      dispatch(() => splice(id, from, to, runs))
      return
    }
    const grown = getTree(getBlocksFromMarkdown(text))
    if (grown.root.length === 0) return
    dispatch(() => {
      Object.assign(tree.nodes, grown.nodes)
      if (!current) {
        let index = tree.root.length
        for (const id of grown.root) {
          const held = tree.nodes[id]
          if (held) putNode(tree, held, null, index)
          index += 1
        }
        return null
      }
      const anchor = handleTargetOf(current.id)
      const at = getLocation(tree, anchor)
      if (!at) return null
      const parentKind = at.parentId ? tree.nodes[at.parentId]?.kind : null
      const target = parentKind && isListKind(parentKind) ? getLocation(tree, at.parentId ?? '') : at
      if (!target) return null
      const held = tree.nodes[current.id]
      const isEmpty = held?.kind === 'paragraph' && getInlineLength(held.inline ?? []) === 0 && anchor === current.id
      let index = isEmpty ? target.index : target.index + 1
      let last: string | null = null
      for (const id of grown.root) {
        const made = tree.nodes[id]
        if (!made) continue
        putNode(tree, made, target.parentId, index)
        index += 1
        last = id
      }
      if (isEmpty) deleteNode(tree, current.id)
      if (!last) return null
      const texts = getTextIds(tree, [last])
      const end = texts[texts.length - 1]
      return end ? caret(end, getInlineLength(inlineOf(end))) : { kind: 'blocks', ids: [last] }
    })
  }

  function takeCommand(command: Command) {
    const pop = slash
    if (!pop) return
    slash = null
    dispatch(() => splice(pop.id, pop.from, pop.to, []))
    run(pop.id, command.kind, command.options)
  }

  function takeMention(pick: Mention) {
    const pop = mention
    if (!pop) return
    mention = null
    dispatch(() => splice(pop.id, pop.from, pop.to, [{ ref: 'mention', mark: pop.mark, label: pick.label, id: pick.id }, { text: ' ' }]))
  }

  function shut(event: PointerEvent) {
    const target = event.target as Element | null
    if (menu && !target?.closest('.dnd-write-menu, .dnd-write-handle')) closeMenu()
    if ((slash || mention) && !target?.closest('.dnd-write-pop') && target !== hosts[(slash ?? mention)?.id ?? '']) {
      slash = null
      mention = null
    }
    if (pageSearch && !target?.closest('.dnd-write-pop, .dnd-write-page-input')) pageSearch = null
  }

  function common<T>(ids: string[], read: (held: BlockNode) => T): T | null {
    const first = tree.nodes[ids[0]]
    if (!first) return null
    const value0 = read(first)
    return ids.every((id) => tree.nodes[id] && read(tree.nodes[id]) === value0) ? value0 : null
  }

  function getOptions(ids: string[]): Option[] {
    const nodes = ids.map((id) => tree.nodes[id]).filter((one): one is BlockNode => !!one)
    const first = nodes[0]
    if (!first) return []
    const many = nodes.length > 1
    const every = (kinds: NodeKind[]) => nodes.every((one) => kinds.includes(one.kind))
    const setAll = (change: (held: BlockNode) => void) =>
      dispatch(() => {
        for (const one of nodes) change(one)
        return undefined
      })
    const setOption = (patch: BlockOptions) => setAll((one) => Object.assign(one.options, patch))
    const setLook = (patch: BlockOptions) => setAll((one) => Object.assign(one.options, patch, { own: true }))
    const pick = <T extends string>(title: string, choices: { id: T; title: string; description?: string }[], current: T | null, apply: (id: T) => void, glyph?: GlyphName): Option => ({
      title,
      glyph,
      description: choices.find((one) => one.id === current)?.title ?? '',
      choices: choices.map((one) => ({ title: one.title, description: one.description, active: one.id === current, run: () => apply(one.id) }))
    })
    const flip = (title: string, current: boolean | null, on: string, off: string, apply: (next: boolean) => void, glyph?: GlyphName): Option => ({
      title,
      glyph,
      description: current === null ? '' : current ? on : off,
      choices: [
        { title: on, active: current === true, run: () => apply(true) },
        { title: off, active: current === false, run: () => apply(false) }
      ]
    })
    const field = (title: string, description: string, value: string, placeholderText: string, apply: (next: string) => void | Promise<void>, glyph?: GlyphName): Option => ({
      title,
      glyph,
      description,
      field: { value, placeholder: placeholderText, apply }
    })
    const removeLabel = many ? `Remove these ${nodes.length} blocks` : 'Remove this block'
    const deleteAll = () =>
      dispatch(() => {
        for (const one of nodes) {
          const at = getLocation(tree, one.id)
          deleteNode(tree, one.id)
          if (at?.parentId) tidy(at.parentId)
        }
        if (tree.root.length === 0) putNode(tree, getNode('paragraph', []), null, 0)
        return null
      })

    const shared: Option[] = [
      flip('Inherits', common(ids, (one) => !one.options.own), 'Text from the page', 'Text set here', (next) =>
        setAll((one) => {
          if (next) {
            delete one.options.own
            delete one.options.font
            delete one.options.size
            delete one.options.leading
          } else one.options.own = true
        })
      ),
      pick('Font', FONTS, common(ids, (one) => getLook(tree, one.id).font ?? '--font-body'), (id) => setLook({ font: id })),
      pick('Font size', SIZES, common(ids, (one) => getLook(tree, one.id).size ?? 'md'), (id) => setLook({ size: id })),
      pick('Line height', LEADINGS, common(ids, (one) => getLook(tree, one.id).leading ?? 'normal'), (id) => setLook({ leading: id }))
    ]
    if (nodes.every((one) => ALIGNED.includes(one.kind))) {
      const aligns = every(['paragraph']) ? ALIGNS : ALIGNS.slice(0, 3)
      shared.push(pick('Align', aligns, common(ids, (one) => one.options.align ?? 'start'), (id) => setOption({ align: id })))
    }
    if (every(['paragraph', 'table'])) {
      shared.push(pick('Width', WIDTHS, common(ids, (one) => one.options.width ?? 'full'), (id) => setOption({ width: id })))
    }
    for (const option of shared) option.shared = true

    const own: Option[] = []
    const kind = every([first.kind]) ? first.kind : ''
    switch (kind) {
      case 'item': {
        const list = parentOf(first.id)
        const listKind = (common(ids, (one) => parentOf(one.id)?.kind ?? '') ?? '') as 'bullet' | 'number' | 'todo'
        own.push(
          pick(
            'List type',
            [
              { id: 'bullet' as const, title: 'Bulleted' },
              { id: 'number' as const, title: 'Numbered' },
              { id: 'todo' as const, title: 'Task' }
            ],
            listKind,
            (id) =>
              dispatch(() => {
                if (list) list.kind = id
                return undefined
              })
          )
        )
        break
      }
      case 'paragraph':
        own.push(pick('Wrap', WRAPS, common(ids, (one) => one.options.wrap ?? 'wrap'), (id) => setOption({ wrap: id })))
        break
      case 'heading':
        own.push(
          pick(
            'Level',
            [1, 2, 3, 4].map((level) => ({ id: String(level), title: `Heading ${level}`, description: ['Largest', 'Large', 'Medium', 'Small'][level - 1] })),
            common(ids, (one) => String(one.options.level ?? 1)),
            (id) => setOption({ level: Number(id) })
          )
        )
        break
      case 'code':
        own.push(field('Language', first.options.language || 'Plain text', first.options.language ?? '', 'json', (next) => setOption({ language: next }), 'edit'))
        own.push({ title: 'Copy code', glyph: 'copy', description: 'Copy block contents', run: () => void navigator.clipboard?.writeText(getInlineText(first.inline ?? [])) })
        break
      case 'html':
        own.push({ title: 'Copy HTML', glyph: 'copy', description: 'Copy the markup', run: () => void navigator.clipboard?.writeText(getInlineText(first.inline ?? [])) })
        break
      case 'toggle':
        own.push(flip('Default state', common(ids, (one) => !!one.options.open), 'Open', 'Folded', (next) => setOption({ open: next }), 'unfold'))
        break
      case 'image':
      case 'video':
      case 'pdf': {
        const name = MEDIA_NAMES[kind] ?? kind
        own.push(mediaField(first, kind as PickedKind, `Replace ${name}`, first.options.src ?? '', 'src'))
        break
      }
      case 'bookmark': {
        const url = first.options.url ?? ''
        own.push(
          { title: 'Open link', glyph: 'export', description: url || 'No link set', run: () => void (url && window.open(url, '_blank', 'noopener')) },
          { title: 'Copy link', glyph: 'copy', description: 'Copy the address', run: () => void navigator.clipboard?.writeText(url) },
          field('Replace link', url || 'No link set', url, 'https://', (next) => {
            if (!next) return
            setOption({ url: next })
            void preview(first.id)
          })
        )
        break
      }
      case 'embed':
      case 'map': {
        const where = getInlineText(first.inline ?? [])
        own.push(
          { title: 'Open in new tab', glyph: 'export', description: where || 'No address set', run: () => void (where && window.open(where, '_blank', 'noopener')) },
          field(kind === 'map' ? 'Set address' : 'Replace embed', where || 'No address set', where, 'https://', (next) =>
            dispatch(() => {
              setInline(first.id, next ? [{ text: next }] : [])
              return undefined
            })
          )
        )
        break
      }
      case 'file': {
        const url = first.options.url ?? ''
        own.push(
          { title: 'Open', glyph: 'export', description: url || 'No file set', run: () => reveal(first) },
          {
            title: 'Download',
            glyph: 'save',
            description: 'Save the file',
            run: () => {
              if (!url) return
              const link = document.createElement('a')
              link.href = url
              link.download = first.options.name ?? 'file'
              document.body.appendChild(link)
              link.click()
              link.remove()
            }
          },
          mediaField(first, 'file', 'Replace file', url, 'url')
        )
        break
      }
      case 'toc':
        own.push(
          pick('Placement', PLACEMENTS, common(ids, (one) => one.options.placement ?? 'inline'), (id) => setOption({ placement: id })),
          flip('Title', common(ids, (one) => one.options.showTitle !== false), 'Shown', 'Hidden', (next) => setOption({ showTitle: next })),
          flip('Box', common(ids, (one) => !one.options.bare), 'Shown', 'Hidden', (next) => setOption({ bare: !next }))
        )
        break
      case 'page': {
        const pageId = first.options.page ?? ''
        const title = getInlineText(first.inline ?? [])
        if (pageId) own.push({ title: 'Open page', glyph: 'export', description: title || 'Go to the linked page', run: () => onopen?.({ mark: '@', label: title, id: pageId }) })
        own.push({
          title: 'Change page',
          glyph: 'revert',
          description: pageId ? 'Link a different page' : 'Search or create a page',
          run: () => {
            setOption({ page: '' })
            pageSearch = { id: first.id, query: title, picks: [], seeking: !!onpages, chosen: -1 }
          }
        })
        break
      }
      case 'columns': {
        const count = first.children?.length ?? 0
        own.push(
          {
            title: 'Add column',
            glyph: 'add',
            description: `${count + 1} across`,
            run: () =>
              dispatch(() => {
                const paragraph = getNode('paragraph', [])
                tree.nodes[paragraph.id] = paragraph
                putNode(tree, getNode('column', null, [paragraph.id]), first.id, count)
                return undefined
              })
          },
          {
            title: 'Remove column',
            glyph: 'minus',
            description: count > 2 ? `${count - 1} across` : 'Keeps two columns',
            run: () =>
              dispatch(() => {
                const last = first.children?.[count - 1]
                if (last && count > 2) deleteNode(tree, last)
                return undefined
              })
          }
        )
        break
      }
    }
    if (nodes.every((one) => VIEWED.includes(one.kind))) {
      own.push(pick('Read view', VIEWS, common(ids, (one) => one.options.view ?? 'full'), (id) => setOption({ view: id })))
    }
    const kept = many ? own.filter((option) => option.choices?.length) : own
    return [...shared, ...kept, { title: 'Delete', glyph: 'remove', description: removeLabel, bane: true, run: deleteAll }]
  }

  function mediaField(held: BlockNode, kind: PickedKind, title: string, current: string, key: 'src' | 'url'): Option {
    const description = current || `No ${MEDIA_NAMES[kind] ?? kind} set`
    if (requestMedia) {
      return {
        title,
        glyph: 'upload',
        description,
        run: async () => {
          const asset = await requestMedia(kind, current || undefined)
          if (!asset) return
          dispatch(() => {
            Object.assign(held.options, getSource(kind, asset))
            return undefined
          })
        }
      }
    }
    return {
      title,
      glyph: 'edit',
      description,
      field: {
        value: current,
        placeholder: 'https://',
        apply: (next) => {
          if (!next) return
          dispatch(() => {
            held.options[key] = next
            return undefined
          })
        }
      }
    }
  }

  function onMenuMain(option: Option) {
    if (option.field || (option.choices?.length ?? 0) > 2) {
      sub = option
      cursor = 0
      draft = option.field?.value ?? ''
      void tick().then(() => panel?.querySelector<HTMLInputElement>('.dnd-write-menu-input')?.select())
      return
    }
    if (option.choices?.length) {
      const next = option.choices.find((one) => !one.active) ?? option.choices[0]
      next.run()
      closeMenu()
      return
    }
    option.run?.()
    closeMenu()
  }

  function onMenuChoice(choice: Choice) {
    choice.run()
    closeMenu()
  }

  function onMenuApply() {
    const held = sub?.field
    if (!held) return
    void held.apply(draft.trim())
    closeMenu()
  }

  function onMenuKeydown(event: KeyboardEvent) {
    const count = sub ? (sub.choices?.length ?? 0) : options.length
    if (sub?.field) {
      event.stopPropagation()
      if (event.key === 'Enter') {
        event.preventDefault()
        onMenuApply()
      } else if (event.key === 'Escape') {
        event.preventDefault()
        sub = null
      }
      return
    }
    if (['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight', 'Enter', 'Backspace', 'Escape'].includes(event.key)) event.stopPropagation()
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      cursor = Math.min(cursor + 1, count - 1)
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      if (sub && cursor === 0) sub = null
      else cursor = Math.max(cursor - 1, 0)
    } else if (event.key === 'Backspace' || event.key === 'ArrowLeft') {
      if (sub) {
        event.preventDefault()
        sub = null
      }
    } else if (event.key === 'Enter') {
      event.preventDefault()
      if (sub) {
        const choice = sub.choices?.[cursor]
        if (choice) onMenuChoice(choice)
      } else {
        const option = options[cursor]
        if (option) onMenuMain(option)
      }
    } else if (event.key === 'ArrowRight') {
      const option = options[cursor]
      if (!sub && option && (option.field || (option.choices?.length ?? 0) > 2)) {
        event.preventDefault()
        onMenuMain(option)
      }
    } else if (event.key === 'Escape') {
      event.preventDefault()
      if (sub) sub = null
      else closeMenu()
    }
  }

  async function preview(id: string) {
    const url = tree.nodes[id]?.options.url
    if (!url || !onpreview) return
    const found = await onpreview(url).catch(() => null)
    const held = tree.nodes[id]
    if (!found || !held) return
    dispatch(() => {
      if (getInlineLength(held.inline ?? []) === 0) held.inline = getInline(found.title)
      held.options.description = found.description
      held.options.image = found.image
      return undefined
    })
  }

  async function pick(id: string, kind: PickedKind) {
    const held = tree.nodes[id]
    if (!held || !requestMedia) return
    const current = kind === 'file' ? held.options.url : held.options.src
    const asset = await requestMedia(kind, current || undefined)
    const target = tree.nodes[id]
    if (!asset || !target) return
    dispatch(() => {
      Object.assign(target.options, getSource(kind, asset))
      return undefined
    })
  }

  function reveal(held: BlockNode) {
    if (held.options.assetId) openAsset?.(held.options.assetId)
    else if (held.options.url) window.open(held.options.url, '_blank', 'noopener')
  }

  function check(id: string) {
    const held = tree.nodes[id]
    if (!held) return
    dispatch(() => {
      held.options.done = !held.options.done
      return undefined
    })
  }

  function fold(id: string) {
    const held = tree.nodes[id]
    if (!held) return
    dispatch(() => {
      held.options.open = !held.options.open
      return undefined
    })
  }

  function goTo(id: string) {
    blockEl(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  function onPageInput(id: string, event: Event) {
    const input = event.currentTarget as HTMLInputElement
    const held = tree.nodes[id]
    if (!held) return
    dispatch(() => {
      held.inline = input.value ? [{ text: input.value }] : []
      return undefined
    }, true)
    if (held.options.page) return
    if (onpages) pageSearch = { id, query: input.value.trim(), picks: pageSearch?.picks ?? [], seeking: true, chosen: -1 }
  }

  function onPageKeydown(id: string, event: KeyboardEvent) {
    const open = pageSearch?.id === id ? pageSearch.picks : []
    if (pageSearch?.id === id && open.length > 0 && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
      event.preventDefault()
      const at = pageSearch.chosen
      pageSearch.chosen = at < 0 ? (event.key === 'ArrowDown' ? 0 : open.length - 1) : (at + (event.key === 'ArrowDown' ? 1 : -1) + open.length) % open.length
      return
    }
    if (event.key === 'Enter') {
      event.preventDefault()
      if (pageSearch?.id === id && pageSearch.chosen >= 0 && open[pageSearch.chosen]) {
        linkPage(id, open[pageSearch.chosen])
        return
      }
      void makePage(id)
      return
    }
    if (event.key === 'Escape') pageSearch = null
  }

  function linkPage(id: string, found: Mention) {
    pageSearch = null
    const held = tree.nodes[id]
    if (!held) return
    dispatch(() => {
      held.options.page = found.id
      held.inline = [{ text: found.label }]
      return undefined
    })
  }

  async function makePage(id: string) {
    pageSearch = null
    const held = tree.nodes[id]
    if (!held) return
    const title = getInlineText(held.inline ?? []).trim() || 'Untitled page'
    const made = await onpage?.(title)
    const target = tree.nodes[id]
    if (!made || !target) return
    dispatch(() => {
      target.options.page = made
      target.inline = [{ text: title }]
      return undefined
    })
    onopen?.({ mark: '@', label: title, id: made })
  }

  function hint(held: BlockNode): string | null {
    if (getInlineLength(held.inline ?? []) > 0) return null
    switch (held.kind) {
      case 'paragraph':
        return placeholder
      case 'heading':
        return `Heading ${held.options.level ?? 1}`
      case 'toggle':
        return 'Toggle'
      case 'poll':
        return 'The question, then one choice per line'
      case 'bookmark':
        return 'What the link is called'
      case 'video':
        return 'What the video shows'
      case 'pdf':
        return 'What the document is'
      case 'image':
        return 'What the picture shows'
      case 'mermaid':
        return 'graph TD; A-->B'
      case 'html':
        return '<p>Markup, drawn when read</p>'
      case 'embed':
        return 'https:// address to frame'
      case 'map':
        return 'A map address, or a stored picture'
      case 'meeting':
        return 'Date, attendees, then notes'
      case 'table':
        return 'A row per line, cells split on pipes'
      case 'code':
        return 'Code'
      default:
        return null
    }
  }

  function address(held: BlockNode): string {
    if (held.kind === 'bookmark' || held.kind === 'file') return held.options.url ?? ''
    if (LINED.includes(held.kind)) return getInlineText(held.inline ?? [])
    return held.options.src ?? ''
  }

  function dropClass(id: string): string {
    const target = drag?.target
    if (!drag?.on || !target) return ''
    if (target.refId === id) return target.before ? 'dnd-write-block-before' : 'dnd-write-block-after'
    if (!target.refId && target.parentId === id) return 'dnd-write-block-active'
    return ''
  }
</script>

<svelte:window onpointerdown={shut} />

{#snippet nodes(ids: string[])}
  {#each ids as id (id)}
    {#if tree.nodes[id]}
      {@render block(tree.nodes[id])}
    {/if}
  {/each}
{/snippet}

{#snippet text(held: BlockNode, tag: string, extra: string)}
  {@const own = look(held)}
  <svelte:element
    this={tag}
    class="dnd-write-host dnd-write-host-{held.kind} {extra}"
    class:dnd-write-host-raw={isRawKind(held.kind)}
    class:dnd-write-host-narrow={held.options.width === 'narrow'}
    class:dnd-write-host-balance={held.options.wrap === 'balance'}
    class:dnd-write-host-nowrap={held.options.wrap === 'nowrap'}
    style:text-align={held.options.align ?? null}
    style:font-family={own.font}
    style:font-size={own.size}
    style:line-height={own.leading}
    data-host={held.id}
    data-placeholder={hint(held)}
    data-number={held.kind === 'heading' && headingNumbering ? numbers[held.id] : null}
    contenteditable="true"
    spellcheck="false"
    role="textbox"
    aria-multiline="true"
    aria-label={held.kind}
    tabindex="0"
    {@attach host(held.id)}
    onbeforeinput={(event) => onHostBeforeInput(held.id, event)}
    oninput={(event) => onHostInput(held.id, isRawKind(held.kind) || held.kind === 'toggle', event)}
    onkeydown={(event) => onHostKeydown(held.id, event)}
    onclick={onHostClick}
  ></svelte:element>
{/snippet}

{#snippet vacant(held: BlockNode, kind: PickedKind, title: string, hintText: string, glyph: GlyphName, row: boolean)}
  <button type="button" class="dnd-write-empty" class:dnd-write-empty-row={row} disabled={!requestMedia} onclick={() => pick(held.id, kind)}>
    <span class="dnd-write-empty-art" aria-hidden="true"><Glyph name={glyph} size={row ? 'md' : 'lg'} /></span>
    <span class="dnd-write-empty-text">
      <span class="dnd-write-empty-title">{title}</span>
      <span class="dnd-write-empty-hint">{requestMedia ? hintText : `Set the ${MEDIA_NAMES[held.kind] ?? held.kind} from the block menu`}</span>
    </span>
  </button>
{/snippet}

{#snippet block(held: BlockNode)}
  {@const own = look(held)}
  {@const isPicked = picked.includes(held.id)}
  {#if held.kind === 'paragraph'}
    <div class="dnd-write-block dnd-write-block-paragraph {dropClass(held.id)}" class:dnd-write-block-picked={isPicked} data-block={held.id}>
      {@render text(held, 'p', '')}
    </div>
  {:else if held.kind === 'heading'}
    <div class="dnd-write-block dnd-write-block-heading {dropClass(held.id)}" class:dnd-write-block-picked={isPicked} data-block={held.id}>
      {@render text(held, `h${Math.min(Math.max(held.options.level ?? 1, 1), 6)}`, `dnd-write-host-h${Math.min(held.options.level ?? 1, 4)}`)}
    </div>
  {:else if isListKind(held.kind)}
    <svelte:element
      this={held.kind === 'number' ? 'ol' : 'ul'}
      class="dnd-write-block dnd-write-list dnd-write-list-{held.kind} {dropClass(held.id)}"
      class:dnd-write-block-picked={isPicked}
      data-block={held.id}
      style:font-family={own.font}
      style:font-size={own.size}
      style:line-height={own.leading}
    >
      {@render nodes(held.children ?? [])}
    </svelte:element>
  {:else if held.kind === 'item'}
    {@const listKind = parentOf(held.id)?.kind}
    <li
      class="dnd-write-block dnd-write-item {dropClass(held.id)}"
      class:dnd-write-item-todo={listKind === 'todo'}
      class:dnd-write-item-done={listKind === 'todo' && held.options.done}
      class:dnd-write-block-picked={isPicked}
      data-block={held.id}
      style:font-family={own.font}
      style:font-size={own.size}
      style:line-height={own.leading}
      style:text-align={held.options.align ?? null}
    >
      {#if listKind === 'todo'}
        <button
          type="button"
          class="dnd-write-tick"
          class:dnd-write-tick-done={held.options.done}
          aria-pressed={Boolean(held.options.done)}
          aria-label={held.options.done ? 'Undo this task' : 'Mark this task done'}
          onclick={() => check(held.id)}
        ></button>
      {/if}
      <div class="dnd-write-item-body">{@render nodes(held.children ?? [])}</div>
    </li>
  {:else if held.kind === 'quote'}
    <blockquote
      class="dnd-write-block dnd-write-quote {dropClass(held.id)}"
      class:dnd-write-block-picked={isPicked}
      data-block={held.id}
      style:font-family={own.font}
      style:font-size={own.size}
      style:line-height={own.leading}
      style:text-align={held.options.align ?? null}
    >
      {@render nodes(held.children ?? [])}
    </blockquote>
  {:else if held.kind === 'callout'}
    <aside
      class="dnd-write-block dnd-write-callout {dropClass(held.id)}"
      class:dnd-write-block-picked={isPicked}
      data-block={held.id}
      style:font-family={own.font}
      style:font-size={own.size}
      style:line-height={own.leading}
      style:text-align={held.options.align ?? null}
    >
      <span class="dnd-write-callout-sign" aria-hidden="true">!</span>
      <div class="dnd-write-callout-body">{@render nodes(held.children ?? [])}</div>
    </aside>
  {:else if held.kind === 'toggle'}
    <div
      class="dnd-write-block dnd-write-toggle {dropClass(held.id)}"
      class:dnd-write-block-picked={isPicked}
      class:dnd-write-toggle-open={held.options.open}
      data-block={held.id}
      style:font-family={own.font}
      style:font-size={own.size}
      style:line-height={own.leading}
    >
      <div class="dnd-write-toggle-head">
        <button type="button" class="dnd-write-fold" aria-expanded={Boolean(held.options.open)} aria-label={held.options.open ? 'Fold' : 'Unfold'} onclick={() => fold(held.id)}></button>
        {@render text(held, 'div', 'dnd-write-host-summary')}
      </div>
      {#if held.options.open}
        <div class="dnd-write-toggle-body">{@render nodes(held.children ?? [])}</div>
      {/if}
    </div>
  {:else if held.kind === 'columns'}
    <div
      class="dnd-write-block dnd-write-columns {dropClass(held.id)}"
      class:dnd-write-block-picked={isPicked}
      data-block={held.id}
      style:font-family={own.font}
      style:font-size={own.size}
      style:line-height={own.leading}
    >
      {@render nodes(held.children ?? [])}
    </div>
  {:else if held.kind === 'column'}
    <div class="dnd-write-block dnd-write-column {dropClass(held.id)}" class:dnd-write-block-picked={isPicked} data-block={held.id}>
      {@render nodes(held.children ?? [])}
    </div>
  {:else if held.kind === 'divider'}
    <div class="dnd-write-block dnd-write-block-divider {dropClass(held.id)}" class:dnd-write-block-picked={isPicked} data-block={held.id}>
      <hr class="dnd-write-rule" />
    </div>
  {:else if held.kind === 'toc'}
    <div class="dnd-write-block dnd-write-block-toc {dropClass(held.id)}" class:dnd-write-block-picked={isPicked} data-block={held.id}>
      {#if held.options.placement && held.options.placement !== 'inline'}
        <span class="dnd-write-toc-marker dnd-label">Legend, {held.options.placement} side</span>
      {:else}
        <nav class="dnd-write-toc" class:dnd-write-toc-bare={held.options.bare} aria-label="Contents">
          {#if held.options.showTitle !== false}<span class="dnd-label dnd-write-toc-name">Contents</span>{/if}
          {#each headings as head (head.id)}
            <button type="button" class="dnd-write-toc-line dnd-write-toc-line-{Math.min(head.level, 4)}" title={head.text} onclick={() => goTo(head.id)}>
              <span class="dnd-write-toc-number">{head.number}</span>
              <span class="dnd-write-toc-text">{head.text}</span>
            </button>
          {:else}
            <span class="dnd-write-toc-line dnd-write-toc-empty">No headings yet</span>
          {/each}
        </nav>
      {/if}
    </div>
  {:else if held.kind === 'file'}
    <div class="dnd-write-block dnd-write-block-file {dropClass(held.id)}" class:dnd-write-block-picked={isPicked} data-block={held.id}>
      {#if held.options.assetId || held.options.url}
        <button type="button" class="dnd-write-file" title="Open {held.options.name || 'the file'}" onclick={() => reveal(held)}>
          <Glyph name={getMimeGlyph(held.options.mimeType ?? '')} size="sm" />
          <span class="dnd-write-file-name">{held.options.name || 'File'}</span>
          <Glyph name="export" size="sm" />
        </button>
      {:else}
        {@render vacant(held, 'file', 'Attach a file', 'Press to upload or pick a file', 'sources', true)}
      {/if}
    </div>
  {:else if held.kind === 'page'}
    <div class="dnd-write-block dnd-write-block-page {dropClass(held.id)}" class:dnd-write-block-picked={isPicked} data-block={held.id}>
      <div class="dnd-write-page-row">
        <span class="dnd-write-page-sign" aria-hidden="true"><Glyph name="scroll" size="sm" /></span>
        {#if held.options.page}
          <button type="button" class="dnd-write-page-link" onclick={() => onopen?.({ mark: '@', label: getInlineText(held.inline ?? []), id: held.options.page })}>
            <span class="dnd-write-page-name">{getInlineText(held.inline ?? []) || 'Untitled page'}</span>
            <Glyph name="forward" size="sm" />
          </button>
        {:else}
          <input
            type="text"
            class="dnd-write-page-input"
            placeholder="Untitled page"
            aria-label="Page title"
            value={getInlineText(held.inline ?? [])}
            oninput={(event) => onPageInput(held.id, event)}
            onkeydown={(event) => onPageKeydown(held.id, event)}
            onfocus={() => (pageSearch = onpages ? { id: held.id, query: getInlineText(held.inline ?? []), picks: [], seeking: true, chosen: -1 } : null)}
          />
        {/if}
      </div>
      {#if pageSearch?.id === held.id && !held.options.page && (pageSearch.seeking || pageSearch.picks.length > 0)}
        <div class="dnd-write-pop dnd-write-pop-page" role="listbox">
          {#each pageSearch.seeking ? [0, 1, 2] : [] as skeleton (skeleton)}
            <span class="dnd-write-pick dnd-write-skeleton" aria-hidden="true">
              <span class="dnd-write-pick-icon dnd-write-skeleton-mark"></span>
              <span class="dnd-write-skeleton-line"></span>
            </span>
          {/each}
          {#each pageSearch.seeking ? [] : pageSearch.picks as found, place (found.id)}
            <button type="button" class="dnd-write-pick" class:dnd-write-pick-lit={place === pageSearch.chosen} role="option" aria-selected={place === pageSearch.chosen} onclick={() => linkPage(held.id, found)}>
              {found.label || 'Untitled page'}
            </button>
          {/each}
        </div>
      {/if}
    </div>
  {:else}
    <div
      class="dnd-write-block dnd-write-card dnd-write-block-{held.kind} {dropClass(held.id)}"
      class:dnd-write-block-picked={isPicked}
      class:dnd-write-block-raw={isRawKind(held.kind) && !LINED.includes(held.kind)}
      data-block={held.id}
      style:font-family={own.font}
      style:font-size={own.size}
      style:line-height={own.leading}
    >
      {#if held.kind === 'image' && held.options.src}
        <span class="dnd-write-figure" style:text-align={held.options.align ?? null}>
          <StoredImage src={held.options.src} alt={getInlineText(held.inline ?? [])} />
        </span>
      {/if}
      {#if held.kind === 'video' && held.options.src}
        {#await getFileUrl(held.options.src) then url}
          {#if url}
            <span class="dnd-write-figure">
              <!-- svelte-ignore a11y_media_has_caption -->
              <video controls src={url}></video>
            </span>
          {/if}
        {/await}
      {/if}
      {#if UPLOADED.includes(held.kind) && !held.options.src}
        {@const name = MEDIA_NAMES[held.kind] ?? held.kind}
        {@render vacant(
          held,
          held.kind as PickedKind,
          `Add ${held.kind === 'image' ? 'an' : 'a'} ${name}`,
          `Press to upload or pick ${held.kind === 'image' ? 'an' : 'a'} ${name}`,
          held.kind === 'image' ? 'picture' : held.kind === 'video' ? 'play' : 'scroll',
          false
        )}
      {/if}
      {#if held.kind === 'bookmark' && !held.options.url}
        <span class="dnd-write-empty dnd-write-empty-row">
          <span class="dnd-write-empty-art" aria-hidden="true"><Glyph name="export" size="md" /></span>
          <span class="dnd-write-empty-text">
            <span class="dnd-write-empty-title">Add a link</span>
            <span class="dnd-write-empty-hint">Set the address from the block menu and the card fills from the page</span>
          </span>
        </span>
      {/if}
      {#if held.kind === 'bookmark' && held.options.image}
        <span class="dnd-write-figure dnd-write-figure-hero"><StoredImage src={held.options.image} alt="" /></span>
      {/if}
      {#if isRawKind(held.kind) && !LINED.includes(held.kind)}
        <span class="dnd-write-band dnd-label">{held.kind === 'code' ? held.options.language || 'Code' : held.kind === 'html' ? 'HTML' : held.kind}</span>
      {/if}
      {#if held.kind === 'poll' || held.kind === 'meeting'}
        <span class="dnd-write-card-sign" aria-hidden="true">{held.kind === 'poll' ? '?' : '◷'}</span>
      {/if}
      {@render text(held, isRawKind(held.kind) && !LINED.includes(held.kind) ? 'pre' : 'p', '')}
      {#if (held.kind === 'bookmark' || held.kind === 'pdf') && address(held)}
        <span class="dnd-write-where">{address(held)}</span>
      {/if}
      {#if held.kind === 'bookmark' && held.options.description}
        <span class="dnd-write-where dnd-write-note">{held.options.description}</span>
      {/if}
    </div>
  {/if}
{/snippet}

{#snippet row(option: Option, lit: boolean, trail: string, on: () => void, hover: () => void)}
  <button type="button" class="dnd-write-menu-row" class:dnd-write-menu-row-lit={lit} class:dnd-write-menu-row-bane={option.bane} role="menuitem" onclick={on} onpointermove={hover}>
    <span class="dnd-write-menu-glyph" aria-hidden="true">{#if option.glyph}<Glyph name={option.glyph} size="sm" />{/if}</span>
    <span class="dnd-write-menu-text">
      <span class="dnd-write-menu-title">{option.title}</span>
      {#if option.description}<span class="dnd-write-menu-note">{option.description}</span>{/if}
    </span>
    {#if trail}<span class="dnd-write-menu-trail">{trail}</span>{/if}
  </button>
{/snippet}

{#snippet legend(held: BlockNode)}
  <div class="dnd-write-legend dnd-write-legend-{held.options.placement}">
    <nav class="dnd-write-toc dnd-write-legend-list" class:dnd-write-toc-bare={held.options.bare} aria-label="Contents">
      {#if held.options.showTitle !== false}<span class="dnd-label dnd-write-toc-name dnd-write-legend-text">Contents</span>{/if}
      {#each headings as head (head.id)}
        <button type="button" class="dnd-write-toc-line dnd-write-legend-link dnd-write-toc-line-{Math.min(head.level, 4)}" title={head.text} onclick={() => goTo(head.id)}>
          <span class="dnd-write-legend-mark dnd-write-legend-mark-{Math.min(head.level, 4)}" aria-hidden="true"></span>
          <span class="dnd-write-legend-text">
            <span class="dnd-write-toc-number">{head.number}</span>
            {head.text}
          </span>
        </button>
      {/each}
    </nav>
  </div>
{/snippet}

{#if !editable}
  <BlockReader value={{ blocks: flat }} {onopen} {onvote} {onsearch} {onasset} {openAsset} {headingNumbering} {mine} />
{:else}
  <div
    class="dnd-write"
    class:dnd-write-dragging={drag?.on}
    class:dnd-write-legended-left={legends.some((one) => one.options.placement === 'left')}
    class:dnd-write-legended-right={legends.some((one) => one.options.placement === 'right')}
    bind:this={frame}
  >
    <div
      class="dnd-write-surface"
      class:dnd-write-surface-empty={empty}
      bind:this={surface}
      role="textbox"
      aria-multiline="true"
      aria-label="Page"
      tabindex="-1"
      onpointermove={onSurfaceMove}
      onpointerleave={onSurfaceLeave}
      onpointerdown={onSurfaceDown}
      onkeydown={onSurfaceKeydown}
      oncopy={onCopy}
      oncut={onCut}
      onpaste={onPaste}
    >
      {@render nodes(tree.root)}
    </div>

    {#if hovered && !drag?.on}
      <div class="dnd-write-handle" style:top="{handleAt.top}px" style:left="{handleAt.left}px">
        <IconBtn title="Options, drag to move" active={!!menu} onpointerdown={onHandleDown} onclick={onHandleClick}>
          <Glyph name="more" size="sm" />
        </IconBtn>
      </div>
    {/if}

    {#if menu}
      <div class="dnd-write-menu" style:top="{menu.top}px" style:left="{menu.left}px" role="menu" tabindex="-1" bind:this={panel} onkeydown={onMenuKeydown}>
        <div class="dnd-write-menu-track" class:dnd-write-menu-sub={sub}>
          <div class="dnd-write-menu-panel">
            {#if menu.ids.length > 1}
              <div class="dnd-write-menu-head dnd-label">{menu.ids.length} blocks selected</div>
            {/if}
            {#each options as option, place (option.title)}
              {#if place > 0 && options[place - 1].shared && !option.shared}
                <div class="dnd-write-menu-split"></div>
              {/if}
              {@render row(
                option,
                !sub && cursor === place,
                option.field || (option.choices?.length ?? 0) > 2 ? '›' : option.choices?.length === 2 ? (option.choices.find((one) => one.active)?.title ?? '') : '',
                () => onMenuMain(option),
                () => (cursor = place)
              )}
            {/each}
          </div>
          <div class="dnd-write-menu-panel">
            <button type="button" class="dnd-write-menu-row dnd-write-menu-back" onclick={() => (sub = null)}>
              <span class="dnd-write-menu-glyph" aria-hidden="true"><Glyph name="back" size="sm" /></span>
              <span class="dnd-write-menu-title">{sub?.title}</span>
            </button>
            {#if sub?.field}
              <form
                class="dnd-write-menu-form"
                onsubmit={(event) => {
                  event.preventDefault()
                  onMenuApply()
                }}
              >
                <input type="text" class="dnd-write-menu-input" placeholder={sub.field.placeholder} aria-label={sub.title} bind:value={draft} />
                {#if sub.description}<span class="dnd-write-menu-note">{sub.description}</span>{/if}
                <button type="submit" class="dnd-write-menu-row dnd-write-menu-apply">
                  <span class="dnd-write-menu-glyph" aria-hidden="true"><Glyph name="save" size="sm" /></span>
                  <span class="dnd-write-menu-title">{sub.field.action ?? 'Apply'}</span>
                </button>
              </form>
            {:else}
              {#each sub?.choices ?? [] as choice, place (choice.title)}
                <button
                  type="button"
                  class="dnd-write-menu-row"
                  class:dnd-write-menu-row-lit={cursor === place}
                  class:dnd-write-menu-row-on={choice.active}
                  role="menuitemradio"
                  aria-checked={Boolean(choice.active)}
                  onclick={() => onMenuChoice(choice)}
                  onpointermove={() => (cursor = place)}
                >
                  <span class="dnd-write-menu-glyph" aria-hidden="true"></span>
                  <span class="dnd-write-menu-text">
                    <span class="dnd-write-menu-title">{choice.title}</span>
                    {#if choice.description}<span class="dnd-write-menu-note">{choice.description}</span>{/if}
                  </span>
                  {#if choice.active}<span class="dnd-write-menu-trail">✓</span>{/if}
                </button>
              {/each}
            {/if}
          </div>
        </div>
      </div>
    {/if}

    {#if slash && offered.length > 0}
      <div class="dnd-write-pop" style:top="{slash.top}px" style:left="{slash.left}px" role="listbox">
        {#each offered as command, place (command.title)}
          <button type="button" class="dnd-write-pick" class:dnd-write-pick-lit={place === chosen} role="option" aria-selected={place === chosen} onclick={() => takeCommand(command)} onpointermove={() => (chosen = place)}>
            <span class="dnd-write-pick-sign" aria-hidden="true">
              {#if command.icon}<Glyph name={command.icon} size="sm" />{:else}{command.mark}{/if}
            </span>
            <span class="dnd-write-pick-text">
              <span class="dnd-write-pick-name">{command.title}</span>
              <span class="dnd-write-pick-note">{command.description}</span>
            </span>
          </button>
        {/each}
      </div>
    {/if}

    {#if mention && onsearch && (seeking || picks.length > 0)}
      <div class="dnd-write-pop" style:top="{mention.top}px" style:left="{mention.left}px" role="listbox">
        <p class="dnd-label dnd-write-pop-name">{mention.mark === '@' ? 'Mention' : 'Tag'}</p>
        {#each seeking ? [0, 1, 2] : [] as skeleton (skeleton)}
          <span class="dnd-write-pick dnd-write-skeleton" aria-hidden="true">
            <span class="dnd-write-pick-icon dnd-write-skeleton-mark"></span>
            <span class="dnd-write-skeleton-line"></span>
          </span>
        {/each}
        {#each seeking ? [] : picks as found, place (found.id)}
          <button type="button" class="dnd-write-pick" class:dnd-write-pick-lit={place === chosen} role="option" aria-selected={place === chosen} onclick={() => takeMention(found)} onpointermove={() => (chosen = place)}>
            {#if found.icon}
              <span class="dnd-write-pick-icon"><StoredImage src={found.icon} alt="" /></span>
            {/if}
            {found.label}
          </button>
        {/each}
      </div>
    {/if}

    {#each legends as held (held.id)}
      {@render legend(held)}
    {/each}

    {#if drag?.on && drag.ghost}
      <div class="dnd-write-ghost" class:dnd-write-ghost-chipped={!!drag.made} style:top="{drag.y + 6}px" style:left="{drag.x + 6}px">{@html drag.ghost}</div>
    {/if}
  </div>
{/if}

<style>
  .dnd-write {
    position: relative;
    isolation: isolate;
    width: 100%;
    min-width: 0;
    container-type: inline-size;
  }

  .dnd-write-surface {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    min-height: calc(var(--space-8) * 3.5);
    padding-block: var(--space-3);
    padding-inline-start: var(--space-6);
    outline: none;
    color: var(--ink);
    font-size: var(--text-sm);
    line-height: 1.6;
    overflow-wrap: anywhere;
  }

  .dnd-write-dragging {
    cursor: grabbing;
    user-select: none;
  }

  .dnd-write-dragging .dnd-write-surface > * {
    pointer-events: none;
  }

  .dnd-write-block {
    position: relative;
    min-width: 0;
    border-radius: var(--radius-sm);
    transition: background 0.12s ease;
  }

  .dnd-write-block-picked {
    background: color-mix(in srgb, var(--metal) 18%, transparent);
  }

  .dnd-write-block-active {
    background: color-mix(in srgb, var(--metal) 10%, transparent);
  }

  .dnd-write-block-before::before,
  .dnd-write-block-after::after {
    content: '';
    position: absolute;
    inset-inline: 0;
    height: var(--border-width);
    background: var(--metal);
    box-shadow: 0 0 6px var(--ember-glow);
    pointer-events: none;
    z-index: 1;
  }

  .dnd-write-block-before::before {
    top: calc(-1 * var(--space-0) - var(--border-hair));
  }

  .dnd-write-block-after::after {
    bottom: calc(-1 * var(--space-0) - var(--border-hair));
  }

  .dnd-write-host {
    position: relative;
    display: block;
    min-width: 0;
    min-height: 1.6em;
    margin: 0;
    padding: var(--space-0) var(--space-2);
    outline: none;
    color: var(--ink);
    font-family: var(--font-body);
    font-size: inherit;
    font-weight: 400;
    line-height: inherit;
    text-shadow: none;
    white-space: pre-wrap;
  }

  .dnd-write-host:focus {
    outline: none;
    box-shadow: none;
  }

  .dnd-write-host-narrow {
    max-width: 65ch;
  }

  .dnd-write-host-balance {
    text-wrap: balance;
  }

  .dnd-write-host-nowrap {
    white-space: pre;
    overflow-x: auto;
  }

  .dnd-write-host[data-placeholder]:focus::before,
  .dnd-write-surface-empty > .dnd-write-block-paragraph > .dnd-write-host[data-placeholder]::before,
  .dnd-write-card > .dnd-write-host[data-placeholder]::before,
  .dnd-write-host-summary[data-placeholder]::before {
    content: attr(data-placeholder);
    float: left;
    height: 0;
    color: var(--ink-faint);
    font-style: italic;
    pointer-events: none;
  }

  .dnd-write-host-heading[data-number]:not([data-placeholder])::before {
    content: attr(data-number) ' ';
    color: var(--metal);
    font-family: var(--font-figures);
    font-size: 0.7em;
  }

  .dnd-write-host-heading {
    margin-block-start: var(--space-3);
    font-family: var(--font-display);
    font-size: var(--text-md);
    font-weight: 600;
    color: var(--metal-bright);
    text-shadow: 0 1px 0 var(--keyline), 0 0 10px color-mix(in srgb, var(--ember-glow) 50%, transparent);
  }

  .dnd-write-host-h1 {
    margin-block-start: var(--space-4);
    font-size: var(--text-2xl);
  }

  .dnd-write-host-h2 {
    font-size: var(--text-xl);
  }

  .dnd-write-host-h3 {
    font-size: var(--text-lg);
  }

  .dnd-write-host-raw {
    padding: var(--space-3);
    font-family: var(--font-mono);
    font-size: var(--text-xs);
  }

  .dnd-write-host-embed,
  .dnd-write-host-map {
    font-family: var(--font-mono);
    font-size: var(--text-xs);
  }

  .dnd-write-host-image {
    font-size: var(--text-xs);
    font-style: italic;
    text-align: center;
    color: var(--ink-faint);
  }

  .dnd-write-host-bookmark,
  .dnd-write-host-summary {
    font-weight: 600;
    color: var(--metal-bright);
  }

  .dnd-write-host-summary {
    flex: 1 1 0;
    min-height: 1.6em;
    padding-inline: 0;
  }

  .dnd-write-host :global(strong) {
    font-weight: 700;
    color: var(--metal-bright);
  }

  .dnd-write-host :global(code) {
    padding: 0 var(--space-1);
    border-radius: var(--radius-sm);
    background: var(--ground-deep);
    box-shadow: 0 0 0 1px var(--keyline);
    font-family: var(--font-mono);
    font-size: 0.9em;
  }

  .dnd-write-host :global(a) {
    color: var(--metal);
    text-decoration: underline;
    text-decoration-color: var(--metal-dim);
  }

  .dnd-write-host :global(.dnd-write-pill) {
    display: inline;
    padding: 0 var(--space-1);
    border-radius: var(--radius-sm);
    background: color-mix(in srgb, var(--metal) 14%, transparent);
    font-weight: 500;
    white-space: nowrap;
    cursor: pointer;
  }

  .dnd-write-host :global(.dnd-write-pill-who) {
    color: var(--ember);
  }

  .dnd-write-host :global(.dnd-write-pill-tag) {
    color: var(--verdigris);
  }

  .dnd-write-list {
    margin: var(--space-0) 0 var(--space-0) var(--space-2);
    padding-inline-start: var(--space-5);
  }

  .dnd-write-list-bullet {
    list-style: disc outside;
  }

  .dnd-write-list-bullet .dnd-write-list-bullet {
    list-style-type: circle;
  }

  .dnd-write-list-bullet .dnd-write-list-bullet .dnd-write-list-bullet {
    list-style-type: square;
  }

  .dnd-write-list-number {
    list-style: decimal outside;
  }

  .dnd-write-list-number .dnd-write-list-number {
    list-style-type: lower-alpha;
  }

  .dnd-write-list-number .dnd-write-list-number .dnd-write-list-number {
    list-style-type: lower-roman;
  }

  .dnd-write-list-todo {
    list-style: none;
  }

  .dnd-write-item {
    margin: 0;
    color: var(--metal);
  }

  .dnd-write-item::marker {
    color: var(--metal);
  }

  .dnd-write-item-body {
    display: flex;
    flex-direction: column;
    gap: var(--space-0);
    color: var(--ink);
  }

  .dnd-write-item-todo {
    position: relative;
  }

  .dnd-write-item-done > .dnd-write-item-body > .dnd-write-block-paragraph > .dnd-write-host {
    color: var(--ink-faint);
    text-decoration: line-through;
  }

  .dnd-write-item .dnd-write-host {
    padding-block: 0;
  }

  .dnd-write-tick {
    position: absolute;
    inset-inline-start: calc(-1 * var(--space-5));
    top: 0;
    display: flex;
    align-items: center;
    height: 1.6em;
    padding: 0;
    border: none;
    background: none;
    cursor: pointer;
  }

  .dnd-write-tick::before {
    content: '';
    display: block;
    width: var(--space-4);
    height: var(--space-4);
    border: var(--border-hair) solid var(--metal-dim);
    border-radius: var(--radius-sm);
    background: var(--ground-deep);
    transition: background 0.15s ease, border-color 0.15s ease;
  }

  .dnd-write-tick:hover::before {
    border-color: var(--metal);
  }

  .dnd-write-tick-done::before {
    border-color: var(--metal);
    background: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath d='M5 12.5 10 17.5 19 6.5' fill='none' stroke='%230b0703' stroke-width='3' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E") center / 80% no-repeat, var(--metal);
  }

  .dnd-write-quote {
    display: flex;
    flex-direction: column;
    gap: var(--space-0);
    margin: var(--space-1) 0;
    padding: var(--space-1) var(--space-3);
    border-radius: var(--radius-sm);
    background: color-mix(in srgb, var(--metal) 10%, transparent);
    color: var(--ink-dim);
  }

  .dnd-write-quote .dnd-write-host {
    color: inherit;
  }

  .dnd-write-callout {
    display: flex;
    align-items: flex-start;
    gap: var(--space-2);
    margin: var(--space-1) 0;
    padding: var(--space-2) var(--space-3);
    border-radius: var(--radius-sm);
    background: color-mix(in srgb, var(--ember) 10%, transparent);
  }

  .dnd-write-callout-sign {
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

  .dnd-write-callout-body {
    flex: 1 1 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-0);
    min-width: 0;
  }

  .dnd-write-toggle {
    display: flex;
    flex-direction: column;
    gap: var(--space-0);
    margin: var(--space-0) 0;
    padding: var(--space-1) var(--space-2);
    border-radius: var(--radius-sm);
    background: color-mix(in srgb, var(--ground-lift) 45%, transparent);
  }

  .dnd-write-toggle-head {
    display: flex;
    align-items: center;
    gap: var(--space-1);
  }

  .dnd-write-fold {
    flex: none;
    display: flex;
    align-items: center;
    justify-content: center;
    width: var(--space-5);
    height: var(--space-5);
    padding: 0;
    border: none;
    border-radius: var(--radius-sm);
    background: none;
    font-size: var(--text-xs);
    color: var(--ink-dim);
    cursor: pointer;
    transition: transform 0.2s ease, background 0.15s ease;
  }

  .dnd-write-fold:hover {
    background: color-mix(in srgb, var(--metal) 14%, transparent);
  }

  .dnd-write-fold::before {
    content: '▶';
  }

  .dnd-write-toggle-open .dnd-write-fold {
    transform: rotate(90deg);
  }

  .dnd-write-toggle-body {
    display: flex;
    flex-direction: column;
    gap: var(--space-0);
    padding: var(--space-0) 0 var(--space-0) calc(var(--space-5) + var(--space-1));
  }

  .dnd-write-columns {
    display: flex;
    gap: var(--space-4);
    margin: var(--space-1) 0;
  }

  .dnd-write-column {
    flex: 1 1 0;
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    min-width: 0;
    min-height: calc(var(--space-6) + var(--space-2));
    outline: var(--border-hair) dashed var(--metal-dim);
    outline-offset: 3px;
  }

  .dnd-write-column:hover {
    outline-color: var(--metal);
  }

  .dnd-write-rule {
    width: 100%;
    height: 0;
    margin-block: var(--space-4);
    margin-inline: 0;
    border: none;
    border-top: var(--border-hair) solid var(--metal-dim);
  }

  .dnd-write-card {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-start;
    gap: var(--space-2);
    margin: var(--space-1) 0;
    padding: var(--space-2) var(--space-3);
    border: var(--border-hair) solid var(--metal-dim);
    border-radius: var(--radius-sm);
    background: var(--ground-raised);
  }

  .dnd-write-card > .dnd-write-host {
    flex: 1 1 0;
  }

  .dnd-write-card-sign {
    flex: none;
    display: flex;
    align-items: center;
    justify-content: center;
    width: var(--space-4);
    line-height: 1.6;
    font-family: var(--font-display);
    font-weight: 700;
    color: var(--metal);
  }

  .dnd-write-block-raw {
    gap: 0;
    padding: 0;
    overflow: hidden;
    border: var(--border-width) solid var(--metal-dim);
    border-radius: var(--radius-md);
    background: var(--ground-deep);
  }

  .dnd-write-block-raw > .dnd-write-host {
    flex: 1 0 100%;
  }

  .dnd-write-block-image,
  .dnd-write-block-video {
    flex-direction: column;
    align-items: stretch;
    gap: var(--space-1);
    padding: 0;
    border: none;
    background: none;
  }

  .dnd-write-band {
    position: absolute;
    top: var(--space-1);
    inset-inline-end: var(--space-1);
    z-index: 1;
    padding: var(--space-0) var(--space-2);
    border-radius: var(--radius-sm);
    background: color-mix(in srgb, var(--metal) 14%, transparent);
    color: var(--metal);
    text-transform: capitalize;
    user-select: none;
  }

  .dnd-write-figure {
    flex: 1 0 100%;
    overflow: hidden;
    border-radius: var(--radius-sm);
  }

  .dnd-write-figure :global(img),
  .dnd-write-figure video {
    display: block;
    width: 100%;
    border-radius: var(--radius-sm);
  }

  .dnd-write-figure-hero {
    aspect-ratio: 1.91;
    background: var(--ground-deep);
  }

  .dnd-write-figure-hero :global(img) {
    height: 100%;
    object-fit: cover;
  }

  .dnd-write-where {
    flex: 1 0 100%;
    font-family: var(--font-mono);
    font-size: var(--text-xs);
    color: var(--ink-faint);
    overflow-wrap: anywhere;
  }

  .dnd-write-note {
    font-family: var(--font-body);
    font-size: var(--text-xs);
    color: var(--ink-dim);
  }

  .dnd-write-block-file {
    margin: var(--space-0) 0;
  }

  .dnd-write-file {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    width: 100%;
    min-width: 0;
    padding: var(--space-2) var(--space-3);
    border: var(--border-hair) solid var(--metal-dim);
    border-radius: var(--radius-sm);
    background: var(--ground-raised);
    color: var(--metal);
    font: inherit;
    text-align: start;
    cursor: pointer;
    transition: background 0.15s ease, border-color 0.15s ease;
  }

  .dnd-write-file:hover {
    border-color: var(--metal);
    background: var(--ground-lift);
  }

  .dnd-write-file:focus-visible {
    outline: none;
    box-shadow: var(--focus-ring);
  }

  .dnd-write-file-name {
    flex: 1 1 0;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--ink);
  }

  .dnd-write-block-page {
    margin: var(--space-0) 0;
  }

  .dnd-write-page-row {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    width: 100%;
    padding: var(--space-1) var(--space-2);
    border: var(--border-hair) solid transparent;
    border-radius: var(--radius-sm);
    transition: background 0.15s ease, border-color 0.15s ease;
  }

  .dnd-write-page-row:hover {
    border-color: var(--metal-dim);
    background: var(--ground-raised);
  }

  .dnd-write-page-sign {
    flex: none;
    display: flex;
    color: var(--metal);
  }

  .dnd-write-page-link {
    flex: 1 1 0;
    display: flex;
    align-items: center;
    gap: var(--space-2);
    min-width: 0;
    padding: 0;
    border: none;
    background: none;
    color: var(--ink-dim);
    font: inherit;
    text-align: start;
    cursor: pointer;
  }

  .dnd-write-page-link:hover {
    color: var(--metal-bright);
  }

  .dnd-write-page-name {
    flex: 1 1 0;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-weight: 500;
    color: var(--ink);
    text-decoration: underline;
    text-decoration-color: var(--metal-dim);
    text-underline-offset: 0.2em;
  }

  .dnd-write-page-input {
    flex: 1 1 0;
    min-width: 0;
    padding: 0;
    border: none;
    background: none;
    outline: none;
    color: var(--ink);
    font: inherit;
    font-weight: 500;
  }

  .dnd-write-page-input::placeholder {
    color: var(--ink-faint);
    font-style: italic;
  }

  .dnd-write-pop-page {
    top: 100%;
    inset-inline-start: var(--space-6);
  }

  .dnd-write-toc {
    flex: 1 1 0;
    display: grid;
    gap: var(--space-0);
    margin: var(--space-1) 0;
    padding: var(--space-2) var(--space-3);
    border: var(--border-hair) solid var(--metal-dim);
    border-radius: var(--radius-sm);
    background: var(--ground-raised);
    color: var(--metal);
  }

  .dnd-write-toc-bare {
    padding: 0;
    border: none;
    background: none;
  }

  .dnd-write-toc-name {
    text-shadow: 0 1px 0 var(--keyline);
  }

  .dnd-write-toc-line {
    display: flex;
    align-items: baseline;
    gap: var(--space-2);
    width: 100%;
    padding: var(--space-0) var(--space-1);
    border: none;
    border-radius: var(--radius-sm);
    background: none;
    font: inherit;
    text-align: start;
    color: var(--ink);
    cursor: pointer;
  }

  .dnd-write-toc-line:hover {
    background: color-mix(in srgb, var(--metal) 14%, transparent);
    color: var(--metal-bright);
  }

  .dnd-write-toc-empty {
    color: var(--ink-faint);
    font-style: italic;
    cursor: default;
  }

  .dnd-write-toc-number {
    flex: none;
    font-family: var(--font-figures);
    font-size: var(--text-xs);
    color: var(--metal);
  }

  .dnd-write-toc-text {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .dnd-write-toc-line-2 {
    padding-inline-start: var(--space-4);
  }

  .dnd-write-toc-line-3 {
    padding-inline-start: var(--space-6);
  }

  .dnd-write-toc-line-4 {
    padding-inline-start: var(--space-7);
  }

  .dnd-write-toc-marker {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    margin: var(--space-1) 0;
    padding: var(--space-0) var(--space-3);
    border: var(--border-hair) dashed var(--metal-dim);
    border-radius: var(--radius-pill);
    color: var(--ink-faint);
  }

  .dnd-write-legended-left .dnd-write-surface,
  .dnd-write-legended-right .dnd-write-surface,
  .dnd-write-legend {
    --dnd-legend: clamp(calc(var(--space-8) * 2.5), 22cqi, calc(var(--space-8) * 4));
  }

  .dnd-write-legended-left .dnd-write-surface {
    padding-inline-start: calc(var(--dnd-legend) + var(--space-6));
  }

  .dnd-write-legended-right .dnd-write-surface {
    padding-inline-end: calc(var(--dnd-legend) + var(--space-4));
  }

  .dnd-write-legend {
    position: absolute;
    inset-block: 0;
    z-index: 1;
    width: var(--dnd-legend);
    pointer-events: none;
  }

  .dnd-write-legend-left {
    inset-inline-start: 0;
  }

  .dnd-write-legend-right {
    inset-inline-end: 0;
  }

  .dnd-write-legend-list {
    position: sticky;
    top: var(--space-4);
    max-height: calc(100dvh - var(--space-4) * 2);
    overflow-y: auto;
    pointer-events: auto;
  }

  .dnd-write-legend-link {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  .dnd-write-legend-mark {
    display: none;
    flex: none;
    height: var(--border-width);
    width: var(--space-5);
    border-radius: var(--radius-pill);
    background: var(--metal-dim);
  }

  .dnd-write-legend-mark-2 {
    width: var(--space-4);
  }

  .dnd-write-legend-mark-3 {
    width: var(--space-3);
  }

  .dnd-write-legend-mark-4 {
    width: var(--space-2);
  }

  @container (max-width: 52rem) {
    .dnd-write-legended-left .dnd-write-surface,
    .dnd-write-legended-right .dnd-write-surface,
    .dnd-write-legend {
      --dnd-legend: var(--space-7);
    }

    .dnd-write-legend-link {
      padding-inline-start: 0;
    }

    .dnd-write-legend-mark {
      display: block;
    }

    .dnd-write-legend-text {
      display: none;
    }

    .dnd-write-legend:hover,
    .dnd-write-legend:focus-within {
      width: clamp(calc(var(--space-8) * 2.5), 40%, calc(var(--space-8) * 4));
    }

    .dnd-write-legend:hover .dnd-write-legend-mark,
    .dnd-write-legend:focus-within .dnd-write-legend-mark {
      display: none;
    }

    .dnd-write-legend:hover .dnd-write-legend-text,
    .dnd-write-legend:focus-within .dnd-write-legend-text {
      display: inline;
    }
  }

  .dnd-write-handle {
    position: absolute;
    z-index: 20;
    display: flex;
    align-items: center;
    transform: translate(-100%, -50%);
    margin-inline-start: calc(-1 * var(--space-1));
    user-select: none;
  }

  .dnd-write-handle :global(.dnd-iconbtn) {
    cursor: grab;
    touch-action: none;
  }

  .dnd-write-handle :global(.dnd-iconbtn:active) {
    cursor: grabbing;
  }

  .dnd-write-menu {
    position: absolute;
    z-index: 30;
    width: calc(var(--space-8) * 4);
    overflow: hidden;
    border-radius: var(--radius-sm);
    background: var(--texture-noise), linear-gradient(180deg, var(--ground-raised) 0%, var(--ground-deep) 100%);
    box-shadow: var(--rim-thin), inset 0 0 16px 2px var(--shade-hard), var(--shadow-lg);
    outline: none;
  }

  .dnd-write-menu-track {
    display: flex;
    align-items: flex-start;
    width: 200%;
    transition: transform 0.25s ease;
  }

  .dnd-write-menu-sub {
    transform: translateX(-50%);
  }

  .dnd-write-menu-panel {
    flex: 0 0 50%;
    width: 50%;
    max-height: calc(var(--space-8) * 5);
    overflow-y: auto;
    padding: var(--space-2);
    scrollbar-width: thin;
  }

  .dnd-write-menu-track:not(.dnd-write-menu-sub) > .dnd-write-menu-panel:last-child,
  .dnd-write-menu-sub > .dnd-write-menu-panel:first-child {
    max-height: 0;
    overflow: hidden;
  }

  .dnd-write-menu-head {
    margin-bottom: var(--space-1);
    padding: var(--space-1) var(--space-2) var(--space-2);
    border-bottom: var(--border-hair) solid var(--metal-dim);
    color: var(--metal-bright);
    text-shadow: 0 1px 0 var(--keyline);
  }

  .dnd-write-menu-split {
    height: var(--border-hair);
    margin: var(--space-1) 0;
    background: linear-gradient(90deg, transparent, var(--metal-dim) 20%, var(--metal-dim) 80%, transparent);
  }

  .dnd-write-menu-row {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    width: 100%;
    padding: var(--space-1) var(--space-2);
    border: none;
    border-radius: var(--radius-sm);
    background: none;
    color: var(--ink);
    font-family: var(--font-body);
    font-size: var(--text-sm);
    text-align: start;
    cursor: pointer;
  }

  .dnd-write-menu-row-lit,
  .dnd-write-menu-row:hover {
    background: linear-gradient(90deg, color-mix(in srgb, var(--ember) 14%, transparent) 0%, transparent 90%);
    color: var(--metal-bright);
  }

  .dnd-write-menu-row-on {
    color: var(--metal-bright);
  }

  .dnd-write-menu-row-bane {
    color: var(--state-bad);
  }

  .dnd-write-menu-row:focus-visible {
    outline: none;
    box-shadow: var(--focus-ring);
  }

  .dnd-write-menu-glyph {
    flex: none;
    display: flex;
    align-items: center;
    justify-content: center;
    width: var(--space-5);
    color: var(--metal);
  }

  .dnd-write-menu-text {
    flex: 1 1 0;
    display: grid;
    min-width: 0;
  }

  .dnd-write-menu-title {
    flex: 1 1 0;
  }

  .dnd-write-menu-note {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: var(--text-xs);
    color: var(--ink-faint);
  }

  .dnd-write-menu-trail {
    flex: none;
    margin-inline-start: auto;
    font-size: var(--text-xs);
    color: var(--ink-dim);
    white-space: nowrap;
  }

  .dnd-write-menu-back {
    border-bottom: var(--border-hair) solid var(--metal-dim);
    border-radius: 0;
    color: var(--metal-bright);
  }

  .dnd-write-menu-form {
    display: grid;
    gap: var(--space-1);
    padding: var(--space-2) var(--space-2) 0;
  }

  .dnd-write-menu-input {
    width: 100%;
  }

  .dnd-write-menu-apply {
    color: var(--metal-bright);
  }

  .dnd-write-pop {
    position: absolute;
    z-index: 30;
    display: flex;
    flex-direction: column;
    gap: var(--space-0);
    min-width: calc(var(--space-8) * 4);
    max-height: calc(var(--space-8) * 5);
    overflow-y: auto;
    padding: var(--space-2);
    border-radius: var(--radius-sm);
    background: var(--texture-noise), linear-gradient(180deg, var(--ground-raised) 0%, var(--ground-deep) 100%);
    box-shadow: var(--rim-thin), inset 0 0 16px 2px var(--shade-hard), var(--shadow-lg);
  }

  .dnd-write-pop-name {
    margin: var(--space-1) 0 0;
    color: var(--metal);
    text-shadow: 0 1px 0 var(--keyline);
  }

  .dnd-write-pick {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-1) var(--space-2);
    border: none;
    border-radius: var(--radius-sm);
    background: none;
    color: var(--ink);
    font-family: var(--font-body);
    font-size: var(--text-sm);
    text-align: start;
    cursor: pointer;
  }

  .dnd-write-pick:hover {
    background: linear-gradient(90deg, color-mix(in srgb, var(--ember) 12%, transparent) 0%, transparent 90%);
    color: var(--metal-bright);
  }

  .dnd-write-pick-lit {
    background:
      linear-gradient(90deg, color-mix(in srgb, var(--ember) 20%, transparent) 0%, color-mix(in srgb, var(--ember) 6%, transparent) 100%),
      var(--ground-deep);
    box-shadow: inset 0 0 0 1px var(--metal), inset 0 0 10px var(--ember-glow);
    color: var(--metal-bright);
    text-shadow: 0 1px 0 var(--keyline), 0 0 6px var(--ember-glow);
  }

  .dnd-write-pick:focus-visible {
    outline: none;
    box-shadow: var(--focus-ring);
  }

  .dnd-write-pick-sign {
    flex: none;
    display: flex;
    align-items: center;
    justify-content: center;
    width: var(--space-5);
    font-family: var(--font-mono);
    font-size: var(--text-xs);
    color: var(--metal);
  }

  .dnd-write-pick-icon {
    flex: none;
    width: var(--space-5);
    height: var(--space-5);
    overflow: hidden;
    border-radius: var(--radius-pill);
  }

  .dnd-write-pick-icon :global(img) {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .dnd-write-pick-text {
    display: grid;
    min-width: 0;
  }

  .dnd-write-pick-note {
    font-size: var(--text-xs);
    color: var(--ink-faint);
  }

  .dnd-write-skeleton {
    pointer-events: none;
  }

  .dnd-write-skeleton-mark,
  .dnd-write-skeleton-line {
    background: var(--ground-lift);
    animation: dnd-pulse 1.4s ease-in-out infinite;
  }

  .dnd-write-skeleton-line {
    flex: 0 1 60%;
    height: var(--space-3);
    border-radius: var(--radius-sm);
  }

  .dnd-write-skeleton:nth-child(odd) .dnd-write-skeleton-line {
    flex-basis: 40%;
  }

  .dnd-write-empty {
    flex: 1 0 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-5) var(--space-4);
    border: var(--border-hair) dashed var(--metal-dim);
    border-radius: var(--radius-md);
    background: var(--ground-raised);
    color: var(--ink);
    font: inherit;
    text-align: center;
    transition: border-color 0.15s ease, background 0.15s ease;
  }

  .dnd-write-empty-row {
    flex-direction: row;
    padding: var(--space-2) var(--space-3);
    text-align: start;
  }

  button.dnd-write-empty:not(:disabled) {
    cursor: pointer;
  }

  button.dnd-write-empty:not(:disabled):hover {
    border-color: var(--metal);
    background: var(--ground-lift);
  }

  button.dnd-write-empty:focus-visible {
    outline: none;
    box-shadow: var(--focus-ring);
  }

  .dnd-write-empty-art {
    display: flex;
    color: var(--metal);
  }

  .dnd-write-empty-text {
    display: grid;
    gap: var(--space-0);
    min-width: 0;
  }

  .dnd-write-empty-title {
    font-weight: 600;
    color: var(--ink);
  }

  .dnd-write-empty-hint {
    font-size: var(--text-xs);
    color: var(--ink-faint);
  }

  .dnd-write-ghost {
    position: fixed;
    z-index: 40;
    width: max-content;
    max-width: calc(var(--space-8) * 6);
    max-height: calc(var(--space-8) * 3);
    overflow: hidden;
    padding: var(--space-1) var(--space-3);
    border-radius: var(--radius-sm);
    background: var(--ground-raised);
    box-shadow: var(--rim-thin), var(--shadow-lg);
    color: var(--ink);
    font-size: var(--text-sm);
    opacity: 0.6;
    pointer-events: none;
    transform: rotate(1.5deg) scale(1.03);
    transform-origin: top left;
    animation: dnd-write-lift 0.3s ease both;
  }

  .dnd-write-ghost :global(*) {
    margin: 0;
    pointer-events: none;
  }

  .dnd-write-ghost-chipped {
    opacity: 0.95;
  }

  .dnd-write-ghost :global(.dnd-write-ghost-chip) {
    font-family: var(--font-display);
    color: var(--metal-bright);
    white-space: nowrap;
  }

  @keyframes dnd-write-lift {
    from {
      opacity: 0.3;
      transform: rotate(0deg) scale(1);
    }
    to {
      opacity: 0.6;
      transform: rotate(1.5deg) scale(1.03);
    }
  }
</style>
