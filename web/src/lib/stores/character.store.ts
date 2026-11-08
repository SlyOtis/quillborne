import type { Character } from '../api/types'
import { writable } from 'svelte/store';

const RECENT_LIMIT = 8;

export const currentCharacterId = writable<string | null>(null);

export const userCharacters = writable<Character[]>([]);

export function getRecentCharacters(held: string[], id: string): string[] {
  return [id, ...held.filter((one) => one !== id)].slice(0, RECENT_LIMIT);
}

export function getRecentFirst(characters: Character[], recent: string[]): Character[] {
  const rank = (entry: Character) => {
    const at = recent.indexOf(entry.id);
    return at === -1 ? recent.length : at;
  };
  return [...characters].sort((a, b) => rank(a) - rank(b));
}
