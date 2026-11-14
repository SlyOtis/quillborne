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
    { kind: 'columns', title: 'Columns', group: 'Block', mark: '▥', description: 'Side by side columns, split on a --- line', keywords: ['column', 'grid'] },
    { kind: 'toggle', title: 'Toggle', group: 'Block', icon: 'unfold', description: 'Collapsible block', keywords: ['collapse', 'accordion'] },
    { kind: 'callout', title: 'Callout', group: 'Block', mark: '!', description: 'Highlighted note', keywords: ['note', 'info', 'warning'] },
    { kind: 'meeting', title: 'Meeting notes', group: 'Block', mark: '◷', description: 'Date, attendees and notes', keywords: ['meeting', 'notes', 'session', 'minutes'] },
    { kind: 'poll', title: 'Poll', group: 'Block', mark: '?', description: 'A question the table votes on', keywords: ['vote', 'poll', 'question'] },
    { kind: 'image', title: 'Image', group: 'Media', icon: 'picture', description: 'Embed an image', keywords: ['picture', 'photo'] },
    { kind: 'video', title: 'Video', group: 'Media', mark: '▶', description: 'Embed a video', keywords: ['video', 'movie'] },
    { kind: 'audio', title: 'Recording', group: 'Media', icon: 'sound', description: 'Record from the microphone', keywords: ['record', 'audio', 'sound'] },
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
    getBlock,
    getBlockMarkdown,
    getBlocksFromMarkdown,
    getDocument,
    getDocumentHtml,
    getDocumentMarkdown,
    getHeadingNumbers,
    isListKind,
    type Block,
    type BlockAlign,
    type BlockPlacement,
    type BlockDocument,
    type BlockLeading,
    type BlockSize,
    type BlockView,
    type BlockWidth,
    type BlockWrap,
    type LinkPreview,
    type MediaAsset,
    type MediaKind,
    type Mention,
    type MentionSearch
  } from '$lib/blocks'
  import { tick } from 'svelte'
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
    requestMedia,
    uploadFile,
    openAsset,
    onasset,
    onpreview
  }: {
    /** The document being written, held as markdown. */
    value?: string
    /** Writes the blocks when set, draws them when not. */
    editable?: boolean
    /** The hint on the first empty block. */
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
  } = $props()

  type Choice<T extends string> = { id: T; title: string }
  type Setting = {
    title: string
    key: 'align' | 'size' | 'width' | 'wrap' | 'leading' | 'view' | 'level' | 'placement'
    choices: Choice<string>[]
  }

  const MARKS: Record<string, string> = { b: '**', i: '_', e: '`' }

  const ALIGNS: Choice<BlockAlign>[] = [
    { id: 'start', title: 'Left' },
    { id: 'center', title: 'Centre' },
    { id: 'end', title: 'Right' },
    { id: 'justify', title: 'Justify' }
  ]

  const SIZES: Choice<BlockSize>[] = [
    { id: 'sm', title: 'Small' },
    { id: 'md', title: 'Medium' },
    { id: 'lg', title: 'Large' },
    { id: 'xl', title: 'Extra large' }
  ]

  const WIDTHS: Choice<BlockWidth>[] = [
    { id: 'full', title: 'Full' },
    { id: 'narrow', title: 'Reading column' }
  ]

  const WRAPS: Choice<BlockWrap>[] = [
    { id: 'wrap', title: 'Wrap' },
    { id: 'balance', title: 'Balance' },
    { id: 'nowrap', title: 'No wrap' }
  ]

  const LEADINGS: Choice<BlockLeading>[] = [
    { id: 'tight', title: 'Tight' },
    { id: 'normal', title: 'Normal' },
    { id: 'relaxed', title: 'Relaxed' },
    { id: 'loose', title: 'Loose' }
  ]

  const VIEWS: Choice<BlockView>[] = [
    { id: 'full', title: 'Full' },
    { id: 'link', title: 'Link' },
    { id: 'icon', title: 'Icon and name' },
    { id: 'hidden', title: 'Hidden' }
  ]

  const LEVELS: Choice<string>[] = [1, 2, 3, 4].map((level) => ({ id: String(level), title: `Level ${level}` }))

  const PLACEMENTS: Choice<BlockPlacement>[] = [
    { id: 'inline', title: 'In the flow' },
    { id: 'left', title: 'Legend left' },
    { id: 'right', title: 'Legend right' }
  ]

  const MEDIA_NAMES: Partial<Record<BlockKind, string>> = {
    image: 'image',
    video: 'video',
    audio: 'recording',
    pdf: 'PDF',
    bookmark: 'link',
    embed: 'embed',
    map: 'map',
    file: 'file'
  }

  const MEDIA: BlockKind[] = ['image', 'audio', 'video', 'pdf', 'embed', 'map', 'bookmark', 'page']
  const BARE: BlockKind[] = ['divider', 'toc', 'file']
  const RAW: BlockKind[] = ['code', 'table', 'mermaid', 'html', 'columns']
  const UPLOADED: BlockKind[] = ['image', 'video', 'audio', 'pdf', 'file']
  const PICKED: BlockKind[] = ['image', 'video', 'pdf', 'file']

  const opened = getDocument(value).blocks
  let blocks = $state<Block[]>(opened)
  let openMenu = $state<string | null>(null)
  let slashOn = $state<{ id: string; query: string } | null>(null)
  let pickOn = $state<{ id: string; mark: '@' | '#'; query: string } | null>(null)
  let picks = $state<Mention[]>([])
  let seeking = $state(false)
  let chosen = $state(0)
  let hosts: Record<string, HTMLTextAreaElement | undefined> = {}
  let root = $state<HTMLElement>()
  let sought = 0

  const sized = typeof CSS !== 'undefined' && CSS.supports('field-sizing', 'content')

  let past: Block[][] = []
  let future: Block[][] = []
  let kept: Block[] = structuredClone(opened)
  let typed: string | null = null

  let picked = $state<string[]>([])
  let anchor: string | null = null
  let taping = $state<string | null>(null)
  let taper: MediaRecorder | null = null

  const turns = $derived(commands.filter((command) => command.kind !== 'page'))
  const numbers = $derived(headingNumbering ? getHeadingNumbers(blocks) : {})
  const headings = $derived(blocks.filter((block) => block.kind === 'heading'))

  const offered = $derived.by(() => {
    if (!slashOn) return []
    const query = slashOn.query.toLowerCase()
    return commands.filter(
      (command) =>
        (command.kind !== 'page' || onpage) &&
        (command.title.toLowerCase().includes(query) || command.keywords.some((word) => word.includes(query)))
    )
  })

  $effect(() => {
    editable
    blocks.map((block) => block.options.size)
    queueMicrotask(() => Object.values(hosts).forEach((node) => node && grow(node)))
  })

  $effect(() => {
    const on = pickOn
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

  export function getMarkdown(): string {
    return getDocumentMarkdown({ blocks: $state.snapshot(blocks) })
  }

  export function getHTML(): string {
    return getDocumentHtml({ blocks: $state.snapshot(blocks) }, headingNumbering)
  }

  export function addBlock(kind: BlockKind, options: BlockOptions = {}) {
    const made = { ...getBlock(kind), options }
    blocks = [...blocks, made]
    publish()
    seat(made.id, 0)
  }

  export function getBlocks(): Block[] {
    return $state.snapshot(blocks)
  }

  export function startExternalDrag(kind: BlockKind, options: BlockOptions = {}) {
    const made = { ...getBlock(kind), options }
    outside = made
    dragging = made.id
    openMenu = null
    document.addEventListener('pointermove', haul)
    document.addEventListener('pointerup', letGo)
    document.addEventListener('pointercancel', letGo)
  }

  function settings(block: Block): Setting[] {
    if (block.kind === 'paragraph') {
      return [
        { title: 'Align', key: 'align', choices: ALIGNS },
        { title: 'Width', key: 'width', choices: WIDTHS },
        { title: 'Wrap', key: 'wrap', choices: WRAPS },
        { title: 'Line height', key: 'leading', choices: LEADINGS },
        { title: 'Font size', key: 'size', choices: SIZES }
      ]
    }
    if (block.kind === 'heading') return [{ title: 'Level', key: 'level', choices: LEVELS }]
    if (block.kind === 'toc') return [{ title: 'Placement', key: 'placement', choices: PLACEMENTS }]
    if (block.kind === 'table') {
      return [
        { title: 'Align', key: 'align', choices: ALIGNS.slice(0, 3) },
        { title: 'Width', key: 'width', choices: WIDTHS }
      ]
    }
    if (block.kind === 'quote' || block.kind === 'callout') {
      return [
        { title: 'Align', key: 'align', choices: ALIGNS.slice(0, 3) },
        { title: 'Font size', key: 'size', choices: SIZES }
      ]
    }
    if (MEDIA.includes(block.kind)) return [{ title: 'Read view', key: 'view', choices: VIEWS }]
    return []
  }

  function chosenOf(block: Block, setting: Setting): string {
    if (setting.key === 'level') return String(block.options.level ?? 1)
    if (setting.key === 'placement') return block.options.placement ?? 'inline'
    return (block.options[setting.key] as string | undefined) ?? ''
  }

  function set(id: string, setting: Setting, choice: string) {
    if (setting.key === 'level') {
      const index = at(id)
      blocks[index] = { ...blocks[index], options: { ...blocks[index].options, level: Number(choice) } }
      publish()
      return
    }
    if (setting.key === 'placement') {
      const index = at(id)
      const { placement: _, ...rest } = blocks[index].options
      blocks[index] = { ...blocks[index], options: choice === 'inline' ? rest : { ...rest, placement: choice as BlockPlacement } }
      publish()
      return
    }
    dress(id, { [setting.key]: choice } as Partial<BlockOptions>)
  }

  function address(block: Block): string {
    if (block.kind === 'bookmark' || block.kind === 'file') return block.options.url ?? ''
    if (block.kind === 'embed' || block.kind === 'map') return block.text
    return block.options.src ?? ''
  }

  function readdress(id: string, next: string) {
    const index = at(id)
    const block = blocks[index]
    if (block.kind === 'bookmark' || block.kind === 'file') dress(id, { url: next })
    else if (block.kind === 'embed' || block.kind === 'map') {
      blocks[index] = { ...block, text: next }
      publish()
    } else dress(id, { src: next })
  }

  async function preview(id: string) {
    const url = blocks[at(id)]?.options.url
    if (!url || !onpreview) return
    const found = await onpreview(url).catch(() => null)
    const index = at(id)
    if (!found || index < 0) return
    const held = blocks[index]
    blocks[index] = {
      ...held,
      text: held.text || found.title,
      options: { ...held.options, description: found.description, image: found.image }
    }
    publish()
  }

  /** Every block between the two, in the order they are written. */
  function span(from: string, to: string): string[] {
    const one = at(from)
    const two = at(to)
    if (one < 0 || two < 0) return []
    const head = Math.min(one, two)
    const tail = Math.max(one, two)
    return blocks.slice(head, tail + 1).map((block) => block.id)
  }

  function reach(id: string) {
    anchor = id
    if (picked.length > 0) picked = []
    document.addEventListener('pointermove', widen)
    document.addEventListener('pointerup', settle, { once: true })
  }

  /**
   * A native range stops at the host it started in, so crossing a block boundary
   * hands the selection to the editor and it paints the blocks the drag covers.
   */
  function widen(event: PointerEvent) {
    if (!anchor || event.buttons === 0) return

    const under = document.elementFromPoint(event.clientX, event.clientY)
    const row = under?.closest('[data-block]') as HTMLElement | null
    const id = row?.dataset.block

    if (!id) return
    picked = id === anchor ? [] : span(anchor, id)
  }

  function settle() {
    anchor = null
    document.removeEventListener('pointermove', widen)
  }

  function clip(): string {
    return picked
      .map((id) => blocks[at(id)])
      .filter(Boolean)
      .map((block) => getBlockMarkdown(block))
      .join('\n\n')
  }

  /**
   * A block takes the page's look until it is given one of its own, which is
   * what own marks. Handing it back lets the page decide again.
   */
  function dress(id: string, held: Partial<Block['options']>) {
    const index = at(id)
    const block = blocks[index]
    const options = { ...block.options, ...held, own: true }
    blocks[index] = { ...block, options }
    publish()
  }

  function undress(id: string) {
    const index = at(id)
    const { align, size, width, wrap, leading, own, ...rest } = blocks[index].options
    blocks[index] = { ...blocks[index], options: rest }
    openMenu = null
    publish()
  }

  /** Records from the microphone and hands the file to the store the app already keeps. */
  async function record(id: string) {
    if (taping === id) {
      taper?.stop()
      return
    }

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    const held: Blob[] = []
    const tape = new MediaRecorder(stream)

    tape.ondataavailable = (event) => held.push(event.data)
    tape.onstop = async () => {
      stream.getTracks().forEach((track) => track.stop())
      taping = null
      taper = null

      const sound = new File(held, `recording-${Date.now()}.webm`, { type: 'audio/webm' })
      const asset = uploadFile ? await uploadFile(sound, 'audio').catch(() => null) : null
      if (!asset) return

      const index = at(id)
      blocks[index] = { ...blocks[index], options: { ...blocks[index].options, src: asset.url } }
      publish()
    }

    taper = tape
    taping = id
    tape.start()
  }

  function getSource(kind: BlockKind, asset: MediaAsset): BlockOptions {
    return kind === 'file' ? { assetId: asset.id, name: asset.name, url: asset.url, mimeType: asset.mimeType } : { src: asset.url }
  }

  async function pick(id: string, kind: BlockKind) {
    const block = blocks[at(id)]
    if (!block || !requestMedia) return

    const asset = await requestMedia(kind as MediaKind, address(block) || undefined)
    const index = at(id)
    if (!asset || index < 0) return

    blocks[index] = { ...blocks[index], options: { ...blocks[index].options, ...getSource(kind, asset) } }
    publish()
  }

  function reveal(block: Block) {
    if (block.options.assetId) openAsset?.(block.options.assetId)
    else if (block.options.url) window.open(block.options.url, '_blank', 'noopener')
  }

  function check(id: string) {
    const index = at(id)
    const block = blocks[index]
    blocks[index] = { ...block, options: { ...block.options, done: !block.options.done } }
    publish()
  }

  function cull() {
    const rest = blocks.filter((block) => !picked.includes(block.id))
    blocks = rest.length > 0 ? rest : [getBlock()]
    picked = []
    publish()
  }

  let dragging = $state<string | null>(null)
  let over = $state<{ id: string; after: boolean } | null>(null)
  let outside: Block | null = null

  function grab(id: string, event: PointerEvent) {
    event.preventDefault()
    dragging = id
    openMenu = null
    document.addEventListener('pointermove', haul)
    document.addEventListener('pointerup', letGo)
    document.addEventListener('pointercancel', letGo)
  }

  function haul(event: PointerEvent) {
    if (!dragging) return

    const rows = [...(root?.querySelectorAll<HTMLElement>('[data-block]') ?? [])]
    const y = event.clientY
    let found: { id: string; after: boolean } | null = null

    for (const row of rows) {
      const box = row.getBoundingClientRect()
      if (y > box.bottom) continue
      found = { id: row.dataset.block ?? '', after: y >= (box.top + box.bottom) / 2 }
      break
    }

    const last = rows[rows.length - 1]
    over = found ?? (last ? { id: last.dataset.block ?? '', after: true } : null)
  }

  function letGo() {
    document.removeEventListener('pointermove', haul)
    document.removeEventListener('pointerup', letGo)
    document.removeEventListener('pointercancel', letGo)

    const held = dragging
    const made = outside
    dragging = null
    outside = null

    if (made) {
      if (over) {
        const to = at(over.id)
        blocks.splice(to + (over.after ? 1 : 0), 0, made)
      } else {
        blocks.push(made)
      }
      publish()
      seat(made.id, 0)
    } else if (held && over && over.id !== held) {
      land(held, over)
    }

    over = null
  }

  function paste(id: string, event: ClipboardEvent) {
    const written = event.clipboardData?.getData('text/plain') ?? ''
    if (!written.trim()) return

    const grown = getBlocksFromMarkdown(written)
    if (grown.length < 2 && !/^\s*(#{1,6} |[-*] |\d+\. |> |```)/m.test(written)) return

    event.preventDefault()
    const index = at(id)
    if (index < 0) return

    const host = hosts[id]
    const held = blocks[index]
    const head = held.text.slice(0, host?.selectionStart ?? held.text.length)
    const tail = held.text.slice(host?.selectionEnd ?? held.text.length)

    const rest = [...blocks]
    const [first, ...following] = grown
    let end = held

    if (held.kind === 'paragraph' && held.text === '') {
      rest.splice(index, 1, ...grown)
      end = grown[grown.length - 1]
    } else {
      rest[index] = head
        ? { ...held, text: head + first.text }
        : { ...held, text: first.text, kind: first.kind, options: first.options }
      rest.splice(index + 1, 0, ...following)
      if (tail) rest.splice(index + 1 + following.length, 0, getBlock('paragraph', tail))
      end = following[following.length - 1] ?? rest[index]
    }

    blocks = rest
    publish()
    seat(end.id, end.text.length)
  }

  function copy(id: string, event: ClipboardEvent) {
    if (picked.length > 0) {
      event.clipboardData?.setData('text/plain', clip())
      event.preventDefault()
      return
    }

    const host = hosts[id]
    if (!host || host.selectionStart !== 0 || host.selectionEnd !== host.value.length) return

    const held = blocks[at(id)]
    if (!held) return

    event.clipboardData?.setData('text/plain', getBlockMarkdown(held))
    event.preventDefault()
  }

  function land(id: string, onto: { id: string; after: boolean }) {
    const held = blocks[at(id)]
    const rest = blocks.filter((one) => one.id !== id)
    const to = rest.findIndex((one) => one.id === onto.id)
    if (!held || to < 0) return

    rest.splice(to + (onto.after ? 1 : 0), 0, held)
    blocks = rest
    publish()
  }

  function publish(typing: string | null = null) {
    if (!typing || typing !== typed) {
      past.push(kept)
      if (past.length > 100) past.shift()
      future = []
    }
    typed = typing
    kept = $state.snapshot(blocks)
    value = getDocumentMarkdown({ blocks } as BlockDocument)
    onchange?.(value)
  }

  function restore(from: Block[][], to: Block[][]) {
    const next = from.pop()
    if (!next) return
    to.push(kept)
    blocks = next
    kept = $state.snapshot(blocks)
    typed = null
    value = getDocumentMarkdown({ blocks } as BlockDocument)
    onchange?.(value)
  }

  function at(id: string) {
    return blocks.findIndex((block) => block.id === id)
  }

  function near(index: number, by: number): Block | undefined {
    for (let seek = index + by; seek >= 0 && seek < blocks.length; seek += by) {
      if (hosts[blocks[seek].id]) return blocks[seek]
    }
    return undefined
  }

  function seat(id: string, offset: number) {
    queueMicrotask(() => {
      const node = hosts[id]
      if (!node) return
      node.focus()
      node.setSelectionRange(offset, offset)
    })
  }

  function pen(block: Block, text: string): Block {
    return block.kind === 'image' ? { ...block, options: { ...block.options, alt: text } } : { ...block, text }
  }

  function grow(node: HTMLTextAreaElement) {
    if (sized) return
    node.style.height = 'auto'
    node.style.height = `${node.scrollHeight}px`
  }

  function host(node: HTMLTextAreaElement, id: string) {
    hosts[id] = node
    grow(node)
    return {
      destroy() {
        delete hosts[id]
      }
    }
  }

  function hint(block: Block, index: number): string {
    switch (block.kind) {
      case 'poll':
        return 'The question, then one choice per line'
      case 'bookmark':
        return 'What the link is called'
      case 'audio':
        return 'What the recording is'
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
      case 'columns':
        return 'Column markdown, columns split on a --- line'
      case 'embed':
        return 'https:// address to frame'
      case 'map':
        return 'A map address, or a stored picture'
      case 'meeting':
        return 'Date, attendees, then notes'
      case 'page':
        return 'The page title'
      default:
        return index === 0 ? placeholder : ''
    }
  }

  function write(id: string, event: Event) {
    const node = event.currentTarget as HTMLTextAreaElement
    const index = at(id)
    const block = blocks[index]
    const before = node.value.slice(0, node.selectionStart)

    if (block.kind === 'paragraph' && (event as InputEvent).data === ' ') {
      const lead = /^(#{1,4}|[-*]|\d+\.|\[[ xX]?\]|>) $/.exec(before)
      if (lead) {
        const token = lead[1]
        const kind: BlockKind = token.startsWith('#')
          ? 'heading'
          : token === '>'
            ? 'quote'
            : token.startsWith('[')
              ? 'todo'
              : /^\d/.test(token)
                ? 'number'
                : 'bullet'
        const options = kind === 'heading' ? { level: token.length } : kind === 'todo' ? { done: /x/i.test(token) } : {}
        turn(id, kind, options, node.value.slice(before.length), 0)
        return
      }
    }

    blocks[index] = pen(block, node.value)
    grow(node)

    const sigil = RAW.includes(block.kind) ? null : /(^|\s)([@#])([\p{L}\p{N}_-]*)$/u.exec(before)
    pickOn = sigil ? { id, mark: sigil[2] as '@' | '#', query: sigil[3] } : null
    const slash = RAW.includes(block.kind) ? null : /(^|\s)\/(\S*)$/.exec(before)
    slashOn = slash ? { id, query: slash[2] } : null
    chosen = 0

    publish(id)
  }

  function mark(id: string, node: HTMLTextAreaElement, wrap: string) {
    const { selectionStart: start, selectionEnd: end, value: text } = node
    const wrapped = text.slice(start - wrap.length, start) === wrap && text.slice(end, end + wrap.length) === wrap
    const next = wrapped
      ? text.slice(0, start - wrap.length) + text.slice(start, end) + text.slice(end + wrap.length)
      : text.slice(0, start) + wrap + text.slice(start, end) + wrap + text.slice(end)
    const by = wrapped ? -wrap.length : wrap.length

    node.value = next
    node.setSelectionRange(start + by, end + by)
    const index = at(id)
    blocks[index] = pen(blocks[index], next)
    publish()
  }

  /** A list item steps under the one before it, and never deeper than one below it. */
  function nest(id: string, by: number) {
    const index = at(id)
    const block = blocks[index]
    const held = block.options.depth ?? 0
    const before = blocks[index - 1]
    const ceiling = before && isListKind(before.kind) ? (before.options.depth ?? 0) + 1 : 0
    const depth = Math.max(0, Math.min(held + by, ceiling))
    if (depth === held) return

    const { depth: _, ...rest } = block.options
    blocks[index] = { ...block, options: depth > 0 ? { ...rest, depth } : rest }
    publish()
  }

  function step(id: string, event: KeyboardEvent) {
    const node = event.currentTarget as HTMLTextAreaElement
    const index = at(id)
    const block = blocks[index]
    const mod = event.metaKey || event.ctrlKey
    const key = event.key.toLowerCase()

    if (event.key === 'Escape') {
      slashOn = null
      pickOn = null
      picked = []
      return
    }

    const open: (Command | Mention)[] = slashOn?.id === id ? offered : pickOn?.id === id ? picks : []
    if (open.length > 0) {
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault()
        chosen = (chosen + (event.key === 'ArrowDown' ? 1 : -1) + open.length) % open.length
        tick().then(() => node.closest('[data-block]')?.querySelector('.dnd-write-pick-lit')?.scrollIntoView({ block: 'nearest' }))
        return
      }
      if (event.key === 'Enter') {
        event.preventDefault()
        const pick = open[chosen % open.length]
        if ('label' in pick) take(pick)
        else choose(id, pick)
        return
      }
    }

    if (event.key === 'Tab' && isListKind(block.kind)) {
      event.preventDefault()
      const caret = node.selectionStart
      nest(id, event.shiftKey ? -1 : 1)
      seat(id, caret)
      return
    }

    if (key === 'a' && mod) {
      const whole = node.selectionStart === 0 && node.selectionEnd === node.value.length
      if (picked.length === blocks.length) return

      event.preventDefault()
      picked = whole || picked.length > 0 ? blocks.map((block) => block.id) : []
      if (picked.length === 0) node.setSelectionRange(0, node.value.length)
      return
    }

    if (mod && key === 'z') {
      event.preventDefault()
      if (event.shiftKey) restore(future, past)
      else restore(past, future)
      return
    }

    if (mod && key === 'y') {
      event.preventDefault()
      restore(future, past)
      return
    }

    if (mod && event.shiftKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
      event.preventDefault()
      const caret = node.selectionStart
      shift(id, event.key === 'ArrowUp' ? -1 : 1)
      seat(id, caret)
      return
    }

    const wrap = mod ? (event.shiftKey ? (key === 's' ? '~~' : null) : (MARKS[key] ?? null)) : null
    if (wrap) {
      event.preventDefault()
      mark(id, node, wrap)
      return
    }

    if (picked.length > 0) {
      if (event.key === 'Backspace' || event.key === 'Delete') {
        event.preventDefault()
        cull()
        return
      }

      if (event.key.startsWith('Arrow') && !event.shiftKey) {
        picked = []
      }
    }

    if (event.key === 'Enter' && !event.shiftKey && !RAW.includes(block.kind) && block.kind !== 'meeting') {
      event.preventDefault()
      const head = node.value.slice(0, node.selectionStart)
      const tail = node.value.slice(node.selectionEnd)
      const kind = isListKind(block.kind) || block.kind === 'paragraph' || block.kind === 'quote' ? block.kind : 'paragraph'
      const made = getBlock(kind, tail, isListKind(kind) && block.options.depth ? { depth: block.options.depth } : {})
      blocks[index] = pen(block, head)
      blocks.splice(index + 1, 0, made)
      publish()
      seat(made.id, 0)
      return
    }

    if (event.key === 'Backspace' && node.selectionStart === 0 && node.selectionEnd === 0) {
      if (isListKind(block.kind) && (block.options.depth ?? 0) > 0) {
        event.preventDefault()
        nest(id, -1)
        seat(id, 0)
        return
      }

      if (index === 0) return
      event.preventDefault()
      const before = blocks[index - 1]

      if (BARE.includes(before.kind) || before.kind === 'image') {
        blocks.splice(index - 1, 1)
        publish()
        seat(id, 0)
        return
      }

      const joint = before.text.length
      blocks[index - 1] = { ...before, text: before.text + node.value }
      blocks.splice(index, 1)
      publish()
      seat(before.id, joint)
      return
    }

    if ((event.key === 'ArrowUp' || event.key === 'ArrowDown') && !mod && !event.shiftKey && !event.altKey) {
      if (node.selectionStart !== node.selectionEnd) return
      const up = event.key === 'ArrowUp'
      const edge = up ? node.selectionStart === 0 : node.selectionEnd === node.value.length
      const line = parseFloat(getComputedStyle(node).lineHeight) || 20
      const lines = node.value.includes('\n') ? 2 : Math.round(node.clientHeight / line)
      if (!edge && lines > 1) return

      const next = near(index, up ? -1 : 1)
      if (!next) return
      event.preventDefault()
      seat(next.id, up ? (hosts[next.id]?.value.length ?? 0) : 0)
    }
  }

  function shut(event: PointerEvent) {
    const on = slashOn ?? pickOn
    if (!on) return
    const target = event.target as Element | null
    if (target?.closest('.dnd-write-menu-slash') || target === hosts[on.id]) return
    slashOn = null
    pickOn = null
  }

  function turn(id: string, kind: BlockKind, options: BlockOptions = {}, text = blocks[at(id)].text, caret = text.length) {
    const index = at(id)
    const held = kind === 'image' ? { ...options, alt: text } : options
    const body = BARE.includes(kind) || kind === 'image' ? '' : kind === 'meeting' && !text.trim() ? 'Date: \nAttendees: \nNotes: ' : text
    blocks[index] = { ...blocks[index], kind, text: body, options: held }
    slashOn = null
    openMenu = null
    publish()
    seat(id, kind === 'meeting' ? 6 : caret)
  }

  async function choose(id: string, command: Command) {
    const node = hosts[id]
    const block = blocks[at(id)]
    const held = block.kind === 'image' ? (block.options.alt ?? '') : block.text
    let text = held
    let caret = held.length

    if (slashOn?.id === id && node) {
      caret = node.selectionStart - slashOn.query.length - 1
      text = held.slice(0, caret) + held.slice(node.selectionStart)
    }

    if (command.kind === 'page') {
      page(id, text)
      return
    }

    if (!PICKED.includes(command.kind) || !requestMedia) {
      turn(id, command.kind, command.options, text)
      return
    }

    slashOn = null
    openMenu = null
    const asset = await requestMedia(command.kind as MediaKind)
    const index = at(id)
    if (index < 0) return

    if (asset) {
      turn(id, command.kind, { ...command.options, ...getSource(command.kind, asset) }, text)
    } else if (text !== held) {
      blocks[index] = pen(blocks[index], text)
      publish()
      seat(id, caret)
    }
  }

  function take(mention: Mention) {
    if (!pickOn) return
    const { id, query } = pickOn
    const index = at(id)
    const node = hosts[id]
    const block = blocks[index]
    const caret = node?.selectionStart ?? block.text.length
    const start = caret - query.length
    const word = mention.label.replace(/\s+/g, '')
    blocks[index] = { ...block, text: `${block.text.slice(0, start)}${word} ${block.text.slice(caret)}` }
    pickOn = null
    publish()
    seat(id, start + word.length + 1)
  }

  async function page(id: string, text: string) {
    const title = text.trim() || 'Untitled page'
    slashOn = null
    openMenu = null
    const made = await onpage?.(title)
    const index = at(id)
    if (index < 0) return
    blocks[index] = { ...blocks[index], kind: 'page', text: title, options: { page: made ?? '' } }
    publish()
  }

  function shift(id: string, by: number) {
    const index = at(id)
    const to = index + by
    if (to < 0 || to >= blocks.length) return
    const [moved] = blocks.splice(index, 1)
    blocks.splice(to, 0, moved)
    openMenu = null
    publish()
  }

  function drop(id: string) {
    if (blocks.length === 1) {
      blocks = [getBlock()]
    } else {
      blocks.splice(at(id), 1)
    }
    openMenu = null
    publish()
  }
</script>

{#snippet offer(command: Command, lit: boolean, on: () => void, hover: () => void)}
  <button type="button" class="dnd-write-pick" class:dnd-write-pick-lit={lit} onclick={on} onpointerenter={hover}>
    <span class="dnd-write-pick-sign" aria-hidden="true">
      {#if command.icon}<Glyph name={command.icon} size="sm" />{:else}{command.mark}{/if}
    </span>
    <span class="dnd-write-pick-text">
      <span class="dnd-write-pick-name">{command.title}</span>
      <span class="dnd-write-pick-note">{command.description}</span>
    </span>
  </button>
{/snippet}

{#snippet chips(id: string, block: Block, setting: Setting)}
  <p class="dnd-label dnd-write-menu-name">{setting.title}</p>
  <span class="dnd-write-row-of">
    {#each setting.choices as one (one.id)}
      <button
        type="button"
        class="dnd-write-chip"
        class:dnd-write-chip-on={chosenOf(block, setting) === one.id}
        aria-pressed={chosenOf(block, setting) === one.id}
        onclick={() => set(id, setting, one.id)}
      >
        {one.title}
      </button>
    {/each}
  </span>
{/snippet}

<svelte:window onpointerdown={shut} />

{#if !editable}
  <BlockReader {value} {onsearch} {onasset} {openAsset} {headingNumbering} />
{:else}
  <div class="dnd-write" bind:this={root}>
    {#each blocks as block, index (block.id)}
      {@const depth = Math.min(Math.max(block.options.depth ?? 0, 0), 5)}
      <div
        class="dnd-write-row dnd-write-row-{block.kind}"
        class:dnd-write-row-listed={isListKind(block.kind)}
        class:dnd-write-row-menu={openMenu === block.id}
        class:dnd-write-row-hauled={dragging === block.id}
        class:dnd-write-row-before={dragging !== null && dragging !== block.id && over?.id === block.id && !over.after}
        class:dnd-write-row-after={dragging !== null && dragging !== block.id && over?.id === block.id && over.after}
        class:dnd-write-row-picked={picked.includes(block.id)}
        style:--dnd-depth={depth}
        data-block={block.id}
      >
        <span class="dnd-write-gutter">
          <IconBtn
            title="Options"
            active={openMenu === block.id}
            onclick={() => (openMenu = openMenu === block.id ? null : block.id)}
          >
            <Glyph name="more" size="sm" />
          </IconBtn>
          <IconBtn title="Drag to move" onpointerdown={(event) => grab(block.id, event)}>
            <Glyph name="grip" size="sm" />
          </IconBtn>
        </span>

        {#if block.kind === 'divider'}
          <hr class="dnd-write-rule" />
        {:else if block.kind === 'toc' && block.options.placement && block.options.placement !== 'inline'}
          <span class="dnd-write-toc-marker dnd-label">Legend on the {block.options.placement} of the page</span>
        {:else if block.kind === 'toc'}
          <nav class="dnd-write-toc" aria-label="Contents">
            <span class="dnd-label">Contents</span>
            {#each headings as head (head.id)}
              <span class="dnd-write-toc-line dnd-write-toc-line-{Math.min(head.options.level ?? 1, 4)}">
                {#if headingNumbering}{numbers[head.id]} {/if}{head.text}
              </span>
            {:else}
              <span class="dnd-write-toc-line">No headings yet</span>
            {/each}
          </nav>
        {:else if block.kind === 'file'}
          {#if block.options.assetId || block.options.url}
            <button type="button" class="dnd-write-file" title="Open {block.options.name || 'the file'}" onclick={() => reveal(block)}>
              <Glyph name={getMimeGlyph(block.options.mimeType ?? '')} size="sm" />
              <span class="dnd-write-file-name">{block.options.name || 'File'}</span>
              <Glyph name="export" size="sm" />
            </button>
          {:else}
            <button
              type="button"
              class="dnd-write-empty dnd-write-empty-row"
              disabled={!requestMedia}
              onclick={() => pick(block.id, 'file')}
            >
              <span class="dnd-write-empty-art" aria-hidden="true"><Glyph name="sources" size="md" /></span>
              <span class="dnd-write-empty-text">
                <span class="dnd-write-empty-title">Attach a file</span>
                <span class="dnd-write-empty-hint">{requestMedia ? 'Press to upload or pick a file' : 'Set the file from the block menu'}</span>
              </span>
            </button>
          {/if}
        {:else}
          {#if block.kind === 'image' && block.options.src}
            <span class="dnd-write-figure">
              <StoredImage src={block.options.src} alt={block.options.alt ?? ''} />
            </span>
          {/if}

          {#if block.kind === 'video' && block.options.src}
            {#await getFileUrl(block.options.src) then url}
              {#if url}
                <span class="dnd-write-figure">
                  <!-- svelte-ignore a11y_media_has_caption -->
                  <video controls src={url}></video>
                </span>
              {/if}
            {/await}
          {/if}

          {#if UPLOADED.includes(block.kind) && !block.options.src && taping !== block.id}
            {@const name = MEDIA_NAMES[block.kind] ?? block.kind}
            <button
              type="button"
              class="dnd-write-empty dnd-write-empty-{block.kind}"
              disabled={!requestMedia}
              onclick={() => pick(block.id, block.kind)}
            >
              <span class="dnd-write-empty-art" aria-hidden="true">
                <Glyph name={block.kind === 'image' ? 'picture' : block.kind === 'video' ? 'play' : block.kind === 'audio' ? 'sound' : 'scroll'} size="lg" />
              </span>
              <span class="dnd-write-empty-text">
                <span class="dnd-write-empty-title">Add {block.kind === 'image' ? 'an' : 'a'} {name}</span>
                <span class="dnd-write-empty-hint">
                  {#if block.kind === 'audio'}
                    {requestMedia ? 'Press to upload or pick one, or record from the microphone' : 'Record from the microphone'}
                  {:else}
                    {requestMedia ? `Press to upload or pick ${block.kind === 'image' ? 'an' : 'a'} ${name}` : `Set the ${name} from the block menu`}
                  {/if}
                </span>
              </span>
            </button>
          {/if}

          {#if block.kind === 'bookmark' && !block.options.url}
            <span class="dnd-write-empty dnd-write-empty-row">
              <span class="dnd-write-empty-art" aria-hidden="true"><Glyph name="export" size="md" /></span>
              <span class="dnd-write-empty-text">
                <span class="dnd-write-empty-title">Add a link</span>
                <span class="dnd-write-empty-hint">Set the address from the block menu and the card fills from the page</span>
              </span>
            </span>
          {/if}

          {#if block.kind === 'bullet'}
            <span class="dnd-write-mark dnd-write-mark-bullet dnd-write-mark-{depth}" aria-hidden="true"></span>
          {/if}

          {#if block.kind === 'number'}
            <span class="dnd-write-mark dnd-write-mark-number dnd-write-mark-{depth}" aria-hidden="true"></span>
          {/if}

          {#if block.kind === 'heading' && headingNumbering}
            <span class="dnd-write-mark dnd-write-mark-head dnd-write-mark-head-{block.options.level ?? 1}" aria-hidden="true">{numbers[block.id]}</span>
          {/if}

          {#if block.kind === 'callout' || block.kind === 'poll' || block.kind === 'bookmark' || block.kind === 'meeting' || block.kind === 'page'}
            <span class="dnd-write-mark dnd-write-mark-slot dnd-write-mark-{block.kind}" aria-hidden="true"></span>
          {/if}

          {#if block.kind === 'toggle'}
            <span class="dnd-write-mark dnd-write-mark-toggle" class:dnd-write-mark-open={block.options.open} aria-hidden="true"></span>
          {/if}

          {#if RAW.includes(block.kind)}
            <span class="dnd-write-band dnd-label">
              {block.kind === 'code' ? block.options.language || 'Code' : block.kind === 'html' ? 'HTML' : block.kind}
            </span>
          {/if}

          {#if block.kind === 'audio'}
            <button
              type="button"
              class="dnd-write-tick"
              aria-pressed={taping === block.id}
              aria-label={taping === block.id ? 'Stop the recording' : 'Record'}
              title={taping === block.id ? 'Stop the recording' : 'Record'}
              onclick={() => record(block.id)}
            >{taping === block.id ? '■' : '●'}</button>
          {/if}

          {#if (block.kind === 'image' || block.kind === 'video' || block.kind === 'pdf') && requestMedia}
            <button
              type="button"
              class="dnd-write-tick"
              aria-label="Choose the file"
              title="Choose the file"
              onclick={() => pick(block.id, block.kind)}
            ><Glyph name={block.kind === 'image' ? 'picture' : 'sources'} size="sm" /></button>
          {/if}

          {#if block.kind === 'todo'}
            <button
              type="button"
              class="dnd-write-tick dnd-write-tick-box"
              class:dnd-write-tick-done={block.options.done}
              aria-pressed={Boolean(block.options.done)}
              aria-label={block.options.done ? 'Undo this task' : 'Mark this task done'}
              onclick={() => check(block.id)}
            ></button>
          {/if}
          <textarea
            class="dnd-write-host dnd-write-host-{block.kind}"
            class:dnd-write-host-raw={RAW.includes(block.kind)}
            class:dnd-write-host-done={block.kind === 'todo' && block.options.done}
            class:dnd-write-host-h1={block.kind === 'heading' && (block.options.level ?? 1) === 1}
            class:dnd-write-host-h2={block.kind === 'heading' && block.options.level === 2}
            class:dnd-write-host-h3={block.kind === 'heading' && block.options.level === 3}
            class:dnd-write-host-narrow={block.options.width === 'narrow'}
            style:text-align={block.options.align ?? null}
            style:font-size={block.options.size ? `var(--text-${block.options.size})` : null}
            style:line-height={block.options.leading ? { tight: '1.25', normal: '1.6', relaxed: '1.8', loose: '2' }[block.options.leading] : null}
            style:white-space={block.options.wrap === 'nowrap' ? 'pre' : null}
            rows="1"
            placeholder={hint(block, index)}
            value={block.kind === 'image' ? (block.options.alt ?? '') : block.text}
            use:host={block.id}
            oninput={(event) => write(block.id, event)}
            onkeydown={(event) => step(block.id, event)}
            onpointerdown={() => reach(block.id)}
            onpaste={(event) => paste(block.id, event)}
            oncopy={(event) => copy(block.id, event)}
          ></textarea>

          {#if (block.kind === 'bookmark' || block.kind === 'pdf' || block.kind === 'audio') && address(block)}
            <span class="dnd-write-where">{address(block)}</span>
          {/if}

          {#if block.kind === 'bookmark' && block.options.description}
            <span class="dnd-write-where dnd-write-note">{block.options.description}</span>
          {/if}
        {/if}

        {#if openMenu === block.id}
          <div class="dnd-write-menu">
            <p class="dnd-label dnd-write-menu-name">Turn into</p>
            {#each turns as command (command.title)}
              {@render offer(command, false, () => choose(block.id, command), () => {})}
            {/each}

            {#if isListKind(block.kind)}
              <p class="dnd-label dnd-write-menu-name">List type</p>
              <span class="dnd-write-row-of">
                {#each [{ id: 'bullet', title: 'Bulleted' }, { id: 'number', title: 'Numbered' }, { id: 'todo', title: 'Task' }] as one (one.id)}
                  <button
                    type="button"
                    class="dnd-write-chip"
                    class:dnd-write-chip-on={block.kind === one.id}
                    aria-pressed={block.kind === one.id}
                    onclick={() => turn(block.id, one.id as BlockKind, block.options.depth ? { depth: block.options.depth } : {})}
                  >
                    {one.title}
                  </button>
                {/each}
              </span>
            {/if}

            {#each settings(block) as setting (setting.key)}
              {@render chips(block.id, block, setting)}
            {/each}

            {#if block.options.own}
              <button type="button" class="dnd-write-pick" onclick={() => undress(block.id)}>
                Take the page's look
              </button>
            {/if}

            {#if UPLOADED.includes(block.kind) && requestMedia}
              <button type="button" class="dnd-write-pick" onclick={() => pick(block.id, block.kind)}>
                <span class="dnd-write-pick-sign" aria-hidden="true"><Glyph name="upload" size="sm" /></span>
                <span class="dnd-write-pick-text">
                  <span class="dnd-write-pick-name">Replace {MEDIA_NAMES[block.kind]}</span>
                  <span class="dnd-write-pick-note">{address(block) || `No ${MEDIA_NAMES[block.kind]} set`}</span>
                </span>
              </button>
            {:else if (MEDIA.includes(block.kind) || block.kind === 'file') && block.kind !== 'page'}
              <label class="dnd-write-field">
                <span class="dnd-label">{block.kind === 'map' ? 'Set address' : `Replace ${MEDIA_NAMES[block.kind]}`}</span>
                <input
                  type={block.kind === 'map' ? 'text' : 'url'}
                  class="dnd-write-url"
                  placeholder="https://"
                  value={address(block)}
                  oninput={(event) => readdress(block.id, event.currentTarget.value)}
                  onchange={() => block.kind === 'bookmark' && preview(block.id)}
                />
              </label>
            {/if}

            {#if block.kind === 'toggle'}
              <button
                type="button"
                class="dnd-write-pick"
                onclick={() => dress(block.id, { open: !block.options.open })}
              >
                {block.options.open ? 'Folded when read' : 'Open when read'}
              </button>
            {/if}

            <p class="dnd-label dnd-write-menu-name">Move</p>
            <button type="button" class="dnd-write-pick" onclick={() => shift(block.id, -1)}>Up</button>
            <button type="button" class="dnd-write-pick" onclick={() => shift(block.id, 1)}>Down</button>
            <button type="button" class="dnd-write-pick dnd-write-pick-bane" onclick={() => drop(block.id)}>Remove</button>
          </div>
        {/if}

        {#if slashOn?.id === block.id && offered.length > 0}
          <div class="dnd-write-menu dnd-write-menu-slash">
            {#each offered as command, place (command.title)}
              {#if command.group !== offered[place - 1]?.group}
                <p class="dnd-label dnd-write-menu-name">{command.group}</p>
              {/if}
              {@render offer(command, place === chosen, () => choose(block.id, command), () => (chosen = place))}
            {/each}
          </div>
        {/if}

        {#if pickOn?.id === block.id && onsearch && (seeking || picks.length > 0)}
          <div class="dnd-write-menu dnd-write-menu-slash">
            <p class="dnd-label dnd-write-menu-name">{pickOn.mark === '@' ? 'Mention' : 'Tag'}</p>
            {#each seeking ? [0, 1, 2] : [] as row (row)}
              <span class="dnd-write-pick dnd-write-skeleton" aria-hidden="true">
                <span class="dnd-write-pick-icon dnd-write-skeleton-mark"></span>
                <span class="dnd-write-skeleton-line"></span>
              </span>
            {/each}
            {#each seeking ? [] : picks as mention, place (mention.id)}
              <button
                type="button"
                class="dnd-write-pick"
                class:dnd-write-pick-lit={place === chosen}
                onclick={() => take(mention)}
                onpointerenter={() => (chosen = place)}
              >
                {#if mention.icon}
                  <span class="dnd-write-pick-icon"><StoredImage src={mention.icon} alt="" /></span>
                {/if}
                {mention.label}
              </button>
            {/each}
          </div>
        {/if}
      </div>
    {/each}
  </div>
{/if}

<style>
  .dnd-write {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    width: 100%;
    min-width: 0;
    min-height: calc(var(--space-8) * 3.5);
    padding-block: var(--space-3);
    counter-reset: dnd-write-count-0 dnd-write-count-1 dnd-write-count-2 dnd-write-count-3;
  }

  .dnd-write > :not(.dnd-write-row-listed) {
    counter-reset: dnd-write-count-0;
  }

  .dnd-write-file {
    flex: 1 1 0;
    display: flex;
    align-items: center;
    gap: var(--space-2);
    min-width: 0;
    padding: var(--space-1) 0;
    border: none;
    border-radius: var(--radius-sm);
    background: none;
    color: var(--metal);
    font: inherit;
    text-align: start;
    cursor: pointer;
    transition: color 0.15s ease;
  }

  .dnd-write-file:hover {
    color: var(--metal-bright);
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
    font-size: var(--text-sm);
    color: var(--ink);
  }

  .dnd-write-row {
    --dnd-depth: 0;
    position: relative;
    display: flex;
    flex-wrap: wrap;
    align-items: flex-start;
    gap: var(--space-2);
  }

  .dnd-write-row-listed {
    padding-inline-start: calc(var(--space-5) * var(--dnd-depth));
  }

  .dnd-write-row-hauled {
    opacity: 0.4;
  }

  .dnd-write-row-before::before,
  .dnd-write-row-after::after {
    content: '';
    position: absolute;
    inset-inline: 0;
    height: var(--border-width);
    background: var(--metal);
    pointer-events: none;
  }

  .dnd-write-row-before::before {
    top: calc(-1 * var(--space-1) - var(--border-hair));
  }

  .dnd-write-row-after::after {
    bottom: calc(-1 * var(--space-1) - var(--border-hair));
  }

  .dnd-write-figure {
    flex: 1 0 100%;
  }

  .dnd-write-figure :global(img),
  .dnd-write-figure video {
    display: block;
    width: 100%;
    border: var(--border-width) solid var(--metal-dim);
    border-radius: var(--radius-sm);
    box-shadow: 0 0 0 1px var(--keyline);
  }

  .dnd-write-mark {
    flex: none;
    min-width: var(--space-4);
    padding-block: var(--space-0);
    font-size: var(--text-sm);
    line-height: 1.6;
    text-align: end;
    color: var(--metal);
  }

  .dnd-write-mark-bullet::before {
    content: '•';
  }

  .dnd-write-mark-1.dnd-write-mark-bullet::before {
    content: '◦';
  }

  .dnd-write-mark-2.dnd-write-mark-bullet::before,
  .dnd-write-mark-3.dnd-write-mark-bullet::before,
  .dnd-write-mark-4.dnd-write-mark-bullet::before,
  .dnd-write-mark-5.dnd-write-mark-bullet::before {
    content: '▪';
  }

  .dnd-write-mark-number::before {
    font-family: var(--font-figures);
    font-size: var(--text-xs);
  }

  .dnd-write-row-listed:has(.dnd-write-mark-0),
  .dnd-write-row-listed:has(.dnd-write-tick-box):not(:has(.dnd-write-mark)) {
    counter-reset: dnd-write-count-1;
  }

  .dnd-write-row-listed:has(.dnd-write-mark-1) {
    counter-reset: dnd-write-count-2;
  }

  .dnd-write-row-listed:has(.dnd-write-mark-2) {
    counter-reset: dnd-write-count-3;
  }

  .dnd-write-mark-number.dnd-write-mark-0::before {
    content: counter(dnd-write-count-0) '.';
    counter-increment: dnd-write-count-0;
  }

  .dnd-write-mark-number.dnd-write-mark-1::before {
    content: counter(dnd-write-count-1, lower-alpha) '.';
    counter-increment: dnd-write-count-1;
  }

  .dnd-write-mark-number.dnd-write-mark-2::before {
    content: counter(dnd-write-count-2, lower-roman) '.';
    counter-increment: dnd-write-count-2;
  }

  .dnd-write-mark-number.dnd-write-mark-3::before,
  .dnd-write-mark-number.dnd-write-mark-4::before,
  .dnd-write-mark-number.dnd-write-mark-5::before {
    content: counter(dnd-write-count-3) '.';
    counter-increment: dnd-write-count-3;
  }

  .dnd-write-mark-head {
    margin-block-start: var(--space-3);
    font-family: var(--font-mono);
    font-size: var(--text-xs);
    line-height: calc(var(--text-md) * 1.6);
  }

  .dnd-write-mark-head-1 {
    margin-block-start: var(--space-4);
    line-height: calc(var(--text-2xl) * 1.6);
  }

  .dnd-write-mark-head-2 {
    line-height: calc(var(--text-xl) * 1.6);
  }

  .dnd-write-mark-head-3 {
    line-height: calc(var(--text-lg) * 1.6);
  }

  .dnd-write-mark-slot {
    display: flex;
    align-items: center;
    justify-content: center;
    width: var(--space-5);
    height: var(--space-5);
    padding: 0;
    border: var(--border-hair) solid var(--metal);
    border-radius: var(--radius-pill);
    background: radial-gradient(circle at 38% 30%, var(--stone-light) 0%, var(--stone) 45%, var(--stone-dark) 100%);
    box-shadow: 0 0 0 1px var(--keyline), inset 0 1px 0 var(--sheen), inset 0 -1px 2px var(--shade-hard);
    color: var(--metal);
    text-shadow: 0 1px 0 #000;
    font-family: var(--font-display);
    font-size: var(--text-xs);
    font-weight: 600;
    line-height: 1;
  }

  .dnd-write-mark-callout::before {
    content: '!';
  }

  .dnd-write-mark-poll::before {
    content: '?';
  }

  .dnd-write-mark-bookmark::before {
    content: '↗';
  }

  .dnd-write-mark-meeting::before {
    content: '◷';
  }

  .dnd-write-mark-page::before {
    content: '¶';
  }

  .dnd-write-mark-toggle {
    display: flex;
    align-items: center;
    justify-content: center;
    height: calc(var(--text-sm) * 1.6 + var(--space-0) * 2);
    padding: 0;
    font-size: var(--text-xs);
    color: var(--ink-dim);
  }

  .dnd-write-mark-toggle::before {
    content: '▶';
    transition: transform 0.15s ease;
  }

  .dnd-write-mark-open::before {
    transform: rotate(90deg);
  }

  .dnd-write-band {
    flex: 1 0 100%;
    padding: var(--space-1) var(--space-3);
    border-bottom: none;
    background:
      linear-gradient(180deg, color-mix(in srgb, var(--stone-light) 20%, transparent) 0%, color-mix(in srgb, #000 45%, transparent) 60%, color-mix(in srgb, #000 65%, transparent) 100%),
      var(--texture-noise),
      var(--stone);
    box-shadow: var(--bevel-up), 0 1px 0 var(--metal-dim), 0 2px 0 var(--keyline);
    color: var(--metal);
    text-shadow: 0 1px 0 #000;
    text-transform: capitalize;
  }

  .dnd-write-tick {
    flex: none;
    display: flex;
    align-items: center;
    height: calc(var(--text-sm) * 1.6 + var(--space-0) * 2);
    padding: 0;
    border: none;
    background: none;
    font-size: var(--text-md);
    color: var(--metal);
    cursor: pointer;
  }

  .dnd-write-tick-box::before {
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
    transition: background 0.15s ease, border-color 0.15s ease;
  }

  .dnd-write-tick-box:hover::before {
    border-color: var(--metal);
  }

  .dnd-write-tick-done::before {
    border-color: var(--metal);
    background: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath d='M5 12.5 10 17.5 19 6.5' fill='none' stroke='%230b0703' stroke-width='3' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E") center / 80% no-repeat, var(--metal);
  }

  .dnd-write-host-done {
    color: var(--ink-faint);
    text-decoration: line-through;
  }

  .dnd-write-where {
    flex: 1 0 100%;
    padding-inline-start: calc(var(--space-5) + var(--space-2));
    font-family: var(--font-mono);
    font-size: var(--text-xs);
    color: var(--ink-faint);
    overflow-wrap: anywhere;
  }

  .dnd-write-note {
    font-family: var(--font-body);
    font-size: var(--text-sm);
    color: var(--ink-dim);
  }

  .dnd-write-toc {
    flex: 1 1 0;
    display: grid;
    gap: var(--space-1);
    padding: var(--space-2) var(--space-3);
    border: var(--border-hair) solid var(--metal-dim);
    border-radius: var(--radius-sm);
    background: var(--texture-noise), linear-gradient(180deg, var(--ground-raised) 0%, var(--ground-deep) 100%);
    box-shadow: 0 0 0 1px var(--keyline), inset 0 0 16px 2px var(--shade-hard);
    color: var(--metal);
    text-shadow: 0 1px 0 #000;
  }

  .dnd-write-toc-line {
    font-size: var(--text-sm);
    color: var(--ink);
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

  .dnd-write-row-callout,
  .dnd-write-row-meeting {
    gap: var(--space-3);
    padding: var(--space-3) var(--space-4);
    border: var(--border-hair) solid var(--metal);
    border-radius: var(--radius-sm);
    background:
      radial-gradient(ellipse 90% 80% at 50% 0%, color-mix(in srgb, var(--ember) 8%, transparent) 0%, transparent 70%),
      var(--texture-leather),
      linear-gradient(180deg, var(--ground-lift) 0%, var(--ground-raised) 100%);
    box-shadow: 0 0 0 1px var(--keyline), inset 0 0 0 1px var(--keyline), inset 0 0 18px 2px var(--shade-hard);
  }

  .dnd-write-row-poll,
  .dnd-write-row-bookmark,
  .dnd-write-row-audio,
  .dnd-write-row-video,
  .dnd-write-row-pdf,
  .dnd-write-row-embed,
  .dnd-write-row-map,
  .dnd-write-row-page,
  .dnd-write-row-file {
    padding: var(--space-2) var(--space-3);
    border: var(--border-hair) solid var(--metal-dim);
    border-radius: var(--radius-sm);
    background: var(--texture-noise), linear-gradient(180deg, var(--ground-raised) 0%, var(--ground-deep) 100%);
    box-shadow: 0 0 0 1px var(--keyline), inset 0 0 14px 2px var(--shade-hard);
  }

  .dnd-write-row-audio,
  .dnd-write-row-video,
  .dnd-write-row-pdf {
    background: var(--texture-noise), var(--ground-raised);
  }

  .dnd-write-row-code,
  .dnd-write-row-table,
  .dnd-write-row-mermaid,
  .dnd-write-row-html,
  .dnd-write-row-columns {
    gap: 0;
    overflow: hidden;
    border: var(--border-width) solid var(--metal-dim);
    border-radius: var(--radius-sm);
    background: var(--texture-noise), linear-gradient(180deg, var(--ground-deep) 0%, #000 100%);
    box-shadow: 0 0 0 1px var(--keyline), var(--bevel-down);
  }

  .dnd-write-field {
    display: grid;
    gap: var(--space-1);
    padding-block: var(--space-2);
  }

  .dnd-write-url {
    width: 100%;
  }

  .dnd-write-row-of {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-1);
    padding: var(--space-1) var(--space-2);
  }

  .dnd-write-chip {
    padding: 1px var(--space-2);
    border: var(--border-hair) solid var(--metal-dim);
    border-radius: var(--radius-sm);
    background: var(--texture-noise), var(--ground-deep);
    box-shadow: var(--bevel-down);
    font-family: var(--font-body);
    font-size: var(--text-xs);
    color: var(--ink-dim);
    cursor: pointer;
    transition: border-color 0.15s ease, color 0.15s ease, box-shadow 0.15s ease;
  }

  .dnd-write-chip:hover {
    border-color: var(--metal);
    color: var(--metal-bright);
  }

  .dnd-write-chip-on {
    border-color: var(--metal-bright);
    color: var(--metal-bright);
    box-shadow: inset 0 0 8px var(--ember-glow), 0 0 6px var(--ember-glow);
  }

  .dnd-write-row-picked {
    background: color-mix(in srgb, var(--metal) 18%, transparent);
    border-radius: var(--radius-sm);
  }

  .dnd-write-gutter {
    position: absolute;
    top: var(--space-0);
    inset-inline-start: 0;
    transform: translateX(-100%);
    margin-inline-start: calc(-1 * var(--space-1));
    display: flex;
    align-items: center;
    height: calc(var(--text-sm) * 1.6);
    opacity: 0;
    transition: opacity 0.15s ease;
  }

  .dnd-write-gutter :global(.dnd-iconbtn:last-child) {
    cursor: grab;
    touch-action: none;
  }

  .dnd-write-gutter :global(.dnd-iconbtn:last-child:active) {
    cursor: grabbing;
  }

  .dnd-write-row:hover .dnd-write-gutter,
  .dnd-write-row-menu .dnd-write-gutter,
  .dnd-write-gutter:focus-within {
    opacity: 1;
  }

  .dnd-write-row-heading .dnd-write-gutter {
    height: calc(var(--text-2xl) * 1.3);
  }

  .dnd-write-row-callout .dnd-write-gutter,
  .dnd-write-row-meeting .dnd-write-gutter {
    top: var(--space-3);
  }

  .dnd-write-row-poll .dnd-write-gutter,
  .dnd-write-row-bookmark .dnd-write-gutter,
  .dnd-write-row-audio .dnd-write-gutter,
  .dnd-write-row-video .dnd-write-gutter,
  .dnd-write-row-pdf .dnd-write-gutter,
  .dnd-write-row-embed .dnd-write-gutter,
  .dnd-write-row-map .dnd-write-gutter,
  .dnd-write-row-page .dnd-write-gutter,
  .dnd-write-row-file .dnd-write-gutter {
    top: var(--space-2);
  }

  .dnd-write-host {
    flex: 1 1 0;
    min-width: 0;
    field-sizing: content;
    padding: var(--space-0) var(--space-2);
    margin-inline: calc(-1 * var(--space-2));
    overflow: hidden;
    resize: none;
    border: none;
    border-radius: var(--radius-md);
    background: none;
    color: var(--ink);
    font-family: var(--font-body);
    font-size: var(--text-sm);
    line-height: 1.6;
  }

  .dnd-write-host-narrow {
    max-width: 65ch;
  }

  .dnd-write-mark + .dnd-write-host,
  .dnd-write-tick + .dnd-write-host {
    margin-inline-start: 0;
  }

  .dnd-write-host:focus {
    outline: none;
    box-shadow: none;
  }

  .dnd-write-host::placeholder {
    color: var(--ink-faint);
    font-style: italic;
  }

  .dnd-write-host-heading {
    margin-block-start: var(--space-3);
    font-family: var(--font-display);
    font-size: var(--text-md);
    color: var(--metal-bright);
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

  .dnd-write-host-quote {
    padding-inline-start: var(--space-3);
    border: var(--border-hair) solid var(--metal);
    border-radius: var(--radius-md);
    font-style: italic;
    color: var(--ink-dim);
  }

  .dnd-write-host-image {
    font-size: var(--text-xs);
    font-style: italic;
    color: var(--ink-faint);
  }

  .dnd-write-host-bookmark,
  .dnd-write-host-page {
    font-family: var(--font-display);
    color: var(--metal-bright);
  }

  .dnd-write-host-embed,
  .dnd-write-host-map {
    font-family: var(--font-mono);
    font-size: var(--text-xs);
  }

  .dnd-write-host-meeting {
    white-space: pre-wrap;
  }

  .dnd-write-host-raw {
    flex: 1 0 100%;
    margin-inline: 0;
    padding: var(--space-3);
    border-radius: var(--radius-md);
    font-family: var(--font-mono);
    font-size: var(--text-xs);
  }

  .dnd-write-host-raw:focus {
    background: none;
  }

  .dnd-write-rule {
    flex: 1 1 0;
    height: var(--border-width);
    margin-block: var(--space-4);
    margin-inline: 0;
    border: none;
    background: linear-gradient(90deg, transparent, var(--metal-dim) 15%, var(--metal) 50%, var(--metal-dim) 85%, transparent);
    box-shadow: 0 1px 0 var(--keyline);
  }

  .dnd-write-menu {
    position: absolute;
    top: 100%;
    inset-inline-start: 0;
    z-index: 5;
    display: flex;
    flex-direction: column;
    gap: var(--space-0);
    min-width: calc(var(--space-8) * 4);
    max-height: calc(var(--space-8) * 5);
    overflow-y: auto;
    padding: var(--space-2);
    background: var(--texture-noise), linear-gradient(180deg, var(--ground-raised) 0%, var(--ground-deep) 100%);
    border: none;
    border-radius: var(--radius-sm);
    box-shadow: var(--rim-thin), inset 0 0 16px 2px var(--shade-hard), var(--shadow-lg);
  }

  .dnd-write-menu-name {
    margin: var(--space-1) 0 0;
    color: var(--metal);
    text-shadow: 0 1px 0 #000;
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
    text-shadow: 0 1px 0 #000, 0 0 6px var(--ember-glow);
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

  .dnd-write-pick-bane {
    color: var(--state-bad);
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

  .dnd-write-toc-marker {
    flex: 1 1 0;
    padding: var(--space-2) var(--space-3);
    border: var(--border-hair) dashed var(--metal-dim);
    border-radius: var(--radius-sm);
    color: var(--ink-faint);
  }

  .dnd-write-empty {
    flex: 1 0 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-5) var(--space-4);
    border: var(--border-hair) dashed var(--metal-dim);
    border-radius: var(--radius-sm);
    background: var(--ground-deep);
    color: var(--ink-dim);
    font: inherit;
    text-align: center;
  }

  .dnd-write-empty-row {
    flex-direction: row;
    padding: var(--space-2) var(--space-3);
    text-align: start;
  }

  .dnd-write-empty-audio {
    flex-direction: row;
    padding: var(--space-3);
    text-align: start;
  }

  button.dnd-write-empty:not(:disabled) {
    cursor: pointer;
  }

  button.dnd-write-empty:not(:disabled):hover {
    border-color: var(--metal);
    color: var(--ink);
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
    font-size: var(--text-sm);
    color: var(--ink);
  }

  .dnd-write-empty-hint {
    font-size: var(--text-xs);
    color: var(--ink-faint);
  }
</style>
