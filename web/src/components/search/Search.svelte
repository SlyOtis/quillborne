<script lang="ts">
  import { getTags, postSearch, type SearchHit } from '$lib/api'
  import BaseDialog from "../BaseDialog.svelte";
  import Glyph, { type GlyphName } from "$components/ui/Glyph.svelte";
  import { navigate } from "sly-svelte-location-router";
  import { uiStore, isSearchDialogOpen, searchSeed } from "$lib/stores/ui.store";
  import { user } from "$lib/stores/auth.store";
  import { currentCampaignId, userCampaigns } from "$lib/stores/campaign.store";
  import { ACTIONS, actionBlocks, putShortcuts, shortcuts } from "$lib/actions";
  import IconBtn from "$components/ui/IconBtn.svelte";
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
    { caps: ['\u2191', '\u2193'], does: 'navigate' },
    { caps: ['\u21B5'], does: 'select' },
    { caps: ['Tab'], does: 'filter' },
    { caps: ['Esc'], does: 'close' }
  ];

  const SIGILS: Record<string, { type: string; label: string; glyph: GlyphName }> = {
    '@': { type: 'character', label: 'Characters', glyph: 'character' },
    '!': { type: 'campaign', label: 'Campaigns', glyph: 'campaign' },
    '*': { type: 'resource', label: 'Lore and items', glyph: 'scroll' },
    '&': { type: 'vehicle', label: 'Vessels', glyph: 'gear' }
  };

  const SYNTAX = [
    ...Object.entries(SIGILS).map(([cap, one]) => ({ cap, does: one.label.toLowerCase() })),
    { cap: '#', does: 'tag' },
    { cap: '-', does: 'exclude' }
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
  const sigil = $derived(tokens[0] && tokens[0].charAt(0) in SIGILS ? tokens[0].charAt(0) : '');
  const typeScope = $derived(sigil ? SIGILS[sigil].type : '');
  const plain = $derived(sigil ? [tokens[0].slice(1), ...tokens.slice(1)].filter(Boolean) : tokens);
  const tagged = $derived(plain.filter((one) => one.startsWith('#') && one.length > 1).map((one) => one.slice(1)));
  const excluded = $derived(plain.filter((one) => one.startsWith('-') && one.length > 1).map((one) => one.slice(1)));
  const words = $derived(plain.filter((one) => !one.startsWith('#') && !one.startsWith('-')));
  let scoped = $state(true);
  const campaign = $derived($userCampaigns.find((one) => one.id === $currentCampaignId) ?? null);
  const table = $derived(scoped ? campaign : null);

  const browse = $derived<Hit[]>(
    Object.entries(SIGILS).map(([cap, one]) => ({
      id: `scope/${cap}`,
      title: one.label,
      sub: `Search only ${one.label.toLowerCase()}`,
      group: 'Browse',
      place: cap,
      glyph: one.glyph,
      key: '',
      tags: [],
      token: '',
      hay: one.label.toLowerCase(),
      run: () => putChips([], `${cap} `)
    }))
  );
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
      ? [...rites, ...browse]
      : [...(typeScope ? [] : rites), ...pages]
          .filter((hit) => hit.group === 'Actions' ? isTagged(hit) && words.every((word) => hit.hay.includes(word)) : true)
          .filter((hit) => !excluded.some((word) => hit.hay.includes(word)))
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
    if (q.length < SEARCH_MIN && tagIds.length === 0 && !typeScope) return [];
    const hits = await postSearch({
      q: q || undefined,
      object_types: typeScope ? [typeScope] : SEARCH_TYPES,
      tag_ids: tagIds.length ? tagIds : undefined,
      parent_id: table?.id,
      parent_type: table ? 'campaign' : undefined,
      limit: SEARCH_LIMIT
    });
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

    if (event.key === 'Backspace' && scoped && campaign && !searchQuery && event.target === searchInput) {
      event.preventDefault();
      scoped = false;
      return;
    }

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

  function togglePin(event: MouseEvent, hit: Hit) {
    event.stopPropagation();
    const action = hit.id.slice('action/'.length);
    const held = $shortcuts.some((pin) => pin.action === action);
    void putShortcuts(held ? $shortcuts.filter((pin) => pin.action !== action) : [...$shortcuts, { action, key: '' }]);
  }

  function invoke(hit: Hit) {
    if (hit.block) return;
    if (hit.id.startsWith('scope/')) {
      hit.run();
      return;
    }
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
    const key = `${words.join(' ')}|${tagged.join(' ')}|${typeScope}|${table?.id ?? ''}`;
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
    scoped = true;
  });
