import { describe, it, expect } from 'vitest'
import {
  getBlock,
  getBlockMarkdown,
  getBlocksFromMarkdown,
  getColumns,
  getDocument,
  getDocumentHtml,
  getDocumentMarkdown,
  getEmptyDocument,
  getHeadingNumbers,
  getMeeting,
  getReferences,
  getSlug,
  getInline,
  getInlineMarkdown,
  getInlineText,
  getInlineLength,
  getTree,
  getTreeBlocks,
  getLook,
  getPath,
  getRangeIds,
  getAdjacentId,
  putNode,
  getNode,
  deleteNode,
  getTextIds
} from './blocks'

describe('reading markdown into blocks', () => {
  it('reads a heading at the depth its hashes name', () => {
    const [block] = getBlocksFromMarkdown('### The Sunken Barrow')
    expect(block.kind).toBe('heading')
    expect(block.options.level).toBe(3)
    expect(block.text).toBe('The Sunken Barrow')
  })

  it('reads a fence with its language and keeps the body raw', () => {
    const [block] = getBlocksFromMarkdown('```json\n{ "a": 1 }\n```')
    expect(block.kind).toBe('code')
    expect(block.options.language).toBe('json')
    expect(block.text).toBe('{ "a": 1 }')
  })

  it('tells a callout from a plain quote', () => {
    const [callout, quote] = getBlocksFromMarkdown('> [!note] Mind the seal\n\n> Maelis said nothing')
    expect(callout.kind).toBe('callout')
    expect(callout.text).toBe('Mind the seal')
    expect(quote.kind).toBe('quote')
    expect(quote.text).toBe('Maelis said nothing')
  })

  it('reads a picture into its own block', () => {
    const [block] = getBlocksFromMarkdown('![The keep](file:maps/keep.png)')
    expect(block.kind).toBe('image')
    expect(block.options.src).toBe('file:maps/keep.png')
    expect(block.options.alt).toBe('The keep')
  })

  it('joins a wrapped paragraph into one run', () => {
    const blocks = getBlocksFromMarkdown('The party took\nthe north road.')
    expect(blocks).toHaveLength(1)
    expect(blocks[0].text).toBe('The party took the north road.')
  })

  it('never hands back an empty document', () => {
    expect(getDocument('').blocks).toHaveLength(1)
    expect(getDocument(null).blocks).toHaveLength(1)
    expect(getEmptyDocument().blocks[0].kind).toBe('paragraph')
  })
})

describe('a line that only looks like a block', () => {
  it('reads an unfinished picture as a paragraph and moves on', () => {
    const blocks = getBlocksFromMarkdown('![the cellar\nstairs](/api/asset/a/data)\n\nAfter.')
    expect(blocks.map((block) => block.kind)).toEqual(['paragraph', 'paragraph'])
    expect(blocks[0].text).toBe('![the cellar stairs](/api/asset/a/data)')
    expect(blocks[1].text).toBe('After.')
  })

  it('writes a caption that holds a line break on one line', () => {
    const block = getBlock('image', '', { alt: 'the cellar\nstairs', src: '/api/asset/a/data' })
    const [read] = getBlocksFromMarkdown(getBlockMarkdown(block))
    expect(read.kind).toBe('image')
    expect(read.options.alt).toBe('the cellar stairs')
  })
})

describe('writing blocks back out', () => {
  it('round trips every kind through markdown', () => {
    const source = [
      '# Blackwood',
      '',
      'The party took the north road.',
      '',
      '- a lantern',
      '',
      '1. the seal',
      '',
      '> Maelis said nothing',
      '',
      '> [!note] Mind the seal',
      '',
      '```json',
      '{ "a": 1 }',
      '```',
      '',
      '---',
      '',
      '![The keep](file:maps/keep.png)'
    ].join('\n')

    expect(getDocumentMarkdown(getDocument(source))).toBe(source)
  })

  it('reads a stored json document straight back', () => {
    const document = getDocument('# Blackwood')
    expect(getDocument(JSON.stringify(document)).blocks[0].text).toBe('Blackwood')
  })
})

