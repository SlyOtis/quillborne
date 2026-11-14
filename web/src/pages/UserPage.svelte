<script lang="ts">
  import { deleteSession, postFile, putProfileDetails, putProfilePreferences } from '$lib/api'
  import * as api from '$lib/api'
  import { onMount } from 'svelte'
  import { availableThemes, getDefaultTheme, getTheme, setTheme } from '$lib/dialogs/theme'
  import { userDetails, userProfile } from '$lib/stores/auth.store'
  import { INTEGRATIONS, type Integration } from '$lib/integrations'
  import { getAction, putShortcuts, shortcuts } from '$lib/actions'
  import Button from '$components/ui/Button.svelte'
  import Field from '$components/ui/Field.svelte'
  import Glyph from '$components/ui/Glyph.svelte'
  import IconBtn from '$components/ui/IconBtn.svelte'
  import Panel from '$components/ui/Panel.svelte'
  import Portrait from '$components/ui/Portrait.svelte'
  import Shell from '$components/ui/Shell.svelte'
  import Ornament from '$components/ui/Ornament.svelte'
  import ShortcutDialog from '$components/ShortcutDialog.svelte'

  let displayName = $state('')
  let theme = $state('')
  let shortcutOpen = $state(false)
  let keys = $state<Record<string, string>>({})
  let busy = $state(false)
  let error = $state<string | null>(null)
  let saved = $state<string | null>(null)
  let dragging = $state(false)
  let soundOn = $state('on')
  let volume = $state(0.7)
  let animationsOn = $state('on')

  onMount(() => {
    setTheme(getTheme())
    displayName = $userProfile?.display_name ?? ''
    theme = getDefaultTheme()
    soundOn = $userProfile?.preferences?.sound_enabled === false ? 'off' : 'on'
    volume = $userProfile?.preferences?.sound_volume ?? 0.7
    animationsOn = $userProfile?.preferences?.animations_enabled === false ? 'off' : 'on'
    for (const entry of INTEGRATIONS) {
      if (entry.keyField) keys[entry.keyField] = ''
    }
  })

  function keyHeld(field: string): boolean {
    return Boolean(($userDetails as Record<string, boolean> | null)?.[field])
  }

  async function deleteKey(field: string) {
    busy = true
    error = null
    saved = null
    try {
      await putProfileDetails({ [field]: '' })
      userDetails.update((details) => ({ ...(details ?? {}), [field]: false }))
      keys[field] = ''
      saved = 'Key removed.'
    } catch (reason) {
      error = reason instanceof Error ? reason.message : String(reason)
    } finally {
      busy = false
    }
  }

  function statusState(entry: Integration): 'live' | 'planned' | 'blocked' | 'waiting' {
    if (entry.status !== 'live') return entry.status
    if (entry.keyField && !keyHeld(entry.keyField) && !(keys[entry.keyField] ?? '').trim()) return 'waiting'
    return 'live'
  }

  function statusLabel(entry: Integration): string {
    const state = statusState(entry)
    if (state === 'live') return 'Connected'
    if (state === 'waiting') return 'Needs a key'
    if (state === 'planned') return 'Planned'
    return 'Unavailable'
  }

  async function signOut() {
    await deleteSession()
  }

  async function unpin(action: string) {
    error = null
    try {
      await putShortcuts($shortcuts.filter((one) => one.action !== action))
    } catch (reason) {
      error = reason instanceof Error ? reason.message : String(reason)
    }
  }

  async function putProfile() {
    busy = true
    error = null
    saved = null

    const secrets: Record<string, string> = {}
    for (const entry of INTEGRATIONS) {
      if (!entry.keyField || entry.status !== 'live') continue
      const value = (keys[entry.keyField] ?? '').trim()
      if (!value) continue
      if (entry.keyPrefix && !value.startsWith(entry.keyPrefix)) {
        error = `${entry.title} keys start with ${entry.keyPrefix}.`
        busy = false
        return
      }
      secrets[entry.keyField] = value
    }

    try {
      await api.putProfile({ display_name: displayName.trim() })
      await putProfilePreferences({ ...$userProfile?.preferences, theme })
      userProfile.update((profile) => (profile ? { ...profile, preferences: { ...profile.preferences, theme } } : profile))
      setTheme(theme)
      if (Object.keys(secrets).length) {
        await putProfileDetails(secrets)
        userDetails.update((details) => ({ ...(details ?? {}), ...Object.fromEntries(Object.keys(secrets).map((field) => [field, true])) }))
        for (const field of Object.keys(secrets)) keys[field] = ''
      }
      saved = 'Saved.'
    } catch (reason) {
      error = reason instanceof Error ? reason.message : String(reason)
    } finally {
      busy = false
    }
  }

  async function putPreferences() {
    busy = true
    error = null
    saved = null
    try {
      await putProfilePreferences({
        ...$userProfile?.preferences,
        sound_enabled: soundOn === 'on',
        sound_volume: volume,
        animations_enabled: animationsOn === 'on'
      })
      saved = 'Preferences saved.'
    } catch (reason) {
      error = reason instanceof Error ? reason.message : String(reason)
    } finally {
      busy = false
    }
  }

  async function dropAvatar(event: DragEvent) {
    event.preventDefault()
    dragging = false
    const file = event.dataTransfer?.files?.[0]
    if (file) await postAvatar(file)
  }

  async function putAvatar(event: Event) {
    const input = event.currentTarget as HTMLInputElement
    const file = input.files?.[0]
    input.value = ''
    if (file) await postAvatar(file)
  }

  async function postAvatar(file: File) {

    busy = true
    error = null
    try {
      const { url } = await postFile(file, { kind: 'user' })
      await api.putProfile({ photo_url: url })

      saved = 'Picture updated.'
    } catch (reason) {
      error = reason instanceof Error ? reason.message : String(reason)
    } finally {
      busy = false
    }
  }
