import { getCampaignChatStream, getCharacter, getCsrfHeaders, getVehicle, postCampaignChat } from './api'
import type { CardKind, ChatEntry } from './api/types'
import {type Readable, type Unsubscriber, type Writable, writable, get} from "svelte/store";
import {currentRoute} from "sly-svelte-location-router";
import type {RollLog, RollLogItem} from "./types";
import {rollDie, rollDice, getFormula, getFormulaTotal, type FormulaTerm, writeRollLog, getRollLog, getAuthor, getCharacterStore, getResolvedRules, putItem, postItem, deleteItem, putHealing, putSlots, postShortRest, postLongRest, putCondition, deleteCondition, putDefence, deleteDefence, updateCharacterWithChangeLog, type ChatEntryFields} from "./engine";
import type {Character} from "./character.types";
import { ChangeActions, undoLastChange, redoLastChange } from "./changelog";
import { userDetails } from "./stores/auth.store";
import { currentCampaignId } from "./stores/campaign.store";
import { currentCharacterId } from "./stores/character.store";
import { getExpressionValue } from "./rules/expression";
import type { ResolvedCharacter } from "./rules/spec.types";

export type ReplicateLogItem = {
  returnedAt: Date,
  sentAt: Date,
  hidden?: boolean,
  query: string,
  response?: any,
  data?: any,
  message?: string
}
export type LogItem = { createdAt: Date } & ({ type: 'roll', data: RollLogItem } | {
  type: 'chat',
  data: ReplicateLogItem
})
export type ChatLog = Array<LogItem>
export type ReplicateLog = Array<ReplicateLogItem>

const replicateStore = writable<ReplicateLog>(JSON.parse(localStorage.getItem('replicate_log') || '[]') as ReplicateLog);

function checkIfNonsensical(input: string): boolean {
  if (!input || input.length === 0) return false;
  
  // Check for extremely short gibberish
  if (input.length <= 2) return true;
  
  // Check for keyboard mashing patterns
  const keyboardMashPatterns = [
    /^[qwertyuiop]+$/i,
    /^[asdfghjkl]+$/i,
    /^[zxcvbnm]+$/i,
    /^[123456789]+$/,
    /^[!@#$%^&*()]+$/,
    /(.)\1{4,}/,  // Same character repeated 5+ times
    /^[a-z]{1,3}$/, // Very short random letters
  ];
  
  // Check for nonsensical patterns
  const lowercaseInput = input.toLowerCase();
  const isKeyboardMash = keyboardMashPatterns.some(pattern => pattern.test(lowercaseInput));
  
  // Check for lack of vowels in longer strings (common in gibberish)
  const hasVowels = /[aeiou]/i.test(input);
  const isLongWithoutVowels = input.length > 4 && !hasVowels;
  
  // Check for excessive consonant clusters
  const hasExcessiveConsonants = /[bcdfghjklmnpqrstvwxyz]{5,}/i.test(input);
  
  // Check for random character sequences
  const isRandomSequence = input.length > 3 && 
    !/\b(roll|level|heal|rest|help|attack|damage|spell|skill|feat|item|weapon|armor|hp|health|magic|cast|use|equip|inventory|character|stats|ability|modifier|bonus|dice|d4|d6|d8|d10|d12|d20|d100)\b/i.test(input) &&
    (isKeyboardMash || isLongWithoutVowels || hasExcessiveConsonants);
  
  return isRandomSequence;
}

function getReplicateLog(): { replicateStore: Writable<ReplicateLog>, unsubscribeReplicate: Unsubscriber } {
  return {
    replicateStore,
    unsubscribeReplicate: replicateStore.subscribe(value => {
      localStorage.setItem('replicate_log', JSON.stringify(value));
    })
  }
}

function asCardKind(type: unknown): CardKind {
  return type === 'item_card' || type === 'npc_card' ? type : '';
}

function asMessageEntry(item: ReplicateLogItem): ChatEntryFields {
  return {
    ...getAuthor(),
    kind: 'message',
    body: item.message ?? item.response ?? '',
    query: item.query ?? '',
    is_hidden: item.hidden === true,
    card_kind: asCardKind(item.data?.type),
    roll_kind: '',
    formula: '',
    dice: [],
    roll: 0,
    total: 0
  }
}

function asLogItem(entry: ChatEntry): LogItem {
  const createdAt = entry.created_at ? new Date(entry.created_at) : new Date();
  const author = entry.author_name || 'Someone';

  if (entry.kind === 'roll') {
    return {
      createdAt,
      type: 'roll',
      data: {
        type: entry.roll_kind || 'roll',
        text: entry.body,
        author,
        formula: entry.formula,
        roll: entry.roll,
        total: entry.total,
        details: entry.dice.join(','),
        rolledAt: createdAt.toISOString()
      }
    }
  }

  const cardKind = asCardKind(entry.card_kind);

  return {
    createdAt,
    type: 'chat',
    data: {
      sentAt: createdAt,
      returnedAt: createdAt,
      hidden: entry.is_hidden,
      query: `${author}: ${entry.query}`,
      response: entry.body,
      message: entry.body,
      data: cardKind ? { type: cardKind } : undefined
    }
  }
}

function asLocalLog(rolls: RollLog, chats: ReplicateLog): ChatLog {
  const rollItems: ChatLog = rolls.map(curr => ({
    createdAt: new Date(curr.rolledAt),
    type: 'roll' as const,
    data: curr
  }));

  const chatItems: ChatLog = chats.map(curr => ({
    createdAt: new Date(curr.sentAt),
    type: 'chat' as const,
    data: curr
  }));

  return [...rollItems, ...chatItems].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
}

function postCampaignScope(): Unsubscriber {
  return currentRoute.subscribe(route => {
    const id = route?.params?.id ?? '';

    if (route?.path?.startsWith('/main/campaign/') && id) {
      currentCampaignId.set(id);
      return;
    }

    const vehicleId = route?.path?.startsWith('/main/vehicles/') ? route.path.split('/')[3] ?? '' : '';
    if (vehicleId) {
      getVehicle(vehicleId)
        .then(vehicle => {
          if (get(currentRoute)?.path === route.path) currentCampaignId.set(vehicle?.campaign_id ?? null);
        })
        .catch(error => {
          console.error('Campaign scope did not resolve:', error);
          currentCampaignId.set(null);
        });
      return;
    }

    if (route?.path?.startsWith('/main/character/') && id && id !== 'local') {
      getCharacter(id)
        .then(document => currentCampaignId.set(document?.campaign_id ?? null))
        .catch(error => {
          console.error('Campaign scope did not resolve:', error);
          currentCampaignId.set(null);
        });
      return;
    }

    currentCampaignId.set(null);
  })
}

export function getChatLog(): { chatStore: Readable<ChatLog>, unsubscribeChat: Unsubscriber } {
  const {rollStore, unsubscribeRoll} = getRollLog();
  const {replicateStore: localStore, unsubscribeReplicate} = getReplicateLog();

  const chatStore = writable<ChatLog>(asLocalLog(get(rollStore), get(localStore)));

  let scope: string | null = null;
  let shared: ChatLog = [];
  let unsubscribeShared: (() => void) | null = null;
  let publishedChats = get(localStore).length;

  const render = () => chatStore.set(scope ? shared : asLocalLog(get(rollStore), get(localStore)));

  function postEntry(entry: ChatEntryFields) {
    const campaignId = scope;
    if (!campaignId) return;

    postCampaignChat(campaignId, entry)
      .catch(error => console.error('Campaign chat entry did not save:', error));
  }

  const unsubscribeRolls = rollStore.subscribe(render);

  const unsubscribeChats = localStore.subscribe(value => {
    if (scope) {
      value.slice(publishedChats).forEach(item => postEntry(asMessageEntry(item)));
    }
    publishedChats = value.length;
    render();
  });

  const unsubscribeScope = currentCampaignId.subscribe(campaignId => {
    if (campaignId === scope) return;

    unsubscribeShared?.();
    unsubscribeShared = null;
    scope = campaignId;
    shared = [];
    publishedChats = get(localStore).length;

    if (campaignId) {
      unsubscribeShared = getCampaignChatStream(campaignId, entries => {
        shared = entries.map(asLogItem);
        render();
      });
    }

    render();
  });

  const unsubscribeRoute = postCampaignScope();

  return {
    chatStore,
    unsubscribeChat: () => {
      unsubscribeRoute();
      unsubscribeScope();
      unsubscribeShared?.();
      unsubscribeChats();
      unsubscribeRolls();
      unsubscribeReplicate();
      unsubscribeRoll();
    }
  }
}

export interface ActionResponse {
  sentAt: Date,
  returnedAt: Date,
  explanation: string,
  sources: Array<string>,
  func: string,
  args: {
    [key: string]: any
  },
  next?: string
}

type AiAction = Omit<ActionResponse, 'sentAt' | 'returnedAt'>

export interface ReplicateInput {
  top_k: number,
  top_p: number,
  prompt: string,
  max_tokens: number,
  min_tokens: number,
  temperature: number,
  length_penalty: number,
  stop_sequences: string,
  prompt_template: string,
  presence_penalty: number,
  log_performance_metrics: boolean
}

const defaultModel = "meta/meta-llama-3-70b-instruct"

// Available models with their capabilities
export const availableModels = {
  "meta/meta-llama-3-70b-instruct": {
    name: "Llama 3 70B",
    description: "Large, powerful model for complex reasoning",
    maxTokens: 4000,
    type: "llama"
  },
  "meta/meta-llama-3-8b-instruct": {
    name: "Llama 3 8B", 
    description: "Faster, smaller model for quick responses",
    maxTokens: 2000,
    type: "llama"
  },
  "mistralai/mixtral-8x7b-instruct-v0.1": {
    name: "Mixtral 8x7B",
    description: "Excellent for creative tasks and roleplay",
    maxTokens: 8000,
    type: "mixtral"
  },
  "anthropic/claude-3-haiku": {
    name: "Claude 3 Haiku",
    description: "Fast and efficient for quick tasks",
    maxTokens: 4000,
    type: "claude"
  }
};

async function callReplicate(input: ReplicateInput, modelId?: string) {
  const model = modelId || defaultModel;
  const details = get(userDetails);
  const apiKey = details?.replicate_api_key

  if (!apiKey) {
    throw new Error("Replicate api key is missing")
  }

  const url = "/api/ai/models/" + model + "/predictions";
  console.log('Making Replicate API call to:', url);
  
  const req = await fetch(url, {
    method: "POST",
    headers: {
      ...getCsrfHeaders(), "Content-Type": "application/json",
    },
    body: JSON.stringify({
      stream: false,
      input
    })
  })

  console.log('Replicate response status:', req.status);
  
  if (!req.ok) {
    const errorText = await req.text();
    console.error('Replicate error:', errorText);
    throw new Error(`Replicate API error ${req.status}: ${req.statusText} - ${errorText}`)
  }

  const sentAt = new Date()

  const resp = await req.json()
  let getUrl: string | undefined = resp?.urls?.get
  // https://api.replicate.com/v1/predictions/zc4xabca4hrj00cmsd9s1ps9xw
  getUrl = getUrl?.replace('https://api.replicate.com/v1', '/api/ai')

  if (!getUrl) {
    throw new Error(`Invalid response`)
  }

  let timeout: any
  const pullResult = (retries?: number): Promise<any> => new Promise((resolve, reject) => {
    const currentRetries = retries || 1;
    
    if (currentRetries > 15) {
      reject(new Error('Replicate API timeout after 15 retries'));
      return;
    }
    
    clearTimeout(timeout)
    timeout = setTimeout(async () => {
      try {
        console.log(`Polling Replicate result, attempt ${currentRetries}`);
        
        const res = await fetch(getUrl, {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
          },
        })

        if (!res.ok) {
          console.log(`Poll failed with status ${res.status}, retrying...`);
          return pullResult(currentRetries + 1).then(resolve).catch(reject);
        }

        const body = await res.json()
        
        if (body.status === 'succeeded') {
          const output = body.output?.join('');
          console.log('Replicate output:', output);
          
          if (output) {
            try {
              const parsed = JSON.parse(output);
              resolve(parsed);
            } catch (parseError) {
              console.error('Failed to parse Replicate output as JSON:', parseError);
              reject(new Error('Invalid JSON response from Replicate'));
            }
          } else {
            reject(new Error('Empty output from Replicate'));
          }
        } else if (body.status === 'failed') {
          reject(new Error(`Replicate prediction failed: ${body.error}`));
        } else {
          // Still processing, continue polling
          return pullResult(currentRetries + 1).then(resolve).catch(reject);
        }
      } catch (e) {
        console.error('Error during polling:', e);
        return pullResult(currentRetries + 1).then(resolve).catch(reject);
      }
    }, 2000 * currentRetries)
  })

  const res = await pullResult() as any
  return {
    ...res,
    sentAt,
    returnedAt: new Date(),
  } as ActionResponse
}

export async function rollFormula(formula: string): Promise<ActionResponse | undefined> {
  const parsed = getFormula(formula);
  if (!parsed) return undefined;

  const dice = parsed.terms.filter((term): term is Extract<FormulaTerm, { die: number }> => 'die' in term);
  const rolled = await rollDice(dice.map(term => ({ die: term.die, amount: term.amount })));
  const { roll, total } = getFormulaTotal(parsed.terms, rolled);

  writeRollLog('roll', `/roll ${parsed.text}`, parsed.text, roll, total, rolled.flat().join(','));

  return {
    sentAt: new Date(),
    returnedAt: new Date(),
    explanation: `Direct /roll command: ${parsed.text}`,
    sources: [],
    func: 'rollDice',
    args: { formula: parsed.text, rolled, total }
  } as ActionResponse;
}

