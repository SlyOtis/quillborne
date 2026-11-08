import type {CharacterContext, CharacterStore, RollLog, RollLogItem, RollResult} from "./types";
import {writable, get, type Unsubscriber, type Writable} from "svelte/store";
import type {Character, CharacterAbility, CharacterCurrency, CharacterInfo, CharacterSpell, ConditionInfo, DefenceInfo, SpellsInfo} from "./character.types";
import { addChangeLogEntry, ChangeActions, createStateSnapshot, type ChangeAction } from "./changelog";
import { getResolvedCharacter } from "./rules/derive";
import { getSheet } from "./rules/sheet";
import { getSystemStack } from "./rules/system";
import type { ResolvedCharacter } from "./rules/spec.types";
import { user, userProfile } from "./stores/auth.store";
import { currentCampaignId } from "./stores/campaign.store";
import { campaignService, characterService } from "./firestore.service";
import type { CampaignChatEntry } from "./firestore.types";

const rollStore = writable<RollLog>(JSON.parse(localStorage.getItem('roll_log') || '[]'))
const sidebarStore = writable(JSON.parse(localStorage.getItem('sidebar') || 'true'))

export function getRollLog(): { rollStore: Writable<RollLog>, unsubscribeRoll: Unsubscriber } {
  return {
    rollStore,
    unsubscribeRoll: rollStore.subscribe(value => {
      localStorage.setItem('roll_log', JSON.stringify(value));
    })
  }
}


export function getSidebar() {
  return {
    sidebarStore,
    unsubscribeSidebar: sidebarStore.subscribe(value => {
      localStorage.setItem('sidebar', JSON.stringify(value))
    })
  }
}

export type RollMode = 'normal' | 'advantage' | 'disadvantage'

export const rollMode = writable<RollMode>('normal')
export const rollHidden = writable(false)

async function getRolls(die: number, amount: number): Promise<number[]> {
  const result = await fetch('https://www.random.org/integers/?format=plain&min=1&rnd=new&col=1&base=10&num=' + amount + '&max=' + die)
    .then(res => {
      if (!res.ok) throw new Error(`random.org answered ${res.status}`)
      return res.text()
    })
    .catch((reason: unknown) => {
      if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('showFunnyText', { detail: { text: 'The dice would not roll', category: 'criticalFail' } }))
      throw new Error(`random.org did not answer, so no dice were rolled: ${reason instanceof Error ? reason.message : String(reason)}`)
    });

  return result.split('\n').reduce((prev, curr) => {
    const res = parseInt(curr, 0)
    return isNaN(res) ? prev : [...prev, res]
  }, [] as number[])
}

export async function rollDice(groups: { die: number, amount: number }[]): Promise<number[][]> {
  const rolled = await Promise.all(groups.map(group => getRolls(group.die, group.amount)))

  const { postThrow } = await import('./dice')
  await postThrow(groups.map((group, index) => ({ die: group.die, rolls: rolled[index] })))

  return rolled
}

export async function rollDie(die: number, amount: number): Promise<RollResult> {
  const [rolls] = await rollDice([{ die, amount }])

  return {
    sum: rolls.reduce((prev, curr) => prev + curr, 0),
    rolls
  }
}

export async function rollD20(): Promise<RollResult & { formula: string }> {
  const mode = get(rollMode)
  rollMode.set('normal')
  if (mode === 'normal') return { ...(await rollDie(20, 1)), formula: '1d20' }

  const res = await rollDie(20, 2)
  const kept = mode === 'advantage' ? Math.max(...res.rolls) : Math.min(...res.rolls)
  return { sum: kept, rolls: res.rolls, formula: mode === 'advantage' ? '2d20kh1' : '2d20kl1' }
}

export async function rollAbility(name: string, modifier: number) {
  const res = await rollD20();
  const total = res.sum + modifier;
  
  writeRollLog('ability', `Rolled ${name} ${res.formula}`, res.formula, res.sum, total, res.rolls.join(','));
  
  // Trigger sound and visual feedback for ability checks
  if (typeof window !== 'undefined') {
    let type: 'critical' | 'damage' | 'miss' = 'damage';
    
    if (res.sum === 20) {
      type = 'critical'; // Natural 20
      window.dispatchEvent(new CustomEvent('playCriticalHit'));
    } else if (res.sum === 1) {
      type = 'miss'; // Natural 1
      window.dispatchEvent(new CustomEvent('playCriticalFail'));
    } else {
      window.dispatchEvent(new CustomEvent('playDiceRoll'));
      if (total >= 20) {
        type = 'critical'; // High success
      }
    }
    
    window.dispatchEvent(new CustomEvent('showDamage', {
      detail: {
        damage: total,
        type: type
      }
    }));
  }
}

