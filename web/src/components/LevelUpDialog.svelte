<script lang="ts">
  import { onMount } from 'svelte';
  import type { Character, LevelUpData } from '$lib/character.types';
  import { getCharacterStore } from '$lib/engine';
  import { getCurrentCharacter } from '$lib/chat';
  import { getLevelledCharacter } from '$lib/dialogs/levelUp';
  import { getAttributeId } from '$lib/rules/sheet';
  import { getSystemStack } from '$lib/rules/system';
  import type { RuleSystem } from '$lib/rules/spec.types';
  import BaseDialog from './BaseDialog.svelte';
  import Button from '$components/ui/Button.svelte';
  import Ornament from '$components/ui/Ornament.svelte';
  import Stat from '$components/ui/Stat.svelte';

  let { isOpen = $bindable(false), levelUpData = $bindable(), onComplete }: {
    isOpen: boolean;
    levelUpData?: LevelUpData;
    onComplete?: () => void;
  } = $props();

  const { info, abilities, feats } = getCharacterStore();
  const character: Character | null = getCurrentCharacter();

  let system = $state<RuleSystem | null>(null);
  let picks = $state<string[][]>([]);
  let errors = $state<string[]>([]);

  const levelled = $derived(
    system && character && levelUpData ? getLevelledCharacter(character, system, levelUpData, picks) : null
  );
  const hitPointGain = $derived(levelled && character ? levelled.info.hp.max - character.info.hp.max : 0);
  const cap = $derived(system?.advancement?.improvement.cap ?? 0);

  onMount(() => {
    if (!character) return;

    getSystemStack(character.systems, character.overlay ?? undefined)
      .then((loaded) => (system = loaded))
      .catch((reason) => (errors = [reason instanceof Error ? reason.message : String(reason)]));
  });

  function closeDialog() {
    isOpen = false;
    picks = [];
    errors = [];
    onComplete?.();
  }

  function getTitle(id: string): string {
    return system?.attributes.find((attribute) => attribute.id === id)?.title ?? id;
  }

  function getScore(id: string): number {
    const held = character?.abilities.find((ability) => getAttributeId(ability.title) === id);
    return held?.score ?? system?.attributes.find((attribute) => attribute.id === id)?.default ?? 0;
  }

  function getCount(index: number, id: string): number {
    return (picks[index] ?? []).filter((picked) => picked === id).length;
  }

  function postPick(index: number, id: string) {
    const choice = levelUpData?.choices[index];
    const held = picks[index] ?? [];
    if (!choice || held.length >= choice.maxSelections) return;
    if (getScore(id) + getCount(index, id) >= cap) return;

    const next = [...picks];
    next[index] = [...held, id];
    picks = next;
  }

  function deletePicks(index: number) {
    const next = [...picks];
    next[index] = [];
    picks = next;
  }

  function validateSelections(): boolean {
    errors = [];

    if (!levelUpData) return false;

    levelUpData.choices.forEach((choice, index) => {
      if ((picks[index] ?? []).length < choice.maxSelections) {
        errors.push(`${choice.title}: spend all ${choice.maxSelections} points`);
      }
    });

    return errors.length === 0;
  }

  function confirmLevelUp() {
    if (!validateSelections() || !levelUpData || !levelled) return;

    info.set(levelled.info);
    abilities.set(levelled.abilities);
    feats.set(levelled.feats);

    const level = levelUpData.level;
    closeDialog();

    window.dispatchEvent(new CustomEvent('playLevelUp'));
    window.dispatchEvent(new CustomEvent('showFunnyText', {
      detail: { text: `Level ${level} achieved! Glory awaits!`, category: 'levelUp' }
    }));
    window.dispatchEvent(new CustomEvent('showLevelUpAnimation', { detail: { level } }));
  }
</script>