export async function detectAction(query: string, modelId?: string) {
  // Simple pattern matching for only the most basic commands, everything else goes to AI
  const lowercaseQuery = query.toLowerCase().trim();

  // Only keep the most direct commands, send everything else to AI for interpretation
  if (lowercaseQuery === 'level up' || lowercaseQuery === 'levelup') {
    console.log('Direct level up command detected');
    return await aiLevelUp({ explanation: 'Direct level up command', sources: [], func: 'levelUp', args: {} });
  }

  // Direct /roll command bypass (doesn't go through AI)
  if (query.startsWith('/roll ')) {
    const rolled = await rollFormula(query.substring(6));
    if (rolled) return rolled;

    // If /roll command is malformed, still process through AI
    console.log('Malformed /roll command, sending to AI');
  }
  
  // Check for nonsensical input before sending to AI
  const isNonsensical = checkIfNonsensical(query.trim());
  if (isNonsensical) {
    console.log('Nonsensical input detected, showing intention message');
    
    replicateStore.update(state => ([...state, {
      query,
      sentAt: new Date(),
      returnedAt: new Date(),
      message: `💭 **Intention detected**: "${query}"\n\nIt looks like you might be testing the input or typing randomly. If you have a specific question about your character or want to perform an action, please let me know!`,
      hidden: false
    }]));
    
    return Promise.resolve();
  }
  
  // Everything else goes to AI for intelligent interpretation
  console.log('Sending to AI for interpretation:', query);
  
  // All text commands now go through AI for intelligent interpretation
  
  /* DISABLED OLD PATTERN MATCHING - ALL GOES TO AI NOW
  if (lowercaseQuery.includes('refill health') || lowercaseQuery.includes('heal me') || lowercaseQuery.includes('restore health')) {
    console.log('Direct health refill command detected');
    return await aiRefillHealth({ explanation: 'Direct health refill command', sources: [], func: 'refillHealth', args: {} });
  }
  
  // Special resource commands
  if (lowercaseQuery.includes('refill grit') || lowercaseQuery.includes('restore grit') || 
      lowercaseQuery.includes('refill chi') || lowercaseQuery.includes('restore chi') ||
      lowercaseQuery.includes('refill sorcery') || lowercaseQuery.includes('restore sorcery')) {
    console.log('Direct special resource refill command detected');
    return await aiRefillSpecial({ explanation: 'Direct special resource refill command', sources: [], func: 'refillSpecial', args: {} });
  }
  
  // Spell slot commands
  if (lowercaseQuery.includes('refill spell') || lowercaseQuery.includes('restore spell')) {
    console.log('Direct spell slot refill command detected');
    return await aiRefillSpellSlots({ explanation: 'Direct spell slot refill command', sources: [], func: 'refillSpellSlots', args: {} });
  }
  
  // Rest commands
  if (lowercaseQuery.includes('short rest') || lowercaseQuery === 'rest') {
    console.log('Direct short rest command detected');
    return await aiShortRest({ explanation: 'Direct short rest command', sources: [], func: 'shortRest', args: {} });
  }
  
  if (lowercaseQuery.includes('long rest') || lowercaseQuery.includes('sleep')) {
    console.log('Direct long rest command detected');
    return await aiLongRest({ explanation: 'Direct long rest command', sources: [], func: 'longRest', args: {} });
  }
  
  // Level progression queries
  const levelMatch = lowercaseQuery.match(/(?:what (?:do )?i get (?:at|in) level (\d+)|level (\d+) (?:features|abilities|progression)|(\d+)(?:th|st|nd|rd) level)/);
  if (levelMatch) {
    const level = parseInt(levelMatch[1] || levelMatch[2] || levelMatch[3], 10);
    console.log(`Direct level progression command detected for level ${level}`);
    return await aiLevelProgression({ explanation: 'Direct level progression query', sources: [], func: 'levelProgression', args: { level } });
  }
  
  // Level down queries
  const levelDownMatch = lowercaseQuery.match(/(?:level.*down.*(?:to )?(?:level )?(\d+)|reduce.*level.*(?:to )?(\d+)|back.*(?:to )?level (\d+))/);
  if (levelDownMatch) {
    const targetLevel = parseInt(levelDownMatch[1] || levelDownMatch[2] || levelDownMatch[3], 10);
    console.log(`Direct level down command detected to level ${targetLevel}`);
    return await aiLevelDown({ explanation: 'Direct level down command', sources: [], func: 'levelDown', args: { targetLevel } });
  }
  
  // Undo/Redo commands
  if (lowercaseQuery.includes('undo') || lowercaseQuery.includes('ctrl+z') || lowercaseQuery.includes('revert')) {
    console.log('Direct undo command detected');
    return await aiUndoLastChange({ explanation: 'Direct undo command', sources: [], func: 'undoLastChange', args: {} });
  }
  
  if (lowercaseQuery.includes('redo') || lowercaseQuery.includes('ctrl+y')) {
    console.log('Direct redo command detected');
    return await aiRedoLastChange({ explanation: 'Direct redo command', sources: [], func: 'redoLastChange', args: {} });
  }
  
  // Test damage display command
  if (lowercaseQuery.includes('test damage') || lowercaseQuery.includes('test confetti') || lowercaseQuery.includes('demo damage')) {
    console.log('Direct test damage command detected');
    window.dispatchEvent(new CustomEvent('testDamageDisplay'));
    
    replicateStore.update(state => ([...state, {
      query: 'Test Damage Display',
      sentAt: new Date(),
      returnedAt: new Date(),
      message: "🎆 **Testing Damage Display!**\n\nWatch the screen for WoW-style damage numbers and confetti animations!\n\nTry rolling some dice by clicking skill check buttons or attack/damage buttons to see the system in action.",
      hidden: false
    }]));
    
    return Promise.resolve();
  }
  
  // Condition management commands
  const addConditionMatch = lowercaseQuery.match(/(?:add|apply|give me|inflict)\s+(?:condition\s+)?(.+?)(?:\s+(?:condition|effect|status))?$/);
  if (addConditionMatch) {
    const conditionName = addConditionMatch[1].trim();
    console.log(`Direct add condition command detected: ${conditionName}`);
    return await aiAddCondition({ explanation: 'Direct add condition command', sources: [], func: 'addCondition', args: { condition: conditionName } });
  }
  
  // Remove all conditions
  const removeAllConditionsMatch = lowercaseQuery.match(/(?:remove|clear|cure|end)\s+all\s+(?:conditions?|effects?|statuses?)/);
  if (removeAllConditionsMatch) {
    console.log(`Remove all conditions command detected`);
    return await aiRemoveAllConditions({ explanation: 'Remove all conditions command', sources: [], func: 'removeAllConditions', args: {} });
  }

  const removeConditionMatch = lowercaseQuery.match(/(?:remove|cure|clear|end)\s+(?:condition\s+)?(.+?)(?:\s+(?:condition|effect|status))?$/);
  if (removeConditionMatch) {
    const conditionName = removeConditionMatch[1].trim();
    console.log(`Direct remove condition command detected: ${conditionName}`);
    return await aiRemoveCondition({ explanation: 'Direct remove condition command', sources: [], func: 'removeCondition', args: { condition: conditionName } });
  }
  
  // Defense/resistance management commands
  const addDefenseMatch = lowercaseQuery.match(/(?:add|give me|grant)\s+(?:(?:resistance|immunity|defense)\s+(?:to\s+)?)?(.+?)(?:\s+(?:resistance|immunity|defense))?$/);
  if (addDefenseMatch && (lowercaseQuery.includes('resistance') || lowercaseQuery.includes('immunity') || lowercaseQuery.includes('defense'))) {
    const defenseName = addDefenseMatch[1].trim();
    console.log(`Direct add defense command detected: ${defenseName}`);
    return await aiAddDefense({ explanation: 'Direct add defense command', sources: [], func: 'addDefense', args: { defense: defenseName } });
  }
  
  const removeDefenseMatch = lowercaseQuery.match(/(?:remove|lose|clear)\s+(?:(?:resistance|immunity|defense)\s+(?:to\s+)?)?(.+?)(?:\s+(?:resistance|immunity|defense))?$/);
  if (removeDefenseMatch && (lowercaseQuery.includes('resistance') || lowercaseQuery.includes('immunity') || lowercaseQuery.includes('defense'))) {
    const defenseName = removeDefenseMatch[1].trim();
    console.log(`Direct remove defense command detected: ${defenseName}`);
    return await aiRemoveDefense({ explanation: 'Direct remove defense command', sources: [], func: 'removeDefense', args: { defense: defenseName } });
  }
  
  // List conditions/defenses commands
  if (lowercaseQuery.includes('list conditions') || lowercaseQuery.includes('show conditions') || lowercaseQuery.includes('what conditions')) {
    console.log('Direct list conditions command detected');
    return await aiListConditions({ explanation: 'Direct list conditions command', sources: [], func: 'listConditions', args: {} });
  }
  
  if (lowercaseQuery.includes('list defenses') || lowercaseQuery.includes('show defenses') || lowercaseQuery.includes('what resistances')) {
    console.log('Direct list defenses command detected');
    return await aiListDefenses({ explanation: 'Direct list defenses command', sources: [], func: 'listDefenses', args: {} });
  }
  
  // Inventory/items commands
  if (lowercaseQuery.includes('show items') || lowercaseQuery.includes('list items') || lowercaseQuery.includes('my items') || 
      lowercaseQuery.includes('show inventory') || lowercaseQuery.includes('list inventory') || lowercaseQuery.includes('my inventory') ||
      lowercaseQuery === 'items' || lowercaseQuery === 'inventory') {
    console.log('Direct show items command detected');
    return await aiShowItems({ explanation: 'Direct show items command', sources: [], func: 'showItems', args: {} });
  }
  
  // Specific item query commands (e.g., "show me my gun", "show my sword", etc.)
  const specificItemMatch = lowercaseQuery.match(/(?:show|find|describe|tell me about)\s+(?:me\s+)?(?:my\s+)?(.+?)(?:\s+(?:item|equipment|weapon|armor))?$/);
  if (specificItemMatch && !lowercaseQuery.includes('items') && !lowercaseQuery.includes('inventory') && 
      !lowercaseQuery.includes('conditions') && !lowercaseQuery.includes('defenses') &&
      !lowercaseQuery.includes('add') && !lowercaseQuery.includes('remove')) {
    const itemQuery = specificItemMatch[1].trim();
    console.log(`Direct show specific item command detected: ${itemQuery}`);
    return await aiShowSpecificItem({ explanation: 'Direct show specific item command', sources: [], func: 'showSpecificItem', args: { itemQuery } });
  }
  
  // Add ammunition (special case to increase existing ammo quantity)
  const addAmmoMatch = lowercaseQuery.match(/(?:add|give me|create)\s+(\d+)?\s*(?:x\s+)?(?:ammo|ammunition)(?:\s+(?:to inventory|item|equipment))?$/);
  if (addAmmoMatch) {
    const quantity = parseInt(addAmmoMatch[1]) || 20; // Default to 20 if no number specified
    console.log(`Direct add ammunition command detected: ${quantity}x ammunition`);
    return await aiAddAmmunition({ explanation: 'Direct add ammunition command', sources: [], func: 'addAmmunition', args: { quantity } });
  }

  // Add item/ammunition commands
  const addItemMatch = lowercaseQuery.match(/(?:add|give me|create)\s+(\d+)?\s*(?:x\s+)?(.+?)(?:\s+(?:to inventory|item|equipment))?$/);
  if (addItemMatch && (lowercaseQuery.includes('add') || lowercaseQuery.includes('give me') || lowercaseQuery.includes('create'))) {
    const quantity = parseInt(addItemMatch[1]) || 1;
    const itemName = addItemMatch[2].trim();
    console.log(`Direct add item command detected: ${quantity}x ${itemName}`);
    return await aiAddItem({ explanation: 'Direct add item command', sources: [], func: 'addItem', args: { itemName, quantity } });
  }
  
  // Remove item/ammunition commands
  const removeItemMatch = lowercaseQuery.match(/(?:remove|delete|lose)\s+(\d+)?\s*(?:x\s+)?(.+?)(?:\s+(?:from inventory|item|equipment))?$/);
  if (removeItemMatch && (lowercaseQuery.includes('remove') || lowercaseQuery.includes('delete') || lowercaseQuery.includes('lose'))) {
    const quantity = parseInt(removeItemMatch[1]) || 1;
    const itemName = removeItemMatch[2].trim();
    console.log(`Direct remove item command detected: ${quantity}x ${itemName}`);
    return await aiRemoveItem({ explanation: 'Direct remove item command', sources: [], func: 'removeItem', args: { itemName, quantity } });
  }
  END OF DISABLED PATTERN MATCHING */
  
  const input = {
    top_k: 0,
    top_p: 0.9,
    prompt: query,
    max_tokens: 2000,
    min_tokens: 0,
    temperature: 0.6,
    length_penalty: 1,
    stop_sequences: "<|end_of_text|>,<|eot_id|>",
    prompt_template: `
      <|begin_of_text|><|start_header_id|>system<|end_header_id|>
      \n\nYou are a helpful action selecting assistant that always finds the correct action the user wants. Figure out 
      what data is most likely required, and what functions to call among the below options (include arguments if described).
      Try as best as possible to always resolve it to one of the actions and populate the arguments!
      
      SPECIAL INTERPRETATION RULES:
      - For ammunition: "bullets", "ammo", "ammunition", "arrows", "bolts", "rounds" = use addAmmunition function
      - For conditions: "poisoned", "stunned", "paralyzed", "charmed", etc. = use addCondition/removeCondition
      - For "remove all", "clear all", "cure all" + conditions/effects = use removeAllConditions
      - For "remove all", "clear all" + defenses/resistances/immunities = use removeAllDefenses
      - For inventory items: weapons, armor, tools, consumables = use addItem/removeItem
      - Always extract quantity numbers from user input (e.g., "20 bullets" = quantity: 20)
      
      Data sources: 
      1. info: All character general info
      2. feats: All character traits and feats 
      3. abilities: All character abilities
      4. savingThrows: All character saving throws
      5. skills: All character skills 
      6. senses: All character senses and passive abilities
      7. actions: All actions the character can take 
      8. spells: All player spells
      9. proficients: All character proficiencies
      10. inventory: All character inventory
      11. currency: All character currency, 
      12. background: All character background and lore
      13. dnd_handbook: Dungeons & dragons 5th edition sources
      14. items_database: Equipment, weapons, armor, and magic items
      15. npcs_database: NPCs, monsters, and creatures
      16. external: External source
      
      Functions:
      1. rollDie: rolls a specific set of dies [args; die: 4 | 6 | 8 | 10 | 12 | 20 | 100, amount: number].
      2. lookupCharacterSource: Looks up details about the character (this is the user) [args; query: string].
      3. lookupSource: Look up a dungeons and dragons related query [args; query: string].
      4. updateInfo: Update general character information.
      5. updateFeats: Updates character feats.
      6. updateAbilities: Updates character abilities.
      7. updateSavingThrows: Updates character saving throws.
      8. updateSkills: Updates character skills.
      9. updateSenses: Update character senses.
      10. updateActions: Updates character actions.
      11. updateSpells: Updates character spells.
      12. updateProficients: Updates character proficients.
      13. updateInventory: Sets how many of an item the character holds, 0 removes it [args; itemName: string, quantity: number].
      14. updateCurrency: Updates character currency/money.
      15. updateBackground: Updates character background and lore.
      16. levelUp: Triggers the level up dialog for character advancement.
      17. changeTheme: Opens the theme selection dialog.
      18. showCombatActions: Lists all available combat actions and spells.
      19. recommendFeat: Suggests feats based on character build and level.
      20. findUnusedItems: Shows least used or never used inventory items.
      21. showSources: Opens the character sources management dialog.
      22. calculateStats: Shows current character statistics and modifiers.
      23. suggestSpells: Recommends spells for spellcasting characters.
      24. optimizeBuild: Provides character optimization suggestions.
      25. lookupItem: Look up information about a specific item or equipment [args; itemName: string].
      26. lookupNPC: Look up information about an NPC, monster, or creature [args; npcName: string].
      27. searchItems: Search for items by type, properties, or description [args; query: string, type?: string].
      28. searchNPCs: Search for NPCs by type, challenge rating, or abilities [args; query: string, type?: string].
      29. refillHealth: Restore character hit points to maximum [args; amount?: number].
      30. refillSpecial: Restore special resources like grit points, chi, sorcery points [args; resourceName?: string].
      31. refillSpellSlots: Restore spell slots to maximum [args; level?: number].
      32. shortRest: Take a short rest to recover some resources.
      33. longRest: Take a long rest to recover most resources.
      34. levelProgression: Show what features, feats, and abilities are gained at a specific level [args; level: number].
      35. levelDown: Reduce character level and revert associated changes [args; targetLevel: number].
      36. undoLastChange: Undo the most recent character change (Ctrl+Z functionality).
      37. redoLastChange: Redo the most recently undone change.
      38. addItem: Add items to inventory (weapons, armor, consumables) [args; itemName: string, quantity: number].
      39. removeItem: Remove items from inventory [args; itemName: string, quantity: number].
      40. addAmmunition: Add ammunition/bullets/arrows to existing ammo supply [args; quantity: number].
      41. showItems: Display character's current inventory with details.
      42. showSpecificItem: Display detailed information about a specific item [args; itemQuery: string].
      43. addCondition: Apply a condition/status effect to character [args; condition: string].
      44. removeCondition: Remove a specific condition from character [args; condition: string].
      45. removeAllConditions: Clear all active conditions/effects from character.
      46. listConditions: Show all currently active conditions and effects.
      47. addDefense: Add damage resistance/immunity to character [args; defense: string].
      48. removeDefense: Remove damage resistance/immunity from character [args; defense: string].
      49. removeAllDefenses: Clear all damage resistances/immunities from character.
      
      Return:
      Always answer as a json after the below schema, omit all other output. No other output then the below json schema!!
      (When in doubt, put your follow up question as the next parameter).    
      {{
        "explanation": "Why you have decided the sources and function",
        "sources": ["key of the sources to use as a string array"],
        "func": "key of the function to call",
        "args:": {{
          "key of argument": "argument value"  
        }},
        "next"?: "A prompt for the next AI call with what to do with the result, if the user has explicitly specified to do something with the result. Omit if not specified!"
      }}
      
      no other response than json, omit all other output but the json response!
     
      <|eot_id|><|start_header_id|>user<|end_header_id|>\n\n{prompt}<|eot_id|><|start_header_id|>assistant<|end_header_id|>\n\n
    `,
    presence_penalty: 1.15,
    log_performance_metrics: false
  };

  const {sentAt, returnedAt, ...rest} = await callReplicate(input, modelId) as ActionResponse

  console.log('AI Action Result:', rest)

  replicateStore.update(state => ([...state, {
    query,
    sentAt,
    returnedAt,
    response: JSON.stringify(rest),
    data: rest,
    hidden: true
  }]))

  console.log('Executing function:', rest.func)

  switch (rest.func) {
    case 'rollDie': {
      return await aiRollDie(rest)
    }
    case 'updateInventory': {
      return aiUpdateInventory(rest)
    }
    case 'levelUp': {
      return await aiLevelUp(rest)
    }
    case 'changeTheme': {
      return await aiChangeTheme(rest)
    }
    case 'showCombatActions': {
      return aiShowCombatActions(rest)
    }
    case 'recommendFeat': {
      return aiRecommendFeat(rest)
    }
    case 'findUnusedItems': {
      return aiFindUnusedItems(rest)
    }
    case 'showSources': {
      return await aiShowSources(rest)
    }
    case 'calculateStats': {
      return aiCalculateStats(rest)
    }
    case 'suggestSpells': {
      return aiSuggestSpells(rest)
    }
    case 'optimizeBuild': {
      return aiOptimizeBuild(rest)
    }
    case 'lookupItem': {
      return aiLookupItem(rest)
    }
    case 'lookupNPC': {
      return aiLookupNPC(rest)
    }
    case 'searchItems': {
      return aiSearchItems(rest)
    }
    case 'searchNPCs': {
      return aiSearchNPCs(rest)
    }
    case 'refillHealth': {
      return aiRefillHealth(rest)
    }
    case 'refillSpecial': {
      return aiRefillSpecial(rest)
    }
    case 'refillSpellSlots': {
      return aiRefillSpellSlots(rest)
    }
    case 'shortRest': {
      return aiShortRest(rest)
    }
    case 'longRest': {
      return aiLongRest(rest)
    }
    case 'levelProgression': {
      return await aiLevelProgression(rest)
    }
    case 'levelDown': {
      return await aiLevelDown(rest)
    }
    case 'undoLastChange': {
      return await aiUndoLastChange(rest)
    }
    case 'redoLastChange': {
      return await aiRedoLastChange(rest)
    }
    case 'addCondition': {
      return await aiAddCondition(rest)
    }
    case 'removeCondition': {
      return await aiRemoveCondition(rest)
    }
    case 'removeAllConditions': {
      return await aiRemoveAllConditions(rest)
    }
    case 'addDefense': {
      return await aiAddDefense(rest)
    }
    case 'removeDefense': {
      return await aiRemoveDefense(rest)
    }
    case 'removeAllDefenses': {
      return await aiRemoveAllDefenses(rest)
    }
    case 'listConditions': {
      return await aiListConditions(rest)
    }
    case 'listDefenses': {
      return await aiListDefenses(rest)
    }
    case 'showItems': {
      return await aiShowItems(rest)
    }
    case 'showSpecificItem': {
      return await aiShowSpecificItem(rest)
    }
    case 'addItem': {
      return await aiAddItem(rest)
    }
    case 'addAmmunition': {
      return await aiAddAmmunition(rest)
    }
    case 'removeItem': {
      return await aiRemoveItem(rest)
    }
    default:
      if (rest.next) {
        replicateStore.update(state => ([...state, {
          query,
          sentAt,
          returnedAt: new Date(),
          message: rest.next,
          hidden: false
        }]))
      } else {
        // Instead of throwing an error, show a "not recognized" message
        replicateStore.update(state => ([...state, {
          query,
          sentAt,
          returnedAt: new Date(),
          message: `🤔 **Action not recognized**: "${query}"\n\nI didn't understand that command. Try:\n• Rolling dice: \`/roll 1d20\` or \`/roll 2d6+3\`\n• Character actions: \`level up\`, \`short rest\`, \`long rest\`\n• Health management: \`heal me\`, \`refill health\`\n• Or ask me questions about your character!`,
          hidden: false
        }]))
      }
  }
}