describe('references written in the text', () => {
  it('collects an at mention and a hash tag once each', () => {
    const document = getDocument('Met @Maelis at #blackwood. @Maelis knew of #blackwood already.')
    expect(getReferences(document)).toEqual([
      { mark: '@', label: 'Maelis' },
      { mark: '#', label: 'blackwood' }
    ])
  })

  it('leaves a hash that opens a heading alone', () => {
    expect(getReferences(getDocument('# Blackwood'))).toEqual([])
  })

  it('takes a mention that opens a line', () => {
    expect(getReferences(getDocument('@Maelis waited.'))).toEqual([{ mark: '@', label: 'Maelis' }])
  })
})

describe('nested lists', () => {
  it('reads two leading spaces as one level of depth', () => {
    const [top, under, deeper] = getBlocksFromMarkdown('- a lantern\n  - its oil\n    1. a wick')
    expect(top.options.depth).toBeUndefined()
    expect(under.kind).toBe('bullet')
    expect(under.options.depth).toBe(1)
    expect(deeper.kind).toBe('number')
    expect(deeper.options.depth).toBe(2)
  })

  it('writes depth back as leading spaces on every list kind', () => {
    const source = '- a lantern\n\n  - its oil\n\n    1. a wick\n\n  - [x] lit'
    expect(getDocumentMarkdown(getDocument(source))).toBe(source)
  })

  it('keeps a heading level and a list depth when the block also carries its own look', () => {
    const document = getDocument('## Blackwood')
    document.blocks[0].options = { ...document.blocks[0].options, align: 'center' }
    const back = getDocument(getDocumentMarkdown(document))
    expect(back.blocks[0].options.level).toBe(2)
    expect(back.blocks[0].options.align).toBe('center')
  })
})

describe('the fenced kinds', () => {
  it.each([
    ['mermaid', 'graph TD; A-->B'],
    ['html', '<p>Mind the seal</p>'],
    ['embed', 'https://example.org/frame'],
    ['meeting', 'Date: 2026-09-11\nAttendees: @Maelis\nNotes: The seal held.'],
    ['map', 'https://www.openstreetmap.org/export/embed.html?bbox=1,2,3,4']
  ])('reads a %s fence and writes it back', (kind, body) => {
    const source = `\`\`\`${kind}\n${body}\n\`\`\``
    const [block] = getBlocksFromMarkdown(source)
    expect(block.kind).toBe(kind)
    expect(block.text).toBe(body)
    expect(getDocumentMarkdown(getDocument(source))).toBe(source)
  })

  it('reads columns split on a rule line', () => {
    const source = '```columns\n# Left\n\nOne\n---\n# Right\n\nTwo\n```'
    const [block] = getBlocksFromMarkdown(source)
    expect(block.kind).toBe('columns')
    expect(getColumns(block.text)).toEqual(['# Left\n\nOne', '# Right\n\nTwo'])
    expect(getDocumentMarkdown(getDocument(source))).toBe(source)
  })

  it('takes a meeting apart into its lines', () => {
    expect(getMeeting('Date: 2026-09-11\nAttendees: Maelis, Tam\nNotes: The seal held.\nNothing more.')).toEqual({
      date: '2026-09-11',
      attendees: 'Maelis, Tam',
      notes: 'The seal held.\nNothing more.'
    })
  })
})

describe('the directive and link kinds', () => {
  it('reads a toc directive line', () => {
    const [block] = getBlocksFromMarkdown('[toc]')
    expect(block.kind).toBe('toc')
    expect(getDocumentMarkdown(getDocument('[toc]'))).toBe('[toc]')
  })

  it('reads a video link line', () => {
    const source = '[video: The ambush](file:clips/ambush.webm)'
    const [block] = getBlocksFromMarkdown(source)
    expect(block.kind).toBe('video')
    expect(block.text).toBe('The ambush')
    expect(block.options.src).toBe('file:clips/ambush.webm')
    expect(getDocumentMarkdown(getDocument(source))).toBe(source)
  })

  it('reads a pdf link line', () => {
    const source = '[pdf: The charter](file:docs/charter.pdf)'
    const [block] = getBlocksFromMarkdown(source)
    expect(block.kind).toBe('pdf')
    expect(block.options.src).toBe('file:docs/charter.pdf')
    expect(getDocumentMarkdown(getDocument(source))).toBe(source)
  })

  it('reads a page link line by id', () => {
    const source = '[page: The Sunken Barrow](abc123)'
    const [block] = getBlocksFromMarkdown(source)
    expect(block.kind).toBe('page')
    expect(block.text).toBe('The Sunken Barrow')
    expect(block.options.page).toBe('abc123')
    expect(getDocumentMarkdown(getDocument(source))).toBe(source)
  })

  it('keeps a media read view in the fence', () => {
    const document = getDocument('[video: The ambush](file:clips/ambush.webm)')
    document.blocks[0].options = { ...document.blocks[0].options, view: 'link' }
    const back = getDocument(getDocumentMarkdown(document))
    expect(back.blocks[0].kind).toBe('video')
    expect(back.blocks[0].options.src).toBe('file:clips/ambush.webm')
    expect(back.blocks[0].options.view).toBe('link')
  })
})

