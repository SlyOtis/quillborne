import type { EntityRef, Level, MapDocument, Space } from './types'
import { uid } from './document'

/**
 * What some features of a map mean for one use of it. The map holds the
 * building; a binding says what one or more of its features stand for here:
 * a link to something outside the map (a meeting room, a bookable) and a
 * label to show, the two nimap itself reads, and anything else the host
 * keeps in `data`, such as an icon its own presenter draws. Several
 * features under one binding are one thing: a suite of rooms booked as one,
 * a bathroom of stalls under one label. A feature is a room (a unit) or a
 * traced object (a fixture), by its id.
 */
export interface Binding {
  id: string
  features: string[]
  link?: EntityRef
  label?: string
  data?: Record<string, unknown>
}

/** The bindings of one use of one map. Stored apart from the map, so the same building can be bound differently by different uses. */
export interface Bindings {
  format: 'nimap-bindings'
  version: 1
  /** The document the bindings refer into. */
  mapId: string
  bindings: Binding[]
}

export type FeatureKind = 'room' | 'object'

/** A feature a binding covers, found in the document. */
export interface BoundFeature {
  id: string
  kind: FeatureKind
  levelId: string
}

export interface ResolvedBindings {
  /** Each binding with the features it covers that still exist. */
  bindings: { binding: Binding; features: BoundFeature[] }[]
  /** The binding covering each feature, by feature id. */
  byFeature: Map<string, Binding>
  /** Feature ids a binding names that the document no longer has, by binding id: left by an edit that removed or split what they named. */
  missing: Map<string, string[]>
}

export function createBindings(map: MapDocument, bindings: Binding[] = []): Bindings {
  return { format: 'nimap-bindings', version: 1, mapId: map.id, bindings }
}

/** Every feature of the document a binding may cover, by id. */
export function featuresOf(map: MapDocument): Map<string, BoundFeature> {
  const features = new Map<string, BoundFeature>()
  for (const level of map.levels) {
    for (const u of level.units) features.set(u.id, { id: u.id, kind: 'room', levelId: level.id })
    for (const f of level.fixtures) features.set(f.id, { id: f.id, kind: 'object', levelId: level.id })
  }
  return features
}

/** The bindings read against the document: what each covers, which binding covers each feature, and what they name that is gone. A feature named by two bindings belongs to the first; `validateBindings` refuses that case. */
export function resolveBindings(map: MapDocument, set: Bindings): ResolvedBindings {
  const features = featuresOf(map)
  const byFeature = new Map<string, Binding>()
  const missing = new Map<string, string[]>()
  const bindings = set.bindings.map(binding => {
    const found: BoundFeature[] = []
    const gone: string[] = []
    for (const id of binding.features) {
      const feature = features.get(id)
      if (!feature) gone.push(id)
      else {
        found.push(feature)
        if (!byFeature.has(id)) byFeature.set(id, binding)
      }
    }
    if (gone.length) missing.set(binding.id, gone)
    return { binding, features: found }
  })
  return { bindings, byFeature, missing }
}

/** Problems that make bindings wrong for their map: another map's bindings, a binding covering nothing, a feature in two bindings, a duplicate id. Features a binding names that are gone are reported by `resolveBindings`, not here: an edit may leave them until the host re-binds. */
export function validateBindings(map: MapDocument, set: Bindings): string[] {
  const problems: string[] = []
  if (set.mapId !== map.id) problems.push(`Bindings are for map ${set.mapId}, not ${map.id}`)
  const ids = new Set<string>()
  const owner = new Map<string, string>()
  for (const b of set.bindings) {
    if (ids.has(b.id)) problems.push(`Binding id ${b.id} is used twice`)
    ids.add(b.id)
    if (!b.features.length) problems.push(`Binding ${b.id} covers no feature`)
    for (const f of b.features) {
      const first = owner.get(f)
      if (first && first !== b.id) problems.push(`Feature ${f} is in bindings ${first} and ${b.id}`)
      else owner.set(f, b.id)
    }
  }
  return problems
}

/** The key a link is known by, so a host's statuses can be looked up whatever kind of thing it links to. */
export const linkKey = (link: EntityRef): string => `${link.kind}:${link.id}`

/** A status per feature from statuses per link: every feature of a linked binding takes its link's status. */
export function statusByFeature<S>(resolved: ResolvedBindings, statusOfLink: ReadonlyMap<string, S>): Map<string, S> {
  const out = new Map<string, S>()
  for (const { binding, features } of resolved.bindings) {
    if (!binding.link) continue
    const status = statusOfLink.get(linkKey(binding.link))
    if (status === undefined) continue
    for (const f of features) out.set(f.id, status)
  }
  return out
}

/**
 * The bindings a document written before bindings existed already implies: each
 * space becomes one binding over its rooms with its name and link; each
 * room outside a space with a name or a link becomes a binding of its own.
 * A way to carry old maps over, not a rule for new ones.
 */