async function aiRollDie(action: AiAction) {
  try {
    const die = parseInt(action.args.die, 0)
    const amount = parseInt(action.args.amount, 0)

    const res = await rollDie(die, amount)
    return writeRollLog('ai', `Rolled some dies ${amount}d${die}`, `${amount}d${die}`, res.sum, res.sum, res.rolls.join(','));
  } catch (e: any) {
    throw new Error(e)
  }
}

export type UIAction = 'openThemeDialog' | 'openLevelUpDialog' | 'openFrameDialog' | 'openSourceImport' | 'exportCharacter'

const CHARACTER_ACTIONS: UIAction[] = ['openLevelUpDialog', 'openFrameDialog', 'exportCharacter']

const NO_CHARACTER = 'Open a character first.'

let uiActionDispatcher: ((action: UIAction) => void) | null = null;

export function setUIActionDispatcher(dispatcher: ((action: UIAction) => void) | null) {
  uiActionDispatcher = dispatcher;
}

export function getUIActionBlock(action: UIAction, characterId: string | null = get(currentCharacterId)): string {
  return CHARACTER_ACTIONS.includes(action) && !characterId ? NO_CHARACTER : '';
}

export function postUIAction(action: UIAction): string {
  const block = getUIActionBlock(action) || (uiActionDispatcher ? '' : 'The dialogs are not mounted.');
  if (block) return block;
  uiActionDispatcher?.(action);
  return '';
}

type InventoryItem = Character['inventory'][number]

export function getCurrentCharacter(): Character | null {
  if (!get(currentCharacterId)) return null;
  const {unsubscribe, ...stores} = getCharacterStore();
  return Object.fromEntries(
    Object.entries(stores).map(([key, store]) => [key, get(store as Readable<unknown>)])
  ) as unknown as Character;
}

function getSigned(value: number): string {
  return value >= 0 ? `+${value}` : `${value}`;
}

export function getInventoryItem(inventory: InventoryItem[], itemName: string): InventoryItem | undefined {
  const name = itemName.trim().toLowerCase();
  if (!name) return undefined;
  return inventory.find(item => item.title.toLowerCase() === name)
    ?? inventory.find(item => item.title.toLowerCase().includes(name));
}

async function aiUpdateInventory(action: AiAction) {
  const itemName = String(action.args.itemName ?? '');
  const quantity = Number(action.args.quantity);
  const character = getCurrentCharacter();
  const item = character ? getInventoryItem(character.inventory, itemName) : undefined;

  let message: string;
  if (!character) {
    message = `❌ **Inventory unavailable:** ${NO_CHARACTER}`;
  } else if (!item) {
    message = `❌ **No such item:** nothing in the inventory is called "${itemName}".`;
  } else if (!Number.isInteger(quantity) || quantity < 0) {
    message = `❌ **Quantity missing:** say how many ${item.title} to hold, for example "set ${item.title} to 3".`;
  } else {
    putItem({ ...item, quantity });
    message = quantity === 0
      ? `🎒 **Inventory updated**\n\nRemoved **${item.title}**.`
      : `🎒 **Inventory updated**\n\n**${item.title}**: ${item.quantity} → **${quantity}**`;
  }

  replicateStore.update(state => ([...state, {
    query: `Update Inventory: ${itemName}`,
    sentAt: new Date(),
    returnedAt: new Date(),
    message,
    hidden: false
  }]));
}

async function aiLevelUp(action: AiAction) {
  const block = postUIAction('openLevelUpDialog');

  replicateStore.update(state => ([...state, {
    query: 'Level Up',
    sentAt: new Date(),
    returnedAt: new Date(),
    message: block ? `❌ **Level up unavailable:** ${block}` : "🎉 Opening level up dialog! Time to advance your character.",
    hidden: false
  }]));
}

async function aiChangeTheme(action: AiAction) {
  const block = postUIAction('openThemeDialog');

  replicateStore.update(state => ([...state, {
    query: 'Change Theme',
    sentAt: new Date(),
    returnedAt: new Date(),
    message: block ? `❌ **Theme unavailable:** ${block}` : "🎨 Opening theme selection dialog! Choose your preferred visual style.",
    hidden: false
  }]));
}

function getDamageText(damage: NonNullable<Character['actions'][number]['damage']>): string {
  return damage
    .map(one => `${one.amount}d${one.dice}${one.bonus ? getSigned(one.bonus) : ''} ${one.type}`.trim())
    .join(' + ');
}

export function getCombatActionsMessage(character: Character): string {
  const order = ['Action', 'Bonus', 'Reaction', 'Other'] as const;
  const titles: Record<typeof order[number], string> = { Action: 'Actions', Bonus: 'Bonus Actions', Reaction: 'Reactions', Other: 'Other' };
  const actions = character.actions ?? [];

  if (actions.length === 0) {
    return `⚔️ **${character.info.name || 'This character'}** has no actions on the sheet.`;
  }

  const groups = order
    .map(type => ({ type, list: actions.filter(one => (one.type ?? 'Other') === type) }))
    .filter(group => group.list.length > 0)
    .map(group => `**${titles[group.type]}**\n` + group.list.map(one => {
      const parts = [
        one.toHit !== undefined ? `${getSigned(one.toHit)} to hit` : '',
        one.damage?.length ? getDamageText(one.damage) : '',
        one.save ? `DC ${one.save.dc} ${one.save.type}` : '',
        one.range ? `${one.range.normal}${one.range.max && one.range.max !== one.range.normal ? `/${one.range.max}` : ''} ft` : ''
      ].filter(Boolean);
      return `• **${one.name}**${parts.length ? ` — ${parts.join(', ')}` : ''}`;
    }).join('\n'));

  const spells = (character.spells ?? []).filter(one => one.attack || one.damage?.length || one.save);
  const casting = spells.length
    ? `\n\n**Combat Spells**\n` + spells.map(one => `• **${one.title}**${one.level ? ` (level ${one.level})` : ' (cantrip)'}${one.damage?.length ? ` — ${getDamageText(one.damage)}` : ''}`).join('\n')
    : '';

  return `⚔️ **Combat Actions for ${character.info.name || 'this character'}:**\n\n${groups.join('\n\n')}${casting}`;
}

async function aiShowCombatActions(action: AiAction) {
  const character = getCurrentCharacter();

  replicateStore.update(state => ([...state, {
    query: 'Show Combat Actions',
    sentAt: new Date(),
    returnedAt: new Date(),
    message: character ? getCombatActionsMessage(character) : `❌ **Combat actions unavailable:** ${NO_CHARACTER}`,
    hidden: false
  }]));
}

export type SourceFeat = {
  id: string
  name: string
  type: string
  description: string
  prerequisites?: Array<{ type: string, value: string }> | Record<string, unknown>
  tags?: string[] | null
}

export function getFeatRecommendations(character: Character, feats: SourceFeat[]): Array<{ feat: SourceFeat, reason: string }> {
  const taken = new Set((character.feats ?? []).map(one => one.title.toLowerCase()));
  const actions = character.actions ?? [];
  const casts = (character.spells ?? []).length > 0 || Boolean(character.info.spells);
  const reasons: Record<string, string> = {
    ranged: actions.some(one => (one.range?.normal ?? 0) > 5) ? 'you attack at range' : '',
    weapon: actions.some(one => one.layout === 'Attack') ? 'you make weapon attacks' : '',
    spellcasting: casts ? 'you cast spells' : ''
  };

  const meets = (feat: SourceFeat) => (Array.isArray(feat.prerequisites) ? feat.prerequisites : []).every(need =>
    need.type === 'feature' && need.value === 'spellcasting'
      ? casts
      : taken.has(String(need.value).toLowerCase())
  );

  return feats
    .filter(feat => feat.type === 'feat' && (feat.tags ?? []).includes('feat'))
    .filter(feat => !taken.has(feat.name.toLowerCase()) && meets(feat))
    .map(feat => ({ feat, reason: (feat.tags ?? []).map(tag => reasons[tag]).find(Boolean) ?? '' }))
    .sort((a, b) => Number(Boolean(b.reason)) - Number(Boolean(a.reason)));
}

async function aiRecommendFeat(action: AiAction) {
  const character = getCurrentCharacter();
  let message: string;

  if (!character) {
    message = `❌ **Feat recommendations unavailable:** ${NO_CHARACTER}`;
  } else {
    try {
      const answer = await fetch('/sources/features/generic-features.json');
      if (!answer.ok) throw new Error(`The feat list answered ${answer.status}.`);
      const { features } = await answer.json() as { features: SourceFeat[] };
      const picks = getFeatRecommendations(character, features);
      message = picks.length
        ? `💡 **Feats ${character.info.name || 'this character'} can take:**\n\n` + picks.map(({ feat, reason }) => `• **${feat.name}**${reason ? ` — ${reason}` : ''}\n  ${feat.description}`).join('\n')
        : `💡 **${character.info.name || 'This character'}** already has every feat on the list, or meets none of their prerequisites.`;
    } catch (error) {
      message = `❌ **Feat list unavailable:** ${error instanceof Error ? error.message : String(error)}`;
    }
  }

  replicateStore.update(state => ([...state, {
    query: 'Recommend Feat',
    sentAt: new Date(),
    returnedAt: new Date(),
    message,
    hidden: false
  }]));
}

export function getUnusedItems(character: Character): InventoryItem[] {
  const equipped = new Set((character.equipped ?? []).map(one => one.id));
  const used = new Set((character.actions ?? []).map(one => one.itemId).filter(Boolean));

  return (character.inventory ?? [])
    .filter(item => !item.equipped && !equipped.has(item.id) && !used.has(item.id))
    .sort((a, b) => (b.weight || 0) * (b.quantity || 0) - (a.weight || 0) * (a.quantity || 0));
}

export function getUnusedItemsMessage(character: Character): string {
  const items = getUnusedItems(character);

  if (items.length === 0) {
    return `🎒 **Inventory Analysis:**\n\nEvery item ${character.info.name || 'this character'} carries is equipped or behind an action.`;
  }

  const weight = items.reduce((sum, item) => sum + (item.weight || 0) * (item.quantity || 0), 0);

  return `🎒 **Inventory Analysis:**\n\n${items.length} item${items.length === 1 ? '' : 's'} neither equipped nor used by any action, ${weight} lb in all:\n\n`
    + items.map(item => `• **${item.title}**${item.quantity > 1 ? ` ×${item.quantity}` : ''}${item.weight ? ` — ${(item.weight * item.quantity)} lb` : ''}`).join('\n');
}

async function aiFindUnusedItems(action: AiAction) {
  const character = getCurrentCharacter();

  replicateStore.update(state => ([...state, {
    query: 'Find Unused Items',
    sentAt: new Date(),
    returnedAt: new Date(),
    message: character ? getUnusedItemsMessage(character) : `❌ **Inventory unavailable:** ${NO_CHARACTER}`,
    hidden: false
  }]));
}

async function aiShowSources(action: AiAction) {
  const block = postUIAction('openSourceImport');

  replicateStore.update(state => ([...state, {
    query: 'Show Sources',
    sentAt: new Date(),
    returnedAt: new Date(),
    message: block ? `❌ **Sources unavailable:** ${block}` : "📚 Opening character sources dialog! Manage your imported class data and sourcebooks.",
    hidden: false
  }]));
}

