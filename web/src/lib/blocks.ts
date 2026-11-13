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
export type BlockFont = '--font-display' | '--font-body' | '--font-mono'

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
  /** The token of the face the block's own text is set in, when it does not take the page's. */
  font?: BlockFont
  /** Set when the block carries its own text look rather than inheriting the one around it. */
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
  /** Whether a table of contents shows its title. */
  showTitle?: boolean
  /** Whether a table of contents draws without its box. */
  bare?: boolean
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
  'align', 'size', 'width', 'wrap', 'leading', 'font', 'own', 'open', 'level', 'language', 'src', 'alt',
  'done', 'votes', 'assetId', 'name', 'url', 'mimeType', 'depth', 'view', 'description', 'image', 'page', 'placement',
  'showTitle', 'bare'
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

export interface Marks {
  bold?: boolean
  italic?: boolean
  code?: boolean
  strike?: boolean
  link?: string
}

/** One piece of a text block: a marked run, a mention pill or a line break. */
export type Run =
  | { text: string; marks?: Marks }
  | { ref: 'mention'; mark: '@' | '#'; label: string; id?: string }
  | { ref: 'break' }

export type Inline = Run[]

export type NodeKind = BlockKind | 'item' | 'column'

/** A block as the editor holds it: text as runs, children by id, or neither. */
export interface BlockNode {
  id: string
  kind: NodeKind
  inline: Inline | null
  children: string[] | null
  options: BlockOptions
}

export interface BlockTree {
  root: string[]
  nodes: Record<string, BlockNode>
}

export type ReferenceKind = 'npc' | 'item' | 'place' | 'session' | 'map'

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
const TEXTED: NodeKind[] = [
  'paragraph', 'heading', 'code', 'mermaid', 'html', 'table', 'poll', 'meeting',
  'image', 'video', 'audio', 'pdf', 'bookmark', 'embed', 'map', 'page', 'toggle'
]
const HOLDING: NodeKind[] = ['bullet', 'number', 'todo', 'item', 'quote', 'callout', 'toggle', 'columns', 'column']
const RAW: NodeKind[] = ['code', 'mermaid', 'html', 'table', 'poll', 'meeting', 'embed', 'map']

export function isListKind(kind: NodeKind): boolean {
  return (LISTED as NodeKind[]).includes(kind)
}

/** A kind whose node carries text as runs. */
export function isTextKind(kind: NodeKind): boolean {
  return TEXTED.includes(kind)
}

/** A kind whose node holds other nodes. */
export function isHoldingKind(kind: NodeKind): boolean {
  return HOLDING.includes(kind)
}