export async function rollSkill(name: string, modifier: number, proficiency: number, x?: number, y?: number) {
  const res = await rollD20();
  const total = res.sum + modifier;
  
  writeRollLog('skill', `Rolled ${name} ${res.formula}`, res.formula, res.sum, total, res.rolls.join(','));
  
  // Trigger sound and visual feedback for skill checks
  if (typeof window !== 'undefined') {
    let type: 'critical' | 'damage' | 'miss' = 'damage';
    let funnyText = '';
    
    if (res.sum === 20) {
      type = 'critical'; // Natural 20
      funnyText = `Natural 20! ${name} mastery!`;
      window.dispatchEvent(new CustomEvent('playCriticalHit'));
    } else if (res.sum === 1) {
      type = 'miss'; // Natural 1
      funnyText = `Natural 1! Epic ${name} fail!`;
      window.dispatchEvent(new CustomEvent('playCriticalFail'));
    } else {
      window.dispatchEvent(new CustomEvent('playDiceRoll'));
      if (total >= 20) {
        type = 'critical'; // High success
        funnyText = `Excellent ${name}!`;
      } else if (total >= 15) {
        funnyText = `Good ${name}!`;
      } else if (total <= 5) {
        funnyText = `Poor ${name}...`;
      }
    }
    
    window.dispatchEvent(new CustomEvent('showDamage', {
      detail: {
        damage: total,
        type: type,
        x: x,
        y: y
      }
    }));
    
    // Show funny text near click position if provided
    if (funnyText && x !== undefined && y !== undefined) {
      window.dispatchEvent(new CustomEvent('showFunnyText', {
        detail: { 
          text: funnyText, 
          category: type === 'critical' ? 'criticalHit' : type === 'miss' ? 'criticalFail' : 'spellCast',
          x: x,
          y: y
        }
      }));
    }
  }
}

export async function rollInitiative(modifier: number) {
  const res = await rollD20();
  const total = res.sum + modifier;
  
  writeRollLog('initiative', `Rolled Initiative ${res.formula}`, res.formula, res.sum, total, res.rolls.join(','));
  
  // Trigger sound and visual feedback for initiative
  if (typeof window !== 'undefined') {
    let type: 'critical' | 'damage' | 'miss' = 'damage';
    
    if (res.sum === 20) {
      type = 'critical'; // Natural 20
      window.dispatchEvent(new CustomEvent('playCriticalHit'));
    } else if (res.sum === 1) {
      type = 'miss'; // Natural 1
      window.dispatchEvent(new CustomEvent('playCriticalFail'));
    } else {
      window.dispatchEvent(new CustomEvent('playDiceRoll'));
      if (total >= 18) {
        type = 'critical'; // High initiative
      }
    }
    
    window.dispatchEvent(new CustomEvent('showDamage', {
      detail: {
        damage: total,
        type: type
      }
    }));
  }
}

export async function rollSave(name: string, modifier: number, proficiency: number) {
  const res = await rollD20();
  const total = res.sum + modifier;
  
  writeRollLog('save', `Rolled ${name} saving throw ${res.formula}`, res.formula, res.sum, total, res.rolls.join(','));
  
  // Trigger sound and visual feedback for saving throws
  if (typeof window !== 'undefined') {
    let type: 'critical' | 'damage' | 'miss' = 'damage';
    
    if (res.sum === 20) {
      type = 'critical'; // Natural 20 - automatic success
      window.dispatchEvent(new CustomEvent('playCriticalHit'));
    } else if (res.sum === 1) {
      type = 'miss'; // Natural 1 - automatic failure
      window.dispatchEvent(new CustomEvent('playCriticalFail'));
    } else {
      window.dispatchEvent(new CustomEvent('playDiceRoll'));
      if (total >= 18) {
        type = 'critical'; // High save
      }
    }
    
    window.dispatchEvent(new CustomEvent('showDamage', {
      detail: {
        damage: total,
        type: type
      }
    }));
  }
}

export async function rollPassive(name: string, modifier: number) {
  const res = await rollD20();
  const total = res.sum + modifier;
  
  writeRollLog('passive', `Rolled ${name} passive ${res.formula}`, res.formula, res.sum, total, res.rolls.join(','));
  
  // Trigger sound and visual feedback for passive checks
  if (typeof window !== 'undefined') {
    let type: 'critical' | 'damage' | 'miss' = 'damage';
    
    if (res.sum === 20) {
      type = 'critical'; // Natural 20
      window.dispatchEvent(new CustomEvent('playCriticalHit'));
    } else if (res.sum === 1) {
      type = 'miss'; // Natural 1
      window.dispatchEvent(new CustomEvent('playCriticalFail'));
    } else {
      window.dispatchEvent(new CustomEvent('playDiceRoll'));
      if (total >= 18) {
        type = 'critical'; // High passive roll
      }
    }
    
    window.dispatchEvent(new CustomEvent('showDamage', {
      detail: {
        damage: total,
        type: type
      }
    }));
  }
}