export function getStatsMessage(character: Character, resolved: ResolvedCharacter): string {
  const hitPoints = resolved.pools.find(pool => pool.id === 'hitPoints');
  const temporary = character.info.hp?.temporary ? ` (+${character.info.hp.temporary} temporary)` : '';

  const combat = [
    ...resolved.derived.map(one => `• ${one.title}: ${one.value}${one.unit ? ` ${one.unit}` : ''}`),
    hitPoints ? `• Hit Points: ${hitPoints.remaining}/${hitPoints.max}${temporary}` : '',
    `• Proficiency Bonus: ${getSigned(resolved.proficiency)}`
  ].filter(Boolean);

  const saves = resolved.saves.map(one => `• ${one.title} ${getSigned(one.value)}${one.multiplier ? ' (proficient)' : ''}`);
  const attributes = resolved.attributes.map(one => `• ${one.title} ${one.score} (${getSigned(one.value)})`);

  return `📊 **${character.info.name || 'Character'} — level ${resolved.level}${character.info.class?.name ? ` ${character.info.class.name}` : ''}**\n\n`
    + `**Combat Stats:**\n${combat.join('\n')}\n\n`
    + `**Saving Throws:**\n${saves.join('\n')}\n\n`
    + `**Abilities:**\n${attributes.join('\n')}`;
}

async function aiCalculateStats(action: AiAction) {
  const character = getCurrentCharacter();
  let message: string;

  try {
    message = character ? getStatsMessage(character, await getResolvedRules()) : `❌ **Statistics unavailable:** ${NO_CHARACTER}`;
  } catch (error) {
    message = `❌ **Statistics unavailable:** ${error instanceof Error ? error.message : String(error)}`;
  }

  replicateStore.update(state => ([...state, {
    query: 'Calculate Stats',
    sentAt: new Date(),
    returnedAt: new Date(),
    message,
    hidden: false
  }]));
}

export function getSpellsMessage(character: Character): string {
  const spells = character.spells ?? [];
  const casting = character.info.spells;

  if (spells.length === 0) {
    return `✨ **${character.info.name || 'This character'}** has no spells on the sheet.`;
  }

  const slots = Object.entries(casting?.slots ?? {})
    .filter(([, total]) => Number(total) > 0)
    .map(([level, total]) => {
      const left = Number(total) - (casting?.expended?.[Number(level)] ?? 0);
      return `• Level ${level}: ${left}/${total}`;
    });

  const castable = (level: number) => level === 0 || slots.length === 0
    || Number(casting?.slots?.[level] ?? 0) - (casting?.expended?.[level] ?? 0) > 0;

  const levels = [...new Set(spells.map(one => one.level ?? 0))].sort((a, b) => a - b);
  const lists = levels.map(level => {
    const title = level === 0 ? 'Cantrips' : `Level ${level}${castable(level) ? '' : ' (no slots left)'}`;
    const list = spells.filter(one => (one.level ?? 0) === level)
      .map(one => `• **${one.title}**${one.prepared === false && level > 0 ? ' *(not prepared)*' : ''}`);
    return `**${title}**\n${list.join('\n')}`;
  });

  return `✨ **Spells for ${character.info.name || 'this character'}:**\n\n`
    + (casting?.modifier ? `Casting ability: ${casting.modifier}\n\n` : '')
    + (slots.length ? `**Slots left**\n${slots.join('\n')}\n\n` : '')
    + lists.join('\n\n');
}

async function aiSuggestSpells(action: AiAction) {
  const character = getCurrentCharacter();

  replicateStore.update(state => ([...state, {
    query: 'Suggest Spells',
    sentAt: new Date(),
    returnedAt: new Date(),
    message: character ? getSpellsMessage(character) : `❌ **Spells unavailable:** ${NO_CHARACTER}`,
    hidden: false
  }]));
}

export function getBuildMessage(character: Character, resolved: ResolvedCharacter): string {
  const attributes = [...resolved.attributes].sort((a, b) => b.score - a.score);
  const specs = new Map(resolved.system.attributes.map(one => [one.id, one]));

  const close = attributes.filter(one => {
    const spec = specs.get(one.id);
    if (!spec || one.score >= spec.max) return false;
    return getExpressionValue(spec.modifier, { score: one.score + 1 }) > one.value;
  });

  const weakest = [...resolved.saves].sort((a, b) => a.value - b.value)[0];
  const next = resolved.level + 1;
  const nextProficiency = next <= resolved.system.progression.maxLevel
    ? getExpressionValue(resolved.system.progression.proficiency, { ...resolved.scope, level: next })
    : resolved.proficiency;

  const lines = [
    attributes[0] ? `• **Primary:** ${attributes[0].title} ${attributes[0].score} (${getSigned(attributes[0].value)})` : '',
    close.length ? `• **One point from a better modifier:** ${close.map(one => `${one.title} ${one.score}`).join(', ')}` : '• **No score sits one point from a better modifier.**',
    weakest ? `• **Weakest save:** ${weakest.title} ${getSigned(weakest.value)}` : '',
    nextProficiency > resolved.proficiency ? `• **Level ${next}** raises the proficiency bonus to ${getSigned(nextProficiency)}.` : '',
    getUnusedItems(character).length ? `• **${getUnusedItems(character).length} unused items** in the pack; ask to find unused items.` : ''
  ].filter(Boolean);

  return `🎯 **Build notes for ${character.info.name || 'this character'}:**\n\n${lines.join('\n')}`;
}

async function aiOptimizeBuild(action: AiAction) {
  const character = getCurrentCharacter();
  let message: string;

  try {
    message = character ? getBuildMessage(character, await getResolvedRules()) : `❌ **Build notes unavailable:** ${NO_CHARACTER}`;
  } catch (error) {
    message = `❌ **Build notes unavailable:** ${error instanceof Error ? error.message : String(error)}`;
  }

  replicateStore.update(state => ([...state, {
    query: 'Optimize Build',
    sentAt: new Date(),
    returnedAt: new Date(),
    message,
    hidden: false
  }]));
}

async function aiLookupItem(action: AiAction) {
  try {
    const itemName = action.args.itemName?.toLowerCase() || '';
    const item = await findItemInDatabase(itemName);
    
    if (item) {
      const itemCard = await createItemCard(item);
      replicateStore.update(state => ([...state, {
        query: `Lookup Item: ${itemName}`,
        sentAt: new Date(),
        returnedAt: new Date(),
        message: itemCard,
        data: { type: 'item_card', item },
        hidden: false
      }]));
    } else {
      replicateStore.update(state => ([...state, {
        query: `Lookup Item: ${itemName}`,
        sentAt: new Date(),
        returnedAt: new Date(),
        message: `❌ **Item Not Found:** "${itemName}"\n\nTry searching for similar items or check the spelling. I can help you search by type (weapon, armor, tool) or properties.`,
        hidden: false
      }]));
    }
  } catch (error) {
    console.error('Item lookup error:', error);
  }
}

async function aiLookupNPC(action: AiAction) {
  try {
    const npcName = action.args.npcName?.toLowerCase() || '';
    const npc = await findNPCInDatabase(npcName);
    
    if (npc) {
      const npcCard = await createNPCCard(npc);
      replicateStore.update(state => ([...state, {
        query: `Lookup NPC: ${npcName}`,
        sentAt: new Date(),
        returnedAt: new Date(),
        message: npcCard,
        data: { type: 'npc_card', npc },
        hidden: false
      }]));
    } else {
      replicateStore.update(state => ([...state, {
        query: `Lookup NPC: ${npcName}`,
        sentAt: new Date(),
        returnedAt: new Date(),
        message: `❌ **NPC Not Found:** "${npcName}"\n\nTry searching for similar creatures or check the spelling. I can help you search by type (humanoid, monster, beast) or challenge rating.`,
        hidden: false
      }]));
    }
  } catch (error) {
    console.error('NPC lookup error:', error);
  }
}

async function aiSearchItems(action: AiAction) {
  try {
    const query = action.args.query?.toLowerCase() || '';
    const type = action.args.type?.toLowerCase() || '';
    const results = await searchItemsDatabase(query, type);
    
    if (results.length > 0) {
      const itemsList = results.slice(0, 5).map(item => 
        `• **${item.name}** (${item.rarity}) - ${item.description.substring(0, 80)}...`
      ).join('\n');
      
      replicateStore.update(state => ([...state, {
        query: `Search Items: ${query}`,
        sentAt: new Date(),
        returnedAt: new Date(),
        message: `🔍 **Items Found:**\n\n${itemsList}\n\n${results.length > 5 ? `\\n*Showing first 5 of ${results.length} results*` : ''}\n\nAsk me about a specific item for detailed information!`,
        hidden: false
      }]));
    } else {
      replicateStore.update(state => ([...state, {
        query: `Search Items: ${query}`,
        sentAt: new Date(),
        returnedAt: new Date(),
        message: `❌ **No Items Found** matching "${query}"\n\nTry different keywords or item types: weapon, armor, tool, consumable, magic`,
        hidden: false
      }]));
    }
  } catch (error) {
    console.error('Item search error:', error);
  }
}

async function aiSearchNPCs(action: AiAction) {
  try {
    const query = action.args.query?.toLowerCase() || '';
    const type = action.args.type?.toLowerCase() || '';
    const results = await searchNPCsDatabase(query, type);
    
    if (results.length > 0) {
      const npcsList = results.slice(0, 5).map(npc => 
        `• **${npc.name}** (CR ${npc.challengeRating}) - ${npc.description.substring(0, 80)}...`
      ).join('\n');
      
      replicateStore.update(state => ([...state, {
        query: `Search NPCs: ${query}`,
        sentAt: new Date(),
        returnedAt: new Date(),
        message: `🔍 **NPCs Found:**\n\n${npcsList}\n\n${results.length > 5 ? `\\n*Showing first 5 of ${results.length} results*` : ''}\n\nAsk me about a specific NPC for detailed stats!`,
        hidden: false
      }]));
    } else {
      replicateStore.update(state => ([...state, {
        query: `Search NPCs: ${query}`,
        sentAt: new Date(),
        returnedAt: new Date(),
        message: `❌ **No NPCs Found** matching "${query}"\n\nTry different keywords or types: humanoid, monster, beast, undead`,
        hidden: false
      }]));
    }
  } catch (error) {
    console.error('NPC search error:', error);
  }
}

// Database lookup functions
async function findItemInDatabase(itemName: string): Promise<any | null> {
  try {
    const response = await fetch('/sources/items/equipment.json');
    const data = await response.json();
    
    // Find exact match or partial match
    const items = Object.values(data.items) as any[];
    return items.find(item => 
      item.name.toLowerCase().includes(itemName) || 
      item.id.toLowerCase().includes(itemName) ||
      item.tags?.some((tag: string) => tag.toLowerCase().includes(itemName))
    ) || null;
  } catch (error) {
    console.error('Error loading items database:', error);
    return null;
  }
}

async function findNPCInDatabase(npcName: string): Promise<any | null> {
  try {
    const response = await fetch('/sources/npcs/common-npcs.json');
    const data = await response.json();
    
    // Find exact match or partial match
    const npcs = Object.values(data.npcs) as any[];
    return npcs.find(npc => 
      npc.name.toLowerCase().includes(npcName) || 
      npc.id.toLowerCase().includes(npcName) ||
      npc.tags?.some((tag: string) => tag.toLowerCase().includes(npcName))
    ) || null;
  } catch (error) {
    console.error('Error loading NPCs database:', error);
    return null;
  }
}

async function searchItemsDatabase(query: string, type: string): Promise<any[]> {
  try {
    const response = await fetch('/sources/items/equipment.json');
    const data = await response.json();
    
    const items = Object.values(data.items) as any[];
    return items.filter(item => {
      const matchesQuery = !query || 
        item.name.toLowerCase().includes(query) ||
        item.description.toLowerCase().includes(query) ||
        item.tags?.some((tag: string) => tag.toLowerCase().includes(query));
      
      const matchesType = !type || 
        item.type.toLowerCase().includes(type) ||
        item.subtype?.toLowerCase().includes(type);
      
      return matchesQuery && matchesType;
    });
  } catch (error) {
    console.error('Error searching items database:', error);
    return [];
  }
}

async function searchNPCsDatabase(query: string, type: string): Promise<any[]> {
  try {
    const response = await fetch('/sources/npcs/common-npcs.json');
    const data = await response.json();
    
    const npcs = Object.values(data.npcs) as any[];
    return npcs.filter(npc => {
      const matchesQuery = !query || 
        npc.name.toLowerCase().includes(query) ||
        npc.description.toLowerCase().includes(query) ||
        npc.tags?.some((tag: string) => tag.toLowerCase().includes(query));
      
      const matchesType = !type || 
        npc.type.toLowerCase().includes(type) ||
        npc.tags?.some((tag: string) => tag.toLowerCase().includes(type));
      
      return matchesQuery && matchesType;
    });
  } catch (error) {
    console.error('Error searching NPCs database:', error);
    return [];
  }
}

// Image fetching service for D&D content
async function fetchDnDImage(searchTerm: string, type: 'item' | 'creature' = 'item'): Promise<string | null> {
  try {
    // Try Unsplash Source first (most reliable, no CORS issues)
    const unsplashUrl = await fetchUnsplashImage(searchTerm, type);
    if (unsplashUrl) {
      return unsplashUrl;
    }
    
    return null;
  } catch (error) {
    console.warn('Failed to fetch D&D image:', error);
    return null;
  }
}

// Unsplash Source API - no CORS issues, good quality
async function fetchUnsplashImage(searchTerm: string, type: 'item' | 'creature'): Promise<string | null> {
  try {
    // Create themed search terms for better results
    const itemKeywords = ['sword', 'weapon', 'armor', 'shield', 'medieval', 'fantasy'];
    const creatureKeywords = ['dragon', 'fantasy', 'creature', 'monster', 'warrior', 'medieval'];
    
    const keywords = type === 'item' ? itemKeywords : creatureKeywords;
    
    // Find a keyword that matches the search term or use a default
    let searchKeyword = keywords.find(keyword => 
      searchTerm.toLowerCase().includes(keyword) || 
      keyword.includes(searchTerm.toLowerCase())
    );
    
    // Fallback mapping for common D&D items/creatures
    if (!searchKeyword) {
      const mapping: { [key: string]: string } = {
        // Weapons
        'longsword': 'sword',
        'shortsword': 'sword', 
        'dagger': 'knife',
        'bow': 'bow',
        'crossbow': 'crossbow',
        'staff': 'staff',
        'wand': 'magic',
        'mace': 'mace',
        'axe': 'axe',
        'hammer': 'hammer',
        
        // Armor
        'chainmail': 'armor',
        'plate': 'armor',
        'leather': 'leather',
        'shield': 'shield',
        
        // Items
        'potion': 'potion',
        'scroll': 'scroll',
        'rope': 'rope',
        'torch': 'fire',
        
        // Creatures
        'goblin': 'monster',
        'orc': 'warrior',
        'dragon': 'dragon',
        'wolf': 'wolf',
        'guard': 'guard',
        'merchant': 'person',
        'wizard': 'wizard',
        'knight': 'knight'
      };
      
      searchKeyword = mapping[searchTerm.toLowerCase()] || (type === 'item' ? 'medieval' : 'fantasy');
    }
    
    // Use Unsplash Source with the determined keyword
    const imageUrl = `https://source.unsplash.com/featured/400x300/?${searchKeyword}`;
    
    return imageUrl;
  } catch (error) {
    return null;
  }
}

// Enhanced image URL getter with caching
const imageCache = new Map<string, string>();

