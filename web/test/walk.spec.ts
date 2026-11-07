import { describe, it, expect } from 'vitest'
import { execFileSync } from 'node:child_process'
import { readFileSync, statSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const repo = resolve(root, '..')
const read = (name: string) => readFileSync(resolve(root, name), 'utf8')

const recipe = (name: string) => {
  const found = new RegExp(`^${name}(?: [^\\n]*)?:[^\\n]*\\n((?:[ \\t]+[^\\n]*\\n?)*)`, 'm').exec(readFileSync(resolve(repo, 'justfile'), 'utf8'))
  return (found?.[1] ?? '').split('\n').map((line) => line.trim()).filter(Boolean)
}

const keys = readFileSync(resolve(repo, '.env.example'), 'utf8').split('\n').filter((line) => /^[A-Z]/.test(line)).map((line) => line.split('=')[0])

describe('the walk recipe', () => {
  it('runs the script under web/test/', () => {
    expect(recipe('walk')).toEqual(['bash web/test/walk.sh'])
  })

  it('is not part of the gate, which needs no server', () => {
    expect(recipe('gate')).toEqual(['just check', 'just test', 'just build', 'just vet'])
  })

  it('drives an executable script bash can parse', () => {
    expect(statSync(resolve(root, 'test/walk.sh')).mode & 0o111).toBeGreaterThan(0)
    expect(() => execFileSync('bash', ['-n', resolve(root, 'test/walk.sh')])).not.toThrow()
  })
})

describe('the walk keys', () => {
  it('need no account of their own, since the walk runs as the debug user', () => {
    expect(keys).toContain('SAUTH_DEBUG_USER_ID')
    expect(keys.filter((key) => /^WALK_(EMAIL|PASSWORD)$/.test(key))).toEqual([])
  })

  it('carry no VITE_ prefix, so no secret is inlined into the bundle', () => {
    expect(keys.filter((key) => /^VITE_/.test(key))).toEqual([])
  })

  it('are only demanded present by just env, so an empty one stops the walk alone', () => {
    const env = recipe('env').join('\n')
    expect(env).toContain("grep -qE \"^${key}=\" .env")
    expect(env).not.toContain('^${key}=.+')
  })
})

describe('the walk measures the sideways run', () => {
  const walk = read('test/walk.sh')
  const check = walk.slice(walk.indexOf('check_page() {'), walk.indexOf('\n}\n', walk.indexOf('check_page() {')))
  const sweep = [...check.matchAll(/for w in ([0-9 ]+); do/g)].flatMap((found) =>
    found[1].trim().split(/\s+/).map(Number)
  )

  it('resizes the viewport and reads the document against it', () => {
    expect(sweep.length).toBeGreaterThan(0)
    expect(check).toContain('pw resize "$w" 900')
    expect(check).toContain(
      'Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - window.innerWidth'
    )
  })

  it('sweeps under the narrowest breakpoint the frame declares, where an auto track loses its floor', () => {
    const breakpoints = [...read('src/components/Frame.svelte').matchAll(/@media \(max-width: (\d+)px\)/g)].map(
      (found) => Number(found[1])
    )

    expect(breakpoints.length).toBeGreaterThan(0)
    expect(Math.min(...sweep)).toBeLessThan(Math.min(...breakpoints))
  })

  it('visits every page the gothic pass carried', () => {
    for (const route of [
      '/main',
      '/main/create/character',
      '/main/create/character/class',
      '/main/create/character/race',
      '/main/create/campaign',
      '/main/user'
    ]) {
      expect(walk, route).toContain(`visit ${route} "`)
    }

    expect(walk).toContain("location.pathname.startsWith('/main/campaign/')")
    expect(walk).toContain("document.querySelector('.source-crown') !== null")
  })
})

describe("the walk's sign in waits for the hearth", () => {
  const walk = read('test/walk.sh')
  const signIn = walk.slice(walk.indexOf('page="sign in"'), walk.indexOf('visit /main "'))

  it('declares the hearth predicate above the sign in that waits with it', () => {
    expect(walk).toContain(
      `hearth="document.querySelector('.hall-hero-name') !== null && document.querySelector('.dnd-loading') === null"`
    )
    expect(walk.indexOf('hearth="')).toBeLessThan(walk.indexOf('page="sign in"'))
    expect(signIn).toContain('$hearth')
  })

  it('waits for rendered hearth content, never for the /main pathname', () => {
    expect(signIn).toContain(`wait_for "$hearth" "the hearth as the debug user"`)
    expect(signIn).not.toContain(`location.pathname === '/main'`)
    expect(signIn).not.toContain(`= "/main"`)
  })

  it('rules on the landing by reading the hearth', () => {
    expect(signIn).toContain(`[ "$(js "$hearth")" = "true" ]`)
  })

  it('takes the root and the hearth as one landing, since both render the hearth', () => {
    expect(signIn).toContain('case "$landed" in')
    expect(signIn).toContain('/|/main) ;;')
  })

  it('sends a signed out visitor to Samna Auth and lands on the hearth', () => {
    expect(read('src/App.svelte')).toContain('authService.signIn()')
    expect(read('src/App.svelte')).toMatch(/"\/":\s*\{[^}]*guard: async \(\) => "\/main"/)
  })

  it('names a selector the hearth still renders', () => {
    expect(read('src/pages/MainPage.svelte')).toContain('hall-hero-name')
  })

  it('bounds every wait, so a sign in that never lands reports rather than hangs', () => {
    expect(walk).toContain('[ "$tries" -ge 60 ] && { fail "timed out waiting for $2"; return 1; }')
  })
})
