<script lang="ts">
  import { getCampaigns, getCharacters } from '$lib/api'
  import type { Owner } from '$lib/api/types'
  import BaseDialog from "../BaseDialog.svelte";
  import Field from "$components/ui/Field.svelte";
  import Glyph, { type GlyphName } from "$components/ui/Glyph.svelte";
  import Ornament from "$components/ui/Ornament.svelte";
  import { navigate } from "sly-svelte-location-router";
  import { uiStore, isSearchDialogOpen, searchSeed } from "$lib/stores/ui.store";
  import { user } from "$lib/stores/auth.store";
  import { ACTIONS, actionBlocks, shortcuts } from "$lib/actions";
  import { getEvery, RESOURCES, type Resource, type ResourceKind } from "$lib/resources";
  import { getDocument, getDocumentText } from "$lib/blocks";

  interface Hit {
    id: string;
    title: string;
    sub: string;
    kind: string;
    glyph: GlyphName;
    key: string;
    hay: string;
    run: () => void;
    block?: string;
  }

  const KINDS = Object.keys(RESOURCES) as ResourceKind[];

  const GLYPHS: Record<ResourceKind, GlyphName> = {
    entries: 'scroll',
    npcs: 'character',
    items: 'gear',
    weapons: 'gear',
    armor: 'gear',
    places: 'campaign',
    maps: 'picture',
    sessions: 'scroll'
  };

  let isOpen = $derived($isSearchDialogOpen);
  let seed = $derived($searchSeed);

  let searchInput: HTMLInputElement;
  let list: HTMLDivElement;
  let searchQuery = $state('');
  let pages = $state<Hit[]>([]);
  let loading = $state(false);
  let error = $state<string | null>(null);

  const rites = $derived<Hit[]>(
    ACTIONS.filter((one) => one.id !== 'search').map((one) => ({
      id: `action/${one.id}`,
      title: one.title,
      sub: $actionBlocks[one.id],
      block: $actionBlocks[one.id],
      kind: 'Action',
      glyph: one.glyph,
      key: $shortcuts.find((pin) => pin.action === one.id)?.key ?? '',
      hay: one.title.toLowerCase(),
      run: one.run
    }))
  );

  const words = $derived(searchQuery.trim().toLowerCase().split(/\s+/).filter(Boolean));

  function getRank(hit: Hit): number {
    const title = hit.title.toLowerCase();
    if (title.includes(words.join(' '))) return 0;
    if (words.every((word) => title.includes(word))) return 1;
    return 2;
  }

  let found = $derived(
    words.length === 0
      ? rites
      : [...rites, ...pages]
          .filter((hit) => words.every((word) => hit.hay.includes(word)))
          .map((hit, index) => ({ hit, index, rank: getRank(hit) }))
          .sort((a, b) => a.rank - b.rank || a.index - b.index)
          .slice(0, 60)
          .map((one) => one.hit)
  );

  let selectedIndex = $state(0);

  function getHay(parts: string[]): string {
    return parts.filter(Boolean).join(' ').toLowerCase();
  }

  function getPage(one: Resource, kind: ResourceKind, under: string, place: string): Hit {
    const mark = RESOURCES[kind].mark(one);
    return {
      id: `${under}/${kind}/${one.id}`,
      title: one.title,
      sub: [mark, one.description].filter(Boolean).join(' · '),
      kind: `${RESOURCES[kind].one} · ${place}`,
      glyph: GLYPHS[kind],
      key: '',
      hay: getHay([
        one.title,
        one.description,
        mark,
        ...one.tags,
        ...one.facts.flatMap((fact) => [fact.label, fact.value]),
        getDocumentText(getDocument(one.content))
      ]),
      run: () => navigate(`${under}/${kind}/${one.id}`)
    };
  }

  async function getPages(userId: string): Promise<Hit[]> {
    const [campaigns, sheets] = await Promise.all([
      getCampaigns().catch(() => []),
      getCharacters().catch(() => [])
    ]);

    const shelves: { owner: Owner; under: string; place: string }[] = [
      { owner: { at: 'user', id: userId }, under: '/main', place: 'Your own' },
      ...campaigns.map((one) => ({
        owner: { at: 'campaign', id: one.id } as Owner,
        under: `/main/campaign/${one.id}`,
        place: one.name
      }))
    ];

    const rolls = await Promise.all(
      shelves.flatMap((shelf) =>
        KINDS.map(async (kind) => {
          const all = await getEvery(shelf.owner, kind).catch(() => [] as Resource[]);
          return all.map((one) => getPage(one, kind, shelf.under, shelf.place));
        })
      )
    );

    return [
      ...sheets.map((one) => ({
        id: `/main/character/${one.id}`,
        title: one.metadata.name,
        sub: `Level ${one.metadata.level} ${one.metadata.race} ${one.metadata.class}`.trim(),
        kind: 'Character sheet',
        glyph: 'character' as GlyphName,
        key: '',
        hay: getHay([one.metadata.name, one.metadata.race, one.metadata.class, ...one.metadata.tags]),
        run: () => navigate(`/main/character/${one.id}`)
      })),
      ...campaigns.map((one) => ({
        id: `/main/campaign/${one.id}`,
        title: one.name,
        sub: one.description,
        kind: 'Campaign',
        glyph: 'campaign' as GlyphName,
        key: '',
        hay: getHay([one.name, one.description]),
        run: () => navigate(`/main/campaign/${one.id}`)
      })),
      ...rolls.flat()
    ];
  }

  function handleKeydown(event: KeyboardEvent) {
    if (!isOpen) return;

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        selectedIndex = Math.min(selectedIndex + 1, found.length - 1);
        break;
      case 'ArrowUp':
        event.preventDefault();
        selectedIndex = Math.max(selectedIndex - 1, 0);
        break;
      case 'Enter':
        event.preventDefault();
        if (found[selectedIndex]) {
          invoke(found[selectedIndex]);
        }
        break;
    }
  }

  function invoke(hit: Hit) {
    if (hit.block) return;
    uiStore.closeSearchDialog();
    searchQuery = '';
    selectedIndex = 0;
    hit.run();
  }

  $effect(() => {
    if (isOpen && searchInput) {
      searchInput.focus();
    }
  });

  $effect(() => {
    const userId = $user?.user_id ?? '';
    if (!isOpen || !userId) return;

    void (async () => {
      loading = true;
      error = null;
      try {
        pages = await getPages(userId);
      } catch (reason) {
        error = reason instanceof Error ? reason.message : String(reason);
      } finally {
        loading = false;
      }
    })();
  });

  $effect(() => {
    searchQuery;
    selectedIndex = 0;
  });

  $effect(() => {
    list?.children[selectedIndex]?.scrollIntoView({ block: 'nearest' });
  });

  $effect(() => {
    searchQuery = isOpen ? seed : '';
    selectedIndex = 0;
  });
