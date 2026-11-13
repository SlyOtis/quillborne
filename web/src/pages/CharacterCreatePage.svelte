<script lang="ts">
  import { getAssets, postFile } from '$lib/api'
  import type { Character } from '$lib/api/types'
  import { onMount } from "svelte";
  import { navigate, resolvedRoute } from "sly-svelte-location-router";
  import { getSystems } from "$lib/rules/system";
  import { getExpressionValue } from "$lib/rules/expression";
  import type { AttributeSpec, RuleSystem, RuleSystemOverlay } from "$lib/rules/spec.types";
  import { aiService, hasReplicateKey } from "$lib/ai";
  import { getSource, SOURCE_ACCEPT, type Source } from "$lib/sources";
  import Button from "$components/ui/Button.svelte";
  import Field from "$components/ui/Field.svelte";
  import Glyph from "$components/ui/Glyph.svelte";
  import IconBtn from "$components/ui/IconBtn.svelte";
  import Ornament from "$components/ui/Ornament.svelte";
  import Panel from "$components/ui/Panel.svelte";
  import Shell from "$components/ui/Shell.svelte";
  import MediaDialog from "$components/MediaDialog.svelte";
  import Portrait from "$components/ui/Portrait.svelte";

  interface CharacterCreationData {
    name: string;
    level: number;
    backgroundUrl?: string;
    abilityScores: Record<string, number>;
    attributes: AttributeSpec[];
    sources: string[];
    imageUrl?: string;
    suggestedClass?: string;
    suggestedRace?: string;
    systems: string[];
    overlay: RuleSystemOverlay | null;
    campaignId?: string;
  }

  const KINDS: Record<Source['kind'], string> = {
    pdf: 'PDF',
    json: 'JSON',
    text: 'Text',
    image: 'Image'
  };

  let creationData = $state<CharacterCreationData>({
    name: '',
    level: 1,
    abilityScores: {},
    attributes: [],
    sources: [],
    systems: [],
    overlay: null,
    campaignId: new URLSearchParams($resolvedRoute.search).get('campaign') ?? undefined
  });

  let adding = $state(false);
  let newTitle = $state('');
  let newShort = $state('');
  let systems = $state<RuleSystem[]>([]);
  let chosen = $state<RuleSystem | null>(null);

  onMount(async () => {
    try {
      systems = await getSystems();
    } catch (reason) {
      error = reason instanceof Error ? reason.message : String(reason);
      return;
    }

    if (systems[0]) putSystem(systems[0].id);
  });

  function getOwnAttributes(): AttributeSpec[] {
    return creationData.attributes.filter((spec) => !chosen?.attributes.some((entry) => entry.id === spec.id));
  }

  function putSystem(id: string) {
    const next = systems.find((entry) => entry.id === id);
    if (!next) return;

    const own = getOwnAttributes().filter((spec) => !next.attributes.some((entry) => entry.id === spec.id));
    const scores = creationData.abilityScores;

    creationData.attributes = [...next.attributes, ...own];
    creationData.abilityScores = Object.fromEntries(
      creationData.attributes.map((spec) => [spec.id, scores[spec.id] ?? spec.default])
    );
    chosen = next;
  }

  function postAttribute(spec: AttributeSpec) {
    if (creationData.attributes.some((held) => held.id === spec.id)) return;
    creationData.attributes.push(spec);
    creationData.abilityScores[spec.id] = spec.default;
  }

  function removeAttribute(id: string) {
    creationData.attributes = creationData.attributes.filter((spec) => spec.id !== id);
    delete creationData.abilityScores[id];
  }

  function postOwnAttribute() {
    const title = newTitle.trim();
    if (!title) return;

    const id = title.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 12);
    if (!id || creationData.attributes.some((spec) => spec.id === id)) {
      error = `${title} is already on the sheet, or its name carries no letters.`;
      return;
    }

    postAttribute({
      id,
      title,
      short: (newShort.trim() || title.slice(0, 3)).toUpperCase(),
      default: 10,
      min: 1,
      max: 30,
      modifier: 'floor((score - 10) / 2)'
    });

    newTitle = '';
    newShort = '';
    adding = false;
    error = null;
  }

  let sources = $state<Source[]>([]);
  let reading = $state<string | null>(null);
  let importing = $state(false);
  let error = $state<string | null>(null);
  let word = $state<string | null>(null);
  let dragActive = $state(false);
  let portraitDragActive = $state(false);
  let portraitOpen = $state(false);
  let backgroundDragActive = $state(false);

  let canContinue = $derived(creationData.name.trim().length > 0 && Boolean(chosen));
  let busy = $derived(Boolean(reading) || importing);

  function modifier(spec: AttributeSpec, score: number): string {
    const value = getExpressionValue(spec.modifier, { score });
    return value >= 0 ? `+${value}` : String(value);
  }

  function drag(event: DragEvent, active: boolean): boolean {
    event.preventDefault();
    return active;
  }

  async function postSources(files: File[]) {
    error = null;
    word = null;

    for (const file of files) {
      reading = file.name;
      try {
        sources.push(await getSource(file));
      } catch (reason) {
        error = reason instanceof Error ? reason.message : String(reason);
      }
    }

    reading = null;
    if (!error && sources.length > 0) word = `${sources.length} source${sources.length === 1 ? '' : 's'} read.`;
  }

  async function handleSourceDrop(event: DragEvent) {
    event.preventDefault();
    dragActive = false;
    const files = event.dataTransfer?.files;
    if (files) await postSources(Array.from(files));
  }

  async function handleSourceInput(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    if (input.files) await postSources(Array.from(input.files));
    input.value = '';
  }

  function removeSource(index: number) {
    sources.splice(index, 1);
  }

  async function postCharacterReading() {
    if (sources.length === 0) return;

    importing = true;
    error = null;
    word = null;

    try {
      const found = await aiService.postCharacterImport(sources.map((entry) => entry.text));

      if (found.name) creationData.name = found.name;
      if (found.level) creationData.level = found.level;
      if (found.class) creationData.suggestedClass = found.class;
      if (found.race) creationData.suggestedRace = found.race;

      for (const spec of creationData.attributes) {
        const score = found.abilityScores?.[spec.id] ?? found.abilityScores?.[spec.title.toLowerCase()];
        if (typeof score === 'number') creationData.abilityScores[spec.id] = score;
      }

      word = found.name
        ? `Read ${found.name}${found.class ? `, ${found.class}` : ''} from your sources.`
        : 'Read what the sources hold. Check the fields before you continue.';
    } catch (reason) {
      error = reason instanceof Error ? reason.message : String(reason);
    } finally {
      importing = false;
    }
  }

  async function postPortrait(files: File[]) {
    const file = files.find((entry) => entry.type.startsWith('image/'));
    if (!file) return;

    error = null;

    try {
      creationData.imageUrl = (await postFile(file, { kind: 'user' })).url;
    } catch (reason) {
      error = reason instanceof Error ? reason.message : String(reason);
    }
  }

  async function handlePortraitDrop(event: DragEvent) {
    event.preventDefault();
    portraitDragActive = false;
    const files = event.dataTransfer?.files;
    if (files) await postPortrait(Array.from(files));
  }

  async function postBackground(files: File[]) {
    const file = files.find((entry) => entry.type.startsWith('image/') || entry.type.startsWith('video/'));
    if (!file) return;

    error = null;

    try {
      creationData.backgroundUrl = (await postFile(file, { kind: 'user' })).url;
    } catch (reason) {
      error = reason instanceof Error ? reason.message : String(reason);
    }
  }

  async function handleBackgroundDrop(event: DragEvent) {
    event.preventDefault();
    backgroundDragActive = false;
    const files = event.dataTransfer?.files;
    if (files) await postBackground(Array.from(files));
  }

  async function handleBackgroundInput(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    if (input.files) await postBackground(Array.from(input.files));
  }

  function putCreationData(data: unknown): boolean {
    try {
      sessionStorage.setItem('characterCreationData', JSON.stringify(data));
      return true;
    } catch {
      error = 'Your source material is too large to carry to the next step. Remove a source and try again.';
      return false;
    }
  }

  function continueToClass() {
    if (!canContinue || !chosen) {
      error = chosen ? 'Your character needs a name.' : 'Choose the rules your character plays by.';
      return;
    }

    const own = getOwnAttributes();

    creationData.sources = sources.map((entry) => entry.text);
    creationData.systems = [chosen.id];
    creationData.overlay = own.length > 0
      ? { id: 'own', title: `${creationData.name.trim()}, own rules`, version: '1.0.0', attributes: own }
      : null;

    if (!putCreationData(creationData)) return;
    navigate('/main/create/character/class');
  }