{#if levelUpData}
  <BaseDialog
    isOpen={isOpen}
    onClose={closeDialog}
    title="Level Up to {levelUpData.level}!"
    width="700px"
    maxWidth="95vw"
    maxHeight="90vh"
    zIndex={9999}
  >
    <div class="ledger">
      <section class="gains">
        <div class="gain">
          <span class="gain-label">Hit Die</span>
          <span class="gain-value">+1d{levelUpData.hitDiceGain.die}</span>
        </div>
        <div class="gain">
          <span class="gain-label">Hit Points</span>
          <span class="gain-value">+{hitPointGain}</span>
        </div>
        <div class="gain">
          <span class="gain-label">Proficiency Bonus</span>
          <span class="gain-value">+{levelUpData.proficiencyBonus}</span>
        </div>
      </section>

      {#if levelUpData.spellSlotChanges}
        <section class="ward">
          <h3 class="ward-title">
            <span class="ward-mark"><Ornament name="quatrefoil" size="xs" tone="metal" /></span>
            Spell Slots at Level {levelUpData.level}
          </h3>
          <div class="slots">
            {#each Object.entries(levelUpData.spellSlotChanges) as [level, slots]}
              <div class="slot">
                <span class="slot-level">{level}{level === '1' ? 'st' : level === '2' ? 'nd' : level === '3' ? 'rd' : 'th'} Level</span>
                <span class="slot-count">{slots} slots</span>
              </div>
            {/each}
          </div>
        </section>
      {/if}

      {#if levelUpData.newFeatures.length > 0}
        <section class="ward ward-boon">
          <h3 class="ward-title">
            <span class="ward-mark"><Ornament name="rosette" size="xs" tone="verdigris" /></span>
            New Features Gained
          </h3>
          <ul class="boons">
            {#each levelUpData.newFeatures as feature}
              <li class="boon">
                <strong class="boon-name">{feature.title}</strong>
                <p class="boon-note">{feature.description}</p>
              </li>
            {/each}
          </ul>
        </section>
      {/if}

      {#if levelUpData.choices.length > 0}
        <section class="ward">
          <h3 class="ward-title">
            <span class="ward-mark"><Ornament name="rune" size="xs" tone="metal" /></span>
            Make Your Choices
          </h3>

          {#each levelUpData.choices as choice, index}
            <div class="choice">
              <div class="choice-head">
                <h4 class="choice-title">{choice.title}</h4>
                <span class="choice-count">{(picks[index] ?? []).length} / {choice.maxSelections}</span>
              </div>
              <p class="choice-note">{choice.description}</p>

              <div class="raise">
                {#each choice.options as id (id)}
                  <Stat
                    label={getTitle(id)}
                    value={getScore(id) + getCount(index, id)}
                    score={getCount(index, id) > 0 ? `+${getCount(index, id)}` : undefined}
                    lit={getCount(index, id) > 0}
                    title="Raise {getTitle(id)} by one"
                    onclick={() => postPick(index, id)}
                  />
                {/each}
              </div>

              <div class="choice-acts">
                <Button variant="ghost" size="sm" disabled={(picks[index] ?? []).length === 0} onclick={() => deletePicks(index)}>
                  Clear
                </Button>
              </div>
            </div>
          {/each}
        </section>
      {/if}

      {#if errors.length > 0}
        <section class="ward ward-bane" role="alert">
          <h3 class="ward-title">Please complete the following</h3>
          <ul class="banes">
            {#each errors as error}
              <li>{error}</li>
            {/each}
          </ul>
        </section>
      {/if}

      <span class="key">
        <Ornament name="divider" tone="metal" />
      </span>

      <footer class="actions">
        <Button variant="ghost" onclick={closeDialog}>Cancel</Button>
        <Button variant="primary" disabled={!levelled} onclick={confirmLevelUp}>Level Up!</Button>
      </footer>
    </div>
  </BaseDialog>
{/if}

<style>
  .ledger {
    display: flex;
    flex-direction: column;
    gap: var(--space-5);
    padding: var(--space-5) var(--space-6) var(--space-6);
  }

  .gains {
    display: flex;
    gap: var(--space-6);
    justify-content: center;
    padding: var(--space-4);
    background: var(--texture-noise), linear-gradient(180deg, var(--ground-deep) 0%, var(--ground) 100%);
    border: none;
    border-radius: var(--radius-sm);
    box-shadow: var(--rim-thin), var(--bevel-down), inset 0 0 16px 2px var(--shade-hard);
  }

  .gain {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-1);
  }

  .gain-label {
    font-family: var(--font-display);
    font-size: var(--text-xs);
    font-weight: 700;
    letter-spacing: var(--tracking-caps);
    text-transform: uppercase;
    color: var(--metal);
    text-shadow: 0 1px 0 var(--shadow-ink);
  }

  .gain-value {
    font-family: var(--font-figures);
    font-size: var(--text-xl);
    font-weight: 700;
    font-variant-numeric: tabular-nums;
    color: var(--metal-bright);
    text-shadow: var(--glow-text);
  }

  .ward {
    --ward-rim: var(--rim-thin);
    position: relative;
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    padding: var(--space-4);
    background:
      var(--texture-noise),
      linear-gradient(180deg, var(--ground-raised) 0%, var(--ground-deep) 100%);
    border: none;
    border-radius: var(--radius-sm);
    box-shadow: var(--ward-rim), inset 0 0 16px 2px var(--shade-hard);
  }

  .ward-title {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    margin: calc(var(--space-4) * -1) calc(var(--space-4) * -1) 0;
    padding: var(--space-2) var(--space-4);
    background:
      linear-gradient(180deg, color-mix(in srgb, var(--stone-light) 20%, transparent) 0%, color-mix(in srgb, var(--shadow-ink) 45%, transparent) 60%, color-mix(in srgb, var(--shadow-ink) 65%, transparent) 100%),
      var(--texture-noise),
      var(--stone);
    box-shadow: var(--rim-thin), var(--bevel-up), 0 3px 6px var(--shade);
    font-family: var(--font-display);
    font-size: var(--text-md);
    font-weight: 700;
    letter-spacing: var(--tracking-caps);
    text-transform: uppercase;
    color: var(--metal);
    text-shadow: 0 1px 0 var(--shadow-ink), 0 0 2px var(--shadow-ink);
  }

  .ward-mark {
    display: flex;
    flex: none;
  }

  .ward-boon .ward-title {
    color: var(--metal-bright);
  }

  .ward-bane {
    --ward-rim:
      inset 0 0 0 1px var(--keyline),
      inset 0 0 0 2px var(--state-bad),
      inset 0 0 0 3px var(--keyline);
  }

  .ward-bane .ward-title {
    color: color-mix(in srgb, var(--state-bad) 45%, var(--ink));
  }

  .slots {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(8.75rem, 100%), 1fr));
    gap: var(--space-2);
  }

  .slot {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-3);
    background: var(--texture-noise), linear-gradient(180deg, var(--ground-deep) 0%, var(--ground) 100%);
    border: var(--border-hair) solid var(--metal-dim);
    border-radius: var(--radius-sm);
    box-shadow: var(--bevel-down);
  }

  .slot-level {
    font-size: var(--text-xs);
    color: var(--ink-dim);
  }

  .slot-count {
    font-family: var(--font-figures);
    font-weight: 700;
    color: var(--metal-bright);
    text-shadow: 0 1px 0 var(--shadow-ink);
  }

  .boons {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .boon {
    padding: var(--space-3);
    background: var(--texture-noise), linear-gradient(180deg, var(--ground-deep) 0%, var(--ground) 100%);
    border: none;
    border: var(--border-hair) solid var(--verdigris);
    border-radius: var(--radius-sm);
    box-shadow: var(--bevel-down), inset 0 0 0 1px color-mix(in srgb, var(--metal-dim) 55%, transparent);
  }

  .boon-name {
    display: block;
    margin-bottom: var(--space-1);
    font-family: var(--font-display);
    letter-spacing: var(--tracking-wide);
    color: var(--metal-bright);
    text-shadow: 0 1px 0 var(--shadow-ink);
  }

  .boon-note {
    margin: 0;
    color: var(--ink-dim);
    font-size: var(--text-sm);
    line-height: 1.4;
  }

  .choice {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    padding: var(--space-3);
    background: var(--texture-noise), linear-gradient(180deg, var(--ground-deep) 0%, var(--ground) 100%);
    border: var(--border-hair) solid var(--metal-dim);
    border-radius: var(--radius-sm);
    box-shadow: var(--bevel-down);
  }

  .choice-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: var(--space-3);
  }

  .choice-title {
    margin: 0;
    font-family: var(--font-display);
    font-size: var(--text-sm);
    font-weight: 700;
    letter-spacing: var(--tracking-caps);
    text-transform: uppercase;
    color: var(--metal);
    text-shadow: 0 1px 0 var(--shadow-ink);
  }

  .choice-count {
    font-family: var(--font-figures);
    font-size: var(--text-sm);
    font-weight: 700;
    color: var(--metal-bright);
  }

  .choice-note {
    margin: 0;
    color: var(--ink-dim);
    font-style: italic;
    font-size: var(--text-xs);
  }

  .raise {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(7rem, 100%), 1fr));
    gap: var(--space-2);
  }

  .choice-acts {
    display: flex;
    justify-content: flex-end;
  }

  .banes {
    margin: 0;
    padding-inline-start: var(--space-5);
    color: color-mix(in srgb, var(--state-bad) 45%, var(--ink));
    font-size: var(--text-sm);
  }

  .key {
    display: block;
    width: min(14rem, 60%);
    margin: 0 auto;
    opacity: 0.75;
    pointer-events: none;
  }

  .actions {
    display: flex;
    gap: var(--space-3);
    justify-content: flex-end;
  }

  @media (max-width: 640px) {
    .ledger {
      padding: var(--space-4);
    }

    .gains {
      flex-direction: column;
      gap: var(--space-3);
    }

    .raise {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .actions {
      flex-direction: column;
    }
  }
</style>
