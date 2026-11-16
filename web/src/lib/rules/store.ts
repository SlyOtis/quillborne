import { derived, type Readable } from 'svelte/store'
import type { Character } from '../character.types'
import type { CharacterContext } from '../types'
import { getResolvedCharacter } from './derive'
import { getSheet } from './sheet'
import type { ResolvedCharacter, RuleSystem, RuleSystemOverlay } from './spec.types'
import { getSystemStack } from './system'

export type RulesState = {
  system: RuleSystem | null
  resolved: ResolvedCharacter | null
  error: string | null
}

const SOURCE_KEYS = ['info', 'abilities', 'skills', 'savingThrows', 'special', 'inventory'] as const

type Loaded = Pick<RulesState, 'system' | 'error'>

export function getRulesStore(context: CharacterContext): Readable<RulesState> {
  const stack = derived([context.systems, context.overlay], ([$systems, $overlay]) => JSON.stringify([$systems, $overlay]))

  const loaded = derived<Readable<string>, Loaded>(
    stack,
    ($stack, set) => {
      const [systems, overlay] = JSON.parse($stack) as [string[], RuleSystemOverlay | null]
      let live = true

      getSystemStack(systems, overlay ?? undefined)
        .then((system) => live && set({ system, error: null }))
        .catch((reason) => live && set({ system: null, error: reason instanceof Error ? reason.message : String(reason) }))

      return () => {
        live = false
      }
    },
    { system: null, error: null }
  )

  const sources = SOURCE_KEYS.map((key) => context[key])

  return derived([loaded, ...sources], ([{ system: $system, error: $error }, ...values]) => {
    if ($error) return { system: null, resolved: null, error: $error }
    if (!$system) return { system: null, resolved: null, error: null }

    const character = Object.fromEntries(SOURCE_KEYS.map((key, index) => [key, values[index]])) as unknown as Character

    try {
      return { system: $system, resolved: getResolvedCharacter($system, getSheet(character, $system)), error: null }
    } catch (reason) {
      return { system: $system, resolved: null, error: reason instanceof Error ? reason.message : String(reason) }
    }
  })
}
