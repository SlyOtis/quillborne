<script lang="ts">
  import { navigate } from 'sly-svelte-location-router'
  import { getCatalogFacts, type CatalogEntry, type CatalogKind } from '$lib/catalog'
  import { SOURCE_ACCEPT } from '$lib/sources'
  import StoredImage from '$components/ui/StoredImage.svelte'

  const {
    kind,
    entries,
    selected,
    reading,
    onpick,
    onupload
  }: {
    /** Which catalogue the rows belong to. */
    kind: CatalogKind
    /** The rows to draw, in the order they are shown. */
    entries: CatalogEntry[]
    /** The name of the row drawn as chosen. */
    selected: string
    /** The file being read, shown on the upload row while it works. */
    reading?: string | null
    /** Runs when a row is chosen. */
    onpick: (entry: CatalogEntry) => void
    /** Runs when source material is dropped on the upload row. */
    onupload: (files: File[]) => void
  } = $props()

  const one = $derived(kind === 'classes' ? 'class' : 'race')

  let dragging = $state(false)
  let waiting = $state<File[]>([])

  function drop(event: DragEvent) {
    event.preventDefault()
    dragging = false
    const files = event.dataTransfer?.files
    if (files?.length) waiting = [...waiting, ...Array.from(files)]
  }

  function pick(event: Event) {
    const input = event.currentTarget as HTMLInputElement
    const files = Array.from(input.files ?? [])
    input.value = ''
    if (files.length) waiting = [...waiting, ...files]
  }

  function drops(index: number) {
    waiting = waiting.filter((_, seat) => seat !== index)
  }

  function postImport() {
    const files = waiting
    waiting = []
    onupload(files)
  }

  function open(entry: CatalogEntry, event: MouseEvent) {
    event.preventDefault()
    navigate(`/main/sources/${kind}/${entry.id}`)
  }
</script>

