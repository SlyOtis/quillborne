export type BlockKind =
  | 'paragraph'
  | 'heading'
  | 'quote'
  | 'code'
  | 'bullet'
  | 'number'
  | 'divider'
  | 'callout'
  | 'image'
  | 'todo'
  | 'table'
  | 'toggle'
  | 'poll'
  | 'audio'
  | 'bookmark'
  | 'mermaid'
  | 'html'
  | 'toc'
  | 'columns'
  | 'video'
  | 'pdf'
  | 'embed'
  | 'meeting'
  | 'map'
  | 'page'
  | 'file'

export type BlockAlign = 'start' | 'center' | 'end' | 'justify'
export type BlockSize = 'sm' | 'md' | 'lg' | 'xl'
export type BlockWidth = 'full' | 'narrow'
export type BlockWrap = 'wrap' | 'balance' | 'nowrap'
export type BlockLeading = 'tight' | 'normal' | 'relaxed' | 'loose'
export type BlockView = 'full' | 'link' | 'icon' | 'hidden'
export type BlockPlacement = 'inline' | 'left' | 'right'

export interface BlockOptions {
  /** Heading depth, one through six. */
  level?: number
  /** Language written on a code fence. */
  language?: string
  /** Address a picture, recording, video, pdf or map block draws. */
  src?: string
  /** Alternative text for a picture block. */
  alt?: string
  /** Whether a task block is struck through. */
  done?: boolean
  /** Whether a toggle block is open when the page is read. */
  open?: boolean
  /** Which way the block's own text is set. */
  align?: BlockAlign
  /** The block's own type size, when it does not take the page's. */
  size?: BlockSize
  /** Whether the block spans the page or sits in a reading column. */
  width?: BlockWidth
  /** How the block's lines break. */
  wrap?: BlockWrap
  /** The block's own line height. */
  leading?: BlockLeading
  /** Set when the block carries its own look rather than the page's. */
  own?: boolean
  /** Who voted for what on a poll block, by user id. */
  votes?: Record<string, string>
  /** Address a bookmark or embed block points at. */
  url?: string
  /** How many levels a list item sits under the one before it. */
  depth?: number
  /** How a media block is drawn when the page is read. */
  view?: BlockView
  /** What a bookmark's preview said the page is about. */
  description?: string
  /** The picture a bookmark's preview handed back. */
  image?: string
  /** Where a table of contents sits: in the flow, or as a legend on one side of the page. */
  placement?: BlockPlacement
  /** The id of the sub page a page block links to. */
  page?: string
  /** The asset a file block opens. */
  assetId?: string
  /** The name a file block shows. */
  name?: string
  /** The type of what a file block holds. */
  mimeType?: string
}

/** The options a block keeps in the fence, which markdown has no form for. */
const KEPT: (keyof BlockOptions)[] = [
  'align', 'size', 'width', 'wrap', 'leading', 'own', 'open', 'level', 'language', 'src', 'alt',
  'done', 'votes', 'assetId', 'name', 'url', 'mimeType', 'depth', 'view', 'description', 'image', 'page', 'placement'
]

/** The options a block's plain markdown form already carries. */
const CARRIED: Partial<Record<BlockKind, (keyof BlockOptions)[]>> = {
  heading: ['level'],
  code: ['language'],
  image: ['src', 'alt'],
  todo: ['done', 'depth'],
  bullet: ['depth'],
  number: ['depth'],
  video: ['src'],
  pdf: ['src'],
  page: ['page']
}

export interface Block {
  id: string
  kind: BlockKind
  text: string
  options: BlockOptions
}

export interface BlockDocument {
  blocks: Block[]
}

export type ReferenceKind = 'character' | 'item' | 'place' | 'quest' | 'session' | 'map'

export interface Reference {
  /** The sigil the reference was written with. */
  mark: '@' | '#'
  /** The word between the sigil and the next space. */
  label: string
  /** The id the reference resolved to, when the block carries one. */
  id?: string
}

