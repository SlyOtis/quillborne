import type {
  ComponentDef,
  ComponentPanel,
  ComponentProperty,
  ComponentState,
  Condition,
  CoreStats,
  Crewman,
  CrewPerk,
  InstalledComponent,
  Issue,
  KeyValue,
  Layout,
  MapInfo,
  PanelSection,
  Perk,
  Placed,
  Rulings,
  Shot,
  ShotProperty,
  ShotRanges,
  Slot,
  StatDiff,
  StatLine,
  Tone,
  VehicleContext,
  VehicleOverlay,
  VehicleSystem,
  VehicleTemplate,
  WeaponMode
} from './vehicle.types'
import type { Character } from '../character.types'
import type { ResolvedCharacter } from './spec.types'
import { getResolvedCharacter } from './derive'
import { getSheet } from './sheet'
import { getSystemStack } from './system'

const VEHICLE_PATH = '/sources/systems/vehicles'

const cache = new Map<string, VehicleSystem>()

export async function getVehicleSystem(id: string): Promise<VehicleSystem> {
  const cached = cache.get(id)
  if (cached) return cached
  const response = await fetch(`${VEHICLE_PATH}/${id}.json`)
  if (!response.ok) throw new Error(`Vehicle system "${id}" did not load: ${response.status} ${response.statusText}`)
  const system = (await response.json()) as VehicleSystem
  cache.set(id, system)
  return system
}

export async function getVehicleSystems(): Promise<VehicleSystem[]> {
  const response = await fetch(`${VEHICLE_PATH}/index.json`)
  if (!response.ok) throw new Error(`The vehicle system index did not load: ${response.status} ${response.statusText}`)
  const listed = (await response.json()) as { systems: string[] }
  return Promise.all(listed.systems.map((id) => getVehicleSystem(id)))
}

export function getMergedVehicleSystem(system: VehicleSystem, overlay: VehicleOverlay | null | undefined): VehicleSystem {
  if (!overlay?.components?.length) return system
  const components = system.components.map((entry) => ({ ...entry }))
  for (const entry of overlay.components) {
    const index = components.findIndex((candidate) => candidate.key === entry.key)
    const homebrew = { ...entry, homebrew: true }
    if (index === -1) components.push(homebrew)
    else components[index] = { ...components[index], ...homebrew }
  }
  return { ...system, components }
}

export function getRuling(rulings: Rulings, id: string, system: VehicleSystem): string {
  return rulings[id] ?? system.rulings.find((entry) => entry.id === id)?.provisionalOption ?? ''
}

const pending = (rulings: Rulings, id: string) => (rulings[id] ? undefined : id)

export const getSigned = (n: number) => (n >= 0 ? `+${n}` : `${n}`)

const getTitled = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

const getRounded = (n: number) => Math.round(n * 100) / 100

const getRange = (n: number | null) => (n == null ? '—' : n.toLocaleString('en-US'))

const getFilled = (template: string, values: Record<string, string | number>) =>
  template.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key] ?? `{${key}}`))

const CONDITION_TONE: Record<Condition, Tone> = { functional: 'good', impaired: 'warn', broken: 'bad' }

export function getDef(system: VehicleSystem, key: string): ComponentDef | undefined {
  return system.components.find((entry) => entry.key === key)
}

export function getLayout(system: VehicleSystem, key: string): Layout | undefined {
  return system.layouts.find((entry) => entry.key === key)
}

export function getPlaced(system: VehicleSystem, components: InstalledComponent[]): Placed[] {
  return components.flatMap((component) => {
    const def = getDef(system, component.component)
    return def ? [{ ...component, def }] : []
  })
}

export function getInstalled(components: Placed[]): InstalledComponent[] {
  return components.map(({ id, slot, component, label, x, y, rotation, override, overrideReason }) => ({
    id,
    slot,
    component,
    label,
    x,
    y,
    rotation,
    override,
    overrideReason
  }))
}

export function getMissing(system: VehicleSystem, components: InstalledComponent[]): InstalledComponent[] {
  return components.filter((component) => !getDef(system, component.component))
}

export function getCore(system: VehicleSystem, def: ComponentDef): CoreStats {
  const s = def.stats
  const q = def.quality ? system.qualities[def.quality] : undefined
  return {
    ac: s.ac + (q?.ac ?? 0),
    dt: s.dt + (q?.dt ?? 0),
    hp: s.hp + (q?.hp ?? 0),
    it: s.it + (q?.it ?? 0),
    con: s.con + (q?.con ?? 0)
  }
}

export function getInitialState(system: VehicleSystem, def: ComponentDef): ComponentState {
  return { hp: getCore(system, def).hp, condition: 'functional', destroyed: false }
}

export function getState(ctx: VehicleContext, component: Placed): ComponentState {
  return ctx.states[component.id] ?? getInitialState(ctx.system, component.def)
}

export type DamageResult = { state: ComponentState; ignored: boolean; message: string }

function getLossCondition(prev: Condition, hp: number, it: number): Condition {
  if (hp <= 0) return 'broken'
  if (prev === 'broken') return 'broken'
  if (hp <= it) return 'impaired'
  return prev
}

function getGainCondition(system: VehicleSystem, rulings: Rulings, prev: Condition, hp: number, max: number, it: number): Condition {
  if (prev === 'broken') {
    const rule = system.rules.brokenRecovery
    const strict = getRuling(rulings, rule.ruling, system) === rule.strictWhen
    if (strict ? hp <= it : hp < it) return 'broken'
    return hp >= max ? 'functional' : 'impaired'
  }
  if (prev === 'impaired') return hp >= max ? 'functional' : 'impaired'
  return prev
}

export function getDamage(
  system: VehicleSystem,
  def: ComponentDef,
  state: ComponentState,
  amount: number,
  bypass: boolean
): DamageResult {
  const { dt, it } = getCore(system, def)
  const overflow = system.rules.destroyOverflow
  if (state.destroyed) return { state, ignored: true, message: 'The component is destroyed.' }
  if (!Number.isFinite(amount) || amount <= 0) return { state, ignored: true, message: 'No damage applied.' }
  if (state.hp === 0) {
    if (amount >= overflow) {
      return {
        state: { ...state, destroyed: true, condition: 'broken' },
        ignored: false,
        message: `A component at 0 HP took ${amount} damage (${overflow}+): destroyed.`
      }
    }
    return { state, ignored: true, message: 'The component is already at 0 HP.' }
  }
  if (!bypass && amount <= dt) return { state, ignored: true, message: `${amount} damage does not exceed DT ${dt}; ignored.` }
  const hp = Math.max(0, state.hp - amount)
  const remaining = amount - state.hp
  const destroyed = hp === 0 && remaining >= overflow
  const condition = getLossCondition(state.condition, hp, it)
  return {
    state: { ...state, hp, condition, destroyed },
    ignored: false,
    message: destroyed
      ? `Reduced to 0 HP with ${remaining} damage remaining: destroyed.`
      : `${amount} damage → ${hp} HP (${condition}).`
  }
}

