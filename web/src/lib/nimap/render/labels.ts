import type { Vec2 } from '../geometry/vector'

/** A label to place: its anchor on screen and its own measured size. */
export interface LabelInput {
  id: string
  anchor: [number, number]
  width: number
  height: number
  /** The width it takes in a row along the top or bottom, the same for every state its text can show, so a row never shifts when a status changes. Its own width when left out. */
  rowWidth?: number
  /** How far down the label a leader meets its side: level with the name. Half the height when left out. */
  port?: number
  /** The room's position on the plan, from above, so labels of rooms that belong together are kept together whatever the view. The anchor when left out. */
  plan?: [number, number]
}

export type LabelAlign = 'left' | 'right' | 'center'

export type LabelSide = 'left' | 'right' | 'top' | 'bottom'

export interface PlacedLabel {
  id: string
  /** Top-left corner of the label box, and its width: its own in a column, its row width in a row. */
  x: number
  y: number
  width: number
  /** The side of the screen it stands along. */
  side: LabelSide
  align: LabelAlign
  /** The leader from just off the label's near edge to the anchor. */
  leader: { from: [number, number]; to: [number, number] }
}

export interface LabelLayout {
  placed: PlacedLabel[]
  /** Labels that did not fit, the last given first: the host shows them another way or not at all. */
  left: string[]
}

/** A screen rectangle, from its top-left corner. */
export interface ScreenRect {
  x: number
  y: number
  width: number
  height: number
}

export interface LabelLayoutOptions {
  /** Screen rectangles no label may cover, such as a title. */
  avoid?: ScreenRect[]
  /** Space between neighbouring labels along a side. */
  spacing?: number
  /** Distance from the viewport's edges that no label crosses. */
  margin?: number
  /** The breathing room between a leader's end and its label's text. */
  clearance?: number
}



/**
 * Labels spread along a line from where each wants to be, keeping their
 * order and the room each takes: overlapping neighbours become one group
 * centred on where its members want to be on average, groups merging
 * until none overlap. The least total displacement for that order.
 */
function spread(wanted: number[], sizes: number[], apart: number[] = []): number[] {
  type Group = { first: number; last: number; start: number }
  const offsets: number[] = []
  let groups: Group[] = []
  for (let i = 0; i < wanted.length; i++) {
    groups.push({ first: i, last: i, start: wanted[i] })
    offsets[i] = 0
    for (;;) {
      const g = groups[groups.length - 1]
      const before = groups[groups.length - 2]
      if (!before) break
      const end = before.start + offsets[before.last] + sizes[before.last] / 2 + (apart[g.first] ?? 0)
      if (end <= g.start - sizes[g.first] / 2 + offsets[g.first]) break
      const merged: Group = { first: before.first, last: g.last, start: 0 }
      let o = 0
      let sum = 0
      for (let j = merged.first; j <= merged.last; j++) {
        if (j > merged.first) o += (sizes[j - 1] + sizes[j]) / 2 + (apart[j] ?? 0)
        offsets[j] = o
        sum += wanted[j] - o
      }
      merged.start = sum / (merged.last - merged.first + 1)
      groups = [...groups.slice(0, -2), merged]
    }
  }
  const out: number[] = []
  for (const g of groups) for (let j = g.first; j <= g.last; j++) out[j] = g.start + offsets[j]
  return out
}

/**
 * Which labels belong together, read from their rooms on the plan: each
 * room is linked to its nearest neighbours by the shortest tree through
 * them all, and the links are cut where lengths break naturally into short
 * and long, the long being clearly longer. No distance is fixed; a plan
 * with no clear break is one group.
 */
