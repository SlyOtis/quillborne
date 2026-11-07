import { describe, it, expect } from 'vitest'
import { layoutLabels, labelGroups } from '$lib/nimap/render'
import type { LabelInput } from '$lib/nimap/render'
import { pointInRing } from '$lib/nimap'

const random = (seed: number) => {
  let s = seed
  return () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648
}

/** A rotated rectangle standing in for a map's silhouette, and labels of mixed widths on rooms inside it. */
function scene(seed: number, width: number, height: number, count: number) {
  const rnd = random(seed)
  const c: [number, number] = [width / 2, height / 2]
  const a = rnd() * Math.PI
  const [hw, hh] = [Math.min(width, height) * (0.2 + rnd() * 0.15), Math.min(width, height) * (0.12 + rnd() * 0.1)]
  const corner = (x: number, y: number): [number, number] => [c[0] + x * Math.cos(a) - y * Math.sin(a), c[1] + x * Math.sin(a) + y * Math.cos(a)]
  const around = [corner(-hw, -hh), corner(hw, -hh), corner(hw, hh), corner(-hw, hh)]
  const labels: LabelInput[] = Array.from({ length: count }, (_, i) => ({ id: `l${i}`, anchor: corner((rnd() - 0.5) * 1.8 * hw, (rnd() - 0.5) * 1.8 * hh), width: 80 + rnd() * 90, height: 36 }))
  return { around, labels }
}

const overlaps = (a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h

const crosses = (a: [number, number], b: [number, number], c: [number, number], d: [number, number]) => {
  const o = (p: [number, number], q: [number, number], r: [number, number]) => Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]))
  return o(a, b, c) * o(a, b, d) < 0 && o(c, d, a) * o(c, d, b) < 0
}

describe('labels round the map', () => {
  it('round the map or at the sides, on any screen shape, every label that fits sits outside the map, inside the margins and off the title, none overlap, every leader ends at its room, and leaders do not cross', () => {
    const placement = 'sides'
    for (const [width, height] of [[1920, 1080], [3840, 2160], [1080, 1920]]) {
      for (const seed of [1, 7, 42, 99, 123]) {
        const { around, labels } = scene(seed, width, height, 14)
        const title = { x: 24, y: 24, width: width * 0.2, height: height * 0.12 }
        const { placed, left } = layoutLabels(labels, width, height, { margin: 24, avoid: [title] })
        expect(placed.length + left.length).toBe(labels.length)
        const boxes = placed.map(p => {
          const l = labels.find(x => x.id === p.id)!
          expect(p.leader.to).toEqual(l.anchor)
          return { id: p.id, x: p.x, y: p.y, w: l.width, h: l.height }
        })
        for (const b of boxes) {
          expect(b.x, `${width} ${seed} ${b.id}`).toBeGreaterThanOrEqual(24 - 1e-9)
          expect(b.y).toBeGreaterThanOrEqual(24 - 1e-9)
          expect(b.x + b.w).toBeLessThanOrEqual(width - 24 + 1e-9)
          expect(b.y + b.h).toBeLessThanOrEqual(height - 24 + 1e-9)
          expect(pointInRing([b.x + b.w / 2, b.y + b.h / 2], around), `${b.id} off the map`).toBe(false)
          expect(overlaps(b, { x: title.x, y: title.y, w: title.width, h: title.height }), `${placement} ${width} ${seed} ${b.id} on the title`).toBe(false)
        }
        for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) expect(overlaps(boxes[i], boxes[j]), `${placement} ${width} ${seed} ${boxes[i].id} ${boxes[j].id}`).toBe(false)
        for (let i = 0; i < placed.length; i++)
          for (let j = i + 1; j < placed.length; j++) expect(crosses(placed[i].leader.to, placed[i].leader.from, placed[j].leader.to, placed[j].leader.from), `${placement} ${width} ${seed} ${placed[i].id} ${placed[j].id}`).toBe(false)
      }
    }
  })

  it('more labels than fit leaves the last given out, in either placement', () => {
    const { labels } = scene(5, 1920, 1080, 120)
    {
      const { placed, left } = layoutLabels(labels, 1920, 1080)
      expect(left.length).toBeGreaterThan(0)
      expect(left).toEqual(labels.slice(labels.length - left.length).map(l => l.id))
      expect(placed.length + left.length).toBe(120)
    }
  })

  it('no two labels ever overlap, whatever the screen, the count, or how tightly rooms bunch together', () => {
    const placement = 'sides'
    {
      for (let seed = 1; seed <= 40; seed++) {
        const rnd = random(seed * 7919)
        const [width, height] = rnd() < 0.5 ? [1920, 1080] : [1080, 1920]
        const n = 8 + Math.floor(rnd() * 25)
        const { labels } = scene(seed, width, height, n)
        for (let i = 1; i < n; i++) {
          if (rnd() < 0.5) {
            const p = labels[Math.floor(rnd() * i)].anchor
            labels[i].anchor = [p[0] + (rnd() - 0.5) * 30, p[1] + (rnd() - 0.5) * 30]
          }
        }
        const { placed, left } = layoutLabels(labels, width, height, { avoid: [{ x: 48, y: 48, width: 300, height: 100 }], spacing: 10, margin: 48 })
        expect(placed.length + left.length).toBe(n)
        const boxes = placed.map(p => ({ x: p.x, y: p.y, w: labels.find(l => l.id === p.id)!.width, h: labels.find(l => l.id === p.id)!.height }))
        for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) expect(overlaps(boxes[i], boxes[j]), `${placement} ${seed}`).toBe(false)
      }
    }
  })

  it('the layout reads only positions and sizes, so the same input lays out the same', () => {
    const { labels } = scene(3, 1920, 1080, 10)
    expect(layoutLabels(labels, 1920, 1080)).toEqual(layoutLabels(labels, 1920, 1080))
  })

  it('groups rooms by natural breaks in how far apart they are on the plan: clusters apart are groups, an even spread is one', () => {
    const rnd = random(11)
    const centres: [number, number][] = [[0, 0], [30, 0], [0, 25], [32, 28], [60, 5], [62, 30]]
    const points = centres.flatMap(([x, y]) => Array.from({ length: 3 + Math.floor(rnd() * 3) }, (): [number, number] => [x + rnd() * 6, y + rnd() * 6]))
    const groups = labelGroups(points)
    expect(new Set(groups).size).toBe(6)
    let k = 0
    for (const [x, y] of centres) {
      const members = points.map((p, i) => ({ p, g: groups[i] })).filter(({ p }) => Math.hypot(p[0] - x - 3, p[1] - y - 3) < 6)
      expect(new Set(members.map(m => m.g)).size, `cluster ${k++}`).toBe(1)
    }
    const even = Array.from({ length: 25 }, (_, i): [number, number] => [(i % 5) * 4, Math.floor(i / 5) * 4])
    expect(new Set(labelGroups(even)).size).toBe(1)
  })
})