export function getRepair(system: VehicleSystem, def: ComponentDef, state: ComponentState, amount: number, rulings: Rulings): DamageResult {
  const { hp: max, it } = getCore(system, def)
  if (state.destroyed) return { state, ignored: true, message: 'Destroyed components cannot regain Hit Points.' }
  if (!Number.isFinite(amount) || amount <= 0) return { state, ignored: true, message: 'No repair applied.' }
  const hp = Math.min(max, state.hp + amount)
  const condition = getGainCondition(system, rulings, state.condition, hp, max, it)
  return { state: { ...state, hp, condition }, ignored: false, message: `Repaired to ${hp} HP (${condition}).` }
}

export function getHpSet(system: VehicleSystem, def: ComponentDef, state: ComponentState, target: number, rulings: Rulings): DamageResult {
  const { hp: max, it } = getCore(system, def)
  if (state.destroyed) return { state, ignored: true, message: 'The component is destroyed.' }
  const hp = Math.max(0, Math.min(max, Math.round(target)))
  if (hp === state.hp) return { state, ignored: true, message: 'Unchanged.' }
  const condition =
    hp < state.hp ? getLossCondition(state.condition, hp, it) : getGainCondition(system, rulings, state.condition, hp, max, it)
  return { state: { ...state, hp, condition }, ignored: false, message: `Set to ${hp} HP (${condition}).` }
}

export function getConditionSet(state: ComponentState, condition: Condition | 'destroyed'): DamageResult {
  return {
    state: { ...state, condition: condition === 'destroyed' ? 'broken' : condition, destroyed: condition === 'destroyed' },
    ignored: false,
    message: `Condition set to ${condition}.`
  }
}

export function getPenalty(ctx: VehicleContext, component: Placed): Condition {
  const state = ctx.states[component.id]
  return state ? (state.destroyed ? 'broken' : state.condition) : 'functional'
}

const getProperty = <K extends ComponentProperty['key']>(def: ComponentDef, key: K) =>
  def.stats.properties?.find((entry) => entry.key === key) as Extract<ComponentProperty, { key: K }> | undefined

export function getSpeed(ctx: VehicleContext, component: Placed) {
  const speed = component.def.stats.speed
  if (!speed) return null
  const penalty = ctx.system.rules.speedPenalty
  const cond = getPenalty(ctx, component)
  if (cond === 'broken') return { primary: 0, secondary: 0, cond }
  if (cond === 'impaired') {
    return { primary: Math.max(0, speed.primary - penalty), secondary: Math.max(0, speed.secondary - penalty), cond }
  }
  return { primary: speed.primary, secondary: speed.secondary, cond }
}

const getName = (component: Placed) => component.label ?? component.def.name

export function getTopSpeed(ctx: VehicleContext): { value: number; detail: string } {
  const props = ctx.components
    .filter((c) => c.def.category === 'propulsion')
    .flatMap((c) => {
      const speed = getSpeed(ctx, c)
      return speed ? [{ c, speed }] : []
    })
  if (props.length === 0) return { value: 0, detail: 'No Propulsion components.' }
  const sorted = [...props].sort((a, b) => b.speed.primary - a.speed.primary || a.speed.secondary - b.speed.secondary)
  const [main, ...others] = sorted
  let value = main.speed.primary + others.reduce((sum, o) => sum + o.speed.secondary, 0)
  const parts = [`${getName(main.c)} primary ${main.speed.primary}`]
  for (const o of others) parts.push(`${getName(o.c)} secondary ${o.speed.secondary}`)

  const hull = ctx.components.find((c) => c.def.category === 'hull')
  if (hull && getPenalty(ctx, hull) === 'impaired') {
    value = Math.max(0, value - ctx.system.rules.speedPenalty)
    parts.push(`Impaired Hull −${ctx.system.rules.speedPenalty}`)
  }
  if (hull) {
    const light = getProperty(hull.def, 'light')
    const heavy = getProperty(hull.def, 'heavy')
    if (light && props.some((p) => p.speed.cond !== 'broken')) {
      value += light.value
      parts.push(`Light +${light.value}`)
    }
    if (heavy) {
      value = Math.max(0, value + heavy.value)
      parts.push(`Heavy ${heavy.value}`)
    }
  }
  return { value, detail: parts.join(' · ') }
}

export function getFacing(ctx: VehicleContext): { value: number | null; detail: string } {
  const controls = ctx.components.filter((c) => c.def.category === 'control')
  if (controls.length === 0) return { value: null, detail: 'No Control component.' }
  const penalty = ctx.system.rules.facingPenalty
  let best: number | null = null
  let detail = 'All Control components are Broken: no Accelerate, Decelerate or Manoeuvre.'
  for (const c of controls) {
    const cond = getPenalty(ctx, c)
    if (cond === 'broken') continue
    const base = c.def.stats.changesOfFacing ?? 0
    const value = cond === 'impaired' ? Math.max(0, base - penalty) : base
    if (best === null || value > best) {
      best = value
      detail = cond === 'impaired' ? `${getName(c)}: ${base} − ${penalty} (Impaired)` : getName(c)
    }
  }
  return { value: best, detail }
}

export function getWeight(ctx: VehicleContext): { value: number | null; detail: string; pending?: string } {
  const stated = typeof ctx.stats.weightTons === 'number' ? ctx.stats.weightTons : null
  const known = ctx.components.filter((c) => c.def.weight != null)
  const sum = known.reduce((total, c) => total + (c.def.weight ?? 0), 0)
  const missing = ctx.components.length - known.length
  const rule = ctx.system.rules.weight
  const mode = getRuling(ctx.rulings, rule.ruling, ctx.system)
  const sumDetail = `Component sum ${getRounded(sum)} t${missing ? ` (${missing} without weight)` : ''}`
  if (mode === rule.statedWhen && stated != null) return { value: stated, detail: `Stated · ${sumDetail}`, pending: pending(ctx.rulings, rule.ruling) }
  return { value: getRounded(sum), detail: sumDetail, pending: pending(ctx.rulings, rule.ruling) }
}

