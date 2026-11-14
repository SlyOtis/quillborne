import { describe, expect, it } from 'vitest'
import { getBlock, getBlockEmailHtml, getDocumentEmailHtml } from '../src/lib/blocks'

describe('the mail a document is written out as', () => {
  it('is a whole html document laid out in tables with no style element', () => {
    const html = getDocumentEmailHtml({ blocks: [getBlock('paragraph', 'A line')] }, 'Session 3')
    expect(html.startsWith('<!doctype html>')).toBe(true)
    expect(html).toContain('<table')
    expect(html).not.toContain('<style')
    expect(html).toContain('Session 3')
  })

  it('sets every style inline, because a mail client keeps no sheet', () => {
    expect(getBlockEmailHtml(getBlock('heading', 'History', { level: 2 }))).toContain('style="font-family')
  })

  it('escapes what the author wrote rather than letting it become markup', () => {
    expect(getBlockEmailHtml(getBlock('paragraph', '<script>alert(1)</script>'))).toContain('&lt;script&gt;')
  })

  it('degrades a poll to its tally rather than to an empty tag', () => {
    const poll = getBlock('poll', 'Which way?\nNorth\nSouth', { votes: { a: 'North', b: 'North', c: 'South' } })
    const html = getBlockEmailHtml(poll)
    expect(html).toContain('North &mdash; 2')
    expect(html).toContain('South &mdash; 1')
  })

  it('degrades a video to a link rather than to a dead player', () => {
    const html = getBlockEmailHtml(getBlock('video', 'The ambush', { src: 'file:clips/ambush.webm' }))
    expect(html).toContain('<a href="file:clips/ambush.webm"')
    expect(html).toContain('The ambush')
  })

  it('degrades a file to a link that carries its name', () => {
    const html = getBlockEmailHtml(getBlock('file', '', { assetId: 'a1', name: 'The charter.pdf', url: '/api/asset/a1/data', mimeType: 'application/pdf' }))
    expect(html).toContain('<a href="/api/asset/a1/data"')
    expect(html).toContain('The charter.pdf')
  })

  it('degrades a toggle to its own content, so nothing is lost on the way out', () => {
    const html = getBlockEmailHtml(getBlock('toggle', 'What lies beneath\nA stair going down'))
    expect(html).toContain('What lies beneath')
    expect(html).toContain('A stair going down')
  })
})
