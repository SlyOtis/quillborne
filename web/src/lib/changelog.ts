import { writable, type Writable } from 'svelte/store';
import type { Character } from './character.types';

export interface ChangeLogEntry {
  id: string;
  timestamp: Date;
  action: string;
  description: string;
  beforeState: Partial<Character>;
  afterState: Partial<Character>;
  revertible: boolean;
  metadata?: {
    level?: number;
    property?: string;
    value?: any;
    source?: string;
  };
}

export interface ChangeLogState {
  entries: ChangeLogEntry[];
  currentIndex: number;
  maxEntries: number;
}

// Change log store
const changeLogStore: Writable<ChangeLogState> = writable({
  entries: JSON.parse(localStorage.getItem('character_changelog') || '[]').map((entry: any) => ({
    ...entry,
    timestamp: new Date(entry.timestamp)
  })),
  currentIndex: -1,
  maxEntries: 50
});

// Subscribe to changes and save to localStorage
changeLogStore.subscribe(state => {
  localStorage.setItem('character_changelog', JSON.stringify(state.entries));
});

export function getChangeLogStore() {
  return changeLogStore;
}

export function addChangeLogEntry(entry: Omit<ChangeLogEntry, 'id' | 'timestamp'>) {
  const newEntry: ChangeLogEntry = {
    ...entry,
    id: crypto.randomUUID(),
    timestamp: new Date()
  };

  changeLogStore.update(state => {
    const newEntries = [...state.entries];
    
    // Remove entries after current index if we're not at the end
    if (state.currentIndex < newEntries.length - 1) {
      newEntries.splice(state.currentIndex + 1);
    }
    
    // Add new entry
    newEntries.push(newEntry);
    
    // Limit entries to maxEntries
    if (newEntries.length > state.maxEntries) {
      newEntries.shift();
    }
    
    return {
      ...state,
      entries: newEntries,
      currentIndex: newEntries.length - 1
    };
  });
}

export function canUndo(): boolean {
  let canUndoResult = false;
  changeLogStore.subscribe(state => {
    canUndoResult = state.currentIndex >= 0;
  })();
  return canUndoResult;
}

export function canRedo(): boolean {
  let canRedoResult = false;
  changeLogStore.subscribe(state => {
    canRedoResult = state.currentIndex < state.entries.length - 1;
  })();
  return canRedoResult;
}

export function getCurrentEntry(): ChangeLogEntry | null {
  let currentEntry = null;
  changeLogStore.subscribe(state => {
    if (state.currentIndex >= 0 && state.currentIndex < state.entries.length) {
      currentEntry = state.entries[state.currentIndex];
    }
  })();
  return currentEntry;
}

export function undo(): ChangeLogEntry | null {
  let undoneEntry = null;
  
  changeLogStore.update(state => {
    if (state.currentIndex >= 0) {
      undoneEntry = state.entries[state.currentIndex];
      return {
        ...state,
        currentIndex: state.currentIndex - 1
      };
    }
    return state;
  });
  
  return undoneEntry;
}

export function redo(): ChangeLogEntry | null {
  let redoneEntry = null;
  
  changeLogStore.update(state => {
    if (state.currentIndex < state.entries.length - 1) {
      const newIndex = state.currentIndex + 1;
      redoneEntry = state.entries[newIndex];
      return {
        ...state,
        currentIndex: newIndex
      };
    }
    return state;
  });
  
  return redoneEntry;
}

export function getChangeHistory(): ChangeLogEntry[] {
  let history: ChangeLogEntry[] = [];
  changeLogStore.subscribe(state => {
    history = [...state.entries];
  })();
  return history;
}

export function clearChangeLog() {
  changeLogStore.update(state => ({
    ...state,
    entries: [],
    currentIndex: -1
  }));
}

// Helper function to create deep copy for state snapshots
export function createStateSnapshot(character: Partial<Character>): Partial<Character> {
  return JSON.parse(JSON.stringify(character));
}

// Action type definitions for common changes
export const ChangeActions = {
  LEVEL_UP: 'level_up',
  LEVEL_DOWN: 'level_down',
  LEVEL_CHANGE: 'level_change',
  HP_CHANGE: 'hp_change',
  SPECIAL_RESOURCE_CHANGE: 'special_resource_change',
  SPELL_SLOT_CHANGE: 'spell_slot_change',
  ABILITY_SCORE_CHANGE: 'ability_score_change',
  SKILL_CHANGE: 'skill_change',
  FEAT_ADD: 'feat_add',
  FEAT_REMOVE: 'feat_remove',
  INVENTORY_ADD: 'inventory_add',
  INVENTORY_REMOVE: 'inventory_remove',
  INVENTORY_CHANGE: 'inventory_change',
  SPELL_ADD: 'spell_add',
  SPELL_REMOVE: 'spell_remove',
  SPELL_CHANGE: 'spell_change',
  DEATH_SAVE: 'death_save',
  EQUIPMENT_CHANGE: 'equipment_change',
  ATTUNEMENT_CHANGE: 'attunement_change',
  PROFICIENCY_CHANGE: 'proficiency_change',
  BACKGROUND_CHANGE: 'background_change',
  THEME_CHANGE: 'theme_change',
  CURRENCY_CHANGE: 'currency_change',
  SHORT_REST: 'short_rest',
  LONG_REST: 'long_rest',
  CONDITION_ADD: 'condition_add',
  CONDITION_REMOVE: 'condition_remove',
  CONDITION_REMOVE_ALL: 'condition_remove_all',
  DEFENSE_ADD: 'defense_add',
  DEFENSE_REMOVE: 'defense_remove'
} as const;

export type ChangeAction = typeof ChangeActions[keyof typeof ChangeActions];

// Undo/Redo result interface
export interface UndoRedoResult {
  success: boolean;
  description?: string;
  timestamp?: Date;
  error?: string;
}

// Complete undo function that applies changes to character
export function undoLastChange(): UndoRedoResult {
  const entry = undo();
  
  if (!entry) {
    return {
      success: false,
      error: 'No changes to undo'
    };
  }
  
  if (!entry.revertible) {
    // Move to next undoable entry
    return undoLastChange();
  }
  
  // Apply the before state to revert the change
  try {
    applyStateToCharacter(entry.beforeState);
    return {
      success: true,
      description: entry.description,
      timestamp: entry.timestamp
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to undo change: ${error}`
    };
  }
}

// Complete redo function that applies changes to character
export function redoLastChange(): UndoRedoResult {
  const entry = redo();
  
  if (!entry) {
    return {
      success: false,
      error: 'No changes to redo'
    };
  }
  
  // Apply the after state to restore the change
  try {
    applyStateToCharacter(entry.afterState);
    return {
      success: true,
      description: entry.description,
      timestamp: entry.timestamp
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to redo change: ${error}`
    };
  }
}

// Helper function to apply state changes to character
function applyStateToCharacter(partialState: Partial<Character>) {
  // This function will be dynamically injected by the engine
  // to avoid circular dependencies
  if ((globalThis as any).__applyCharacterState) {
    (globalThis as any).__applyCharacterState(partialState);
  } else {
    throw new Error('Character state application function not available');
  }
}