async function getImageForItem(item: any): Promise<string> {
  const cacheKey = `item_${item.id || item.name}`;
  
  if (imageCache.has(cacheKey)) {
    return imageCache.get(cacheKey)!;
  }
  
  // If item already has an imageUrl that's not a placeholder, use it
  if (item.imageUrl && !item.imageUrl.includes('unsplash.com')) {
    imageCache.set(cacheKey, item.imageUrl);
    return item.imageUrl;
  }
  
  // Try to fetch a real D&D image
  const fetchedImage = await fetchDnDImage(item.name, 'item');
  
  if (fetchedImage) {
    imageCache.set(cacheKey, fetchedImage);
    return fetchedImage;
  }
  
  // Fallback to themed placeholder
  const itemType = item.type?.toLowerCase() || 'item';
  const fallbackKeyword = itemType.includes('weapon') ? 'sword' : 
                         itemType.includes('armor') ? 'armor' : 
                         itemType.includes('tool') ? 'tools' : 'medieval';
  const fallbackUrl = `https://source.unsplash.com/featured/400x300/?${fallbackKeyword}`;
  imageCache.set(cacheKey, fallbackUrl);
  return fallbackUrl;
}

async function getImageForNPC(npc: any): Promise<string> {
  const cacheKey = `npc_${npc.id || npc.name}`;
  
  if (imageCache.has(cacheKey)) {
    return imageCache.get(cacheKey)!;
  }
  
  // If NPC already has an imageUrl that's not a placeholder, use it
  if (npc.imageUrl && !npc.imageUrl.includes('unsplash.com')) {
    imageCache.set(cacheKey, npc.imageUrl);
    return npc.imageUrl;
  }
  
  // Try to fetch a real D&D image
  const fetchedImage = await fetchDnDImage(npc.name, 'creature');
  
  if (fetchedImage) {
    imageCache.set(cacheKey, fetchedImage);
    return fetchedImage;
  }
  
  // Fallback to themed placeholder
  const npcType = npc.type?.toLowerCase() || 'creature';
  const fallbackKeyword = npcType.includes('humanoid') ? 'warrior' : 
                         npcType.includes('beast') ? 'animal' : 
                         npcType.includes('dragon') ? 'dragon' : 'fantasy';
  const fallbackUrl = `https://source.unsplash.com/featured/400x300/?${fallbackKeyword}`;
  imageCache.set(cacheKey, fallbackUrl);
  return fallbackUrl;
}

// Card creation functions
async function createItemCard(item: any): Promise<string> {
  const cost = item.cost ? `${item.cost.amount} ${item.cost.currency}` : 'N/A';
  const weight = item.weight ? `${item.weight} lbs` : 'N/A';
  const imageUrl = await getImageForItem(item);
  
  return `<div class="card">

🗡️ **${item.name}**
*${item.type} (${item.rarity})*

**Description:** ${item.description}

**Properties:**
• **Cost:** ${cost}
• **Weight:** ${weight}
${item.damage ? `• **Damage:** ${item.damage}` : ''}
${item.armorClass ? `• **AC:** ${item.armorClass}` : ''}
${item.effect ? `• **Effect:** ${item.effect}` : ''}
${item.properties?.length ? `• **Properties:** ${item.properties.join(', ')}` : ''}

![${item.name}](${imageUrl})

</div>`;
}

async function createNPCCard(npc: any): Promise<string> {
  const abilities = npc.abilities;
  const abilityMods = abilities ? Object.entries(abilities).map(([key, val]: [string, any]) => 
    `${key.slice(0,3).toUpperCase()}: ${val} (${Math.floor((val - 10) / 2) >= 0 ? '+' : ''}${Math.floor((val - 10) / 2)})`
  ).join(' | ') : '';
  
  const imageUrl = await getImageForNPC(npc);

  return `<div class="card">

👤 **${npc.name}**
*${npc.size} ${npc.type}, ${npc.alignment}*

**Description:** ${npc.description}

**Combat Stats:**
• **AC:** ${npc.armorClass} | **HP:** ${npc.hitPoints} | **Speed:** ${npc.speed}
• **CR:** ${npc.challengeRating}

**Abilities:**
${abilityMods}

${npc.skills?.length ? `**Skills:** ${npc.skills.join(', ')}\n` : ''}
${npc.senses?.length ? `**Senses:** ${npc.senses.join(', ')}\n` : ''}
${npc.languages?.length ? `**Languages:** ${npc.languages.join(', ')}\n` : ''}

${npc.actions?.length ? `**Actions:**\n${npc.actions.map((action: any) => `• **${action.name}:** ${action.description}`).join('\n')}\n` : ''}

![${npc.name}](${imageUrl})

</div>`;
}

// Character resource refill functions
async function aiRefillHealth(action: AiAction) {
  try {
    const characterStore = getCharacterStore();
    const amount = action.args.amount ? parseInt(action.args.amount, 10) : null;
    const before = get(characterStore.info).hp.current;

    putHealing(amount && amount > 0 ? amount : undefined);

    const hp = get(characterStore.info).hp;
    const healed = hp.current - before;
    const healingReport = amount && amount > 0
      ? `💖 **Healed ${healed} HP**\n\nCurrent HP: ${hp.current}/${hp.max}\n\n${healed > 0 ? 'Feeling better already!' : 'Already at full health!'}`
      : `💖 **Health Fully Restored!**\n\n${healed > 0 ? `Healed ${healed} HP` : 'Already at full health'}\n\nCurrent HP: ${hp.current}/${hp.max}\n\nYou feel completely rejuvenated!`;

    replicateStore.update(state => ([...state, {
      query: 'Refill Health',
      sentAt: new Date(),
      returnedAt: new Date(),
      message: healingReport,
      hidden: false
    }]));
  } catch (error) {
    console.error('Health refill error:', error);
    replicateStore.update(state => ([...state, {
      query: 'Refill Health',
      sentAt: new Date(),
      returnedAt: new Date(),
      message: `❌ **Error:** Unable to refill health. Please try again.`,
      hidden: false
    }]));
  }
}

async function aiRefillSpecial(action: AiAction) {
  try {
    const characterStore = getCharacterStore();
    const resourceName = action.args.resourceName?.toLowerCase() || '';
    
    let specialReport = '';
    let hasSpecialResource = false;
    
    // Check if special resource exists first
    let currentSpecial: any;
    const unsubscribe = characterStore.special.subscribe(special => {
      currentSpecial = special;
    });
    unsubscribe();
    
    if (!currentSpecial || !currentSpecial.name) {
      specialReport = `❌ **No Special Resources Found**\n\nYour character doesn't have any special resources like grit points, chi, or sorcery points to refill.`;
      hasSpecialResource = false;
    } else {
      hasSpecialResource = true;
      
      updateCharacterWithChangeLog(
        'special',
        special => {
          const resourcesRestored = special.max - special.current;
          
          specialReport = `✨ **${special.name} Restored!**\n\n${resourcesRestored > 0 ? `Restored ${resourcesRestored} ${special.name.toLowerCase()}` : 'Already at maximum'}\n\nCurrent: ${special.max}/${special.max}\n\nRegains on: ${special.regain}\n\nYour special abilities are ready!`;
          
          return {
            ...special,
            current: special.max
          };
        },
        ChangeActions.SPECIAL_RESOURCE_CHANGE,
        `Restored ${currentSpecial.name}`,
        { resourceName: currentSpecial.name, type: 'restore' }
      );
    }
    
    if (!hasSpecialResource) {
      replicateStore.update(state => ([...state, {
        query: 'Refill Special',
        sentAt: new Date(),
        returnedAt: new Date(),
        message: specialReport,
        hidden: false
      }]));
      return;
    }
    
    replicateStore.update(state => ([...state, {
      query: 'Refill Special',
      sentAt: new Date(),
      returnedAt: new Date(),
      message: specialReport,
      hidden: false
    }]));
  } catch (error) {
    console.error('Special resource refill error:', error);
    replicateStore.update(state => ([...state, {
      query: 'Refill Special',
      sentAt: new Date(),
      returnedAt: new Date(),
      message: `❌ **Error:** Unable to refill special resources. Please try again.`,
      hidden: false
    }]));
  }
}

async function aiRefillSpellSlots(action: AiAction) {
  try {
    const characterStore = getCharacterStore();
    const level = action.args.level ? parseInt(action.args.level, 10) : null;
    const info = get(characterStore.info);

    let spellSlotReport = `❌ **No Spell Slots Found**\n\nYour character doesn't have spell slots to refill.`;

    if (info.slots) {
      const slotsRestored = info.slots.expended;
      putSlots(0);
      spellSlotReport = `🔮 **${info.slots.title} Restored!**\n\n${slotsRestored > 0 ? `Restored ${slotsRestored} slots` : 'Already at maximum'}\n\nAvailable: ${info.slots.amount}/${info.slots.amount}\n\n${info.slots.description}\n\nYour magical energy is restored!`;
    }

    if (info.spells?.slots) {
      const levels = Object.keys(info.spells.slots).map(Number).filter(entry => level === null || entry === level);
      levels.forEach(entry => putSlots(0, entry));
      const slotsInfo = levels.map(entry => `Level ${entry}: ${info.spells?.slots[entry]} slots`).join('\n');
      spellSlotReport = `🔮 **Spell Slots Restored!**\n\n**Available Spell Slots:**\n${slotsInfo}\n\nSpellcasting ability: ${info.spells.modifier}\n\nYour magical energy is restored!`;
    }

    replicateStore.update(state => ([...state, {
      query: 'Refill Spell Slots',
      sentAt: new Date(),
      returnedAt: new Date(),
      message: spellSlotReport,
      hidden: false
    }]));
  } catch (error) {
    console.error('Spell slots refill error:', error);
    replicateStore.update(state => ([...state, {
      query: 'Refill Spell Slots',
      sentAt: new Date(),
      returnedAt: new Date(),
      message: `❌ **Error:** Unable to refill spell slots. Please try again.`,
      hidden: false
    }]));
  }
}

async function aiShortRest(action: AiAction) {
  try {
    const characterStore = getCharacterStore();
    const before = get(characterStore.info).hp;
    const dice = action.args.dice !== undefined ? parseInt(action.args.dice, 10) : before.current < before.max ? 1 : 0;
    const { spend, healing } = await postShortRest(dice || 0, await getResolvedRules());
    const info = get(characterStore.info);
    const special = get(characterStore.special);

    const restorations = [
      spend > 0 ? `• Spent ${spend} hit dice and healed ${healing} HP` : '',
      special?.name && special.current === special.max ? `• ${special.name}: ${special.current}/${special.max}` : ''
    ].filter(Boolean);

    replicateStore.update(state => ([...state, {
      query: 'Short Rest',
      sentAt: new Date(),
      returnedAt: new Date(),
      message: `😴 **Short Rest Complete!**\n\nYou take an hour to rest and recover:\n\n${restorations.length > 0 ? restorations.join('\n') : '• No resources to restore'}\n\n**Current Status:**\n• HP: ${info.hp.current}/${info.hp.max}\n\nYou feel refreshed and ready to continue!`,
      hidden: false
    }]));
  } catch (error) {
    console.error('Short rest error:', error);
    replicateStore.update(state => ([...state, {
      query: 'Short Rest',
      sentAt: new Date(),
      returnedAt: new Date(),
      message: `❌ **Error:** Unable to complete short rest. Please try again.`,
      hidden: false
    }]));
  }
}

async function aiLongRest(action: AiAction) {
  try {
    const characterStore = getCharacterStore();
    postLongRest(await getResolvedRules());
    const info = get(characterStore.info);
    const special = get(characterStore.special);

    replicateStore.update(state => ([...state, {
      query: 'Long Rest',
      sentAt: new Date(),
      returnedAt: new Date(),
      message: `🌙 **Long Rest Complete!**\n\nYou sleep for 8 hours and fully recover.\n\n**Current Status:**\n• HP: ${info.hp.current}/${info.hp.max}\n${special?.name ? `• ${special.name}: ${special.current}/${special.max}` : ''}\n${info.slots ? `• ${info.slots.title}: ${info.slots.amount}/${info.slots.amount}` : ''}\n\nYou wake up completely refreshed and ready for adventure!`,
      hidden: false
    }]));
  } catch (error) {
    console.error('Long rest error:', error);
    replicateStore.update(state => ([...state, {
      query: 'Long Rest',
      sentAt: new Date(),
      returnedAt: new Date(),
      message: `❌ **Error:** Unable to complete long rest. Please try again.`,
      hidden: false
    }]));
  }
}

async function aiLevelProgression(action: AiAction) {
  try {
    const level = action.args.level ? parseInt(action.args.level, 10) : null;
    
    if (!level || level < 1 || level > 20) {
      replicateStore.update(state => ([...state, {
        query: 'Level Progression',
        sentAt: new Date(),
        returnedAt: new Date(),
        message: `❌ **Invalid Level**\n\nPlease specify a valid level between 1 and 20.`,
        hidden: false
      }]));
      return;
    }
    
    // Get character sources from localStorage
    const sources = localStorage.getItem('character_sources');
    let structuredSources: any[] = [];
    
    if (sources) {
      try {
        const parsedSources = JSON.parse(sources);
        const enabledSources = parsedSources.filter((s: any) => s.enabled !== false);
        structuredSources = enabledSources.map((s: any) => s.extractedData).filter(Boolean);
      } catch (error) {
        console.error('Error parsing character sources:', error);
      }
    }
    
    if (structuredSources.length === 0) {
      replicateStore.update(state => ([...state, {
        query: `Level ${level} Progression`,
        sentAt: new Date(),
        returnedAt: new Date(),
        message: `📚 **No Character Sources Found**\n\nTo see what you gain at level ${level}, please import character class data using the "Sources" button.\n\nSupported formats:\n• Official D&D sourcebooks (PDF)\n• Character class descriptions (text/JSON)\n• Character sheet images`,
        hidden: false
      }]));
      return;
    }
    
    // Search through sources for level-specific features
    const levelFeatures = await searchLevelFeatures(level, structuredSources);
    
    if (levelFeatures.length === 0) {
      replicateStore.update(state => ([...state, {
        query: `Level ${level} Progression`,
        sentAt: new Date(),
        returnedAt: new Date(),
        message: `📊 **Level ${level} Progression**\n\nNo specific features found for level ${level} in your character sources.\n\nThis could mean:\n• You don't gain new features at this level\n• The level data isn't detailed in your sources\n• Try importing more comprehensive class data`,
        hidden: false
      }]));
      return;
    }
    
    // Create cards for each feature
    const featureCards = await Promise.all(
      levelFeatures.map(feature => createFeatureCard(feature))
    );
    
    const progressionMessage = `📊 **Level ${level} Progression**\n\nHere's what you gain at level ${level}:\n\n${featureCards.join('\n\n')}`;
    
    replicateStore.update(state => ([...state, {
      query: `Level ${level} Progression`,
      sentAt: new Date(),
      returnedAt: new Date(),
      message: progressionMessage,
      data: { type: 'level_progression', level, features: levelFeatures },
      hidden: false
    }]));
    
  } catch (error) {
    console.error('Level progression error:', error);
    replicateStore.update(state => ([...state, {
      query: 'Level Progression',
      sentAt: new Date(),
      returnedAt: new Date(),
      message: `❌ **Error:** Unable to retrieve level progression data. Please try again.`,
      hidden: false
    }]));
  }
}