describe('the file kind', () => {
  const attached = { assetId: 'a1', name: 'The charter.pdf', url: '/api/asset/a1/data', mimeType: 'application/pdf' }

  it('writes the four values it was attached with into a file fence, in the order Mar writes them', () => {
    expect(getBlockMarkdown(getBlock('file', '', attached))).toBe(
      '```file {"assetId":"a1","name":"The charter.pdf","url":"/api/asset/a1/data","mimeType":"application/pdf"}\n\n```'
    )
  })

  it('reads the fence Mar writes back into the same block', () => {
    const [block] = getBlocksFromMarkdown(
      '```file {"assetId":"a1","name":"The charter.pdf","url":"/api/asset/a1/data","mimeType":"application/pdf"}\n```'
    )
    expect(block.kind).toBe('file')
    expect(block.text).toBe('')
    expect(block.options).toEqual(attached)
  })

  it('round trips through markdown with every value kept', () => {
    const document = { blocks: [getBlock('paragraph', 'The deed is below.'), getBlock('file', '', attached)] }
    const back = getDocument(getDocumentMarkdown(document))
    expect(back.blocks.map((block) => block.kind)).toEqual(['paragraph', 'file'])
    expect(back.blocks[1].options).toEqual(attached)
    expect(getDocumentMarkdown(back)).toBe(getDocumentMarkdown(document))
  })

  it('draws as a link to its file in html', () => {
    expect(getDocumentHtml({ blocks: [getBlock('file', '', attached)] })).toContain(
      '<a class="dnd-file" href="/api/asset/a1/data">The charter.pdf</a>'
    )
  })
})

describe('heading numbers', () => {
  it('counts an outline and restarts under a shallower heading', () => {
    const { blocks } = getDocument('# One\n\n## One one\n\n## One two\n\n# Two\n\n## Two one')
    const numbers = getHeadingNumbers(blocks)
    expect(blocks.map((block) => numbers[block.id])).toEqual(['1.', '1.1', '1.2', '2.', '2.1'])
  })

  it('makes a slug a heading is reached by', () => {
    expect(getSlug('The Sunken Barrow!')).toBe('the-sunken-barrow')
  })
})

describe('the document as html', () => {
  it('nests list items by depth and numbers headings when asked', () => {
    const html = getDocumentHtml(getDocument('# One\n\n- a\n\n  - b\n\n- c'), true)
    expect(html).toContain('<h1 id="one">1. One</h1>')
    expect(html).toContain('<ul>\n<li>a</li>\n<ul>\n<li>b</li>\n</ul>\n<li>c</li>\n</ul>')
  })

  it('draws every new kind in its own element', () => {
    const html = getDocumentHtml(
      getDocument(
        [
          '```mermaid\ngraph TD; A-->B\n```',
          '```html\n<b>raw</b>\n```',
          '[toc]',
          '```toc {"placement":"right"}\n\n```',
          '```columns\nLeft\n---\nRight\n```',
          '[video: clip](v.webm)',
          '[pdf: doc](d.pdf)',
          '```embed\nhttps://example.org\n```',
          '```meeting\nDate: today\nAttendees: us\nNotes: none\n```',
          '```map\nhttps://example.org/map\n```',
          '[page: Sub](id1)'
        ].join('\n\n')
      )
    )
    expect(html).toContain('<pre class="mermaid">')
    expect(html).toContain('<b>raw</b>')
    expect(html).toContain('<nav class="dnd-toc">')
    expect(html).toContain('<nav class="dnd-toc dnd-toc-right">')
    expect(html).toContain('<div class="dnd-column"><p>Left</p></div>')
    expect(html).toContain('<video controls src="v.webm">')
    expect(html).toContain('type="application/pdf"')
    expect(html).toContain('<iframe src="https://example.org"')
    expect(html).toContain('<aside class="dnd-meeting">')
    expect(html).toContain('<iframe src="https://example.org/map"')
    expect(html).toContain('<a class="dnd-page" href="id1">Sub</a>')
  })
})