export function getVehicleStats(ctx: VehicleContext): StatLine[] {
  const lines: StatLine[] = []
  const hull = ctx.components.find((c) => c.def.category === 'hull')
  if (hull) {
    const core = getCore(ctx.system, hull.def)
    const state = ctx.states[hull.id]
    const cond = state ? (state.destroyed ? 'broken' : state.condition) : 'functional'
    lines.push({
      key: 'hull',
      label: 'Hull HP',
      value: `${state?.hp ?? core.hp} / ${core.hp}`,
      numeric: state?.hp ?? core.hp,
      detail: `AC ${core.ac} · DT ${core.dt} · IT ${core.it}`,
      tone: CONDITION_TONE[cond]
    })
    lines.push({ key: 'condition', label: 'Condition', value: state?.destroyed ? 'Destroyed' : getTitled(cond), tone: CONDITION_TONE[cond] })
  } else {
    lines.push({ key: 'hull', label: 'Hull HP', value: '—', detail: 'No Hull installed', tone: 'bad' })
  }
  const top = getTopSpeed(ctx)
  const stated = ctx.stats.statedTopSpeed
  lines.push({
    key: 'topSpeed',
    label: 'Top Speed',
    value: `${top.value} ft`,
    numeric: top.value,
    detail: top.detail + (typeof stated === 'number' && stated !== top.value ? ` · stat block says ${stated} ft` : '')
  })
  const facing = getFacing(ctx)
  lines.push({
    key: 'facing',
    label: 'Changes of Facing',
    value: facing.value == null ? '—' : String(facing.value),
    numeric: facing.value,
    detail: facing.detail,
    tone: facing.value == null ? 'bad' : 'default'
  })
  const weight = getWeight(ctx)
  lines.push({
    key: 'weight',
    label: 'Weight',
    value: weight.value == null ? '—' : `${weight.value} t`,
    numeric: weight.value,
    detail: weight.detail,
    pendingRuling: weight.pending
  })
  if (ctx.stats.crew != null) {
    lines.push({ key: 'crew', label: 'Crew', value: `${ctx.stats.crew}${ctx.stats.crewMax ? ` (${ctx.stats.crewMax} max)` : ''}` })
  }
  const artillery = ctx.components.filter((c) => c.def.category === 'artillery')
  if (artillery.length) {
    const ready = artillery.filter((c) => getPenalty(ctx, c) !== 'broken').length
    lines.push({
      key: 'artillery',
      label: 'Artillery',
      value: `${ready} / ${artillery.length} ready`,
      numeric: ready,
      tone: ready < artillery.length ? 'warn' : 'default'
    })
  }
  return lines
}

export function getImpairedRanges(r: ShotRanges): ShotRanges {
  return { close: null, normal: r.close, long: r.normal }
}

export function getShotRanges(system: VehicleSystem, shot: Shot, rulings: Rulings): { ranges: ShotRanges; pending?: string } {
  if (!shot.rulingRanges) return { ranges: shot.ranges }
  const choice = getRuling(rulings, shot.rulingRanges.ruling, system)
  return { ranges: shot.rulingRanges.options[choice] ?? shot.ranges, pending: pending(rulings, shot.rulingRanges.ruling) }
}

export function getPerkCount(crewman: Crewman | null, id: string): number {
  return crewman?.perks.find((p) => p.id === id)?.count ?? 0
}

function getEffects<K extends Perk['effects'][number]['kind']>(system: VehicleSystem, crewman: Crewman | null, kind: K) {
  if (!crewman) return []
  return crewman.perks.flatMap(({ id, count }) => {
    const perk = system.perks.find((p) => p.id === id)
    if (!perk) return []
    return perk.effects
      .filter((effect): effect is Extract<Perk['effects'][number], { kind: K }> => effect.kind === kind)
      .map((effect) => ({ effect, count, perk }))
  })
}

const getAbbr = (ability: string) => ability.slice(0, 3).toUpperCase()

export function getArtilleryFormula(
  system: VehicleSystem,
  abilities: string[],
  crewman: Crewman | null,
  kind: 'attack' | 'save'
): { formula: string; best: number | null; ability: string | null } {
  const abbrs = abilities.map(getAbbr)
  const base = system.rules.saveBase
  if (!crewman) {
    return {
      formula: `${kind === 'attack' ? 'd20' : `DC ${base}`} + ${abbrs.join(' or ')} mod + Artillery Proficiency`,
      best: null,
      ability: null
    }
  }
  const bonuses = getEffects(system, crewman, 'artillery_bonus')
  const prof = bonuses.reduce((sum, { effect, count }) => sum + effect.perStack * count, 0)
  const named = bonuses.map(({ perk }) => perk.name).join(', ')
  const options = abilities
    .map((ability) => ({ abbr: getAbbr(ability), mod: crewman.modifiers[ability.toLowerCase()] ?? 0 }))
    .sort((a, b) => b.mod - a.mod)
  const best = options[0] ?? { abbr: '—', mod: 0 }
  const total = best.mod + prof
  const formula =
    kind === 'attack'
      ? `d20 ${getSigned(total)} (${[`${best.abbr} ${getSigned(best.mod)}`, ...(prof ? [`${named} ${getSigned(prof)}`] : [])].join(', ')})`
      : `DC ${base + total} (${base} + ${best.abbr} ${getSigned(best.mod)}${prof ? ` + ${named} ${prof}` : ''})`
  return { formula, best: kind === 'attack' ? total : base + total, ability: best.abbr }
}

const getShotPropertyKey = (p: ShotProperty) => (p.key === 'advantage' ? `advantage:${p.target}` : p.key)

export function getShotPropertyText(system: VehicleSystem, p: ShotProperty): string {
  return getFilled(system.text.shotProperties[getShotPropertyKey(p)] ?? p.key, p as unknown as Record<string, string | number>)
}

export function getShotTag(system: VehicleSystem, p: ShotProperty): string {
  return getFilled(system.text.shotTags[getShotPropertyKey(p)] ?? p.key, p as unknown as Record<string, string | number>)
}

export function getPropertyText(system: VehicleSystem, p: ComponentProperty): string {
  const value = 'value' in p ? p.value : 0
  return getFilled(system.text.properties[p.key] ?? p.key, { value, abs: Math.abs(value) })
}

