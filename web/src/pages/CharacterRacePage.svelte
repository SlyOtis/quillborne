<script lang="ts">
  import { postCharacter, putCharacterSources } from '$lib/api'
  import { onMount } from "svelte";
  import { navigate } from "sly-svelte-location-router";
  import { getCatalog, postCatalogReading, type CatalogEntry } from "$lib/catalog";
  import { getSource } from "$lib/sources";
  import CatalogList from "$components/CatalogList.svelte";
  import type { Character } from "$lib/character.types";
  import type { RuleSystemOverlay } from "$lib/rules/spec.types";
  import { getAbilities, getEmptyCharacter, getEmptyCharacterInfo } from "$lib/engine";
  import { getSystemStack } from "$lib/rules/system";
  import { getStartingCharacter } from "$lib/dialogs/levelUp";
  import Button from "$components/ui/Button.svelte";
  import Ornament from "$components/ui/Ornament.svelte";
  import Shell from "$components/ui/Shell.svelte";

  interface CharacterData {
    name: string;
    level: number;
    backgroundUrl?: string;
    abilityScores: Record<string, number>;
    sources: string[];
    imageUrl?: string;
    suggestedRace?: string;
    selectedClass?: string;
    hitDie?: number;
    attributes?: unknown[];
    systems: string[];
    overlay: RuleSystemOverlay | null;
    campaignId?: string;
  }

  let characterData = $state<CharacterData | null>(null);
  let isAnalyzing = $state(true);
  let error = $state<string | null>(null);
  let availableRaces = $state<CatalogEntry[]>([]);
  let selectedRace = $state<string>('');
  let reading = $state<string | null>(null);
  let picking = $state(false);

  const suggestedRace = $derived.by(() => {
    const suggested = characterData?.suggestedRace?.trim();
    if (!suggested) return '';
    return suggested.toLowerCase() === characterData?.selectedClass?.trim().toLowerCase() ? '' : suggested;
  });
  const settled = $derived(Boolean(suggestedRace) && !picking);

  onMount(async () => {
    const savedData = sessionStorage.getItem('characterCreationData');
    if (!savedData) {
      navigate('/main/create/character');
      return;
    }

    characterData = JSON.parse(savedData);
    await getRaces();
  });

  async function getRaces() {
    if (!characterData) return;

    try {
      availableRaces = await getCatalog('races');
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
      isAnalyzing = false;
      return;
    }

    if (suggestedRace) {
      const named = availableRaces.find((entry) => entry.name.toLowerCase() === suggestedRace.toLowerCase());
      selectedRace = named?.name ?? suggestedRace;
    }

    isAnalyzing = false;
  }

  function selectRace(raceName: string) {
    selectedRace = raceName;
  }

  async function postOwnRace(files: File[]) {
    error = null;

    try {
      const texts: string[] = [];
      for (const file of files) {
        reading = file.name;
        texts.push((await getSource(file)).text);
      }

      reading = 'Reading the race';
      const made = await postCatalogReading('races', texts);

      availableRaces = [made, ...availableRaces.filter((entry) => entry.id !== made.id)];
      selectedRace = made.name;
    } catch (reason) {
      error = reason instanceof Error ? reason.message : String(reason);
    } finally {
      reading = null;
    }
  }

  async function continueToNext() {
    if (!selectedRace || !characterData) return;

    try {
      const character: Character = {
        ...getEmptyCharacter(),
        info: {
          ...getEmptyCharacterInfo(),
          name: characterData.name,
          level: characterData.level,
          imageUrl: characterData.imageUrl ?? "",
          backgroundUrl: characterData.backgroundUrl,
          class: {
            name: characterData.selectedClass ?? "Unknown",
            hitDice: { amount: characterData.level, die: characterData.hitDie ?? 8 }
          },
          race: { name: selectedRace, type: "Unknown" }
        },
        abilities: getAbilities(characterData.abilityScores),
        background: { title: "Unknown", description: "" },
        systems: characterData.systems,
        overlay: characterData.overlay
      };

      const system = await getSystemStack(character.systems, character.overlay ?? undefined);
      const entry = (await getCatalog('classes')).find((one) => one.name === character.info.class.name) ?? null;

      const characterId = await postCharacter(getStartingCharacter(character, system, entry), {
        tags: characterData.sources.length > 0 ? ["ai-generated", "sources-uploaded"] : ["manually-created"]
      }, characterData.campaignId);

      if (characterData.sources?.length) {
        await putCharacterSources(characterId, characterData.sources);
      }

      navigate(`/main/character/${characterId}`);
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    }
  }
</script>