<ul class="dnd-catalog">
  {#each entries as entry (entry.id)}
    <li class="dnd-catalog-seat" class:dnd-catalog-seat-taken={selected === entry.name}>
      <button
        type="button"
        class="dnd-catalog-row"
        aria-pressed={selected === entry.name}
        onclick={() => onpick(entry)}
      >
        <span class="dnd-catalog-face dnd-arch">
          {#if entry.image}
            <StoredImage src={String(entry.image)} alt="" />
          {:else}
            <span class="dnd-catalog-initial">{entry.name.charAt(0).toUpperCase()}</span>
          {/if}
        </span>

        <span class="dnd-catalog-body">
        <span class="dnd-catalog-head">
          <span class="dnd-heading dnd-catalog-name">{entry.name}</span>
          <span class="dnd-catalog-facts">
            {#each getCatalogFacts(kind, entry) as fact (fact.key)}
              <span class="dnd-catalog-fact">
                <span class="dnd-catalog-fact-key">{fact.key}</span>
                <span>{fact.value}</span>
              </span>
            {/each}
          </span>
        </span>

        <span class="dnd-catalog-note">{entry.description}</span>
        </span>
      </button>

      <a class="dnd-catalog-more" href="/main/sources/{kind}/{entry.id}" onclick={(event) => open(entry, event)}>
        Read more
      </a>
    </li>
  {/each}

  <li
    class="dnd-catalog-seat dnd-catalog-own"
    class:dnd-catalog-own-live={dragging}
    role="region"
    aria-label="Define your own {one}"
    ondragover={(event) => {
      event.preventDefault()
      dragging = true
    }}
    ondragleave={() => (dragging = false)}
    ondrop={drop}
  >
    <div class="dnd-catalog-row dnd-catalog-still">
      <span class="dnd-catalog-body">
      <span class="dnd-catalog-head">
        <span class="dnd-heading dnd-catalog-name">Define your own</span>
      </span>

      <span class="dnd-catalog-note">
        Drop a {one} you wrote, a homebrew PDF, or a screenshot of one. It is read once, kept for the whole table,
        and sits in this list like any other.
      </span>

      {#if waiting.length > 0}
        <ul class="dnd-catalog-waiting">
          {#each waiting as file, index (file.name + index)}
            <li class="dnd-catalog-waits">
              <span class="dnd-catalog-waits-name">{file.name}</span>
              <button type="button" class="dnd-catalog-waits-drop" onclick={() => drops(index)}>Remove</button>
            </li>
          {/each}
        </ul>
      {/if}

      {#if reading}
        <span class="dnd-catalog-reading"><span class="dnd-spinner dnd-catalog-mark"></span>{reading}…</span>
      {/if}

      {#if waiting.length > 0}
        <button type="button" class="dnd-catalog-import" disabled={Boolean(reading)} onclick={postImport}>
          Import {waiting.length} file{waiting.length === 1 ? '' : 's'}
        </button>
      {/if}

      </span>

      <input
        class="dnd-catalog-input"
        type="file"
        multiple
        accept={SOURCE_ACCEPT}
        aria-label="{one} source material"
        disabled={Boolean(reading)}
        onchange={pick}
      />
    </div>
  </li>
</ul>

<style>
  .dnd-catalog {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .dnd-catalog-row {
    display: flex;
    flex: 1;
    min-width: 0;
    align-items: center;
    gap: var(--space-4);
    padding: 0;
    border: none;
    background: none;
    cursor: pointer;
    text-align: start;
  }

  .dnd-catalog-row:focus-visible {
    outline: none;
  }

  .dnd-catalog-still {
    cursor: default;
  }

  .dnd-catalog-head {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: var(--space-3) var(--space-5);
    width: 100%;
  }

  .dnd-catalog-name {
    flex: 1;
    min-width: 0;
    font-size: var(--text-lg);
    letter-spacing: var(--tracking-caps);
    text-transform: uppercase;
  }

  .dnd-catalog-facts {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-4);
  }

  .dnd-catalog-fact {
    display: flex;
    gap: var(--space-2);
    font-size: var(--text-xs);
    color: var(--ink);
    font-family: var(--font-figures);
    font-variant-numeric: lining-nums tabular-nums;
  }

  .dnd-catalog-fact-key {
    font-family: var(--font-display);
    letter-spacing: var(--tracking-caps);
    text-transform: uppercase;
    color: var(--metal);
    text-shadow: 0 1px 0 var(--shadow-ink);
  }

  .dnd-catalog-note {
    max-width: 78ch;
    font-size: var(--text-sm);
    color: var(--ink-dim);
  }

  .dnd-catalog-seat {
    position: relative;
    display: flex;
    align-items: center;
    gap: var(--space-4);
    padding: var(--space-4) var(--space-5);
    border: none;
    border-radius: var(--radius-sm);
    background:
      radial-gradient(ellipse 80% 60% at 50% 0%, color-mix(in srgb, var(--metal) 7%, transparent) 0%, transparent 70%),
      var(--texture-noise),
      linear-gradient(180deg, var(--ground-raised) 0%, var(--ground-deep) 100%);
    box-shadow: var(--rim-thin), inset 0 0 18px 2px var(--shade-hard), var(--shadow-sm);
    transition: box-shadow 0.18s ease, filter 0.18s ease;
  }

  .dnd-catalog-seat:hover {
    box-shadow: var(--rim), inset 0 0 18px 2px var(--shade-hard), var(--shadow-md), 0 0 16px color-mix(in srgb, var(--metal) 40%, transparent);
    filter: brightness(1.06);
  }

  .dnd-catalog-seat:hover .dnd-catalog-name {
    color: var(--metal-bright);
    text-shadow: var(--glow-text);
  }

  .dnd-catalog-seat-taken {
    box-shadow: var(--rim), inset 0 0 18px 2px var(--shade-hard), var(--shadow-md), 0 0 16px var(--ember-glow);
  }

  .dnd-catalog-face {
    display: flex;
    flex: none;
    align-items: center;
    justify-content: center;
    width: 4rem;
    height: 5.375rem;
    overflow: hidden;
    border-radius: var(--radius-sm);
    background: radial-gradient(circle at 38% 26%, var(--ground-lift) 0%, var(--ground-deep) 84%);
    box-shadow: var(--rim-thin), inset 0 0 10px var(--shade-hard);
  }

  .dnd-catalog-face :global(img) {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .dnd-catalog-initial {
    font-family: var(--font-display);
    font-size: var(--text-2xl);
    font-weight: 700;
    color: var(--metal);
    text-shadow: 0 1px 0 var(--shadow-ink), 0 0 10px var(--ember-glow);
  }

  .dnd-catalog-body {
    display: flex;
    flex: 1;
    min-width: 0;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--space-3);
  }

  .dnd-catalog-more {
    flex: none;
    display: inline-flex;
    align-items: center;
    padding: var(--space-2) var(--space-4);
    border: none;
    border-radius: var(--radius-sm);
    background:
      linear-gradient(180deg, color-mix(in srgb, var(--stone-light) 12%, transparent) 0%, color-mix(in srgb, var(--shadow-ink) 55%, transparent) 40%, color-mix(in srgb, var(--shadow-ink) 72%, transparent) 100%),
      var(--texture-noise),
      var(--stone);
    box-shadow: var(--rim-thin), var(--bevel-up), var(--shadow-sm);
    text-shadow: 0 1px 0 var(--shadow-ink);
    cursor: pointer;
    font-family: var(--font-display);
    font-size: var(--text-xs);
    letter-spacing: var(--tracking-caps);
    text-transform: uppercase;
    color: var(--metal-bright);
    white-space: nowrap;
  }

  .dnd-catalog-more:hover {
    color: var(--metal-bright);
    text-shadow: var(--glow-text);
    filter: brightness(1.1);
  }

  .dnd-catalog-more:active {
    filter: brightness(0.85);
  }

  .dnd-catalog-more:focus-visible {
    outline: none;
    box-shadow: var(--focus-ring);
  }

  .dnd-catalog-waiting {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    width: 100%;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .dnd-catalog-waits {
    position: relative;
    z-index: 1;
    display: flex;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-2) var(--space-3);
    border: var(--border-hair) solid var(--metal-dim);
    border-radius: var(--radius-sm);
    background: var(--texture-noise), linear-gradient(180deg, var(--ground-deep) 0%, var(--ground) 100%);
    box-shadow: var(--bevel-down);
  }

  .dnd-catalog-waits-name {
    flex: 1;
    min-width: 0;
    font-family: var(--font-body);
    font-size: var(--text-xs);
    color: var(--ink-dim);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .dnd-catalog-waits-drop {
    border: none;
    background: none;
    font-family: var(--font-display);
    font-size: var(--text-xs);
    letter-spacing: var(--tracking-caps);
    text-transform: uppercase;
    color: var(--ink-faint);
    cursor: pointer;
  }

  .dnd-catalog-waits-drop:hover {
    color: var(--state-bad);
    text-shadow: 0 0 8px var(--state-bad), 0 1px 1px var(--shadow-ink);
  }

  .dnd-catalog-import {
    position: relative;
    z-index: 1;
    padding: var(--space-2) var(--space-5);
    border: none;
    border-radius: var(--radius-lg);
    background:
      linear-gradient(color-mix(in srgb, var(--ember) 16%, transparent), color-mix(in srgb, var(--ember) 16%, transparent)),
      linear-gradient(180deg, color-mix(in srgb, var(--stone-light) 20%, transparent) 0%, color-mix(in srgb, var(--shadow-ink) 45%, transparent) 60%, color-mix(in srgb, var(--shadow-ink) 65%, transparent) 100%),
      var(--texture-noise),
      var(--stone);
    box-shadow: var(--rim), var(--bevel-up), var(--shadow-sm);
    font-family: var(--font-display);
    font-size: var(--text-xs);
    font-weight: 700;
    letter-spacing: var(--tracking-caps);
    text-transform: uppercase;
    color: var(--metal-bright);
    text-shadow: 0 1px 0 var(--shadow-ink);
    cursor: pointer;
  }

  .dnd-catalog-import:hover:not(:disabled) {
    filter: brightness(1.1);
    text-shadow: var(--glow-text);
  }

  .dnd-catalog-import:active:not(:disabled) {
    filter: brightness(0.85);
  }

  .dnd-catalog-import:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .dnd-catalog-own {
    outline: var(--border-hair) dashed var(--metal-dim);
    outline-offset: -0.5rem;
  }

  .dnd-catalog-own-live,
  .dnd-catalog-own:focus-within {
    outline-color: var(--metal-bright);
    box-shadow: var(--rim), inset 0 0 18px 2px var(--shade-hard), var(--shadow-md), 0 0 16px var(--ember-glow);
  }

  .dnd-catalog-input {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    opacity: 0;
    cursor: pointer;
  }

  .dnd-catalog-reading {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    font-size: var(--text-xs);
    color: var(--ink-dim);
  }

  .dnd-catalog-mark {
    width: 1rem;
    height: 1rem;
    flex: none;
  }
</style>