export function getWeaponModes(ctx: VehicleContext, component: Placed, crewman: Crewman | null, cond: Condition): WeaponMode[] {
  const { system, rulings } = ctx
  const def = component.def
  const s = def.stats
  const crit = system.rules.critRange - getEffects(system, crewman, 'crit_threshold').reduce((sum, { effect, count }) => sum + effect.perStack * count, 0)
  const dice = getEffects(system, crewman, 'extra_damage_dice').filter(({ effect }) => s.artilleryType && effect.artilleryTypes.includes(s.artilleryType))
  const flat = getEffects(system, crewman, 'extra_damage_flat').filter(({ effect }) => s.artilleryType && effect.artilleryTypes.includes(s.artilleryType))
  const area = system.rules.areaSave
  const areaChoice = getRuling(rulings, area.ruling, system)

  return (s.shots ?? []).map((shot) => {
    const { ranges: base, pending: rangePending } = getShotRanges(system, shot, rulings)
    const ranges = cond === 'impaired' ? getImpairedRanges(base) : base
    const f = getArtilleryFormula(system, s.abilities ?? [], crewman, shot.target)
    const notes: string[] = []
    let damage = `${shot.damage.dice} ${shot.damage.type}`
    let bonusDice = ''
    if (shot.target === 'attack') {
      for (const { effect, count, perk } of dice) {
        damage += ` + ${effect.perStack * count}${effect.die} vs ${effect.against} (${perk.name})`
        bonusDice += ` + ${effect.perStack * count}${effect.die}`
      }
      for (const { effect, count, perk } of flat) {
        damage += ` + ${effect.perStack * count} ${effect.condition} (${perk.name})`
        bonusDice += ` + ${effect.perStack * count}`
      }
      notes.push(crit < system.rules.critRange ? `Critical Hit on ${crit}–${system.rules.critRange}` : `Critical Hit on ${system.rules.critRange}`)
    }
    let ruled: string | undefined
    const saveAbility = shot.target === 'save' ? (shot.saveAbility ?? area.abilities[areaChoice] ?? null) : null
    if (shot.target === 'save') {
      if (!shot.saveAbility) ruled = pending(rulings, area.ruling)
      notes.push(saveAbility ? `${saveAbility} saving throw` : 'Saving throw ability not specified in the source')
      notes.push('Components not entirely within the area automatically succeed')
    }
    if (cond === 'impaired') notes.push('Impaired: ranges reduced')
    if (cond === 'impaired' && base.close == null && base.normal != null) ruled ??= pending(rulings, system.rules.impairedNoClose)
    if (cond === 'broken') notes.push('Broken: cannot be used to make attacks')
    return {
      key: shot.key,
      name: shot.name,
      kind: shot.target,
      toHit:
        f.best == null
          ? shot.target === 'attack'
            ? `+${(s.abilities ?? []).map(getAbbr).join('/')}`
            : `DC ${system.rules.saveBase}+${(s.abilities ?? []).map(getAbbr).join('/')}`
          : shot.target === 'attack'
            ? getSigned(f.best)
            : `DC ${f.best}${saveAbility ? ` ${getAbbr(saveAbility)}` : ''}`,
      bonus: shot.target === 'attack' ? f.best : null,
      ability: f.ability,
      damageShort: `${shot.damage.dice}${bonusDice} ${shot.damage.type}`,
      damageDice: `${shot.damage.dice}${bonusDice.replace(/ \+ (\d+)(?!d)/g, '+$1').replace(/ \+ /g, '+')}`,
      tags: shot.properties.map((p) => getShotTag(system, p)),
      unavailable: cond === 'broken',
      formula: cond === 'broken' ? 'Unavailable (Broken)' : f.formula,
      damage,
      ranges: [
        { label: 'Close', value: getRange(ranges.close), reduced: cond === 'impaired' },
        { label: 'Normal', value: getRange(ranges.normal), reduced: cond === 'impaired' },
        { label: 'Long', value: getRange(ranges.long), reduced: cond === 'impaired' }
      ],
      properties: shot.properties.map((p) => getShotPropertyText(system, p)),
      notes,
      pendingRuling: rangePending ?? ruled
    }
  })
}

export function getArcLabel(ctx: VehicleContext, component: Placed): string {
  const slot = ctx.layout.slots.find((s) => s.code === component.slot)
  if (!slot?.arc) return 'Not an artillery emplacement'
  const dir = ({ 0: 'forward', 90: 'starboard', 180: 'aft', 270: 'port' } as Record<number, string>)[slot.arc.centerDeg] ?? `${slot.arc.centerDeg}°`
  return `${slot.arc.widthDeg}° ${dir}${slot.arcRuling && !ctx.rulings[slot.arcRuling] ? ' (ruling pending)' : ''}`
}

export function getMaterial(ctx: VehicleContext, def: ComponentDef): string | null {
  if (!def.materialRuling) return def.material
  return def.materialRuling.options[getRuling(ctx.rulings, def.materialRuling.ruling, ctx.system)] ?? def.material
}

export function getPerkSummary(perk: Perk, count: number, crewman: Crewman | null): string {
  const mods = crewman?.modifiers ?? null
  const steps = ['d4', 'd6', 'd8', 'd10', 'd12']
  const step = (start: string, by: number) => steps[Math.min(steps.indexOf(start) + by, steps.length - 1)]
  const roman = ['I', 'II', 'III', 'IV', 'V', 'VI']
  const min1 = (ability: string) => (mods ? String(Math.max(1, mods[ability] ?? 0)) : `${getAbbr(ability)} mod (min 1)`)
  const coverN = mods ? Math.max(1, mods.intelligence ?? 0, mods.charisma ?? 0) : null
  const cover = coverN == null ? 'allies (INT or CHA mod)' : coverN === 1 ? '1 ally' : `${coverN} allies`
  for (const e of perk.effects) {
    switch (e.kind) {
      case 'artillery_bonus':
        return `+${e.perStack * count} to artillery attack rolls and Artillery save DCs`
      case 'crit_threshold':
        return `Your artillery attacks score a Critical Hit on ${20 - e.perStack * count}–20`
      case 'extra_damage_dice':
        return `+${e.perStack * count}${e.die} damage with ${e.artilleryTypes.map((t) => `${t.replace('_', ' ')}s`).join(' and ')} vs ${e.against}`
      case 'extra_damage_flat':
        return `Fire an Energy Ray with a damaging cantrip instead of ammo: +${e.perStack * count} damage of a cantrip’s type`
      case 'conditional_attack_bonus':
        return `+${e.value} to hit vs the ${e.condition}`
      case 'creature_size_step':
        return `Creatures count as ${e.perStack * count} size(s) larger for their AC bonus vs your artillery`
      case 'scaling':
        return getFilled(e.text, {
          n: count,
          extra2: count > 1 ? ` + ${2 * (count - 1)}` : '',
          bonus2: 2 * count,
          roman: roman[count - 1] ?? String(count),
          die: step('d4', count - 1),
          cookDie: step('d8', count - 1),
          focusDie: step('d8', count - 1),
          lowWaste: ['6', '5–6', '4–6'][Math.min(count, 3) - 1],
          weakSpotDc: 13 + 2 * (count - 1),
          gearDc: 15 + 2 * (count - 1),
          uses: `${count}×`,
          allies: count === 1 ? '1 ally' : `${count} allies`,
          enemies: count === 1 ? '1 enemy' : `${count} enemies`,
          coverCount: cover,
          speed30: 30 * count,
          miles12: 12 * count,
          chaMin1: min1('charisma'),
          intMin1: min1('intelligence'),
          wisMin1: min1('wisdom')
        })
    }
  }
  return perk.actionType
}

function getRelevantPerks(system: VehicleSystem, category: string, crewman: Crewman | null) {
  if (!crewman) return []
  return crewman.perks.flatMap(({ id, count }) => {
    const perk = system.perks.find((p) => p.id === id)
    if (!perk || !(perk.appliesTo.includes(category) || perk.appliesTo.includes('any'))) return []
    return [{ name: perk.name, count, summary: getPerkSummary(perk, count, crewman), owner: crewman.name }]
  })
}

