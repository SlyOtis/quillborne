import { ExpressionError, getExpressionNames, getExpressionValue, type Scope } from './expression'
import type {
  CharacterSheet,
  ResolvedAttribute,
  ResolvedCharacter,
  ResolvedPool,
  ResolvedSkill,
  ResolvedValue,
  RuleSystem,
  SkillSpec
} from './spec.types'

type Node = {
  key: string
  source: string
  locals: Scope
}

export class RuleCycleError extends Error {
  readonly path: string[]

  constructor(path: string[]) {
    super(`Rule values form a cycle: ${path.join(' -> ')}`)
    this.name = 'RuleCycleError'
    this.path = path
  }
}

function getProficiencyMultiplier(system: RuleSystem, tierId: string | undefined): { id: string; multiplier: number } {
  const tiers = system.proficiencyTiers
  const fallback = tiers[0] ?? { id: 'none', title: 'None', multiplier: 0 }
  if (!tierId) return { id: fallback.id, multiplier: fallback.multiplier }
  const tier = tiers.find((candidate) => candidate.id === tierId)
  if (!tier) return { id: fallback.id, multiplier: fallback.multiplier }
  return { id: tier.id, multiplier: tier.multiplier }
}

function getDefaultModifier(spec: SkillSpec): string {
  return spec.modifier ?? `mod.${spec.attribute} + prof * tier`
}

function getStepValues(system: RuleSystem, level: number): Scope {
  const scope: Scope = {}
  for (const step of system.progression.steps) {
    if (step.level > level) continue
    for (const [key, value] of Object.entries(step.values)) scope[`step.${key}`] = value
  }
  return scope
}

export function getResolvedCharacter(system: RuleSystem, sheet: CharacterSheet): ResolvedCharacter {
  const level = Math.max(1, Math.min(sheet.level, system.progression.maxLevel))
  const scope: Scope = { level, ...getStepValues(system, level) }

  for (const attribute of system.attributes) {
    const score = sheet.attributes[attribute.id] ?? attribute.default
    scope[`attr.${attribute.id}`] = Math.max(attribute.min, Math.min(score, attribute.max))
  }

  for (const [key, value] of Object.entries(sheet.bonuses ?? {})) scope[`bonus.${key}`] = value

  scope.prof = Math.round(getExpressionValue(system.progression.proficiency, scope))

  const nodes = new Map<string, Node>()

  for (const attribute of system.attributes) {
    nodes.set(`mod.${attribute.id}`, {
      key: `mod.${attribute.id}`,
      source: attribute.modifier,
      locals: { score: scope[`attr.${attribute.id}`] }
    })
  }

  for (const save of system.saves) {
    const tier = getProficiencyMultiplier(system, sheet.proficiencies?.[`save.${save.id}`])
    nodes.set(`save.${save.id}`, {
      key: `save.${save.id}`,
      source: getDefaultModifier(save),
      locals: { tier: tier.multiplier }
    })
  }

  for (const skill of system.skills) {
    const tier = getProficiencyMultiplier(system, sheet.proficiencies?.[`skill.${skill.id}`])
    nodes.set(`skill.${skill.id}`, {
      key: `skill.${skill.id}`,
      source: getDefaultModifier(skill),
      locals: { tier: tier.multiplier }
    })
  }

  for (const derived of system.derived) {
    nodes.set(`derived.${derived.id}`, { key: `derived.${derived.id}`, source: derived.value, locals: {} })
  }

  for (const sense of system.senses) {
    nodes.set(`sense.${sense.id}`, { key: `sense.${sense.id}`, source: sense.value, locals: {} })
  }

  for (const pool of system.pools) {
    nodes.set(`pool.${pool.id}.max`, { key: `pool.${pool.id}.max`, source: pool.max, locals: {} })
  }

  const resolving: string[] = []

  const resolve = (key: string): number => {
    if (scope[key] !== undefined) return scope[key]

    const node = nodes.get(key)
    if (!node) {
      if (key.startsWith('bonus.') || key.startsWith('step.')) {
        scope[key] = 0
        return 0
      }
      throw new ExpressionError(`Unknown name "${key}"`, key, 0)
    }

    if (resolving.includes(key)) throw new RuleCycleError([...resolving, key])
    resolving.push(key)

    const local: Scope = { ...scope, ...node.locals }
    for (const name of getExpressionNames(node.source)) {
      if (local[name] !== undefined) continue
      local[name] = resolve(name)
    }

    const value = getExpressionValue(node.source, local)
    resolving.pop()
    scope[key] = value
    return value
  }

  for (const key of nodes.keys()) resolve(key)

  const attributes: ResolvedAttribute[] = system.attributes.map((attribute) => ({
    id: attribute.id,
    title: attribute.title,
    short: attribute.short,
    score: scope[`attr.${attribute.id}`],
    value: scope[`mod.${attribute.id}`]
  }))

  const saves: ResolvedSkill[] = system.saves.map((save) => {
    const tier = getProficiencyMultiplier(system, sheet.proficiencies?.[`save.${save.id}`])
    return {
      id: save.id,
      title: save.title,
      attribute: save.attribute,
      tier: tier.id,
      multiplier: tier.multiplier,
      value: scope[`save.${save.id}`]
    }
  })

  const skills: ResolvedSkill[] = system.skills.map((skill) => {
    const tier = getProficiencyMultiplier(system, sheet.proficiencies?.[`skill.${skill.id}`])
    return {
      id: skill.id,
      title: skill.title,
      attribute: skill.attribute,
      tier: tier.id,
      multiplier: tier.multiplier,
      value: scope[`skill.${skill.id}`]
    }
  })

  const senses: ResolvedValue[] = system.senses.map((sense) => ({
    id: sense.id,
    title: sense.title,
    unit: sense.unit,
    value: scope[`sense.${sense.id}`]
  }))

  const pools: ResolvedPool[] = system.pools.map((pool) => {
    const max = scope[`pool.${pool.id}.max`]
    const spent = Math.max(0, Math.min(sheet.pools?.[pool.id] ?? 0, max))
    return {
      id: pool.id,
      title: pool.title,
      description: pool.description,
      regainedAt: pool.regainedAt,
      max,
      spent,
      remaining: max - spent,
      regain: pool.regainAmount ? getExpressionValue(pool.regainAmount, scope) : max,
      view: pool.view ?? 'plate'
    }
  })

  const derived: ResolvedValue[] = system.derived
    .filter((entry) => !entry.hidden)
    .map((entry) => ({
      id: entry.id,
      title: entry.title,
      unit: entry.unit,
      value: scope[`derived.${entry.id}`]
    }))

  return {
    system,
    level,
    proficiency: scope.prof,
    attributes,
    saves,
    skills,
    senses,
    pools,
    derived,
    panels: system.panels,
    scope
  }
}
