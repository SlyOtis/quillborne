<script lang="ts">
  import BaseDialog from '$components/BaseDialog.svelte'
  import Button from '$components/ui/Button.svelte'
  import Glyph from '$components/ui/Glyph.svelte'
  import { ACTIONS, getShortcutKey, putShortcuts, shortcuts } from '$lib/actions'

  let { isOpen = $bindable(false) }: {
    /** Whether the dialog is showing. */
    isOpen: boolean
  } = $props()

  let picked = $state('')
  let key = $state('')
  let listening = $state(false)
  let busy = $state(false)
  let error = $state<string | null>(null)

  const pinned = $derived(new Map($shortcuts.map((one) => [one.action, one.key])))
  const taken = $derived(
    key ? $shortcuts.find((one) => one.key === key && one.action !== picked) : undefined
  )
  const takenBy = $derived(taken ? ACTIONS.find((one) => one.id === taken.action)?.title ?? taken.action : '')
  const pickedTitle = $derived(ACTIONS.find((one) => one.id === picked)?.title ?? '')

  function pick(id: string) {
    picked = id
    key = pinned.get(id) ?? ''
    listening = false
  }

  function listen(event: KeyboardEvent) {
    if (!listening) return
    event.preventDefault()
    event.stopPropagation()

    if (event.key === 'Escape') {
      listening = false
      return
    }

    const pressed = getShortcutKey(event)
    if (!pressed) return
    key = pressed
    listening = false
  }

  async function keep(list: { action: string; key: string }[]) {
    busy = true
    error = null
    try {
      await putShortcuts(list)
      picked = ''
      key = ''
      isOpen = false
    } catch (reason) {
      error = reason instanceof Error ? reason.message : String(reason)
    } finally {
      busy = false
    }
  }

  function pin() {
    if (!picked || taken) return
    void keep([...$shortcuts.filter((one) => one.action !== picked), { action: picked, key }])
  }

  function unpin() {
    if (!picked) return
    void keep($shortcuts.filter((one) => one.action !== picked))
  }
</script>

<svelte:window onkeydowncapture={listen} />