export function labelGroups(points: Vec2[]): number[] {
  const n = points.length
  const group = points.map((_, i) => i)
  if (n < 3) return points.map(() => 0)
  const inTree = new Array(n).fill(false)
  const best = new Array(n).fill(Infinity)
  const parent = new Array(n).fill(-1)
  best[0] = 0
  const links: { a: number; b: number; length: number }[] = []
  for (let k = 0; k < n; k++) {
    let u = -1
    for (let i = 0; i < n; i++) if (!inTree[i] && (u < 0 || best[i] < best[u])) u = i
    inTree[u] = true
    if (parent[u] >= 0) links.push({ a: parent[u], b: u, length: best[u] })
    for (let v = 0; v < n; v++) {
      const d = Math.hypot(points[u][0] - points[v][0], points[u][1] - points[v][1])
      if (!inTree[v] && d < best[v]) {
        best[v] = d
        parent[v] = u
      }
    }
  }
  const lengths = links.map(l => l.length).sort((a, b) => a - b)
  const sse = (xs: number[]) => {
    const m = xs.reduce((s, x) => s + x, 0) / (xs.length || 1)
    return xs.reduce((s, x) => s + (x - m) ** 2, 0)
  }
  let cut = Infinity
  let lowest = Infinity
  for (let k = 1; k < lengths.length; k++) {
    const short = lengths.slice(0, k)
    const long = lengths.slice(k)
    const cost = sse(short) + sse(long)
    const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length
    if (cost < lowest && mean(long) > 2 * mean(short)) {
      lowest = cost
      cut = long[0]
    }
  }
  const find = (i: number): number => (group[i] === i ? i : (group[i] = find(group[i])))
  for (const l of links) if (l.length < cut) group[find(l.a)] = find(l.b)
  const ids = new Map<number, number>()
  return points.map((_, i) => {
    const root = find(i)
    if (!ids.has(root)) ids.set(root, ids.size)
    return ids.get(root)!
  })
}

const crosses = (a: Vec2, b: Vec2, c: Vec2, d: Vec2) => {
  const o = (p: Vec2, q: Vec2, r: Vec2) => Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]))
  return o(a, b, c) * o(a, b, d) < 0 && o(c, d, a) * o(c, d, b) < 0
}

/**
 * A side labels are spread along, sampled every `step`: which samples a
 * label may stand at. Stretches no label may stand at, such as under a
 * title, are cut out, so labels spread over what is left.
 */
interface Line {
  length: number
  step: number
  ok: boolean[]
}

/** Positions along a line for labels wanting `wanted`, each taking `sizeAt` of it where it stands, in the order they want, with `groupGap` more between labels of different groups. */
function spreadOn(line: Line, wanted: number[], sizeAt: (i: number, pos: number) => number, groupOf: (i: number) => number = () => 0, groupGap = 0): number[] {
  const n = line.ok.length
  const uAt: number[] = []
  let u = 0
  for (let i = 0; i < n; i++) {
    uAt.push(u)
    if (line.ok[i]) u += line.step
  }
  const U = u
  const toU = (pos: number) => {
    const k = Math.max(0, Math.min(n - 1, Math.round(pos / line.step)))
    for (let d = 0; d < n; d++) {
      for (const j of [k - d, k + d]) if (j >= 0 && j < n && line.ok[j]) return uAt[j] + line.step / 2
    }
    return 0
  }
  const fromU = (value: number) => {
    let lo = 0
    let hi = n - 1
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1
      if (uAt[mid] <= value) lo = mid
      else hi = mid - 1
    }
    while (lo < n - 1 && !line.ok[lo]) lo++
    return lo * line.step
  }
  const us = wanted.map(toU)
  const byU = us.map((_, i) => i).sort((a, b) => us[a] - us[b])
  let sizes = byU.map(i => sizeAt(i, wanted[i]))
  const apart = byU.map((i, k) => (k > 0 && groupOf(i) !== groupOf(byU[k - 1]) ? groupGap : 0))
  const settle = () => {
    const spots = spread(byU.map(i => us[i]), sizes, apart)
    const lo = Math.min(...spots.map((v, k) => v - sizes[k] / 2))
    const hi = Math.max(...spots.map((v, k) => v + sizes[k] / 2))
    const shift = lo < 0 ? -lo : hi > U ? U - hi : 0
    return spots.map(v => v + shift)
  }
  let spots = settle()
  sizes = byU.map((i, k) => sizeAt(i, fromU(spots[k])))
  spots = settle()
  const out: number[] = []
  byU.forEach((i, k) => (out[i] = fromU(spots[k])))
  return out
}