function getQuickFacts(ctx: VehicleContext, component: Placed, cond: Condition): KeyValue[] {
  const s = component.def.stats
  const cat = component.def.category
  const out: KeyValue[] = []
  if (cond === 'impaired') out.push({ label: 'Impaired', value: ctx.system.text.impaired[cat] ?? '', tone: 'warn' })
  if (cond === 'broken') out.push({ label: 'Broken', value: ctx.system.text.broken[cat] ?? '', tone: 'bad' })
  if (cat === 'artillery') out.push({ label: 'Arc of fire', value: getArcLabel(ctx, component) })
  if (cat === 'control' && s.changesOfFacing != null) {
    const v = cond === 'broken' ? 0 : cond === 'impaired' ? Math.max(0, s.changesOfFacing - ctx.system.rules.facingPenalty) : s.changesOfFacing
    out.push({ label: 'Changes of Facing', value: String(v) })
  }
  if (cat === 'propulsion' && s.speed) {
    const eff = getSpeed(ctx, component)!
    out.push({ label: 'Speed', value: `${eff.primary}/${eff.secondary} ft` })
  }
  if (cat === 'ram' && s.ramDamage) {
    out.push({ label: 'Ram bonus', value: cond === 'broken' ? 'None' : cond === 'impaired' ? `${s.ramDamage.dice} ÷ 2` : s.ramDamage.dice })
  }
  return out
}

export function getComponentPanel(ctx: VehicleContext, component: Placed, crewman: Crewman | null): ComponentPanel {
  const { system, rulings } = ctx
  const def = component.def
  const s = def.stats
  const core = getCore(system, def)
  const state = ctx.states[component.id]
  const cond = getPenalty(ctx, component)
  const stored: Condition = state ? (state.destroyed ? 'broken' : state.condition) : 'functional'
  const cat = def.category
  const categoryName = system.categories.find((c) => c.key === cat)?.name ?? getTitled(cat)
  const sections: PanelSection[] = []
  const warnings: string[] = []

  const coreRows: KeyValue[] = [
    { label: 'AC', value: String(core.ac) },
    { label: 'DT', value: String(core.dt) },
    { label: 'HP', value: `${state?.hp ?? core.hp} / ${core.hp}`, tone: CONDITION_TONE[stored] },
    { label: 'IT', value: String(core.it) },
    { label: 'Con', value: getSigned(core.con) },
    { label: 'Condition', value: state?.destroyed ? 'Destroyed' : getTitled(stored), tone: CONDITION_TONE[stored] }
  ]

  if (cond !== 'functional') {
    sections.push({
      kind: 'text',
      title: 'Condition effects',
      items: [
        ...(state?.destroyed ? [{ title: 'Destroyed', body: system.text.destroyed, tone: 'bad' as const }] : []),
        ...(cond === 'impaired' ? [{ title: 'Impaired', body: system.text.impaired[cat] ?? '', tone: 'warn' as const }] : []),
        ...(cond === 'broken' ? [{ title: 'Broken', body: system.text.broken[cat] ?? '', tone: 'bad' as const }] : [])
      ]
    })
  }

  if (cat === 'artillery') {
    sections.push({ kind: 'modes', title: 'Shot Selection', modes: getWeaponModes(ctx, component, crewman, cond) })
    const kaiju = s.kaijuThreshold
    sections.push({
      kind: 'stats',
      title: 'Operation',
      rows: [
        { label: 'Ability', value: (s.abilities ?? []).map(getAbbr).join(' or ') },
        { label: 'Arc of Fire', value: getArcLabel(ctx, component) },
        { label: 'Action', value: system.text.artilleryAction },
        ...(kaiju ? [{ label: 'Kaiju Threshold', value: `+${kaiju.value} per attack or AoE (optional rule)` }] : [])
      ]
    })
  }
  if (cat === 'control') {
    const cof = s.changesOfFacing ?? 0
    const eff = cond === 'broken' ? 0 : cond === 'impaired' ? Math.max(0, cof - system.rules.facingPenalty) : cof
    sections.push({
      kind: 'stats',
      title: 'Manoeuvring',
      rows: [
        {
          label: 'Changes of Facing',
          value: cond === 'broken' ? 'None (Broken)' : String(eff),
          tone: cond === 'functional' ? 'default' : cond === 'impaired' ? 'warn' : 'bad',
          detail: cond === 'impaired' ? `Base ${cof}` : undefined
        },
        { label: 'Helmsman checks', value: (s.abilities ?? []).map(getAbbr).join(' or ') },
        { label: 'Type', value: getTitled(s.controlType ?? '') },
        { label: 'Helm Step', value: system.text.helmStep }
      ]
    })
  }
  if (cat === 'propulsion' && s.speed) {
    const eff = getSpeed(ctx, component)!
    const rule = system.rules.kaijuNoise
    const noisy = getProperty(def, 'noisy')
    const noise = getRuling(rulings, rule.ruling, system) === rule.noisyWhen ? noisy?.value : s.kaijuThreshold?.value
    sections.push({
      kind: 'stats',
      title: 'Propulsion',
      rows: [
        {
          label: 'Speeds (primary/secondary)',
          value: `${eff.primary}/${eff.secondary} ft`,
          detail: `Base ${s.speed.primary}/${s.speed.secondary}`,
          tone: eff.cond === 'functional' ? 'default' : 'warn'
        },
        ...(s.kaijuThreshold || noisy
          ? [{ label: 'Kaiju Threshold', value: `+${noise ?? 0} if not Broken at end of battle`, pendingRuling: pending(rulings, rule.ruling) }]
          : [])
      ]
    })
  }
  if (cat === 'ram' && s.ramDamage) {
    const dmg = cond === 'broken' ? 'None (Broken)' : cond === 'impaired' ? `${s.ramDamage.dice} halved (Impaired)` : s.ramDamage.dice
    sections.push({
      kind: 'stats',
      title: 'Ramming',
      rows: [{ label: 'Damage bonus', value: `${dmg}${s.ramDamage.type ? ` ${s.ramDamage.type}` : ' (type not stated)'}` }, ...system.text.ramming]
    })
  }
  if (s.properties?.length && cat !== 'artillery') {
    sections.push({ kind: 'text', title: 'Properties', items: s.properties.map((p) => ({ body: getPropertyText(system, p) })) })
  }
  if (s.traits?.length) sections.push({ kind: 'text', title: 'Traits', items: s.traits.map((t) => ({ title: t.name, body: t.text })) })
  if (s.actions?.length) {
    sections.push({
      kind: 'modes',
      title: 'Actions',
      modes: s.actions.map((a) => {
        const hit = a.text.match(/Hit: \d+ \(([^)]+)\) (\w+)/)
        return {
          key: a.name,
          name: a.name,
          kind: 'melee' as const,
          toHit: s.attackBonus != null ? getSigned(s.attackBonus) : null,
          bonus: s.attackBonus ?? null,
          ability: null,
          damageShort: hit ? `${hit[1]} ${hit[2]}` : '',
          damageDice: hit ? hit[1].replace(/\s+/g, '') : null,
          tags: a.text.match(/reach [\d ]+ft/)?.slice(0, 1) ?? [],
          formula: s.attackBonus != null ? `d20 ${getSigned(s.attackBonus)} (component attack bonus)` : a.text,
          damage: a.text.match(/Hit: ([^.]+)\./)?.[1] ?? '',
          ranges: [],
          properties: [],
          notes: [a.text]
        }
      })
    })
  }
  const perks = getRelevantPerks(system, cat, crewman)
  if (perks.length) sections.push({ kind: 'perks', title: `Relevant ${system.crew.perks}`, perks })

  const material = getMaterial(ctx, def)
  const install = def.size ? system.installHours[def.size] : undefined
  sections.push({
    kind: 'stats',
    title: 'Metadata',
    rows: [
      { label: 'Tier', value: def.tier ?? '—' },
      { label: 'Quality', value: def.quality ?? 'None' },
      { label: 'Size', value: `${def.size ?? '—'}${def.dimensions ? ` (${def.dimensions})` : ''}` },
      { label: 'Material', value: material ?? 'Not stated', pendingRuling: def.materialRuling ? pending(rulings, def.materialRuling.ruling) : undefined },
      { label: 'Repair with', value: material ? (system.text.repairTools[material] ?? '—') : '—' },
      { label: 'Weight', value: def.weight != null ? `${def.weight} t` : '—' },
      { label: 'Cargo Units', value: def.cargoUnits != null ? String(def.cargoUnits) : '—' },
      { label: 'Material cost', value: def.materialCost != null ? `${def.materialCost.toLocaleString('en-US')} GP` : '—' },
      { label: 'Crafting time', value: def.craftingTime != null ? String(def.craftingTime) : '—' },
      { label: 'Value', value: def.value != null ? `${def.value.toLocaleString('en-US')} GP` : '—' },
      ...(install
        ? [
            {
              label: 'Install / remove',
              value: `${cat === 'hull' ? install.hull : cat === 'control' || cat === 'propulsion' ? install.heavy : install.light} h${cat === 'hull' ? ' (dry dock only)' : ''}`
            }
          ]
        : [])
    ]
  })
  if (def.source) {
    sections.push({
      kind: 'text',
      title: 'Source',
      items: [
        {
          body: `${def.source.document} ${def.source.version}, p. ${def.source.page} — ${def.source.section}${def.source.note ? `. ${def.source.note}` : ''}`
        }
      ]
    })
  }
  if (component.override) warnings.push(`DM override: ${component.overrideReason ?? 'installed despite compatibility issues.'}`)
  if (def.retired) warnings.push('This component has been retired from the catalogue.')
  if (def.homebrew) warnings.push('Homebrew: this component is carried by this vessel alone.')
  const slot = ctx.layout.slots.find((x) => x.code === component.slot)
  if (slot?.approximate) warnings.push(`Slot ${slot.code} position is approximate (measured from the Deck Layout figure).`)

  return {
    title: getName(component),
    subtitle: [def.name !== component.label ? def.name : null, categoryName, slot ? `Slot ${slot.code}` : null].filter(Boolean).join(' · '),
    core: coreRows,
    quick: getQuickFacts(ctx, component, cond),
    sections,
    warnings
  }
}

