import { describe, it, expect } from 'vitest'
import { wallBands } from '$lib/nimap'
import type { Opening, Wall } from '$lib/nimap'

const wall = (id: string, points: [[number, number], [number, number]], width = 0.16): Wall => ({ id, points, width })
const walls = [wall('n', [[0, 0], [8, 0]]), wall('e', [[8, 0], [8, 4]])]
const door: Opening = { id: 'd', kind: 'door', at: [2, 0], width: 0.9, from: 0, to: 2.1 }
const window: Opening = { id: 'w', kind: 'window', at: [5, 0], width: 1.2, from: 0.9, to: 2.1 }
const high: Opening = { id: 'h', kind: 'window', at: [8, 2], width: 0.6, from: 2.4, to: 2.8 }

describe('wall bands', () => {
  it('bands tile the wall height exactly, split only where an opening starts or ends inside it, and each carries exactly the openings that pass through it', () => {
    for (const height of [1.15, 2.1, 3]) {
      for (const openings of [[], [door], [window], [door, window], [door, window, high]]) {
        const bands = wallBands(walls, openings, height)
        expect(bands[0].from).toBe(0)
        expect(bands[bands.length - 1].to).toBe(height)
        for (let i = 1; i < bands.length; i++) expect(bands[i].from).toBe(bands[i - 1].to)
        const inside = new Set(openings.flatMap(o => [o.from, o.to]).filter(h => h > 0 && h < height))
        expect(bands.length).toBe(inside.size + 1)
        for (const band of bands) {
          const through = openings.filter(o => o.from <= band.from && o.to >= band.to)
          expect(band.cuts.length, `${height} ${band.from}-${band.to}`).toBe(through.length)
          for (const o of through) expect(band.cuts.some(c => c.wallId === (o.id === 'h' ? 'e' : 'n') && c.s0 < c.s1)).toBe(true)
        }
      }
    }
  })

  it('a short wall with a door is one band cut all the way; a window leaves the wall below it whole', () => {
    expect(wallBands(walls, [door], 1.15)).toEqual([{ from: 0, to: 1.15, cuts: [expect.objectContaining({ wallId: 'n' })] }])
    const sill = wallBands(walls, [window], 1.15)
    expect(sill.map(b => [b.from, b.to, b.cuts.length])).toEqual([[0, 0.9, 0], [0.9, 1.15, 1]])
  })
})