/** A text kind whose runs carry no marks, written as they are typed. */
export function isRawKind(kind: NodeKind): boolean {
  return RAW.includes(kind)
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

const CODE = /`([^`\n]+)`/y
const LINK = /\[([^\]\n]+)\]\(([^)\s]+)\)/y
const MENTION = /([@#])([\p{L}\p{N}_-]+)/uy
const BOLD = /(\*\*|__)(?=\S)([^\n]*?\S)\1/y
const STRIKE = /~~(?=\S)([^\n]*?\S)~~/y
const STAR = /\*(?=[^\s*])([^*\n]*[^\s*])\*/y
const UNDER = /_(?=[^\s_])([^_\n]*[^\s_])_/y

function isWord(char: string | undefined): boolean {
  return !!char && /[\p{L}\p{N}]/u.test(char)
}

function withMarks(text: string, marks: Marks): Run {
  const held: Marks = {}
  if (marks.bold) held.bold = true
  if (marks.italic) held.italic = true
  if (marks.code) held.code = true
  if (marks.strike) held.strike = true
  if (marks.link) held.link = marks.link
  return Object.keys(held).length > 0 ? { text, marks: held } : { text }
}

function sameMarks(one: Marks | undefined, two: Marks | undefined): boolean {
  const a = one ?? {}
  const b = two ?? {}
  return !!a.bold === !!b.bold && !!a.italic === !!b.italic && !!a.code === !!b.code && !!a.strike === !!b.strike && (a.link ?? '') === (b.link ?? '')
}

function readInline(text: string, marks: Marks, out: Inline): void {
  let at = 0
  let plain = ''
  const flush = () => {
    if (plain) out.push(withMarks(plain, marks))
    plain = ''
  }
  const match = (pattern: RegExp): RegExpExecArray | null => {
    pattern.lastIndex = at
    return pattern.exec(text)
  }

  while (at < text.length) {
    const char = text[at]
    const before = at > 0 ? text[at - 1] : undefined

    if (char === '\n') {
      flush()
      out.push({ ref: 'break' })
      at += 1
      continue
    }

    if (char === '`' && !marks.code) {
      const hit = match(CODE)
      if (hit) {
        flush()
        out.push(withMarks(hit[1], { ...marks, code: true }))
        at += hit[0].length
        continue
      }
    }

    if (char === '[' && !marks.code) {
      const hit = match(LINK)
      if (hit) {
        flush()
        const sigil = /^([@#])(\S.*)$/.exec(hit[1])
        if (sigil && !marks.link) {
          out.push({ ref: 'mention', mark: sigil[1] as '@' | '#', label: sigil[2].trim(), id: hit[2] })
        } else {
          readInline(hit[1], { ...marks, link: hit[2] }, out)
        }
        at += hit[0].length
        continue
      }
    }

    if ((char === '@' || char === '#') && !marks.code && (before === undefined || /\s/.test(before))) {
      const hit = match(MENTION)
      if (hit) {
        flush()
        out.push({ ref: 'mention', mark: hit[1] as '@' | '#', label: hit[2] })
        at += hit[0].length
        continue
      }
    }

    if (!marks.code) {
      if ((char === '*' || char === '_') && text[at + 1] === char && !marks.bold && (char === '*' || !isWord(before))) {
        const hit = match(BOLD)
        if (hit && (char === '*' || !isWord(text[at + hit[0].length]))) {
          flush()
          readInline(hit[2], { ...marks, bold: true }, out)
          at += hit[0].length
          continue
        }
      }
      if (char === '~' && text[at + 1] === '~' && !marks.strike) {
        const hit = match(STRIKE)
        if (hit) {
          flush()
          readInline(hit[1], { ...marks, strike: true }, out)
          at += hit[0].length
          continue
        }
      }
      if (char === '*' && !marks.italic) {
        const hit = match(STAR)
        if (hit) {
          flush()
          readInline(hit[1], { ...marks, italic: true }, out)
          at += hit[0].length
          continue
        }
      }
      if (char === '_' && !marks.italic && !isWord(before)) {
        const hit = match(UNDER)
        if (hit && !isWord(text[at + hit[0].length])) {
          flush()
          readInline(hit[1], { ...marks, italic: true }, out)
          at += hit[0].length
          continue
        }
      }
    }

    plain += char
    at += 1
  }

  flush()
}

/** Adjacent runs that carry the same marks, joined into one. */
export function getMergedInline(inline: Inline): Inline {
  const out: Inline = []
  for (const run of inline) {
    const last = out[out.length - 1]
    if (last && 'text' in last && 'text' in run && sameMarks(last.marks, run.marks)) {
      out[out.length - 1] = { ...last, text: last.text + run.text }
      continue
    }
    if ('text' in run && run.text === '') continue
    out.push(run)
  }
  return out
}

/** The runs a block's markdown text is made of: marks, mention pills and breaks. */
export function getInline(text: string): Inline {
  const out: Inline = []
  readInline(text, {}, out)
  return getMergedInline(out)
}

/** The markdown text that reads back into the same runs. */
export function getInlineMarkdown(inline: Inline): string {
  return getMergedInline(inline)
    .map((run) => {
      if ('ref' in run) {
        if (run.ref === 'break') return '\n'
        return run.id ? `[${run.mark}${run.label}](${run.id})` : `${run.mark}${run.label.replace(/\s+/g, '')}`
      }
      const marks = run.marks ?? {}
      const lead = /^\s*/.exec(run.text)?.[0] ?? ''
      const trail = /\s*$/.exec(run.text)?.[0] ?? ''
      let text = run.text.trim()
      if (!text) return run.text
      if (marks.code) text = `\`${text}\``
      if (marks.bold) text = `**${text}**`
      if (marks.italic) text = `_${text}_`
      if (marks.strike) text = `~~${text}~~`
      if (marks.link) text = `[${text}](${marks.link})`
      return `${lead}${text}${trail}`
    })
    .join('')
}