export const getSizeIndex = (system: VehicleSystem, size: string | null | undefined) => (size ? system.sizes.indexOf(size) : -1)

export function getSlotTypes(def: ComponentDef): string[] {
  return [...new Set([def.category, ...def.slotTypes])]
}

export function getCompatibility(
  system: VehicleSystem,
  slot: Slot | null,
  def: ComponentDef,
  installed: Placed[],
  replacing: string | null = null
): Issue[] {
  const issues: Issue[] = []
  const others = installed.filter((c) => c.id !== replacing)
  if (def.retired) issues.push({ severity: 'error', code: 'retired', message: `${def.name} is retired.` })
  if (!slot) {
    issues.push({ severity: 'error', code: 'no-slot', message: 'Components are installed in Deck Layout slots.' })
    return issues
  }
  const types = getSlotTypes(def)
  if (!types.some((t) => slot.acceptedTypes.includes(t))) {
    issues.push({
      severity: 'error',
      code: 'slot-type',
      message: `Slot ${slot.code} accepts ${slot.acceptedTypes.join(', ')}; ${def.name} is ${types.join('/')}.`
    })
  }
  if (slot.maxSize && def.size && getSizeIndex(system, def.size) > getSizeIndex(system, slot.maxSize)) {
    issues.push({ severity: 'error', code: 'size', message: `${def.name} is ${def.size}; slot ${slot.code} holds up to ${slot.maxSize}.` })
  }
  if (others.some((c) => c.slot === slot.code)) issues.push({ severity: 'error', code: 'occupied', message: `Slot ${slot.code} is already occupied.` })
  if (def.category === 'hull' && others.some((c) => c.def.category === 'hull')) {
    issues.push({ severity: 'error', code: 'one-hull', message: 'Every ship has exactly one Hull component (p. 14).' })
  }
  return issues
}

export function getVehicleIssues(components: Placed[]): Issue[] {
  const count = (cat: string) => components.filter((c) => c.def.category === cat).length
  const issues: Issue[] = []
  if (count('hull') !== 1) issues.push({ severity: 'error', code: 'hull-count', message: `A ship has exactly one Hull component (found ${count('hull')}).` })
  if (count('control') < 1) issues.push({ severity: 'warning', code: 'no-control', message: 'Every ship has at least one Control component (p. 14).' })
  if (count('propulsion') < 1) issues.push({ severity: 'warning', code: 'no-propulsion', message: 'Every ship has at least one Propulsion component (p. 14).' })
  const slots = new Map<string, number>()
  for (const c of components) if (c.slot) slots.set(c.slot, (slots.get(c.slot) ?? 0) + 1)
  if ([...slots.values()].some((n) => n > 1)) issues.push({ severity: 'error', code: 'slot-double', message: 'Two components occupy the same slot.' })
  return issues
}

const getAverage = (dice: string) => {
  const m = dice.match(/^(\d+)d(\d+)$/)
  return m ? (Number(m[1]) * (Number(m[2]) + 1)) / 2 : null
}

export function getComponentSummary(system: VehicleSystem, def: ComponentDef, rulings: Rulings) {
  const s = def.stats
  const c = getCore(system, def)
  const out = [
    { label: 'AC', value: String(c.ac) },
    { label: 'DT', value: String(c.dt) },
    { label: 'HP', value: String(c.hp) },
    { label: 'IT', value: String(c.it) },
    { label: 'Con', value: getSigned(c.con) }
  ]
  if (s.speed) out.push({ label: 'Speed', value: `${s.speed.primary}/${s.speed.secondary}` })
  if (s.changesOfFacing != null) out.push({ label: 'CoF', value: String(s.changesOfFacing) })
  if (s.ramDamage) out.push({ label: 'Ram', value: s.ramDamage.dice })
  for (const shot of s.shots ?? []) {
    const r = getShotRanges(system, shot, rulings).ranges
    out.push({ label: shot.name, value: `${shot.damage.dice} · ${getRange(r.close)}/${getRange(r.normal)}/${getRange(r.long)}` })
  }
  return out
}