const hits = (box: ScreenRect, avoid: ScreenRect[], pad: number) => avoid.some(r => box.x < r.x + r.width + pad && r.x < box.x + box.width + pad && box.y < r.y + r.height + pad && r.y < box.y + box.height + pad)

interface Placing {
  kept: LabelInput[]
  left: string[]
  /** Where a label stands along its line. */
  wanted: Map<string, number>
  /** Positions along the line, spread from where each label wants to be. */
  place(): Map<string, number>
  /** The line a label stands on: its length, whether it closes on itself, and a key shared by the labels on it. */
  lineOf(id: string): { length: number; group: string }
  /** Whether two labels may trade places to uncross their leaders. */
  canSwap(a: string, b: string): boolean
  box(label: LabelInput, pos: number): { x: number; y: number; width: number; side: LabelSide; align: LabelAlign; from: Vec2 }
  /** The other lines a label could stand on, nearest first, for when its own is full. */
  otherLines(id: string): string[]
  /** Moves a label to another line; where on it the label wants to be. */
  moveTo(id: string, group: string): number
}

/**
 * Labels along the screen's sides, each near its room: see `placeSides`.
 * Leaders that still cross swap places a
 * bounded number of times. What does not fit is left out, the last given
 * first; the host orders labels by importance. Nothing is placed over the
 * rectangles in `avoid`. Pure, so any host lays out the same way.
 */
export function layoutLabels(labels: LabelInput[], width: number, height: number, options: LabelLayoutOptions = {}): LabelLayout {
  if (!labels.length) return { placed: [], left: [] }
  const spacing = options.spacing ?? 8
  const groups = labelGroups(labels.map(l => l.plan ?? l.anchor))
  const settings = { spacing, margin: options.margin ?? 24, avoid: options.avoid ?? [], clearance: options.clearance ?? spacing, groupOf: new Map(labels.map((l, i) => [l.id, groups[i]])) }
  const placing = placeSides(labels, width, height, settings)
  const { kept, wanted } = placing
  let at = placing.place()
  for (let round = 0; round < kept.length * kept.length; round++) {
    const from = new Map(kept.map(l => [l.id, placing.box(l, at.get(l.id)!).from]))
    let swapped = false
    for (let i = 0; i < kept.length && !swapped; i++) {
      for (let j = i + 1; j < kept.length && !swapped; j++) {
        const a = kept[i]
        const b = kept[j]
        if (!placing.canSwap(a.id, b.id) || !crosses(a.anchor, from.get(a.id)!, b.anchor, from.get(b.id)!)) continue
        const wa = wanted.get(a.id)!
        wanted.set(a.id, wanted.get(b.id)!)
        wanted.set(b.id, wa)
        at = placing.place()
        swapped = true
      }
    }
    if (!swapped) break
  }
  const dropped = new Set<string>()
  at = clear(placing, at, settings, dropped)
  const shown = kept.filter(l => !dropped.has(l.id))
  const rectOf = (l: LabelInput, pos: number): ScreenRect => {
    const b = placing.box(l, pos)
    return { x: b.x, y: b.y, width: b.width, height: l.height }
  }
  for (let round = 0; round < shown.length * shown.length; round++) {
    let swapped = false
    for (let i = 0; i < shown.length && !swapped; i++) {
      for (let j = i + 1; j < shown.length && !swapped; j++) {
        const a = shown[i]
        const b = shown[j]
        if (!placing.canSwap(a.id, b.id) || !crosses(a.anchor, placing.box(a, at.get(a.id)!).from, b.anchor, placing.box(b, at.get(b.id)!).from)) continue
        const trial = new Map(at)
        trial.set(a.id, at.get(b.id)!)
        trial.set(b.id, at.get(a.id)!)
        const others = shown.filter(l => l !== a && l !== b).map(l => rectOf(l, trial.get(l.id)!))
        const ra = rectOf(a, trial.get(a.id)!)
        const rb = rectOf(b, trial.get(b.id)!)
        if (hits(ra, [...others, rb, ...settings.avoid], settings.spacing / 2 - 1e-6) || hits(rb, [...others, ...settings.avoid], settings.spacing / 2 - 1e-6)) continue
        at = trial
        swapped = true
      }
    }
    if (!swapped) break
  }
  const placed = shown.map(l => {
    const { x, y, width: w, side, align, from } = placing.box(l, at.get(l.id)!)
    return { id: l.id, x, y, width: w, side, align, leader: { from, to: l.anchor } }
  })
  return { placed, left: [...kept.filter(l => dropped.has(l.id)).map(l => l.id), ...placing.left] }
}