<BaseDialog bind:isOpen title="Pin an action" width="520px" zIndex={9999}>
  <div class="dnd-shortcut">
    <p class="dnd-shortcut-note">
      Pick an action to pin to the navigator, then press the keyboard key that should fire it. The shortcut is saved on your profile and only applies to you.
    </p>

    <div class="dnd-shortcut-roll" role="listbox" aria-label="Actions">
      {#each ACTIONS as action (action.id)}
        <button
          type="button"
          class="dnd-shortcut-row"
          class:dnd-shortcut-row-on={picked === action.id}
          role="option"
          aria-selected={picked === action.id}
          onclick={() => pick(action.id)}
        >
          <span class="dnd-shortcut-keyline" aria-hidden="true"></span>
          <span class="dnd-shortcut-mark"><Glyph name={action.glyph} size="sm" /></span>
          <span class="dnd-shortcut-name">{action.title}</span>
          {#if pinned.has(action.id)}
            <kbd class="dnd-shortcut-key">{pinned.get(action.id) || 'Pinned'}</kbd>
          {/if}
        </button>
      {/each}
    </div>

    <div class="dnd-shortcut-bind">
      <span class="dnd-label dnd-shortcut-label">{pickedTitle ? `Key for ${pickedTitle}` : 'Keyboard key'}</span>
      <button
        type="button"
        class="dnd-shortcut-catch"
        class:dnd-shortcut-catch-live={listening}
        disabled={!picked}
        onclick={() => (listening = !listening)}
      >
        {!picked ? 'Pick an action first' : listening ? 'Press a key' : key || 'No key yet'}
      </button>
      {#if key}
        <Button variant="ghost" size="sm" onclick={() => (key = '')}>Clear</Button>
      {/if}
    </div>

    {#if taken}
      <p class="dnd-shortcut-alarm" role="alert">{key} already fires {takenBy}.</p>
    {:else if error}
      <p class="dnd-shortcut-alarm" role="alert">{error}</p>
    {/if}

    <div class="dnd-shortcut-acts">
      {#if picked && pinned.has(picked)}
        <Button variant="danger" size="sm" disabled={busy} onclick={unpin}>Unpin</Button>
      {/if}
      <Button variant="ghost" size="sm" onclick={() => (isOpen = false)}>Cancel</Button>
      <Button variant="primary" size="sm" loading={busy} disabled={!picked || Boolean(taken)} onclick={pin}>
        {picked && pinned.has(picked) ? 'Save' : 'Pin'}
      </Button>
    </div>
  </div>
</BaseDialog>

<style>
  .dnd-shortcut {
    --shortcut-rows: 8;
    --shortcut-row: var(--space-7);
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    padding: var(--space-5) var(--space-6) var(--space-6);
  }

  .dnd-shortcut-note {
    margin: 0;
    font-size: var(--text-sm);
    line-height: 1.5;
    color: var(--ink-dim);
  }

  .dnd-shortcut-roll {
    display: flex;
    flex-direction: column;
    max-height: calc(var(--shortcut-row) * var(--shortcut-rows));
    overflow-y: auto;
    margin-inline: calc(var(--space-6) * -1);
    border-block: none;
    background:
      var(--texture-noise),
      linear-gradient(180deg, var(--ground-deep) 0%, var(--ground) 100%);
    box-shadow: var(--rim-thin), var(--bevel-down), inset 0 0 16px 2px var(--shade-hard);
  }

  .dnd-shortcut-row {
    position: relative;
    display: grid;
    grid-template-columns: auto auto minmax(0, 1fr) auto;
    align-items: center;
    gap: var(--space-4);
    min-height: var(--shortcut-row);
    padding: var(--space-2) var(--space-6) var(--space-2) var(--space-5);
    border: none;
    border-bottom: var(--border-hair) solid color-mix(in srgb, var(--metal-dim) 45%, transparent);
    background: none;
    color: var(--ink);
    font-family: var(--font-display);
    font-size: var(--text-sm);
    letter-spacing: var(--tracking-wide);
    text-align: start;
    cursor: pointer;
    transition: background 0.15s ease, color 0.15s ease;
  }

  .dnd-shortcut-row:last-child {
    border-bottom: none;
  }

  .dnd-shortcut-row:hover {
    background: radial-gradient(ellipse 60% 140% at 0% 50%, color-mix(in srgb, var(--ember-glow) 40%, transparent) 0%, transparent 70%);
    color: var(--metal-bright);
    text-shadow: var(--glow-text);
  }

  .dnd-shortcut-row-on {
    background:
      radial-gradient(ellipse 60% 140% at 0% 50%, var(--ember-glow) 0%, transparent 70%),
      linear-gradient(180deg, color-mix(in srgb, var(--stone-light) 14%, transparent) 0%, color-mix(in srgb, var(--shadow-ink) 55%, transparent) 60%, color-mix(in srgb, var(--shadow-ink) 70%, transparent) 100%),
      var(--texture-noise),
      var(--stone-dark);
    box-shadow: var(--rim-thin), var(--bevel-up);
    color: var(--metal-bright);
    text-shadow: var(--glow-text);
  }

  .dnd-shortcut-row:focus-visible {
    outline: none;
    box-shadow: var(--focus-ring);
  }

  .dnd-shortcut-keyline {
    width: var(--border-heavy);
    height: var(--space-5);
    border-radius: var(--radius-sm);
    background: var(--metal-dim);
    opacity: 0.5;
    transition: background 0.15s ease, opacity 0.15s ease, box-shadow 0.15s ease;
  }

  .dnd-shortcut-row:hover .dnd-shortcut-keyline {
    background: var(--metal);
    opacity: 0.9;
  }

  .dnd-shortcut-row-on .dnd-shortcut-keyline {
    background: var(--ember);
    opacity: 1;
    box-shadow: var(--glow-ember);
  }

  .dnd-shortcut-mark {
    display: flex;
    align-items: center;
    justify-content: center;
    width: var(--space-6);
    height: var(--space-6);
    border: none;
    border-radius: var(--radius-sm);
    background:
      linear-gradient(180deg, color-mix(in srgb, var(--stone-light) 20%, transparent) 0%, color-mix(in srgb, var(--shadow-ink) 45%, transparent) 60%, color-mix(in srgb, var(--shadow-ink) 65%, transparent) 100%),
      var(--texture-noise),
      var(--stone);
    box-shadow: var(--rim-thin), var(--bevel-up);
    color: var(--metal);
    transition: color 0.15s ease, box-shadow 0.15s ease;
  }

  .dnd-shortcut-row:hover .dnd-shortcut-mark {
    color: var(--metal-bright);
  }

  .dnd-shortcut-row-on .dnd-shortcut-mark {
    color: var(--metal-bright);
    box-shadow: var(--rim-thin), var(--bevel-up), var(--glow-ember);
  }

  .dnd-shortcut-name {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .dnd-shortcut-key {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: var(--space-6);
    padding: 0 var(--space-2);
    line-height: var(--space-5);
    border: var(--border-hair) solid var(--metal-dim);
    border-bottom-color: var(--keyline);
    border-bottom-width: var(--border-heavy);
    border-radius: var(--radius-sm);
    background:
      linear-gradient(180deg, color-mix(in srgb, var(--stone-light) 20%, transparent) 0%, color-mix(in srgb, var(--shadow-ink) 55%, transparent) 100%),
      var(--texture-noise),
      var(--stone-dark);
    box-shadow: var(--bevel-up);
    font-family: var(--font-mono);
    font-size: var(--text-xs);
    letter-spacing: normal;
    color: var(--metal-bright);
  }

  .dnd-shortcut-row-on .dnd-shortcut-key {
    border-color: var(--metal);
    color: var(--metal-bright);
    text-shadow: var(--glow-text);
  }

  .dnd-shortcut-bind {
    display: flex;
    align-items: center;
    gap: var(--space-3);
  }

  .dnd-shortcut-label {
    margin: 0;
    color: var(--metal);
  }

  .dnd-shortcut-catch {
    flex: 1;
    min-width: 0;
    min-height: var(--shortcut-row);
    padding: 0 var(--space-4);
    border: var(--border-hair) solid var(--metal-dim);
    border-radius: var(--radius-sm);
    background: var(--texture-noise), linear-gradient(180deg, var(--ground-deep) 0%, var(--ground) 100%);
    box-shadow: var(--bevel-down);
    font-family: var(--font-display);
    font-size: var(--text-md);
    font-weight: 700;
    letter-spacing: var(--tracking-caps);
    text-transform: uppercase;
    color: var(--metal);
    text-shadow: 0 1px 0 var(--shadow-ink);
    text-align: center;
    cursor: pointer;
    transition: border-color 0.15s ease, box-shadow 0.15s ease, color 0.15s ease, text-shadow 0.15s ease;
  }

  .dnd-shortcut-catch:hover:not(:disabled) {
    border-color: var(--metal);
    color: var(--metal-bright);
    text-shadow: var(--glow-text);
  }

  .dnd-shortcut-catch-live {
    border-color: var(--metal-bright);
    box-shadow: var(--bevel-down), var(--glow-ember);
    color: var(--metal-bright);
    text-shadow: var(--glow-text);
    animation: dnd-shortcut-pulse 1.2s ease-in-out infinite alternate;
  }

  @keyframes dnd-shortcut-pulse {
    from {
      box-shadow: var(--bevel-down), 0 0 8px color-mix(in srgb, var(--ember) 35%, transparent);
    }
    to {
      box-shadow: var(--bevel-down), 0 0 22px color-mix(in srgb, var(--ember) 65%, transparent);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .dnd-shortcut-catch-live {
      animation: none;
    }
  }

  .dnd-shortcut-catch:disabled {
    cursor: not-allowed;
    opacity: 0.5;
  }

  .dnd-shortcut-catch:focus-visible {
    outline: none;
    box-shadow: var(--focus-ring);
  }

  .dnd-shortcut-alarm {
    margin: 0;
    font-size: var(--text-sm);
    color: var(--state-bad);
  }

  .dnd-shortcut-acts {
    display: flex;
    justify-content: flex-end;
    gap: var(--space-3);
  }
</style>
