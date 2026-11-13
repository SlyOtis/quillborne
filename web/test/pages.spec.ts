import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { component } from './tables.fixture'

const names = [
  'MainPage',
  'CampaignPage',
  'CharacterCreatePage',
  'CharacterClassPage',
  'CharacterRacePage',
  'CampaignCreatePage',
  'SourcePage',
  'UserPage',
  'PlayerPage'
] as const

type Page = ReturnType<typeof component>

const pages = names.map((name) => [name, component(`src/pages/${name}.svelte`)] as const)
const at = (name: (typeof names)[number]) => pages.find(([one]) => one === name)![1]

const shell = component('src/components/ui/Shell.svelte')
const frame = component('src/components/Frame.svelte')
const ornament = component('src/components/ui/Ornament.svelte')
const glyph = component('src/components/ui/Glyph.svelte')
const portrait = component('src/components/ui/Portrait.svelte')

const union = (source: string, from: string, to: string) => {
  const start = source.indexOf(from)
  expect(start, `${from} is gone`).toBeGreaterThan(-1)
  const end = source.indexOf(to, start + from.length)
  return [...source.slice(start, end).matchAll(/'([^']+)'/g)].map((match) => match[1])
}

const ornaments = union(ornament.source, 'name:', '/**')
const glyphs = union(glyph.source, 'export type GlyphName =', '</script>')
const frames = union(portrait.source, 'export type PortraitFrame =', '\n')
const widths = union(shell.source, 'width?:', '\n')

const declared = (page: Page) =>
  page.blocks.flatMap((block) =>
    Object.entries(block.declared).map(([property, value]) => ({ selector: block.selector, property, value }))
  )

const paints = new Set([
  'color',
  'background',
  'background-color',
  'background-image',
  'border',
  'border-color',
  'border-top',
  'border-right',
  'border-bottom',
  'border-left',
  'border-block',
  'border-inline',
  'border-top-color',
  'border-right-color',
  'border-bottom-color',
  'border-left-color',
  'outline',
  'outline-color',
  'box-shadow',
  'text-shadow',
  'fill',
  'stroke',
  'caret-color',
  'accent-color',
  'text-decoration-color'
])

const settled = new Set(['none', 'transparent', 'currentColor', 'inherit'])

const literal = /#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?|oklch|oklab|lch|lab)\(/
const absolute = /\d(?:px|pt|pc|in|cm|mm)\b/
const viewport = /\d(?:vw|vmin|vmax|svw|lvw|dvw)\b/

const styles = (page: Page) => page.source.slice(page.source.indexOf('<style>'), page.source.lastIndexOf('</style>'))

const marks = (page: Page, tag: string, attribute: string) =>
  [...page.source.matchAll(new RegExp(`<${tag}\\b[^>]*?\\s${attribute}="([^"{]+)"`, 'g'))].map((match) => match[1])

describe('no page carries a literal colour', () => {
  for (const [name, page] of pages) {
    it(`${name} paints through a token`, () => {
      const raw = declared(page)
        .filter((one) => paints.has(one.property))
        .filter((one) => !one.value.includes('var(') && !settled.has(one.value))
      expect(raw.map((one) => `${one.selector} { ${one.property}: ${one.value} }`)).toEqual([])
    })

    it(`${name} writes no hex, rgb or hsl anywhere in its style block`, () => {
      const found = declared(page).filter((one) => literal.test(one.value))
      expect(found.map((one) => `${one.selector} { ${one.property}: ${one.value} }`)).toEqual([])
    })

    it(`${name} carries no inline style attribute the style block cannot reach`, () => {
      expect(page.source).not.toContain('style=')
    })
  }
})

describe('no page carries a magic pixel size', () => {
  for (const [name, page] of pages) {
    it(`${name} declares no absolute length`, () => {
      const found = declared(page).filter((one) => absolute.test(one.value))
      expect(found.map((one) => `${one.selector} { ${one.property}: ${one.value} }`)).toEqual([])
    })

    it(`${name} builds every page variable out of an app token`, () => {
      const own = declared(page).filter((one) => one.property.startsWith('--'))
      expect(own.length, `${name} declares no page variable`).toBeGreaterThan(0)
      const raw = own.filter((one) => !one.value.includes('var(') && !/^\d+%$/.test(one.value))
      expect(raw.map((one) => `${one.property}: ${one.value}`)).toEqual([])
    })
  }

  it('sizes the two pick steps off one style block', () => {
    expect(styles(at('CharacterClassPage'))).toBe(styles(at('CharacterRacePage')))
  })
})