export function bindingsFromDocument(map: MapDocument): Binding[] {
  return map.levels.flatMap(level => levelBindings(level))
}

function levelBindings(level: Level): Binding[] {
  const inSpace = new Set((level.spaces ?? []).flatMap(s => s.units))
  const fromSpaces: Binding[] = (level.spaces ?? []).filter(s => s.units.length).map(s => ({
    id: uid(),
    features: [...s.units],
    ...(s.ref ? { link: { ...s.ref } } : {}),
    ...(s.name ? { label: s.name } : {})
  }))
  const fromRooms: Binding[] = level.units
    .filter(u => !inSpace.has(u.id) && (u.name || u.ref))
    .map(u => ({ id: uid(), features: [u.id], ...(u.ref ? { link: { ...u.ref } } : {}), ...(u.name ? { label: u.name } : {}) }))
  return [...fromSpaces, ...fromRooms]
}

/** The bindings with these features bound as one thing: taken out of any binding that held them (one left covering nothing goes), and put in one new binding, which keeps the link, label and data of the first binding that held any of them. */
export function bindTogether(bindings: Binding[], features: string[]): Binding[] {
  const taken = new Set(features)
  const first = bindings.find(b => b.features.some(f => taken.has(f)))
  const rest = unbind(bindings, features)
  const kept = first ? { ...(first.link ? { link: first.link } : {}), ...(first.label ? { label: first.label } : {}), ...(first.data ? { data: first.data } : {}) } : {}
  return [...rest, { id: uid(), features: [...taken], ...kept }]
}

/** The bindings with these features taken out of whatever binding held them; a binding left covering nothing goes. */
export function unbind(bindings: Binding[], features: string[]): Binding[] {
  const taken = new Set(features)
  return bindings.map(b => (b.features.some(f => taken.has(f)) ? { ...b, features: b.features.filter(f => !taken.has(f)) } : b)).filter(b => b.features.length)
}

/** The bindings with one binding's link, label or data changed; `undefined` removes the field. */
export function patchBinding(bindings: Binding[], id: string, patch: Partial<Pick<Binding, 'link' | 'label' | 'data'>>): Binding[] {
  return bindings.map(b => {
    if (b.id !== id) return b
    const next: Binding = { ...b, ...patch }
    for (const key of ['link', 'label', 'data'] as const) if (key in patch && patch[key] === undefined) delete next[key]
    return next
  })
}

/** The bindings with every linked one that has no label of its own named as its link is in the host's data, so a binding's label is only ever an override of that name. */
export function withLinkNames(bindings: Binding[], nameOf: (link: EntityRef) => string | undefined): Binding[] {
  return bindings.map(b => {
    if (b.label || !b.link) return b
    const name = nameOf(b.link)
    return name ? { ...b, label: name } : b
  })
}

/** The bindings covering any of these features, in the order they are listed. */
export function bindingsOf(bindings: Binding[], features: string[]): Binding[] {
  const wanted = new Set(features)
  return bindings.filter(b => b.features.some(f => wanted.has(f)))
}

/**
 * A level as its bindings describe it, in the terms a renderer reads: a
 * binding over one room gives that room its label as name and its link as
 * ref; a binding over several rooms is a space with the label and link; a
 * room no binding covers has neither. Every object a binding covers takes
 * its label as name and its link as ref. The level's own names, refs and
 * spaces are replaced, never merged.
 */
export function applyBindings(level: Level, bindings: Binding[]): Level {
  const rooms = new Set(level.units.map(u => u.id))
  const single = new Map<string, Binding>()
  const spaces: Space[] = []
  for (const b of bindings) {
    const covered = b.features.filter(f => rooms.has(f))
    if (covered.length === 1) single.set(covered[0], b)
    else if (covered.length > 1) {
      const first = level.units.find(u => u.id === covered[0])!
      spaces.push({ id: b.id, name: b.label ?? '', category: first.category, units: covered, ...(b.link ? { ref: { ...b.link } } : {}) })
    }
  }
  const units = level.units.map(u => {
    const { ref: _ref, ...rest } = u
    const b = single.get(u.id)
    return { ...rest, name: b?.label ?? '', ...(b?.link ? { ref: { ...b.link } } : {}) }
  })
  const objects = new Map<string, Binding>()
  for (const b of bindings) for (const f of b.features) if (!objects.has(f)) objects.set(f, b)
  const fixtures = level.fixtures.map(f => {
    const { ref: _ref, ...rest } = f
    const b = objects.get(f.id)
    return b ? { ...rest, ...(b.label ? { name: b.label } : {}), ...(b.link ? { ref: { ...b.link } } : {}) } : rest
  })
  return { ...level, units, spaces, fixtures }
}