export interface Mention {
  id: string
  label: string
  icon?: string
}

export type MentionSearch = (mark: '@' | '#', query: string) => Promise<Mention[]>

export interface LinkPreview {
  title: string
  description?: string
  image?: string
}

export type MediaKind = 'image' | 'video' | 'audio' | 'pdf' | 'file'

export interface MediaAsset {
  id: string
  url: string
  name: string
  mimeType: string
}

const KINDS: BlockKind[] = [
  'paragraph', 'heading', 'quote', 'code', 'bullet', 'number', 'divider', 'callout', 'image',
  'todo', 'table', 'toggle', 'poll', 'audio', 'bookmark', 'mermaid', 'html', 'toc', 'columns',
  'video', 'pdf', 'embed', 'meeting', 'map', 'page', 'file'
]

const LINKED: BlockKind[] = ['video', 'pdf', 'page']
const LISTED: BlockKind[] = ['bullet', 'number', 'todo']

export function isListKind(kind: BlockKind): boolean {
  return LISTED.includes(kind)
}

export function getBlockId(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
}

export function getBlock(kind: BlockKind = 'paragraph', text = '', options: BlockOptions = {}): Block {
  return { id: getBlockId(), kind, text, options }
}

export function getEmptyDocument(): BlockDocument {
  return { blocks: [getBlock()] }
}

export function getDocument(value: string | BlockDocument | null | undefined): BlockDocument {
  if (!value) return getEmptyDocument()
  if (typeof value !== 'string') return value.blocks.length > 0 ? value : getEmptyDocument()

  const trimmed = value.trim()
  if (trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed) as BlockDocument
      if (Array.isArray(parsed.blocks)) return parsed.blocks.length > 0 ? parsed : getEmptyDocument()
    } catch {
      return getDocumentFromMarkdown(value)
    }
  }

  return getDocumentFromMarkdown(value)
}

export function getDocumentFromMarkdown(markdown: string): BlockDocument {
  const blocks = getBlocksFromMarkdown(markdown)
  return { blocks: blocks.length > 0 ? blocks : [getBlock()] }
}

function getDepth(lead: string): number {
  return Math.floor(lead.replace(/\t/g, '  ').length / 2)
}

function getListOptions(lead: string, held: BlockOptions = {}): BlockOptions {
  const depth = getDepth(lead)
  return depth > 0 ? { ...held, depth } : held
}

