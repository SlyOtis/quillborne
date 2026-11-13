<script lang="ts">
  import { getTags, postSearch, type SearchHit } from '$lib/api'
  import BaseDialog from "../BaseDialog.svelte";
  import Field from "$components/ui/Field.svelte";
  import Glyph, { type GlyphName } from "$components/ui/Glyph.svelte";
  import IconBtn from "$components/ui/IconBtn.svelte";
  import { navigate } from "sly-svelte-location-router";
  import { uiStore, isSearchDialogOpen, searchSeed } from "$lib/stores/ui.store";
  import { user } from "$lib/stores/auth.store";
  import { ACTIONS, actionBlocks, shortcuts } from "$lib/actions";
  import { RESOURCES, type ResourceKind } from "$lib/resources";

  interface Hit {
    id: string;
    title: string;
    sub: string;
    group: string;
    place: string;
    glyph: GlyphName;
    key: string;
    tags: string[];
    token: string;
    hay: string;
    run: () => void;
    block?: string;
  }

  interface Part {
    text: string;
    mark: boolean;
  }

  const GLYPHS: Record<ResourceKind, GlyphName> = {
    entries: 'scroll',
    items: 'gear',
    weapons: 'gear',
    armor: 'gear',
    places: 'campaign',
    maps: 'picture',
    sessions: 'scroll'
  };

  const KEYS = [
    { cap: 'Up Down', does: 'walk' },
    { cap: 'Enter', does: 'open' },
    { cap: 'Tab', does: 'tag' },
    { cap: 'Esc', does: 'close' }
  ];

  let isOpen = $derived($isSearchDialogOpen);
  let seed = $derived($searchSeed);

  let searchInput: HTMLInputElement;
  let list: HTMLDivElement;
  let searchQuery = $state('');
  let pages = $state<Hit[]>([]);
  let loading = $state(false);
  let error = $state<string | null>(null);
  let selectedIndex = $state(0);
  let timer: ReturnType<typeof setTimeout> | undefined;
  let asked = 0;

  const SEARCH_DELAY = 250;
  const SEARCH_MIN = 2;
  const SEARCH_LIMIT = 30;
  const SEARCH_TYPES = ['campaign', 'character', 'resource', 'vehicle'];

  const rites = $derived<Hit[]>(
    ACTIONS.filter((one) => one.id !== 'search').map((one) => ({
      id: `action/${one.id}`,
      title: one.title,
      sub: $actionBlocks[one.id],
      block: $actionBlocks[one.id],
      group: 'Actions',
      place: '',
      glyph: one.glyph,
      key: $shortcuts.find((pin) => pin.action === one.id)?.key ?? '',
      tags: [],
      token: '',
      hay: one.title.toLowerCase(),
      run: one.run
    }))
  );

  const tokens = $derived(searchQuery.trim().toLowerCase().split(/\s+/).filter(Boolean));
  const tagged = $derived(tokens.filter((one) => one.startsWith('#') && one.length > 1).map((one) => one.slice(1)));
  const words = $derived(tokens.filter((one) => !one.startsWith('#')));
  const chips = $derived(getChips(searchQuery));
  const typed = $derived(searchQuery.slice(chips.join(' ').length).replace(/^ /, ''));

  function getChips(query: string): string[] {
    const held: string[] = [];
    let rest = query;
    for (;;) {
      const match = /^(#\S+) /.exec(rest);
      if (!match) return held;
      held.push(match[1]);
      rest = rest.slice(match[0].length);
    }
  }

  function getRank(hit: Hit): number {
    const title = hit.title.toLowerCase();
    if (words.length === 0) return 0;
    if (title.includes(words.join(' '))) return 0;
    if (words.every((word) => title.includes(word))) return 1;
    return 2;
  }

  function isTagged(hit: Hit): boolean {
    return tagged.every((tag) => hit.tags.some((one) => one.toLowerCase().startsWith(tag)));
  }

  let found = $derived(
    tokens.length === 0
      ? rites
      : [...rites, ...pages]
          .filter((hit) => hit.group === 'Actions' ? isTagged(hit) && words.every((word) => hit.hay.includes(word)) : true)
          .map((hit, index) => ({ hit, index, rank: getRank(hit) }))
          .sort((a, b) => a.rank - b.rank || a.index - b.index)
          .slice(0, 60)
          .map((one) => one.hit)
  );

  const groups = $derived(
    found.reduce<{ label: string; hits: { hit: Hit; index: number }[] }[]>((held, hit, index) => {
      const last = held[held.length - 1];
      if (last && last.label === hit.group) last.hits.push({ hit, index });
      else held.push({ label: hit.group, hits: [{ hit, index }] });
      return held;
    }, [])
  );

  function getParts(value: string): Part[] {
    const haystack = value.toLowerCase();
    const spans: [number, number][] = [];
    for (const word of words) {
      let at = haystack.indexOf(word);
      while (at >= 0) {
        spans.push([at, at + word.length]);
        at = haystack.indexOf(word, at + word.length);
      }
    }
    if (spans.length === 0) return [{ text: value, mark: false }];
    spans.sort((a, b) => a[0] - b[0]);
    const merged: [number, number][] = [];
    for (const [start, end] of spans) {
      const last = merged[merged.length - 1];
      if (last && start <= last[1]) last[1] = Math.max(last[1], end);
      else merged.push([start, end]);
    }
    const parts: Part[] = [];
    let cursor = 0;
    for (const [start, end] of merged) {
      if (start > cursor) parts.push({ text: value.slice(cursor, start), mark: false });
      parts.push({ text: value.slice(start, end), mark: true });
      cursor = end;
    }
    if (cursor < value.length) parts.push({ text: value.slice(cursor), mark: false });
    return parts;
  }

  function getHit(one: SearchHit): Hit {
    const name = one.name ?? '';
    const sub = one.description ?? '';
    const hay = `${name} ${sub}`.toLowerCase();
    if (one.object_type === 'public.campaign') {
      return { id: `campaign/${one.id}`, title: name, sub, group: 'Campaigns', place: '', glyph: 'campaign', key: '', tags: [], token: '', hay, run: () => navigate(`/main/campaign/${one.id}`) };
    }
    if (one.object_type === 'public.character') {
      return { id: `character/${one.id}`, title: name, sub, group: 'Characters', place: '', glyph: 'character', key: '', tags: [], token: '', hay, run: () => navigate(`/main/character/${one.id}`) };
    }
    if (one.object_type === 'public.vehicle') {
      return { id: `vehicle/${one.id}`, title: name, sub, group: 'Vessels', place: '', glyph: 'gear', key: '', tags: [], token: '', hay, run: () => navigate(`/main/vehicles/${one.id}`) };
    }
    const kind = (one.kind === 'locations' ? 'places' : one.kind ?? 'entries') as ResourceKind;
    const under = one.campaign_id ? `/main/campaign/${one.campaign_id}` : '/main';
    return {
      id: `${under}/${kind}/${one.id}`,
      title: name,
      sub,
      group: RESOURCES[kind]?.many ?? kind,
      place: one.campaign_id ? 'At the table' : 'Your own',
      glyph: GLYPHS[kind] ?? 'scroll',
      key: '',
      tags: [],
      token: '',
      hay,
      run: () => navigate(`${under}/${kind}/${one.id}`)
    };
  }

  async function getPages(): Promise<Hit[]> {
    const tagIds: string[] = [];
    for (const tag of tagged) {
      const found = (await getTags(tag).catch(() => [])).find((one) => one.name.toLowerCase() === tag);
      if (!found) return [];
      tagIds.push(found.id);
    }
    const q = words.join(' ');
    if (q.length < SEARCH_MIN && tagIds.length === 0) return [];
    const hits = await postSearch({ q: q || undefined, object_types: SEARCH_TYPES, tag_ids: tagIds.length ? tagIds : undefined, limit: SEARCH_LIMIT });
    return hits.map(getHit);
  }

  function putChips(held: string[], rest: string) {
    searchQuery = [...held, rest].filter(Boolean).join(' ') + (held.length && !rest ? ' ' : '');
    requestAnimationFrame(() => {
      searchInput?.focus();
      searchInput?.setSelectionRange(searchQuery.length, searchQuery.length);
    });
  }

  function deleteChip(at: number) {
    putChips(chips.filter((_, index) => index !== at), typed);
  }

  function putToken(hit: Hit) {
    if (!hit.token || chips.includes(hit.token)) return;
    putChips([...chips, hit.token], typed.replace(/\S*$/, '').trim());
  }

  function handleKeydown(event: KeyboardEvent) {
    if (!isOpen) return;

    if (event.key === 'Backspace' && chips.length && event.target === searchInput && searchInput.selectionStart === chips.join(' ').length + 1 && searchInput.selectionEnd === searchInput.selectionStart) {
      event.preventDefault();
      deleteChip(chips.length - 1);
      return;
    }

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        if (found.length) selectedIndex = (selectedIndex + 1) % found.length;
        break;
      case 'ArrowUp':
        event.preventDefault();
        if (found.length) selectedIndex = (selectedIndex - 1 + found.length) % found.length;
        break;
      case 'Enter':
        event.preventDefault();
        if (found[selectedIndex]) {
          invoke(found[selectedIndex]);
        }
        break;
      case 'Tab':
        if (event.shiftKey || !found[selectedIndex]?.token) return;
        event.preventDefault();
        putToken(found[selectedIndex]);
        break;
      case 'Escape':
        event.preventDefault();
        uiStore.closeSearchDialog();
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
    const open = isOpen && Boolean($user?.user_id);
    const key = `${words.join(' ')}|${tagged.join(' ')}`;
    clearTimeout(timer);
    if (!open) return;
    const mine = ++asked;
    timer = setTimeout(() => {
      loading = true;
      error = null;
      void getPages()
        .then((found) => {
          if (mine === asked) pages = found;
        })
        .catch((reason) => {
          if (mine === asked) error = reason instanceof Error ? reason.message : String(reason);
        })
        .finally(() => {
          if (mine === asked) loading = false;
        });
    }, key ? SEARCH_DELAY : 0);
    return () => clearTimeout(timer);
  });

  $effect(() => {
    searchQuery;
    selectedIndex = 0;
  });

  $effect(() => {
    list?.querySelector(`[data-index="${selectedIndex}"]`)?.scrollIntoView({ block: 'nearest' });
  });

  $effect(() => {
    searchQuery = isOpen ? seed : '';
    selectedIndex = 0;
  });
