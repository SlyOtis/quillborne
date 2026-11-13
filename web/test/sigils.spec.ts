import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const read = (name: string) => readFileSync(resolve(root, name), 'utf8')

type Attrs = Record<string, string>

const braced = (text: string, from: number) => {
  let depth = 0
  let at = from
  while (at < text.length) {
    if (text[at] === '{') depth += 1
    else if (text[at] === '}') {
      depth -= 1
      if (depth === 0) return at + 1
    }
    at += 1
  }
  return at
}

const attributes = (text: string): Attrs => {
  const attrs: Attrs = {}
  let at = 0
  while (at < text.length) {
    while (at < text.length && /\s/.test(text[at])) at += 1
    if (at >= text.length) break
    if (text[at] === '/') {
      at += 1
      continue
    }
    if (text[at] === '{') {
      const end = braced(text, at)
      attrs[text.slice(at + 1, end - 1).trim().replace(/^\.\.\./, '')] = text.slice(at, end)
      at = end
      continue
    }
    let nameEnd = at
    while (nameEnd < text.length && !/[\s=]/.test(text[nameEnd])) nameEnd += 1
    const name = text.slice(at, nameEnd)
    at = nameEnd
    if (text[at] !== '=') {
      attrs[name] = ''
      continue
    }
    at += 1
    if (text[at] === '"' || text[at] === "'") {
      const quote = text[at]
      const start = at + 1
      at = text.indexOf(quote, start)
      attrs[name] = text.slice(start, at)
      at += 1
      continue
    }
    if (text[at] === '{') {
      const end = braced(text, at)
      attrs[name] = text.slice(at, end)
      at = end
      continue
    }
    let valueEnd = at
    while (valueEnd < text.length && !/\s/.test(text[valueEnd])) valueEnd += 1
    attrs[name] = text.slice(at, valueEnd)
    at = valueEnd
  }
  return attrs
}

const sigils = (source: string): Attrs[] => {
  const found: Attrs[] = []
  let at = source.indexOf('<Sigil')
  while (at !== -1) {
    let depth = 0
    let end = at
    while (end < source.length) {
      const ch = source[end]
      if (ch === '{') depth += 1
      else if (ch === '}') depth -= 1
      else if (ch === '>' && depth === 0) break
      end += 1
    }
    found.push(attributes(source.slice(at + '<Sigil'.length, end)))
    at = source.indexOf('<Sigil', end)
  }
  return found
}

const region = (source: string, open: string, close: string) => {
  const start = source.indexOf(open)
  expect(start, `${open} is gone`).toBeGreaterThan(-1)
  const end = source.indexOf(close, start)
  expect(end, `${close} is gone`).toBeGreaterThan(-1)
  return source.slice(start + open.length, end)
}

const sigil = read('src/components/ui/Sigil.svelte')
const style = sigil.slice(sigil.indexOf('<style>'), sigil.indexOf('</style>'))
const markup = sigil.slice(sigil.lastIndexOf('</script>'), sigil.indexOf('<style>'))
const traces = sigil.slice(sigil.indexOf('const TRACES'), sigil.indexOf('\n  }', sigil.indexOf('const TRACES')))
const frames = [...sigil.slice(sigil.indexOf('export type SigilFrame')).split('\n')[0].matchAll(/'([^']+)'/g)].map((m) => m[1])
const values = (prop: string) => {
  const line = new RegExp(`${prop}\\?:\\s*([^\\n]+)`).exec(sigil)?.[1] ?? ''
  return [...line.matchAll(/'([^']+)'/g)].map((m) => m[1])
}
const tones = values('tone')
const sizes = values('size')
const fallback = (prop: string) => new RegExp(`${prop}\\s*=\\s*'([^']+)'`).exec(sigil.slice(0, sigil.indexOf('}: {')))?.[1]