describe('no text character stands in for an icon', () => {
  for (const [name, page] of pages) {
    it(`${name} writes nothing outside ASCII but the ellipsis`, () => {
      const foreign = [...new Set(page.source.match(/[^\u0000-\u007f]/g) ?? [])]
      expect(foreign.filter((mark) => mark !== '…')).toEqual([])
    })

    it(`${name} names an ornament the component draws`, () => {
      expect(marks(page, 'Ornament', 'name').filter((one) => !ornaments.includes(one))).toEqual([])
    })

    it(`${name} names a glyph the component draws`, () => {
      expect(marks(page, 'Glyph', 'name').filter((one) => !glyphs.includes(one))).toEqual([])
    })

    it(`${name} names a portrait frame the component cuts`, () => {
      expect(marks(page, 'Portrait', 'frame').filter((one) => !frames.includes(one))).toEqual([])
    })
  }

  it('draws the toast alarm as a skull and not a warning sign', () => {
    expect(component('src/components/ui/Toast.svelte').source).toMatch(
      /<span class="dnd-toast-mark"><Ornament name="skull" size="sm" tone="ember" \/><\/span>/
    )
  })

  it('draws both empty portrait marks as an ornament and not a star', () => {
    expect(at('CharacterCreatePage').source).toMatch(
      /<span class="dnd-empty-mark"><Ornament name="portrait" size="sm" tone="metal" \/><\/span>/
    )
    expect(at('UserPage').source).toMatch(
      /<span class="dnd-empty-mark"><Ornament name="quatrefoil" size="sm" tone="metal" \/><\/span>/
    )
  })

  it('draws the score drop as a glyph and not a multiplication sign', () => {
    const page = at('CharacterCreatePage').source
    expect(page).toContain('class="make-score-drop"')
    expect(page).toMatch(/<Glyph name="close" size="sm" \/><\/button>/)
  })

  it('sets every crest on a masked plate', () => {
    for (const name of ['CharacterClassPage', 'CharacterRacePage', 'CampaignCreatePage', 'SourcePage'] as const) {
      expect(at(name).source, name).toMatch(
        /<span class="[a-z-]+-plate dnd-shield"><\/span>\s*<Ornament name="crest" size="md" tone="metal" \/>/
      )
    }

    expect(at('CharacterCreatePage').source).toMatch(
      /<span class="make-plate dnd-shield"><\/span>\s*<Ornament name="forge" size="lg" tone="metal" \/>/
    )

    expect(at('UserPage').source).toMatch(
      /<span class="user-plate dnd-shield"><\/span>\s*<Ornament name="rosette" size="sm" tone="metal" \/>/
    )
  })

  it('sets the settled pick in an arched niche', () => {
    for (const name of ['CharacterClassPage', 'CharacterRacePage'] as const) {
      expect(at(name).source, name).toMatch(
        /<span class="pick-niche-plate dnd-arch"><\/span>\s*<Ornament name="lancet" size="md" tone="metal" \/>/
      )
    }
  })
})

describe('the frame holds the sideways backstop', () => {
  it('clips the scroller and refuses the sideways overscroll', () => {
    const scroll = frame.style('.dnd-shell-scroll')
    expect(scroll?.['overflow-x']).toBe('hidden')
    expect(scroll?.['overscroll-behavior-x']).toBe('none')
  })

  it('floors and caps the hold, so a wide child cannot push the track', () => {
    const hold = frame.style('.dnd-shell-hold')
    expect(hold?.['min-width']).toBe('0')
    expect(hold?.['max-width']).toBe('min(100%, var(--size-page-max))')
  })

  it('floors the content area and clips the frame itself', () => {
    expect(frame.style('.dnd-shell-content')?.['min-width']).toBe('0')
    expect(frame.style('.dnd-shell-content')?.overflow).toBe('hidden')
    expect(frame.style('.dnd-shell')?.overflow).toBe('hidden')
  })

  it('narrows the hold only for the widths that ask for it, and leaves full on the base cap', () => {
    expect(widths).toEqual(['narrow', 'wide', 'full'])
    const narrow = frame.style('.dnd-shell-hold-narrow')?.['max-width'] ?? ''
    const wide = frame.style('.dnd-shell-hold-wide')?.['max-width'] ?? ''
    expect(parseInt(narrow, 10)).toBeGreaterThan(0)
    expect(parseInt(wide, 10)).toBeGreaterThan(parseInt(narrow, 10))
    expect(frame.style('.dnd-shell-hold-full')).toBeNull()
  })
})