export function getComparison(system: VehicleSystem, before: ComponentDef | null, after: ComponentDef | null, rulings: Rulings): StatDiff[] {
  const b = before ? getCore(system, before) : null
  const a = after ? getCore(system, after) : null
  const bs = before?.stats ?? null
  const as = after?.stats ?? null
  const rows: StatDiff[] = []
  const direction = (x: number | null | undefined, y: number | null | undefined, higherBetter: boolean | null): StatDiff['direction'] =>
    x === y ? 'same' : x == null || y == null || higherBetter === null ? 'changed' : y > x === higherBetter ? 'better' : 'worse'
  const num = (label: string, x: number | null | undefined, y: number | null | undefined, higherBetter: boolean | null) => {
    if (x == null && y == null) return
    rows.push({ label, before: x == null ? '—' : String(x), after: y == null ? '—' : String(y), direction: direction(x, y, higherBetter) })
  }
  num('AC', b?.ac, a?.ac, true)
  num('DT', b?.dt, a?.dt, true)
  num('HP', b?.hp, a?.hp, true)
  num('IT', b?.it, a?.it, null)
  num('Con', b?.con, a?.con, true)
  num('Primary Speed', bs?.speed?.primary, as?.speed?.primary, true)
  num('Secondary Speed', bs?.speed?.secondary, as?.speed?.secondary, true)
  num('Changes of Facing', bs?.changesOfFacing, as?.changesOfFacing, true)
  if (bs?.ramDamage || as?.ramDamage) {
    const x = bs?.ramDamage ? getAverage(bs.ramDamage.dice) : null
    const y = as?.ramDamage ? getAverage(as.ramDamage.dice) : null
    rows.push({ label: 'Ram damage', before: bs?.ramDamage?.dice ?? '—', after: as?.ramDamage?.dice ?? '—', direction: direction(x, y, true) })
  }
  const shotNames = new Set([...(bs?.shots ?? []), ...(as?.shots ?? [])].map((s) => s.name))
  for (const name of shotNames) {
    const x = bs?.shots?.find((s) => s.name === name)
    const y = as?.shots?.find((s) => s.name === name)
    rows.push({
      label: `${name} damage`,
      before: x ? x.damage.dice : '—',
      after: y ? y.damage.dice : '—',
      direction: direction(x ? getAverage(x.damage.dice) : null, y ? getAverage(y.damage.dice) : null, true)
    })
    const xr = x ? getShotRanges(system, x, rulings).ranges.long : null
    const yr = y ? getShotRanges(system, y, rulings).ranges.long : null
    if (xr != null || yr != null) rows.push({ label: `${name} long range`, before: getRange(xr), after: getRange(yr), direction: direction(xr, yr, true) })
  }
  const text = (label: string, x: string | null | undefined, y: string | null | undefined) => {
    if (x == null && y == null) return
    rows.push({ label, before: x ?? '—', after: y ?? '—', direction: x === y ? 'same' : 'changed' })
  }
  text('Size', before?.size, after?.size)
  text('Weight (t)', before?.weight?.toString(), after?.weight?.toString())
  text('Value (GP)', before?.value?.toLocaleString('en-US'), after?.value?.toLocaleString('en-US'))
  return rows
}

export function getFootprint(system: VehicleSystem, def: ComponentDef): { length: number; width: number } {
  const nums = def.dimensions?.match(/[\d.]+/g)?.map(Number)
  if (nums && nums.length >= 2) return { length: nums[0], width: nums[1] }
  const n = system.footprints[def.size ?? 'Medium'] ?? 5
  return { length: n, width: n }
}

export function getMapInfo(ctx: VehicleContext, component: Placed): MapInfo {
  const def = component.def
  const cond = getPenalty(ctx, component)
  const ranges = (def.stats.shots ?? [])
    .filter((shot) => shot.ranges.long != null || shot.ranges.normal != null)
    .map((shot) => {
      const base = getShotRanges(ctx.system, shot, ctx.rulings).ranges
      return { label: shot.name, ...(cond === 'impaired' ? getImpairedRanges(base) : base) }
    })
  return {
    ...getFootprint(ctx.system, def),
    ranges: cond === 'broken' ? [] : ranges,
    isWeapon: def.category === 'artillery',
    isStructure: def.category === 'hull',
    shortLabel: component.slot ?? def.name.slice(0, 2)
  }
}

export function getPerkLimit(system: VehicleSystem, perk: Perk, proficiency: number, rulings: Rulings): number {
  switch (perk.repeatLimit.kind) {
    case 'once':
      return 1
    case 'pb':
      return proficiency
    case 'half_pb': {
      const rule = system.rules.halfProficiency
      const down = getRuling(rulings, rule.ruling, system) === rule.downWhen && perk.halfUnstated
      return down ? Math.floor(proficiency / 2) : Math.ceil(proficiency / 2)
    }
  }
}

export function getPerkLevel(system: VehicleSystem, perk: Perk, rulings: Rulings): number {
  if (!perk.levelRuling) return perk.navalLevel
  return perk.levelRuling.options[getRuling(rulings, perk.levelRuling.ruling, system)] ?? perk.navalLevel
}

export function getRepeatLabel(perk: Perk): string {
  return { once: 'Once', pb: 'Up to PB', half_pb: 'Up to Half PB' }[perk.repeatLimit.kind]
}

type PerkHolder = Pick<Crewman, 'crewLevel' | 'proficiency' | 'perks'>

export function getPerkIssues(system: VehicleSystem, holder: PerkHolder, rulings: Rulings): Issue[] {
  const issues: Issue[] = []
  const taken = new Map(holder.perks.map((p) => [p.id, p.count]))
  const total = holder.perks.reduce((sum, p) => sum + p.count, 0)
  const level = system.crew.level
  if (total > holder.crewLevel) {
    issues.push({
      severity: 'error',
      code: 'perk-budget',
      message: `${total} perk selections exceed ${level} ${holder.crewLevel} (one perk per ${level}).`
    })
  }
  for (const { id, count } of holder.perks) {
    const perk = system.perks.find((p) => p.id === id)
    if (!perk) {
      issues.push({ severity: 'error', code: 'unknown-perk', message: `Unknown perk “${id}”.` })
      continue
    }
    if (count < 1) issues.push({ severity: 'error', code: 'perk-count', message: `${perk.name}: count must be at least 1.` })
    const needed = getPerkLevel(system, perk, rulings)
    if (holder.crewLevel < needed) issues.push({ severity: 'error', code: 'perk-level', message: `${perk.name} requires ${level} ${needed}.` })
    const limit = getPerkLimit(system, perk, holder.proficiency, rulings)
    if (count > limit) {
      issues.push({
        severity: 'error',
        code: 'perk-repeat',
        message: `${perk.name} can be taken ${getRepeatLabel(perk).toLowerCase()} (${limit} at PB +${holder.proficiency}); ${count} selected.`
      })
    }
    for (const pre of perk.prerequisites) {
      if (!taken.has(pre)) {
        issues.push({ severity: 'error', code: 'perk-prerequisite', message: `${perk.name} requires ${system.perks.find((p) => p.id === pre)?.name ?? pre}.` })
      }
    }
  }
  return issues
}