describe('the runs a text is made of', () => {
  it('reads marks, a link, a pill and a break and writes them back the same', () => {
    const text = 'Met **@Maelis** at _#blackwood_, see [the seal](https://x.y) and `ward`  \n~~gone~~ [@Tam](npc-2)'
    const runs = getInline(text)
    expect(runs).toEqual([
      { text: 'Met ' },
      { ref: 'mention', mark: '@', label: 'Maelis' },
      { text: ' at ' },
      { ref: 'mention', mark: '#', label: 'blackwood' },
      { text: ', see ' },
      { text: 'the seal', marks: { link: 'https://x.y' } },
      { text: ' and ' },
      { text: 'ward', marks: { code: true } },
      { text: '  ' },
      { ref: 'break' },
      { text: 'gone', marks: { strike: true } },
      { text: ' ' },
      { ref: 'mention', mark: '@', label: 'Tam', id: 'npc-2' }
    ])
    expect(getInlineMarkdown(runs)).toBe('Met @Maelis at #blackwood, see [the seal](https://x.y) and `ward`  \n~~gone~~ [@Tam](npc-2)')
  })

  it('nests bold inside italic and keeps the whitespace outside the marks', () => {
    const runs = getInline('a _b **c** d_ e')
    expect(runs).toEqual([{ text: 'a ' }, { text: 'b ', marks: { italic: true } }, { text: 'c', marks: { italic: true, bold: true } }, { text: ' d', marks: { italic: true } }, { text: ' e' }])
    expect(getInlineMarkdown([{ text: 'a ' }, { text: ' bold ', marks: { bold: true } }, { text: 'z' }])).toBe('a  **bold** z')
  })

  it('leaves an underscore inside a word and a sigil inside a word alone', () => {
    expect(getInline('snake_case_name and mail@host')).toEqual([{ text: 'snake_case_name and mail@host' }])
  })

  it('measures a pill and a break as one step each', () => {
    const runs = getInline('ab @Tam\ncd')
    expect(getInlineLength(runs)).toBe(7)
    expect(getInlineText(runs)).toBe('ab @Tam\ncd')
  })
})

describe('a break inside a block', () => {
  it('survives a paragraph, a list item and a quote through markdown', () => {
    const source = 'one  \ntwo\n\n- first  \n  second\n\n> quoted  \n> on\n\n> [!note] mind  \n> this'
    const blocks = getBlocksFromMarkdown(source)
    expect(blocks.map((block) => block.text)).toEqual(['one\ntwo', 'first\nsecond', 'quoted\non', 'mind\nthis'])
    expect(getDocumentMarkdown({ blocks })).toBe(source)
  })

  it('keeps a quote of two paragraphs apart from a break', () => {
    const [quote] = getBlocksFromMarkdown('> a\n>\n> b')
    expect(quote.text).toBe('a\n\nb')
    expect(getBlockMarkdown(quote)).toBe('> a\n>\n> b')
  })

  it('fences a heading that holds one, since a heading has one line', () => {
    const written = getBlockMarkdown(getBlock('heading', 'a\nb', { level: 2 }))
    expect(written).toBe('```heading {"level":2}\na\nb\n```')
    expect(getBlocksFromMarkdown(written)[0].text).toBe('a\nb')
  })
})

