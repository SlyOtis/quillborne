<script lang="ts">
  import { getTheme, setTheme } from "$lib/dialogs/theme";
  import Senses from "$character-sheet/Senses.svelte";
  import PlainBox from "$character-sheet/PlainBox.svelte";
  import Skills from "$character-sheet/Skills.svelte";
  import DefensesNConditions from "$character-sheet/DefensesNConditions.svelte";
  import Initiative from "$character-sheet/Initiative.svelte";
  import Inspiration from "$character-sheet/Inspiration.svelte";
  import SavingThrows from "$character-sheet/SavingThrows.svelte";
  import Abilities from "$character-sheet/Abilities.svelte";
  import Proficiencies from "$character-sheet/Proficiencies.svelte";
  import RulePanels from "$character-sheet/RulePanels.svelte";
  import HitPoints from "$character-sheet/HitPoints.svelte";
  import type {CharacterContext} from "$lib/types";
  import InventoryTab from "$character-sheet/main_tabs/InventoryTab.svelte";
  import FeaturesTab from "$character-sheet/main_tabs/FeaturesTab.svelte";
  import BackgroundTab from "$character-sheet/main_tabs/BackgroundTab.svelte";
  import MainTabs from "$character-sheet/main_tabs/MainTabs.svelte";
  import ActionsTab from "$character-sheet/main_tabs/ActionsTab.svelte";
  import SpellsTab from "$character-sheet/main_tabs/SpellsTab.svelte";
  import Special from "$character-sheet/Special.svelte";
  import Background from "$components/Background.svelte";
  import { applyStateToCharacter, characterWriteError, getCharacterStore, setCharacterReadOnly } from "$lib/engine";
  import { characterService, userService } from "$lib/firestore.service";
  import { getRulesStore } from "$lib/rules/store";
  import { setContext, onDestroy, onMount, untrack, type Snippet } from "svelte";
  import Fold from "$components/ui/Fold.svelte";
  import Overlay from "$components/Overlay.svelte";
  import { sidebarStore } from "$lib/navigation";
  import { uiStore, anyDialogOpen, menuView, soundBoard } from "$lib/stores/ui.store";
  import { navigate } from "sly-svelte-location-router";
  import Shell from "$components/ui/Shell.svelte";
  import Portrait, { type PortraitFrame } from "$components/ui/Portrait.svelte";
  import Sigil from "$components/ui/Sigil.svelte";
  import Glyph from "$components/ui/Glyph.svelte";
  import IconBtn from "$components/ui/IconBtn.svelte";
  import Field from "$components/ui/Field.svelte";
  import Button from "$components/ui/Button.svelte";
  import BaseDialog from "$components/BaseDialog.svelte";
  import { postUIAction } from "$lib/chat";
  import { postFile } from "$lib/storage.service";
  import { user, userProfile } from "$lib/stores/auth.store";
  import { currentCharacterId, getRecentCharacters } from "$lib/stores/character.store";

  const { route }: { route?: { params?: Record<string, string> } } = $props();
  const characterId = untrack(() => route?.params?.id) ?? "local";

  const {unsubscribe, ...chStore} = getCharacterStore(characterId)
  const unsubscribeSidebar = sidebarStore.subscribe(() => {});

  setContext<CharacterContext>('character', chStore);
  soundBoard.set(chStore.soundBoard);
  const rules = getRulesStore(chStore);
  setContext('rules', rules);
  setContext('sidebar', sidebarStore)
  setContext('dialogState', {
    get isAnyDialogOpen() {
      return $anyDialogOpen;
    },
    setDialogState: uiStore.setDialogState
  });

  const {info} = chStore;

  let loaded = $state(false);

  onMount(() => {
    setTheme(getTheme());

    characterService.getCharacter(characterId)
      .then((document) => {
        if (!document?.character) {
          navigate("/main");
          return;
        }

        setCharacterReadOnly(document.owner_id !== $user?.uid);
        applyStateToCharacter(document.character, true);
        ownerId = document.owner_id;
        currentCharacterId.set(characterId);
        userService.putRecentCharacters(getRecentCharacters($userProfile?.preferences?.recent_characters ?? [], characterId))
          .catch((reason) => characterWriteError.set(reason instanceof Error ? reason.message : String(reason)));
        if (document.owner_id === $user?.uid) {
          characterService.putPlayed(characterId)
            .catch((reason) => characterWriteError.set(reason instanceof Error ? reason.message : String(reason)));
        }
      })
      .catch(() => navigate("/main"))
      .finally(() => (loaded = true));
  });

  onDestroy(() => {
    currentCharacterId.set(null);
    soundBoard.set(null);
    unsubscribe();
    unsubscribeSidebar();
  });

  let ownerId = $state('')
  let naming = $state(false)
  let draftName = $state('')
  let nameInput = $state<HTMLInputElement>()
  let deleting = $state(false)
  let working = $state(false)

  const owned = $derived(Boolean(ownerId) && ownerId === $user?.uid)
  const reading = $derived(Boolean(ownerId) && !owned)

  const EDITS = 'input, select, textarea, [contenteditable="true"]'
  const BROWSE = '[role="tab"], [aria-expanded]'

  function still(node: HTMLElement, on: boolean) {
    const mark = () => {
      if (!on) return
      for (const one of node.querySelectorAll<HTMLElement>(EDITS)) {
        if (one instanceof HTMLSelectElement || (one instanceof HTMLInputElement && ['checkbox', 'radio', 'range', 'file'].includes(one.type))) one.disabled = true
        else if (one instanceof HTMLInputElement || one instanceof HTMLTextAreaElement) one.readOnly = true
        else one.contentEditable = 'false'
      }
    }
    const block = (event: Event) => {
      const target = event.target as HTMLElement
      if (!on || target.closest(BROWSE)) return
      if (!target.closest('button, [role="button"], label, input, select, textarea')) return
      event.preventDefault()
      event.stopPropagation()
    }
    const watch = new MutationObserver(mark)
    watch.observe(node, { childList: true, subtree: true })
    node.addEventListener('click', block, true)
    mark()

    return {
      update(next: boolean) {
        on = next
        mark()
      },
      destroy() {
        watch.disconnect()
        node.removeEventListener('click', block, true)
      }
    }
  }

  $effect(() => {
    if (naming) nameInput?.focus()
  })

  function openName() {
    draftName = $info.name
    naming = true
  }

  function putName() {
    const name = draftName.trim()
    naming = false
    if (!name || name === $info.name) return
    info.update((state) => ({...state, name}))
  }

  function keyName(event: KeyboardEvent) {
    if (event.key === 'Enter') putName()
    if (event.key !== 'Escape') return
    draftName = $info.name
    naming = false
  }

  function postCopy() {
    if (working) return
    working = true

    characterService.postCharacterCopy(characterId)
      .then((copyId) => window.location.assign(`/main/character/${copyId}`))
      .catch((reason) => characterWriteError.set(reason instanceof Error ? reason.message : String(reason)))
      .finally(() => (working = false))
  }

  function deleteCharacter() {
    if (working) return
    working = true

    characterService.deleteCharacter(characterId)
      .then(() => {
        deleting = false
        navigate('/main')
      })
      .catch((reason) => characterWriteError.set(reason instanceof Error ? reason.message : String(reason)))
      .finally(() => (working = false))
  }

  let portraitInput = $state<HTMLInputElement>()
  let room = $state(0)
  let shut = $state<Record<string, boolean>>({})

  const tight = $derived(room > 0 && room < 760)

  async function postPortrait(event: Event) {
    const input = event.currentTarget as HTMLInputElement
    const file = input.files?.[0]
    input.value = ''
    if (!file) return

    const { url: address } = await postFile(file, { kind: 'user' })
    info.update((state) => ({...state, imageUrl: address}))
  }

  const bespokeSlots = ['initiative', 'armorClass', 'speed', 'maxHitPoints']

  const slots = $derived($rules.resolved?.derived.filter((entry) => !bespokeSlots.includes(entry.id)) ?? [])

  let imageUrl = $derived.by(() => {
    if ($info.state?.image?.overlay === false) {
      return $info.state.image.url!!
    }

    for (let condition of $info.conditions) {
      if (condition?.image?.overlay === false) {
        return condition.image.url!!
      }
    }

    return $info.imageUrl
  })