export async function rollAttack(name: string, modifier: number) {
  const res = await rollD20();
  const total = res.sum + modifier;
  
  writeRollLog('attack', `Rolled ${name} attack ${res.formula}`, res.formula, res.sum, total, res.rolls.join(','));
  
  // Trigger sound and visual feedback for attacks
  if (typeof window !== 'undefined') {
    let type: 'critical' | 'damage' | 'miss' = 'damage';
    
    if (res.sum === 20) {
      type = 'critical'; // Natural 20 - critical hit
      window.dispatchEvent(new CustomEvent('playCriticalHit'));
      window.dispatchEvent(new CustomEvent('playSwordHit'));
    } else if (res.sum === 1) {
      type = 'miss'; // Natural 1 - critical miss
      window.dispatchEvent(new CustomEvent('playCriticalFail'));
    } else {
      window.dispatchEvent(new CustomEvent('playDiceRoll'));
      if (total >= 18) {
        type = 'critical'; // High attack roll
        window.dispatchEvent(new CustomEvent('playSwordHit'));
      }
    }
    
    window.dispatchEvent(new CustomEvent('showDamage', {
      detail: {
        damage: total,
        type: type
      }
    }));
  }
}

export async function rollAttackWithAmmo(name: string, modifier: number, ammoId: string) {
  // Consume ammunition first
  consumeAmmunition(ammoId);
  
  // Then perform the attack roll
  return rollAttack(name, modifier);
}

export async function rollDamage(name: string, die: number, amount: number, bonus: number) {
  const res = await rollDie(die, amount);
  const totalDamage = res.sum + bonus;
  
  // Determine if it's a critical hit (natural 20 or max damage)
  const maxPossibleDamage = (die * amount) + bonus;
  const isCritical = res.rolls.some(roll => roll === die) || totalDamage === maxPossibleDamage;
  
  writeRollLog('damage', `Rolled ${name} damage ${amount}d${die}`, `${amount}d${die}`, res.sum, totalDamage, res.rolls.join(','));
  
  // Trigger sound and damage display animation
  if (typeof window !== 'undefined') {
    if (isCritical) {
      window.dispatchEvent(new CustomEvent('playCriticalHit'));
      window.dispatchEvent(new CustomEvent('playSwordHit'));
    } else {
      window.dispatchEvent(new CustomEvent('playDiceRoll'));
    }
    
    window.dispatchEvent(new CustomEvent('showDamage', {
      detail: {
        damage: totalDamage,
        type: isCritical ? 'critical' : 'damage'
      }
    }));
  }
}

export async function rollDamageWithAmmo(name: string, die: number, amount: number, bonus: number, ammoId: string) {
  // Note: Ammunition is already consumed in rollAttackWithAmmo
  // This is just for the damage roll when using damage button separately
  return rollDamage(name, die, amount, bonus);
}

export function consumeAmmunition(ammoId: string) {
  const store = getCharacterStore();
  
  store.inventory.update(inventory => {
    const ammoIndex = inventory.findIndex(item => item.id === ammoId);
    if (ammoIndex !== -1 && inventory[ammoIndex].quantity > 0) {
      inventory[ammoIndex].quantity -= 1;
      
      // Log ammunition consumption
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('showFunnyText', {
          detail: { text: `${inventory[ammoIndex].title} used!`, category: 'action' }
        }));
      }
      
      // If ammunition runs out, show warning
      if (inventory[ammoIndex].quantity === 0) {
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('showFunnyText', {
            detail: { text: `Out of ${inventory[ammoIndex].title}!`, category: 'warning' }
          }));
        }
      }
    }
    return inventory;
  });
}

export type ChatEntryFields = Omit<CampaignChatEntry, 'id' | 'created_at' | 'updated_at'>

export function getAuthor(): { author_id: string, author_name: string } {
  const account = get(user);
  const profile = get(userProfile);

  return {
    author_id: account?.uid ?? '',
    author_name: profile?.display_name || account?.display_name || account?.email || 'Someone'
  }
}

export function asRollEntry(item: RollLogItem): ChatEntryFields {
  const dice = (item.details ?? '')
    .split(',')
    .map(part => parseInt(part.trim(), 10))
    .filter(part => !isNaN(part));

  return {
    ...getAuthor(),
    kind: 'roll',
    body: item.text ?? '',
    query: '',
    is_hidden: get(rollHidden),
    roll_kind: item.type ?? 'roll',
    formula: item.formula ?? '',
    dice: dice.length ? dice : [item.roll ?? 0],
    roll: item.roll ?? 0,
    total: item.total ?? 0
  }
}

export function writeRollLog(
  type: string,
  text: string,
  formula: string,
  roll: number,
  total: number,
  details?: string
) {
  const item: RollLogItem = {type, text, formula, roll, total, details, rolledAt: Date()}
  const campaignId = get(currentCampaignId);

  if (campaignId) {
    campaignService.postChatEntry(campaignId, asRollEntry(item))
      .catch(error => console.error('Campaign chat entry did not save:', error));
    return
  }

  rollStore.update(state => {
    state.push(item)
    return state
  })
}