describe('the tree the editor works on', () => {
  const source = [
    '# Blackwood',
    '',
    'The party took **the north road**.',
    '',
    '- a lantern',
    '',
    '  - its oil',
    '',
    '    1. a wick',
    '',
    '  - [x] lit',
    '',
    '- more',
    '',
    '> said so',
    '>',
    '> and more',
    '',
    '```toggle {"open":true}',
    'What lies beneath',
    'A **cellar**.',
    '',
    '- stairs',
    '```',
    '',
    '```columns',
    'Left',
    '---',
    '## Right',
    '```',
    '',
    '![The keep](file:maps/keep.png)',
    '',
    '---'
  ].join('\n')

  it('nests list items by depth, holds paragraphs in a quote and blocks in a toggle and a column', () => {
    const tree = getTree(getDocument(source).blocks)
    const kinds = tree.root.map((id) => tree.nodes[id].kind)
    expect(kinds).toEqual(['heading', 'paragraph', 'bullet', 'quote', 'toggle', 'columns', 'image', 'divider'])
    const list = tree.nodes[tree.root[2]]
    expect(list.children).toHaveLength(2)
    const first = tree.nodes[list.children![0]]
    expect(first.kind).toBe('item')
    expect(first.children!.map((id) => tree.nodes[id].kind)).toEqual(['paragraph', 'bullet', 'todo'])
    const nested = tree.nodes[first.children![1]]
    const oil = tree.nodes[nested.children![0]]
    expect(oil.children!.map((id) => tree.nodes[id].kind)).toEqual(['paragraph', 'number'])
    const quote = tree.nodes[tree.root[3]]
    expect(quote.children!.map((id) => getInlineText(tree.nodes[id].inline!))).toEqual(['said so', 'and more'])
    const toggle = tree.nodes[tree.root[4]]
    expect(getInlineText(toggle.inline!)).toBe('What lies beneath')
    expect(toggle.children!.map((id) => tree.nodes[id].kind)).toEqual(['paragraph', 'bullet'])
    const columns = tree.nodes[tree.root[5]]
    expect(columns.children!.map((id) => tree.nodes[id].kind)).toEqual(['column', 'column'])
    expect(tree.nodes[tree.nodes[columns.children![1]].children![0]].kind).toBe('heading')
    expect(getInlineText(tree.nodes[tree.root[6]].inline!)).toBe('The keep')
  })

  it('flattens back to the same blocks and the same markdown', () => {
    const blocks = getDocument(source).blocks
    const again = getTreeBlocks(getTree(blocks))
    expect(again.map((block) => [block.kind, block.text, block.options])).toEqual(blocks.map((block) => [block.kind, block.text, block.options]))
    expect(getDocumentMarkdown({ blocks: again })).toBe(source)
  })

  it('keeps the item id as the block id and reads a look up through the holders', () => {
    const blocks = getDocument('- one\n\n  - two').blocks
    const tree = getTree(blocks)
    expect(tree.nodes[blocks[0].id].kind).toBe('item')
    const paragraph = tree.nodes[blocks[1].id].children![0]
    tree.nodes[blocks[0].id].options = { own: true, font: '--font-mono', size: 'lg' }
    expect(getLook(tree, paragraph)).toEqual({ font: '--font-mono', size: 'lg', leading: undefined })
    expect(getPath(tree, paragraph)).toHaveLength(5)
  })

  it('puts, moves and deletes nodes and ranges them at the depth their paths part', () => {
    const tree = getTree(getDocument('a\n\nb\n\n- c\n\n- d').blocks)
    const [a, b, list] = tree.root
    const items = tree.nodes[list].children!
    expect(getRangeIds(tree, a, items[1])).toEqual([a, b, list])
    expect(getRangeIds(tree, items[0], items[1])).toEqual(items)
    expect(getAdjacentId(tree, items[1], 1)).toBeNull()
    expect(getAdjacentId(tree, items[0], 1)).toBe(items[1])
    putNode(tree, tree.nodes[b], null, 0)
    expect(tree.root.slice(0, 2)).toEqual([b, a])
    putNode(tree, getNode('paragraph', getInline('z')), list, 0)
    expect(tree.nodes[list].children).toHaveLength(3)
    deleteNode(tree, list)
    expect(tree.root).toEqual([b, a])
    expect(Object.keys(tree.nodes)).toHaveLength(2)
    expect(getTextIds(getTree(getDocument('- c\n\n> q').blocks))).toHaveLength(2)
  })
})