async function searchLevelFeatures(targetLevel: number, sources: any[]): Promise<any[]> {
  const features: any[] = [];
  
  for (const source of sources) {
    if (source.levels && Array.isArray(source.levels)) {
      // Find the specific level data
      const levelData = source.levels.find((l: any) => l.level === targetLevel);
      
      if (levelData) {
        // Add features from this level
        if (levelData.features && Array.isArray(levelData.features)) {
          features.push(...levelData.features.map((f: any) => ({
            ...f,
            level: targetLevel,
            source: source.className || source.name || 'Character Source',
            type: 'feature'
          })));
        }
        
        // Add additional choices as selectable features
        if (levelData.additionalChoices && Array.isArray(levelData.additionalChoices)) {
          features.push(...levelData.additionalChoices.map((choice: any) => ({
            id: `choice_${choice.type}_${targetLevel}`,
            title: choice.description || choice.title || `${choice.type} Choice`,
            description: `Choose ${choice.count || 1} from: ${(choice.from || choice.options || []).join(', ')}`,
            level: targetLevel,
            source: source.className || source.name || 'Character Source',
            type: 'choice',
            choiceType: choice.type,
            options: choice.from || choice.options || [],
            count: choice.count || 1
          })));
        }
        
        // Add spell slot progression if available
        if (levelData.spellSlots && Object.keys(levelData.spellSlots).length > 0) {
          const slotsInfo = Object.entries(levelData.spellSlots)
            .map(([level, slots]) => `Level ${level}: ${slots} slots`)
            .join(', ');
          
          features.push({
            id: `spell_slots_${targetLevel}`,
            title: 'Spell Slot Progression',
            description: `You gain spell slots: ${slotsInfo}`,
            level: targetLevel,
            source: source.className || source.name || 'Character Source',
            type: 'spell_slots',
            spellSlots: levelData.spellSlots
          });
        }
        
        // Add hit dice progression
        if (levelData.hitDie) {
          features.push({
            id: `hit_die_${targetLevel}`,
            title: 'Hit Die Progression',
            description: `You gain ${levelData.hitDie.amount} d${levelData.hitDie.die} hit ${levelData.hitDie.amount === 1 ? 'die' : 'dice'}`,
            level: targetLevel,
            source: source.className || source.name || 'Character Source',
            type: 'hit_die',
            hitDie: levelData.hitDie
          });
        }
        
        // Add proficiency bonus if it increases
        if (levelData.proficiencyBonus) {
          features.push({
            id: `proficiency_${targetLevel}`,
            title: 'Proficiency Bonus',
            description: `Your proficiency bonus increases to +${levelData.proficiencyBonus}`,
            level: targetLevel,
            source: source.className || source.name || 'Character Source',
            type: 'proficiency_bonus',
            bonus: levelData.proficiencyBonus
          });
        }
      }
    }
    
    // Look for general progression data
    if (source.progression && Array.isArray(source.progression)) {
      const levelProgression = source.progression.find((p: any) => p.level === targetLevel);
      if (levelProgression && levelProgression.features) {
        features.push(...levelProgression.features.map((f: any) => ({
          ...f,
          level: targetLevel,
          source: source.className || source.name || 'Character Source',
          type: 'feature'
        })));
      }
    }
  }
  
  // Add default ASI feature for levels 4, 8, 12, 16, 19
  if ([4, 8, 12, 16, 19].includes(targetLevel)) {
    const hasASI = features.some(f => 
      f.title?.toLowerCase().includes('ability score') || 
      f.title?.toLowerCase().includes('asi') ||
      f.choiceType === 'abilityScore'
    );
    
    if (!hasASI) {
      features.push({
        id: `asi_${targetLevel}`,
        title: 'Ability Score Improvement',
        description: 'You can increase one ability score by 2, or increase two ability scores by 1 each. Alternatively, you can choose a feat instead.',
        level: targetLevel,
        source: 'D&D 5e Core Rules',
        type: 'asi',
        options: ['Ability Score Improvement', 'Feat Selection']
      });
    }
  }
  
  return features;
}

async function createFeatureCard(feature: any): Promise<string> {
  // Get an appropriate image for the feature
  const imageUrl = await getImageForFeature(feature);
  
  const typeIcon = getFeatureTypeIcon(feature.type);
  const sourceInfo = feature.source ? `*Source: ${feature.source}*` : '';
  
  let propertiesSection = '';
  
  // Add type-specific properties
  if (feature.type === 'spell_slots' && feature.spellSlots) {
    const slotsText = Object.entries(feature.spellSlots)
      .map(([level, slots]) => `• Level ${level}: ${slots} slots`)
      .join('\n');
    propertiesSection = `**Spell Slots:**\n${slotsText}`;
  } else if (feature.type === 'choice' && feature.options) {
    const optionsText = feature.options.slice(0, 5).join(', ');
    const remainingCount = feature.options.length - 5;
    propertiesSection = `**Options:** ${optionsText}${remainingCount > 0 ? ` (+${remainingCount} more)` : ''}\n**Choose:** ${feature.count || 1}`;
  } else if (feature.type === 'asi' && feature.options) {
    propertiesSection = `**Options:** ${feature.options.join(' or ')}`;
  } else if (feature.type === 'hit_die' && feature.hitDie) {
    propertiesSection = `**Hit Die:** ${feature.hitDie.amount}d${feature.hitDie.die}`;
  } else if (feature.type === 'proficiency_bonus' && feature.bonus) {
    propertiesSection = `**New Bonus:** +${feature.bonus}`;
  }
  
  return `<div class="card">

${typeIcon} **${feature.title}**
${sourceInfo}

**Description:** ${feature.description || 'No description available.'}

${propertiesSection ? `${propertiesSection}\n` : ''}
![${feature.title}](${imageUrl})

</div>`;
}

function getFeatureTypeIcon(type: string): string {
  const icons: { [key: string]: string } = {
    feature: '⭐',
    choice: '🎯',
    spell_slots: '🔮',
    hit_die: '🎲',
    proficiency_bonus: '📈',
    asi: '💪',
    feat: '🏆'
  };
  
  return icons[type] || '📜';
}

async function getImageForFeature(feature: any): Promise<string> {
  const cacheKey = `feature_${feature.id || feature.title}`;
  
  if (imageCache.has(cacheKey)) {
    return imageCache.get(cacheKey)!;
  }
  
  // Try to fetch a thematic image based on feature type and title
  let searchTerm = 'dnd fantasy';
  
  if (feature.type === 'spell_slots') {
    searchTerm = 'magic spells fantasy';
  } else if (feature.type === 'choice') {
    searchTerm = 'dnd choices abilities';
  } else if (feature.type === 'asi') {
    searchTerm = 'strength improvement fantasy';
  } else if (feature.type === 'hit_die') {
    searchTerm = 'dice gaming fantasy';
  } else if (feature.title?.toLowerCase().includes('attack')) {
    searchTerm = 'sword combat fantasy';
  } else if (feature.title?.toLowerCase().includes('spell')) {
    searchTerm = 'magic wizard fantasy';
  } else if (feature.title?.toLowerCase().includes('sneak')) {
    searchTerm = 'rogue stealth fantasy';
  } else if (feature.title?.toLowerCase().includes('rage')) {
    searchTerm = 'barbarian warrior fantasy';
  } else {
    searchTerm = 'dnd character abilities';
  }
  
  const fetchedImage = await fetchDnDImage(searchTerm, 'item');
  
  if (fetchedImage) {
    imageCache.set(cacheKey, fetchedImage);
    return fetchedImage;
  }
  
  // Fallback to themed placeholder
  const fallbackUrl = `https://source.unsplash.com/featured/400x300/?${searchTerm}`;
  imageCache.set(cacheKey, fallbackUrl);
  return fallbackUrl;
}

// Undo/Redo and Level Management Functions
async function aiLevelDown(action: AiAction) {
  try {
    const targetLevel = action.args.level ? parseInt(action.args.level, 10) : null;
    
    if (!targetLevel || targetLevel < 1 || targetLevel > 19) {
      replicateStore.update(state => ([...state, {
        query: 'Level Down',
        sentAt: new Date(),
        returnedAt: new Date(),
        message: `❌ **Invalid Level**\n\nPlease specify a valid target level between 1 and 19.`,
        hidden: false
      }]));
      return;
    }
    
    const characterStore = getCharacterStore();
    let currentLevel: number = 1;
    
    const unsubscribe = characterStore.info.subscribe(info => {
      currentLevel = info.level || 1;
    });
    unsubscribe();
    
    if (targetLevel >= currentLevel) {
      replicateStore.update(state => ([...state, {
        query: 'Level Down',
        sentAt: new Date(),
        returnedAt: new Date(),
        message: `❌ **Cannot Level Down**\n\nTarget level ${targetLevel} is not lower than current level ${currentLevel}.`,
        hidden: false
      }]));
      return;
    }
    
    // Perform level reduction with change tracking
    updateCharacterWithChangeLog(
      'info',
      info => ({
        ...info,
        level: targetLevel
      }),
      ChangeActions.LEVEL_CHANGE,
      `Reduced level from ${currentLevel} to ${targetLevel}`,
      { fromLevel: currentLevel, toLevel: targetLevel, type: 'level_down' }
    );
    
    replicateStore.update(state => ([...state, {
      query: 'Level Down',
      sentAt: new Date(),
      returnedAt: new Date(),
      message: `📉 **Level Reduced**\n\nCharacter level reduced from ${currentLevel} to ${targetLevel}.\n\nThis change has been logged and can be undone with "undo last change".`,
      hidden: false
    }]));
    
  } catch (error) {
    console.error('Level down error:', error);
    replicateStore.update(state => ([...state, {
      query: 'Level Down',
      sentAt: new Date(),
      returnedAt: new Date(),
      message: `❌ **Error:** Unable to reduce character level. Please try again.`,
      hidden: false
    }]));
  }
}

async function aiUndoLastChange(action: AiAction) {
  try {
    const result = undoLastChange();
    
    if (result.success) {
      replicateStore.update(state => ([...state, {
        query: 'Undo Last Change',
        sentAt: new Date(),
        returnedAt: new Date(),
        message: `↶ **Change Undone**\n\nReverted: ${result.description}\n\nPerformed at: ${result.timestamp?.toLocaleString()}\n\nUse "redo last change" to restore this change.`,
        hidden: false
      }]));
    } else {
      replicateStore.update(state => ([...state, {
        query: 'Undo Last Change',
        sentAt: new Date(),
        returnedAt: new Date(),
        message: `❌ **Nothing to Undo**\n\n${result.error || 'No revertible changes found in the change log.'}`,
        hidden: false
      }]));
    }
  } catch (error) {
    console.error('Undo error:', error);
    replicateStore.update(state => ([...state, {
      query: 'Undo Last Change',
      sentAt: new Date(),
      returnedAt: new Date(),
      message: `❌ **Error:** Unable to undo last change. Please try again.`,
      hidden: false
    }]));
  }
}

async function aiRedoLastChange(action: AiAction) {
  try {
    const result = redoLastChange();
    
    if (result.success) {
      replicateStore.update(state => ([...state, {
        query: 'Redo Last Change',
        sentAt: new Date(),
        returnedAt: new Date(),
        message: `↷ **Change Redone**\n\nRestored: ${result.description}\n\nOriginally performed: ${result.timestamp?.toLocaleString()}\n\nUse "undo last change" to revert this again.`,
        hidden: false
      }]));
    } else {
      replicateStore.update(state => ([...state, {
        query: 'Redo Last Change',
        sentAt: new Date(),
        returnedAt: new Date(),
        message: `❌ **Nothing to Redo**\n\n${result.error || 'No undone changes found to restore.'}`,
        hidden: false
      }]));
    }
  } catch (error) {
    console.error('Redo error:', error);
    replicateStore.update(state => ([...state, {
      query: 'Redo Last Change',
      sentAt: new Date(),
      returnedAt: new Date(),
      message: `❌ **Error:** Unable to redo last change. Please try again.`,
      hidden: false
    }]));
  }
}

// Condition Management Functions
async function aiAddCondition(action: AiAction) {
  try {
    const conditionName = action.args.condition || '';
    
    if (!conditionName) {
      replicateStore.update(state => ([...state, {
        query: `Add Condition`,
        sentAt: new Date(),
        returnedAt: new Date(),
        message: `❌ **Error:** Please specify a condition to add.\n\nExample: "add poisoned condition"`,
        hidden: false
      }]));
      return;
    }

    const store = getCharacterStore();
    
    // Check if condition already exists
    let conditionExists = false;
    const unsubscribe = store.info.subscribe((info) => {
      conditionExists = info.conditions.some(c => c.title.toLowerCase() === conditionName.toLowerCase());
    });
    unsubscribe();
    
    if (conditionExists) {
      replicateStore.update(state => ([...state, {
        query: `Add Condition: ${conditionName}`,
        sentAt: new Date(),
        returnedAt: new Date(),
        message: `⚠️ **Condition Already Present**\n\nYou already have the **${conditionName}** condition.\n\nUse "remove ${conditionName}" to remove it.`,
        hidden: false
      }]));
      return;
    }

    // Add condition with change tracking
    putCondition({ title: conditionName, effects: [`Affected by ${conditionName} condition`] });

    // Play sound effect
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('playSpellCast'));
    }

    replicateStore.update(state => ([...state, {
      query: `Add Condition: ${conditionName}`,
      sentAt: new Date(),
      returnedAt: new Date(),
      message: `✨ **Condition Applied**\n\nYou are now affected by **${conditionName}**.\n\nThis condition will remain until removed. Use "remove ${conditionName}" when the effect ends.`,
      hidden: false
    }]));

  } catch (error) {
    console.error('Add condition error:', error);
    replicateStore.update(state => ([...state, {
      query: `Add Condition`,
      sentAt: new Date(),
      returnedAt: new Date(),
      message: `❌ **Error:** Unable to add condition. Please try again.`,
      hidden: false
    }]));
  }
}

async function aiRemoveCondition(action: AiAction) {
  try {
    const conditionName = action.args.condition || '';
    
    if (!conditionName) {
      replicateStore.update(state => ([...state, {
        query: `Remove Condition`,
        sentAt: new Date(),
        returnedAt: new Date(),
        message: `❌ **Error:** Please specify a condition to remove.\n\nExample: "remove poisoned condition"`,
        hidden: false
      }]));
      return;
    }

    const store = getCharacterStore();
    
    // Check if condition exists and find it
    let conditionExists = false;
    let conditionIndex = -1;
    const unsubscribe = store.info.subscribe((info) => {
      conditionIndex = info.conditions.findIndex(c => c.title.toLowerCase() === conditionName.toLowerCase());
      conditionExists = conditionIndex !== -1;
    });
    unsubscribe();
    
    if (!conditionExists) {
      replicateStore.update(state => ([...state, {
        query: `Remove Condition: ${conditionName}`,
        sentAt: new Date(),
        returnedAt: new Date(),
        message: `⚠️ **Condition Not Found**\n\nYou don't have the **${conditionName}** condition.\n\nUse "list conditions" to see all active conditions.`,
        hidden: false
      }]));
      return;
    }

    // Remove condition with change tracking
    deleteCondition(conditionName);

    // Play sound effect
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('playHealSpell'));
    }

    replicateStore.update(state => ([...state, {
      query: `Remove Condition: ${conditionName}`,
      sentAt: new Date(),
      returnedAt: new Date(),
      message: `✅ **Condition Removed**\n\nYou are no longer affected by **${conditionName}**.\n\nThe condition has been cleared from your character sheet.`,
      hidden: false
    }]));

  } catch (error) {
    console.error('Remove condition error:', error);
    replicateStore.update(state => ([...state, {
      query: `Remove Condition`,
      sentAt: new Date(),
      returnedAt: new Date(),
      message: `❌ **Error:** Unable to remove condition. Please try again.`,
      hidden: false
    }]));
  }
}