/**
 * Spreading along a line keeps labels apart along it, but a bending track
 * can still bring two boxes together on screen, so every layout ends here:
 * in each line's order, a label that meets one already kept, or anything to
 * avoid, slides on along its line until it is clear, and is left out when
 * it finds no clear spot. No two kept labels overlap, by construction.
 */
function clear(placing: Placing, at: Map<string, number>, { spacing, avoid }: Settings, dropped: Set<string>): Map<string, number> {
  const out = new Map(at)
  const kept: ScreenRect[] = []
  const rect = (l: LabelInput, pos: number): ScreenRect => {
    const b = placing.box(l, pos)
    return { x: b.x, y: b.y, width: b.width, height: l.height }
  }
  const free = (r: ScreenRect) => !hits(r, [...kept, ...avoid], spacing / 2 - 1e-6)
  const byLine = new Map<string, LabelInput[]>()
  for (const l of placing.kept) {
    const key = placing.lineOf(l.id).group
    byLine.set(key, [...(byLine.get(key) ?? []), l])
  }
  for (const list of byLine.values()) {
    for (const l of list.sort((a, b) => out.get(a.id)! - out.get(b.id)!)) {
      const step = Math.max(2, spacing / 2)
      /** The free spot on the label's line nearest `from`, looking both ways. */
      const search = (from: number, length: number) => {
        for (let d = 0; d <= length; d += step) {
          for (const t of d ? [from + d, from - d] : [from]) if (t >= 0 && t <= length && free(rect(l, t))) return t
        }
        return null
      }
      let found = search(out.get(l.id)!, placing.lineOf(l.id).length)
      if (found === null) {
        const home = placing.lineOf(l.id).group
        for (const other of placing.otherLines(l.id)) {
          const from = placing.moveTo(l.id, other)
          found = search(from, placing.lineOf(l.id).length)
          if (found !== null) break
        }
        if (found === null) placing.moveTo(l.id, home)
      }
      if (found === null) {
        dropped.add(l.id)
        continue
      }
      out.set(l.id, found)
      kept.push(rect(l, found))
    }
  }
  return out
}

interface Settings {
  spacing: number
  margin: number
  avoid: ScreenRect[]
  clearance: number
  /** Which group each label's room belongs to, by id. */
  groupOf: Map<string, number>
}

/** How far down a label its leader meets it. */
const portOf = (l: Pick<LabelInput, 'height' | 'port'>) => l.port ?? l.height / 2



type Side = LabelSide

/** At most how many times the least spacing a side spreads its labels and groups by, when it has the room. */
const AIR = 2

/** How much more a vertical leader costs than a level one of the same length, as a share of its length. */
const STEEPNESS = 1