</script>

<Shell drawers title="New Character" width="narrow" back={() => navigate(creationData.campaignId ? `/main/campaign/${creationData.campaignId}` : '/main')}>
  <header class="make-crown">
    <span class="make-crest"><Ornament name="forge" size="lg" tone="metal" /></span>
    <h1 class="dnd-heading dnd-heading-hero make-name">Forge a Character</h1>
  </header>

  <Panel title="The character">
    <div class="make-top">
      <button
        type="button"
        class="make-drop make-face"
        class:make-drop-live={portraitDragActive}
        aria-label="Character image"
        ondragover={(event) => (portraitDragActive = drag(event, true))}
        ondragleave={() => (portraitDragActive = false)}
        ondrop={handlePortraitDrop}
        onclick={() => (portraitOpen = true)}
      >
        {#if creationData.imageUrl}
          <span class="make-face-glass"><Portrait src={creationData.imageUrl} alt="Character" size="fill" /></span>
        {:else}
          <span class="dnd-empty-mark"><Ornament name="portrait" size="sm" tone="metal" /></span>
          <span class="make-drop-note">Drop a portrait, or pick one</span>
        {/if}
      </button>

      <div class="make-lines">
        <Field label="Character name" id="character-name" required>
          <input id="character-name" type="text" bind:value={creationData.name} placeholder="Enter character name" />
        </Field>

        <Field label="Starting level" id="character-level">
          <input id="character-level" type="number" min="1" max="20" bind:value={creationData.level} />
        </Field>

        <Field label="Rule system" id="character-system" help={chosen?.description}>
          <select
            id="character-system"
            value={chosen?.id}
            disabled={systems.length === 0}
            onchange={(event) => putSystem(event.currentTarget.value)}
          >
            {#each systems as system (system.id)}
              <option value={system.id}>{system.title}</option>
            {/each}
          </select>
        </Field>
      </div>
    </div>
  </Panel>

  <Panel title="Source material">
    {#if !$hasReplicateKey}
      <div class="make-gate">
        <p class="make-gate-text">
          Reading source material runs on Replicate, and your account carries no key yet. Add one on your profile
          and it stays on your own user document.
        </p>
        <Button variant="secondary" size="sm" onclick={() => navigate('/main/user')}>Add a Replicate key</Button>
      </div>
    {:else}
      <div
        class="make-drop make-band"
        class:make-drop-live={dragActive}
        role="region"
        aria-label="Source material drop zone"
        ondragover={(event) => (dragActive = drag(event, true))}
        ondragleave={() => (dragActive = false)}
        ondrop={handleSourceDrop}
      >
        <p class="make-drop-note">Drop source material here, or pick it</p>
        <p class="make-drop-help">
          A PDF, a JSON or Markdown export, a class guide, or a screenshot of a D&amp;D Beyond sheet.
        </p>
        <input
          class="make-drop-input"
          type="file"
          multiple
          accept={SOURCE_ACCEPT}
          aria-label="Source material"
          disabled={busy}
          onchange={handleSourceInput}
        />
      </div>

      {#if reading}
        <p class="make-reading"><span class="dnd-spinner make-reading-mark"></span>Reading {reading}…</p>
      {/if}

      {#if sources.length > 0}
        <ul class="make-sources">
          {#each sources as source, index (source.name + index)}
            <li class="make-source">
              <span class="make-source-kind">{KINDS[source.kind]}</span>
              <span class="make-source-name">{source.name}</span>
              <span class="make-source-size">{source.text.length.toLocaleString()} characters</span>
              <Button variant="ghost" size="sm" onclick={() => removeSource(index)}>Remove</Button>
            </li>
          {/each}
        </ul>

        <Button variant="secondary" loading={importing} disabled={busy} onclick={postCharacterReading}>
          Read the character from these
        </Button>
      {/if}
    {/if}
  </Panel>

  <Panel title="Ability scores">
    <div class="make-scores">
      {#each creationData.attributes as spec (spec.id)}
        <div class="make-score">
          <label class="dnd-caption make-score-label" for="score-{spec.id}" title={spec.title}>{spec.short}</label>
          <input
            id="score-{spec.id}"
            class="dnd-num"
            type="number"
            min={spec.min}
            max={spec.max}
            bind:value={creationData.abilityScores[spec.id]}
          />
          <span class="make-score-mod">{modifier(spec, creationData.abilityScores[spec.id])}</span>
          <button
            type="button"
            class="make-score-drop"
            title="Drop {spec.title}"
            aria-label="Drop {spec.title}"
            onclick={() => removeAttribute(spec.id)}
          ><Glyph name="close" size="sm" /></button>
        </div>
      {/each}
    </div>

    {#if adding}
      <div class="make-own">
        <Field label="Ability name" id="own-title">
          <input id="own-title" type="text" bind:value={newTitle} placeholder="Grit" />
        </Field>

        <Field label="Short" id="own-short" help="Three letters read best on the sheet.">
          <input id="own-short" type="text" maxlength="4" bind:value={newShort} placeholder="GRT" />
        </Field>

        <div class="make-own-acts">
          <Button variant="secondary" size="sm" onclick={() => (adding = false)}>Cancel</Button>
          <Button variant="primary" size="sm" disabled={!newTitle.trim()} onclick={postOwnAttribute}>Add</Button>
        </div>
      </div>
    {/if}

    {#snippet actions()}
      <IconBtn title="Add an ability" active={adding} onclick={() => (adding = !adding)}><Glyph name="add" size="sm" /></IconBtn>
    {/snippet}
  </Panel>

  <Panel title="Background">
    <Field label="Image or video URL" id="character-background" help="Shown behind the sheet on the character page.">
      <input id="character-background" type="url" bind:value={creationData.backgroundUrl} placeholder="https://" />
    </Field>

    <div
      class="make-drop make-band"
      class:make-drop-live={backgroundDragActive}
      role="region"
      aria-label="Background image drop zone"
      ondragover={(event) => (backgroundDragActive = drag(event, true))}
      ondragleave={() => (backgroundDragActive = false)}
      ondrop={handleBackgroundDrop}
    >
      <p class="make-drop-note">Drop an image or a video, or pick one</p>
      <input
        class="make-drop-input"
        type="file"
        accept="image/*,video/*"
        aria-label="Background file"
        onchange={handleBackgroundInput}
      />
    </div>
  </Panel>

  {#if error}
    <p class="make-alarm" role="alert">{error}</p>
  {:else if word}
    <p class="make-word" role="status">{word}</p>
  {/if}

  <div class="make-acts">
    <Button variant="secondary" onclick={() => navigate('/main')}>Cancel</Button>
    <Button variant="primary" loading={busy} disabled={!canContinue} onclick={continueToClass}>Continue</Button>
  </div>
</Shell>

{#if portraitOpen}
  <MediaDialog
    kind="image"
    current={creationData.imageUrl}
    getAssets={(query, kind) => getAssets(query, kind, { kind: 'user' })}
    uploadFile={(file) => postFile(file, { kind: 'user' })}
    onclose={(asset) => {
      if (asset) creationData.imageUrl = asset.url;
      portraitOpen = false;
    }}
  />
{/if}

<style>
  .make-crown {
    --make-crest-lift: drop-shadow(0 var(--space-1) var(--space-3) var(--shade-hard));
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-2);
    min-width: 0;
    text-align: center;
  }

  .make-crest {
    position: relative;
    isolation: isolate;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: var(--space-4) var(--space-4) var(--space-5);
    filter: var(--make-crest-lift);
  }

  .make-name {
    font-size: var(--text-2xl);
    color: var(--metal-bright);
    text-shadow: 0 0.125rem 0 var(--ground-deep), 0 0 0.875rem var(--ember-glow), 0 0 2rem color-mix(in srgb, var(--ember-glow) 55%, transparent);
  }

  .make-top {
    --make-portrait-col: calc(var(--space-8) * 3);
    display: grid;
    grid-template-columns: minmax(0, var(--make-portrait-col)) minmax(0, 1fr);
    gap: var(--space-4);
    align-items: stretch;
  }

  .make-lines {
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    gap: var(--space-3);
    align-self: stretch;
  }

  .make-drop {
    --make-drop-sink: inset 0 var(--border-width) var(--space-3) var(--shade-hard);
    --make-band-h: calc(var(--space-8) + var(--space-7));
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--space-2);
    padding: var(--space-4);
    min-width: 0;
    overflow: hidden;
    border: var(--border-width) dashed var(--metal-dim);
    border-radius: var(--radius-sm);
    background: var(--texture-noise), linear-gradient(180deg, var(--ground-deep) 0%, var(--ground) 100%);
    box-shadow: var(--make-drop-sink);
    text-align: center;
    transition: border-color 0.15s ease, box-shadow 0.15s ease;
  }

  .make-drop-live {
    border-color: var(--metal);
    box-shadow: var(--make-drop-sink), var(--glow-metal), inset 0 0 2rem -0.5rem var(--ember-glow);
  }

  .make-drop-live .make-drop-note {
    color: var(--metal-bright);
    text-shadow: var(--glow-text);
  }

  .make-drop:focus-within {
    border-color: var(--metal);
    box-shadow: var(--focus-ring);
  }

  .make-band {
    min-height: var(--make-band-h);
  }

  .make-face {
    width: 100%;
    font: inherit;
    color: inherit;
    cursor: pointer;
  }

  .make-face-glass {
    position: absolute;
    inset: 0;
    display: block;
  }

  .make-face-glass :global(img) {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .make-drop-note {
    margin: 0;
    font-family: var(--font-display);
    font-size: var(--text-sm);
    color: var(--ink-dim);
    letter-spacing: var(--tracking-wide);
    text-shadow: 0 0.0625rem 0 var(--ground-deep);
  }

  .make-drop-help {
    max-width: 46ch;
    margin: 0;
    font-size: var(--text-xs);
    color: var(--ink-faint);
  }

  .make-drop-input {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    opacity: 0;
    cursor: pointer;
  }

  .make-drop-input:disabled {
    cursor: progress;
  }

  .make-gate {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-4);
    padding: var(--space-4);
    border: var(--border-hair) solid color-mix(in srgb, var(--state-warn) 55%, transparent);
    border-radius: var(--radius-sm);
    background: linear-gradient(180deg, color-mix(in srgb, var(--state-warn) 14%, transparent), transparent), var(--texture-noise), var(--ground-deep);
    box-shadow: var(--bevel-down);
  }

  .make-gate-text {
    flex: 1;
    min-width: 0;
    margin: 0;
    font-size: var(--text-sm);
    color: var(--ink);
  }

  .make-reading {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    margin: 0;
    font-size: var(--text-sm);
    color: var(--ink-dim);
  }

  .make-reading-mark {
    width: var(--space-4);
    height: var(--space-4);
    flex: none;
  }

  .make-scores {
    --make-score-col: calc(var(--space-7) * 2);
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(var(--make-score-col), 100%), 1fr));
    gap: var(--space-3);
    min-width: 0;
  }

  .make-own {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-end;
    gap: var(--space-3);
    padding: var(--space-4);
    border: none;
    border-radius: var(--radius-sm);
    background: var(--texture-noise), linear-gradient(180deg, var(--ground-raised) 0%, var(--ground-deep) 100%);
    box-shadow: var(--rim-thin), inset 0 0 1rem 0.125rem var(--shade-hard);
  }

  .make-own-acts {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
    margin-inline-start: auto;
  }

  .make-score-drop {
    position: absolute;
    top: var(--make-drop-out);
    right: var(--make-drop-out);
    display: flex;
    align-items: center;
    justify-content: center;
    width: var(--make-drop-d);
    height: var(--make-drop-d);
    padding: 0;
    border: var(--border-hair) solid var(--metal-dim);
    border-radius: var(--radius-pill);
    background: radial-gradient(circle at 38% 26%, var(--ground-lift) 0%, var(--ground-deep) 84%);
    box-shadow: 0 var(--border-width) var(--space-2) var(--shade-hard);
    color: var(--ink-faint);
    cursor: pointer;
    opacity: 0;
    transform: scale(0.7);
    transition: opacity 0.15s ease, transform 0.15s ease, color 0.15s ease, border-color 0.15s ease;
  }

  .make-score:hover .make-score-drop,
  .make-score-drop:focus-visible {
    opacity: 1;
    transform: scale(1);
  }

  .make-score-drop:hover {
    border-color: var(--state-bad);
    color: var(--state-bad);
    box-shadow: 0 0 var(--space-3) color-mix(in srgb, var(--state-bad) 45%, transparent);
  }

  .make-score-drop:focus-visible {
    outline: none;
    box-shadow: var(--focus-ring);
  }

  .make-score {
    --make-drop-d: var(--space-5);
    --make-drop-out: calc(var(--space-2) * -1);
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-4) var(--space-3) var(--space-3);
    min-width: 0;
    border: none;
    border-radius: 50% 50% var(--radius-lg) var(--radius-lg) / var(--radius-xl) var(--radius-xl) var(--radius-lg) var(--radius-lg);
    background:
      radial-gradient(ellipse 90% 55% at 50% 0%, color-mix(in srgb, var(--ember) 8%, transparent) 0%, transparent 70%),
      var(--texture-noise),
      linear-gradient(180deg, var(--ground-raised) 0%, var(--ground-deep) 100%);
    box-shadow: var(--rim-thin), inset 0 0 1rem 0.125rem var(--shade-hard), var(--shadow-sm);
  }

  .make-score-label {
    margin: 0;
  }

  .make-score-mod {
    font-family: var(--font-figures);
    font-size: var(--text-sm);
    font-weight: 700;
    font-variant-numeric: lining-nums tabular-nums;
    color: var(--metal);
    text-shadow: 0 0.0625rem 0 var(--ground-deep);
  }

  .make-sources {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .make-source {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-2) var(--space-3);
    border: var(--border-hair) solid var(--metal-dim);
    border-radius: var(--radius-sm);
    background: var(--texture-noise), linear-gradient(180deg, var(--ground-deep) 0%, var(--ground) 100%);
    box-shadow: var(--bevel-down);
  }

  .make-source-kind {
    flex: none;
    padding: var(--space-1) var(--space-2);
    border-radius: var(--radius-sm);
    background:
      linear-gradient(180deg, color-mix(in srgb, var(--stone-light) 20%, transparent) 0%, color-mix(in srgb, var(--ground-deep) 45%, transparent) 60%, color-mix(in srgb, var(--ground-deep) 65%, transparent) 100%),
      var(--texture-noise),
      var(--stone);
    box-shadow: var(--bevel-up), inset 0 0 0 0.0625rem var(--ground-deep);
    font-family: var(--font-display);
    font-size: var(--text-xs);
    letter-spacing: var(--tracking-caps);
    text-transform: uppercase;
    color: var(--metal);
    text-shadow: 0 0.0625rem 0 var(--ground-deep);
  }

  .make-source-name {
    flex: 1;
    min-width: 0;
    font-size: var(--text-sm);
    color: var(--ink);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .make-source-size {
    flex: none;
    font-family: var(--font-figures);
    font-variant-numeric: lining-nums tabular-nums;
    font-size: var(--text-xs);
    color: var(--ink-faint);
  }

  .make-word,
  .make-alarm {
    margin: 0;
    padding: var(--space-3) var(--space-4);
    border: var(--border-hair) solid transparent;
    border-radius: var(--radius-sm);
    box-shadow: var(--bevel-down);
    font-size: var(--text-sm);
    color: var(--ink);
  }

  .make-alarm {
    border-color: color-mix(in srgb, var(--state-bad) 55%, transparent);
    background: color-mix(in srgb, var(--state-bad) 18%, transparent);
  }

  .make-word {
    border-color: color-mix(in srgb, var(--state-good) 55%, transparent);
    background: color-mix(in srgb, var(--state-good) 18%, transparent);
  }

  .make-acts {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: var(--space-3);
  }

  @media (max-width: 720px) {
    .make-top {
      grid-template-columns: 1fr;
    }

    .make-source {
      flex-wrap: wrap;
    }
  }
</style>