<Shell title="Choose a Race">
  <header class="pick-crown">
    <span class="pick-crest">
      <span class="pick-plate dnd-shield"></span>
      <Ornament name="crest" size="md" tone="metal" />
    </span>
    <h1 class="dnd-heading dnd-heading-hero pick-name">Choose Your Race</h1>
    <span class="pick-rule"><Ornament name="divider" tone="metal" /></span>
    {#if characterData}
      <p class="pick-lede">The blood {characterData.name} carries.</p>
    {/if}
  </header>

  {#if isAnalyzing}
    <div class="dnd-loading pick-wait">
      <span class="dnd-spinner"></span>
      <p class="pick-wait-note">
        Reading the races…
      </p>
    </div>
  {:else if error}
    <p class="pick-alarm" role="alert">{error}</p>
  {:else if settled}
    <div class="pick-settled">
      <span class="pick-niche">
        <span class="pick-niche-plate dnd-arch"></span>
        <Ornament name="lancet" size="md" tone="metal" />
      </span>
      <p class="dnd-label pick-settled-eyebrow">Read from your source material</p>
      <p class="pick-settled-name">{selectedRace}</p>
      <p class="pick-settled-note">Nothing to choose. Change it if the reading got it wrong.</p>
      <Button variant="ghost" size="sm" onclick={() => (picking = true)}>Choose a different race</Button>
    </div>

    <div class="pick-acts">
      <Button variant="secondary" onclick={() => navigate('/main/create/character/class')}>Back</Button>
      <Button variant="primary" onclick={continueToNext}>Continue as {selectedRace}</Button>
    </div>
  {:else}
    <CatalogList
      kind="races"
      entries={availableRaces}
      selected={selectedRace}
      {reading}
      onpick={(entry) => selectRace(entry.name)}
      onupload={postOwnRace}
    />

    <div class="pick-acts">
      <Button variant="secondary" onclick={() => navigate('/main/create/character/class')}>Back</Button>
      <Button variant="primary" disabled={!selectedRace} onclick={continueToNext}>
        {selectedRace ? `Continue as ${selectedRace}` : 'Choose a race'}
      </Button>
    </div>
  {/if}
</Shell>

<style>
  .pick-crown {
    --pick-rule-run: calc(var(--space-8) * 6);
    --pick-rule-share: 70%;
    --pick-crest-lift: drop-shadow(0 var(--space-1) var(--space-3) var(--shade-hard));
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-2);
    min-width: 0;
    text-align: center;
  }

  .pick-crest {
    position: relative;
    isolation: isolate;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: var(--space-3) var(--space-6) var(--space-5);
    filter: var(--pick-crest-lift);
  }

  .pick-plate {
    position: absolute;
    inset: 0;
    z-index: -1;
    background:
      linear-gradient(180deg, color-mix(in srgb, var(--stone-light) 20%, transparent) 0%, color-mix(in srgb, var(--ground-deep) 45%, transparent) 60%, color-mix(in srgb, var(--ground-deep) 65%, transparent) 100%),
      var(--texture-noise),
      var(--stone);
    box-shadow: var(--rim-thin), var(--bevel-up);
  }

  .pick-name {
    font-size: var(--text-2xl);
    overflow-wrap: anywhere;
  }

  .pick-rule {
    display: block;
    width: min(var(--pick-rule-run), var(--pick-rule-share));
  }

  .pick-lede {
    margin: 0;
    font-family: var(--font-body);
    font-size: var(--text-sm);
    font-style: italic;
    color: var(--ink-dim);
  }

  .pick-wait {
    flex-direction: column;
    gap: var(--space-4);
  }

  .pick-wait-note {
    margin: 0;
    font-size: var(--text-sm);
    color: var(--ink-dim);
  }

  .pick-alarm {
    margin: 0;
    padding: var(--space-3) var(--space-4);
    border: var(--border-hair) solid color-mix(in srgb, var(--state-bad) 55%, transparent);
    border-radius: var(--radius-sm);
    background: linear-gradient(180deg, color-mix(in srgb, var(--state-bad) 18%, transparent), transparent), var(--texture-noise), var(--ground-deep);
    box-shadow: var(--bevel-down);
    font-size: var(--text-sm);
    color: var(--ink);
  }

  .pick-settled {
    --pick-niche-w: calc(var(--space-8) + var(--space-5));
    --pick-niche-h: calc(var(--space-8) * 2);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-6);
    border: none;
    border-radius: var(--radius-lg);
    background:
      radial-gradient(ellipse 70% 50% at 50% 0%, color-mix(in srgb, var(--ember) 12%, transparent) 0%, transparent 70%),
      var(--texture-noise),
      linear-gradient(180deg, var(--ground-raised) 0%, var(--ground-deep) 100%);
    box-shadow: var(--rim), inset 0 0 1.25rem 0.25rem var(--shade-hard), var(--shadow-md), 0 0 1.125rem var(--ember-glow);
    text-align: center;
  }

  .pick-niche {
    position: relative;
    isolation: isolate;
    display: flex;
    align-items: center;
    justify-content: center;
    width: var(--pick-niche-w);
    height: var(--pick-niche-h);
    margin-bottom: var(--space-2);
  }

  .pick-niche-plate {
    position: absolute;
    inset: 0;
    z-index: -1;
    background:
      linear-gradient(180deg, color-mix(in srgb, var(--stone-light) 20%, transparent) 0%, color-mix(in srgb, var(--ground-deep) 45%, transparent) 60%, color-mix(in srgb, var(--ground-deep) 65%, transparent) 100%),
      var(--texture-noise),
      var(--stone);
    box-shadow: var(--rim-thin), var(--bevel-up);
  }

  .pick-settled-eyebrow {
    margin: 0;
    color: var(--metal);
  }

  .pick-settled-name {
    margin: 0;
    font-family: var(--font-display);
    font-size: var(--text-2xl);
    font-weight: 700;
    letter-spacing: var(--tracking-caps);
    text-transform: uppercase;
    color: var(--metal-bright);
    text-shadow: 0 0.125rem 0 var(--ground-deep), 0 0 0.875rem var(--ember-glow), 0 0 2rem color-mix(in srgb, var(--ember-glow) 55%, transparent);
    overflow-wrap: anywhere;
  }

  .pick-settled-note {
    margin: 0 0 var(--space-3);
    font-size: var(--text-sm);
    color: var(--ink-dim);
  }

  .pick-acts {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: var(--space-3);
  }
</style>
