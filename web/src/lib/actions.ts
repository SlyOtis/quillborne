import { putProfilePreferences } from './api'
import type { Shortcut } from './api/types'
import { derived, get } from 'svelte/store'
import { navigate } from 'sly-svelte-location-router'
import type { GlyphName } from '$components/ui/Glyph.svelte'
import { userProfile } from './stores/auth.store'
import { uiStore } from './stores/ui.store'
import { currentCharacterId } from './stores/character.store'
import { getUIActionBlock, postUIAction, type UIAction } from './chat'

export interface AppAction {
  id: string
  title: string
  glyph: GlyphName
  run: () => void
  ui?: UIAction
}

export const ACTIONS: AppAction[] = [
  { id: 'soundboard', title: 'Soundboard', glyph: 'sound', run: uiStore.openSoundboard },
  { id: 'music', title: 'Music', glyph: 'music', run: uiStore.openMusic },
  { id: 'menu', title: 'Toggle the menu', glyph: 'menu', run: uiStore.toggleMenu },
  { id: 'chat', title: 'Toggle the chat', glyph: 'chat', run: uiStore.toggleChat },
  { id: 'search', title: 'Search', glyph: 'search', run: uiStore.toggleSearchDialog },
  { id: 'theme', title: 'Change theme', glyph: 'theme', ui: 'openThemeDialog', run: () => postUIAction('openThemeDialog') },
  { id: 'levelup', title: 'Level up', glyph: 'levelup', ui: 'openLevelUpDialog', run: () => postUIAction('openLevelUpDialog') },
  { id: 'export', title: 'Export this character', glyph: 'export', ui: 'exportCharacter', run: () => postUIAction('exportCharacter') },
  { id: 'sources', title: 'Import sources', glyph: 'sources', ui: 'openSourceImport', run: () => postUIAction('openSourceImport') },
  { id: 'hearth', title: 'Hearth', glyph: 'campaign', run: () => navigate('/main') },
  { id: 'scribe', title: 'Scribe', glyph: 'edit', run: () => navigate('/main/scribe') },
  { id: 'profile', title: 'Your profile', glyph: 'character', run: () => navigate('/main/user') }
]

export const DEFAULT_SHORTCUTS: Shortcut[] = [
  { action: 'soundboard', key: '' },
  { action: 'music', key: '' }
]

const MODIFIERS = ['Control', 'Meta', 'Alt', 'Shift']

export const shortcuts = derived(userProfile, ($profile) => $profile?.preferences?.shortcuts ?? DEFAULT_SHORTCUTS)

export const actionBlocks = derived(currentCharacterId, ($id) =>
  Object.fromEntries(ACTIONS.map((one) => [one.id, one.ui ? getUIActionBlock(one.ui, $id) : ''])) as Record<string, string>
)

export function getAction(id: string): AppAction | undefined {
  return ACTIONS.find((one) => one.id === id)
}

export function getShortcutKey(event: KeyboardEvent): string {
  if (MODIFIERS.includes(event.key)) return ''
  const key = event.key.length === 1 ? event.key.toUpperCase() : event.key
  return [
    event.ctrlKey && 'Ctrl',
    event.metaKey && 'Meta',
    event.altKey && 'Alt',
    event.shiftKey && 'Shift',
    key === ' ' ? 'Space' : key
  ]
    .filter(Boolean)
    .join('+')
}

export async function putShortcuts(list: Shortcut[]): Promise<void> {
  const held = get(userProfile)?.preferences
  await putProfilePreferences({ ...held, shortcuts: list })
}