const sigilGlyphs = (source: string): string[] =>
  (source.match(/<Sigil[\s\S]*?<\/Sigil>/g) ?? []).flatMap((block) => [...block.matchAll(/<Glyph name="([^"]+)"/g)].map((match) => match[1]))

const bar: [string, string, number][] = [
  ['the frame handles', region(read('src/components/Frame.svelte'), '<header class="dnd-shell-bar">', '</header>'), 3]
]

describe('no bar call site decides the sigil design', () => {
  for (const [where, source, count] of bar) {
    const found = sigils(source)

    it(`${where} still holds ${count} sigils`, () => {
      expect(found.length).toBe(count)
    })

    it(`${where} pass neither frame nor tone`, () => {
      expect(found.filter((attrs) => 'frame' in attrs || 'tone' in attrs)).toEqual([])
    })

    it(`${where} carry nothing but the title, the size, the pressed state and the handler`, () => {
      for (const attrs of found) {
        expect(Object.keys(attrs).filter((name) => !['title', 'size', 'active', 'disabled', 'onclick'].includes(name))).toEqual([])
        expect(attrs.size).toBe('sm')
        expect(attrs.title).toBeTruthy()
      }
    })

    it(`${where} differ by their glyph alone`, () => {
      const glyphs = sigilGlyphs(source)
      expect(glyphs.length).toBe(count)
      expect(new Set(glyphs).size).toBe(count)
    })
  }

  it('leaves every bar sigil the one outline, rim and tone', () => {
    const drawn = bar.flatMap(([, source]) => sigils(source)).map((attrs) => ({
      frame: attrs.frame ?? fallback('frame'),
      tone: attrs.tone ?? fallback('tone'),
      size: attrs.size
    }))

    expect(drawn.length).toBe(3)
    expect([...new Set(drawn.map((one) => JSON.stringify(one)))]).toEqual([
      JSON.stringify({ frame: 'quatrefoil', tone: 'metal', size: 'sm' })
    ])
  })

  it('names every tool the bar draws', () => {
    const glyphs = bar.flatMap(([, source]) => sigilGlyphs(source))
    expect(glyphs).toEqual(['menu', 'back', 'chat'])
  })
})

describe('the sigil is the forged HUD button', () => {
  it('defaults to the quatrefoil in metal, so the design is decided in the component', () => {
    expect(fallback('frame')).toBe('quatrefoil')
    expect(fallback('tone')).toBe('metal')
    expect(sigil).toContain('frame?: SigilFrame')
    expect(tones).toContain('metal')
    expect(sizes).toEqual(['sm', 'md', 'lg'])
  })

  it('traces the ring as a 44 radius circle capped by a diamond point top and bottom', () => {
    const ring = /ring:\s*'(M[^']+)'/.exec(traces)?.[1] ?? ''
    expect(ring.startsWith('M50 0')).toBe(true)
    expect(ring).toContain('L50 100')
    expect(ring.match(/A44 44/g)).toHaveLength(2)
    expect(ring.endsWith('Z')).toBe(true)
  })

  it('traces the quatrefoil as four 22 radius lobes, each tipped by a point on the cardinal axis', () => {
    const quatrefoil = /quatrefoil:\s*'(M[^']+)'/.exec(traces)?.[1] ?? ''
    expect(quatrefoil.match(/22 22 0 0 1/g)).toHaveLength(8)
    for (const tip of ['L50 1', 'L99 50', 'L50 99', 'L1 50']) expect(quatrefoil).toContain(tip)
    expect(quatrefoil.endsWith('Z')).toBe(true)
  })

  it('keeps a trace for every frame the type names', () => {
    expect(frames).toEqual(['quatrefoil', 'ring', 'cusped', 'lobed', 'star', 'plate'])
    for (const frame of frames) {
      expect(new RegExp(`${frame}:\\s*'M[^']+'`).test(traces), `${frame} has no trace`).toBe(true)
    }
  })

  it('draws fill, rim and key off the one path, so the outline never splits', () => {
    expect(markup.match(/d=\{TRACES\[frame\]\}/g)).toHaveLength(3)
    for (const part of ['dnd-sigil-fill', 'dnd-sigil-rim', 'dnd-sigil-key']) {
      expect(markup).toContain(`class="${part}"`)
    }
  })

  it('bevels the trace with a one pixel edge light over a drop shade', () => {
    const rule = /\.dnd-sigil-trace\s*\{([^}]*)\}/.exec(style)?.[1] ?? ''
    const light = rule.indexOf('drop-shadow(0 -1px 0 var(--metal-edge))')
    const shade = rule.indexOf('var(--shade)')
    expect(light).toBeGreaterThan(-1)
    expect(shade).toBeGreaterThan(light)
  })

  it('colours the fill, the rim and the key once', () => {
    expect(/\.dnd-sigil-fill\s*\{[^}]*fill:\s*var\(--ground-deep\)/.test(style)).toBe(true)
    expect(/\.dnd-sigil-rim\s*\{[^}]*stroke:\s*var\(--metal\)/.test(style)).toBe(true)
    expect(/\.dnd-sigil-key\s*\{[^}]*stroke:\s*var\(--metal-dim\)/.test(style)).toBe(true)
  })

  it('carries no rule and no token the frames left behind', () => {
    for (const dead of ['.dnd-sigil-ring', '.dnd-sigil-face', '--sigil-edge', '--sigil-cusp', '--sigil-point']) {
      expect(style, `${dead} is dead`).not.toContain(dead)
    }
  })

  it('styles no class the markup cannot carry', () => {
    const worn = new Set<string>(['dnd-sigil'])
    for (const [, list] of markup.matchAll(/class="([^"]*)"/g)) {
      for (const token of list.split(/\s+/).filter(Boolean)) {
        const template = /^([\w-]+)\{(\w+)\}$/.exec(token)
        if (!template) {
          worn.add(token)
          continue
        }
        for (const value of template[2] === 'tone' ? tones : sizes) worn.add(`${template[1]}${value}`)
      }
    }
    for (const [, name] of markup.matchAll(/class:([\w-]+)/g)) worn.add(name)

    const styled = new Set([...style.matchAll(/\.(dnd-sigil[\w-]*)/g)].map((m) => m[1]))
    expect([...styled].filter((name) => !worn.has(name))).toEqual([])
  })

  it('reads hover, pressed, focus and disabled off the sigil alone', () => {
    const scoped = style
      .split('}')
      .map((chunk) => chunk.split('{')[0].trim())
      .filter((selector) => /:hover|:active|:focus|:disabled/.test(selector))
    expect(scoped.length).toBeGreaterThanOrEqual(4)
    for (const selector of scoped) {
      for (const name of [...tones, ...sizes, ...frames]) {
        expect(selector, `${selector} reads differently per ${name}`).not.toContain(`dnd-sigil-${name}`)
      }
    }
  })
})

describe('the sigils outside the bar', () => {
  for (const [where, path, want] of [
    ['the dialog close', 'src/components/BaseDialog.svelte', { title: 'Close dialog', tone: 'bane', frame: 'cusped' }],
    ['the chat send', 'src/components/chat/Chat.svelte', { title: 'Send', tone: 'metal', frame: 'star' }]
  ] as const) {
    it(`${where} keeps its own frame`, () => {
      const found = sigils(read(path)).find((attrs) => attrs.title === want.title)
      expect(found, `${want.title} is gone`).toBeDefined()
      expect({ tone: found?.tone, frame: found?.frame }).toEqual({ tone: want.tone, frame: want.frame })
    })
  }
})