/** The runs as plain text, a mention as its sigil and label and a break as a newline. */
export function getInlineText(inline: Inline): string {
  return inline
    .map((run) => ('ref' in run ? (run.ref === 'break' ? '\n' : `${run.mark}${run.label}`) : run.text))
    .join('')
}

/** How far the caret can travel through the runs: a character each, a pill or a break one. */
export function getInlineLength(inline: Inline): number {
  return inline.reduce((sum, run) => sum + ('ref' in run ? 1 : run.text.length), 0)
}

/** The runs cut in two at an offset, a text run split where the offset falls inside it. */
export function getSplitInline(inline: Inline, offset: number): [Inline, Inline] {
  const left: Inline = []
  const right: Inline = []
  let at = 0
  for (const run of inline) {
    const length = 'ref' in run ? 1 : run.text.length
    if (at + length <= offset) left.push(run)
    else if (at >= offset) right.push(run)
    else if ('text' in run) {
      const cut = offset - at
      left.push(run.marks ? { text: run.text.slice(0, cut), marks: run.marks } : { text: run.text.slice(0, cut) })
      right.push(run.marks ? { text: run.text.slice(cut), marks: run.marks } : { text: run.text.slice(cut) })
    } else right.push(run)
    at += length
  }
  return [left, right]
}

/** The runs between two offsets. */
export function getSlicedInline(inline: Inline, from: number, to: number): Inline {
  const [head] = getSplitInline(inline, to)
  const [, middle] = getSplitInline(head, from)
  return middle
}

/** The runs with a mark set over a range when any run there lacks it, or taken off when every run carries it. */
export function getMarkedInline(inline: Inline, from: number, to: number, mark: keyof Marks, link = ''): Inline {
  const [head, tail] = getSplitInline(inline, to)
  const [left, middle] = getSplitInline(head, from)
  const texts = middle.filter((run): run is { text: string; marks?: Marks } => 'text' in run)
  const every = texts.length > 0 && texts.every((run) => (mark === 'link' ? !!run.marks?.link : !!run.marks?.[mark]))
  const marked = middle.map((run) => {
    if ('ref' in run) return run
    const marks: Marks = { ...run.marks }
    if (every) delete marks[mark]
    else if (mark === 'link') marks.link = link
    else marks[mark] = true
    return withMarks(run.text, marks)
  })
  return getMergedInline([...left, ...marked, ...tail])
}

function getDepth(lead: string): number {
  return Math.floor(lead.replace(/\t/g, '  ').length / 2)
}

function getListOptions(lead: string, held: BlockOptions = {}): BlockOptions {
  const depth = getDepth(lead)
  return depth > 0 ? { ...held, depth } : held
}