export function getBlocksFromMarkdown(markdown: string): Block[] {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n')
  const blocks: Block[] = []
  let at = 0

  while (at < lines.length) {
    const line = lines[at]

    if (line.trim() === '') {
      at += 1
      continue
    }

    const fence = /^(`{3,})(\S*)[ \t]*(\{.*\})?\s*$/.exec(line)
    if (fence) {
      const ticks = fence[1]
      const named = fence[2]
      const body: string[] = []
      at += 1

      while (at < lines.length && lines[at].trimEnd() !== ticks) {
        body.push(lines[at])
        at += 1
      }
      at += 1

      let options: BlockOptions = {}
      if (fence[3]) {
        try {
          options = JSON.parse(fence[3]) as BlockOptions
        } catch {
          options = {}
        }
      }

      // The info string names one of our own blocks, or it is a code fence.
      if (isBlockKind(named) && named !== 'code') {
        blocks.push(getBlock(named, body.join('\n'), options))
      } else {
        blocks.push(getBlock('code', body.join('\n'), named ? { ...options, language: named } : options))
      }
      continue
    }

    if (/^\[toc\]\s*$/i.test(line)) {
      blocks.push(getBlock('toc'))
      at += 1
      continue
    }

    const linked = /^\[(video|pdf|page):\s*([^\]]*)\]\(([^)]*)\)\s*$/.exec(line)
    if (linked) {
      const kind = linked[1] as BlockKind
      blocks.push(getBlock(kind, linked[2].trim(), kind === 'page' ? { page: linked[3] } : { src: linked[3] }))
      at += 1
      continue
    }

    const task = /^(\s*)[-*]\s+\[([ xX])\]\s+(.*)$/.exec(line)
    if (task) {
      blocks.push(getBlock('todo', task[3].trim(), getListOptions(task[1], { done: task[2].toLowerCase() === 'x' })))
      at += 1
      continue
    }

    if (/^(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      blocks.push(getBlock('divider'))
      at += 1
      continue
    }

    const picture = /^!\[([^\]]*)\]\(([^)]+)\)\s*$/.exec(line)
    if (picture) {
      blocks.push(getBlock('image', '', { alt: picture[1], src: picture[2] }))
      at += 1
      continue
    }

    const heading = /^(#{1,6})\s+(.*)$/.exec(line)
    if (heading) {
      blocks.push(getBlock('heading', heading[2].trim(), { level: heading[1].length }))
      at += 1
      continue
    }

    const callout = /^>\s*\[!\w+\]\s*(.*)$/.exec(line)
    if (callout) {
      blocks.push(getBlock('callout', callout[1].trim()))
      at += 1
      continue
    }

    const quote = /^>\s?(.*)$/.exec(line)
    if (quote) {
      blocks.push(getBlock('quote', quote[1].trim()))
      at += 1
      continue
    }

    const bullet = /^(\s*)[-*+]\s+(.*)$/.exec(line)
    if (bullet) {
      blocks.push(getBlock('bullet', bullet[2].trim(), getListOptions(bullet[1])))
      at += 1
      continue
    }

    const number = /^(\s*)\d+[.)]\s+(.*)$/.exec(line)
    if (number) {
      blocks.push(getBlock('number', number[2].trim(), getListOptions(number[1])))
      at += 1
      continue
    }

    const run: string[] = [line.trim()]
    at += 1
    while (
      at < lines.length &&
      lines[at].trim() !== '' &&
      !/^(#{1,6}\s|>|```|\s*[-*+]\s|\s*\d+[.)]\s|!\[|\[toc\]|\[(video|pdf|page):)/.test(lines[at])
    ) {
      run.push(lines[at].trim())
      at += 1
    }
    blocks.push(getBlock('paragraph', run.join(' ')))
  }

  return blocks
}

/** What the block keeps that its plain markdown form cannot say. */
function getKept(block: Block): Record<string, unknown> {
  const held: Record<string, unknown> = {}
  const carried = CARRIED[block.kind] ?? []
  for (const key of KEPT) {
    if (carried.includes(key)) continue
    const value = block.options[key]
    if (value !== undefined && value !== '') held[key] = value
  }
  return held
}

/** Every option the fence writes, the plain form's own included, so nothing is lost. */
function getHeld(block: Block): Record<string, unknown> {
  const held: Record<string, unknown> = {}
  for (const key of KEPT) {
    const value = block.options[key]
    if (value !== undefined && value !== '') held[key] = value
  }
  return held
}

/**
 * A block markdown has no form for is written as a fence whose info string is
 * the block name followed by its own options as json, and whose body is the
 * block's text. A block whose body already holds a fence is opened and closed
 * with one more backtick than the longest run inside it, so blocks nest.
 * Anywhere that does not know the grammar it still reads as a labelled fence.
 */