export function asGold(currency: CharacterCurrency): number {
  const totalGP =
    (currency?.pp || 0) * 10 +    // Convert platinum to gold (1pp = 10gp)
    (currency?.gp || 0) +         // Gold pieces as is
    (currency?.sp || 0) * 0.1 +   // Convert silver to gold (1sp = 0.1gp)
    (currency?.cp || 0) * 0.01;   // Convert copper to gold (1cp = 0.01gp)

  return Number(totalGP.toFixed(3)); // Round to 2 decimal places
}

export function addCurrencies(currency: CharacterCurrency, currency2: CharacterCurrency): CharacterCurrency {
  return (Object.keys(currency2) as [curr: keyof CharacterCurrency]).reduce((prev, curr): CharacterCurrency => {
    return {
      ...prev,
      [curr]: (prev?.[curr] || 0) + (currency2?.[curr] || 0),
    }
  }, currency)
}

export function addTreasure(amount: number, currencyType: string = 'gp') {
  // Trigger treasure sound and funny text
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('playCoinDrop'));
    window.dispatchEvent(new CustomEvent('showFunnyText', {
      detail: { 
        text: `${amount} ${currencyType} added to your hoard!`, 
        category: 'treasure' 
      }
    }));
  }
}

export function resetCharacterLevel(targetLevel: number = 4) {
  // Reset character level and related stats
  const store = getCharacterStore();
  
  store.info.update(currentInfo => ({
    ...currentInfo,
    level: targetLevel,
    proficiencyBonus: Math.ceil(targetLevel / 4) + 1, // Standard D&D proficiency progression
    hp: {
      ...currentInfo.hp,
      // Reset HP to appropriate level 4 values (assuming d8 hit die + CON modifier)
      current: 34,
      max: 34
    },
    class: {
      ...currentInfo.class,
      hitDice: {
        amount: targetLevel,
        die: 8
      }
    }
  }));
  
  // Clear localStorage to ensure the reset sticks
  localStorage.removeItem('ch_info');
  
  // Trigger success message
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('showFunnyText', {
      detail: { 
        text: `Character reset to level ${targetLevel}!`, 
        category: 'levelUp' 
      }
    }));
  }
  
  return targetLevel;
}

export function getEmptyCharacter(): Character {
  return {
    info: getEmptyCharacterInfo(),
    feats: [],
    abilities: [],
    savingThrows: [],
    skills: [],
    senses: [],
    actions: [],
    spells: [],
    proficients: [],
    inventory: [],
    currency: {},
    background: {title: '', description: ''},
    special: {name: '', regain: '', current: 0, max: 0},
    equipped: [],
    soundBoard: {id: 'default_soundboard', name: 'Sound Board', clips: []},
    systems: ['dnd5e'],
    overlay: null
  }
}

const characterWriteDelay = 600;

export const characterWriteError = writable('');

let characterStoreInstance: CharacterStore | null = null;
let characterStoreId: string | null = null;
let characterWriteTimer: ReturnType<typeof setTimeout> | undefined;
let characterWritten = '';
let characterReadOnly = false;

/** Holds the sheet on screen back from the vault, for a sheet the reader may read but not change. */
export function setCharacterReadOnly(on: boolean) {
  characterReadOnly = on;
  if (on) clearTimeout(characterWriteTimer);
}

// Helper function to update character store with change tracking
export function updateCharacterWithChangeLog<K extends keyof Character>(
  property: K,
  updater: (current: Character[K]) => Character[K],
  action: ChangeAction,
  description: string,
  metadata?: any
) {
  const store = getCharacterStore();
  
  // Get current state before change
  let beforeState: any;
  const unsubscribe = (store[property] as any).subscribe((current: any) => {
    beforeState = current;
  });
  unsubscribe();
  
  if (beforeState === undefined) {
    throw new Error(`Failed to get current state for property ${String(property)}`);
  }
  
  // Apply the change
  (store[property] as any).update(updater);
  
  // Get state after change
  let afterState: any;
  const unsubscribeAfter = (store[property] as any).subscribe((current: any) => {
    afterState = current;
  });
  unsubscribeAfter();
  
  if (afterState === undefined) {
    throw new Error(`Failed to get updated state for property ${String(property)}`);
  }
  
  // Log the change
  addChangeLogEntry({
    action,
    description,
    beforeState: { [property]: createStateSnapshot(beforeState) } as Partial<Character>,
    afterState: { [property]: createStateSnapshot(afterState) } as Partial<Character>,
    revertible: true,
    metadata
  });
}

function getCharacterState(store: CharacterStore): Character {
  const {unsubscribe, ...rest} = store;

  return Object.entries(rest).reduce(
    (prev, [key, value]) => ({...prev, [key]: get(value as Writable<unknown>)}),
    {} as Character
  );
}

function putCharacter() {
  clearTimeout(characterWriteTimer);
  characterWriteTimer = undefined;

  const id = characterStoreId;
  if (!characterStoreInstance || !id || !characterWritten || characterReadOnly) return;

  const character = getCharacterState(characterStoreInstance);
  const written = JSON.stringify(character);
  if (written === characterWritten) return;

  characterService.updateCharacter(id, character)
    .then(() => {
      if (characterStoreId !== id) return;
      characterWritten = written;
      characterWriteError.set('');
    })
    .catch(error => {
      console.error('Character did not save:', error);
      if (characterStoreId !== id) return;
      characterWriteError.set('That change did not reach the vault. The next change tries again.');
    });
}