const OPENER = /^(#{1,6}\s|>|```|\s*[-*+]\s|\s*\d+[.)]\s|!\[|\[toc\]|\[(video|pdf|page):)/

/** Lines of one block joined: a line ending in two spaces keeps its break, any other joins with a space. */
function getJoinedLines(raw: string[]): string {
  return raw.reduce((out, line, index) => (index === 0 ? line.trim() : `${out}${/\S {2,}$/.test(raw[index - 1]) ? '\n' : ' '}${line.trim()}`), '')
}

export function getBlocksFromMarkdown(markdown: string): Block[] {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n')
  const blocks: Block[] = []
  let at = 0

  const continued = (first: string): string => {
    const raw = [first]
    while (/\S {2,}$/.test(raw[raw.length - 1]) && at < lines.length && lines[at].trim() !== '' && !OPENER.test(lines[at])) {
      raw.push(lines[at])
      at += 1
    }
    return getJoinedLines(raw)
  }

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
      at += 1
      blocks.push(getBlock('todo', continued(task[3]), getListOptions(task[1], { done: task[2].toLowerCase() === 'x' })))
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

    if (line.startsWith('>')) {
      const stripped: string[] = []
      while (at < lines.length && lines[at].startsWith('>')) {
        stripped.push(lines[at].replace(/^>\s?/, ''))
        at += 1
      }
      const callout = /^\s*\[!\w+\]\s*(.*)$/.exec(stripped[0])
      if (callout) stripped[0] = callout[1]
      const paragraphs: string[][] = [[]]
      for (const one of stripped) {
        if (one.trim() === '') {
          if (paragraphs[paragraphs.length - 1].length > 0) paragraphs.push([])
        } else {
          paragraphs[paragraphs.length - 1].push(one)
        }
      }
      const text = paragraphs.filter((run) => run.length > 0).map(getJoinedLines).join('\n\n')
      blocks.push(getBlock(callout ? 'callout' : 'quote', text))
      continue
    }

    const bullet = /^(\s*)[-*+]\s+(.*)$/.exec(line)
    if (bullet) {
      at += 1
      blocks.push(getBlock('bullet', continued(bullet[2]), getListOptions(bullet[1])))
      continue
    }

    const number = /^(\s*)\d+[.)]\s+(.*)$/.exec(line)
    if (number) {
      at += 1
      blocks.push(getBlock('number', continued(number[2]), getListOptions(number[1])))
      continue
    }

    const run: string[] = [line]
    at += 1
    while (at < lines.length && lines[at].trim() !== '' && !OPENER.test(lines[at])) {
      run.push(lines[at])
      at += 1
    }
    blocks.push(getBlock('paragraph', getJoinedLines(run)))
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

/** The lines of a text whose breaks end in two spaces, so they survive as breaks. */
function getBrokenLines(text: string): string[] {
  const lines = text.split('\n')
  return lines.map((line, index) => (index < lines.length - 1 ? `${line}  ` : line))
}

/** The lines a quote or callout writes: broken lines per paragraph, a bare line between paragraphs. */
function getQuoteLines(text: string): string[] {
  return text.split('\n\n').flatMap((paragraph, index) => (index === 0 ? getBrokenLines(paragraph) : ['', ...getBrokenLines(paragraph)]))
}

export function getBlockMarkdown(block: Block): string {
  const plain = Object.keys(getKept(block)).length === 0

  if (block.kind === 'divider') return '---'
  if (block.kind === 'toc' && plain) return '[toc]'

  const own: BlockKind[] = ['table', 'toggle', 'poll', 'audio', 'bookmark', 'mermaid', 'html', 'columns', 'embed', 'meeting', 'map', 'file']
  if (!plain || own.includes(block.kind) || (block.kind === 'heading' && block.text.includes('\n'))) return getFence(block, getHeld(block))

  if (block.kind === 'image') return `![${(block.options.alt ?? '').replace(/\s*\n\s*/g, ' ')}](${block.options.src ?? ''})`
  if (block.kind === 'code') return `\`\`\`${block.options.language ?? ''}\n${block.text}\n\`\`\``
  if (block.kind === 'todo') return `${getLead(block)}- [${block.options.done ? 'x' : ' '}] ${getBrokenLines(block.text).join(`\n${getLead(block)}  `)}`
  if (LINKED.includes(block.kind)) {
    const address = block.kind === 'page' ? (block.options.page ?? '') : (block.options.src ?? '')
    return `[${block.kind}: ${block.text}](${address})`
  }

  if (block.kind === 'heading') return `${'#'.repeat(Math.min(Math.max(block.options.level ?? 1, 1), 6))} ${block.text}`
  if (block.kind === 'quote') return getQuoteLines(block.text).map((line) => (line === '' ? '>' : `> ${line}`)).join('\n')
  if (block.kind === 'callout') {
    return getQuoteLines(block.text)
      .map((line, index) => (index === 0 ? `> [!note] ${line}` : line === '' ? '>' : `> ${line}`))
      .join('\n')
  }
  if (block.kind === 'bullet') return `${getLead(block)}- ${getBrokenLines(block.text).join(`\n${getLead(block)}  `)}`
  if (block.kind === 'number') return `${getLead(block)}1. ${getBrokenLines(block.text).join(`\n${getLead(block)}  `)}`
  return getBrokenLines(block.text).join('\n')
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
    for (const run of getInline(block.text)) {
      if (!('ref' in run) || run.ref !== 'mention') continue
      const key = `${run.mark}${run.label.toLowerCase()}`
      const held = found.get(key)
      if (held && held.id) continue
      found.set(key, run.id ? { mark: run.mark, label: run.label, id: run.id } : { mark: run.mark, label: run.label })
    }
  }

  return [...found.values()]
}