</script>

<Shell title="Profile" width="narrow">
  <header class="user-crown">
    <Portrait
      src={$userProfile?.photo_url}
      alt={displayName || $userProfile?.email || 'Adventurer'}
      frame="shield"
      size="sm"
    />
    <span class="user-lines">
      <h1 class="dnd-heading user-name">{displayName || 'Adventurer'}</h1>
      <p class="user-mail">{$userProfile?.email ?? ''}</p>
    </span>
    <span class="user-mark">
      <span class="user-plate dnd-shield"></span>
      <Ornament name="rosette" size="sm" tone="metal" />
    </span>
  </header>

  {#if error}
    <p class="user-alarm" role="alert">{error}</p>
  {:else if saved}
    <p class="user-word" role="status">{saved}</p>
  {/if}

  <Panel title="Profile">
    <Field label="Display name" id="user-name">
      <input id="user-name" bind:value={displayName} />
    </Field>

    <Field label="Theme" id="user-theme" help="The realm every sheet opens in until you pick another">
      <select id="user-theme" bind:value={theme} onchange={() => setTheme(theme)}>
        {#each availableThemes as one (one.id)}
          <option value={one.id}>{one.name}</option>
        {/each}
      </select>
    </Field>

    <p class="dnd-label user-label">Picture</p>
    <div
      class="user-drop"
      class:user-drop-live={dragging}
      role="region"
      aria-label="Profile picture drop zone"
      ondragover={(event) => {
        event.preventDefault()
        dragging = true
      }}
      ondragleave={() => (dragging = false)}
      ondrop={dropAvatar}
    >
      {#if $userProfile?.photo_url}
        <Portrait src={$userProfile.photo_url} alt="Your picture" frame="ogee" size="lg" />
      {:else}
        <span class="dnd-empty-mark"><Ornament name="quatrefoil" size="sm" tone="metal" /></span>
      {/if}
      <p class="user-drop-note">Drop a picture, or pick one</p>
      <input
        class="user-drop-input"
        type="file"
        accept="image/*"
        aria-label="Profile picture"
        disabled={busy}
        onchange={putAvatar}
      />
    </div>
  </Panel>

  <Panel title="Preferences">
    <Field label="Sound" id="user-sound" help="Dice, crits, spells and the rest of the table noise">
      <select id="user-sound" bind:value={soundOn}>
        <option value="on">On</option>
        <option value="off">Off</option>
      </select>
    </Field>

    <Field label="Volume {Math.round(volume * 100)}%" id="user-volume">
      <input id="user-volume" type="range" min="0" max="1" step="0.05" bind:value={volume} disabled={soundOn === 'off'} />
    </Field>

    <Field label="Animations" id="user-animations" help="Off keeps the dice from tumbling across the screen">
      <select id="user-animations" bind:value={animationsOn}>
        <option value="on">On</option>
        <option value="off">Off</option>
      </select>
    </Field>

    {#snippet actions()}
      <Button size="sm" onclick={putPreferences} loading={busy}>Save</Button>
    {/snippet}
  </Panel>

  <Panel title="Shortcuts">
    <p class="user-note">The actions pinned to the navigator, and the key that fires each one.</p>

    {#if $shortcuts.length === 0}
      <p class="user-note">Nothing is pinned.</p>
    {:else}
      <ul class="user-list">
        {#each $shortcuts as pin (pin.action)}
          {@const action = getAction(pin.action)}
          {#if action}
            <li class="user-key">
              <span class="user-key-mark"><Glyph name={action.glyph} size="sm" /></span>
              <span class="user-key-name">{action.title}</span>
              <span class="user-key-code">{pin.key || 'No key'}</span>
              <span class="user-key-acts">
                <IconBtn title="Unpin {action.title}" tone="ink" onclick={() => unpin(pin.action)}>
                  <Glyph name="close" size="sm" />
                </IconBtn>
              </span>
            </li>
          {/if}
        {/each}
      </ul>
    {/if}

    {#snippet actions()}
      <Button size="sm" variant="secondary" onclick={() => (shortcutOpen = true)}>Pin an action</Button>
    {/snippet}
  </Panel>

  <Panel title="Integrations">
    <p class="user-note">Every service this app talks to. A key you enter is written to your own private user record, which nobody else can read.</p>

    <ul class="user-list">
      {#each INTEGRATIONS as entry (entry.id)}
        <li class="user-service">
          <div class="user-service-head">
            <h3 class="dnd-heading user-service-name">{entry.title}</h3>
            <span class="user-state user-state-{statusState(entry)}">{statusLabel(entry)}</span>
          </div>

          <p class="user-purpose">{entry.purpose}</p>
          <p class="user-note">{entry.note}</p>

          {#if entry.keyField && entry.status === 'live'}
            <Field label="{entry.title} key" id="key-{entry.id}" help={keyHeld(entry.keyField) ? 'A key is held. Type a new one to replace it.' : entry.keyPrefix ? `Starts with ${entry.keyPrefix}` : undefined}>
              <input id="key-{entry.id}" type="password" autocomplete="off" bind:value={keys[entry.keyField]} />
            </Field>
            {#if keyHeld(entry.keyField)}
              <Button size="sm" variant="ghost" onclick={() => entry.keyField && deleteKey(entry.keyField)} loading={busy}>Remove key</Button>
            {/if}
          {/if}

          <div class="user-links">
            <a href={entry.siteUrl} target="_blank" rel="noopener noreferrer">Open {entry.title}</a>
            {#if entry.keyUrl}
              <a href={entry.keyUrl} target="_blank" rel="noopener noreferrer">Get a key</a>
            {/if}
          </div>
        </li>
      {/each}
    </ul>

    {#snippet actions()}
      <Button size="sm" onclick={putProfile} loading={busy}>Save</Button>
    {/snippet}
  </Panel>
  <div class="user-leave">
    <Button variant="danger" onclick={signOut}>Sign Out</Button>
  </div>

  {#if shortcutOpen}
    <ShortcutDialog bind:isOpen={shortcutOpen} />
  {/if}
</Shell>

<style>
  .user-crown {
    --user-mark-w: calc(var(--space-6) + var(--space-4));
    --user-mark-h: calc(var(--space-7) + var(--space-2));
    display: flex;
    align-items: center;
    gap: var(--space-4);
    padding: var(--space-4) var(--space-5);
    min-width: 0;
    background:
      linear-gradient(180deg, color-mix(in srgb, var(--stone-light) 20%, transparent) 0%, color-mix(in srgb, var(--ground-deep) 45%, transparent) 60%, color-mix(in srgb, var(--ground-deep) 65%, transparent) 100%),
      var(--texture-noise),
      var(--stone);
    border: none;
    border-radius: var(--radius-lg);
    box-shadow: var(--rim), var(--bevel-up), inset 0 0 1rem 0.125rem var(--shade-hard), var(--shadow-md);
  }

  .user-lines {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: var(--space-1);
    min-width: 0;
  }

  .user-name {
    margin: 0;
    font-size: clamp(var(--text-md), 5.5cqi, var(--text-xl));
    color: var(--metal-bright);
    text-shadow: 0 0.0625rem 0 var(--ground-deep), 0 0 0.75rem var(--ember-glow);
    overflow-wrap: break-word;
  }

  .user-mail {
    margin: 0;
    font-family: var(--font-body);
    font-size: var(--text-xs);
    color: var(--ink-dim);
    text-shadow: 0 0.0625rem 0 var(--ground-deep);
    overflow-wrap: anywhere;
  }

  .user-mark {
    position: relative;
    isolation: isolate;
    display: flex;
    flex: none;
    align-items: center;
    justify-content: center;
    width: var(--user-mark-w);
    height: var(--user-mark-h);
  }

  .user-plate {
    position: absolute;
    inset: 0;
    z-index: -1;
    background: var(--texture-noise), linear-gradient(180deg, var(--ground-raised) 0%, var(--ground-deep) 100%);
    box-shadow: var(--rim-thin), inset 0 0 0.75rem 0.125rem var(--shade-hard);
  }

  .user-label {
    margin: 0;
    color: var(--metal);
    text-shadow: 0 0.0625rem 0 var(--ground-deep);
  }

  .user-drop {
    --user-drop-h: calc(var(--space-8) * 2 + var(--space-6));
    --user-drop-sink: inset 0 var(--border-width) var(--space-3) var(--shade-hard);
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--space-2);
    min-height: var(--user-drop-h);
    padding: var(--space-4);
    overflow: hidden;
    border: var(--border-width) dashed var(--metal-dim);
    border-radius: var(--radius-sm);
    background: var(--texture-noise), linear-gradient(180deg, var(--ground-deep) 0%, var(--ground) 100%);
    box-shadow: var(--user-drop-sink);
    text-align: center;
    transition: border-color 0.15s ease, box-shadow 0.15s ease;
  }

  .user-drop-live,
  .user-drop:focus-within {
    border-color: var(--metal);
    box-shadow: var(--user-drop-sink), var(--glow-metal), inset 0 0 2rem -0.5rem var(--ember-glow);
  }

  .user-drop-live .user-drop-note,
  .user-drop:focus-within .user-drop-note {
    color: var(--metal-bright);
    text-shadow: var(--glow-text);
  }

  .user-drop-note {
    margin: 0;
    font-family: var(--font-display);
    font-size: var(--text-sm);
    color: var(--ink-dim);
    letter-spacing: var(--tracking-wide);
    text-shadow: 0 0.0625rem 0 var(--ground-deep);
  }

  .user-drop-input {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    opacity: 0;
    cursor: pointer;
  }

  .user-leave {
    display: flex;
    justify-content: flex-end;
  }

  .user-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .user-key {
    --user-key-row: var(--space-7);
    display: flex;
    align-items: center;
    gap: var(--space-3);
    min-height: var(--user-key-row);
    padding: 0 var(--space-3);
    border: none;
    border-radius: var(--radius-sm);
    background: var(--texture-noise), linear-gradient(180deg, var(--ground-raised) 0%, var(--ground-deep) 100%);
    box-shadow: var(--rim-thin), inset 0 0 0.75rem 0.125rem var(--shade-hard);
    transition: box-shadow 0.18s ease;
  }

  .user-key:hover {
    box-shadow: var(--rim-thin), inset 0 0 0.75rem 0.125rem var(--shade-hard), 0 0 0.75rem var(--ember-glow);
  }

  .user-key-mark {
    display: flex;
    flex: none;
    color: var(--metal);
  }

  .user-key-name {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-family: var(--font-display);
    font-size: var(--text-sm);
    color: var(--ink);
  }

  .user-key-code {
    flex: none;
    padding: 0 var(--space-2);
    border: var(--border-hair) solid var(--metal-dim);
    border-radius: var(--radius-sm);
    background: var(--texture-noise), var(--ground-deep);
    box-shadow: var(--bevel-down);
    font-family: var(--font-body);
    font-size: var(--text-xs);
    color: var(--metal);
  }

  .user-key-acts {
    display: flex;
    flex: none;
    height: var(--space-6);
  }

  .user-service {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    padding: var(--space-4) 0;
    border-top: var(--border-hair) solid color-mix(in srgb, var(--metal-dim) 45%, transparent);
  }

  .user-service:last-child {
    padding-bottom: 0;
  }

  .user-service-head {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    min-width: 0;
  }

  .user-service-name {
    margin: 0;
    font-size: var(--text-md);
    color: var(--metal-bright);
    text-shadow: 0 0.0625rem 0 var(--ground-deep);
    min-width: 0;
    overflow-wrap: anywhere;
  }

  .user-state {
    flex: none;
    padding: var(--space-1) var(--space-3);
    border: var(--border-hair) solid transparent;
    border-radius: var(--radius-sm);
    box-shadow: var(--bevel-down);
    font-family: var(--font-display);
    font-size: var(--text-xs);
    letter-spacing: var(--tracking-caps);
    text-transform: uppercase;
    color: var(--ink);
  }

  .user-state-live {
    border-color: color-mix(in srgb, var(--state-good) 55%, transparent);
    background: color-mix(in srgb, var(--state-good) 22%, transparent);
  }

  .user-state-waiting {
    border-color: color-mix(in srgb, var(--metal) 55%, transparent);
    background: color-mix(in srgb, var(--metal) 20%, transparent);
  }

  .user-state-planned {
    border-color: color-mix(in srgb, var(--state-warn) 55%, transparent);
    background: color-mix(in srgb, var(--state-warn) 22%, transparent);
  }

  .user-state-blocked {
    border-color: color-mix(in srgb, var(--state-bad) 55%, transparent);
    background: color-mix(in srgb, var(--state-bad) 22%, transparent);
  }

  .user-purpose {
    margin: 0;
    font-size: var(--text-sm);
    color: var(--ink);
  }

  .user-note {
    margin: 0;
    font-size: var(--text-xs);
    color: var(--ink-dim);
  }

  .user-links {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-4);
    font-size: var(--text-sm);
  }

  .user-word,
  .user-alarm {
    margin: 0;
    padding: var(--space-3) var(--space-4);
    border: var(--border-hair) solid transparent;
    border-radius: var(--radius-sm);
    box-shadow: var(--bevel-down);
    font-size: var(--text-sm);
    color: var(--ink);
  }

  .user-alarm {
    border-color: color-mix(in srgb, var(--state-bad) 55%, transparent);
    background: color-mix(in srgb, var(--state-bad) 18%, transparent);
  }

  .user-word {
    border-color: color-mix(in srgb, var(--state-good) 55%, transparent);
    background: color-mix(in srgb, var(--state-good) 18%, transparent);
  }
</style>