</script>

<svelte:window onkeydown={handleKeydown} />

<BaseDialog isOpen={isOpen} onClose={uiStore.closeSearchDialog} width="min(40rem, 92vw)" place="top" showCloseButton={false} closeOnEscape={false}>
  <div class="head">
    <span class="head-glyph"><Glyph name="search" size="sm" /></span>
    {#if scoped && campaign}
      <span class="chip" title={campaign.name}>
        <span class="chip-glyph"><Glyph name="campaign" size="sm" /></span>
        <span class="chip-name">{campaign.name}</span>
        <button type="button" class="chip-drop" aria-label="Search every table" onclick={() => (scoped = false)}><Glyph name="close" size="sm" /></button>
      </span>
    {/if}
    {#each chips as chip, at (chip)}
      <span class="chip" title={chip}>
        <span class="chip-glyph"><Glyph name="key" size="sm" /></span>
        <span class="chip-name">{chip.slice(1)}</span>
        <button type="button" class="chip-drop" aria-label="Drop {chip.slice(1)}" onclick={() => deleteChip(at)}><Glyph name="close" size="sm" /></button>
      </span>
    {/each}
    <input
      class="field"
      bind:this={searchInput}
      bind:value={searchQuery}
      type="text"
      autocomplete="off"
      spellcheck="false"
      aria-label="Search"
      placeholder="Where would you like to go?"
    />
    {#if loading && tokens.length > 0}
      <span class="dnd-spinner head-spinner"></span>
    {/if}
    <button type="button" class="cap head-esc" onclick={uiStore.closeSearchDialog}>Esc</button>
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
          {#if hit.group === 'Actions'}
            <span class="rite-pin" class:rite-pin-held={$shortcuts.some((pin) => pin.action === hit.id.slice('action/'.length))}>
              <IconBtn title={$shortcuts.some((pin) => pin.action === hit.id.slice('action/'.length)) ? 'Unpin from the navigator' : 'Pin to the navigator'} onclick={(event) => togglePin(event, hit)}><Glyph name="key" size="sm" /></IconBtn>
            </span>
          {/if}
        </button>
      {/each}
    {/each}

    {#if error}
      <p class="hollow" role="alert">{error}</p>
    {:else if found.length === 0 && !loading}
      <p class="hollow">{tokens.length ? 'No matches' : 'Start typing to search'}</p>
    {/if}
  </div>

  <div class="foot">
    <span class="syntax">
      {#each SYNTAX as one (one.cap)}
        <span class="keys"><kbd class="cap">{one.cap}</kbd> {one.does}</span>
      {/each}
    </span>
    <span class="foot-keys">
      {#each KEYS as key (key.does)}
        <span class="keys">{#each key.caps as cap (cap)}<kbd class="cap">{cap}</kbd>{/each} {key.does}</span>
      {/each}
    </span>
  </div>
</BaseDialog>

<style>
  .head {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-3) var(--space-4);
    border-bottom: var(--border-hair) solid color-mix(in srgb, var(--metal-dim) 50%, transparent);
  }

  .head-glyph {
    display: flex;
    flex: none;
    color: var(--metal);
  }

  .head-spinner {
    flex: none;
  }

  .head-esc {
    cursor: pointer;
    background: var(--ground-deep);
    transition: color 0.15s ease;
  }

  .head-esc:hover {
    color: var(--ink);
  }

  .chip {
    display: inline-flex;
    flex: 0 1 auto;
    align-items: center;
    gap: var(--space-1);
    min-width: 0;
    max-width: 40%;
    padding: var(--space-0) var(--space-0) var(--space-0) var(--space-2);
    border: var(--border-hair) solid color-mix(in srgb, var(--metal) 45%, transparent);
    border-radius: var(--radius-pill);
    background: color-mix(in srgb, var(--metal) 12%, transparent);
    color: var(--ink);
    font-size: var(--text-xs);
    white-space: nowrap;
  }

  .chip-glyph {
    display: flex;
    flex: none;
    color: var(--metal);
  }

  .chip-name {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    font-family: var(--font-display);
    letter-spacing: var(--tracking-wide);
  }

  .chip-drop {
    display: inline-flex;
    flex: none;
    align-items: center;
    justify-content: center;
    inline-size: var(--space-5);
    block-size: var(--space-5);
    padding: 0;
    border: none;
    border-radius: var(--radius-pill);
    background: transparent;
    color: var(--ink-dim);
    cursor: pointer;
  }

  .chip-drop:hover {
    background: color-mix(in srgb, var(--metal) 20%, transparent);
    color: var(--ink);
  }

  .field {
    flex: 1 1 auto;
    min-width: 0;
    padding: var(--space-1) 0;
    border: none;
    border-radius: 0;
    background: transparent;
    box-shadow: none;
    color: var(--ink);
    font-family: var(--font-body);
    font-size: var(--text-md);
  }

  .field:focus {
    outline: none;
    box-shadow: none;
  }

  .field::placeholder {
    color: var(--ink-faint);
  }

  .rites {
    display: flex;
    flex-direction: column;
    max-height: min(32rem, 60vh);
    overflow-y: auto;
    padding: var(--space-1) 0;
  }

  .group {
    margin: 0;
    padding: var(--space-3) var(--space-4) var(--space-1);
    font-family: var(--font-display);
    font-size: var(--text-xs);
    letter-spacing: var(--tracking-caps);
    text-transform: uppercase;
    color: var(--ink-faint);
  }

  .rite {
    position: relative;
    display: flex;
    align-items: flex-start;
    gap: var(--space-3);
    width: 100%;
    padding: var(--space-2) var(--space-4);
    background: transparent;
    border: none;
    border-radius: 0;
    color: var(--ink);
    text-align: left;
    cursor: pointer;
    transition: background 0.15s ease;
  }

  .rite:hover:not(:disabled) {
    background: color-mix(in srgb, var(--metal) 8%, transparent);
  }

  .rite-lit,
  .rite-lit:hover:not(:disabled) {
    background: color-mix(in srgb, var(--metal) 16%, transparent);
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
    margin-block-start: var(--space-0);
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
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    overflow: hidden;
    font-size: var(--text-xs);
    line-height: 1.45;
    color: var(--ink-dim);
  }

  .rite-mark {
    padding: 0 var(--space-0);
    border-radius: var(--radius-sm);
    background: color-mix(in srgb, var(--metal) 24%, transparent);
    color: var(--metal-bright);
    font-weight: 600;
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

  .rite-pin {
    display: flex;
    flex: none;
    align-self: center;
    opacity: 0;
    transition: opacity 0.15s ease;
  }

  .rite-pin-held,
  .rite:hover .rite-pin,
  .rite-lit .rite-pin {
    opacity: 1;
  }

  .rite-pin-held {
    color: var(--metal-bright);
  }

  .rite-place {
    flex: none;
    align-self: center;
    max-width: 30%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: var(--text-xs);
    color: var(--ink-faint);
  }

  .cap {
    display: inline-flex;
    flex: none;
    align-items: center;
    justify-content: center;
    min-inline-size: 2em;
    block-size: 2em;
    padding: 0 var(--space-2);
    border: var(--border-hair) solid var(--metal-dim);
    border-block-end-width: calc(var(--border-hair) * 2);
    border-radius: var(--radius-sm);
    background: color-mix(in srgb, var(--ground-deep) 60%, transparent);
    color: var(--ink-dim);
    font-family: var(--font-figures);
    font-size: var(--text-xs);
  }

  .foot {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2) var(--space-5);
    padding: var(--space-2) var(--space-4);
    border-top: var(--border-hair) solid color-mix(in srgb, var(--metal-dim) 50%, transparent);
    background: color-mix(in srgb, var(--ground-deep) 50%, transparent);
    font-size: var(--text-xs);
    color: var(--ink-faint);
  }

  .syntax,
  .foot-keys {
    display: inline-flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2) var(--space-5);
  }

  .foot-keys {
    margin-inline-start: auto;
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