export function isBlockKind(value: string): value is BlockKind {
  return (KINDS as string[]).includes(value)
}

export function getNode(kind: NodeKind, inline: Inline | null = null, children: string[] | null = null, options: BlockOptions = {}, id = getBlockId()): BlockNode {
  return { id, kind, inline, children, options }
}

/**
 * The flat blocks as the tree the editor works on: list items nested by their
 * depth under one list node, a quote or callout holding a paragraph per run
 * of its text, a toggle holding its summary and the blocks of its body, and a
 * columns block holding a column per part. Every other block is one node whose
 * runs are its text.
 */
export function getTree(blocks: Block[]): BlockTree {
  const tree: BlockTree = { root: [], nodes: {} }
  const lists: { id: string; depth: number; kind: BlockKind; last: string }[] = []

  const put = (node: BlockNode): string => {
    tree.nodes[node.id] = node
    return node.id
  }
  const paragraph = (text: string): string => put(getNode('paragraph', getInline(text)))
  const grown = (markdown: string): string[] => {
    const sub = getTree(getBlocksFromMarkdown(markdown))
    Object.assign(tree.nodes, sub.nodes)
    return sub.root.length > 0 ? sub.root : [paragraph('')]
  }

  for (const block of blocks) {
    if (isListKind(block.kind)) {
      let depth = Math.max(0, block.options.depth ?? 0)
      while (lists.length > 0 && lists[lists.length - 1].depth > depth) lists.pop()
      depth = Math.min(depth, lists.length > 0 ? lists[lists.length - 1].depth + 1 : 0)
      let top = lists[lists.length - 1]
      if (top && top.depth === depth && top.kind !== block.kind) {
        lists.pop()
        top = lists[lists.length - 1]
      }
      if (!top || top.depth < depth) {
        const list = put(getNode(block.kind, null, []))
        if (top) tree.nodes[top.last].children?.push(list)
        else tree.root.push(list)
        lists.push({ id: list, depth, kind: block.kind, last: '' })
        top = lists[lists.length - 1]
      }
      const { depth: _depth, ...rest } = block.options
      const item = put(getNode('item', null, [paragraph(block.text)], rest, block.id))
      tree.nodes[top.id].children?.push(item)
      top.last = item
      continue
    }

    lists.length = 0

    if (block.kind === 'quote' || block.kind === 'callout') {
      tree.root.push(put(getNode(block.kind, null, block.text.split('\n\n').map(paragraph), block.options, block.id)))
      continue
    }
    if (block.kind === 'toggle') {
      const [summary = '', ...body] = block.text.split('\n')
      tree.root.push(put(getNode('toggle', getInline(summary), grown(body.join('\n')), block.options, block.id)))
      continue
    }
    if (block.kind === 'columns') {
      const columns = getColumns(block.text).map((column) => put(getNode('column', null, grown(column))))
      tree.root.push(put(getNode('columns', null, columns, block.options, block.id)))
      continue
    }
    if (block.kind === 'image') {
      const { alt, ...rest } = block.options
      tree.root.push(put(getNode('image', getInline(alt ?? ''), null, rest, block.id)))
      continue
    }
    tree.root.push(put(getNode(block.kind, isTextKind(block.kind) ? getInline(block.text) : null, null, block.options, block.id)))
  }

  return tree
}