</script>

<svelte:window onkeydown={handleKeydown} />

<BaseDialog isOpen={isOpen} onClose={uiStore.closeSearchDialog} width="640px" showCloseButton={false} closeOnEscape={false}>
  <div class="head">
    {#if chips.length}
      <div class="chips" aria-label="Tags the search is held to">
        {#each chips as chip, at (chip)}
          <span class="chip">
            <span class="chip-name">{chip}</span>
            <IconBtn title="Drop {chip.slice(1)}" onclick={() => deleteChip(at)}><Glyph name="close" size="sm" /></IconBtn>
          </span>
        {/each}
      </div>
    {/if}
    <Field label="Search" id="search-command" help="A word finds it, #tag holds the list to a tag">
      <input
        id="search-command"
        bind:this={searchInput}
        bind:value={searchQuery}
        type="text"
        autocomplete="off"
        spellcheck="false"
        placeholder="Actions, sheets, campaigns, and every page you can read..."
      />
    </Field>
  </div>

  <div class="rites dnd-scroll" bind:this={list} role="listbox" aria-label="What was found">
    {#each groups as group (group.label)}
      <p class="group">{group.label}</p>
      {#each group.hits as { hit, index } (hit.id)}
        <button
          type="button"
          class="rite"
          class:rite-lit={index === selectedIndex}
          role="option"
          aria-selected={index === selectedIndex}
          data-index={index}
          disabled={Boolean(hit.block)}
          onmouseenter={() => (selectedIndex = index)}
          onclick={() => invoke(hit)}
        >
          <span class="rite-glyph"><Glyph name={hit.glyph} size="sm" /></span>
          <span class="rite-lines">
            <span class="rite-name">{#each getParts(hit.title) as part}<span class:rite-mark={part.mark}>{part.text}</span>{/each}</span>
            {#if hit.sub}
              <span class="rite-sub">{#each getParts(hit.sub) as part}<span class:rite-mark={part.mark}>{part.text}</span>{/each}</span>
            {/if}
            {#if hit.tags.length}
              <span class="rite-tags">
                {#each hit.tags as tag (tag)}
                  <span class="rite-tag">{tag}</span>
                {/each}
              </span>
            {/if}
          </span>
          {#if hit.place}
            <span class="rite-place">{hit.place}</span>
          {/if}
          {#if hit.key}
            <kbd class="cap">{hit.key}</kbd>
          {/if}
        </button>
      {/each}
    {/each}

    {#if loading && tokens.length > 0}
      <div class="dnd-loading"><span class="dnd-spinner"></span></div>
    {:else if error}
      <p class="hollow" role="alert">{error}</p>
    {:else if found.length === 0}
      <p class="hollow">Nothing found</p>
    {/if}
  </div>

  <div class="foot">
    <span class="keys"><kbd class="cap">#</kbd> tag</span>
    {#each KEYS as key (key.cap)}
      <span class="keys"><kbd class="cap">{key.cap}</kbd> {key.does}</span>
    {/each}
  </div>
</BaseDialog>

<style>
  .head {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    padding: var(--space-5) var(--space-5) var(--space-3);
  }

  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
  }

  .chip {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    padding: 0 var(--space-1) 0 var(--space-2);
    border: var(--border-hair) solid var(--metal-dim);
    border-radius: var(--radius-sm);
    color: var(--metal);
    font-size: var(--text-xs);
  }

  .chip-name {
    font-family: var(--font-display);
    letter-spacing: var(--tracking-wide);
  }

  .rites {
    display: flex;
    flex-direction: column;
    max-height: min(25rem, 55vh);
    overflow-y: auto;
    margin: 0 var(--space-4);
    border-top: var(--border-hair) solid color-mix(in srgb, var(--metal-dim) 50%, transparent);
  }

  .group {
    margin: 0;
    padding: var(--space-3) var(--space-3) var(--space-1);
    font-family: var(--font-display);
    font-size: var(--text-xs);
    letter-spacing: var(--tracking-caps);
    text-transform: uppercase;
    color: var(--ink-faint);
  }

  .rite {
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
    transition: background 0.15s ease;
  }

  .rite-lit {
    background: color-mix(in srgb, var(--metal) 12%, transparent);
    box-shadow: inset var(--space-0) 0 0 var(--metal);
  }

  .rite-lit .rite-name {
    color: var(--metal-bright);
  }

  .rite:focus-visible {
    outline: none;
    box-shadow: var(--focus-ring);
  }

  .rite:disabled {
    cursor: not-allowed;
    opacity: 0.5;
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
    font-weight: 600;
    letter-spacing: var(--tracking-wide);
    color: var(--ink);
    transition: color 0.15s ease;
  }

  .rite-sub {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: var(--text-xs);
    color: var(--ink-dim);
  }

  .rite-mark {
    color: var(--metal-bright);
    text-decoration: underline;
    text-decoration-color: var(--metal-dim);
    text-underline-offset: 0.15em;
  }

  .rite-tags {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-1);
  }

  .rite-tag {
    padding: 0 var(--space-1);
    border: var(--border-hair) solid color-mix(in srgb, var(--metal-dim) 60%, transparent);
    border-radius: var(--radius-sm);
    font-size: var(--text-xs);
    color: var(--ink-dim);
  }

  .rite-place {
    flex: none;
    max-width: 30%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: var(--text-xs);
    color: var(--ink-faint);
  }

  .cap {
    flex: none;
    padding: var(--space-0) var(--space-2);
    border: var(--border-hair) solid var(--metal-dim);
    border-radius: var(--radius-sm);
    color: var(--ink-dim);
    font-family: var(--font-figures);
    font-size: var(--text-xs);
  }

  .foot {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2) var(--space-4);
    padding: var(--space-3) var(--space-5) var(--space-4);
    border-top: var(--border-hair) solid color-mix(in srgb, var(--metal-dim) 50%, transparent);
    font-size: var(--text-xs);
    color: var(--ink-faint);
  }

  .keys {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
  }

  .hollow {
    margin: 0;
    padding: var(--space-5) var(--space-4);
    text-align: center;
    color: var(--ink-faint);
    font-style: italic;
  }
</style>