describe('no page defeats the sideways backstop', () => {
  for (const [name, page] of pages) {
    it(`${name} renders inside one shell and asks for a width the shell knows`, () => {
      expect(page.source.match(/<Shell[\s>]/g) ?? []).toHaveLength(1)
      expect(marks(page, 'Shell', 'width').filter((one) => !widths.includes(one))).toEqual([])
    })

    it(`${name} declares neither overflow-x nor a viewport width`, () => {
      const found = declared(page).filter((one) => one.property === 'overflow-x' || viewport.test(one.value))
      expect(found.map((one) => `${one.selector} { ${one.property}: ${one.value} }`)).toEqual([])
    })

    it(`${name} clamps every auto track against the track it sits in`, () => {
      const tracks = declared(page).filter((one) => one.property === 'grid-template-columns')
      for (const track of tracks) {
        if (!/auto-fit|auto-fill/.test(track.value)) continue
        expect(track.value, `${track.selector} lays an auto track with a hard floor`).toMatch(/minmax\(\s*min\(/)
      }
    })

    it(`${name} floors every explicit track at zero or a clamp`, () => {
      const tracks = declared(page).filter((one) => one.property === 'grid-template-columns')
      for (const track of tracks) {
        for (const found of track.value.matchAll(/minmax\(\s*/g)) {
          const rest = track.value.slice(found.index! + found[0].length)
          expect(
            rest.startsWith('0,') || rest.startsWith('min('),
            `${track.selector} floors a track at ${rest.split(',')[0]}`
          ).toBe(true)
        }
      }
    })

    it(`${name} floors every flexing child, so its content cannot widen the row`, () => {
      const loose = page.blocks.filter((block) => block.declared.flex === '1' && block.declared['min-width'] !== '0')
      expect(loose.map((block) => block.selector)).toEqual([])
    })
  }
})

describe('every page imports only what it draws with', () => {
  const clauses = (source: string) => [
    ...source.matchAll(/import\s+(?:type\s+)?([\s\S]*?)\s+from\s+['"][^'"]+['"]/g)
  ]

  for (const [name, page] of pages) {
    it(`${name} leaves no import behind`, () => {
      const body = page.source.replace(/import\s+(?:type\s+)?[\s\S]*?\s+from\s+['"][^'"]+['"];?/g, '')
      const bound = clauses(page.source)
        .flatMap((match) => match[1].replace(/[{}]/g, '').split(','))
        .map((part) => part.trim().replace(/^type\s+/, '').split(/\s+as\s+/).pop()!.trim())
        .filter(Boolean)

      expect(bound.length, `${name} imports nothing`).toBeGreaterThan(0)
      expect(bound.filter((one) => !new RegExp(`\\b${one}\\b`).test(body))).toEqual([])
    })
  }

  it('drops the catalogue writer neither pick step calls', () => {
    for (const name of ['CharacterClassPage', 'CharacterRacePage'] as const) {
      expect(at(name).source, name).not.toContain('putCatalogEntry')
    }
  })

  it('drops the raw stored image everywhere a portrait now stands', () => {
    for (const [name, page] of pages) {
      expect(page.source, name).not.toContain('StoredImage')
    }
    expect(at('UserPage').source).toContain('<Portrait')
    expect(at('SourcePage').source).toContain('<Portrait')
    expect(at('CharacterCreatePage').source).toContain('<Portrait')
  })

  it('carries the party as cards holding a portrait, not a stack of text buttons', () => {
    const camp = at('CampaignPage').source
    expect(camp).toContain("import Card from '$components/ui/Card.svelte'")
    expect(camp).toMatch(/<Card[\s\S]*?image=\{entry\.character\?\.info\?\.imageUrl\}/)
  })
})

describe('no derived value reorders the state it reads', () => {
  const sources = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
      entry.isDirectory() ? sources(join(dir, entry.name)) : entry.name.endsWith('.svelte') ? [join(dir, entry.name)] : []
    )

  for (const path of sources('src')) {
    it(`${path} copies before it sorts or reverses inside $derived`, () => {
      const code = readFileSync(path, 'utf8')
      const inPlace = [...code.matchAll(/\$derived\(\s*([A-Za-z_$][\w$.]*)\s*\.(sort|reverse)\(/g)].map((m) => `${m[1]}.${m[2]}`)
      expect(inPlace).toEqual([])
    })
  }
})
