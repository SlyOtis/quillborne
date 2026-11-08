import { getCsrfHeaders, getProfileDetails } from './api'
import { derived, get, type Readable } from "svelte/store";
import { userDetails } from "./stores/auth.store";

export interface AIRequest {
  prompt: string;
  image?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface AIResponse {
  text: string;
}

export interface CharacterImport {
  name?: string;
  level?: number;
  class?: string;
  race?: string;
  background?: string;
  abilityScores?: Record<string, number>;
  classes?: ClassOption[];
  notes?: string;
}

export interface ClassOption {
  name: string;
  description: string;
  hitDie: string;
  primaryAbility: string;
  savingThrows: string;
}

const MODEL = "anthropic/claude-4-sonnet";
const ENDPOINT = "/api/ai";
const POLL_ATTEMPTS = 40;
const POLL_DELAY = 1500;

export const hasReplicateKey: Readable<boolean> = derived(
  userDetails,
  ($details) => Boolean($details?.replicate_api_key)
);

class AIService {
  async getKeyHeld(): Promise<void> {
    const details = get(userDetails) ?? (await getProfileDetails());

    if (!details?.replicate_api_key) {
      throw new Error("No Replicate key is on your account. Add one on your profile page.");
    }
  }

  async postPrediction(request: AIRequest): Promise<AIResponse> {
    await this.getKeyHeld();
    const model = request.model || MODEL;

    const input: Record<string, unknown> = {
      prompt: request.prompt,
      max_tokens: request.maxTokens || 4096,
      temperature: request.temperature ?? 0.3
    };

    if (request.image) input.image = request.image;

    const started = await fetch(`${ENDPOINT}/models/${model}/predictions`, {
      method: "POST",
      headers: { ...getCsrfHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ stream: false, input })
    });

    if (!started.ok) {
      throw new Error(`Replicate answered ${started.status}: ${await started.text()}`);
    }

    const prediction = await started.json();
    const pollUrl = (prediction?.urls?.get as string | undefined)?.replace(
      "https://api.replicate.com/v1",
      ENDPOINT
    );

    if (!pollUrl) {
      throw new Error("Replicate returned no polling address.");
    }

    return { text: await this.pollPrediction(pollUrl) };
  }

  private async pollPrediction(pollUrl: string): Promise<string> {
    for (let attempt = 0; attempt < POLL_ATTEMPTS; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, POLL_DELAY));

      const answer = await fetch(pollUrl, {
        method: "GET",
        headers: { "Content-Type": "application/json" }
      });

      if (!answer.ok) continue;

      const body = await answer.json();

      if (body.status === "succeeded") {
        const output = Array.isArray(body.output) ? body.output.join("") : body.output;
        if (!output) throw new Error("Replicate returned an empty answer.");
        return output;
      }

      if (body.status === "failed" || body.status === "canceled") {
        throw new Error(`Replicate did not finish: ${body.error ?? body.status}`);
      }
    }

    throw new Error("Replicate did not answer in time.");
  }

  async postJson<T>(request: AIRequest): Promise<T> {
    const { text } = await this.postPrediction(request);
    const match = text.match(/\{[\s\S]*\}/);

    if (!match) {
      throw new Error("The model answered without any JSON.");
    }

    return JSON.parse(match[0]) as T;
  }

  async postImageReading(image: string): Promise<string> {
    const { text } = await this.postPrediction({
      image,
      prompt: `Read this image. It is a D&D character sheet, a sourcebook page, or a screenshot of one.

Write out everything legible as plain text: the character name, level, class, race, background, ability scores, proficiencies, features, equipment and spells. Keep the labels next to their values. Do not summarise and do not invent anything that is not written in the image.`
    });

    return text;
  }

  async postCharacterImport(sources: string[]): Promise<CharacterImport> {
    return this.postJson<CharacterImport>({
      prompt: `Read the D&D source material below and pull out one character.

Source material:
${sources.join("\n\n---\n\n")}

Answer with JSON and nothing else, in this shape:
{
  "name": "the character name, or null",
  "level": 1,
  "class": "the class name, or null",
  "race": "the race, or null",
  "background": "the background, or null",
  "abilityScores": { "strength": 10, "dexterity": 10, "constitution": 10, "intelligence": 10, "wisdom": 10, "charisma": 10 },
  "classes": [
    { "name": "any class named in the source that is not in the 5e Player's Handbook", "description": "one line", "hitDie": "d8", "primaryAbility": "Intelligence", "savingThrows": "Constitution, Intelligence" }
  ],
  "notes": "anything else worth carrying over"
}

Use 5e rules. Leave a field null when the source does not say. Return an empty classes array when every class named is already in the Player's Handbook.`
    });
  }

  async analyzeCharacterSources(
    sources: string[],
    characterName: string,
    level: number
  ): Promise<CharacterImport> {
    return this.postJson<CharacterImport>({
      prompt: `Read the D&D source material below for ${characterName}, a level ${level} character, and name the classes they could take.

Source material:
${sources.join("\n\n---\n\n")}

Answer with JSON and nothing else, in this shape:
{
  "classes": [
    { "name": "Class Name", "description": "one line", "hitDie": "d8", "primaryAbility": "Intelligence", "savingThrows": "Constitution, Intelligence" }
  ],
  "race": "race named in the source, or null",
  "background": "background named in the source, or null",
  "notes": "anything the player should know before choosing"
}

Use 5e rules. List only classes the source adds beyond the Player's Handbook, and return an empty array when it adds none.`
    });
  }
}

export const aiService = new AIService();

