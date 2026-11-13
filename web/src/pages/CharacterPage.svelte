<script lang="ts">
  import * as api from '$lib/api'
  import { getCampaign, getCharacter, postCharacterCopy, postFile, putCharacterLayout, putCharacterPlayed, putProfileRecentCharacters } from '$lib/api'
  import type { Character } from '$lib/api/types'
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
  import Background from "$components/Background.svelte";
  import { applyStateToCharacter, characterWriteError, getCharacterStore, setCharacterReadOnly } from "$lib/engine";
  import { getRulesStore } from "$lib/rules/store";
  import { setContext, onDestroy, onMount, untrack, type Snippet } from "svelte";
  import Fold from "$components/ui/Fold.svelte";
  import DynamicGrid from "$components/ui/DynamicGrid.svelte";
  import type { DynamicGridItem, DynamicGridPlacement } from "$lib/dynamic-grid";
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
  import { user, userProfile } from "$lib/stores/auth.store";
  import { currentCharacterId, getRecentCharacters } from "$lib/stores/character.store";

  const { route }: { route?: { params?: Record<string, string> } } = $props();
  const characterId = untrack(() => route?.params?.id) ?? "local";

  let campaign = $state<{ id: string, name: string } | null>(null);
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
  let missing = $state("");

  onMount(() => {
    setTheme(getTheme());

    // Never navigate from here: while the next page loads, the router remounts this one with that page's params.
    getCharacter(characterId)
      .then((document) => {
        if (!document?.character) {
          missing = "That character does not exist, or it is not shared with you.";
          return;
        }

        setCharacterReadOnly(document.owner_id !== $user?.user_id);
        applyStateToCharacter(document.character, true);
        layout = document.metadata.layout ?? {};
        ownerId = document.owner_id;
        currentCharacterId.set(characterId);
        putProfileRecentCharacters(getRecentCharacters($userProfile?.preferences?.recent_characters ?? [], characterId))
          .catch((reason) => characterWriteError.set(reason instanceof Error ? reason.message : String(reason)));
        if (document.owner_id === $user?.user_id) {
          putCharacterPlayed(characterId)
            .catch((reason) => characterWriteError.set(reason instanceof Error ? reason.message : String(reason)));
        }

        if (document.campaign_id) {
          getCampaign(document.campaign_id)
            .then((found) => (campaign = found && { id: found.id, name: found.name }))
            .catch(() => (campaign = null));
        }
      })
      .catch((reason) => (missing = reason instanceof Error ? reason.message : String(reason)))
      .finally(() => (loaded = true));
  });

  function stepNumber(input: HTMLInputElement, delta: number) {
    const min = input.min === '' ? -Infinity : Number(input.min);
    const max = input.max === '' ? Infinity : Number(input.max);
    input.value = String(Math.min(max, Math.max(min, (Number(input.value) || 0) + delta)));
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function isNumberField(target: EventTarget | null): target is HTMLInputElement {
    return target instanceof HTMLInputElement && target.type === 'number' && target.classList.contains('dnd-num');
  }

  function wheelNumber(event: WheelEvent) {
    if (!isNumberField(event.target) || event.deltaY === 0) return;
    event.preventDefault();
    stepNumber(event.target, event.deltaY < 0 ? 1 : -1);
  }

  function keyNumber(event: KeyboardEvent) {
    if (!isNumberField(event.target)) return;
    if (event.key === 'ArrowRight') stepNumber(event.target, 1);
    else if (event.key === 'ArrowLeft') stepNumber(event.target, -1);
    else return;
    event.preventDefault();
  }

  $effect(() => {
    window.addEventListener('wheel', wheelNumber, { passive: false });
    window.addEventListener('keydown', keyNumber);
    return () => {
      window.removeEventListener('wheel', wheelNumber);
      window.removeEventListener('keydown', keyNumber);
    };
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

  const owned = $derived(Boolean(ownerId) && ownerId === $user?.user_id)
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

    postCharacterCopy(characterId)
      .then((copyId) => window.location.assign(`/main/character/${copyId}`))
      .catch((reason) => characterWriteError.set(reason instanceof Error ? reason.message : String(reason)))
      .finally(() => (working = false))
  }

  function deleteCharacter() {
    if (working) return
    working = true

    api.deleteCharacter(characterId)
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

  const sheetPlaces: DynamicGridItem[] = [
    { id: 'saves', x: 0, y: 0, w: 4, h: 9, minW: 2, minH: 3 },
    { id: 'senses', x: 4, y: 0, w: 4, h: 9, minW: 2, minH: 3 },
    { id: 'proficiencies', x: 8, y: 0, w: 4, h: 9, minW: 2, minH: 3 },
    { id: 'skills', x: 0, y: 9, w: 3, h: 22, minW: 2, minH: 6 },
    { id: 'actions', x: 3, y: 9, w: 9, h: 22, minW: 4, minH: 8 },
    { id: 'defences', x: 0, y: 31, w: 6, h: 9, minW: 3, minH: 3 },
    { id: 'rules', x: 6, y: 31, w: 6, h: 9, minW: 3, minH: 3 }
  ]
  let layout = $state<Record<string, { x: number; y: number; w: number; h: number }>>({})
  let arranging = $state(false)
  const rulePanels = $derived($rules.resolved?.panels.filter((panel) => !['abilities', 'defence', 'saves', 'senses'].includes(panel.id)) ?? [])
  const places = $derived(sheetPlaces.filter((place) => place.id !== 'rules' || rulePanels.length > 0).map((place) => ({ ...place, ...layout[place.id] })))

  function putLayout(placements: DynamicGridPlacement[]) {
    const next = { ...layout }
    for (const { id, x, y, w, h } of placements) next[id] = { x, y, w, h }
    layout = next
    putCharacterLayout(characterId, next)
      .catch((reason) => characterWriteError.set(reason instanceof Error ? reason.message : String(reason)))
  }

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
      <Sigil title="Lay out the sheet" size="sm" active={arranging} onclick={() => (arranging = !arranging)}>
        <Glyph name="blocks" size="sm" />
      </Sigil>
    {/if}
    <Sigil title="Change theme" size="sm" onclick={() => postUIAction('openThemeDialog')}>
      <Glyph name="theme" size="sm" />
    </Sigil>
  {/snippet}

  {#snippet backdrop()}
    <Background />
  {/snippet}

  {#if missing}
    <p class="sheet-alarm" role="alert">{missing}</p>
  {:else if loaded}
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
            size="sm"
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
            <span class="sheet-kin">{$info.race?.name || 'Unknown'} {$info.class?.name || 'Unknown'}</span>
          </span>
          {#if campaign}
            <a class="sheet-campaign" href="/main/campaign/{campaign.id}">
              <span class="sheet-campaign-word">Campaign</span>
              <span class="sheet-campaign-name">{campaign.name}</span>
            </a>
          {:else}
            <span class="sheet-campaign">
              <span class="sheet-campaign-word">Campaign</span>
              <span class="sheet-campaign-name">None</span>
            </span>
          {/if}
        </span>

        <span class="sheet-gear">
          {#if owned}
            <Sigil title="Choose the portrait frame" size="md" onclick={() => postUIAction('openFrameDialog')}>
              <Glyph name="gear" size="md" />
            </Sigil>
          {/if}
          <Sigil title="Copy this character" size="md" disabled={working} onclick={postCopy}>
            <Glyph name="copy" size="md" />
          </Sigil>
          {#if owned}
            <Sigil title="Delete this character" size="md" disabled={working} onclick={() => (deleting = true)}>
              <Glyph name="remove" size="md" />
            </Sigil>
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

    <div class="sheet-stats">
      <Abilities/>
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
    </div>

    <div class="sheet-grid" class:sheet-grid-arranging={arranging} bind:clientWidth={room}>
      <DynamicGrid
        items={places}
        columns={12}
        mode={arranging ? 'fixed' : 'flow'}
        minColWidth={60}
        rowHeight={24}
        margin={[12, 12]}
        padding={[0, 0]}
        draggable={arranging}
        resizable={arranging}
        onmove={putLayout}
        onresize={putLayout}
      >
        {#snippet item(placed)}
          {#if placed.id === 'saves'}
            {@render group('saves', 'Saving throws', saves)}
          {:else if placed.id === 'senses'}
            {@render group('senses', 'Senses', senses)}
          {:else if placed.id === 'proficiencies'}
            {@render group('proficiencies', 'Proficiencies', proficiencies)}
          {:else if placed.id === 'rules'}
            {@render group('rules', 'Rules', ruleBlocks)}
          {:else if placed.id === 'skills'}
            {@render group('skills', 'Skills', skills)}
          {:else if placed.id === 'defences'}
            {@render group('defences', 'Defences and conditions', defences)}
          {:else if placed.id === 'actions'}
            <div class="sheet-tabs">
              <div class="sheet-slots">
                <Initiative bind:initiative={$info.initiative}/>
                <PlainBox bind:value={$info.ac}
                          title="Armor"
                          subTitle="class"
                />
                {#each slots as slot (slot.id)}
                  <PlainBox value={slot.value} title={slot.title} subTitle={slot.unit}/>
                {/each}
              </div>
              {@render group('actions', 'Actions and inventory', tabs)}
            </div>
          {/if}
        {/snippet}
      </DynamicGrid>
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
    grid-template-columns: minmax(min(30rem, 100%), 1fr) minmax(0, 36rem);
    align-items: stretch;
    gap: var(--space-3);
    min-width: 0;
  }

  .sheet-crown {
    display: flex;
    align-items: center;
    min-width: 0;
    gap: var(--space-4);
    padding: var(--space-3) var(--space-4);
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
    gap: var(--space-2);
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

  .sheet-campaign {
    display: inline-flex;
    align-items: baseline;
    align-self: flex-start;
    gap: var(--space-2);
    min-width: 0;
    font-size: var(--text-xs);
    color: var(--ink-dim);
    text-decoration: none;
    text-shadow: 0 1px 0 #000;
  }

  .sheet-campaign-word {
    font-family: var(--font-display);
    font-weight: 700;
    letter-spacing: var(--tracking-caps);
    text-transform: uppercase;
    color: var(--metal);
  }

  .sheet-campaign-name {
    font-family: var(--font-display);
    letter-spacing: var(--tracking-wide);
    overflow-wrap: anywhere;
  }

  .sheet-campaign:hover .sheet-campaign-name {
    color: var(--metal-bright);
  }

  .sheet-campaign:focus-visible {
    outline: none;
    box-shadow: var(--focus-ring);
  }

  .sheet-stats {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(6.5rem, 100%), 1fr));
    align-items: stretch;
    gap: var(--space-2);
    min-width: 0;
  }

  .sheet-slots {
    display: grid;
    grid-template-columns: repeat(auto-fill, min(6rem, 100%));
    justify-content: start;
    align-items: stretch;
    gap: var(--space-5) var(--space-2);
    min-width: 0;
  }

  .sheet-grid {
    min-width: 0;
  }

  .sheet-grid :global(.dnd-grid-item) {
    overflow: auto;
  }

  .sheet-grid-arranging :global(.dnd-grid-item) {
    outline: var(--border-hair) dashed color-mix(in srgb, var(--metal-dim) 60%, transparent);
    outline-offset: calc(-1 * var(--border-hair));
    border-radius: var(--radius-sm);
  }

  .sheet-tabs {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    min-width: 0;
    min-height: 0;
    contain: inline-size;
  }

  @container page (max-width: 760px) {
    .sheet-band {
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
