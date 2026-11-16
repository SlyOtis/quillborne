import type { ProgressionSpec, RuleSystem, RuleSystemOverlay } from './spec.types'

const SYSTEM_PATH = '/sources/systems'

const cache = new Map<string, RuleSystem>()

type Keyed = { id: string }

function mergeKeyed<T extends Keyed>(base: T[], overlay: T[] | undefined): T[] {
  if (!overlay) return base
  const merged = base.map((entry) => ({ ...entry }))
  for (const entry of overlay) {
    const index = merged.findIndex((candidate) => candidate.id === entry.id)
    if (index === -1) merged.push({ ...entry })
    else merged[index] = { ...merged[index], ...entry }
  }
  return merged
}

function mergeProgression(base: ProgressionSpec, overlay: ProgressionSpec | undefined): ProgressionSpec {
  if (!overlay) return base
  const steps = [...base.steps]
  for (const step of overlay.steps ?? []) {
    const index = steps.findIndex((candidate) => candidate.level === step.level)
    if (index === -1) steps.push({ ...step })
    else steps[index] = { level: step.level, values: { ...steps[index].values, ...step.values } }
  }
  steps.sort((a, b) => a.level - b.level)
  return {
    maxLevel: overlay.maxLevel ?? base.maxLevel,
    proficiency: overlay.proficiency ?? base.proficiency,
    steps
  }
}

export function getMergedSystem(base: RuleSystem, overlay: RuleSystemOverlay): RuleSystem {
  return {
    id: overlay.id,
    title: overlay.title,
    version: overlay.version,
    description: overlay.description ?? base.description,
    extends: base.extends,
    attributes: mergeKeyed(base.attributes, overlay.attributes),
    proficiencyTiers: mergeKeyed(base.proficiencyTiers, overlay.proficiencyTiers),
    skills: mergeKeyed(base.skills, overlay.skills),
    saves: mergeKeyed(base.saves, overlay.saves),
    senses: mergeKeyed(base.senses, overlay.senses),
    pools: mergeKeyed(base.pools, overlay.pools),
    derived: mergeKeyed(base.derived, overlay.derived),
    progression: mergeProgression(base.progression, overlay.progression),
    advancement: overlay.advancement ?? base.advancement,
    panels: mergeKeyed(base.panels, overlay.panels),
    conditions: mergeKeyed(base.conditions ?? [], overlay.conditions),
    damageTypes: mergeKeyed(base.damageTypes ?? [], overlay.damageTypes),
    defences: mergeKeyed(base.defences ?? [], overlay.defences),
    bonuses: mergeKeyed(base.bonuses ?? [], overlay.bonuses),
    speeds: mergeKeyed(base.speeds ?? [], overlay.speeds),
    recharges: mergeKeyed(base.recharges ?? [], overlay.recharges),
    items: overlay.items ?? base.items
  }
}

async function getSystemDocument(id: string): Promise<RuleSystem> {
  const response = await fetch(`${SYSTEM_PATH}/${id}.json`)
  if (!response.ok) throw new Error(`Rule system "${id}" did not load: ${response.status} ${response.statusText}`)
  return (await response.json()) as RuleSystem
}

export async function getSystem(id: string, seen: string[] = []): Promise<RuleSystem> {
  const cached = cache.get(id)
  if (cached) return cached
  if (seen.includes(id)) throw new Error(`Rule system "${id}" extends itself through ${seen.join(' -> ')}`)

  const document = await getSystemDocument(id)
  let resolved = document

  for (const parentId of document.extends ?? []) {
    const parent = await getSystem(parentId, [...seen, id])
    resolved = getMergedSystem(parent, resolved as RuleSystemOverlay)
  }

  cache.set(id, resolved)
  return resolved
}

export async function getSystemStack(ids: string[], overlay?: RuleSystemOverlay): Promise<RuleSystem> {
  if (ids.length === 0) throw new Error('A character needs at least one rule system')

  let resolved = await getSystem(ids[0])
  for (const id of ids.slice(1)) {
    const next = await getSystem(id)
    resolved = getMergedSystem(resolved, next as RuleSystemOverlay)
  }
  if (overlay) resolved = getMergedSystem(resolved, overlay)

  return resolved
}

export async function getSystems(): Promise<RuleSystem[]> {
  const response = await fetch(`${SYSTEM_PATH}/index.json`)
  if (!response.ok) throw new Error(`The rule system index did not load: ${response.status} ${response.statusText}`)

  const listed = (await response.json()) as { systems: string[] }
  return Promise.all(listed.systems.map((id) => getSystem(id)))
}

export function clearSystemCache(): void {
  cache.clear()
}
