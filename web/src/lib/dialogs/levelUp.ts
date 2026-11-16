import type { Character, CharacterAbility, Feat, LevelUpChoice, LevelUpData } from '../character.types';
import type { CatalogEntry } from '../catalog';
import { getResolvedCharacter } from '../rules/derive';
import { getExpressionValue } from '../rules/expression';
import { getAttributeId, getSheet } from '../rules/sheet';
import type { AdvancementSpec, RuleSystem } from '../rules/spec.types';
import { writable } from 'svelte/store';

export interface LevelUpState {
  isOpen: boolean;
  data?: LevelUpData;
}

export function createLevelUpStore() {
  const state = writable<LevelUpState>({ isOpen: false });

  return {
    ...state,

    open(data: LevelUpData) {
      state.update(s => ({ ...s, isOpen: true, data }));
    },

    close() {
      state.update(s => ({ ...s, isOpen: false, data: undefined }));
    }
  };
}

type ClassFeature = { id: string; name: string; description: string; level: number; source?: string };

function getAdvancement(system: RuleSystem): AdvancementSpec {
  if (!system.advancement) throw new Error(`${system.title} declares no advancement, so there is no level to gain.`);
  return system.advancement;
}

function getFeatures(entry: CatalogEntry | null, level: number): Feat[] {
  const features = (entry?.features as ClassFeature[] | undefined) ?? [];

  return features
    .filter((feature) => feature.level === level && feature.source !== 'subclass')
    .map((feature) => ({
      id: feature.id,
      level,
      source: 'class',
      title: feature.name,
      description: feature.description
    }));
}

function getSlots(advancement: AdvancementSpec, entry: CatalogEntry | null, level: number): Record<number, number> | undefined {
  const table = typeof entry?.casting === 'string' ? advancement.slots[entry.casting] : undefined;
  if (!table) return undefined;

  const row = table[level - 1] ?? [];
  return Object.fromEntries(row.map((count, index) => [index + 1, count]).filter(([, count]) => count > 0));
}

export function getLevelUp(character: Character, system: RuleSystem, entry: CatalogEntry | null): LevelUpData {
  const advancement = getAdvancement(system);
  const level = (character.info.level || 1) + 1;

  if (level > system.progression.maxLevel) {
    throw new Error(`${character.info.name || 'This character'} is already at level ${system.progression.maxLevel}, the highest ${system.title} knows.`);
  }

  const improvements = (entry?.improvements as number[] | undefined) ?? advancement.improvement.levels;
  const choices: LevelUpChoice[] = improvements.includes(level)
    ? [{
        type: 'abilityScore',
        title: 'Ability Score Improvement',
        description: `Spend ${advancement.improvement.points} points across your abilities. None rises above ${advancement.improvement.cap}.`,
        options: system.attributes.map((attribute) => attribute.id),
        maxSelections: advancement.improvement.points
      }]
    : [];

  return {
    level,
    hitDiceGain: { amount: 1, die: character.info.class.hitDice.die },
    proficiencyBonus: Math.round(getExpressionValue(system.progression.proficiency, { level })),
    newFeatures: getFeatures(entry, level),
    choices,
    spellSlotChanges: getSlots(advancement, entry, level)
  };
}

export function getStartingCharacter(character: Character, system: RuleSystem, entry: CatalogEntry | null): Character {
  const advancement = getAdvancement(system);
  const level = Math.max(1, Math.min(character.info.level || 1, system.progression.maxLevel));
  // Stored hit points leave out what worn items grant, so they are worked out without the inventory.
  const scope = { ...getResolvedCharacter(system, getSheet({ ...character, inventory: [] }, system)).scope, die: character.info.class.hitDice.die };
  const first = Math.round(getExpressionValue(advancement.firstHitPoints, scope));
  const hitPoints = first + (level - 1) * Math.round(getExpressionValue(advancement.hitPoints, scope));
  const slots = getSlots(advancement, entry, level);

  return {
    ...character,
    feats: [...character.feats, ...Array.from({ length: level }, (_, index) => getFeatures(entry, index + 1)).flat()],
    info: {
      ...character.info,
      level,
      proficiencyBonus: Math.round(getExpressionValue(system.progression.proficiency, { level })),
      hp: { ...character.info.hp, max: hitPoints, current: hitPoints },
      class: { ...character.info.class, hitDice: { ...character.info.class.hitDice, amount: level } },
      ...(slots ? { spells: { modifier: character.info.spells?.modifier ?? '', slots } } : {})
    }
  };
}

function getRaisedAbilities(character: Character, system: RuleSystem, raised: Map<string, number>): CharacterAbility[] {
  const cap = getAdvancement(system).improvement.cap;
  const abilities = [...character.abilities];

  for (const [id, points] of raised) {
    const spec = system.attributes.find((attribute) => attribute.id === id);
    if (!spec) throw new Error(`${id} is not an ability ${system.title} knows.`);

    const index = abilities.findIndex((ability) => getAttributeId(ability.title) === id);
    const title = id.charAt(0).toUpperCase() + id.slice(1);
    const held = index === -1 ? { id, title, score: spec.default, modifier: 0 } : abilities[index];
    const score = Math.max(held.score, Math.min(cap, held.score + points));
    const next = { ...held, score, modifier: getExpressionValue(spec.modifier, { score }) };

    if (index === -1) abilities.push(next);
    else abilities[index] = next;
  }

  return abilities;
}

export function getLevelledCharacter(
  character: Character,
  system: RuleSystem,
  levelUp: LevelUpData,
  picks: string[][]
): Character {
  const raised = new Map<string, number>();
  levelUp.choices.forEach((choice, index) => {
    if (choice.type !== 'abilityScore') return;
    for (const id of picks[index] ?? []) raised.set(id, (raised.get(id) ?? 0) + 1);
  });

  const abilities = getRaisedAbilities(character, system, raised);
  const info = { ...character.info, level: levelUp.level };
  const scope = getResolvedCharacter(system, getSheet({ ...character, info, abilities, inventory: [] }, system)).scope;
  const gain = Math.round(getExpressionValue(getAdvancement(system).hitPoints, { ...scope, die: levelUp.hitDiceGain.die }));
  const known = new Set(character.feats.map((feat) => feat.id));

  return {
    ...character,
    abilities,
    feats: [...character.feats, ...levelUp.newFeatures.filter((feature) => !known.has(feature.id))],
    info: {
      ...info,
      proficiencyBonus: levelUp.proficiencyBonus,
      hp: { ...info.hp, max: info.hp.max + gain, current: info.hp.current + gain },
      class: { ...info.class, hitDice: { ...info.class.hitDice, amount: levelUp.level } },
      ...(levelUp.spellSlotChanges
        ? { spells: { modifier: info.spells?.modifier ?? '', slots: levelUp.spellSlotChanges } }
        : {})
    }
  };
}