// Helper function to apply state changes to character (for undo/redo)
export function applyStateToCharacter(partialState: Partial<Character>, fromDocument = false) {
  const store = characterStoreInstance ?? getCharacterStore();

  Object.entries(partialState).forEach(([key, value]) => {
    const propertyKey = key as keyof Character;
    if (store[propertyKey] && value !== undefined) {
      (store[propertyKey] as any).set(value);
    }
  });

  if (!fromDocument) return;

  clearTimeout(characterWriteTimer);
  characterWriteTimer = undefined;
  characterWritten = JSON.stringify(getCharacterState(store));
  characterWriteError.set('');
}

// Inject the state application function into global scope for changelog
(globalThis as any).__applyCharacterState = applyStateToCharacter;

export function getCharacterStore(id: string = characterStoreId ?? 'local', character: Character = getEmptyCharacter()): CharacterStore {
  if (characterStoreInstance && characterStoreId === id) {
    return characterStoreInstance;
  }

  if (characterStoreInstance) {
    if (characterWriteTimer) putCharacter();
    characterStoreInstance.unsubscribe();
    characterStoreInstance = null;
    characterWritten = '';
    characterReadOnly = false;
    characterWriteError.set('');
  }

  const prefix = `ch_${id}_`

  const {unsubscribe, ...rest} = Object.keys(character).reduce((prev: any, curr) => {
    let extProp: any = localStorage.getItem(prefix + curr)
    if (extProp) {
      try {
        extProp = JSON.parse(extProp) as Character[keyof Character]
        
        // Migration: If equipped is not an array, reset it
        if (curr === 'equipped' && !Array.isArray(extProp)) {
          console.warn('Migrating equipped from object to array format');
          extProp = [];
        }
      } catch (e) {
        console.warn('Failed to parse localStorage for', curr, '- using default');
        extProp = null;
      }
    }

    const prop = extProp || character[curr as keyof Character] as Character[keyof Character]
    const propStore = writable(prop)

    const unsubscribe = propStore.subscribe(state => {
      localStorage.setItem(prefix + curr, JSON.stringify(state))

      if (id === 'local' || characterReadOnly) return

      clearTimeout(characterWriteTimer)
      characterWriteTimer = setTimeout(putCharacter, characterWriteDelay)
    })

    return {
      ...prev,
      [curr]: propStore,
      unsubscribe: [...prev.unsubscribe, unsubscribe]
    }
  }, {unsubscribe: []}) as CharacterContext & { unsubscribe: Unsubscriber[] }

  const store = {
    ...rest,
    unsubscribe: () => unsubscribe.forEach(unsub => unsub())
  };
  
  characterStoreInstance = store;
  characterStoreId = id;
  return store;
}