</script>

<svelte:window onkeydown={handleKeydown} />

<BaseDialog isOpen={isOpen} onClose={uiStore.closeSearchDialog} width="600px" showCloseButton={false} closeOnEscape={false}>
  <div class="head">
    <Field label="Search" id="search-command" help="Arrow keys walk the list, Enter opens">
      <input
        id="search-command"
        bind:this={searchInput}
        bind:value={searchQuery}
        type="text"
        placeholder="Actions, sheets, campaigns, and every page you can read..."
      />
    </Field>
  </div>

  <span class="key">
    <Ornament name="divider" tone="metal" />
  </span>

  <div class="rites dnd-scroll" bind:this={list}>
    {#each found as hit, index (hit.id)}
      <button
        type="button"
        class="rite"
        class:rite-lit={index === selectedIndex}
        aria-current={index === selectedIndex ? 'true' : undefined}
        disabled={Boolean(hit.block)}
        onclick={() => invoke(hit)}
      >
        <span class="rite-mark" aria-hidden="true"></span>
        <span class="rite-glyph"><Glyph name={hit.glyph} size="sm" /></span>
        <span class="rite-lines">
          <span class="rite-name">{hit.title}</span>
          {#if hit.sub}
            <span class="rite-sub">{hit.sub}</span>
          {/if}
        </span>
        <span class="rite-kind">{hit.kind}</span>
        {#if hit.key}
          <span class="rite-key">{hit.key}</span>
        {/if}
      </button>
    {/each}

    {#if loading && words.length > 0}
      <div class="dnd-loading"><span class="dnd-spinner"></span></div>
    {:else if error}
      <p class="hollow" role="alert">{error}</p>
    {:else if found.length === 0}
      <p class="hollow">Nothing found</p>
    {/if}
  </div>
</BaseDialog>

<style>
  .head {
    padding: var(--space-5) var(--space-5) var(--space-3);
  }

  .key {
    display: block;
    width: min(14rem, 60%);
    margin: 0 auto;
    opacity: 0.75;
    pointer-events: none;
  }

  .rites {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    max-height: min(25rem, 55vh);
    overflow-y: auto;
    margin: var(--space-2) var(--space-4) var(--space-4);
    padding: var(--space-2);
    background: var(--texture-noise), linear-gradient(180deg, var(--ground-deep) 0%, var(--ground) 100%);
    border-radius: var(--radius-sm);
    box-shadow: var(--rim-thin), var(--bevel-down), inset 0 0 16px 2px var(--shade-hard);
  }

  .rite {
    --rite-light: transparent;
    position: relative;
    display: flex;
    align-items: center;
    gap: var(--space-3);
    width: 100%;
    padding: var(--space-2) var(--space-3);
    background: transparent;
    border: none;
    border-radius: var(--radius-sm);
    color: var(--ink);
    text-align: left;
    cursor: pointer;
    transition: background 0.15s ease, box-shadow 0.15s ease;
  }

  .rite:hover:not(:disabled),
  .rite-lit {
    --rite-light: var(--metal);
    background:
      radial-gradient(ellipse 60% 140% at 0% 50%, color-mix(in srgb, var(--ember-glow) 60%, transparent) 0%, transparent 70%),
      linear-gradient(180deg, color-mix(in srgb, var(--stone-light) 16%, transparent) 0%, color-mix(in srgb, #000 50%, transparent) 60%, color-mix(in srgb, #000 70%, transparent) 100%),
      var(--texture-noise),
      var(--stone-dark);
    box-shadow: var(--rim-thin), var(--bevel-up);
  }

  .rite-lit {
    --rite-light: var(--metal-bright);
    box-shadow: var(--rim-thin), var(--bevel-up), inset 0 0 18px -6px var(--ember-glow);
  }

  .rite:hover:not(:disabled) .rite-name,
  .rite-lit .rite-name {
    color: var(--metal-bright);
    text-shadow: var(--glow-text);
  }

  .rite:active:not(:disabled) {
    filter: brightness(0.85);
  }

  .rite:active:not(:disabled) .rite-lines {
    transform: translateY(1px);
  }

  .rite:focus-visible {
    outline: none;
    box-shadow: var(--focus-ring);
  }

  .rite:disabled {
    cursor: not-allowed;
    opacity: 0.5;
  }

  .rite-mark {
    flex: none;
    width: 0.5rem;
    height: 0.5rem;
    transform: rotate(45deg);
    background: var(--rite-light);
    box-shadow: 0 0 8px var(--rite-light);
    transition: background 0.15s ease;
  }

  .rite-glyph {
    display: flex;
    flex: none;
    color: var(--metal);
  }

  .rite-lines {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: var(--space-0);
    min-width: 0;
  }

  .rite-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-family: var(--font-display);
    font-size: var(--text-sm);
    font-weight: 700;
    letter-spacing: var(--tracking-wide);
    color: var(--ink);
    text-shadow: 0 1px 0 #000;
    transition: color 0.15s ease, text-shadow 0.15s ease;
  }

  .rite-sub {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: var(--text-xs);
    color: var(--ink-dim);
  }

  .rite-kind {
    flex: none;
    max-width: 40%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-family: var(--font-display);
    font-size: var(--text-xs);
    letter-spacing: var(--tracking-caps);
    text-transform: uppercase;
    color: var(--ink-faint);
  }

  .rite-lit .rite-kind,
  .rite:hover:not(:disabled) .rite-kind {
    color: var(--metal);
  }

  .rite-key {
    flex: none;
    padding: var(--space-0) var(--space-2);
    background: var(--texture-noise), linear-gradient(180deg, var(--ground-deep) 0%, var(--ground) 100%);
    border: var(--border-hair) solid var(--metal-dim);
    border-radius: var(--radius-sm);
    box-shadow: var(--bevel-down);
    color: var(--ink-dim);
    font-family: var(--font-figures);
    font-size: var(--text-xs);
  }

  .hollow {
    margin: 0;
    padding: var(--space-5) var(--space-4);
    text-align: center;
    color: var(--ink-faint);
    font-style: italic;
  }
</style>