async function aiRemoveAllConditions(action: AiAction) {
  try {
    const store = getCharacterStore();
    
    let conditions: any[] = [];
    const unsubscribe = store.info.subscribe((info) => {
      conditions = info.conditions;
    });
    unsubscribe();

    if (conditions.length === 0) {
      replicateStore.update(state => ([...state, {
        query: `Remove All Conditions`,
        sentAt: new Date(),
        returnedAt: new Date(),
        message: `🟢 **No Conditions to Remove**\n\nYou currently have no active conditions.\n\nYour character sheet is already clear of all effects.`,
        hidden: false
      }]));
      return;
    }

    const removedConditions = conditions.map(c => c.title);
    const conditionCount = conditions.length;

    // Remove all conditions with change tracking
    updateCharacterWithChangeLog(
      'info',
      (currentInfo) => ({
        ...currentInfo,
        conditions: []
      }),
      ChangeActions.CONDITION_REMOVE_ALL,
      `Removed all ${conditionCount} conditions: ${removedConditions.join(', ')}`
    );

    replicateStore.update(state => ([...state, {
      query: `Remove All Conditions`,
      sentAt: new Date(),
      returnedAt: new Date(),
      message: `✅ **All Conditions Cleared**\n\nRemoved **${conditionCount}** conditions:\n${removedConditions.map(name => `• ${name}`).join('\n')}\n\nYour character sheet is now clear of all effects.`,
      hidden: false
    }]));

  } catch (error) {
    console.error('Remove all conditions error:', error);
    replicateStore.update(state => ([...state, {
      query: `Remove All Conditions`,
      sentAt: new Date(),
      returnedAt: new Date(),
      message: `❌ **Error:** Unable to remove all conditions. Please try again.`,
      hidden: false
    }]));
  }
}

async function aiRemoveAllDefenses(action: AiAction) {
  try {
    const store = getCharacterStore();
    
    let defenses: any[] = [];
    const unsubscribe = store.info.subscribe((info) => {
      defenses = info.defences;
    });
    unsubscribe();

    if (defenses.length === 0) {
      replicateStore.update(state => ([...state, {
        query: `Remove All Defenses`,
        sentAt: new Date(),
        returnedAt: new Date(),
        message: `🟢 **No Defenses to Remove**\n\nYou currently have no damage resistances or immunities.\n\nYour character has no defensive bonuses to clear.`,
        hidden: false
      }]));
      return;
    }

    const removedDefenses = defenses.map(d => d.title);
    const defenseCount = defenses.length;

    // Remove all defenses with change tracking
    updateCharacterWithChangeLog(
      'info',
      (currentInfo) => ({
        ...currentInfo,
        defences: []
      }),
      ChangeActions.DEFENSE_REMOVE,
      `Removed all ${defenseCount} defenses: ${removedDefenses.join(', ')}`
    );

    replicateStore.update(state => ([...state, {
      query: `Remove All Defenses`,
      sentAt: new Date(),
      returnedAt: new Date(),
      message: `✅ **All Defenses Cleared**\n\nRemoved **${defenseCount}** damage resistances/immunities:\n${removedDefenses.map(name => `• ${name}`).join('\n')}\n\nYour character no longer has any damage resistances or immunities.`,
      hidden: false
    }]));

  } catch (error) {
    console.error('Remove all defenses error:', error);
    replicateStore.update(state => ([...state, {
      query: `Remove All Defenses`,
      sentAt: new Date(),
      returnedAt: new Date(),
      message: `❌ **Error:** Unable to remove all defenses. Please try again.`,
      hidden: false
    }]));
  }
}

async function aiListConditions(action: AiAction) {
  try {
    const store = getCharacterStore();
    
    let conditions: any[] = [];
    const unsubscribe = store.info.subscribe((info) => {
      conditions = info.conditions;
    });
    unsubscribe();

    if (conditions.length === 0) {
      replicateStore.update(state => ([...state, {
        query: `List Conditions`,
        sentAt: new Date(),
        returnedAt: new Date(),
        message: `🟢 **No Active Conditions**\n\nYou currently have no conditions affecting your character.\n\nConditions can be added with "add [condition name]" command.`,
        hidden: false
      }]));
      return;
    }

    const conditionList = conditions.map((condition, index) => 
      `${index + 1}. **${condition.title}**${condition.effects?.length ? `\n   - ${condition.effects.join('\n   - ')}` : ''}`
    ).join('\n\n');

    replicateStore.update(state => ([...state, {
      query: `List Conditions`,
      sentAt: new Date(),
      returnedAt: new Date(),
      message: `🔮 **Active Conditions**\n\n${conditionList}\n\nUse "remove [condition name]" to remove any condition.`,
      hidden: false
    }]));

  } catch (error) {
    console.error('List conditions error:', error);
    replicateStore.update(state => ([...state, {
      query: `List Conditions`,
      sentAt: new Date(),
      returnedAt: new Date(),
      message: `❌ **Error:** Unable to list conditions. Please try again.`,
      hidden: false
    }]));
  }
}

// Defense Management Functions
async function aiAddDefense(action: AiAction) {
  try {
    const defenseName = action.args.defense || '';
    
    if (!defenseName) {
      replicateStore.update(state => ([...state, {
        query: `Add Defense`,
        sentAt: new Date(),
        returnedAt: new Date(),
        message: `❌ **Error:** Please specify a defense to add.\n\nExample: "add fire resistance"`,
        hidden: false
      }]));
      return;
    }

    const store = getCharacterStore();
    
    // Check if defense already exists
    let defenseExists = false;
    const unsubscribe = store.info.subscribe((info) => {
      defenseExists = info.defences.some(d => d.title.toLowerCase() === defenseName.toLowerCase());
    });
    unsubscribe();
    
    if (defenseExists) {
      replicateStore.update(state => ([...state, {
        query: `Add Defense: ${defenseName}`,
        sentAt: new Date(),
        returnedAt: new Date(),
        message: `⚠️ **Defense Already Present**\n\nYou already have **${defenseName}** defense.\n\nUse "remove ${defenseName}" to remove it.`,
        hidden: false
      }]));
      return;
    }

    // Add defense with change tracking
    putDefence({ title: defenseName, effects: [`Protected against ${defenseName}`] });

    // Play sound effect
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('playSpellCast'));
    }

    replicateStore.update(state => ([...state, {
      query: `Add Defense: ${defenseName}`,
      sentAt: new Date(),
      returnedAt: new Date(),
      message: `🛡️ **Defense Granted**\n\nYou now have **${defenseName}** defense.\n\nThis defense will remain until removed. Use "remove ${defenseName}" when the effect ends.`,
      hidden: false
    }]));

  } catch (error) {
    console.error('Add defense error:', error);
    replicateStore.update(state => ([...state, {
      query: `Add Defense`,
      sentAt: new Date(),
      returnedAt: new Date(),
      message: `❌ **Error:** Unable to add defense. Please try again.`,
      hidden: false
    }]));
  }
}

async function aiRemoveDefense(action: AiAction) {
  try {
    const defenseName = action.args.defense || '';
    
    if (!defenseName) {
      replicateStore.update(state => ([...state, {
        query: `Remove Defense`,
        sentAt: new Date(),
        returnedAt: new Date(),
        message: `❌ **Error:** Please specify a defense to remove.\n\nExample: "remove fire resistance"`,
        hidden: false
      }]));
      return;
    }

    const store = getCharacterStore();
    
    // Check if defense exists and find it
    let defenseExists = false;
    let defenseIndex = -1;
    const unsubscribe = store.info.subscribe((info) => {
      defenseIndex = info.defences.findIndex(d => d.title.toLowerCase() === defenseName.toLowerCase());
      defenseExists = defenseIndex !== -1;
    });
    unsubscribe();
    
    if (!defenseExists) {
      replicateStore.update(state => ([...state, {
        query: `Remove Defense: ${defenseName}`,
        sentAt: new Date(),
        returnedAt: new Date(),
        message: `⚠️ **Defense Not Found**\n\nYou don't have **${defenseName}** defense.\n\nUse "list defenses" to see all active defenses.`,
        hidden: false
      }]));
      return;
    }

    // Remove defense with change tracking
    deleteDefence(defenseName);

    // Play sound effect
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('playButtonClick'));
    }

    replicateStore.update(state => ([...state, {
      query: `Remove Defense: ${defenseName}`,
      sentAt: new Date(),
      returnedAt: new Date(),
      message: `⚠️ **Defense Removed**\n\nYou no longer have **${defenseName}** defense.\n\nThe defense has been removed from your character sheet.`,
      hidden: false
    }]));

  } catch (error) {
    console.error('Remove defense error:', error);
    replicateStore.update(state => ([...state, {
      query: `Remove Defense`,
      sentAt: new Date(),
      returnedAt: new Date(),
      message: `❌ **Error:** Unable to remove defense. Please try again.`,
      hidden: false
    }]));
  }
}

async function aiListDefenses(action: AiAction) {
  try {
    const store = getCharacterStore();
    
    let defenses: any[] = [];
    const unsubscribe = store.info.subscribe((info) => {
      defenses = info.defences;
    });
    unsubscribe();

    if (defenses.length === 0) {
      replicateStore.update(state => ([...state, {
        query: `List Defenses`,
        sentAt: new Date(),
        returnedAt: new Date(),
        message: `🟢 **No Active Defenses**\n\nYou currently have no special defenses or resistances.\n\nDefenses can be added with "add [defense name] resistance" command.`,
        hidden: false
      }]));
      return;
    }

    const defenseList = defenses.map((defense, index) => 
      `${index + 1}. **${defense.title}**${defense.effects?.length ? `\n   - ${defense.effects.join('\n   - ')}` : ''}`
    ).join('\n\n');

    replicateStore.update(state => ([...state, {
      query: `List Defenses`,
      sentAt: new Date(),
      returnedAt: new Date(),
      message: `🛡️ **Active Defenses**\n\n${defenseList}\n\nUse "remove [defense name]" to remove any defense.`,
      hidden: false
    }]));

  } catch (error) {
    console.error('List defenses error:', error);
    replicateStore.update(state => ([...state, {
      query: `List Defenses`,
      sentAt: new Date(),
      returnedAt: new Date(),
      message: `❌ **Error:** Unable to list defenses. Please try again.`,
      hidden: false
    }]));
  }
}

// Inventory Management Functions
async function aiShowItems(action: AiAction) {
  try {
    const store = getCharacterStore();
    
    let inventory: any[] = [];
    const unsubscribe = store.inventory.subscribe((inv) => {
      inventory = inv;
    });
    unsubscribe();

    if (inventory.length === 0) {
      replicateStore.update(state => ([...state, {
        query: `Show Items`,
        sentAt: new Date(),
        returnedAt: new Date(),
        message: `📦 **Empty Inventory**\n\nYour character has no items in their inventory.\n\nItems can be added via character updates or AI commands.`,
        hidden: false
      }]));
      return;
    }

    // Group items by type for better organization
    const groupedItems: {[key: string]: any[]} = {};
    inventory.forEach(item => {
      const type = item.type || 'misc';
      if (!groupedItems[type]) {
        groupedItems[type] = [];
      }
      groupedItems[type].push(item);
    });

    // Create item cards for each category
    let itemsDisplay = '';
    const typeIcons: {[key: string]: string} = {
      weapon: '⚔️',
      armor: '🛡️',
      consumable: '🧪',
      tool: '🔨',
      treasure: '💎',
      ammunition: '🏹',
      misc: '📦'
    };

    Object.entries(groupedItems).forEach(([type, items]) => {
      const icon = typeIcons[type] || '📦';
      itemsDisplay += `\n## ${icon} ${type.charAt(0).toUpperCase() + type.slice(1)}\n\n`;
      
      items.forEach(item => {
        const rarity = item.rarity || 'common';
        const rarityIcon = rarity === 'legendary' ? '🟣' : 
                          rarity === 'very rare' ? '🟡' : 
                          rarity === 'rare' ? '🔵' : 
                          rarity === 'uncommon' ? '🟢' : '⚪';
        
        const equipped = item.equipped ? ' *(equipped)*' : '';
        const quantity = item.quantity > 1 ? ` (×${item.quantity})` : '';
        const weight = item.weight ? ` • ${item.weight} lb` : '';
        const value = item.value ? ` • ${item.value.amount} ${item.value.currency}` : '';
        
        // Add damage/AC info for weapons/armor
        let mechanics = '';
        if (item.properties?.damage) {
          const dmg = item.properties.damage;
          mechanics += ` • ${dmg.amount}d${dmg.dice}${dmg.bonus ? `+${dmg.bonus}` : ''} ${dmg.type}`;
        }
        if (item.properties?.ac) {
          const ac = item.properties.ac;
          mechanics += ` • AC ${ac.base}${ac.bonus ? `+${ac.bonus}` : ''}`;
        }
        
        itemsDisplay += `### ${rarityIcon} **${item.title}**${quantity}${equipped}\n`;
        if (item.description) {
          itemsDisplay += `*${item.description}*\n`;
        }
        itemsDisplay += `${weight}${value}${mechanics}\n\n`;
      });
    });

    // Count totals
    const totalItems = inventory.reduce((sum, item) => sum + (item.quantity || 1), 0);
    const totalWeight = inventory.reduce((sum, item) => sum + ((item.weight || 0) * (item.quantity || 1)), 0);
    const equippedCount = inventory.filter(item => item.equipped).length;

    replicateStore.update(state => ([...state, {
      query: `Show Items`,
      sentAt: new Date(),
      returnedAt: new Date(),
      message: `🎒 **Character Inventory**\n\n*${totalItems} items • ${totalWeight} lbs total • ${equippedCount} equipped*\n${itemsDisplay}\n---\n💡 **Tips:** \n• "show my gun" - view specific items\n• "add 20 arrows" - add items/ammo\n• "remove 5 arrows" - remove items`,
      hidden: false
    }]));

  } catch (error) {
    console.error('Show items error:', error);
    replicateStore.update(state => ([...state, {
      query: `Show Items`,
      sentAt: new Date(),
      returnedAt: new Date(),
      message: `❌ **Error:** Unable to display inventory. Please try again.`,
      hidden: false
    }]));
  }
}

async function aiShowSpecificItem(action: AiAction) {
  try {
    const itemQuery = action.args.itemQuery || '';
    
    if (!itemQuery) {
      replicateStore.update(state => ([...state, {
        query: `Show Specific Item`,
        sentAt: new Date(),
        returnedAt: new Date(),
        message: `❌ **Error:** Please specify what item you're looking for.\n\nExample: "show me my gun" or "describe my sword"`,
        hidden: false
      }]));
      return;
    }

    const store = getCharacterStore();
    
    let inventory: any[] = [];
    const unsubscribe = store.inventory.subscribe((inv) => {
      inventory = inv;
    });
    unsubscribe();

    if (inventory.length === 0) {
      replicateStore.update(state => ([...state, {
        query: `Show Item: ${itemQuery}`,
        sentAt: new Date(),
        returnedAt: new Date(),
        message: `📦 **No Items Found**\n\nYour character has no items in their inventory.\n\nItems can be added via character updates or AI commands.`,
        hidden: false
      }]));
      return;
    }

    // Use AI to find the best matching item
    const details = get(userDetails);
    const apiKey = details?.replicate_api_key;
    if (!apiKey) {
      // Fallback to simple text matching if no API key
      const matchedItem = findItemBySimpleMatch(inventory, itemQuery);
      if (matchedItem) {
        await showItemCard(matchedItem, itemQuery);
      } else {
        await showNoItemFound(itemQuery, inventory);
      }
      return;
    }

    // Use AI to find the best match
    const matchedItem = await findItemWithAI(inventory, itemQuery);
    if (matchedItem) {
      await showItemCard(matchedItem, itemQuery);
    } else {
      await showNoItemFound(itemQuery, inventory);
    }

  } catch (error) {
    console.error('Show specific item error:', error);
    replicateStore.update(state => ([...state, {
      query: `Show Item`,
      sentAt: new Date(),
      returnedAt: new Date(),
      message: `❌ **Error:** Unable to find the specified item. Please try again.`,
      hidden: false
    }]));
  }
}

function findItemBySimpleMatch(inventory: any[], query: string): any | null {
  const lowerQuery = query.toLowerCase();
  
  // Direct title match
  let match = inventory.find(item => 
    item.title && item.title.toLowerCase().includes(lowerQuery)
  );
  if (match) return match;
  
  // Type match
  match = inventory.find(item => 
    item.type && item.type.toLowerCase().includes(lowerQuery)
  );
  if (match) return match;
  
  // Description match
  match = inventory.find(item => 
    item.description && item.description.toLowerCase().includes(lowerQuery)
  );
  if (match) return match;
  
  // Attributes match
  match = inventory.find(item => 
    item.attributes && item.attributes.some((attr: string) => 
      attr.toLowerCase().includes(lowerQuery)
    )
  );
  
  return match || null;
}