function getFence(block: Block, held: Record<string, unknown>): string {
  const runs = [...block.text.matchAll(/`+/g)].map((hit) => hit[0].length)
  const ticks = '`'.repeat(Math.max(3, Math.max(0, ...runs) + 1))
  const info = Object.keys(held).length > 0 ? `${block.kind} ${JSON.stringify(held)}` : block.kind

  return `${ticks}${info}\n${block.text}\n${ticks}`
}

function getLead(block: Block): string {
  return '  '.repeat(Math.max(0, block.options.depth ?? 0))
}

export function getBlockMarkdown(block: Block): string {
  const plain = Object.keys(getKept(block)).length === 0

  if (block.kind === 'divider') return '---'
  if (block.kind === 'toc' && plain) return '[toc]'

  const own: BlockKind[] = ['table', 'toggle', 'poll', 'audio', 'bookmark', 'mermaid', 'html', 'columns', 'embed', 'meeting', 'map', 'file']
  if (!plain || own.includes(block.kind)) return getFence(block, getHeld(block))

  if (block.kind === 'image') return `![${(block.options.alt ?? '').replace(/\s*\n\s*/g, ' ')}](${block.options.src ?? ''})`
  if (block.kind === 'code') return `\`\`\`${block.options.language ?? ''}\n${block.text}\n\`\`\``
  if (block.kind === 'todo') return `${getLead(block)}- [${block.options.done ? 'x' : ' '}] ${block.text}`
  if (LINKED.includes(block.kind)) {
    const address = block.kind === 'page' ? (block.options.page ?? '') : (block.options.src ?? '')
    return `[${block.kind}: ${block.text}](${address})`
  }

  if (block.kind === 'heading') return `${'#'.repeat(Math.min(Math.max(block.options.level ?? 1, 1), 6))} ${block.text}`
  if (block.kind === 'quote') return `> ${block.text}`
  if (block.kind === 'callout') return `> [!note] ${block.text}`
  if (block.kind === 'bullet') return `${getLead(block)}- ${block.text}`
  if (block.kind === 'number') return `${getLead(block)}1. ${block.text}`
  return block.text
}

export function getDocumentMarkdown(document: BlockDocument): string {
  return document.blocks.map(getBlockMarkdown).join('\n\n').trim()
}

export function getDocumentText(document: BlockDocument): string {
  return document.blocks.map((block) => block.text).filter(Boolean).join(' ')
}

export function getReferences(document: BlockDocument): Reference[] {
  const found = new Map<string, Reference>()

  for (const block of document.blocks) {
    for (const hit of block.text.matchAll(/(^|\s)([@#])([\p{L}\p{N}_-]+)/gu)) {
      const mark = hit[2] as '@' | '#'
      const label = hit[3]
      found.set(`${mark}${label.toLowerCase()}`, { mark, label })
    }
  }

  return [...found.values()]
}

export function isBlockKind(value: string): value is BlockKind {
  return (KINDS as string[]).includes(value)
}

/** The anchor a heading is reached by, made from its own words. */
export function getSlug(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .trim()
    .replace(/\s+/g, '-')
}

/**
 * The number each heading carries, by block id, counted the way an outline
 * is: a level one heading reads 1., a level two under it 1.1, and a deeper
 * level restarts whenever a shallower one passes.
 */
export function getHeadingNumbers(blocks: Block[]): Record<string, string> {
  const numbers: Record<string, string> = {}
  const count = [0, 0, 0, 0, 0, 0]

  for (const block of blocks) {
    if (block.kind !== 'heading') continue
    const level = Math.min(Math.max(block.options.level ?? 1, 1), 6)
    count[level - 1] += 1
    for (let deeper = level; deeper < 6; deeper += 1) count[deeper] = 0
    const run = count.slice(0, level)
    numbers[block.id] = level === 1 ? `${run[0]}.` : run.join('.')
  }

  return numbers
}

/** The columns a columns block holds, each as its own markdown. */
export function getColumns(text: string): string[] {
  return text.split(/\n-{3,}\n/).map((column) => column.trim())
}

/** The three lines a meeting block is made of. */
export function getMeeting(text: string): { date: string; attendees: string; notes: string } {
  const lines = text.split('\n')
  const take = (name: string, index: number) => {
    const line = lines.find((one) => one.toLowerCase().startsWith(`${name}:`))
    return (line ? line.slice(name.length + 1) : (lines[index] ?? '')).trim()
  }
  const date = take('date', 0)
  const attendees = take('attendees', 1)
  const noted = lines.findIndex((one) => one.toLowerCase().startsWith('notes:'))
  const notes = noted >= 0 ? [lines[noted].slice(6), ...lines.slice(noted + 1)].join('\n').trim() : lines.slice(2).join('\n').trim()
  return { date, attendees, notes }
}

export function isAddress(text: string): boolean {
  return /^https?:\/\//i.test(text.trim())
}

const DROPPED = ['script', 'style', 'iframe', 'object', 'embed', 'link', 'meta', 'base', 'form']

/**
 * Markup written into an html block with every way of running code stripped:
 * the tags that load or run it, the on attributes, and the javascript urls.
 * Needs a document to parse against, so anywhere without one gets nothing.
 */
export function getSafeHtml(markup: string): string {
  if (typeof DOMParser === 'undefined') return ''
  const parsed = new DOMParser().parseFromString(markup, 'text/html')

  for (const name of DROPPED) parsed.querySelectorAll(name).forEach((node) => node.remove())

  parsed.body.querySelectorAll('*').forEach((node) => {
    for (const attribute of [...node.attributes]) {
      const key = attribute.name.toLowerCase()
      const value = attribute.value.trim().toLowerCase().replace(/\s/g, '')
      if (key.startsWith('on') || (['href', 'src', 'xlink:href', 'action', 'formaction'].includes(key) && /^(javascript|data|vbscript):/.test(value))) {
        node.removeAttribute(attribute.name)
      }
    }
  })

  return parsed.body.innerHTML
}

function escape(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function getInlineHtml(text: string): string {
  return escape(text).replace(
    /(^|\s)([@#])([\p{L}\p{N}_-]+)/gu,
    (_, lead: string, mark: string, label: string) => `${lead}<span class="dnd-ref dnd-ref-${mark === '@' ? 'who' : 'tag'}">${mark}${label}</span>`
  )
}

function getStyleHtml(block: Block): string {
  const set: string[] = []
  if (block.options.align) set.push(`text-align:${block.options.align === 'start' ? 'left' : block.options.align === 'end' ? 'right' : block.options.align}`)
  if (block.options.width === 'narrow') set.push('max-width:65ch')
  if (block.options.wrap === 'nowrap') set.push('white-space:nowrap')
  if (block.options.wrap === 'balance') set.push('text-wrap:balance')
  if (block.options.leading) set.push(`line-height:${{ tight: 1.25, normal: 1.6, relaxed: 1.8, loose: 2 }[block.options.leading]}`)
  if (block.options.size) set.push(`font-size:${{ sm: '0.85em', md: '1em', lg: '1.2em', xl: '1.5em' }[block.options.size]}`)
  return set.length > 0 ? ` style="${set.join(';')}"` : ''
}

/**
 * The document as plain semantic html, list items nested by their depth and
 * every block in the element a reader would expect, so what the editor hands
 * out can be pasted anywhere that takes html.
 */
export function getDocumentHtml(document: BlockDocument, headingNumbering = false): string {
  const numbers = headingNumbering ? getHeadingNumbers(document.blocks) : {}
  const out: string[] = []
  const open: { kind: BlockKind; depth: number }[] = []

  const tagOf = (kind: BlockKind) => (kind === 'number' ? 'ol' : 'ul')
  const close = (to: number) => {
    while (open.length > to) out.push(`</${tagOf(open.pop()!.kind)}>`)
  }

  for (const block of document.blocks) {
    if (isListKind(block.kind)) {
      const depth = Math.max(0, block.options.depth ?? 0)
      close(depth + 1)
      while (open.length < depth + 1) {
        out.push(`<${tagOf(block.kind)}${block.kind === 'todo' ? ' class="dnd-tasks"' : ''}>`)
        open.push({ kind: block.kind, depth: open.length })
      }
      if (open[depth].kind !== block.kind && depth === open.length - 1) {
        out.push(`</${tagOf(open[depth].kind)}><${tagOf(block.kind)}>`)
        open[depth] = { kind: block.kind, depth }
      }
      const mark = block.kind === 'todo' ? `<input type="checkbox" disabled${block.options.done ? ' checked' : ''} /> ` : ''
      out.push(`<li${getStyleHtml(block)}>${mark}${getInlineHtml(block.text)}</li>`)
      continue
    }

    close(0)
    out.push(getBlockHtml(block, numbers[block.id], document.blocks))
  }

  close(0)
  return out.join('\n')
}

function getBlockHtml(block: Block, number: string | undefined, blocks: Block[]): string {
  const style = getStyleHtml(block)
  const text = getInlineHtml(block.text)

  switch (block.kind) {
    case 'divider':
      return '<hr />'
    case 'heading': {
      const level = Math.min(Math.max(block.options.level ?? 1, 1), 6)
      return `<h${level} id="${getSlug(block.text)}"${style}>${number ? `${number} ` : ''}${text}</h${level}>`
    }
    case 'quote':
      return `<blockquote${style}>${text}</blockquote>`
    case 'callout':
      return `<aside class="dnd-callout"${style}>${text}</aside>`
    case 'code':
      return `<pre><code${block.options.language ? ` class="language-${escape(block.options.language)}"` : ''}>${escape(block.text)}</code></pre>`
    case 'mermaid':
      return `<pre class="mermaid">${escape(block.text)}</pre>`
    case 'html':
      return block.text
    case 'image':
      return `<figure><img src="${escape(block.options.src ?? '')}" alt="${escape(block.options.alt ?? '')}" />${block.options.alt ? `<figcaption>${escape(block.options.alt)}</figcaption>` : ''}</figure>`
    case 'table': {
      const rows = block.text.split('\n').filter(Boolean)
      return `<table>${rows
        .map((row, index) => `<tr>${row.split('|').map((cell) => (index === 0 ? `<th>${escape(cell.trim())}</th>` : `<td>${escape(cell.trim())}</td>`)).join('')}</tr>`)
        .join('')}</table>`
    }
    case 'toggle': {
      const [head, ...rest] = block.text.split('\n')
      return `<details${block.options.open ? ' open' : ''}><summary>${escape(head)}</summary><p>${getInlineHtml(rest.join('\n'))}</p></details>`
    }
    case 'poll': {
      const [ask, ...choices] = block.text.split('\n').filter(Boolean)
      const votes = Object.values(block.options.votes ?? {})
      return `<section class="dnd-poll"><p>${escape(ask ?? '')}</p><ul>${choices
        .map((choice) => `<li>${escape(choice.trim())} (${votes.filter((one) => one === choice.trim()).length})</li>`)
        .join('')}</ul></section>`
    }
    case 'audio':
      return `<figure><audio controls src="${escape(block.options.src ?? '')}"></audio>${block.text ? `<figcaption>${escape(block.text)}</figcaption>` : ''}</figure>`
    case 'video':
      return `<figure><video controls src="${escape(block.options.src ?? '')}"></video>${block.text ? `<figcaption>${escape(block.text)}</figcaption>` : ''}</figure>`
    case 'pdf':
      return `<figure><object data="${escape(block.options.src ?? '')}" type="application/pdf"></object>${block.text ? `<figcaption>${escape(block.text)}</figcaption>` : ''}</figure>`
    case 'bookmark': {
      const url = escape(block.options.url ?? '')
      return `<a class="dnd-bookmark" href="${url}">${block.options.image ? `<img src="${escape(block.options.image)}" alt="" />` : ''}<strong>${escape(block.text || url)}</strong>${block.options.description ? `<span>${escape(block.options.description)}</span>` : ''}<small>${url}</small></a>`
    }
    case 'embed':
      return `<iframe src="${escape(block.text.trim())}" loading="lazy"></iframe>`
    case 'map':
      return isAddress(block.text)
        ? `<iframe src="${escape(block.text.trim())}" loading="lazy"></iframe>`
        : `<figure><img src="${escape(block.text.trim())}" alt="" /></figure>`
    case 'meeting': {
      const meeting = getMeeting(block.text)
      return `<aside class="dnd-meeting"><p><strong>Date</strong> ${escape(meeting.date)}</p><p><strong>Attendees</strong> ${escape(meeting.attendees)}</p><p>${escape(meeting.notes)}</p></aside>`
    }
    case 'toc': {
      const numbers = getHeadingNumbers(blocks)
      return `<nav class="dnd-toc${block.options.placement && block.options.placement !== 'inline' ? ` dnd-toc-${block.options.placement}` : ''}"><ul>${blocks
        .filter((one) => one.kind === 'heading')
        .map((one) => `<li><a href="#${getSlug(one.text)}">${number ? `${numbers[one.id]} ` : ''}${escape(one.text)}</a></li>`)
        .join('')}</ul></nav>`
    }
    case 'columns':
      return `<div class="dnd-columns">${getColumns(block.text)
        .map((column) => `<div class="dnd-column">${getDocumentHtml(getDocumentFromMarkdown(column))}</div>`)
        .join('')}</div>`
    case 'page':
      return `<a class="dnd-page" href="${escape(block.options.page ?? '')}">${escape(block.text)}</a>`
    case 'file':
      return `<a class="dnd-file" href="${escape(block.options.url ?? '')}">${escape(block.options.name || 'File')}</a>`
    default:
      return `<p${style}>${text}</p>`
  }
}

const MAIL = {
  ground: '#12131b',
  ink: '#e8e3d6',
  dim: '#a09884',
  metal: '#c9a94f',
  rule: '#3a3a44'
}

/**
 * The document as a whole html mail: laid out in tables with every style
 * inline and no style element, because a mail client keeps neither. A block a
 * mail client cannot mount degrades to its own content or to a link rather
 * than to an empty tag, so nothing is silently lost on the way out.
 */
export function getDocumentEmailHtml(document: BlockDocument, title = ''): string {
  const rows = document.blocks.map((block) => `<tr><td style="padding:0 0 12px">${getBlockEmailHtml(block)}</td></tr>`)

  return [
    '<!doctype html>',
    '<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">',
    `<title>${escape(title)}</title></head>`,
    `<body style="margin:0;padding:0;background:${MAIL.ground}">`,
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${MAIL.ground}">`,
    '<tr><td align="center" style="padding:24px">',
    '<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:100%">',
    title
      ? `<tr><td style="padding:0 0 16px;font-family:Georgia,serif;font-size:22px;color:${MAIL.metal}">${escape(title)}</td></tr>`
      : '',
    ...rows,
    '</table></td></tr></table></body></html>'
  ].join('')
}

export function getBlockEmailHtml(block: Block): string {
  const align = block.options.align ?? 'left'
  const set = `text-align:${align === 'start' ? 'left' : align === 'end' ? 'right' : align}`
  const body = `font-family:Georgia,serif;font-size:15px;line-height:1.6;color:${MAIL.ink};${set}`
  const text = escape(block.text)
  const lead = `padding-left:${(block.options.depth ?? 0) * 16}px;`

  if (block.kind === 'divider') {
    return `<div style="height:1px;background:${MAIL.dim};opacity:0.4"></div>`
  }

  if (block.kind === 'heading') {
    const size = [22, 19, 17, 16, 15, 15][Math.min(Math.max((block.options.level ?? 1) - 1, 0), 5)]
    return `<div style="font-family:Georgia,serif;font-size:${size}px;color:${MAIL.metal};${set}">${text}</div>`
  }

  if (block.kind === 'image') {
    const src = escape(block.options.src ?? '')
    return `<img src="${src}" alt="${escape(block.options.alt ?? '')}" width="600" style="display:block;width:100%;max-width:600px;border:0" />`
  }

  if (block.kind === 'quote' || block.kind === 'callout' || block.kind === 'meeting') {
    return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="padding:10px 14px;border-left:3px solid ${MAIL.metal};${body}">${text.replace(/\n/g, '<br />')}</td></tr></table>`
  }

  if (block.kind === 'code' || block.kind === 'mermaid' || block.kind === 'html') {
    return `<pre style="margin:0;padding:12px;background:#0c0d13;color:${MAIL.ink};font-family:Menlo,monospace;font-size:13px;overflow:auto">${text}</pre>`
  }

  if (block.kind === 'bullet') return `<div style="${body};${lead}">&bull;&nbsp;${text}</div>`
  if (block.kind === 'number') return `<div style="${body};${lead}">1.&nbsp;${text}</div>`
  if (block.kind === 'todo') {
    const mark = block.options.done ? '&#9745;' : '&#9744;'
    const struck = block.options.done ? 'text-decoration:line-through;opacity:0.7;' : ''
    return `<div style="${body};${lead}${struck}">${mark}&nbsp;${text}</div>`
  }

  if (block.kind === 'table') {
    const lines = block.text.split('\n').filter(Boolean)
    const cells = lines.map((line, row) =>
      `<tr>${line
        .split('|')
        .map((cell) =>
          row === 0
            ? `<th align="left" style="padding:6px 10px;border:1px solid ${MAIL.dim};font-family:Georgia,serif;color:${MAIL.metal}">${escape(cell.trim())}</th>`
            : `<td style="padding:6px 10px;border:1px solid ${MAIL.dim};${body}">${escape(cell.trim())}</td>`
        )
        .join('')}</tr>`
    )
    return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse">${cells.join('')}</table>`
  }

  // A toggle cannot fold in a mail client, so it degrades to its own content.
  if (block.kind === 'toggle') {
    const [head, ...rest] = block.text.split('\n')
    return `<div style="${body}"><strong style="color:${MAIL.metal}">${escape(head)}</strong><br />${escape(rest.join(' '))}</div>`
  }

  // A poll cannot be voted on in a mail client, so it degrades to the tally.
  if (block.kind === 'poll') {
    const votes = Object.values(block.options.votes ?? {})
    const lines = block.text.split('\n').filter(Boolean)
    const [ask, ...choices] = lines
    const tally = choices.map((choice) => {
      const count = votes.filter((one) => one === choice.trim()).length
      return `<div style="${body}">${escape(choice.trim())} &mdash; ${count}</div>`
    })
    return `<div style="${body}"><strong style="color:${MAIL.metal}">${escape(ask ?? '')}</strong></div>${tally.join('')}`
  }

  // A recording, a video or a pdf cannot play in a mail client, so it degrades to a link.
  if (block.kind === 'audio' || block.kind === 'video' || block.kind === 'pdf') {
    const src = escape(block.options.src ?? '')
    return `<div style="${body}"><a href="${src}" style="color:${MAIL.metal}">${escape(block.text || src)}</a></div>`
  }

  if (block.kind === 'embed' || block.kind === 'map') {
    const src = escape(block.text.trim())
    return `<div style="${body}"><a href="${src}" style="color:${MAIL.metal}">${src}</a></div>`
  }

  if (block.kind === 'file') {
    const url = escape(block.options.url ?? '')
    return `<div style="${body}"><a href="${url}" style="color:${MAIL.metal}">${escape(block.options.name || url)}</a></div>`
  }

  if (block.kind === 'bookmark') {
    const url = escape(block.options.url ?? '')
    return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="padding:10px 14px;border:1px solid ${MAIL.dim};${body}"><a href="${url}" style="color:${MAIL.metal};text-decoration:none">${escape(block.text || url)}</a><br /><span style="font-size:12px;color:${MAIL.dim}">${url}</span></td></tr></table>`
  }

  if (block.kind === 'page') {
    return `<div style="${body}"><a href="${escape(block.options.page ?? '')}" style="color:${MAIL.metal}">${text}</a></div>`
  }

  if (block.kind === 'toc' || block.kind === 'columns') {
    return `<div style="${body}">${text.replace(/\n/g, '<br />')}</div>`
  }

  return `<div style="${body}">${text}</div>`
}