/** The tree back as the flat blocks the document stores, list items carrying their depth. */
export function getTreeBlocks(tree: BlockTree, ids: string[] = tree.root, depth = 0): Block[] {
  const out: Block[] = []

  for (const id of ids) {
    const node = tree.nodes[id]
    if (!node) continue

    if (isListKind(node.kind)) {
      for (const itemId of node.children ?? []) {
        const item = tree.nodes[itemId]
        if (!item) continue
        const kids = (item.children ?? []).map((one) => tree.nodes[one]).filter((one): one is BlockNode => !!one)
        const text = kids.find((one) => one.kind === 'paragraph')
        out.push({
          id: item.id,
          kind: node.kind as BlockKind,
          text: text ? getInlineMarkdown(text.inline ?? []) : '',
          options: depth > 0 ? { ...item.options, depth } : item.options
        })
        for (const kid of kids) {
          if (kid !== text) out.push(...getTreeBlocks(tree, [kid.id], depth + 1))
        }
      }
      continue
    }

    if (node.kind === 'item' || node.kind === 'column') {
      out.push(...getTreeBlocks(tree, node.children ?? [], depth))
      continue
    }

    out.push(getNodeBlock(tree, node))
  }

  return out
}

function getNodeBlock(tree: BlockTree, node: BlockNode): Block {
  const options = { ...node.options }
  const children = (node.children ?? []).map((one) => tree.nodes[one]).filter((one): one is BlockNode => !!one)

  if (node.kind === 'quote' || node.kind === 'callout') {
    return { id: node.id, kind: node.kind, text: children.map((one) => getInlineMarkdown(one.inline ?? [])).join('\n\n'), options }
  }
  if (node.kind === 'toggle') {
    const summary = getInlineMarkdown(node.inline ?? []).replace(/\n/g, ' ')
    return { id: node.id, kind: 'toggle', text: `${summary}\n${getDocumentMarkdown({ blocks: getTreeBlocks(tree, node.children ?? []) })}`, options }
  }
  if (node.kind === 'columns') {
    return {
      id: node.id,
      kind: 'columns',
      text: children.map((column) => getDocumentMarkdown({ blocks: getTreeBlocks(tree, column.children ?? []) })).join('\n---\n'),
      options
    }
  }
  if (node.kind === 'image') {
    const alt = getInlineText(node.inline ?? [])
    if (alt) options.alt = alt
    else delete options.alt
    return { id: node.id, kind: 'image', text: '', options }
  }
  return { id: node.id, kind: node.kind as BlockKind, text: node.inline ? getInlineMarkdown(node.inline) : '', options }
}

export function getParentId(tree: BlockTree, id: string): string | null {
  for (const node of Object.values(tree.nodes)) {
    if (node.children?.includes(id)) return node.id
  }
  return null
}

export function getSiblingIds(tree: BlockTree, parentId: string | null): string[] {
  return parentId === null ? tree.root : (tree.nodes[parentId]?.children ?? [])
}

export function getLocation(tree: BlockTree, id: string): { parentId: string | null; index: number } | null {
  const rootIndex = tree.root.indexOf(id)
  if (rootIndex >= 0) return { parentId: null, index: rootIndex }
  const parentId = getParentId(tree, id)
  if (parentId === null) return null
  return { parentId, index: getSiblingIds(tree, parentId).indexOf(id) }
}

/** The ids from the root down to the node, the node last. */
export function getPath(tree: BlockTree, id: string): string[] | null {
  if (!tree.nodes[id]) return null
  const trail = [id]
  let current = id
  while (!tree.root.includes(current)) {
    const parent = getParentId(tree, current)
    if (parent === null) return null
    trail.unshift(parent)
    current = parent
  }
  return trail
}

export function getDescendantIds(tree: BlockTree, id: string): string[] {
  const out: string[] = []
  const walk = (current: string) => {
    for (const child of tree.nodes[current]?.children ?? []) {
      out.push(child)
      walk(child)
    }
  }
  walk(id)
  return out
}

