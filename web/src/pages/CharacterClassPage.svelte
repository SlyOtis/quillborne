<script lang="ts">
  import { onMount } from "svelte";
  import { navigate } from "sly-svelte-location-router";
  import { aiService, type CharacterImport } from "$lib/ai";
  import { getCatalog, postCatalogReading, type CatalogEntry } from "$lib/catalog";
  import { getSource } from "$lib/sources";
  import CatalogList from "$components/CatalogList.svelte";
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
    suggestedClass?: string;
    suggestedRace?: string;
  }

  let characterData = $state<CharacterData | null>(null);
  let isAnalyzing = $state(true);
  let error = $state<string | null>(null);
  let aiAnalysis = $state<CharacterImport | null>(null);
  let availableClasses = $state<CatalogEntry[]>([]);
  let selectedClass = $state<string>('');
  let reading = $state<string | null>(null);
  let picking = $state(false);

  const settled = $derived(Boolean(characterData?.suggestedClass) && !picking);

  onMount(async () => {
    const savedData = sessionStorage.getItem('characterCreationData');
    if (!savedData) {
      navigate('/main/create/character');
      return;
    }

    characterData = JSON.parse(savedData);
    await analyzeCharacterSources();
  });

  async function analyzeCharacterSources() {
    if (!characterData) return;

    try {
      availableClasses = await getCatalog('classes');
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
      isAnalyzing = false;
      return;
    }

    if (characterData.suggestedClass) {
      const named = availableClasses.find(
        (entry) => entry.name.toLowerCase() === characterData!.suggestedClass!.toLowerCase()
      );
      selectedClass = named?.name ?? characterData.suggestedClass;
    }

    if (!characterData.sources?.length) {
      isAnalyzing = false;
      return;
    }

    try {
      aiAnalysis = await aiService.analyzeCharacterSources(
        characterData.sources,
        characterData.name,
        characterData.level
      );

      for (const found of aiAnalysis?.classes ?? []) {
        if (availableClasses.some((entry) => entry.name.toLowerCase() === found.name.toLowerCase())) continue;
        availableClasses.push({
          id: found.name.toLowerCase().replace(/[^a-z0-9]/g, ''),
          name: found.name,
          description: found.description,
          hitDie: Number(String(found.hitDie).replace(/\D/g, '')) || 8,
          primaryAbility: found.primaryAbility.split(/,\s*/),
          savingThrows: found.savingThrows.split(/,\s*/),
          source: 'uploaded'
        });
      }
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    } finally {
      isAnalyzing = false;
    }
  }

  function selectClass(className: string) {
    selectedClass = className;
  }

  async function postOwnClass(files: File[]) {
    error = null;

    try {
      const texts: string[] = [];
      for (const file of files) {
        reading = file.name;
        texts.push((await getSource(file)).text);
      }

      reading = 'Reading the class';
      const made = await postCatalogReading('classes', texts);

      availableClasses = [made, ...availableClasses.filter((entry) => entry.id !== made.id)];
      selectedClass = made.name;
    } catch (reason) {
      error = reason instanceof Error ? reason.message : String(reason);
    } finally {
      reading = null;
    }
  }

  function continueToNext() {
    if (!selectedClass || !characterData) return;

    const picked = availableClasses.find((entry) => entry.name === selectedClass);

    try {
      sessionStorage.setItem(
        'characterCreationData',
        JSON.stringify({
          ...characterData,
          selectedClass,
          hitDie: (picked?.hitDie as number) ?? 8
        })
      );
    } catch {
      error = 'Your source material is too large to carry to the next step. Remove a source and try again.';
      return;
    }

    navigate('/main/create/character/race');
  }
</script>

<Shell title="Choose a Class">
  <header class="pick-crown">
    <span class="pick-crest">
      <span class="pick-plate dnd-shield"></span>
      <Ornament name="crest" size="md" tone="metal" />
    </span>
    <h1 class="dnd-heading dnd-heading-hero pick-name">Choose Your Class</h1>
    <span class="pick-rule"><Ornament name="divider" tone="metal" /></span>
    {#if characterData}
      <p class="pick-lede">The path {characterData.name} walks from here.</p>
    {/if}
  </header>

  {#if isAnalyzing}
    <div class="dnd-loading pick-wait">
      <span class="dnd-spinner"></span>
      <p class="pick-wait-note">
        Reading the classes{characterData?.sources?.length ? ' and the material you brought' : ''}…
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
      <p class="pick-settled-name">{selectedClass}</p>
      <p class="pick-settled-note">Nothing to choose. Change it if the reading got it wrong.</p>
      <Button variant="ghost" size="sm" onclick={() => (picking = true)}>Choose a different class</Button>
    </div>

    <div class="pick-acts">
      <Button variant="secondary" onclick={() => navigate('/main/create/character')}>Back</Button>
      <Button variant="primary" onclick={continueToNext}>Continue as {selectedClass}</Button>
    </div>
  {:else}
    <CatalogList
      kind="classes"
      entries={availableClasses}
      selected={selectedClass}
      {reading}
      onpick={(entry) => selectClass(entry.name)}
      onupload={postOwnClass}
    />

    <div class="pick-acts">
      <Button variant="secondary" onclick={() => navigate('/main/create/character')}>Back</Button>
      <Button variant="primary" disabled={!selectedClass} onclick={continueToNext}>
        {selectedClass ? `Continue as ${selectedClass}` : 'Choose a class'}
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
