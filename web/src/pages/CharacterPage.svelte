<script lang="ts">
  import * as api from '$lib/api'
  import { getAssets, getCampaign, getCampaignVehiclesStream, getCharacter, postCharacterCopy, postFile, putCharacterLayout, putCharacterPlayed, putProfileRecentCharacters } from '$lib/api'
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
  import ShortRestDialog from "$components/ShortRestDialog.svelte";
  import type {CharacterContext} from "$lib/types";
  import InventoryTab from "$character-sheet/main_tabs/InventoryTab.svelte";
  import FeaturesTab from "$character-sheet/main_tabs/FeaturesTab.svelte";
  import BackgroundTab from "$character-sheet/main_tabs/BackgroundTab.svelte";
  import BestiaryTab from "$character-sheet/main_tabs/BestiaryTab.svelte";
  import MainTabs from "$character-sheet/main_tabs/MainTabs.svelte";
  import ActionsTab from "$character-sheet/main_tabs/ActionsTab.svelte";
  import SpellsTab from "$character-sheet/main_tabs/SpellsTab.svelte";
  import Background from "$components/Background.svelte";
  import { applyStateToCharacter, characterWriteError, getCharacterStore, postLongRest, setCharacterReadOnly } from "$lib/engine";
  import { getRulesStore } from "$lib/rules/store";
  import { setContext, onDestroy, onMount, untrack, type Snippet } from "svelte";
  import Fold from "$components/ui/Fold.svelte";
  import DynamicGrid from "$components/ui/DynamicGrid.svelte";
  import type { DynamicGridItem, DynamicGridMode, DynamicGridPlacement } from "$lib/dynamic-grid";
  import Overlay from "$components/Overlay.svelte";
  import { sidebarStore } from "$lib/navigation";
  import { uiStore, anyDialogOpen, menuView, soundBoard, postNotice } from "$lib/stores/ui.store";
  import { navigate, resolvedRoute } from "sly-svelte-location-router";
  import Shell from "$components/ui/Shell.svelte";
  import VehiclesPage from "./VehiclesPage.svelte";
  import VehiclePage from "./VehiclePage.svelte";
  import Portrait, { type PortraitFrame } from "$components/ui/Portrait.svelte";
  import Stat from "$components/ui/Stat.svelte";
  import Glyph from "$components/ui/Glyph.svelte";
  import Field from "$components/ui/Field.svelte";
  import Button from "$components/ui/Button.svelte";
  import BaseDialog from "$components/BaseDialog.svelte";
  import MediaDialog from "$components/MediaDialog.svelte";
  import type { MediaAsset } from "$lib/blocks";
  import { postUIAction } from "$lib/chat";
  import { user, userProfile } from "$lib/stores/auth.store";
  import { currentCharacterId, getRecentCharacters } from "$lib/stores/character.store";

  const characterId = untrack(() => $resolvedRoute.path.split('/')[3]) || "local";

  let campaign = $state<{ id: string, name: string } | null>(null);
  let fleet = $state<number | null>(null);

  const VIEWS = [{ id: 'sheet', label: 'Character', glyph: 'character' }, { id: 'dock', label: 'Dock', glyph: 'anchor' }] as const;
  const dockPath = `/main/character/${characterId}/dock`;
  const tail = $derived($resolvedRoute.path.split('/').filter(Boolean).slice(3));
  const view = $derived(tail[0] === 'dock' ? 'dock' : 'sheet');
  const vessel = $derived(tail[1] ?? '');

  function openView(next: string) {
    if (next !== view || vessel) navigate(next === 'dock' ? dockPath : `/main/character/${characterId}`);
  }

  $effect(() => {
    if (!campaign) return;
    return getCampaignVehiclesStream(campaign.id, (vehicles) => (fleet = vehicles.length));
  });

  $effect(() => {
    if (view === 'dock' && fleet === 0) openView('sheet');
  });
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
        } else {
          postNotice("Another player's character. You can read the sheet, but only they can change it.");
        }

        if (document.campaign_id) {
          getCampaign(document.campaign_id)
            .then((found) => {
              campaign = found && { id: found.id, name: found.name };
              if (!found) fleet = 0;
            })
            .catch(() => {
              campaign = null;
              fleet = 0;
            });
        } else {
          fleet = 0;
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

  let room = $state(0)
  let shut = $state<Record<string, boolean>>({})

  const tight = $derived(room > 0 && room < 760)

  const ROW = 24
  const GAP = 12
  let heights = $state<Record<string, number>>({})
  let natural = $state<Record<string, number>>({})

  $effect(() => {
    for (const [id, height] of Object.entries(heights)) {
      const rows = Math.ceil((height + GAP) / (ROW + GAP))
      if (untrack(() => natural[id]) !== rows) natural = { ...untrack(() => natural), [id]: rows }
    }
  })

  const sheetPlaces: DynamicGridItem[] = [
    { id: 'saves', x: 0, y: 0, w: 3, h: 4, minW: 2, minH: 3 },
    { id: 'senses', x: 0, y: 4, w: 3, h: 7, minW: 2, minH: 3 },
    { id: 'proficiencies', x: 0, y: 11, w: 3, h: 8, minW: 2, minH: 3 },
    { id: 'defences', x: 0, y: 19, w: 3, h: 7, minW: 2, minH: 3 },
    { id: 'skills', x: 3, y: 0, w: 3, h: 26, minW: 2, minH: 6 },
    { id: 'actions', x: 6, y: 4, w: 6, h: 22, minW: 4, minH: 8 },
    { id: 'rules', x: 3, y: 26, w: 9, h: 7, minW: 3, minH: 3 }
  ]
  let layout = $state<Record<string, { x: number; y: number; w: number; h: number }>>({})
  let arranging = $state(false)
  let gridMode = $state<DynamicGridMode>('fixed')
  const rulePanels = $derived($rules.resolved?.panels.filter((panel) => !['abilities', 'defence', 'saves', 'senses'].includes(panel.id)) ?? [])
  let sized = $state<string[]>([])

  function putLayout(placements: DynamicGridPlacement[], resized = false) {
    const next = { ...layout }
    for (const { id, x, y, w, h } of placements) {
      const before = places.find((one) => one.id === id)
      if (resized && before && (before.h !== h || before.w !== w) && !sized.includes(id)) sized = [...sized, id]
      next[id] = { x, y, w, h: sized.includes(id) ? h : 0 }
    }
    layout = next
    putCharacterLayout(characterId, next)
      .catch((reason) => characterWriteError.set(reason instanceof Error ? reason.message : String(reason)))
  }

  let picking = $state(false)
  let shortResting = $state(false)

  function longRest() {
    if (!$rules.resolved) return
    postLongRest($rules.resolved)
  }

  function putPortrait(asset: MediaAsset | null) {
    picking = false
    if (!asset) return
    info.update((state) => ({...state, imageUrl: asset.url}))
  }

  const bespokeSlots = ['initiative', 'armorClass', 'speed', 'maxHitPoints']

  const slots = $derived($rules.resolved?.derived.filter((entry) => !bespokeSlots.includes(entry.id)) ?? [])
  const hitDice = $derived($rules.resolved?.pools.find((pool) => pool.id === 'hitDice'))
  const slotPlaces = $derived<DynamicGridItem[]>(
    ['initiative', 'armor', 'hitDice', ...slots.map((slot) => slot.id)].map((id, at) => ({ id: `slot/${id}`, x: 6 + at, y: 0, w: 1, h: 4, minW: 1, minH: 3 }))
  )
  const places = $derived([...sheetPlaces, ...slotPlaces].filter((place) => place.id !== 'rules' || rulePanels.length > 0).map((place) => {
    const own = layout[place.id]
    const grown = natural[place.id]
    const h = own && own.h > 0 ? Math.max(own.h, grown ?? 1) : (grown ?? place.h)
    return { ...place, ...own, h }
  }))

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
    {#snippet bestiaryTab()}
      <BestiaryTab />
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
      <button type="button" class="sheet-tool" onclick={openName}>
        <span class="sheet-tool-glyph"><Glyph name="edit" size="sm" /></span>
        <span class="sheet-tool-word">Rename this character</span>
      </button>
    {/if}
    {#if owned}
      <button type="button" class="sheet-tool" aria-pressed={$menuView === 'soundboard'} onclick={uiStore.openSoundboard}>
        <span class="sheet-tool-glyph"><Glyph name="sound" size="sm" /></span>
        <span class="sheet-tool-word">Soundboard</span>
      </button>
    {/if}
    <button type="button" class="sheet-tool" onclick={() => postUIAction('exportCharacter')}>
      <span class="sheet-tool-glyph"><Glyph name="export" size="sm" /></span>
      <span class="sheet-tool-word">Export this character</span>
    </button>
    {#if owned}
      <button type="button" class="sheet-tool" onclick={() => postUIAction('openLevelUpDialog')}>
        <span class="sheet-tool-glyph"><Glyph name="levelup" size="sm" /></span>
        <span class="sheet-tool-word">Level up</span>
      </button>
      <button type="button" class="sheet-tool" onclick={() => postUIAction('openSourceImport')}>
        <span class="sheet-tool-glyph"><Glyph name="sources" size="sm" /></span>
        <span class="sheet-tool-word">Import sources</span>
      </button>
      <button type="button" class="sheet-tool" aria-pressed={arranging} onclick={() => (arranging = !arranging)}>
        <span class="sheet-tool-glyph"><Glyph name="blocks" size="sm" /></span>
        <span class="sheet-tool-word">Lay out the sheet</span>
      </button>
      {#if arranging}
        <button type="button" class="sheet-tool sheet-tool-under" aria-pressed={gridMode === 'fixed'} onclick={() => (gridMode = 'fixed')}>
          <span class="sheet-tool-glyph"><Glyph name="rectangle" size="sm" /></span>
          <span class="sheet-tool-word">Fixed grid</span>
        </button>
        <button type="button" class="sheet-tool sheet-tool-under" aria-pressed={gridMode === 'flow'} onclick={() => (gridMode = 'flow')}>
          <span class="sheet-tool-glyph"><Glyph name="lines" size="sm" /></span>
          <span class="sheet-tool-word">Flowing grid</span>
        </button>
      {/if}
      <button type="button" class="sheet-tool" onclick={() => postUIAction('openFrameDialog')}>
        <span class="sheet-tool-glyph"><Glyph name="gear" size="sm" /></span>
        <span class="sheet-tool-word">Choose the portrait frame</span>
      </button>
    {/if}
    <button type="button" class="sheet-tool" onclick={() => postUIAction('openThemeDialog')}>
      <span class="sheet-tool-glyph"><Glyph name="theme" size="sm" /></span>
      <span class="sheet-tool-word">Change theme</span>
    </button>
    <button type="button" class="sheet-tool" disabled={working} onclick={postCopy}>
      <span class="sheet-tool-glyph"><Glyph name="copy" size="sm" /></span>
      <span class="sheet-tool-word">Copy this character</span>
    </button>
    {#if owned}
      <button type="button" class="sheet-tool" disabled={working} onclick={() => (deleting = true)}>
        <span class="sheet-tool-glyph"><Glyph name="remove" size="sm" /></span>
        <span class="sheet-tool-word">Delete this character</span>
      </button>
    {/if}
  {/snippet}

  {#snippet backdrop()}
    <Background />
  {/snippet}

  {#if loaded && fleet}
    <nav class="sheet-marks" aria-label="Character views">
      {#each VIEWS as one (one.id)}
        <button
          type="button"
          class="sheet-mark"
          class:sheet-mark-on={view === one.id}
          aria-current={view === one.id ? 'page' : undefined}
          title={one.label}
          onclick={() => openView(one.id)}
        >
          <Glyph name={one.glyph} size="sm" />
          <span class="sheet-mark-word">{one.label}</span>
        </button>
      {/each}
    </nav>
  {/if}

  {#if missing}
    <p class="sheet-alarm" role="alert">{missing}</p>
  {:else if loaded && view === 'dock' && campaign && fleet}
    <div class="sheet-dock">
      {#if vessel}
        <VehiclePage dock={{ base: dockPath, aboard: characterId }} />
      {:else}
        <VehiclesPage dock={{ campaignId: campaign.id, base: dockPath }} />
      {/if}
    </div>
  {:else if loaded}
    <div class="sheet-band">
      <header class="sheet-crown">
        <button
          type="button"
          class="sheet-face"
          title={owned ? 'Choose the portrait picture' : $info.name || 'Character'}
          disabled={!owned}
          onclick={() => (picking = true)}
        >
          <Portrait
            src={$info.imageUrl}
            alt={$info.name || 'Character'}
            frame={($info.imageFrame as PortraitFrame) ?? 'shield'}
            size="md"
          />
        </button>

        <span class="sheet-lines">
          <span class="sheet-title">
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
              <h1 class="dnd-heading sheet-name">{$info.name || 'Unnamed Character'}</h1>
            {/if}
            <span class="sheet-level">
              <span class="sheet-level-word">Level</span>
              <span class="sheet-level-figure">{$info.level || 1}</span>
            </span>
          </span>
          <span class="sheet-meta">
            <span class="sheet-kin">{$info.race?.name || 'Unknown'} {$info.class?.name || 'Unknown'}</span>
            {#if campaign}
              <a class="sheet-campaign" href="/main/campaign/{campaign.id}">{campaign.name}</a>
            {:else}
              <span class="sheet-campaign">No campaign</span>
            {/if}
          </span>
        </span>

        <span class="sheet-rests">
          <span class="sheet-still" class:sheet-still-on={reading} use:still={reading}>
            <button type="button" class="sheet-rest" title="Short rest" disabled={!$rules.resolved} onclick={() => (shortResting = true)}>
              <span class="sheet-rest-shield"><Glyph name="bonfire" size="lg" /></span>
              <span class="sheet-rest-word">Short rest</span>
            </button>
            <button type="button" class="sheet-rest" title="Long rest" disabled={!$rules.resolved} onclick={longRest}>
              <span class="sheet-rest-shield"><Glyph name="tent" size="lg" /></span>
              <span class="sheet-rest-word">Long rest</span>
            </button>
          </span>
          <Inspiration />
        </span>

      </header>

      <ShortRestDialog bind:isOpen={shortResting} />

      <div class="sheet-still" class:sheet-still-on={reading} use:still={reading}>
        <HitPoints onrest={() => (shortResting = true)} />
      </div>
    </div>

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
    </div>

    <div class="sheet-grid" class:sheet-grid-arranging={arranging} bind:clientWidth={room}>
      <DynamicGrid
        items={places}
        columns={12}
        mode={gridMode}
        minColWidth={60}
        rowHeight={ROW}
        margin={[GAP, GAP]}
        padding={[0, 0]}
        draggable={arranging}
        resizable={arranging}
        onmove={(placements) => putLayout(placements)}
        onresize={(placements) => putLayout(placements, true)}
      >
        {#snippet item(placed)}
          <div class="sheet-cell" class:sheet-cell-fill={(layout[placed.id]?.h ?? 0) > 0 || placed.id === 'actions'} bind:offsetHeight={heights[placed.id]}>
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
          {:else if placed.id === 'slot/initiative'}
            <Initiative bind:initiative={$info.initiative}/>
          {:else if placed.id === 'slot/armor'}
            <PlainBox bind:value={$info.ac} title="Armor" subTitle="class" />
          {:else if placed.id === 'slot/hitDice'}
            <Stat label="Hit dice" value="{hitDice?.remaining ?? 0}/{hitDice?.max ?? '--'}" sub="d{$info.class?.hitDice?.die || 8}" title="Hit dice left to spend" />
          {:else if placed.id.startsWith('slot/')}
            {@const slot = slots.find((one) => `slot/${one.id}` === placed.id)}
            {#if slot}
              <PlainBox value={slot.value} title={slot.title} subTitle={slot.unit}/>
            {/if}
          {:else if placed.id === 'actions'}
            <div class="sheet-tabs">
              {@render group('actions', 'Actions and inventory', tabs)}
            </div>
          {/if}
          </div>
        {/snippet}
      </DynamicGrid>
    </div>
    </div>
  {/if}
</Shell>

{#if picking}
  <MediaDialog
    kind="image"
    current={$info.imageUrl}
    getAssets={(query, wanted) => getAssets(query, wanted, { kind: 'user' })}
    uploadFile={(file) => postFile(file, { kind: 'user' })}
    onclose={putPortrait}
  />
{/if}

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

  .sheet-marks {
    position: absolute;
    inset-block-start: 0;
    inset-inline-end: var(--space-6);
    z-index: 3;
    display: flex;
    align-items: flex-start;
    gap: var(--space-2);
    pointer-events: none;
  }

  .sheet-mark {
    --mark-notch: 0.55rem;

    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: flex-end;
    gap: var(--space-1);
    inline-size: 2.2rem;
    block-size: 2.8rem;
    padding: 0 0 calc(var(--mark-notch) + var(--space-1));
    border: none;
    clip-path: polygon(0 0, 100% 0, 100% 100%, 50% calc(100% - var(--mark-notch)), 0 100%);
    background:
      linear-gradient(90deg, color-mix(in srgb, var(--shadow-ink) 35%, transparent), transparent 30%, transparent 70%, color-mix(in srgb, var(--shadow-ink) 35%, transparent)),
      var(--texture-grain),
      var(--wood);
    box-shadow: inset 0 0 0 1px var(--keyline), inset 0 0 0 2px var(--metal-dim);
    color: var(--metal);
    font-family: var(--font-display);
    font-size: var(--text-xs);
    font-weight: 700;
    letter-spacing: var(--tracking-caps);
    text-transform: uppercase;
    text-shadow: 0 1px 0 var(--shadow-ink);
    cursor: pointer;
    pointer-events: auto;
    transition: block-size 0.22s ease, inline-size 0.22s ease, color 0.18s ease;
  }

  .sheet-mark-word {
    max-height: 0;
    overflow: hidden;
    opacity: 0;
    writing-mode: vertical-rl;
    transform: rotate(180deg);
    transition: max-height 0.22s ease, opacity 0.18s ease;
  }

  .sheet-mark:hover,
  .sheet-mark:focus-visible {
    inline-size: 2.6rem;
    block-size: 8rem;
    color: var(--metal-bright);
    text-shadow: var(--glow-text);
  }

  .sheet-mark:hover .sheet-mark-word,
  .sheet-mark:focus-visible .sheet-mark-word {
    max-height: 6rem;
    opacity: 1;
  }

  .sheet-mark-on {
    background:
      radial-gradient(ellipse 90% 60% at 50% 100%, var(--ember-glow) 0%, transparent 70%),
      linear-gradient(90deg, color-mix(in srgb, var(--shadow-ink) 30%, transparent), transparent 30%, transparent 70%, color-mix(in srgb, var(--shadow-ink) 30%, transparent)),
      var(--texture-noise),
      var(--stone);
    box-shadow: inset 0 0 0 1px var(--keyline), inset 0 0 0 2px var(--metal-bright);
    color: var(--metal-bright);
  }

  .sheet-mark:focus-visible {
    outline: none;
  }

  .sheet-dock {
    min-width: 0;
  }

  .sheet-band {
    display: flex;
    align-items: stretch;
    gap: var(--space-3);
    min-width: 0;
  }

  .sheet-band > .sheet-crown {
    flex: 1 1 auto;
  }

  .sheet-band > :global(.vitals) {
    flex: none;
  }

  .sheet-crown {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    grid-template-rows: auto auto auto;
    grid-template-areas:
      'face name rest'
      'face meta rest'
      'rule rule rest';
    align-items: center;
    align-content: center;
    column-gap: var(--space-4);
    row-gap: 0;
    min-width: 0;
    padding-block: 0;
  }

  .sheet-crown::after {
    content: '';
    grid-area: rule;
    display: block;
    block-size: var(--border-hair);
    margin-block-start: var(--space-2);
    background: linear-gradient(90deg, var(--metal) 0%, color-mix(in srgb, var(--metal) 45%, transparent) 70%, transparent 100%);
  }

  .sheet-tool {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    inline-size: 100%;
    padding: var(--space-2) var(--space-3);
    border: none;
    border-radius: var(--radius-sm);
    background: none;
    text-align: start;
    cursor: pointer;
    transition: background 0.15s ease, color 0.15s ease;
  }

  .sheet-tool:hover:not(:disabled),
  .sheet-tool:focus-visible {
    background: color-mix(in srgb, var(--metal) 14%, transparent);
  }

  .sheet-tool:hover:not(:disabled) .sheet-tool-word,
  .sheet-tool[aria-pressed='true'] .sheet-tool-word {
    color: var(--metal-bright);
  }

  .sheet-tool:focus-visible {
    outline: none;
    box-shadow: var(--focus-ring);
  }

  .sheet-tool:disabled {
    cursor: not-allowed;
    opacity: 0.5;
  }

  .sheet-tool-under {
    padding-inline-start: var(--space-6);
  }

  .sheet-tool-glyph {
    display: flex;
    flex: none;
    color: var(--metal);
  }

  .sheet-tool[aria-pressed='true'] .sheet-tool-glyph {
    color: var(--metal-bright);
    filter: drop-shadow(0 0 0.3rem var(--ember-glow));
  }

  .sheet-tool-word {
    font-family: var(--font-display);
    font-size: var(--text-sm);
    letter-spacing: var(--tracking-wide);
    color: var(--ink);
    white-space: nowrap;
  }

  .sheet-face {
    grid-area: face;
    display: flex;
    flex: none;
    align-self: end;
    margin-block-end: calc(var(--space-4) * -1);
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
    display: contents;
  }

  .sheet-lines > .sheet-title {
    grid-area: name;
  }

  .sheet-lines > .sheet-meta {
    grid-area: meta;
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: var(--space-2);
    min-width: 0;
    margin-block-start: calc(var(--space-1) * -1);
    line-height: 1;
  }

  .sheet-title {
    display: flex;
    align-items: baseline;
    gap: var(--space-4);
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

  .sheet-name {
    margin: 0;
    font-family: var(--font-display);
    font-size: var(--text-xl);
    font-weight: 700;
    letter-spacing: var(--tracking-wide);
    line-height: 1;
    color: var(--metal-bright);
    text-shadow: 0 1px 0 var(--shadow-ink), 0 0 0.6rem var(--ember-glow), 0 0 1.4rem var(--ember-glow);
    min-width: 0;
    overflow-wrap: break-word;
  }

  .sheet-level {
    display: flex;
    flex: none;
    align-items: baseline;
    gap: var(--space-2);
    color: var(--metal);
    text-shadow: 0 1px 0 var(--shadow-ink);
  }

  .sheet-rests {
    grid-area: rest;
    display: flex;
    align-items: center;
    align-self: stretch;
    padding-inline-end: var(--space-3);
  }

  .sheet-rest {
    --rest-size: var(--space-7);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-0);
    padding: var(--space-1) var(--space-3) 0;
    border: none;
    background: none;
    color: var(--metal);
    cursor: pointer;
  }

  .sheet-rest-shield {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    inline-size: var(--rest-size);
    aspect-ratio: 100 / 120;
    background:
      var(--texture-noise),
      radial-gradient(circle at 50% 30%, var(--ground-lift) 0%, var(--ground-deep) 85%);
    -webkit-mask: var(--mask-shield) center / 100% 100% no-repeat;
    mask: var(--mask-shield) center / 100% 100% no-repeat;
    transition: filter 300ms ease;
  }

  .sheet-rest-shield::before {
    content: '';
    position: absolute;
    inset: 0;
    background: linear-gradient(180deg, var(--metal-bright) 0%, var(--metal) 50%, var(--metal-dim) 100%);
    -webkit-mask:
      var(--mask-shield) center / 100% 100% no-repeat,
      var(--mask-shield) center / calc(100% - 2 * var(--space-0)) calc(100% - 2 * var(--space-0)) no-repeat;
    mask:
      var(--mask-shield) center / 100% 100% no-repeat,
      var(--mask-shield) center / calc(100% - 2 * var(--space-0)) calc(100% - 2 * var(--space-0)) no-repeat;
    -webkit-mask-composite: xor;
    mask-composite: exclude;
  }

  .sheet-rest-shield > :global(.dnd-glyph) {
    position: relative;
  }

  .sheet-rest:hover:not(:disabled) .sheet-rest-shield {
    filter: drop-shadow(0 0 0.4rem var(--ember-glow)) brightness(1.1);
  }

  .sheet-rest:active:not(:disabled) .sheet-rest-shield {
    filter: brightness(0.85);
  }

  .sheet-rest:disabled {
    cursor: not-allowed;
    opacity: 0.4;
    filter: grayscale(0.85);
  }

  .sheet-rest:focus-visible {
    outline: none;
    border-radius: var(--radius-sm);
    box-shadow: var(--focus-ring);
  }

  .sheet-rest-word {
    font-family: var(--font-display);
    font-size: calc(var(--text-xs) * 0.85);
    font-weight: 700;
    letter-spacing: var(--tracking-caps);
    text-transform: uppercase;
    white-space: nowrap;
    text-shadow: 0 1px 0 var(--shadow-ink);
  }

  .sheet-level-word {
    font-family: var(--font-display);
    font-size: var(--text-xs);
    font-weight: 700;
    letter-spacing: var(--tracking-caps);
    text-transform: uppercase;
  }

  .sheet-level-figure {
    font-family: var(--font-figures);
    font-size: var(--text-xl);
    font-weight: 700;
    line-height: 1;
    color: var(--metal-bright);
  }

  .sheet-kin {
    font-family: var(--font-display);
    font-size: var(--text-sm);
    font-style: italic;
    letter-spacing: var(--tracking-wide);
    color: var(--ink-dim);
    text-shadow: 0 1px 0 var(--shadow-ink);
  }

  .sheet-campaign {
    min-width: 0;
    font-family: var(--font-display);
    font-size: var(--text-sm);
    letter-spacing: var(--tracking-wide);
    color: var(--metal);
    text-decoration: none;
    text-shadow: 0 1px 0 var(--shadow-ink);
    overflow-wrap: anywhere;
  }

  .sheet-campaign::before {
    content: '\00B7';
    margin-inline-end: var(--space-2);
    color: var(--ink-faint);
  }

  a.sheet-campaign:hover {
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

  .sheet-grid {
    min-width: 0;
  }

  .sheet-grid :global(.dnd-grid-item) {
    overflow: visible;
  }

  .sheet-cell {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }

  .sheet-cell-fill {
    block-size: 100%;
  }

  .sheet-cell > :global(*) {
    flex: 1 1 auto;
    min-block-size: 0;
  }

  .sheet-grid-arranging :global(.dnd-grid-item) {
    overflow: hidden;
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
      grid-template-columns: auto minmax(0, 1fr) auto;
      grid-template-areas:
        'face name name'
        'face meta meta'
        'rule rule rule'
        '. . rest';
    }
  }
</style>