/** The next or previous node in order, climbing out of a parent when there is no sibling left. */
export function getAdjacentId(tree: BlockTree, id: string, by: -1 | 1): string | null {
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

/** The siblings between two nodes at the depth where their paths part. */
export function getRangeIds(tree: BlockTree, from: string, to: string): string[] {
  const one = getPath(tree, from)
  const two = getPath(tree, to)
  if (!one || !two) return []
  const limit = Math.min(one.length, two.length)
  let depth = 0
  while (depth < limit && one[depth] === two[depth]) depth += 1
  if (depth >= limit) depth = limit - 1
  const start = one[depth]
  const end = two[depth]
  if (start === end) return [start]
  const siblings = getSiblingIds(tree, depth === 0 ? null : one[depth - 1])
  const a = siblings.indexOf(start)
  const b = siblings.indexOf(end)
  if (a < 0 || b < 0) return []
  return siblings.slice(Math.min(a, b), Math.max(a, b) + 1)
}

/** Every text node under the ids, in reading order. */
export function getTextIds(tree: BlockTree, ids: string[] = tree.root): string[] {
  const out: string[] = []
  const walk = (list: string[]) => {
    for (const id of list) {
      const node = tree.nodes[id]
      if (!node) continue
      if (node.inline) out.push(id)
      walk(node.children ?? [])
    }
  }
  walk(ids)
  return out
}

/** Puts the node in the tree under the parent at the index, unlinking it from where it was. */
export function putNode(tree: BlockTree, node: BlockNode, parentId: string | null, index: number): void {
  tree.nodes[node.id] = node
  unlinkNode(tree, node.id)
  const siblings = getSiblingIds(tree, parentId)
  siblings.splice(Math.max(0, Math.min(index, siblings.length)), 0, node.id)
}

function unlinkNode(tree: BlockTree, id: string): void {
  const rootIndex = tree.root.indexOf(id)
  if (rootIndex >= 0) {
    tree.root.splice(rootIndex, 1)
    return
  }
  for (const node of Object.values(tree.nodes)) {
    const index = node.children?.indexOf(id) ?? -1
    if (index >= 0) node.children?.splice(index, 1)
  }
}

/** Takes the node and everything under it out of the tree. */
export function deleteNode(tree: BlockTree, id: string): void {
  if (!tree.nodes[id]) return
  const dropped = [id, ...getDescendantIds(tree, id)]
  unlinkNode(tree, id)
  for (const one of dropped) delete tree.nodes[one]
}

/** The text look a node reads: its own when it carries one, else the nearest holder's, else the page's. */
export function getLook(tree: BlockTree, id: string): { font?: BlockFont; size?: BlockSize; leading?: BlockLeading } {
  const path = getPath(tree, id) ?? []
  for (let step = path.length - 1; step >= 0; step -= 1) {
    const node = tree.nodes[path[step]]
    if (!node?.options.own) continue
    return { font: node.options.font, size: node.options.size, leading: node.options.leading }
  }
  return {}
}

/** The anchor a heading is reached by, made from its own words. */
export function getSlug(text: string): string {
  return getInlineText(getInline(text))
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
  return getInline(text)
    .map((run) => {
      if ('ref' in run) {
        if (run.ref === 'break') return '<br />'
        return `<span class="dnd-ref dnd-ref-${run.mark === '@' ? 'who' : 'tag'}"${run.id ? ` data-id="${escape(run.id)}"` : ''}>${run.mark}${escape(run.label)}</span>`
      }
      const marks = run.marks ?? {}
      let html = escape(run.text)
      if (marks.code) html = `<code>${html}</code>`
      if (marks.bold) html = `<strong>${html}</strong>`
      if (marks.italic) html = `<em>${html}</em>`
      if (marks.strike) html = `<s>${html}</s>`
      if (marks.link) html = `<a href="${escape(marks.link)}">${html}</a>`
      return html
    })
    .join('')
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
      return `<blockquote${style}>${block.text.split('\n\n').map((one) => `<p>${getInlineHtml(one)}</p>`).join('')}</blockquote>`
    case 'callout':
      return `<aside class="dnd-callout"${style}>${block.text.split('\n\n').map((one) => `<p>${getInlineHtml(one)}</p>`).join('')}</aside>`
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
      return `<details${block.options.open ? ' open' : ''}><summary>${getInlineHtml(head)}</summary>${getDocumentHtml(getDocumentFromMarkdown(rest.join('\n')))}</details>`
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

  if (block.kind === 'toggle') {
    const [head, ...rest] = block.text.split('\n')
    return `<div style="${body}"><strong style="color:${MAIL.metal}">${escape(head)}</strong><br />${escape(rest.join(' '))}</div>`
  }

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