</script>

<Overlay />

{#snippet saves()}<SavingThrows/>{/snippet}
{#snippet special()}<Special/>{/snippet}
{#snippet senses()}<Senses/>{/snippet}
{#snippet proficiencies()}<Proficiencies/>{/snippet}
{#snippet ruleBlocks()}<RulePanels skip={['abilities', 'defence', 'saves', 'senses']}/>{/snippet}
{#snippet defences()}
  <DefensesNConditions />
{/snippet}
{#snippet skills()}<Skills/>{/snippet}
{#snippet tabs()}
  <MainTabs initialTab="actionsTab">
    {#snippet actionsTab()}
      <ActionsTab/>
    {/snippet}
    {#snippet spellsTab()}
      <SpellsTab/>
    {/snippet}
    {#snippet inventoryTab()}
      <InventoryTab/>
    {/snippet}
    {#snippet featsTab()}
      <FeaturesTab/>
    {/snippet}
    {#snippet backgroundTab()}
      <BackgroundTab />
    {/snippet}
  </MainTabs>
{/snippet}

{#snippet group(id: string, title: string, body: Snippet)}
  {#if tight}
    <Fold {title} open={shut[id] !== true} ontoggle={() => (shut = { ...shut, [id]: shut[id] !== true })}>
      {@render body()}
    </Fold>
  {:else}
    {@render body()}
  {/if}
{/snippet}

<Shell
  title={$info.name || 'Character'}
  width="full"
  back={() => navigate('/main')}
  drawers
>
  {#snippet tools()}
    {#if owned}
      <Sigil title="Soundboard" size="sm" active={$menuView === 'soundboard'} onclick={uiStore.openSoundboard}>
        <Glyph name="sound" size="sm" />
      </Sigil>
    {/if}
    <Sigil title="Export this character" size="sm" onclick={() => postUIAction('exportCharacter')}>
      <Glyph name="export" size="sm" />
    </Sigil>
    {#if owned}
      <Sigil title="Level up" size="sm" onclick={() => postUIAction('openLevelUpDialog')}>
        <Glyph name="levelup" size="sm" />
      </Sigil>
      <Sigil title="Import sources" size="sm" onclick={() => postUIAction('openSourceImport')}>
        <Glyph name="sources" size="sm" />
      </Sigil>
    {/if}
    <Sigil title="Change theme" size="sm" onclick={() => postUIAction('openThemeDialog')}>
      <Glyph name="theme" size="sm" />
    </Sigil>
  {/snippet}

  {#snippet backdrop()}
    <Background />
  {/snippet}

  {#if loaded}
    <div class="sheet-band">
      <header class="sheet-crown">
        <button
          type="button"
          class="sheet-face"
          title={owned ? 'Choose the portrait picture' : $info.name || 'Character'}
          disabled={!owned}
          onclick={() => portraitInput?.click()}
        >
          <Portrait
            src={imageUrl}
            alt={$info.name || 'Character'}
            frame={($info.imageFrame as PortraitFrame) ?? 'lancet'}
            size="md"
          />
        </button>

        <span class="sheet-lines">
          {#if naming}
            <Field label="Name" id="character-name">
              <input
                id="character-name"
                type="text"
                bind:this={nameInput}
                bind:value={draftName}
                onkeydown={keyName}
                onblur={putName}
              />
            </Field>
          {:else}
            <span class="sheet-title">
              <h1 class="dnd-heading sheet-name">{$info.name || 'Unnamed Character'}</h1>
              {#if owned}
                <IconBtn title="Rename this character" onclick={openName}>
                  <Glyph name="edit" size="sm" />
                </IconBtn>
              {/if}
            </span>
          {/if}
          <span class="sheet-meta">
            <span class="sheet-level">Level {$info.level || 1}</span>
            <span class="sheet-kin">{$info.class?.name || 'Unknown'} {$info.race?.name || 'Unknown'}</span>
          </span>
        </span>

        <span class="sheet-gear">
          {#if owned}
            <Sigil title="Choose the portrait frame" frame="ring" size="sm" onclick={() => postUIAction('openFrameDialog')}>
              <Glyph name="gear" size="sm" />
            </Sigil>
          {/if}
          <IconBtn title="Copy this character" disabled={working} onclick={postCopy}>
            <Glyph name="copy" size="sm" />
          </IconBtn>
          {#if owned}
            <IconBtn title="Delete this character" disabled={working} onclick={() => (deleting = true)}>
              <Glyph name="remove" size="sm" />
            </IconBtn>
          {/if}
        </span>

        <input
          bind:this={portraitInput}
          class="sheet-pick"
          type="file"
          accept="image/*"
          aria-label="Choose the portrait picture"
          onchange={postPortrait}
        />
      </header>

      <div class="sheet-still" class:sheet-still-on={reading} use:still={reading}>
        <HitPoints/>
      </div>
    </div>

    {#if reading}
      <p class="sheet-reading" role="status">Another player's character. You can read the sheet, but only they can change it.</p>
    {/if}

    {#if $characterWriteError}
      <p class="sheet-alarm" role="alert">{$characterWriteError}</p>
    {/if}

    <div class="sheet-still" class:sheet-still-on={reading} use:still={reading}>

    <div class="sheet-slots">
      <PlainBox value={$rules.resolved?.proficiency ?? $info.proficiencyBonus}
                title="Proficiency"
                subTitle="bonus"
                prefix="+"
      />
      <PlainBox bind:value={$info.speed}
                title="Walking"
                subTitle="speed"
      />
      <Inspiration />
      <Initiative bind:initiative={$info.initiative}/>
      <PlainBox bind:value={$info.ac}
                title="Armor"
                subTitle="class"
      />
      {#each slots as slot (slot.id)}
        <PlainBox value={slot.value} title={slot.title} subTitle={slot.unit}/>
      {/each}
    </div>

    <Abilities/>

    <div class="sheet-grid" bind:clientWidth={room}>
      <div class="sheet-column">
        {@render group('saves', 'Saving throws', saves)}
        {@render group('special', 'Special', special)}
        {@render group('senses', 'Senses', senses)}
        {@render group('proficiencies', 'Proficiencies', proficiencies)}
        {@render group('rules', 'Rules', ruleBlocks)}
        {@render group('defences', 'Defences and conditions', defences)}
      </div>

      {@render group('skills', 'Skills', skills)}

      <div class="sheet-tabs">
        {@render group('actions', 'Actions and inventory', tabs)}
      </div>
    </div>
    </div>
  {/if}
</Shell>

<BaseDialog isOpen={deleting} onClose={() => (deleting = false)} title="Delete {$info.name || 'this character'}?" width="32rem">
  <div class="sheet-doom">
    <p class="sheet-doom-note">
      The sheet and the source material stored with it are removed for good. A copy made earlier stays.
    </p>
    <div class="sheet-doom-acts">
      <Button variant="ghost" onclick={() => (deleting = false)}>Keep</Button>
      <Button variant="danger" loading={working} onclick={deleteCharacter}>Delete</Button>
    </div>
  </div>
</BaseDialog>

<style>
  .sheet-still {
    display: contents;
  }

  .sheet-still-on :global(:is(button, [role='button'], label, input, select, textarea):not([role='tab'], [aria-expanded])) {
    cursor: default;
  }

  .sheet-reading {
    margin: 0;
    padding: var(--space-3) var(--space-4);
    border-radius: var(--radius-sm);
    background: var(--texture-noise), var(--ground-deep);
    box-shadow: var(--bevel-down);
    font-size: var(--text-sm);
    color: var(--ink-dim);
  }

  .sheet-alarm {
    margin: 0;
    padding: var(--space-3) var(--space-4);
    border: var(--border-hair) solid color-mix(in srgb, var(--state-bad) 55%, transparent);
    border-radius: var(--radius-sm);
    background: linear-gradient(color-mix(in srgb, var(--state-bad) 18%, transparent), color-mix(in srgb, var(--state-bad) 18%, transparent)), var(--texture-noise), var(--ground-deep);
    box-shadow: var(--bevel-down);
    font-size: var(--text-sm);
    color: var(--ink);
  }

  .sheet-band {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 22rem);
    align-items: stretch;
    gap: var(--space-3);
    min-width: 0;
  }

  .sheet-crown {
    display: flex;
    align-items: center;
    min-width: 0;
    gap: var(--space-4);
    padding: var(--space-4) var(--space-5);
    background:
      radial-gradient(ellipse 45% 90% at 0% 50%, color-mix(in srgb, var(--ember) 16%, transparent) 0%, transparent 70%),
      linear-gradient(180deg, color-mix(in srgb, var(--ground-raised) 78%, transparent) 0%, color-mix(in srgb, var(--ground-deep) 90%, transparent) 100%),
      var(--texture-noise),
      var(--stone-dark);
    border: none;
    border-radius: var(--radius-lg);
    box-shadow: var(--rim), inset 0 0 28px 6px var(--shade-hard), var(--shadow-md);
  }

  .sheet-face {
    display: flex;
    flex: none;
    padding: 0;
    border: none;
    border-radius: var(--radius-md);
    background: none;
    cursor: pointer;
    filter: drop-shadow(0 0.25rem 0.6rem var(--shade-hard));
    transition: filter 0.18s ease;
  }

  .sheet-face:hover {
    filter: drop-shadow(0 0.25rem 0.6rem var(--shade-hard)) drop-shadow(0 0 0.6rem var(--ember-glow)) brightness(1.08);
  }

  .sheet-face:active {
    filter: drop-shadow(0 0.25rem 0.6rem var(--shade-hard)) brightness(0.85);
  }

  .sheet-face:focus-visible {
    outline: none;
    box-shadow: var(--focus-ring);
  }

  .sheet-lines {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: var(--space-1);
    min-width: 0;
  }

  .sheet-gear {
    display: flex;
    flex: none;
    align-items: center;
    align-self: flex-start;
    gap: var(--space-1);
  }

  .sheet-title {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    min-width: 0;
  }

  .sheet-doom {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    padding: var(--space-5);
  }

  .sheet-doom-note {
    margin: 0;
    font-size: var(--text-sm);
    color: var(--ink-dim);
  }

  .sheet-doom-acts {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-3);
  }

  .sheet-pick {
    display: none;
  }

  .sheet-name {
    margin: 0;
    font-family: var(--font-display);
    font-size: var(--text-2xl);
    font-weight: 700;
    letter-spacing: var(--tracking-wide);
    line-height: 1.1;
    color: var(--metal-bright);
    text-shadow: 0 1px 0 #000, 0 0 0.6rem var(--ember-glow), 0 0 1.4rem var(--ember-glow);
    min-width: 0;
    overflow-wrap: break-word;
  }

  .sheet-meta {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: var(--space-1) var(--space-4);
    padding-top: var(--space-2);
    border-top: var(--border-hair) solid color-mix(in srgb, var(--metal-dim) 70%, transparent);
    font-family: var(--font-display);
    font-size: var(--text-sm);
    letter-spacing: var(--tracking-wide);
    color: var(--ink-dim);
    text-shadow: 0 1px 0 #000;
  }

  .sheet-level {
    font-family: var(--font-figures);
    font-weight: 700;
    letter-spacing: var(--tracking-caps);
    text-transform: uppercase;
    color: var(--metal);
  }

  .sheet-kin {
    font-style: italic;
  }

  .sheet-slots {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(7rem, 1fr));
    align-items: stretch;
    gap: var(--space-3);
    min-width: 0;
  }

  .sheet-grid {
    display: grid;
    grid-template-columns: minmax(0, 0.8fr) minmax(0, 1.1fr) minmax(0, 2fr);
    align-items: start;
    gap: var(--space-3);
    min-width: 0;
  }

  .sheet-tabs {
    display: flex;
    flex-direction: column;
    align-self: stretch;
    min-width: 0;
    min-height: 0;
    contain: inline-size;
  }

  .sheet-column {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(14rem, 1fr));
    grid-auto-rows: min-content;
    align-items: stretch;
    gap: var(--space-3);
    min-width: 0;
  }

  @container page (max-width: 1200px) {
    .sheet-grid {
      grid-template-columns: minmax(0, 1fr) minmax(0, 1.6fr);
    }

    .sheet-tabs {
      grid-column: 1 / -1;
      min-height: 60vh;
    }
  }

  @container page (max-width: 760px) {
    .sheet-band,
    .sheet-grid {
      grid-template-columns: minmax(0, 1fr);
    }

    .sheet-crown {
      flex-wrap: wrap;
      padding: var(--space-3) var(--space-4);
    }

    .sheet-lines {
      order: 1;
      flex-basis: 100%;
    }

    .sheet-gear {
      margin-inline-start: auto;
    }
  }
</style>