/**
 * At the sides: a row along the top and the bottom of the screen and a
 * column along its left and right between them, inside the margins. Each
 * label goes to the side its leader costs least to reach, a leader's cost
 * being its length with steep ones counting more, the labels with the
 * clearest choice first, a side that is full sending the rest to their next
 * cheapest; within a side each label wants its room's position along it,
 * so rooms close together stack as one group. Text is flush with the
 * screen's edge in a column and centred in a row; a leader ends just short
 * of the middle of the label's side facing the map. A side with room to spare
 * spreads its labels and groups further apart, up to `AIR` times the least.
 */
function placeSides(labels: LabelInput[], width: number, height: number, { spacing, margin, avoid, clearance, groupOf }: Settings): Placing {
  const wide = Math.max(...labels.map(l => l.width))
  const rowWide = Math.max(...labels.map(l => l.rowWidth ?? l.width))
  const tall = Math.max(...labels.map(l => l.height))
  const band = tall + spacing
  const column = { from: margin + band, to: height - margin - band }
  const lineAlong = (length: number, box: (pos: number) => ScreenRect): Line => {
    const size = Math.max(1, length)
    const n = Math.max(1, Math.round(size / Math.max(1, size / 1500)))
    const ok = Array.from({ length: n }, (_, i) => {
      const b = box((i * size) / n)
      return b.x >= margin - 1e-9 && b.y >= margin - 1e-9 && b.x + b.width <= width - margin + 1e-9 && b.y + b.height <= height - margin + 1e-9 && !hits(b, avoid, spacing)
    })
    return { length: size, step: size / n, ok }
  }
  const lines: Record<Side, Line> = {
    left: lineAlong(column.to - column.from, pos => ({ x: margin, y: column.from + pos - tall / 2, width: wide, height: tall })),
    right: lineAlong(column.to - column.from, pos => ({ x: width - margin - wide, y: column.from + pos - tall / 2, width: wide, height: tall })),
    top: lineAlong(width - 2 * margin, pos => ({ x: margin + pos - rowWide / 2, y: margin, width: rowWide, height: tall })),
    bottom: lineAlong(width - 2 * margin, pos => ({ x: margin + pos - rowWide / 2, y: height - margin - tall, width: rowWide, height: tall }))
  }
  const SIDES: Side[] = ['left', 'right', 'top', 'bottom']
  const across = (side: Side) => side === 'top' || side === 'bottom'
  const size = (l: LabelInput, side: Side) => (across(side) ? l.rowWidth ?? l.width : l.height) + spacing
  const room = (side: Side) => lines[side].ok.filter(Boolean).length * lines[side].step
  /** What a leader to a side costs: its length, a steep one counting up to twice, since the eye follows a leader across more easily than down. */
  const cost = (l: LabelInput, side: Side) => {
    const [ax, ay] = l.anchor
    const port: Vec2 =
      side === 'left' ? [margin + wide + spacing, Math.max(column.from, Math.min(column.to, ay))]
      : side === 'right' ? [width - margin - wide - spacing, Math.max(column.from, Math.min(column.to, ay))]
      : side === 'top' ? [Math.max(margin, Math.min(width - margin, ax)), margin + tall + spacing]
      : [Math.max(margin, Math.min(width - margin, ax)), height - margin - tall - spacing]
    const length = Math.hypot(port[0] - ax, port[1] - ay)
    return length * (1 + STEEPNESS * (length ? Math.abs(port[1] - ay) / length : 0))
  }
  const ranked = new Map(labels.map(l => [l.id, [...SIDES].sort((a, b) => cost(l, a) - cost(l, b))]))
  /** The least room between two groups on a side: a label's height. */
  const gapOf = tall
  /**
   * Each group of labels on the side its leaders cost least to reach
   * together, the groups with the clearest choice first; a group no side
   * has room for goes label by label to each one's cheapest side with room.
   * Null when a label finds no room.
   */
  const assign = (list: LabelInput[]) => {
    const used: Record<Side, number> = { left: 0, right: 0, top: 0, bottom: 0 }
    const sides = new Map<string, Side>()
    const byGroup = new Map<number, LabelInput[]>()
    for (const l of list) byGroup.set(groupOf.get(l.id) ?? 0, [...(byGroup.get(groupOf.get(l.id) ?? 0) ?? []), l])
    const total = (members: LabelInput[], s: Side) => members.reduce((sum, l) => sum + cost(l, s), 0)
    const regret = (members: LabelInput[]) => {
      const costs = SIDES.map(s => total(members, s)).sort((x, y) => x - y)
      return costs[1] - costs[0]
    }
    for (const members of [...byGroup.values()].sort((x, y) => regret(y) - regret(x))) {
      const need = (s: Side) => members.reduce((sum, l) => sum + size(l, s), 0) + gapOf
      const whole = [...SIDES].sort((x, y) => total(members, x) - total(members, y)).find(s => used[s] + need(s) <= room(s))
      if (whole) {
        used[whole] += need(whole)
        for (const l of members) sides.set(l.id, whole)
        continue
      }
      const clearest = [...members].sort((x, y) => {
        const rx = ranked.get(x.id)!
        const ry = ranked.get(y.id)!
        return cost(y, ry[1]) - cost(y, ry[0]) - (cost(x, rx[1]) - cost(x, rx[0]))
      })
      for (const l of clearest) {
        const choice = ranked.get(l.id)!.find(s => used[s] + size(l, s) <= room(s))
        if (!choice) return null
        used[choice] += size(l, choice)
        sides.set(l.id, choice)
      }
    }
    return sides
  }
  const kept = [...labels]
  const left: string[] = []
  let side = assign(kept)
  while (!side && kept.length > 1) {
    left.unshift(kept.pop()!.id)
    side = assign(kept)
  }
  if (!side) side = new Map(kept.map(l => [l.id, ranked.get(l.id)![0]]))
  const along = (l: LabelInput, s: Side) => (across(s) ? l.anchor[0] - margin : l.anchor[1] - column.from)
  const wanted = new Map(kept.map(l => [l.id, along(l, side.get(l.id)!)]))
  return {
    kept,
    left,
    wanted,
    canSwap: (a, b) => side.get(a) === side.get(b),
    lineOf: id => ({ length: lines[side.get(id)!].length, group: side.get(id)! }),
    otherLines: id => ranked.get(id)!.filter(s => s !== side.get(id)),
    moveTo(id, group) {
      const l = kept.find(x => x.id === id)!
      side.set(id, group as Side)
      const pos = along(l, group as Side)
      wanted.set(id, pos)
      return pos
    },
    place() {
      const at = new Map<string, number>()
      for (const s of SIDES) {
        const list = kept.filter(l => side.get(l.id) === s)
        if (!list.length) continue
        const groups = new Set(list.map(l => groupOf.get(l.id) ?? 0)).size
        const tight = list.reduce((sum, l) => sum + size(l, s), 0) + (groups - 1) * gapOf
        const air = Math.max(1, Math.min(AIR, room(s) / tight))
        const spots = spreadOn(lines[s], list.map(l => wanted.get(l.id)!), i => size(list[i], s) + spacing * (air - 1), i => groupOf.get(list[i].id) ?? 0, gapOf * air)
        list.forEach((l, i) => at.set(l.id, spots[i]))
      }
      return at
    },
    box(l, pos) {
      const s = side.get(l.id)!
      if (across(s)) {
        const w = l.rowWidth ?? l.width
        const x = Math.max(margin, Math.min(width - margin - w, margin + pos - w / 2))
        const y = s === 'top' ? margin : height - margin - l.height
        return { x, y, width: w, side: s, align: 'center', from: [x + w / 2, s === 'top' ? y + l.height + clearance : y - clearance] }
      }
      const y = Math.max(column.from - tall / 2, Math.min(column.to + tall / 2 - l.height, column.from + pos - portOf(l)))
      const x = s === 'left' ? margin : width - margin - l.width
      return { x, y, width: l.width, side: s, align: s, from: [s === 'left' ? x + l.width + clearance : x - clearance, y + l.height / 2] }
    }
  }
}