async function findItemWithAI(inventory: any[], query: string): Promise<any | null> {
  try {
    const itemsList = inventory.map((item, index) => 
      `${index}: ${item.title} (${item.type}) - ${item.description || 'No description'}`
    ).join('\n');

    const prompt = `Find the best matching item for the query "${query}" from this inventory:

${itemsList}

Return only the index number of the best match, or -1 if no good match exists.`;

    const response = await fetch("/api/ai/models/meta/meta-llama-3-8b-instruct/predictions", {
      method: "POST",
      headers: {
        ...getCsrfHeaders(), "Content-Type": "application/json",
      },
      body: JSON.stringify({
        stream: false,
        input: {
          prompt,
          max_tokens: 50,
          temperature: 0.1
        }
      })
    });

    if (!response.ok) {
      throw new Error('AI matching failed');
    }

    const result = await response.json();
    let getUrl = result?.urls?.get?.replace('https://api.replicate.com/v1', '/api/ai');
    
    if (!getUrl) {
      throw new Error('Invalid AI response');
    }

    // Poll for result
    for (let i = 0; i < 15; i++) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const res = await fetch(getUrl, {
        headers: {}
      });

      if (res.ok) {
        const body = await res.json();
        const output = typeof body.output === 'string' ? body.output : body.output?.join('');
        
        if (output) {
          const index = parseInt(output.trim());
          if (index >= 0 && index < inventory.length) {
            return inventory[index];
          }
        }
      }
    }
  } catch (error) {
    console.error('AI item matching error:', error);
  }
  
  // Fallback to simple matching
  return findItemBySimpleMatch(inventory, query);
}

async function generateItemImage(item: any): Promise<string> {
  const details = get(userDetails);
  const apiKey = details?.replicate_api_key;
  if (!apiKey) {
    return getDefaultItemImage(item.type);
  }

  try {
    const prompt = `A detailed fantasy ${item.type} called "${item.title}". ${item.description || ''}. High quality digital art, fantasy style, isolated on white background, D&D item illustration`;

    const response = await fetch("/api/ai/models/black-forest-labs/flux-1.1-pro/predictions", {
      method: "POST",
      headers: {
        ...getCsrfHeaders(), "Content-Type": "application/json",
      },
      body: JSON.stringify({
        stream: false,
        input: {
          prompt,
          width: 512,
          height: 512,
          num_outputs: 1,
          guidance_scale: 3.5,
          num_inference_steps: 28,
          seed: Math.floor(Math.random() * 1000000)
        }
      })
    });

    if (!response.ok) {
      throw new Error('Image generation failed');
    }

    const result = await response.json();
    let getUrl = result?.urls?.get?.replace('https://api.replicate.com/v1', '/api/ai');
    
    if (!getUrl) {
      throw new Error('Invalid image generation response');
    }

    // Poll for result
    for (let i = 0; i < 30; i++) {
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      const res = await fetch(getUrl, {
        headers: {}
      });

      if (res.ok) {
        const body = await res.json();
        const output = body.output;
        
        if (output && Array.isArray(output) && output.length > 0) {
          return output[0];
        }
      }
    }
  } catch (error) {
    console.error('Image generation error:', error);
  }
  
  return getDefaultItemImage(item.type);
}

function getDefaultItemImage(type: string): string {
  const typeIcons: {[key: string]: string} = {
    weapon: '⚔️',
    armor: '🛡️',
    consumable: '🧪',
    tool: '🔨',
    treasure: '💎',
    ammunition: '🏹',
    misc: '📦'
  };
  
  return typeIcons[type] || '📦';
}

async function showItemCard(item: any, query: string) {
  const rarity = item.rarity || 'common';
  const rarityIcon = rarity === 'legendary' ? '🟣' : 
                    rarity === 'very rare' ? '🟡' : 
                    rarity === 'rare' ? '🔵' : 
                    rarity === 'uncommon' ? '🟢' : '⚪';

  const equipped = item.equipped ? ' *(equipped)*' : '';
  const quantity = item.quantity > 1 ? ` (×${item.quantity})` : '';
  const weight = item.weight ? `\n**Weight:** ${item.weight} lb` : '';
  const value = item.value ? `\n**Value:** ${item.value.amount} ${item.value.currency}` : '';
  const attributes = item.attributes?.length ? `\n**Properties:** ${item.attributes.join(', ')}` : '';
  
  // Generate or get image
  const imageUrl = await generateItemImage(item);
  const imageDisplay = imageUrl.startsWith('http') ? `![${item.title}](${imageUrl})` : imageUrl;

  let propertiesDisplay = '';
  if (item.properties) {
    if (item.properties.damage) {
      const dmg = item.properties.damage;
      propertiesDisplay += `\n**Damage:** ${dmg.amount}d${dmg.dice}${dmg.bonus ? `+${dmg.bonus}` : ''} ${dmg.type}`;
    }
    if (item.properties.ac) {
      const ac = item.properties.ac;
      propertiesDisplay += `\n**AC:** ${ac.base}${ac.bonus ? `+${ac.bonus}` : ''}`;
    }
    if (item.properties.range) {
      const range = item.properties.range;
      propertiesDisplay += `\n**Range:** ${range.normal}/${range.max} ft`;
    }
  }

  replicateStore.update(state => ([...state, {
    query: `Show Item: ${query}`,
    sentAt: new Date(),
    returnedAt: new Date(),
    message: `🎯 **Item Found**\n\n${imageDisplay}\n\n## ${rarityIcon} **${item.title}**${quantity}${equipped}\n\n*${item.description || 'No description available'}*${weight}${value}${attributes}${propertiesDisplay}\n\n---\n💡 **Ask me about other items in your inventory!**`,
    hidden: false
  }]));
}

async function showNoItemFound(query: string, inventory: any[]) {
  const suggestions = inventory.slice(0, 3).map(item => `• ${item.title}`).join('\n');
  
  replicateStore.update(state => ([...state, {
    query: `Show Item: ${query}`,
    sentAt: new Date(),
    returnedAt: new Date(),
    message: `🔍 **Item Not Found**\n\nI couldn't find "${query}" in your inventory.\n\n**Similar items you have:**\n${suggestions}\n\nTry asking "show items" to see your full inventory.`,
    hidden: false
  }]));
}

// Item Management Functions
async function aiAddItem(action: AiAction) {
  try {
    const itemName = action.args.itemName || '';
    const quantity = action.args.quantity || 1;
    
    if (!itemName) {
      replicateStore.update(state => ([...state, {
        query: `Add Item`,
        sentAt: new Date(),
        returnedAt: new Date(),
        message: `❌ **Error:** Please specify what item to add.\n\nExample: "add 20 arrows" or "give me a sword"`,
        hidden: false
      }]));
      return;
    }

    const store = getCharacterStore();
    
    // Check if item already exists in inventory
    let existingItemIndex = -1;
    let inventory: any[] = [];
    const unsubscribe = store.inventory.subscribe((inv) => {
      inventory = inv;
      existingItemIndex = inv.findIndex(item => 
        item.title.toLowerCase().includes(itemName.toLowerCase())
      );
    });
    unsubscribe();

    if (existingItemIndex >= 0) {
      // Add to existing item quantity
      putItem({ ...inventory[existingItemIndex], quantity: inventory[existingItemIndex].quantity + quantity });
      
      replicateStore.update(state => ([...state, {
        query: `Add Item: ${itemName}`,
        sentAt: new Date(),
        returnedAt: new Date(),
        message: `📦 **Item Added**\n\nAdded **${quantity}x ${inventory[existingItemIndex].title}** to your inventory.\n\nNew quantity: **${inventory[existingItemIndex].quantity + quantity}**`,
        hidden: false
      }]));
    } else {
      // Create new item
      const newItem = createNewItem(itemName, quantity);
      
      postItem(newItem);
      
      replicateStore.update(state => ([...state, {
        query: `Add Item: ${itemName}`,
        sentAt: new Date(),
        returnedAt: new Date(),
        message: `✨ **New Item Created**\n\nAdded **${quantity}x ${newItem.title}** to your inventory.\n\n*${newItem.description}*\n\n💡 **Tip:** Use the inventory tab to equip items!`,
        hidden: false
      }]));
    }

    // Play sound effect
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('showFunnyText', {
        detail: { text: `Obtained ${itemName}!`, category: 'treasure' }
      }));
    }

  } catch (error) {
    console.error('Add item error:', error);
    replicateStore.update(state => ([...state, {
      query: `Add Item`,
      sentAt: new Date(),
      returnedAt: new Date(),
      message: `❌ **Error:** Unable to add item. Please try again.`,
      hidden: false
    }]));
  }
}

async function aiAddAmmunition(action: AiAction) {
  try {
    const quantity = action.args.quantity || 20;
    const store = getCharacterStore();
    
    let inventory: any[] = [];
    const unsubscribe = store.inventory.subscribe((inv) => {
      inventory = inv;
    });
    unsubscribe();

    // Find existing ammunition item
    const ammoItem = inventory.find(item => item.id === 'ammunition' || item.title.toLowerCase().includes('ammunition'));

    if (ammoItem) {
      // Add to existing ammunition
      const oldQuantity = ammoItem.quantity;
      const newQuantity = oldQuantity + quantity;

      putItem({ ...ammoItem, quantity: newQuantity });

      replicateStore.update(state => ([...state, {
        query: `Add Ammunition: ${quantity}`,
        sentAt: new Date(),
        returnedAt: new Date(),
        message: `🏹 **Ammunition Added**\n\nAdded **${quantity}x Ammunition** to your existing supply.\n\n**Total:** ${newQuantity} rounds\n*(was ${oldQuantity})*\n\n💡 **Tip:** Make sure ammunition is equipped to use ranged weapons!`,
        hidden: false
      }]));
    } else {
      // Create new ammunition item
      const newAmmo = {
        id: "ammunition-" + Date.now(),
        title: "Ammunition",
        type: "ammunition" as const,
        subtype: "rounds",
        rarity: "common" as const,
        attributes: [] as string[],
        description: "Firearm ammunition for ranged weapons",
        value: { amount: 3, currency: "gp" as const },
        weight: Math.ceil(quantity / 20), // 1 lb per 20 rounds
        quantity: quantity,
        equippable: true,
        equipped: false
      };

      postItem(newAmmo);

      replicateStore.update(state => ([...state, {
        query: `Add Ammunition: ${quantity}`,
        sentAt: new Date(),
        returnedAt: new Date(),
        message: `🏹 **New Ammunition Created**\n\nAdded **${quantity}x Ammunition** to your inventory.\n\n*Firearm ammunition for ranged weapons*\n\n💡 **Tip:** Use the inventory tab to equip ammunition!`,
        hidden: false
      }]));
    }

    // Play sound effect
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('showFunnyText', {
        detail: { text: `+${quantity} Ammunition!`, category: 'treasure' }
      }));
    }

  } catch (error) {
    console.error('Add ammunition error:', error);
    replicateStore.update(state => ([...state, {
      query: `Add Ammunition`,
      sentAt: new Date(),
      returnedAt: new Date(),
      message: `❌ **Error:** Unable to add ammunition. Please try again.`,
      hidden: false
    }]));
  }
}

async function aiRemoveItem(action: AiAction) {
  try {
    const itemName = action.args.itemName || '';
    const quantity = action.args.quantity || 1;
    
    if (!itemName) {
      replicateStore.update(state => ([...state, {
        query: `Remove Item`,
        sentAt: new Date(),
        returnedAt: new Date(),
        message: `❌ **Error:** Please specify what item to remove.\n\nExample: "remove 5 arrows" or "lose my sword"`,
        hidden: false
      }]));
      return;
    }

    const store = getCharacterStore();
    
    // Find item in inventory
    let itemIndex = -1;
    let inventory: any[] = [];
    const unsubscribe = store.inventory.subscribe((inv) => {
      inventory = inv;
      itemIndex = inv.findIndex(item => 
        item.title.toLowerCase().includes(itemName.toLowerCase())
      );
    });
    unsubscribe();

    if (itemIndex === -1) {
      replicateStore.update(state => ([...state, {
        query: `Remove Item: ${itemName}`,
        sentAt: new Date(),
        returnedAt: new Date(),
        message: `🔍 **Item Not Found**\n\nI couldn't find "${itemName}" in your inventory.\n\nTry "show items" to see what you have.`,
        hidden: false
      }]));
      return;
    }

    const item = inventory[itemIndex];
    const oldQuantity = item.quantity;
    
    if (quantity >= item.quantity) {
      // Remove item completely
      deleteItem(item.id);
      
      replicateStore.update(state => ([...state, {
        query: `Remove Item: ${itemName}`,
        sentAt: new Date(),
        returnedAt: new Date(),
        message: `🗑️ **Item Removed**\n\nRemoved **${item.title}** completely from your inventory.\n\nQuantity removed: **${oldQuantity}**`,
        hidden: false
      }]));
    } else {
      // Reduce quantity
      putItem({ ...item, quantity: item.quantity - quantity });
      
      replicateStore.update(state => ([...state, {
        query: `Remove Item: ${itemName}`,
        sentAt: new Date(),
        returnedAt: new Date(),
        message: `📦 **Item Quantity Reduced**\n\nRemoved **${quantity}x ${item.title}** from your inventory.\n\nRemaining quantity: **${item.quantity - quantity}**`,
        hidden: false
      }]));
    }

    // Play sound effect
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('showFunnyText', {
        detail: { text: `Lost ${itemName}!`, category: 'warning' }
      }));
    }

  } catch (error) {
    console.error('Remove item error:', error);
    replicateStore.update(state => ([...state, {
      query: `Remove Item`,
      sentAt: new Date(),
      returnedAt: new Date(),
      message: `❌ **Error:** Unable to remove item. Please try again.`,
      hidden: false
    }]));
  }
}

function createNewItem(itemName: string, quantity: number): any {
  const lowerName = itemName.toLowerCase();
  
  // Determine item type based on name
  let itemType: string = 'misc';
  let description = `A ${itemName}.`;
  
  if (lowerName.includes('arrow') || lowerName.includes('bolt') || lowerName.includes('bullet') || 
      lowerName.includes('shot') || lowerName.includes('ammo')) {
    itemType = 'ammunition';
    description = `${itemName} for ranged weapons.`;
  } else if (lowerName.includes('sword') || lowerName.includes('bow') || lowerName.includes('gun') || 
             lowerName.includes('axe') || lowerName.includes('hammer') || lowerName.includes('dagger') ||
             lowerName.includes('staff') || lowerName.includes('wand')) {
    itemType = 'weapon';
    description = `A ${itemName} weapon.`;
  } else if (lowerName.includes('armor') || lowerName.includes('shield') || lowerName.includes('helmet') ||
             lowerName.includes('boots') || lowerName.includes('gloves')) {
    itemType = 'armor';
    description = `${itemName} for protection.`;
  } else if (lowerName.includes('potion') || lowerName.includes('elixir') || lowerName.includes('scroll')) {
    itemType = 'consumable';
    description = `A consumable ${itemName}.`;
  } else if (lowerName.includes('tool') || lowerName.includes('kit')) {
    itemType = 'tool';
    description = `A useful ${itemName}.`;
  } else if (lowerName.includes('gem') || lowerName.includes('coin') || lowerName.includes('treasure')) {
    itemType = 'treasure';
    description = `Valuable ${itemName}.`;
  }

  return {
    id: `item_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    title: itemName.split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' '),
    type: itemType,
    description,
    weight: itemType === 'ammunition' ? 0.05 : 1,
    value: { amount: 1, currency: 'gp' },
    quantity,
    equippable: true, // All items are now equippable
    equipped: false,
    rarity: 'common',
    attributes: []
  };
}