export function getPerkBlock(system: VehicleSystem, holder: PerkHolder, perk: Perk, rulings: Rulings): string | null {
  const next: CrewPerk[] = holder.perks.some((p) => p.id === perk.id)
    ? holder.perks.map((p) => (p.id === perk.id ? { ...p, count: p.count + 1 } : p))
    : [...holder.perks, { id: perk.id, count: 1 }]
  return getPerkIssues(system, { ...holder, perks: next }, rulings).find((i) => i.severity === 'error')?.message ?? null
}

export function getTemplateBuild(system: VehicleSystem, template: VehicleTemplate, mint: () => string): InstalledComponent[] {
  return template.components.map((entry) => ({
    id: mint(),
    slot: entry.slot,
    component: entry.component,
    label: entry.label,
    x: null,
    y: null,
    rotation: null,
    override: entry.override,
    overrideReason: entry.overrideReason
  }))
}

export function getContext(
  system: VehicleSystem,
  layout: Layout,
  components: InstalledComponent[],
  stats: Record<string, unknown>,
  states: Record<string, ComponentState>,
  rulings: Rulings
): VehicleContext {
  return { system, layout, components: getPlaced(system, components), stats, states, rulings }
}

export async function getCrewResolved(character: Character): Promise<ResolvedCharacter | null> {
  try {
    const system = await getSystemStack(character.systems?.length ? character.systems : ['dnd5e'], character.overlay ?? undefined)
    return getResolvedCharacter(system, getSheet(character, system))
  } catch {
    return null
  }
}

export function getCrewman(id: string, character: Character, resolved: ResolvedCharacter | null, systemId: string): Crewman {
  const crew = character.crew?.[systemId]
  const modifiers = Object.fromEntries(
    resolved
      ? resolved.attributes.map((attribute) => [attribute.title.toLowerCase(), attribute.value])
      : (character.abilities ?? []).map((ability) => [ability.title.toLowerCase(), ability.modifier])
  )
  return {
    id,
    name: character.info?.name ?? 'Unnamed',
    level: resolved?.level ?? character.info?.level ?? 1,
    crewLevel: crew?.level ?? 0,
    proficiency: resolved?.proficiency ?? character.info?.proficiencyBonus ?? 2,
    modifiers,
    perks: crew?.perks ?? []
  }
}

export type VehiclePackage = {
  format: 'quillborne-vehicle'
  version: 1
  exported_at: string
  name: string
  system: string
  template: string
  template_version: number
  layout: string
  components: InstalledComponent[]
  stats: Record<string, unknown>
  rulings: Rulings
  overlay: VehicleOverlay
}

export function getVehiclePackage(vehicle: Omit<VehiclePackage, 'format' | 'version' | 'exported_at'>): VehiclePackage {
  return {
    format: 'quillborne-vehicle',
    version: 1,
    exported_at: new Date().toISOString(),
    name: vehicle.name,
    system: vehicle.system,
    template: vehicle.template,
    template_version: vehicle.template_version,
    layout: vehicle.layout,
    components: vehicle.components,
    stats: vehicle.stats,
    rulings: vehicle.rulings,
    overlay: vehicle.overlay
  }
}

export function getPackageIssues(value: unknown, systems: VehicleSystem[]): string[] {
  const pkg = value as Partial<VehiclePackage> | null
  if (!pkg || typeof pkg !== 'object' || pkg.format !== 'quillborne-vehicle') return ['This is not a Quillborne vehicle file.']
  if (pkg.version !== 1) return [`Version ${String(pkg.version)} of the vehicle file is not known.`]
  const base = systems.find((entry) => entry.id === pkg.system)
  if (!base) return [`The vehicle system “${String(pkg.system)}” is not installed.`]
  const system = getMergedVehicleSystem(base, pkg.overlay)
  const layout = getLayout(system, pkg.layout ?? '')
  if (!layout) return [`The deck layout “${String(pkg.layout)}” is not part of ${system.title}.`]
  const issues: string[] = []
  for (const row of pkg.components ?? []) {
    if (!getDef(system, row.component)) issues.push(`The component “${row.component}” is not in the catalogue.`)
    if (row.slot && !layout.slots.some((slot) => slot.code === row.slot)) issues.push(`The slot “${row.slot}” is not on ${layout.name}.`)
  }
  return issues
}

export function getTemplateDrift(system: VehicleSystem, template: VehicleTemplate, components: InstalledComponent[]) {
  return template.components
    .map((entry) => {
      const held = components.find((row) => row.slot === entry.slot) ?? null
      return { slot: entry.slot, wanted: entry, held }
    })
    .filter(({ wanted, held }) => held?.component !== wanted.component)
    .map(({ slot, wanted, held }) => ({
      slot,
      wanted,
      held,
      wantedName: getDef(system, wanted.component)?.name ?? wanted.component,
      heldName: held ? (getDef(system, held.component)?.name ?? held.component) : null
    }))
}

export function getAttacks(ctx: VehicleContext, crewman: Crewman | null) {
  return ctx.components
    .map((component) => {
      const cond = getPenalty(ctx, component)
      const bonus = component.def.stats.attackBonus ?? null
      const actions: WeaponMode[] = (component.def.stats.actions ?? []).map((action) => {
        const hit = action.text.match(/Hit: \d+ \(([^)]+)\) (\w+)/)
        return {
          key: action.name,
          name: action.name,
          kind: 'melee',
          toHit: bonus != null ? getSigned(bonus) : null,
          bonus,
          ability: null,
          damageShort: hit ? `${hit[1]} ${hit[2]}` : '',
          damageDice: hit ? hit[1].replace(/\s+/g, '') : null,
          tags: action.text.match(/reach [\d ]+ft/)?.slice(0, 1) ?? [],
          unavailable: cond === 'broken',
          formula: bonus != null ? `d20 ${getSigned(bonus)} (component attack bonus)` : action.text,
          damage: action.text.match(/Hit: ([^.]+)\./)?.[1] ?? '',
          ranges: [],
          properties: [],
          notes: [action.text]
        }
      })
      return { component, cond, modes: [...getWeaponModes(ctx, component, crewman, cond), ...actions] }
    })
    .filter((entry) => entry.modes.length > 0)
}