export async function decryptMediaUrl(url: string): Promise<{ type: 'video' | 'image' | 'unknown', url: string }> {
  const youtubePatterns = [
    /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/,
    /youtube.com\/shorts\/([^"&?\/\s]{11})/
  ];

  for (const pattern of youtubePatterns) {
    if (!pattern.test(url)) continue

    // Extract video ID from various YouTube URL formats
    const videoIdRegex = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/;
    const match = url.match(videoIdRegex);

    if (!match) continue;

    const videoId = match[1];
    const params = 'autoplay=1&mute=1&loop=1&playlist=' + videoId + '&controls=0&showinfo=0&rel=0';
    return {
      type: 'video',
      url: `https://www.youtube-nocookie.com/embed/${videoId}?${params}`
    };
  }

  const extension = url?.split('.')?.pop()?.toLowerCase();

  const imageExtensions = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'];
  const videoExtensions = ['mp4', 'webm', 'ogg', 'mov'];

  if (extension) {
    if (imageExtensions.includes(extension)) return {type: 'image', url};
    if (videoExtensions.includes(extension)) return {type: 'video', url};
  }

  try {
    const response = await fetch(url, {method: 'HEAD'});
    const contentType = response.headers.get('content-type');

    if (contentType?.startsWith('image/')) return {type: 'image', url};
    if (contentType?.startsWith('video/')) return {type: 'video', url};

    return {type: 'unknown', url};
  } catch (error) {
    console.error('Error checking content-type:', error);
    return {type: 'unknown', url};
  }
}
export function getEmptyCharacterInfo(): CharacterInfo {
  return {
    name: '',
    description: '',
    gender: '',
    imageUrl: '',
    infoUrl: '',
    level: 1,
    inspiration: false,
    hp: { current: 0, max: 0, temporary: 0 },
    ac: 10,
    initiative: 0,
    speed: '30 ft',
    proficiencyBonus: 2,
    weight: 0,
    carry_capacity: 0,
    race: { name: 'Unknown', type: 'Unknown' },
    class: { name: 'Unknown', hitDice: { amount: 1, die: 8 } },
    conditions: [],
    defences: [],
    state: { type: 'normal' }
  }
}

export function getAbilities(scores: Record<string, number>): CharacterAbility[] {
  return Object.entries(scores).map(([id, score]) => ({
    id,
    title: id.charAt(0).toUpperCase() + id.slice(1),
    score,
    modifier: Math.floor((score - 10) / 2)
  }))
}

type InventoryItem = Character['inventory'][number]

const restedDeathSaves = { successes: 0, failures: 0 }

function isRegainedAt(regain: string | undefined, rest: 'short' | 'long'): boolean {
  const text = (regain ?? '').toLowerCase()
  return rest === 'long' ? text.includes('short') || text.includes('long') : text.includes('short')
}

export async function getResolvedRules(): Promise<ResolvedCharacter> {
  const character = getCharacterState(getCharacterStore())
  const system = await getSystemStack(character.systems, character.overlay ?? undefined)
  return getResolvedCharacter(system, getSheet(character, system))
}

export function putDamage(amount: number) {
  if (!(amount > 0)) return

  updateCharacterWithChangeLog(
    'info',
    info => {
      const temporary = info.hp.temporary || 0
      const absorbed = Math.min(temporary, amount)
      return {
        ...info,
        hp: {
          ...info.hp,
          temporary: temporary - absorbed,
          current: Math.max(0, info.hp.current - (amount - absorbed))
        }
      }
    },
    ChangeActions.HP_CHANGE,
    `Took ${amount} damage`,
    { value: amount }
  )
}

export function putHealing(amount?: number) {
  if (amount !== undefined && !(amount > 0)) return

  updateCharacterWithChangeLog(
    'info',
    info => ({
      ...info,
      hp: {
        ...info.hp,
        current: Math.min(info.hp.max, info.hp.current + (amount ?? info.hp.max)),
        deathSaves: restedDeathSaves
      }
    }),
    ChangeActions.HP_CHANGE,
    amount === undefined ? 'Fully restored health' : `Healed ${amount} HP`,
    { value: amount }
  )
}

export function putTemporaryHitPoints(amount: number) {
  updateCharacterWithChangeLog(
    'info',
    info => ({ ...info, hp: { ...info.hp, temporary: Math.max(0, amount || 0) } }),
    ChangeActions.HP_CHANGE,
    `Set ${amount} temporary HP`,
    { value: amount }
  )
}

export function putDeathSave(roll: number, scope: Record<string, number>) {
  const critical = scope['derived.deathSaveCritical']
  const fumble = scope['derived.deathSaveFumble']
  const target = scope['derived.deathSaveTarget']
  const successes = scope['derived.deathSaveSuccesses']
  const failures = scope['derived.deathSaveFailures']

  updateCharacterWithChangeLog(
    'info',
    info => {
      if (roll >= critical) {
        return {
          ...info,
          hp: {
            ...info.hp,
            current: Math.max(info.hp.current, scope['derived.deathSaveCriticalHitPoints']),
            deathSaves: restedDeathSaves
          }
        }
      }

      const saves = info.hp.deathSaves ?? restedDeathSaves
      const failed = roll <= fumble ? scope['derived.deathSaveFumbleFailures'] : roll >= target ? 0 : 1

      return {
        ...info,
        hp: {
          ...info.hp,
          deathSaves: {
            successes: Math.min(successes, saves.successes + (failed ? 0 : 1)),
            failures: Math.min(failures, saves.failures + failed)
          }
        }
      }
    },
    ChangeActions.DEATH_SAVE,
    `Rolled ${roll} on a death save`,
    { value: roll }
  )
}

export async function rollDeathSave(scope: Record<string, number>) {
  const res = await rollD20()
  writeRollLog('save', `Rolled death save ${res.formula}`, res.formula, res.sum, res.sum, res.rolls.join(','))
  putDeathSave(res.sum, scope)
}

export function putSlots(expended: number, level?: number) {
  updateCharacterWithChangeLog(
    'info',
    info => {
      if (level === undefined) {
        if (!info.slots) return info
        return { ...info, slots: { ...info.slots, expended: Math.max(0, Math.min(info.slots.amount, expended)) } }
      }

      if (!info.spells) return info
      const max = info.spells.slots?.[level] ?? 0
      return {
        ...info,
        spells: {
          ...info.spells,
          expended: { ...info.spells.expended, [level]: Math.max(0, Math.min(max, expended)) }
        }
      }
    },
    ChangeActions.SPELL_SLOT_CHANGE,
    level === undefined ? `Set ${expended} slots spent` : `Set ${expended} level ${level} slots spent`,
    { level, value: expended }
  )
}

export function putSpellcasting(spells: SpellsInfo) {
  updateCharacterWithChangeLog(
    'info',
    info => ({ ...info, spells }),
    ChangeActions.SPELL_SLOT_CHANGE,
    'Changed spellcasting'
  )
}

export function postSpell(spell: CharacterSpell) {
  updateCharacterWithChangeLog(
    'spells',
    spells => [...(spells ?? []), spell],
    ChangeActions.SPELL_ADD,
    `Added spell: ${spell.title}`
  )
}

export function putSpell(spell: CharacterSpell) {
  updateCharacterWithChangeLog(
    'spells',
    spells => (spells ?? []).map(entry => entry.id === spell.id ? spell : entry),
    ChangeActions.SPELL_CHANGE,
    `Changed spell: ${spell.title}`
  )
}

export function deleteSpell(id: string) {
  updateCharacterWithChangeLog(
    'spells',
    spells => (spells ?? []).filter(entry => entry.id !== id),
    ChangeActions.SPELL_REMOVE,
    'Removed a spell'
  )
}

export async function postCast(spell: CharacterSpell, level: number, attack: number): Promise<boolean> {
  if (level > 0) {
    const spells = get(getCharacterStore().info).spells
    const spent = spells?.expended?.[level] ?? 0
    if (spent >= (spells?.slots?.[level] ?? 0)) return false
    putSlots(spent + 1, level)
  }

  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('playSpellCast'))
  if (spell.attack) await rollAttack(spell.title, attack)
  for (const damage of spell.damage ?? []) await rollDamage(spell.title, damage.dice, damage.amount, damage.bonus)
  return true
}

export async function postShortRest(dice: number, resolved: ResolvedCharacter) {
  const store = getCharacterStore()
  const die = get(store.info).class?.hitDice?.die || 8
  const remaining = resolved.pools.find(pool => pool.id === 'hitDice')?.remaining ?? 0
  const spend = Math.max(0, Math.min(Math.floor(dice), remaining))

  let healing = 0
  if (spend > 0) {
    const res = await rollDie(die, spend)
    healing = Math.max(0, res.sum + spend * (resolved.scope['derived.hitDieHealing'] ?? 0))
    writeRollLog('heal', `Spent ${spend} hit dice on a short rest`, `${spend}d${die}`, res.sum, healing, res.rolls.join(','))
  }

  updateCharacterWithChangeLog(
    'info',
    info => ({
      ...info,
      hp: {
        ...info.hp,
        current: Math.min(info.hp.max, info.hp.current + healing),
        deathSaves: healing > 0 ? restedDeathSaves : info.hp.deathSaves,
        hitDiceSpent: (info.hp.hitDiceSpent ?? 0) + spend
      },
      slots: info.slots && isRegainedAt(info.slots.regainedAt, 'short') ? { ...info.slots, expended: 0 } : info.slots
    }),
    ChangeActions.SHORT_REST,
    spend > 0 ? `Short rest, spent ${spend} hit dice for ${healing} HP` : 'Short rest',
    { value: healing }
  )

  updateCharacterWithChangeLog(
    'special',
    special => isRegainedAt(special.regain, 'short') ? { ...special, current: special.max } : special,
    ChangeActions.SHORT_REST,
    'Short rest'
  )

  return { spend, healing }
}

export function postLongRest(resolved: ResolvedCharacter) {
  const regain = resolved.pools.find(pool => pool.id === 'hitDice')?.regain ?? 0

  updateCharacterWithChangeLog(
    'info',
    info => ({
      ...info,
      hp: {
        ...info.hp,
        current: info.hp.max,
        temporary: 0,
        deathSaves: restedDeathSaves,
        hitDiceSpent: Math.max(0, (info.hp.hitDiceSpent ?? 0) - regain)
      },
      slots: info.slots ? { ...info.slots, expended: 0 } : info.slots,
      spells: info.spells ? { ...info.spells, expended: {} } : info.spells
    }),
    ChangeActions.LONG_REST,
    'Long rest'
  )

  updateCharacterWithChangeLog(
    'special',
    special => isRegainedAt(special.regain, 'long') ? { ...special, current: special.max } : special,
    ChangeActions.LONG_REST,
    'Long rest'
  )
}

export function putCondition(condition: ConditionInfo) {
  updateCharacterWithChangeLog(
    'info',
    info => {
      const at = info.conditions.findIndex(entry => entry.title.toLowerCase() === condition.title.toLowerCase())
      return {
        ...info,
        conditions: at === -1
          ? [...info.conditions, condition]
          : info.conditions.map((entry, index) => index === at ? { ...entry, ...condition } : entry)
      }
    },
    ChangeActions.CONDITION_ADD,
    `Added condition: ${condition.title}`,
    { condition: condition.title }
  )
}

export function deleteCondition(title: string) {
  updateCharacterWithChangeLog(
    'info',
    info => ({ ...info, conditions: info.conditions.filter(entry => entry.title.toLowerCase() !== title.toLowerCase()) }),
    ChangeActions.CONDITION_REMOVE,
    `Removed condition: ${title}`,
    { condition: title }
  )
}

export function putDefence(defence: DefenceInfo) {
  updateCharacterWithChangeLog(
    'info',
    info => ({
      ...info,
      defences: info.defences.some(entry => entry.title.toLowerCase() === defence.title.toLowerCase())
        ? info.defences
        : [...info.defences, defence]
    }),
    ChangeActions.DEFENSE_ADD,
    `Added defense: ${defence.title}`,
    { defense: defence.title }
  )
}

export function deleteDefence(title: string) {
  updateCharacterWithChangeLog(
    'info',
    info => ({ ...info, defences: info.defences.filter(entry => entry.title.toLowerCase() !== title.toLowerCase()) }),
    ChangeActions.DEFENSE_REMOVE,
    `Removed defense: ${title}`,
    { defense: title }
  )
}

export function postItem(item: InventoryItem) {
  updateCharacterWithChangeLog(
    'inventory',
    inventory => [...inventory, item],
    ChangeActions.INVENTORY_ADD,
    `Added ${item.quantity} ${item.title}`
  )
}

export function putItem(item: InventoryItem) {
  if (item.quantity <= 0) {
    deleteItem(item.id)
    return
  }

  updateCharacterWithChangeLog(
    'inventory',
    inventory => inventory.map(entry => entry.id === item.id ? item : entry),
    ChangeActions.INVENTORY_CHANGE,
    `Changed ${item.title}`
  )
}

export function deleteItem(id: string) {
  updateCharacterWithChangeLog(
    'inventory',
    inventory => inventory.filter(entry => entry.id !== id),
    ChangeActions.INVENTORY_REMOVE,
    'Removed an item'
  )

  if (!get(getCharacterStore().equipped).some(entry => entry.id === id)) return

  updateCharacterWithChangeLog(
    'equipped',
    equipped => equipped.filter(entry => entry.id !== id),
    ChangeActions.EQUIPMENT_CHANGE,
    'Unequipped a removed item'
  )
}

export function putCurrency(currency: CharacterCurrency) {
  updateCharacterWithChangeLog(
    'currency',
    () => currency,
    ChangeActions.CURRENCY_CHANGE,
    'Changed currency'
  )
}

export type FormulaTerm =
  | { sign: 1 | -1, die: number, amount: number, keep?: { high: boolean, count: number } }
  | { sign: 1 | -1, value: number }

export const FORMULA_DICE = [4, 6, 8, 10, 12, 20, 100]

export function getFormula(formula: string): { terms: FormulaTerm[], text: string } | undefined {
  const words = formula.trim().toLowerCase().replace(/\s+/g, '')
  const mode = /(advantage|adv)$/.test(words) ? 'kh1' : /(disadvantage|dis)$/.test(words) ? 'kl1' : ''
  const body = words.replace(/(advantage|adv|disadvantage|dis)$/, '')
  if (!body || !/^[+-]?(\d*d\d+(k[hl]\d+)?|\d+)([+-](\d*d\d+(k[hl]\d+)?|\d+))*$/.test(body)) return undefined

  const terms: FormulaTerm[] = []
  for (const [, sign, amount, die, keep, count, value] of body.matchAll(/([+-]?)(?:(\d*)d(\d+)(?:k([hl])(\d+))?|(\d+))/g)) {
    const signed = sign === '-' ? -1 : 1
    if (value !== undefined) {
      terms.push({ sign: signed, value: parseInt(value, 10) })
      continue
    }
    terms.push({
      sign: signed,
      die: parseInt(die, 10),
      amount: parseInt(amount || '1', 10),
      ...(keep ? { keep: { high: keep === 'h', count: parseInt(count, 10) } } : {})
    })
  }

  const dice = terms.filter((term): term is Extract<FormulaTerm, { die: number }> => 'die' in term)
  if (mode && dice.length === 1 && dice[0].die === 20 && dice[0].amount === 1 && !dice[0].keep) {
    dice[0].amount = 2
    dice[0].keep = { high: mode === 'kh1', count: 1 }
  }
  if (!dice.length) return undefined
  if (dice.some(term => !FORMULA_DICE.includes(term.die) || term.amount < 1 || term.amount > 20 || (term.keep && (term.keep.count < 1 || term.keep.count > term.amount)))) return undefined
  if (dice.reduce((all, term) => all + term.amount, 0) > 30) return undefined

  const text = terms
    .map((term, index) => {
      const sign = term.sign < 0 ? '-' : index ? '+' : ''
      if ('value' in term) return `${sign}${term.value}`
      return `${sign}${term.amount}d${term.die}${term.keep ? `k${term.keep.high ? 'h' : 'l'}${term.keep.count}` : ''}`
    })
    .join('')

  return { terms, text }
}

export function getFormulaTotal(terms: FormulaTerm[], rolled: number[][]): { roll: number, total: number } {
  let at = 0
  let roll = 0
  let total = 0
  for (const term of terms) {
    if ('value' in term) {
      total += term.sign * term.value
      continue
    }
    const rolls = rolled[at++]
    const sorted = [...rolls].sort((a, b) => b - a)
    const kept = term.keep ? (term.keep.high ? sorted.slice(0, term.keep.count) : sorted.slice(-term.keep.count)) : rolls
    const sum = kept.reduce((all, one) => all + one, 0) * term.sign
    roll += sum
    total += sum
  }
  return { roll, total }
}
